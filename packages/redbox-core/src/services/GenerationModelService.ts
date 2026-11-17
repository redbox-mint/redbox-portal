import { Services as services } from '../CoreService';
import { randomUUID } from 'node:crypto';
import { canonicalHash, GenerationDeploymentConfig, GenerationError, GenerationProviderAdapter, asGenerationError } from '../model/generation';
import type { GenerationModelConnectionAttributes } from '../waterline-models/GenerationModelConnection';
import type { GenerationModelDeploymentAttributes } from '../waterline-models/GenerationModelDeployment';
import type { GenerationProfileAttributes } from '../waterline-models/GenerationProfile';
import type { GenerationProfileVersionAttributes } from '../waterline-models/GenerationProfileVersion';
import { requireService, requireWaterlineRows } from './generation/require-service';
import { generationDeploymentContent } from '../waterline-models/generation-model-helpers';
import {
  BEDROCK_REGIONS, connectionDraftSchema, createModelSchema, modelDraftSchema, parseAdminInput,
  sdkParameters, sensitiveHeaderName, testConnectionSchema, tryPromptSchema, updateModelSchema, validateModelDraft,
} from './generation/model-admin-validation';

interface RegistryLike { get(id: string): GenerationProviderAdapter; list(): string[]; }
interface SecretResolverLike { schemes(): string[]; resolve(secretRef: string): Promise<string>; status(secretRef: string): Promise<{ configured: boolean; scheme: string }>; }

export namespace Services {
  export class GenerationModelService extends services.Core.Service {
    protected override _exportedMethods = [
      'createConnection', 'safeConnection', 'createDeployment', 'testDeployment', 'publishDeployment',
      'testProfileRequests', 'adminOverview', 'saveAdminConnection', 'testConnectionDraft', 'createModel', 'newDeploymentVersion',
      'updateDeploymentDraft', 'retireDeployment', 'tryPrompt', 'deleteConnection', 'discardDeployment', 'deleteModel',
    ];

    public async createConnection(
      brandId: string,
      input: Omit<GenerationModelConnectionAttributes, 'id' | 'brandId' | 'nameLower'>,
    ): Promise<GenerationModelConnectionAttributes> {
      return GenerationModelConnection.create({
        ...input,
        brandId,
        nameLower: input.name.trim().toLowerCase(),
      }).fetch();
    }

    public async safeConnection(connection: GenerationModelConnectionAttributes): Promise<Record<string, unknown>> {
      const resolver = requireService<SecretResolverLike>('generationsecretresolverservice', ['resolve', 'status']);
      const secretStatus = connection.secretRef ? await resolver.status(connection.secretRef) : { configured: false, scheme: '' };
      return {
        id: connection.id, key: connection.key, name: connection.name, adapterId: connection.adapterId,
        enabled: connection.enabled, endpoint: connection.endpoint, authStrategy: connection.authStrategy,
        secretRef: connection.secretRef, secretConfigured: secretStatus.configured,
        region: connection.adapterId === 'bedrock' ? /^https:\/\/bedrock-runtime\.([a-z0-9-]+)\.amazonaws\.com/.exec(connection.endpoint)?.[1] : undefined,
        nonSecretHeaders: Object.fromEntries(Object.entries(connection.nonSecretHeaders ?? {})
          .filter(([name]) => !sensitiveHeaderName.test(name))),
        timeoutMs: connection.timeoutMs, lastHealthStatus: connection.lastHealthStatus,
        lastHealthCheckedAt: connection.lastHealthCheckedAt,
      };
    }

    public async createDeployment(
      brandId: string,
      input: Omit<GenerationModelDeploymentAttributes, 'id' | 'brandId' | 'contentHash'>,
    ): Promise<GenerationModelDeploymentAttributes> {
      const connection = await GenerationModelConnection.findOne({ id: input.connectionId, brandId });
      if (!connection) throw new GenerationError('GENERATION_DEPLOYMENT_INCOMPATIBLE', 'Generation model connection was not found');
      const contentHash = canonicalHash(generationDeploymentContent(input));
      return GenerationModelDeployment.create({ ...input, brandId, contentHash }).fetch();
    }

