import type {
  GenerationCommitRequest,
  GenerationLaunchResult,
  GenerationQuestion,
  GenerationRunView,
} from '@researchdatabox/sails-ng-common';
import { Services as services } from '../CoreService';
import type { BrandingModel, UserModel } from '../model';
import {
  canonicalHash,
  GenerationActorContext,
  GenerationArtifactPayload,
  GenerationError,
  GenerationFrozenInput,
} from '../model/generation';
import type { GenerationBindingAttributes } from '../waterline-models/GenerationBinding';
import type { GenerationProfileVersionAttributes } from '../waterline-models/GenerationProfileVersion';
import type { GenerationRunAttributes } from '../waterline-models/GenerationRun';
import type { GenerationRunArtifactAttributes } from '../waterline-models/GenerationRunArtifact';
import type { AuthorizedGenerationLaunch } from './GenerationBindingService';
import type { GenerationEncryptedEnvelope } from './GenerationCryptoService';
import { requireService, requireWaterlineRows } from './generation/require-service';

interface BindingLike {
  authorizeLaunch(input: Record<string, unknown>): Promise<AuthorizedGenerationLaunch>;
  buildTargetUrl(binding: GenerationBindingAttributes, actor: GenerationActorContext, runId: string): string;
}
interface CryptoLike {
  encrypt(brandId: string, runId: string, payload: unknown): Promise<GenerationEncryptedEnvelope>;
  decrypt<T>(brandId: string, runId: string, envelope: GenerationEncryptedEnvelope): Promise<T>;
}
interface ContextLike {
  buildQuestionDefaults(definition: GenerationProfileVersionAttributes['definition'], sources: Record<string, unknown>): Array<{ id: string; value: unknown }>;
  prepare(input: Record<string, unknown>): Promise<GenerationFrozenInput>;
}
interface PersistenceLike {
  transitionRun(brandId: string, runId: string, expected: string | string[], next: string, changes?: Record<string, unknown>, attempt?: number): Promise<GenerationRunAttributes>;
}
interface QueueLike { now(name: string, data: unknown): Promise<{ attrs?: { _id?: unknown; id?: unknown } }>; }
interface ProvenanceLike { commit(actor: GenerationActorContext, user: UserModel, brand: BrandingModel, runId: string, request: GenerationCommitRequest): Promise<unknown>; }

function envelopeFromArtifact(artifact: GenerationRunArtifactAttributes): GenerationEncryptedEnvelope {
  return {
    payloadVersion: 1,
    encryptionKeyId: artifact.encryptionKeyId,
    iv: artifact.iv,
    authTag: artifact.authTag,
    ciphertext: artifact.ciphertext,
  };
}

export namespace Services {
  export class GenerationRunService extends services.Core.Service {
    protected override _exportedMethods = ['launch', 'getForActor', 'execute', 'requestCancel', 'commit', 'expireAbandonedRuns'];

