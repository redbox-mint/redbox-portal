// Copyright(c) 2017 Queensland Cyber Infrastructure Foundation (http://www.qcif.edu.au/)
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

import { firstValueFrom, from } from 'rxjs';
import * as path from 'path';
import {
  APIHarvestResponse,
  BrandingModel,
  Controllers as controllers,
  Datastream,
  DatastreamService,
  DatastreamServiceResponse,
  HarvestRunService as HarvestRunServiceContract,
  ListAPIResponse,
  RecordModel,
  RecordsService,
  RecordTypeModel,
  SearchService,
  UserModel,
  getValidatedApiRequest,
  validateApiRouteFiles,
  getPermissionsRoute,
  addUserEditRoute,
  removeUserEditRoute,
  addUserViewRoute,
  removeUserViewRoute,
  getMetaRoute,
  getRecordAuditRoute,
  getObjectMetaRoute,
  updateMetaRoute,
  updateObjectMetaRoute,
  createRecordRoute,
  getDataStreamRoute,
  addDataStreamsRoute,
  listRecordsRoute,
  listDeletedRecordsRoute,
  getDeletedRecordRoute,
  restoreRecordRoute,
  deleteRecordRoute,
  destroyDeletedRecordRoute,
  transitionWorkflowRoute,
  listDatastreamsRoute,
  addRoleEditRoute,
  removeRoleEditRoute,
  addRoleViewRoute,
  removeRoleViewRoute,
  RECORD_SCHEMA_WRITE_PRECONDITION_HEADER,
  harvestRoute,
  legacyHarvestRoute,
  isRecordSchemaEnabled,
} from '../../index';
import type { RecordSchemaService } from '../../index';
import { RecordRelationshipExpandOptions, RecordRelationshipGraph } from '../../RecordsService';
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
} from '../../RecordSaveResponse';
import type { RecordConcurrencyContext, RecordSaveContext, RecordSaveOperation } from '../../RecordSaveResponse';
import {
  parsePublicRecordConcurrencyRequest,
  recordRepresentationConcurrency,
  recordRepresentationRevision,
  recordSaveResultHeaderOption,
  recordSaveResultHeaders,
} from '../../RecordHttpConcurrency';
import { recordSchemaDescribedByLink, recordSchemaImmutableUrl } from '../../api-routes/record-schema-response';
import { isFormRecordAccessUser } from '../../services/form-record-access-user';

import { v4 as UUIDGenerator } from 'uuid';

declare const HarvestRunService: HarvestRunServiceContract;

type RecordSchemaUpdateResolver = Pick<RecordSchemaService.Services.RecordSchema, 'resolveUpdate'>;

function isObjectRecord(value: unknown): value is globalThis.Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isRecordSchemaUpdateResolver(value: unknown): value is RecordSchemaUpdateResolver {
  return isObjectRecord(value) && typeof value.resolveUpdate === 'function';
}

export namespace Controllers {
  /**
   * Implements the legacy webservice record operations exposed by the core route registry.
   *
   * @author <a target='_' href='https://github.com/andrewbrazzatti'>Andrew Brazzatti</a>
   * @extensionPoint Register a subclass as `RecordController` through `registerRedboxWebserviceControllers` to replace the webservice implementation without changing its route contract.
   * @remarks The extension catalogue reports actions and deterministic route wiring only; request and response schemas remain in the independent REST API reference.
   * @see https://github.com/redbox-mint/redbox-portal/wiki/ReDBox-Portal-API
   */
  export class Record extends controllers.Core.Controller {
    RecordsService!: RecordsService;
    SearchService!: SearchService;
    DatastreamService!: DatastreamService;
    /**
     * Exported methods, accessible from internet.
     */
    protected override _exportedMethods: string[] = [
      'init',
      'create',
      'updateMeta',
      'updateObjectMeta',
      'getMeta',
      'getRecordAudit',
      'getObjectMeta',
      'addUserEdit',
      'removeUserEdit',
      'addUserView',
      'removeUserView',
      'getPermissions',
      'getDataStream',
      'addDataStreams',
      'listRecords',
      'listDeletedRecords',
      'getDeletedRecord',
      'deleteRecord',
      'destroyDeletedRecord',
      'restoreRecord',
      'transitionWorkflow',
      'listDatastreams',
      'addRoleEdit',
      'removeRoleEdit',
      'addRoleView',
      'removeRoleView',
      'harvest',
      'legacyHarvest',
    ];

    public init(): void {
      this.RecordsService = sails.services.recordsservice as unknown as RecordsService;
      const that = this;
      this.registerSailsHook(
        'after',
        ['hook:redbox:storage:ready', 'hook:redbox:datastream:ready', 'ready'],
        function () {
          const datastreamServiceName = sails.config.record.datastreamService;
          sails.log.verbose(`RecordController Webservice ready, using datastream service: ${datastreamServiceName}`);
          if (datastreamServiceName != undefined) {
            that.DatastreamService = sails.services[datastreamServiceName] as unknown as DatastreamService;
          }
        }
      );
    }

    /**
     **************************************************************************************************
     **************************************** Add custom methods **************************************
     **************************************************************************************************
     */

    public bootstrap() {}

    private asError(error: unknown): Error {
      return error instanceof Error ? error : new Error(String(error));
    }

    private saveContext(
      req: Sails.Req,
      operation: RecordSaveOperation,
      validationOperation?: string,
      targetStep?: string,
      concurrency?: RecordConcurrencyContext,
      recordSchemaIfMatch?: string
    ): RecordSaveContext {
      const locals = req.options?.locals as globalThis.Record<string, unknown> | undefined;
      const portal = typeof locals?.portal === 'string' ? locals.portal : BrandingService.getPortalFromReq(req);
      return createRecordSaveContext({
        requestId: readSaveRequestId(req.headers),
        routeFamily: 'api',
        operation,
        portal,
        targetStep: typeof targetStep === 'string' ? targetStep.trim() : undefined,
        validationOperation,
        recordSchemaIfMatch,
        validationRequestParameters: normalizeRecordValidationRequestFacts(
          req.apiRequest?.params,
          req.apiRequest?.query,
          req.params,
          req.query
        ),
        ...(concurrency ? { concurrency } : {}),
      });
    }

