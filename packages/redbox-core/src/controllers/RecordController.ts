// Copyright (c) 2017 Queensland Cyber Infrastructure Foundation (http://www.qcif.edu.au/)
//
// GNU GENERAL PUBLIC LICENSE
//    Version 2, June 1991
//
// This program is free software; you can redistribute it and/or modify
// it under the terms of the GNU General Public License as published by
// the Free Software Foundation; either version 2 of the License, or
// (at your option) any later version.
//
// This program is distributed in the hope that it will be useful,
// but WITHOUT ANY WARRANTY; without even the implied warranty of
// MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
// GNU General Public License for more details.
//
// You should have received a copy of the GNU General Public License along
// with this program; if not, write to the Free Software Foundation, Inc.,
// 51 Franklin Street, Fifth Floor, Boston, MA 02110-1301 USA.

import { Observable, of, from, throwError, firstValueFrom } from 'rxjs';
import { mergeMap as flatMap, map } from 'rxjs/operators';
import {
  RecordTypeResponseModel,
  DashboardTypeResponseModel,
  DashboardViewResponseModel,
  Controllers as controllers,
  DatastreamService,
  RecordsService,
  SearchService,
  BrandingModel,
  RecordTypeModel,
  ErrorResponseItemV2,
  RecordModel,
  UserModel,
  RoleModel,
} from '../index';
import { DateTime } from 'luxon';
import { Server as TusServer, EVENTS } from '@tus/server';
import type { Upload } from '@tus/server';
import { default as checkDiskSpace } from 'check-disk-space';
import { FormAttributes } from '../waterline-models/Form';
import { ContextVariableUtils } from '../utilities/ContextVariableUtils';
import * as FormPayloadPrehydrateServiceModule from '../services/FormPayloadPrehydrateService';
import { normalizeRecordRelations } from '../config/recordtype.config';
import type { DashboardTableConfig } from '../config/workflow.config';
import type { DashboardViewDefinition, DashboardViewStepDefinition } from '../config/dashboardview.config';
import { RecordRelationshipExpandOptions, RecordRelationshipGraph } from '../RecordsService';
import { TusStorageManagerDataStore } from '../storage/TusStorageManagerDataStore';
import { FormConfigFrame, FormModesConfig } from '@researchdatabox/sails-ng-common';
import {
  createRecordSaveContext,
  normalizeRecordValidationRequestFacts,
  parsePublicValidationOperation,
  isRecordConflictStatus,
  readSaveRequestId,
  recordSaveDisplayErrors,
  recordSaveFailureStatus,
  recordSaveProblem,
  RecordSaveResponse,
} from '../RecordSaveResponse';
import type { RecordConcurrencyContext, RecordSaveContext, RecordSaveOperation } from '../RecordSaveResponse';
import {
  parsePublicRecordConcurrencyRequest,
  recordRepresentationConcurrency,
  recordRepresentationRevision,
  recordSaveResultHeaderOption,
  recordSaveResultHeaders,
} from '../RecordHttpConcurrency';

type AnyRecord = Record<string, unknown>;
type ControllerRecord = AnyRecord & {
  metaMetadata?: unknown;
  metadata: AnyRecord;
  redboxOid?: string;
};

interface TusRequestExtension {
  _tusBaseUrl?: string;
  _tusOriginalUrl?: string;
}

type HeaderValue = string | number | ReadonlyArray<string>;

/**
 * Package that contains all Controllers.
 */

export namespace Controllers {
  /**
   * Responsible for all things related to a Record, includings Forms, etc.
   *
   * Author: <a href='https://github.com/shilob' target='_blank'>Shilo Banihit</a>
   *
   * @extensionPoint Register a subclass as `RecordController` through `registerRedboxControllers` to override browser-facing record actions.
   * @remarks Retain inherited exported actions and use the core response helpers when overriding an action.
   * @see https://github.com/redbox-mint/redbox-portal/wiki/Redbox-Loader
   */
  export class Record extends controllers.Core.Controller {
    recordsService!: RecordsService;
    searchService!: SearchService;
    datastreamService!: DatastreamService;

    public init(): void {
      this.recordsService = sails.services.recordsservice as unknown as RecordsService;
      this.datastreamService = sails.services.recordsservice as unknown as DatastreamService;

      const that = this;
      this.registerSailsHook(
        'after',
        ['hook:redbox:storage:ready', 'hook:redbox:datastream:ready', 'ready'],
        function () {
          const datastreamServiceName = sails.config.record.datastreamService;
          sails.log.verbose(`RecordController ready, using datastream service: ${datastreamServiceName}`);
          if (datastreamServiceName != undefined) {
            that.datastreamService = sails.services[datastreamServiceName] as unknown as DatastreamService;
          }
          that.searchService = sails.services[sails.config.search.serviceName] as unknown as SearchService;
        }
      );
    }

    /**
     * Exported methods, accessible from internet.
     */
    protected override _exportedMethods: string[] = [
      'init',
      'view',
      'edit',
      'getForm',
      'create',
      'update',
      'stepTo',
      // 'modifyEditors',
      'search',
      'getType',
      'getWorkflowSteps',
      'getMeta',
      'getMetaDefault',
      'doAttachment',
      'getAttachments',
      'getPermissions',
      'getPermissionsInternal',
      'getDataStream',
      'getAllTypes',
      'delete',
      'getRelatedRecords',
      'render',
      'getRecordList',
      'listWorkspaces',
      'getAllDashboardTypes',
      'getDashboardType',
      'getDashboardView',
      'redirectLegacyConsolidatedDashboard',
      'renderDeletedRecords',
      'getDeletedRecordList',
      'getDeletedRecord',
      'restoreRecord',
      'destroyDeletedRecord',
      'renderDashboardView',
    ];

    /**
     **************************************************************************************************
     **************************************** Add custom methods **************************************
     **************************************************************************************************
     */

    public bootstrap() {
      const attachConfig = sails.config.record.attachments;
      const storeType = attachConfig.store ?? 'file';

      if (storeType === 'file') {
        const targetDir = attachConfig.file?.directory ?? attachConfig.stageDir;
        if (!targetDir) {
          throw new Error('record.attachments.file.directory is required when store is "file"');
        }
        if (attachConfig.stageDir && !attachConfig.file?.directory) {
          sails.log.warn('DEPRECATED: record.attachments.stageDir - use record.attachments.file.directory instead');
        }
      } else if (storeType === 's3') {
        if (!attachConfig.s3?.bucket || !attachConfig.s3?.region) {
          throw new Error('record.attachments.s3.bucket and s3.region are required when store is "s3"');
        }
      }
    }

    private getErrorMessage(error: unknown): string {
      if (error instanceof Error) {
        return error.message;
      }
      return String(error);
    }

    private asError(error: unknown): Error {
      return error instanceof Error ? error : new Error(String(error));
    }

    private saveContext(
      req: Sails.Req,
      operation: RecordSaveOperation,
      validationOperation?: string,
      targetStep?: string,
      concurrency?: RecordConcurrencyContext
    ): RecordSaveContext {
      return createRecordSaveContext({
        requestId: readSaveRequestId(req.headers),
        routeFamily: 'browser',
        operation,
        targetStep: typeof targetStep === 'string' ? targetStep.trim() : undefined,
        validationOperation,
        validationRequestParameters: normalizeRecordValidationRequestFacts(req.params, req.query),
        ...(concurrency ? { concurrency } : {}),
      });
    }

    private mutationSaveContext(
      req: Sails.Req,
      oid: string | undefined,
      operation: RecordSaveOperation,
      validationOperation?: string,
      targetStep?: string,
      formBacked = false
    ) {
      const parsed = parsePublicRecordConcurrencyRequest(req.headers, oid, { formBacked });
      if (!parsed.valid) return parsed;
      return {
        valid: true as const,
        context: this.saveContext(req, operation, validationOperation, targetStep, parsed.context),
      };
    }

    /**
     * Fingerprint the form contract this response delivers, through the same
     * authoritative service routine a save recomputes. A create has no stored
     * record, so its contract is described by the starting workflow step. A
     * target transition is a save intent and does not change the form that
     * was delivered to the browser.
     */
    private async generatedFormFingerprint(
      req: Sails.Req,
      brand: BrandingModel,
      currentRec: RecordModel | null,
      requestedRecordType: string | undefined,
      sourceForm: FormAttributes
    ): Promise<string> {
      const formConfig = sourceForm.configuration;
      if (!formConfig) {
        throw new Error('The current form configuration is unavailable.');
      }
      const recordTypeName = String(
        currentRec?.metaMetadata?.type ?? requestedRecordType ?? formConfig.type ?? ''
      ).trim();
      const recordType = (await firstValueFrom(RecordTypesService.get(brand, recordTypeName))) as unknown as AnyRecord;
      const targetStepName = this.requestString(req.query, 'targetStep');
      const targetStep = targetStepName
        ? ((await firstValueFrom(WorkflowStepsService.get(recordType, targetStepName))) as unknown as AnyRecord | null)
        : null;

      let fingerprintRecord: AnyRecord;
      if (currentRec) {
        fingerprintRecord = currentRec as unknown as AnyRecord;
      } else {
        const effectiveStep = (await firstValueFrom(WorkflowStepsService.getFirst(recordType))) as unknown as AnyRecord;
        fingerprintRecord = {
          metaMetadata: {
            brandId: String(brand?.id ?? ''),
            type: String(recordType?.['name'] ?? recordTypeName),
            form: String(_.get(effectiveStep, 'config.form', '')),
          },
          workflow: { stage: String(_.get(effectiveStep, 'name', '')) },
        };
      }

      const fingerprint = await this.recordsService.getRecordFormFingerprint(
        fingerprintRecord,
        recordType,
        currentRec ? targetStep ?? undefined : undefined,
        sourceForm
      );
      if (!fingerprint) {
        throw new Error('The current form concurrency fingerprint could not be generated.');
      }
      return fingerprint;
    }

    /** Read routing intent only from the explicit server-owned source. */
    private requestString(
      source: Readonly<globalThis.Record<string, unknown>> | undefined,
      name: string
    ): string | undefined {
      const value = source?.[name];
      return typeof value === 'string' ? value.trim() || undefined : undefined;
    }

    private recordBelongsToBrand(record: AnyRecord, brand: BrandingModel): boolean {
      const activeBrandId = String(brand?.id ?? '').trim();
      const recordBrandId = String(_.get(record, 'metaMetadata.brandId', '') ?? '').trim();
      return Boolean(activeBrandId) && recordBrandId === activeBrandId;
    }

    private sendUnexpectedSaveFailure(
      req: Sails.Req,
      res: Sails.Res,
      action: 'update' | 'transition',
      error: unknown,
      meta?: RecordSaveResponse
    ) {
      const rawType = error instanceof Error ? error.name : typeof error;
      const errorType = /^[A-Za-z][A-Za-z0-9_.-]{0,63}$/.test(rawType) ? rawType : 'UnknownError';
      sails.log.error('record_save_request_failed', {
        event: 'record_save_request_failed',
        action,
        error_type: errorType,
      });
      if (this.getApiVersion(req) === '1.0') {
        return this.sendResp(req, res, {
          status: 500,
          v1: { message: TranslationService.t('@record-save-failed') },
        });
      }
      return this.sendResp(req, res, {
        status: 500,
        displayErrors: [{ code: 'record-save-failed', title: '@record-save-failed' }],
        ...(meta ? { meta: { ...meta } } : {}),
      });
    }

    private sendConcurrencyRequestFailure(
      req: Sails.Req,
      res: Sails.Res,
      failure: { readonly code: string; readonly header: string }
    ) {
      if (this.getApiVersion(req) === '1.0') {
        return this.sendResp(req, res, {
          status: 400,
          v1: { message: 'Invalid record concurrency request.' },
        });
      }
      return this.sendResp(req, res, {
        status: 400,
        displayErrors: [{ code: failure.code, source: { header: failure.header } }],
      });
    }

    private legacySaveBody(result: RecordSaveResponse): globalThis.Record<string, unknown> {
      return {
        success: result.success,
        oid: result.oid,
        message: result.message,
        data: result.data,
        metadata: result.metadata,
        details: result.details,
        totalItems: result.totalItems,
        items: result.items,
        ...(result.workspaceOid ? { workspaceOid: result.workspaceOid } : {}),
        ...(result.workspaceData !== undefined ? { workspaceData: result.workspaceData } : {}),
      };
    }

