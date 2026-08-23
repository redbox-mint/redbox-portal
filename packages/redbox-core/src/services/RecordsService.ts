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

import { of, from, mergeMap as flatMap, firstValueFrom, throwError } from 'rxjs';
import { concatMap, last, catchError } from 'rxjs/operators';

import { DatastreamService } from '../DatastreamService';
import { Datastream } from '../Datastream';
import { QueueService } from '../QueueService';
import { RecordAuditModel, RecordAuditActionType } from '../model/storage/RecordAuditModel';
import { RecordsService } from '../RecordsService';
import { SearchService } from '../SearchService';
import { Services as services } from '../CoreService';

declare const RedboxJavaStorageService: unknown;
import { StorageService } from '../StorageService';
import { StorageServiceResponse } from '../StorageServiceResponse';
import { RecordAuditParams } from '../RecordAuditParams';
import { RBValidationError } from '../model/RBValidationError';
import { RecordModel } from '../model/storage/RecordModel';
import { RecordTypeModel } from '../model/storage/RecordTypeModel';
import { BrandingModel } from '../model/storage/BrandingModel';

import axios from 'axios';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
const luceneEscapeQueryModule = require('lucene-escape-query') as Record<string, unknown> | ((value: string) => string);
const luceneEscapeQuery: (value: string) => string =
  typeof luceneEscapeQueryModule === 'function'
    ? luceneEscapeQueryModule
    : (((luceneEscapeQueryModule as Record<string, unknown>).escape ||
        (luceneEscapeQueryModule as Record<string, unknown>).default) as (value: string) => string);
import { DateTime } from 'luxon';

import { Readable } from 'node:stream';
import { createHash, randomUUID } from 'node:crypto';
import type { FormAttributes } from '../waterline-models';
import { normalizeRecordRelations } from '../config/recordtype.config';
import type {
  RecordRelationshipExpandOptions,
  RecordRelationshipGraph,
  RecordMetaWithRelationships,
  RecordTypeLookupSummary,
} from '../RecordsService';
import {
  createRecordSaveContext,
  isInternalRecordValidationBypass,
  recordValidationRuntimeFacts,
  recordSaveProblem,
  type InternalRecordValidationBypass,
  type RecordSaveContext,
  RecordSaveResponse,
  resolveStorageMutationState,
} from '../RecordSaveResponse';
import {
  sanitizeRecordSaveIssue,
  type RecordAttachmentCompletionItem,
  type RecordAttachmentOperation,
  type RecordSaveIssue,
  type RecordSavePhase,
  type RecordSaveProblem,
  type RecordSaveProblemKind,
  type StorageMutationApplicationState,
  type ValidationMode,
  compareRecordValidationIdentifiers,
  RECORD_VALIDATION_REFERENCE_PATTERN,
  VALIDATION_OPERATION_NAME_PATTERN,
} from '@researchdatabox/sails-ng-common';
import type { Services as AttachmentMetadataServices } from './AttachmentMetadataService';
import { createActionExecutionOperation, createActionExecutionSupervisor } from '../action-execution/executor';
import {
  projectRecordHookExecutionAuditSummary,
  type DetachedAuditFinalization,
  type RecordHookExecutionAuditSummary,
} from '../action-execution/audit';
import type { ActionExecutionDependencies, ActionExecutionOperation } from '../action-execution/types';
import {
  RecordHookCoordinator,
  validateRecordHookConfiguration,
  type RecordHookPostSyncResult,
} from './record-hooks/coordinator';
import { classifyRecordWrite, recordWriteRequiresFormValidation } from '../RecordWriteClassification';
import {
  RECORD_VALIDATION_DIAGNOSTIC_CODES,
  resolveValidationMode,
  type Services as RecordValidationServices,
  type RecordValidationCandidate,
  type RecordValidationRequest,
  type RecordValidationResult,
  type RecordValidationWriteKind,
} from './RecordValidationService';

/**
 * Detached post hooks remain fire-and-forget to the save caller, but audit
 * persistence gets this bounded opportunity to collect terminal outcomes.
 */
const DETACHED_AUDIT_GRACE_MS = 1000;
const RECORD_VALIDATION_ROLLOUT_AUDIT_OID = 'record-validation-rollout';
const RECORD_VALIDATION_ROLLOUT_AUDIT_SCHEMA_VERSION = 1;
const RECORD_VALIDATION_STRICT_ALL_OPERATION = 'strict-all';

function safeValidationLogReference(value: unknown): string {
  if (typeof value !== 'string') return 'unavailable';
  const normalized = value.trim();
  return RECORD_VALIDATION_REFERENCE_PATTERN.test(normalized) ? normalized : 'unavailable';
}

function safeExceptionType(error: unknown): string {
  if (error instanceof Error && RECORD_VALIDATION_REFERENCE_PATTERN.test(error.name)) return error.name;
  return typeof error;
}

type AuditedValidationMode = ValidationMode | 'malformed';

interface RecordValidationRolloutLayerSnapshot {
  readonly mode?: AuditedValidationMode;
  readonly operations: readonly {
    readonly operation: string;
    readonly mode: AuditedValidationMode;
  }[];
  readonly malformedOperationCount: number;
}

interface RecordValidationRolloutSnapshot {
  readonly schemaVersion: typeof RECORD_VALIDATION_ROLLOUT_AUDIT_SCHEMA_VERSION;
  readonly global: RecordValidationRolloutLayerSnapshot & { readonly mode: AuditedValidationMode };
  readonly recordTypes: readonly {
    readonly recordType: string;
    readonly rollout: RecordValidationRolloutLayerSnapshot;
  }[];
  readonly malformedRecordTypeCount: number;
}

// Save codes are an internal RecordsService-to-RecordSaveResponse mapping, not
// a supported package export. Public clients consume the resulting issue code.
const RECORD_VALIDATION_SAVE_CODES = {
  failed: 'record-validation-failed',
  formResolution: 'record-validation-form-resolution-failed',
  configuration: 'record-validation-configuration-failed',
  timeout: 'record-validation-timeout',
  operationInvalid: 'record-validation-operation-invalid',
  operationUnauthorized: 'record-validation-operation-unauthorized',
  transitionUnauthorized: 'record-validation-transition-unauthorized',
  editUnauthorized: 'record-validation-edit-unauthorized',
  snapshotUnavailable: 'record-validation-snapshot-unavailable',
  authorityDivergence: 'record-validation-authority-context-divergence',
  postSync: 'record-validation-post-sync-failed',
  bypassInvalid: 'record-validation-bypass-invalid',
  bypassForbidden: 'record-validation-bypass-forbidden',
  bypassAuditFailed: 'record-validation-bypass-audit-failed',
  batchBypassAuditFailed: 'record-validation-batch-bypass-audit-failed',
} as const;

export namespace Services {
  type AnyRecord = Record<string, unknown>;
  type RecordTypeLike = Partial<RecordTypeModel> & AnyRecord;
  type WorkflowStepLike = {
    readonly name?: string;
    readonly config?: AnyRecord;
  } & AnyRecord;
  type WorkflowTargetDiagnosticCode =
    | typeof RECORD_VALIDATION_DIAGNOSTIC_CODES.workflowStepReferenceMalformed
    | typeof RECORD_VALIDATION_DIAGNOSTIC_CODES.workflowStepNotFound
    | typeof RECORD_VALIDATION_DIAGNOSTIC_CODES.workflowStepFormMissing
    | typeof RECORD_VALIDATION_DIAGNOSTIC_CODES.formReferenceMalformed;
  type ParsedWorkflowTarget =
    | { readonly ok: true; readonly name?: string }
    | { readonly ok: false; readonly diagnosticCode: WorkflowTargetDiagnosticCode };
  type RecordValidationResolver = Pick<RecordValidationServices.RecordValidation, 'resolve'>;
  type BootstrapRecordMetadata = Record<string, unknown>;
  type RecordWithMeta = AnyRecord & {
    metaMetadata?: AnyRecord;
    metadata?: AnyRecord;
    authorization?: AnyRecord;
  };
  type AttachmentMutationPlanItem = {
    field: string;
    attachmentId: string;
    fileId: string;
    operation: RecordAttachmentOperation;
    entry: AnyRecord;
    generation: string;
  };
  type AttachmentJournalService = AttachmentMetadataServices.AttachmentMetadataService;
  type ValidationBoundaryResult =
    | {
        readonly allowed: true;
        readonly candidate: RecordWithMeta;
        readonly warnings: readonly RecordSaveProblem[];
      }
    | { readonly allowed: false; readonly problem: RecordSaveProblem };
  type ValidateCandidateOptions = {
    readonly candidate: AnyRecord;
    readonly original?: AnyRecord;
    readonly user: AnyRecord;
    readonly context: RecordSaveContext;
    readonly writeKind: RecordValidationWriteKind;
    readonly recordType?: RecordTypeLike | null;
    readonly targetStep?: WorkflowStepLike;
    readonly authoritativeStep?: WorkflowStepLike;
    readonly requiresTransitionAuthorization?: boolean;
    readonly evaluateFormValidators?: boolean;
    readonly phase?: Extract<RecordSavePhase, 'pre-save' | 'post-save'>;
    readonly brand: BrandingModel;
  };
  type PersistPostSyncCandidateOptions = Omit<ValidateCandidateOptions, 'candidate' | 'original' | 'phase'> & {
    readonly brand: BrandingModel;
    readonly oid: string;
    readonly beforeCandidate: AnyRecord;
    readonly candidate: AnyRecord;
  };
  type PostSyncPersistenceResult =
    | {
        readonly status: StorageMutationApplicationState;
        readonly candidate: RecordWithMeta;
        readonly warnings: readonly RecordSaveProblem[];
      }
    | { readonly status: 'validation-failed'; readonly problem: RecordSaveProblem };
  type RunPostSaveSyncOptions = {
    readonly oid: string | null;
    readonly record: AnyRecord;
    readonly recordType: RecordTypeLike | null;
    readonly mode: ActionExecutionOperation['mode'];
    readonly user: AnyRecord;
    readonly response: AnyRecord;
    readonly operation?: ActionExecutionOperation;
  };
  type CreateBatchAuditContext = {
    readonly recordType?: string;
    readonly candidateCount?: number;
    readonly argumentContract: 'typed-three-argument' | 'legacy-records-only' | 'unrecognized';
  };
  const DEFAULT_BOOTSTRAP_DATA_PATH = 'bootstrap-data';
  /**
   * Provides the core record lifecycle, persistence, authorization, and relationship operations.
   *
   * Author: <a href='https://github.com/shilob' target='_blank'>Shilo Banihit</a>
   *
   * @extensionPoint Register a subclass as `RecordsService` from a hook to replace or extend record behaviour while preserving the exported-method contract.
   * @remarks This service depends on Waterline models and storage services after Sails bootstrap; avoid performing Sails-dependent work in the constructor.
   * @see https://github.com/redbox-mint/redbox-portal/wiki/Services-Architecture
   */
  export class Records extends services.Core.Service implements RecordsService {
    storageService!: StorageService;
    datastreamService!: DatastreamService;

    searchService!: SearchService;
    protected queueService!: QueueService;
    private readonly configuredHookFunctions = new WeakMap<
      object,
      { expression: string; fn: (...args: unknown[]) => unknown }
    >();
    private readonly saveHookOperations = new WeakMap<RecordSaveResponse, ActionExecutionOperation>();
    private readonly hookExecutionSupervisor = createActionExecutionSupervisor();
    constructor() {
      super();
      this.logHeader = 'RecordsService::';
    }

    private hookExecutionDependencies(): ActionExecutionDependencies {
      return {
        uuid: randomUUID,
        logger: {
          debug: (message, fields) => sails.log.debug(`${this.logHeader}${message}`, fields),
          info: (message, fields) => sails.log.info(`${this.logHeader}${message}`, fields),
          warn: (message, fields) => sails.log.warn(`${this.logHeader}${message}`, fields),
          error: (message, fields) => sails.log.error(`${this.logHeader}${message}`, fields),
        },
        supervisor: this.hookExecutionSupervisor,
      };
    }

    private createHookExecutionOperation(
      mode: 'onCreate' | 'onUpdate' | 'onDelete' | 'onTransitionWorkflow',
      requestId?: string,
      recordOid?: string
    ): ActionExecutionOperation {
      return createActionExecutionOperation(mode, requestId, recordOid, this.hookExecutionDependencies());
    }

    private hookCoordinator(
      operation: ActionExecutionOperation,
      enforceAuthoritativeOid = false
    ): RecordHookCoordinator {
      return new RecordHookCoordinator({
        operation,
        dependencies: this.hookExecutionDependencies(),
        resolveHook: (hook, mode, phase) => this.configuredHookFunction(hook, mode, phase),
        ...(enforceAuthoritativeOid && operation.mode !== 'onDelete'
          ? { normalizeRecord: (candidate: AnyRecord) =>
              this.normalizeHookCandidateIdentity(candidate, operation.recordOid) }
          : {}),
      });
    }

    /** Keep the public route identity authoritative between sequential hooks. */
    private normalizeHookCandidateIdentity(candidate: AnyRecord, authoritativeOid?: string): AnyRecord {
      const normalizedCandidate = { ...candidate };
      if (!authoritativeOid) return normalizedCandidate;
      if (!this.normalizeUpdateCandidateIdentity(normalizedCandidate, authoritativeOid)) {
        throw new RBValidationError({
          message: 'A record hook attempted to replace the authoritative public OID.',
          displayErrors: [{
            title: `@record-save-${RECORD_VALIDATION_SAVE_CODES.authorityDivergence}`,
            code: RECORD_VALIDATION_SAVE_CODES.authorityDivergence,
          }],
        });
      }
      return normalizedCandidate;
    }

    /** Emit the save-boundary event without calling it a completed operation. */
    private dispatchHookOperation(operation: ActionExecutionOperation): void {
      const summary = projectRecordHookExecutionAuditSummary(operation);
      const fields: AnyRecord = {
        event: 'record_hook_operation_dispatched',
        execution_id: summary.executionId,
        hook_mode: operation.mode,
        status: 'dispatched',
        duration_ms: summary.durationMs,
        total_actions: summary.totalActions,
      };
      if (summary.requestId) {
        fields.request_id = summary.requestId;
      }
      if ((operation.detachedPending ?? 0) > 0) {
        fields.detached_pending = operation.detachedPending;
      }
      sails.log.info(`${this.logHeader}record_hook_operation_dispatched`, fields);
    }

    /**
     * Emit exactly one final operation summary once audit finalization has
     * been reached. Detached completion remains independently observable in
     * action-level logs after this point.
     */
    private completeHookOperation(
      operation: ActionExecutionOperation,
      partial = false,
      detachedFinalization?: DetachedAuditFinalization
    ): void {
      if (operation.operationCompletedLogged) {
        return;
      }
      operation.operationCompletedLogged = true;
      const summary = projectRecordHookExecutionAuditSummary(operation, { partial, detachedFinalization });
      const fields: AnyRecord = {
        event: 'record_hook_operation_completed',
        execution_id: summary.executionId,
      };
      if (summary.requestId) {
        fields.request_id = summary.requestId;
      }
      fields.hook_mode = operation.mode;
      const hasFailure =
        (summary.counts.failed ?? 0) > 0 ||
        (summary.counts.timed_out ?? 0) > 0 ||
        (summary.counts.interrupted ?? 0) > 0;
      fields.status = summary.partial ? 'partial' : hasFailure ? 'failed' : 'completed';
      if ((operation.detachedPending ?? 0) > 0) {
        fields.detached_pending = operation.detachedPending;
      }
      if (summary.detachedFinalization) {
        fields.detached_finalization = summary.detachedFinalization;
      }
      fields.duration_ms = summary.durationMs;
      fields.total_actions = summary.totalActions;
      sails.log.info(`${this.logHeader}record_hook_operation_completed`, fields);
    }

    private describeError(error: unknown, depth = 0): string {
      if (depth >= 5) {
        return '[cause chain truncated]';
      }
      if (error instanceof Error) {
        const cause = (error as Error & { cause?: unknown }).cause;
        const causeMessage = cause == null ? '' : `; cause=${this.describeError(cause, depth + 1)}`;
        return `${error.name}: ${error.message}${causeMessage}`;
      }
      if (typeof error === 'string') {
        return error;
      }
      try {
        return JSON.stringify(error);
      } catch {
        return String(error);
      }
    }

    private asArray(value: unknown): string[] | undefined {
      if (Array.isArray(value)) {
        return value as string[];
      }
      if (typeof value === 'string') {
        return [value];
      }
      return undefined;
    }

    private normalizeRecord(record: AnyRecord): RecordWithMeta {
      const recordObj = record as RecordWithMeta;
      recordObj.metaMetadata = (recordObj.metaMetadata ?? {}) as AnyRecord;
      recordObj.metadata = (recordObj.metadata ?? {}) as AnyRecord;
      recordObj.authorization = (recordObj.authorization ?? {}) as AnyRecord;

      const authorization = recordObj.authorization as AnyRecord;

      authorization.edit = authorization.edit ?? this.asArray(recordObj.authorization_edit);
      authorization.view = authorization.view ?? this.asArray(recordObj.authorization_view);
      authorization.editRoles = authorization.editRoles ?? this.asArray(recordObj.authorization_editRoles);
      authorization.viewRoles = authorization.viewRoles ?? this.asArray(recordObj.authorization_viewRoles);
      authorization.editPending = authorization.editPending ?? this.asArray(recordObj.authorization_editPending);
      authorization.viewPending = authorization.viewPending ?? this.asArray(recordObj.authorization_viewPending);
      return recordObj;
    }

    private recordObject(value: unknown): AnyRecord {
      return value && typeof value === 'object' && !Array.isArray(value) ? (value as AnyRecord) : {};
    }

    private isUsableRecordSnapshot(value: unknown): value is AnyRecord {
      if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
      const snapshot = value as AnyRecord;
      const isObjectSection = (section: unknown): section is AnyRecord =>
        !!section && typeof section === 'object' && !Array.isArray(section);
      // Classification may skip form validation only when storage supplied the
      // two sections needed to compare the complete business/form candidate.
      return isObjectSection(snapshot.metadata) && isObjectSection(snapshot.metaMetadata);
    }

    /**
     * Build the complete validation view without changing the partial object
     * supplied to hooks and storage. Top-level assignment mirrors Waterline's
     * established update semantics: a supplied section replaces that section.
     */
    private mergeValidationCandidate(original: AnyRecord | undefined, mutation: AnyRecord): RecordWithMeta {
      const candidate = _.cloneDeep(original ?? {}) as AnyRecord;
      for (const [key, value] of Object.entries(mutation)) {
        candidate[key] = _.cloneDeep(value);
      }
      return this.normalizeRecord(candidate);
    }

    private cloneValidationCandidate(candidate: RecordValidationCandidate | AnyRecord): RecordWithMeta {
      return this.normalizeRecord({ ..._.cloneDeep(candidate) });
    }

    /** Bind only the public record identity to the route OID. Storage IDs are independent. */
    private normalizeUpdateCandidateIdentity(candidate: AnyRecord, oid: string): boolean {
      const expected = oid.trim();
      if (!RECORD_VALIDATION_REFERENCE_PATTERN.test(expected)) return false;
      const suppliedOid = candidate.redboxOid;
      if (
        suppliedOid !== undefined &&
        suppliedOid !== null &&
        suppliedOid !== '' &&
        (typeof suppliedOid !== 'string' || suppliedOid.trim() !== expected)
      ) return false;
      candidate.redboxOid = expected;
      return true;
    }

    /** `redboxOid` alone selects an explicit create OID; storage IDs are generated independently. */
    private normalizeCreateCandidateIdentity(candidate: AnyRecord): string | undefined {
      const suppliedOid = candidate.redboxOid;
      if (suppliedOid !== undefined && (typeof suppliedOid !== 'string' || !suppliedOid.trim())) return undefined;
      const oid = typeof suppliedOid === 'string' && suppliedOid.trim() ? suppliedOid.trim() : randomUUID();
      if (!RECORD_VALIDATION_REFERENCE_PATTERN.test(oid)) return undefined;
      candidate.redboxOid = oid;
      return oid;
    }

    private async updateStorageCandidate(
      brand: BrandingModel,
      oid: string,
      candidate: AnyRecord,
      user: AnyRecord
    ): Promise<StorageServiceResponse> {
      const storageCandidate = _.cloneDeep(candidate) as AnyRecord;
      if (!this.normalizeUpdateCandidateIdentity(storageCandidate, oid)) {
        throw new Error('The storage update candidate identity diverged from the route OID.');
      }
      // Waterline/Mongo primary keys are immutable storage identity, not
      // aliases for the public OID. The Mongo adapter already removes these;
      // doing so at this boundary keeps every storage adapter on the same safe
      // contract while the authoritative in-memory snapshot retains them.
      _.unset(storageCandidate, 'id');
      _.unset(storageCandidate, '_id');
      return await this.storageService.updateMeta(brand, oid, storageCandidate, user);
    }

    private async createStorageCandidate(
      brand: BrandingModel,
      createOid: string,
      candidate: AnyRecord,
      recordType: RecordTypeLike,
      user: AnyRecord
    ): Promise<StorageServiceResponse> {
      const storageCandidate = _.cloneDeep(candidate) as AnyRecord;
      if (!this.normalizeUpdateCandidateIdentity(storageCandidate, createOid)) {
        throw new Error('The storage create candidate identity diverged from the preselected OID.');
      }
      _.unset(storageCandidate, 'id');
      _.unset(storageCandidate, '_id');
      const adapterResponse = await this.storageService.create(brand, storageCandidate, recordType, user);
      return this.routeBoundStorageResponse(adapterResponse, createOid);
    }

    /** Present storage mutation facts to save hooks with the authoritative public OID rebound. */
    private routeBoundStorageResponse(response: StorageServiceResponse, oid: string): StorageServiceResponse {
      return Object.assign(new StorageServiceResponse(), response, { oid });
    }

