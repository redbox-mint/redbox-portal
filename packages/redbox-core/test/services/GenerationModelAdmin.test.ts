import { strict as assert } from 'node:assert';
import * as sinon from 'sinon';
import { generation } from '../../src/config/generation.config';
import { Services } from '../../src/services/GenerationModelService';
import { Services as ProfileServices } from '../../src/services/GenerationProfileService';
import { Services as SecretServices } from '../../src/services/GenerationSecretResolverService';
import { FakeGenerationProvider } from '../../src/services/generation/providers/FakeGenerationProvider';
import { GenerationError, canonicalHash } from '../../src/model/generation';
import { GenerationModelConnectionWLDef } from '../../src/waterline-models/GenerationModelConnection';
import { GenerationModelDeploymentWLDef } from '../../src/waterline-models/GenerationModelDeployment';
import { generationDeploymentContent } from '../../src/waterline-models/generation-model-helpers';
import { createMockSails } from './testHelper';

const modelDraft = (overrides = {}) => ({ name: 'Model', connectionId: 'c1', modelId: 'test-model', parameters: {}, ...overrides });
const connectionDraft = (overrides = {}) => ({ key: 'provider', name: 'Provider', adapterId: 'openrouter', enabled: true,
  authStrategy: 'bearer', secretRef: 'env:AI_MODELS_TEST_KEY', nonSecretHeaders: {}, timeoutMs: 1000, ...overrides });
const rejects = (promise: Promise<unknown>, code = 'GENERATION_REQUEST_INVALID') =>
  assert.rejects(promise, (error: GenerationError) => error instanceof GenerationError && error.code === code);

