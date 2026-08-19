import type {
  GenerationCommitRequest,
  GenerationCommitResult,
  GenerationFieldProvenanceView,
  GenerationProvenanceResponse,
} from '@researchdatabox/sails-ng-common';
import { Services as services } from '../CoreService';
import type { BrandingModel, UserModel } from '../model';
import { canonicalHash, GenerationActorContext, GenerationArtifactPayload, GenerationError, getJsonPointer } from '../model/generation';
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
interface PersistenceLike {
  transitionRun(brandId: string, runId: string, expected: string | string[], next: string, changes?: Record<string, unknown>): Promise<unknown>;
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
      const run = await GenerationRun.findOne({ id: runId, brandId: actor.brandId, initiatedByUserId: actor.userId });
      if (!run) throw new GenerationError('GENERATION_COMMIT_INVALID', 'Generation run was not found');
      if (run.status === 'committed') {
        if (run.targetDescriptor.targetOid !== request.targetOid || run.candidateDigest !== request.candidateDigest) {
          throw new GenerationError('GENERATION_COMMIT_INVALID', 'Generation receipt does not match its prior commit');
        }
        const count = await GenerationFieldProvenance.count({ brandId: actor.brandId, runId });
        return { runId, targetOid: request.targetOid, committed: true, provenanceCount: count };
      }
      if (run.status !== 'completed' || run.candidateDigest !== request.candidateDigest) {
        throw new GenerationError('GENERATION_COMMIT_INVALID', 'Generation receipt is not ready or its digest is invalid');
      }
      const records = requireService<RecordsLike>('recordsservice', ['getMeta', 'hasViewAccess', 'hasEditAccess']);
      const record = await records.getMeta(request.targetOid);
      const sourceRecord = run.sourceRefs[0] ? await records.getMeta(run.sourceRefs[0].oid) : null;
      if (!record || String(record.metaMetadata?.brandId ?? '') !== actor.brandId ||
        String(record.metaMetadata?.type ?? '') !== run.targetDescriptor.recordType ||
        String(record.metaMetadata?.createdBy ?? '') !== actor.username ||
        !records.hasEditAccess(brand, user, user.roles, record) || !sourceRecord ||
        String(sourceRecord.metaMetadata?.brandId ?? '') !== actor.brandId ||
        !records.hasViewAccess(brand, user, user.roles, sourceRecord)) {
        throw new GenerationError('GENERATION_COMMIT_INVALID', 'Saved generation target is not available');
      }
      const binding = await GenerationBinding.findOne({ id: run.bindingId, brandId: actor.brandId });
      if (!binding || getJsonPointer(record.metadata ?? {}, String(binding.sourceRelationship.metadataPointer ?? '')) !== run.sourceRefs[0]?.oid) {
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
      for (const item of payload.candidate.items) {
        const savedValue = getJsonPointer(record.metadata ?? {}, item.metadataPointer);
        if (savedValue !== undefined) canonicalHash(savedValue);
      }
      const validReviewIds = new Set(payload.candidate.items.filter((item) => item.reviewRequired).map((item) => item.fieldId));
      if (request.reviewedFieldIds.some((id) => !validReviewIds.has(id))) {
        throw new GenerationError('GENERATION_COMMIT_INVALID', 'Reviewed generation fields are invalid');
      }
      const persistence = requireService<PersistenceLike>('generationpersistenceservice', ['transitionRun']);
      await persistence.transitionRun(actor.brandId, runId, 'completed', 'committing', { phase: 'saveCommit' });
      try {
        const now = new Date().toISOString();
        for (const item of payload.candidate.items) {
          const reviewed = request.reviewedFieldIds.includes(item.fieldId);
          const values = {
            brandId: actor.brandId, runId, targetRecordOid: request.targetOid,
            profileFieldId: item.fieldId, metadataPointer: item.metadataPointer,
            generatedValueHash: item.valueHash, candidateDigest: payload.candidate.candidateDigest,
            evidenceRefs: item.evidence.map((evidence) => ({ id: evidence.id, label: evidence.label, kind: evidence.kind })),
            rationale: item.rationale.slice(0, 500), groundingState: item.groundingState,
            reviewRequired: item.reviewRequired && !reviewed, reviewReasonCode: item.reviewReasonCode,
            reviewedBy: reviewed ? actor.userId : undefined, reviewedAt: reviewed ? now : undefined,
            generatedAt: run.completedAt ?? now, committedAt: now,
          };
          const existing = await GenerationFieldProvenance.findOne({ brandId: actor.brandId, runId, profileFieldId: item.fieldId });
          if (existing) await GenerationFieldProvenance.updateOne({ id: existing.id, brandId: actor.brandId }).set(values);
          else await GenerationFieldProvenance.create(values).fetch();
        }
        await persistence.transitionRun(actor.brandId, runId, 'committing', 'committed', {
          committedAt: now, targetDescriptor: { ...run.targetDescriptor, targetOid: request.targetOid },
        });
        if (run.diagnosticRetentionDays === 0) {
          await GenerationRunArtifact.destroy({ id: artifact.id, brandId: actor.brandId });
        } else {
          const expiresAt = new Date(Date.now() + Math.min(run.diagnosticRetentionDays, 30) * 86_400_000).toISOString();
          const diagnostic = await crypto.encrypt(actor.brandId, runId, { candidate: payload.candidate });
          await GenerationRunArtifact.updateOne({ id: artifact.id, brandId: actor.brandId }).set({
            ...diagnostic, expiresAt, contentKinds: ['candidate'],
          });
        }
        return { runId, targetOid: request.targetOid, committed: true, provenanceCount: payload.candidate.items.length };
      } catch (error) {
        const committing = await GenerationRun.findOne({ id: runId, brandId: actor.brandId, status: 'committing' });
        if (committing) await persistence.transitionRun(actor.brandId, runId, 'committing', 'completed', { phase: 'population' });
        throw error;
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