    private normalizeAuthoritativeCandidateContext(
      candidate: AnyRecord,
      original: AnyRecord | undefined,
      recordType: RecordTypeLike | null | undefined,
      brand: BrandingModel,
      authoritativeStep?: WorkflowStepLike,
      routeOid?: string
    ): boolean {
      if (routeOid !== undefined && !this.normalizeUpdateCandidateIdentity(candidate, routeOid)) return false;
      const candidateMeta = this.recordObject(candidate.metaMetadata);
      const originalMeta = this.recordObject(original?.metaMetadata);
      candidate.metaMetadata = candidateMeta;
      const activeBrandId = String(brand?.id ?? '').trim();
      if (original) {
        const storedBrandId = String(originalMeta.brandId ?? '').trim();
        if (activeBrandId && storedBrandId !== activeBrandId) return false;
      }
      const normalizeReference = (property: 'brandId' | 'type', expectedValue: unknown): boolean => {
        const expected = String(expectedValue ?? '').trim();
        if (!expected) return true;
        const supplied = String(candidateMeta[property] ?? '').trim();
        if (supplied && supplied !== expected) return false;
        candidateMeta[property] = expected;
        return true;
      };
      if (!normalizeReference('brandId', originalMeta.brandId ?? activeBrandId)) return false;
      if (!normalizeReference('type', originalMeta.type ?? recordType?.name)) return false;

      const authoritativeStepName = this.workflowStepName(authoritativeStep);
      const expectedWorkflowStep = authoritativeStepName ?? this.candidateWorkflowStep(original ?? {});
      if (expectedWorkflowStep) {
        const suppliedWorkflowStep = this.candidateWorkflowStep(candidate);
        if (suppliedWorkflowStep && suppliedWorkflowStep !== expectedWorkflowStep) return false;
        const workflow = this.recordObject(candidate.workflow);
        workflow.stage = expectedWorkflowStep;
        candidate.workflow = workflow;
      }

      if (authoritativeStep) {
        const expectedForm = String(_.get(authoritativeStep, 'config.form', '')).trim();
        if (RECORD_VALIDATION_REFERENCE_PATTERN.test(expectedForm)) {
          // Workflow-selected create/transition forms are authoritative. A
          // hook may replace the surrounding object, but the persisted record
          // is normalized back to the exact form that validation will use.
          candidateMeta.form = expectedForm;
        }
      }
      return true;
    }

    private async refreshAttachmentFields(
      record: AnyRecord,
      original: AnyRecord | undefined,
      brand: BrandingModel | null
    ): Promise<void> {
      const recordMeta = this.recordObject(record.metaMetadata);
      record.metaMetadata = recordMeta;
      const originalMeta = this.recordObject(original?.metaMetadata);
      const formName = String(recordMeta.form ?? originalMeta.form ?? '');
      const configuredBrand = recordMeta.brandId ?? originalMeta.brandId ?? brand?.id;
      const brandId = configuredBrand == null ? undefined : String(configuredBrand);
      const form: FormAttributes | null = await firstValueFrom(FormsService.getFormByName(formName, true, brandId));
      recordMeta.attachmentFields = _.get(form, 'configuration.attachmentFields', _.get(form, 'attachmentFields', []));
    }

    /** Resolve on every validation boundary so late service registration is observed. */
    private resolveRecordValidationService(): RecordValidationResolver | undefined {
      const registered = sails.services?.recordvalidationservice as RecordValidationResolver | undefined;
      if (typeof registered?.resolve === 'function') return registered;
      if (typeof RecordValidationService !== 'undefined' && typeof RecordValidationService?.resolve === 'function') {
        return RecordValidationService;
      }
      return undefined;
    }

    private asError(error: unknown): Error {
      return error instanceof Error ? error : new Error(String(error));
    }

    private saveProblem(
      phase: RecordSavePhase,
      kind: RecordSaveProblemKind = 'system',
      code?: string
    ): RecordSaveProblem {
      return recordSaveProblem(kind, phase, code ? `@record-save-${code}` : '@record-save-failed', code);
    }

    private saveProblemFromError(
      error: unknown,
      phase: RecordSavePhase,
      fallbackKind: RecordSaveProblemKind = 'processing',
      fallbackCode = 'save-precondition'
    ): RecordSaveProblem {
      const displayErrors = RBValidationError.isRBValidationError(error)
        ? (error as RBValidationError).displayErrors
        : [];
      const displayError = displayErrors[0] as
        | (Record<string, unknown> & {
            source?: { pointer?: unknown };
          })
        | undefined;
      const issue: Partial<RecordSaveIssue> = {};
      const field = displayError?.field;
      const pointer = displayError?.source?.pointer;
      if (typeof field === 'string' && field.trim()) {
        issue.field = field.trim();
      }
      if (typeof pointer === 'string' && pointer.trim()) {
        issue.pointer = pointer.trim();
      }
      const code =
        typeof displayError?.code === 'string' && displayError.code.trim() ? displayError.code.trim() : fallbackCode;
      const detail = typeof displayError?.detail === 'string' ? displayError.detail.trim() : '';
      const title = typeof displayError?.title === 'string' ? displayError.title.trim() : '';
      // Save responses are rendered by multiple clients. Only expose
      // translation codes; arbitrary validator text belongs in server logs.
      const message = detail.startsWith('@') ? detail : title.startsWith('@') ? title : `@record-save-${code}`;
      return recordSaveProblem(
        RBValidationError.isRBValidationError(error) ? RBValidationError.classify(error) : fallbackKind,
        phase,
        message,
        code,
        issue
      );
    }

    private validationProblem(
      kind: RecordSaveProblemKind,
      phase: RecordSavePhase,
      code: string,
      issues: readonly RecordSaveIssue[] = []
    ): RecordSaveProblem {
      const safeIssues =
        issues.length > 0
          ? issues.map(issue =>
              sanitizeRecordSaveIssue({
                ...issue,
                code,
                message:
                  typeof issue.message === 'string' && issue.message.startsWith('@')
                    ? issue.message
                    : `@record-save-${code}`,
              })
            )
          : [sanitizeRecordSaveIssue({ code, message: `@record-save-${code}` })];
      return { kind, phase, issues: safeIssues };
    }

    private validationFailureProblem(
      result: RecordValidationResult,
      phase: Extract<RecordSavePhase, 'pre-save' | 'post-save'>
    ): RecordSaveProblem {
      const diagnosticCodes = new Set(result.diagnostics.map(diagnostic => diagnostic.code));
      const hasDiagnostic = (codes: readonly string[]): boolean => codes.some(code => diagnosticCodes.has(code));
      const problemKind = (preSaveKind: RecordSaveProblemKind): RecordSaveProblemKind =>
        phase === 'post-save' ? 'system' : preSaveKind;

      if (
        hasDiagnostic([
          RECORD_VALIDATION_DIAGNOSTIC_CODES.operationRoleUnauthorized,
          RECORD_VALIDATION_DIAGNOSTIC_CODES.operationTargetUnauthorized,
        ])
      ) {
        return this.validationProblem(
          problemKind('authorization'),
          phase,
          RECORD_VALIDATION_SAVE_CODES.operationUnauthorized
        );
      }
      if (
        hasDiagnostic([
          RECORD_VALIDATION_DIAGNOSTIC_CODES.operationMalformed,
          RECORD_VALIDATION_DIAGNOSTIC_CODES.operationUnknown,
        ])
      ) {
        return this.validationProblem(problemKind('validation'), phase, RECORD_VALIDATION_SAVE_CODES.operationInvalid);
      }
      if (hasDiagnostic([RECORD_VALIDATION_DIAGNOSTIC_CODES.blockingTimeout])) {
        return this.validationProblem('system', phase, RECORD_VALIDATION_SAVE_CODES.timeout);
      }
      if (
        hasDiagnostic([
          RECORD_VALIDATION_DIAGNOSTIC_CODES.formReferenceMissing,
          RECORD_VALIDATION_DIAGNOSTIC_CODES.formReferenceMalformed,
          RECORD_VALIDATION_DIAGNOSTIC_CODES.formReferenceDivergence,
          RECORD_VALIDATION_DIAGNOSTIC_CODES.formNotFound,
          RECORD_VALIDATION_DIAGNOSTIC_CODES.recordTypeReferenceMissing,
          RECORD_VALIDATION_DIAGNOSTIC_CODES.recordTypeReferenceMalformed,
          RECORD_VALIDATION_DIAGNOSTIC_CODES.recordTypeNotFound,
          RECORD_VALIDATION_DIAGNOSTIC_CODES.brandReferenceMissing,
          RECORD_VALIDATION_DIAGNOSTIC_CODES.brandReferenceMalformed,
          RECORD_VALIDATION_DIAGNOSTIC_CODES.workflowStepReferenceMissing,
          RECORD_VALIDATION_DIAGNOSTIC_CODES.workflowStepReferenceMalformed,
          RECORD_VALIDATION_DIAGNOSTIC_CODES.workflowStepNotFound,
          RECORD_VALIDATION_DIAGNOSTIC_CODES.workflowStepFormMissing,
        ])
      ) {
        return this.validationProblem('system', phase, RECORD_VALIDATION_SAVE_CODES.formResolution);
      }
      if (result.diagnostics.some(diagnostic => diagnostic.severity === 'error')) {
        return this.validationProblem('system', phase, RECORD_VALIDATION_SAVE_CODES.configuration);
      }
      if (result.status === 'resolved' && result.blockingErrors.length > 0) {
        return this.validationProblem(
          problemKind('validation'),
          phase,
          phase === 'post-save' ? RECORD_VALIDATION_SAVE_CODES.postSync : RECORD_VALIDATION_SAVE_CODES.failed,
          result.blockingErrors
        );
      }
      return this.validationProblem('system', phase, RECORD_VALIDATION_SAVE_CODES.configuration);
    }

    private validationAdvisoryProblems(
      result: RecordValidationResult,
      phase: Extract<RecordSavePhase, 'pre-save' | 'post-save'>
    ): readonly RecordSaveProblem[] {
      if (result.status !== 'resolved' || result.advisoryErrors.length === 0) return [];
      return [{
        kind: 'validation',
        phase,
        issues: result.advisoryErrors.map(sanitizeRecordSaveIssue),
      }];
    }

    /**
     * Determine the same rollout layer used by RecordValidationService when
     * that service cannot produce a result. A definite shadow decision keeps
     * the rollout response-neutral; enforce remains fail-closed.
     */
    private fallbackValidationMode(
      recordType: RecordTypeLike | null | undefined,
      validationOperation: string | undefined,
      recordTypeName?: unknown
    ): ValidationMode {
      const configuredName = typeof recordTypeName === 'string' ? recordTypeName.trim() : '';
      const configured = configuredName ? sails.config.recordtype?.[configuredName]?.recordValidation : undefined;
      return resolveValidationMode(
        sails.config.recordValidation,
        recordType?.recordValidation ?? configured,
        validationOperation
      )
        .mode;
    }

    private actorRoles(user: AnyRecord | null | undefined): string[] {
      const roles = Array.isArray(user?.roles) ? user.roles : [];
      const normalizedRoles = new Set<string>();
      for (const role of roles) {
        const name = (typeof role === 'string' ? role : String((role as AnyRecord | null)?.name ?? '')).trim();
        if (name) normalizedRoles.add(name);
      }
      return [...normalizedRoles];
    }

    private hasPublicEditAuthorization(
      context: RecordSaveContext,
      brand: BrandingModel,
      user: AnyRecord,
      record: AnyRecord | undefined
    ): boolean {
      if (context.routeFamily !== 'api' && context.routeFamily !== 'browser') return true;
      const roles = Array.isArray(user.roles) ? user.roles as AnyRecord[] : [];
      return Boolean(record && this.hasEditAccess(brand, user, roles, record));
    }

    public hasTransitionRoleAuthorization(step: unknown, user: AnyRecord | null | undefined): boolean {
      const configured = _.get(step, 'config.authorization.transitionRoles') as unknown;
      if (!Array.isArray(configured) || configured.length === 0) return true;
      const actorRoles = Array.isArray(user?.roles) ? user.roles : [];
      // Compatibility: historically a configured string matched either a
      // string actor role or an actor role object's name. Configured role
      // objects only matched by identity; matching two objects by `.name`
      // would silently broaden transition authorization.
      return configured.some(configuredRole =>
        actorRoles.some(
          actorRole =>
            configuredRole === actorRole ||
            (!!actorRole && typeof actorRole === 'object' && configuredRole === (actorRole as AnyRecord).name)
        )
      );
    }

    private workflowStepName(step: WorkflowStepLike | undefined): string | undefined {
      const value = step?.name ?? _.get(step, 'config.workflow.stage');
      const normalized = String(value ?? '').trim();
      return normalized || undefined;
    }

    private candidateWorkflowStep(record: AnyRecord): string | undefined {
      const normalized = String(_.get(record, 'workflow.stage', '')).trim();
      return normalized || undefined;
    }

    private parseRequestedWorkflowTarget(
      contextTarget: unknown,
      fallbackTarget: unknown,
      required: boolean
    ): ParsedWorkflowTarget {
      const parse = (value: unknown): string | undefined | null => {
        if (value === undefined || value === null) return undefined;
        if (typeof value !== 'string') return null;
        const normalized = value.trim();
        return RECORD_VALIDATION_REFERENCE_PATTERN.test(normalized) ? normalized : null;
      };
      const trustedTarget = parse(contextTarget);
      const suppliedTarget = parse(fallbackTarget);
      if (trustedTarget === null || suppliedTarget === null) {
        return {
          ok: false,
          diagnosticCode: RECORD_VALIDATION_DIAGNOSTIC_CODES.workflowStepReferenceMalformed,
        };
      }
      if (trustedTarget && suppliedTarget && trustedTarget !== suppliedTarget) {
        return {
          ok: false,
          diagnosticCode: RECORD_VALIDATION_DIAGNOSTIC_CODES.workflowStepReferenceMalformed,
        };
      }
      const name = trustedTarget ?? suppliedTarget;
      if (required && !name) {
        return {
          ok: false,
          diagnosticCode: RECORD_VALIDATION_DIAGNOSTIC_CODES.workflowStepReferenceMalformed,
        };
      }
      return { ok: true, ...(name ? { name } : {}) };
    }

    private resolvedWorkflowTargetDiagnostic(
      step: unknown,
      expectedName: string
    ): WorkflowTargetDiagnosticCode | undefined {
      if (!step || typeof step !== 'object' || Array.isArray(step)) {
        return RECORD_VALIDATION_DIAGNOSTIC_CODES.workflowStepNotFound;
      }
      const candidate = step as WorkflowStepLike;
      const stepName = typeof candidate.name === 'string' ? candidate.name.trim() : '';
      if (!RECORD_VALIDATION_REFERENCE_PATTERN.test(stepName) || stepName !== expectedName) {
        return RECORD_VALIDATION_DIAGNOSTIC_CODES.workflowStepNotFound;
      }
      if (!candidate.config || typeof candidate.config !== 'object' || Array.isArray(candidate.config)) {
        return RECORD_VALIDATION_DIAGNOSTIC_CODES.workflowStepReferenceMalformed;
      }
      const form = candidate.config.form;
      if (typeof form !== 'string' || !form.trim()) {
        return RECORD_VALIDATION_DIAGNOSTIC_CODES.workflowStepFormMissing;
      }
      if (!RECORD_VALIDATION_REFERENCE_PATTERN.test(form.trim())) {
        return RECORD_VALIDATION_DIAGNOSTIC_CODES.formReferenceMalformed;
      }
      return undefined;
    }

    private workflowTargetProblem(
      context: RecordSaveContext,
      recordType: RecordTypeLike | null | undefined,
      recordTypeName: unknown,
      diagnosticCode: WorkflowTargetDiagnosticCode
    ): RecordSaveProblem {
      sails.log.warn(`${this.logHeader} requested workflow target rejected`, {
        event: 'record_validation_workflow_target_rejected',
        request_id: context.requestId,
        mode: this.fallbackValidationMode(recordType, context.validationOperation, recordTypeName),
        operation: context.operation ?? 'unavailable',
        record_type: safeValidationLogReference(recordTypeName),
        diagnostic_code: diagnosticCode,
      });
      return this.validationProblem('system', 'pre-save', RECORD_VALIDATION_SAVE_CODES.formResolution);
    }

    private bypassErrorCode(context: RecordSaveContext, bypass: unknown): string | undefined {
      if (context.routeFamily !== 'internal') return RECORD_VALIDATION_SAVE_CODES.bypassForbidden;
      return isInternalRecordValidationBypass(bypass) ? undefined : RECORD_VALIDATION_SAVE_CODES.bypassInvalid;
    }

    private async auditValidationBypass(
      context: RecordSaveContext,
      bypass: InternalRecordValidationBypass,
      candidate: AnyRecord,
      phase: 'pre-save' | 'post-save'
    ): Promise<void> {
      const createAudit = this.storageService?.createRecordAudit;
      if (typeof createAudit !== 'function') {
        throw new Error('Durable record audit storage is unavailable.');
      }
      const metaMetadata = (candidate.metaMetadata ?? {}) as AnyRecord;
      const oid = safeValidationLogReference(candidate.redboxOid);
      const form = safeValidationLogReference(metaMetadata.form);
      const recordType = safeValidationLogReference(metaMetadata.type);
      const brand = safeValidationLogReference(metaMetadata.brandId);
      const validationOperation = context.validationOperation
        ? safeValidationLogReference(context.validationOperation)
        : undefined;
      const safeRecordContext = {
        ...(oid !== 'unavailable' ? { oid } : {}),
        ...(form !== 'unavailable' ? { form } : {}),
        ...(recordType !== 'unavailable' ? { recordType } : {}),
        ...(brand !== 'unavailable' ? { brand } : {}),
      };
      const audit = new RecordAuditModel(
        oid !== 'unavailable' ? oid : `validation-bypass:${context.requestId}`,
        {
          validationBypass: {
            mode: bypass.mode,
            reason: bypass.reason,
            actor: { kind: bypass.actor.kind, id: bypass.actor.id.trim() },
            requestId: context.requestId,
            operation: context.operation,
            ...(validationOperation && validationOperation !== 'unavailable' ? { validationOperation } : {}),
            phase,
            recordContext: safeRecordContext,
          },
        },
        { service: bypass.actor.id.trim() },
        RecordAuditActionType.validationBypassed
      );
      const auditResponse = await createAudit.call(this.storageService, audit);
      if (!this.auditPersistenceSucceeded(auditResponse)) {
        throw new Error('Durable record audit storage rejected the bypass audit.');
      }
      sails.log.warn(`${this.logHeader} record_validation_bypassed`, {
        event: 'record_validation_bypassed',
        request_id: context.requestId,
        service_id: bypass.actor.id.trim(),
        reason: bypass.reason,
        phase,
        ...(oid !== 'unavailable' ? { record_oid: oid } : {}),
        record_type: recordType,
        form,
        validation_operation: validationOperation ?? RECORD_VALIDATION_STRICT_ALL_OPERATION,
      });
    }

    private auditPersistenceSucceeded(response: StorageServiceResponse | null | undefined): boolean {
      if (!response) return false;
      try {
        if (typeof response.isSuccessful === 'function') {
          return response.isSuccessful() === true && response.success !== false;
        }
        return response.success === true;
      } catch {
        return false;
      }
    }

    private auditedValidationMode(value: unknown, fallback?: ValidationMode): AuditedValidationMode | undefined {
      if (value === undefined) return fallback;
      return value === 'shadow' || value === 'enforce' ? value : 'malformed';
    }

    private rolloutLayerSnapshot(value: unknown): RecordValidationRolloutLayerSnapshot;
    private rolloutLayerSnapshot(
      value: unknown,
      fallbackMode: ValidationMode
    ): RecordValidationRolloutLayerSnapshot & { readonly mode: AuditedValidationMode };
    private rolloutLayerSnapshot(
      value: unknown,
      fallbackMode?: ValidationMode
    ): RecordValidationRolloutLayerSnapshot {
      if (!value || typeof value !== 'object' || Array.isArray(value)) {
        const mode = fallbackMode ? (value === undefined ? fallbackMode : 'malformed') : undefined;
        return {
          ...(mode ? { mode } : {}),
          operations: [],
          malformedOperationCount: value === undefined ? 0 : 1,
        };
      }
      const layer = value as AnyRecord;
      const mode = this.auditedValidationMode(layer.mode, fallbackMode);
      const operations: Array<{ operation: string; mode: AuditedValidationMode }> = [];
      let malformedOperationCount = 0;
      if (layer.operations !== undefined) {
        if (!layer.operations || typeof layer.operations !== 'object' || Array.isArray(layer.operations)) {
          malformedOperationCount += 1;
        } else {
          const configuredOperations = layer.operations as AnyRecord;
          for (const operation of Object.keys(configuredOperations).sort(compareRecordValidationIdentifiers)) {
            if (!VALIDATION_OPERATION_NAME_PATTERN.test(operation)) {
              malformedOperationCount += 1;
              continue;
            }
            const override = configuredOperations[operation];
            if (!override || typeof override !== 'object' || Array.isArray(override)) {
              operations.push({ operation, mode: 'malformed' });
              continue;
            }
            const operationMode = this.auditedValidationMode((override as AnyRecord).mode);
            if (operationMode) operations.push({ operation, mode: operationMode });
          }
        }
      }
      return {
        ...(mode ? { mode } : {}),
        operations,
        malformedOperationCount,
      };
    }

    private rolloutSnapshot(recordTypes: readonly unknown[]): RecordValidationRolloutSnapshot {
      const snapshots: Array<{ recordType: string; rollout: RecordValidationRolloutLayerSnapshot }> = [];
      let malformedRecordTypeCount = 0;
      for (const value of recordTypes) {
        if (!value || typeof value !== 'object' || Array.isArray(value)) {
          malformedRecordTypeCount += 1;
          continue;
        }
        const recordType = value as AnyRecord;
        const name = typeof recordType.name === 'string' ? recordType.name.trim() : '';
        if (!RECORD_VALIDATION_REFERENCE_PATTERN.test(name)) {
          malformedRecordTypeCount += 1;
          continue;
        }
        snapshots.push({ recordType: name, rollout: this.rolloutLayerSnapshot(recordType.recordValidation) });
      }
      snapshots.sort((left, right) => compareRecordValidationIdentifiers(left.recordType, right.recordType));
      return {
        schemaVersion: RECORD_VALIDATION_ROLLOUT_AUDIT_SCHEMA_VERSION,
        global: this.rolloutLayerSnapshot(sails.config.recordValidation, 'shadow'),
        recordTypes: snapshots,
        malformedRecordTypeCount,
      };
    }

    private rolloutFingerprint(snapshot: RecordValidationRolloutSnapshot): string {
      return createHash('sha256').update(JSON.stringify(snapshot)).digest('hex');
    }

    private previousRolloutFingerprint(audits: unknown): string | undefined {
      if (!Array.isArray(audits)) return undefined;
      for (let index = audits.length - 1; index >= 0; index -= 1) {
        const audit = audits[index];
        if (!audit || typeof audit !== 'object' || Array.isArray(audit)) continue;
        const record = (audit as AnyRecord).record;
        if (!record || typeof record !== 'object' || Array.isArray(record)) continue;
        const rollout = (record as AnyRecord).recordValidationRollout;
        if (!rollout || typeof rollout !== 'object' || Array.isArray(rollout)) continue;
        const fingerprint = (rollout as AnyRecord).fingerprint;
        if (typeof fingerprint === 'string' && /^[a-f0-9]{64}$/.test(fingerprint)) return fingerprint;
      }
      return undefined;
    }

