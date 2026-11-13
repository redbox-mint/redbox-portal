import { randomUUID } from 'node:crypto';
import { authorizeRun } from './generation/authorize-run';
import type {
  GenerationCommitRequest,
  GenerationCommitResult,
  GenerationFieldProvenanceView,
  GenerationProvenanceResponse,
} from '@researchdatabox/sails-ng-common';
import { Services as services } from '../CoreService';
import type { BrandingModel, UserModel } from '../model';
import { canonicalHash, GenerationActorContext, GenerationArtifactPayload, GenerationError, getJsonPointer } from '../model/generation';
import type { GenerationRunAttributes } from '../waterline-models/GenerationRun';
import type { GenerationFieldProvenanceAttributes } from '../waterline-models/GenerationFieldProvenance';
import type { GenerationEncryptedEnvelope } from './GenerationCryptoService';
import { envelopeFromArtifact } from './GenerationRunService';
import { requireService, requireWaterlineRows } from './generation/require-service';

type RecordLike = { redboxOid?: string; metadata?: Record<string, unknown>; metaMetadata?: Record<string, unknown> };
interface RecordsLike {
  getMeta(oid: string): Promise<RecordLike>;
  hasViewAccess(brand: BrandingModel, user: UserModel, roles: unknown[], record: RecordLike): boolean;
  hasEditAccess(brand: BrandingModel, user: UserModel, roles: unknown[], record: RecordLike): boolean;
}
interface CryptoLike {
  decrypt<T>(brandId: string, runId: string, envelope: GenerationEncryptedEnvelope): Promise<T>;
  encrypt(brandId: string, runId: string, payload: unknown): Promise<GenerationEncryptedEnvelope>;
}

export namespace Services {
  export class GenerationProvenanceService extends services.Core.Service {
    protected override _exportedMethods = ['commit', 'getForRecord', 'review'];