    public async launch(input: {
      actor: GenerationActorContext;
      brand: BrandingModel;
      user: UserModel;
      bindingKey: string;
      sourceOid: string;
    }): Promise<GenerationLaunchResult> {
      const bindingService = requireService<BindingLike>('generationbindingservice', ['authorizeLaunch', 'buildTargetUrl']);
      const authorized = await bindingService.authorizeLaunch(input);
      await this.assertLimits(input.actor);
      const expiresAt = new Date(Date.now() + sails.config.generation.artifacts.operationalExpiryMinutes * 60_000).toISOString();
      const run = await GenerationRun.create({
        brandId: input.actor.brandId,
        bindingId: authorized.binding.id,
        profileVersionId: authorized.profileVersion.id,
        modelDeploymentId: authorized.profileVersion.definition.modelDeploymentId,
        knowledgeCollectionVersionIds: authorized.profileVersion.definition.knowledgeCollectionVersionIds,
        initiatedByUserId: input.actor.userId,
        initiatedByUsername: input.actor.username,
        sourceRefs: [{
          slotId: authorized.profileVersion.definition.sourceSlots[0].id,
          recordType: authorized.binding.sourceRecordType,
          oid: input.sourceOid,
        }],
        targetDescriptor: {
          recordType: authorized.binding.targetRecordType,
          formName: authorized.binding.targetFormName,
          mode: 'create',
        },
        status: 'draft', phase: 'context', attemptCount: 0, retryable: false,
        artifactExpiresAt: expiresAt,
        diagnosticRetentionDays: sails.config.generation.artifacts.diagnosticRetentionDays,
      }).fetch();
      const contextService = requireService<ContextLike>('generationcontextservice', ['buildQuestionDefaults', 'prepare']);
      const defaults = contextService.buildQuestionDefaults(authorized.profileVersion.definition, authorized.source.metadata ?? {});
      const questions: GenerationQuestion[] = authorized.profileVersion.definition.questions.map((question) => ({
        id: question.id, labelKey: question.labelKey, helpTextKey: question.helpTextKey, type: question.type,
        required: question.required, options: question.options, maxLength: question.maxLength,
        defaultValue: defaults.find((item) => item.id === question.id)?.value as GenerationQuestion['defaultValue'],
      }));
      const crypto = requireService<CryptoLike>('generationcryptoservice', ['encrypt', 'decrypt']);
      const envelope = await crypto.encrypt(input.actor.brandId, run.id, { questions } satisfies GenerationArtifactPayload & { questions: GenerationQuestion[] });
      await GenerationRunArtifact.create({
        brandId: input.actor.brandId, runId: run.id, expiresAt, ...envelope, contentKinds: ['questionDefaults'],
      }).fetch();
      return { runId: run.id, targetUrl: bindingService.buildTargetUrl(authorized.binding, input.actor, run.id) };
    }

    public async getForActor(actor: GenerationActorContext, runId: string): Promise<GenerationRunView> {
      const run = await this.findActorRun(actor, runId);
      await this.assertSourceAccess(actor, run);
      const artifact = await GenerationRunArtifact.findOne({ brandId: actor.brandId, runId });
      let payload: (GenerationArtifactPayload & { questions?: GenerationQuestion[] }) | undefined;
      if (artifact && Date.parse(artifact.expiresAt) > Date.now()) {
        const crypto = requireService<CryptoLike>('generationcryptoservice', ['encrypt', 'decrypt']);
        payload = await crypto.decrypt(actor.brandId, runId, envelopeFromArtifact(artifact));
      }
      const result = run.status === 'completed' || run.status === 'committing' || run.status === 'committed'
        ? payload?.candidate ?? null : null;
      return {
        runId: run.id, status: run.status, phase: run.phase, attemptCount: run.attemptCount,
        retryable: run.retryable, questions: payload?.questions ?? [], result,
        ...(run.errorCode ? { error: { code: run.errorCode, messageKey: `generation-error-${run.errorCode.toLowerCase().replaceAll('_', '-')}`, retryable: run.retryable } } : {}),
        artifactExpiresAt: run.artifactExpiresAt,
      };
    }