    /**
     * Persist a payload-free startup audit whenever rollout mode configuration
     * changes. Failure is fatal so enforcement cannot start without its audit.
     *
     * @param recordTypes Bootstrapped record-type configuration to normalize.
     * @returns Whether the fingerprint was unchanged or durably audited.
     */
    public async auditRecordValidationRollout(recordTypes: readonly unknown[]): Promise<{
      status: 'unchanged' | 'audited';
      fingerprint: string;
    }> {
      // Core bootstrap runs before Sails emits `ready`, so the lifecycle hooks
      // registered by init() have not necessarily populated storageService yet.
      // Resolve it synchronously here because rollout auditing is itself a
      // bootstrap operation and must fail closed only when durable storage is
      // genuinely unavailable.
      if (!this.storageService) {
        this.getStorageService(this);
      }
      const snapshot = this.rolloutSnapshot(Array.isArray(recordTypes) ? recordTypes : []);
      const fingerprint = this.rolloutFingerprint(snapshot);
      const createAudit = this.storageService?.createRecordAudit;
      if (typeof createAudit !== 'function') {
        throw new Error('Durable record-validation rollout audit storage is unavailable.');
      }
      const params = new RecordAuditParams();
      params.oid = RECORD_VALIDATION_ROLLOUT_AUDIT_OID;
      const previousFingerprint = this.previousRolloutFingerprint(await this.storageService.getRecordAudit(params));
      if (previousFingerprint === fingerprint) return { status: 'unchanged', fingerprint };

      const audit = new RecordAuditModel(
        RECORD_VALIDATION_ROLLOUT_AUDIT_OID,
        {
          recordValidationRollout: {
            schemaVersion: RECORD_VALIDATION_ROLLOUT_AUDIT_SCHEMA_VERSION,
            fingerprint,
            ...(previousFingerprint ? { previousFingerprint } : {}),
            changeType: previousFingerprint ? 'mode-change' : 'baseline',
            snapshot,
          },
        },
        { service: 'RecordsService.auditRecordValidationRollout' },
        RecordAuditActionType.validationModeChanged
      );
      const response = await createAudit.call(this.storageService, audit);
      if (!this.auditPersistenceSucceeded(response)) {
        throw new Error('Durable record-validation rollout audit was not confirmed.');
      }
      sails.log.warn(`${this.logHeader} record_validation_rollout_changed`, {
        event: 'record_validation_rollout_changed',
        change_type: previousFingerprint ? 'mode-change' : 'baseline',
        fingerprint,
        previous_fingerprint: previousFingerprint ?? 'none',
        record_type_count: snapshot.recordTypes.length,
        malformed_record_type_count: snapshot.malformedRecordTypeCount,
      });
      return { status: 'audited', fingerprint };
    }

    private async validateCandidate(options: ValidateCandidateOptions): Promise<ValidationBoundaryResult> {
      const {
        candidate,
        original,
        user,
        context,
        writeKind,
        recordType,
        targetStep,
        authoritativeStep,
        requiresTransitionAuthorization = false,
        evaluateFormValidators = true,
        phase = 'pre-save',
        brand,
      } = options;
      const candidateToValidate = this.cloneValidationCandidate(candidate);
      const publicRoute = context.routeFamily === 'api' || context.routeFamily === 'browser';
      if (publicRoute && writeKind !== 'create' && !this.isUsableRecordSnapshot(original)) {
        sails.log.warn(`${this.logHeader} public record save snapshot unavailable`, {
          event: 'record_validation_snapshot_unavailable',
          request_id: context.requestId,
          mode: this.fallbackValidationMode(
            recordType,
            context.validationOperation,
            _.get(candidateToValidate, 'metaMetadata.type')
          ),
          write_kind: writeKind,
        });
        return {
          allowed: false,
          problem: this.validationProblem('system', phase, RECORD_VALIDATION_SAVE_CODES.snapshotUnavailable),
        };
      }
      if (!this.normalizeAuthoritativeCandidateContext(
        candidateToValidate,
        original,
        recordType,
        brand,
        authoritativeStep
      )) {
        return {
          allowed: false,
          problem: this.validationProblem('system', phase, RECORD_VALIDATION_SAVE_CODES.authorityDivergence),
        };
      }
      if (!this.hasPublicEditAuthorization(
        context,
        brand,
        user,
        writeKind === 'create' ? candidateToValidate : original
      )) {
        return {
          allowed: false,
          problem: this.validationProblem('authorization', phase, RECORD_VALIDATION_SAVE_CODES.editUnauthorized),
        };
      }
      if (requiresTransitionAuthorization && targetStep && !this.hasTransitionRoleAuthorization(targetStep, user)) {
        return {
          allowed: false,
          problem: this.validationProblem('authorization', phase, RECORD_VALIDATION_SAVE_CODES.transitionUnauthorized),
        };
      }
      const bypass = context.validationBypass;
      if (bypass !== undefined) {
        if (!isInternalRecordValidationBypass(bypass)) {
          const bypassError = this.bypassErrorCode(context, bypass);
          return {
            allowed: false,
            problem: this.validationProblem('system', phase, bypassError ?? RECORD_VALIDATION_SAVE_CODES.bypassInvalid),
          };
        }
        const bypassError = this.bypassErrorCode(context, bypass);
        if (bypassError) {
          return { allowed: false, problem: this.validationProblem('system', phase, bypassError) };
        }
        try {
          await this.auditValidationBypass(context, bypass, candidateToValidate, phase);
          return { allowed: true, candidate: candidateToValidate, warnings: [] };
        } catch (error) {
          sails.log.error(`${this.logHeader} durable validation-bypass audit failed`, {
            event: 'record_validation_bypass_audit_failed',
            request_id: context.requestId,
            record_type: safeValidationLogReference(_.get(candidateToValidate, 'metaMetadata.type')),
            form: safeValidationLogReference(_.get(candidateToValidate, 'metaMetadata.form')),
            validation_operation: safeValidationLogReference(
              context.validationOperation ?? RECORD_VALIDATION_STRICT_ALL_OPERATION
            ),
            phase,
            error_type: safeExceptionType(error),
          });
          return {
            allowed: false,
            problem: this.validationProblem('system', phase, RECORD_VALIDATION_SAVE_CODES.bypassAuditFailed),
          };
        }
      }

      try {
        const recordValidationService = this.resolveRecordValidationService();
        if (!recordValidationService) {
          throw new Error('RecordValidationService is unavailable.');
        }
        const request: RecordValidationRequest = {
          candidate: {
            ..._.cloneDeep(candidateToValidate),
            ...(typeof candidateToValidate.redboxOid === 'string'
              ? { redboxOid: candidateToValidate.redboxOid }
              : {}),
            metadata: (candidateToValidate.metadata ?? {}) as AnyRecord,
            metaMetadata: (candidateToValidate.metaMetadata ?? {}) as AnyRecord,
            ...(candidateToValidate.workflow !== undefined
              ? { workflow: candidateToValidate.workflow as AnyRecord }
              : {}),
            ...(candidateToValidate.previousWorkflow !== undefined
              ? { previousWorkflow: candidateToValidate.previousWorkflow as AnyRecord }
              : {}),
          },
          writeKind,
          validationOperation: context.validationOperation,
          evaluateFormValidators,
          targetStep: this.workflowStepName(targetStep),
          currentStep: original
            ? this.candidateWorkflowStep(original)
            : targetStep
              ? undefined
              : this.candidateWorkflowStep(candidateToValidate),
          actor: {
            authenticated: Boolean(String(user?.username ?? '').trim()),
            roles: this.actorRoles(user),
          },
          requestParameters: context.validationRequestParameters,
          runtimeContext: recordValidationRuntimeFacts(context, writeKind),
          phase,
          requestId: context.requestId,
        };
        const result = await recordValidationService.resolve(request);
        if (!result.shouldBlock) {
          // Resolved results always select their transformed candidate. An
          // unresolved shadow result may omit it only when transformation did
          // not complete, in which case legacy availability behavior retains
          // the already detached authoritative candidate explicitly.
          const selectedCandidate = result.transformedCandidate ?? candidateToValidate;
          const validatedCandidate = this.cloneValidationCandidate(selectedCandidate);
          const expectedOid = String(candidateToValidate.redboxOid ?? '').trim();
          if (expectedOid && !this.normalizeUpdateCandidateIdentity(validatedCandidate, expectedOid)) {
            return {
              allowed: false,
              problem: this.validationProblem('system', phase, RECORD_VALIDATION_SAVE_CODES.authorityDivergence),
            };
          }
          return {
            allowed: true,
            candidate: validatedCandidate,
            warnings: this.validationAdvisoryProblems(result, phase),
          };
        }
        return { allowed: false, problem: this.validationFailureProblem(result, phase) };
      } catch (error) {
        const safeFailureContext = {
          request_id: context.requestId,
          record_type: safeValidationLogReference(_.get(candidateToValidate, 'metaMetadata.type')),
          form: safeValidationLogReference(_.get(candidateToValidate, 'metaMetadata.form')),
          validation_operation: safeValidationLogReference(
            context.validationOperation ?? RECORD_VALIDATION_STRICT_ALL_OPERATION
          ),
          phase,
          error_type: safeExceptionType(error),
        };
        sails.log.error(`${this.logHeader} authoritative record validation failed unexpectedly`, {
          event: 'record_validation_failed_unexpectedly',
          ...safeFailureContext,
        });
        // The core resolver contains post-transformation failures and returns
        // its typed safe candidate. A thrown replacement/unavailable service
        // has not crossed that boundary, so retain the established shadow-mode
        // availability behavior for backward compatibility.
        if (this.fallbackValidationMode(
          recordType,
          context.validationOperation,
          _.get(candidateToValidate, 'metaMetadata.type')
        ) === 'shadow') {
          sails.log.warn(`${this.logHeader} authoritative validation unavailable in shadow mode`, {
            event: 'record_validation_unavailable',
            ...safeFailureContext,
          });
          return { allowed: true, candidate: candidateToValidate, warnings: [] };
        }
        return {
          allowed: false,
          problem: this.validationProblem('system', phase, RECORD_VALIDATION_SAVE_CODES.configuration),
        };
      }
    }

    /** Deprecation logger passed to the storage mutation boundary. */
    private readonly logLegacyMutationResponse = (message: string, details?: Record<string, unknown>): void => {
      sails.log.warn(`${this.logHeader} ${message}`, details);
    };

    /**
     * Structured save log.  Only safe scalars are recorded here; exception
     * objects are logged separately so they never reach a typed issue.
     */
    private logSaveOutcome(result: RecordSaveResponse, phase: RecordSavePhase, error?: unknown): void {
      sails.log.warn(`${this.logHeader} record-save-outcome`, {
        event: 'record-save-outcome',
        operation: result.context.operation,
        routeFamily: result.context.routeFamily,
        requestId: result.requestId,
        oid: result.oid,
        outcome: result.outcome,
        phase,
        problemKind: result.problems[result.problems.length - 1]?.kind,
      });
      if (error !== undefined) {
        sails.log.error(`${this.logHeader} save failure detail (requestId ${result.requestId})`, error);
      }
    }

    private async finishSave(
      tracker: RecordSaveResponse,
      user: AnyRecord,
      action: RecordAuditActionType,
      searchable: boolean
    ): Promise<RecordSaveResponse> {
      const operation = this.saveHookOperations.get(tracker);
      if (operation && (operation.detachedPending ?? 0) > 0) {
        this.dispatchHookOperation(operation);
      }
      const oid = String(tracker.oid ?? '').trim();
      if (!tracker.wasPersisted() || !oid) {
        if (operation) {
          this.completeHookOperation(operation, true);
        }
        return tracker;
      }

      let persistedRecord: AnyRecord;
      try {
        persistedRecord = (await this.getMeta(oid)) as unknown as AnyRecord;
      } catch (error) {
        sails.log.warn(`${this.logHeader} unable to reload committed record before side effects`, error);
        if (operation) {
          this.completeHookOperation(operation, true);
        }
        return tracker;
      }

      if (searchable && this.searchService && typeof this.searchService.index === 'function') {
        void Promise.resolve()
          .then(() => this.searchService.index(oid, persistedRecord))
          .catch((error: unknown) => {
            sails.log.error(`${this.logHeader} index submission failed`, error);
          });
      }
      let auditTimer: ReturnType<typeof setTimeout> | undefined;
      const submitAudit = (detachedFinalization: DetachedAuditFinalization = 'complete'): void => {
        if (operation?.detachedAuditFinalized) {
          return;
        }
        if (operation) {
          operation.detachedAuditFinalized = true;
          operation.onDetachedComplete = undefined;
          if (auditTimer !== undefined) {
            clearTimeout(auditTimer);
            auditTimer = undefined;
          }
          this.completeHookOperation(operation, detachedFinalization === 'grace-expired', detachedFinalization);
        }
        void Promise.resolve()
          .then(() =>
            this.auditRecord(
              oid,
              persistedRecord,
              user,
              action,
              operation
                ? projectRecordHookExecutionAuditSummary(operation, {
                    partial: detachedFinalization === 'grace-expired',
                    detachedFinalization,
                  })
                : undefined
            )
          )
          .catch((error: unknown) => {
            sails.log.error(`${this.logHeader} persistence audit submission failed`, error);
          });
      };
      if (operation && (operation.detachedPending ?? 0) > 0) {
        operation.onDetachedComplete = () => submitAudit('complete');
        auditTimer = setTimeout(() => submitAudit('grace-expired'), DETACHED_AUDIT_GRACE_MS);
        if (operation.detachedAuditFinalized) {
          clearTimeout(auditTimer);
          auditTimer = undefined;
        }
        // A detached action may have completed during the awaited snapshot
        // reload. Do not leave a zero-pending operation waiting on a callback.
        if ((operation.detachedPending ?? 0) === 0) {
          submitAudit('complete');
        }
      } else {
        submitAudit('complete');
      }
      return tracker;
    }

    /**
     * Preserve the safe display code raised by attachment identity validation
     * so an invalid identity is not reported as a duplicate one.
     */
    private attachmentIdentityProblem(error: unknown): RecordSaveProblem {
      const code = RBValidationError.isRBValidationError(error)
        ? (error as RBValidationError).displayErrors[0]?.code
        : undefined;
      return this.saveProblem('pre-save', 'validation', code ?? 'invalid-attachment-id');
    }

    private ensureAttachmentIds(record: AnyRecord, attachmentFields: readonly unknown[]): void {
      const seen = new Set<string>();
      for (const field of attachmentFields) {
        const fieldName = String(field ?? '').trim();
        const entries = _.get(record.metadata, fieldName) as unknown;
        if (!Array.isArray(entries)) {
          continue;
        }
        for (const entry of entries) {
          if (!entry || typeof entry !== 'object') {
            continue;
          }
          const attachment = entry as AnyRecord;
          const existing = String(attachment.attachmentId ?? '').trim();
          if (existing && !/^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/.test(existing)) {
            throw new RBValidationError({
              message: 'Invalid attachment identity',
              displayErrors: [{ code: 'invalid-attachment-id', title: '@record-save-invalid-attachment-id' }],
            });
          }
          const attachmentId = existing || randomUUID();
          if (seen.has(attachmentId)) {
            throw new RBValidationError({
              message: 'Duplicate attachment identity',
              displayErrors: [{ code: 'duplicate-attachment-id', title: '@record-save-duplicate-attachment-id' }],
            });
          }
          seen.add(attachmentId);
          // IDs are reconciliation metadata and do not represent a user edit.
          attachment.attachmentId = attachmentId;
        }
      }
    }

    private attachmentJournalService(): AttachmentJournalService | undefined {
      const service = sails.services?.attachmentmetadataservice as unknown as AttachmentJournalService | undefined;
      if (
        !service ||
        typeof service.prepareMutations !== 'function' ||
        typeof service.findUnresolvedByOid !== 'function'
      ) {
        return undefined;
      }
      return service;
    }

    private attachmentJournalStorageKey(oid: string, attachmentId: string, generation: string, mutationFileId: string): string {
      const mutationKey = createHash('sha256').update(mutationFileId).digest('hex').slice(0, 32);
      return `journal/${oid}/${attachmentId}/${generation}/${mutationKey}`;
    }

    /** Stable identity for legacy attachment rows that predate attachmentId. */
    private legacyAttachmentId(fileId: string): string {
      return `legacy-${createHash('sha256').update(fileId).digest('hex').slice(0, 32)}`;
    }

    private attachmentMutationPlan(
      originalRecord: AnyRecord,
      record: AnyRecord,
      attachmentFields: readonly unknown[],
      generation: string,
      unresolvedRows: readonly AnyRecord[] = []
    ): AttachmentMutationPlanItem[] {
      const plan: AttachmentMutationPlanItem[] = [];
      const planned = new Set<string>();
      const originalMetadata = (originalRecord.metadata ?? {}) as AnyRecord;
      const metadata = (record.metadata ?? {}) as AnyRecord;
      const addPlanItem = (
        field: string,
        entry: AnyRecord,
        operation: RecordAttachmentOperation,
        generationOverride?: string
      ): void => {
        const rawAttachmentId = String(entry.attachmentId ?? '').trim();
        const fileId = String(entry.fileId ?? '').trim();
        const attachmentId =
          rawAttachmentId || (operation === 'delete' && fileId ? this.legacyAttachmentId(fileId) : '');
        if (!attachmentId || !fileId) {
          return;
        }
        // One physical mutation may be represented both by the current
        // pending reference and by an unresolved journal row from an earlier
        // attempt.  De-duplicate by logical attachment/file identity so the
        // next manual save performs one replay, not two uploads/deletes.
        const key = `${attachmentId}:${fileId}`;
        if (planned.has(key)) {
          return;
        }
        planned.add(key);
        const itemGeneration = String(generationOverride ?? generation).trim() || generation;
        plan.push({
          field,
          attachmentId,
          fileId,
          operation,
          entry: { ...entry, attachmentId, fileId, attachmentField: field, operation, generation: itemGeneration },
          generation: itemGeneration,
        });
      };

      // Reconcile durable work first.  Reusing the unresolved row's
      // generation means the retry updates that journal row rather than
      // leaving an older pending row behind on every save.
      for (const row of unresolvedRows) {
        const attachmentId = String(row.attachmentId ?? '').trim();
        const fileId = String(row.mutationFileId ?? row.fileId ?? '').trim();
        const operation = row.operation === 'delete' || row.operation === 'finalize' ? row.operation : 'add';
        const rowGeneration = String(row.generation ?? '').trim() || generation;
        if (
          !attachmentId ||
          !fileId ||
          (row.mutationState !== 'prepared' &&
            row.mutationState !== 'pending' &&
            row.mutationState !== 'incomplete' &&
            row.mutationState !== 'unknown')
        ) {
          continue;
        }
        const fieldName = String(row.attachmentField ?? '').trim();
        const currentEntry = fieldName
          ? (((_.get(metadata, fieldName) as unknown[] | undefined) ?? []).find(
              (entry: unknown) =>
                !!entry && typeof entry === 'object' && String((entry as AnyRecord).attachmentId ?? '') === attachmentId
            ) as AnyRecord | undefined)
          : undefined;
        addPlanItem(fieldName, { ...(currentEntry ?? {}), ...row, attachmentId, fileId }, operation, rowGeneration);
      }

      for (const field of attachmentFields) {
        const fieldName = String(field ?? '').trim();
        if (!fieldName) {
          continue;
        }
        const originalEntries =
          (_.get(originalMetadata, fieldName) as unknown[] | undefined)?.filter(
            (entry): entry is AnyRecord => !!entry && typeof entry === 'object'
          ) ?? [];
        const currentEntries =
          (_.get(metadata, fieldName) as unknown[] | undefined)?.filter(
            (entry): entry is AnyRecord => !!entry && typeof entry === 'object'
          ) ?? [];
        const originalById = new Map(
          originalEntries
            .filter(entry => String(entry.attachmentId ?? '').trim())
            .map(entry => [String(entry.attachmentId).trim(), entry])
        );
        const originalByFileId = new Map(
          originalEntries
            .filter(entry => String(entry.fileId ?? '').trim())
            .map(entry => [String(entry.fileId).trim(), entry])
        );
        const currentById = new Map(
          currentEntries
            .filter(entry => String(entry.attachmentId ?? '').trim())
            .map(entry => [String(entry.attachmentId).trim(), entry])
        );
        const currentByFileId = new Map(
          currentEntries
            .filter(entry => String(entry.fileId ?? '').trim())
            .map(entry => [String(entry.fileId).trim(), entry])
        );

        for (const entry of currentEntries) {
          const attachmentId = String(entry.attachmentId ?? '');
          const fileId = String(entry.fileId ?? '').trim();
          // A legacy record may not have attachmentId yet.  ensureAttachmentIds
          // stamps the current entry before planning, so use fileId as a
          // migration fallback even when the current entry now has a generated
          // identity.  The stable ID still wins when both sides have one.
          const previous = originalById.get(attachmentId) ?? originalByFileId.get(fileId);
          if (!previous || String(previous.fileId ?? '') !== String(entry.fileId ?? '')) {
            addPlanItem(fieldName, entry, entry.pending === true ? 'finalize' : 'add');
          }
        }
        for (const entry of originalEntries) {
          const attachmentId = String(entry.attachmentId ?? '');
          const fileId = String(entry.fileId ?? '').trim();
          const current = currentById.get(attachmentId) ?? (!attachmentId ? currentByFileId.get(fileId) : undefined);
          // Reusing an attachmentId for a replacement file still requires a
          // tombstone for the old physical object.
          if (!current || String(current.fileId ?? '').trim() !== fileId) {
            addPlanItem(fieldName, entry, 'delete');
          }
        }
      }

      return plan;
    }

    private async prepareAttachmentJournal(oid: string, plan: readonly AttachmentMutationPlanItem[]): Promise<void> {
      const journal = this.attachmentJournalService();
      if (!journal || plan.length === 0) {
        return;
      }
      await journal.prepareMutations(
        plan.map(item => ({
          oid,
          fileId: item.fileId,
          storageKey: this.attachmentJournalStorageKey(oid, item.attachmentId, item.generation, item.fileId),
          attachmentId: item.attachmentId,
          operation: item.operation,
          mutationState: 'prepared',
          generation: item.generation,
          attachmentField: item.field || undefined,
        }))
      );
    }

