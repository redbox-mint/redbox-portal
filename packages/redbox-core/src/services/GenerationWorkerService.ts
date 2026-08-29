import { Services as services } from '../CoreService';
import {
  asGenerationError,
  GenerationArtifactPayload,
  GenerationDeploymentConfig,
  GenerationError,
  GenerationEvidence,
  GenerationProviderAdapter,
} from '../model/generation';
import type { GenerationRunAttributes } from '../waterline-models/GenerationRun';
import type { GenerationProfileVersionAttributes } from '../waterline-models/GenerationProfileVersion';
import type { GenerationEncryptedEnvelope } from './GenerationCryptoService';
import { envelopeFromArtifact } from './GenerationRunService';
import { buildEvidenceAliases } from './GenerationSchemaService';
import { requireService } from './generation/require-service';

interface PersistenceLike {
  transitionRun(brandId: string, runId: string, expected: string | string[], next: string, changes?: Record<string, unknown>): Promise<GenerationRunAttributes>;
}
interface CryptoLike {
  decrypt<T>(brandId: string, runId: string, envelope: GenerationEncryptedEnvelope): Promise<T>;
  encrypt(brandId: string, runId: string, payload: unknown): Promise<GenerationEncryptedEnvelope>;
}
interface KnowledgeLike { retrieve(brandId: string, versions: string[], tags: string[], limits: { maxChunks: number; maxBytes: number }): Promise<GenerationEvidence[]>; }
interface SchemaLike {
  buildProviderSchema(
    definition: GenerationProfileVersionAttributes['definition'],
    evidence?: GenerationEvidence[],
    evidenceAliases?: import('../model/generation').GenerationEvidenceAlias[],
  ): Record<string, unknown>;
  validateCandidate(input: Record<string, unknown>): import('@researchdatabox/sails-ng-common').GenerationCandidatePatch;
}
interface PromptLike { build(input: Record<string, unknown>): import('../model/generation').GenerationProviderRequest; }
interface RegistryLike { get(id: string): GenerationProviderAdapter; }
interface ResolverLike { resolve(ref: string): Promise<string>; }

type QueueJob = { attrs?: { data?: { brandId?: string; runId?: string } }; data?: { brandId?: string; runId?: string } };

export namespace Services {
  export class GenerationWorkerService extends services.Core.Service {
    protected override _exportedMethods = ['executeQueuedRun'];

