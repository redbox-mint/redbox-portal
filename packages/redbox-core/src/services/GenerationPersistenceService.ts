import type { GenerationRunStatus } from '@researchdatabox/sails-ng-common';
import { Services as services } from '../CoreService';
import { canonicalHash, canonicalJson, GenerationError } from '../model/generation';
import type { GenerationRunAttributes } from '../waterline-models/GenerationRun';

type ScopedModel<T> = {
  findOne(criteria: Record<string, unknown>): Promise<T | null>;
};

export const GENERATION_RUN_TRANSITIONS: Readonly<Record<GenerationRunStatus, readonly GenerationRunStatus[]>> = {
  draft: ['queued', 'cancelled', 'expired'],
  queued: ['running', 'cancelRequested', 'failed', 'expired'],
  running: ['validating', 'cancelRequested', 'failed'],
  validating: ['completed', 'failed', 'cancelRequested'],
  completed: ['committing', 'expired'],
  failed: ['queued', 'expired'],
  cancelRequested: ['cancelled', 'failed'],
  cancelled: [],
  committing: ['committed', 'completed'],
  committed: [],
  expired: [],
};

export namespace Services {
  export class GenerationPersistenceService extends services.Core.Service {
    protected override _exportedMethods = [
      'bootstrap', 'canonicalJson', 'canonicalHash', 'findOneScoped', 'transitionRun', 'ensureIndexes',
    ];

    public canonicalJson(value: unknown): string { return canonicalJson(value); }
    public canonicalHash(value: unknown): string { return canonicalHash(value); }

    public async bootstrap(): Promise<void> {
      if (sails.config.generation.enabled) {
        await this.ensureIndexes();
      }
    }

    public async findOneScoped<T>(model: ScopedModel<T>, brandId: string, criteria: Record<string, unknown>): Promise<T | null> {
      if (!brandId.trim()) {
        throw new GenerationError('GENERATION_INVALID_STATE', 'A generation brand scope is required');
      }
      return model.findOne({ ...criteria, brandId });
    }

    public async transitionRun(
      brandId: string,
      runId: string,
      expectedStatus: GenerationRunStatus | GenerationRunStatus[],
      nextStatus: GenerationRunStatus,
      changes: Partial<GenerationRunAttributes> = {},
      expectedAttemptCount?: number,
    ): Promise<GenerationRunAttributes> {
      const expected = Array.isArray(expectedStatus) ? expectedStatus : [expectedStatus];
      if (!expected.some((status) => GENERATION_RUN_TRANSITIONS[status].includes(nextStatus))) {
        throw new GenerationError('GENERATION_INVALID_STATE', `Generation transition to ${nextStatus} is not allowed`);
      }
      const criteria: Record<string, unknown> = {
        id: runId,
        brandId,
        status: expected.length === 1 ? expected[0] : { in: expected },
      };
      if (expectedAttemptCount !== undefined) criteria.attemptCount = expectedAttemptCount;
      const updated = await GenerationRun.updateOne(criteria).set({ ...changes, status: nextStatus });
      if (!updated) {
        throw new GenerationError('GENERATION_INVALID_STATE', 'Generation run state changed concurrently');
      }
      return updated;
    }

    public async ensureIndexes(): Promise<void> {
      const manager = GenerationRunArtifact.getDatastore().manager;
      const artifacts = manager.collection(GenerationRunArtifact.tableName);
      const runs = manager.collection(GenerationRun.tableName);
      const provenance = manager.collection(GenerationFieldProvenance.tableName);
      await artifacts.createIndex({ brandId: 1, runId: 1 }, { unique: true, name: 'generation_artifact_brand_run' });
      await artifacts.createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0, name: 'generation_artifact_expiry_ttl' });
      await runs.createIndex({ brandId: 1, status: 1, createdAt: 1 }, { name: 'generation_run_status_created' });
      await provenance.createIndex(
        { brandId: 1, runId: 1, profileFieldId: 1 },
        { unique: true, name: 'generation_provenance_run_field' },
      );
    }
  }
}
