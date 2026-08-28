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
import {
  RecordAuditModel,
  RecordAuditActionType,
  type RecordMutationAuditConcurrency,
} from '../model/storage/RecordAuditModel';
import { RecordsService } from '../RecordsService';
import { SearchService } from '../SearchService';
import { Services as services } from '../CoreService';

declare const RedboxJavaStorageService: unknown;
import { StorageService } from '../StorageService';
import { StorageMutationResponse, StorageServiceResponse } from '../StorageServiceResponse';
import { RecordAuditParams } from '../RecordAuditParams';
import { RBValidationError } from '../model/RBValidationError';
import { RecordModel } from '../model/storage/RecordModel';
import { RecordTypeModel } from '../model/storage/RecordTypeModel';
import { BrandingModel } from '../model/storage/BrandingModel';
import {
  isDeletedRecordLifecycleOperation,
  isDeletedRecordLifecycleOperationForState,
  isDeletedRecordLifecycleState,
  type DeletedRecordLifecycleOperation,
  type DeletedRecordLifecycleOperationKind,
  type DeletedRecordLifecycleState,
  type DeletedRecordModel,
} from '../model/storage/DeletedRecordModel';

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
import { RECORD_POST_COMMIT_RECONCILIATION_JOB_NAME } from '../config/agendaQueue.config';
import {
  emitRecordConcurrencyEvent,
  type RecordConcurrencyPreconditionResult,
} from '../RecordConcurrencyObservability';
import type {
  InternalRecomputableMutationOptions,
  InternalRecordMutationAuthorization,
  InternalRecordSnapshotSaveOptions,
  InternalRecordWriterIdentity,
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
  type RecordSaveResponse,
  RecordSaveTracker,
  resolveStorageMutationState,
} from '../RecordSaveResponse';
import {
  isRecordSaveRequestId,
  isRecordRevision,
  resolveRecordConcurrentModificationConfig,
  sanitizeRecordSaveIssue,
  type RecordAttachmentCompletionItem,
  type RecordAttachmentOperation,
  type RecordSaveIssue,
  type RecordSavePhase,
  type RecordSaveProblem,
  type RecordSaveProblemKind,
  type StorageMutationApplicationState,
  type RecordConcurrencyMetadata,
  type RecordConcurrentModificationMode,
  type ValidationMode,
  compareRecordValidationIdentifiers,
  RECORD_VALIDATION_REFERENCE_PATTERN,
  VALIDATION_OPERATION_NAME_PATTERN,
  RECORD_CONCURRENCY_RESOLUTIONS,
  RECORD_ENTITY_TAG_RECORD_ID_MAX_LENGTH,
  type RecordConcurrencyResolution,
} from '@researchdatabox/sails-ng-common';
import { formatRecordEntityTag } from '../RecordEntityTag';
import { formatRecordFormFingerprint } from '../RecordFormFingerprint';
import { normalizeAttachmentStagingFileId } from '../AttachmentStagingIdentity';
import {
  INITIAL_RECORD_REVISION,
  hasFullRecordStorageConcurrencyCapability,
  nextRecordRevision,
  type RecordStorageMutationOptions,
  type StorageMutationNonApplicationReason,
} from '../RecordStorageConcurrency';
import type { Services as AttachmentMetadataServices } from './AttachmentMetadataService';
import { createActionExecutionOperation, createActionExecutionSupervisor } from '../action-execution/executor';
import {
  projectRecordHookExecutionAuditSummary,
  type DetachedAuditFinalization,
  type RecordHookExecutionAuditSummary,
} from '../action-execution/audit';
import type {
  ActionExecutionDependencies,
  ActionExecutionMode,
  ActionExecutionOperation,
  ActionExecutionReport,
} from '../action-execution/types';
import {
  RegisteredRecordActionCoordinator,
  RecordActionIdentityFailure,
  closedRecordActionSecretProvider,
  coreRecordActionRegistry,
  projectRecordActionActor,
  resolveRecordActionPlan,
  type RecordActionTransitionContext,
} from './record-actions/coordinator';
import { RedboxActionRegistry, resolveActionPlan } from '../action-registry';
import type { RuntimeValue } from '../runtimeValues';
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
const INTERNAL_RECORD_WRITER_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:/-]{0,127}$/;
const INTERNAL_RECORD_MUTATION_MAX_ATTEMPTS = 3;
const RECORD_POST_COMMIT_RECONCILIATION_SCHEMA_VERSION = 1;
const RECORD_POST_COMMIT_ACTOR_FIELD_MAX_LENGTH = 256;
const RECORD_POST_COMMIT_ACTOR_FIELDS = ['id', 'username', 'name', 'service'] as const;

export interface RecordPostCommitReconciliationData {
  readonly schemaVersion: typeof RECORD_POST_COMMIT_RECONCILIATION_SCHEMA_VERSION;
  readonly oid: string;
  readonly searchable: boolean;
  readonly action: RecordAuditActionType;
  readonly actor: Readonly<Partial<Record<(typeof RECORD_POST_COMMIT_ACTOR_FIELDS)[number], string>>>;
  readonly resolution: RecordConcurrencyResolution;
  readonly committedRevision?: number;
}

export interface RecordPostCommitReconciliationJob {
  readonly attrs?: {
    readonly data?: unknown;
  };
}