    private sendSaveFailure(req: Sails.Req, res: Sails.Res, result: RecordSaveResponse, detail: string) {
      const status = recordSaveFailureStatus(result);
      const headerOption = recordSaveResultHeaderOption(result);
      if (this.getApiVersion(req) === '1.0') {
        return this.sendResp(req, res, {
          status: isRecordConflictStatus(status) ? status : 500,
          v1: { message: detail },
          ...headerOption,
        });
      }
      return this.sendResp(req, res, {
        status,
        displayErrors: recordSaveDisplayErrors(result, detail),
        meta: { ...result },
        ...headerOption,
      });
    }

    private async sendLifecycleResult(
      req: Sails.Req,
      res: Sails.Res,
      brand: BrandingModel,
      oid: string,
      result: RecordSaveResponse,
      detail: string
    ) {
      if (!result.wasPersisted()) {
        if (!(await this.projectSafeSaveFailure(req, brand, oid, result))) {
          return this.sendPrivateSaveFailure(req, res);
        }
        return this.sendSaveFailure(req, res, result, detail);
      }
      return this.sendResp(req, res, {
        data: result.data ?? result,
        meta: { ...result },
        v1: this.legacySaveBody(result),
        headers: recordSaveResultHeaders(result),
      });
    }

    /**
     * A failed public save may expose the latest projection only while the
     * caller still has view access. The typed service outcome remains the
     * authority for the status; this helper only narrows response data.
     */
    private async projectSafeSaveFailure(
      req: Sails.Req,
      brand: BrandingModel,
      oid: string,
      result: RecordSaveResponse
    ): Promise<boolean> {
      // Only a certified non-write reloads and re-projects current state. An
      // ambiguous outcome must stay a 5xx rather than be narrowed to a 403.
      const certifiedNonWrite =
        result.outcome === 'not-saved' &&
        result.problems.some(problem => problem.kind === 'conflict' || problem.kind === 'authorization');
      if (!certifiedNonWrite) {
        return true;
      }

      result.setProjectedMetadata(null);
      let current: RecordModel | null = null;
      try {
        current = await this.recordsService.getMeta(oid);
      } catch {
        current = null;
      }
      if (!current || _.isEmpty(current)) {
        try {
          current = await this.recordsService.getDeletedRecordMeta(oid, brand);
        } catch {
          return false;
        }
      }
      if (
        !current ||
        _.isEmpty(current) ||
        !this.recordBelongsToBrand(current as AnyRecord, brand) ||
        !(await firstValueFrom(this.hasViewAccess(brand, req.user ?? {}, current)))
      ) {
        result.setConcurrencyMetadata(undefined);
        return false;
      }

      const hasEditAccess = await firstValueFrom(this.hasEditAccess(brand, req.user ?? {}, current));
      if (!hasEditAccess) {
        result.problems = [
          recordSaveProblem(
            'authorization',
            'response',
            '@record-save-record-validation-edit-unauthorized',
            'record-validation-edit-unauthorized'
          ),
        ];
      }
      const representation = recordRepresentationConcurrency(current);
      result.setConcurrencyMetadata({ ...result.concurrency, ...representation.metadata });
      const formName = String(current.metaMetadata?.form ?? '').trim();
      if (!formName) {
        // Without an authoritative form there is no safe field-level
        // projection. Keep the bounded conflict coordinates, but never fall
        // back to the unrestricted stored metadata.
        return true;
      }
      try {
        const formMode: FormModesConfig = hasEditAccess ? 'edit' : 'view';
        const clientFormConfig = await this.getEffectiveClientFormConfig(
          req,
          brand,
          current,
          formName,
          hasEditAccess,
          formMode
        );
        if (!clientFormConfig) return true;
        result.setProjectedMetadata(
          await FormRecordConsistencyService.projectMetadataClientFormConfig(
            current.metadata as AnyRecord,
            clientFormConfig,
            formMode,
            sails.config.reusableFormDefinitions
          )
        );
      } catch {
        // A projection failure must not fall back to unrestricted metadata.
        result.setProjectedMetadata(null);
      }
      return true;
    }

    private sendPrivateSaveFailure(req: Sails.Req, res: Sails.Res) {
      return this.sendResp(req, res, {
        status: 403,
        displayErrors: [{ code: 'not-authorised' }],
        ...(this.getApiVersion(req) === '1.0' ? { v1: { message: TranslationService.t('not-authorised') } } : {}),
      });
    }

    private publicValidationOperation(req: Sails.Req) {
      return parsePublicValidationOperation(req.query?.operation);
    }

    private getReqBrand(req: Sails.Req): BrandingModel {
      return BrandingService.getBrand((req.session.branding as string) ?? '');
    }

    private getSavedRecordPageTitle(record: AnyRecord, locals?: globalThis.Record<string, unknown>): string {
      const savedTitle = String(_.get(record, 'metadata.title', '') ?? '').trim();
      if (savedTitle) {
        return savedTitle;
      }

      const recordType = String(_.get(record, 'metaMetadata.type', '') ?? '').trim();
      const recordTypeTitle = this.getRecordTypePageTitle(recordType, locals);
      if (recordTypeTitle) {
        return recordTypeTitle;
      }

      return String(_.get(record, 'redboxOid', '') ?? '').trim();
    }

    private getRecordTypePageTitle(recordTypeName: string, locals?: globalThis.Record<string, unknown>): string {
      const normalizedRecordTypeName = String(recordTypeName ?? '').trim();
      if (!normalizedRecordTypeName) {
        return '';
      }

      const translatedLabel = this.translate(`${normalizedRecordTypeName}-title-label`, locals);
      if (translatedLabel && translatedLabel !== `${normalizedRecordTypeName}-title-label`) {
        return translatedLabel;
      }

      return normalizedRecordTypeName;
    }

    private shouldIncludeRelationships(req: Sails.Req): boolean {
      const include = String(req.param('include') ?? req.query.include ?? '')
        .trim()
        .toLowerCase();
      const includeRelationships = String(req.param('includeRelationships') ?? req.query.includeRelationships ?? '')
        .trim()
        .toLowerCase();
      return include.split(',').includes('relationships') || includeRelationships === 'true';
    }

    private parseRelationshipExpandOptions(req: Sails.Req, defaultDepth = 1): RecordRelationshipExpandOptions {
      const parseCsv = (value: unknown): string[] | undefined => {
        const normalized = String(value ?? '').trim();
        if (!normalized) {
          return undefined;
        }
        return normalized
          .split(',')
          .map(item => item.trim())
          .filter(Boolean);
      };

      const depthValue = req.param('relationshipDepth') ?? req.query.relationshipDepth;
      const parsedDepth = Number(depthValue);
      const fields = String(req.param('fields') ?? req.query.fields ?? '')
        .trim()
        .toLowerCase();

      return {
        depth: Number.isFinite(parsedDepth) && parsedDepth >= 0 ? parsedDepth : defaultDepth,
        includeRelationIds: parseCsv(req.param('relationshipIds') ?? req.query.relationshipIds),
        includeRecordTypes: parseCsv(req.param('recordTypes') ?? req.query.recordTypes),
        fields: fields === 'summary' ? 'summary' : 'full',
      };
    }

    private async filterRelationshipGraphByAccess(
      brand: BrandingModel,
      user: AnyRecord | undefined,
      graph: RecordRelationshipGraph
    ): Promise<RecordRelationshipGraph> {
      const filteredRelatedObjects: globalThis.Record<string, unknown[]> = {};
      const allowedTargetOids = new Set<string>();
      const omittedByAccess: globalThis.Record<string, number> = {
        ...((graph.omittedByAccess ?? {}) as globalThis.Record<string, number>),
      };

      for (const [recordType, records] of Object.entries(graph.relatedObjects ?? {})) {
        const keptRecords: unknown[] = [];
        for (const recordValue of records ?? []) {
          const record = (recordValue ?? {}) as AnyRecord;
          const recordOid = String(record.redboxOid ?? '').trim();
          if (!recordOid) {
            continue;
          }
          if (recordOid === graph.rootOid) {
            keptRecords.push(record);
            allowedTargetOids.add(recordOid);
            continue;
          }
          const hasAccess = await firstValueFrom(this.hasViewAccess(brand, user, record));
          if (hasAccess) {
            keptRecords.push(record);
            allowedTargetOids.add(recordOid);
          }
        }
        if (keptRecords.length > 0) {
          filteredRelatedObjects[recordType] = keptRecords;
        }
      }

      const filteredEdges = (graph.edges ?? []).filter((edge: RecordRelationshipGraph['edges'][number]) => {
        if (allowedTargetOids.has(edge.targetOid) || edge.targetOid === graph.rootOid) {
          return true;
        }
        omittedByAccess[edge.relationId] = Number(omittedByAccess[edge.relationId] ?? 0) + 1;
        return false;
      });

      return {
        rootOid: graph.rootOid,
        edges: filteredEdges,
        relatedObjects: filteredRelatedObjects,
        omittedByAccess,
      };
    }

    private buildLegacyRelatedRecordsResponse(graph: RecordRelationshipGraph) {
      return {
        ...graph,
        processedRelationships: Object.keys(graph.relatedObjects ?? {}),
      };
    }

    /**
     * Build the client form used by the record metadata read and save-sync paths.
     * The false edit lookup / edit form mode pairing is inherited from getMeta and
     * has not been independently reviewed; keep both values explicit at call sites.
     */
    private async getEffectiveClientFormConfig(
      req: Sails.Req,
      brand: BrandingModel,
      record: ControllerRecord,
      formName: string,
      formLookupEditMode: boolean,
      formMode: FormModesConfig
    ): Promise<FormConfigFrame | undefined> {
      const metaMetadata = record.metaMetadata as AnyRecord | undefined;
      const brandId = String(metaMetadata?.['brandId'] ?? brand.id);
      const formRecord = await firstValueFrom(FormsService.getFormByName(formName, formLookupEditMode, brandId));
      const formConfig = formRecord?.configuration;
      if (!formConfig) {
        return undefined;
      }

      const userRoles = ((req.user?.['roles'] ?? []) as AnyRecord[])
        .map((role: AnyRecord) => String(role['name'] ?? ''))
        .filter((name: string) => !!name);
      const reusableFormDefs = sails.config.reusableFormDefinitions;
      const contextVariablesMap = ContextVariableUtils.evaluateContextVariables(req, record);
      return FormsService.buildClientFormConfig(
        formConfig,
        formMode,
        userRoles,
        record.metadata,
        reusableFormDefs,
        String(brand?.name ?? ''),
        contextVariablesMap,
        { user: req.user as UserModel, brand }
      );
    }

    private async getPostSaveMetadata(
      req: Sails.Req,
      brand: BrandingModel,
      savedRecord: ControllerRecord | null,
      targetStep: unknown
    ): Promise<AnyRecord | null> {
      if (!savedRecord || targetStep || sails.config.record?.form?.returnMetadataOnSave === false) {
        return null;
      }

      try {
        const formName = (savedRecord.metaMetadata as AnyRecord | undefined)?.['form'];
        if (typeof formName !== 'string' || formName.length === 0) {
          return null;
        }
        const clientFormConfig = await this.getEffectiveClientFormConfig(
          req,
          brand,
          savedRecord,
          formName,
          false,
          'edit'
        );
        if (!clientFormConfig) {
          return null;
        }
        return await FormRecordConsistencyService.projectMetadataClientFormConfig(
          savedRecord.metadata,
          clientFormConfig,
          'edit',
          sails.config.reusableFormDefinitions
        );
      } catch (error) {
        sails.log.error(
          `Failed to project post-save metadata for record ${savedRecord?.redboxOid ?? 'unknown'}:`,
          error
        );
        return null;
      }
    }