    public async commit(
      actor: GenerationActorContext,
      user: UserModel,
      brand: BrandingModel,
      runId: string,
      request: GenerationCommitRequest,
    ): Promise<GenerationCommitResult> {
      if (!Array.isArray(request.appliedFieldIds) || request.appliedFieldIds.some(id => typeof id !== 'string') ||
        new Set(request.appliedFieldIds).size !== request.appliedFieldIds.length ||
        !Array.isArray(request.reviewedFieldIds) || request.reviewedFieldIds.some(id => typeof id !== 'string') ||
        new Set(request.reviewedFieldIds).size !== request.reviewedFieldIds.length) {
        throw new GenerationError('GENERATION_COMMIT_INVALID', 'Generation field receipt is invalid');
      }
      const run = await GenerationRun.findOne({ id: runId, brandId: actor.brandId, initiatedByUserId: actor.userId });
      if (!run) throw new GenerationError('GENERATION_COMMIT_INVALID', 'Generation run was not found');
      const sameIds = (left: string[], right: string[]) => left.length === right.length && left.every(id => right.includes(id));
      if ((run.commitAppliedFieldIds && !sameIds(run.commitAppliedFieldIds, request.appliedFieldIds)) ||
        (run.commitReviewedFieldIds && !sameIds(run.commitReviewedFieldIds, request.reviewedFieldIds))) {
        throw new GenerationError('GENERATION_COMMIT_INVALID', 'Generation field receipt does not match its prior commit');
      }
      if (run.status === 'committed') {
        if (!run.commitAppliedFieldIds || run.targetDescriptor.targetOid !== request.targetOid || run.candidateDigest !== request.candidateDigest) {
          throw new GenerationError('GENERATION_COMMIT_INVALID', 'Generation receipt does not match its prior commit');
        }
        await this.cleanupArtifact(run);
        const count = await GenerationFieldProvenance.count({ brandId: actor.brandId, runId });
        return { runId, targetOid: request.targetOid, committed: true, provenanceCount: count };
      }
      if (!['completed', 'committing'].includes(run.status) || run.candidateDigest !== request.candidateDigest ||
        (run.targetDescriptor.targetOid && run.targetDescriptor.targetOid !== request.targetOid)) {
        throw new GenerationError('GENERATION_COMMIT_INVALID', 'Generation receipt is not ready or its digest is invalid');
      }
      const records = requireService<RecordsLike>('recordsservice', ['getMeta', 'hasViewAccess', 'hasEditAccess']);
      const record = await records.getMeta(request.targetOid);
      await authorizeRun(run);
      if (!record || String(record.metaMetadata?.brandId ?? '') !== actor.brandId ||
        String(record.metaMetadata?.type ?? '') !== run.targetDescriptor.recordType ||
        String(record.metaMetadata?.createdBy ?? '') !== actor.username ||
        !records.hasEditAccess(brand, user, user.roles, record)) {
        throw new GenerationError('GENERATION_COMMIT_INVALID', 'Saved generation target is not available');
      }
      const binding = await GenerationBinding.findOne({ id: run.bindingId, brandId: actor.brandId });
      if (!binding || (run.sourceRefs.length > 0 && getJsonPointer(record.metadata ?? {}, String(binding.sourceRelationship?.metadataPointer ?? '')) !== run.sourceRefs[0]?.oid)) {
        throw new GenerationError('GENERATION_COMMIT_INVALID', 'Saved generation target is not linked to the authorised source');
      }
      const artifact = await GenerationRunArtifact.findOne({ brandId: actor.brandId, runId });
      if (!artifact) throw new GenerationError('GENERATION_ARTIFACT_EXPIRED', 'Generation candidate expired before provenance commit');
      const crypto = requireService<CryptoLike>('generationcryptoservice', ['encrypt', 'decrypt']);
      const payload = await crypto.decrypt<GenerationArtifactPayload>(actor.brandId, runId, envelopeFromArtifact(artifact));
      if (!payload.candidate || payload.candidate.candidateDigest !== request.candidateDigest) {
        throw new GenerationError('GENERATION_COMMIT_INVALID', 'Generation candidate receipt is invalid');
      }
      const candidateDigest = canonicalHash(payload.candidate.items.map(({ fieldId, value, valueHash }) => ({ fieldId, value, valueHash })));
      if (candidateDigest !== payload.candidate.candidateDigest ||
        payload.candidate.items.some((item) => canonicalHash(item.value) !== item.valueHash)) {
        throw new GenerationError('GENERATION_COMMIT_INVALID', 'Generation candidate hashes are invalid');
      }
      const candidateIds = new Set(payload.candidate.items.map(item => item.fieldId));
      if (request.appliedFieldIds.some(id => !candidateIds.has(id))) {
        throw new GenerationError('GENERATION_COMMIT_INVALID', 'Applied generation fields are invalid');
      }
      const appliedIds = new Set(request.appliedFieldIds);
      const appliedItems = payload.candidate.items.filter(item => appliedIds.has(item.fieldId));
      const validReviewIds = new Set(appliedItems.filter(item => item.reviewRequired).map(item => item.fieldId));
      if (request.reviewedFieldIds.some(id => !validReviewIds.has(id))) {
        throw new GenerationError('GENERATION_COMMIT_INVALID', 'Reviewed generation fields are invalid');
      }
      const now = new Date().toISOString();
      if (run.status === 'committing' && run.commitLeaseExpiresAt && run.commitLeaseExpiresAt > now) {
        throw new GenerationError('GENERATION_INVALID_STATE', 'Generation commit is already in progress', true);
      }
      const token = randomUUID();
      const owner = { id: runId, brandId: actor.brandId, status: 'committing', commitToken: token };
      const claimed = await GenerationRun.updateOne({
        id: runId, brandId: actor.brandId, status: run.status,
        commitToken: run.commitToken ?? null, commitLeaseExpiresAt: run.commitLeaseExpiresAt ?? null,
      }).set({
        status: 'committing', phase: 'saveCommit', commitToken: token,
        commitLeaseExpiresAt: new Date(Date.now() + 60_000).toISOString(),
        commitStartedAt: run.commitStartedAt || now,
        commitReviewedFieldIds: run.commitReviewedFieldIds ?? request.reviewedFieldIds,
        commitAppliedFieldIds: run.commitAppliedFieldIds ?? request.appliedFieldIds,
        targetDescriptor: { ...run.targetDescriptor, targetOid: request.targetOid },
      });
      if (!claimed) throw new GenerationError('GENERATION_INVALID_STATE', 'Generation commit changed concurrently', true);
      try {
        for (const item of appliedItems) {
          const renewed = await GenerationRun.updateOne(owner).set({
            commitLeaseExpiresAt: new Date(Date.now() + 60_000).toISOString(),
          });
          if (!renewed) throw new GenerationError('GENERATION_INVALID_STATE', 'Generation commit ownership changed', true);
          const reviewed = claimed.commitReviewedFieldIds?.includes(item.fieldId) ?? false;
          const values = {
            brandId: actor.brandId, runId, targetRecordOid: request.targetOid,
            profileFieldId: item.fieldId, metadataPointer: item.metadataPointer,
            generatedValueHash: item.valueHash, candidateDigest: payload.candidate.candidateDigest,
            evidenceRefs: item.evidence.map((evidence) => ({ id: evidence.id, label: evidence.label, kind: evidence.kind })),
            rationale: item.rationale.slice(0, 500), groundingState: item.groundingState,
            reviewRequired: item.reviewRequired && !reviewed, reviewReasonCode: item.reviewReasonCode,
            reviewedBy: reviewed ? actor.userId : undefined, reviewedAt: reviewed ? claimed.commitStartedAt : undefined,
            generatedAt: run.completedAt ?? claimed.commitStartedAt, committedAt: claimed.commitStartedAt,
          };
          // Immutable upserts are safe even if a slow database write outlives its lease.
          // Retries must not overwrite a human review made after a partial commit.
          const criteria = { brandId: actor.brandId, runId, profileFieldId: item.fieldId };
          let existing = await GenerationFieldProvenance.findOne(criteria);
          if (!existing) {
            try { await GenerationFieldProvenance.create(values).fetch(); }
            catch (error) {
              existing = await GenerationFieldProvenance.findOne(criteria);
              if (!existing) throw error; // Unique index may have admitted the replacement owner.
            }
          }
          if (existing && (existing.targetRecordOid !== request.targetOid || existing.candidateDigest !== request.candidateDigest)) {
            throw new GenerationError('GENERATION_COMMIT_INVALID', 'Generation provenance conflicts with its receipt');
          }
        }
        const committed = await GenerationRun.updateOne(owner).set({
          status: 'committed', committedAt: new Date().toISOString(),
        });
        if (!committed) throw new GenerationError('GENERATION_INVALID_STATE', 'Generation commit ownership changed', true);
        await this.cleanupArtifact(committed);
        return { runId, targetOid: request.targetOid, committed: true, provenanceCount: appliedItems.length };
      } catch (error) {
        // Only this owner can release its claim. The pinned receipt survives retry.
        await GenerationRun.updateOne(owner).set({ status: 'completed', phase: 'population' });
        throw error;
      }
    }