    private mutationSaveContext(
      req: Sails.Req,
      oid: string | undefined,
      operation: RecordSaveOperation,
      validationOperation?: string,
      targetStep?: string
    ) {
      const parsed = parsePublicRecordConcurrencyRequest(req.headers, oid);
      if (!parsed.valid) return parsed;
      return {
        valid: true as const,
        context: this.saveContext(
          req,
          operation,
          validationOperation,
          targetStep,
          parsed.context,
          this.validatedRecordSchemaIfMatch(req.apiRequest?.headers as globalThis.Record<string, unknown> | undefined)
        ),
      };
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

    private validatedRecordSchemaIfMatch(headers: globalThis.Record<string, unknown> | undefined): string | undefined {
      const value = headers?.[RECORD_SCHEMA_WRITE_PRECONDITION_HEADER];
      return typeof value === 'string' ? value : undefined;
    }

    private recordSchemaPreconditionFailureStatus(result: RecordSaveResponse): 400 | 412 | undefined {
      const status = recordSaveFailureStatus(result);
      if (status === 412) return status;
      const malformed = result.problems.some(
        problem =>
          problem.kind === 'validation' && problem.issues.some(issue => issue.code === 'record-schema.invalid-request')
      );
      return malformed ? 400 : undefined;
    }

    private recordSaveDiscoveryHeaders(
      req: Sails.Req,
      result: RecordSaveResponse
    ): Readonly<globalThis.Record<string, string>> {
      const headers = { ...recordSaveResultHeaders(result) };
      if (result.schemaOutcome) {
        const immutableUrl = recordSchemaImmutableUrl(
          BrandingService.getBrandNameFromReq(req).trim(),
          BrandingService.getPortalFromReq(req).trim(),
          result.schemaOutcome.digest,
          BrandingService.getRootContext()
        );
        headers.Link = recordSchemaDescribedByLink(immutableUrl);
      }
      return headers;
    }

    private async recordReadDiscoveryHeaders(
      req: Sails.Req,
      brand: BrandingModel,
      oid: string,
      headers: Readonly<globalThis.Record<string, string>>
    ): Promise<Readonly<globalThis.Record<string, string>>> {
      const resolver = sails.services?.recordschemaservice;
      const user = req.user;
      if (!isRecordSchemaUpdateResolver(resolver) || !isFormRecordAccessUser(user)) {
        return headers;
      }

      try {
        const branding = BrandingService.getBrandNameFromReq(req).trim();
        const portal = BrandingService.getPortalFromReq(req).trim();
        if (!branding || !portal) {
          return headers;
        }
        const result = await resolver.resolveUpdate({
          brand: brand.id.trim(),
          branding,
          portal,
          oid,
          caller: { brand, user },
        });
        if (result.kind !== 'resolved' && result.kind !== 'partial') {
          return headers;
        }

        const immutableUrl = recordSchemaImmutableUrl(
          branding,
          portal,
          result.digest,
          BrandingService.getRootContext()
        );
        return { ...headers, Link: recordSchemaDescribedByLink(immutableUrl) };
      } catch {
        sails.log.warn('Record schema metadata-read discovery could not be resolved.');
        return headers;
      }
    }

    private sendSaveFailure(req: Sails.Req, res: Sails.Res, result: RecordSaveResponse, detail: string) {
      const status = recordSaveFailureStatus(result);
      const schemaStatus = this.recordSchemaPreconditionFailureStatus(result);
      const headerOption = recordSaveResultHeaderOption(result);
      if (this.getApiVersion(req) === '1.0') {
        return this.sendResp(req, res, {
          status: schemaStatus ?? (isRecordConflictStatus(status) ? status : 500),
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

    private async projectSafeSaveFailure(
      brand: BrandingModel,
      user: globalThis.Record<string, unknown>,
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
      let latest = await this.requireRecordInBrand(oid, brand);
      if (!latest) {
        try {
          latest = await this.RecordsService.getDeletedRecordMeta(oid, brand);
        } catch {
          latest = null;
        }
        if (!latest) return false;
      }
      if (!this.hasViewAccess(brand, user, latest)) {
        result.setConcurrencyMetadata(undefined);
        return false;
      }
      if (!this.hasEditAccess(brand, user, latest)) {
        result.problems = [
          recordSaveProblem(
            'authorization',
            'response',
            '@record-save-record-validation-edit-unauthorized',
            'record-validation-edit-unauthorized'
          ),
        ];
      }
      const representation = recordRepresentationConcurrency(latest);
      result.setProjectedMetadata(latest.metadata);
      result.setConcurrencyMetadata({ ...result.concurrency, ...representation.metadata });
      return true;
    }

    private sendPrivateSaveFailure(req: Sails.Req, res: Sails.Res) {
      return this.sendResp(req, res, {
        status: 403,
        displayErrors: [{ code: 'not-authorised' }],
        ...(this.getApiVersion(req) === '1.0' ? { v1: { message: 'Not authorised.' } } : {}),
      });
    }

    private async sendPermissionMutationResult(
      req: Sails.Req,
      res: Sails.Res,
      brand: BrandingModel,
      oid: string,
      result: RecordSaveResponse
    ) {
      if (!result.wasPersisted()) {
        if (!(await this.projectSafeSaveFailure(brand, req.user ?? {}, oid, result))) {
          return this.sendPrivateSaveFailure(req, res);
        }
        return this.sendSaveFailure(req, res, result, `Failed to update record with oid ${oid}.`);
      }
      const current = await this.requireRecordInBrand(result.oid, brand);
      const authorization =
        current && this.hasViewAccess(brand, req.user ?? {}, current) ? current.authorization : null;
      return this.sendResp(req, res, {
        data: authorization,
        meta: { ...result },
        v1: authorization,
        headers: recordSaveResultHeaders(result),
      });
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

    private hasViewAccess(
      brand: BrandingModel,
      user: globalThis.Record<string, unknown> | undefined,
      record: globalThis.Record<string, unknown>
    ): boolean {
      const currentUser = user ?? {};
      const roles = (currentUser['roles'] ?? []) as globalThis.Record<string, unknown>[];
      return this.RecordsService.hasViewAccess(brand, currentUser, roles, record);
    }

    private hasEditAccess(
      brand: BrandingModel,
      user: globalThis.Record<string, unknown> | undefined,
      record: globalThis.Record<string, unknown>
    ): boolean {
      const currentUser = user ?? {};
      const roles = (currentUser['roles'] ?? []) as globalThis.Record<string, unknown>[];
      return this.RecordsService.hasEditAccess(brand, currentUser, roles, record);
    }

    private async filterRelationshipGraphByAccess(
      brand: BrandingModel,
      user: globalThis.Record<string, unknown> | undefined,
      graph: RecordRelationshipGraph
    ): Promise<RecordRelationshipGraph> {
      const filteredRelatedObjects: globalThis.Record<string, unknown[]> = {};
      const allowedTargetOids = new Set<string>();
      const omittedByAccess: globalThis.Record<string, number> = {
        ...((graph.omittedByAccess ?? {}) as globalThis.Record<string, number>),
      };

      for (const [recordType, records] of Object.entries(graph.relatedObjects ?? {})) {
        const keptRecords: unknown[] = [];
        for (const recordValue of (records ?? []) as unknown[]) {
          const record = (recordValue ?? {}) as globalThis.Record<string, unknown>;
          const recordOid = String(record.redboxOid ?? '').trim();
          if (!recordOid) {
            continue;
          }
          const hasAccess = recordOid === graph.rootOid || (await this.hasViewAccess(brand, user, record));
          if (hasAccess) {
            allowedTargetOids.add(recordOid);
            keptRecords.push(record);
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

    private async requireRecordInBrand(oid: string, brand: BrandingModel): Promise<RecordModel | null> {
      try {
        const record = await this.RecordsService.getMeta(oid);
        if (_.isEmpty(record)) {
          return null;
        }
        const recordBrandId = String(_.get(record, 'metaMetadata.brandId', '') ?? '').trim();
        const activeBrandId = String(brand?.id ?? '').trim();
        if (!activeBrandId || recordBrandId !== activeBrandId) {
          return null;
        }
        return record;
      } catch {
        return null;
      }
    }

    private async requireDeletedRecordInBrand(
      oid: string,
      brand: BrandingModel,
      user: globalThis.Record<string, unknown>
    ): Promise<boolean> {
      if (!brand?.id) {
        return false;
      }
      const deletedRecord = await this.RecordsService.getDeletedRecordMeta(oid, brand);
      if (!deletedRecord) {
        return false;
      }
      const deletedBrandId = String(_.get(deletedRecord, 'metaMetadata.brandId', '') ?? '');
      if (deletedBrandId && deletedBrandId !== String(brand.id)) return false;
      const roles = Array.isArray(user.roles) ? (user.roles as globalThis.Record<string, unknown>[]) : [];
      return this.RecordsService.hasEditAccess(brand, user, roles, deletedRecord);
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
        if (!(await this.projectSafeSaveFailure(brand, req.user ?? {}, oid, result))) {
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

    public async getPermissions(req: Sails.Req, res: Sails.Res) {
      const validated = getValidatedApiRequest(req);
      const oid = validated.params.oid as string;
      const brand: BrandingModel = BrandingService.getBrand(req.session.branding!);

      try {
        const record = await this.requireRecordInBrand(oid, brand);
        if (!record) {
          return this.sendResp(req, res, { status: 404 });
        }
        if (!this.hasViewAccess(brand, req.user ?? {}, record)) {
          return this.sendResp(req, res, { status: 403 });
        }
        const representation = recordRepresentationConcurrency(record);
        return this.sendResp(req, res, {
          data: record.authorization,
          meta: { oid: record.redboxOid, ...representation.metadata },
          headers: representation.headers,
        });
      } catch (err) {
        return this.sendResp(req, res, {
          errors: [this.asError(err)],
          displayErrors: [{ detail: 'Failed to get record permission.' }],
        });
      }
    }

    public async addUserEdit(req: Sails.Req, res: Sails.Res) {
      const brand: BrandingModel = BrandingService.getBrand(req.session.branding!);
      const validated = getValidatedApiRequest(req);
      const oid = validated.params.oid as string;
      const saveRequest = this.mutationSaveContext(req, oid, 'update');
      if (!saveRequest.valid) {
        return this.sendConcurrencyRequestFailure(req, res, saveRequest);
      }
      const body = validated.body as globalThis.Record<string, unknown>;
      const users = body['users'] as string[] | undefined;
      const pendingUsers = body['pendingUsers'] as string[] | undefined;

      let record: RecordModel | null;
      try {
        record = await this.requireRecordInBrand(oid, brand);
        if (!record) return this.sendResp(req, res, { status: 404 });
        if (users != null && users.length > 0) {
          record.authorization.edit = _.union(record['authorization']['edit'], users);
        }
        if (pendingUsers != null && pendingUsers.length > 0) {
          record.authorization.editPending = _.union(record['authorization']['editPending'], pendingUsers);
        }
      } catch (err) {
        return this.sendResp(req, res, {
          errors: [this.asError(err)],
          displayErrors: [{ detail: 'Failed to modify record meta for adding an editor.' }],
        });
      }

      try {
        const result = await this.RecordsService.updateMeta(
          brand,
          oid,
          record,
          req.user ?? {},
          true,
          true,
          {},
          undefined,
          saveRequest.context
        );
        return await this.sendPermissionMutationResult(req, res, brand, oid, result);
      } catch (err) {
        return this.sendResp(req, res, {
          errors: [this.asError(err)],
          displayErrors: [{ detail: 'Failed adding an editor.' }],
        });
      }
    }

    public async addUserView(req: Sails.Req, res: Sails.Res) {
      const brand: BrandingModel = BrandingService.getBrand(req.session.branding!);
      const validated = getValidatedApiRequest(req);
      const oid = validated.params.oid as string;
      const saveRequest = this.mutationSaveContext(req, oid, 'update');
      if (!saveRequest.valid) {
        return this.sendConcurrencyRequestFailure(req, res, saveRequest);
      }
      const body = validated.body as globalThis.Record<string, unknown>;
      const users = body['users'] as string[] | undefined;
      const pendingUsers = body['pendingUsers'] as string[] | undefined;

      let record;
      try {
        record = await this.requireRecordInBrand(oid, brand);
        if (!record) return this.sendResp(req, res, { status: 404 });
        if (users != null && users.length > 0) {
          record['authorization']['view'] = _.union(record['authorization']['view'], users);
        }
        if (pendingUsers != null && pendingUsers.length > 0) {
          record['authorization']['viewPending'] = _.union(record['authorization']['viewPending'], pendingUsers);
        }
      } catch (err) {
        return this.sendResp(req, res, {
          errors: [this.asError(err)],
          displayErrors: [{ detail: 'Failed getting record meta for adding a viewer.' }],
        });
      }

      try {
        const result = await this.RecordsService.updateMeta(
          brand,
          oid,
          record,
          req.user ?? {},
          true,
          true,
          {},
          undefined,
          saveRequest.context
        );
        return await this.sendPermissionMutationResult(req, res, brand, oid, result);
      } catch (err) {
        return this.sendResp(req, res, {
          errors: [this.asError(err)],
          displayErrors: [{ detail: 'Failed adding a viewer.' }],
        });
      }
    }

    public async removeUserEdit(req: Sails.Req, res: Sails.Res) {
      const brand: BrandingModel = BrandingService.getBrand(req.session.branding!);
      const validated = getValidatedApiRequest(req);
      const oid = validated.params.oid as string;
      const saveRequest = this.mutationSaveContext(req, oid, 'update');
      if (!saveRequest.valid) {
        return this.sendConcurrencyRequestFailure(req, res, saveRequest);
      }
      const body = validated.body as globalThis.Record<string, unknown>;
      const users = body['users'] as string[] | undefined;
      const pendingUsers = body['pendingUsers'] as string[] | undefined;

      let record;
      try {
        record = await this.requireRecordInBrand(oid, brand);
        if (!record) return this.sendResp(req, res, { status: 404 });
        if (users != null && users.length > 0) {
          record['authorization']['edit'] = _.difference(record['authorization']['edit'], users);
        }
        if (pendingUsers != null && pendingUsers.length > 0) {
          record['authorization']['editPending'] = _.difference(record['authorization']['editPending'], pendingUsers);
        }
      } catch (err) {
        return this.sendResp(req, res, {
          errors: [this.asError(err)],
          displayErrors: [{ detail: 'Failed getting record meta for removing an editor.' }],
        });
      }

      try {
        const result = await this.RecordsService.updateMeta(
          brand,
          oid,
          record,
          req.user ?? {},
          true,
          true,
          {},
          undefined,
          saveRequest.context
        );
        return await this.sendPermissionMutationResult(req, res, brand, oid, result);
      } catch (err) {
        return this.sendResp(req, res, {
          errors: [this.asError(err)],
          displayErrors: [{ detail: 'Failed removing an editor.' }],
        });
      }
    }

    public async removeUserView(req: Sails.Req, res: Sails.Res) {
      const brand: BrandingModel = BrandingService.getBrand(req.session.branding!);
      const validated = getValidatedApiRequest(req);
      const oid = validated.params.oid as string;
      const saveRequest = this.mutationSaveContext(req, oid, 'update');
      if (!saveRequest.valid) {
        return this.sendConcurrencyRequestFailure(req, res, saveRequest);
      }
      const body = validated.body as globalThis.Record<string, unknown>;
      const users = body['users'] as string[] | undefined;
      const pendingUsers = body['pendingUsers'] as string[] | undefined;

      let record;
      try {
        record = await this.requireRecordInBrand(oid, brand);
        if (!record) return this.sendResp(req, res, { status: 404 });
        if (users != null && users.length > 0) {
          record['authorization']['view'] = _.difference(record['authorization']['view'], users);
        }
        if (pendingUsers != null && pendingUsers.length > 0) {
          record['authorization']['viewPending'] = _.difference(record['authorization']['viewPending'], pendingUsers);
        }
      } catch (err) {
        return this.sendResp(req, res, {
          errors: [this.asError(err)],
          displayErrors: [{ detail: 'Failed to modify record meta for removing a viewer.' }],
        });
      }

      try {
        const result = await this.RecordsService.updateMeta(
          brand,
          oid,
          record,
          req.user ?? {},
          true,
          true,
          {},
          undefined,
          saveRequest.context
        );
        return await this.sendPermissionMutationResult(req, res, brand, oid, result);
      } catch (err) {
        return this.sendResp(req, res, {
          errors: [this.asError(err)],
          displayErrors: [{ detail: 'Failed removing a viewer.' }],
        });
      }
    }

    public async getMeta(req: Sails.Req, res: Sails.Res) {
      const validated = getValidatedApiRequest(req);
      const oid = validated.params.oid as string;
      const brand: BrandingModel = BrandingService.getBrand(req.session.branding!);

      try {
        const record = await this.requireRecordInBrand(oid, brand);
        if (!record) {
          return this.sendResp(req, res, {
            status: 404,
            displayErrors: [{ detail: `Cannot find an accessible record with oid: ${oid}` }],
          });
        }
        if (!this.hasViewAccess(brand, req.user ?? {}, record)) {
          return this.sendResp(req, res, { status: 403 });
        }
        const representation = recordRepresentationConcurrency(record);
        const headers = await this.recordReadDiscoveryHeaders(req, brand, oid, representation.headers);
        if (!this.shouldIncludeRelationships(req)) {
          return this.sendResp(req, res, {
            data: record.metadata,
            meta: { oid: record.redboxOid, ...representation.metadata },
            headers,
          });
        }

        const relationships = await this.RecordsService.getRelatedRecords(
          oid,
          brand,
          this.parseRelationshipExpandOptions(req, 1)
        );
        const filteredRelationships = await this.filterRelationshipGraphByAccess(brand, req.user ?? {}, relationships);
        return this.sendResp(req, res, {
          data: {
            metadata: record.metadata,
            relationships: filteredRelationships,
          },
          meta: { oid: record.redboxOid, ...representation.metadata },
          headers,
        });
      } catch (err) {
        return this.sendResp(req, res, {
          errors: [this.asError(err)],
          displayErrors: [{ detail: 'Get Metadata failed.' }],
        });
      }
    }

    public async getRecordAudit(req: Sails.Req, res: Sails.Res) {
      const validated = getValidatedApiRequest(req);
      const oid = validated.params.oid as string;
      const dateFrom = validated.query.dateFrom as string | undefined;
      const dateTo = validated.query.dateTo as string | undefined;
      const params: { oid: string; dateFrom: Date | null; dateTo: Date | null } = { oid, dateFrom: null, dateTo: null };
      if (!_.isEmpty(dateFrom)) {
        params['dateFrom'] = new Date(dateFrom as string);
      }

      if (!_.isEmpty(dateTo)) {
        params['dateTo'] = new Date(dateTo as string);
      }

      try {
        const audit = await this.RecordsService.getRecordAudit(params);
        const response: ListAPIResponse<unknown> = new ListAPIResponse<unknown>();
        response.summary.numFound = _.size(audit);
        response.summary.page = 1;
        response.records = audit;
        return this.sendResp(req, res, { data: response });
      } catch (err) {
        return this.sendResp(req, res, {
          errors: [this.asError(err)],
          displayErrors: [{ detail: `Failed to list audit records for ${oid}, please.` }],
        });
      }
    }

    public async getObjectMeta(req: Sails.Req, res: Sails.Res) {
      const brand: BrandingModel = BrandingService.getBrand(req.session.branding!);
      sails.log.debug('brand is...');
      sails.log.debug(brand);
      const validated = getValidatedApiRequest(req);
      const oid = validated.params.oid as string;

      try {
        const record = await this.requireRecordInBrand(oid, brand);
        if (!record) {
          return this.sendResp(req, res, { status: 404 });
        }
        if (!this.hasViewAccess(brand, req.user ?? {}, record)) {
          return this.sendResp(req, res, { status: 403 });
        }
        const representation = recordRepresentationConcurrency(record);
        return this.sendResp(req, res, {
          data: record.metaMetadata,
          meta: { oid: record.redboxOid, ...representation.metadata },
          headers: representation.headers,
        });
      } catch (err) {
        return this.sendResp(req, res, {
          errors: [this.asError(err)],
          displayErrors: [{ detail: `Failed to get object meta for ${oid}, please.`, meta: { oid } }],
        });
      }
    }

    public async updateMeta(req: Sails.Req, res: Sails.Res) {
      const brand: BrandingModel = BrandingService.getBrand(req.session.branding!);
      const validated = getValidatedApiRequest(req);
      const oid = validated.params.oid as string;
      const body = validated.body as globalThis.Record<string, unknown>;
      const shouldMerge = validated.query.merge === true;
      const shouldProcessDatastreams = validated.query.datastreams === true;
      const parsedOperation = parsePublicValidationOperation(validated.query.operation);
      if (!parsedOperation.valid) {
        return this.sendResp(req, res, {
          status: 400,
          displayErrors: [{ code: 'record-validation-operation-invalid' }],
        });
      }
      const validationOperation = parsedOperation.value;
      const saveRequest = this.mutationSaveContext(req, oid, 'update', validationOperation);
      if (!saveRequest.valid) {
        return this.sendConcurrencyRequestFailure(req, res, saveRequest);
      }

      let record;
      try {
        record = await this.requireRecordInBrand(oid, brand);
        if (!record) {
          return this.sendResp(req, res, {
            status: 400,
            displayErrors: [
              { detail: `Failed to update meta, cannot find existing record with oid: ${oid}.`, meta: { oid } },
            ],
          });
        }
      } catch (err) {
        return this.sendResp(req, res, {
          errors: [this.asError(err)],
          displayErrors: [{ detail: 'Update Metadata failed.' }],
        });
      }
      try {
        const result = await this.RecordsService.updateMeta(
          brand,
          oid,
          record,
          req.user ?? {},
          true,
          true,
          {},
          { metadata: body, mode: shouldMerge ? 'merge' : 'replace' },
          saveRequest.context
        );
        // Attachment work is part of RecordsService's ordered save pipeline.
        // Keep accepting the legacy query parameter for route compatibility,
        // but do not run a second, unjournaled datastream pass here.
        if (shouldProcessDatastreams) {
          sails.log.verbose(`Datastream processing was requested for ${oid}; handled by RecordsService save pipeline.`);
        }
        // A persisted warning is still a persisted record, so it keeps the
        // success body; the warnings travel in the typed `meta` result.
        if (result.wasPersisted()) {
          return this.sendResp(req, res, {
            data: result,
            meta: { ...result },
            ...(this.getApiVersion(req) === '1.0' ? { v1: this.legacySaveBody(result) } : {}),
            headers: this.recordSaveDiscoveryHeaders(req, result),
          });
        }
        if (!(await this.projectSafeSaveFailure(brand, req.user ?? {}, oid, result))) {
          return this.sendPrivateSaveFailure(req, res);
        }
        return this.sendSaveFailure(req, res, result, 'Update Metadata failed');
      } catch (err) {
        return this.sendResp(req, res, {
          errors: [this.asError(err)],
          displayErrors: [{ detail: 'Update Metadata failed' }],
        });
      }
    }

    public async updateObjectMeta(req: Sails.Req, res: Sails.Res) {
      const brand: BrandingModel = BrandingService.getBrand(req.session.branding!);
      const validated = getValidatedApiRequest(req);
      const oid = validated.params.oid as string;
      const body = validated.body as globalThis.Record<string, unknown>;
      const saveRequest = this.mutationSaveContext(req, oid, 'update');
      if (!saveRequest.valid) {
        return this.sendConcurrencyRequestFailure(req, res, saveRequest);
      }

      let record;
      try {
        record = await this.requireRecordInBrand(oid, brand);
        if (!record) {
          return this.sendResp(req, res, { status: 404 });
        }
        record['metaMetadata'] = body as unknown as RecordModel['metaMetadata'];
      } catch (err) {
        return this.sendResp(req, res, { errors: [this.asError(err)], displayErrors: [{ detail: 'Updated' }] });
      }

      try {
        const result = await this.RecordsService.updateMeta(
          brand,
          oid,
          record,
          req.user ?? {},
          true,
          true,
          {},
          undefined,
          saveRequest.context
        );
        if (result.wasPersisted()) {
          return this.sendResp(req, res, {
            data: result,
            meta: { ...result },
            ...(this.getApiVersion(req) === '1.0' ? { v1: this.legacySaveBody(result) } : {}),
            headers: recordSaveResultHeaders(result),
          });
        }
        if (!(await this.projectSafeSaveFailure(brand, req.user ?? {}, oid, result))) {
          return this.sendPrivateSaveFailure(req, res);
        }
        return this.sendSaveFailure(req, res, result, 'Update Object Metadata failed');
      } catch (err) {
        return this.sendResp(req, res, { errors: [this.asError(err)], displayErrors: [{ detail: 'Updated' }] });
      }
    }

    public create(req: Sails.Req, res: Sails.Res): void {
      const brand: BrandingModel = BrandingService.getBrand(req.session.branding!);
      const validated = getValidatedApiRequest(req);
      const recordType = validated.params.recordType as string;
      const parsedOperation = parsePublicValidationOperation(validated.query.operation);
      if (!parsedOperation.valid) {
        this.sendResp(req, res, {
          status: 400,
          displayErrors: [{ code: 'record-validation-operation-invalid' }],
        });
        return;
      }
      const validationOperation = parsedOperation.value;
      const body = validated.body as globalThis.Record<string, unknown>;
      const workflowStage = body?.['workflowStage'] as string | undefined;
      const saveRequest = this.mutationSaveContext(
        req,
        undefined,
        workflowStage ? 'transition' : 'create',
        validationOperation,
        workflowStage
      );
      if (!saveRequest.valid) {
        this.sendConcurrencyRequestFailure(req, res, saveRequest);
        return;
      }
      const user = req.user ?? ({} as globalThis.Record<string, unknown>);
      const that = this;
      if (body != null) {
        const isUnwrappedMetadata = body['metadata'] == null;
        const rawSubmittedMetadata = _.cloneDeep(isUnwrappedMetadata ? body : body['metadata']) as globalThis.Record<
          string,
          unknown
        >;
        const persistenceMetadata = _.cloneDeep(rawSubmittedMetadata);
        if (isUnwrappedMetadata && !isRecordSchemaEnabled(sails.config.recordSchema)) {
          persistenceMetadata['authorization'] = [];
        }
        let authorizationEdit, authorizationView, authorizationEditPending, authorizationViewPending;
        const authorizationBody = body['authorization'] as globalThis.Record<string, unknown> | undefined;
        if (authorizationBody != null) {
          authorizationEdit = authorizationBody['edit'];
          authorizationView = authorizationBody['view'];
          authorizationEditPending = authorizationBody['editPending'];
          authorizationViewPending = authorizationBody['viewPending'];
        } else {
          // If no authorization block set to user
          authorizationEdit = [];
          authorizationView = [];
          authorizationEdit.push((req.user ?? ({} as globalThis.Record<string, unknown>)).username);
          authorizationView.push((req.user ?? ({} as globalThis.Record<string, unknown>)).username);
        }
        const authorization = {
          edit: authorizationEdit,
          view: authorizationView,
          editPending: authorizationEditPending,
          viewPending: authorizationViewPending,
        };

        const recordTypeObservable = RecordTypesService.get(brand, recordType);

        recordTypeObservable.subscribe((recordTypeModel: unknown) => {
          if (recordTypeModel) {
            const workflowStage = body['workflowStage'] as string | undefined;
            const request: globalThis.Record<string, unknown> = {};
            request['metadata'] = persistenceMetadata;
            request['authorization'] = authorization;

            const createPromise = this.RecordsService.create(
              brand,
              request,
              recordTypeModel,
              user,
              true,
              true,
              workflowStage,
              saveRequest.context
            );

            const obs = from(createPromise);
            obs.subscribe(
              response => {
                // 201 + Location applies to both persisted outcomes; a
                // warning is still a created record.
                if (response.wasPersisted()) {
                  if (workflowStage) {
                    WorkflowStepsService.get(recordTypeModel, workflowStage).subscribe(wfStep => {
                      that.RecordsService.setWorkflowStepRelatedMetadata(
                        request,
                        wfStep as globalThis.Record<string, unknown>
                      );
                    });
                  }
                  return this.sendResp(req, res, {
                    status: 201,
                    data: response,
                    meta: { ...response },
                    ...(this.getApiVersion(req) === '1.0' ? { v1: this.legacySaveBody(response) } : {}),
                    headers: {
                      Location:
                        sails.config.appUrl +
                        BrandingService.getBrandAndPortalPath(req) +
                        '/api/records/metadata/' +
                        response.oid,
                      ...this.recordSaveDiscoveryHeaders(req, response),
                    },
                  });
                } else {
                  return that.sendSaveFailure(req, res, response, 'Create Record failed');
                }
              },
              (error: unknown) => {
                return this.sendResp(req, res, {
                  errors: [this.asError(error)],
                  displayErrors: [{ detail: 'Create Record failed' }],
                });
              }
            );
            return;
          } else {
            return this.sendResp(req, res, {
              status: 400,
              displayErrors: [{ detail: 'Record Type provided is not valid' }],
            });
          }
        });
      }
    }

    public async getDataStream(req: Sails.Req, res: Sails.Res) {
      const validated = getValidatedApiRequest(req);
      const oid = validated.params.oid as string;
      const datastreamId = validated.params.datastreamId as string;
      const brand: BrandingModel = BrandingService.getBrand(req.session.branding!);
      try {
        // Attachment bytes follow the same current-authorization boundary as
        // the record metadata they belong to. The bundled datastream adapter
        // ignores the request context, so this is the only view-access check.
        const record = await this.requireRecordInBrand(oid, brand);
        if (!record) {
          return this.sendResp(req, res, { status: 404 });
        }
        if (!this.hasViewAccess(brand, req.user ?? {}, record)) {
          return this.sendResp(req, res, { status: 403 });
        }
        let found: globalThis.Record<string, unknown> | null = null;
        const attachments = await this.RecordsService.getAttachments(oid, undefined, {
          username: String(req.user?.username ?? '') || undefined,
        });
        for (const attachment of attachments) {
          if (attachment.fileId == datastreamId) {
            found = attachment;
          }
        }

        if (!found) {
          return this.sendResp(req, res, { status: 404 });
        }
        let mimeType = found.mimeType;
        if (_.isEmpty(mimeType)) {
          // Set octet stream as a default
          mimeType = 'application/octet-stream';
        }
        const fileName = validated.query.fileName
          ? String(validated.query.fileName)
          : found.name
            ? found.name
            : datastreamId;
        res.set('Content-Type', 'application/octet-stream');

        const size = found.size as string | undefined;
        if (!_.isEmpty(size)) {
          res.set('Content-Length', size!);
        }

        res.attachment(fileName as string);

        try {
          const response = await this.DatastreamService.getDatastream(oid, datastreamId, {
            username: String(req.user?.username ?? '') || undefined,
          });
          if (response.readstream) {
            response.readstream.on('error', () => {
              sails.log.error('record_datastream_stream_failed', {
                event: 'record_datastream_stream_failed',
              });
              return;
            });
            response.readstream.pipe(res);
          } else {
            const body = response.body ?? '';
            const buffer = Buffer.isBuffer(body) ? body : Buffer.from(body);
            res.end(buffer, 'binary');
          }
          return;
        } catch {
          return this.sendResp(req, res, {
            status: 500,
            displayErrors: [{ detail: 'There was a problem with the upstream request.' }],
          });
        }
      } catch {
        return this.sendResp(req, res, {
          status: 500,
          displayErrors: [{ detail: 'There was a problem with the upstream request.' }],
        });
      }
    }

    public async addDataStreams(req: Sails.Req, res: Sails.Res) {
      const validated = getValidatedApiRequest(req);
      const oid = validated.params.oid as string;
      const brand: BrandingModel = BrandingService.getBrand(req.session.branding!);
      const saveRequest = this.mutationSaveContext(req, oid, 'update');
      if (!saveRequest.valid) {
        return this.sendConcurrencyRequestFailure(req, res, saveRequest);
      }

      // Reject an inaccessible target before accepting bytes into staging.
      // RecordsService repeats this authorization against its authoritative
      // snapshot and owns the final compare-and-set below.
      const record = await this.requireRecordInBrand(oid, brand);
      if (!record) {
        return this.sendResp(req, res, { status: 404 });
      }
      if (!this.hasEditAccess(brand, req.user ?? {}, record)) {
        return this.sendPrivateSaveFailure(req, res);
      }

      const self = this;
      const attachmentsDir =
        sails.config.record.attachments.file?.directory ?? sails.config.record.attachments.stageDir;
      if (!attachmentsDir) {
        return this.sendResp(req, res, {
          status: 500,
          displayErrors: [
            {
              detail:
                'Attachment directory is required: configure record.attachments.file.directory or record.attachments.stageDir.',
            },
          ],
        });
      }
      (req as unknown as { file: (field: string) => { upload: (...args: unknown[]) => void } })
        .file('attachmentFields')
        .upload(
          {
            dirname: `${attachmentsDir}`,
            maxBytes: 104857600,
            saveAs: function (__newFileStream: unknown, next: (err?: Error, value?: string) => void) {
              sails.log.verbose('Generating files....');
              try {
                // const nextPath = path.join(UUIDGenerator(), path.basename(__newFileStream.filename));
                const nextPath = UUIDGenerator();
                return next(undefined, nextPath);
              } catch (error) {
                sails.log.error(error);
                return next(
                  new Error(`Could not determine an appropriate filename for uploaded filestream(s) for oid ${oid}.`)
                );
              }
            },
          },
          async function (error: unknown, UploadedFileMetadata: unknown[]) {
            const uploadedFiles = Array.isArray(UploadedFileMetadata)
              ? (UploadedFileMetadata as globalThis.Record<string, unknown>[])
              : [];
            const stagedFileIds = uploadedFiles
              .map(descriptor => {
                const stagedPath = typeof descriptor.fd === 'string' ? descriptor.fd : '';
                return stagedPath ? path.relative(attachmentsDir, stagedPath).trim() : '';
              })
              .filter(Boolean);
            const cleanupStagedFiles = async () => {
              if (!self.DatastreamService.removeStagedDatastream) return;
              await Promise.allSettled(
                stagedFileIds.map(fileId => self.DatastreamService.removeStagedDatastream!(fileId))
              );
            };
            if (error) {
              await cleanupStagedFiles();
              return self.sendResp(req, res, {
                errors: [self.asError(error)],
                displayErrors: [{ detail: `There was a problem adding datastream(s) to: ${attachmentsDir}` }],
                headers: self.getNoCacheHeaders(),
              });
            }
            const fileValidation = validateApiRouteFiles(addDataStreamsRoute, {
              attachmentFields: uploadedFiles,
            });
            if (!fileValidation.valid) {
              await cleanupStagedFiles();
              return self.sendResp(req, res, {
                status: 400,
                displayErrors: fileValidation.issues.map(i => ({ title: i.path, detail: i.message })),
                headers: self.getNoCacheHeaders(),
              });
            }
            const validated = getValidatedApiRequest(req);
            req.apiRequest = {
              ...validated,
              files: { attachmentFields: uploadedFiles },
            };
            sails.log.verbose(UploadedFileMetadata);
            sails.log.verbose('Succesfully uploaded all file metadata. Sending locations downstream....');
            const fileIds: Datastream[] = uploadedFiles.map(function (nextDescriptor) {
              return new Datastream({
                fileId: path.relative(attachmentsDir, nextDescriptor.fd as string),
                name: nextDescriptor.filename as string,
                mimeType: nextDescriptor.type as string,
                size: nextDescriptor.size as number,
              });
            });
            sails.log.verbose('files to send upstream are:');
            sails.log.verbose(_.toString(fileIds));
            const defaultErrorMessage = 'Error sending datastreams upstream.';
            let saveResult: RecordSaveResponse | undefined;
            try {
              // A standalone upload still mutates the protected record
              // aggregate. Reload after the potentially long byte transfer so
              // a tokenless compatible request cannot write an old metadata
              // snapshot. The original request context remains unchanged so a
              // supplied stale If-Match is still rejected by RecordsService.
              const authoritativeRecord = await self.requireRecordInBrand(oid, brand);
              if (!authoritativeRecord) {
                await cleanupStagedFiles();
                return self.sendResp(req, res, { status: 404 });
              }
              if (!self.hasEditAccess(brand, req.user ?? {}, authoritativeRecord)) {
                await cleanupStagedFiles();
                return self.sendPrivateSaveFailure(req, res);
              }
              saveResult = await self.RecordsService.updateMeta(
                brand,
                oid,
                authoritativeRecord,
                req.user ?? {},
                false,
                false,
                {},
                { metadata: authoritativeRecord.metadata, mode: 'replace' },
                saveRequest.context
              );
              if (!saveResult.wasPersisted()) {
                await cleanupStagedFiles();
                if (!(await self.projectSafeSaveFailure(brand, req.user ?? {}, oid, saveResult))) {
                  return self.sendPrivateSaveFailure(req, res);
                }
                return self.sendSaveFailure(req, res, saveResult, defaultErrorMessage);
              }

              const result: DatastreamServiceResponse = await self.DatastreamService.addDatastreams(oid, fileIds);

              sails.log.verbose(`Done with updating streams and returning response...`);
              if (result.isSuccessful()) {
                sails.log.verbose('Presuming success...');
                _.merge(result, { fileIds: fileIds });
                // Finalization has copied/promoted the primary blobs. Remove
                // only their adapter-owned staging objects and sidecars.
                await cleanupStagedFiles();
                return self.sendResp(req, res, {
                  data: { message: result },
                  meta: { ...saveResult },
                  headers: recordSaveResultHeaders(saveResult),
                });
              } else {
                saveResult.addProblem({
                  kind: 'processing',
                  phase: 'attachments',
                  issues: [{ code: 'datastream-finalization-failed', message: '@datastream-finalization-failed' }],
                });
                await cleanupStagedFiles();
                return self.sendResp(req, res, {
                  data: { message: result },
                  displayErrors: [{ detail: defaultErrorMessage + ' ' + result.message }],
                  meta: { ...saveResult },
                  headers: { ...self.getNoCacheHeaders(), ...recordSaveResultHeaders(saveResult) },
                });
              }
            } catch (error) {
              await cleanupStagedFiles();
              if (saveResult?.wasPersisted()) {
                saveResult.addProblem({
                  kind: 'processing',
                  phase: 'attachments',
                  issues: [{ code: 'datastream-finalization-failed', message: '@datastream-finalization-failed' }],
                });
                return self.sendResp(req, res, {
                  data: { message: defaultErrorMessage },
                  displayErrors: [{ detail: defaultErrorMessage }],
                  meta: { ...saveResult },
                  headers: { ...self.getNoCacheHeaders(), ...recordSaveResultHeaders(saveResult) },
                });
              }
              return self.sendResp(req, res, {
                errors: [self.asError(error)],
                displayErrors: [{ detail: defaultErrorMessage }],
                headers: self.getNoCacheHeaders(),
              });
            }
          }
        );
    }

    /**
     **************************************************************************************************
     **************************************** Override magic methods **********************************
     **************************************************************************************************
     */

    /* Ad-hoc methods for listing records via api
     * Using DashboardService for getRecords similar (copied from
     * DashboardController) to DashboardService
     * Can be used for building reports or SPAs for redbox
     * TODO: Refactor DashboardController to use this and move DashboardService.getRecords
     * to RecordsService
     */

    private getDocMetadata(doc: { [key: string]: unknown }) {
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
      user: globalThis.Record<string, unknown>,
      roles: globalThis.Record<string, unknown>[],
      brand: unknown,
      editAccessOnly: unknown = undefined,
      packageType: unknown = undefined,
      sort: unknown = undefined,
      fieldNames: unknown = undefined,
      filterString: unknown = undefined
    ) {
      const username = (user as globalThis.Record<string, unknown>).username;
      if (!_.isUndefined(recordType) && !_.isEmpty(recordType)) {
        recordType = (recordType as string).split(',');
      }
      if (packageType != null && !_.isEmpty(packageType)) {
        packageType = (packageType as string).split(',');
      }
      if (start == null) {
        start = 0;
      }
      if (rows == undefined) {
        rows = 10;
      }
      const results = await this.RecordsService.getRecords(
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
        fieldNames,
        filterString
      );
      sails.log.debug(results);
      const apiReponse: ListAPIResponse<unknown> = new ListAPIResponse();
      const totalItems = results.totalItems;
      const startIndex = start as number;
      const noItems = rows as number;
      const pageNumber = Math.floor(startIndex / noItems + 1);

      apiReponse.summary.numFound = totalItems;
      apiReponse.summary.start = startIndex;
      apiReponse.summary.page = pageNumber;

      const items = [];
      const docs = results['items'];

      for (let i = 0; i < docs.length; i++) {
        const doc = docs[i] as globalThis.Record<string, unknown>;
        const item: { [key: string]: unknown } = {};
        item['oid'] = doc['redboxOid'];
        item['revision'] = recordRepresentationRevision(doc);
        const docMetadata = (doc['metadata'] ?? {}) as globalThis.Record<string, unknown>;
        item['title'] = docMetadata['title'];
        item['metadata'] = docMetadata;
        item['dateCreated'] = doc['dateCreated'];
        item['dateModified'] = doc['lastSaveDate'];
        item['hasEditAccess'] = this.RecordsService.hasEditAccess(brand, user, roles, doc);
        items.push(item);
      }
      apiReponse.records = items;
      return apiReponse;
    }

    protected async getDeletedRecords(
      workflowState: unknown,
      recordType: unknown,
      start: unknown,
      rows: unknown,
      user: globalThis.Record<string, unknown>,
      roles: globalThis.Record<string, unknown>[],
      brand: unknown,
      editAccessOnly: unknown = undefined,
      packageType: unknown = undefined,
      sort: unknown = undefined,
      fieldNames: unknown = undefined,
      filterString: unknown = undefined
    ) {
      const username = (user as globalThis.Record<string, unknown>).username;
      if (!_.isUndefined(recordType) && !_.isEmpty(recordType)) {
        recordType = (recordType as string).split(',');
      }
      if (packageType != null && !_.isEmpty(packageType)) {
        packageType = (packageType as string).split(',');
      }
      if (start == null) {
        start = 0;
      }
      if (rows == undefined) {
        rows = 10;
      }
      const results = await this.RecordsService.getDeletedRecords(
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
        fieldNames,
        filterString
      );
      sails.log.debug(results);
      const apiReponse: ListAPIResponse<unknown> = new ListAPIResponse();
      const totalItems = results.totalItems;
      const startIndex = start as number;
      const noItems = rows as number;
      const pageNumber = Math.floor(startIndex / noItems + 1);

      apiReponse.summary.numFound = totalItems;
      apiReponse.summary.start = startIndex;
      apiReponse.summary.page = pageNumber;

      const items = [];
      const docs = results['items'];

      for (let i = 0; i < docs.length; i++) {
        const doc = docs[i] as globalThis.Record<string, unknown>;
        const item: { [key: string]: unknown } = {};
        const deletedRecord = (doc['deletedRecordMetadata'] ?? {}) as globalThis.Record<string, unknown>;
        const deletedRecordMetadata = (deletedRecord['metadata'] ?? {}) as globalThis.Record<string, unknown>;
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
        item['title'] = deletedRecordMetadata['title'];
        item['deletedRecord'] = deletedRecord;
        item['dateCreated'] = doc['dateCreated'];
        item['dateModified'] = doc['lastSaveDate'];
        item['dateDeleted'] = doc['dateDeleted'];
        items.push(item);
      }
      apiReponse.records = items;
      return apiReponse;
    }

    public listRecords(req: Sails.Req, res: Sails.Res) {
      //sails.log.debug('api-list-records');
      const brand: BrandingModel = BrandingService.getBrand(req.session.branding!);
      const validated = getValidatedApiRequest(req);
      const { query } = validated;
      const editAccessOnly = query.editOnly;

      let roles: globalThis.Record<string, unknown>[] = [];
      let username = 'guest';
      let user: globalThis.Record<string, unknown> = {};
      if (req.isAuthenticated()) {
        roles = req.user!.roles as globalThis.Record<string, unknown>[];
        user = req.user ?? {};
        username = req.user!.username as string;
      } else {
        // assign default role if needed...
        user = { username: username };
        roles = [];
        roles.push(RolesService.getDefUnathenticatedRole(brand) as unknown as globalThis.Record<string, unknown>);
      }
      const recordType = query.recordType;
      const workflowState = query.state;
      const start = query.start;
      const rows = query.rows;
      const packageType = query.packageType;
      const sort = query.sort;
      const filterFieldString = query.filterFields;
      let filterString = query.filter as string | undefined;
      let filterFields: string[] | undefined = undefined;

      if (!_.isEmpty(filterFieldString)) {
        filterFields = filterString!.split(',');
      } else {
        filterString = undefined;
      }

      if (Number(rows) > Number((sails.config.api as unknown as globalThis.Record<string, unknown>).max_requests)) {
        return this.reachedMaxRequestRows(req, res);
      } else {
        // sails.log.debug(`getRecords: ${recordType} ${workflowState} ${start}`);
        // sails.log.debug(`${rows} ${packageType} ${sort}`);
        return this.getRecords(
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
          filterString
        )
          .then(response => {
            this.sendResp(req, res, { data: response });
          })
          .catch(error => {
            this.sendResp(req, res, { errors: [this.asError(error)], displayErrors: [{ detail: error['error'] }] });
          });
      }
    }

    public async getDeletedRecord(req: Sails.Req, res: Sails.Res) {
      const validated = getValidatedApiRequest(req);
      const oid = validated.params.oid as string;
      const brand: BrandingModel = BrandingService.getBrand(req.session.branding!);
      const user = req.user ?? ({} as globalThis.Record<string, unknown>);
      const record = await this.RecordsService.getDeletedRecordMeta(oid, brand);
      if (!record) return this.sendResp(req, res, { status: 404 });
      const roles = Array.isArray(user.roles) ? (user.roles as globalThis.Record<string, unknown>[]) : [];
      if (!this.RecordsService.hasViewAccess(brand, user, roles, record)) {
        return this.sendResp(req, res, { status: 403 });
      }
      const representation = recordRepresentationConcurrency(record);
      return this.sendResp(req, res, {
        data: record.metadata,
        meta: {
          oid,
          lifecycleState: record.lifecycleState,
          lifecycle: record.lifecycle,
          ...representation.metadata,
        },
        headers: representation.headers,
      });
    }

    public async restoreRecord(req: Sails.Req, res: Sails.Res) {
      const validated = getValidatedApiRequest(req);
      const oid = validated.params.oid as string;
      const brand: BrandingModel = BrandingService.getBrand(req.session.branding!);
      const user = req.user ?? ({} as globalThis.Record<string, unknown>);
      if (_.isEmpty(oid)) {
        return this.sendResp(req, res, {
          status: 400,
          displayErrors: [{ detail: 'Missing ID of record.' }],
        });
      }

      const saveRequest = this.mutationSaveContext(req, oid, 'restore');
      if (!saveRequest.valid) return this.sendConcurrencyRequestFailure(req, res, saveRequest);

      if (!(await this.requireDeletedRecordInBrand(oid, brand, user))) {
        return this.sendResp(req, res, { status: 404 });
      }

      const response = await this.RecordsService.restoreRecord(oid, user, brand, saveRequest.context);
      return this.sendLifecycleResult(req, res, brand, oid, response, `Restore attempt failed for OID: ${oid}`);
    }

    public async deleteRecord(req: Sails.Req, res: Sails.Res) {
      const validated = getValidatedApiRequest(req);
      const oid = validated.params.oid as string;
      const permanentlyDelete = validated.query.permanent === 'true';
      const brand: BrandingModel = BrandingService.getBrand(req.session.branding!);
      const user = req.user ?? ({} as globalThis.Record<string, unknown>);
      if (_.isEmpty(oid)) {
        return this.sendResp(req, res, {
          status: 400,
          displayErrors: [{ detail: 'Missing ID of record.' }],
        });
      }
      if (_.isEmpty(brand)) {
        return this.sendResp(req, res, {
          status: 400,
          displayErrors: [{ detail: 'Missing brand.' }],
        });
      }
      const saveRequest = this.mutationSaveContext(req, oid, permanentlyDelete ? 'purge' : 'delete');
      if (!saveRequest.valid) return this.sendConcurrencyRequestFailure(req, res, saveRequest);
      const record = await this.requireRecordInBrand(oid, brand);
      if (!record) {
        return this.sendResp(req, res, {
          status: 404,
          displayErrors: [{ detail: 'Record not found!' }],
        });
      }
      const recordType = await firstValueFrom(RecordTypesService.get(brand, record.metaMetadata.type));
      const response = await this.RecordsService.delete(
        oid,
        permanentlyDelete,
        record,
        recordType,
        user,
        saveRequest.context
      );
      return this.sendLifecycleResult(req, res, brand, oid, response, `Delete attempt failed for OID: ${oid}`);
    }

    public async destroyDeletedRecord(req: Sails.Req, res: Sails.Res) {
      const validated = getValidatedApiRequest(req);
      const oid = validated.params.oid as string;
      const brand: BrandingModel = BrandingService.getBrand(req.session.branding!);
      const user = req.user ?? ({} as globalThis.Record<string, unknown>);
      if (_.isEmpty(oid)) {
        return this.sendResp(req, res, {
          status: 400,
          displayErrors: [{ detail: 'Missing ID of record.' }],
        });
      }
      const saveRequest = this.mutationSaveContext(req, oid, 'purge');
      if (!saveRequest.valid) return this.sendConcurrencyRequestFailure(req, res, saveRequest);
      if (!(await this.requireDeletedRecordInBrand(oid, brand, user))) {
        return this.sendResp(req, res, { status: 404 });
      }
      const response = await this.RecordsService.destroyDeletedRecord(oid, user, brand, saveRequest.context);
      return this.sendLifecycleResult(req, res, brand, oid, response, `Destroy attempt failed for OID: ${oid}`);
    }

    public async transitionWorkflow(req: Sails.Req, res: Sails.Res) {
      const validated = getValidatedApiRequest(req);
      const oid = validated.params.oid as string;
      const targetStepName = validated.params.targetStep as string;
      const parsedOperation = parsePublicValidationOperation(validated.query.operation);
      if (!parsedOperation.valid) {
        return this.sendResp(req, res, {
          status: 400,
          displayErrors: [{ code: 'record-validation-operation-invalid' }],
        });
      }
      const validationOperation = parsedOperation.value;
      const saveRequest = this.mutationSaveContext(req, oid, 'transition', validationOperation, targetStepName);
      if (!saveRequest.valid) {
        return this.sendConcurrencyRequestFailure(req, res, saveRequest);
      }
      try {
        if (_.isEmpty(oid)) {
          return this.sendResp(req, res, {
            status: 400,
            displayErrors: [{ detail: 'Missing ID of record.' }],
          });
        }
        const brand: BrandingModel = BrandingService.getBrand(req.session.branding!);
        const record = await this.requireRecordInBrand(oid, brand);
        if (!record) {
          return this.sendResp(req, res, {
            status: 404,
            displayErrors: [{ detail: 'Record not found.' }],
          });
        }
        if (
          !this.RecordsService.hasEditAccess(
            brand,
            req.user ?? {},
            ((req.user ?? {}).roles as globalThis.Record<string, unknown>[]) ?? [],
            record
          )
        ) {
          return this.sendResp(req, res, {
            status: this.getApiVersion(req) === '2.0' ? 403 : 500,
            displayErrors: [{ detail: `User has no edit permissions for :${oid}` }],
          });
        }
        const recType = await firstValueFrom(RecordTypesService.get(brand, record.metaMetadata.type));
        const nextStep = await firstValueFrom(WorkflowStepsService.get(recType, targetStepName));
        const response = await this.RecordsService.updateMeta(
          brand,
          oid,
          record,
          req.user ?? {},
          true,
          true,
          nextStep,
          undefined,
          saveRequest.context
        );
        const isLegacyApi = this.getApiVersion(req) === '1.0';
        if (response.wasPersisted()) {
          return this.sendResp(req, res, {
            data: response,
            ...(isLegacyApi ? { v1: this.legacySaveBody(response) } : { meta: { ...response } }),
            ...recordSaveResultHeaderOption(response),
          });
        }
        // This route historically answered a refused transition with an
        // ordinary v1 200 body. A certified concurrency refusal is the single
        // deliberate exception, and only for a record type that opted in.
        const failureStatus = recordSaveFailureStatus(response);
        const schemaFailureStatus = this.recordSchemaPreconditionFailureStatus(response);
        if (isLegacyApi && !isRecordConflictStatus(failureStatus) && schemaFailureStatus === undefined) {
          return this.sendResp(req, res, {
            data: response,
            v1: this.legacySaveBody(response),
            ...recordSaveResultHeaderOption(response),
          });
        }
        if (!(await this.projectSafeSaveFailure(brand, req.user ?? {}, oid, response))) {
          return this.sendPrivateSaveFailure(req, res);
        }
        if (isLegacyApi) {
          return this.sendResp(req, res, {
            status: schemaFailureStatus ?? failureStatus,
            v1: this.legacySaveBody(response),
            ...recordSaveResultHeaderOption(response),
          });
        }
        return this.sendSaveFailure(req, res, response, 'Workflow transition failed');
      } catch (err) {
        return this.sendResp(req, res, {
          errors: [this.asError(err)],
          displayErrors: [{ detail: `Failed to transition workflow to ${targetStepName} for oid ${oid}.` }],
        });
      }
    }

    public async listDatastreams(req: Sails.Req, res: Sails.Res) {
      const validated = getValidatedApiRequest(req);
      const oid = validated.params.oid as string;
      if (_.isEmpty(oid)) {
        return this.sendResp(req, res, {
          status: 400,
          displayErrors: [{ detail: 'Missing ID of record.' }],
        });
      }
      const brand: BrandingModel = BrandingService.getBrand(req.session.branding!);
      try {
        // Listing a record's attachments discloses record content, so it uses
        // the same current-authorization boundary as the metadata read.
        const record = await this.requireRecordInBrand(oid, brand);
        if (!record) {
          return this.sendResp(req, res, { status: 404 });
        }
        if (!this.hasViewAccess(brand, req.user ?? {}, record)) {
          return this.sendResp(req, res, { status: 403 });
        }
        const attachments = await this.RecordsService.getAttachments(oid, undefined, {
          username: String(req.user?.username ?? '') || undefined,
        });
        const response: ListAPIResponse<unknown> = new ListAPIResponse<unknown>();
        response.summary.numFound = _.size(attachments);
        response.summary.page = 1;
        response.records = attachments;
        return this.sendResp(req, res, { data: response });
      } catch {
        return this.sendResp(req, res, {
          status: 500,
          displayErrors: [{ detail: 'Failed to list attachments.' }],
        });
      }
    }

    public async addRoleEdit(req: Sails.Req, res: Sails.Res) {
      const brand: BrandingModel = BrandingService.getBrand(req.session.branding!);
      const validated = getValidatedApiRequest(req);
      const oid = validated.params.oid as string;
      const saveRequest = this.mutationSaveContext(req, oid, 'update');
      if (!saveRequest.valid) {
        return this.sendConcurrencyRequestFailure(req, res, saveRequest);
      }
      const body = validated.body as globalThis.Record<string, unknown>;
      const roles = body['roles'] as string[] | undefined;

      let record;
      try {
        record = await this.requireRecordInBrand(oid, brand);
        if (!record) return this.sendResp(req, res, { status: 404 });
        if (roles != null && roles.length > 0) {
          record['authorization']['editRoles'] = _.union(record['authorization']['editRoles'], roles);
        }
      } catch (err) {
        return this.sendResp(req, res, {
          errors: [this.asError(err)],
          displayErrors: [{ detail: 'Failed adding an editor role.' }],
        });
      }

      try {
        const result = await this.RecordsService.updateMeta(
          brand,
          oid,
          record,
          req.user ?? {},
          true,
          true,
          {},
          undefined,
          saveRequest.context
        );
        return await this.sendPermissionMutationResult(req, res, brand, oid, result);
      } catch (err) {
        return this.sendResp(req, res, {
          errors: [this.asError(err)],
          displayErrors: [{ detail: 'Failed adding an editor role.' }],
        });
      }
    }

    public async addRoleView(req: Sails.Req, res: Sails.Res) {
      const brand: BrandingModel = BrandingService.getBrand(req.session.branding!);
      const validated = getValidatedApiRequest(req);
      const oid = validated.params.oid as string;
      const saveRequest = this.mutationSaveContext(req, oid, 'update');
      if (!saveRequest.valid) {
        return this.sendConcurrencyRequestFailure(req, res, saveRequest);
      }
      const body = validated.body as globalThis.Record<string, unknown>;
      const roles = body['roles'] as string[] | undefined;

      let record;
      try {
        record = await this.requireRecordInBrand(oid, brand);
        if (!record) return this.sendResp(req, res, { status: 404 });
        if (roles != null && roles.length > 0) {
          record['authorization']['viewRoles'] = _.union(record['authorization']['viewRoles'], roles);
        }
      } catch (err) {
        return this.sendResp(req, res, {
          errors: [this.asError(err)],
          displayErrors: [{ detail: 'Failed getting record meta for adding a viewer role.' }],
        });
      }

      try {
        const result = await this.RecordsService.updateMeta(
          brand,
          oid,
          record,
          req.user ?? {},
          true,
          true,
          {},
          undefined,
          saveRequest.context
        );
        return await this.sendPermissionMutationResult(req, res, brand, oid, result);
      } catch (err) {
        return this.sendResp(req, res, {
          errors: [this.asError(err)],
          displayErrors: [{ detail: 'Failed updating record meta for adding a viewer role.' }],
        });
      }
    }

    public async removeRoleEdit(req: Sails.Req, res: Sails.Res) {
      const brand: BrandingModel = BrandingService.getBrand(req.session.branding!);
      const validated = getValidatedApiRequest(req);
      const oid = validated.params.oid as string;
      const saveRequest = this.mutationSaveContext(req, oid, 'update');
      if (!saveRequest.valid) {
        return this.sendConcurrencyRequestFailure(req, res, saveRequest);
      }
      const body = validated.body as globalThis.Record<string, unknown>;
      const roles = body['roles'] as string[] | undefined;

      let record;
      try {
        record = await this.requireRecordInBrand(oid, brand);
        if (!record) return this.sendResp(req, res, { status: 404 });
        if (roles != null && roles.length > 0) {
          record['authorization']['editRoles'] = _.difference(record['authorization']['editRoles'], roles);
        }
      } catch (err) {
        return this.sendResp(req, res, {
          errors: [this.asError(err)],
          displayErrors: [{ detail: 'Failed getting record meta for removing an editor role.' }],
        });
      }

      try {
        const result = await this.RecordsService.updateMeta(
          brand,
          oid,
          record,
          req.user ?? {},
          true,
          true,
          {},
          undefined,
          saveRequest.context
        );
        return await this.sendPermissionMutationResult(req, res, brand, oid, result);
      } catch (err) {
        return this.sendResp(req, res, {
          errors: [this.asError(err)],
          displayErrors: [{ detail: 'Failed updating record meta for removing an editor role.' }],
        });
      }
    }

    public async removeRoleView(req: Sails.Req, res: Sails.Res) {
      const brand: BrandingModel = BrandingService.getBrand(req.session.branding!);
      const validated = getValidatedApiRequest(req);
      const oid = validated.params.oid as string;
      const saveRequest = this.mutationSaveContext(req, oid, 'update');
      if (!saveRequest.valid) {
        return this.sendConcurrencyRequestFailure(req, res, saveRequest);
      }
      const body = validated.body as globalThis.Record<string, unknown>;
      const users = body['roles'] as string[] | undefined;

      let record;
      try {
        record = await this.requireRecordInBrand(oid, brand);
        if (!record) return this.sendResp(req, res, { status: 404 });
        if (users != null && users.length > 0) {
          record['authorization']['viewRoles'] = _.difference(record['authorization']['viewRoles'], users);
        }
      } catch (err) {
        return this.sendResp(req, res, {
          errors: [this.asError(err)],
          displayErrors: [{ detail: 'Failed getting record meta for removing a viewer role.' }],
        });
      }

      try {
        const result = await this.RecordsService.updateMeta(
          brand,
          oid,
          record,
          req.user ?? {},
          true,
          true,
          {},
          undefined,
          saveRequest.context
        );
        return await this.sendPermissionMutationResult(req, res, brand, oid, result);
      } catch (err) {
        return this.sendResp(req, res, {
          errors: [this.asError(err)],
          displayErrors: [{ detail: 'Failed getting record meta for removing a viewer role.' }],
        });
      }
    }

    public async harvest(req: Sails.Req, res: Sails.Res) {
      const brand: BrandingModel = BrandingService.getBrand(req.session.branding!);

      const validated = getValidatedApiRequest(req);
      const recordType = validated.params.recordType as string;
      const updateMode = _.isEmpty(validated.query.updateMode) ? 'override' : (validated.query.updateMode as string);
      const recordTypeModel: RecordTypeModel = await firstValueFrom(RecordTypesService.get(brand, recordType));

      if (recordTypeModel == null) {
        return this.sendResp(req, res, {
          status: 400,
          displayErrors: [{ detail: 'Record Type provided is not valid' }],
        });
      }
      const user = (req.user ?? {}) as UserModel;
      const body = validated.body as globalThis.Record<string, unknown> | undefined;
      if (body != null) {
        try {
          if (!_.isEmpty(body['sourceRunId'])) {
            if (!_.isEmpty(validated.query.updateMode)) {
              return this.sendResp(req, res, {
                status: 400,
                displayErrors: [{ detail: 'updateMode is not supported for tracked harvest requests.' }],
              });
            }
            const trackedResponse = await HarvestRunService.submitChunk(
              brand,
              recordTypeModel,
              body,
              user,
              this.saveContext(req, 'create')
            );
            return this.sendResp(req, res, { data: trackedResponse });
          }

          const recordResponses = await HarvestRunService.submitCompatibilityRecords(
            brand,
            recordTypeModel,
            body,
            updateMode,
            user,
            this.saveContext(req, 'create')
          );
          return this.sendResp(req, res, { data: recordResponses });
        } catch (error) {
          const err = error as { statusCode?: number; message?: string };
          return this.sendResp(req, res, {
            status: typeof err?.statusCode === 'number' ? err.statusCode : 500,
            errors: [this.asError(error)],
            displayErrors: [{ detail: err?.message ?? 'Failed to process harvest request.' }],
          });
        }
      }
      return this.sendResp(req, res, { status: 400, displayErrors: [{ detail: 'Invalid request' }] });
    }

    public async legacyHarvest(req: Sails.Req, res: Sails.Res) {
      const brand: BrandingModel = BrandingService.getBrand(req.session.branding!);

      const validated = getValidatedApiRequest(req);
      const recordType = validated.params.recordType as string;
      const recordTypeModel: RecordTypeModel = await firstValueFrom(RecordTypesService.get(brand, recordType));

      if (recordTypeModel == null) {
        return this.sendResp(req, res, {
          status: 400,
          displayErrors: [{ detail: 'Record Type provided is not valid' }],
        });
      }
      const user = (req.user ?? {}) as UserModel;
      const body = validated.body as globalThis.Record<string, unknown> | undefined;
      if (body != null) {
        try {
          const recordResponses = await HarvestRunService.submitLegacyRecords(
            brand,
            recordTypeModel,
            body,
            validated.query.merge === true,
            user,
            this.saveContext(req, 'create')
          );
          return this.sendResp(req, res, { data: recordResponses });
        } catch (error) {
          const err = error as { statusCode?: number; message?: string };
          return this.sendResp(req, res, {
            status: typeof err?.statusCode === 'number' ? err.statusCode : 500,
            errors: [this.asError(error)],
            displayErrors: [{ detail: err?.message ?? 'Failed to process legacy harvest request.' }],
          });
        }
      }
      return this.sendResp(req, res, { status: 400, displayErrors: [{ detail: 'Invalid request' }] });
    }

    private async findExistingHarvestRecord(harvestId: string, recordType: string) {
      const results = await (
        global as unknown as globalThis.Record<string, unknown> & {
          Record: {
            find: (criteria: globalThis.Record<string, unknown>) => {
              meta: (opts: globalThis.Record<string, unknown>) => Promise<globalThis.Record<string, unknown>[]>;
            };
          };
        }
      ).Record.find({
        harvestId: harvestId,
        'metaMetadata.type': recordType,
      }).meta({
        enableExperimentalDeepTargets: true,
      });
      return results;
    }

    private async createHarvestRecord(
      brand: BrandingModel,
      recordTypeModel: RecordTypeModel,
      body: globalThis.Record<string, unknown>,
      harvestId: string,
      updateMode: string,
      user: UserModel
    ) {
      let authorizationEdit, authorizationView;
      if (body['authorization'] != null) {
        const auth = body['authorization'] as globalThis.Record<string, unknown>;
        authorizationEdit = auth['edit'];
        authorizationView = auth['view'];
      } else {
        // If no authorization block set to user
        body['authorization'] = [];
        authorizationEdit = [];
        authorizationView = [];
        authorizationEdit.push(user.username);
        authorizationView.push(user.username);
      }

      const metadata = body['metadata'];
      const workflowStage = body['workflowStage'];
      const request: globalThis.Record<string, unknown> = {};
      if (updateMode != 'create') {
        // Only set harvestId if not in create mode
        request['harvestId'] = harvestId;
      }

      //if no metadata field, no authorization
      if (metadata == null) {
        request['metadata'] = body;
      } else {
        request['metadata'] = metadata;
      }

      try {
        const response = await this.RecordsService.create(brand, request, recordTypeModel, user);

        if (workflowStage) {
          const wfStep = await firstValueFrom(WorkflowStepsService.get(recordTypeModel, workflowStage as string));
          this.RecordsService.setWorkflowStepRelatedMetadata(request, wfStep as globalThis.Record<string, unknown>);
        }

        if (response.wasPersisted()) {
          return new APIHarvestResponse(harvestId, response.oid, true, String(response.message ?? response.outcome));
        } else {
          const result = new APIHarvestResponse(harvestId, '', false, `Record creation failed`);
          sails.log.error(result);
          return result;
        }
      } catch (error) {
        const result = new APIHarvestResponse(harvestId, '', false, String(error));
        sails.log.error(error, result);
        return result;
      }
    }

    private isMetadataEqual(
      meta1: globalThis.Record<string, unknown>,
      meta2: globalThis.Record<string, unknown>
    ): boolean {
      const keys = _.keys(meta1);

      for (const key of keys) {
        if (!_.isEqual(meta1?.[key], meta2?.[key])) {
          return false;
        }
      }

      return true;
    }

    public listDeletedRecords(req: Sails.Req, res: Sails.Res) {
      const brand: BrandingModel = BrandingService.getBrand(req.session.branding!);
      const validated = getValidatedApiRequest(req);
      const { query } = validated;
      const editAccessOnly = query.editOnly;

      let roles: globalThis.Record<string, unknown>[] = [];
      let user: globalThis.Record<string, unknown> = {};
      if (req.isAuthenticated()) {
        roles = req.user!.roles as globalThis.Record<string, unknown>[];
        user = req.user ?? {};
      } else {
        // assign default role if needed...
        user = { username: 'guest' };
        roles = [];
        roles.push(RolesService.getDefUnathenticatedRole(brand) as unknown as globalThis.Record<string, unknown>);
      }
      const recordType = query.recordType;
      const workflowState = query.state;
      const start = query.start;
      const rows = query.rows;
      const packageType = query.packageType;
      const sort = query.sort;
      const filterFieldString = query.filterFields;
      let filterString = query.filter as string | undefined;
      let filterFields: string[] | undefined = undefined;

      if (!_.isEmpty(filterFieldString)) {
        filterFields = filterString!.split(',');
      } else {
        filterString = undefined;
      }

      if (Number(rows) > Number((sails.config.api as unknown as globalThis.Record<string, unknown>).max_requests)) {
        return this.reachedMaxRequestRows(req, res);
      } else {
        return this.getDeletedRecords(
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
          filterString
        )
          .then(response => {
            this.sendResp(req, res, { data: response });
          })
          .catch(error => {
            return this.sendResp(req, res, {
              errors: [this.asError(error)],
              displayErrors: [{ detail: error['error'] }],
            });
          });
      }
    }

    private reachedMaxRequestRows(req: Sails.Req, res: Sails.Res) {
      const descr =
        'You have reached the maximum of request available; Max rows per request ' + sails.config.api.max_requests;
      return this.sendResp(req, res, {
        status: 400,
        displayErrors: [
          {
            detail: descr,
            meta: {
              code: 400,
              contactEmail: null,
              description: descr,
              homeRef: '/',
              reasonPhrase: 'Bad Request',
              uri: 'http://www.w3.org/Protocols/rfc2616/rfc2616-sec10.html#sec10.4.1',
            },
          },
        ],
      });
    }
  }
}