    public async getMeta(req: Sails.Req, res: Sails.Res) {
      const brand: BrandingModel = this.getReqBrand(req);
      const oid = req.param('oid') ?? '';
      if (oid == '') {
        return this.sendResp(req, res, { status: 400 });
      }

      try {
        const record = await this.recordsService.getMeta(oid);
        if (_.isEmpty(record)) {
          return this.sendResp(req, res, { status: 404 });
        }
        const hasViewAccess = await firstValueFrom(this.hasViewAccess(brand, req.user ?? {}, record));
        if (hasViewAccess) {
          const representation = recordRepresentationConcurrency(record);
          const formName = record.metaMetadata?.['form'] as string | undefined;
          if (formName) {
            try {
              const hasEditAccess = await firstValueFrom(this.hasEditAccess(brand, req.user ?? {}, record));
              const formMode: FormModesConfig = hasEditAccess ? 'edit' : 'view';
              const clientFormConfig = await this.getEffectiveClientFormConfig(
                req,
                brand,
                record,
                formName,
                hasEditAccess,
                formMode
              );
              if (clientFormConfig) {
                const reusableFormDefs = sails.config.reusableFormDefinitions;
                record.metadata = await FormRecordConsistencyService.projectMetadataClientFormConfig(
                  record.metadata as AnyRecord,
                  clientFormConfig,
                  formMode,
                  reusableFormDefs
                );
              }
            } catch (formErr) {
              sails.log.error(`Failed to filter metadata for record ${oid} using form ${formName}:`, formErr);
              return this.sendResp(req, res, {
                status: 500,
                displayErrors: [{ detail: 'Failed to filter metadata for this record.' }],
                meta: { oid },
              });
            }
          }

          if (!this.shouldIncludeRelationships(req)) {
            return this.sendResp(req, res, {
              data: record.metadata,
              meta: { oid: record.redboxOid, ...representation.metadata },
              v1: record.metadata,
              headers: representation.headers,
            });
          }

          const relationshipOptions = this.parseRelationshipExpandOptions(req, 1);
          const relationships = await this.recordsService.getRelatedRecords(
            record.redboxOid,
            brand,
            relationshipOptions
          );
          const filteredRelationships = await this.filterRelationshipGraphByAccess(
            brand,
            req.user ?? {},
            relationships
          );
          return this.sendResp(req, res, {
            data: record.metadata,
            meta: { oid: record.redboxOid, ...representation.metadata, relationships: filteredRelationships },
            v1: { ...record.metadata, relationships: filteredRelationships },
            headers: representation.headers,
          });
        } else {
          return this.sendResp(req, res, {
            status: 403,
            displayErrors: [{ code: 'error-403-heading' }],
            meta: { oid: record.redboxOid },
            v1: { status: 'Access Denied' },
          });
        }
      } catch (err) {
        return this.sendResp(req, res, {
          errors: [this.asError(err)],
          displayErrors: [{ detail: 'Error retrieving metadata' }],
          meta: { oid: oid },
        });
      }
    }

    public async getMetaDefault(req: Sails.Req, res: Sails.Res) {
      const brand: BrandingModel = this.getReqBrand(req);
      const recordType = req.param('name') ?? '';
      const editMode = req.query.edit == 'true';

      // TODO: is there a permission check needed for the default form config values?

      // get the default data model for the form with 'name'
      const form = await firstValueFrom(FormsService.getFormByStartingWorkflowStep(brand, recordType, editMode));
      const formMode = editMode ? 'edit' : 'view';
      const reusableFormDefs = sails.config.reusableFormDefinitions;
      const formConfig = form?.configuration;
      if (!formConfig) {
        return this.sendResp(req, res, {
          status: 500,
          displayErrors: [{ detail: `Form configuration not found for record type: ${recordType}` }],
        });
      }
      const modelDataDefault = await FormRecordConsistencyService.buildDataModelDefaultForFormConfig(
        formConfig,
        formMode,
        reusableFormDefs
      );

      // return the matching format, return the model data as json
      return this.sendResp(req, res, {
        data: modelDataDefault,
        meta: {
          formName: form?.name,
          recordType: recordType,
          editMode: editMode,
        },
        v1: modelDataDefault,
      });
    }

    public async view(req: Sails.Req, res: Sails.Res) {
      const brand: BrandingModel = this.getReqBrand(req);
      const oid = String(req.param('oid') ?? '').trim();
      const locals = req.options?.locals as globalThis.Record<string, unknown> | undefined;

      if (!oid) {
        return res.badRequest();
      }

      try {
        const record = await this.recordsService.getMeta(oid);
        if (_.isEmpty(record)) {
          return res.notFound();
        }

        const hasViewAccess = await firstValueFrom(this.hasViewAccess(brand, req.user, record));
        if (!hasViewAccess) {
          return res.forbidden();
        }

        const pageTitle = this.getSavedRecordPageTitle(record as AnyRecord, locals);
        return this.sendView(req, res, 'record/view', {
          title: this.formatDocumentTitle(pageTitle, locals),
        });
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error ?? '');
        if (errorMessage.toLowerCase().includes('not found')) {
          return res.notFound();
        }
        return res.serverError();
      }
    }

    public edit(req: Sails.Req, res: Sails.Res) {
      const brand: BrandingModel = this.getReqBrand(req);
      const oid = req.param('oid') ? req.param('oid') : '';
      let recordType = req.param('recordType') ? req.param('recordType') : '';
      const rdmp = req.query.rdmp ? req.query.rdmp : '';
      let localFormName;
      const locals = req.options?.['locals'] as AnyRecord | undefined;
      if (!_.isUndefined(locals) && !_.isNull(locals)) {
        localFormName = locals['localFormName'] as string;
      }
      const extFormName = localFormName ? localFormName : '';
      const appSelector = 'dmp-form';
      const appName = 'dmp';
      const hasExistingRecord = String(oid ?? '').trim() !== '';
      const buildEditViewLocals = (pageTitle?: string) => ({
        oid: oid,
        rdmp: rdmp,
        recordType: recordType,
        formName: extFormName,
        appSelector: appSelector,
        appName: appName,
        title: this.formatDocumentTitle(pageTitle, locals),
      });
      sails.log.debug('RECORD::APP: ' + appName);
      sails.log.debug('RECORD::APP formName: ' + extFormName);
      const renderCreateEditView = () =>
        this.sendView(
          req,
          res,
          'record/edit',
          buildEditViewLocals(`Create ${this.getRecordTypePageTitle(recordType, locals)}`)
        );

      const renderExistingEditView = () =>
        this.recordsService.getMeta(oid).then(record => {
          if (!recordType) {
            recordType = String(_.get(record, 'metaMetadata.type', '') ?? '').trim();
          }
          return this.sendView(
            req,
            res,
            'record/edit',
            buildEditViewLocals(this.getSavedRecordPageTitle(record as AnyRecord, locals))
          );
        });

      if (recordType != '' && extFormName == '') {
        FormsService.getFormByStartingWorkflowStep(brand, recordType, true).subscribe(form => {
          if (!form) {
            return this.sendResp(req, res, {
              status: 404,
              displayErrors: [{ detail: 'Form not found' }],
            });
          }
          // Deprecated: customAngularApp has been removed from FormConfigFrame
          return renderCreateEditView();
        });
      } else if (extFormName != '') {
        FormsService.getFormByName(extFormName, true, String(brand.id)).subscribe(
          form => {
            if (!form) {
              return this.sendResp(req, res, {
                status: 404,
                displayErrors: [{ detail: 'Form not found' }],
              });
            }
            // Deprecated: customAngularApp has been removed from FormConfigFrame
            return hasExistingRecord ? renderExistingEditView() : renderCreateEditView();
          },
          error => {
            return this.sendResp(req, res, {
              errors: [this.asError(error)],
              displayErrors: [{ detail: 'Failed to load form' }],
            });
          }
        );
      } else {
        from(this.recordsService.getMeta(oid))
          .pipe(
            flatMap(record => {
              const formName = record.metaMetadata.form;
              return FormsService.getFormByName(formName, true, String(brand.id));
            })
          )
          .subscribe(
            form => {
              if (!form) {
                return this.sendResp(req, res, {
                  status: 404,
                  displayErrors: [{ detail: 'Form not found' }],
                });
              }
              sails.log.debug(form);
              // Deprecated: customAngularApp has been removed from FormConfigFrame
              if (!recordType) {
                recordType = form.configuration?.type ?? '';
              }
              return renderExistingEditView();
            },
            _error => {
              return this.sendView(req, res, 'record/edit', buildEditViewLocals());
            }
          );
      }
    }

    protected hasEditAccess(
      brand: BrandingModel,
      user: AnyRecord | undefined,
      currentRec: AnyRecord
    ): Observable<boolean> {
      sails.log.verbose('Current Record: ');
      sails.log.verbose(currentRec);
      const u = user ?? {};
      return of(this.recordsService.hasEditAccess(brand, u, (u['roles'] ?? []) as AnyRecord[], currentRec));
    }

    protected hasViewAccess(
      brand: BrandingModel,
      user: AnyRecord | undefined,
      currentRec: AnyRecord
    ): Observable<boolean> {
      sails.log.verbose('Current Record: ');
      sails.log.verbose(currentRec);
      const u = user ?? {};
      return of(this.recordsService.hasViewAccess(brand, u, (u['roles'] ?? []) as AnyRecord[], currentRec));
    }

    public async getForm(req: Sails.Req, res: Sails.Res) {
      const brand: BrandingModel = this.getReqBrand(req);
      const recordType = req.param('name');
      const oid = req.param('oid')?.toString()?.trim() || null;
      const editMode = req.query.edit == 'true';
      const formParam = req.param('formName');

      try {
        let form: FormAttributes | null = null;
        let currentRec: RecordModel | null = null;
        if (!oid) {
          //find form to create a record
          form = await firstValueFrom(FormsService.getFormByStartingWorkflowStep(brand, recordType, editMode));
          if (_.isEmpty(form)) {
            const msg = `Error, getting form for record type: ${recordType}`;
            return this.sendResp(req, res, {
              status: 500,
              displayErrors: [{ detail: msg }],
              v1: { message: msg },
            });
          }
        } else {
          // defaults to retrieve the form of the current workflow state...
          currentRec = await this.recordsService.getMeta(oid);
          if (_.isEmpty(currentRec)) {
            const msg = `Error, empty metadata for OID: ${oid}`;
            return this.sendResp(req, res, {
              status: 500,
              displayErrors: [{ detail: msg }],
              v1: { message: msg },
            });
          }

          // Get current user's access to record
          let hasAccess: boolean;
          if (editMode) {
            //find form to edit a record
            hasAccess = await firstValueFrom(this.hasEditAccess(brand, req.user, currentRec));
          } else {
            //find form to view a record
            hasAccess = await firstValueFrom(this.hasViewAccess(brand, req.user, currentRec));
          }

          // Check user's record access
          if (!hasAccess) {
            return this.sendResp(req, res, {
              status: 500,
              displayErrors: [{ code: 'view-error-no-permissions' }],
              v1: { message: TranslationService.t('view-error-no-permissions') },
            });
          }

          const authoritativeFormName = String(currentRec.metaMetadata?.form ?? '').trim();
          const requestedFormName = typeof formParam === 'string' ? formParam.trim() : '';
          if (!authoritativeFormName) {
            return this.sendResp(req, res, {
              status: 500,
              displayErrors: [{ detail: `The authoritative form is unavailable for OID: ${oid}` }],
              v1: { message: `The authoritative form is unavailable for OID: ${oid}` },
            });
          }
          if (requestedFormName && requestedFormName !== authoritativeFormName) {
            return this.sendResp(req, res, {
              status: 409,
              displayErrors: [{ code: 'form-definition-changed' }],
              v1: { message: TranslationService.t('form-definition-changed') },
            });
          }

          // The stored workflow/form reference owns the delivered contract.
          // A route parameter may confirm that identity but cannot select a
          // different form for an existing record.
          form = (await FormsService.getForm(
            brand,
            authoritativeFormName,
            editMode,
            '',
            currentRec as RecordModel
          )) as FormAttributes | null;
          if (_.isEmpty(form)) {
            const msg = `Error, getting form ${formParam} for OID: ${oid}`;
            return this.sendResp(req, res, {
              status: 500,
              displayErrors: [{ detail: msg }],
              v1: { message: msg },
            });
          }
          // let hasEditAccess = await firstValueFrom(this.hasEditAccess(brand, req.user, currentRec));
          // FormsService.filterFieldsHasEditAccess(form.fields, hasEditAccess);
        }

        // process the form config to provide only the fields accessible by the current user
        const formMode = editMode ? 'edit' : 'view';
        const userRoles = ((req.user?.['roles'] ?? []) as AnyRecord[])
          .map((role: AnyRecord) => String(role['name'] ?? ''))
          .filter((name: string) => !!name);
        const recordData = currentRec;
        const reusableFormDefs = sails.config.reusableFormDefinitions;
        const contextVariablesMap = ContextVariableUtils.evaluateContextVariables(req, currentRec);
        const formConfig = form?.configuration;
        if (!form || !formConfig) {
          const msg = `Form configuration not found for form ${formParam}, record type ${recordType}, oid ${oid}`;
          return this.sendResp(req, res, {
            status: 500,
            displayErrors: [{ detail: msg }],
            v1: { message: msg },
          });
        }
        const mergedForm = await FormsService.buildClientFormConfig(
          formConfig,
          formMode,
          userRoles,
          recordData?.metadata ?? null,
          reusableFormDefs,
          String(brand?.name ?? ''),
          contextVariablesMap,
          { user: req.user as UserModel, brand }
        );
        const validationOperations = await FormsService.discoverValidationOperations({
          brand,
          form,
          recordType: String(currentRec?.metaMetadata?.type ?? recordType ?? formConfig.type ?? ''),
          record: currentRec,
          user: req.user,
          editable: editMode,
          targetStep: typeof req.query?.targetStep === 'string' ? req.query.targetStep : undefined,
        });
        const prehydrateService = sails.services
          .formpayloadprehydrateservice as unknown as FormPayloadPrehydrateServiceModule.Services.FormPayloadPrehydrateService;
        const prehydrate = await prehydrateService.build({
          branding: brand,
          formConfig: mergedForm,
        });

        const formFingerprint = await this.generatedFormFingerprint(req, brand, currentRec, recordType, form);
        const representation = currentRec ? recordRepresentationConcurrency(currentRec) : undefined;

        // return the form config
        if (!_.isEmpty(mergedForm)) {
          return this.sendResp(req, res, {
            data: mergedForm,
            meta: {
              formName: String(form.name ?? currentRec?.metaMetadata?.form ?? formParam ?? ''),
              recordType: recordType,
              oid: oid,
              workflow: recordData?.workflow,
              contextVariables: contextVariablesMap,
              validationOperations,
              formFingerprint,
              ...(representation?.metadata ?? {}),
            },
            prehydrate,
            headers: representation?.headers,
          });
        } else {
          const msg = `Failed to get form with name ${formParam} and record type ${recordType} and oid ${oid}`;
          return this.sendResp(req, res, {
            status: 500,
            displayErrors: [{ detail: msg }],
            v1: { message: msg },
          });
        }
      } catch (error) {
        const displayError: ErrorResponseItemV2 = { title: 'Error getting form definition' };
        let msg;
        const typedError = error as { error?: { code?: number }; message?: string };
        if (typedError.error && typedError.error.code == 500) {
          displayError.code = 'missing-record';
          msg = TranslationService.t('missing-record');
        } else {
          displayError.detail = typedError.message;
          msg = typedError.message;
        }
        return this.sendResp(req, res, {
          errors: [this.asError(error)],
          displayErrors: [displayError],
          v1: msg,
        });
      }
    }