    private async cleanupArtifact(run: GenerationRunAttributes): Promise<void> {
      const artifact = await GenerationRunArtifact.findOne({ brandId: run.brandId, runId: run.id });
      if (!artifact) return;
      const criteria = { id: artifact.id, brandId: run.brandId, runId: run.id, ciphertext: artifact.ciphertext };
      const expiresAt = new Date(Date.parse(run.committedAt ?? '') + Math.min(run.diagnosticRetentionDays, 30) * 86_400_000);
      if (run.diagnosticRetentionDays === 0 || !Number.isFinite(expiresAt.getTime()) || expiresAt.getTime() <= Date.now()) {
        await GenerationRunArtifact.destroy(criteria);
        return;
      }
      if (artifact.contentKinds.length === 1 && artifact.contentKinds[0] === 'candidate') return;
      const crypto = requireService<CryptoLike>('generationcryptoservice', ['encrypt', 'decrypt']);
      const payload = await crypto.decrypt<GenerationArtifactPayload>(run.brandId, run.id, envelopeFromArtifact(artifact));
      const diagnostic = await crypto.encrypt(run.brandId, run.id, { candidate: payload.candidate });
      const updated = await GenerationRunArtifact.updateOne(criteria).set({
        ...diagnostic, expiresAt: expiresAt.toISOString(), contentKinds: ['candidate'],
      });
      if (!updated) {
        const current = await GenerationRunArtifact.findOne({ brandId: run.brandId, runId: run.id });
        if (current && !(current.contentKinds.length === 1 && current.contentKinds[0] === 'candidate')) {
          throw new GenerationError('GENERATION_INVALID_STATE', 'Generation artifact cleanup changed concurrently', true);
        }
      }
    }

