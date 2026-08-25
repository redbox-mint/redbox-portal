import { createHash, randomUUID } from 'node:crypto';
import { Services as services } from '../CoreService';
import { AttachmentAccessAuditAttributes, AttachmentMetadataAttributes } from '../waterline-models';
import { normalizeAttachmentStagingFileId } from '../AttachmentStagingIdentity';

export namespace Services {
  const STAGING_COORDINATOR_OID = '__global_attachment_staging__';
  const STAGING_COORDINATOR_LEASE_MS = 5 * 60 * 1000;
  export type AttachmentAccessAction = 'access' | 'download' | 'list' | 'upload' | 'remove';
  export type AttachmentMutationState = Exclude<
    NonNullable<AttachmentMetadataAttributes['mutationState']>,
    'cleanup-checking' | 'staging-available' | 'staging-preparing' | 'staging-cleanup'
  >;
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
    token: string;
    phase?: 'checking' | 'removing';
  };
  export type AttachmentMetadataServiceContract = {
    upsert: (row: AttachmentMetadataInput) => Promise<void>;
    findByOid: (oid: string) => Promise<AttachmentMetadataAttributes[]>;
    findUnresolvedByOid: (oid: string) => Promise<AttachmentMetadataAttributes[]>;
    findUnresolvedByStagingFileId: (fileId: string) => Promise<AttachmentMetadataAttributes[]>;
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
    hasCleanupClaim: (oid: string, fileId: string) => Promise<boolean>;
    claimExpiredStagingCleanup: (before: string, limit?: number) => Promise<AttachmentStagingCleanupClaim[]>;
    beginStagingCleanup: (claim: AttachmentStagingCleanupClaim) => Promise<boolean>;
    authorizeStagingCleanup: (claim: AttachmentStagingCleanupClaim) => Promise<boolean>;
    releaseStagingCleanup: (claim: AttachmentStagingCleanupClaim, code: string) => Promise<boolean>;
    completeStagingCleanup: (claim: AttachmentStagingCleanupClaim) => Promise<boolean>;
    recoverStagingCleanup: (
      claim: AttachmentStagingCleanupClaim,
      stagedObjectExists: boolean
    ) => Promise<'completed' | 'retained' | 'lost'>;
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
      'findUnresolvedByStagingFileId',
      'findOneByStorageKey',
      'prepareMutations',
      'markMutation',
      'hasCleanupClaim',
      'claimExpiredStagingCleanup',
      'beginStagingCleanup',
      'authorizeStagingCleanup',
      'releaseStagingCleanup',
      'completeStagingCleanup',
      'recoverStagingCleanup',
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

    public async findUnresolvedByStagingFileId(fileId: string): Promise<AttachmentMetadataAttributes[]> {
      const normalizedFileId = normalizeAttachmentStagingFileId(fileId);
      if (!normalizedFileId) return [];
      return (await AttachmentMetadata.find({
        mutationFileId: normalizedFileId,
        isJournal: true,
        mutationState: { in: ['prepared', 'pending', 'incomplete', 'unknown'] },
      })) as AttachmentMetadataAttributes[];
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
        const token = randomUUID();
        if (
          !(await this.acquireStagingCoordinator(
            oid,
            mutationFileId,
            attachmentId,
            generation,
            token,
            'staging-preparing'
          ))
        ) {
          throw new Error('Attachment staging identity is already reserved.');
        }
        try {
          // The coordinator is held until the prepared row is durable. Cleanup
          // must acquire the same row before its reference scan, so it cannot
          // pass that scan and remove the blob during this preparation window.
          if (await this.hasCleanupClaim(oid, mutationFileId)) {
            throw new Error('Attachment staging cleanup already owns this mutation.');
          }
          const storageKey = String(row.storageKey ?? '').trim();
          const existing = (await AttachmentMetadata.findOne({ storageKey })) as AttachmentMetadataAttributes | null;
          if (existing) {
            throw new Error('Attachment mutation generation already exists.');
          }
          if (
            !(await this.acquireStagingCoordinator(
              oid,
              mutationFileId,
              attachmentId,
              generation,
              token,
              'staging-preparing'
            ))
          ) {
            throw new Error('Attachment staging preparation lease was lost.');
          }
          await this.upsert({
            ...row,
            fileId: this.journalFileId(attachmentId, generation, mutationFileId),
            mutationFileId,
            isJournal: true,
            mutationState: 'prepared',
          });
        } finally {
          if (
            !(await this.releaseStagingCoordinator(
              mutationFileId,
              attachmentId,
              generation,
              token,
              'staging-preparing'
            ))
          ) {
            throw new Error('Attachment staging preparation ownership could not be released safely.');
          }
        }
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
        'cleanup-removing': [],
        cleaned: [],
      };
      const existingState = existing.mutationState as AttachmentMutationState | undefined;
      if (!existingState || !allowedSources[mutationState].includes(existingState)) {
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
      const normalizedFileId = normalizeAttachmentStagingFileId(fileId);
      if (!String(oid ?? '').trim() || !normalizedFileId) return false;
      return Boolean(
        await AttachmentMetadata.findOne({
          mutationFileId: normalizedFileId,
          isJournal: true,
          mutationState: { in: ['cleanup-pending', 'cleanup-checking', 'cleanup-removing', 'cleaned'] },
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
        const token = randomUUID();
        const claimed = await AttachmentMetadata.updateOne({
          id: row.id,
          mutationState: 'cancelled',
          updatedAt: { '<': beforeIso },
        } as never).set({
          mutationState: 'cleanup-pending',
          coordinationToken: token,
          coordinationLeaseExpiresAt: this.coordinationLeaseExpiresAt(),
          lastAttemptAt: new Date().toISOString(),
          lastSafeErrorCode: undefined,
        });
        if (claimed) claims.push({ oid, attachmentId, fileId, generation, token, phase: 'checking' });
      }
      const staleQuery = AttachmentMetadata.find({
        isJournal: true,
        mutationState: { in: ['cleanup-pending', 'cleanup-checking', 'cleanup-removing'] },
        coordinationLeaseExpiresAt: { '<': new Date().toISOString() },
      }) as unknown as {
        sort: (sort: unknown) => { limit: (count: number) => Promise<AttachmentMetadataAttributes[]> };
      };
      const staleRows = await staleQuery.sort([{ coordinationLeaseExpiresAt: 'ASC' }]).limit(boundedLimit);
      for (const row of staleRows) {
        if (claims.length >= boundedLimit) break;
        const oid = String(row.oid ?? '').trim();
        const attachmentId = String(row.attachmentId ?? '').trim();
        const fileId = normalizeAttachmentStagingFileId(row.mutationFileId);
        const generation = String(row.generation ?? '').trim();
        const previousToken = String(row.coordinationToken ?? '').trim();
        const previousLease = row.coordinationLeaseExpiresAt
          ? new Date(row.coordinationLeaseExpiresAt).toISOString()
          : undefined;
        if (!row.id || !oid || !attachmentId || !fileId || !generation || !previousToken || !previousLease) continue;
        const token = randomUUID();
        const phase = row.mutationState === 'cleanup-removing' ? 'removing' : 'checking';
        const reclaimed = await AttachmentMetadata.updateOne({
          id: row.id,
          mutationState: row.mutationState,
          coordinationToken: previousToken,
          coordinationLeaseExpiresAt: previousLease,
        }).set({
          mutationState: phase === 'removing' ? 'cleanup-removing' : 'cleanup-pending',
          coordinationToken: token,
          coordinationLeaseExpiresAt: this.coordinationLeaseExpiresAt(),
          lastAttemptAt: new Date().toISOString(),
        });
        if (reclaimed) claims.push({ oid, attachmentId, fileId, generation, token, phase });
      }
      return claims;
    }

    public async beginStagingCleanup(claim: AttachmentStagingCleanupClaim): Promise<boolean> {
      const normalized = this.normalizeCleanupClaim(claim);
      if (!normalized) return false;
      if (
        !(await this.acquireStagingCoordinator(
          normalized.oid,
          normalized.fileId,
          normalized.attachmentId,
          normalized.generation,
          normalized.token,
          'staging-cleanup'
        ))
      ) {
        return false;
      }
      const updated = await AttachmentMetadata.updateOne({
        ...this.cleanupClaimCriteria(normalized),
        isJournal: true,
        mutationState: 'cleanup-pending',
      }).set({
        mutationState: 'cleanup-checking',
        coordinationLeaseExpiresAt: this.coordinationLeaseExpiresAt(),
        lastAttemptAt: new Date().toISOString(),
      });
      if (updated) return true;
      const alreadyBegun = await AttachmentMetadata.findOne({
        ...this.cleanupClaimCriteria(normalized),
        isJournal: true,
        mutationState: { in: ['cleanup-checking', 'cleanup-removing'] },
      });
      if (alreadyBegun) return true;
      await this.releaseStagingCoordinator(
        normalized.fileId,
        normalized.attachmentId,
        normalized.generation,
        normalized.token,
        'staging-cleanup'
      );
      return false;
    }

    public async authorizeStagingCleanup(claim: AttachmentStagingCleanupClaim): Promise<boolean> {
      const normalized = this.normalizeCleanupClaim(claim);
      if (
        !normalized ||
        !(await this.acquireStagingCoordinator(
          normalized.oid,
          normalized.fileId,
          normalized.attachmentId,
          normalized.generation,
          normalized.token,
          'staging-cleanup'
        ))
      ) {
        return false;
      }
      const updated = await AttachmentMetadata.updateOne({
        ...this.cleanupClaimCriteria(normalized),
        isJournal: true,
        mutationState: 'cleanup-checking',
      }).set({
        mutationState: 'cleanup-removing',
        coordinationLeaseExpiresAt: this.coordinationLeaseExpiresAt(),
        lastAttemptAt: new Date().toISOString(),
      });
      if (updated) return true;
      return Boolean(
        await AttachmentMetadata.findOne({
          ...this.cleanupClaimCriteria(normalized),
          isJournal: true,
          mutationState: 'cleanup-removing',
        })
      );
    }

    public async releaseStagingCleanup(claim: AttachmentStagingCleanupClaim, code: string): Promise<boolean> {
      const normalized = this.normalizeCleanupClaim(claim);
      if (!normalized) return false;
      const safeCode = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(code) ? code : 'attachment-cleanup-failed';
      const updated = await AttachmentMetadata.updateOne({
        ...this.cleanupClaimCriteria(normalized),
        isJournal: true,
        mutationState: { in: ['cleanup-pending', 'cleanup-checking'] },
      }).set({
        mutationState: 'cancelled',
        coordinationLeaseExpiresAt: undefined,
        lastAttemptAt: new Date().toISOString(),
        lastSafeErrorCode: safeCode,
      });
      const claimReleased =
        Boolean(updated) ||
        Boolean(
          await AttachmentMetadata.findOne({
            ...this.cleanupClaimCriteria(normalized),
            isJournal: true,
            mutationState: 'cancelled',
          })
        );
      if (!claimReleased) return false;
      return this.releaseStagingCoordinator(
        normalized.fileId,
        normalized.attachmentId,
        normalized.generation,
        normalized.token,
        'staging-cleanup'
      );
    }

    public async completeStagingCleanup(claim: AttachmentStagingCleanupClaim): Promise<boolean> {
      const normalized = this.normalizeCleanupClaim(claim);
      if (!normalized) return false;
      const completed = await AttachmentMetadata.updateOne({
        ...this.cleanupClaimCriteria(normalized),
        isJournal: true,
        mutationState: 'cleanup-removing',
      }).set({
        mutationState: 'cleaned',
        coordinationLeaseExpiresAt: undefined,
        lastAttemptAt: new Date().toISOString(),
        lastSafeErrorCode: 'attachment-cleanup-completed',
      });
      const claimCompleted =
        Boolean(completed) ||
        Boolean(
          await AttachmentMetadata.findOne({
            ...this.cleanupClaimCriteria(normalized),
            isJournal: true,
            mutationState: 'cleaned',
          })
        );
      if (!claimCompleted) return false;
      return this.releaseStagingCoordinator(
        normalized.fileId,
        normalized.attachmentId,
        normalized.generation,
        normalized.token,
        'staging-cleanup'
      );
    }

    public async recoverStagingCleanup(
      claim: AttachmentStagingCleanupClaim,
      stagedObjectExists: boolean
    ): Promise<'completed' | 'retained' | 'lost'> {
      const normalized = this.normalizeCleanupClaim(claim);
      if (
        !normalized ||
        !(await this.acquireStagingCoordinator(
          normalized.oid,
          normalized.fileId,
          normalized.attachmentId,
          normalized.generation,
          normalized.token,
          'staging-cleanup'
        ))
      ) {
        return 'lost';
      }
      if (!stagedObjectExists) {
        return (await this.completeStagingCleanup(normalized)) ? 'completed' : 'lost';
      }
      // Presence is ambiguous after a crash: it may be the old object or a
      // newly uploaded object using the same key. Never delete or release the
      // global identity in that state. The bounded lease allows another
      // worker to reconcile it later, while hasCleanupClaim keeps preparation
      // fail-closed until absence is observed.
      const retained = await AttachmentMetadata.updateOne({
        ...this.cleanupClaimCriteria(normalized),
        isJournal: true,
        mutationState: 'cleanup-removing',
      }).set({
        coordinationLeaseExpiresAt: this.coordinationLeaseExpiresAt(),
        lastAttemptAt: new Date().toISOString(),
        lastSafeErrorCode: 'attachment-cleanup-removal-unconfirmed',
      });
      return retained ? 'retained' : 'lost';
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

    private async acquireStagingCoordinator(
      oid: string,
      fileId: string,
      attachmentId: string,
      generation: string,
      token: string,
      ownerState: 'staging-preparing' | 'staging-cleanup'
    ): Promise<boolean> {
      const identity = this.stagingCoordinatorIdentity(fileId);
      const coordinator = await this.ensureStagingCoordinator(fileId, identity);
      if (
        coordinator.mutationState === ownerState &&
        coordinator.coordinationToken === token &&
        coordinator.attachmentId === attachmentId &&
        coordinator.generation === generation
      ) {
        return this.renewStagingCoordinator(coordinator, token, ownerState);
      }
      const reclaiming = coordinator.mutationState !== 'staging-available';
      if (reclaiming && !this.coordinationLeaseExpired(coordinator.coordinationLeaseExpiresAt)) return false;
      const updated = await AttachmentMetadata.updateOne({
        id: coordinator.id,
        oid: STAGING_COORDINATOR_OID,
        fileId: identity.fileId,
        storageKey: identity.storageKey,
        mutationFileId: fileId,
        isJournal: true,
        mutationState: coordinator.mutationState,
        ...(reclaiming
          ? {
              coordinationToken: coordinator.coordinationToken,
              coordinationLeaseExpiresAt: coordinator.coordinationLeaseExpiresAt,
            }
          : {}),
      }).set({
        mutationState: ownerState,
        attachmentId,
        generation,
        coordinationToken: token,
        coordinationLeaseExpiresAt: this.coordinationLeaseExpiresAt(),
        lastAttemptAt: new Date().toISOString(),
      });
      if (updated) return true;
      const raced = (await AttachmentMetadata.findOne({ storageKey: identity.storageKey })) as
        | AttachmentMetadataAttributes
        | null;
      return Boolean(
        this.isExpectedStagingCoordinator(raced, fileId, identity) &&
        raced?.mutationState === ownerState &&
        raced.coordinationToken === token &&
        raced.attachmentId === attachmentId &&
        raced.generation === generation
      );
    }

    private async ensureStagingCoordinator(
      fileId: string,
      identity: { fileId: string; storageKey: string }
    ): Promise<AttachmentMetadataAttributes> {
      let coordinator = (await AttachmentMetadata.findOne({
        storageKey: identity.storageKey,
      })) as AttachmentMetadataAttributes | null;
      if (!coordinator) {
        try {
          coordinator = (await AttachmentMetadata.create({
            oid: STAGING_COORDINATOR_OID,
            fileId: identity.fileId,
            storageKey: identity.storageKey,
            mutationFileId: fileId,
            isJournal: true,
            mutationState: 'staging-available',
          }).fetch()) as AttachmentMetadataAttributes;
        } catch (error) {
          if (!this.isUniqueConstraintError(error)) throw error;
          coordinator = (await AttachmentMetadata.findOne({
            storageKey: identity.storageKey,
          })) as AttachmentMetadataAttributes | null;
        }
      }
      if (!coordinator || !this.isExpectedStagingCoordinator(coordinator, fileId, identity)) {
        throw new Error('Attachment staging coordinator is unavailable or malformed.');
      }
      return coordinator;
    }

    private async releaseStagingCoordinator(
      fileId: string,
      attachmentId: string,
      generation: string,
      token: string,
      ownerState: 'staging-preparing' | 'staging-cleanup'
    ): Promise<boolean> {
      const identity = this.stagingCoordinatorIdentity(fileId);
      const coordinator = (await AttachmentMetadata.findOne({
        storageKey: identity.storageKey,
      })) as AttachmentMetadataAttributes | null;
      if (!coordinator || !this.isExpectedStagingCoordinator(coordinator, fileId, identity)) return false;
      const leaseExpiresAt = coordinator.coordinationLeaseExpiresAt;
      if (
        coordinator.mutationState !== ownerState ||
        coordinator.coordinationToken !== token ||
        coordinator.attachmentId !== attachmentId ||
        coordinator.generation !== generation ||
        !leaseExpiresAt ||
        this.coordinationLeaseExpired(leaseExpiresAt)
      ) {
        return false;
      }
      const released = await AttachmentMetadata.updateOne({
        id: coordinator.id,
        oid: STAGING_COORDINATOR_OID,
        fileId: identity.fileId,
        storageKey: identity.storageKey,
        mutationFileId: fileId,
        isJournal: true,
        mutationState: ownerState,
        coordinationToken: token,
        coordinationLeaseExpiresAt: leaseExpiresAt,
        attachmentId,
        generation,
      }).set({
        mutationState: 'staging-available',
        coordinationToken: undefined,
        coordinationLeaseExpiresAt: undefined,
        lastAttemptAt: new Date().toISOString(),
      });
      return Boolean(released);
    }

    private stagingCoordinatorIdentity(fileId: string): { fileId: string; storageKey: string } {
      const digest = createHash('sha256').update(fileId).digest('hex');
      return {
        fileId: `staging-coordinator-${digest}`,
        storageKey: `journal/staging-coordinator/${digest}`,
      };
    }

    private isExpectedStagingCoordinator(
      row: AttachmentMetadataAttributes | null,
      fileId: string,
      identity: { fileId: string; storageKey: string }
    ): boolean {
      return Boolean(
        row?.id &&
        row.oid === STAGING_COORDINATOR_OID &&
        row.fileId === identity.fileId &&
        row.storageKey === identity.storageKey &&
        row.mutationFileId === fileId &&
        row.isJournal === true &&
        (row.mutationState === 'staging-available' ||
          row.mutationState === 'staging-preparing' ||
          row.mutationState === 'staging-cleanup')
      );
    }

    private coordinationLeaseExpiresAt(): string {
      return new Date(Date.now() + STAGING_COORDINATOR_LEASE_MS).toISOString();
    }

    private coordinationLeaseExpired(value: unknown): boolean {
      const expiresAt = new Date(value as string | number | Date).getTime();
      return !Number.isFinite(expiresAt) || expiresAt <= Date.now();
    }

    private async renewStagingCoordinator(
      coordinator: AttachmentMetadataAttributes,
      token: string,
      ownerState: 'staging-preparing' | 'staging-cleanup'
    ): Promise<boolean> {
      const currentExpiry = new Date(coordinator.coordinationLeaseExpiresAt as string | number | Date).getTime();
      if (Number.isFinite(currentExpiry) && currentExpiry > Date.now() + 60_000) return true;
      return Boolean(
        await AttachmentMetadata.updateOne({
          id: coordinator.id,
          mutationState: ownerState,
          coordinationToken: token,
          coordinationLeaseExpiresAt: coordinator.coordinationLeaseExpiresAt,
        }).set({
          coordinationLeaseExpiresAt: this.coordinationLeaseExpiresAt(),
          lastAttemptAt: new Date().toISOString(),
        })
      );
    }

    private isUniqueConstraintError(error: unknown): boolean {
      const details = error as { code?: unknown; raw?: { code?: unknown }; cause?: { code?: unknown } } | null;
      return details?.code === 'E_UNIQUE' || details?.raw?.code === 11000 || details?.cause?.code === 11000;
    }

    private normalizeCleanupClaim(claim: AttachmentStagingCleanupClaim): AttachmentStagingCleanupClaim | undefined {
      const oid = String(claim?.oid ?? '').trim();
      const attachmentId = this.optionalIdentifier(claim?.attachmentId);
      const fileId = normalizeAttachmentStagingFileId(claim?.fileId);
      const generation = this.optionalIdentifier(claim?.generation);
      const token = this.optionalIdentifier(claim?.token);
      if (!oid || !attachmentId || !fileId || !generation || !token) return undefined;
      return { oid, attachmentId, fileId, generation, token, phase: claim.phase };
    }

    private cleanupClaimCriteria(claim: AttachmentStagingCleanupClaim): Record<string, unknown> {
      return {
        oid: claim.oid,
        attachmentId: claim.attachmentId,
        generation: claim.generation,
        mutationFileId: claim.fileId,
        coordinationToken: claim.token,
      };
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
      const coordinationToken = this.optionalIdentifier(row.coordinationToken);
      if (coordinationToken) {
        journal.coordinationToken = coordinationToken;
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
        value === 'cleanup-pending' ||
        value === 'cleanup-checking' ||
        value === 'cleanup-removing' ||
        value === 'cleaned' ||
        value === 'staging-available' ||
        value === 'staging-preparing' ||
        value === 'staging-cleanup'
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