describe('Generation model Admin service', () => {
  let service: Services.GenerationModelService;
  let tables: Record<string, any[]>;
  let originals: Map<string, unknown>;
  let health: sinon.SinonStub;
  let invoke: sinon.SinonStub;
  function install(name: string, definition?: any) {
    const rows = tables[name] = [];
    const matches = (row: any, criteria: any) => Object.entries(criteria).every(([key, value]: [string, any]) =>
      value === null ? row[key] == null : value && typeof value === 'object' && 'in' in value ? value.in.includes(row[key]) : row[key] === value);
    const hook = (name: string, values: any) => new Promise<void>((resolve, reject) => {
      if (!definition?.[name]) return resolve();
      definition[name](values, (error?: Error) => error ? reject(error) : resolve());
    });
    Reflect.set(globalThis, name, {
      destroyOne: async (criteria: any) => { const index = rows.findIndex(row => matches(row, criteria)); return index < 0 ? undefined : rows.splice(index, 1)[0]; },
      destroy: async (criteria: any) => { for (let i = rows.length - 1; i >= 0; i--) if (matches(rows[i], criteria)) rows.splice(i, 1); },
      find: async (criteria: any) => structuredClone(rows.filter(row => matches(row, criteria))),
      findOne: async (criteria: any) => structuredClone(rows.find(row => matches(row, criteria))),
      create: (values: any) => ({ fetch: async () => {
        const row = { id: name + (rows.length + 1), ...structuredClone(values) };
        await hook('beforeCreate', row);
        if (name === 'GenerationModelConnection' && rows.some(r => r.brandId === row.brandId && r.key === row.key)) throw Object.assign(new Error('Duplicate connection'), { code: 'E_UNIQUE' });
        rows.push(row); return structuredClone(row);
      } }),
      updateOne: (criteria: any) => ({ set: async (values: any) => {
        await hook('beforeUpdate', values);
        const row = rows.find(row => matches(row, criteria));
        if (!row) return undefined;
        Object.assign(row, structuredClone(values)); return structuredClone(row);
      } }),
    });
  }
  beforeEach(() => {
    originals = new Map(['sails', 'GenerationModelConnection', 'GenerationModelDeployment', 'GenerationProfile', 'GenerationProfileVersion', 'AppConfigService']
      .map(name => [name, Reflect.get(globalThis, name)]));
    const mock = createMockSails(); mock.config.generation = structuredClone(generation); mock.config.generation.enabled = true;
    Reflect.set(globalThis, 'sails', mock);
    tables = {}; install('GenerationModelConnection', GenerationModelConnectionWLDef);
    install('GenerationModelDeployment', GenerationModelDeploymentWLDef); install('GenerationProfile'); install('GenerationProfileVersion');
    tables.GenerationModelConnection.push({ id: 'c1', brandId: 'a', ...connectionDraft(), endpoint: 'https://openrouter.ai/api/v1',
      nameLower: 'provider', createdBy: 'actor', updatedBy: 'actor', updatedAt: '2026-11-17T00:00:00Z', dataPolicy: { retentionDays: 0 } });
    process.env.AI_MODELS_TEST_KEY = 'RESOLVED_PRIVATE_CREDENTIAL';
    sails.services.generationsecretresolverservice = new SecretServices.GenerationSecretResolverService();
    health = sinon.stub().resolves({ ok: true, checkedAt: 'now', capabilities: { structuredOutput: true, nonStreaming: true, textInput: true },
      safeMessage: 'RESOLVED_PRIVATE_CREDENTIAL', providerBody: 'PRIVATE BODY' });
    invoke = sinon.stub().resolves({ content: 'answer RESOLVED_PRIVATE_CREDENTIAL', requestedModel: 'test-model', actualModel: 'actual',
      actualProvider: 'provider', finishReason: 'stop', usage: { inputTokens: 1, outputTokens: 2, totalTokens: 3, cost: 0.001, body: 'PRIVATE BODY' }, body: 'PRIVATE BODY' });
    sails.services.generationproviderregistryservice = { list: () => ['openrouter', 'bedrock', 'fake', 'unconfigured'],
      get: () => ({ healthCheck: health, invoke }) };
    Reflect.set(globalThis, 'AppConfigService', { setGenerationProviderKey: sinon.stub().resolves(), getGenerationProviderKey: () => 'STORED_KEY' });
    service = new Services.GenerationModelService();
  });
  afterEach(() => {
    sinon.restore(); delete process.env.AI_MODELS_TEST_KEY;
    for (const [name, value] of originals) value === undefined ? Reflect.deleteProperty(globalThis, name) : Reflect.set(globalThis, name, value);
  });
  async function create(parameters = {}, routingPolicy = {}) {
    return service.createModel('a', { key: 'alias', ...modelDraft({ parameters, routingPolicy }) }, 'actor');
  }
  for (const parameters of [
    { temperature: -0.1 }, { temperature: 2.1 }, { temperature: '1' }, { temperature: Infinity },
    { topP: -0.1 }, { topP: 1.1 }, { maxOutputTokens: 0 }, { maxOutputTokens: 1.5 },
    { presencePenalty: -2.1 }, { frequencyPenalty: 2.1 }, { seed: 1.1 },
    { stopSequences: ['', 'a'] }, { stopSequences: [' '] }, { stopSequences: ['a','b','c','d','e'] },
    { top_p: 0.5 }, { unknown: true }, { fixtureResponse: {} },
  ]) {
    it(`rejects invalid SDK parameters ${JSON.stringify(parameters)}`, async () => { await rejects(create(parameters)); });
  }
  it('leaves the saved credential untouched when a stale browser creates a duplicate provider', async () => {
    const existing = tables.GenerationModelConnection[0]; existing.secretRef = 'appconfig:a:provider';
    await assert.rejects(service.saveAdminConnection('a', connectionDraft({ apiKey: 'REJECTED_KEY', secretRef: undefined }), 'other'));
    assert.equal((AppConfigService.setGenerationProviderKey as any).callCount, 0);
    assert.equal(await sails.services.generationsecretresolverservice.resolve(existing.secretRef), 'STORED_KEY');
  });
  it('reserves a concurrent provider identity before either request can replace its credential', async () => {
    const writes: string[] = []; let release!: () => void; let entered!: () => void;
    const writing = new Promise<void>(resolve => { entered = resolve; });
    const wait = new Promise<void>(resolve => { release = resolve; });
    (AppConfigService.setGenerationProviderKey as any).callsFake(async (_brand: string, _key: string, value: string) => { writes.push(value); entered(); await wait; });
    const input = connectionDraft({ key: 'new-provider', name: 'New provider', apiKey: 'WINNING_KEY', secretRef: undefined });
    const first = service.saveAdminConnection('a', input, 'first');
    await writing;
    assert.equal(tables.GenerationModelConnection.find(r => r.key === input.key).enabled, false);
    await assert.rejects(service.saveAdminConnection('a', { ...input, apiKey: 'REJECTED_KEY' }, 'second'));
    release(); const saved: any = await first;
    assert.deepEqual(writes, ['WINNING_KEY']); assert.equal(saved.enabled, true); assert.equal(saved.secretRef, 'appconfig:a:new-provider');
  });
  it('clears a partially written credential before releasing a failed provider reservation', async () => {
    const writer = AppConfigService.setGenerationProviderKey as any;
    writer.onFirstCall().rejects(new Error('Write failed')); writer.onSecondCall().resolves();
    await assert.rejects(service.saveAdminConnection('a', connectionDraft({ key: 'failed', name: 'Failed', apiKey: 'PRIVATE', secretRef: undefined }), 'actor'));
    assert.deepEqual(writer.secondCall.args, ['a', 'failed', '']);
    assert.equal(tables.GenerationModelConnection.some(r => r.key === 'failed'), false);
  });
  it('rejects an unreviewed model hash before testing or publishing newer saved settings', async () => {
    const row = await create();
    const newer = await service.updateDeploymentDraft('a', row.id, { ...modelDraft({ parameters: { temperature: 0.4 } }), expectedContentHash: row.contentHash });
    await rejects(service.publishDeployment('a', row.id, 'actor', row.contentHash), 'GENERATION_TARGET_CONFLICT');
    assert.equal(health.callCount, 0); assert.equal(tables.GenerationModelDeployment[0].status, 'draft');
    assert.equal((await service.publishDeployment('a', row.id, 'actor', newer.contentHash)).status, 'published');
  });
  it('rejects a model edit that wins during its publication capability test', async () => {
    const row = await create();
    health.callsFake(async () => { await service.updateDeploymentDraft('a', row.id, { ...modelDraft({ parameters: { temperature: 0.4 } }), expectedContentHash: row.contentHash }); return { ok: true, capabilities: { structuredOutput: true, nonStreaming: true, textInput: true } }; });
    await rejects(service.publishDeployment('a', row.id, 'actor', row.contentHash), 'GENERATION_TARGET_CONFLICT');
    assert.equal(tables.GenerationModelDeployment[0].status, 'draft');
  });
  for (const mode of ['sample', 'text'] as const) it('tries an admin-created demo model in ' + mode + ' mode without fixtures', async () => {
    const provider = new FakeGenerationProvider();
    sails.services.generationproviderregistryservice.get = () => provider;
    const connection: any = await service.saveAdminConnection('a', connectionDraft({ key: 'demo', name: 'Demo', adapterId: 'fake', authStrategy: 'none', secretRef: undefined }), 'actor');
    const draft = modelDraft({ connectionId: connection.id, modelId: 'demo' });
    await service.createModel('a', { key: 'demo', ...draft }, 'actor');
    const result = await service.tryPrompt('a', 'actor', { draft, prompt: 'Synthetic example', mode });
    assert.equal(mode === 'sample' ? JSON.parse(result.output).answer : result.output, 'Synthetic demonstration response');
    provider.registerFixture('default', 'Deliberately invalid output');
    const explicit = await service.tryPrompt('a', 'other', { draft, prompt: 'Synthetic example', mode });
    assert.equal(explicit.output, 'Deliberately invalid output');
    provider.clearFixtures();
    const fixture = await provider.invoke({ connection: {} as any, deployment: { modelId: 'demo', parameters: { fixtureResponse: 'Configured invalid output' } }, messages: [], correlationId: 'explicit', responseSchema: { type: 'object', properties: { answer: { type: 'string' } } } }, new AbortController().signal);
    assert.equal(fixture.content, 'Configured invalid output');
  });
  it('accepts boundary settings using SDK names and creates draft v1 with a canonical hash', async () => {
    const row = await create({ temperature: 2, topP: 0, maxOutputTokens: 1, presencePenalty: -2, frequencyPenalty: 2,
      seed: -42, stopSequences: ['a','b','c','d'] });
    assert.equal(row.status, 'draft'); assert.equal(row.version, 1);
    assert.equal(row.contentHash, canonicalHash(generationDeploymentContent(row)));
    assert.deepEqual(row.requiredCapabilities, { structuredOutput: true, nonStreaming: true, textInput: true });
  });
  it('limits Bedrock temperature to one and derives a region endpoint for AWS default credentials', async () => {
    tables.GenerationModelConnection[0].adapterId = 'bedrock';
    await rejects(create({ temperature: 1.1 })); await create({ temperature: 1 });
    const saved: any = await service.saveAdminConnection('a', connectionDraft({ key: 'aws', adapterId: 'bedrock',
      authStrategy: 'aws-default-chain', secretRef: undefined, region: 'ap-southeast-2' }), 'actor');
    assert.equal(saved.endpoint, 'https://bedrock-runtime.ap-southeast-2.amazonaws.com'); assert.equal(saved.secretRef, '');
  });
  for (const routing of [{ require_parameters: false }, { zdr: 'yes' }, { data_collection: 'maybe' }, { sort: 'random' },
    { only: 'provider' }, { order: [1] }, { ignore: [''] }, { allow_fallbacks: 0 }]) {
    it(`rejects unsafe routing ${JSON.stringify(routing)}`, async () => { await rejects(create({}, routing)); });
  }
  it('accepts only the documented OpenRouter routing fields', async () => {
    await create({}, { zdr: true, data_collection: 'deny', allow_fallbacks: false, sort: 'latency', only: ['a'], ignore: [], order: ['a'] });
    tables.GenerationModelConnection[0].adapterId = 'bedrock';
    await rejects(create({}, { zdr: true }));
  });
  for (const name of ['Authorization', 'Cookie', 'Host', 'X-Token', 'apiKey', 'X-Secret', 'Password', 'Proxy-Authorization']) {
    it(`rejects sensitive ${name} headers`, async () => {
      await rejects(service.saveAdminConnection('a', connectionDraft({ nonSecretHeaders: { [name]: 'private' } }), 'actor'));
    });
  }
  for (const change of [{ secretRef: 'literal:private' }, { secretRef: 'env:' }, { secretRef: 'private' },
    { timeoutMs: 90001 }, { adapterId: 'unconfigured' }, { endpoint: 'https://attacker.invalid' },
    { adapterId: 'bedrock', region: 'unknown' }, { nonSecretHeaders: { 'X-Title': 'a\r\nAuthorization: key' } }]) {
    it(`rejects invalid connection settings ${JSON.stringify(change)}`, async () => {
      await rejects(service.saveAdminConnection('a', connectionDraft(change), 'actor'));
    });
  }
  it('offers only registered secret schemes and configured installed adapters', async () => {
    const resolver = sails.services.generationsecretresolverservice;
    resolver.register('vault', async () => 'PRIVATE');
    const result = await service.adminOverview('a');
    assert.deepEqual(result.secretSchemes, ['appconfig','env','vault']);
    assert.deepEqual(result.adapters, ['openrouter','bedrock','fake']);
    assert.equal(result.limits.cooldownMs, 5000);
    assert.equal(JSON.stringify(result).includes('RESOLVED_PRIVATE_CREDENTIAL'), false);
  });
  it('redacts secrets and sensitive legacy headers while returning credential status', async () => {
    const row = tables.GenerationModelConnection[0]; row.nonSecretHeaders = { Authorization: 'PRIVATE', 'X-Title': 'Portal' };
    const safe: any = await service.safeConnection(row);
    assert.equal(safe.secretConfigured, true); assert.equal(safe.secretRef, 'env:AI_MODELS_TEST_KEY');
    assert.deepEqual(safe.nonSecretHeaders, { 'X-Title': 'Portal' });
    assert.equal(JSON.stringify(safe).includes('PRIVATE'), false);
    assert.equal(safe.dataPolicy, undefined);
  });
  it('preserves data policy and an omitted secret reference on connection update', async () => {
    await service.saveAdminConnection('a', connectionDraft({ name: 'Renamed', secretRef: undefined }), 'editor', 'c1');
    assert.deepEqual(tables.GenerationModelConnection[0].dataPolicy, { retentionDays: 0 });
    assert.equal(tables.GenerationModelConnection[0].secretRef, 'env:AI_MODELS_TEST_KEY');
    assert.equal(tables.GenerationModelConnection[0].updatedBy, 'editor');
    await rejects(service.saveAdminConnection('a', connectionDraft({ dataPolicy: {} } as any), 'editor', 'c1'));
  });
  it('supports fake connections without an endpoint or credential', async () => {
    const safe: any = await service.saveAdminConnection('a', connectionDraft({ key: 'fake', adapterId: 'fake', authStrategy: 'none', secretRef: undefined }), 'actor');
    assert.equal(safe.endpoint, ''); assert.equal(safe.secretConfigured, false);
  });
  it('tests unsaved connections without persisting and returns only safe health fields', async () => {
    const result = await service.testConnectionDraft('a', 'actor', { connection: connectionDraft({ name: 'Unsaved' }) });
    assert.equal(result.ok, true); assert.equal(result.secretConfigured, true); assert.equal(invoke.callCount, 1);
    assert.equal(tables.GenerationModelConnection.length, 1);
    assert.equal(tables.GenerationModelConnection[0].lastHealthStatus, undefined);
    assert.equal(JSON.stringify(result).includes('PRIVATE'), false);
  });
  it('records health only for an unchanged saved connection', async () => {
    await service.testConnectionDraft('a', 'actor', { connectionId: 'c1', connection: connectionDraft({ name: 'Unsaved' }) });
    assert.equal(tables.GenerationModelConnection[0].lastHealthStatus, undefined);
    await service.testConnectionDraft('a', 'actor2', { connectionId: 'c1', connection: connectionDraft() });
    assert.equal(tables.GenerationModelConnection[0].lastHealthStatus, 'healthy');
  });
  it('does not stamp a connection edited while healthCheck is in flight', async () => {
    invoke.callsFake(async () => { tables.GenerationModelConnection[0].updatedAt = 'changed'; return { content: 'OK' }; });
    await service.testConnectionDraft('a', 'actor', { connectionId: 'c1', connection: connectionDraft() });
    assert.equal(tables.GenerationModelConnection[0].lastHealthStatus, undefined);
  });
  it('reports an unconfigured secret without returning it or persisting a draft', async () => {
    delete process.env.AI_MODELS_TEST_KEY;
    const result = await service.testConnectionDraft('a', 'actor', { connectionId: 'c1', connection: connectionDraft() });
    assert.equal(result.ok, false); assert.equal(result.secretConfigured, false);
    assert.equal(tables.GenerationModelConnection[0].lastHealthStatus, 'unhealthy');
  });
  it('shares the five-second cooldown between health checks and prompt trials, scoped to user and brand', async () => {
    const now = sinon.stub(Date, 'now').returns(10000);
    await service.testConnectionDraft('a', 'actor', { connection: connectionDraft() });
    await rejects(service.tryPrompt('a', 'actor', { draft: modelDraft(), prompt: 'Hi', mode: 'text' }), 'GENERATION_RATE_LIMITED');
    await service.tryPrompt('a', 'other', { draft: modelDraft(), prompt: 'Hi', mode: 'text' });
    now.returns(15000);
    await service.tryPrompt('a', 'actor', { draft: modelDraft(), prompt: 'Hi', mode: 'text' });
    await rejects(service.testConnectionDraft('a', 'actor', { connection: connectionDraft() }), 'GENERATION_RATE_LIMITED');
    tables.GenerationModelConnection.push({ ...tables.GenerationModelConnection[0], brandId: 'b' });
    await service.testConnectionDraft('b', 'actor', { connection: connectionDraft() });
  });
  it('bounds connection health and prompt invocation by the provider time limit and aborts invoke', async () => {
    sails.config.generation.provider.timeoutMs = 10;
    tables.GenerationModelConnection[0].timeoutMs = 10;
    invoke.returns(new Promise(() => {}));
    assert.equal((await service.testConnectionDraft('a', 'actor', { connection: connectionDraft({ timeoutMs: 10 }) })).errorCode, 'GENERATION_PROVIDER_TIMEOUT');
    invoke.returns(new Promise(() => {}));
    await rejects(service.tryPrompt('a', 'other', { draft: modelDraft(), prompt: 'Hi', mode: 'text' }), 'GENERATION_PROVIDER_TIMEOUT');
    assert.equal(invoke.firstCall.args[1].aborted, true);
  });
  it('invokes one unsaved model draft with a saved connection, no persistence, safe usage and secret redaction', async () => {
    const result = await service.tryPrompt('a', 'actor', { draft: modelDraft({ modelId: 'unsaved-model' }), prompt: 'Hello', mode: 'sample' });
    assert.equal(invoke.callCount, 1); assert.equal(invoke.firstCall.args[0].deployment.modelId, 'unsaved-model');
    assert.equal(invoke.firstCall.args[0].responseSchema.additionalProperties, false);
    assert.equal(result.output, 'answer [redacted]'); assert.equal(result.actualModel, 'actual');
    assert.deepEqual(result.usage, { inputTokens: 1, outputTokens: 2, totalTokens: 3, cost: 0.001 });
    assert.equal(JSON.stringify(result).includes('PRIVATE'), false); assert.equal(tables.GenerationModelDeployment.length, 0);
  });
  it('runs plain-text trials without an output schema and rejects prompts over 2000 characters', async () => {
    await rejects(service.tryPrompt('a', 'actor', { draft: modelDraft(), prompt: 'x'.repeat(2001), mode: 'text' }));
    await service.tryPrompt('a', 'actor', { draft: modelDraft(), prompt: 'x'.repeat(2000), mode: 'text' });
    assert.equal(invoke.firstCall.args[0].responseSchema, undefined);
  });
  it('does not test while generation is disabled, but still returns the disabled overview', async () => {
    sails.config.generation.enabled = false;
    assert.equal((await service.adminOverview('a')).enabled, false);
    await rejects(service.testConnectionDraft('a', 'actor', { connection: connectionDraft() }), 'GENERATION_NOT_CONFIGURED');
    assert.equal(health.callCount, 0);
  });
  it('recomputes draft hashes, preserves fake fixtures and refuses stale hashes with 409', async () => {
    tables.GenerationModelConnection[0].adapterId = 'fake';
    const row = await create({ fixtureResponse: { answer: 'fixture' } });
    const updated = await service.updateDeploymentDraft('a', row.id, { ...modelDraft({ parameters: { temperature: 0.5 } }), expectedContentHash: row.contentHash });
    assert.notEqual(updated.contentHash, row.contentHash); assert.deepEqual(updated.parameters?.fixtureResponse, { answer: 'fixture' });
    await assert.rejects(service.updateDeploymentDraft('a', row.id, { ...modelDraft(), expectedContentHash: row.contentHash }),
      (error: GenerationError) => error.status === 409 && error.code === 'GENERATION_TARGET_CONFLICT');
  });
  it('requires expectedContentHash and refuses client-supplied lifecycle fields', async () => {
    const row = await create();
    await rejects(service.updateDeploymentDraft('a', row.id, modelDraft()));
    await rejects(service.updateDeploymentDraft('a', row.id, { ...modelDraft(), expectedContentHash: row.contentHash, status: 'published' }));
    await rejects(service.createModel('a', { key: 'other', ...modelDraft(), version: 50 }, 'actor'));
  });
  it('preserves the fixture when switching between fake connections and drops it when switching to a real provider', async () => {
    tables.GenerationModelConnection[0].adapterId = 'fake';
    tables.GenerationModelConnection.push({ ...tables.GenerationModelConnection[0], id: 'c2' });
    const row = await create({ fixtureResponse: 'fixture' });
    const second = await service.updateDeploymentDraft('a', row.id, { ...modelDraft({ connectionId: 'c2' }), expectedContentHash: row.contentHash });
    assert.equal(second.parameters?.fixtureResponse, 'fixture');
    tables.GenerationModelConnection[0].adapterId = 'openrouter';
    const real = await service.updateDeploymentDraft('a', row.id, { ...modelDraft(), expectedContentHash: second.contentHash });
    assert.equal(real.parameters?.fixtureResponse, undefined);
  });
  it('guards the draft write atomically against changes after reading', async () => {
    const row = await create();
    sinon.stub(GenerationModelDeployment, 'updateOne').returns({ set: async () => undefined } as any);
    await rejects(service.updateDeploymentDraft('a', row.id, { ...modelDraft(), expectedContentHash: row.contentHash }), 'GENERATION_TARGET_CONFLICT');
  });
  for (const status of ['published','retired']) {
    it(`refuses updates to a ${status} version`, async () => {
      const row = await create(); tables.GenerationModelDeployment[0].status = status;
      await rejects(service.updateDeploymentDraft('a', row.id, { ...modelDraft(), expectedContentHash: row.contentHash }), 'GENERATION_INVALID_STATE');
    });
  }
  it('publishes drafts and copies any existing version into the next immutable-key draft', async () => {
    const row = await create(); const published = await service.publishDeployment('a', row.id, 'publisher', row.contentHash);
    assert.equal(published.status, 'published');
    const next = await service.newDeploymentVersion('a', row.id, 'actor'); assert.equal(next.version, 2); assert.equal(next.status, 'draft');
    assert.equal(next.key, row.key); assert.equal(next.publishedBy, undefined);
    const third = await service.newDeploymentVersion('a', row.id, 'actor'); assert.equal(third.version, 3);
    await rejects(service.publishDeployment('a', row.id, 'actor', row.contentHash), 'GENERATION_INVALID_STATE');
  });
  it('converts legacy snake_case settings when cloning an existing version', async () => {
    const row = await create(); tables.GenerationModelDeployment[0].parameters = { max_tokens: 100, top_p: 0.4, stop: ['end'] };
    const next = await service.newDeploymentVersion('a', row.id, 'actor');
    assert.deepEqual(next.parameters, { maxOutputTokens: 100, topP: 0.4, stopSequences: ['end'] });
    const legacy = (await service.adminOverview('a')).models[0].versions.find(version => version.id === row.id)!;
    assert.deepEqual(legacy.parameters, next.parameters);
    assert.equal(legacy.contentHash, row.contentHash);
  });
  for (const enabled of [true, false]) it(`guards retirement of a published profile reference when the profile is ${enabled ? 'enabled' : 'disabled'}`, async () => {
    const row = await create();
    tables.GenerationModelDeployment[0].status = 'published';
    tables.GenerationProfile.push({ id: 'p', brandId: 'a', publishedVersionId: 'pv', enabled });
    tables.GenerationProfileVersion.push({ id: 'pv', brandId: 'a', status: 'published', definition: { modelDeploymentId: row.id } });
    await rejects(service.retireDeployment('a', row.id), 'GENERATION_INVALID_STATE');
    assert.equal(tables.GenerationModelDeployment[0].status, 'published');
    tables.GenerationProfile[0].publishedVersionId = undefined;
    assert.equal((await service.retireDeployment('a', row.id))?.status, 'retired');
  });
  it('retires a model after its live profile is retired while retaining historical references and deletion safeguards', async () => {
    const row = await create();
    await service.publishDeployment('a', row.id, 'publisher', row.contentHash);
    tables.GenerationProfile.push({ id: 'p', brandId: 'a', key: 'profile', name: 'Profile', publishedVersionId: 'pv', enabled: true });
    tables.GenerationProfileVersion.push({ id: 'pv', brandId: 'a', profileId: 'p', status: 'published', definition: { modelDeploymentId: row.id } });
    await rejects(service.retireDeployment('a', row.id), 'GENERATION_INVALID_STATE');
    const profiles = new ProfileServices.GenerationProfileService();
    assert.equal((await profiles.retire('a', 'pv', 'actor')).status, 'retired');
    assert.equal(tables.GenerationProfile[0].publishedVersionId, 'pv');
    assert.equal((await service.retireDeployment('a', row.id))?.status, 'retired');
    assert.equal(tables.GenerationProfileVersion[0].definition.modelDeploymentId, row.id);
    assert.deepEqual(await service.deleteModel('a', row.key), { deleted: false, uses: [{ key: 'profile', name: 'Profile' }] });
    assert.equal(tables.GenerationModelDeployment.length, 1);
    assert.equal(tables.GenerationProfileVersion.length, 1);
  });
  it('counts unique profiles using latest or published references across every version of a key, brand scoped', async () => {
    const row = await create(); const next = await service.newDeploymentVersion('a', row.id, 'actor');
    tables.GenerationProfile.push({ id: 'p1', brandId: 'a', latestVersionId: 'v1', publishedVersionId: 'v2' },
      { id: 'p2', brandId: 'a', latestVersionId: 'v3' }, { id: 'old', brandId: 'a', latestVersionId: 'unused' },
      { id: 'foreign', brandId: 'b', latestVersionId: 'v1' });
    for (const [id, deploymentId] of [['v1',row.id],['v2',next.id],['v3',next.id],['historical',row.id]]) {
      tables.GenerationProfileVersion.push({ id, brandId: 'a', definition: { modelDeploymentId: deploymentId } });
    }
    const group = (await service.adminOverview('a')).models[0];
    assert.equal(group.usageCount, 2); assert.deepEqual(group.versions.map(version => version.version), [2,1]);
  });
  it('stores replacements with AppConfig and retains a stored key without exposing its value', async () => {
    const safe: any = await service.saveAdminConnection('a', connectionDraft({ apiKey: 'NEW_PRIVATE_KEY', secretRef: undefined }), 'actor', 'c1');
    assert.deepEqual((AppConfigService.setGenerationProviderKey as any).firstCall.args, ['a', 'provider', 'NEW_PRIVATE_KEY']);
    assert.equal(safe.secretRef, 'appconfig:a:provider');
    assert.equal(safe.apiKey, undefined); assert.ok(!JSON.stringify(safe).includes('NEW_PRIVATE_KEY'));
    await service.saveAdminConnection('a', connectionDraft({ secretRef: undefined }), 'actor', 'c1');
    assert.equal(tables.GenerationModelConnection[0].secretRef, 'appconfig:a:provider');
  });
  it('tests one minimal real adapter request using a replacement without saving it', async () => {
    await create();
    const result = await service.testConnectionDraft('a', 'actor', { connectionId: 'c1', connection: connectionDraft({ apiKey: 'DRAFT_KEY' }) });
    assert.equal(result.ok, true); assert.equal(invoke.firstCall.args[0].connection.secret, 'DRAFT_KEY');
    assert.equal(invoke.firstCall.args[0].deployment.modelId, 'test-model');
    assert.equal(invoke.firstCall.args[0].deployment.parameters.maxOutputTokens, 1);
    assert.equal(invoke.firstCall.args[0].responseSchema, undefined);
    assert.equal((AppConfigService.setGenerationProviderKey as any).callCount, 0);
    assert.equal(tables.GenerationModelConnection[0].lastHealthStatus, undefined);
  });
  it('returns only a safe failure code, stamps unchanged providers and enforces outbound hosts', async () => {
    invoke.rejects(new GenerationError('GENERATION_PROVIDER_AUTH_FAILED', 'PRIVATE BODY'));
    const result = await service.testConnectionDraft('a', 'actor', { connectionId: 'c1', connection: connectionDraft() });
    assert.equal(result.ok, false); assert.equal(result.errorCode, 'GENERATION_PROVIDER_AUTH_FAILED');
    assert.equal(tables.GenerationModelConnection[0].lastHealthStatus, 'unhealthy');
    assert.ok(!JSON.stringify(result).includes('PRIVATE'));
    sails.config.generation.outbound.allowedHosts = [];
    invoke.resetHistory();
    const blocked = await service.testConnectionDraft('a', 'other', { connection: connectionDraft() });
    assert.equal(blocked.errorCode, 'GENERATION_DEPLOYMENT_INCOMPATIBLE'); assert.equal(invoke.callCount, 0);
  });
  it('blocks provider deletion for every referenced version and clears the key when unused', async () => {
    await create();
    assert.deepEqual(await service.deleteConnection('a', 'c1'), { deleted: false, uses: [{ key: 'alias', name: 'Model' }] });
    tables.GenerationModelDeployment.length = 0;
    assert.equal((await service.deleteConnection('a', 'c1')).deleted, true);
    assert.deepEqual((AppConfigService.setGenerationProviderKey as any).lastCall.args, ['a', 'provider', '']);
    assert.equal(tables.GenerationModelConnection.length, 0);
  });
  it('discards only unused drafts and deletes a model only when no profile version uses it', async () => {
    const row = await create();
    const next = await service.newDeploymentVersion('a', row.id, 'actor');
    tables.GenerationProfile.push({ id: 'p', brandId: 'a', key: 'profile', name: 'Profile' });
    tables.GenerationProfileVersion.push({ id: 'old', brandId: 'a', profileId: 'p', definition: { modelDeploymentId: row.id } });
    assert.deepEqual(await service.deleteModel('a', row.key), { deleted: false, uses: [{ key: 'profile', name: 'Profile' }] });
    assert.equal((await service.discardDeployment('a', row.id)).deleted, false);
    assert.equal((await service.discardDeployment('a', next.id)).deleted, true);
    tables.GenerationModelDeployment[0].status = 'published';
    await rejects(service.discardDeployment('a', row.id), 'GENERATION_INVALID_STATE');
    tables.GenerationProfileVersion.length = 0;
    assert.equal((await service.deleteModel('a', row.key)).deleted, true);
    assert.equal(tables.GenerationModelDeployment.length, 0);
  });
  it('rejects references across brands before any provider invocation', async () => {
    await rejects(service.createModel('b', { key: 'foreign', ...modelDraft() }, 'actor'), 'GENERATION_ACTION_NOT_AVAILABLE');
    assert.equal(invoke.callCount, 0);
  });
  for (const operation of ['create', 'save']) it(`compensates model ${operation} when provider deletion wins before attachment`, async () => {
    const saved = operation === 'save' ? await create() : undefined;
    tables.GenerationModelConnection.push({ ...tables.GenerationModelConnection[0], id: 'c2', key: 'second' });
    const method = operation === 'create' ? 'create' : 'updateOne';
    const original = (GenerationModelDeployment as any)[method].bind(GenerationModelDeployment);
    let intercepted = false;
    sinon.stub(GenerationModelDeployment, method as any).callsFake((...args: any[]) => {
      const query = original(...args); const terminal = method === 'create' ? 'fetch' : 'set';
      return { [terminal]: async (...values: any[]) => {
        if (!intercepted) { intercepted = true; assert.equal((await service.deleteConnection('a', 'c2')).deleted, true); }
        return query[terminal](...values);
      } };
    });
    const action = saved ? service.updateDeploymentDraft('a', saved.id, { ...modelDraft({ connectionId: 'c2' }), expectedContentHash: saved.contentHash })
      : service.createModel('a', { key: 'new', ...modelDraft({ connectionId: 'c2' }) }, 'admin');
    await rejects(action, 'GENERATION_TARGET_CONFLICT');
    assert.equal(tables.GenerationModelDeployment.some(v => v.connectionId === 'c2'), false);
    if (saved) assert.deepEqual(tables.GenerationModelDeployment[0], saved);
  });
  it('rejects attachments during a provider deletion claim and releases blocked claims without clearing credentials', async () => {
    await create();
    assert.equal((await service.deleteConnection('a', 'c1')).deleted, false);
    assert.equal((AppConfigService.setGenerationProviderKey as any).callCount, 0);
    assert.ok(!tables.GenerationModelConnection[0].deletionClaim);
    tables.GenerationModelConnection[0].deletionClaim = 'deleting';
    await rejects(service.createModel('a', { key: 'another', ...modelDraft() }, 'admin'), 'GENERATION_DEPLOYMENT_INCOMPATIBLE');
  });
  for (const fixture of [JSON.stringify({ answers: { summary: { value: 'Configured', evidenceIds: [], rationale: 'Test' } } }), { answers: { summary: { value: 'Configured object', evidenceIds: [], rationale: 'Test' } } }, 'invalid JSON', { answers: {} }, { unrelated: true }]) {
    it(`preserves explicit generation fixture ${JSON.stringify(fixture)}`, async () => {
      const request: any = { correlationId: 'normal-generation', connection: {}, deployment: { modelId: 'demo', parameters: { fixtureResponse: fixture } }, messages: [],
        responseSchema: { type: 'object', properties: { answers: { type: 'object', properties: { summary: { type: 'object' } } } } } };
      const response = await new FakeGenerationProvider().invoke(request, new AbortController().signal);
      assert.equal(response.content, typeof fixture === 'string' ? fixture : JSON.stringify(fixture));
    });
  }

});