    public async execute(input: {
      actor: GenerationActorContext;
      brand: BrandingModel;
      user: UserModel;
      runId: string;
      answers: Array<{ id: string; value: unknown }>;
      targetForm: { recordType: string; formName?: string; mode: 'create' };
      targetDraft: Record<string, unknown>;
    }): Promise<GenerationRunView> {
      const run = await this.findActorRun(input.actor, input.runId);
      if (['completed', 'committing', 'committed'].includes(run.status)) {
        throw new GenerationError('GENERATION_ALREADY_COMPLETED', 'Generation already completed for this creation intent');
      }
      if (run.status !== 'draft' && !(run.status === 'failed' && run.retryable)) {
        throw new GenerationError('GENERATION_INVALID_STATE', 'Generation cannot be executed in its current state');
      }
      if (run.status === 'failed' && run.attemptCount >= sails.config.generation.provider.maxRetries + 1) {
        throw new GenerationError('GENERATION_INVALID_STATE', 'Generation retry limit has been reached');
      }
      if (run.targetDescriptor.recordType !== input.targetForm.recordType || run.targetDescriptor.formName !== input.targetForm.formName) {
        throw new GenerationError('GENERATION_TARGET_FORBIDDEN', 'Generation target does not match this creation intent');
      }
      const profile = await GenerationProfileVersion.findOne({ id: run.profileVersionId, brandId: input.actor.brandId });
      if (!profile) throw new GenerationError('GENERATION_PROFILE_INVALID', 'Pinned generation profile is unavailable');
      const context = requireService<ContextLike>('generationcontextservice', ['buildQuestionDefaults', 'prepare']);
      const frozenInput = await context.prepare({
        actor: input.actor, brand: input.brand, user: input.user, sourceRefs: run.sourceRefs,
        definition: profile.definition, answers: input.answers, targetForm: input.targetForm, targetDraft: input.targetDraft,
      });
      const artifact = await GenerationRunArtifact.findOne({ brandId: input.actor.brandId, runId: run.id });
      if (!artifact || Date.parse(artifact.expiresAt) <= Date.now()) throw new GenerationError('GENERATION_ARTIFACT_EXPIRED', 'Generation context expired');
      const crypto = requireService<CryptoLike>('generationcryptoservice', ['encrypt', 'decrypt']);
      const existing = await crypto.decrypt<GenerationArtifactPayload & { questions?: GenerationQuestion[] }>(input.actor.brandId, run.id, envelopeFromArtifact(artifact));
      const envelope = await crypto.encrypt(input.actor.brandId, run.id, { ...existing, frozenInput });
      await GenerationRunArtifact.updateOne({ id: artifact.id, brandId: input.actor.brandId, runId: run.id }).set({
        ...envelope, contentKinds: ['questionDefaults', 'frozenInput'],
      });
      const persistence = requireService<PersistenceLike>('generationpersistenceservice', ['transitionRun']);
      const attemptCount = run.attemptCount + 1;
      await persistence.transitionRun(input.actor.brandId, run.id, run.status, 'queued', {
        phase: 'context', attemptCount, retryable: false, errorCode: '', errorSummary: '',
        inputDigest: canonicalHash(frozenInput), queuedAt: new Date().toISOString(),
        sourceRefs: run.sourceRefs.map((sourceRef) => {
          const source = frozenInput.sources.find((candidate) => candidate.slotId === sourceRef.slotId && candidate.oid === sourceRef.oid);
          return source ? { ...sourceRef, payloadHash: canonicalHash(source.values) } : sourceRef;
        }),
        targetDescriptor: { ...run.targetDescriptor, initialTargetHash: frozenInput.baseTargetDigest },
      }, run.attemptCount);
      try {
        const queue = requireService<QueueLike>('agendaqueueservice', ['now']);
        const job = await queue.now(sails.config.generation.queue.executeJobName, { brandId: input.actor.brandId, runId: run.id });
        const queueJobId = String(job?.attrs?._id ?? job?.attrs?.id ?? '');
        if (queueJobId) await GenerationRun.updateOne({ id: run.id, brandId: input.actor.brandId, status: 'queued' }).set({ queueJobId });
      } catch {
        await persistence.transitionRun(input.actor.brandId, run.id, 'queued', 'failed', {
          phase: 'context', retryable: true, errorCode: 'GENERATION_PROVIDER_UNAVAILABLE', errorSummary: 'Generation could not be queued',
        });
      }
      return this.getForActor(input.actor, run.id);
    }

    public async requestCancel(actor: GenerationActorContext, runId: string): Promise<GenerationRunView> {
      const run = await this.findActorRun(actor, runId);
      if (run.status === 'cancelled') return this.getForActor(actor, runId);
      const persistence = requireService<PersistenceLike>('generationpersistenceservice', ['transitionRun']);
      if (run.status === 'draft') {
        await persistence.transitionRun(actor.brandId, runId, 'draft', 'cancelled', { cancelRequestedAt: new Date().toISOString() });
      } else if (run.status === 'queued' || run.status === 'running' || run.status === 'validating') {
        await persistence.transitionRun(actor.brandId, runId, run.status, 'cancelRequested', { cancelRequestedAt: new Date().toISOString() });
      }
      return this.getForActor(actor, runId);
    }