    public async testDeployment(brandId: string, deploymentId: string): Promise<Record<string, unknown>> {
      const deployment = await GenerationModelDeployment.findOne({ id: deploymentId, brandId });
      if (!deployment) throw new GenerationError('GENERATION_DEPLOYMENT_INCOMPATIBLE', 'Generation deployment was not found');
      const connection = await GenerationModelConnection.findOne({ id: deployment.connectionId, brandId, enabled: true });
      if (!connection) throw new GenerationError('GENERATION_DEPLOYMENT_INCOMPATIBLE', 'Generation connection was not found');
      const registry = requireService<RegistryLike>('generationproviderregistryservice', ['get']);
      const resolver = requireService<SecretResolverLike>('generationsecretresolverservice', ['resolve', 'status']);
      const adapter = registry.get(connection.adapterId);
      const config: GenerationDeploymentConfig = {
        modelId: deployment.modelId, parameters: deployment.parameters, routingPolicy: deployment.routingPolicy,
        requiredCapabilities: deployment.requiredCapabilities,
      };
      const health = await this.bounded(connection.timeoutMs, async () => adapter.healthCheck({
        endpoint: connection.endpoint, secret: connection.secretRef ? await resolver.resolve(connection.secretRef) : undefined,
        timeoutMs: Math.min(connection.timeoutMs, sails.config.generation.provider.timeoutMs),
        nonSecretHeaders: connection.nonSecretHeaders,
      }, config));
      const required = deployment.requiredCapabilities ?? {};
      if (!health.ok || Object.entries(required).some(([key, needed]) => needed && !health.capabilities[key as keyof typeof health.capabilities])) {
        throw new GenerationError('GENERATION_DEPLOYMENT_INCOMPATIBLE', 'Generation deployment does not provide required capabilities');
      }
      return { ok: health.ok, capabilities: this.safeCapabilities(health.capabilities), checkedAt: health.checkedAt };
    }

    public async publishDeployment(brandId: string, deploymentId: string, actorId: string): Promise<GenerationModelDeploymentAttributes> {
      const draft = await this.deployment(brandId, deploymentId);
      if (draft.status !== 'draft') throw new GenerationError('GENERATION_INVALID_STATE', 'Only drafts may be published');
      const capabilitySnapshot = await this.testDeployment(brandId, deploymentId);
      const updated = await GenerationModelDeployment.updateOne({ id: deploymentId, brandId, status: 'draft', contentHash: draft.contentHash }).set({
        status: 'published', capabilitySnapshot, publishedBy: actorId, publishedAt: new Date().toISOString(),
      });
      if (!updated) throw new GenerationError('GENERATION_INVALID_STATE', 'Only draft deployments may be published');
      return updated;
    }
    private readonly adminCooldown = new Map<string, number>();