    private async executeAttachmentPlan(
      oid: string,
      plan: readonly AttachmentMutationPlanItem[]
    ): Promise<RecordAttachmentCompletionItem[]> {
      const journal = this.attachmentJournalService();
      const items: RecordAttachmentCompletionItem[] = [];
      for (const item of plan) {
        let journalStateKnown = true;
        if (journal) {
          try {
            journalStateKnown = await journal.markMutation(
              oid,
              item.attachmentId,
              item.generation,
              'pending',
              item.fileId,
            );
          } catch (error) {
            journalStateKnown = false;
            sails.log.error(
              `${this.logHeader} attachment journal pending update failed for ${item.attachmentId}`,
              error
            );
          }
        }
        try {
          const datastream = new Datastream(item.entry);
          if (item.operation === 'delete') {
            await this.datastreamService.removeDatastream(oid, datastream);
          } else {
            await this.datastreamService.addDatastream(oid, datastream);
          }
          if (journal) {
            try {
              journalStateKnown = (await journal.markMutation(
                oid,
                item.attachmentId,
                item.generation,
                'applied',
                item.fileId,
              )) && journalStateKnown;
            } catch (error) {
              journalStateKnown = false;
              sails.log.error(
                `${this.logHeader} attachment journal applied update failed for ${item.attachmentId}`,
                error
              );
            }
          }
          items.push({
            field: item.field,
            attachmentId: item.attachmentId,
            fileId: item.fileId,
            operation: item.operation,
            status: journalStateKnown ? 'completed' : 'unknown',
            ...(journalStateKnown ? {} : { code: 'attachment-journal-failed' }),
          });
        } catch (error) {
          if (journal) {
            try {
              await journal.markMutation(
                oid,
                item.attachmentId,
                item.generation,
                'unknown',
                item.fileId,
              );
            } catch (journalError) {
              sails.log.error(
                `${this.logHeader} attachment journal unknown update failed for ${item.attachmentId}`,
                journalError
              );
            }
          }
          sails.log.error(`${this.logHeader} attachment operation failed for ${item.attachmentId}`, error);
          items.push({
            field: item.field,
            attachmentId: item.attachmentId,
            fileId: item.fileId,
            operation: item.operation,
            status: 'unknown',
            code: 'attachment-operation-unknown',
          });
        }
      }
      return items;
    }

    private async markAttachmentPlanState(
      oid: string,
      plan: readonly AttachmentMutationPlanItem[],
      state: 'incomplete' | 'cancelled',
    ): Promise<void> {
      const journal = this.attachmentJournalService();
      if (!journal) {
        return;
      }
      for (const item of plan) {
        try {
          await journal.markMutation(oid, item.attachmentId, item.generation, state, item.fileId);
        } catch (error) {
          sails.log.error(
            `${this.logHeader} attachment journal ${state} update failed for ${item.attachmentId}`,
            error
          );
        }
      }
    }

    private async finalizeAttachmentPlan(
      tracker: RecordSaveResponse,
      brand: BrandingModel,
      oid: string,
      record: AnyRecord,
      user: AnyRecord,
      attachmentFields: readonly unknown[],
      plan: readonly AttachmentMutationPlanItem[],
    ): Promise<boolean> {
      if (plan.length === 0) return true;
      const items = await this.executeAttachmentPlan(oid, plan);
      tracker.setAttachmentItems(items);
      if (items.some(item => item.status !== 'completed')) {
        tracker.recordPostPersistenceProblem(this.saveProblem('attachments', 'processing', 'attachment-finalization-failed'));
        this.logSaveOutcome(tracker, 'attachments');
        return false;
      }
      try {
        if (!(await this.finalizeAttachmentReferences(brand, oid, record, user, attachmentFields))) {
          await this.markAttachmentPlanState(oid, plan, 'incomplete');
          tracker.setAttachmentItems(this.incompleteAttachmentItems(items, 'attachment-reference-finalization-failed'));
          tracker.recordPostPersistenceProblem(this.saveProblem('attachments', 'processing', 'attachment-reference-finalization-failed'));
          this.logSaveOutcome(tracker, 'attachments');
          return false;
        }
        this.clearPendingAttachmentOids(record.metadata as AnyRecord, attachmentFields);
        return true;
      } catch (error) {
        await this.markAttachmentPlanState(oid, plan, 'incomplete');
        tracker.setAttachmentItems(this.incompleteAttachmentItems(items, 'attachment-reference-finalization-failed'));
        tracker.recordPostPersistenceProblem(this.saveProblem('attachments', 'processing', 'attachment-reference-finalization-failed'));
        this.logSaveOutcome(tracker, 'attachments', error);
        return false;
      }
    }

    private incompleteAttachmentItems(
      items: readonly RecordAttachmentCompletionItem[],
      code: string
    ): RecordAttachmentCompletionItem[] {
      return items.map(item => (item.status === 'unknown' ? { ...item } : { ...item, status: 'incomplete', code }));
    }

    private clearPendingAttachmentOids(record: AnyRecord, attachmentFields: readonly unknown[]): void {
      for (const field of attachmentFields) {
        const fieldName = String(field ?? '').trim();
        const entries = _.get(record.metadata, fieldName) as unknown;
        if (!Array.isArray(entries)) {
          continue;
        }
        for (const entry of entries) {
          if (entry && typeof entry === 'object' && (entry as AnyRecord).pending === true) {
            (entry as AnyRecord).pending = false;
          }
        }
      }
    }

    private markPlannedAttachmentReferencesPending(
      record: AnyRecord,
      plan: readonly AttachmentMutationPlanItem[]
    ): void {
      for (const item of plan) {
        if (item.operation === 'delete' || !item.field) {
          continue;
        }
        const entries = _.get(record.metadata, item.field) as unknown;
        if (!Array.isArray(entries)) {
          continue;
        }
        const entry = entries.find(
          (candidate: unknown) =>
            !!candidate &&
            typeof candidate === 'object' &&
            String((candidate as AnyRecord).attachmentId ?? '') === item.attachmentId
        ) as AnyRecord | undefined;
        if (entry) {
          entry.pending = true;
        }
      }
    }

    private async finalizeAttachmentReferences(
      brand: BrandingModel,
      oid: string,
      record: AnyRecord,
      user: AnyRecord,
      attachmentFields: readonly unknown[]
    ): Promise<boolean> {
      const finalizedRecord = _.cloneDeep(record) as AnyRecord;
      this.clearPendingAttachmentOids(finalizedRecord, attachmentFields);
      const response = await this.updateStorageCandidate(brand, oid, finalizedRecord, user);
      return resolveStorageMutationState(response, this.logLegacyMutationResponse) === 'applied';
    }

    private async persistPostSyncCandidate(
      options: PersistPostSyncCandidateOptions
    ): Promise<PostSyncPersistenceResult> {
      const {
        brand,
        oid,
        beforeCandidate,
        candidate,
        user,
        context,
        writeKind,
        recordType,
        targetStep,
        authoritativeStep,
        requiresTransitionAuthorization,
      } = options;
      // Callers pass a freshly merged postSync candidate. Normalize that exact
      // object so persistence and every subsequently dispatched hook observe
      // the same authoritative record that validation receives.
      let authoritativeCandidate = this.cloneValidationCandidate(candidate);
      if (!this.normalizeAuthoritativeCandidateContext(
        authoritativeCandidate,
        beforeCandidate,
        recordType,
        brand,
        authoritativeStep,
        oid
      )) {
        return {
          status: 'validation-failed',
          problem: this.validationProblem('system', 'post-save', RECORD_VALIDATION_SAVE_CODES.authorityDivergence),
        };
      }
      if (!this.hasPublicEditAuthorization(
        context,
        brand,
        user,
        writeKind === 'create' ? authoritativeCandidate : beforeCandidate
      )) {
        return {
          status: 'validation-failed',
          problem: this.validationProblem('authorization', 'post-save', RECORD_VALIDATION_SAVE_CODES.editUnauthorized),
        };
      }
      if (requiresTransitionAuthorization && targetStep && !this.hasTransitionRoleAuthorization(targetStep, user)) {
        return {
          status: 'validation-failed',
          problem: this.validationProblem(
            'authorization',
            'post-save',
            RECORD_VALIDATION_SAVE_CODES.transitionUnauthorized
          ),
        };
      }
      authoritativeCandidate.redboxOid = oid;
      let warnings: readonly RecordSaveProblem[] = [];
      const classification = classifyRecordWrite(beforeCandidate, authoritativeCandidate);
      const requiresFormValidation = recordWriteRequiresFormValidation(classification);
      if (
        requiresFormValidation ||
        context.validationBypass !== undefined ||
        context.validationOperation !== undefined
      ) {
        const validation = await this.validateCandidate({
          candidate: authoritativeCandidate,
          original: beforeCandidate,
          user,
          context,
          writeKind,
          recordType,
          targetStep,
          authoritativeStep,
          requiresTransitionAuthorization,
          evaluateFormValidators: requiresFormValidation,
          phase: 'post-save',
          brand,
        });
        if (!validation.allowed) return { status: 'validation-failed', problem: validation.problem };
        authoritativeCandidate = validation.candidate;
        warnings = validation.warnings;
      }

      // Persist the same complete, normalized candidate that crossed the
      // post-sync authorization and validation boundary. A partial hook
      // replacement must never be written in place of this candidate.
      const response = await this.updateStorageCandidate(brand, oid, authoritativeCandidate, user);
      return {
        status: resolveStorageMutationState(response, this.logLegacyMutationResponse),
        candidate: authoritativeCandidate,
        warnings,
      };
    }

    private validateHookConfiguration(recordType: unknown, modes: readonly string[]): void {
      try {
        validateRecordHookConfiguration(
          recordType,
          modes,
          (hook, mode, phase) => this.configuredHookFunction(hook, mode, phase)
        );
      } catch (error) {
        if (RBValidationError.isRBValidationError(error)) {
          throw error;
        }
        throw new RBValidationError({
          message: 'Invalid record hook configuration.',
          options: { cause: error },
          displayErrors: [{ title: '@record-save-invalid-hook-configuration', code: 'invalid-hook-configuration' }],
        });
      }
    }

    private configuredHookFunction(hook: unknown, mode: string, phase: string): (...args: unknown[]) => unknown {
      if (!hook || typeof hook !== 'object') {
        throw new RBValidationError({
          message: `Invalid ${phase} hook configuration for ${mode}.`,
          displayErrors: [{ title: '@record-save-invalid-hook-configuration', code: 'invalid-hook-configuration' }],
        });
      }
      const expression = _.get(hook, 'function', null) as unknown;
      if (typeof expression !== 'string' || !(expression as string).trim()) {
        throw new RBValidationError({
          message: `Invalid ${phase} hook configuration for ${mode}.`,
          displayErrors: [{ title: '@record-save-invalid-hook-configuration', code: 'invalid-hook-configuration' }],
        });
      }
      const cached = this.configuredHookFunctions.get(hook);
      if (cached?.expression === expression) {
        return cached.fn;
      }
      let evaluated: unknown;
      try {
        evaluated = eval(expression);
      } catch (error) {
        throw new RBValidationError({
          message: `Unable to load ${phase} hook for ${mode}.`,
          options: { cause: error },
          displayErrors: [{ title: '@record-save-invalid-hook-configuration', code: 'invalid-hook-configuration' }],
        });
      }
      if (typeof evaluated !== 'function') {
        throw new RBValidationError({
          message: `Configured ${phase} hook for ${mode} is not callable.`,
          displayErrors: [{ title: '@record-save-invalid-hook-configuration', code: 'invalid-hook-configuration' }],
        });
      }
      const fn = evaluated as (...args: unknown[]) => unknown;
      this.configuredHookFunctions.set(hook, { expression, fn });
      return fn;
    }

    private getBootstrapDataPath(): string {
      const configuredPath = _.get(sails.config, 'bootstrap.bootstrapDataPath', DEFAULT_BOOTSTRAP_DATA_PATH);
      return path.resolve(String(configuredPath), 'records');
    }

    private getRecordTypeFromFileName(fileName: string): string {
      return path.basename(fileName, path.extname(fileName)).trim();
    }

    private getBootstrapOid(recordType: string, index: number, metadata: BootstrapRecordMetadata): string {
      const inputOid = typeof metadata.redboxOid === 'string' ? metadata.redboxOid.trim() : '';
      if (inputOid) {
        return inputOid;
      }
      const safeRecordType = recordType.replace(/[^a-zA-Z0-9_-]/g, '-');
      return `bootstrap-${safeRecordType}-${index + 1}`;
    }

    public async bootstrapData(): Promise<void> {
      this.getServices();

      const bootstrapPath = this.getBootstrapDataPath();
      let fileNames: string[] = [];

      try {
        const fileEntries = await fs.readdir(bootstrapPath, { withFileTypes: true });
        fileNames = fileEntries
          .filter(entry => entry.isFile() && entry.name.endsWith('.json'))
          .map(entry => entry.name)
          .sort((a, b) => a.localeCompare(b));
      } catch (error) {
        const ioError = error as NodeJS.ErrnoException;
        if (ioError.code === 'ENOENT') {
          sails.log.verbose(`Records bootstrap data path not found: ${bootstrapPath}`);
          return;
        }
        sails.log.error(`Failed to read records bootstrap data path: ${bootstrapPath}`, error);
        return;
      }

      const defaultBrand = BrandingService.getDefault();
      if (!defaultBrand) {
        sails.log.error('Unable to resolve default branding for records bootstrap data');
        return;
      }

      const bootstrapUser = { username: 'bootstrap-data' };
      for (const fileName of fileNames) {
        const recordType = this.getRecordTypeFromFileName(fileName);
        if (!recordType) {
          sails.log.error(`Skipping records bootstrap file with invalid record type name: ${fileName}`);
          continue;
        }
        let recordTypeModel: unknown = null;
        try {
          recordTypeModel = await firstValueFrom(RecordTypesService.get(defaultBrand, recordType));
        } catch (_error) {
          sails.log.warn(`Record type lookup failed for '${recordType}', using bootstrap-safe create path.`);
        }
        if (!recordTypeModel) {
          sails.log.warn(`No configured record type found for '${recordType}', using bootstrap-safe create path.`);
        }

        const filePath = path.join(bootstrapPath, fileName);
        let parsed: unknown;
        try {
          const content = await fs.readFile(filePath, 'utf8');
          parsed = JSON.parse(content);
        } catch (error) {
          sails.log.error(`Failed to read records bootstrap file: ${fileName}`, error);
          continue;
        }

        if (!Array.isArray(parsed)) {
          sails.log.error(`Skipping records bootstrap file with invalid format (expected array): ${fileName}`);
          continue;
        }

        for (let index = 0; index < parsed.length; index++) {
          const metadata = parsed[index] as BootstrapRecordMetadata;
          if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) {
            sails.log.error(`Skipping invalid record metadata entry at index ${index} in ${fileName}`);
            continue;
          }

          const redboxOid = this.getBootstrapOid(recordType, index, metadata);
          const bootstrapSeedId = `${recordType}:${index + 1}`;
          const metadataWithSeed = {
            ...metadata,
            bootstrapSeedId,
          };
          try {
            const existing = await Record.findOne({
              or: [{ redboxOid }, { 'metadata.bootstrapSeedId': bootstrapSeedId }],
            }).meta({ enableExperimentalDeepTargets: true });

            if (existing) {
              sails.log.verbose(`Skipping existing records bootstrap entry: ${redboxOid}`);
              continue;
            }

            const createResponse = await this.create(
              defaultBrand,
              {
                redboxOid,
                metadata: metadataWithSeed,
                metaMetadata: { type: recordType },
              },
              recordTypeModel,
              bootstrapUser,
              true,
              true,
              undefined,
              createRecordSaveContext({
                routeFamily: 'internal',
                operation: 'create',
                validationBypass: {
                  mode: 'bypass',
                  reason: 'trusted-data-migration',
                  actor: { kind: 'service', id: 'RecordsService.bootstrapData' },
                },
              })
            );
            if (createResponse?.isSuccessful?.()) {
              sails.log.verbose(`Created records bootstrap entry: ${redboxOid}`);
            } else {
              sails.log.error(`Failed to create records bootstrap entry: ${redboxOid}`);
            }
          } catch (error) {
            sails.log.error(`Failed to create records bootstrap entry: ${redboxOid}`, error);
          }
        }
      }
    }

    public override init() {
      const that = this;
      this.registerSailsHook(
        'after',
        ['hook:redbox:storage:ready', 'hook:redbox:datastream:ready', 'ready'],
        function () {
          that.getServices(that);
        }
      );
      this.registerSailsHook('on', 'lower', function () {
        that.hookExecutionSupervisor?.interruptAll?.();
      });
    }

    private getServices(ref: Records = this) {
      ref.getDatastreamService(ref);
      ref.searchService = sails.services[sails.config.search.serviceName] as unknown as SearchService;
      ref.queueService = sails.services[sails.config.queue.serviceName] as unknown as QueueService;
      ref.getStorageService(ref);
    }

    getStorageService(ref: Records = this) {
      if (_.isEmpty(sails.config.storage) || _.isEmpty(sails.config.storage.serviceName)) {
        ref.storageService = RedboxJavaStorageService as StorageService;
      } else {
        ref.storageService = sails.services[sails.config.storage.serviceName] as unknown as StorageService;
      }
    }

    getDatastreamService(ref: Records = this) {
      if (_.isEmpty(sails.config.record) || _.isEmpty(sails.config.record.datastreamService)) {
        ref.datastreamService = RedboxJavaStorageService as DatastreamService;
      } else {
        const datastreamServiceName = sails.config.record.datastreamService as string;
        ref.datastreamService = sails.services[datastreamServiceName] as unknown as DatastreamService;
        sails.log.verbose(`${ref.logHeader} Using datastreamService: ${datastreamServiceName}`);
      }
    }

    getSearchService(ref: Records = this) {
      if (_.isEmpty(sails.config.storage) || _.isEmpty(sails.config.search.serviceName)) {
        ref.searchService = SolrSearchService;
      } else {
        ref.searchService = sails.services[sails.config.search.serviceName] as unknown as SearchService;
      }
    }

    protected override _exportedMethods: string[] = [
      'create',
      'updateMeta',
      'getMeta',
      'getRecordAudit',
      'getResolvedPermissionsSummary',
      'hasEditAccess',
      'hasTransitionRoleAuthorization',
      'hasViewAccess',
      'createBatch',
      'provideUserAccessAndRemovePendingAccess',
      'searchFuzzy',
      'getRelatedRecords',
      'getMetaWithRelationships',
      'getRecordTypeSummary',
      'delete',
      'restoreRecord',
      'destroyDeletedRecord',
      'getDeletedRecords',
      'getDeletedRecordMeta',
      'updateNotificationLog',
      'triggerPreSaveTriggers',
      'triggerPostSaveTriggers',
      'triggerPostSaveSyncTriggers',
      'checkRedboxRunning',
      'bootstrapData',
      'auditRecordValidationRollout',
      'getAttachments',
      'appendToRecord',
      'removeFromRecord',
      'getRecords',
      'exportAllPlans',
      'storeRecordAudit',
      'exists',
      'transitionWorkflowStep',
      'setWorkflowStepRelatedMetadata',
      'transitionWorkflowStepMetadata',
      'triggerPreSaveTransitionWorkflowTriggers',
      'triggerPostSaveTransitionWorkflowTriggers',
      // 'updateDataStream',
      'handleUpdateDataStream',
      'init',
    ];

    protected initRecordMetaMetadata(
      brandId: string,
      username: string,
      recordType: unknown,
      metaMetadataWorkflowStep: unknown,
      form: unknown,
      dateCreated: string
    ): unknown {
      const metaMetadata = {};
      const recordTypeObj = recordType as AnyRecord;
      const formObj = (form ?? {}) as AnyRecord;
      if (recordTypeObj.packageType) {
        _.set(metaMetadata, 'packageType', recordTypeObj.packageType);
      }

      if (recordTypeObj.packageName) {
        _.set(metaMetadata, 'packageName', recordTypeObj.packageName);
      }
      _.set(metaMetadata, 'brandId', brandId);
      _.set(metaMetadata, 'createdBy', username);
      _.set(metaMetadata, 'type', recordTypeObj.name);
      _.set(metaMetadata, 'searchCore', recordTypeObj.searchCore);

      if (!_.isEmpty(dateCreated)) {
        _.set(metaMetadata, 'createdOn', dateCreated);
        _.set(metaMetadata, 'lastSaveDate', dateCreated);
      }

      _.set(metaMetadata, 'form', _.get(metaMetadataWorkflowStep, 'config.form'));
      _.set(
        metaMetadata,
        'attachmentFields',
        _.get(formObj, 'configuration.attachmentFields', formObj.attachmentFields ?? [])
      );

      return metaMetadata;
    }

    protected bindPendingAttachmentOids(
      recordMetadata: AnyRecord,
      attachmentFields: unknown[],
      oid: string,
      clearPending = true
    ): void {
      const fieldsToCheck = ['location', 'uploadUrl'];
      _.each(attachmentFields, (attFieldName: unknown) => {
        const attFieldKey = String(attFieldName ?? '');
        _.each(_.get(recordMetadata, attFieldKey) as unknown[], (attFieldEntry: unknown, attFieldIdx: unknown) => {
          if (_.isEmpty(attFieldEntry)) {
            return;
          }
          _.each(fieldsToCheck, (fldName: unknown) => {
            const fldKey = String(fldName ?? '');
            const fldVal = _.get(attFieldEntry as AnyRecord, fldKey);
            if (!_.isEmpty(fldVal)) {
              _.set(
                recordMetadata,
                `${attFieldKey}[${attFieldIdx}].${fldKey}`,
                _.replace(String(fldVal), /pending-oid/g, oid)
              );
            }
          });
          if (clearPending && _.get(attFieldEntry as AnyRecord, 'pending') === true) {
            _.set(recordMetadata, `${attFieldKey}[${attFieldIdx}].pending`, false);
          }
        });
      });
    }

