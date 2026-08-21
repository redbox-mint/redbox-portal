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
import { FormAttributes } from '../waterline-models';
import { normalizeRecordRelations } from '../config/recordtype.config';
import {
  RecordRelationshipExpandOptions,
  RecordRelationshipGraph,
  RecordMetaWithRelationships,
  RecordTypeLookupSummary,
} from '../RecordsService';
import {
  createRecordSaveContext,
  recordSaveProblem,
  RecordSaveContext,
  RecordSaveResponse,
  RecordSaveTracker,
  resolveStorageMutationState,
} from '../RecordSaveResponse';
import type {
  RecordAttachmentCompletionItem,
  RecordAttachmentOperation,
  RecordSaveIssue,
  RecordSavePhase,
  RecordSaveProblem,
  RecordSaveProblemKind,
} from '@researchdatabox/sails-ng-common';
import type { Services as AttachmentMetadataServices } from './AttachmentMetadataService';
import { createActionExecutionOperation, createActionExecutionSupervisor } from '../action-execution/executor';
import {
  projectRecordHookExecutionAuditSummary,
  type RecordHookExecutionAuditSummary,
} from '../action-execution/audit';
import type { ActionExecutionDependencies, ActionExecutionOperation } from '../action-execution/types';
import { RecordHookCoordinator, validateRecordHookConfiguration } from './record-hooks/coordinator';

export namespace Services {
  type AnyRecord = Record<string, unknown>;
  type RecordTypeLike = Partial<RecordTypeModel> & AnyRecord;
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
  type AttachmentJournalService = AttachmentMetadataServices.AttachmentMetadataServiceContract;
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
    private readonly saveHookOperations = new WeakMap<RecordSaveTracker, ActionExecutionOperation>();
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

    private hookCoordinator(operation: ActionExecutionOperation): RecordHookCoordinator {
      return new RecordHookCoordinator({
        operation,
        dependencies: this.hookExecutionDependencies(),
        resolveHook: (hook, mode, phase) => this.configuredHookFunction(hook, mode, phase),
      });
    }