    public create(req: Sails.Req, res: Sails.Res) {
      this.createInternal(req, res).then(() => {});
    }

    private async createInternal(req: Sails.Req, res: Sails.Res) {
      try {
        const parsedOperation = this.publicValidationOperation(req);
        if (!parsedOperation.valid) {
          return this.sendResp(req, res, {
            status: 400,
            displayErrors: [{ code: 'record-validation-operation-invalid' }],
          });
        }
        const brand: BrandingModel = this.getReqBrand(req);
        const metadata = req.body;
        const record: AnyRecord = {
          metaMetadata: {},
        };
        const recType = this.requestString(req.params, 'recordType');
        const targetStep = this.requestString(req.query, 'targetStep');
        const saveRequest = this.mutationSaveContext(
          req,
          undefined,
          targetStep ? 'transition' : 'create',
          parsedOperation.value,
          targetStep,
          true
        );
        if (!saveRequest.valid) {
          return this.sendConcurrencyRequestFailure(req, res, saveRequest);
        }
        record.authorization = {
          view: [req.user!['username']],
          edit: [req.user!['username']],
        };
        record.metadata = metadata;

        const recordType = await firstValueFrom(RecordTypesService.get(brand, recType ?? ''));
        const user = req.user;

        sails.log.verbose(`RecordController - createRecord - enter`);
        const createResponse = await this.recordsService.create(
          brand,
          record,
          recordType,
          user,
          true,
          true,
          targetStep,
          saveRequest.context
        );

        if (createResponse.wasPersisted()) {
          let savedRecord: RecordModel | null = null;
          try {
            savedRecord = await this.recordsService.getMeta(createResponse.oid);
            const postSaveMetadata = await this.getPostSaveMetadata(req, brand, savedRecord, targetStep);
            if (postSaveMetadata !== null) {
              createResponse.metadata = postSaveMetadata;
            }
          } catch (error) {
            sails.log.error(
              `RecordController - response projection failed for oid ${createResponse.oid} (requestId ${createResponse.requestId})`,
              error
            );
            createResponse.setProjectedMetadata(null);
            createResponse.addProblem(
              recordSaveProblem(
                'system',
                'response',
                '@record-save-response-projection-failed',
                'response-projection-failed'
              )
            );
          }
          return this.sendResp(req, res, {
            data: savedRecord,
            meta: { ...createResponse },
            ...(this.getApiVersion(req) === '1.0' ? { v1: this.legacySaveBody(createResponse) } : {}),
            headers: recordSaveResultHeaders(createResponse),
          });
        } else {
          return this.sendSaveFailure(req, res, createResponse, createResponse.message);
        }
      } catch (error) {
        return this.sendResp(req, res, {
          errors: [this.asError(error)],
          displayErrors: [{ detail: 'Failed to save record' }],
        });
      }
    }

    public async delete(req: Sails.Req, res: Sails.Res) {
      const brand: BrandingModel = this.getReqBrand(req);
      const oid = req.param('oid');
      const user = req.user;
      if (!oid || _.isEmpty(brand)) {
        return this.sendResp(req, res, { status: 404, displayErrors: [{ code: 'missing-record' }] });
      }

      let currentRec: RecordModel;
      try {
        currentRec = await firstValueFrom(this.getRecord(oid));
      } catch {
        return this.sendResp(req, res, { status: 404, displayErrors: [{ code: 'missing-record' }] });
      }
      if (!this.recordBelongsToBrand(currentRec as AnyRecord, brand)) {
        return this.sendResp(req, res, { status: 404, displayErrors: [{ code: 'missing-record' }] });
      }

      try {
        const hasEditAccess = await firstValueFrom(this.hasEditAccess(brand, user, currentRec));
        if (!hasEditAccess) {
          return this.sendResp(req, res, {
            status: 403,
            displayErrors: [{ code: 'edit-error-no-permissions' }],
          });
        }
        const recordType = await firstValueFrom(RecordTypesService.get(brand, currentRec.metaMetadata.type));
        const saveRequest = this.mutationSaveContext(req, oid, 'delete');
        if (!saveRequest.valid) return this.sendConcurrencyRequestFailure(req, res, saveRequest);
        const response = await this.recordsService.delete(
          oid,
          false,
          currentRec,
          recordType,
          user ?? {},
          saveRequest.context
        );
        return this.sendLifecycleResult(req, res, brand, oid, response, TranslationService.t('failed-delete'));
      } catch {
        return this.sendResp(req, res, {
          status: 500,
          displayErrors: [{ code: 'failed-delete' }],
        });
      }
    }

    public async getDeletedRecord(req: Sails.Req, res: Sails.Res) {
      const oid = req.param('oid');
      const brand: BrandingModel = this.getReqBrand(req);
      if (!oid || !brand?.id) return this.sendResp(req, res, { status: 404 });
      const record = await this.recordsService.getDeletedRecordMeta(oid, brand);
      if (!record) return this.sendResp(req, res, { status: 404 });
      if (!(await firstValueFrom(this.hasViewAccess(brand, req.user, record)))) {
        return this.sendResp(req, res, { status: 403 });
      }
      const representation = recordRepresentationConcurrency(record);
      const formName = String(record.metaMetadata?.['form'] ?? '').trim();
      if (formName) {
        try {
          const hasEditAccess = await firstValueFrom(this.hasEditAccess(brand, req.user ?? {}, record));
          const formMode: FormModesConfig = hasEditAccess ? 'edit' : 'view';
          const clientFormConfig = await this.getEffectiveClientFormConfig(
            req,
            brand,
            record,
            formName,
            hasEditAccess,
            formMode
          );
          if (clientFormConfig) {
            record.metadata = await FormRecordConsistencyService.projectMetadataClientFormConfig(
              record.metadata as AnyRecord,
              clientFormConfig,
              formMode,
              sails.config.reusableFormDefinitions
            );
          }
        } catch (error) {
          sails.log.error(`Failed to filter deleted metadata for record ${oid} using form ${formName}:`, error);
          return this.sendResp(req, res, {
            status: 500,
            displayErrors: [{ detail: 'Failed to filter metadata for this record.' }],
            meta: { oid },
          });
        }
      }
      return this.sendResp(req, res, {
        data: record.metadata,
        meta: {
          oid,
          lifecycleState: record.lifecycleState,
          lifecycle: record.lifecycle,
          ...representation.metadata,
        },
        v1: record.metadata,
        headers: representation.headers,
      });
    }

    public async restoreRecord(req: Sails.Req, res: Sails.Res) {
      const oid = req.param('oid');
      const msgFailed = TranslationService.t('failed-restore');
      if (_.isEmpty(oid)) {
        return this.sendResp(req, res, {
          status: 400,
          displayErrors: [{ code: 'failed-restore' }],
          meta: { oid: oid },
          v1: {
            success: false,
            oid: oid,
            message: msgFailed,
          },
        });
      }
      const user = req.user;
      const brand: BrandingModel = this.getReqBrand(req);
      const deleted = await this.recordsService.getDeletedRecordMeta(oid, brand);
      if (!deleted || !(await firstValueFrom(this.hasEditAccess(brand, user, deleted)))) {
        return this.sendResp(req, res, { status: 404 });
      }
      const saveRequest = this.mutationSaveContext(req, oid, 'restore');
      if (!saveRequest.valid) return this.sendConcurrencyRequestFailure(req, res, saveRequest);
      const response = await this.recordsService.restoreRecord(oid, user ?? {}, brand, saveRequest.context);
      return this.sendLifecycleResult(req, res, brand, oid, response, msgFailed);
    }

    public async destroyDeletedRecord(req: Sails.Req, res: Sails.Res) {
      const oid = req.param('oid');
      if (_.isEmpty(oid)) {
        return this.sendResp(req, res, {
          status: 400,
          displayErrors: [{ code: 'failed-destroy' }],
          meta: { oid: oid },
          v1: {
            success: false,
            oid: oid,
            message: TranslationService.t('failed-destroy'),
          },
        });
      }
      const user = req.user;
      const brand: BrandingModel = this.getReqBrand(req);
      const deleted = await this.recordsService.getDeletedRecordMeta(oid, brand);
      if (!deleted || !(await firstValueFrom(this.hasEditAccess(brand, user, deleted)))) {
        return this.sendResp(req, res, { status: 404 });
      }
      const saveRequest = this.mutationSaveContext(req, oid, 'purge');
      if (!saveRequest.valid) return this.sendConcurrencyRequestFailure(req, res, saveRequest);
      const response = await this.recordsService.destroyDeletedRecord(oid, user ?? {}, brand, saveRequest.context);
      return this.sendLifecycleResult(req, res, brand, oid, response, TranslationService.t('failed-destroy'));
    }

    public update(req: Sails.Req, res: Sails.Res) {
      void this.updateInternal(req, res).catch(error => {
        this.sendUnexpectedSaveFailure(req, res, 'update', error);
      });
    }