    async create(
      brand: unknown,
      record: AnyRecord,
      recordType: unknown,
      user: AnyRecord = {},
      triggerPreSaveTriggers = true,
      triggerPostSaveTriggers = true,
      targetStep = null,
      context?: RecordSaveContext
    ): Promise<RecordSaveResponse> {
      const tracker = new RecordSaveResponse(createRecordSaveContext({
        ...(context ?? {}),
        operation: context?.operation ?? 'create',
      }));
      const brandObj = brand as BrandingModel;
      const recordTypeObj = recordType as RecordTypeLike;
      let recordObj = this.normalizeRecord(_.cloneDeep(record) as AnyRecord);
      const userObj = this.recordObject(user);
      const configuredRecordTypeName = typeof recordTypeObj?.name === 'string' ? recordTypeObj.name.trim() : '';
      const isPublicRoute = tracker.context.routeFamily === 'api' || tracker.context.routeFamily === 'browser';
      if (isPublicRoute && !RECORD_VALIDATION_REFERENCE_PATTERN.test(configuredRecordTypeName)) {
        tracker.recordPrimaryNotApplied(
          this.validationProblem('system', 'pre-save', RECORD_VALIDATION_SAVE_CODES.formResolution)
        );
        this.logSaveOutcome(tracker, 'pre-save');
        return tracker;
      }
      const recordTypeName = configuredRecordTypeName || String(_.get(recordObj, 'metaMetadata.type', '')).trim();
      const targetWasRequested =
        tracker.context.operation === 'transition' ||
        tracker.context.targetStep !== undefined ||
        (targetStep !== undefined && targetStep !== null);
      const parsedTarget = this.parseRequestedWorkflowTarget(
        tracker.context.targetStep,
        targetStep,
        targetWasRequested
      );
      const hookOperation = this.createHookExecutionOperation(
        'onCreate',
        tracker.context.requestId,
        String(recordObj.redboxOid ?? '').trim() || undefined
      );
      this.saveHookOperations.set(tracker, hookOperation);

      if (!parsedTarget.ok) {
        tracker.recordPrimaryNotApplied(
          this.workflowTargetProblem(
            tracker.context,
            recordTypeObj,
            recordTypeName,
            parsedTarget.diagnosticCode
          )
        );
        this.logSaveOutcome(tracker, 'pre-save');
        return tracker;
      }
      const targetStepName = parsedTarget.name;

      // Bootstrap-safe path when no configured RecordType/workflow exists.
      if (!configuredRecordTypeName) {
        if (targetStepName) {
          tracker.recordPrimaryNotApplied(
            this.workflowTargetProblem(
              tracker.context,
              recordTypeObj,
              recordTypeName,
              RECORD_VALIDATION_DIAGNOSTIC_CODES.workflowStepNotFound
            )
          );
          this.logSaveOutcome(tracker, 'pre-save');
        return tracker;
        }
        if (!this.storageService || typeof this.storageService.create !== 'function') {
          throw new Error('RecordsService storageService is not initialized');
        }
        const meta = (recordObj.metaMetadata ?? {}) as AnyRecord;
        const nowIso = String(DateTime.local().toISO());
        meta.brandId = meta.brandId ?? String(brandObj?.id ?? '');
        meta.type = meta.type ?? recordTypeName;
        meta.createdBy = meta.createdBy ?? String(userObj?.username ?? 'unknown');
        meta.createdOn = meta.createdOn ?? nowIso;
        meta.lastSaveDate = meta.lastSaveDate ?? nowIso;
        recordObj.metaMetadata = meta;

        const authorization = (recordObj.authorization ?? {}) as AnyRecord;
        authorization.view = authorization.view ?? [];
        authorization.edit = authorization.edit ?? [];
        authorization.viewRoles = authorization.viewRoles ?? [];
        authorization.editRoles = authorization.editRoles ?? [];
        recordObj.authorization = authorization;
        recordObj.authorization_view = recordObj.authorization_view ?? authorization.view;
        recordObj.authorization_edit = recordObj.authorization_edit ?? authorization.edit;
        recordObj.authorization_viewRoles = recordObj.authorization_viewRoles ?? authorization.viewRoles;
        recordObj.authorization_editRoles = recordObj.authorization_editRoles ?? authorization.editRoles;

        const createOid = this.normalizeCreateCandidateIdentity(recordObj);
        if (!createOid) {
          tracker.recordPrimaryNotApplied(
            this.validationProblem('system', 'pre-save', RECORD_VALIDATION_SAVE_CODES.authorityDivergence)
          );
          this.logSaveOutcome(tracker, 'pre-save');
        return tracker;
        }
        hookOperation.recordOid = createOid;
        const validation = await this.validateCandidate({
          candidate: recordObj,
          user: userObj,
          context: tracker.context,
          writeKind: 'create',
          recordType: recordTypeObj,
          brand: brandObj,
        });
        if (!validation.allowed) {
          tracker.recordPrimaryNotApplied(validation.problem);
          this.logSaveOutcome(tracker, 'pre-save');
          return tracker;
        }
        for (const warning of validation.warnings) tracker.recordWarning(warning);
        recordObj = validation.candidate;

        let createResponse: StorageServiceResponse;
        try {
          createResponse = await this.createStorageCandidate(brandObj, createOid, recordObj, recordTypeObj, userObj);
        } catch (error) {
          tracker.recordPrimaryUnknown(this.saveProblem('persistence', 'system', 'save-unknown'));
          this.logSaveOutcome(tracker, 'persistence', error);
          return tracker;
        }
        const mutationState = resolveStorageMutationState(createResponse, this.logLegacyMutationResponse);
        if (mutationState === 'applied') {
          tracker.confirmPrimaryPersistence(createOid);
          hookOperation.completedThrough = 'persistence';
          if (
            this.searchService &&
            typeof this.searchService.index === 'function' &&
            recordTypeObj.searchable !== false
          ) {
            void Promise.resolve(this.searchService.index(createOid, recordObj)).catch((error: unknown) => {
              sails.log.error(`${this.logHeader} index submission failed`, error);
            });
          }
          try {
            await this.auditRecord(createOid, recordObj, userObj, RecordAuditActionType.created);
          } catch (error) {
            sails.log.error(`${this.logHeader} persistence audit submission failed`, error);
          }
        } else if (mutationState === 'not-applied') {
          tracker.recordPrimaryNotApplied(this.saveProblem('persistence', 'processing', 'save-not-applied'));
        } else {
          tracker.recordPrimaryUnknown(this.saveProblem('persistence', 'system', 'save-unknown'));
        }
        if (!tracker.wasPersisted()) {
          this.logSaveOutcome(tracker, 'persistence');
        }
        return tracker;
      }

      // Select the public identity before any configured hook can observe or
      // replace the candidate. From here on, hooks may omit redboxOid (it will
      // be rebound), but they cannot redirect this create to another record.
      const createOid = this.normalizeCreateCandidateIdentity(recordObj);
      if (!createOid) {
        tracker.recordPrimaryNotApplied(
          this.validationProblem('system', 'pre-save', RECORD_VALIDATION_SAVE_CODES.authorityDivergence)
        );
        this.logSaveOutcome(tracker, 'pre-save');
        return tracker;
      }
      hookOperation.recordOid = createOid;

      const startingWfStep = (await firstValueFrom(WorkflowStepsService.getFirst(recordTypeObj))) as WorkflowStepLike;
      const wfStep = (
        targetStepName ? await firstValueFrom(WorkflowStepsService.get(recordTypeObj, targetStepName)) : startingWfStep
      ) as WorkflowStepLike;
      if (targetStepName) {
        const targetDiagnostic = this.resolvedWorkflowTargetDiagnostic(wfStep, targetStepName);
        if (targetDiagnostic) {
          tracker.recordPrimaryNotApplied(
            this.workflowTargetProblem(tracker.context, recordTypeObj, recordTypeName, targetDiagnostic)
          );
          this.logSaveOutcome(tracker, 'pre-save');
        return tracker;
        }
      }
      this.transitionWorkflowStepMetadata(recordObj, startingWfStep);
      if (targetStepName) this.transitionWorkflowStepMetadata(recordObj, wfStep);
      const formName = String(_.get(wfStep, 'config.form', ''));

      const form = await FormsService.getForm(brandObj, formName, true, recordTypeObj.name as string, recordObj);

      const username = String(userObj?.username ?? 'unknown');
      const brandId = String(brandObj.id ?? '');
      const metaMetadata = this.initRecordMetaMetadata(
        brandId,
        username,
        recordTypeObj,
        wfStep,
        form,
        String(DateTime.local().toISO())
      );
      _.set(recordObj, 'metaMetadata', metaMetadata);

      if (tracker.context.validationBypass !== undefined && tracker.context.routeFamily !== 'internal') {
        tracker.recordPrimaryNotApplied(
          this.validationProblem('system', 'pre-save', RECORD_VALIDATION_SAVE_CODES.bypassForbidden)
        );
        this.logSaveOutcome(tracker, 'pre-save');
        return tracker;
      }
      if (!this.hasPublicEditAuthorization(tracker.context, brandObj, userObj, recordObj)) {
        tracker.recordPrimaryNotApplied(
          this.validationProblem('authorization', 'pre-save', RECORD_VALIDATION_SAVE_CODES.editUnauthorized)
        );
        this.logSaveOutcome(tracker, 'pre-save');
        return tracker;
      }

      // Validate every configured synchronous hook before a transition hook
      // can execute.  A malformed hook is a pre-save processing failure, not
      // an untyped exception escaping the create path.
      try {
        this.validateHookConfiguration(recordTypeObj, ['onCreate', 'onTransitionWorkflow']);
      } catch (error) {
        tracker.recordPrimaryNotApplied(this.saveProblem('pre-save', 'processing', 'invalid-hook-configuration'));
        this.logSaveOutcome(tracker, 'pre-save', error);
        return tracker;
      }

      if (targetStepName) {
        if (!this.hasTransitionRoleAuthorization(wfStep, userObj)) {
          tracker.recordPrimaryNotApplied(
            this.validationProblem('authorization', 'pre-save', RECORD_VALIDATION_SAVE_CODES.transitionUnauthorized)
          );
          this.logSaveOutcome(tracker, 'pre-save');
          return tracker;
        }
        try {
          recordObj = await this.triggerPreSaveTransitionWorkflowTriggers(
            createOid,
            recordObj,
            recordTypeObj,
            wfStep,
            userObj,
            hookOperation
          );
        } catch (error) {
          tracker.recordPrimaryNotApplied(this.saveProblemFromError(error, 'pre-save'));
          this.logSaveOutcome(tracker, 'pre-save', error);
          return tracker;
        }
        // The transition hook intentionally observes the target workflow. Any
        // workflow metadata it returns is part of the authoritative candidate
        // and is not silently replaced after the hook completes.
        await this.refreshAttachmentFields(recordObj, undefined, brandObj);
      }

      let createResponse: StorageServiceResponse = new StorageServiceResponse();
      // trigger the pre-save
      if (triggerPreSaveTriggers) {
        try {
          recordObj = await this.triggerPreSaveTriggers(
            createOid,
            recordObj,
            recordTypeObj,
            'onCreate',
            userObj,
            hookOperation
          );
          await this.refreshAttachmentFields(recordObj, undefined, brandObj);
        } catch (err) {
          sails.log.error(`${this.logHeader} Failed to run pre-save hooks when onCreate...`);
          sails.log.error(err);
          tracker.recordPrimaryNotApplied(this.saveProblemFromError(err, 'pre-save'));
          this.logSaveOutcome(tracker, 'pre-save', err);
          return tracker;
        }
      }

      if (!this.normalizeAuthoritativeCandidateContext(
        recordObj,
        undefined,
        recordTypeObj,
        brandObj,
        wfStep,
        createOid
      )) {
        tracker.recordPrimaryNotApplied(
          this.validationProblem('system', 'pre-save', RECORD_VALIDATION_SAVE_CODES.authorityDivergence)
        );
        this.logSaveOutcome(tracker, 'pre-save');
        return tracker;
      }
      await this.refreshAttachmentFields(recordObj, undefined, brandObj);

      const validation = await this.validateCandidate({
        candidate: recordObj,
        user: userObj,
        context: tracker.context,
        writeKind: 'create',
        recordType: recordTypeObj,
        targetStep: targetStepName ? wfStep : undefined,
        authoritativeStep: wfStep,
        requiresTransitionAuthorization: Boolean(targetStepName),
        brand: brandObj,
      });
      if (!validation.allowed) {
        tracker.recordPrimaryNotApplied(validation.problem);
        this.logSaveOutcome(tracker, 'pre-save');
        return tracker;
      }
      for (const warning of validation.warnings) tracker.recordWarning(warning);
      recordObj = validation.candidate;

      const createAttachmentFields = (recordObj.metaMetadata?.attachmentFields ?? []) as unknown[];
      try {
        this.ensureAttachmentIds(recordObj, createAttachmentFields);
      } catch (error) {
        tracker.recordPrimaryNotApplied(this.attachmentIdentityProblem(error));
        this.logSaveOutcome(tracker, 'pre-save', error);
        return tracker;
      }

      const createGeneration = tracker.context.requestId;
      const createAttachmentPlan = this.attachmentMutationPlan(
        { metadata: {} },
        recordObj,
        createAttachmentFields,
        createGeneration,
      );
      this.markPlannedAttachmentReferencesPending(recordObj, createAttachmentPlan);
      try {
        await this.prepareAttachmentJournal(createOid, createAttachmentPlan);
      } catch (error) {
        await this.markAttachmentPlanState(createOid, createAttachmentPlan, 'cancelled');
        tracker.recordPrimaryNotApplied(this.saveProblem('pre-save', 'processing', 'attachment-journal-failed'));
        this.logSaveOutcome(tracker, 'pre-save', error);
        return tracker;
      }

      // save the record ...
      sails.log.verbose(`${this.logHeader} create() -> recordObj before save: ${JSON.stringify(recordObj)}`);
      try {
        createResponse = await this.createStorageCandidate(brandObj, createOid, recordObj, recordTypeObj, userObj);
      } catch (error) {
        tracker.recordPrimaryUnknown(this.saveProblem('persistence', 'system', 'save-unknown'));
        this.logSaveOutcome(tracker, 'persistence', error);
        return tracker;
      }
      const primaryMutationState = resolveStorageMutationState(createResponse, this.logLegacyMutationResponse);
      if (primaryMutationState === 'applied') {
        tracker.confirmPrimaryPersistence(createOid, createResponse);
        hookOperation.completedThrough = 'persistence';
        const oid = createOid;
        sails.log.verbose(`RecordsService - create - oid ${oid}`);
        const attachmentFields = (recordObj.metaMetadata?.attachmentFields ?? []) as unknown[];
        if (createAttachmentPlan.length > 0) {
          this.bindPendingAttachmentOids(recordObj.metadata as AnyRecord, attachmentFields, oid, false);
          if (!(await this.finalizeAttachmentPlan(tracker, brandObj, oid, recordObj, userObj, attachmentFields, createAttachmentPlan))) {
            return await this.finishSave(tracker, userObj, RecordAuditActionType.created, recordTypeObj.searchable !== false);
          }
        }

        if (triggerPostSaveTriggers) {
          // post-save sync
          try {
            const beforePostSync = _.cloneDeep(recordObj) as AnyRecord;
            const hookOutcome = await this.runPostSaveSyncTriggers({
              oid,
              record: recordObj,
              recordType: recordTypeObj,
              mode: 'onCreate',
              user: userObj,
              response: createResponse as unknown as AnyRecord,
              operation: hookOperation,
            });
            const postSyncCandidate = this.mergeValidationCandidate(beforePostSync, hookOutcome.record);
            recordObj = postSyncCandidate;
            const hookResponse = hookOutcome.response as unknown as StorageServiceResponse;
            tracker.mergeLegacyHookFields(hookResponse);
            if (this.hookResponseFailed(hookResponse)) {
              tracker.recordPostPersistenceProblem(this.saveProblem('post-save', 'processing', 'post-save-failed'));
              this.logSaveOutcome(tracker, 'post-save');
              return await this.finishSave(
                tracker,
                userObj,
                RecordAuditActionType.created,
                recordTypeObj.searchable !== false
              );
            }
            // The awaited post-sync phase succeeded; later work is detached.
            hookOperation.completedThrough = 'postSync';
            if (this.hasPostSaveSyncHooks(recordTypeObj, 'onCreate')) {
              const hookMutationState = await this.persistPostSyncCandidate({
                brand: brandObj,
                oid,
                beforeCandidate: beforePostSync,
                candidate: postSyncCandidate,
                user: userObj,
                context: tracker.context,
                writeKind: 'create',
                recordType: recordTypeObj,
                targetStep: targetStepName ? wfStep : undefined,
                authoritativeStep: wfStep,
                requiresTransitionAuthorization: Boolean(targetStepName),
              });
              if (hookMutationState.status === 'validation-failed') {
                tracker.recordPostPersistenceProblem(hookMutationState.problem);
                this.logSaveOutcome(tracker, 'post-save');
                return await this.finishSave(
                  tracker,
                  userObj,
                  RecordAuditActionType.created,
                  recordTypeObj.searchable !== false
                );
              }
              for (const warning of hookMutationState.warnings) tracker.recordWarning(warning);
              recordObj = hookMutationState.candidate;
              if (hookMutationState.status !== 'applied') {
                tracker.recordPostPersistenceProblem(this.saveProblem('post-save', 'processing', 'post-save-metadata-failed'));
                this.logSaveOutcome(tracker, 'post-save');
                return await this.finishSave(
                  tracker,
                  userObj,
                  RecordAuditActionType.created,
                  recordTypeObj.searchable !== false
                );
              }
            }
          } catch (err) {
            sails.log.error(
              `${this.logHeader} Exception while running post save sync hooks when creating: ${createResponse['oid']}`
            );
            sails.log.error(JSON.stringify(err));
            tracker.recordPostPersistenceProblem(
              this.saveProblemFromError(
                err,
                'post-save',
                'processing',
                'post-save-failed'
              )
            );
            this.logSaveOutcome(tracker, 'post-save');
            return await this.finishSave(
              tracker,
              userObj,
              RecordAuditActionType.created,
              recordTypeObj.searchable !== false
            );
          }
          // Fire Post-save hooks async ...
          this.triggerPostSaveTriggers(oid, recordObj, recordTypeObj, 'onCreate', userObj, hookOperation);
          hookOperation.completedThrough = 'post-dispatch';

          if (targetStepName) {
            try {
              const beforeTransitionPostSync = _.cloneDeep(recordObj) as AnyRecord;
              const transitionOutcome = await this.runPostSaveSyncTriggers({
                oid,
                record: recordObj,
                recordType: recordTypeObj,
                mode: 'onTransitionWorkflow',
                user: userObj,
                response: createResponse as unknown as AnyRecord,
                operation: hookOperation,
              });
              const transitionCandidate = this.mergeValidationCandidate(
                beforeTransitionPostSync,
                transitionOutcome.record
              );
              recordObj = transitionCandidate;
              const transitionResponse = transitionOutcome.response as unknown as StorageServiceResponse;
              let transitionProblem: RecordSaveProblem | undefined;
              if (!this.hookResponseFailed(transitionResponse)) {
                if (this.hasPostSaveSyncHooks(recordTypeObj, 'onTransitionWorkflow')) {
                  const transitionMutationState = await this.persistPostSyncCandidate({
                    brand: brandObj,
                    oid,
                    beforeCandidate: beforeTransitionPostSync,
                    candidate: transitionCandidate,
                    user: userObj,
                    context: tracker.context,
                    writeKind: 'transition',
                    recordType: recordTypeObj,
                    targetStep: wfStep,
                    authoritativeStep: wfStep,
                    requiresTransitionAuthorization: true,
                  });
                  if (transitionMutationState.status === 'validation-failed') {
                    transitionProblem = transitionMutationState.problem;
                  } else {
                    for (const warning of transitionMutationState.warnings) tracker.recordWarning(warning);
                    recordObj = transitionMutationState.candidate;
                    if (transitionMutationState.status !== 'applied') {
                      transitionProblem = this.saveProblem('post-save', 'processing', 'transition-metadata-failed');
                    }
                  }
                }
              } else {
                transitionProblem = this.saveProblem('post-save', 'processing', 'transition-failed');
              }
              // Preserve the public transition-hook contract: detached post
              // hooks dispatch after postSync even for a soft-failure response.
              // When a secondary write is required, dispatch happens only
              // after that awaited write/validation decision.
              this.triggerPostSaveTriggers(
                oid,
                recordObj,
                recordTypeObj,
                'onTransitionWorkflow',
                userObj,
                hookOperation
              );
              if (transitionProblem) {
                tracker.recordPostPersistenceProblem(transitionProblem);
                this.logSaveOutcome(tracker, 'post-save');
                return await this.finishSave(
                  tracker,
                  userObj,
                  RecordAuditActionType.created,
                  recordTypeObj.searchable !== false
                );
              }
            } catch (tErr) {
              sails.log.error(
                'RecordsService - create - Failed to run post-save hooks when onTransitionWorkflow... or Error updating meta:'
              );
              sails.log.error(tErr);
              tracker.recordPostPersistenceProblem(
                this.saveProblemFromError(
                  tErr,
                  'post-save',
                  'processing',
                  'transition-failed'
                )
              );
              this.logSaveOutcome(tracker, 'post-save');
              return await this.finishSave(
                tracker,
                userObj,
                RecordAuditActionType.created,
                recordTypeObj.searchable !== false
              );
            }
          }
        }
      } else {
        sails.log.error(`${this.logHeader} Failed to create record, storage service response:`);
        sails.log.error(JSON.stringify(createResponse));
        if (primaryMutationState === 'not-applied') {
          await this.markAttachmentPlanState(createOid, createAttachmentPlan, 'cancelled');
          tracker.recordPrimaryNotApplied(this.saveProblem('persistence', 'processing', 'save-not-applied'));
        } else {
          tracker.recordPrimaryUnknown(this.saveProblem('persistence', 'system', 'save-unknown'));
        }
        this.logSaveOutcome(tracker, 'persistence');
      }
      return await this.finishSave(tracker, userObj, RecordAuditActionType.created, recordTypeObj.searchable !== false);
    }