    /**
     * Emit the single operation summary for one record operation. It is logged
     * once, by whichever caller owns the operation, so a create that runs pre,
     * post-sync, and detached phases still produces one summary event.
     */
    private completeHookOperation(operation: ActionExecutionOperation, partial = false): void {
      const summary = projectRecordHookExecutionAuditSummary(operation, { partial });
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
      fields.status =
        summary.partial
          ? 'partial'
          : (operation.detachedPending ?? 0) > 0
            ? 'dispatched'
            : hasFailure
              ? 'failed'
              : 'completed';
      if ((operation.detachedPending ?? 0) > 0) {
        fields.detached_pending = operation.detachedPending;
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

    /** Deprecation logger passed to the storage mutation boundary. */
    private readonly logLegacyMutationResponse = (message: string, details?: Record<string, unknown>): void => {
      sails.log.warn(`${this.logHeader} ${message}`, details);
    };

    /**
     * Structured save log.  Only safe scalars are recorded here; exception
     * objects are logged separately so they never reach a typed issue.
     */
    private logSaveOutcome(tracker: RecordSaveTracker, phase: RecordSavePhase, error?: unknown): void {
      const result = tracker.result;
      sails.log.warn(`${this.logHeader} record-save-outcome`, {
        event: 'record-save-outcome',
        operation: tracker.context.operation,
        routeFamily: tracker.context.routeFamily,
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
      tracker: RecordSaveTracker,
      user: AnyRecord,
      action: RecordAuditActionType,
      searchable: boolean
    ): Promise<RecordSaveResponse> {
      const operation = this.saveHookOperations.get(tracker);
      if (operation) {
        this.completeHookOperation(operation);
      }
      const oid = String(tracker.result.oid ?? '').trim();
      if (!tracker.result.wasPersisted() || !oid) {
        return tracker.toResponse();
      }

      let persistedRecord: AnyRecord;
      try {
        persistedRecord = (await this.getMeta(oid)) as unknown as AnyRecord;
      } catch (error) {
        sails.log.warn(`${this.logHeader} unable to reload committed record before side effects`, error);
        return tracker.toResponse();
      }

      if (searchable && this.searchService && typeof this.searchService.index === 'function') {
        void Promise.resolve()
          .then(() => this.searchService.index(oid, persistedRecord))
          .catch((error: unknown) => {
            sails.log.error(`${this.logHeader} index submission failed`, error);
          });
      }
      const submitAudit = (): void => {
        if (operation && (operation.detachedPending ?? 0) > 0) {
          this.completeHookOperation(operation);
        }
        void Promise.resolve()
          .then(() =>
            this.auditRecord(
              oid,
              persistedRecord,
              user,
              action,
              operation ? projectRecordHookExecutionAuditSummary(operation) : undefined
            )
          )
          .catch((error: unknown) => {
            sails.log.error(`${this.logHeader} persistence audit submission failed`, error);
          });
      };
      if (operation && (operation.detachedPending ?? 0) > 0) {
        operation.onDetachedComplete = submitAudit;
      } else {
        submitAudit();
      }
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

    private attachmentJournalStorageKey(oid: string, attachmentId: string, generation: string): string {
      return `journal/${oid}/${attachmentId}/${generation}`;
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
          storageKey: this.attachmentJournalStorageKey(oid, item.attachmentId, item.generation),
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
            journalStateKnown = await journal.markMutation(oid, item.attachmentId, item.generation, 'pending');
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
              journalStateKnown =
                (await journal.markMutation(oid, item.attachmentId, item.generation, 'applied')) && journalStateKnown;
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
                'attachment-operation-unknown'
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
      code: string
    ): Promise<void> {
      const journal = this.attachmentJournalService();
      if (!journal) {
        return;
      }
      for (const item of plan) {
        try {
          await journal.markMutation(oid, item.attachmentId, item.generation, state, code);
        } catch (error) {
          sails.log.error(
            `${this.logHeader} attachment journal ${state} update failed for ${item.attachmentId}`,
            error
          );
        }
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
      // The OID is tracked by the save state owner and must not be replaceable
      // by a hook or by the second metadata write used to clear pending refs.
      _.unset(finalizedRecord, 'redboxOid');
      _.unset(finalizedRecord, 'id');
      const response = await this.storageService.updateMeta(brand, oid, finalizedRecord, user);
      return resolveStorageMutationState(response, this.logLegacyMutationResponse) === 'applied';
    }

    private validateHookConfiguration(recordType: unknown, modes: readonly string[]): void {
      try {
        validateRecordHookConfiguration(recordType, modes, (hook, mode, phase) =>
          this.configuredHookFunction(hook, mode, phase), ['pre']);
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
              true
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
      const tracker = new RecordSaveTracker(
        createRecordSaveContext({
          ...(context ?? {}),
          operation: context?.operation ?? 'create',
        })
      );
      const brandObj = brand as BrandingModel;
      const recordTypeObj = recordType as RecordTypeLike;
      let recordObj = this.normalizeRecord(record);
      const userObj = user as AnyRecord;
      const recordTypeName = String(recordTypeObj?.name ?? _.get(recordObj, 'metaMetadata.type', '')).trim();
      const hookOperation = this.createHookExecutionOperation(
        'onCreate',
        tracker.context.requestId,
        String(recordObj.redboxOid ?? '').trim() || undefined
      );
      this.saveHookOperations.set(tracker, hookOperation);

      // Bootstrap-safe path when no configured RecordType/workflow exists.
      if (!recordTypeObj?.name) {
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

        let createResponse: StorageServiceResponse;
        try {
          createResponse = await this.storageService.create(brandObj, recordObj, recordTypeObj, userObj);
        } catch (error) {
          tracker.recordPrimaryUnknown(
            this.saveProblem('persistence', 'The record save could not be confirmed.', 'system', 'save-unknown')
          );
          this.logSaveOutcome(tracker, 'persistence', error);
          return tracker.toResponse();
        }
        const mutationState = resolveStorageMutationState(createResponse, this.logLegacyMutationResponse);
        if (mutationState === 'applied') {
          tracker.confirmPrimaryPersistence(createResponse.oid);
          hookOperation.completedThrough = 'persistence';
          if (
            this.searchService &&
            typeof this.searchService.index === 'function' &&
            recordTypeObj.searchable !== false
          ) {
            void Promise.resolve(this.searchService.index(createResponse.oid, recordObj)).catch((error: unknown) => {
              sails.log.error(`${this.logHeader} index submission failed`, error);
            });
          }
          try {
            await this.auditRecord(createResponse.oid, recordObj, userObj, RecordAuditActionType.created);
          } catch (error) {
            sails.log.error(`${this.logHeader} persistence audit submission failed`, error);
          }
        } else if (mutationState === 'not-applied') {
          tracker.recordPrimaryNotApplied(
            this.saveProblem('persistence', 'The record was not saved.', 'processing', 'save-not-applied')
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

      let wfStep = await firstValueFrom(WorkflowStepsService.getFirst(recordTypeObj));
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
      //set the initial workflow metadata to the first step
      this.setWorkflowStepRelatedMetadata(recordObj, wfStep);

      // Validate every configured synchronous hook before a transition hook
      // can execute.  A malformed hook is a pre-save processing failure, not
      // an untyped exception escaping the create path.
      try {
        this.validateHookConfiguration(recordTypeObj, ['onCreate', 'onTransitionWorkflow']);
      } catch (error) {
        tracker.recordPrimaryNotApplied(
          this.saveProblem('pre-save', 'Your changes were not saved.', 'processing', 'invalid-hook-configuration')
        );
        this.logSaveOutcome(tracker, 'pre-save', error);
        return tracker.toResponse();
      }

      if (targetStep) {
        wfStep = await firstValueFrom(WorkflowStepsService.get(recordTypeObj, targetStep));
        recordObj = await this.triggerPreSaveTransitionWorkflowTriggers(
          null,
          recordObj,
          recordTypeObj,
          wfStep,
          userObj,
          hookOperation
        );
        this.setWorkflowStepRelatedMetadata(recordObj, wfStep);
      }

      let createResponse: StorageServiceResponse = new StorageServiceResponse();
      // trigger the pre-save
      if (triggerPreSaveTriggers) {
        try {
          recordObj = await this.triggerPreSaveTriggers(
            null,
            recordObj,
            recordTypeObj,
            'onCreate',
            userObj,
            hookOperation
          );
        } catch (err) {
          sails.log.error(`${this.logHeader} Failed to run pre-save hooks when onCreate...`);
          sails.log.error(err);
          tracker.recordPrimaryNotApplied(this.saveProblemFromError(err, 'pre-save', 'Your changes were not saved.'));
          this.logSaveOutcome(tracker, 'pre-save', err);
          return tracker.toResponse();
        }
      }

      const createAttachmentFields = (recordObj.metaMetadata?.attachmentFields ?? []) as unknown[];
      try {
        this.ensureAttachmentIds(recordObj, createAttachmentFields);
      } catch (error) {
        tracker.recordPrimaryNotApplied(this.attachmentIdentityProblem(error));
        this.logSaveOutcome(tracker, 'pre-save', error);
        return tracker.toResponse();
      }

      const createOid = String(recordObj.redboxOid ?? '').trim() || randomUUID();
      recordObj.redboxOid = createOid;
      hookOperation.recordOid = createOid;
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
        createResponse = await this.storageService.create(brandObj, recordObj, recordTypeObj, userObj);
      } catch (error) {
        tracker.recordPrimaryUnknown(
          this.saveProblem('persistence', 'The record save could not be confirmed.', 'system', 'save-unknown')
        );
        this.logSaveOutcome(tracker, 'persistence', error);
        return tracker.toResponse();
      }
      const primaryMutationState = resolveStorageMutationState(createResponse, this.logLegacyMutationResponse);
      if (primaryMutationState === 'applied') {
        const persistedOid = String(createResponse.oid ?? '').trim() || createOid;
        tracker.confirmPrimaryPersistence(persistedOid, createResponse);
        hookOperation.completedThrough = 'persistence';
        const oid = persistedOid;
        if (oid !== createOid) {
          try {
            await this.attachmentJournalService()?.rebindOid(createOid, oid);
          } catch (error) {
            // The primary record is already committed. Keep the journal rows
            // eligible for reconciliation and still run the indexing/audit
            // hand-off for that confirmed commit.
            tracker.recordPostPersistenceProblem(
              this.saveProblem(
                'attachments',
                'Your record was saved, but attachment reconciliation could not be finalized.',
                'processing',
                'attachment-journal-failed'
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
            if (!(await this.finalizeAttachmentReferences(brandObj, oid, recordObj, userObj, attachmentFields))) {
              await this.markAttachmentPlanState(
                oid,
                createAttachmentPlan,
                'incomplete',
                'attachment-reference-finalization-failed'
              );
              tracker.setAttachmentItems(
                this.incompleteAttachmentItems(attachmentItems, 'attachment-reference-finalization-failed')
              );
              tracker.recordPostPersistenceProblem(
                this.saveProblem(
                  'attachments',
                  'Your record was saved, but attachment references could not be finalized.',
                  'processing',
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
            this.clearPendingAttachmentOids(recordMetadata, attachmentFields);
          } catch (error) {
            await this.markAttachmentPlanState(
              oid,
              createAttachmentPlan,
              'incomplete',
              'attachment-reference-finalization-failed'
            );
            tracker.setAttachmentItems(
              this.incompleteAttachmentItems(attachmentItems, 'attachment-reference-finalization-failed')
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
            const hookResponse = (await this.triggerPostSaveSyncTriggers(
              oid,
              recordObj,
              recordTypeObj,
              'onCreate',
              userObj,
              createResponse as unknown as AnyRecord,
              hookOperation
            )) as unknown as StorageServiceResponse;
            tracker.mergeLegacyHookFields(hookResponse);
            if (this.hookResponseFailed(hookResponse)) {
              tracker.recordPostPersistenceProblem(
                this.saveProblem(
                  'post-save',
                  'Your record was saved, but follow-up processing could not be completed.',
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
            // The awaited post-sync phase succeeded; later work is detached.
            hookOperation.completedThrough = 'postSync';
            if (this.hasPostSaveSyncHooks(recordTypeObj, 'onCreate')) {
              const hookMetadataResponse = await this.storageService.updateMeta(brandObj, oid, recordObj, userObj);
              const hookMutationState = resolveStorageMutationState(
                hookMetadataResponse,
                this.logLegacyMutationResponse
              );
              if (hookMutationState !== 'applied') {
                tracker.recordPostPersistenceProblem(
                  this.saveProblem(
                    'post-save',
                    'Your record was saved, but follow-up processing could not be completed.',
                    'processing',
                    'post-save-metadata-failed'
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
          } catch (err) {
            sails.log.error(
              `${this.logHeader} Exception while running post save sync hooks when creating: ${createResponse['oid']}`
            );
            sails.log.error(JSON.stringify(err));
            tracker.recordPostPersistenceProblem(
              this.saveProblem(
                'post-save',
                'Your record was saved, but follow-up processing could not be completed.',
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

          if (!_.isEmpty(targetStep)) {
            try {
              const transitionResponse = (await this.triggerPostSaveTransitionWorkflowTriggers(
                oid,
                recordObj,
                recordTypeObj,
                wfStep,
                userObj,
                createResponse,
                hookOperation
              )) as unknown as StorageServiceResponse;
              if (!this.hookResponseFailed(transitionResponse)) {
                if (this.hasPostSaveSyncHooks(recordTypeObj, 'onTransitionWorkflow')) {
                  const transitionMetadataResponse = await this.storageService.updateMeta(
                    brandObj,
                    oid,
                    recordObj,
                    userObj
                  );
                  const transitionMutationState = resolveStorageMutationState(
                    transitionMetadataResponse,
                    this.logLegacyMutationResponse
                  );
                  if (transitionMutationState !== 'applied') {
                    tracker.recordPostPersistenceProblem(
                      this.saveProblem(
                        'post-save',
                        'Your record was saved, but workflow metadata could not be finalized.',
                        'processing',
                        'transition-metadata-failed'
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
              } else {
                tracker.recordPostPersistenceProblem(
                  this.saveProblem(
                    'post-save',
                    'Your record was saved, but workflow processing could not be completed.',
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
            } catch (tErr) {
              sails.log.error(
                'RecordsService - create - Failed to run post-save hooks when onTransitionWorkflow... or Error updating meta:'
              );
              sails.log.error(tErr);
              tracker.recordPostPersistenceProblem(
                this.saveProblem(
                  'post-save',
                  'Your record was saved, but workflow processing could not be completed.',
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
          await this.markAttachmentPlanState(createOid, createAttachmentPlan, 'cancelled', 'save-not-applied');
          tracker.recordPrimaryNotApplied(
            this.saveProblem('persistence', 'The record was not saved.', 'processing', 'save-not-applied')
          );
        } else {
          tracker.recordPrimaryUnknown(
            this.saveProblem('persistence', 'The record save could not be confirmed.', 'system', 'save-unknown')
          );
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
      const tracker = new RecordSaveTracker(
        createRecordSaveContext({
          ...(context ?? {}),
          operation: context?.operation ?? (_.isEmpty(nextStep) ? 'update' : 'transition'),
        })
      );
      const hookOperation = this.createHookExecutionOperation(
        _.isEmpty(nextStep) ? 'onUpdate' : 'onTransitionWorkflow',
        tracker.context.requestId,
        oid
      );
      this.saveHookOperations.set(tracker, hookOperation);
      const brandObj = brand as BrandingModel;
      let recordObj = this.normalizeRecord(record);
      const recordMeta = recordObj.metaMetadata as AnyRecord;
      const userObj = user as AnyRecord;
      const nextStepObj = (nextStep ?? {}) as AnyRecord;
      let updateResponse: StorageServiceResponse = new StorageServiceResponse();
      const preTriggerResponse = new StorageServiceResponse();
      updateResponse.oid = oid;
      let hasPermissionToTransition = true;
      const origRecord = _.cloneDeep(recordObj);
      const origRecordObj = this.normalizeRecord(origRecord as AnyRecord);
      sails.log.verbose(`RecordService - updateMeta - origRecord - cloneDeep`);
      //This is done after cloning record to preserve origRecord during processing
      if (metadata !== undefined) {
        recordObj.metadata = metadata;
      }

      let recordType = null;
      if (!_.isEmpty(brand)) {
        recordType = await firstValueFrom(RecordTypesService.get(brandObj, recordMeta.type as string));
      }
      try {
        this.validateHookConfiguration(recordType, ['onUpdate', 'onTransitionWorkflow']);
      } catch (error) {
        tracker.recordPrimaryNotApplied(
          this.saveProblem('pre-save', 'Your changes were not saved.', 'processing', 'invalid-hook-configuration')
        );
        this.logSaveOutcome(tracker, 'pre-save', error);
        return tracker.toResponse();
      }

      if (!_.isEmpty(nextStepObj) && !_.isEmpty(nextStepObj.config)) {
        const nextStepConfig = (nextStepObj.config ?? {}) as AnyRecord;
        const transitionRoles = (nextStepConfig.authorization as AnyRecord | undefined)?.transitionRoles as
          | unknown[]
          | undefined;
        if (transitionRoles != undefined) {
          if (transitionRoles.length > 0) {
            const validRoles = _.filter(transitionRoles, (role: unknown) => {
              const val = _.find((userObj.roles ?? []) as unknown[], (userRole: unknown) => {
                const userRoleObj = userRole as AnyRecord;
                return role == userRoleObj || role == userRoleObj.name;
              });
              if (val != undefined) {
                return true;
              }
              return false;
            });
            if (validRoles.length == 0) {
              hasPermissionToTransition = false;
            }
          }
        }

        if (hasPermissionToTransition && !_.isEmpty(nextStepObj) && !_.isEmpty(recordType)) {
          try {
            sails.log.verbose(`RecordService - updateMeta - hasPermissionToTransition - enter`);
            sails.log.verbose(
              `RecordService - updateMeta triggerPreSaveTransitionWorkflowTriggers - before - nextStep ${JSON.stringify(nextStepObj)}`
            );
            recordObj = await this.triggerPreSaveTransitionWorkflowTriggers(
              updateResponse['oid'],
              recordObj,
              recordType,
              nextStepObj,
              userObj,
              hookOperation
            );
            this.transitionWorkflowStepMetadata(recordObj, nextStepObj);
          } catch (err) {
            sails.log.verbose('RecordService - updateMeta - onTransitionWorkflow triggerPreSaveTriggers error');
            sails.log.error(JSON.stringify(err));
            tracker.recordPrimaryNotApplied(this.saveProblemFromError(err, 'pre-save', 'Your changes were not saved.'));
            this.logSaveOutcome(tracker, 'pre-save', err);
            return tracker.toResponse();
          }
        }
      }

      const brandId = (recordMeta.brandId ?? brandObj?.id) ? String(recordMeta.brandId ?? brandObj?.id) : undefined;
      const form: FormAttributes | null = await firstValueFrom(
        FormsService.getFormByName(String(recordMeta.form ?? ''), true, brandId)
      );
      recordMeta.attachmentFields = form != undefined ? (form.configuration?.attachmentFields ?? []) : [];

      // process pre-save
      if (!_.isEmpty(brand) && triggerPreSaveTriggers === true) {
        try {
          sails.log.verbose('RecordService - updateMeta - calling triggerPreSaveTriggers');
          recordObj = await this.triggerPreSaveTriggers(oid, recordObj, recordType, 'onUpdate', userObj, hookOperation);
        } catch (err) {
          sails.log.error(`${this.logHeader} Failed to run pre-save hooks when onUpdate...`);
          sails.log.error(err);
          tracker.recordPrimaryNotApplied(this.saveProblemFromError(err, 'pre-save', 'Your changes were not saved.'));
          this.logSaveOutcome(tracker, 'pre-save', err);
          return tracker.toResponse();
        }
      }

      const currentRecordMeta = (recordObj.metaMetadata ?? {}) as AnyRecord;
      const attachmentFields = (currentRecordMeta.attachmentFields ?? []) as unknown[];
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
      const updateAttachmentPlan = this.attachmentMutationPlan(
        origRecordObj,
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

      // unsetting the ID just to be safe
      _.unset(recordObj, 'id');
      _.unset(recordObj, 'redboxOid');
      sails.log.verbose(`RecordService - updateMeta - before storageService.updateMeta`);
      //Some of the automated tests may be passing undefined or empty user
      if (!_.isUndefined(userObj) && !_.isEmpty(_.get(userObj, 'username', ''))) {
        recordMeta.lastSavedBy = _.get(userObj, 'username');
      }
      recordMeta.lastSaveDate = DateTime.local().toISO();
      // Primary metadata is the commit boundary.  Physical attachment work
      // must not run until this mutation is explicitly confirmed applied.
      try {
        updateResponse = await this.storageService.updateMeta(brandObj, oid, recordObj, userObj);
      } catch (error) {
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
        tracker.recordPrimaryNotApplied(
          this.saveProblem('persistence', 'Your changes were not saved.', 'processing', 'save-not-applied')
        );
        this.logSaveOutcome(tracker, 'persistence');
        return tracker.toResponse();
      }
      if (primaryUpdateMutationState === 'unknown') {
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
          if (!(await this.finalizeAttachmentReferences(brandObj, oid, recordObj, userObj, attachmentFields))) {
            await this.markAttachmentPlanState(
              oid,
              updateAttachmentPlan,
              'incomplete',
              'attachment-reference-finalization-failed'
            );
            tracker.setAttachmentItems(
              this.incompleteAttachmentItems(attachmentItems, 'attachment-reference-finalization-failed')
            );
            tracker.recordPostPersistenceProblem(
              this.saveProblem(
                'attachments',
                'Your changes were saved, but attachment references could not be finalized.',
                'processing',
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
          this.clearPendingAttachmentOids(recordObj.metadata as AnyRecord, attachmentFields);
        } catch (error) {
          await this.markAttachmentPlanState(
            oid,
            updateAttachmentPlan,
            'incomplete',
            'attachment-reference-finalization-failed'
          );
          tracker.setAttachmentItems(
            this.incompleteAttachmentItems(attachmentItems, 'attachment-reference-finalization-failed')
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
            recordType = await firstValueFrom(RecordTypesService.get(brandObj, recordMeta.type as string));
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
            const hookResponse = (await this.triggerPostSaveSyncTriggers(
              updateResponse['oid'],
              recordObj,
              recordType,
              'onUpdate',
              userObj,
              updateResponse as unknown as AnyRecord,
              hookOperation
            )) as unknown as StorageServiceResponse;
            tracker.mergeLegacyHookFields(hookResponse);
            if (this.hookResponseFailed(hookResponse)) {
              tracker.recordPostPersistenceProblem(
                this.saveProblem(
                  'post-save',
                  'Your changes were saved, but follow-up processing could not be completed.',
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
            // The awaited post-sync phase succeeded; later work is detached.
            hookOperation.completedThrough = 'postSync';
            if (this.hasPostSaveSyncHooks(recordType, 'onUpdate')) {
              const hookMetadataResponse = await this.storageService.updateMeta(brandObj, oid, recordObj, userObj);
              const hookMutationState = resolveStorageMutationState(
                hookMetadataResponse,
                this.logLegacyMutationResponse
              );
              if (hookMutationState !== 'applied') {
                tracker.recordPostPersistenceProblem(
                  this.saveProblem(
                    'post-save',
                    'Your changes were saved, but follow-up processing could not be completed.',
                    'processing',
                    'post-save-metadata-failed'
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
          } catch (err) {
            sails.log.error(`${this.logHeader} Exception while running post save sync hooks when updating:`);
            sails.log.error(JSON.stringify(err));
            tracker.recordPostPersistenceProblem(
              this.saveProblem(
                'post-save',
                'Your changes were saved, but follow-up processing could not be completed.',
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
            updateResponse['oid'],
            recordObj,
            recordType,
            'onUpdate',
            userObj,
            hookOperation
          );
          hookOperation.completedThrough = 'post-dispatch';

          if (hasPermissionToTransition && !_.isEmpty(nextStepObj)) {
            try {
              const transitionResponse = (await this.triggerPostSaveTransitionWorkflowTriggers(
                updateResponse['oid'],
                recordObj,
                recordType,
                nextStepObj,
                userObj,
                updateResponse,
                hookOperation
              )) as unknown as StorageServiceResponse;

              sails.log.verbose(
                `RecordService - updateMeta - triggerPostSaveTransitionWorkflowTriggers post save hook enter`
              );
              sails.log.verbose(JSON.stringify(transitionResponse));
              if (!this.hookResponseFailed(transitionResponse)) {
                sails.log.verbose(`RecordService - updateMeta - triggerPostSaveTransitionWorkflowTriggers ajaxOk`);
                if (this.hasPostSaveSyncHooks(recordType, 'onTransitionWorkflow')) {
                  const transitionMetadataResponse = await this.storageService.updateMeta(
                    brandObj,
                    oid,
                    recordObj,
                    userObj
                  );
                  const transitionMutationState = resolveStorageMutationState(
                    transitionMetadataResponse,
                    this.logLegacyMutationResponse
                  );
                  if (transitionMutationState !== 'applied') {
                    tracker.recordPostPersistenceProblem(
                      this.saveProblem(
                        'post-save',
                        'Your changes were saved, but workflow metadata could not be finalized.',
                        'processing',
                        'transition-metadata-failed'
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
              } else {
                sails.log.verbose(
                  `RecordService - updateMeta - triggerPostSaveTransitionWorkflowTriggers post save hook not successful`
                );
                tracker.recordPostPersistenceProblem(
                  this.saveProblem(
                    'post-save',
                    'Your changes were saved, but workflow processing could not be completed.',
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
            } catch (tErr) {
              sails.log.error(
                'RecordService - updateMeta - Failed to run post-save hooks when onTransitionWorkflow... or Error updating meta:'
              );
              sails.log.error(tErr);
              tracker.recordPostPersistenceProblem(
                this.saveProblem(
                  'post-save',
                  'Your changes were saved, but workflow processing could not be completed.',
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

    createBatch(type: unknown, data: AnyRecord, harvestIdFldName: unknown): Promise<unknown> {
      return this.storageService.createBatch(type, data, harvestIdFldName);
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
          user,
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
          user,
          action,
          projectRecordHookExecutionAuditSummary(hookOperation, { partial: true, completedThrough: 'persistence' })
        );
        this.searchService.remove(oid);

        try {
          sails.log.verbose('RecordsService - delete - calling triggerPostSaveSyncTriggers');
          response = (await this.triggerPostSaveSyncTriggers(
            oid,
            currentRecObj,
            recordTypeObj,
            'onDelete',
            user,
            response as unknown as AnyRecord,
            hookOperation
          )) as unknown as StorageServiceResponse;
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

        this.triggerPostSaveTriggers(oid, currentRecObj, recordTypeObj, 'onDelete', user, hookOperation);
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
      try {
        if (!_.isEmpty(nextStep)) {
          responseObj = (await this.triggerPostSaveSyncTriggers(
            oid,
            record,
            recordType,
            'onTransitionWorkflow',
            user,
            responseObj,
            operation
          )) as AnyRecord;
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

      if (!_.isEmpty(nextStep)) {
        this.triggerPostSaveTriggers(oid, record, recordType, 'onTransitionWorkflow', user, operation);
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
        const outcome = await this.hookCoordinator(execution).runPre(oid, record, recordType, mode, user);
        if (operation === undefined) {
          this.completeHookOperation(execution);
        }
        if (outcome.terminalCause !== undefined) {
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

    public async triggerPostSaveSyncTriggers(
      oid: string | null,
      record: AnyRecord,
      recordType: unknown,
      mode: string = 'onUpdate',
      user: unknown = {},
      response: AnyRecord = {},
      operation?: ActionExecutionOperation
    ): Promise<AnyRecord> {
      const execution =
        operation ??
        this.createHookExecutionOperation(mode as ActionExecutionOperation['mode'], undefined, oid ?? undefined);
      try {
        const outcome = await this.hookCoordinator(execution).runPostSync(
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
          throw new RBValidationError({
            message: `post-save trigger failed to complete for oid ${oid} mode ${mode}`,
            options: { cause: outcome.terminalCause },
            displayErrors: [{ title: '@record-save-post-save-failed', meta: { oid } }],
          });
        }
        return outcome.response;
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
        this.hookCoordinator(execution).dispatchPost(oid, record, recordType, mode, user);
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