    private async updateInternal(req: Sails.Req, res: Sails.Res) {
      const parsedOperation = this.publicValidationOperation(req);
      if (!parsedOperation.valid) {
        return this.sendResp(req, res, {
          status: 400,
          displayErrors: [{ code: 'record-validation-operation-invalid' }],
        });
      }
      const brand: BrandingModel = this.getReqBrand(req);
      const oid = this.requestString(req.params, 'oid') ?? '';
      const targetStep = this.requestString(req.query, 'targetStep');
      const shouldMerge = this.requestString(req.query, 'merge') === 'true';
      const saveRequest = this.mutationSaveContext(
        req,
        oid,
        targetStep ? 'transition' : 'update',
        parsedOperation.value,
        targetStep,
        true
      );
      if (!saveRequest.valid) {
        return this.sendConcurrencyRequestFailure(req, res, saveRequest);
      }
      // If the sync completed before the async is done, maybe the user is cleared?
      // So clone the user for the async triggers.
      const user = _.cloneDeep(req.user);
      let metadata = req.body;
      sails.log.verbose(`RecordController - updateInternal - enter`);

      let currentRec: RecordModel;
      try {
        currentRec = await firstValueFrom(this.getRecord(oid));
      } catch {
        return this.sendResp(req, res, { status: 404, displayErrors: [{ code: 'missing-record' }] });
      }
      if (!this.recordBelongsToBrand(currentRec as AnyRecord, brand)) {
        return this.sendResp(req, res, { status: 404, displayErrors: [{ code: 'missing-record' }] });
      }
      const hasEditAccess = await firstValueFrom(this.hasEditAccess(brand, user, currentRec));
      if (!hasEditAccess) {
        return this.sendResp(req, res, { status: 403, displayErrors: [{ code: 'not-authorised' }] });
      }
      const recordType = await firstValueFrom(RecordTypesService.get(brand, currentRec.metaMetadata.type));
      let nextStepResp = null;
      if (targetStep) {
        nextStepResp = await firstValueFrom(WorkflowStepsService.get(recordType, targetStep));
      }

      let response;
      try {
        sails.log.verbose(`RecordController - updateInternal - before updateMeta`);
        if (shouldMerge) {
          metadata = this.mergeRecordMetadata(currentRec.metadata, metadata);
        }
        response = await this.recordsService.updateMeta(
          brand,
          oid,
          currentRec,
          user,
          true,
          true,
          nextStepResp,
          { metadata, mode: 'replace' },
          saveRequest.context
        );
        sails.log.verbose(JSON.stringify(response));
        // Both persisted outcomes are HTTP 200; warnings stay inside the
        // typed `meta` result rather than becoming an error response.
        if (response.wasPersisted()) {
          sails.log.verbose(`RecordController - updateInternal - before ajaxOk`);
          let savedRecord: RecordModel | null = null;
          try {
            savedRecord = await this.recordsService.getMeta(oid);
            const postSaveMetadata = await this.getPostSaveMetadata(req, brand, savedRecord, nextStepResp);
            if (postSaveMetadata !== null) {
              response.metadata = postSaveMetadata;
            }
          } catch (error) {
            sails.log.error(
              `RecordController - response projection failed for oid ${oid} (requestId ${response.requestId})`,
              error
            );
            response.setProjectedMetadata(null);
            response.addProblem(
              recordSaveProblem(
                'system',
                'response',
                '@record-save-response-projection-failed',
                'response-projection-failed'
              )
            );
          }
          return this.sendResp(req, res, {
            data: savedRecord,
            meta: { ...response },
            ...(this.getApiVersion(req) === '1.0' ? { v1: this.legacySaveBody(response) } : {}),
            headers: recordSaveResultHeaders(response),
          });
        } else {
          if (!(await this.projectSafeSaveFailure(req, brand, oid, response))) {
            return this.sendPrivateSaveFailure(req, res);
          }
          return this.sendSaveFailure(req, res, response, 'Failed to get record data');
        }
      } catch (error) {
        return this.sendUnexpectedSaveFailure(req, res, 'update', error, response);
      }
    }

    //TODO: check if this deprecated?
    protected saveMetadata(
      brand: BrandingModel,
      oid: string,
      currentRec: AnyRecord,
      metadata: AnyRecord,
      user: AnyRecord
    ): Observable<unknown> {
      currentRec.metadata = metadata;
      return this.updateMetadata(brand, oid, currentRec, user);
    }

    protected saveAuthorization(
      brand: BrandingModel,
      oid: string,
      currentRec: AnyRecord,
      authorization: unknown,
      user: AnyRecord
    ): Observable<unknown> {
      const editAccessResp: Observable<boolean> = this.hasEditAccess(brand, user, currentRec);
      return editAccessResp.pipe(
        map(hasEditAccess => {
          if (hasEditAccess) {
            currentRec.authorization = authorization;
            return this.updateAuthorization(brand, oid, currentRec, user);
          } else {
            return {
              code: 403,
              message: 'Not authorized to edit',
            };
          }
        })
      );
    }

    protected getRecord(oid: string): Observable<RecordModel> {
      return from(this.recordsService.getMeta(oid)).pipe(
        flatMap(currentRec => {
          if (_.isEmpty(currentRec)) {
            return throwError(new Error(`Failed to update meta, cannot find existing record with oid: ${oid}`));
          }
          return of(currentRec);
        })
      );
    }

    //TODO: check if this is deprecated?
    protected updateMetadata(
      brand: BrandingModel,
      oid: string,
      currentRec: AnyRecord,
      user: AnyRecord | undefined
    ): Observable<unknown> {
      const metaMetadata = currentRec['metaMetadata'] as AnyRecord;
      if (metaMetadata['brandId'] != brand.id) {
        return throwError(
          new Error(
            `Failed to update meta, brand's don't match: ${metaMetadata['brandId']} != ${brand.id}, with oid: ${oid}`
          )
        );
      }
      metaMetadata['lastSavedBy'] = user?.['username'];
      metaMetadata['lastSaveDate'] = DateTime.local().toISO();
      sails.log.verbose(`Calling record service...`);
      sails.log.verbose(currentRec);
      return from(this.recordsService.updateMeta(brand, oid, currentRec, user ?? {}));
    }

    protected updateAuthorization(
      brand: BrandingModel,
      oid: string,
      currentRec: AnyRecord,
      user: AnyRecord | undefined
    ): Observable<unknown> {
      const metaMetadata = currentRec['metaMetadata'] as AnyRecord;
      if (metaMetadata['brandId'] != brand.id) {
        return throwError(
          new Error(
            `Failed to update meta, brand's don't match: ${metaMetadata['brandId']} != ${brand.id}, with oid: ${oid}`
          )
        );
      }
      return from(this.recordsService.updateMeta(brand, oid, currentRec, user ?? {}));
    }

    public async stepTo(req: Sails.Req, res: Sails.Res) {
      const brand: BrandingModel = this.getReqBrand(req);
      const metadata = req.body;
      const oid = this.requestString(req.params, 'oid') ?? '';
      const targetStep = this.requestString(req.params, 'targetStep');
      const parsedOperation = parsePublicValidationOperation(req.query?.operation);
      if (!parsedOperation.valid) {
        return this.sendResp(req, res, {
          status: 400,
          displayErrors: [{ code: 'record-validation-operation-invalid' }],
        });
      }
      const saveRequest = this.mutationSaveContext(req, oid, 'transition', parsedOperation.value, targetStep, true);
      if (!saveRequest.valid) {
        return this.sendConcurrencyRequestFailure(req, res, saveRequest);
      }
      try {
        const currentRec = await firstValueFrom(this.getRecord(oid));
        if (!this.recordBelongsToBrand(currentRec as AnyRecord, brand)) {
          return this.sendResp(req, res, { status: 404, displayErrors: [{ code: 'missing-record' }] });
        }
        const hasEditAccess = await firstValueFrom(this.hasEditAccess(brand, req.user, currentRec as AnyRecord));
        if (!hasEditAccess) {
          return this.sendResp(req, res, {
            status: 403,
            displayErrors: [{ code: 'not-authorised', detail: TranslationService.t('edit-error-no-permissions') }],
          });
        }
        const recordType = await firstValueFrom(RecordTypesService.get(brand, currentRec.metaMetadata.type));
        const nextStep = await firstValueFrom(WorkflowStepsService.get(recordType, targetStep ?? ''));
        const response = await this.recordsService.updateMeta(
          brand,
          oid,
          currentRec as AnyRecord,
          req.user ?? {},
          true,
          true,
          nextStep,
          { metadata, mode: 'replace' },
          saveRequest.context
        );
        if (response.wasPersisted()) {
          return this.sendResp(req, res, {
            data: response,
            meta: { ...response },
            ...(this.getApiVersion(req) === '1.0' ? { v1: this.legacySaveBody(response) } : {}),
            headers: recordSaveResultHeaders(response),
          });
        }
        if (!(await this.projectSafeSaveFailure(req, brand, oid, response))) {
          return this.sendPrivateSaveFailure(req, res);
        }
        return this.sendSaveFailure(req, res, response, 'Error updating meta');
      } catch (error) {
        return this.sendUnexpectedSaveFailure(req, res, 'transition', error);
      }
    }

    public async search(req: Sails.Req, res: Sails.Res) {
      const brand: BrandingModel = this.getReqBrand(req);
      const type = req.param('type');
      let rows: string | number = req.param('rows');
      let page: string | number = req.param('page');
      let core = req.param('core');

      // If a record type is set, fetch from the configuration what core it's being sent from
      if (type != null) {
        const recordType: RecordTypeModel = await firstValueFrom(RecordTypesService.get(brand, type));
        core = recordType.searchCore ?? '';
      }
      if (_.isEmpty(rows)) {
        rows = 10;
      }
      if (_.isEmpty(page)) {
        page = 1;
      }
      let start = 0;
      if (typeof page === 'string' && /^\d+$/.test(page)) {
        page = parseInt(page);
      }
      if (typeof rows === 'string' && /^\d+$/.test(rows)) {
        rows = parseInt(rows);
      }

      start = ((page as number) - 1) * (rows as number);

      const workflow = req.query.workflow;
      const searchString = req.query.searchStr;

      const exactNamesParam = req.query.exactNames;
      const exactSearchNames = _.isEmpty(exactNamesParam) ? [] : String(exactNamesParam).split(',');
      const exactSearches: Array<{ name: string; value: unknown }> = [];
      const facetNamesParam = req.query.facetNames;
      const facetSearchNames = _.isEmpty(facetNamesParam) ? [] : String(facetNamesParam).split(',');
      const facetSearches: Array<{ name: string; value: unknown }> = [];

      _.forEach(exactSearchNames, (exactSearch: string) => {
        exactSearches.push({
          name: exactSearch,
          value: req.query[`exact_${exactSearch}`],
        });
      });
      _.forEach(facetSearchNames, (facetSearch: string) => {
        facetSearches.push({
          name: facetSearch,
          value: req.query[`facet_${facetSearch}`],
        });
      });

      try {
        const user = req.user as UserModel;
        const searchRes = await this.searchService.searchFuzzy(
          core,
          type,
          workflow ?? '',
          searchString ?? '',
          exactSearches,
          facetSearches,
          brand,
          user,
          (user?.roles ?? []) as RoleModel[],
          sails.config.record.search.returnFields,
          start,
          rows as number
        );
        searchRes['page'] = page;
        this.sendResp(req, res, { data: searchRes });
      } catch (error) {
        const errorMessage = this.getErrorMessage(error);
        this.sendResp(req, res, {
          errors: [this.asError(error)],
          v1: errorMessage,
        });
      }
    }
    /**
     * Returns the RecordType configuration based of the response model that is intentionally restricting
     * the object schema and information that is allowed to be sent back in this endpoint
     */
    public getType(req: Sails.Req, res: Sails.Res) {
      const recordType = req.param('recordType');
      const brand: BrandingModel = this.getReqBrand(req);
      RecordTypesService.get(brand, recordType).subscribe(
        recordType => {
          const recordTypeModel = new RecordTypeResponseModel(
            _.get(recordType, 'name'),
            _.get(recordType, 'packageType'),
            _.get(recordType, 'searchFilters'),
            _.get(recordType, 'searchable'),
            normalizeRecordRelations(
              String(_.get(recordType, 'name', _.get(recordType, 'id', ''))),
              _.get(recordType, 'relatedTo')
            ),
            _.get(recordType, 'concurrentModification')
          );
          this.sendResp(req, res, { data: recordTypeModel });
        },
        error => {
          this.sendResp(req, res, {
            errors: [this.asError(error)],
            v1: error.message,
          });
        }
      );
    }

    /**
     * Returns all RecordTypes configuration based of the response model that is intentionally restricting
     * the object schema and information that is allowed to be sent back in this endpoint
     */
    public getAllTypes(req: Sails.Req, res: Sails.Res) {
      const brand: BrandingModel = this.getReqBrand(req);
      RecordTypesService.getAll(brand).subscribe(
        recordTypes => {
          const recordTypeModels = [];
          for (const recType of recordTypes) {
            const recordTypeModel = new RecordTypeResponseModel(
              _.get(recType, 'name'),
              _.get(recType, 'packageType'),
              _.get(recType, 'searchFilters'),
              _.get(recType, 'searchable'),
              normalizeRecordRelations(String(_.get(recType, 'name', '')), _.get(recType, 'relatedTo')),
              _.get(recType, 'concurrentModification')
            );
            recordTypeModels.push(recordTypeModel);
          }
          this.sendResp(req, res, { data: recordTypeModels });
        },
        error => {
          this.sendResp(req, res, { errors: [this.asError(error)], v1: error.message });
        }
      );
    }

