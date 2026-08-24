import { Services as services } from '../CoreService';
import { AttachmentAccessAuditAttributes, AttachmentMetadataAttributes } from '../waterline-models';
import { createHash } from 'node:crypto';
import { normalizeAttachmentStagingFileId } from '../AttachmentStagingIdentity';

export namespace Services {
  export type AttachmentAccessAction = 'access' | 'download' | 'list' | 'upload' | 'remove';
  export type AttachmentMutationState = NonNullable<AttachmentMetadataAttributes['mutationState']>;
  export type AttachmentMetadataInput = Omit<AttachmentMetadataAttributes, 'id' | 'createdAt' | 'updatedAt'>;
  export type AttachmentAccessAuditInput = Omit<AttachmentAccessAuditAttributes, 'id' | 'createdAt' | 'updatedAt'>;
  export type AttachmentAccessEvent = {
    oid: string;
    fileId?: string;
    storageKey?: string;
    action: AttachmentAccessAction;
    accessedBy?: string;
    itemCount?: number;
  };
  export type AttachmentStagingCleanupClaim = {
    oid: string;
    attachmentId: string;
    fileId: string;
    generation: string;
  };
  export type AttachmentMetadataServiceContract = {
    upsert: (row: AttachmentMetadataInput) => Promise<void>;
    findByOid: (oid: string) => Promise<AttachmentMetadataAttributes[]>;
    findUnresolvedByOid: (oid: string) => Promise<AttachmentMetadataAttributes[]>;
    findOneByStorageKey: (storageKey: string) => Promise<AttachmentMetadataAttributes | undefined>;
    prepareMutations: (rows: readonly AttachmentMetadataInput[]) => Promise<void>;
    markMutation: (
      oid: string,
      attachmentId: string,
      generation: string,
      state: AttachmentMutationState,
      code?: string,
      mutationFileId?: string,
    ) => Promise<boolean>;
      code?: string,
      mutationFileId?: string,
    ) => Promise<boolean>;
    hasCleanupClaim: (oid: string, fileId: string) => Promise<boolean>;
    claimExpiredStagingCleanup: (before: string, limit?: number) => Promise<AttachmentStagingCleanupClaim[]>;
    releaseStagingCleanup: (claim: AttachmentStagingCleanupClaim, code: string) => Promise<boolean>;
    completeStagingCleanup: (claim: AttachmentStagingCleanupClaim) => Promise<boolean>;
    rebindOid: (fromOid: string, toOid: string) => Promise<void>;
    markDeleted: (row: AttachmentMetadataInput) => Promise<void>;
    deleteByStorageKey: (storageKey: string) => Promise<void>;
    recordAccess: (event: AttachmentAccessEvent) => Promise<void>;
  };

  export class AttachmentMetadataService extends services.Core.Service {
    protected override _exportedMethods: string[] = [
      'upsert',
      'findByOid',
      'findUnresolvedByOid',
      'findOneByStorageKey',
      'prepareMutations',
      'markMutation',
      'hasCleanupClaim',
      'claimExpiredStagingCleanup',
      'releaseStagingCleanup',
      'completeStagingCleanup',
      'rebindOid',
      'markDeleted',
      'deleteByStorageKey',
      'recordAccess',
    ];

    protected override logHeader: string = 'AttachmentMetadataService::';

    public async upsert(row: AttachmentMetadataInput): Promise<void> {
      const storageKey = String(row.storageKey ?? '').trim();
      if (!storageKey) {
        throw new Error('AttachmentMetadataService.upsert requires storageKey');
      }

      const payload = this.normalizeMetadataRow(row);
      const oid = String(payload.oid ?? '').trim();
      const fileId = String(payload.fileId ?? '').trim();
      let existing = (await AttachmentMetadata.findOne({ storageKey })) as AttachmentMetadataAttributes | null;
      // A journal key may be upgraded from the original attachment-only form
      // to the mutation-specific form. Reuse that row when its mutation
      // identity is otherwise unchanged instead of leaving an unresolved
      // legacy row behind on the next retry.
      if (!existing && payload.isJournal === true && payload.attachmentId && payload.generation && payload.mutationFileId) {
        existing = (await AttachmentMetadata.findOne({
          oid,
          attachmentId: payload.attachmentId,
          generation: payload.generation,
          mutationFileId: payload.mutationFileId,
          isJournal: true,
        })) as AttachmentMetadataAttributes | null;
      }
      // A physical row may retain its identity if a storage prefix changes,
      // but journal rows must never claim the physical {oid,fileId} row.
      if (!existing && payload.isJournal !== true && oid && fileId) {
        const sameFileRows = (await AttachmentMetadata.find({ oid, fileId })) as AttachmentMetadataAttributes[] | null;
        existing = (sameFileRows ?? []).find(candidate => candidate.isJournal !== true) ?? null;
      }
      if (existing?.id) {
        await AttachmentMetadata.updateOne({ id: existing.id }).set(payload);
        return;
      }
      await AttachmentMetadata.create(payload).fetch();
    }

    public async findByOid(oid: string): Promise<AttachmentMetadataAttributes[]> {
      const normalizedOid = String(oid ?? '').trim();
      if (!normalizedOid) {
        return [];
      }
      const rows = (await AttachmentMetadata.find({ oid: normalizedOid }).sort([
        { createdAt: 'ASC' },
      ])) as AttachmentMetadataAttributes[];
      // Journal rows are retained for reconciliation, but prepared/pending
      // work is not a confirmed physical attachment and must not appear in
      // the listing API. Legacy rows without a mutationState remain visible.
      return rows.filter(row => {
        const mutationState = String(row.mutationState ?? '').trim();
        return (
          row.isJournal !== true &&
          row.operation !== 'delete' &&
          mutationState !== 'cancelled' &&
          (!mutationState || mutationState === 'applied')
        );
      });
    }

    public async findUnresolvedByOid(oid: string): Promise<AttachmentMetadataAttributes[]> {
      const normalizedOid = String(oid ?? '').trim();
      if (!normalizedOid) {
        return [];
      }
      const rows = (await AttachmentMetadata.find({ oid: normalizedOid }).sort([
        { createdAt: 'ASC' },
      ])) as AttachmentMetadataAttributes[];
      return rows.filter(
        row =>
          row.isJournal === true &&
          (row.mutationState === 'prepared' ||
            row.mutationState === 'pending' ||
            row.mutationState === 'incomplete' ||
            row.mutationState === 'unknown')
      );
    }

    public async prepareMutations(rows: readonly AttachmentMetadataInput[]): Promise<void> {
      for (const row of rows) {
        const attachmentId = String(row.attachmentId ?? '').trim();
        const generation = String(row.generation ?? '').trim();
        const oid = String(row.oid ?? '').trim();
        const mutationFileId = normalizeAttachmentStagingFileId(row.mutationFileId ?? row.fileId);
        if (!oid || !attachmentId || !generation || !mutationFileId) {
          throw new Error('Attachment mutation preparation requires bounded journal identity.');
        }
        if (await this.hasCleanupClaim(oid, mutationFileId)) {
          throw new Error('Attachment staging cleanup already owns this mutation.');
        }
        const storageKey = String(row.storageKey ?? '').trim();
        const existing = (await AttachmentMetadata.findOne({ storageKey })) as AttachmentMetadataAttributes | null;
        if (existing) {
          throw new Error('Attachment mutation generation already exists.');
        }
        await this.upsert({
          ...row,
          fileId: this.journalFileId(attachmentId, generation, mutationFileId),
          mutationFileId,
          isJournal: true,
          mutationState: 'prepared',
        });
      }
    }

    public async markMutation(
      oid: string,
      attachmentId: string,
      generation: string,
      mutationState: AttachmentMutationState,
      lastSafeErrorCode?: string,
      mutationFileId?: string,
    ): Promise<boolean> {
      const criteria = {
        oid: String(oid ?? '').trim(),
        attachmentId: String(attachmentId ?? '').trim(),
        generation: String(generation ?? '').trim(),
        isJournal: true,
        ...(String(mutationFileId ?? '').trim()
          ? { mutationFileId: String(mutationFileId).trim() }
          : {}),
      };
      if (!criteria.oid || !criteria.attachmentId || !criteria.generation) {
        return false;
      }
      const existing = (await AttachmentMetadata.findOne(criteria)) as AttachmentMetadataAttributes | null;
      if (!existing?.id) {
        return false;
      }
      const allowedSources: Record<AttachmentMutationState, readonly AttachmentMutationState[]> = {
        prepared: [],
        pending: ['prepared'],
        applied: ['pending'],
        incomplete: ['applied', 'unknown'],
        unknown: ['prepared', 'pending', 'applied'],
        cancelled: ['prepared', 'incomplete'],
        'cleanup-pending': ['cancelled'],
      };
      if (!existing.mutationState || !allowedSources[mutationState].includes(existing.mutationState)) {
        return false;
      }
      const updated = await AttachmentMetadata.updateOne({
        id: existing.id,
        mutationState: existing.mutationState,
      }).set({
        mutationState,
        attemptCount:
          mutationState === 'pending' ? Number(existing.attemptCount ?? 0) + 1 : Number(existing.attemptCount ?? 0),
        lastAttemptAt: new Date().toISOString(),
        ...(lastSafeErrorCode
          ? { lastSafeErrorCode }
          : mutationState === 'applied'
            ? { lastSafeErrorCode: undefined }
            : {}),
      });
      return Boolean(updated);
    }

    public async hasCleanupClaim(oid: string, fileId: string): Promise<boolean> {
      const normalizedOid = String(oid ?? '').trim();
      const normalizedFileId = String(fileId ?? '').trim();
      if (!normalizedOid || !normalizedFileId) return false;
      return Boolean(
        await AttachmentMetadata.findOne({
          oid: normalizedOid,
          mutationFileId: normalizedFileId,
          isJournal: true,
          mutationState: 'cleanup-pending',
        })
      );
    }

    public async claimExpiredStagingCleanup(before: string, limit = 100): Promise<AttachmentStagingCleanupClaim[]> {
      const beforeDate = new Date(before);
      if (Number.isNaN(beforeDate.getTime())) return [];
      const boundedLimit = Number.isSafeInteger(limit) ? Math.min(1000, Math.max(1, limit)) : 100;
      const beforeIso = beforeDate.toISOString();
      const query = AttachmentMetadata.find({
        isJournal: true,
        mutationState: 'cancelled',
        updatedAt: { '<': beforeIso },
      }) as unknown as {
        sort: (sort: unknown) => { limit: (count: number) => Promise<AttachmentMetadataAttributes[]> };
      };
      const rows = await query.sort([{ updatedAt: 'ASC' }]).limit(boundedLimit);
      const claims: AttachmentStagingCleanupClaim[] = [];
      for (const row of rows) {
        const oid = String(row.oid ?? '').trim();
        const attachmentId = String(row.attachmentId ?? '').trim();
        const fileId = normalizeAttachmentStagingFileId(row.mutationFileId);
        const generation = String(row.generation ?? '').trim();
        if (!row.id || !oid || !attachmentId || !fileId || !generation) continue;
        const claimed = await AttachmentMetadata.updateOne({
          id: row.id,
          mutationState: 'cancelled',
          updatedAt: { '<': beforeIso },
        } as never).set({
          mutationState: 'cleanup-pending',
          lastAttemptAt: new Date().toISOString(),
          lastSafeErrorCode: undefined,
        });
        if (claimed) claims.push({ oid, attachmentId, fileId, generation });
      }
      return claims;
    }

    public async releaseStagingCleanup(claim: AttachmentStagingCleanupClaim, code: string): Promise<boolean> {
      const safeCode = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(code) ? code : 'attachment-cleanup-failed';
      const updated = await AttachmentMetadata.updateOne({
        oid: claim.oid,
        attachmentId: claim.attachmentId,
        generation: claim.generation,
        mutationFileId: claim.fileId,
        isJournal: true,
        mutationState: 'cleanup-pending',
      }).set({
        mutationState: 'cancelled',
        lastAttemptAt: new Date().toISOString(),
        lastSafeErrorCode: safeCode,
      });
      return Boolean(updated);
    }

    public async completeStagingCleanup(claim: AttachmentStagingCleanupClaim): Promise<boolean> {
      const destroyed = await AttachmentMetadata.destroy({
        oid: claim.oid,
        attachmentId: claim.attachmentId,
        generation: claim.generation,
        mutationFileId: claim.fileId,
        isJournal: true,
        mutationState: 'cleanup-pending',
      });
      return Array.isArray(destroyed) ? destroyed.length > 0 : Boolean(destroyed);
    }

    private journalFileId(attachmentId: string, generation: string, mutationFileId: string): string {
      const identity = `${attachmentId}\u0000${generation}\u0000${mutationFileId}`;
      const suffix = createHash('sha256').update(identity).digest('hex').slice(0, 32);
      return `journal-${attachmentId}-${generation}-${suffix}`;
    }

    public async rebindOid(fromOid: string, toOid: string): Promise<void> {
      const from = String(fromOid ?? '').trim();
      const to = String(toOid ?? '').trim();
      if (!from || !to || from === to) {
        return;
      }
      await AttachmentMetadata.update({ oid: from }).set({ oid: to });
    }

    public async markDeleted(row: AttachmentMetadataInput): Promise<void> {
      await this.upsert({
        ...row,
        isJournal: false,
        operation: 'delete',
        mutationState: 'applied',
        lastAttemptAt: new Date().toISOString(),
      });
    }

    public async findOneByStorageKey(storageKey: string): Promise<AttachmentMetadataAttributes | undefined> {
      const normalizedStorageKey = String(storageKey ?? '').trim();
      if (!normalizedStorageKey) {
        return undefined;
      }
      return (await AttachmentMetadata.findOne({ storageKey: normalizedStorageKey })) as
        | AttachmentMetadataAttributes
        | undefined;
    }

    public async deleteByStorageKey(storageKey: string): Promise<void> {
      const normalizedStorageKey = String(storageKey ?? '').trim();
      if (!normalizedStorageKey) {
        return;
      }
      await AttachmentMetadata.destroy({ storageKey: normalizedStorageKey });
    }

    public async recordAccess(event: AttachmentAccessEvent): Promise<void> {
      try {
        const normalizedEvent = this.normalizeAccessEvent(event);
        if (!normalizedEvent.oid || !normalizedEvent.action) {
          return;
        }

        if (normalizedEvent.storageKey && normalizedEvent.action !== 'list') {
          const existing = (await AttachmentMetadata.findOne({
            storageKey: normalizedEvent.storageKey,
          })) as AttachmentMetadataAttributes | null;
          if (existing?.id) {
            const currentCount = Number(existing.accessCount ?? 0);
            const nextCount = this.shouldIncrementAccessCount(normalizedEvent.action) ? currentCount + 1 : currentCount;
            await AttachmentMetadata.updateOne({ id: existing.id }).set({
              lastAccessedAt: normalizedEvent.accessedAt,
              lastAccessedBy: normalizedEvent.accessedBy,
              accessCount: nextCount,
            });
          }
        }

        await AttachmentAccessAudit.create(normalizedEvent as AttachmentAccessAuditAttributes).fetch();
      } catch (err) {
        this.logger.error(`${this.logHeader} recordAccess() failed`, err);
        throw err;
      }
    }

    private shouldIncrementAccessCount(action: string): boolean {
      return action === 'download' || action === 'access';
    }

    private normalizeMetadataRow(row: AttachmentMetadataInput): Partial<AttachmentMetadataInput> {
      return {
        oid: String(row.oid ?? '').trim(),
        fileId: String(row.fileId ?? '').trim(),
        storageKey: String(row.storageKey ?? '').trim(),
        isJournal: row.isJournal === true,
        // Journal fields are only written when the caller supplies them, so an
        // ordinary metadata upsert cannot silently reset reconciliation state.
        ...this.journalRow(row),
        contentType: this.optionalString(row.contentType),
        contentLength: this.optionalNumber(row.contentLength),
        etag: this.optionalString(row.etag),
        lastModified: this.optionalDateString(row.lastModified),
        filename: this.optionalString(row.filename),
        mimeType: this.optionalString(row.mimeType),
        uploadedBy: this.optionalString(row.uploadedBy),
        attachmentField: this.optionalString(row.attachmentField),
        lastAccessedAt: this.optionalDateString(row.lastAccessedAt),
        lastAccessedBy: this.optionalString(row.lastAccessedBy),
        accessCount: this.optionalNumber(row.accessCount) ?? 0,
      };
    }

    private journalRow(row: AttachmentMetadataInput): Partial<AttachmentMetadataInput> {
      const journal: Partial<AttachmentMetadataInput> = {};
      const attachmentId = this.optionalIdentifier(row.attachmentId);
      if (attachmentId) {
        journal.attachmentId = attachmentId;
      }
      const operation = this.optionalOperation(row.operation);
      if (operation) {
        journal.operation = operation;
      }
      const mutationState = this.optionalMutationState(row.mutationState);
      if (mutationState) {
        journal.mutationState = mutationState;
      }
      const generation = this.optionalIdentifier(row.generation);
      if (generation) {
        journal.generation = generation;
      }
      const mutationFileId = normalizeAttachmentStagingFileId(row.mutationFileId);
      if (mutationFileId) {
        journal.mutationFileId = mutationFileId;
      }
      const attemptCount = this.optionalNumber(row.attemptCount);
      if (attemptCount !== undefined) {
        journal.attemptCount = attemptCount;
      }
      const lastAttemptAt = this.optionalDateString(row.lastAttemptAt);
      if (lastAttemptAt) {
        journal.lastAttemptAt = lastAttemptAt;
      }
      const lastSafeErrorCode = this.optionalIdentifier(row.lastSafeErrorCode);
      if (lastSafeErrorCode) {
        journal.lastSafeErrorCode = lastSafeErrorCode;
      }
      return journal;
    }

    private optionalIdentifier(value: unknown): string | undefined {
      const normalized = String(value ?? '').trim();
      return normalized && /^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/.test(normalized) ? normalized : undefined;
    }

    private optionalOperation(value: unknown): AttachmentMetadataAttributes['operation'] {
      return value === 'add' || value === 'finalize' || value === 'delete' ? value : undefined;
    }

    private optionalMutationState(value: unknown): AttachmentMetadataAttributes['mutationState'] {
      return value === 'prepared' ||
        value === 'pending' ||
        value === 'applied' ||
        value === 'incomplete' ||
        value === 'unknown' ||
        value === 'cancelled' ||
        value === 'cleanup-pending'
        ? value
        : undefined;
    }

    private normalizeAccessEvent(event: AttachmentAccessEvent): AttachmentAccessAuditInput {
      return {
        oid: String(event.oid ?? '').trim(),
        fileId: this.optionalString(event.fileId),
        storageKey: this.optionalString(event.storageKey),
        action: String(event.action ?? '').trim(),
        accessedBy: this.optionalString(event.accessedBy),
        accessedAt: new Date().toISOString(),
        itemCount: this.optionalNumber(event.itemCount),
      };
    }

    private optionalString(value: unknown): string | undefined {
      const normalized = String(value ?? '').trim();
      return normalized ? normalized : undefined;
    }

    private optionalNumber(value: unknown): number | undefined {
      if (value === null || value === undefined || value === '') {
        return undefined;
      }
      const normalized = Number(value);
      return Number.isFinite(normalized) ? normalized : undefined;
    }

    private optionalDateString(value: unknown): string | undefined {
      if (!value) {
        return undefined;
      }
      const normalizedDate = new Date(value as string | number | Date);
      return Number.isNaN(normalizedDate.getTime()) ? undefined : normalizedDate.toISOString();
    }
  }
}

declare global {
  let AttachmentMetadataService: Services.AttachmentMetadataService;
}
