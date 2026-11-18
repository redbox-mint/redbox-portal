import { Services as PromptServices } from '../../src/services/GenerationPromptService';
import { expect } from 'chai';
import * as sinon from 'sinon';
import { generation } from '../../src/config/generation.config';
import { Services as WorkerServices } from '../../src/services/GenerationWorkerService';
import { Services as CryptoServices } from '../../src/services/GenerationCryptoService';
import { Services as PersistenceServices } from '../../src/services/GenerationPersistenceService';

// Exercise the real worker, transition graph and artifact crypto against scoped in-memory rows.
describe('Generation worker lifecycle', () => {
  const names = ['sails', 'GenerationRun', 'GenerationRunArtifact', 'GenerationBinding',
    'GenerationProfileVersion', 'GenerationModelDeployment', 'GenerationModelConnection', 'User', 'BrandingService', 'TranslationService'];
  let originals: Map<string, unknown>;
  let run: Record<string, any>;
  let artifact: Record<string, any>;
  let crypto: CryptoServices.GenerationCryptoService;
  let invoke: sinon.SinonStub;
  let artifactUpdate: sinon.SinonSpy;
  let loseClaim: boolean;
  const credential = 'provider-credential-must-not-be-retained';

  function matches(row: Record<string, any>, criteria: Record<string, any>): boolean {
    return Object.entries(criteria).every(([key, value]) =>
      value && typeof value === 'object' && Array.isArray(value.in)
        ? value.in.includes(row[key]) : row[key] === value);
  }

  beforeEach(async () => {
    originals = new Map(names.map(name => [name, Reflect.get(globalThis, name)]));
    loseClaim = false;
    run = { id: 'run-1', brandId: 'brand-1', bindingId: 'binding-1', profileVersionId: 'profile-1',
      modelDeploymentId: 'deployment-1', initiatedByUserId: 'user-1', sourceRefs: [],
      targetDescriptor: { recordType: 'plan' }, knowledgeCollectionVersionIds: [],
      status: 'queued', phase: 'provider', attemptCount: 1 };
    const logger = Object.fromEntries(['debug', 'info', 'warn', 'error', 'trace', 'fatal', 'verbose', 'silly', 'log']
      .map(name => [name, sinon.stub()]));
    const config = structuredClone(generation);
    config.artifacts.encryptionKeyRef = 'env:ARTIFACT_KEY';
    Reflect.set(globalThis, 'sails', { config: { generation: config,
      workflow: { plan: { draft: { starting: true, config: {
        workflow: { stage: 'draft' }, authorization: { editRoles: ['Editor'] },
      } } } }, log: { createNamespaceLogger: () => logger, customLogger: logger } },
      log: logger, services: {} });
    Reflect.set(globalThis, 'GenerationRun', {
      findOne: async (criteria: Record<string, any>) => matches(run, criteria) ? { ...run } : null,
      updateOne: (criteria: Record<string, any>) => ({ set: async (changes: Record<string, any>) => {
        if (loseClaim && criteria.status === 'queued') { run.status = 'running'; return null; }
        if (!matches(run, criteria)) return null;
        Object.assign(run, changes); return { ...run };
      } }),
    });
    artifactUpdate = sinon.spy((criteria: Record<string, any>) => ({ set: async (changes: Record<string, any>) => {
      if (!matches(artifact, criteria)) return null;
      Object.assign(artifact, changes); return { ...artifact };
    } }));
    Reflect.set(globalThis, 'GenerationRunArtifact', {
      findOne: async () => ({ ...artifact }), updateOne: artifactUpdate,
    });
    Reflect.set(globalThis, 'User', { findOne: () => ({ populate: async () => ({ id: 'user-1', roles: [{ name: 'Editor' }] }) }) });
    Reflect.set(globalThis, 'BrandingService', { getBrandById: () => ({ id: 'brand-1' }) });
    Reflect.set(globalThis, 'GenerationBinding', { findOne: async () => ({ enabled: true,
      targetRecordType: 'plan', targetStartingWorkflowStage: 'draft', allowedRoles: ['Editor'] }) });
    Reflect.set(globalThis, 'GenerationProfileVersion', { findOne: async () => ({ definition: {
      targetFields: [], sourceSlots: [], documentSources: {}, contextLimits: { maxKnowledgeChunks: 2, totalBytes: 4096 },
    } }) });
    Reflect.set(globalThis, 'GenerationModelDeployment', { findOne: async () => ({ connectionId: 'connection-1', modelId: 'model-1' }) });
    Reflect.set(globalThis, 'GenerationModelConnection', { findOne: async () => ({
      adapterId: 'test', endpoint: 'https://provider.example', secretRef: 'env:PROVIDER', timeoutMs: 1000,
    }) });
    sails.services.generationsecretresolverservice = { resolve: async (ref: string) =>
      ref === 'env:ARTIFACT_KEY' ? Buffer.alloc(32, 9).toString('hex') : credential };
    crypto = new CryptoServices.GenerationCryptoService();
    sails.services.generationcryptoservice = crypto;
    sails.services.generationpersistenceservice = new PersistenceServices.GenerationPersistenceService();
    sails.services.generationknowledgeservice = { retrieve: async () => [] };
    sails.services.generationschemaservice = { buildProviderSchema: () => ({ type: 'object' }),
      validateCandidate: () => ({ runId: 'run-1', candidateDigest: 'digest', baseTargetDigest: 'base', items: [] }) };
    sails.services.generationpromptservice = { build: (input: Record<string, any>) => ({
      correlationId: input.correlationId, connection: input.connection, deployment: input.deployment,
      responseSchema: input.responseSchema, messages: [{ role: 'system', content: 'Use approved evidence.' }],
    }) };
    invoke = sinon.stub().resolves({ content: '{}' });
    sails.services.generationproviderregistryservice = { get: () => ({ invoke,
      getCapabilities: async () => ({ structuredOutput: true, nonStreaming: true, textInput: true }) }) };
    artifact = { id: 'artifact-1', brandId: 'brand-1', runId: 'run-1',
      expiresAt: new Date(Date.now() + 60_000).toISOString(),
      ...await crypto.encrypt('brand-1', 'run-1', { frozenInput: { sourceEvidence: [], baseTargetDigest: 'base' } }) };
  });

  afterEach(() => {
    sinon.restore();
    for (const [name, value] of originals) {
      if (value === undefined) Reflect.deleteProperty(globalThis, name); else Reflect.set(globalThis, name, value);
    }
  });

  async function execute(): Promise<void> {
    await new WorkerServices.GenerationWorkerService().executeQueuedRun({ data: { brandId: 'brand-1', runId: 'run-1' } });
  }

  it('sends the run brand question, help and selected choice meanings through the real prompt builder', async () => {
    Reflect.set(globalThis, 'BrandingService', { getBrandById: (id: string) => ({ id, name: id === run.brandId ? 'research-brand' : 'default' }) });
    Reflect.set(globalThis, 'TranslationService', { t: (key: string, _context: unknown, _lang: string, brand = 'default') => brand + ':' + key });
    Reflect.set(globalThis, 'GenerationProfileVersion', { findOne: async () => ({ definition: {
      systemInstructions: 'Draft from reviewed facts', targetFields: [], sourceSlots: [], documentSources: {}, contextLimits: { maxKnowledgeChunks: 2, totalBytes: 4096 },
      questions: [{ id: 'methods', labelKey: 'question-key', helpTextKey: 'help-key', type: 'multiEnum', options: [{ value: 'one', labelKey: 'option-key' }, { value: 'two', label: 'Interviews' }] }],
    } }) });
    sails.services.generationpromptservice = new PromptServices.GenerationPromptService();
    Object.assign(artifact, await crypto.encrypt(run.brandId, run.id, { frozenInput: {
      sourceEvidence: [{ id: 'answer:methods', questionId: 'methods', kind: 'source', content: ['one', 'two'], contentHash: 'hash' }],
      answers: [{ id: 'methods', value: ['one', 'two'] }], baseTargetDigest: 'base',
    } }));
    await execute();
    expect(run.status, JSON.stringify(run)).to.equal('completed'); expect(invoke.calledOnce).to.equal(true);
    const messages = invoke.firstCall.args[0].messages;
    const answer = JSON.parse(messages.at(-1).content.split('\n')[1]).reviewedAnswers[0];
    expect(answer).to.deep.include({ label: 'research-brand:question-key', helpText: 'research-brand:help-key', value: ['one', 'two'] });
    expect(answer.selectedOptions).to.deep.equal([{ value: 'one', label: 'research-brand:option-key' }, { value: 'two', label: 'Interviews' }]);
    expect(answer.evidenceId).to.match(/^E/);
    expect(messages.filter(m => m.role === 'system').every(m => !/research-brand:|Interviews/.test(m.content))).to.equal(true);
  });

  it('uses the resolved provider credential for invocation without retaining it in encrypted artifacts', async () => {
    await execute();
    expect(run.status).to.equal('completed');
    expect(invoke.calledOnce).to.equal(true);
    expect(invoke.firstCall.args[0].connection.secret).to.equal(credential);
    const stored = await crypto.decrypt<Record<string, any>>('brand-1', 'run-1', artifact as any);
    expect(JSON.stringify(stored)).not.to.include(credential);
    expect(stored.providerRequest.connection).not.to.have.property('secret');
    expect(stored.providerRequest.messages).to.have.length(1);
    expect(stored.candidate.candidateDigest).to.equal('digest');
  });

  it('acknowledges cancellation requested before queue delivery without invoking the provider', async () => {
    run.status = 'cancelRequested';
    await execute();
    expect(run.status).to.equal('cancelled');
    expect(invoke.called).to.equal(false);
    expect(artifactUpdate.called).to.equal(false);
  });

  it('does not fail the winning worker when another delivery loses the atomic claim', async () => {
    loseClaim = true;
    await execute();
    expect(run.status).to.equal('running');
    expect(invoke.called).to.equal(false);
  });

  it('ignores late provider completion after recovery starts a newer attempt', async () => {
    invoke.callsFake(async () => { run.attemptCount = 2; run.status = 'running'; return { content: '{}' }; });
    await execute();
    expect(run.status).to.equal('running');
    expect(run.attemptCount).to.equal(2);
    expect(artifactUpdate.called).to.equal(false);
  });

  it('cannot overwrite a newer attempt artifact while encrypting the old result', async () => {
    const encrypt = crypto.encrypt.bind(crypto);
    sinon.stub(crypto, 'encrypt').callsFake(async (brandId, runId, payload: any) => {
      const envelope = await encrypt(brandId, runId, payload);
      if (payload.providerRequest) {
        run.attemptCount = 2; run.status = 'queued'; artifact.ciphertext = 'new-attempt-frozen-input';
      }
      return envelope;
    });
    await execute();
    expect(run.status).to.equal('queued');
    expect(run.attemptCount).to.equal(2);
    expect(artifact.ciphertext).to.equal('new-attempt-frozen-input');
  });
});