    public getDashboardType(req: Sails.Req, res: Sails.Res) {
      const dashboardTypeParam = req.param('dashboardType') || '';
      const brand: BrandingModel = this.getReqBrand(req);
      DashboardTypesService.get(brand, dashboardTypeParam).subscribe(
        dashboardType => {
          const dashboardTypeModel = new DashboardTypeResponseModel({
            name: String(_.get(dashboardType, 'name', '')),
            description: _.get(dashboardType, 'description') as string | undefined,
            formatRules: (_.get(dashboardType, 'formatRules') ?? {}) as globalThis.Record<string, unknown>,
            tableConfig: _.get(dashboardType, 'tableConfig') as unknown as DashboardTableConfig,
            searchable: _.get(dashboardType, 'searchable') as boolean | undefined,
            system: _.get(dashboardType, 'system') as boolean | undefined,
          });
          this.sendResp(req, res, { data: dashboardTypeModel });
        },
        error => {
          this.sendResp(req, res, { errors: [this.asError(error)], v1: error.message });
        }
      );
    }

    private isValidDashboardViewDefinition(dashboardView: unknown): dashboardView is DashboardViewDefinition {
      if (!dashboardView || !_.isObject(dashboardView)) {
        return false;
      }

      const view = dashboardView as DashboardViewDefinition;
      return (
        _.isString(view.name) &&
        !_.isEmpty(view.name.trim()) &&
        _.isString(view.titleLabelKey) &&
        !_.isEmpty(view.titleLabelKey.trim()) &&
        _.isString(view.dashboardType) &&
        !_.isEmpty(view.dashboardType.trim()) &&
        _.isString(view.sourceRecordType) &&
        !_.isEmpty(view.sourceRecordType.trim()) &&
        _.isArray(view.steps) &&
        view.steps.length > 0 &&
        view.steps.every(step => {
          const dashboardViewStep = step as DashboardViewStepDefinition;
          return (
            _.isObject(step) &&
            _.isString(dashboardViewStep.name) &&
            !_.isEmpty(dashboardViewStep.name.trim()) &&
            _.isString(dashboardViewStep.sourceRecordType) &&
            !_.isEmpty(dashboardViewStep.sourceRecordType.trim()) &&
            (dashboardViewStep.fetchMode === 'allForRecordType' || dashboardViewStep.fetchMode === 'workflowStage') &&
            _.isObject(dashboardViewStep.dashboardTable)
          );
        })
      );
    }

    public getAllDashboardTypes(req: Sails.Req, res: Sails.Res) {
      const brand: BrandingModel = this.getReqBrand(req);
      DashboardTypesService.getAll(brand).subscribe(
        dashboardTypes => {
          const dashboardTypesModel = { dashboardTypes: [] };
          const dashboardTypesModelList = [];
          for (const dashboardType of dashboardTypes) {
            const dashboardTypeModel = new DashboardTypeResponseModel({
              name: String(_.get(dashboardType, 'name', '')),
              description: _.get(dashboardType, 'description') as string | undefined,
              formatRules: (_.get(dashboardType, 'formatRules') ?? {}) as globalThis.Record<string, unknown>,
              tableConfig: _.get(dashboardType, 'tableConfig') as unknown as DashboardTableConfig,
              searchable: _.get(dashboardType, 'searchable') as boolean | undefined,
              system: _.get(dashboardType, 'system') as boolean | undefined,
            });
            dashboardTypesModelList.push(dashboardTypeModel);
          }
          _.set(dashboardTypesModel, 'dashboardTypes', dashboardTypesModelList);
          this.sendResp(req, res, { data: dashboardTypesModel });
        },
        error => {
          this.sendResp(req, res, { errors: [this.asError(error)], v1: error.message });
        }
      );
    }

    public getDashboardView(req: Sails.Req, res: Sails.Res) {
      const dashboardViewParam = String(req.param('dashboardView') ?? '').trim();
      if (_.isEmpty(dashboardViewParam)) {
        return this.sendResp(req, res, { status: 400, displayErrors: [{ detail: 'Dashboard view is required' }] });
      }

      try {
        const dashboardView = DashboardTypesService.getDashboardView(dashboardViewParam);
        if (!this.isValidDashboardViewDefinition(dashboardView)) {
          return this.sendResp(req, res, {
            status: 404,
            displayErrors: [{ detail: 'Dashboard view provided is not valid' }],
          });
        }
        return this.sendResp(req, res, { data: new DashboardViewResponseModel(dashboardView) });
      } catch (error) {
        return this.sendResp(req, res, { status: 500, errors: [this.asError(error)] });
      }
    }

    protected tusServer: TusServer | null = null;

    protected initTusServer() {
      if (this.tusServer) {
        return;
      }

      const attachConfig = sails.config.record.attachments;
      const datastore = new TusStorageManagerDataStore({
        disk: StorageManagerService.stagingDisk(),
        logger: sails.log,
      });

      this.tusServer = new TusServer({
        path: attachConfig.path,
        datastore,
        respectForwardedHeaders: true,
        disableTerminationForFinishedUploads: true,
        generateUrl(req, { host, id }) {
          const tusReq = req as unknown as TusRequestExtension;
          const baseUrl = (tusReq._tusBaseUrl ?? '').replace(/\/+$/, '');
          // The datastore path is an internal TUS mount. Clients must continue
          // chunking through the routed RecordController attachment endpoint.
          return `//${host}${baseUrl}/attach/${id}`;
        },
      });

      this.tusServer.on(EVENTS.POST_FINISH, (_req, _res, upload: Upload) => {
        sails.log.verbose(`::: TUS upload completed: id=${upload.id}, size=${upload.size}`);
      });
      this.tusServer.on(EVENTS.POST_CREATE, (_req, ...args: unknown[]) => {
        const upload = args.find((arg): arg is Upload => !!arg && typeof arg === 'object' && 'id' in arg);
        sails.log.verbose(`::: TUS upload created: id=${upload?.id}`);
      });
    }

    protected getTusMetadata(req: Sails.Req, field: string): string {
      const entries: { [key: string]: string } = {};
      _.each(String(req.headers['upload-metadata']).split(','), (entry: string) => {
        const elems = entry.split(' ');
        entries[elems[0]] = elems[1];
      });
      return Buffer.from(entries[field], 'base64').toString('ascii');
    }

    protected normalizeTusLocationHeader(locationHeader: HeaderValue, requestHost: string, prefix: string): string {
      const firstValue = Array.isArray(locationHeader) ? locationHeader[0] : locationHeader;
      const rawLocation = typeof firstValue === 'string' ? firstValue.trim() : String(firstValue);
      const cleanPrefix = prefix.replace(/\/+$/, '');
      const host = requestHost.trim().replace(/\/+$/, '');

      const ensurePrefix = (pathname: string): string => {
        if (pathname.startsWith(`${cleanPrefix}/attach/`)) {
          return pathname;
        }
        if (pathname.startsWith('/attach/')) {
          return `${cleanPrefix}${pathname}`;
        }
        return pathname;
      };

      if (/^https?:\/\//i.test(rawLocation)) {
        const parsed = new URL(rawLocation);
        const normalizedPath = ensurePrefix(parsed.pathname);
        return `//${parsed.host}${normalizedPath}${parsed.search}`;
      }

      if (rawLocation.startsWith('//')) {
        const parsed = new URL(`http:${rawLocation}`);
        const normalizedPath = ensurePrefix(parsed.pathname);
        return `//${parsed.host}${normalizedPath}${parsed.search}`;
      }

      if (rawLocation.startsWith('/')) {
        const normalizedPath = ensurePrefix(rawLocation);
        return host ? `//${host}${normalizedPath}` : normalizedPath;
      }

      if (rawLocation.startsWith('attach/')) {
        const normalizedPath = ensurePrefix(`/${rawLocation}`);
        return host ? `//${host}${normalizedPath}` : normalizedPath;
      }

      return rawLocation;
    }

    public async doAttachment(req: Sails.Req, res: Sails.Res) {
      const brand: BrandingModel = this.getReqBrand(req);
      const oid = req.param('oid');
      const attachId = req.param('attachId');
      sails.log.verbose(`Have attach Id: ${attachId}`);
      this.initTusServer();
      const method = _.toLower(req.method);
      this.logger.verbose(
        `TUS attachment request method=${method} oid=${oid} attachId=${attachId} contentLength=${String(req.headers['content-length'] ?? '')} uploadOffset=${String(req.headers['upload-offset'] ?? '')} uploadLength=${String(req.headers['upload-length'] ?? '')} contentType=${String(req.headers['content-type'] ?? '')}`
      );

      const brandPortalPrefix = BrandingService.getBrandAndPortalPath(req);
      const defaultAttachmentPrefix = `${brandPortalPrefix}/record/${oid}`;
      const companionAttachmentPrefix = `${brandPortalPrefix}/companion/record/${oid}`;
      const prefix =
        [defaultAttachmentPrefix, companionAttachmentPrefix].find(
          candidatePrefix => req.url.startsWith(candidatePrefix) || req.path.startsWith(candidatePrefix)
        ) ?? defaultAttachmentPrefix;
      const tusReq = req as unknown as TusRequestExtension;
      tusReq._tusOriginalUrl = req.url;
      tusReq._tusBaseUrl = prefix;
      if (req.url.startsWith(prefix)) {
        req.url = req.url.slice(prefix.length);
      }

      if (method == 'post') {
        const originalSetHeader = res.setHeader.bind(res);
        const requestHost = String(req.headers.host ?? '');
        res.setHeader = ((name: string, value: HeaderValue) => {
          if (_.toLower(name) == 'location') {
            const normalizedLocation = this.normalizeTusLocationHeader(value, requestHost, prefix);
            return originalSetHeader(name, normalizedLocation);
          }
          return originalSetHeader(name, value);
        }) as typeof res.setHeader;
      }

      if (method != 'get') {
        // Wrap res.end to normalize the overloaded call signatures:
        //   end(cb?), end(chunk, cb?), end(chunk, encoding, cb?)
        // The TUS server and srvx may call any of these forms.
        // express-session's res.end wrapper only accepts (chunk, encoding)
        // and does NOT handle callback arguments — passing a function as
        // the first arg causes it to be treated as chunk data, crashing
        // with ERR_INVALID_ARG_TYPE.  Strip callbacks and deliver them
        // via the 'finish' event instead.
        const originalEnd = res.end.bind(res);
        res.end = ((...args: unknown[]) => {
          const [first, second, third] = args;
          if (typeof first === 'function') {
            // end(cb)
            res.once('finish', first as () => void);
            return originalEnd();
          }
          if (typeof second === 'function') {
            // end(chunk, cb)
            res.once('finish', second as () => void);
            return originalEnd(first as string | Uint8Array);
          }
          if (typeof third === 'function') {
            // end(chunk, encoding, cb)
            res.once('finish', third as () => void);
            return originalEnd(first as string | Uint8Array, second as BufferEncoding);
          }
          if (second !== undefined) {
            return originalEnd(first as string | Uint8Array, second as BufferEncoding);
          }
          if (first !== undefined) {
            return originalEnd(first as string | Uint8Array);
          }
          return originalEnd();
        }) as typeof res.end;
      }

      if (oid == 'pending-oid') {
        await this.tusServer!.handle(req, res);
        return;
      }
      const that = this;
      const currentRec = await firstValueFrom(this.getRecord(oid));

      if (method == 'get') {
        const hasViewAccess = await firstValueFrom(this.hasViewAccess(brand, req.user, currentRec));

        if (!hasViewAccess) {
          sails.log.error('Error: edit error no permissions in do attachment.');
          return this.sendResp(req, res, {
            status: 403,
            errors: [this.asError(new Error(TranslationService.t('edit-error-no-permissions')))],
            displayErrors: [{ code: 'edit-error-no-permissions' }],
          });
        }
        // check if this attachId exists in the record
        let found: AnyRecord | null = null;
        _.each(currentRec.metaMetadata.attachmentFields, (attField: string) => {
          if (!found) {
            const attFieldVal = currentRec.metadata[attField];
            found =
              _.find(attFieldVal as AnyRecord[], (attVal: AnyRecord) => {
                return attVal['fileId'] == attachId;
              }) ?? null;
            if (found) {
              return false;
            }
          }
          return undefined;
        });
        if (!found) {
          sails.log.verbose('Error: Attachment not found in do attachment.');
          return this.sendResp(req, res, {
            status: 404,
            errors: [this.asError(new Error(TranslationService.t('attachment-not-found')))],
            displayErrors: [{ code: 'attachment-not-found' }],
          });
        }
        let mimeType = found['mimeType'] as string;
        if (_.isEmpty(mimeType)) {
          // Set octet stream as a default
          mimeType = 'application/octet-stream';
        }
        res.set('Content-Type', mimeType);

        const size = found['size'] as string;
        if (!_.isEmpty(size)) {
          res.set('Content-Length', size);
        }

        sails.log.verbose('found.name ' + found['name']);
        res.attachment(found['name'] as string);
        sails.log.verbose(`Returning datastream observable of ${oid}: ${found['name']}, attachId: ${attachId}`);
        try {
          const response = await that.datastreamService.getDatastream(oid, attachId, {
            username: String(req.user?.username ?? '') || undefined,
          });
          if (response.readstream) {
            response.readstream.pipe(res);
          } else {
            const body = response.body ?? '';
            const buffer = Buffer.isBuffer(body) ? body : Buffer.from(body);
            res.end(buffer, 'binary');
          }
          return of(oid);
        } catch (error) {
          const errorMessage = this.getErrorMessage(error);
          if (this.isAjax(req)) {
            return this.sendResp(req, res, { errors: [this.asError(error)], v1: errorMessage });
          } else if (errorMessage == TranslationService.t('edit-error-no-permissions')) {
            return this.sendResp(req, res, {
              status: 403,
              errors: [this.asError(error)],
              displayErrors: [{ code: 'edit-error-no-permissions' }],
            });
          } else if (errorMessage == TranslationService.t('attachment-not-found')) {
            return this.sendResp(req, res, {
              status: 404,
              errors: [this.asError(error)],
              displayErrors: [{ code: 'attachment-not-found' }],
            });
          } else {
            return this.sendResp(req, res, { status: 500, errors: [this.asError(error)] });
          }
        }
      } else {
        const hasEditAccess = await firstValueFrom(this.hasEditAccess(brand, req.user, currentRec as AnyRecord));
        if (!hasEditAccess) {
          sails.log.error('Error: edit error no permissions in do attachment.');
          return this.sendResp(req, res, {
            status: 403,
            errors: [this.asError(new Error(TranslationService.t('edit-error-no-permissions')))],
            displayErrors: [{ code: 'edit-error-no-permissions' }],
          });
        }
        sails.log.verbose(req.headers);
        const uploadFileSize = req.headers['upload-length'];
        const diskSpaceThreshold = sails.config.record.diskSpaceThreshold;
        const stagingDiskConfig = StorageManagerService.getStagingDiskConfig();
        if (stagingDiskConfig.driver === 'fs' && !_.isUndefined(uploadFileSize) && !_.isUndefined(diskSpaceThreshold)) {
          const diskSpace = await checkDiskSpace(stagingDiskConfig.config.root);
          //set diskSpaceThreshold to a reasonable amount of space on disk that will be left free as a safety buffer
          const thresholdAppliedFileSize = _.toInteger(uploadFileSize) + diskSpaceThreshold;
          sails.log.verbose('Total File Size ' + thresholdAppliedFileSize + ' Total Free Space ' + diskSpace.free);
          if (diskSpace.free <= thresholdAppliedFileSize) {
            const errorMessage = TranslationService.t('not-enough-disk-space');
            sails.log.error(
              errorMessage + ' Total File Size ' + thresholdAppliedFileSize + ' Total Free Space ' + diskSpace.free
            );
            return this.sendResp(req, res, {
              status: 500,
              errors: [this.asError(new Error(errorMessage))],
            });
          }
        }
        // process the upload...
        await this.tusServer!.handle(req, res);
        return of(oid);
      }
    }