    async updateMeta(
      brand: unknown,
      oid: string,
      record: AnyRecord,
      user: AnyRecord = {},
      triggerPreSaveTriggers: boolean = true,
      triggerPostSaveTriggers: boolean = true,
      nextStep: unknown = {},
      metadata?: AnyRecord,
      context?: RecordSaveContext
    ): Promise<RecordSaveResponse> {
      const transitionRequested =
        context?.operation === 'transition' || (context?.operation === undefined && !_.isEmpty(nextStep));
      const tracker = new RecordSaveResponse(createRecordSaveContext({
        ...(context ?? {}),
        operation: context?.operation ?? (transitionRequested ? 'transition' : 'update'),
      }));
      const hookOperation = this.createHookExecutionOperation(
        transitionRequested ? 'onTransitionWorkflow' : 'onUpdate',
        tracker.context.requestId,
        oid
      );
      this.saveHookOperations.set(tracker, hookOperation);
      const brandObj = brand as BrandingModel;
      const requestedRecord = _.cloneDeep(record) as AnyRecord;
      let originalRecord: AnyRecord | undefined;
      try {
        const loaded = await this.storageService.getMeta(oid);
        if (this.isUsableRecordSnapshot(loaded)) {
          originalRecord = this.normalizeRecord(_.cloneDeep(loaded) as AnyRecord);
        } else {
          sails.log.warn(`${this.logHeader} pre-update snapshot was unusable; validation will be required`);
        }
      } catch (error) {
        sails.log.warn(`${this.logHeader} unable to load pre-update snapshot; validation will be required`, error);
      }
      // Keep the caller/hook mutation object separate until the authoritative
      // candidate has been merged, normalized, and validated.
      let recordObj = this.normalizeRecord(requestedRecord);
      const userObj = this.recordObject(user);
      let nextStepObj = (nextStep ?? {}) as WorkflowStepLike;
      let updateResponse: StorageServiceResponse = new StorageServiceResponse();
      updateResponse.oid = oid;
      if (
        !this.normalizeUpdateCandidateIdentity(recordObj, oid) ||
        (originalRecord !== undefined && !this.normalizeUpdateCandidateIdentity(originalRecord, oid))
      ) {
        tracker.recordPrimaryNotApplied(
          this.validationProblem('system', 'pre-save', RECORD_VALIDATION_SAVE_CODES.authorityDivergence)
        );
        this.logSaveOutcome(tracker, 'pre-save');
        return tracker;
      }
      if (tracker.context.validationBypass !== undefined && tracker.context.routeFamily !== 'internal') {
        tracker.recordPrimaryNotApplied(
          this.validationProblem('system', 'pre-save', RECORD_VALIDATION_SAVE_CODES.bypassForbidden)
        );
        this.logSaveOutcome(tracker, 'pre-save');
        return tracker;
      }
      if (
        (tracker.context.routeFamily === 'api' || tracker.context.routeFamily === 'browser') &&
        !originalRecord
      ) {
        tracker.recordPrimaryNotApplied(
          this.validationProblem('system', 'pre-save', RECORD_VALIDATION_SAVE_CODES.snapshotUnavailable)
        );
        this.logSaveOutcome(tracker, 'pre-save');
        return tracker;
      }
      if (
        (tracker.context.routeFamily === 'api' || tracker.context.routeFamily === 'browser') &&
        (!String(brandObj?.id ?? '').trim() ||
          String(this.recordObject(originalRecord?.metaMetadata).brandId ?? '').trim() !== String(brandObj.id).trim())
      ) {
        tracker.recordPrimaryNotApplied(
          this.validationProblem('system', 'pre-save', RECORD_VALIDATION_SAVE_CODES.authorityDivergence)
        );
        this.logSaveOutcome(tracker, 'pre-save');
        return tracker;
      }
      if (!this.hasPublicEditAuthorization(tracker.context, brandObj, userObj, originalRecord)) {
        tracker.recordPrimaryNotApplied(
          this.validationProblem('authorization', 'pre-save', RECORD_VALIDATION_SAVE_CODES.editUnauthorized)
        );
        this.logSaveOutcome(tracker, 'pre-save');
        return tracker;
      }
      const origRecordObj = this.normalizeRecord(_.cloneDeep(requestedRecord) as AnyRecord);
      sails.log.verbose(`RecordService - updateMeta - origRecord - cloneDeep`);
      //This is done after cloning record to preserve origRecord during processing
      if (metadata !== undefined) {
        recordObj.metadata = _.cloneDeep(metadata);
      }

      const requestedMeta = this.recordObject(recordObj.metaMetadata);
      const originalMeta = this.recordObject(originalRecord?.metaMetadata);
      const storedRecordTypeName = String(originalMeta.type ?? '').trim();
      if (originalRecord && !RECORD_VALIDATION_REFERENCE_PATTERN.test(storedRecordTypeName)) {
        tracker.recordPrimaryNotApplied(
          this.validationProblem('system', 'pre-save', RECORD_VALIDATION_SAVE_CODES.formResolution)
        );
        this.logSaveOutcome(tracker, 'pre-save');
        return tracker;
      }
      const recordTypeName = originalRecord
        ? storedRecordTypeName
        : String(requestedMeta.type ?? '').trim();
      const parsedTarget = this.parseRequestedWorkflowTarget(
        tracker.context.targetStep,
        this.workflowStepName(nextStepObj),
        transitionRequested
      );
      if (!parsedTarget.ok) {
        tracker.recordPrimaryNotApplied(
          this.workflowTargetProblem(tracker.context, undefined, recordTypeName, parsedTarget.diagnosticCode)
        );
        this.logSaveOutcome(tracker, 'pre-save');
        return tracker;
      }
      const requestedTargetName = parsedTarget.name;
      if (transitionRequested) {
        if (!requestedTargetName) {
          tracker.recordPrimaryNotApplied(
            this.workflowTargetProblem(
              tracker.context,
              undefined,
              recordTypeName,
              RECORD_VALIDATION_DIAGNOSTIC_CODES.workflowStepReferenceMalformed
            )
          );
          this.logSaveOutcome(tracker, 'pre-save');
        return tracker;
        }
      }

      // A stored record's brand, type, and current workflow are immutable
      // authority inputs. Reject divergence before candidate-selected hooks or
      // any other side-effecting pre-save work can run.
      if (!this.normalizeAuthoritativeCandidateContext(recordObj, originalRecord, undefined, brandObj, undefined, oid)) {
        tracker.recordPrimaryNotApplied(
          this.validationProblem('system', 'pre-save', RECORD_VALIDATION_SAVE_CODES.authorityDivergence)
        );
        this.logSaveOutcome(tracker, 'pre-save');
        return tracker;
      }

      let recordType: RecordTypeLike | null = null;
      if (recordTypeName) {
        recordType = (await firstValueFrom(RecordTypesService.get(brandObj, recordTypeName))) as RecordTypeLike | null;
      }
      if (transitionRequested && requestedTargetName) {
        try {
          if (!recordType) throw new Error('The authoritative record type is unavailable.');
          nextStepObj = (await firstValueFrom(
            WorkflowStepsService.get(recordType, requestedTargetName)
          )) as WorkflowStepLike;
        } catch {
          nextStepObj = {};
        }
        const targetDiagnostic = this.resolvedWorkflowTargetDiagnostic(nextStepObj, requestedTargetName);
        if (targetDiagnostic) {
          tracker.recordPrimaryNotApplied(
            this.workflowTargetProblem(tracker.context, recordType, recordTypeName, targetDiagnostic)
          );
          this.logSaveOutcome(tracker, 'pre-save');
        return tracker;
        }
      }
      try {
        this.validateHookConfiguration(recordType, ['onUpdate', 'onTransitionWorkflow']);
      } catch (error) {
        tracker.recordPrimaryNotApplied(this.saveProblem('pre-save', 'processing', 'invalid-hook-configuration'));
        this.logSaveOutcome(tracker, 'pre-save', error);
        return tracker;
      }

      if (transitionRequested) {
        if (!this.hasTransitionRoleAuthorization(nextStepObj, userObj)) {
          tracker.recordPrimaryNotApplied(
            this.validationProblem('authorization', 'pre-save', RECORD_VALIDATION_SAVE_CODES.transitionUnauthorized)
          );
          this.logSaveOutcome(tracker, 'pre-save');
          return tracker;
        }

        if (!_.isEmpty(recordType)) {
          try {
            sails.log.verbose(`RecordService - updateMeta - hasPermissionToTransition - enter`);
            sails.log.verbose(
              `RecordService - updateMeta triggerPreSaveTransitionWorkflowTriggers - before - nextStep ${JSON.stringify(nextStepObj)}`
            );
            this.transitionWorkflowStepMetadata(recordObj, nextStepObj);
            await this.refreshAttachmentFields(recordObj, originalRecord, brandObj);
            recordObj = await this.triggerPreSaveTransitionWorkflowTriggers(
              oid,
              recordObj,
              recordType,
              nextStepObj,
              userObj,
              hookOperation
            );
            // The hook sees the target workflow and any workflow metadata it
            // returns remains part of both persistence and validation.
          } catch (err) {
            sails.log.verbose('RecordService - updateMeta - onTransitionWorkflow triggerPreSaveTriggers error');
            sails.log.error(JSON.stringify(err));
            tracker.recordPrimaryNotApplied(this.saveProblemFromError(err, 'pre-save'));
            this.logSaveOutcome(tracker, 'pre-save', err);
            return tracker;
          }
        }
      }

      // Preserve the legacy hook contract: every pre-save hook can inspect
      // attachmentFields for the form that is current at its invocation.
      await this.refreshAttachmentFields(recordObj, originalRecord, brandObj);

      // process pre-save
      if (!_.isEmpty(brand) && triggerPreSaveTriggers === true) {
        try {
          sails.log.verbose('RecordService - updateMeta - calling triggerPreSaveTriggers');
          recordObj = await this.triggerPreSaveTriggers(oid, recordObj, recordType, 'onUpdate', userObj, hookOperation);
          await this.refreshAttachmentFields(recordObj, originalRecord, brandObj);
        } catch (err) {
          sails.log.error(`${this.logHeader} Failed to run pre-save hooks when onUpdate...`);
          sails.log.error(err);
          tracker.recordPrimaryNotApplied(this.saveProblemFromError(err, 'pre-save'));
          this.logSaveOutcome(tracker, 'pre-save', err);
          return tracker;
        }
      }

      const authoritativeStep = transitionRequested ? nextStepObj : undefined;
      if (!this.normalizeAuthoritativeCandidateContext(
        recordObj,
        originalRecord,
        recordType,
        brandObj,
        authoritativeStep,
        oid
      )) {
        tracker.recordPrimaryNotApplied(
          this.validationProblem('system', 'pre-save', RECORD_VALIDATION_SAVE_CODES.authorityDivergence)
        );
        this.logSaveOutcome(tracker, 'pre-save');
        return tracker;
      }
      await this.refreshAttachmentFields(recordObj, originalRecord, brandObj);

      let authoritativeCandidate = this.mergeValidationCandidate(originalRecord, recordObj);
      const classification = originalRecord
        ? classifyRecordWrite(originalRecord, authoritativeCandidate)
        : 'record-metadata';
      const requiresFormValidation = recordWriteRequiresFormValidation(classification);
      if (
        requiresFormValidation ||
        tracker.context.validationBypass !== undefined ||
        tracker.context.validationOperation !== undefined
      ) {
        const validation = await this.validateCandidate({
          candidate: authoritativeCandidate,
          original: originalRecord,
          user: userObj,
          context: tracker.context,
          writeKind: transitionRequested ? 'transition' : 'update',
          recordType,
          targetStep: transitionRequested ? nextStepObj : undefined,
          authoritativeStep,
          requiresTransitionAuthorization: Boolean(authoritativeStep),
          evaluateFormValidators: requiresFormValidation,
          brand: brandObj,
        });
        if (!validation.allowed) {
          tracker.recordPrimaryNotApplied(validation.problem);
          this.logSaveOutcome(tracker, 'pre-save');
          return tracker;
        }
        for (const warning of validation.warnings) tracker.recordWarning(warning);
        authoritativeCandidate = validation.candidate;
      }
      // From this point onward timestamps, attachment preparation, persistence,
      // and post-save hooks all use the exact candidate returned by validation.
      recordObj = authoritativeCandidate;
      const recordMeta = (recordObj.metaMetadata ?? {}) as AnyRecord;
      recordObj.metaMetadata = recordMeta;

      if (!_.isUndefined(userObj) && !_.isEmpty(_.get(userObj, 'username', ''))) {
        recordMeta.lastSavedBy = _.get(userObj, 'username');
      }
      recordMeta.lastSaveDate = DateTime.local().toISO();

      const attachmentFields = (recordMeta.attachmentFields ?? []) as unknown[];
      try {
        this.ensureAttachmentIds(recordObj, attachmentFields);
      } catch (error) {
        tracker.recordPrimaryNotApplied(this.attachmentIdentityProblem(error));
        this.logSaveOutcome(tracker, 'pre-save', error);
        return tracker;
      }
      if (!_.isEmpty(attachmentFields)) {
        this.bindPendingAttachmentOids(recordObj.metadata as AnyRecord, attachmentFields, oid, false);
      }

      const updateGeneration = tracker.context.requestId;
      let unresolvedAttachmentRows: Array<Record<string, unknown>> = [];
      try {
        unresolvedAttachmentRows = ((await this.attachmentJournalService()?.findUnresolvedByOid(oid)) ??
          []) as unknown as Array<Record<string, unknown>>;
      } catch (error) {
        tracker.recordPrimaryNotApplied(this.saveProblem('pre-save', 'processing', 'attachment-journal-failed'));
        this.logSaveOutcome(tracker, 'pre-save', error);
        return tracker;
      }
      const updateAttachmentPlan = this.attachmentMutationPlan(
        originalRecord ?? origRecordObj,
        recordObj,
        attachmentFields,
        updateGeneration,
        unresolvedAttachmentRows
      );
      this.markPlannedAttachmentReferencesPending(recordObj, updateAttachmentPlan);
      try {
        await this.prepareAttachmentJournal(oid, updateAttachmentPlan);
      } catch (error) {
        await this.markAttachmentPlanState(oid, updateAttachmentPlan, 'cancelled');
        tracker.recordPrimaryNotApplied(this.saveProblem('pre-save', 'processing', 'attachment-journal-failed'));
        this.logSaveOutcome(tracker, 'pre-save', error);
        return tracker;
      }

      sails.log.verbose(`RecordService - updateMeta - before storageService.updateMeta`);
      // Primary metadata is the commit boundary.  Physical attachment work
      // must not run until this mutation is explicitly confirmed applied.
      try {
        const adapterResponse = await this.updateStorageCandidate(brandObj, oid, recordObj, userObj);
        updateResponse = this.routeBoundStorageResponse(adapterResponse, oid);
      } catch (error) {
        tracker.recordPrimaryUnknown(this.saveProblem('persistence', 'system', 'save-unknown'));
        this.logSaveOutcome(tracker, 'persistence', error);
        return tracker;
      }
      const primaryUpdateMutationState = resolveStorageMutationState(updateResponse, this.logLegacyMutationResponse);
      sails.log.verbose('RecordService - updateMeta - mutation state ' + primaryUpdateMutationState);
      if (primaryUpdateMutationState === 'not-applied') {
        tracker.recordPrimaryNotApplied(this.saveProblem('persistence', 'processing', 'save-not-applied'));
        this.logSaveOutcome(tracker, 'persistence');
        return tracker;
      }
      if (primaryUpdateMutationState === 'unknown') {
        tracker.recordPrimaryUnknown(this.saveProblem('persistence', 'system', 'save-unknown'));
        this.logSaveOutcome(tracker, 'persistence');
        return tracker;
      }
      tracker.confirmPrimaryPersistence(oid, updateResponse);
      hookOperation.completedThrough = 'persistence';

      if (!(await this.finalizeAttachmentPlan(tracker, brandObj, oid, recordObj, userObj, attachmentFields, updateAttachmentPlan))) {
        return await this.finishSave(tracker, userObj, RecordAuditActionType.updated, recordType?.searchable !== false);
      }

        //if triggerPreSaveTriggers is false recordType will be empty even if triggerPostSaveTriggers is true
        //therefore try to set recordType if triggerPostSaveTriggers is true
        if (_.isEmpty(recordType) && !_.isEmpty(brand) && triggerPostSaveTriggers === true) {
          try {
            recordType = (await firstValueFrom(
              RecordTypesService.get(brandObj, recordMeta.type as string)
            )) as RecordTypeLike | null;
          } catch (error) {
            tracker.recordPostPersistenceProblem(this.saveProblem(
              'post-save',
              'processing',
              'post-save-failed',
            ));
            this.logSaveOutcome(tracker, 'post-save', error);
            return await this.finishSave(
              tracker,
              userObj,
              RecordAuditActionType.updated,
              recordType?.searchable !== false
            );
          }
        }
        // post-save async
        if (!_.isEmpty(recordType) && triggerPostSaveTriggers === true) {
          // Trigger Post-save sync hooks ...
          try {
            sails.log.verbose('RecordService - updateMeta - calling triggerPostSaveSyncTriggers');
            const beforePostSyncCandidate = this.mergeValidationCandidate(originalRecord, recordObj);
            const hookOutcome = await this.runPostSaveSyncTriggers({
              oid,
              record: recordObj,
              recordType,
              mode: 'onUpdate',
              user: userObj,
              response: updateResponse as unknown as AnyRecord,
              operation: hookOperation,
            });
            recordObj = hookOutcome.record;
            const hookResponse = hookOutcome.response as unknown as StorageServiceResponse;
            tracker.mergeLegacyHookFields(hookResponse);
            if (this.hookResponseFailed(hookResponse)) {
              tracker.recordPostPersistenceProblem(this.saveProblem('post-save', 'processing', 'post-save-failed'));
              this.logSaveOutcome(tracker, 'post-save');
              return await this.finishSave(
                tracker,
                userObj,
                RecordAuditActionType.updated,
                recordType?.searchable !== false
              );
            }
            // The awaited post-sync phase succeeded; later work is detached.
            hookOperation.completedThrough = 'postSync';
            if (this.hasPostSaveSyncHooks(recordType, 'onUpdate')) {
              const postSyncCandidate = this.mergeValidationCandidate(beforePostSyncCandidate, recordObj);
              recordObj = postSyncCandidate;
              const hookMutationState = await this.persistPostSyncCandidate({
                brand: brandObj,
                oid,
                beforeCandidate: beforePostSyncCandidate,
                candidate: postSyncCandidate,
                user: userObj,
                context: tracker.context,
                writeKind: transitionRequested ? 'transition' : 'update',
                recordType,
                targetStep: transitionRequested ? nextStepObj : undefined,
                authoritativeStep,
                requiresTransitionAuthorization: Boolean(authoritativeStep),
              });
              if (hookMutationState.status === 'validation-failed') {
                tracker.recordPostPersistenceProblem(hookMutationState.problem);
                this.logSaveOutcome(tracker, 'post-save');
                return await this.finishSave(
                  tracker,
                  userObj,
                  RecordAuditActionType.updated,
                  recordType?.searchable !== false
                );
              }
              for (const warning of hookMutationState.warnings) tracker.recordWarning(warning);
              recordObj = hookMutationState.candidate;
              if (hookMutationState.status !== 'applied') {
                tracker.recordPostPersistenceProblem(this.saveProblem('post-save', 'processing', 'post-save-metadata-failed'));
                this.logSaveOutcome(tracker, 'post-save');
                return await this.finishSave(
                  tracker,
                  userObj,
                  RecordAuditActionType.updated,
                  recordType?.searchable !== false
                );
              }
              authoritativeCandidate = hookMutationState.candidate;
            } else {
              authoritativeCandidate = beforePostSyncCandidate;
            }
          } catch (err) {
            sails.log.error(`${this.logHeader} Exception while running post save sync hooks when updating:`);
            sails.log.error(JSON.stringify(err));
            tracker.recordPostPersistenceProblem(
              this.saveProblemFromError(
                err,
                'post-save',
                'processing',
                'post-save-failed'
              )
            );
            this.logSaveOutcome(tracker, 'post-save');
            return await this.finishSave(
              tracker,
              userObj,
              RecordAuditActionType.updated,
              recordType?.searchable !== false
            );
          }
          sails.log.verbose('RecordService - updateMeta - calling triggerPostSaveTriggers');
          // Fire Post-save hooks async ...
          this.triggerPostSaveTriggers(
            oid,
            recordObj,
            recordType,
            'onUpdate',
            userObj,
            hookOperation
          );
          hookOperation.completedThrough = 'post-dispatch';

          if (transitionRequested) {
            try {
              const beforeTransitionCandidate = this.mergeValidationCandidate(authoritativeCandidate, recordObj);
              const transitionOutcome = await this.runPostSaveSyncTriggers({
                oid,
                record: recordObj,
                recordType,
                mode: 'onTransitionWorkflow',
                user: userObj,
                response: updateResponse as unknown as AnyRecord,
                operation: hookOperation,
              });
              recordObj = transitionOutcome.record;
              const transitionResponse = transitionOutcome.response as unknown as StorageServiceResponse;
              let transitionProblem: RecordSaveProblem | undefined;

              sails.log.verbose(
                `RecordService - updateMeta - triggerPostSaveTransitionWorkflowTriggers post save hook enter`
              );
              sails.log.verbose(JSON.stringify(transitionResponse));
              if (!this.hookResponseFailed(transitionResponse)) {
                sails.log.verbose(`RecordService - updateMeta - triggerPostSaveTransitionWorkflowTriggers ajaxOk`);
                if (this.hasPostSaveSyncHooks(recordType, 'onTransitionWorkflow')) {
                  const transitionCandidate = this.mergeValidationCandidate(beforeTransitionCandidate, recordObj);
                  recordObj = transitionCandidate;
                  const transitionMutationState = await this.persistPostSyncCandidate({
                    brand: brandObj,
                    oid,
                    beforeCandidate: beforeTransitionCandidate,
                    candidate: transitionCandidate,
                    user: userObj,
                    context: tracker.context,
                    writeKind: 'transition',
                    recordType,
                    targetStep: nextStepObj,
                    authoritativeStep: nextStepObj,
                    requiresTransitionAuthorization: true,
                  });
                  if (transitionMutationState.status === 'validation-failed') {
                    transitionProblem = transitionMutationState.problem;
                  } else {
                    for (const warning of transitionMutationState.warnings) tracker.recordWarning(warning);
                    recordObj = transitionMutationState.candidate;
                    if (transitionMutationState.status !== 'applied') {
                      transitionProblem = this.saveProblem('post-save', 'processing', 'transition-metadata-failed');
                    }
                  }
                }
              } else {
                sails.log.verbose(
                  `RecordService - updateMeta - triggerPostSaveTransitionWorkflowTriggers post save hook not successful`
                );
                transitionProblem = this.saveProblem('post-save', 'processing', 'transition-failed');
              }
              this.triggerPostSaveTriggers(
                oid,
                recordObj,
                recordType,
                'onTransitionWorkflow',
                userObj,
                hookOperation
              );
              if (transitionProblem) {
                tracker.recordPostPersistenceProblem(transitionProblem);
                this.logSaveOutcome(tracker, 'post-save');
                return await this.finishSave(
                  tracker,
                  userObj,
                  RecordAuditActionType.updated,
                  recordType?.searchable !== false
                );
              }
            } catch (tErr) {
              sails.log.error(
                'RecordService - updateMeta - Failed to run post-save hooks when onTransitionWorkflow... or Error updating meta:'
              );
              sails.log.error(tErr);
              tracker.recordPostPersistenceProblem(
                this.saveProblemFromError(
                  tErr,
                  'post-save',
                  'processing',
                  'transition-failed'
                )
              );
              this.logSaveOutcome(tracker, 'post-save');
              return await this.finishSave(
                tracker,
                userObj,
                RecordAuditActionType.updated,
                recordType?.searchable !== false
              );
            }
          }
        }
      return await this.finishSave(tracker, userObj, RecordAuditActionType.updated, recordType?.searchable !== false);
    }

    hasPostSaveSyncHooks(recordType: unknown, mode: string): boolean {
      const postSaveSyncHooks = _.get(recordType, `hooks.${mode}.postSync`, []);
      if (_.isArray(postSaveSyncHooks) && postSaveSyncHooks.length > 0) {
        return true;
      }
      return false;
    }