    public async commit(actor: GenerationActorContext, user: UserModel, brand: BrandingModel, runId: string, request: GenerationCommitRequest): Promise<unknown> {
      const provenance = requireService<ProvenanceLike>('generationprovenanceservice', ['commit']);
      return provenance.commit(actor, user, brand, runId, request);
    }

    public async expireAbandonedRuns(): Promise<void> {
      const runs = requireWaterlineRows<GenerationRunAttributes>(
        await GenerationRun.find({ artifactExpiresAt: { '<=': new Date().toISOString() }, status: { in: ['draft', 'completed', 'failed'] } }),
        'GenerationRun',
      );
      const persistence = requireService<PersistenceLike>('generationpersistenceservice', ['transitionRun']);
      for (const run of runs) {
        try { await persistence.transitionRun(run.brandId, run.id, run.status, 'expired'); } catch { /* another worker won */ }
      }
    }

    private async findActorRun(actor: GenerationActorContext, runId: string): Promise<GenerationRunAttributes> {
      const run = await GenerationRun.findOne({ id: runId, brandId: actor.brandId, initiatedByUserId: actor.userId });
      if (!run) throw new GenerationError('GENERATION_ACTION_NOT_AVAILABLE', 'Generation run was not found');
      return run;
    }

    private async assertSourceAccess(actor: GenerationActorContext, run: GenerationRunAttributes): Promise<void> {
      const sourceRef = run.sourceRefs[0];
      const user = await User.findOne({ id: actor.userId }).populate('roles');
      const brand = BrandingService.getBrandById(actor.brandId);
      const roles = user && typeof user === 'object' && Array.isArray(Reflect.get(user, 'roles'))
        ? Reflect.get(user, 'roles') as unknown[]
        : [];
      const records = requireService<{
        getMeta(oid: string): Promise<{ metaMetadata?: Record<string, unknown> }>;
        hasViewAccess(brand: unknown, user: unknown, roles: unknown[], record: unknown): boolean;
      }>('recordsservice', ['getMeta', 'hasViewAccess']);
      const source = sourceRef ? await records.getMeta(sourceRef.oid) : null;
      if (!source || !user || !brand || String(source.metaMetadata?.brandId ?? '') !== actor.brandId ||
        !records.hasViewAccess(brand, user, roles, source)) {
        throw new GenerationError('GENERATION_SOURCE_FORBIDDEN', 'Generation source authorization changed');
      }
    }

    private async assertLimits(actor: GenerationActorContext): Promise<void> {
      const activeStatuses = ['draft', 'queued', 'running', 'validating', 'completed', 'committing'];
      const userActive = await GenerationRun.count({ brandId: actor.brandId, initiatedByUserId: actor.userId, status: { in: activeStatuses } });
      const brandActive = await GenerationRun.count({ brandId: actor.brandId, status: { in: activeStatuses } });
      const startOfDay = new Date();
      startOfDay.setUTCHours(0, 0, 0, 0);
      const userDaily = await GenerationRun.count({ brandId: actor.brandId, initiatedByUserId: actor.userId, createdAt: { '>=': startOfDay.toISOString() } });
      const brandDaily = await GenerationRun.count({ brandId: actor.brandId, createdAt: { '>=': startOfDay.toISOString() } });
      if (userActive >= sails.config.generation.limits.perUserConcurrentRuns || brandActive >= sails.config.generation.limits.perBrandConcurrentRuns) {
        throw new GenerationError('GENERATION_RATE_LIMITED', 'Too many generation runs are active', true);
      }
      if (userDaily >= sails.config.generation.limits.perUserDailyRuns || brandDaily >= sails.config.generation.limits.perBrandDailyRuns) {
        throw new GenerationError('GENERATION_RATE_LIMITED', 'The daily generation limit has been reached', true);
      }
    }
  }
}

export { envelopeFromArtifact };