    public async getWorkflowSteps(req: Sails.Req, res: Sails.Res) {
      const recordTypeName = req.param('recordType');
      const brand: BrandingModel = this.getReqBrand(req);
      const normalizedRecordTypeName = typeof recordTypeName === 'string' ? recordTypeName.trim() : '';

      if (!normalizedRecordTypeName) {
        return this.sendResp(req, res, { status: 400, displayErrors: [{ detail: 'Record Type is required' }] });
      }

      try {
        const recordType = await firstValueFrom(RecordTypesService.get(brand, normalizedRecordTypeName));
        if (recordType == null) {
          return this.sendResp(req, res, {
            status: 400,
            displayErrors: [{ detail: 'Record Type provided is not valid' }],
          });
        }

        const wfSteps = await firstValueFrom(WorkflowStepsService.getAllForRecordType(recordType));
        return this.sendResp(req, res, { data: wfSteps });
      } catch (error) {
        return this.sendResp(req, res, { status: 500, errors: [this.asError(error)] });
      }
    }

    public getRelatedRecords(req: Sails.Req, res: Sails.Res) {
      return this.getRelatedRecordsInternal(req, res).then(response => {
        return this.sendResp(req, res, { data: response });
      });
    }

    public async getRelatedRecordsInternal(req: Sails.Req, _res: Sails.Res) {
      sails.log.verbose(`getRelatedRecordsInternal - starting...`);
      const brand: BrandingModel = this.getReqBrand(req);
      const oid = req.param('oid');
      //TODO may need to check user authorization like in getPermissionsInternal?
      //let record = await this.getRecord(oid).toPromise();
      //or the permissions may be checked in a parent call that will retrieved record oids that a user has access to
      //plus some additional rules/logic that may be applied to filter the records
      const relationshipOptions = this.parseRelationshipExpandOptions(req);
      const relatedRecords = await this.recordsService.getRelatedRecords(oid, brand, relationshipOptions);
      const filteredRelationships = await this.filterRelationshipGraphByAccess(brand, req.user ?? {}, relatedRecords);
      return this.buildLegacyRelatedRecordsResponse(filteredRelationships);
    }

    public async getPermissionsInternal(req: Sails.Req, _res: Sails.Res) {
      const oid = String(req.param('oid') ?? '').trim();
      if (_.isEmpty(oid)) {
        throw new Error('Record oid is required.');
      }

      try {
        return await this.recordsService.getResolvedPermissionsSummary(oid);
      } catch (error) {
        sails.log.error(`Failed to resolve permissions for record '${oid}'`, error);
        throw error;
      }
    }

    public async getPermissions(req: Sails.Req, res: Sails.Res) {
      const brand: BrandingModel = this.getReqBrand(req);
      const oid = String(req.param('oid') ?? '').trim();
      if (_.isEmpty(oid)) {
        return this.sendResp(req, res, { status: 400, displayErrors: [{ detail: 'Record oid is required.' }] });
      }
      try {
        const record = await this.recordsService.getMeta(oid);
        if (_.isEmpty(record)) {
          return this.sendResp(req, res, { status: 404, displayErrors: [{ code: 'error-404-heading' }] });
        }
        const hasViewAccess = await firstValueFrom(this.hasViewAccess(brand, req.user ?? {}, record));
        if (!hasViewAccess) {
          return this.sendResp(req, res, {
            status: 403,
            displayErrors: [{ code: 'error-403-heading' }],
          });
        }
        const response = await this.recordsService.getResolvedPermissionsSummary(oid);
        const representation = recordRepresentationConcurrency(record);
        return this.sendResp(req, res, {
          data: response,
          meta: { oid: record.redboxOid, ...representation.metadata },
          headers: representation.headers,
        });
      } catch (error) {
        return this.sendResp(req, res, {
          status: 500,
          errors: [this.asError(error)],
          displayErrors: [{ detail: 'Failed to load record permissions.' }],
        });
      }
    }

    public async getAttachments(req: Sails.Req, res: Sails.Res) {
      sails.log.verbose('getting attachments....');
      const brand: BrandingModel = this.getReqBrand(req);
      const oid = req.param('oid');
      try {
        const record = await this.recordsService.getMeta(oid);
        if (_.isEmpty(record)) {
          return this.sendResp(req, res, { status: 404, displayErrors: [{ code: 'error-404-heading' }] });
        }
        const hasViewAccess = await firstValueFrom(this.hasViewAccess(brand, req.user ?? {}, record));
        if (!hasViewAccess) {
          return this.sendResp(req, res, {
            status: 403,
            displayErrors: [{ code: 'error-403-heading' }],
          });
        }
        const attachments = await this.recordsService.getAttachments(oid, undefined, {
          username: String(req.user?.username ?? '') || undefined,
        });
        return this.sendResp(req, res, { data: attachments });
      } catch (error) {
        sails.log.error('Failed to get attachments', error);
        return this.sendResp(req, res, {
          status: 500,
          errors: [this.asError(error)],
          displayErrors: [{ detail: 'Failed to load attachments.' }],
        });
      }
    }

    public async getDataStream(req: Sails.Req, res: Sails.Res) {
      const brand: BrandingModel = this.getReqBrand(req);
      const oid = req.param('oid');
      const datastreamId = req.param('datastreamId');
      const currentRec = await firstValueFrom(this.getRecord(oid));

      const hasViewAccess = await firstValueFrom(this.hasViewAccess(brand, req.user, currentRec as AnyRecord));
      if (!hasViewAccess) {
        return throwError(new Error(TranslationService.t('edit-error-no-permissions')));
      } else {
        const fileName = req.param('fileName') ? req.param('fileName') : datastreamId;
        res.set('Content-Type', 'application/octet-stream');
        sails.log.verbose('fileName ' + fileName);
        res.attachment(fileName);
        sails.log.verbose(`Returning datastream observable of ${oid}: ${fileName}, datastreamId: ${datastreamId}`);
        try {
          const response = await this.datastreamService.getDatastream(oid, datastreamId, {
            username: String(req.user?.username ?? '') || undefined,
          });
          if (response.readstream) {
            response.readstream.pipe(res);
          } else {
            const body = response.body ?? '';
            const buffer = Buffer.isBuffer(body) ? body : Buffer.from(body);
            res.end(buffer, 'binary');
          }
          return of(oid);
        } catch (error) {
          const errorMessage = this.getErrorMessage(error);
          if (this.isAjax(req)) {
            return this.sendResp(req, res, { errors: [this.asError(error)], v1: errorMessage });
          } else if (errorMessage == TranslationService.t('edit-error-no-permissions')) {
            return this.sendResp(req, res, {
              status: 403,
              errors: [this.asError(error)],
              displayErrors: [{ code: 'edit-error-no-permissions' }],
            });
          } else if (errorMessage == TranslationService.t('attachment-not-found')) {
            return this.sendResp(req, res, {
              status: 404,
              errors: [this.asError(error)],
              displayErrors: [{ code: 'attachment-not-found' }],
            });
          } else {
            return this.sendResp(req, res, { status: 500, errors: [this.asError(error)] });
          }
        }
      }
    }

    /**
     **************************************************************************************************
     **************************************** Override magic methods **********************************
     **************************************************************************************************
     */

    /** Dashboard Controller functions */

    public listWorkspaces(req: Sails.Req, res: Sails.Res) {
      const url = `${BrandingService.getFullPath(req)}/dashboard/workspace?packageType=workspace&titleLabel=workspaces`;
      return res.redirect(url);
    }

    public async render(req: Sails.Req, res: Sails.Res) {
      const recordType = req.param('recordType') ? req.param('recordType') : '';
      let packageType = req.param('packageType') ? req.param('packageType') : '';
      let dashboardType = req.param('dashboardType') ? req.param('dashboardType') : 'standard';
      const locals = req.options?.locals as globalThis.Record<string, unknown> | undefined;
      let titleLabel = req.param('titleLabel')
        ? this.translate(req.param('titleLabel'), locals)
        : `${this.translate('edit-dashboard', locals)} ${this.translate(recordType + '-title-label', locals)}`;
      if (recordType == 'workspace') {
        if (packageType == '') {
          packageType = 'workspace';
        }
        dashboardType = 'workspace';
        if (titleLabel == '') {
          titleLabel = 'workspaces';
        }
      }

      // Get dashboard config for the record type to determine if admin sidebar should be shown
      let showAdminSideBar = false;
      if (recordType) {
        try {
          const brand = this.getReqBrand(req);
          const dashboardConfig = await DashboardTypesService.getRecordTypeDashboardConfig(brand, recordType);
          if (dashboardConfig && dashboardConfig.showAdminSideBar === true) {
            showAdminSideBar = true;
          }
        } catch (error) {
          sails.log.warn(`Error fetching dashboard config for record type ${recordType}:`, error);
        }
      }

      return this.sendView(req, res, 'dashboard', {
        recordType: recordType,
        packageType: packageType,
        dashboardType: dashboardType,
        dashboardView: '',
        titleLabel: titleLabel,
        showAdminSideBar: showAdminSideBar,
        title: this.formatDocumentTitle(titleLabel, locals),
      });
    }