    private registry(): RegistryLike {
      return requireService<RegistryLike>('generationproviderregistryservice', ['get', 'list']);
    }
    private resolver(): SecretResolverLike {
      return requireService<SecretResolverLike>('generationsecretresolverservice', ['resolve', 'status', 'schemes']);
    }
    private requireEnabled(): void {
      if (!sails.config.generation.enabled) throw new GenerationError('GENERATION_NOT_CONFIGURED', 'Drafting is disabled');
    }
    private takeCooldown(brandId: string, actorId: string): void {
      this.requireEnabled();
      const now = Date.now();
      for (const [key, until] of this.adminCooldown) if (until <= now) this.adminCooldown.delete(key);
      const key = JSON.stringify([brandId, actorId]);
      if (this.adminCooldown.has(key)) throw new GenerationError('GENERATION_RATE_LIMITED', 'Please wait before testing again', true);
      this.adminCooldown.set(key, now + 5000);
    }
    private async bounded<T>(timeoutMs: number, action: (signal: AbortSignal) => Promise<T>): Promise<T> {
      const controller = new AbortController();
      let timer: ReturnType<typeof setTimeout> | undefined;
      try {
        return await Promise.race([
          Promise.resolve().then(() => action(controller.signal)),
          new Promise<never>((_resolve, reject) => {
            timer = setTimeout(() => {
              controller.abort();
              reject(new GenerationError('GENERATION_PROVIDER_TIMEOUT', 'Provider time limit exceeded', true));
            }, Math.min(timeoutMs, sails.config.generation.provider.timeoutMs));
          }),
        ]);
      } finally {
        if (timer) clearTimeout(timer);
      }
    }
    private checkOutbound(adapterId: string, endpoint: string): void {
      if (adapterId !== 'fake' && !sails.config.generation.outbound.allowedHosts.includes(new URL(endpoint).hostname)) {
        throw new GenerationError('GENERATION_DEPLOYMENT_INCOMPATIBLE', 'Provider host is not allowed by the server');
      }
    }
    private async connection(brandId: string, id: string): Promise<GenerationModelConnectionAttributes> {
      const value = await GenerationModelConnection.findOne({ id, brandId });
      if (!value) throw new GenerationError('GENERATION_ACTION_NOT_AVAILABLE', 'Connection not found');
      return value;
    }
    private async deployment(brandId: string, id: string): Promise<GenerationModelDeploymentAttributes> {
      const value = await GenerationModelDeployment.findOne({ id, brandId });
      if (!value) throw new GenerationError('GENERATION_ACTION_NOT_AVAILABLE', 'Model version not found');
      return value;
    }
    private async validatedConnection(input: unknown, saved?: GenerationModelConnectionAttributes) {
      const draft = parseAdminInput(connectionDraftSchema, input);
      if (!this.registry().list().filter(id => sails.config.generation.adapters.includes(id)).includes(draft.adapterId) ||
          draft.timeoutMs > sails.config.generation.provider.timeoutMs ||
          (saved && (saved.key !== draft.key || saved.adapterId !== draft.adapterId))) {
        throw new GenerationError('GENERATION_REQUEST_INVALID', 'Invalid connection configuration');
      }
      const headers = draft.nonSecretHeaders ?? {};
      if (Object.keys(headers).length > 30 || Object.entries(headers).some(([name, value]) =>
        sensitiveHeaderName.test(name) || !/^[!#$%&'*+.^_`|~0-9A-Za-z-]+$/.test(name) || /[\r\n]/.test(value))) {
        throw new GenerationError('GENERATION_REQUEST_INVALID', 'Unsafe connection headers');
      }
      let secretRef = draft.secretRef ?? saved?.secretRef ?? '';
      let endpoint = '';
      if (draft.adapterId === 'openrouter') {
        if (draft.authStrategy !== 'bearer' || draft.region) throw new GenerationError('GENERATION_REQUEST_INVALID', 'Invalid OpenRouter credentials');
        endpoint = 'https://openrouter.ai/api/v1';
      } else if (draft.adapterId === 'bedrock') {
        if (!draft.region || !['bearer', 'aws-default-chain'].includes(draft.authStrategy)) {
          throw new GenerationError('GENERATION_REQUEST_INVALID', 'Invalid Bedrock region or credentials');
        }
        endpoint = `https://bedrock-runtime.${draft.region}.amazonaws.com`;
        if (draft.authStrategy === 'aws-default-chain') secretRef = '';
      } else if (draft.adapterId === 'fake') {
        if (draft.authStrategy !== 'none' || draft.region || draft.secretRef) throw new GenerationError('GENERATION_REQUEST_INVALID', 'Fake connections have no credentials');
        secretRef = '';
      } else {
        // Additional installed adapters require an explicit safe admin configuration contract.
        throw new GenerationError('GENERATION_REQUEST_INVALID', 'Unsupported admin connection adapter');
      }
      if (draft.apiKey && draft.authStrategy !== 'bearer') throw new GenerationError('GENERATION_REQUEST_INVALID', 'API key is not used by this provider');
      if (draft.authStrategy === 'bearer' && !draft.apiKey) {
        const separator = secretRef.indexOf(':');
        if (separator < 1 || !secretRef.slice(separator + 1).trim() ||
            !this.resolver().schemes().includes(secretRef.slice(0, separator))) {
          throw new GenerationError('GENERATION_REQUEST_INVALID', 'Use an installed secret resolver reference');
        }
      }
      if (secretRef.startsWith('appconfig:') && secretRef !== saved?.secretRef) {
        throw new GenerationError('GENERATION_REQUEST_INVALID', 'Stored credentials belong to their provider');
      }
      return { key: draft.key, name: draft.name, nameLower: draft.name.toLowerCase(), adapterId: draft.adapterId,
        enabled: draft.enabled, endpoint, authStrategy: draft.authStrategy, secretRef,
        nonSecretHeaders: headers, timeoutMs: draft.timeoutMs };
    }

    public async saveAdminConnection(brandId: string, input: unknown, actorId: string, connectionId?: string) {
      const saved = connectionId ? await this.connection(brandId, connectionId) : undefined;
      const fields = await this.validatedConnection(input, saved);
      const { apiKey } = parseAdminInput(connectionDraftSchema, input);
      if (apiKey) {
        await AppConfigService.setGenerationProviderKey(brandId, fields.key, apiKey);
        fields.secretRef = `appconfig:${brandId}:${fields.key}`;
      } else if (saved?.secretRef?.startsWith('appconfig:') && fields.authStrategy !== 'bearer') {
        await AppConfigService.setGenerationProviderKey(brandId, fields.key, '');
      }
      const value = saved
        ? await GenerationModelConnection.updateOne({ id: saved.id, brandId }).set({ ...fields, updatedBy: actorId,
          lastHealthStatus: '', lastHealthCheckedAt: '' })
        : await this.createConnection(brandId, { ...fields, createdBy: actorId, updatedBy: actorId });
      if (!value) throw new GenerationError('GENERATION_ACTION_NOT_AVAILABLE', 'Connection not found');
      return this.safeConnection(value);
    }

    public async testConnectionDraft(brandId: string, actorId: string, input: unknown) {
      const body = parseAdminInput(testConnectionSchema, input);
      const saved = body.connectionId ? await this.connection(brandId, body.connectionId) : undefined;
      const draft = await this.validatedConnection(body.connection, saved);
      this.takeCooldown(brandId, actorId);
      const { apiKey } = body.connection;
      const start = Date.now();
      let secretConfigured = !!apiKey;
      let errorCode: string | undefined;
      try {
        await this.bounded(draft.timeoutMs, async signal => {
          const secret = apiKey || (draft.secretRef ? await this.resolver().resolve(draft.secretRef) : undefined);
          secretConfigured = !!secret;
          if (draft.authStrategy === 'bearer' && !secret) throw new GenerationError('GENERATION_NOT_CONFIGURED', 'API key missing');
          const versions = saved ? requireWaterlineRows<GenerationModelDeploymentAttributes>(
            await GenerationModelDeployment.find({ brandId, connectionId: saved.id }), 'GenerationModelDeployment') : [];
          const modelId = versions.sort((a, b) => b.version - a.version)[0]?.modelId
            ?? ({ bedrock: 'amazon.nova-micro-v1:0', openrouter: 'openai/gpt-4.1-mini', fake: 'demo' }[draft.adapterId]!);
          this.checkOutbound(draft.adapterId, draft.endpoint);
          await this.registry().get(draft.adapterId).invoke({
            connection: { ...draft, secret },
            deployment: { modelId, parameters: { maxOutputTokens: 1,
              ...(draft.adapterId === 'fake' ? { fixtureResponse: 'OK' } : {}) } },
            messages: [{ role: 'user', content: 'Say OK.' }], correlationId: randomUUID(),
          }, signal);
        });
      } catch (error) { errorCode = asGenerationError(error).code; }
      const result = { ok: !errorCode, secretConfigured, checkedAt: new Date().toISOString(),
        latencyMs: Date.now() - start, errorCode, capabilities: {} };
      // Compare all editable fields and guard the write against an edit during the test.
      if (saved && !apiKey && canonicalHash(this.connectionContent(saved)) === canonicalHash(this.connectionContent(draft))) {
        await GenerationModelConnection.updateOne({ id: saved.id, brandId, updatedAt: saved.updatedAt, name: saved.name, adapterId: saved.adapterId,
          enabled: saved.enabled, endpoint: saved.endpoint, authStrategy: saved.authStrategy, timeoutMs: saved.timeoutMs }).set({
          lastHealthStatus: result.ok ? 'healthy' : 'unhealthy', lastHealthCheckedAt: result.checkedAt,
        });
      }
      return result;
    }
    private safeCapabilities(value: object): Record<string, boolean> {
      return Object.fromEntries(['structuredOutput', 'nonStreaming', 'textInput', 'seed', 'zeroDataRetention']
        .flatMap(key => typeof Reflect.get(value, key) === 'boolean' ? [[key, Reflect.get(value, key)]] : []));
    }
    private connectionContent(value: Partial<GenerationModelConnectionAttributes>) {
      return { key: value.key, name: value.name, adapterId: value.adapterId, enabled: value.enabled,
        endpoint: value.endpoint ?? '', authStrategy: value.authStrategy, secretRef: value.secretRef ?? '',
        nonSecretHeaders: value.nonSecretHeaders ?? {}, timeoutMs: value.timeoutMs };
    }

    private async draft(brandId: string, input: unknown) {
      const fields = parseAdminInput(modelDraftSchema, input);
      const connection = await this.connection(brandId, fields.connectionId);
      this.registry().get(connection.adapterId);
      return validateModelDraft(fields, connection.adapterId);
    }
    public async createModel(brandId: string, input: unknown, actorId: string) {
      const { key, ...inputDraft } = parseAdminInput(createModelSchema, input);
      const draft = await this.draft(brandId, inputDraft);
      if (await GenerationModelDeployment.findOne({ brandId, key })) {
        throw new GenerationError('GENERATION_INVALID_STATE', 'Model key already exists');
      }
      return this.createDeployment(brandId, { ...draft, key, version: 1, status: 'draft', createdBy: actorId,
        requiredCapabilities: { structuredOutput: true, nonStreaming: true, textInput: true } });
    }
    public async newDeploymentVersion(brandId: string, id: string, actorId: string) {
      const source = await this.deployment(brandId, id);
      const versions = requireWaterlineRows<GenerationModelDeploymentAttributes>(
        await GenerationModelDeployment.find({ brandId, key: source.key }), 'GenerationModelDeployment');
      const draft = await this.draft(brandId, { name: source.name, connectionId: source.connectionId, modelId: source.modelId,
        parameters: sdkParameters(source.parameters), routingPolicy: source.routingPolicy ?? {} });
      return this.createDeployment(brandId, { ...draft, key: source.key,
        version: Math.max(...versions.map(value => value.version)) + 1,
        status: 'draft', createdBy: actorId, requiredCapabilities: source.requiredCapabilities });
    }
    public async updateDeploymentDraft(brandId: string, id: string, input: unknown) {
      const { expectedContentHash, ...fields } = parseAdminInput(updateModelSchema, input);
      const saved = await this.deployment(brandId, id);
      if (saved.status !== 'draft') throw new GenerationError('GENERATION_INVALID_STATE', 'Only drafts can be edited');
      if (saved.contentHash !== expectedContentHash) throw new GenerationError('GENERATION_TARGET_CONFLICT', 'Model draft changed');
      const draft = await this.draft(brandId, fields);
      // fixtureResponse is existing fake-adapter data, not an editor setting.
      if (saved.parameters && Object.hasOwn(saved.parameters, 'fixtureResponse') &&
          !Object.hasOwn(draft.parameters ?? {}, 'fixtureResponse')) {
        const connection = await this.connection(brandId, draft.connectionId);
        if (connection.adapterId === 'fake') {
          draft.parameters = { ...draft.parameters, fixtureResponse: saved.parameters.fixtureResponse };
        }
      }
      const contentHash = canonicalHash(generationDeploymentContent({ ...draft, requiredCapabilities: saved.requiredCapabilities }));
      const updated = await GenerationModelDeployment.updateOne({ id, brandId, status: 'draft', contentHash: expectedContentHash })
        .set({ ...draft, parameters: draft.parameters ?? {}, routingPolicy: draft.routingPolicy ?? {}, contentHash });
      if (!updated) throw new GenerationError('GENERATION_TARGET_CONFLICT', 'Model draft changed');
      return updated;
    }
    public async retireDeployment(brandId: string, id: string) {
      const saved = await this.deployment(brandId, id);
      if (saved.status !== 'published') throw new GenerationError('GENERATION_INVALID_STATE', 'Only published versions may be retired');
      const profiles = requireWaterlineRows<GenerationProfileAttributes>(await GenerationProfile.find({ brandId }), 'GenerationProfile');
      const ids = profiles.map(value => value.publishedVersionId).filter((value): value is string => !!value);
      const published = ids.length ? requireWaterlineRows<GenerationProfileVersionAttributes>(
        await GenerationProfileVersion.find({ brandId, id: { in: ids } }), 'GenerationProfileVersion') : [];
      if (published.some(value => value.definition.modelDeploymentId === id)) {
        throw new GenerationError('GENERATION_INVALID_STATE', 'A published profile uses this model version');
      }
      return GenerationModelDeployment.updateOne({ id: saved.id, brandId }).set({ status: 'retired' });
    }
    public async deleteConnection(brandId: string, id: string) {
      const saved = await this.connection(brandId, id);
      const versions = requireWaterlineRows<GenerationModelDeploymentAttributes>(
        await GenerationModelDeployment.find({ brandId, connectionId: id }), 'GenerationModelDeployment');
      const uses = [...new Map(versions.map(v => [v.key, { key: v.key, name: v.name }])).values()];
      if (uses.length) return { deleted: false, uses };
      // Clear through AppConfig before deleting so a failure leaves a retryable provider.
      await AppConfigService.setGenerationProviderKey(brandId, saved.key, '');
      await GenerationModelConnection.destroyOne({ brandId, id });
      return { deleted: true, uses: [] };
    }
    private async profileUses(brandId: string, ids: string[]) {
      const versions = requireWaterlineRows<GenerationProfileVersionAttributes>(await GenerationProfileVersion.find({ brandId }), 'GenerationProfileVersion');
      const profiles = requireWaterlineRows<GenerationProfileAttributes>(await GenerationProfile.find({ brandId }), 'GenerationProfile');
      const used = new Set(versions.filter(v => ids.includes(v.definition.modelDeploymentId)).map(v => v.profileId));
      return profiles.filter(p => used.has(p.id)).map(p => ({ key: p.key, name: p.name }));
    }
    public async discardDeployment(brandId: string, id: string) {
      const saved = await this.deployment(brandId, id);
      if (saved.status !== 'draft') throw new GenerationError('GENERATION_INVALID_STATE', 'Only drafts can be discarded');
      const uses = await this.profileUses(brandId, [id]);
      if (uses.length) return { deleted: false, uses };
      await GenerationModelDeployment.destroyOne({ brandId, id, status: 'draft', contentHash: saved.contentHash });
      return { deleted: true, uses: [] };
    }
    public async deleteModel(brandId: string, key: string) {
      const versions = requireWaterlineRows<GenerationModelDeploymentAttributes>(await GenerationModelDeployment.find({ brandId, key }), 'GenerationModelDeployment');
      if (!versions.length) throw new GenerationError('GENERATION_ACTION_NOT_AVAILABLE', 'Model not found');
      const uses = await this.profileUses(brandId, versions.map(v => v.id));
      if (uses.length) return { deleted: false, uses };
      await GenerationModelDeployment.destroy({ brandId, key });
      return { deleted: true, uses: [] };
    }
    public async adminOverview(brandId: string) {
      const rows = await Promise.all([
        GenerationModelConnection.find({ brandId }), GenerationModelDeployment.find({ brandId }),
        GenerationProfile.find({ brandId }), GenerationProfileVersion.find({ brandId }),
      ]);
      const connections = requireWaterlineRows<GenerationModelConnectionAttributes>(rows[0], 'GenerationModelConnection');
      const deployments = requireWaterlineRows<GenerationModelDeploymentAttributes>(rows[1], 'GenerationModelDeployment');
      const profiles = requireWaterlineRows<GenerationProfileAttributes>(rows[2], 'GenerationProfile');
      const profileVersions = requireWaterlineRows<GenerationProfileVersionAttributes>(rows[3], 'GenerationProfileVersion');
      const profileDeploymentIds = new Map(profileVersions.map(version => [version.id, version.definition.modelDeploymentId]));
      const groups = [...new Set(deployments.map(value => value.key))].sort().map(key => {
        const versions = deployments.filter(value => value.key === key).sort((a, b) => b.version - a.version);
        const ids = new Set(versions.map(value => value.id));
        const usageCount = profiles.filter(profile => [profile.latestVersionId, profile.publishedVersionId]
          .some(id => id && ids.has(profileDeploymentIds.get(id) ?? ''))).length;
        const uses = profiles.filter(profile => profileVersions.some(v => v.profileId === profile.id && ids.has(v.definition.modelDeploymentId)))
          .map(p => ({ key: p.key, name: p.name }));
        return { key, name: versions[0].name, uses,
          versions: versions.map(version => ({ ...version, parameters: sdkParameters(version.parameters) })), usageCount };
      });
      return { enabled: sails.config.generation.enabled,
        adapters: this.registry().list().filter(id => sails.config.generation.adapters.includes(id)),
        secretSchemes: this.resolver().schemes(), bedrockRegions: [...BEDROCK_REGIONS],
        limits: { provider: { ...sails.config.generation.provider },
          outbound: { allowedHosts: [...sails.config.generation.outbound.allowedHosts] }, cooldownMs: 5000, maxPromptChars: 2000 },
        connections: await Promise.all(connections.map(value => this.safeConnection(value))), models: groups };
    }
    /** Synthetic profile tests share the same credentials, outbound rules and cooldown as model tests. */
    public async testProfileRequests(brandId: string, actorId: string, deploymentId: string, requests: import('../model/generation').GenerationProviderRequest[]) {
      const deployment = await this.deployment(brandId, deploymentId);
      const connection = await this.connection(brandId, deployment.connectionId);
      if (deployment.status !== 'published' || !connection.enabled || !requests.length || requests.length > 5) throw new GenerationError('GENERATION_DEPLOYMENT_INCOMPATIBLE', 'Published model required');
      this.takeCooldown(brandId, actorId);
      this.checkOutbound(connection.adapterId, connection.endpoint);
      return this.bounded(connection.timeoutMs, async signal => {
        const secret = connection.secretRef ? await this.resolver().resolve(connection.secretRef) : undefined;
        const results: import('../model/generation').GenerationProviderResponse[] = [];
        for (const request of requests) {
          if (Buffer.byteLength(JSON.stringify(request)) > sails.config.generation.provider.maxRequestBytes) throw new GenerationError('GENERATION_REQUEST_INVALID', 'Test request too large');
          const response = await this.registry().get(connection.adapterId).invoke({ ...request, deployment,
            connection: { endpoint: connection.endpoint, timeoutMs: Math.min(connection.timeoutMs, sails.config.generation.provider.timeoutMs), secret, nonSecretHeaders: connection.nonSecretHeaders } }, signal);
          if (Buffer.byteLength(response.content) > sails.config.generation.provider.maxResponseBytes) throw new GenerationError('GENERATION_OUTPUT_PARSE_FAILED', 'Test response too large');
          results.push({ ...response, content: secret ? response.content.split(secret).join('[redacted]') : response.content });
        }
        return results;
      });
    }
    public async tryPrompt(brandId: string, actorId: string, input: unknown) {
      const body = parseAdminInput(tryPromptSchema, input);
      const draft = await this.draft(brandId, body.draft);
      const connection = await this.connection(brandId, draft.connectionId);
      if (!connection.enabled) throw new GenerationError('GENERATION_DEPLOYMENT_INCOMPATIBLE', 'Connection is disabled');
      this.takeCooldown(brandId, actorId);
      const start = Date.now();
      return this.bounded(connection.timeoutMs, async signal => {
        const secret = connection.secretRef ? await this.resolver().resolve(connection.secretRef) : undefined;
        this.checkOutbound(connection.adapterId, connection.endpoint);
        const response = await this.registry().get(connection.adapterId).invoke({
          connection: { endpoint: connection.endpoint, timeoutMs: Math.min(connection.timeoutMs, sails.config.generation.provider.timeoutMs),
            nonSecretHeaders: connection.nonSecretHeaders, secret },
          deployment: { ...draft, requiredCapabilities: { structuredOutput: true, nonStreaming: true, textInput: true } },
          messages: [{ role: 'user', content: body.prompt }], correlationId: randomUUID(),
          responseSchema: body.mode === 'sample' ? { type: 'object', additionalProperties: false,
            properties: { answer: { type: 'string' } }, required: ['answer'] } : undefined,
        }, signal);
        const clean = (value: string | undefined) => secret && value ? value.split(secret).join('[redacted]') : value;
        return { output: clean(response.content), requestedModel: clean(response.requestedModel),
          actualModel: clean(response.actualModel), actualProvider: clean(response.actualProvider),
          finishReason: clean(response.finishReason), usage: response.usage ? Object.fromEntries(['inputTokens', 'outputTokens', 'totalTokens', 'cost']
            .flatMap(key => { const value = Reflect.get(response.usage!, key); return typeof value === 'number' && Number.isFinite(value) ? [[key, value]] : []; })) : undefined, latencyMs: Date.now() - start };
      });
    }
  }
}