    private hookResponseFailed(response: unknown): boolean {
      if (!response || typeof response !== 'object') {
        return true;
      }
      const candidate = response as AnyRecord;
      if (typeof candidate.isSuccessful === 'function') {
        return candidate.isSuccessful() !== true;
      }
      return candidate.success !== true;
    }

    getMeta(oid: string): Promise<RecordModel> {
      return this.storageService.getMeta(oid) as Promise<RecordModel>;
    }

    async getRecordAudit(params: RecordAuditParams): Promise<Record<string, unknown>[]> {
      const audit = (await this.storageService.getRecordAudit(params)) as Record<string, unknown>[];
      if (Array.isArray(audit) && audit.length === 0) {
        const storageServiceAny = this.storageService as unknown as AnyRecord;
        if (typeof storageServiceAny.createRecordAudit === 'function') {
          try {
            const data = new RecordAuditModel(params.oid, {}, {}, RecordAuditActionType.created);
            await (storageServiceAny.createRecordAudit as (...args: unknown[]) => Promise<unknown>)(data);
            const refreshed = (await this.storageService.getRecordAudit(params)) as Record<string, unknown>[];
            if (Array.isArray(refreshed) && refreshed.length > 0) {
              return refreshed;
            }
          } catch (err) {
            sails.log.error(`${this.logHeader} Failed to create fallback record audit:`);
            sails.log.error(JSON.stringify(err));
          }
        }
        const fallbackDate = new Date();
        const dateFrom = params.dateFrom instanceof Date ? params.dateFrom : null;
        const dateTo = params.dateTo instanceof Date ? params.dateTo : null;
        const inRange = (!dateFrom || fallbackDate >= dateFrom) && (!dateTo || fallbackDate <= dateTo);
        if (!inRange) {
          return [] as Record<string, unknown>[];
        }
        return [
          {
            redboxOid: params.oid,
            action: RecordAuditActionType.created,
            user: {},
            record: {},
            dateCreated: fallbackDate.toISOString(),
          },
        ] as Record<string, unknown>[];
      }
      const actionFilter = _.isString(params.action) ? params.action.trim().toLowerCase() : '';
      const workflowStateFilter = _.isString(params.workflowState) ? params.workflowState.trim().toLowerCase() : '';

      return audit.filter(auditRow => {
        const action = String(auditRow['action'] ?? '')
          .trim()
          .toLowerCase();
        const workflowStageLabel = String(_.get(auditRow, 'record.workflow.stageLabel', ''))
          .trim()
          .toLowerCase();
        const actionMatches = _.isEmpty(actionFilter) || action === actionFilter;
        const workflowMatches = _.isEmpty(workflowStateFilter) || workflowStageLabel.includes(workflowStateFilter);
        return actionMatches && workflowMatches;
      });
    }

    public async getResolvedPermissionsSummary(oid: string) {
      const record = await this.getMeta(oid);
      if (_.isEmpty(record)) {
        throw new Error(`Record not found: ${oid}`);
      }

      const authorization = ((record as unknown as RecordWithMeta).authorization ?? {}) as AnyRecord;
      const resolveUsers = async (value: unknown) => {
        const usernames = Array.isArray(value) ? value : [];
        const resolvedUsers = [];
        for (const usernameValue of usernames) {
          const username = String(usernameValue ?? '');
          if (_.isEmpty(username)) {
            continue;
          }
          try {
            const user = await firstValueFrom(UsersService.getUserWithUsername(username));
            resolvedUsers.push({
              username,
              name: String(_.get(user, 'name', '')),
              email: String(_.get(user, 'email', '')),
            });
          } catch (error) {
            sails.log.warn(
              `RecordsService.getResolvedPermissionsSummary could not resolve user '${username}' for record '${oid}'.`
            );
            sails.log.warn(error);
            resolvedUsers.push({
              username,
              name: '',
              email: '',
            });
          }
        }
        return resolvedUsers;
      };

      return {
        edit: await resolveUsers(authorization.edit),
        view: await resolveUsers(authorization.view),
        editPending: _.castArray(authorization.editPending ?? []).map(value => String(value ?? '')),
        viewPending: _.castArray(authorization.viewPending ?? []).map(value => String(value ?? '')),
        editRoles: _.castArray(authorization.editRoles ?? []).map(value => String(value ?? '')),
        viewRoles: _.castArray(authorization.viewRoles ?? []).map(value => String(value ?? '')),
      };
    }

    /**
     * V1 direct-storage batch path. It is intentionally unvalidated and must
     * never be described as authoritative validation. Every invocation first
     * writes a durable, payload-free bypass audit; a future batch API must
     * validate each candidate before reaching storage.
     *
     * The typed contract is `(recordType, records, harvestIdField)`. The
     * historical JavaScript-only `createBatch(records)` call remains forwarded
     * unchanged and is identified explicitly in the audit instead of being
     * inferred through positional ternaries.
     */
    async createBatch(type: unknown, data?: unknown, harvestIdFldName?: unknown): Promise<unknown> {
      const requestId = randomUUID();
      const batchContext = this.createBatchAuditContext(type, data);
      const createAudit = (this.storageService as Partial<StorageService> | undefined)?.createRecordAudit;
      if (typeof createAudit !== 'function') {
        throw this.batchBypassAuditError();
      }
      let auditResponse: StorageServiceResponse;
      try {
        auditResponse = await createAudit.call(
          this.storageService,
          new RecordAuditModel(
            `batch-validation-bypass:${requestId}`,
            {
              validationBypass: {
                mode: 'direct-storage-v1',
                reason: 'create-batch-v1-direct-storage',
                actor: { kind: 'service', id: 'RecordsService.createBatch' },
                requestId,
                validationStatus: 'unvalidated',
                argumentContract: batchContext.argumentContract,
                ...(batchContext.recordType ? { recordType: batchContext.recordType } : {}),
                ...(batchContext.candidateCount !== undefined ? { candidateCount: batchContext.candidateCount } : {}),
              },
            },
            { service: 'RecordsService.createBatch' },
            RecordAuditActionType.batchValidationBypassed
          )
        );
      } catch (error) {
        throw this.batchBypassAuditError(error);
      }
      if (!this.auditPersistenceSucceeded(auditResponse)) {
        throw this.batchBypassAuditError();
      }
      sails.log.warn(`${this.logHeader} record_batch_validation_bypassed`, {
        event: 'record_batch_validation_bypassed',
        request_id: requestId,
        validation_status: 'unvalidated',
        argument_contract: batchContext.argumentContract,
        ...(batchContext.recordType ? { record_type: batchContext.recordType } : {}),
        ...(batchContext.candidateCount !== undefined ? { candidate_count: batchContext.candidateCount } : {}),
      });
      return await this.storageService.createBatch(type, data, harvestIdFldName);
    }

    private batchBypassAuditError(cause?: unknown): RBValidationError {
      return new RBValidationError({
        message: 'The direct createBatch bypass could not be durably audited.',
        ...(cause === undefined ? {} : { options: { cause } }),
        problemKind: 'system',
        displayErrors: [
          {
            title: `@record-save-${RECORD_VALIDATION_SAVE_CODES.batchBypassAuditFailed}`,
            code: RECORD_VALIDATION_SAVE_CODES.batchBypassAuditFailed,
          },
        ],
      });
    }

    private createBatchAuditContext(type: unknown, data: unknown): CreateBatchAuditContext {
      if (typeof type === 'string' && Array.isArray(data)) {
        const recordType = type.trim().slice(0, 128);
        return {
          ...(recordType ? { recordType } : {}),
          candidateCount: data.length,
          argumentContract: 'typed-three-argument',
        };
      }
      if (Array.isArray(type) && data === undefined) {
        return { candidateCount: type.length, argumentContract: 'legacy-records-only' };
      }
      return { argumentContract: 'unrecognized' };
    }

    provideUserAccessAndRemovePendingAccess(oid: string, userid: unknown, pendingValue: unknown): void {
      this.storageService.provideUserAccessAndRemovePendingAccess(oid, userid, pendingValue);
    }

    getRelatedRecords(
      oid: string,
      brand: unknown,
      options: RecordRelationshipExpandOptions = {}
    ): Promise<RecordRelationshipGraph> {
      return this.storageService.getRelatedRecords(oid, brand, options);
    }

    async getMetaWithRelationships(
      oid: string,
      brand: unknown,
      options: RecordRelationshipExpandOptions = {}
    ): Promise<RecordMetaWithRelationships> {
      const metadata = await this.getMeta(oid);
      const relationships = await this.getRelatedRecords(oid, brand, options);
      return { metadata, relationships };
    }

    async getRecordTypeSummary(brand: BrandingModel, recordTypeName: string): Promise<RecordTypeLookupSummary | null> {
      const recordType = await firstValueFrom(RecordTypesService.get(brand, recordTypeName));
      if (_.isEmpty(recordType)) {
        return null;
      }

      return {
        name: String(_.get(recordType, 'name', recordTypeName)),
        packageType: String(_.get(recordType, 'packageType', '')),
        searchFilters: (_.get(recordType, 'searchFilters', []) ?? []) as unknown[],
        searchable: Boolean(_.get(recordType, 'searchable', true)),
        relatedTo: normalizeRecordRelations(
          String(_.get(recordType, 'name', recordTypeName)),
          _.get(recordType, 'relatedTo', [])
        ),
      };
    }

    async delete(oid: string, permanentlyDelete: boolean, currentRec: unknown, recordType: unknown, user: AnyRecord) {
      let currentRecObj = currentRec as AnyRecord;
      const recordTypeObj = recordType as RecordTypeLike;
      const userObj = this.recordObject(user);
      const hookOperation = this.createHookExecutionOperation('onDelete', undefined, oid);
      const preTriggerResponse = new StorageServiceResponse();
      const failedMessage = 'Failed to delete record, please check server logs.';
      try {
        this.validateHookConfiguration(recordTypeObj, ['onDelete']);
        sails.log.verbose('RecordsService - delete - triggerPreSaveTriggers onDelete');
        preTriggerResponse.oid = oid;
        currentRecObj = await this.triggerPreSaveTriggers(
          oid,
          currentRecObj,
          recordTypeObj,
          'onDelete',
          userObj,
          hookOperation
        );
      } catch (err) {
        sails.log.verbose('RecordsService - delete - triggerPreSaveTriggers onDelete error');
        sails.log.error(JSON.stringify(err));
        preTriggerResponse.success = false;
        preTriggerResponse.message = RBValidationError.displayMessage({
          t: TranslationService,
          errors: [this.asError(err)],
          defaultMessage: failedMessage,
        });
        return preTriggerResponse;
      }

      let response = await this.storageService.delete(oid, permanentlyDelete);
      if (response.isSuccessful()) {
        const action: RecordAuditActionType = permanentlyDelete
          ? RecordAuditActionType.destroyed
          : RecordAuditActionType.deleted;
        await this.auditRecord(
          oid,
          {},
          userObj,
          action,
          projectRecordHookExecutionAuditSummary(hookOperation, { partial: true, completedThrough: 'persistence' })
        );
        this.searchService.remove(oid);

        try {
          sails.log.verbose('RecordsService - delete - calling triggerPostSaveSyncTriggers');
          const hookOutcome = await this.runPostSaveSyncTriggers({
            oid,
            record: currentRecObj,
            recordType: recordTypeObj,
            mode: 'onDelete',
            user: userObj,
            response: response as unknown as AnyRecord,
            operation: hookOperation,
          });
          currentRecObj = hookOutcome.record;
          response = hookOutcome.response as unknown as StorageServiceResponse;
        } catch (err) {
          sails.log.error(`RecordsService - delete - Exception while running post delate sync hooks when updating:`);
          sails.log.error(JSON.stringify(err));
          response.success = false;
          response.message = RBValidationError.displayMessage({
            t: TranslationService,
            errors: [this.asError(err)],
            defaultMessage: failedMessage,
          });
          const metadata = { postSaveSyncWarning: 'true' };
          response.metadata = metadata;
          sails.log.error('RecordsService - delete - error - triggerPostSaveSyncTriggers ' + JSON.stringify(response));
          return response;
        }
        sails.log.verbose('RecordService - delete - calling triggerPostSaveTriggers');

        this.triggerPostSaveTriggers(oid, currentRecObj, recordTypeObj, 'onDelete', userObj, hookOperation);
        this.completeHookOperation(hookOperation, true);
      }
      return response;
    }

    updateNotificationLog(oid: string, record: AnyRecord, options: AnyRecord): Promise<unknown> {
      return this.storageService.updateNotificationLog(oid, record, options);
    }

    public getRecords(
      workflowState: string,
      recordType: unknown = undefined,
      start: unknown,
      rows: unknown = 10,
      username: unknown,
      roles: AnyRecord[],
      brand: unknown,
      editAccessOnly: unknown = undefined,
      packageType: unknown = undefined,
      sort: unknown = undefined,
      fieldNames: unknown = undefined,
      filterString: unknown = undefined,
      filterMode: unknown = undefined,
      secondarySort: unknown = undefined
    ): Promise<StorageServiceResponse> {
      return this.storageService.getRecords(
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
        filterString,
        filterMode,
        secondarySort
      );
    }

    public exportAllPlans(
      username: unknown,
      roles: AnyRecord[],
      brand: unknown,
      format: unknown,
      modBefore: unknown,
      modAfter: unknown,
      recType: unknown
    ): Readable {
      return this.storageService.exportAllPlans(username, roles, brand, format, modBefore, modAfter, recType);
    }

    // Gets attachments for this record, will use the `sails.config.record.datastreamService` if set, otherwise will use this service
    //
    // Params:
    // oid - record idea
    // labelFilterStr - set if you want to be selective in your attachments, will just run a simple `.indexOf`
    public async getAttachments(
      oid: string,
      labelFilterStr: string | undefined = undefined,
      requestContext: { username?: string } | undefined = undefined
    ): Promise<Record<string, unknown>[]> {
      sails.log.verbose(`RecordsService::Getting attachments of ${oid}`);
      const datastreams = (await this.datastreamService.listDatastreams(oid, '', requestContext)) as AnyRecord[];
      const attachments: Record<string, unknown>[] = [];
      _.each(datastreams, (datastream: unknown) => {
        const datastreamObj = datastream as AnyRecord;
        let attachment: Record<string, unknown> = {};
        const rawDateUpdated =
          datastreamObj['uploadDate'] ?? datastreamObj['lastModified'] ?? _.get(datastreamObj.metadata, 'dateUpdated');
        const normalizedDateUpdated = rawDateUpdated
          ? DateTime.fromJSDate(new Date(rawDateUpdated as string | number | Date))
              .toUTC()
              .toISO()
          : null;
        attachment['dateUpdated'] = rawDateUpdated ? normalizedDateUpdated : null;
        attachment['label'] = _.get(datastreamObj.metadata, 'name');
        attachment['contentType'] = _.get(datastreamObj.metadata, 'mimeType');
        attachment = _.merge(attachment, datastreamObj.metadata);
        attachment['dateUpdated'] = normalizedDateUpdated;
        if (_.isUndefined(labelFilterStr) && _.isEmpty(labelFilterStr)) {
          attachments.push(attachment);
        } else {
          if (datastreamObj['label'] && (datastreamObj['label'] as string).indexOf(labelFilterStr as string) != -1) {
            attachments.push(attachment);
          }
        }
      });
      return attachments;
    }

    /*
     *
     */
    public async checkRedboxRunning(): Promise<unknown> {
      // check if a valid storage plugin is loaded....
      if (!_.isEmpty(sails.config.storage)) {
        sails.log.info('ReDBox storage plugin is active!');
        return true;
      }
      const retries = 1000;
      for (let i = 0; i < retries; i++) {
        try {
          const response = (await this.info()) as AnyRecord;
          if (response['applicationVersion']) {
            return true;
          }
        } catch (_err) {
          sails.log.info("ReDBox Storage hasn't started yet. Retrying...");
        }
        await this.sleep(1000);
      }
      return false;
    }

    public async auditRecord(
      id: string,
      record: AnyRecord,
      user: AnyRecord,
      action: RecordAuditActionType = RecordAuditActionType.updated,
      executionSummary?: RecordHookExecutionAuditSummary
    ) {
      const auditingEnabled = sails.config.record.auditing.enabled as unknown;
      if (auditingEnabled !== true && auditingEnabled !== 'true') {
        sails.log.verbose(`${this.logHeader} Not enabled. Skipping auditing`);
        return;
      }
      sails.log.verbose(`${this.logHeader} adding record audit job: ${id} with data:`);
      _.unset(user, 'password');
      _.unset(user, 'token');
      // storage_id is used as the main ID in searches
      const data = new RecordAuditModel(id, record, user, action, executionSummary);
      sails.log.verbose(JSON.stringify(data));
      const envName = String((sails.config as AnyRecord).environment ?? process.env.NODE_ENV ?? '');
      if (envName === 'integrationtest') {
        const storageServiceAny = this.storageService as unknown as AnyRecord;
        try {
          await (storageServiceAny.createRecordAudit as (...args: unknown[]) => Promise<unknown>)(data);
        } catch (err) {
          sails.log.error(`${this.logHeader} Failed to create record audit in integrationtest:`);
          sails.log.error(JSON.stringify(err));
        }
        return;
      }
      if (this.queueService == null) {
        sails.log.verbose(`${this.logHeader} Queue service isn't defined. Skipping auditing`);
        return;
      }
      await this.queueService.now(sails.config.record.auditing.recordAuditJobName, data);
    }

    public storeRecordAudit(job: AnyRecord) {
      const jobObj = job as AnyRecord;
      const jobAttrs = (jobObj.attrs ?? {}) as AnyRecord;
      const data = ((jobAttrs as AnyRecord).data ?? jobAttrs) as AnyRecord;
      sails.log.verbose(`${this.logHeader} Storing record Audit entry: `);
      sails.log.verbose(JSON.stringify(data));
      const storageServiceAny = this.storageService as unknown as AnyRecord;
      (storageServiceAny.createRecordAudit as (...args: unknown[]) => Promise<unknown>)(data)
        .then((response: unknown) => {
          const responseObj = response as StorageServiceResponse;
          if (responseObj.isSuccessful()) {
            sails.log.verbose(`${this.logHeader} Record Audit stored successfully `);
          } else {
            sails.log.error(`${this.logHeader} Failed to storeRecordAudit for record:`);
            sails.log.verbose(JSON.stringify(responseObj));
          }
        })
        .catch((err: unknown) => {
          sails.log.error(`${this.logHeader} Failed to storeRecordAudit for record: `);
          sails.log.error(JSON.stringify(err));
        });
    }

    private info(): Promise<unknown> {
      const options = this.getOptions(
        sails.config.record.baseUrl.redbox + sails.config.record.api.info.url,
        sails.config.record.api.info.method
      );

      return axios(options);
    }

    protected getOptions(
      url: string,
      method: string,
      oid: string | null = null,
      packageType: string | null = null,
      contentType = 'application/json; charset=utf-8'
    ) {
      if (!_.isEmpty(oid)) {
        url = url.replace('$oid', String(oid));
      }
      if (!_.isEmpty(packageType)) {
        url = url.replace('$packageType', String(packageType));
      }
      const opts = {
        method: method,
        url: url,
        headers: {
          Authorization: `Bearer ${((sails.config as AnyRecord).redbox as AnyRecord)?.apiKey}`,
          'Content-Type': contentType,
        },
      };

      return opts;
    }

    /**
     * End of block to move/remove
     */

    /**
     * Sets/appends to a field in the targetRecord
     *
     * @param  targetRecordOid - the record to modify
     * @param  data - the data to set
     * @param  fieldName - the field name to use
     * @param  fieldType - blank for any, 'array' to create an array
     * @param  targetRecord - leave blank, otherwise will use this record for updates...
     * @return - response of the update
     */
    public async appendToRecord(
      targetRecordOid: string,
      linkData: unknown,
      fieldName: string,
      fieldType: string | undefined = undefined,
      targetRecord: unknown = undefined
    ) {
      sails.log.verbose(`RecordsService::Appending to record:${targetRecordOid}`);
      let targetRecordObj = targetRecord as AnyRecord;
      if (_.isEmpty(targetRecord)) {
        sails.log.verbose(`RecordsService::Getting record metadata:${targetRecordOid}`);
        targetRecordObj = (await this.getMeta(targetRecordOid)) as AnyRecord;
      }
      const existingData = _.get(targetRecordObj, fieldName);
      if (_.isUndefined(existingData)) {
        if (fieldType == 'array') {
          linkData = [linkData];
        }
      } else if (_.isArray(existingData)) {
        existingData.push(linkData);
        linkData = existingData;
      }
      _.set(targetRecordObj, fieldName, linkData);
      sails.log.verbose(`RecordsService::Updating record:${targetRecordOid}`);

      return await this.updateMeta(null, targetRecordOid, targetRecordObj);
    }

    /**
     * Removes a field in the targetRecord. If field is an array, uses the `_.isEqual` to compare the field value.
     *
     * @param  targetRecordOid - the record to modify
     * @param  dataToRemove - the data to remove
     * @param  fieldName - the field name
     * @param  targetRecord - leave blank, otherwise will use this record for updates...
     * @return - response of the update
     */
    public async removeFromRecord(
      targetRecordOid: string,
      dataToRemove: unknown,
      fieldName: string,
      targetRecord: unknown = undefined
    ) {
      sails.log.verbose(`RecordsService::Removing field from record:${targetRecordOid}`);
      let targetRecordObj = targetRecord as AnyRecord;
      if (_.isEmpty(targetRecord)) {
        sails.log.verbose(`RecordsService::Getting record metadata:${targetRecordOid}`);
        targetRecordObj = (await this.getMeta(targetRecordOid)) as AnyRecord;
      }
      const existingData = _.get(targetRecordObj, fieldName);
      let removedData = existingData;
      if (_.isUndefined(existingData)) {
        // Data doesn't exist, nothing to remove
      } else if (_.isArray(existingData)) {
        removedData = _.remove(existingData, (dataElem: unknown) => {
          return _.isEqual(dataElem, dataToRemove);
        });
      } else {
        _.unset(targetRecordObj, fieldName);
      }
      sails.log.verbose(
        `RecordsService::Updating record, removing ${_.isString(removedData) ? removedData : JSON.stringify(removedData)} from:${targetRecordOid}`
      );

      return await this.updateMeta(null, targetRecordOid, targetRecordObj);
    }