    public async executeQueuedRun(job: QueueJob): Promise<void> {
      const data = job?.attrs?.data ?? job?.data ?? {};
      const brandId = String(data.brandId ?? '');
      const runId = String(data.runId ?? '');
      if (!brandId || !runId) return;
      const persistence = requireService<PersistenceLike>('generationpersistenceservice', ['transitionRun']);
      let state: 'running' | 'validating' = 'running';
      try {
        const current = await GenerationRun.findOne({ id: runId, brandId });
        if (!current || current.status !== 'queued') return;
        const run = await persistence.transitionRun(brandId, runId, 'queued', 'running', {
          phase: 'provider', startedAt: new Date().toISOString(), lastHeartbeatAt: new Date().toISOString(),
        });
        await this.reauthorize(run);
        const profile = await GenerationProfileVersion.findOne({ id: run.profileVersionId, brandId });
        const deployment = await GenerationModelDeployment.findOne({ id: run.modelDeploymentId, brandId });
        if (!profile || !deployment) throw new GenerationError('GENERATION_PROFILE_INVALID', 'Pinned generation configuration is unavailable');
        const connection = await GenerationModelConnection.findOne({ id: deployment.connectionId, brandId, enabled: true });
        if (!connection) throw new GenerationError('GENERATION_DEPLOYMENT_INCOMPATIBLE', 'Generation connection is unavailable');
        const artifact = await GenerationRunArtifact.findOne({ brandId, runId });
        if (!artifact || Date.parse(artifact.expiresAt) <= Date.now()) throw new GenerationError('GENERATION_ARTIFACT_EXPIRED', 'Generation artifact expired');
        const crypto = requireService<CryptoLike>('generationcryptoservice', ['encrypt', 'decrypt']);
        const payload = await crypto.decrypt<GenerationArtifactPayload & { questions?: unknown[] }>(brandId, runId, envelopeFromArtifact(artifact));
        if (!payload.frozenInput) throw new GenerationError('GENERATION_ARTIFACT_EXPIRED', 'Frozen generation context is unavailable');
        const tags = [...new Set(profile.definition.targetFields.flatMap((field) => field.knowledgeTags ?? []))];
        const knowledgeService = requireService<KnowledgeLike>('generationknowledgeservice', ['retrieve']);
        const knowledge = await knowledgeService.retrieve(brandId, run.knowledgeCollectionVersionIds, tags, {
          maxChunks: profile.definition.contextLimits.maxKnowledgeChunks,
          maxBytes: profile.definition.contextLimits.totalBytes,
        });
        const evidence = [...payload.frozenInput.sourceEvidence, ...knowledge];
        const evidenceAliases = buildEvidenceAliases(evidence);
        const schemaService = requireService<SchemaLike>('generationschemaservice', ['buildProviderSchema', 'validateCandidate']);
        const responseSchema = schemaService.buildProviderSchema(profile.definition, evidence, evidenceAliases);
        const resolver = requireService<ResolverLike>('generationsecretresolverservice', ['resolve']);
        const secret = connection.secretRef ? await resolver.resolve(connection.secretRef) : undefined;
        const deploymentConfig: GenerationDeploymentConfig = {
          modelId: deployment.modelId, parameters: deployment.parameters, routingPolicy: deployment.routingPolicy,
          requiredCapabilities: deployment.requiredCapabilities,
        };
        const promptService = requireService<PromptLike>('generationpromptservice', ['build']);
        const providerRequest = promptService.build({
          correlationId: runId, definition: profile.definition, frozenInput: payload.frozenInput, knowledge,
          evidenceAliases, responseSchema,
          connection: { endpoint: connection.endpoint, secret, timeoutMs: connection.timeoutMs, nonSecretHeaders: connection.nonSecretHeaders },
          deployment: deploymentConfig,
        });
        const registry = requireService<RegistryLike>('generationproviderregistryservice', ['get']);
        const adapter = registry.get(connection.adapterId);
        const capabilities = await adapter.getCapabilities(deploymentConfig);
        if (!capabilities.structuredOutput || !capabilities.nonStreaming || !capabilities.textInput) {
          throw new GenerationError('GENERATION_DEPLOYMENT_INCOMPATIBLE', 'Generation deployment lacks required capabilities');
        }
        const abortController = new AbortController();
        const response = await adapter.invoke(providerRequest, abortController.signal);
        const afterProvider = await GenerationRun.findOne({ id: runId, brandId });
        if (afterProvider?.status === 'cancelRequested') {
          await persistence.transitionRun(brandId, runId, 'cancelRequested', 'cancelled', { phase: 'provider' });
          return;
        }
        await persistence.transitionRun(brandId, runId, 'running', 'validating', { phase: 'validation', lastHeartbeatAt: new Date().toISOString() });
        state = 'validating';
        const candidate = schemaService.validateCandidate({
          runId, rawContent: response.content, definition: profile.definition, evidence, evidenceAliases,
          baseTargetDigest: payload.frozenInput.baseTargetDigest,
          maxResponseBytes: sails.config.generation.provider.maxResponseBytes,
        });
        const envelope = await crypto.encrypt(brandId, runId, {
          ...payload, knowledge, providerRequest, rawResponse: response.content, candidate,
        } satisfies GenerationArtifactPayload & { questions?: unknown[] });
        await GenerationRunArtifact.updateOne({ id: artifact.id, brandId, runId }).set({
          ...envelope, contentKinds: ['frozenInput', 'knowledge', 'providerRequest', 'rawResponse', 'candidate'],
        });
        await persistence.transitionRun(brandId, runId, 'validating', 'completed', {
          phase: 'population', candidateDigest: candidate.candidateDigest,
          candidateSummary: {
            accepted: candidate.items.length,
            flagged: candidate.items.filter((item) => item.reviewRequired).length,
          },
          requestedProvider: connection.adapterId, requestedModel: deployment.modelId,
          actualProvider: response.actualProvider, actualModel: response.actualModel,
          routerMetadata: response.routerMetadata, usage: response.usage,
          completedAt: new Date().toISOString(), retryable: false,
        });
      } catch (error) {
        const safe = asGenerationError(error);
        const current = await GenerationRun.findOne({ id: runId, brandId });
        if (current?.status === 'cancelRequested') {
          await persistence.transitionRun(brandId, runId, 'cancelRequested', 'cancelled', { phase: current.phase });
          return;
        }
        if (current && (current.status === 'running' || current.status === 'validating')) {
          await persistence.transitionRun(brandId, runId, current.status, 'failed', {
            phase: state === 'running' ? 'provider' : 'validation', errorCode: safe.code,
            errorSummary: safe.message.slice(0, 300), retryable: safe.retryable,
          });
        }
      }
    }

    private async reauthorize(run: GenerationRunAttributes): Promise<void> {
      const source = run.sourceRefs[0];
      if (!source) throw new GenerationError('GENERATION_SOURCE_FORBIDDEN', 'Generation source is unavailable');
      const records = requireService<{
        getMeta(oid: string): Promise<{ metaMetadata?: Record<string, unknown> }>;
        hasViewAccess(brand: unknown, user: unknown, roles: unknown[], record: unknown): boolean;
      }>('recordsservice', ['getMeta', 'hasViewAccess']);
      const record = await records.getMeta(source.oid);
      const user = await User.findOne({ id: run.initiatedByUserId }).populate('roles');
      const brand = BrandingService.getBrandById(run.brandId);
      const binding = await GenerationBinding.findOne({ id: run.bindingId, brandId: run.brandId });
      const workflow = binding ? sails.config.workflow[binding.targetRecordType] : undefined;
      const starting = workflow && Object.values(workflow).find((stage) => stage.starting);
      const roles = user && typeof user === 'object' && Array.isArray(Reflect.get(user, 'roles'))
        ? Reflect.get(user, 'roles') as unknown[]
        : [];
      const roleNames = roles
        .map((role: unknown) => role && typeof role === 'object' ? String(Reflect.get(role, 'name') ?? '') : '')
        .filter(Boolean);
      if (!record || String(record.metaMetadata?.brandId ?? '') !== run.brandId || !user || !brand ||
        !binding || binding.sourceRecordType !== source.recordType || binding.targetRecordType !== run.targetDescriptor.recordType ||
        !binding.allowedRoles.some((role) => roleNames.includes(role)) || !starting ||
        starting.config.workflow.stage !== binding.targetStartingWorkflowStage ||
        !starting.config.authorization.editRoles.some((role) => roleNames.includes(role)) ||
        !records.hasViewAccess(brand, user, roles, record)) {
        throw new GenerationError('GENERATION_SOURCE_FORBIDDEN', 'Generation source authorization changed');
      }
    }
  }
}