    public async renderDashboardView(req: Sails.Req, res: Sails.Res) {
      const locals = req.options?.locals as globalThis.Record<string, unknown> | undefined;
      const dashboardViewName = String(req.param('dashboardView') ?? '').trim();
      if (_.isEmpty(dashboardViewName)) {
        return this.sendResp(req, res, { status: 400, displayErrors: [{ detail: 'Dashboard view is required' }] });
      }

      const dashboardView = DashboardTypesService.getDashboardView(dashboardViewName);
      if (!this.isValidDashboardViewDefinition(dashboardView)) {
        return this.sendResp(req, res, {
          status: 404,
          displayErrors: [{ detail: 'Dashboard view provided is not valid' }],
        });
      }

      const titleLabel = this.translate(dashboardView.titleLabelKey || dashboardView.name, locals);
      return this.sendView(req, res, 'dashboard', {
        recordType: dashboardView.sourceRecordType,
        packageType: '',
        dashboardType: dashboardView.dashboardType,
        dashboardView: dashboardView.name,
        titleLabel,
        showAdminSideBar: dashboardView.showAdminSideBar === true,
        title: this.formatDocumentTitle(titleLabel, locals),
      });
    }

    public redirectLegacyConsolidatedDashboard(req: Sails.Req, res: Sails.Res) {
      return res.redirect(`${BrandingService.getFullPath(req)}/dashboard-view/consolidated`);
    }

    public async getRecordList(req: Sails.Req, res: Sails.Res) {
      const brand: BrandingModel = this.getReqBrand(req);

      const editAccessOnly = req.query.editOnly;

      let roles: AnyRecord[] = [];
      let username = 'guest';
      let user: AnyRecord = {};
      if (req.isAuthenticated()) {
        roles = (req.user!['roles'] ?? []) as AnyRecord[];
        user = req.user!;
        username = req.user!['username'] as string;
      } else {
        // assign default role if needed...
        user = { username: username };
        roles = [];
        const defRole = RolesService.getDefUnathenticatedRole(brand);
        if (defRole) roles.push(defRole as unknown as AnyRecord);
      }
      const recordType = req.param('recordType');
      const workflowState = req.param('state');
      const start = req.param('start');
      const rows = req.param('rows');
      const packageType = req.param('packageType');
      const sort = req.param('sort');
      const filterFieldString = req.param('filterFields');
      let filterString: string | undefined = req.param('filter');
      let filterFields: string[] | undefined = undefined;
      const filterModeString = req.param('filterMode');
      let secondarySort: string | undefined = req.param('secondarySort');
      let filterMode: string[] | undefined = undefined;

      if (!_.isEmpty(filterFieldString)) {
        filterFields = filterFieldString.split(',');
      } else {
        filterString = undefined;
      }

      if (!_.isEmpty(filterModeString)) {
        filterMode = filterModeString.split(',');
      } else {
        filterMode = undefined;
      }

      if (secondarySort == '') {
        secondarySort = undefined;
      }

      // sails.log.error('-------------Record Controller getRecordList------------------------');
      // sails.log.error('filterFields '+ filterFields);
      // sails.log.error('filterString '+ filterString);
      // sails.log.error('filterMode '+ filterMode);
      // sails.log.error('----------------------------------------------------------');

      try {
        const response = await this.getRecords(
          workflowState,
          recordType,
          start,
          rows,
          user,
          roles,
          brand,
          editAccessOnly,
          packageType,
          sort,
          filterFields,
          filterString,
          filterMode,
          secondarySort
        );
        if (response) {
          this.sendResp(req, res, { data: response });
        } else {
          this.sendResp(req, res, { status: 500, meta: {}, v1: response });
        }
      } catch (error) {
        const errorMessage = this.getErrorMessage(error);
        this.sendResp(req, res, {
          errors: [this.asError(error)],
          displayErrors: [{ title: 'Error updating meta', detail: errorMessage }],
          v1: errorMessage,
        });
      }
    }

    public async getDeletedRecordList(req: Sails.Req, res: Sails.Res) {
      const brand: BrandingModel = this.getReqBrand(req);
      const editAccessOnly = req.query.editOnly;

      let roles: AnyRecord[] = [];
      let username = 'guest';
      let user: AnyRecord = {};
      if (req.isAuthenticated()) {
        roles = (req.user!['roles'] ?? []) as AnyRecord[];
        user = req.user!;
        username = req.user!['username'] as string;
      } else {
        // assign default role if needed...
        user = { username: username };
        roles = [];
        const defRole = RolesService.getDefUnathenticatedRole(brand);
        if (defRole) roles.push(defRole as unknown as AnyRecord);
      }
      const recordType = req.param('recordType');
      const workflowState = req.param('state');
      const start = req.param('start');
      const rows = req.param('rows');
      const packageType = req.param('packageType');
      const sort = req.param('sort');
      const filterFieldString = req.param('filterFields');
      let filterString: string | undefined = req.param('filter');
      let filterFields: string[] | undefined = undefined;
      const filterModeString = req.param('filterMode');
      let filterMode: string[] | undefined = undefined;

      if (!_.isEmpty(filterFieldString)) {
        filterFields = filterFieldString.split(',');
      } else {
        filterString = undefined;
      }

      if (!_.isEmpty(filterModeString)) {
        filterMode = filterModeString.split(',');
      } else {
        filterMode = undefined;
      }

      // sails.log.error('-------------Record Controller getRecordList------------------------');
      // sails.log.error('filterFields '+ filterFields);
      // sails.log.error('filterString '+ filterString);
      // sails.log.error('filterMode '+ filterMode);
      // sails.log.error('----------------------------------------------------------');

      try {
        const response = await this.getDeletedRecords(
          workflowState,
          recordType,
          start,
          rows,
          user,
          roles,
          brand,
          editAccessOnly,
          packageType,
          sort,
          filterFields,
          filterString,
          filterMode
        );
        if (response) {
          this.sendResp(req, res, { data: response });
        } else {
          this.sendResp(req, res, { status: 500, meta: {}, v1: response });
        }
      } catch (error) {
        const errorMessage = this.getErrorMessage(error);
        this.sendResp(req, res, {
          errors: [this.asError(error)],
          displayErrors: [{ title: 'Error updating meta', detail: errorMessage }],
          v1: errorMessage,
        });
      }
    }

    public renderDeletedRecords(req: Sails.Req, res: Sails.Res) {
      return this.sendView(req, res, 'admin/deletedRecords');
    }

    private getDocMetadata(doc: { [key: string]: unknown }): { [key: string]: unknown } {
      const metadata: { [key: string]: unknown } = {};
      for (const key in doc) {
        if (key.indexOf('authorization_') != 0 && key.indexOf('metaMetadata_') != 0) {
          metadata[key] = doc[key];
        }
        if (key == 'authorization_editRoles') {
          metadata[key] = doc[key];
        }
      }
      return metadata;
    }

    protected async getRecords(
      workflowState: unknown,
      recordType: unknown,
      start: unknown,
      rows: unknown,
      user: AnyRecord,
      roles: AnyRecord[],
      brand: BrandingModel,
      editAccessOnly: unknown = undefined,
      packageType: unknown = undefined,
      sort: unknown = undefined,
      filterFields: unknown = undefined,
      filterString: unknown = undefined,
      filterMode: unknown = undefined,
      secondarySort: unknown = undefined
    ) {
      const username = user['username'] as string;
      if (!_.isUndefined(recordType) && !_.isEmpty(recordType)) {
        recordType = (recordType as string).split(',');
      }
      if (!_.isUndefined(packageType) && !_.isEmpty(packageType)) {
        packageType = (packageType as string).split(',');
      }
      const results = await this.recordsService.getRecords(
        workflowState,
        recordType,
        start,
        rows,
        username,
        roles,
        brand,
        editAccessOnly,
        packageType,
        sort,
        filterFields,
        filterString,
        filterMode,
        secondarySort
      );
      if (!results.isSuccessful()) {
        sails.log.verbose(`Failed to retrieve records!`);
        return null;
      }

      const totalItems = results.totalItems;
      const startIndex = start as number;
      const noItems = rows as number;
      const pageNumber = startIndex / noItems + 1;

      const response: { [key: string]: unknown } = {};
      response['totalItems'] = totalItems;
      response['currentPage'] = pageNumber;
      response['noItems'] = noItems;

      const items = [];
      const docs = results.items;

      for (let i = 0; i < docs.length; i++) {
        const doc = docs[i] as globalThis.Record<string, unknown>;
        const item: { [key: string]: unknown } = {};
        item['oid'] = doc['redboxOid'];
        item['revision'] = recordRepresentationRevision(doc);
        const docMetadata = (doc['metadata'] ?? {}) as globalThis.Record<string, unknown>;
        item['title'] = docMetadata['title'];
        item['metadata'] = this.getDocMetadata(doc);
        item['dateCreated'] = doc['dateCreated'];
        item['dateModified'] = doc['lastSaveDate'];
        item['hasEditAccess'] = this.recordsService.hasEditAccess(brand, user, roles, doc);
        items.push(item);
      }

      response['items'] = items;
      return response;
    }

    protected async getDeletedRecords(
      workflowState: unknown,
      recordType: unknown,
      start: unknown,
      rows: unknown,
      user: AnyRecord,
      roles: AnyRecord[],
      brand: BrandingModel,
      editAccessOnly: unknown = undefined,
      packageType: unknown = undefined,
      sort: unknown = undefined,
      filterFields: unknown = undefined,
      filterString: unknown = undefined,
      filterMode: unknown = undefined
    ) {
      const username = user['username'] as string;
      if (!_.isUndefined(recordType) && !_.isEmpty(recordType)) {
        recordType = (recordType as string).split(',');
      }
      if (!_.isUndefined(packageType) && !_.isEmpty(packageType)) {
        packageType = (packageType as string).split(',');
      }
      const results = await this.recordsService.getDeletedRecords(
        workflowState,
        recordType,
        start,
        rows,
        username,
        roles,
        brand,
        editAccessOnly,
        packageType,
        sort,
        filterFields,
        filterString,
        filterMode
      );
      if (!results.isSuccessful()) {
        sails.log.verbose(`Failed to retrieve deleted records!`);
        return null;
      }

      const totalItems = results.totalItems;
      const startIndex = start as number;
      const noItems = rows as number;
      const pageNumber = startIndex / noItems + 1;

      const response: { [key: string]: unknown } = {};
      response['totalItems'] = totalItems;
      response['currentPage'] = pageNumber;
      response['noItems'] = noItems;

      const items = [];
      const docs = results.items;

      for (let i = 0; i < docs.length; i++) {
        const doc = docs[i] as globalThis.Record<string, unknown>;
        const item: { [key: string]: unknown } = {};
        const delRecordMeta = (doc['deletedRecordMetadata'] ?? {}) as globalThis.Record<string, unknown>;
        item['oid'] = doc['redboxOid'];
        item['revision'] = recordRepresentationRevision(doc);
        item['lifecycleState'] = doc['lifecycleState'] ?? 'deleted';
        const lifecycleOperation = (doc['lifecycleOperation'] ?? {}) as globalThis.Record<string, unknown>;
        if (Object.keys(lifecycleOperation).length > 0) {
          item['lifecycle'] = {
            kind: lifecycleOperation['kind'],
            attempts: lifecycleOperation['attempts'],
            startedAt: lifecycleOperation['startedAt'],
            updatedAt: lifecycleOperation['updatedAt'],
            ...(lifecycleOperation['errorCode'] ? { errorCode: lifecycleOperation['errorCode'] } : {}),
          };
        }
        const delRecordMetadata = (delRecordMeta['metadata'] ?? {}) as globalThis.Record<string, unknown>;
        item['title'] = delRecordMetadata['title'];
        item['dateCreated'] = delRecordMeta['dateCreated'];
        item['dateModified'] = delRecordMeta['lastSaveDate'];
        item['dateDeleted'] = doc['dateDeleted'];
        items.push(item);
      }

      response['items'] = items;
      return response;
    }

    private mergeRecordMetadata(
      currentMetadata: { [key: string]: unknown },
      newMetadata: { [key: string]: unknown }
    ): { [key: string]: unknown } {
      // Merge the current and new metadata into a new object, replacing the current metadata property values with the new property values.
      return _.mergeWith({}, currentMetadata, newMetadata, (objValue: unknown, srcValue: unknown) => {
        if (Array.isArray(objValue)) {
          // Merge behavior for arrays is to replace the existing array with the new array.
          // This has the implicit assumption that arrays are complete, not partial.
          // This makes more sense than concatenating because usually an array will contain all items, not a subset of the items.
          return srcValue;
        }
        return undefined;
      });
    }
  }
}