interface DeferredSavePostHookDispatch {
  readonly oid: string | null;
  readonly mode: ActionExecutionOperation['mode'];
}

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
    supersedesGeneration?: string;
  };
  type AttachmentJournalService = AttachmentMetadataServices.AttachmentMetadataServiceContract;
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
    readonly expectedRevision: number;
  };
  type PostSyncPersistenceResult =
    | {
        readonly status: StorageMutationApplicationState;
        readonly candidate: RecordWithMeta;
        readonly warnings: readonly RecordSaveProblem[];
        readonly response: StorageMutationResponse;
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
  type RegisteredPostSyncResult = {
    readonly record: AnyRecord;
    readonly response: AnyRecord;
    readonly report: ActionExecutionReport;
    readonly terminalCause?: unknown;
  };
  type CreateBatchAuditContext = {
    readonly recordType?: string;
    readonly candidateCount?: number;
    readonly argumentContract: 'typed-three-argument' | 'legacy-records-only' | 'unrecognized';
  };
  type LifecycleAuthority = {
    readonly brand: BrandingModel;
    readonly recordType: RecordTypeLike;
  };
  type LifecyclePhysicalPurgeResult =
    | { readonly status: 'complete' }
    | { readonly status: 'incomplete'; readonly remaining: number }
    | { readonly status: 'unknown' };
  const DEFAULT_BOOTSTRAP_DATA_PATH = 'bootstrap-data';
  /**
   * Provides the core record lifecycle, persistence, authorization, and relationship operations.
   *
   * Author: <a href='https://github.com/shilob' target='_blank'>Shilo Banihit</a>
   *
   * @extensionPoint Register a subclass as `RecordsService` from a hook to replace or extend record behaviour while preserving the exported-method contract.
   * @remarks This service depends on Waterline models and storage services after Sails bootstrap; replacements must preserve authorization-before-disclosure, exact public preconditions, storage CAS, permanent OID incarnation ownership, and value-free concurrency observability.
   * @see https://github.com/redbox-mint/redbox-portal/wiki/Services-Architecture
   * @see https://github.com/redbox-mint/redbox-portal/wiki/Concurrent-Record-Modifications
   */
  export class Records extends services.Core.Service implements RecordsService {
    storageService!: StorageService;
    datastreamService!: DatastreamService;

    searchService!: SearchService;
    protected queueService!: QueueService;
    private readonly saveHookOperations = new WeakMap<RecordSaveTracker, ActionExecutionOperation>();
    private readonly registeredRecordActionCoordinators = new WeakMap<
      ActionExecutionOperation,
      RegisteredRecordActionCoordinator
    >();
    private readonly deferredSavePostHookDispatches = new WeakMap<
      ActionExecutionOperation,
      DeferredSavePostHookDispatch[]
    >();
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
        schedule: (durationMs, task) => setTimeout(task, durationMs),
        cancelSchedule: handle => clearTimeout(handle as ReturnType<typeof setTimeout>),
      };
    }

    private createHookExecutionOperation(
      mode: 'onCreate' | 'onUpdate' | 'onDelete' | 'onTransitionWorkflow',
      requestId?: string,
      recordOid?: string
    ): ActionExecutionOperation {
      return createActionExecutionOperation(mode, requestId, recordOid, this.hookExecutionDependencies());
    }

    private registerSaveHookOperation(
      tracker: RecordSaveTracker,
      operation: ActionExecutionOperation
    ): ActionExecutionOperation {
      this.saveHookOperations.set(tracker, operation);
      this.deferredSavePostHookDispatches.set(operation, []);
      return operation;
    }

    private flushDeferredSavePostHooks(operation: ActionExecutionOperation, record: AnyRecord): void {
      const dispatches = this.deferredSavePostHookDispatches.get(operation);
      this.deferredSavePostHookDispatches.delete(operation);
      if (!dispatches || dispatches.length === 0) return;

      const coordinator = this.registeredRecordActionCoordinators.get(operation);
      if (!coordinator) {
        throw new Error('Registered record action operation was not prepared.');
      }
      for (const dispatch of dispatches) {
        try {
          coordinator.dispatchPost(record, dispatch.mode);
        } catch (error) {
          sails.log.error(
            `Invalid registered post-save action plan for ${dispatch.mode}; skipping fire-and-forget action`,
            error
          );
        }
      }
      operation.completedThrough = 'post-dispatch';
    }

    private configuredRecordActionRegistry(): RedboxActionRegistry {
      const configured = (sails.config as AnyRecord).actionRegistry;
      return configured instanceof RedboxActionRegistry ? configured : coreRecordActionRegistry();
    }

    private recordActionTransition(
      candidate: AnyRecord,
      nextStep: unknown,
      current?: AnyRecord
    ): RecordActionTransitionContext | undefined {
      const nextStepObj = this.recordObject(nextStep);
      const targetStage = String(
        nextStepObj.name ?? _.get(nextStepObj, 'config.workflow.stage', _.get(candidate, 'workflow.stage', ''))
      ).trim();
      if (!targetStage) return undefined;
      const sourceStage = String(
        _.get(current, 'workflow.stage', '') ||
          _.get(candidate, 'previousWorkflow.stage', '') ||
          _.get(candidate, 'workflow.stage', targetStage)
      ).trim();
      return {
        scopeId: targetStage,
        sourceStage: sourceStage || targetStage,
        targetStage,
      };
    }

    private prepareRecordActionOperation(options: {
      readonly operation: ActionExecutionOperation;
      readonly recordType: unknown;
      readonly recordTypeKey: string;
      readonly brandId: string;
      readonly user: unknown;
      readonly current?: AnyRecord;
      readonly transition?: RecordActionTransitionContext;
    }): RegisteredRecordActionCoordinator {
      const registry = this.configuredRecordActionRegistry();
      const coordinator = new RegisteredRecordActionCoordinator({
        registry,
        secretProvider: closedRecordActionSecretProvider(registry),
        recordType: options.recordType as RuntimeValue,
        recordTypeKey: options.recordTypeKey,
        brandId: options.brandId,
        actor: projectRecordActionActor(options.user as RuntimeValue),
        ...(options.current === undefined ? {} : { current: options.current }),
        ...(options.transition === undefined ? {} : { transition: options.transition }),
        operation: options.operation,
        dependencies: this.hookExecutionDependencies(),
      });
      this.registeredRecordActionCoordinators.set(options.operation, coordinator);
      return coordinator;
    }

    private recordActionCoordinator(
      operation: ActionExecutionOperation,
      record: AnyRecord,
      recordType: unknown,
      user: unknown,
      mode: ActionExecutionMode,
      nextStep?: unknown
    ): RegisteredRecordActionCoordinator {
      const prepared = this.registeredRecordActionCoordinators.get(operation);
      if (prepared) return prepared;
      const recordTypeObj = this.recordObject(recordType);
      const metaMetadata = this.recordObject(record.metaMetadata);
      const recordTypeKey = String(recordTypeObj.name ?? metaMetadata.type ?? '').trim();
      const branding = recordTypeObj.branding;
      const brandId = String(
        metaMetadata.brandId ??
          (branding && typeof branding === 'object' && !Array.isArray(branding)
            ? (branding as AnyRecord).id
            : branding) ??
          ''
      ).trim();
      return this.prepareRecordActionOperation({
        operation,
        recordType,
        recordTypeKey,
        brandId,
        user,
        ...(mode === 'onCreate' ? {} : { current: record }),
        ...(mode === 'onTransitionWorkflow'
          ? { transition: this.recordActionTransition(record, nextStep ?? { name: _.get(record, 'workflow.stage') }) }
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
          displayErrors: [
            {
              title: `@record-save-${RECORD_VALIDATION_SAVE_CODES.authorityDivergence}`,
              code: RECORD_VALIDATION_SAVE_CODES.authorityDivergence,
            },
          ],
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

    private internalWriterId(value: unknown): string | undefined {
      if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
      const descriptors = Object.getOwnPropertyDescriptors(value);
      const kind = descriptors.kind && 'value' in descriptors.kind ? descriptors.kind.value : undefined;
      const rawId = descriptors.id && 'value' in descriptors.id ? descriptors.id.value : undefined;
      const id = typeof rawId === 'string' ? rawId.trim() : '';
      return kind === 'service' && INTERNAL_RECORD_WRITER_ID_PATTERN.test(id) ? id : undefined;
    }

    private internalAuthorizationKind(value: unknown): InternalRecordMutationAuthorization['kind'] | undefined {
      if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
      const descriptor = Object.getOwnPropertyDescriptor(value, 'kind');
      const kind = descriptor && 'value' in descriptor ? descriptor.value : undefined;
      return kind === 'service' || kind === 'record-edit' ? kind : undefined;
    }

    private internalMutationFailure(
      oid: string,
      kind: RecordSaveProblemKind,
      code: string,
      causedByRequestId?: string,
      expectedRevision?: number
    ): RecordSaveResponse {
      const tracker = new RecordSaveTracker(
        createRecordSaveContext({
          routeFamily: 'internal',
          operation: 'update',
          concurrency: {
            entityTagSupplied: false,
            ...(expectedRevision !== undefined ? { expectedRevision } : {}),
            resolution: 'internal',
            ...(causedByRequestId ? { resolutionOfRequestId: causedByRequestId } : {}),
          },
        })
      );
      tracker.result.oid = RECORD_VALIDATION_REFERENCE_PATTERN.test(oid) ? oid : '';
      tracker.recordPrimaryNotApplied(
        this.saveProblem('pre-save', '@record-save-internal-mutation-rejected', kind, code)
      );
      return tracker.toResponse();
    }

    private internalMutationActor(actor: InternalRecordWriterIdentity, user: unknown): AnyRecord {
      const writerId = this.internalWriterId(actor) as string;
      const actorUser = _.cloneDeep(this.recordObject(user));
      actorUser.serviceIdentity = writerId;
      if (!String(actorUser.username ?? '').trim()) {
        actorUser.username = `service:${writerId}`;
      }
      return actorUser;
    }

    private internalMutationBrand(current: AnyRecord, suppliedBrand: unknown): BrandingModel | undefined {
      const brandId = String(this.recordObject(current.metaMetadata).brandId ?? '').trim();
      if (!brandId) return undefined;
      const supplied = this.recordObject(suppliedBrand) as unknown as BrandingModel;
      if (String(supplied.id ?? '').trim()) {
        return String(supplied.id).trim() === brandId ? supplied : undefined;
      }
      return BrandingService.getBrandById(brandId) ?? BrandingService.getBrand(brandId) ?? undefined;
    }

    private internalRecordEditAuthorized(
      authorization: InternalRecordMutationAuthorization['kind'],
      brand: BrandingModel,
      user: AnyRecord,
      current: AnyRecord
    ): boolean {
      if (authorization === 'service') return true;
      if (!String(user.username ?? '').trim()) return false;
      const roles = Array.isArray(user.roles) ? (user.roles as AnyRecord[]) : [];
      return this.hasEditAccess(brand, user, roles, current);
    }

    private isInternalRevisionConflict(response: RecordSaveResponse): boolean {
      return (
        response.outcome === 'not-saved' &&
        response.problems.some(problem => problem.issues.some(issue => issue.code === 'record-revision-stale'))
      );
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
      )
        return false;
      candidate.redboxOid = expected;
      return true;
    }

    /** Generate public record OIDs in the historical ReDBox format. */
    private generateRecordOid(): string {
      // ReDBox record OIDs historically use UUID bytes without separators.
      return randomUUID().replace(/-/g, '');
    }

    /** `redboxOid` alone selects an explicit create OID; storage IDs are generated independently. */
    private normalizeCreateCandidateIdentity(candidate: AnyRecord): string | undefined {
      const suppliedOid = candidate.redboxOid;
      if (suppliedOid !== undefined && (typeof suppliedOid !== 'string' || !suppliedOid.trim())) return undefined;
      const oid = typeof suppliedOid === 'string' && suppliedOid.trim() ? suppliedOid.trim() : this.generateRecordOid();
      if (!RECORD_VALIDATION_REFERENCE_PATTERN.test(oid)) return undefined;
      candidate.redboxOid = oid;
      return oid;
    }

    private async updateStorageCandidate(
      brand: BrandingModel,
      oid: string,
      candidate: AnyRecord,
      user: AnyRecord,
      options?: RecordStorageMutationOptions
    ): Promise<StorageMutationResponse> {
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
      return await this.storageService.updateMeta(brand, oid, storageCandidate, user, options);
    }

    private async createStorageCandidate(
      brand: BrandingModel,
      createOid: string,
      candidate: AnyRecord,
      recordType: RecordTypeLike,
      user: AnyRecord,
      options?: RecordStorageMutationOptions
    ): Promise<StorageMutationResponse> {
      const storageCandidate = _.cloneDeep(candidate) as AnyRecord;
      if (!this.normalizeUpdateCandidateIdentity(storageCandidate, createOid)) {
        throw new Error('The storage create candidate identity diverged from the preselected OID.');
      }
      _.unset(storageCandidate, 'id');
      _.unset(storageCandidate, '_id');
      const adapterResponse = await this.storageService.create(brand, storageCandidate, recordType, user, options);
      return this.routeBoundStorageResponse(adapterResponse, createOid);
    }

    /** Present storage mutation facts to save hooks with the authoritative public OID rebound. */
    private routeBoundStorageResponse(response: StorageMutationResponse, oid: string): StorageMutationResponse {
      return Object.assign(new StorageMutationResponse(), response, { oid });
    }

    private effectiveConcurrencyResolution(context: RecordSaveContext) {
      return context.concurrency?.resolution ?? (context.routeFamily === 'internal' ? 'internal' : 'direct');
    }

    private recordRevision(record: AnyRecord | undefined): number | undefined {
      if (!record) return undefined;
      if (record.revision === undefined) return INITIAL_RECORD_REVISION;
      return isRecordRevision(record.revision) ? record.revision : undefined;
    }

    private recordMutationOptions(
      context: RecordSaveContext,
      expectedRevision?: number,
      requireRevision = false
    ): RecordStorageMutationOptions {
      return {
        precondition: {
          requireRevision,
          ...(expectedRevision !== undefined ? { expectedRevision } : {}),
        },
        requestId: context.requestId,
        resolution: this.effectiveConcurrencyResolution(context),
      };
    }

    private concurrencyMetadata(
      oid: string,
      context: RecordSaveContext,
      mode: RecordConcurrentModificationMode,
      currentRevision: number | undefined,
      formFingerprint?: string
    ): RecordConcurrencyMetadata {
      const expectedRevision = context.concurrency?.expectedRevision;
      return {
        mode,
        ...(currentRevision !== undefined
          ? {
              revision: currentRevision,
              currentRevision,
              entityTag: formatRecordEntityTag(oid, currentRevision),
            }
          : {}),
        ...(expectedRevision !== undefined ? { expectedRevision } : {}),
        ...(formFingerprint ? { formFingerprint } : {}),
        resolution: this.effectiveConcurrencyResolution(context),
        ...(context.concurrency?.resolutionOfRequestId
          ? { resolutionOfRequestId: context.concurrency.resolutionOfRequestId }
          : {}),
      };
    }

    private setConcurrencyMetadata(
      tracker: RecordSaveTracker,
      oid: string,
      mode: RecordConcurrentModificationMode,
      currentRevision: number | undefined,
      formFingerprint?: string
    ): void {
      tracker.setConcurrencyMetadata(
        this.concurrencyMetadata(oid, tracker.context, mode, currentRevision, formFingerprint)
      );
    }

    private concurrencyProblem(
      phase: Extract<RecordSavePhase, 'pre-save' | 'persistence' | 'attachments' | 'post-save'>,
      code:
        | 'record-precondition-required'
        | 'record-revision-stale'
        | 'record-deleted'
        | 'record-concurrency-capability-unavailable'
        | 'form-definition-changed'
        | 'record-lifecycle-operation-conflict'
    ): RecordSaveProblem {
      return this.saveProblem(
        phase,
        `@record-save-${code}`,
        code === 'record-concurrency-capability-unavailable' ? 'system' : 'conflict',
        code
      );
    }

    private resolveConcurrencyMode(recordType: RecordTypeLike | null): RecordConcurrentModificationMode {
      if (!recordType) {
        throw new Error('The authoritative record type is unavailable.');
      }
      return resolveRecordConcurrentModificationConfig(recordType.concurrentModification).mode;
    }

    private lifecycleContext(
      operation: 'delete' | 'restore' | 'purge',
      context?: RecordSaveContext
    ): RecordSaveContext {
      return createRecordSaveContext({
        ...(context ?? {}),
        routeFamily: context?.routeFamily ?? 'internal',
        operation,
        ...(context?.concurrency
          ? { concurrency: context.concurrency }
          : {
              concurrency: {
                entityTagSupplied: false,
                resolution: 'internal',
              },
            }),
      });
    }

    private lifecycleStorageAvailable(): boolean {
      return (
        hasFullRecordStorageConcurrencyCapability(this.storageService) &&
        typeof this.storageService.createTombstone === 'function' &&
        typeof this.storageService.removeActiveRecord === 'function' &&
        typeof this.storageService.updateTombstone === 'function' &&
        typeof this.storageService.removeTombstone === 'function' &&
        typeof this.storageService.createActiveRecordFromTombstone === 'function' &&
        typeof this.storageService.getTombstone === 'function' &&
        typeof this.storageService.getLifecycleTombstones === 'function'
      );
    }

    private lifecycleMutationOptions(
      context: RecordSaveContext,
      expectedRevision: number,
      expectedState?: DeletedRecordLifecycleState,
      operationId?: string
    ): RecordStorageMutationOptions {
      return {
        ...this.recordMutationOptions(context, expectedRevision, true),
        ...(expectedState || operationId
          ? {
              lifecycle: {
                ...(expectedState ? { expectedState } : {}),
                ...(operationId ? { operationId } : {}),
              },
            }
          : {}),
      };
    }

    private newLifecycleOperation(
      context: RecordSaveContext,
      kind: DeletedRecordLifecycleOperationKind,
      sourceRevision: number,
      targetRevision: number,
      operationId = randomUUID()
    ): DeletedRecordLifecycleOperation {
      const now = new Date().toISOString();
      return {
        operationId,
        kind,
        requestId: context.requestId,
        sourceRevision,
        targetRevision,
        startedAt: now,
        updatedAt: now,
        attempts: 1,
        resolution: this.effectiveConcurrencyResolution(context),
        ...(context.concurrency?.resolutionOfRequestId
          ? { resolutionOfRequestId: context.concurrency.resolutionOfRequestId }
          : {}),
      };
    }

    private advanceLifecycleOperation(
      operation: DeletedRecordLifecycleOperation,
      targetRevision: number,
      errorCode?: string
    ): DeletedRecordLifecycleOperation {
      const { errorCode: _previousError, ...current } = operation;
      return {
        ...current,
        targetRevision,
        updatedAt: new Date().toISOString(),
        attempts: operation.attempts + 1,
        ...(errorCode ? { errorCode } : {}),
      };
    }

    private lifecycleSnapshot(record: AnyRecord): AnyRecord {
      const snapshot = _.cloneDeep(record) as AnyRecord;
      for (const field of ['_id', 'id', 'revision', 'lifecycleOperationId']) _.unset(snapshot, field);
      return snapshot;
    }

    private async lifecycleAuthority(
      record: AnyRecord,
      suppliedBrand?: BrandingModel,
      _suppliedRecordType?: RecordTypeLike
    ): Promise<LifecycleAuthority | undefined> {
      const brandId = String(this.recordObject(record.metaMetadata).brandId ?? '').trim();
      const recordTypeName = String(this.recordObject(record.metaMetadata).type ?? '').trim();
      if (!brandId || !recordTypeName) return undefined;
      const suppliedBrandId = String(suppliedBrand?.id ?? '').trim();
      if (suppliedBrandId && suppliedBrandId !== brandId) return undefined;
      let brand = suppliedBrand;
      if (!brand) {
        brand = (await Promise.resolve(BrandingService.getBrandById(brandId))) as BrandingModel | undefined;
      }
      if (!brand) {
        brand = BrandingService.getBrand(brandId) as BrandingModel | undefined;
      }
      if (!brand || String(brand.id ?? '').trim() !== brandId) return undefined;
      // Record-type policy is always reloaded from the authoritative brand.
      // A controller/internal caller may pass a convenient object, but it can
      // never select lifecycle concurrency mode or hook configuration.
      const recordType = (await firstValueFrom(RecordTypesService.get(brand, recordTypeName))) as RecordTypeLike | null;
      return recordType ? { brand, recordType } : undefined;
    }

    private lifecycleEditAuthorized(
      context: RecordSaveContext,
      authority: LifecycleAuthority,
      user: AnyRecord,
      record: AnyRecord
    ): boolean {
      if (context.routeFamily === 'internal') return true;
      const roles = Array.isArray(user.roles) ? (user.roles as AnyRecord[]) : [];
      return this.hasEditAccess(authority.brand, user, roles, record);
    }

    private lifecyclePolicyReady(
      tracker: RecordSaveTracker,
      oid: string,
      recordType: RecordTypeLike,
      currentRevision: number
    ): RecordConcurrentModificationMode | undefined {
      let mode: RecordConcurrentModificationMode;
      try {
        mode = this.resolveConcurrencyMode(recordType);
      } catch (error) {
        tracker.recordPrimaryNotApplied(
          this.concurrencyProblem('pre-save', 'record-concurrency-capability-unavailable')
        );
        this.logSaveOutcome(tracker, 'pre-save', error);
        return undefined;
      }
      this.setConcurrencyMetadata(tracker, oid, mode, currentRevision);
      if (!this.lifecycleStorageAvailable()) {
        tracker.recordPrimaryNotApplied(
          this.concurrencyProblem('pre-save', 'record-concurrency-capability-unavailable')
        );
        return undefined;
      }
      const expectedRevision = tracker.context.concurrency?.expectedRevision;
      // Missing-token policy is operation-independent: compatible and observe
      // callers derive the semantic expected revision from the authoritative
      // active/tombstone snapshot loaded above, while strict public callers
      // must supply the exact representation tag. Internal callers likewise
      // derive from that snapshot. Every path still passes `currentRevision`
      // to the staged lifecycle CAS operations below.
      if (mode === 'strict' && expectedRevision === undefined && tracker.context.routeFamily !== 'internal') {
        tracker.recordPrimaryNotApplied(this.concurrencyProblem('pre-save', 'record-precondition-required'));
        return undefined;
      }
      if (expectedRevision !== undefined && expectedRevision !== currentRevision) {
        tracker.recordPrimaryNotApplied(this.concurrencyProblem('pre-save', 'record-revision-stale'));
        return undefined;
      }
      return mode;
    }

    private async recordLifecycleStorageFailure(
      tracker: RecordSaveTracker,
      oid: string,
      suppliedBrand: BrandingModel,
      user: AnyRecord,
      response: StorageMutationResponse,
      phase: 'persistence' = 'persistence'
    ): Promise<void> {
      const state = resolveStorageMutationState(response, this.logLegacyMutationResponse);
      if (state === 'unknown') {
        tracker.setProjectedMetadata(null);
        tracker.setConcurrencyMetadata(undefined);
        tracker.recordPrimaryUnknown(
          this.saveProblem(phase, '@record-save-record-lifecycle-unknown', 'system', 'record-lifecycle-unknown')
        );
        this.logSaveOutcome(tracker, phase);
        return;
      }

      // A certified lifecycle CAS loss invalidates every coordinate and
      // authorization decision made before dispatch. Observe both collections
      // again and authorize the representation that owns the OID now.
      let active: AnyRecord | null = null;
      let tombstone: DeletedRecordModel | null = null;
      try {
        const current = (await this.storageService.getMeta(oid)) as unknown;
        active = this.isUsableRecordSnapshot(current) ? (current as AnyRecord) : null;
      } catch {
        active = null;
      }
      try {
        tombstone = (await this.storageService.getTombstone?.(suppliedBrand, oid)) ?? null;
      } catch {
        tombstone = null;
      }

      const currentRecord =
        active ??
        (tombstone?.deletedRecordMetadata &&
        this.isUsableRecordSnapshot(tombstone.deletedRecordMetadata as unknown as AnyRecord)
          ? (tombstone.deletedRecordMetadata as unknown as AnyRecord)
          : null);
      const currentRevision = active
        ? this.recordRevision(active)
        : tombstone && isRecordRevision(tombstone.revision)
          ? tombstone.revision
          : undefined;
      const authority = currentRecord ? await this.lifecycleAuthority(currentRecord, suppliedBrand) : undefined;
      if (
        !authority ||
        currentRevision === undefined ||
        !this.lifecycleEditAuthorized(tracker.context, authority, user, currentRecord!)
      ) {
        tracker.setProjectedMetadata(null);
        tracker.setConcurrencyMetadata(undefined);
        tracker.recordPrimaryNotApplied(
          this.validationProblem('authorization', phase, RECORD_VALIDATION_SAVE_CODES.editUnauthorized)
        );
        this.logSaveOutcome(tracker, phase);
        return;
      }

      let mode: RecordConcurrentModificationMode;
      try {
        mode = this.resolveConcurrencyMode(authority.recordType);
      } catch {
        tracker.setProjectedMetadata(null);
        tracker.setConcurrencyMetadata(undefined);
        tracker.recordPrimaryNotApplied(this.concurrencyProblem(phase, 'record-concurrency-capability-unavailable'));
        this.logSaveOutcome(tracker, phase);
        return;
      }
      this.setConcurrencyMetadata(tracker, oid, mode, currentRevision);
      tracker.setProjectedMetadata(this.recordObject(currentRecord!.metadata));

      if (response.nonApplicationReason === 'stale-revision') {
        tracker.recordPrimaryNotApplied(this.concurrencyProblem(phase, 'record-revision-stale'));
      } else if (!active && tombstone && response.nonApplicationReason === 'deleted') {
        tracker.recordPrimaryNotApplied(this.concurrencyProblem(phase, 'record-deleted'));
      } else if (response.nonApplicationReason === 'lifecycle-conflict') {
        tracker.recordPrimaryNotApplied(this.concurrencyProblem(phase, 'record-lifecycle-operation-conflict'));
      } else if (response.nonApplicationReason === 'capability-unavailable') {
        tracker.recordPrimaryNotApplied(this.concurrencyProblem(phase, 'record-concurrency-capability-unavailable'));
      } else if (response.nonApplicationReason === 'brand-mismatch' || response.nonApplicationReason === 'not-found') {
        tracker.setProjectedMetadata(null);
        tracker.setConcurrencyMetadata(undefined);
        tracker.recordPrimaryNotApplied(
          this.validationProblem('authorization', phase, RECORD_VALIDATION_SAVE_CODES.editUnauthorized)
        );
      } else {
        tracker.recordPrimaryNotApplied(
          this.saveProblem(
            phase,
            '@record-save-record-lifecycle-not-applied',
            'processing',
            'record-lifecycle-not-applied'
          )
        );
      }
      this.logSaveOutcome(tracker, phase);
    }

    private async dispatchLifecycleMutation(
      oid: string,
      context: RecordSaveContext,
      dispatch: () => Promise<StorageMutationResponse>
    ): Promise<StorageMutationResponse> {
      try {
        const response = (await dispatch()) as StorageMutationResponse | undefined;
        if (response) return response;
      } catch {
        // Once a provider call is dispatched, an exception is not evidence
        // that the mutation did not commit. Recovery owns reconciliation.
      }
      const unknown = new StorageMutationResponse();
      unknown.oid = oid;
      unknown.applicationState = 'unknown';
      unknown.requestId = context.requestId;
      unknown.resolution = this.effectiveConcurrencyResolution(context);
      return unknown;
    }

    private async markLifecycleRecoveryRequired(
      brand: BrandingModel,
      tombstone: DeletedRecordModel,
      errorCode: string,
      context: RecordSaveContext
    ): Promise<StorageMutationResponse | undefined> {
      const operation = tombstone.lifecycleOperation;
      if (!operation || !isDeletedRecordLifecycleOperation(operation) || !this.storageService.updateTombstone) {
        return undefined;
      }
      const targetRevision = nextRecordRevision(tombstone.revision);
      return await this.dispatchLifecycleMutation(tombstone.redboxOid, context, () =>
        this.storageService.updateTombstone!(
          brand,
          tombstone.redboxOid,
          {
            lifecycleState: 'recovery-required',
            lifecycleOperation: this.advanceLifecycleOperation(operation, targetRevision, errorCode),
          },
          this.lifecycleMutationOptions(context, tombstone.revision, tombstone.lifecycleState, operation.operationId)
        )
      );
    }

    private async purgePhysicalDatastreams(oid: string): Promise<LifecyclePhysicalPurgeResult> {
      let datastreams: AnyRecord[];
      try {
        datastreams = (await this.datastreamService.listDatastreams(oid, '')) as AnyRecord[];
      } catch {
        return { status: 'unknown' };
      }
      const deletions = await Promise.allSettled(
        datastreams.map(datastream => this.datastreamService.removeDatastream(oid, new Datastream(datastream)))
      );
      let remaining: AnyRecord[];
      try {
        remaining = (await this.datastreamService.listDatastreams(oid, '')) as AnyRecord[];
      } catch {
        return { status: 'unknown' };
      }
      if (remaining.length > 0 || deletions.some(result => result.status === 'rejected')) {
        return { status: 'incomplete', remaining: remaining.length };
      }
      return { status: 'complete' };
    }

    /**
     * The single authoritative form-contract fingerprint.
     *
     * Form delivery, create, and update all call this one routine so a value
     * issued with a generated form is compared against an identically composed
     * value at save. Form delivery supplies the exact authoritative form it
     * loaded; save recomputation resolves that same identity again. The
     * fingerprint binds the source form delivered to the browser plus the
     * authoritative workflow-form contract. Binding the sorted workflow map
     * keeps one fingerprint stable across a later transition while still
     * detecting administrator changes to current or target form selection.
     *
     * The fingerprint describes configuration only: no record values, actor
     * identity, or generated defaults enter it.
     */
    public async getRecordFormFingerprint(
      record: AnyRecord,
      recordType: RecordTypeLike,
      _targetStep?: WorkflowStepLike,
      sourceForm?: FormAttributes
    ): Promise<string | undefined> {
      const metaMetadata = this.recordObject(record.metaMetadata);
      const formName = String(metaMetadata.form ?? '').trim();
      const brandId = String(metaMetadata.brandId ?? '').trim();
      if (!formName || !brandId) return undefined;
      const suppliedFormName = String(sourceForm?.name ?? '').trim();
      const suppliedBrandId = String(sourceForm?.branding ?? '').trim();
      if (sourceForm && (suppliedFormName !== formName || (!!suppliedBrandId && suppliedBrandId !== brandId))) {
        return undefined;
      }
      const form = sourceForm ?? (await firstValueFrom(FormsService.getFormByName(formName, true, brandId)));
      if (!form) return undefined;
      const workflowSteps = (await firstValueFrom(WorkflowStepsService.getAllForRecordType(recordType))) ?? [];
      const workflowFormContract = workflowSteps
        .map(step => {
          const workflowStep = step as unknown as WorkflowStepLike;
          return {
            name: String(workflowStep.name ?? '').trim(),
            starting: workflowStep['starting'] === true,
            hidden: workflowStep['hidden'] === true,
            config: workflowStep.config ?? {},
          };
        })
        .sort((first, second) => first.name.localeCompare(second.name));
      return formatRecordFormFingerprint({
        recordType: String(recordType.name ?? '').trim(),
        recordValidation: recordType.recordValidation,
        currentWorkflow: {
          stage: this.candidateWorkflowStep(record),
          form: String(metaMetadata.form ?? '').trim(),
        },
        workflowFormContract,
        form: {
          id: form.id,
          name: form.name,
          branding: form.branding,
          configuration: form.configuration,
        },
        reusableFormDefinitions: sails.config.reusableFormDefinitions ?? {},
        validatorDefinitions: sails.config.validators?.definitions ?? [],
      });
    }

    private committedRevision(response: StorageMutationResponse): number | undefined {
      if (isRecordRevision(response.committedRevision)) return response.committedRevision;
      const committedRecord = response.committedRecord;
      if (committedRecord && typeof committedRecord === 'object' && isRecordRevision(committedRecord.revision)) {
        return committedRecord.revision;
      }
      return undefined;
    }

    /**
     * Preserve the historical LWW adapter contract for secondary writes while
     * requiring concurrency-capable adapters to report the authoritative fact.
     */
    private chainedCommittedRevision(
      response: StorageMutationResponse,
      expectedRevision: number | undefined
    ): number | undefined {
      const committed = this.committedRevision(response);
      if (committed !== undefined) return committed;
      if (
        resolveStorageMutationState(response, this.logLegacyMutationResponse) !== 'applied' ||
        expectedRevision === undefined ||
        hasFullRecordStorageConcurrencyCapability(this.storageService)
      ) {
        return undefined;
      }
      try {
        return nextRecordRevision(expectedRevision);
      } catch {
        return undefined;
      }
    }

    private storageConflictCode(
      reason: StorageMutationNonApplicationReason | undefined
    ): 'record-revision-stale' | 'record-deleted' | undefined {
      if (reason === 'stale-revision') return 'record-revision-stale';
      if (reason === 'deleted') return 'record-deleted';
      return undefined;
    }

    private chainedMutationProblem(
      phase: 'attachments' | 'post-save',
      response: StorageMutationResponse,
      fallbackCode: string
    ): RecordSaveProblem {
      const conflictCode = this.storageConflictCode(response.nonApplicationReason);
      if (response.applicationState === 'not-applied' && conflictCode) {
        return this.concurrencyProblem(phase, conflictCode);
      }
      if (response.nonApplicationReason === 'capability-unavailable') {
        return this.concurrencyProblem(phase, 'record-concurrency-capability-unavailable');
      }
      return this.saveProblem(
        phase,
        '@record-save-follow-up-failed',
        response.applicationState === 'unknown' ? 'system' : 'processing',
        fallbackCode
      );
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
      _message: string,
      kind: RecordSaveProblemKind = 'system',
      code?: string
    ): RecordSaveProblem {
      return recordSaveProblem(kind, phase, code ? `@record-save-${code}` : '@record-save-failed', code);
    }

    private recordActionProblem(operation: ActionExecutionOperation, problem: RecordSaveProblem): RecordSaveProblem {
      return {
        ...problem,
        executionSummary: projectRecordHookExecutionAuditSummary(operation),
      };
    }

    private saveProblemFromError(
      error: unknown,
      phase: RecordSavePhase,
      _fallbackMessage: string,
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
      return [
        {
          kind: 'validation',
          phase,
          issues: result.advisoryErrors.map(sanitizeRecordSaveIssue),
        },
      ];
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
      ).mode;
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
      const roles = Array.isArray(user.roles) ? (user.roles as AnyRecord[]) : [];
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
    private rolloutLayerSnapshot(value: unknown, fallbackMode?: ValidationMode): RecordValidationRolloutLayerSnapshot {
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
      if (
        !this.normalizeAuthoritativeCandidateContext(
          candidateToValidate,
          original,
          recordType,
          brand,
          authoritativeStep
        )
      ) {
        return {
          allowed: false,
          problem: this.validationProblem('system', phase, RECORD_VALIDATION_SAVE_CODES.authorityDivergence),
        };
      }
      if (
        !this.hasPublicEditAuthorization(context, brand, user, writeKind === 'create' ? candidateToValidate : original)
      ) {
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
            ...(typeof candidateToValidate.redboxOid === 'string' ? { redboxOid: candidateToValidate.redboxOid } : {}),
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
        if (
          this.fallbackValidationMode(
            recordType,
            context.validationOperation,
            _.get(candidateToValidate, 'metaMetadata.type')
          ) === 'shadow'
        ) {
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
     * Structured save observation. Only bounded scalars are recorded; raw
     * exception objects and record identifiers never enter the event.
     */
    private logSaveOutcome(tracker: RecordSaveTracker, phase: RecordSavePhase, error?: unknown): void {
      const result = tracker.result;
      const problem = result.problems[result.problems.length - 1];
      const problemCode = problem?.issues[0]?.code;
      const operation = tracker.context.operation ?? 'update';
      const expectedRevision = tracker.context.concurrency?.expectedRevision;
      const currentRevision = result.concurrency?.currentRevision ?? result.concurrency?.revision;
      const precondition: RecordConcurrencyPreconditionResult =
        operation === 'create'
          ? 'not-applicable'
          : problemCode === 'record-revision-stale'
            ? 'stale'
            : tracker.context.concurrency?.entityTagSupplied
              ? 'matching'
              : 'missing';
      emitRecordConcurrencyEvent({
        kind: 'save-outcome',
        writeKind: operation,
        routeFamily: tracker.context.routeFamily ?? 'internal',
        ...(typeof tracker.context.validationRequestParameters?.recordType === 'string'
          ? { recordType: safeValidationLogReference(tracker.context.validationRequestParameters.recordType) }
          : {}),
        outcome: result.outcome,
        phase,
        mode: result.concurrency?.mode,
        expectedRevision,
        currentRevision,
        precondition,
        problemKind: problem?.kind,
        problemCode,
        resolution: result.concurrency?.resolution ?? tracker.context.concurrency?.resolution,
        ...(error === undefined ? {} : { errorType: safeExceptionType(error) }),
      });
    }

    private postCommitAuditActor(user: AnyRecord): RecordPostCommitReconciliationData['actor'] {
      const actor: Partial<Record<(typeof RECORD_POST_COMMIT_ACTOR_FIELDS)[number], string>> = {};
      for (const field of RECORD_POST_COMMIT_ACTOR_FIELDS) {
        const value = user[field];
        if (typeof value !== 'string') continue;
        const normalized = value.trim();
        if (normalized) actor[field] = normalized.slice(0, RECORD_POST_COMMIT_ACTOR_FIELD_MAX_LENGTH);
      }
      return actor;
    }

    private postCommitReconciliationData(
      oid: string,
      searchable: boolean,
      action: RecordAuditActionType,
      user: AnyRecord,
      tracker: RecordSaveTracker
    ): RecordPostCommitReconciliationData | undefined {
      if (!oid || oid.length > RECORD_ENTITY_TAG_RECORD_ID_MAX_LENGTH) return undefined;
      const revision = tracker.result.concurrency?.revision ?? tracker.result.concurrency?.currentRevision;
      return {
        schemaVersion: RECORD_POST_COMMIT_RECONCILIATION_SCHEMA_VERSION,
        oid,
        searchable,
        action,
        actor: this.postCommitAuditActor(user),
        resolution:
          tracker.result.concurrency?.resolution ?? this.effectiveConcurrencyResolution(tracker.context),
        ...(isRecordRevision(revision) ? { committedRevision: revision } : {}),
      };
    }

    private parsePostCommitReconciliationJob(
      job: RecordPostCommitReconciliationJob
    ): RecordPostCommitReconciliationData | undefined {
      const raw = job?.attrs?.data;
      if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return undefined;
      const data = raw as Record<string, unknown>;
      const oid = typeof data.oid === 'string' ? data.oid.trim() : '';
      const action = data.action;
      const resolution = data.resolution;
      if (
        data.schemaVersion !== RECORD_POST_COMMIT_RECONCILIATION_SCHEMA_VERSION ||
        !oid ||
        oid.length > RECORD_ENTITY_TAG_RECORD_ID_MAX_LENGTH ||
        typeof data.searchable !== 'boolean' ||
        !Object.values(RecordAuditActionType).includes(action as RecordAuditActionType) ||
        !RECORD_CONCURRENCY_RESOLUTIONS.includes(resolution as RecordConcurrencyResolution)
      ) {
        return undefined;
      }
      const actor = data.actor && typeof data.actor === 'object' && !Array.isArray(data.actor)
        ? this.postCommitAuditActor(data.actor as AnyRecord)
        : {};
      return {
        schemaVersion: RECORD_POST_COMMIT_RECONCILIATION_SCHEMA_VERSION,
        oid,
        searchable: data.searchable,
        action: action as RecordAuditActionType,
        actor,
        resolution: resolution as RecordConcurrencyResolution,
        ...(isRecordRevision(data.committedRevision) ? { committedRevision: data.committedRevision } : {}),
      };
    }

    private async enqueuePostCommitReconciliation(
      oid: string,
      searchable: boolean,
      action: RecordAuditActionType,
      user: AnyRecord,
      tracker: RecordSaveTracker
    ): Promise<boolean> {
      const data = this.postCommitReconciliationData(oid, searchable, action, user, tracker);
      if (!data || !this.queueService || typeof this.queueService.now !== 'function') return false;
      try {
        await this.queueService.now(RECORD_POST_COMMIT_RECONCILIATION_JOB_NAME, data);
        return true;
      } catch (error) {
        sails.log.warn(`${this.logHeader} durable post-commit reconciliation handoff failed`, {
          event: 'record_post_commit_reconciliation_handoff_failed',
          error_type: safeExceptionType(error),
        });
        return false;
      }
    }

    public async reconcilePostCommitSave(job: RecordPostCommitReconciliationJob): Promise<void> {
      const data = this.parsePostCommitReconciliationJob(job);
      if (!data) throw new Error('Invalid record post-commit reconciliation job.');
      try {
        const reloaded = await this.getMeta(data.oid);
        if (!this.isUsableRecordSnapshot(reloaded)) {
          throw new Error('Committed record reload did not return a usable record.');
        }
        const persistedRecord = reloaded as unknown as AnyRecord;
        if (data.searchable) {
          if (!this.searchService || typeof this.searchService.index !== 'function') {
            throw new Error('Record search indexing is unavailable.');
          }
          const indexAccepted = await this.searchService.index(data.oid, persistedRecord);
          if (!indexAccepted) {
            throw new Error('Record search indexing was not accepted.');
          }
        }
        const auditingEnabled = sails.config.record.auditing.enabled as unknown;
        if (auditingEnabled === true || auditingEnabled === 'true') {
          const createAudit = this.storageService?.createRecordAudit;
          if (typeof createAudit !== 'function') {
            throw new Error('Durable record audit storage is unavailable.');
          }
          const revision = this.recordRevision(persistedRecord) ?? data.committedRevision;
          const audit = new RecordAuditModel(data.oid, persistedRecord, { ...data.actor }, data.action, undefined, {
            ...(revision !== undefined ? { revision } : {}),
            resolution: data.resolution,
          });
          const response = await createAudit.call(this.storageService, audit);
          if (!this.auditPersistenceSucceeded(response)) {
            throw new Error('Durable record audit storage rejected the reconciliation audit.');
          }
        }
        sails.log.info(`${this.logHeader} post-commit reconciliation completed`, {
          event: 'record_post_commit_reconciliation_completed',
          action: data.action,
          searchable: data.searchable,
        });
      } catch (error) {
        sails.log.warn(`${this.logHeader} post-commit reconciliation failed`, {
          event: 'record_post_commit_reconciliation_failed',
          error_type: safeExceptionType(error),
        });
        throw new Error('Record post-commit reconciliation failed.');
      }
    }

    private async finishSave(
      tracker: RecordSaveTracker,
      user: AnyRecord,
      action: RecordAuditActionType,
      searchable: boolean
    ): Promise<RecordSaveResponse> {
      const operation = this.saveHookOperations.get(tracker);
      const oid = String(tracker.result.oid ?? '').trim();
      if (!tracker.result.wasPersisted() || !oid) {
        if (operation) {
          this.deferredSavePostHookDispatches.delete(operation);
          this.completeHookOperation(operation, true);
        }
        return tracker.toResponse();
      }

      let persistedRecord: AnyRecord;
      try {
        const reloaded = await this.getMeta(oid);
        if (!this.isUsableRecordSnapshot(reloaded)) {
          throw new TypeError('Committed record reload did not return a usable record.');
        }
        persistedRecord = reloaded as unknown as AnyRecord;
      } catch (error) {
        const handedOff = await this.enqueuePostCommitReconciliation(oid, searchable, action, user, tracker);
        // None of the adapter or hook projections can be trusted without the
        // authoritative reload. Retain only the confirmed persistence and
        // concurrency coordinates used for deferred reconciliation.
        tracker.setProjectedMetadata(null);
        tracker.result.data = undefined;
        tracker.result.details = undefined;
        tracker.result.totalItems = 0;
        tracker.result.items = [];
        tracker.result.workspaceOid = undefined;
        tracker.result.workspaceData = undefined;
        tracker.recordPostPersistenceProblem(
          this.saveProblem(
            'response',
            '@record-save-post-commit-reconciliation-deferred',
            'system',
            'record-post-commit-reconciliation-deferred'
          )
        );
        sails.log.warn(`${this.logHeader} unable to reload committed record before side effects`, {
          event: 'record_post_commit_reconciliation_deferred',
          error_type: safeExceptionType(error),
          handoff: handedOff ? 'durable' : 'unknown',
        });
        if (operation) {
          this.deferredSavePostHookDispatches.delete(operation);
          this.completeHookOperation(operation, true);
        }
        this.logSaveOutcome(tracker, 'response', error);
        return tracker.toResponse();
      }

      if (operation) {
        this.flushDeferredSavePostHooks(operation, persistedRecord);
        if ((operation.detachedPending ?? 0) > 0) {
          this.dispatchHookOperation(operation);
        }
      }

      const finalRevision = this.recordRevision(persistedRecord);
      const concurrency = tracker.result.concurrency;
      if (concurrency?.mode && finalRevision !== undefined) {
        tracker.setConcurrencyMetadata({
          ...concurrency,
          revision: finalRevision,
          currentRevision: finalRevision,
          entityTag: formatRecordEntityTag(oid, finalRevision),
        });
      }

      if (searchable) {
        try {
          if (!this.searchService || typeof this.searchService.index !== 'function') {
            throw new Error('Record search indexing is unavailable.');
          }
          if (!(await this.searchService.index(oid, persistedRecord))) {
            throw new Error('Index request was not accepted.');
          }
        } catch (error) {
          tracker.recordPostPersistenceProblem(
            this.saveProblem('post-save', '@record-save-index-failed', 'processing', 'record-index-failed')
          );
          sails.log.warn(`${this.logHeader} post-save index submission failed`, {
            event: 'record_post_save_index_failed',
            error_type: safeExceptionType(error),
          });
        }
      }
      const submitAudit = (detachedFinalization: DetachedAuditFinalization = 'complete'): void => {
        if (operation?.detachedAuditFinalized) {
          return;
        }
        if (operation) {
          operation.detachedAuditFinalized = true;
          operation.onDetachedComplete = undefined;
          if (operation.detachedAuditTimer !== undefined) {
            operation.cancelDetachedAuditTimer?.(operation.detachedAuditTimer);
            operation.detachedAuditTimer = undefined;
            operation.cancelDetachedAuditTimer = undefined;
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
                : undefined,
              {
                ...(finalRevision !== undefined ? { revision: finalRevision } : {}),
                resolution: concurrency?.resolution ?? this.effectiveConcurrencyResolution(tracker.context),
              }
            )
          )
          .catch((error: unknown) => {
            sails.log.error(`${this.logHeader} persistence audit submission failed`, error);
          });
      };
      if (operation && (operation.detachedPending ?? 0) > 0) {
        operation.onDetachedComplete = () => submitAudit('complete');
        const dependencies = this.hookExecutionDependencies();
        const schedule =
          dependencies.schedule ?? ((durationMs: number, task: () => void) => setTimeout(task, durationMs));
        operation.cancelDetachedAuditTimer =
          dependencies.cancelSchedule ?? (handle => clearTimeout(handle as ReturnType<typeof setTimeout>));
        const timer = schedule(DETACHED_AUDIT_GRACE_MS, () => submitAudit('grace-expired'));
        if (operation.detachedAuditFinalized) {
          operation.cancelDetachedAuditTimer(timer);
        } else {
          operation.detachedAuditTimer = timer;
        }
        // A detached action may have completed during the awaited snapshot
        // reload. Do not leave a zero-pending operation waiting on a callback.
        if ((operation.detachedPending ?? 0) === 0) {
          submitAudit('complete');
        }
      } else {
        submitAudit('complete');
      }
      this.logSaveOutcome(tracker, 'response');
      return tracker.toResponse();
    }

    /**
     * Preserve the safe display code raised by attachment identity validation
     * so an invalid identity is not reported as a duplicate one.
     */
    private attachmentIdentityProblem(error: unknown): RecordSaveProblem {
      const code = RBValidationError.isRBValidationError(error)
        ? (error as RBValidationError).displayErrors[0]?.code
        : undefined;
      return this.saveProblem(
        'pre-save',
        '@record-save-invalid-attachment-id',
        'validation',
        code ?? 'invalid-attachment-id'
      );
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
      oid: string,
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
        supersedesGeneration?: string
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
        plan.push({
          field,
          attachmentId,
          fileId,
          operation,
          entry: { ...entry, attachmentId, fileId, attachmentField: field, operation, generation },
          generation,
          ...(supersedesGeneration && supersedesGeneration !== generation ? { supersedesGeneration } : {}),
        });
      };

      // Reconcile durable work first. A retry gets its own generation and
      // records the eligible older generation it must supersede only after
      // the retry's primary CAS is confirmed.
      for (const row of unresolvedRows) {
        const attachmentId = String(row.attachmentId ?? '').trim();
        const fileId = String(row.mutationFileId ?? row.fileId ?? '').trim();
        const operation = row.operation === 'delete' || row.operation === 'finalize' ? row.operation : 'add';
        const rowGeneration = String(row.generation ?? '').trim();
        if (!attachmentId || !fileId || !['prepared', 'incomplete', 'unknown'].includes(String(row.mutationState))) {
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
        if (journal && item.supersedesGeneration) {
          try {
            const superseded = await journal.markMutation(
              oid,
              item.attachmentId,
              item.supersedesGeneration,
              'cancelled',
              'attachment-journal-superseded'
            );
            if (!superseded) {
              await journal.markMutation(
                oid,
                item.attachmentId,
                item.generation,
                'cancelled',
                'attachment-journal-supersession-conflict'
              );
              items.push({
                field: item.field,
                attachmentId: item.attachmentId,
                fileId: item.fileId,
                operation: item.operation,
                status: 'incomplete',
                code: 'attachment-generation-not-current',
              });
              continue;
            }
          } catch (error) {
            try {
              await journal.markMutation(
                oid,
                item.attachmentId,
                item.generation,
                'cancelled',
                'attachment-journal-supersession-conflict'
              );
            } catch {
              // Both durable generations remain visible for reconciliation.
            }
            sails.log.error(`${this.logHeader} attachment journal supersession failed for ${item.attachmentId}`, error);
            items.push({
              field: item.field,
              attachmentId: item.attachmentId,
              fileId: item.fileId,
              operation: item.operation,
              status: 'unknown',
              code: 'attachment-journal-failed',
            });
            continue;
          }
        }
        if (journal) {
          try {
            journalStateKnown = await journal.markMutation(
              oid,
              item.attachmentId,
              item.generation,
              'pending',
              undefined,
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
        if (journal && !journalStateKnown) {
          items.push({
            field: item.field,
            attachmentId: item.attachmentId,
            fileId: item.fileId,
            operation: item.operation,
            status: 'incomplete',
            code: 'attachment-generation-not-current',
          });
          continue;
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
              journalStateKnown =
                (await journal.markMutation(
                  oid,
                  item.attachmentId,
                  item.generation,
                  'applied',
                  undefined,
                  item.fileId
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
                'attachment-operation-unknown',
                item.fileId
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

    private incompleteAttachmentItems(
      items: readonly RecordAttachmentCompletionItem[],
      code: string
    ): RecordAttachmentCompletionItem[] {
      return items.map(item => ({ ...item, status: 'incomplete', code }));
    }

    private async markAttachmentPlanState(
      oid: string,
      plan: readonly AttachmentMutationPlanItem[],
      state: 'incomplete' | 'cancelled' | 'unknown',
      code: string
    ): Promise<void> {
      const journal = this.attachmentJournalService();
      if (!journal) {
        return;
      }
      for (const item of plan) {
        try {
          await journal.markMutation(oid, item.attachmentId, item.generation, state, code, item.fileId);
        } catch (error) {
          sails.log.error(
            `${this.logHeader} attachment journal ${state} update failed for ${item.attachmentId}`,
            error
          );
        }
      }
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
      attachmentFields: readonly unknown[],
      expectedRevision: number,
      context: RecordSaveContext
    ): Promise<StorageMutationResponse> {
      const finalizedRecord = _.cloneDeep(record) as AnyRecord;
      this.clearPendingAttachmentOids(finalizedRecord, attachmentFields);
      return await this.updateStorageCandidate(
        brand,
        oid,
        finalizedRecord,
        user,
        this.recordMutationOptions(context, expectedRevision, true)
      );
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
        expectedRevision,
      } = options;
      // Callers pass a freshly merged postSync candidate. Normalize that exact
      // object so persistence and every subsequently dispatched hook observe
      // the same authoritative record that validation receives.
      let authoritativeCandidate = this.cloneValidationCandidate(candidate);
      if (
        !this.normalizeAuthoritativeCandidateContext(
          authoritativeCandidate,
          beforeCandidate,
          recordType,
          brand,
          authoritativeStep,
          oid
        )
      ) {
        return {
          status: 'validation-failed',
          problem: this.validationProblem('system', 'post-save', RECORD_VALIDATION_SAVE_CODES.authorityDivergence),
        };
      }
      if (
        !this.hasPublicEditAuthorization(
          context,
          brand,
          user,
          writeKind === 'create' ? authoritativeCandidate : beforeCandidate
        )
      ) {
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
      const response = await this.updateStorageCandidate(
        brand,
        oid,
        authoritativeCandidate,
        user,
        this.recordMutationOptions(context, expectedRevision, true)
      );
      return {
        status: resolveStorageMutationState(response, this.logLegacyMutationResponse),
        candidate: authoritativeCandidate,
        warnings,
        response,
      };
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
          void that.recoverLifecycleOperations().catch(() => {
            sails.log.warn('record_lifecycle_recovery_startup_failed', {
              event: 'record_lifecycle_recovery_startup_failed',
            });
          });
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
      'updateMetaInternal',
      'mutateMetaInternal',
      'getMeta',
      'getRecordFormFingerprint',
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
      'getDeletedRecord',
      'getDeletedRecordMeta',
      'recoverLifecycleOperation',
      'recoverLifecycleOperations',
      'updateNotificationLog',
      'triggerPreSaveTriggers',
      'triggerPostSaveTriggers',
      'triggerPostSaveSyncTriggers',
      'checkRedboxRunning',
      'bootstrapData',
      'auditRecordValidationRollout',
      'getAttachments',
      'cleanupAbandonedAttachmentStaging',
      'appendToRecord',
      'removeFromRecord',
      'getRecords',
      'exportAllPlans',
      'storeRecordAudit',
      'reconcilePostCommitSave',
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
      const tracker = new RecordSaveTracker(
        createRecordSaveContext({
          ...(context ?? {}),
          operation: context?.operation ?? 'create',
        })
      );
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
        return tracker.toResponse();
      }
      let concurrencyMode: RecordConcurrentModificationMode = 'last-write-wins';
      if (configuredRecordTypeName) {
        try {
          concurrencyMode = this.resolveConcurrencyMode(recordTypeObj);
        } catch (error) {
          tracker.recordPrimaryNotApplied(
            this.concurrencyProblem('pre-save', 'record-concurrency-capability-unavailable')
          );
          this.logSaveOutcome(tracker, 'pre-save', error);
          return tracker.toResponse();
        }
        if (concurrencyMode === 'strict' && !hasFullRecordStorageConcurrencyCapability(this.storageService)) {
          tracker.recordPrimaryNotApplied(
            this.concurrencyProblem('pre-save', 'record-concurrency-capability-unavailable')
          );
          this.logSaveOutcome(tracker, 'pre-save');
          return tracker.toResponse();
        }
      }
      if (tracker.context.concurrency?.expectedRevision !== undefined) {
        tracker.recordPrimaryNotApplied(this.concurrencyProblem('pre-save', 'record-revision-stale'));
        this.logSaveOutcome(tracker, 'pre-save');
        return tracker.toResponse();
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
      const hookOperation = this.registerSaveHookOperation(
        tracker,
        this.createHookExecutionOperation(
          'onCreate',
          tracker.context.requestId,
          String(recordObj.redboxOid ?? '').trim() || undefined
        )
      );

      if (!parsedTarget.ok) {
        tracker.recordPrimaryNotApplied(
          this.workflowTargetProblem(tracker.context, recordTypeObj, recordTypeName, parsedTarget.diagnosticCode)
        );
        this.logSaveOutcome(tracker, 'pre-save');
        return tracker.toResponse();
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
          return tracker.toResponse();
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
          return tracker.toResponse();
        }
        hookOperation.recordOid = createOid;
        this.setConcurrencyMetadata(tracker, createOid, concurrencyMode, undefined);
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
          return tracker.toResponse();
        }
        for (const warning of validation.warnings) tracker.recordWarning(warning);
        recordObj = validation.candidate;

        let createResponse: StorageMutationResponse;
        try {
          createResponse = await this.createStorageCandidate(
            brandObj,
            createOid,
            recordObj,
            recordTypeObj,
            userObj,
            this.recordMutationOptions(tracker.context)
          );
        } catch (error) {
          tracker.recordPrimaryUnknown(
            this.saveProblem('persistence', 'The record save could not be confirmed.', 'system', 'save-unknown')
          );
          this.logSaveOutcome(tracker, 'persistence', error);
          return tracker.toResponse();
        }
        const mutationState = resolveStorageMutationState(createResponse, this.logLegacyMutationResponse);
        if (mutationState === 'applied') {
          tracker.confirmPrimaryPersistence(createOid, createResponse);
          const committedRevision = this.committedRevision(createResponse);
          if (committedRevision !== undefined) {
            recordObj.revision = committedRevision;
            this.setConcurrencyMetadata(tracker, createOid, concurrencyMode, committedRevision);
          }
          hookOperation.completedThrough = 'persistence';
          return await this.finishSave(
            tracker,
            userObj,
            RecordAuditActionType.created,
            recordTypeObj.searchable !== false
          );
        } else if (mutationState === 'not-applied') {
          tracker.recordPrimaryNotApplied(
            createResponse.nonApplicationReason === 'lifecycle-conflict'
              ? this.concurrencyProblem('persistence', 'record-lifecycle-operation-conflict')
              : createResponse.nonApplicationReason === 'capability-unavailable'
                ? this.concurrencyProblem('persistence', 'record-concurrency-capability-unavailable')
                : this.saveProblem('persistence', 'The record was not saved.', 'processing', 'save-not-applied')
          );
        } else {
          tracker.recordPrimaryUnknown(
            this.saveProblem('persistence', 'The record save could not be confirmed.', 'system', 'save-unknown')
          );
        }
        if (!tracker.result.wasPersisted()) {
          this.logSaveOutcome(tracker, 'persistence');
        }
        return tracker.toResponse();
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
        return tracker.toResponse();
      }
      hookOperation.recordOid = createOid;
      this.setConcurrencyMetadata(tracker, createOid, concurrencyMode, undefined);

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
          return tracker.toResponse();
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
        return tracker.toResponse();
      }
      if (!this.hasPublicEditAuthorization(tracker.context, brandObj, userObj, recordObj)) {
        tracker.recordPrimaryNotApplied(
          this.validationProblem('authorization', 'pre-save', RECORD_VALIDATION_SAVE_CODES.editUnauthorized)
        );
        this.logSaveOutcome(tracker, 'pre-save');
        return tracker.toResponse();
      }
      if (targetStepName && !this.hasTransitionRoleAuthorization(wfStep, userObj)) {
        tracker.recordPrimaryNotApplied(
          this.validationProblem('authorization', 'pre-save', RECORD_VALIDATION_SAVE_CODES.transitionUnauthorized)
        );
        this.logSaveOutcome(tracker, 'pre-save');
        return tracker.toResponse();
      }

      let currentFormFingerprint: string | undefined;
      const suppliedFormFingerprint = tracker.context.concurrency?.formFingerprint;
      const formFingerprintRequired = tracker.context.routeFamily === 'browser' && concurrencyMode === 'strict';
      if (suppliedFormFingerprint || formFingerprintRequired) {
        try {
          currentFormFingerprint = await this.getRecordFormFingerprint(
            recordObj,
            recordTypeObj,
            targetStepName ? wfStep : undefined
          );
        } catch (error) {
          tracker.recordPrimaryNotApplied(
            this.concurrencyProblem('pre-save', 'record-concurrency-capability-unavailable')
          );
          this.logSaveOutcome(tracker, 'pre-save', error);
          return tracker.toResponse();
        }
        if (!currentFormFingerprint) {
          tracker.recordPrimaryNotApplied(
            this.concurrencyProblem('pre-save', 'record-concurrency-capability-unavailable')
          );
          this.logSaveOutcome(tracker, 'pre-save');
          return tracker.toResponse();
        }
        if (!suppliedFormFingerprint || suppliedFormFingerprint !== currentFormFingerprint) {
          this.setConcurrencyMetadata(tracker, createOid, concurrencyMode, undefined, currentFormFingerprint);
          tracker.recordPrimaryNotApplied(this.concurrencyProblem('pre-save', 'form-definition-changed'));
          this.logSaveOutcome(tracker, 'pre-save');
          return tracker.toResponse();
        }
        this.setConcurrencyMetadata(tracker, createOid, concurrencyMode, undefined, currentFormFingerprint);
      }

      // Resolve the complete immutable plan before any registered action,
      // attachment journal, storage mutation, or detached dispatch can run.
      try {
        this.prepareRecordActionOperation({
          operation: hookOperation,
          recordType: recordTypeObj,
          recordTypeKey: recordTypeName,
          brandId,
          user: userObj,
          ...(targetStepName ? { transition: this.recordActionTransition(recordObj, wfStep) } : {}),
        });
      } catch (error) {
        tracker.recordPrimaryNotApplied(
          this.recordActionProblem(
            hookOperation,
            this.saveProblem('pre-save', 'Your changes were not saved.', 'processing', 'invalid-action-plan')
          )
        );
        this.logSaveOutcome(tracker, 'pre-save', error);
        return tracker.toResponse();
      }

      if (targetStepName) {
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
          tracker.recordPrimaryNotApplied(
            this.recordActionProblem(
              hookOperation,
              this.saveProblemFromError(error, 'pre-save', 'Your changes were not saved.')
            )
          );
          this.logSaveOutcome(tracker, 'pre-save', error);
          return tracker.toResponse();
        }
        // The transition hook intentionally observes the target workflow. Any
        // workflow metadata it returns is part of the authoritative candidate
        // and is not silently replaced after the hook completes.
        await this.refreshAttachmentFields(recordObj, undefined, brandObj);
      }

      let createResponse: StorageMutationResponse = new StorageMutationResponse();
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
          tracker.recordPrimaryNotApplied(
            this.recordActionProblem(
              hookOperation,
              this.saveProblemFromError(err, 'pre-save', 'Your changes were not saved.')
            )
          );
          this.logSaveOutcome(tracker, 'pre-save', err);
          return tracker.toResponse();
        }
      }

      if (
        !this.normalizeAuthoritativeCandidateContext(recordObj, undefined, recordTypeObj, brandObj, wfStep, createOid)
      ) {
        tracker.recordPrimaryNotApplied(
          this.validationProblem('system', 'pre-save', RECORD_VALIDATION_SAVE_CODES.authorityDivergence)
        );
        this.logSaveOutcome(tracker, 'pre-save');
        return tracker.toResponse();
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
        return tracker.toResponse();
      }
      for (const warning of validation.warnings) tracker.recordWarning(warning);
      recordObj = validation.candidate;

      const createAttachmentFields = (recordObj.metaMetadata?.attachmentFields ?? []) as unknown[];
      try {
        this.ensureAttachmentIds(recordObj, createAttachmentFields);
      } catch (error) {
        tracker.recordPrimaryNotApplied(this.attachmentIdentityProblem(error));
        this.logSaveOutcome(tracker, 'pre-save', error);
        return tracker.toResponse();
      }

      const createGeneration = tracker.context.requestId;
      const createAttachmentPlan = this.attachmentMutationPlan(
        { metadata: {} },
        recordObj,
        createAttachmentFields,
        createOid,
        createGeneration
      );
      this.markPlannedAttachmentReferencesPending(recordObj, createAttachmentPlan);
      try {
        await this.prepareAttachmentJournal(createOid, createAttachmentPlan);
      } catch (error) {
        await this.markAttachmentPlanState(createOid, createAttachmentPlan, 'cancelled', 'attachment-journal-failed');
        tracker.recordPrimaryNotApplied(
          this.saveProblem('pre-save', 'Your changes were not saved.', 'processing', 'attachment-journal-failed')
        );
        this.logSaveOutcome(tracker, 'pre-save', error);
        return tracker.toResponse();
      }

      // save the record ...
      sails.log.verbose(`${this.logHeader} create() -> recordObj before save: ${JSON.stringify(recordObj)}`);
      try {
        createResponse = await this.createStorageCandidate(
          brandObj,
          createOid,
          recordObj,
          recordTypeObj,
          userObj,
          this.recordMutationOptions(tracker.context)
        );
      } catch (error) {
        await this.markAttachmentPlanState(createOid, createAttachmentPlan, 'unknown', 'primary-persistence-unknown');
        tracker.recordPrimaryUnknown(
          this.saveProblem('persistence', 'The record save could not be confirmed.', 'system', 'save-unknown')
        );
        this.logSaveOutcome(tracker, 'persistence', error);
        return tracker.toResponse();
      }
      const primaryMutationState = resolveStorageMutationState(createResponse, this.logLegacyMutationResponse);
      if (primaryMutationState === 'applied') {
        tracker.confirmPrimaryPersistence(createOid, createResponse);
        hookOperation.completedThrough = 'persistence';
        const oid = createOid;
        let currentRevision = this.committedRevision(createResponse);
        if (currentRevision === undefined && hasFullRecordStorageConcurrencyCapability(this.storageService)) {
          tracker.recordPostPersistenceProblem(
            this.concurrencyProblem('persistence', 'record-concurrency-capability-unavailable')
          );
          this.logSaveOutcome(tracker, 'persistence');
          return await this.finishSave(
            tracker,
            userObj,
            RecordAuditActionType.created,
            recordTypeObj.searchable !== false
          );
        }
        // Legacy last-write-wins adapters may omit the fact; keeping their
        // historical follow-up path is compatibility-only. Strict-capable
        // adapters are required to return the actual initialized revision.
        currentRevision ??= INITIAL_RECORD_REVISION;
        if (this.committedRevision(createResponse) !== undefined) recordObj.revision = currentRevision;
        this.setConcurrencyMetadata(tracker, oid, concurrencyMode, currentRevision, currentFormFingerprint);
        sails.log.verbose(`RecordsService - create - oid ${oid}`);
        const recordMetadata = recordObj.metadata as AnyRecord;
        const attachmentFields = (recordObj.metaMetadata?.attachmentFields ?? []) as unknown[];
        if (createAttachmentPlan.length > 0) {
          this.bindPendingAttachmentOids(recordMetadata, attachmentFields, oid, false);
          const attachmentItems = await this.executeAttachmentPlan(oid, createAttachmentPlan);
          tracker.setAttachmentItems(attachmentItems);
          if (attachmentItems.some(item => item.status !== 'completed')) {
            tracker.recordPostPersistenceProblem(
              this.saveProblem(
                'attachments',
                'Your record was saved, but one or more attachments could not be finalized.',
                'processing',
                'attachment-finalization-failed'
              )
            );
            this.logSaveOutcome(tracker, 'attachments');
            return await this.finishSave(
              tracker,
              userObj,
              RecordAuditActionType.created,
              recordTypeObj.searchable !== false
            );
          }
          try {
            const attachmentReferenceResponse = await this.finalizeAttachmentReferences(
              brandObj,
              oid,
              recordObj,
              userObj,
              attachmentFields,
              currentRevision,
              tracker.context
            );
            const attachmentReferenceState = resolveStorageMutationState(
              attachmentReferenceResponse,
              this.logLegacyMutationResponse
            );
            const attachmentReferenceRevision = this.chainedCommittedRevision(
              attachmentReferenceResponse,
              currentRevision
            );
            if (attachmentReferenceState !== 'applied' || attachmentReferenceRevision === undefined) {
              await this.markAttachmentPlanState(
                oid,
                createAttachmentPlan,
                attachmentReferenceState === 'unknown' ? 'unknown' : 'incomplete',
                'attachment-reference-finalization-failed'
              );
              tracker.recordPostPersistenceProblem(
                this.chainedMutationProblem(
                  'attachments',
                  attachmentReferenceResponse,
                  'attachment-reference-finalization-failed'
                )
              );
              this.logSaveOutcome(tracker, 'attachments');
              return await this.finishSave(
                tracker,
                userObj,
                RecordAuditActionType.created,
                recordTypeObj.searchable !== false
              );
            }
            currentRevision = attachmentReferenceRevision;
            if (this.committedRevision(attachmentReferenceResponse) !== undefined) {
              recordObj.revision = currentRevision;
            }
            this.setConcurrencyMetadata(tracker, oid, concurrencyMode, currentRevision, currentFormFingerprint);
            this.clearPendingAttachmentOids(recordMetadata, attachmentFields);
          } catch (error) {
            await this.markAttachmentPlanState(
              oid,
              createAttachmentPlan,
              'unknown',
              'attachment-reference-finalization-failed'
            );
            tracker.recordPostPersistenceProblem(
              this.saveProblem(
                'attachments',
                'Your record was saved, but attachment references could not be finalized.',
                'processing',
                'attachment-reference-finalization-failed'
              )
            );
            this.logSaveOutcome(tracker, 'attachments', error);
            return await this.finishSave(
              tracker,
              userObj,
              RecordAuditActionType.created,
              recordTypeObj.searchable !== false
            );
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
              tracker.recordPostPersistenceProblem(
                this.recordActionProblem(
                  hookOperation,
                  this.saveProblem(
                    'post-save',
                    'Your record was saved, but follow-up processing could not be completed.',
                    'processing',
                    'post-save-failed'
                  )
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
            // The awaited post-sync phase succeeded; later work is detached.
            hookOperation.completedThrough = 'postSync';
            if (this.hasPostSaveSyncHooks(recordTypeObj, 'onCreate', hookOperation)) {
              const hookMutationState = await this.persistPostSyncCandidate({
                brand: brandObj,
                oid,
                beforeCandidate: beforePostSync,
                candidate: postSyncCandidate,
                user: userObj,
                context: tracker.context,
                expectedRevision: currentRevision,
                writeKind: 'create',
                recordType: recordTypeObj,
                targetStep: targetStepName ? wfStep : undefined,
                authoritativeStep: wfStep,
                requiresTransitionAuthorization: Boolean(targetStepName),
              });
              if (hookMutationState.status === 'validation-failed') {
                tracker.recordPostPersistenceProblem(
                  this.recordActionProblem(hookOperation, hookMutationState.problem)
                );
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
              const postSyncRevision = this.chainedCommittedRevision(hookMutationState.response, currentRevision);
              if (hookMutationState.status !== 'applied' || postSyncRevision === undefined) {
                tracker.recordPostPersistenceProblem(
                  this.recordActionProblem(
                    hookOperation,
                    this.chainedMutationProblem('post-save', hookMutationState.response, 'post-save-metadata-failed')
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
              currentRevision = postSyncRevision;
              if (this.committedRevision(hookMutationState.response) !== undefined) {
                recordObj.revision = currentRevision;
              }
              this.setConcurrencyMetadata(tracker, oid, concurrencyMode, currentRevision, currentFormFingerprint);
            }
          } catch (err) {
            sails.log.error(
              `${this.logHeader} Exception while running post save sync hooks when creating: ${createResponse['oid']}`
            );
            sails.log.error(JSON.stringify(err));
            tracker.recordPostPersistenceProblem(
              this.recordActionProblem(
                hookOperation,
                this.saveProblemFromError(
                  err,
                  'post-save',
                  'Your record was saved, but follow-up processing could not be completed.',
                  'processing',
                  'post-save-failed'
                )
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
                if (this.hasPostSaveSyncHooks(recordTypeObj, 'onTransitionWorkflow', hookOperation)) {
                  const transitionMutationState = await this.persistPostSyncCandidate({
                    brand: brandObj,
                    oid,
                    beforeCandidate: beforeTransitionPostSync,
                    candidate: transitionCandidate,
                    user: userObj,
                    context: tracker.context,
                    expectedRevision: currentRevision,
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
                    const transitionRevision = this.chainedCommittedRevision(
                      transitionMutationState.response,
                      currentRevision
                    );
                    if (transitionMutationState.status !== 'applied' || transitionRevision === undefined) {
                      transitionProblem = this.chainedMutationProblem(
                        'post-save',
                        transitionMutationState.response,
                        'transition-metadata-failed'
                      );
                    } else {
                      currentRevision = transitionRevision;
                      if (this.committedRevision(transitionMutationState.response) !== undefined) {
                        recordObj.revision = currentRevision;
                      }
                      this.setConcurrencyMetadata(
                        tracker,
                        oid,
                        concurrencyMode,
                        currentRevision,
                        currentFormFingerprint
                      );
                    }
                  }
                }
              } else {
                transitionProblem = this.saveProblem(
                  'post-save',
                  'Your record was saved, but workflow processing could not be completed.',
                  'processing',
                  'transition-failed'
                );
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
                tracker.recordPostPersistenceProblem(this.recordActionProblem(hookOperation, transitionProblem));
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
                this.recordActionProblem(
                  hookOperation,
                  this.saveProblemFromError(
                    tErr,
                    'post-save',
                    'Your record was saved, but workflow processing could not be completed.',
                    'processing',
                    'transition-failed'
                  )
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
          await this.markAttachmentPlanState(createOid, createAttachmentPlan, 'cancelled', 'save-not-applied');
          tracker.recordPrimaryNotApplied(
            createResponse.nonApplicationReason === 'lifecycle-conflict'
              ? this.concurrencyProblem('persistence', 'record-lifecycle-operation-conflict')
              : createResponse.nonApplicationReason === 'capability-unavailable'
                ? this.concurrencyProblem('persistence', 'record-concurrency-capability-unavailable')
                : this.saveProblem('persistence', 'The record was not saved.', 'processing', 'save-not-applied')
          );
        } else {
          await this.markAttachmentPlanState(createOid, createAttachmentPlan, 'unknown', 'primary-persistence-unknown');
          tracker.recordPrimaryUnknown(
            this.saveProblem('persistence', 'The record save could not be confirmed.', 'system', 'save-unknown')
          );
        }
        this.logSaveOutcome(tracker, 'persistence');
      }
      return await this.finishSave(tracker, userObj, RecordAuditActionType.created, recordTypeObj.searchable !== false);
    }

    /**
     * Save a full internal candidate against the revision carried by the
     * authoritative snapshot from which it was derived. These mutation
     * classes are deliberately never replayed: callers receive the typed
     * stale/unknown outcome and must let their owning job or audit decide what
     * to do next.
     */
    public async updateMetaInternal(options: InternalRecordSnapshotSaveOptions): Promise<RecordSaveResponse> {
      const oid = typeof options?.oid === 'string' ? options.oid.trim() : '';
      const writerId = this.internalWriterId(options?.actor);
      const authorization = this.internalAuthorizationKind(options?.authorization);
      const mutationClass = options?.mutationClass;
      const validMutationClass =
        mutationClass === 'full-record' || mutationClass === 'transition' || mutationClass === 'external-side-effect';
      const candidate = this.recordObject(options?.record);
      const expectedRevision = this.recordRevision(candidate);
      if (
        !RECORD_VALIDATION_REFERENCE_PATTERN.test(oid) ||
        !writerId ||
        !authorization ||
        !validMutationClass ||
        !this.isUsableRecordSnapshot(candidate) ||
        expectedRevision === undefined ||
        (mutationClass === 'transition') !== (options?.operation === 'transition') ||
        String(candidate.redboxOid ?? '').trim() !== oid
      ) {
        return this.internalMutationFailure(
          oid,
          'system',
          'internal-record-mutation-contract-invalid',
          options?.causedByRequestId,
          expectedRevision
        );
      }

      let current: AnyRecord;
      try {
        const loaded = await this.getMeta(oid);
        if (!this.isUsableRecordSnapshot(loaded)) {
          return this.internalMutationFailure(
            oid,
            'system',
            'internal-record-snapshot-unavailable',
            options.causedByRequestId,
            expectedRevision
          );
        }
        current = loaded as unknown as AnyRecord;
      } catch {
        return this.internalMutationFailure(
          oid,
          'system',
          'internal-record-snapshot-unavailable',
          options.causedByRequestId,
          expectedRevision
        );
      }

      const brand = this.internalMutationBrand(current, options.brand);
      const suppliedUser = this.recordObject(options.user);
      const actorUser = this.internalMutationActor(options.actor, options.user);
      if (!brand) {
        return this.internalMutationFailure(
          oid,
          'authorization',
          'internal-record-brand-unauthorized',
          options.causedByRequestId,
          expectedRevision
        );
      }
      if (
        (authorization === 'record-edit' && !String(suppliedUser.username ?? '').trim()) ||
        !this.internalRecordEditAuthorized(authorization, brand, actorUser, current)
      ) {
        return this.internalMutationFailure(
          oid,
          'authorization',
          'internal-record-mutation-unauthorized',
          options.causedByRequestId,
          expectedRevision
        );
      }

      return await this.updateMeta(
        brand,
        oid,
        candidate,
        actorUser,
        options.triggerPreSaveTriggers ?? true,
        options.triggerPostSaveTriggers ?? true,
        options.targetStep ?? {},
        options.metadata,
        createRecordSaveContext({
          routeFamily: 'internal',
          operation: options.operation ?? 'update',
          targetStep:
            options.operation === 'transition'
              ? this.workflowStepName(options.targetStep as WorkflowStepLike)
              : undefined,
          validationRuntimeContext: {
            internalWriterId: writerId,
            internalMutationClass: mutationClass,
          },
          concurrency: {
            expectedRevision,
            entityTagSupplied: false,
            resolution: 'internal',
            ...(options.causedByRequestId ? { resolutionOfRequestId: options.causedByRequestId } : {}),
          },
        })
      );
    }

    /**
     * Reload and recompute a targeted mutation. Only this explicitly declared,
     * synchronous mutation shape can retry a conflict, and every attempt runs
     * through updateMetaInternal/W04 with a fresh request identity.
     */
    public async mutateMetaInternal(options: InternalRecomputableMutationOptions): Promise<RecordSaveResponse> {
      const oid = typeof options?.oid === 'string' ? options.oid.trim() : '';
      const writerId = this.internalWriterId(options?.actor);
      const authorization = this.internalAuthorizationKind(options?.authorization);
      const retry = options?.retry;
      const retryValid =
        retry === undefined ||
        (retry.idempotent === true &&
          retry.recomputable === true &&
          Number.isInteger(retry.maxAttempts) &&
          retry.maxAttempts >= 1 &&
          retry.maxAttempts <= INTERNAL_RECORD_MUTATION_MAX_ATTEMPTS);
      if (
        !RECORD_VALIDATION_REFERENCE_PATTERN.test(oid) ||
        !writerId ||
        !authorization ||
        typeof options?.mutate !== 'function' ||
        !retryValid
      ) {
        return this.internalMutationFailure(
          oid,
          'system',
          'internal-record-mutation-contract-invalid',
          options?.causedByRequestId
        );
      }

      const maxAttempts = retry?.maxAttempts ?? 1;
      let causedByRequestId = options.causedByRequestId;
      for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
        let snapshot: AnyRecord;
        try {
          const loaded = await this.getMeta(oid);
          if (!this.isUsableRecordSnapshot(loaded)) {
            return this.internalMutationFailure(
              oid,
              'system',
              'internal-record-snapshot-unavailable',
              causedByRequestId
            );
          }
          snapshot = _.cloneDeep(loaded) as unknown as AnyRecord;
        } catch {
          return this.internalMutationFailure(oid, 'system', 'internal-record-snapshot-unavailable', causedByRequestId);
        }

        const revision = this.recordRevision(snapshot);
        if (revision === undefined || String(snapshot.redboxOid ?? '').trim() !== oid) {
          return this.internalMutationFailure(
            oid,
            'system',
            'internal-record-mutation-contract-invalid',
            causedByRequestId,
            revision
          );
        }

        let candidate: AnyRecord;
        try {
          const computed = options.mutate(_.cloneDeep(snapshot) as unknown as RecordModel);
          if (!this.isUsableRecordSnapshot(computed)) {
            throw new TypeError('Internal mutation did not return a complete record candidate.');
          }
          candidate = _.cloneDeep(computed) as AnyRecord;
        } catch {
          return this.internalMutationFailure(
            oid,
            'processing',
            'internal-record-mutation-compute-failed',
            causedByRequestId,
            revision
          );
        }
        if (String(candidate.redboxOid ?? '').trim() !== oid) {
          return this.internalMutationFailure(
            oid,
            'system',
            'internal-record-mutation-contract-invalid',
            causedByRequestId,
            revision
          );
        }
        // Revision is server-owned. The recompute callback cannot copy, clear,
        // or manufacture a different expected revision.
        candidate.revision = revision;

        const response = await this.updateMetaInternal({
          actor: options.actor,
          authorization: options.authorization,
          mutationClass: 'full-record',
          oid,
          record: candidate,
          brand: options.brand,
          user: options.user,
          triggerPreSaveTriggers: options.triggerPreSaveTriggers,
          triggerPostSaveTriggers: options.triggerPostSaveTriggers,
          causedByRequestId,
        });
        const revisionConflict = this.isInternalRevisionConflict(response);
        if (revisionConflict) {
          emitRecordConcurrencyEvent({
            kind: 'internal-retry',
            routeFamily: 'internal',
            writeKind: 'update',
            phase: 'persistence',
            outcome: attempt === maxAttempts ? 'exhausted' : 'attempted',
            mode: response.concurrency?.mode,
            expectedRevision: revision,
            currentRevision: response.concurrency?.currentRevision ?? response.concurrency?.revision,
            precondition: 'stale',
            problemKind: 'conflict',
            problemCode: 'record-revision-stale',
            resolution: 'internal',
          });
        }
        if (!revisionConflict || attempt === maxAttempts) {
          return response;
        }
        causedByRequestId = response.requestId;
      }

      return this.internalMutationFailure(
        oid,
        'system',
        'internal-record-mutation-contract-invalid',
        causedByRequestId
      );
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
      const tracker = new RecordSaveTracker(
        createRecordSaveContext({
          ...(context ?? {}),
          operation: context?.operation ?? (transitionRequested ? 'transition' : 'update'),
        })
      );
      const hookOperation = this.registerSaveHookOperation(
        tracker,
        this.createHookExecutionOperation(
          transitionRequested ? 'onTransitionWorkflow' : 'onUpdate',
          tracker.context.requestId,
          oid
        )
      );
      let brandObj = brand as BrandingModel;
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
      const storedBrandId = String(this.recordObject(originalRecord?.metaMetadata).brandId ?? '').trim();
      if (!String(brandObj?.id ?? '').trim() && storedBrandId) {
        brandObj = BrandingService.getBrandById(storedBrandId);
      }
      // Keep the caller/hook mutation object separate until the authoritative
      // candidate has been merged, normalized, and validated.
      let recordObj = this.normalizeRecord(requestedRecord);
      const userObj = this.recordObject(user);
      let nextStepObj = (nextStep ?? {}) as WorkflowStepLike;
      let updateResponse: StorageMutationResponse = new StorageMutationResponse();
      updateResponse.oid = oid;
      if (originalRecord !== undefined && !this.normalizeUpdateCandidateIdentity(originalRecord, oid)) {
        tracker.recordPrimaryNotApplied(
          this.validationProblem('system', 'pre-save', RECORD_VALIDATION_SAVE_CODES.authorityDivergence)
        );
        this.logSaveOutcome(tracker, 'pre-save');
        return tracker.toResponse();
      }
      if (tracker.context.validationBypass !== undefined && tracker.context.routeFamily !== 'internal') {
        tracker.recordPrimaryNotApplied(
          this.validationProblem('system', 'pre-save', RECORD_VALIDATION_SAVE_CODES.bypassForbidden)
        );
        this.logSaveOutcome(tracker, 'pre-save');
        return tracker.toResponse();
      }
      if ((tracker.context.routeFamily === 'api' || tracker.context.routeFamily === 'browser') && !originalRecord) {
        tracker.recordPrimaryNotApplied(
          this.validationProblem('system', 'pre-save', RECORD_VALIDATION_SAVE_CODES.snapshotUnavailable)
        );
        this.logSaveOutcome(tracker, 'pre-save');
        return tracker.toResponse();
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
        return tracker.toResponse();
      }
      if (!this.hasPublicEditAuthorization(tracker.context, brandObj, userObj, originalRecord)) {
        tracker.recordPrimaryNotApplied(
          this.validationProblem('authorization', 'pre-save', RECORD_VALIDATION_SAVE_CODES.editUnauthorized)
        );
        this.logSaveOutcome(tracker, 'pre-save');
        return tracker.toResponse();
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
        return tracker.toResponse();
      }
      const recordTypeName = originalRecord ? storedRecordTypeName : String(requestedMeta.type ?? '').trim();
      const parsedTarget = this.parseRequestedWorkflowTarget(
        tracker.context.targetStep,
        this.workflowStepName(nextStepObj),
        transitionRequested
      );
      const requestedTargetName = parsedTarget.ok ? parsedTarget.name : undefined;

      let recordType: RecordTypeLike | null = null;
      if (recordTypeName) {
        recordType = (await firstValueFrom(RecordTypesService.get(brandObj, recordTypeName))) as RecordTypeLike | null;
      }
      let targetDiagnostic: WorkflowTargetDiagnosticCode | undefined;
      if (transitionRequested && requestedTargetName) {
        try {
          if (!recordType) throw new Error('The authoritative record type is unavailable.');
          nextStepObj = (await firstValueFrom(
            WorkflowStepsService.get(recordType, requestedTargetName)
          )) as WorkflowStepLike;
        } catch {
          nextStepObj = {};
        }
        targetDiagnostic = this.resolvedWorkflowTargetDiagnostic(nextStepObj, requestedTargetName);
      }

      // Transition authority is part of current authorization and therefore
      // precedes every revision/fingerprint diagnostic.
      if (
        transitionRequested &&
        requestedTargetName &&
        !targetDiagnostic &&
        !this.hasTransitionRoleAuthorization(nextStepObj, userObj)
      ) {
        tracker.recordPrimaryNotApplied(
          this.validationProblem('authorization', 'pre-save', RECORD_VALIDATION_SAVE_CODES.transitionUnauthorized)
        );
        this.logSaveOutcome(tracker, 'pre-save');
        return tracker.toResponse();
      }

      let concurrencyMode: RecordConcurrentModificationMode;
      // Legacy internal callers historically continue to validation when an
      // adapter cannot supply a pre-update snapshot. Public routes already
      // fail closed above, and a supplied precondition may never use this
      // compatibility baseline.
      let currentRevision = originalRecord
        ? this.recordRevision(originalRecord)
        : tracker.context.concurrency?.expectedRevision === undefined
          ? INITIAL_RECORD_REVISION
          : undefined;
      try {
        concurrencyMode = this.resolveConcurrencyMode(recordType);
      } catch (error) {
        tracker.recordPrimaryNotApplied(
          this.concurrencyProblem('pre-save', 'record-concurrency-capability-unavailable')
        );
        this.logSaveOutcome(tracker, 'pre-save', error);
        return tracker.toResponse();
      }
      if (currentRevision === undefined) {
        tracker.recordPrimaryNotApplied(
          this.concurrencyProblem('pre-save', 'record-concurrency-capability-unavailable')
        );
        this.logSaveOutcome(tracker, 'pre-save');
        return tracker.toResponse();
      }

      const expectedRevision = tracker.context.concurrency?.expectedRevision;
      const publicRoute = tracker.context.routeFamily === 'api' || tracker.context.routeFamily === 'browser';
      const suppliedUnusableEntityTag =
        publicRoute && tracker.context.concurrency?.entityTagSupplied === true && expectedRevision === undefined;
      const strongConcurrencyRequired = concurrencyMode === 'strict' || expectedRevision !== undefined;
      if (strongConcurrencyRequired && !hasFullRecordStorageConcurrencyCapability(this.storageService)) {
        this.setConcurrencyMetadata(tracker, oid, concurrencyMode, currentRevision);
        tracker.recordPrimaryNotApplied(
          this.concurrencyProblem('pre-save', 'record-concurrency-capability-unavailable')
        );
        this.logSaveOutcome(tracker, 'pre-save');
        return tracker.toResponse();
      }
      if (suppliedUnusableEntityTag) {
        this.setConcurrencyMetadata(tracker, oid, concurrencyMode, currentRevision);
        tracker.recordPrimaryNotApplied(
          this.concurrencyProblem('pre-save', 'record-concurrency-capability-unavailable')
        );
        this.logSaveOutcome(tracker, 'pre-save');
        return tracker.toResponse();
      }
      if (concurrencyMode === 'strict' && expectedRevision === undefined) {
        this.setConcurrencyMetadata(tracker, oid, concurrencyMode, currentRevision);
        tracker.recordPrimaryNotApplied(this.concurrencyProblem('pre-save', 'record-precondition-required'));
        this.logSaveOutcome(tracker, 'pre-save');
        return tracker.toResponse();
      }
      let currentFormFingerprint: string | undefined;
      if (tracker.context.concurrency?.formFingerprint) {
        try {
          currentFormFingerprint = await this.getRecordFormFingerprint(
            originalRecord as AnyRecord,
            recordType as RecordTypeLike,
            transitionRequested && requestedTargetName && !targetDiagnostic ? nextStepObj : undefined
          );
        } catch (error) {
          tracker.recordPrimaryNotApplied(
            this.concurrencyProblem('pre-save', 'record-concurrency-capability-unavailable')
          );
          this.logSaveOutcome(tracker, 'pre-save', error);
          return tracker.toResponse();
        }
        if (!currentFormFingerprint) {
          tracker.recordPrimaryNotApplied(
            this.concurrencyProblem('pre-save', 'record-concurrency-capability-unavailable')
          );
          this.logSaveOutcome(tracker, 'pre-save');
          return tracker.toResponse();
        }
      }
      this.setConcurrencyMetadata(tracker, oid, concurrencyMode, currentRevision, currentFormFingerprint);

      // Revision remains the first conflict diagnostic, but the latest form
      // fingerprint is computed above so the browser can decide whether the
      // returned representation is safe to rebase.
      if (expectedRevision !== undefined && expectedRevision !== currentRevision) {
        tracker.recordPrimaryNotApplied(this.concurrencyProblem('pre-save', 'record-revision-stale'));
        this.logSaveOutcome(tracker, 'pre-save');
        return tracker.toResponse();
      }
      if (currentFormFingerprint && tracker.context.concurrency?.formFingerprint !== currentFormFingerprint) {
        tracker.recordPrimaryNotApplied(this.concurrencyProblem('pre-save', 'form-definition-changed'));
        this.logSaveOutcome(tracker, 'pre-save');
        return tracker.toResponse();
      }

      if (!parsedTarget.ok) {
        tracker.recordPrimaryNotApplied(
          this.workflowTargetProblem(tracker.context, recordType, recordTypeName, parsedTarget.diagnosticCode)
        );
        this.logSaveOutcome(tracker, 'pre-save');
        return tracker.toResponse();
      }
      if (transitionRequested && !requestedTargetName) {
        tracker.recordPrimaryNotApplied(
          this.workflowTargetProblem(
            tracker.context,
            recordType,
            recordTypeName,
            RECORD_VALIDATION_DIAGNOSTIC_CODES.workflowStepReferenceMalformed
          )
        );
        this.logSaveOutcome(tracker, 'pre-save');
        return tracker.toResponse();
      }
      if (targetDiagnostic) {
        tracker.recordPrimaryNotApplied(
          this.workflowTargetProblem(tracker.context, recordType, recordTypeName, targetDiagnostic)
        );
        this.logSaveOutcome(tracker, 'pre-save');
        return tracker.toResponse();
      }

      // A stored record's identity, brand, type, current workflow, and form are
      // authoritative. Candidate normalization deliberately follows revision
      // and form checks so an obsolete invalid payload receives the stale fact.
      if (
        !this.normalizeAuthoritativeCandidateContext(recordObj, originalRecord, undefined, brandObj, undefined, oid)
      ) {
        tracker.recordPrimaryNotApplied(
          this.validationProblem('system', 'pre-save', RECORD_VALIDATION_SAVE_CODES.authorityDivergence)
        );
        this.logSaveOutcome(tracker, 'pre-save');
        return tracker.toResponse();
      }

      try {
        this.prepareRecordActionOperation({
          operation: hookOperation,
          recordType,
          recordTypeKey: recordTypeName,
          brandId: String(brandObj.id ?? '').trim(),
          user: userObj,
          current: originalRecord,
          ...(transitionRequested
            ? { transition: this.recordActionTransition(recordObj, nextStepObj, originalRecord) }
            : {}),
        });
      } catch (error) {
        tracker.recordPrimaryNotApplied(
          this.recordActionProblem(
            hookOperation,
            this.saveProblem('pre-save', 'Your changes were not saved.', 'processing', 'invalid-action-plan')
          )
        );
        this.logSaveOutcome(tracker, 'pre-save', error);
        return tracker.toResponse();
      }

      if (transitionRequested) {
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
            tracker.recordPrimaryNotApplied(
              this.recordActionProblem(
                hookOperation,
                this.saveProblemFromError(err, 'pre-save', 'Your changes were not saved.')
              )
            );
            this.logSaveOutcome(tracker, 'pre-save', err);
            return tracker.toResponse();
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
          tracker.recordPrimaryNotApplied(
            this.recordActionProblem(
              hookOperation,
              this.saveProblemFromError(err, 'pre-save', 'Your changes were not saved.')
            )
          );
          this.logSaveOutcome(tracker, 'pre-save', err);
          return tracker.toResponse();
        }
      }

      const authoritativeStep = transitionRequested ? nextStepObj : undefined;
      if (
        !this.normalizeAuthoritativeCandidateContext(
          recordObj,
          originalRecord,
          recordType,
          brandObj,
          authoritativeStep,
          oid
        )
      ) {
        tracker.recordPrimaryNotApplied(
          this.validationProblem('system', 'pre-save', RECORD_VALIDATION_SAVE_CODES.authorityDivergence)
        );
        this.logSaveOutcome(tracker, 'pre-save');
        return tracker.toResponse();
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
          return tracker.toResponse();
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
        return tracker.toResponse();
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
        tracker.recordPrimaryNotApplied(
          this.saveProblem('pre-save', 'Your changes were not saved.', 'processing', 'attachment-journal-failed')
        );
        this.logSaveOutcome(tracker, 'pre-save', error);
        return tracker.toResponse();
      }
      if (unresolvedAttachmentRows.some(row => row.mutationState === 'pending' || row.mutationState === 'unknown')) {
        tracker.recordPrimaryNotApplied(
          this.saveProblem('pre-save', 'Your changes were not saved.', 'system', 'attachment-recovery-required')
        );
        this.logSaveOutcome(tracker, 'pre-save');
        return tracker.toResponse();
      }
      const updateAttachmentPlan = this.attachmentMutationPlan(
        originalRecord ?? origRecordObj,
        recordObj,
        attachmentFields,
        oid,
        updateGeneration,
        unresolvedAttachmentRows
      );
      this.markPlannedAttachmentReferencesPending(recordObj, updateAttachmentPlan);
      try {
        await this.prepareAttachmentJournal(oid, updateAttachmentPlan);
      } catch (error) {
        await this.markAttachmentPlanState(oid, updateAttachmentPlan, 'cancelled', 'attachment-journal-failed');
        tracker.recordPrimaryNotApplied(
          this.saveProblem('pre-save', 'Your changes were not saved.', 'processing', 'attachment-journal-failed')
        );
        this.logSaveOutcome(tracker, 'pre-save', error);
        return tracker.toResponse();
      }

      sails.log.verbose(`RecordService - updateMeta - before storageService.updateMeta`);
      // Primary metadata is the commit boundary.  Physical attachment work
      // must not run until this mutation is explicitly confirmed applied.
      try {
        const adapterResponse = await this.updateStorageCandidate(
          brandObj,
          oid,
          recordObj,
          userObj,
          this.recordMutationOptions(tracker.context, expectedRevision, expectedRevision !== undefined)
        );
        updateResponse = this.routeBoundStorageResponse(adapterResponse, oid);
      } catch (error) {
        await this.markAttachmentPlanState(oid, updateAttachmentPlan, 'unknown', 'primary-persistence-unknown');
        tracker.recordPrimaryUnknown(
          this.saveProblem(
            'persistence',
            'We could not confirm whether your changes were saved.',
            'system',
            'save-unknown'
          )
        );
        this.logSaveOutcome(tracker, 'persistence', error);
        return tracker.toResponse();
      }
      const primaryUpdateMutationState = resolveStorageMutationState(updateResponse, this.logLegacyMutationResponse);
      sails.log.verbose('RecordService - updateMeta - mutation state ' + primaryUpdateMutationState);
      if (primaryUpdateMutationState === 'not-applied') {
        await this.markAttachmentPlanState(oid, updateAttachmentPlan, 'cancelled', 'primary-not-applied');
        const conflictCode = this.storageConflictCode(updateResponse.nonApplicationReason);
        if (conflictCode) {
          if (conflictCode === 'record-deleted') currentRevision = undefined;
          try {
            const latestRecord = (await this.getMeta(oid)) as unknown as AnyRecord;
            const latestBrandId = String(this.recordObject(latestRecord.metaMetadata).brandId ?? '').trim();
            if (
              publicRoute &&
              (latestBrandId !== String(brandObj.id ?? '').trim() ||
                !this.hasPublicEditAuthorization(tracker.context, brandObj, userObj, latestRecord))
            ) {
              tracker.setConcurrencyMetadata(undefined);
              tracker.recordPrimaryNotApplied(
                this.validationProblem('authorization', 'persistence', RECORD_VALIDATION_SAVE_CODES.editUnauthorized)
              );
              this.logSaveOutcome(tracker, 'persistence');
              return tracker.toResponse();
            }
            const latestRevision = this.recordRevision(latestRecord);
            if (latestRevision !== undefined) currentRevision = latestRevision;
            if (tracker.context.concurrency?.formFingerprint) {
              try {
                currentFormFingerprint = await this.getRecordFormFingerprint(
                  latestRecord,
                  recordType as RecordTypeLike
                );
              } catch {
                // The mutation is already certified not-applied. Omitting an
                // unprovable fingerprint safely disables browser rebase.
                currentFormFingerprint = undefined;
              }
            }
          } catch {
            // A deleted/inaccessible latest state deliberately contributes no
            // record data; the adapter's bounded no-write reason remains safe.
          }
          this.setConcurrencyMetadata(tracker, oid, concurrencyMode, currentRevision, currentFormFingerprint);
          tracker.recordPrimaryNotApplied(this.concurrencyProblem('persistence', conflictCode));
        } else if (updateResponse.nonApplicationReason === 'capability-unavailable') {
          tracker.recordPrimaryNotApplied(
            this.concurrencyProblem('persistence', 'record-concurrency-capability-unavailable')
          );
        } else {
          tracker.recordPrimaryNotApplied(
            this.saveProblem('persistence', 'Your changes were not saved.', 'processing', 'save-not-applied')
          );
        }
        this.logSaveOutcome(tracker, 'persistence');
        return tracker.toResponse();
      }
      if (primaryUpdateMutationState === 'unknown') {
        await this.markAttachmentPlanState(oid, updateAttachmentPlan, 'unknown', 'primary-persistence-unknown');
        tracker.recordPrimaryUnknown(
          this.saveProblem(
            'persistence',
            'We could not confirm whether your changes were saved.',
            'system',
            'save-unknown'
          )
        );
        this.logSaveOutcome(tracker, 'persistence');
        return tracker.toResponse();
      }
      tracker.confirmPrimaryPersistence(oid, updateResponse);
      hookOperation.completedThrough = 'persistence';
      const primaryCommittedRevision = this.committedRevision(updateResponse);
      if (primaryCommittedRevision !== undefined) {
        currentRevision = primaryCommittedRevision;
        recordObj.revision = primaryCommittedRevision;
        this.setConcurrencyMetadata(tracker, oid, concurrencyMode, currentRevision, currentFormFingerprint);
      } else if (hasFullRecordStorageConcurrencyCapability(this.storageService)) {
        tracker.recordPostPersistenceProblem(
          this.concurrencyProblem('persistence', 'record-concurrency-capability-unavailable')
        );
        this.logSaveOutcome(tracker, 'persistence');
        return await this.finishSave(tracker, userObj, RecordAuditActionType.updated, recordType?.searchable !== false);
      }

      if (updateAttachmentPlan.length > 0) {
        const attachmentItems = await this.executeAttachmentPlan(oid, updateAttachmentPlan);
        tracker.setAttachmentItems(attachmentItems);
        if (attachmentItems.some(item => item.status !== 'completed')) {
          tracker.recordPostPersistenceProblem(
            this.saveProblem(
              'attachments',
              'Your changes were saved, but one or more attachments could not be finalized.',
              'processing',
              'attachment-finalization-failed'
            )
          );
          this.logSaveOutcome(tracker, 'attachments');
          return await this.finishSave(
            tracker,
            userObj,
            RecordAuditActionType.updated,
            recordType?.searchable !== false
          );
        }
        try {
          const attachmentReferenceResponse = await this.finalizeAttachmentReferences(
            brandObj,
            oid,
            recordObj,
            userObj,
            attachmentFields,
            currentRevision,
            tracker.context
          );
          const attachmentReferenceState = resolveStorageMutationState(
            attachmentReferenceResponse,
            this.logLegacyMutationResponse
          );
          const attachmentReferenceRevision = this.chainedCommittedRevision(
            attachmentReferenceResponse,
            currentRevision
          );
          if (attachmentReferenceState !== 'applied' || attachmentReferenceRevision === undefined) {
            await this.markAttachmentPlanState(
              oid,
              updateAttachmentPlan,
              attachmentReferenceState === 'unknown' ? 'unknown' : 'incomplete',
              'attachment-reference-finalization-failed'
            );
            tracker.recordPostPersistenceProblem(
              attachmentReferenceState === 'not-applied' &&
                this.storageConflictCode(attachmentReferenceResponse.nonApplicationReason)
                ? this.concurrencyProblem(
                    'attachments',
                    this.storageConflictCode(attachmentReferenceResponse.nonApplicationReason)!
                  )
                : this.saveProblem(
                    'attachments',
                    'Your changes were saved, but attachment references could not be finalized.',
                    attachmentReferenceState === 'unknown' ? 'system' : 'processing',
                    'attachment-reference-finalization-failed'
                  )
            );
            this.logSaveOutcome(tracker, 'attachments');
            return await this.finishSave(
              tracker,
              userObj,
              RecordAuditActionType.updated,
              recordType?.searchable !== false
            );
          }
          currentRevision = attachmentReferenceRevision;
          if (this.committedRevision(attachmentReferenceResponse) !== undefined) {
            recordObj.revision = currentRevision;
          }
          this.setConcurrencyMetadata(tracker, oid, concurrencyMode, currentRevision, currentFormFingerprint);
          this.clearPendingAttachmentOids(recordObj.metadata as AnyRecord, attachmentFields);
        } catch (error) {
          await this.markAttachmentPlanState(
            oid,
            updateAttachmentPlan,
            'unknown',
            'attachment-reference-finalization-failed'
          );
          tracker.recordPostPersistenceProblem(
            this.saveProblem(
              'attachments',
              'Your changes were saved, but attachment references could not be finalized.',
              'processing',
              'attachment-reference-finalization-failed'
            )
          );
          this.logSaveOutcome(tracker, 'attachments', error);
          return await this.finishSave(
            tracker,
            userObj,
            RecordAuditActionType.updated,
            recordType?.searchable !== false
          );
        }
      }

      // Post-persistence phases only run once the commit is confirmed.  Using
      // isComplete() here would conflate "persisted" with "no warnings yet".
      if (tracker.result.wasPersisted()) {
        //if triggerPreSaveTriggers is false recordType will be empty even if triggerPostSaveTriggers is true
        //therefore try to set recordType if triggerPostSaveTriggers is true
        if (_.isEmpty(recordType) && !_.isEmpty(brand) && triggerPostSaveTriggers === true) {
          try {
            recordType = (await firstValueFrom(
              RecordTypesService.get(brandObj, recordMeta.type as string)
            )) as RecordTypeLike | null;
          } catch (error) {
            tracker.recordPostPersistenceProblem(
              this.saveProblem(
                'post-save',
                'Your changes were saved, but follow-up processing could not be completed.',
                'processing',
                'post-save-failed'
              )
            );
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
              tracker.recordPostPersistenceProblem(
                this.recordActionProblem(
                  hookOperation,
                  this.saveProblem(
                    'post-save',
                    'Your changes were saved, but follow-up processing could not be completed.',
                    'processing',
                    'post-save-failed'
                  )
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
            // The awaited post-sync phase succeeded; later work is detached.
            hookOperation.completedThrough = 'postSync';
            if (this.hasPostSaveSyncHooks(recordType, 'onUpdate', hookOperation)) {
              const postSyncCandidate = this.mergeValidationCandidate(beforePostSyncCandidate, recordObj);
              recordObj = postSyncCandidate;
              const hookMutationState = await this.persistPostSyncCandidate({
                brand: brandObj,
                oid,
                beforeCandidate: beforePostSyncCandidate,
                candidate: postSyncCandidate,
                user: userObj,
                context: tracker.context,
                expectedRevision: currentRevision,
                writeKind: transitionRequested ? 'transition' : 'update',
                recordType,
                targetStep: transitionRequested ? nextStepObj : undefined,
                authoritativeStep,
                requiresTransitionAuthorization: Boolean(authoritativeStep),
              });
              if (hookMutationState.status === 'validation-failed') {
                tracker.recordPostPersistenceProblem(
                  this.recordActionProblem(hookOperation, hookMutationState.problem)
                );
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
              const postSyncRevision = this.chainedCommittedRevision(hookMutationState.response, currentRevision);
              if (hookMutationState.status !== 'applied' || postSyncRevision === undefined) {
                tracker.recordPostPersistenceProblem(
                  this.recordActionProblem(
                    hookOperation,
                    this.chainedMutationProblem('post-save', hookMutationState.response, 'post-save-metadata-failed')
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
              currentRevision = postSyncRevision;
              if (this.committedRevision(hookMutationState.response) !== undefined) {
                recordObj.revision = currentRevision;
              }
              this.setConcurrencyMetadata(tracker, oid, concurrencyMode, currentRevision, currentFormFingerprint);
              authoritativeCandidate = hookMutationState.candidate;
            } else {
              authoritativeCandidate = beforePostSyncCandidate;
            }
          } catch (err) {
            sails.log.error(`${this.logHeader} Exception while running post save sync hooks when updating:`);
            sails.log.error(JSON.stringify(err));
            tracker.recordPostPersistenceProblem(
              this.recordActionProblem(
                hookOperation,
                this.saveProblemFromError(
                  err,
                  'post-save',
                  'Your changes were saved, but follow-up processing could not be completed.',
                  'processing',
                  'post-save-failed'
                )
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
          this.triggerPostSaveTriggers(oid, recordObj, recordType, 'onUpdate', userObj, hookOperation);

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
                if (this.hasPostSaveSyncHooks(recordType, 'onTransitionWorkflow', hookOperation)) {
                  const transitionCandidate = this.mergeValidationCandidate(beforeTransitionCandidate, recordObj);
                  recordObj = transitionCandidate;
                  const transitionMutationState = await this.persistPostSyncCandidate({
                    brand: brandObj,
                    oid,
                    beforeCandidate: beforeTransitionCandidate,
                    candidate: transitionCandidate,
                    user: userObj,
                    context: tracker.context,
                    expectedRevision: currentRevision,
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
                    const transitionRevision = this.chainedCommittedRevision(
                      transitionMutationState.response,
                      currentRevision
                    );
                    if (transitionMutationState.status !== 'applied' || transitionRevision === undefined) {
                      transitionProblem = this.chainedMutationProblem(
                        'post-save',
                        transitionMutationState.response,
                        'transition-metadata-failed'
                      );
                    } else {
                      currentRevision = transitionRevision;
                      if (this.committedRevision(transitionMutationState.response) !== undefined) {
                        recordObj.revision = currentRevision;
                      }
                      this.setConcurrencyMetadata(
                        tracker,
                        oid,
                        concurrencyMode,
                        currentRevision,
                        currentFormFingerprint
                      );
                    }
                  }
                }
              } else {
                sails.log.verbose(
                  `RecordService - updateMeta - triggerPostSaveTransitionWorkflowTriggers post save hook not successful`
                );
                transitionProblem = this.saveProblem(
                  'post-save',
                  'Your changes were saved, but workflow processing could not be completed.',
                  'processing',
                  'transition-failed'
                );
              }
              this.triggerPostSaveTriggers(oid, recordObj, recordType, 'onTransitionWorkflow', userObj, hookOperation);
              if (transitionProblem) {
                tracker.recordPostPersistenceProblem(this.recordActionProblem(hookOperation, transitionProblem));
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
                this.recordActionProblem(
                  hookOperation,
                  this.saveProblemFromError(
                    tErr,
                    'post-save',
                    'Your changes were saved, but workflow processing could not be completed.',
                    'processing',
                    'transition-failed'
                  )
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
      }
      return await this.finishSave(tracker, userObj, RecordAuditActionType.updated, recordType?.searchable !== false);
    }

    hasPostSaveSyncHooks(recordType: unknown, mode: string, operation?: ActionExecutionOperation): boolean {
      const actionMode = mode as ActionExecutionMode;
      const prepared = operation ? this.registeredRecordActionCoordinators.get(operation) : undefined;
      if (prepared) {
        return prepared.hasBindings(actionMode, 'postSync');
      }
      const recordTypeObj = this.recordObject(recordType);
      const recordTypeKey = String(recordTypeObj.name ?? '').trim() || 'record';
      const plan = resolveRecordActionPlan(
        this.configuredRecordActionRegistry(),
        recordType as RuntimeValue,
        recordTypeKey
      );
      return resolveActionPlan(this.configuredRecordActionRegistry(), plan).bindings.some(
        binding => binding.binding.scope.mode === actionMode && binding.binding.scope.phase === 'postSync'
      );
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

    private recordReferencesAttachment(
      record: AnyRecord | null | undefined,
      attachmentId: string,
      fileId: string
    ): boolean {
      const root = record?.metadata;
      if (!root || typeof root !== 'object') return false;
      const pending: unknown[] = [root];
      const seen = new WeakSet<object>();
      let visited = 0;
      while (pending.length > 0 && visited < 50_000) {
        const value = pending.pop();
        visited += 1;
        if (!value || typeof value !== 'object' || seen.has(value)) continue;
        seen.add(value);
        const descriptors = Object.getOwnPropertyDescriptors(value);
        if (!Array.isArray(value)) {
          const candidateAttachmentId = descriptors.attachmentId;
          const candidateFileId = descriptors.fileId;
          if (
            candidateAttachmentId &&
            'value' in candidateAttachmentId &&
            String(candidateAttachmentId.value ?? '') === attachmentId &&
            candidateFileId &&
            'value' in candidateFileId &&
            String(candidateFileId.value ?? '') === fileId
          ) {
            return true;
          }
        }
        for (const descriptor of Object.values(descriptors)) {
          if ('value' in descriptor && descriptor.value && typeof descriptor.value === 'object') {
            pending.push(descriptor.value);
          }
        }
      }
      // Fail safe when a malformed/oversized record could not be inspected
      // completely: cleanup may wait, but it never risks a referenced blob.
      return pending.length > 0;
    }

    /**
     * Reap only expired, CAS-claimed cancelled staging generations. Active
     * record references and every unresolved generation retain the blob.
     */
    public async cleanupAbandonedAttachmentStaging(now: Date = new Date()): Promise<{
      claimed: number;
      removed: number;
      retained: number;
      failed: number;
    }> {
      const summary = { claimed: 0, removed: 0, retained: 0, failed: 0 };
      const journal = this.attachmentJournalService();
      if (
        !journal ||
        typeof journal.claimExpiredStagingCleanup !== 'function' ||
        typeof journal.findUnresolvedByStagingFileId !== 'function' ||
        typeof journal.beginStagingCleanup !== 'function' ||
        typeof journal.authorizeStagingCleanup !== 'function' ||
        typeof journal.releaseStagingCleanup !== 'function' ||
        typeof journal.completeStagingCleanup !== 'function' ||
        typeof journal.recoverStagingCleanup !== 'function'
      ) {
        return summary;
      }
      const configuredExpiry = Number(sails.config.record?.attachments?.stagingExpiryMs ?? 604_800_000);
      const expiryMs = Number.isFinite(configuredExpiry)
        ? Math.min(7_776_000_000, Math.max(60_000, Math.floor(configuredExpiry)))
        : 604_800_000;
      const nowMs = now instanceof Date ? now.getTime() : Number.NaN;
      if (!Number.isFinite(nowMs)) return summary;
      const claims = await journal.claimExpiredStagingCleanup(new Date(nowMs - expiryMs).toISOString(), 100);
      summary.claimed = claims.length;

      for (const claim of claims) {
        let removalAuthorized = false;
        try {
          const stagedFileId = normalizeAttachmentStagingFileId(claim.fileId);
          if (!stagedFileId) {
            await journal.releaseStagingCleanup(claim, 'attachment-cleanup-identity-invalid');
            summary.failed += 1;
            continue;
          }
          // Hold the durable staging-identity coordinator across every
          // reference check and the eventual remove. A concurrent prepare
          // cannot insert behind the scan while this ownership is held.
          if (!(await journal.beginStagingCleanup(claim))) {
            await journal.releaseStagingCleanup(claim, 'attachment-cleanup-claim-lost');
            summary.failed += 1;
            continue;
          }
          const unresolved = await journal.findUnresolvedByStagingFileId(stagedFileId);
          const protectedByGeneration = unresolved.some(
            row =>
              normalizeAttachmentStagingFileId(row.mutationFileId) === stagedFileId &&
              String(row.generation ?? '') !== claim.generation
          );
          const referencesByOid = new Map<string, string[]>();
          for (const row of unresolved) {
            const oid = String(row.oid ?? '').trim();
            const attachmentId = String(row.attachmentId ?? '').trim();
            if (oid && attachmentId) referencesByOid.set(oid, [...(referencesByOid.get(oid) ?? []), attachmentId]);
          }
          referencesByOid.set(claim.oid, [...(referencesByOid.get(claim.oid) ?? []), claim.attachmentId]);
          let protectedByRecord = false;
          try {
            for (const [oid, attachmentIds] of referencesByOid) {
              const record = ((await this.storageService.getMeta(oid)) as unknown as AnyRecord | null) ?? null;
              if (record !== null && !this.isUsableRecordSnapshot(record)) throw new Error('unusable-record');
              protectedByRecord ||= attachmentIds.some(attachmentId =>
                this.recordReferencesAttachment(record, attachmentId, stagedFileId)
              );
            }
          } catch {
            await journal.releaseStagingCleanup(claim, 'attachment-cleanup-record-state-unknown');
            summary.retained += 1;
            continue;
          }
          if (protectedByGeneration || protectedByRecord) {
            await journal.releaseStagingCleanup(claim, 'attachment-cleanup-reference-active');
            summary.retained += 1;
            continue;
          }
          if (claim.phase === 'removing') {
            if (typeof this.datastreamService.stagingDatastreamExists !== 'function') {
              summary.retained += 1;
              continue;
            }
            const recovery = await journal.recoverStagingCleanup(
              claim,
              await this.datastreamService.stagingDatastreamExists(stagedFileId)
            );
            if (recovery === 'completed') summary.removed += 1;
            else if (recovery === 'retained') summary.retained += 1;
            else summary.failed += 1;
            continue;
          }
          if (typeof this.datastreamService.removeStagedDatastream !== 'function') {
            await journal.releaseStagingCleanup(claim, 'attachment-staging-cleanup-unavailable');
            summary.retained += 1;
            continue;
          }
          if (!(await journal.authorizeStagingCleanup(claim))) {
            await journal.releaseStagingCleanup(claim, 'attachment-cleanup-claim-lost');
            summary.failed += 1;
            continue;
          }
          removalAuthorized = true;
          await this.datastreamService.removeStagedDatastream(stagedFileId);
          if (await journal.completeStagingCleanup(claim)) {
            summary.removed += 1;
          } else {
            // Keep cleanup-removing durable: the blob may already be gone, so
            // reopening this staging identity would be unsafe.
            summary.failed += 1;
          }
        } catch (error) {
          if (!removalAuthorized) {
            try {
              await journal.releaseStagingCleanup(claim, 'attachment-cleanup-failed');
            } catch {
              // The durable cleanup claim remains visible for operator recovery.
            }
          }
          summary.failed += 1;
          sails.log.warn(`${this.logHeader} attachment staging cleanup failed`, {
            event: 'attachment-staging-cleanup-failed',
            error_type: safeExceptionType(error),
          });
        }
      }
      sails.log.info(`${this.logHeader} attachment staging cleanup completed`, {
        event: 'attachment-staging-cleanup-completed',
        ...summary,
      });
      return summary;
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

    async provideUserAccessAndRemovePendingAccess(
      oid: string,
      userid: unknown,
      pendingValue: unknown
    ): Promise<RecordSaveResponse> {
      const normalizedUserId = String(userid ?? '').trim();
      const normalizedPendingValue = String(pendingValue ?? '').trim();
      return await this.mutateMetaInternal({
        actor: { kind: 'service', id: 'UsersService.assignPendingRecordAccess' },
        authorization: { kind: 'service' },
        oid,
        triggerPreSaveTriggers: false,
        triggerPostSaveTriggers: false,
        mutate: snapshot => {
          const candidate = snapshot as unknown as AnyRecord;
          const authorization = this.recordObject(candidate.authorization);
          const rewrite = (pendingName: 'editPending' | 'viewPending', accessName: 'edit' | 'view'): void => {
            const pending = this.asArray(authorization[pendingName]) ?? [];
            const access = this.asArray(authorization[accessName]) ?? [];
            const remaining = pending.filter(value => value !== normalizedPendingValue);
            authorization[pendingName] = remaining;
            authorization[accessName] =
              remaining.length < pending.length && normalizedUserId
                ? _.uniq([...access, normalizedUserId])
                : _.uniq(access);
          };
          rewrite('editPending', 'edit');
          rewrite('viewPending', 'view');
          candidate.authorization = authorization;
          return candidate;
        },
        retry: {
          idempotent: true,
          recomputable: true,
          maxAttempts: INTERNAL_RECORD_MUTATION_MAX_ATTEMPTS,
        },
      });
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

    private async finishConfirmedDelete(
      tracker: RecordSaveTracker,
      oid: string,
      user: AnyRecord,
      recordType: RecordTypeLike,
      hookRecord: AnyRecord,
      hookOperation: ActionExecutionOperation,
      primaryResponse: StorageMutationResponse,
      action: RecordAuditActionType
    ): Promise<RecordSaveResponse> {
      tracker.confirmPrimaryPersistence(oid, primaryResponse);
      hookOperation.completedThrough = 'persistence';
      await this.auditRecord(
        oid,
        {
          revision: tracker.result.concurrency?.revision,
          resolution: tracker.result.concurrency?.resolution,
        },
        user,
        action,
        projectRecordHookExecutionAuditSummary(hookOperation, { partial: true, completedThrough: 'persistence' }),
        {
          ...(tracker.result.concurrency?.revision !== undefined
            ? { revision: tracker.result.concurrency.revision }
            : {}),
          resolution: tracker.result.concurrency?.resolution ?? this.effectiveConcurrencyResolution(tracker.context),
        }
      );
      this.searchService.remove(oid);

      let postHookRecord = hookRecord;
      try {
        const hookOutcome = await this.runPostSaveSyncTriggers({
          oid,
          record: postHookRecord,
          recordType,
          mode: 'onDelete',
          user,
          response: tracker.result as unknown as AnyRecord,
          operation: hookOperation,
        });
        postHookRecord = hookOutcome.record;
        if (this.hookResponseFailed(hookOutcome.response as unknown as StorageServiceResponse)) {
          tracker.recordPostPersistenceProblem(
            this.recordActionProblem(
              hookOperation,
              this.saveProblem(
                'post-save',
                '@record-save-delete-post-sync-failed',
                'processing',
                'delete-post-sync-failed'
              )
            )
          );
        }
      } catch (error) {
        tracker.recordPostPersistenceProblem(
          this.recordActionProblem(
            hookOperation,
            this.saveProblemFromError(
              error,
              'post-save',
              '@record-save-delete-post-sync-failed',
              'processing',
              'delete-post-sync-failed'
            )
          )
        );
      }
      this.triggerPostSaveTriggers(oid, postHookRecord, recordType, 'onDelete', user, hookOperation);
      this.completeHookOperation(hookOperation, true);
      this.logSaveOutcome(tracker, 'response');
      return tracker.toResponse();
    }

    async delete(
      oid: string,
      permanentlyDelete: boolean | AnyRecord,
      currentRec?: unknown,
      recordType?: unknown,
      user: AnyRecord = {},
      context?: RecordSaveContext
    ): Promise<RecordSaveResponse> {
      // Preserve the historical two-argument internal call while ensuring it
      // still uses the staged CAS path.
      if (typeof permanentlyDelete !== 'boolean') {
        user = this.recordObject(permanentlyDelete);
        permanentlyDelete = false;
      }
      const tracker = new RecordSaveTracker(this.lifecycleContext(permanentlyDelete ? 'purge' : 'delete', context));
      tracker.result.oid = oid;
      const userObj = this.recordObject(user);

      let authoritative: AnyRecord;
      try {
        authoritative = (await this.storageService.getMeta(oid)) as unknown as AnyRecord;
      } catch {
        authoritative = {};
      }
      if (!this.isUsableRecordSnapshot(authoritative)) {
        const suppliedBrandId = String(
          this.recordObject((currentRec as AnyRecord | undefined)?.metaMetadata).brandId ?? ''
        ).trim();
        const suppliedBrand = suppliedBrandId
          ? ((await Promise.resolve(BrandingService.getBrandById(suppliedBrandId))) as BrandingModel | undefined)
          : undefined;
        try {
          const tombstone = await this.storageService.getTombstone?.(suppliedBrand, oid);
          if (tombstone?.deletedRecordMetadata) {
            const authority = await this.lifecycleAuthority(
              tombstone.deletedRecordMetadata as unknown as AnyRecord,
              suppliedBrand
            );
            if (
              authority &&
              this.lifecycleEditAuthorized(
                tracker.context,
                authority,
                userObj,
                tombstone.deletedRecordMetadata as unknown as AnyRecord
              )
            ) {
              const mode = this.resolveConcurrencyMode(authority.recordType);
              this.setConcurrencyMetadata(tracker, oid, mode, tombstone.revision);
              tracker.recordPrimaryNotApplied(this.concurrencyProblem('pre-save', 'record-deleted'));
              return tracker.toResponse();
            }
          }
        } catch {
          // Missing, cross-brand, and unobservable records share one private result.
        }
        tracker.recordPrimaryNotApplied(
          this.validationProblem('authorization', 'pre-save', RECORD_VALIDATION_SAVE_CODES.editUnauthorized)
        );
        return tracker.toResponse();
      }

      const supplied = this.recordObject(currentRec);
      const suppliedBrandId = String(this.recordObject(supplied.metaMetadata).brandId ?? '').trim();
      const authoritativeBrandId = String(this.recordObject(authoritative.metaMetadata).brandId ?? '').trim();
      if (suppliedBrandId && suppliedBrandId !== authoritativeBrandId) {
        tracker.recordPrimaryNotApplied(
          this.validationProblem('authorization', 'pre-save', RECORD_VALIDATION_SAVE_CODES.editUnauthorized)
        );
        return tracker.toResponse();
      }
      const authority = await this.lifecycleAuthority(
        authoritative,
        undefined,
        this.recordObject(recordType) as RecordTypeLike
      );
      if (!authority || !this.lifecycleEditAuthorized(tracker.context, authority, userObj, authoritative)) {
        tracker.recordPrimaryNotApplied(
          this.validationProblem('authorization', 'pre-save', RECORD_VALIDATION_SAVE_CODES.editUnauthorized)
        );
        return tracker.toResponse();
      }
      const activeRevision = this.recordRevision(authoritative);
      if (activeRevision === undefined) {
        tracker.recordPrimaryNotApplied(
          this.concurrencyProblem('pre-save', 'record-concurrency-capability-unavailable')
        );
        return tracker.toResponse();
      }
      const mode = this.lifecyclePolicyReady(tracker, oid, authority.recordType, activeRevision);
      if (!mode) return tracker.toResponse();

      const hookOperation = this.createHookExecutionOperation('onDelete', tracker.context.requestId, oid);
      let hookRecord = _.cloneDeep(authoritative) as AnyRecord;
      try {
        this.prepareRecordActionOperation({
          operation: hookOperation,
          recordType: authority.recordType,
          recordTypeKey: String(authority.recordType.name ?? '').trim(),
          brandId: String(authority.brand.id ?? '').trim(),
          user: userObj,
          current: authoritative,
        });
      } catch (error) {
        tracker.recordPrimaryNotApplied(
          this.recordActionProblem(
            hookOperation,
            this.saveProblem('pre-save', '@record-save-delete-pre-hook-failed', 'processing', 'invalid-action-plan')
          )
        );
        this.logSaveOutcome(tracker, 'pre-save', error);
        return tracker.toResponse();
      }
      try {
        hookRecord = await this.triggerPreSaveTriggers(
          oid,
          hookRecord,
          authority.recordType,
          'onDelete',
          userObj,
          hookOperation
        );
      } catch (error) {
        tracker.recordPrimaryNotApplied(
          this.recordActionProblem(
            hookOperation,
            this.saveProblemFromError(
              error,
              'pre-save',
              '@record-save-delete-pre-hook-failed',
              'processing',
              'delete-pre-hook-failed'
            )
          )
        );
        return tracker.toResponse();
      }

      const pendingRevision = nextRecordRevision(activeRevision);
      const operation = this.newLifecycleOperation(
        tracker.context,
        permanentlyDelete ? 'purge' : 'delete',
        activeRevision,
        pendingRevision
      );
      const pendingState: DeletedRecordLifecycleState = permanentlyDelete ? 'purge-pending' : 'delete-pending';
      const tombstone: DeletedRecordModel = {
        redboxOid: oid,
        revision: pendingRevision,
        brandId: String(authority.brand.id),
        lifecycleState: pendingState,
        lifecycleOperation: operation,
        deletedRecordMetadata: this.lifecycleSnapshot(authoritative) as unknown as RecordModel,
        dateDeleted: new Date().toISOString(),
      };

      const intentResponse = await this.dispatchLifecycleMutation(oid, tracker.context, () =>
        this.storageService.createTombstone!(
          authority.brand,
          oid,
          tombstone,
          this.lifecycleMutationOptions(tracker.context, activeRevision, pendingState, operation.operationId)
        )
      );
      if (resolveStorageMutationState(intentResponse, this.logLegacyMutationResponse) !== 'applied') {
        await this.recordLifecycleStorageFailure(tracker, oid, authority.brand, userObj, intentResponse);
        return tracker.toResponse();
      }

      const removalResponse = await this.dispatchLifecycleMutation(oid, tracker.context, () =>
        this.storageService.removeActiveRecord!(
          authority.brand,
          oid,
          this.lifecycleMutationOptions(tracker.context, activeRevision)
        )
      );
      const removalState = resolveStorageMutationState(removalResponse, this.logLegacyMutationResponse);
      if (removalState !== 'applied') {
        if (removalState === 'not-applied') {
          // A stale active revision certifies that update won, and not-found
          // certifies there is no owned intent left to recover. `deleted`, by
          // contrast, can mean another worker removed the active record for
          // this very operation; deleting its pending tombstone here would
          // erase the only durable recovery state.
          if (
            removalResponse.nonApplicationReason === 'stale-revision' ||
            removalResponse.nonApplicationReason === 'not-found' ||
            removalResponse.nonApplicationReason === 'brand-mismatch'
          ) {
            await this.dispatchLifecycleMutation(oid, tracker.context, () =>
              this.storageService.removeTombstone!(
                authority.brand,
                oid,
                this.lifecycleMutationOptions(tracker.context, pendingRevision, pendingState, operation.operationId)
              )
            );
          }
          await this.recordLifecycleStorageFailure(tracker, oid, authority.brand, userObj, removalResponse);
        } else {
          await this.markLifecycleRecoveryRequired(
            authority.brand,
            tombstone,
            'active-removal-unknown',
            tracker.context
          );
          await this.recordLifecycleStorageFailure(tracker, oid, authority.brand, userObj, removalResponse);
        }
        return tracker.toResponse();
      }

      const removedRecord = this.recordObject(removalResponse.removedRecord);
      if (!this.isUsableRecordSnapshot(removedRecord)) {
        const recovery = await this.markLifecycleRecoveryRequired(
          authority.brand,
          tombstone,
          'active-removal-result-invalid',
          tracker.context
        );
        this.setConcurrencyMetadata(
          tracker,
          oid,
          mode,
          this.committedRevision(recovery ?? new StorageMutationResponse()) ?? pendingRevision
        );
        tracker.setProjectedMetadata(this.recordObject(authoritative.metadata));
        tracker.recordPostPersistenceProblem(
          this.saveProblem(
            'persistence',
            '@record-save-record-lifecycle-recovery-required',
            'system',
            'record-lifecycle-recovery-required'
          )
        );
        return await this.finishConfirmedDelete(
          tracker,
          oid,
          userObj,
          authority.recordType,
          hookRecord,
          hookOperation,
          removalResponse,
          permanentlyDelete ? RecordAuditActionType.destroyed : RecordAuditActionType.deleted
        );
      }
      const authoritativeRemoved = removedRecord;
      if (!permanentlyDelete) {
        const deletedRevision = nextRecordRevision(pendingRevision);
        const finalized = await this.dispatchLifecycleMutation(oid, tracker.context, () =>
          this.storageService.updateTombstone!(
            authority.brand,
            oid,
            {
              lifecycleState: 'deleted',
              lifecycleOperation: this.advanceLifecycleOperation(operation, deletedRevision),
              deletedRecordMetadata: this.lifecycleSnapshot(authoritativeRemoved),
            },
            this.lifecycleMutationOptions(tracker.context, pendingRevision, pendingState, operation.operationId)
          )
        );
        const finalState = resolveStorageMutationState(finalized, this.logLegacyMutationResponse);
        const knownRevision = this.committedRevision(finalized) ?? pendingRevision;
        this.setConcurrencyMetadata(tracker, oid, mode, knownRevision);
        tracker.setProjectedMetadata(this.recordObject(authoritativeRemoved.metadata));
        if (finalState !== 'applied') {
          tracker.recordPostPersistenceProblem(
            this.saveProblem(
              'persistence',
              '@record-save-record-lifecycle-recovery-required',
              finalState === 'unknown' ? 'system' : 'processing',
              'record-lifecycle-recovery-required'
            )
          );
        }
        return await this.finishConfirmedDelete(
          tracker,
          oid,
          userObj,
          authority.recordType,
          hookRecord,
          hookOperation,
          removalResponse,
          RecordAuditActionType.deleted
        );
      }

      const physical = await this.purgePhysicalDatastreams(oid);
      let purgeRevision = pendingRevision;
      let purgeCompleted = false;
      if (physical.status === 'complete') {
        const removedTombstone = await this.dispatchLifecycleMutation(oid, tracker.context, () =>
          this.storageService.removeTombstone!(
            authority.brand,
            oid,
            this.lifecycleMutationOptions(tracker.context, pendingRevision, pendingState, operation.operationId)
          )
        );
        purgeCompleted = resolveStorageMutationState(removedTombstone, this.logLegacyMutationResponse) === 'applied';
        if (!purgeCompleted) {
          tracker.recordPostPersistenceProblem(
            this.saveProblem(
              'persistence',
              '@record-save-record-lifecycle-recovery-required',
              'processing',
              'record-lifecycle-recovery-required'
            )
          );
        }
      } else {
        const recovery = await this.markLifecycleRecoveryRequired(
          authority.brand,
          tombstone,
          physical.status === 'unknown' ? 'physical-purge-unknown' : 'physical-purge-incomplete',
          tracker.context
        );
        purgeRevision = this.committedRevision(recovery ?? new StorageMutationResponse()) ?? pendingRevision;
        tracker.recordPostPersistenceProblem(
          this.saveProblem(
            'attachments',
            '@record-save-record-physical-purge-incomplete',
            physical.status === 'unknown' ? 'system' : 'processing',
            physical.status === 'unknown' ? 'record-physical-purge-unknown' : 'record-physical-purge-incomplete'
          )
        );
      }
      this.setConcurrencyMetadata(tracker, oid, mode, purgeCompleted ? undefined : purgeRevision);
      return await this.finishConfirmedDelete(
        tracker,
        oid,
        userObj,
        authority.recordType,
        hookRecord,
        hookOperation,
        removalResponse,
        RecordAuditActionType.destroyed
      );
    }

    async updateNotificationLog(oid: string, record: AnyRecord, options: AnyRecord): Promise<unknown> {
      const applyNotification = (candidate: AnyRecord): AnyRecord => {
        if (this.metTriggerCondition(oid, candidate, options) !== 'true') return candidate;
        const logName = String(options.logName ?? '').trim();
        if (logName) {
          const current = _.get(candidate, logName);
          const log = Array.isArray(current) ? [...current] : [];
          log.push({ date: DateTime.now().toFormat("yyyy-LL-dd'T'HH:mm:ss") });
          _.set(candidate, logName, log);
        }
        const flagName = String(options.flagName ?? '').trim();
        if (flagName) {
          _.set(candidate, flagName, options.flagVal ?? null);
        }
        return candidate;
      };

      if (options.saveRecord !== true) {
        return this.metTriggerCondition(oid, record, options) === 'true' ? applyNotification(record) : record;
      }

      const response = await this.mutateMetaInternal({
        actor: { kind: 'service', id: 'RecordsService.updateNotificationLog' },
        authorization: { kind: 'service' },
        oid,
        triggerPreSaveTriggers: false,
        triggerPostSaveTriggers: false,
        mutate: snapshot => applyNotification(snapshot as unknown as AnyRecord),
        retry: {
          idempotent: true,
          recomputable: true,
          maxAttempts: INTERNAL_RECORD_MUTATION_MAX_ATTEMPTS,
        },
      });
      if (!response.wasPersisted()) {
        throw new Error(`Notification record mutation was not persisted (request ${response.requestId}).`);
      }
      if (response.outcome === 'saved-with-warnings') {
        sails.log.warn(`${this.logHeader} notification record mutation persisted with warnings`, {
          requestId: response.requestId,
        });
      }
      return await this.getMeta(oid);
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
      executionSummary?: RecordHookExecutionAuditSummary,
      concurrency?: RecordMutationAuditConcurrency
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
      const data = new RecordAuditModel(id, record, user, action, executionSummary, concurrency);
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
      _targetRecord: unknown = undefined
    ) {
      sails.log.verbose(`RecordsService::Appending to record:${targetRecordOid}`);
      return await this.mutateMetaInternal({
        actor: { kind: 'service', id: 'RecordsService.appendToRecord' },
        authorization: { kind: 'service' },
        oid: targetRecordOid,
        mutate: snapshot => {
          const targetRecordObj = snapshot as unknown as AnyRecord;
          let nextData = _.cloneDeep(linkData);
          const existingData = _.get(targetRecordObj, fieldName);
          if (_.isUndefined(existingData)) {
            if (fieldType === 'array') {
              nextData = [nextData];
            }
          } else if (_.isArray(existingData)) {
            nextData = existingData.some(value => _.isEqual(value, nextData))
              ? [...existingData]
              : [...existingData, nextData];
          }
          _.set(targetRecordObj, fieldName, nextData);
          return targetRecordObj;
        },
        retry: {
          idempotent: true,
          recomputable: true,
          maxAttempts: INTERNAL_RECORD_MUTATION_MAX_ATTEMPTS,
        },
      });
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
      _targetRecord: unknown = undefined
    ) {
      sails.log.verbose(`RecordsService::Removing field from record:${targetRecordOid}`);
      return await this.mutateMetaInternal({
        actor: { kind: 'service', id: 'RecordsService.removeFromRecord' },
        authorization: { kind: 'service' },
        oid: targetRecordOid,
        mutate: snapshot => {
          const targetRecordObj = snapshot as unknown as AnyRecord;
          const existingData = _.get(targetRecordObj, fieldName);
          if (_.isArray(existingData)) {
            _.set(
              targetRecordObj,
              fieldName,
              existingData.filter(dataElem => !_.isEqual(dataElem, dataToRemove))
            );
          } else if (!_.isUndefined(existingData)) {
            _.unset(targetRecordObj, fieldName);
          }
          return targetRecordObj;
        },
        retry: {
          idempotent: true,
          recomputable: true,
          maxAttempts: INTERNAL_RECORD_MUTATION_MAX_ATTEMPTS,
        },
      });
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

    async restoreRecord(
      oid: string,
      user: AnyRecord,
      suppliedBrand?: BrandingModel,
      context?: RecordSaveContext
    ): Promise<RecordSaveResponse> {
      const tracker = new RecordSaveTracker(this.lifecycleContext('restore', context));
      tracker.result.oid = oid;
      const userObj = this.recordObject(user);
      let tombstone: DeletedRecordModel | null = null;
      try {
        tombstone = (await this.storageService.getTombstone?.(suppliedBrand, oid)) ?? null;
      } catch {
        tombstone = null;
      }
      if (
        !tombstone?.deletedRecordMetadata ||
        !this.isUsableRecordSnapshot(tombstone.deletedRecordMetadata as AnyRecord)
      ) {
        tracker.recordPrimaryNotApplied(
          this.validationProblem('authorization', 'pre-save', RECORD_VALIDATION_SAVE_CODES.editUnauthorized)
        );
        return tracker.toResponse();
      }
      const snapshot = tombstone.deletedRecordMetadata as unknown as AnyRecord;
      const authority = await this.lifecycleAuthority(snapshot, suppliedBrand);
      if (!authority || !this.lifecycleEditAuthorized(tracker.context, authority, userObj, snapshot)) {
        tracker.recordPrimaryNotApplied(
          this.validationProblem('authorization', 'pre-save', RECORD_VALIDATION_SAVE_CODES.editUnauthorized)
        );
        return tracker.toResponse();
      }
      if (!isRecordRevision(tombstone.revision)) {
        tracker.recordPrimaryNotApplied(
          this.concurrencyProblem('pre-save', 'record-concurrency-capability-unavailable')
        );
        return tracker.toResponse();
      }
      const mode = this.lifecyclePolicyReady(tracker, oid, authority.recordType, tombstone.revision);
      if (!mode) return tracker.toResponse();
      if (tombstone.lifecycleState !== 'deleted') {
        tracker.recordPrimaryNotApplied(this.concurrencyProblem('pre-save', 'record-lifecycle-operation-conflict'));
        return tracker.toResponse();
      }

      const claimedRevision = nextRecordRevision(tombstone.revision);
      const operation = this.newLifecycleOperation(tracker.context, 'restore', tombstone.revision, claimedRevision);
      const claimResponse = await this.dispatchLifecycleMutation(oid, tracker.context, () =>
        this.storageService.updateTombstone!(
          authority.brand,
          oid,
          {
            lifecycleState: 'restore-pending',
            lifecycleOperation: operation,
          },
          this.lifecycleMutationOptions(tracker.context, tombstone.revision, 'deleted')
        )
      );
      if (resolveStorageMutationState(claimResponse, this.logLegacyMutationResponse) !== 'applied') {
        await this.recordLifecycleStorageFailure(tracker, oid, authority.brand, userObj, claimResponse);
        return tracker.toResponse();
      }

      const claimedTombstone: DeletedRecordModel = {
        ...tombstone,
        revision: this.committedRevision(claimResponse) ?? claimedRevision,
        lifecycleState: 'restore-pending',
        lifecycleOperation: operation,
      };
      const createResponse = await this.dispatchLifecycleMutation(oid, tracker.context, () =>
        this.storageService.createActiveRecordFromTombstone!(
          authority.brand,
          oid,
          { ...this.lifecycleSnapshot(snapshot), redboxOid: oid },
          this.lifecycleMutationOptions(
            tracker.context,
            claimedTombstone.revision,
            'restore-pending',
            operation.operationId
          )
        )
      );
      const createState = resolveStorageMutationState(createResponse, this.logLegacyMutationResponse);
      if (createState !== 'applied') {
        await this.markLifecycleRecoveryRequired(
          authority.brand,
          claimedTombstone,
          createState === 'unknown' ? 'restore-create-unknown' : 'restore-create-conflict',
          tracker.context
        );
        await this.recordLifecycleStorageFailure(tracker, oid, authority.brand, userObj, createResponse);
        return tracker.toResponse();
      }

      const activeRevision = this.committedRevision(createResponse);
      const activeRecord = this.recordObject(createResponse.committedRecord);
      if (activeRevision === undefined || !this.isUsableRecordSnapshot(activeRecord)) {
        tracker.recordPrimaryUnknown(
          this.saveProblem('persistence', '@record-save-record-lifecycle-unknown', 'system', 'record-lifecycle-unknown')
        );
        return tracker.toResponse();
      }
      tracker.confirmPrimaryPersistence(oid, createResponse);
      const tombstoneRemoval = await this.dispatchLifecycleMutation(oid, tracker.context, () =>
        this.storageService.removeTombstone!(
          authority.brand,
          oid,
          this.lifecycleMutationOptions(
            tracker.context,
            claimedTombstone.revision,
            'restore-pending',
            operation.operationId
          )
        )
      );
      if (resolveStorageMutationState(tombstoneRemoval, this.logLegacyMutationResponse) !== 'applied') {
        tracker.recordPostPersistenceProblem(
          this.saveProblem(
            'persistence',
            '@record-save-record-lifecycle-recovery-required',
            'processing',
            'record-lifecycle-recovery-required'
          )
        );
      }

      // The create response only proves what restore inserted. A concurrent
      // writer may already have advanced or removed it, so response and index
      // input must come from one final authoritative reload.
      let finalActive: AnyRecord | null = null;
      try {
        const reloaded = (await this.storageService.getMeta(oid)) as unknown;
        if (this.isUsableRecordSnapshot(reloaded)) finalActive = reloaded as AnyRecord;
      } catch {
        finalActive = null;
      }
      const finalRevision = finalActive ? this.recordRevision(finalActive) : undefined;
      const finalBrandId = String(this.recordObject(finalActive?.metaMetadata).brandId ?? '').trim();
      if (!finalActive || finalRevision === undefined || finalBrandId !== String(authority.brand.id ?? '').trim()) {
        tracker.setConcurrencyMetadata(undefined);
        tracker.setProjectedMetadata(null);
        tracker.result.data = undefined;
        tracker.recordPostPersistenceProblem(
          this.saveProblem(
            'response',
            '@record-save-response-projection-failed',
            'system',
            'response-projection-failed'
          )
        );
      } else {
        const roles = Array.isArray(userObj.roles) ? (userObj.roles as AnyRecord[]) : [];
        const canView =
          tracker.context.routeFamily === 'internal' ||
          this.hasViewAccess(authority.brand, userObj, roles, finalActive);
        if (canView) {
          this.setConcurrencyMetadata(tracker, oid, mode, finalRevision);
          tracker.setProjectedMetadata(this.recordObject(finalActive.metadata));
          tracker.result.data = _.cloneDeep(finalActive);
        } else {
          tracker.setConcurrencyMetadata(undefined);
          tracker.setProjectedMetadata(null);
          tracker.result.data = undefined;
        }
        if (authority.recordType.searchable !== false) {
          try {
            if (!(await this.searchService.index(oid, finalActive))) {
              throw new Error('Index request was not accepted.');
            }
          } catch {
            tracker.recordPostPersistenceProblem(
              this.saveProblem('post-save', '@record-save-index-failed', 'processing', 'record-index-failed')
            );
          }
        }
      }
      await this.auditRecord(
        oid,
        { revision: finalRevision, resolution: tracker.result.concurrency?.resolution },
        userObj,
        RecordAuditActionType.restored,
        undefined,
        {
          revision: finalRevision ?? activeRevision,
          resolution: tracker.result.concurrency?.resolution ?? this.effectiveConcurrencyResolution(tracker.context),
        }
      );
      this.logSaveOutcome(tracker, 'response');
      return tracker.toResponse();
    }

    async destroyDeletedRecord(
      oid: string,
      user: AnyRecord,
      suppliedBrand?: BrandingModel,
      context?: RecordSaveContext
    ): Promise<RecordSaveResponse> {
      const tracker = new RecordSaveTracker(this.lifecycleContext('purge', context));
      tracker.result.oid = oid;
      const userObj = this.recordObject(user);
      let tombstone: DeletedRecordModel | null = null;
      try {
        tombstone = (await this.storageService.getTombstone?.(suppliedBrand, oid)) ?? null;
      } catch {
        tombstone = null;
      }
      if (
        !tombstone?.deletedRecordMetadata ||
        !this.isUsableRecordSnapshot(tombstone.deletedRecordMetadata as AnyRecord)
      ) {
        tracker.recordPrimaryNotApplied(
          this.validationProblem('authorization', 'pre-save', RECORD_VALIDATION_SAVE_CODES.editUnauthorized)
        );
        return tracker.toResponse();
      }
      const snapshot = tombstone.deletedRecordMetadata as unknown as AnyRecord;
      const authority = await this.lifecycleAuthority(snapshot, suppliedBrand);
      if (!authority || !this.lifecycleEditAuthorized(tracker.context, authority, userObj, snapshot)) {
        tracker.recordPrimaryNotApplied(
          this.validationProblem('authorization', 'pre-save', RECORD_VALIDATION_SAVE_CODES.editUnauthorized)
        );
        return tracker.toResponse();
      }
      if (!isRecordRevision(tombstone.revision)) {
        tracker.recordPrimaryNotApplied(
          this.concurrencyProblem('pre-save', 'record-concurrency-capability-unavailable')
        );
        return tracker.toResponse();
      }
      const mode = this.lifecyclePolicyReady(tracker, oid, authority.recordType, tombstone.revision);
      if (!mode) return tracker.toResponse();
      if (tombstone.lifecycleState !== 'deleted') {
        tracker.recordPrimaryNotApplied(this.concurrencyProblem('pre-save', 'record-lifecycle-operation-conflict'));
        return tracker.toResponse();
      }

      const claimedRevision = nextRecordRevision(tombstone.revision);
      const operation = this.newLifecycleOperation(tracker.context, 'purge', tombstone.revision, claimedRevision);
      const claimResponse = await this.dispatchLifecycleMutation(oid, tracker.context, () =>
        this.storageService.updateTombstone!(
          authority.brand,
          oid,
          { lifecycleState: 'purge-pending', lifecycleOperation: operation },
          this.lifecycleMutationOptions(tracker.context, tombstone.revision, 'deleted')
        )
      );
      if (resolveStorageMutationState(claimResponse, this.logLegacyMutationResponse) !== 'applied') {
        await this.recordLifecycleStorageFailure(tracker, oid, authority.brand, userObj, claimResponse);
        return tracker.toResponse();
      }
      const claimedTombstone: DeletedRecordModel = {
        ...tombstone,
        revision: this.committedRevision(claimResponse) ?? claimedRevision,
        lifecycleState: 'purge-pending',
        lifecycleOperation: operation,
      };
      const physical = await this.purgePhysicalDatastreams(oid);
      if (physical.status !== 'complete') {
        const recovery = await this.markLifecycleRecoveryRequired(
          authority.brand,
          claimedTombstone,
          physical.status === 'unknown' ? 'physical-purge-unknown' : 'physical-purge-incomplete',
          tracker.context
        );
        const recoveryRevision = this.committedRevision(recovery ?? new StorageMutationResponse()) ?? claimedRevision;
        this.setConcurrencyMetadata(tracker, oid, mode, recoveryRevision);
        tracker.confirmPrimaryPersistence(oid, claimResponse);
        tracker.recordPostPersistenceProblem(
          this.saveProblem(
            'attachments',
            '@record-save-record-physical-purge-incomplete',
            physical.status === 'unknown' ? 'system' : 'processing',
            physical.status === 'unknown' ? 'record-physical-purge-unknown' : 'record-physical-purge-incomplete'
          )
        );
        return tracker.toResponse();
      }

      const removalResponse = await this.dispatchLifecycleMutation(oid, tracker.context, () =>
        this.storageService.removeTombstone!(
          authority.brand,
          oid,
          this.lifecycleMutationOptions(
            tracker.context,
            claimedTombstone.revision,
            'purge-pending',
            operation.operationId
          )
        )
      );
      const removalState = resolveStorageMutationState(removalResponse, this.logLegacyMutationResponse);
      if (removalState !== 'applied') {
        this.setConcurrencyMetadata(tracker, oid, mode, claimedTombstone.revision);
        tracker.confirmPrimaryPersistence(oid, claimResponse);
        tracker.recordPostPersistenceProblem(
          this.saveProblem(
            'persistence',
            '@record-save-record-lifecycle-recovery-required',
            removalState === 'unknown' ? 'system' : 'processing',
            'record-lifecycle-recovery-required'
          )
        );
        return tracker.toResponse();
      }
      tracker.setConcurrencyMetadata(this.concurrencyMetadata(oid, tracker.context, mode, undefined));
      tracker.confirmPrimaryPersistence(oid, removalResponse);
      await this.auditRecord(
        oid,
        { resolution: tracker.result.concurrency?.resolution },
        userObj,
        RecordAuditActionType.destroyed,
        undefined,
        {
          revision: claimedTombstone.revision,
          resolution: tracker.result.concurrency?.resolution ?? this.effectiveConcurrencyResolution(tracker.context),
        }
      );
      this.logSaveOutcome(tracker, 'response');
      return tracker.toResponse();
    }

    async getDeletedRecord(oid: string, brand?: BrandingModel): Promise<DeletedRecordModel | null> {
      if (!oid.trim() || typeof this.storageService.getTombstone !== 'function') return null;
      return await this.storageService.getTombstone(brand, oid);
    }

    /** Metadata of a soft deleted record, or null when no deleted record exists for the oid. */
    async getDeletedRecordMeta(oid: string, brand?: BrandingModel): Promise<RecordModel | null> {
      if (_.isEmpty(oid)) return null;
      if (typeof this.storageService.getTombstone === 'function') {
        const tombstone = await this.storageService.getTombstone(brand, oid);
        if (!tombstone?.deletedRecordMetadata) return null;
        const operation = tombstone.lifecycleOperation;
        return {
          ..._.cloneDeep(tombstone.deletedRecordMetadata),
          revision: tombstone.revision,
          lifecycleState: tombstone.lifecycleState,
          ...(operation
            ? {
                lifecycle: {
                  kind: operation.kind,
                  attempts: operation.attempts,
                  startedAt: operation.startedAt,
                  updatedAt: operation.updatedAt,
                  ...(operation.errorCode ? { errorCode: operation.errorCode } : {}),
                },
              }
            : {}),
        } as RecordModel;
      }
      return await this.storageService.getDeletedRecordMeta(oid);
    }

    private lifecycleRecoveryContext(operation: DeletedRecordLifecycleOperation): RecordSaveContext {
      return createRecordSaveContext({
        routeFamily: 'internal',
        operation: operation.kind,
        concurrency: {
          entityTagSupplied: false,
          resolution: 'internal',
          resolutionOfRequestId: operation.requestId,
        },
      });
    }

    private async retainLifecycleRecovery(
      authority: LifecycleAuthority,
      tombstone: DeletedRecordModel,
      errorCode: string,
      context: RecordSaveContext
    ): Promise<void> {
      if (tombstone.lifecycleState === 'recovery-required' && tombstone.lifecycleOperation?.errorCode === errorCode) {
        return;
      }
      await this.markLifecycleRecoveryRequired(authority.brand, tombstone, errorCode, context);
    }

    private lifecycleIncarnationIdentity(source: unknown): string | null | undefined {
      if (source == null || typeof source !== 'object' || Array.isArray(source)) return undefined;
      const value = (source as AnyRecord).incarnationId;
      if (value === undefined || value === null || value === '') return undefined;
      return isRecordSaveRequestId(value) ? value : null;
    }

    private lifecycleIncarnationIdentityConsistent(
      inputTombstone: DeletedRecordModel,
      tombstone: DeletedRecordModel,
      snapshot: AnyRecord,
      active: AnyRecord | null
    ): boolean {
      const tombstoneIdentities = [inputTombstone, tombstone, snapshot].map(source =>
        this.lifecycleIncarnationIdentity(source)
      );
      const activeIdentity = active ? this.lifecycleIncarnationIdentity(active) : undefined;
      const identities = [...tombstoneIdentities, activeIdentity];
      if (identities.some(identity => identity === null)) return false;
      const presentIdentities = identities.filter((identity): identity is string => identity !== undefined);
      if (new Set(presentIdentities).size > 1) return false;
      return (
        !active ||
        tombstoneIdentities.some(identity => typeof identity === 'string') === (activeIdentity !== undefined)
      );
    }

    async recoverLifecycleOperation(
      tombstoneInput: DeletedRecordModel
    ): Promise<'completed' | 'cancelled' | 'retained'> {
      const inputOperation = tombstoneInput?.lifecycleOperation;
      if (!inputOperation || !isDeletedRecordLifecycleOperation(inputOperation)) return 'retained';
      const context = this.lifecycleRecoveryContext(inputOperation);
      const inputSnapshot = tombstoneInput.deletedRecordMetadata as unknown as AnyRecord;
      const inputAuthority = this.isUsableRecordSnapshot(inputSnapshot)
        ? await this.lifecycleAuthority(inputSnapshot)
        : undefined;
      if (!inputAuthority || !this.lifecycleStorageAvailable()) return 'retained';

      let tombstone: DeletedRecordModel | null;
      try {
        tombstone = (await this.storageService.getTombstone!(inputAuthority.brand, tombstoneInput.redboxOid)) ?? null;
      } catch {
        sails.log.warn('record_lifecycle_recovery_observation_unknown', {
          event: 'record_lifecycle_recovery_observation_unknown',
          lifecycle_kind: inputOperation.kind,
        });
        return 'retained';
      }
      if (!tombstone) return 'cancelled';
      const operation = tombstone?.lifecycleOperation;
      const snapshot = tombstone.deletedRecordMetadata as unknown as AnyRecord;
      if (
        !isRecordRevision(tombstone.revision) ||
        !isDeletedRecordLifecycleState(tombstone.lifecycleState) ||
        !operation ||
        !isDeletedRecordLifecycleOperation(operation) ||
        !isDeletedRecordLifecycleOperationForState(tombstone.lifecycleState, operation.kind) ||
        operation.operationId !== inputOperation.operationId ||
        operation.kind !== inputOperation.kind ||
        operation.targetRevision !== tombstone.revision ||
        !this.isUsableRecordSnapshot(snapshot)
      ) {
        sails.log.warn('record_lifecycle_recovery_state_invalid', {
          event: 'record_lifecycle_recovery_state_invalid',
          lifecycle_kind: inputOperation.kind,
        });
        return 'retained';
      }
      const authority = await this.lifecycleAuthority(snapshot, inputAuthority.brand);
      if (!authority) return 'retained';

      let active: AnyRecord | null;
      try {
        const observed = (await this.storageService.getMeta(tombstone.redboxOid)) as unknown;
        if (observed == null) {
          active = null;
        } else if (this.isUsableRecordSnapshot(observed)) {
          active = observed;
        } else {
          await this.retainLifecycleRecovery(authority, tombstone, 'active-observation-invalid', context);
          return 'retained';
        }
      } catch {
        await this.retainLifecycleRecovery(authority, tombstone, 'lifecycle-observation-unknown', context);
        sails.log.warn('record_lifecycle_recovery_observation_unknown', {
          event: 'record_lifecycle_recovery_observation_unknown',
          lifecycle_kind: operation.kind,
        });
        return 'retained';
      }

      if (!this.lifecycleIncarnationIdentityConsistent(tombstoneInput, tombstone, snapshot, active)) {
        await this.retainLifecycleRecovery(authority, tombstone, 'lifecycle-incarnation-inconsistent', context);
        return 'retained';
      }

      // A finalized delete is already a completed idempotent delivery only
      // after the current active/tombstone lineage has been proven consistent.
      if (operation.kind === 'delete' && tombstone.lifecycleState === 'deleted') return 'completed';

      if (operation.kind === 'restore') {
        if (active && active.lifecycleOperationId !== operation.operationId) {
          await this.retainLifecycleRecovery(authority, tombstone, 'restore-active-collision', context);
          return 'retained';
        }
        if (!active) {
          const create = await this.dispatchLifecycleMutation(tombstone.redboxOid, context, () =>
            this.storageService.createActiveRecordFromTombstone!(
              authority.brand,
              tombstone.redboxOid,
              { ...this.lifecycleSnapshot(snapshot), redboxOid: tombstone.redboxOid },
              this.lifecycleMutationOptions(
                context,
                tombstone.revision,
                tombstone.lifecycleState,
                operation.operationId
              )
            )
          );
          if (resolveStorageMutationState(create, this.logLegacyMutationResponse) !== 'applied') {
            await this.retainLifecycleRecovery(
              authority,
              tombstone,
              create.applicationState === 'unknown' ? 'restore-create-unknown' : 'restore-active-collision',
              context
            );
            return 'retained';
          }
          active = this.recordObject(create.committedRecord);
        }
        const removed = await this.dispatchLifecycleMutation(tombstone.redboxOid, context, () =>
          this.storageService.removeTombstone!(
            authority.brand,
            tombstone.redboxOid,
            this.lifecycleMutationOptions(context, tombstone.revision, tombstone.lifecycleState, operation.operationId)
          )
        );
        return resolveStorageMutationState(removed, this.logLegacyMutationResponse) === 'applied'
          ? 'completed'
          : 'retained';
      }

      if (active) {
        const activeRevision = this.recordRevision(active);
        if (activeRevision === undefined) {
          await this.retainLifecycleRecovery(authority, tombstone, 'active-revision-invalid', context);
          return 'retained';
        }
        if (activeRevision > operation.sourceRevision) {
          const cancelled = await this.dispatchLifecycleMutation(tombstone.redboxOid, context, () =>
            this.storageService.removeTombstone!(
              authority.brand,
              tombstone.redboxOid,
              this.lifecycleMutationOptions(
                context,
                tombstone.revision,
                tombstone.lifecycleState,
                operation.operationId
              )
            )
          );
          return resolveStorageMutationState(cancelled, this.logLegacyMutationResponse) === 'applied'
            ? 'cancelled'
            : 'retained';
        }
        if (activeRevision !== operation.sourceRevision) {
          await this.retainLifecycleRecovery(authority, tombstone, 'active-revision-diverged', context);
          return 'retained';
        }
        const removal = await this.dispatchLifecycleMutation(tombstone.redboxOid, context, () =>
          this.storageService.removeActiveRecord!(
            authority.brand,
            tombstone.redboxOid,
            this.lifecycleMutationOptions(context, operation.sourceRevision)
          )
        );
        const removalState = resolveStorageMutationState(removal, this.logLegacyMutationResponse);
        if (removalState !== 'applied') {
          await this.retainLifecycleRecovery(
            authority,
            tombstone,
            removalState === 'unknown' ? 'active-removal-unknown' : 'active-removal-conflict',
            context
          );
          return 'retained';
        }
      }

      if (operation.kind === 'delete') {
        const targetRevision = nextRecordRevision(tombstone.revision);
        const finalized = await this.dispatchLifecycleMutation(tombstone.redboxOid, context, () =>
          this.storageService.updateTombstone!(
            authority.brand,
            tombstone.redboxOid,
            {
              lifecycleState: 'deleted',
              lifecycleOperation: this.advanceLifecycleOperation(operation, targetRevision),
              deletedRecordMetadata: this.lifecycleSnapshot(snapshot),
            },
            this.lifecycleMutationOptions(context, tombstone.revision, tombstone.lifecycleState, operation.operationId)
          )
        );
        return resolveStorageMutationState(finalized, this.logLegacyMutationResponse) === 'applied'
          ? 'completed'
          : 'retained';
      }

      if (operation.kind !== 'purge') {
        await this.retainLifecycleRecovery(authority, tombstone, 'lifecycle-operation-invalid', context);
        return 'retained';
      }
      const physical = await this.purgePhysicalDatastreams(tombstone.redboxOid);
      if (physical.status !== 'complete') {
        await this.retainLifecycleRecovery(
          authority,
          tombstone,
          physical.status === 'unknown' ? 'physical-purge-unknown' : 'physical-purge-incomplete',
          context
        );
        return 'retained';
      }
      const removed = await this.dispatchLifecycleMutation(tombstone.redboxOid, context, () =>
        this.storageService.removeTombstone!(
          authority.brand,
          tombstone.redboxOid,
          this.lifecycleMutationOptions(context, tombstone.revision, tombstone.lifecycleState, operation.operationId)
        )
      );
      return resolveStorageMutationState(removed, this.logLegacyMutationResponse) === 'applied'
        ? 'completed'
        : 'retained';
    }

    async recoverLifecycleOperations(limit = 100): Promise<{
      inspected: number;
      completed: number;
      cancelled: number;
      retained: number;
    }> {
      const result = { inspected: 0, completed: 0, cancelled: 0, retained: 0 };
      if (typeof this.storageService.getLifecycleTombstones !== 'function') return result;
      const boundedLimit = Math.max(1, Math.min(Number.isSafeInteger(limit) ? limit : 100, 1000));
      let tombstones: DeletedRecordModel[];
      try {
        tombstones = await this.storageService.getLifecycleTombstones(
          ['delete-pending', 'restore-pending', 'purge-pending', 'recovery-required'],
          boundedLimit
        );
      } catch {
        sails.log.warn('record_lifecycle_recovery_scan_unknown', {
          event: 'record_lifecycle_recovery_scan_unknown',
        });
        return result;
      }
      for (const tombstone of tombstones) {
        result.inspected += 1;
        let status: 'completed' | 'cancelled' | 'retained';
        try {
          status = await this.recoverLifecycleOperation(tombstone);
        } catch {
          sails.log.warn('record_lifecycle_recovery_item_failed', {
            event: 'record_lifecycle_recovery_item_failed',
          });
          status = 'retained';
        }
        result[status] += 1;
        const operation = tombstone.lifecycleOperation?.kind;
        if (operation === 'delete' || operation === 'restore' || operation === 'purge') {
          emitRecordConcurrencyEvent({
            kind: 'lifecycle-recovery',
            routeFamily: 'internal',
            writeKind: operation,
            phase: 'persistence',
            outcome: status,
            expectedRevision: tombstone.lifecycleOperation?.sourceRevision,
            currentRevision: tombstone.revision,
            precondition: 'matching',
            resolution: 'internal',
          });
        }
      }
      return result;
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
      const execution =
        operation ?? this.createHookExecutionOperation('onTransitionWorkflow', undefined, oid ?? undefined);
      if (!_.isEmpty(nextStep)) {
        if (!this.registeredRecordActionCoordinators.has(execution)) {
          const recordTypeObj = this.recordObject(recordType);
          const recordMeta = this.recordObject(record.metaMetadata);
          this.prepareRecordActionOperation({
            operation: execution,
            recordType,
            recordTypeKey: String(recordTypeObj.name ?? recordMeta.type ?? '').trim(),
            brandId: String(recordMeta.brandId ?? recordTypeObj.branding ?? '').trim(),
            user,
            current: record,
            transition: this.recordActionTransition(record, nextStep),
          });
        }
        record = await this.triggerPreSaveTriggers(oid, record, recordType, 'onTransitionWorkflow', user, execution);
      }
      if (operation === undefined) {
        this.completeHookOperation(execution);
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
      const execution =
        operation ?? this.createHookExecutionOperation('onTransitionWorkflow', undefined, oid ?? undefined);
      let responseObj = response as AnyRecord;
      let postSyncRecord = record;
      const recordTypeObj = this.recordObject(recordType) as RecordTypeLike;
      const userObj = this.recordObject(user);
      try {
        if (!_.isEmpty(nextStep)) {
          if (!this.registeredRecordActionCoordinators.has(execution)) {
            const recordMeta = this.recordObject(record.metaMetadata);
            this.prepareRecordActionOperation({
              operation: execution,
              recordType,
              recordTypeKey: String(recordTypeObj.name ?? recordMeta.type ?? '').trim(),
              brandId: String(recordMeta.brandId ?? recordTypeObj.branding ?? '').trim(),
              user: userObj,
              current: record,
              transition: this.recordActionTransition(record, nextStep),
            });
          }
          const outcome = await this.runPostSaveSyncTriggers({
            oid,
            record,
            recordType: recordTypeObj,
            mode: 'onTransitionWorkflow',
            user: userObj,
            response: responseObj,
            operation: execution,
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
        if (operation === undefined) {
          this.completeHookOperation(execution, true);
        }
        return responseObj;
      }

      // A soft-failure response has historically still dispatched detached
      // transition hooks; only a thrown postSync phase suppresses dispatch.
      if (!_.isEmpty(nextStep)) {
        this.triggerPostSaveTriggers(oid, postSyncRecord, recordTypeObj, 'onTransitionWorkflow', userObj, execution);
      }
      if (operation === undefined) {
        this.completeHookOperation(execution);
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
        const actionMode = mode as ActionExecutionMode;
        const coordinator = this.recordActionCoordinator(execution, record, recordType, user, actionMode);
        const outcome = await coordinator.runSequential(record, actionMode, 'pre');
        if (operation === undefined) {
          this.completeHookOperation(execution);
        }
        if (outcome.terminalCause !== undefined) {
          if (outcome.terminalCause instanceof RecordActionIdentityFailure) {
            throw new RBValidationError({
              message: 'A record action attempted to replace the authoritative public OID.',
              displayErrors: [
                {
                  title: `@record-save-${RECORD_VALIDATION_SAVE_CODES.authorityDivergence}`,
                  code: RECORD_VALIDATION_SAVE_CODES.authorityDivergence,
                },
              ],
            });
          }
          if (RBValidationError.isRBValidationError(outcome.terminalCause)) {
            throw new RBValidationError({
              message: `pre-save trigger failed to complete for oid ${oid} mode ${mode}`,
              problemKind: RBValidationError.classify(outcome.terminalCause),
              displayErrors: [{ title: '@record-save-pre-save-processing-failed', meta: { oid } }],
            });
          }
          throw new RBValidationError({
            message: `pre-save trigger failed to complete for oid ${oid} mode ${mode}`,
            displayErrors: [{ title: '@record-save-pre-save-processing-failed', meta: { oid } }],
          });
        }
        const candidate = (outcome.candidate ?? record) as AnyRecord;
        return operation !== undefined && actionMode !== 'onDelete'
          ? this.normalizeHookCandidateIdentity(candidate, execution.recordOid)
          : candidate;
      } catch (error) {
        if (RBValidationError.isRBValidationError(error)) {
          throw error;
        }
        throw new RBValidationError({
          message: `pre-save trigger failed to complete for oid ${oid} mode ${mode}`,
          displayErrors: [{ title: '@record-save-pre-save-processing-failed', meta: { oid } }],
        });
      }
    }

    private async runPostSaveSyncTriggers(options: RunPostSaveSyncOptions): Promise<RegisteredPostSyncResult> {
      const { oid, record, recordType, mode, user, response, operation } = options;
      const execution = operation ?? this.createHookExecutionOperation(mode, undefined, oid ?? undefined);
      try {
        const coordinator = this.recordActionCoordinator(execution, record, recordType, user, mode);
        const outcome = await coordinator.runSequential(record, mode, 'postSync');
        if (operation === undefined) {
          this.completeHookOperation(execution);
        }
        if (outcome.terminalCause !== undefined) {
          if (outcome.terminalCause instanceof RecordActionIdentityFailure) {
            throw new RBValidationError({
              message: 'A record action attempted to replace the authoritative public OID.',
              displayErrors: [
                {
                  title: `@record-save-${RECORD_VALIDATION_SAVE_CODES.authorityDivergence}`,
                  code: RECORD_VALIDATION_SAVE_CODES.authorityDivergence,
                },
              ],
            });
          }
          if (RBValidationError.isRBValidationError(outcome.terminalCause)) {
            throw new RBValidationError({
              message: `post-save trigger failed to complete for oid ${oid} mode ${mode}`,
              problemKind: RBValidationError.classify(outcome.terminalCause),
              displayErrors: [{ title: '@record-save-post-save-failed', meta: { oid } }],
            });
          }
          throw new RBValidationError({
            message: `post-save trigger failed to complete for oid ${oid} mode ${mode}`,
            displayErrors: [{ title: '@record-save-post-save-failed', meta: { oid } }],
          });
        }
        const actionRecord = (outcome.candidate ?? record) as AnyRecord;
        const nextRecord =
          operation !== undefined && mode !== 'onDelete'
            ? this.normalizeHookCandidateIdentity(actionRecord, execution.recordOid)
            : actionRecord;
        const nextResponse: AnyRecord = { ...response };
        for (const safeOutput of outcome.safeOutputs) {
          const fields = safeOutput.output.fields;
          if (typeof fields.workspaceOid === 'string' && fields.workspaceOid.trim()) {
            nextResponse.workspaceOid = fields.workspaceOid;
          }
          if (Object.hasOwn(fields, 'workspaceData')) {
            nextResponse.workspaceData = fields.workspaceData;
          }
        }
        return {
          record: nextRecord,
          response: nextResponse,
          report: outcome.report,
          ...(outcome.terminalCause === undefined ? {} : { terminalCause: outcome.terminalCause }),
        };
      } catch (error) {
        if (RBValidationError.isRBValidationError(error)) {
          throw error;
        }
        throw new RBValidationError({
          message: `post-save trigger failed to complete for oid ${oid} mode ${mode}`,
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
      const deferred = operation ? this.deferredSavePostHookDispatches.get(operation) : undefined;
      if (deferred) {
        deferred.push({
          oid,
          mode: mode as ActionExecutionOperation['mode'],
        });
        return;
      }
      const execution =
        operation ??
        this.createHookExecutionOperation(mode as ActionExecutionOperation['mode'], undefined, oid ?? undefined);
      try {
        const actionMode = mode as ActionExecutionMode;
        this.recordActionCoordinator(execution, record, recordType, user, actionMode).dispatchPost(record, actionMode);
        if (operation === undefined) {
          this.completeHookOperation(execution);
        }
      } catch (error) {
        sails.log.error(`Invalid registered post-save action plan for ${mode}; skipping fire-and-forget action`, error);
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