    public async getForRecord(
      actor: GenerationActorContext,
      user: UserModel,
      brand: BrandingModel,
      targetOid: string,
    ): Promise<GenerationProvenanceResponse> {
      const records = requireService<RecordsLike>('recordsservice', ['getMeta', 'hasViewAccess', 'hasEditAccess']);
      const record = await records.getMeta(targetOid);
      if (!record || String(record.metaMetadata?.brandId ?? '') !== actor.brandId || !records.hasViewAccess(brand, user, user.roles, record)) {
        throw new GenerationError('GENERATION_TARGET_FORBIDDEN', 'Record provenance is not available');
      }
      const rows = requireWaterlineRows<GenerationFieldProvenanceAttributes>(
        await GenerationFieldProvenance.find({ brandId: actor.brandId, targetRecordOid: targetOid }),
        'GenerationFieldProvenance',
      );
      const fields: GenerationFieldProvenanceView[] = rows.map((row) => {
        const current = getJsonPointer(record.metadata ?? {}, row.metadataPointer);
        const displayState = current === undefined || current === null || current === ''
          ? 'removed' as const
          : canonicalHash(current) === row.generatedValueHash ? 'generated' as const : 'edited' as const;
        return {
          id: row.id, runId: row.runId, profileFieldId: row.profileFieldId, metadataPointer: row.metadataPointer,
          displayState, groundingState: row.groundingState, reviewRequired: row.reviewRequired,
          reviewReasonCode: row.reviewReasonCode, reviewedAt: row.reviewedAt, rationale: row.rationale,
          evidence: row.evidenceRefs.map((item) => ({
            id: String(item.id ?? ''), label: String(item.label ?? ''),
            kind: item.kind === 'knowledge' ? 'knowledge' as const : 'source' as const,
          })),
          generatedAt: row.generatedAt, committedAt: row.committedAt,
        };
      });
      return { recordOid: targetOid, fields };
    }

    public async review(
      actor: GenerationActorContext,
      user: UserModel,
      brand: BrandingModel,
      provenanceId: string,
    ): Promise<GenerationFieldProvenanceAttributes> {
      const provenance = await GenerationFieldProvenance.findOne({ id: provenanceId, brandId: actor.brandId });
      if (!provenance) throw new GenerationError('GENERATION_TARGET_FORBIDDEN', 'Generation provenance was not found');
      const records = requireService<RecordsLike>('recordsservice', ['getMeta', 'hasViewAccess', 'hasEditAccess']);
      const record = await records.getMeta(provenance.targetRecordOid);
      if (!record || !records.hasEditAccess(brand, user, user.roles, record)) throw new GenerationError('GENERATION_TARGET_FORBIDDEN', 'Generation provenance cannot be reviewed');
      const updated = await GenerationFieldProvenance.updateOne({ id: provenanceId, brandId: actor.brandId }).set({
        reviewRequired: false, reviewedBy: actor.userId, reviewedAt: new Date().toISOString(),
      });
      if (!updated) throw new GenerationError('GENERATION_TARGET_FORBIDDEN', 'Generation provenance changed concurrently');
      return updated;
    }
  }
}