    /**
     * Fine-grained access to the record, converted to sync.
     *
     */
    public hasViewAccess(brand: unknown, user: AnyRecord, roles: object[], record: AnyRecord): boolean {
      const auth = record.authorization as AnyRecord | undefined;
      const editArr = auth ? auth.edit : record.authorization_edit;
      const editRolesArr = auth ? auth.editRoles : record.authorization_editRoles;
      const viewArr = auth ? auth.view : record.authorization_view;
      const viewRolesArr = auth ? auth.viewRoles : record.authorization_viewRoles;
      const uname = String(user.username ?? '');
      const brandObj = brand as BrandingModel;

      const combinedViewArr = _.union(this.asArray(viewArr) ?? [], this.asArray(editArr) ?? []);
      const combinedViewRolesArr = _.union(this.asArray(viewRolesArr) ?? [], this.asArray(editRolesArr) ?? []);

      const isInUserView = _.find(combinedViewArr, (username: unknown) => {
        return uname == username;
      });
      if (!_.isUndefined(isInUserView)) {
        return true;
      }
      const isInRoleView = _.find(combinedViewRolesArr, (roleName: unknown) => {
        const role = RolesService.getRole(brandObj, String(roleName));
        return (
          role &&
          !_.isUndefined(
            _.find(roles, (r: AnyRecord) => {
              return role.id == r.id;
            })
          )
        );
      });
      return !_.isUndefined(isInRoleView);
    }

    /**
     * Fine-grained access to the record, converted to sync.
     *
     */
    public hasEditAccess(brand: unknown, user: AnyRecord, roles: AnyRecord[], record: AnyRecord): boolean {
      const auth = record.authorization as AnyRecord | undefined;
      const editArr = auth ? auth.edit : record.authorization_edit;
      const editRolesArr = auth ? auth.editRoles : record.authorization_editRoles;
      const uname = String(user.username ?? '');
      const brandObj = brand as BrandingModel;

      const isInUserEdit = _.find(this.asArray(editArr), (username: unknown) => {
        return uname == username;
      });
      if (!_.isUndefined(isInUserEdit)) {
        return true;
      }
      const isInRoleEdit = _.find(this.asArray(editRolesArr), (roleName: unknown) => {
        const role = RolesService.getRole(brandObj, String(roleName));
        return (
          role &&
          !_.isUndefined(
            _.find(roles, (r: AnyRecord) => {
              return role.id == r.id;
            })
          )
        );
      });
      return !_.isUndefined(isInRoleEdit);
    }

    public searchFuzzy(
      type: unknown,
      workflowState: string,
      searchQuery: unknown,
      exactSearches: unknown,
      facetSearches: unknown,
      brand: unknown,
      user: AnyRecord,
      roles: AnyRecord[],
      returnFields: unknown
    ): Promise<unknown> {
      const username = user.username;
      const brandObj = brand as BrandingModel;
      const typeStr = String(type ?? '');
      const searchQueryStr = String(searchQuery ?? '');
      const exactSearchArr = (exactSearches ?? []) as AnyRecord[];
      const facetSearchArr = (facetSearches ?? []) as AnyRecord[];
      const returnFieldsArr = (returnFields ?? []) as string[];
      // const url = `${this.getSearchTypeUrl(type, searchField, searchStr)}&start=0&rows=${sails.config.record.export.maxRecords}`;
      let searchParam = workflowState ? ` AND workflow_stage:${workflowState} ` : '';
      searchParam = `${searchParam} AND full_text:${searchQueryStr}`;
      _.forEach(exactSearchArr, (exactSearch: AnyRecord) => {
        searchParam = `${searchParam}&fq=${exactSearch.name}:${this.luceneEscape(String(exactSearch.value))}`;
      });
      if (facetSearchArr.length > 0) {
        searchParam = `${searchParam}&facet=true`;
        _.forEach(facetSearchArr, (facetSearch: AnyRecord) => {
          searchParam = `${searchParam}&facet.field=${facetSearch.name}${_.isEmpty(facetSearch.value) ? '' : `&fq=${facetSearch.name}:${this.luceneEscape(String(facetSearch.value))}`}`;
        });
      }

      let url = `${sails.config.record.baseUrl.redbox}${sails.config.record.api.search.url}?q=metaMetadata_brandId:${brandObj.id} AND metaMetadata_type:${typeStr}${searchParam}&version=2.2&wt=json&sort=date_object_modified desc`;
      url = this.addAuthFilter(url, username, roles, brandObj, false);
      sails.log.debug(`Searching fuzzy using: ${url}`);
      const options = this.getOptions(url, sails.config.record.api.search.method);

      return firstValueFrom(
        from(axios(options)).pipe(
          flatMap(resp => {
            const response = resp as unknown as AnyRecord;
            const customResp: AnyRecord = {
              records: [],
            };
            _.forEach(((response.response as AnyRecord)?.docs ?? []) as AnyRecord[], (solrdoc: AnyRecord) => {
              const customDoc: AnyRecord = {};
              _.forEach(returnFieldsArr, (retField: string) => {
                if (_.isArray(solrdoc[retField])) {
                  customDoc[retField] = solrdoc[retField][0];
                } else {
                  customDoc[retField] = solrdoc[retField];
                }
              });
              customDoc['hasEditAccess'] = this.hasEditAccess(brandObj, user, roles, solrdoc);
              (customResp.records as unknown[]).push(customDoc);
            });
            // check if have facets turned on...
            if (response.facet_counts) {
              customResp['facets'] = [];
              _.forOwn(
                (response.facet_counts as AnyRecord).facet_fields,
                (facet_field: unknown, facet_name: unknown) => {
                  const facetFieldArr = facet_field as unknown[];
                  const numFacetsValues = _.size(facetFieldArr) / 2;
                  const facetValues = [];
                  for (let i = 0, j = 0; i < numFacetsValues; i++) {
                    facetValues.push({
                      value: facetFieldArr[j++],
                      count: facetFieldArr[j++],
                    });
                  }
                  (customResp['facets'] as unknown[]).push({
                    name: String(facet_name),
                    values: facetValues,
                  });
                }
              );
            }
            return of(customResp);
          })
        )
      );
    }

    protected addAuthFilter(
      url: unknown,
      username: unknown,
      roles: AnyRecord[],
      brand: unknown,
      editAccessOnly: unknown = undefined
    ) {
      const brandObj = brand as AnyRecord;
      const usernameStr = String(username ?? '');
      let urlStr = String(url ?? '');
      let roleString = '';
      let matched = false;
      for (let i = 0; i < roles.length; i++) {
        const role = roles[i];
        if (role.branding == brandObj.id) {
          if (matched) {
            roleString += ' OR ';
            matched = false;
          }
          roleString += roles[i].name;
          matched = true;
        }
      }
      urlStr =
        urlStr +
        '&fq=authorization_edit:' +
        usernameStr +
        (editAccessOnly
          ? ''
          : ' OR authorization_view:' + usernameStr + ' OR authorization_viewRoles:(' + roleString + ')') +
        ' OR authorization_editRoles:(' +
        roleString +
        ')';
      return urlStr;
    }

    protected getSearchTypeUrl(type: unknown, searchField: string | null = null, searchStr: string | null = null) {
      const searchParam = searchField ? ` AND ${searchField}:${searchStr}*` : '';
      const redboxConfig = (sails.config as AnyRecord).redbox || '';
      return `${sails.config.record.baseUrl.redbox ?? redboxConfig}${sails.config.record.api.search.url}?q=metaMetadata_type:${type}${searchParam}&version=2.2&wt=json&sort=date_object_modified desc`;
    }

    protected luceneEscape(str: string) {
      return luceneEscapeQuery(String(str));
    }

    /**
     *  Pre-save trigger to clear and re-assign permissions based on security config
     *
     */
    public assignPermissions(_oid: string, _record: AnyRecord, _options: AnyRecord, _user: AnyRecord) {
      // sails.log.verbose(`Assign Permissions executing on oid: ${oid}, using options:`);
      // sails.log.verbose(JSON.stringify(options));
      // sails.log.verbose(`With record: `);
      // sails.log.verbose(record);
      // const emailProperty = _.get(options, "emailProperty", "email");
      // const editContributorProperties = _.get(options, "editContributorProperties", []);
      // const viewContributorProperties = _.get(options, "viewContributorProperties", []);
      // let authorization = _.get(record, "authorization", {});
      // let editContributorObs = [];
      // let viewContributorObs = [];
      // let editContributorEmails = [];
      // let viewContributorEmails = [];
      //
      // // get the new editor list...
      // editContributorEmails = this.populateContribList(editContributorProperties, record, emailProperty, editContributorEmails);
      // // get the new viewer list...
      // viewContributorEmails = this.populateContribList(viewContributorProperties, record, emailProperty, viewContributorEmails);
      //
      // if (_.isEmpty(editContributorEmails)) {
      //   sails.log.error(`No editors for record: ${oid}`);
      // }
      // if (_.isEmpty(viewContributorEmails)) {
      //   sails.log.error(`No viewers for record: ${oid}`);
      // }
      // _.each(editContributorEmails, editorEmail => {
      //   editContributorObs.push(this.getObservable(User.findOne({email: editorEmail})));
      // });
      // _.each(viewContributorEmails, viewerEmail => {
      //   viewContributorObs.push(this.getObservable(User.findOne({email: viewerEmail})));
      // });
      //
      // return Observable.zip(...editContributorObs)
      // .flatMap(editContributorUsers => {
      //   let newEditList = [];
      //   this.filterPending(editContributorUsers, editContributorEmails, newEditList);
      //   record.authorization.edit = newEditList;
      //   record.authorization.editPending = editContributorEmails;
      //   return Observable.zip(...viewContributorObs);
      // })
      // .flatMap(viewContributorUsers => {
      //   let newviewList = [];
      //   this.filterPending(viewContributorUsers, editContributorEmails, newviewList);
      //   record.authorization.view = newviewList;
      //   record.authorization.viewPending = viewContributorEmails;
      //   return Observable.of(record);
      // });
    }

    async restoreRecord(oid: string, user: AnyRecord): Promise<StorageServiceResponse> {
      const recordStorageServiceResponse = await this.storageService.restoreRecord(oid);
      if (recordStorageServiceResponse.isSuccessful() && !_.isNil(recordStorageServiceResponse.metadata)) {
        const record = recordStorageServiceResponse.metadata as RecordModel;
        const metaMetadata = (record?.metaMetadata ?? {}) as unknown as Record<string, unknown>;
        const brandId = _.get(metaMetadata, 'brandId');
        const recordTypeName = _.get(metaMetadata, 'type');

        if (!_.isNil(brandId) && !_.isNil(recordTypeName)) {
          const brand = await BrandingService.getBrandById(String(brandId));
          const recordType = await firstValueFrom(RecordTypesService.get(brand, String(recordTypeName)));
          if (
            this.searchService &&
            typeof this.searchService.index === 'function' &&
            recordType?.searchable !== false
          ) {
            this.searchService.index(oid, record as unknown as Record<string, unknown>);
          }
        }
      }
      await this.auditRecord(
        oid,
        recordStorageServiceResponse as unknown as AnyRecord,
        user,
        RecordAuditActionType.restored
      );
      return recordStorageServiceResponse as unknown as StorageServiceResponse;
    }

    async destroyDeletedRecord(oid: string, user: AnyRecord): Promise<StorageServiceResponse> {
      const record = await this.storageService.destroyDeletedRecord(oid);
      await this.auditRecord(oid, record as unknown as AnyRecord, user, RecordAuditActionType.destroyed);
      return record;
    }

    /** Metadata of a soft deleted record, or null when no deleted record exists for the oid. */
    async getDeletedRecordMeta(oid: string): Promise<RecordModel | null> {
      if (_.isEmpty(oid)) {
        return null;
      }
      return await this.storageService.getDeletedRecordMeta(oid);
    }

    async getDeletedRecords(
      workflowState: string,
      recordType: unknown,
      start: unknown,
      rows: unknown,
      username: unknown,
      roles: AnyRecord[],
      brand: unknown,
      editAccessOnly: unknown,
      packageType: unknown,
      sort: unknown,
      fieldNames?: unknown,
      filterString?: unknown,
      filterMode?: unknown
    ): Promise<StorageServiceResponse> {
      return await this.storageService.getDeletedRecords(
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
        filterString,
        filterMode
      );
    }

    async createRecordAudit(record: AnyRecord): Promise<unknown> {
      const storageServiceAny = this.storageService as unknown as AnyRecord;
      return await (storageServiceAny.createRecordAudit as (...args: unknown[]) => Promise<unknown>)(record);
    }

    public async transitionWorkflowStep(
      _currentRec: unknown,
      _recordType: unknown,
      _nextStep: unknown,
      _user: AnyRecord,
      _triggerPreSaveTriggers: boolean = true,
      _triggerPostSaveTriggers: boolean = true
    ) {
      throw new Error(
        "Use separate calls to 'transitionWorkflowStepMetadata', 'triggerPreSaveTransitionWorkflowTriggers', and 'triggerPostSaveTransitionWorkflowTriggers' instead."
      );
    }

    public setWorkflowStepRelatedMetadata(currentRec: unknown, nextStep: unknown) {
      sails.log.warn('Deprecated call to setWorkflowStepRelatedMetadata. Use transitionWorkflowStepMetadata instead.');
      return this.transitionWorkflowStepMetadata(currentRec, nextStep);
    }

    public transitionWorkflowStepMetadata(currentRec: unknown, nextStep: unknown) {
      const currentRecObj = this.normalizeRecord(currentRec as AnyRecord);
      const nextStepObj = (nextStep ?? {}) as AnyRecord;
      const meta = currentRecObj.metaMetadata as AnyRecord;
      const metadata = currentRecObj.metadata as AnyRecord;
      sails.log.verbose(
        `transitionWorkflowStepMetadata - start - previousWorkflow: ${currentRecObj.previousWorkflow}; workflow: ${currentRecObj.workflow}; nextStep: ${nextStepObj}`
      );
      if (!_.isEmpty(nextStepObj)) {
        const config = nextStepObj.config as AnyRecord;
        currentRecObj.previousWorkflow = currentRecObj.workflow;
        currentRecObj.workflow = config.workflow;
        // TODO: validate data with form fields
        meta.form = config.form;
        // Check for JSON-LD config
        if (sails.config.jsonld.addJsonLdContext) {
          metadata['@context'] = sails.config.jsonld.contexts[meta.form as string];
        }
        //TODO: if this was all typed we probably don't need these sorts of initialisations
        if (currentRecObj.authorization == undefined) {
          currentRecObj.authorization = {
            viewRoles: [],
            editRoles: [],
            edit: [],
            view: [],
          };
        }

        // update authorizations based on workflow...
        const configAuth = config.authorization as AnyRecord;
        currentRecObj.authorization.viewRoles = currentRecObj.authorization.viewRoles ?? configAuth.viewRoles;
        currentRecObj.authorization.editRoles = currentRecObj.authorization.editRoles ?? configAuth.editRoles;
      }
      sails.log.verbose(
        `transitionWorkflowStepMetadata - finish - previousWorkflow: ${currentRecObj.previousWorkflow}; workflow: ${currentRecObj.workflow}; nextStep: ${nextStepObj}`
      );
    }

    public async triggerPreSaveTransitionWorkflowTriggers(
      oid: string | null,
      record: AnyRecord,
      recordType: unknown,
      nextStep: unknown,
      user: unknown = {},
      operation?: ActionExecutionOperation
    ) {
      if (!_.isEmpty(nextStep)) {
        record = await this.triggerPreSaveTriggers(oid, record, recordType, 'onTransitionWorkflow', user, operation);
      }
      return record;
    }

    public async triggerPostSaveTransitionWorkflowTriggers(
      oid: string | null,
      record: AnyRecord,
      recordType: unknown,
      nextStep: unknown,
      user: unknown = {},
      response: unknown = {},
      operation?: ActionExecutionOperation
    ) {
      let responseObj = response as AnyRecord;
      let postSyncRecord = record;
      const recordTypeObj = this.recordObject(recordType) as RecordTypeLike;
      const userObj = this.recordObject(user);
      try {
        if (!_.isEmpty(nextStep)) {
          const outcome = await this.runPostSaveSyncTriggers({
            oid,
            record,
            recordType: recordTypeObj,
            mode: 'onTransitionWorkflow',
            user: userObj,
            response: responseObj,
            operation,
          });
          postSyncRecord = outcome.record;
          responseObj = outcome.response;
        }
      } catch (err) {
        sails.log.error(
          `${this.logHeader} Exception while running post save sync hooks when transitioning workflow: ${JSON.stringify(err)}`
        );
        responseObj.success = false;
        responseObj.message = RBValidationError.displayMessage({
          t: TranslationService,
          errors: [this.asError(err)],
          defaultMessage: 'Failed to transition record workflow, please check server logs.',
        });
        responseObj.metadata = { postSaveSyncWarning: 'true' };
        sails.log.error(
          `RecordsService - triggerPostSaveTransitionWorkflowTriggers - error - response: ${JSON.stringify(responseObj)}`
        );
        return responseObj;
      }

      // A soft-failure response has historically still dispatched detached
      // transition hooks; only a thrown postSync phase suppresses dispatch.
      if (!_.isEmpty(nextStep)) {
        this.triggerPostSaveTriggers(oid, postSyncRecord, recordTypeObj, 'onTransitionWorkflow', userObj, operation);
      }
      return responseObj;
    }

    public async triggerPreSaveTriggers(
      oid: string | null,
      record: AnyRecord,
      recordType: unknown,
      mode: string = 'onUpdate',
      user: unknown = {},
      operation?: ActionExecutionOperation
    ) {
      // A standalone call owns its operation summary; a call that is part of a
      // save lets the save emit one summary for every phase.
      const execution =
        operation ??
        this.createHookExecutionOperation(mode as ActionExecutionOperation['mode'], undefined, oid ?? undefined);
      try {
        const outcome = await this.hookCoordinator(execution, operation !== undefined)
          .runPre(oid, record, recordType, mode, user);
        if (operation === undefined) {
          this.completeHookOperation(execution);
        }
        if (outcome.terminalCause !== undefined) {
          if (RBValidationError.isRBValidationError(outcome.terminalCause)) {
            throw outcome.terminalCause;
          }
          throw new RBValidationError({
            message: `pre-save trigger failed to complete for oid ${oid} mode ${mode}`,
            options: { cause: outcome.terminalCause },
            displayErrors: [{ title: '@record-save-pre-save-processing-failed', meta: { oid } }],
          });
        }
        return outcome.record;
      } catch (error) {
        if (RBValidationError.isRBValidationError(error)) {
          throw error;
        }
        throw new RBValidationError({
          message: `pre-save trigger failed to complete for oid ${oid} mode ${mode}`,
          options: { cause: error },
          displayErrors: [{ title: '@record-save-pre-save-processing-failed', meta: { oid } }],
        });
      }
    }

    private async runPostSaveSyncTriggers(options: RunPostSaveSyncOptions): Promise<RecordHookPostSyncResult> {
      const { oid, record, recordType, mode, user, response, operation } = options;
      const execution = operation ?? this.createHookExecutionOperation(mode, undefined, oid ?? undefined);
      try {
        const outcome = await this.hookCoordinator(execution, operation !== undefined).runPostSync(
          oid,
          record,
          recordType,
          mode,
          user,
          response
        );
        if (operation === undefined) {
          this.completeHookOperation(execution);
        }
        if (outcome.terminalCause !== undefined) {
          if (RBValidationError.isRBValidationError(outcome.terminalCause)) {
            throw outcome.terminalCause;
          }
          throw new RBValidationError({
            message: `post-save trigger failed to complete for oid ${oid} mode ${mode}`,
            options: { cause: outcome.terminalCause },
            displayErrors: [{ title: '@record-save-post-save-failed', meta: { oid } }],
          });
        }
        return outcome;
      } catch (error) {
        if (RBValidationError.isRBValidationError(error)) {
          throw error;
        }
        throw new RBValidationError({
          message: `post-save trigger failed to complete for oid ${oid} mode ${mode}`,
          options: { cause: error },
          displayErrors: [{ title: '@record-save-post-save-failed', meta: { oid } }],
        });
      }
    }

    /**
     * Backward-compatible public hook surface. The caller owns `record`; a
     * hook that returns a replacement record does not cause this method to
     * empty and refill that object. Save pipelines use the private typed seam
     * above when they need both the replacement candidate and the response.
     */
    public async triggerPostSaveSyncTriggers(
      oid: string | null,
      record: AnyRecord,
      recordType: unknown,
      mode: string = 'onUpdate',
      user: unknown = {},
      response: AnyRecord = {},
      operation?: ActionExecutionOperation
    ): Promise<AnyRecord> {
      const recordTypeObj = this.recordObject(recordType) as RecordTypeLike;
      const userObj = this.recordObject(user);
      const outcome = await this.runPostSaveSyncTriggers({
        oid,
        record,
        recordType: recordTypeObj,
        mode: mode as ActionExecutionOperation['mode'],
        user: userObj,
        response,
        operation,
      });
      return outcome.response;
    }

    public triggerPostSaveTriggers(
      oid: string | null,
      record: AnyRecord,
      recordType: unknown,
      mode: string = 'onUpdate',
      user: unknown = {},
      operation?: ActionExecutionOperation
    ): void {
      const execution =
        operation ??
        this.createHookExecutionOperation(mode as ActionExecutionOperation['mode'], undefined, oid ?? undefined);
      try {
        this.hookCoordinator(execution, operation !== undefined).dispatchPost(oid, record, recordType, mode, user);
        if (operation === undefined) {
          this.completeHookOperation(execution);
        }
      } catch (error) {
        sails.log.error(`Invalid post-save trigger configuration for ${mode}; skipping fire-and-forget hook`, error);
      }
    }

    public async exists(oid: string) {
      return this.storageService.exists(oid);
    }

    public handleUpdateDataStream(oid: string, origRecord: unknown, metadata: AnyRecord) {
      const fileIdsAdded: Datastream[] = [];
      const stagingDisk = StorageManagerService.stagingDisk();
      return this.datastreamService.updateDatastream(oid, origRecord, metadata, stagingDisk, fileIdsAdded).pipe(
        concatMap((reqs: Promise<unknown>[]) => {
          if (Array.isArray(reqs) && reqs.length > 0) {
            this.logger.verbose(`Updating data streams...`);
            return from(reqs);
          }
          this.logger.verbose(`No datastreams to update...`);
          return of(null);
        }),
        concatMap((promise: Promise<unknown> | null) => {
          if (promise) {
            this.logger.verbose(`Update datastream request is...`);
            this.logger.verbose(JSON.stringify(promise));
            return from(promise).pipe(
              catchError((e: unknown) => {
                const detail = this.describeError(e);
                this.logger.verbose(`Error in updating stream::::`);
                this.logger.verbose(detail);
                return throwError(() => new Error(`${TranslationService.t('attachment-upload-error')}: ${detail}`));
              })
            );
          }
          return of(null);
        }),
        concatMap(updateResp => {
          if (updateResp) {
            this.logger.verbose(`Got response from update datastream request...`);
            this.logger.verbose(JSON.stringify(updateResp));
          }
          return of(updateResp);
        }),
        last()
      );
    }
  }
}

declare global {
  let RecordsService: Services.Records;
}
