import { expect } from 'chai';
import * as sinon from 'sinon';
import { generation } from '../../src/config/generation.config';
import { Services as BindingServices } from '../../src/services/GenerationBindingService';
import { Services as RunServices } from '../../src/services/GenerationRunService';
import { Services as PersistenceServices } from '../../src/services/GenerationPersistenceService';

const actor = {
  brandId: 'brand-a', branding: 'default', portal: 'rdmp', userId: 'user-a', username: 'researcher', roles: ['Researcher'],
};
const past = '2020-01-01T00:00:00.000Z';
const future = '2099-01-01T00:00:00.000Z';

describe('Generation run lifecycle', () => {
  const globalNames = ['sails', 'GenerationRun', 'GenerationRunArtifact', 'GenerationProfileVersion', 'GenerationBinding', 'User', 'BrandingService'];
  let originals: Map<string, unknown>;
  let rows: Array<Record<string, any>>;
  let artifacts: Array<Record<string, any>>;
  let binding: Record<string, any>;
  let service: RunServices.GenerationRunService;
  let buildTargetUrl: sinon.SinonStub;
  let beforeUpdate: (() => void) | undefined;

  function matches(row: Record<string, any>, criteria: Record<string, any>): boolean {
    return Object.entries(criteria).every(([key, value]) => {
      if (key === 'or') return value.some((branch: Record<string, any>) => matches(row, branch));
      if (value && typeof value === 'object') {
        if ('in' in value) return value.in.includes(row[key]);
        if ('<=' in value) return row[key] <= value['<='];
        if ('>=' in value) return row[key] >= value['>='];
      }
      return value === null ? row[key] == null : row[key] === value;
    });
  }

  beforeEach(() => {
    originals = new Map(globalNames.map(name => [name, Reflect.get(globalThis, name)]));
    rows = [];
    artifacts = [];
    beforeUpdate = undefined;
    binding = {
      id: 'binding-1', brandId: actor.brandId, key: 'create-summary', targetRecordType: 'projectSummary',
      targetStartingWorkflowStage: 'draft', enabled: true, allowedRoles: ['Researcher'],
    };
    const profile = {
      id: 'profile-1', brandId: actor.brandId,
      definition: {
        modelDeploymentId: 'deployment-1', knowledgeCollectionVersionIds: [], questions: [], sourceSlots: [],
        documentSources: { formats: ['txt'], maxFiles: 1, maxFileBytes: 1000, maxTextBytes: 1000 },
      },
    };
    const logger = Object.fromEntries(['crit', 'error', 'warn', 'debug', 'info', 'verbose', 'silly', 'blank', 'trace', 'log', 'fatal', 'silent']
      .map(name => [name, sinon.stub()]));
    const config = structuredClone(generation);
    const payloads = new Map<string, unknown>();
    let ciphertext = 0;
    buildTargetUrl = sinon.stub().callsFake((target, _actor, runId) => `/target?formName=${target.targetFormName}&generationRunId=${runId}`);
    Reflect.set(globalThis, 'sails', {
      config: {
        generation: config,
        workflow: { projectSummary: { draft: { starting: true, config: { form: 'summary-1.0-draft', workflow: { stage: 'draft' }, authorization: { editRoles: ['Researcher'] } } } } },
        log: { createNamespaceLogger: () => logger, customLogger: logger },
      },
      log: logger,
      services: {
        generationbindingservice: {
          authorizeLaunch: sinon.stub().callsFake(async () => ({ binding, profileVersion: profile })),
          buildTargetUrl,
          buildCompletionValues: sinon.stub().returns([]),
        },
        generationcontextservice: {
          buildQuestionDefaults: sinon.stub().returns([]),
          prepare: sinon.stub().resolves({ sources: [], baseTargetDigest: 'base-target' }),
        },
        generationcryptoservice: {
          encrypt: async (_brand: string, _run: string, payload: unknown) => {
            const key = String(++ciphertext);
            payloads.set(key, structuredClone(payload));
            return { payloadVersion: 1, encryptionKeyId: 'test', iv: 'iv', authTag: 'tag', ciphertext: key };
          },
          decrypt: async (_brand: string, _run: string, envelope: { ciphertext: string }) => structuredClone(payloads.get(envelope.ciphertext)),
        },
        generationpersistenceservice: new PersistenceServices.GenerationPersistenceService(),
        agendaqueueservice: { now: sinon.stub().resolves({ attrs: { id: 'job-1' } }) },
      },
    });
    Reflect.set(globalThis, 'GenerationRun', {
      create: (values: Record<string, unknown>) => ({ fetch: async () => {
        const row = { id: `run-${rows.length + 1}`, createdAt: new Date().toISOString(), admissionPending: false, ...structuredClone(values) };
        rows.push(row);
        return structuredClone(row);
      } }),
      destroyOne: async (criteria: Record<string, unknown>) => {
        const index = rows.findIndex(row => matches(row, criteria));
        return index < 0 ? null : rows.splice(index, 1)[0];
      },
      count: async (criteria: Record<string, unknown>) => rows.filter(row => matches(row, criteria)).length,
      findOne: async (criteria: Record<string, unknown>) => structuredClone(rows.find(row => matches(row, criteria)) ?? null),
      find: async (criteria: Record<string, unknown>) => structuredClone(rows.filter(row => matches(row, criteria))),
      updateOne: (criteria: Record<string, unknown>) => ({ set: async (values: Record<string, unknown>) => {
        beforeUpdate?.();
        const row = rows.find(candidate => matches(candidate, criteria));
        if (!row) return null;
        Object.assign(row, structuredClone(values));
        return structuredClone(row);
      } }),
    });
    Reflect.set(globalThis, 'GenerationRunArtifact', {
      create: (values: Record<string, unknown>) => ({ fetch: async () => {
        const artifact = { id: 'artifact-1', ...structuredClone(values) };
        artifacts.push(artifact);
        return structuredClone(artifact);
      } }),
      destroyOne: async (criteria: Record<string, unknown>) => {
        const index = artifacts.findIndex(row => matches(row, criteria));
        return index < 0 ? null : artifacts.splice(index, 1)[0];
      },
      findOne: async (criteria: Record<string, unknown>) => structuredClone(artifacts.find(row => matches(row, criteria)) ?? null),
      updateOne: (criteria: Record<string, unknown>) => ({ set: async (values: Record<string, unknown>) => {
        const artifact = artifacts.find(row => matches(row, criteria));
        if (!artifact) return null;
        Object.assign(artifact, structuredClone(values));
        return structuredClone(artifact);
      } }),
    });
    Reflect.set(globalThis, 'GenerationProfileVersion', { findOne: sinon.stub().resolves(profile) });
    Reflect.set(globalThis, 'GenerationBinding', { findOne: sinon.stub().callsFake(async () => binding) });
    Reflect.set(globalThis, 'User', { findOne: () => ({ populate: async () => ({ id: actor.userId, roles: [{ name: 'Researcher' }] }) }) });
    Reflect.set(globalThis, 'BrandingService', { getBrandById: () => ({ id: actor.brandId }) });
    service = new RunServices.GenerationRunService();
  });

  afterEach(() => {
    sinon.restore();
    for (const [name, value] of originals) {
      if (value === undefined) Reflect.deleteProperty(globalThis, name);
      else Reflect.set(globalThis, name, value);
    }
  });

  for (const failure of ['defaults', 'encryption', 'artifact', 'target-url']) {
    it(`reclaims draft quota and artifacts after repeated launch ${failure} failures`, async () => {
      const runtime = Reflect.get(globalThis, 'sails');
      runtime.config.generation.limits.perUserConcurrentRuns = 1;
      runtime.config.generation.limits.perUserDailyRuns = 1;
      const holder = failure === 'defaults' ? runtime.services.generationcontextservice
        : failure === 'encryption' ? runtime.services.generationcryptoservice
        : failure === 'artifact' ? Reflect.get(globalThis, 'GenerationRunArtifact')
        : runtime.services.generationbindingservice;
      const method = failure === 'defaults' ? 'buildQuestionDefaults' : failure === 'encryption' ? 'encrypt'
        : failure === 'artifact' ? 'create' : 'buildTargetUrl';
      const original = holder[method];
      const fault = new Error(`injected ${failure} failure`);
      holder[method] = failure === 'artifact' ? () => ({ fetch: async () => { throw fault; } })
        : failure === 'encryption' ? async () => { throw fault; } : () => { throw fault; };
      for (let index = 0; index < 2; index++) {
        let rejection: unknown;
        try { await service.launch({ actor, brand: {} as any, user: {} as any, bindingKey: binding.key }); }
        catch (error) { rejection = error; }
        expect(rejection).to.equal(fault);
        expect(rows).to.have.length(0);
        expect(artifacts).to.have.length(0);
      }
      holder[method] = original;
      expect(await service.launch({ actor, brand: {} as any, user: {} as any, bindingKey: binding.key })).to.have.property('runId');
      expect(rows).to.have.length(1);
      expect(artifacts).to.have.length(1);
    });
  }

  it('does not delete a run or its artifact after a concurrent request advances the draft', async () => {
    const runtime = Reflect.get(globalThis, 'sails');
    runtime.services.generationbindingservice.buildTargetUrl = () => {
      rows[0].status = 'queued'; rows[0].attemptCount = 1;
      throw new Error('late failed launch');
    };
    let rejection: unknown;
    try { await service.launch({ actor, brand: {} as any, user: {} as any, bindingKey: binding.key }); }
    catch (error) { rejection = error; }
    expect(rejection).to.be.instanceOf(Error);
    expect(rows[0]).to.include({ status: 'queued', attemptCount: 1 });
    expect(artifacts).to.have.length(1);
  });

  async function installSourceBinding(sourceModes: Array<'view' | 'edit'>, canEdit: boolean) {
    const runtime = Reflect.get(globalThis, 'sails');
    runtime.config.generation.enabled = true;
    Object.assign(binding, {
      profileId: 'profile-1', sourceRecordType: 'activity', sourceModes,
      sourceRelationship: { sourceSlotId: 'activity', metadataPointer: '/activity' }, action: {},
    });
    const profile = await GenerationProfileVersion.findOne({ id: 'profile-1' });
    profile!.definition.sourceSlots = [{ id: 'activity', recordType: 'activity', allowedPaths: ['/summary'], maxBytes: 1024 }];
    Reflect.set(globalThis, 'GenerationProfileVersion', { findOne: sinon.stub().resolves(profile) });
    Reflect.set(globalThis, 'GenerationBinding', {
      find: sinon.stub().resolves([binding]), findOne: sinon.stub().resolves(binding),
    });
    const records = {
      getMeta: sinon.stub().callsFake(async oid => ({
        redboxOid: oid, metaMetadata: { brandId: actor.brandId, type: 'activity', form: 'activity-edit' },
        metadata: { summary: 'Current source' }, workflow: { stage: 'draft' },
      })),
      hasViewAccess: sinon.stub().returns(true), hasEditAccess: sinon.stub().returns(canEdit),
    };
    runtime.services.recordsservice = records;
    runtime.services.generationprofileservice = { resolvePublished: sinon.stub().resolves(profile) };
    const bindings = new BindingServices.GenerationBindingService();
    runtime.services.generationbindingservice = bindings;
    return { bindings, records, user: { id: actor.userId, roles: [{ name: 'Researcher' }] } as any };
  }

  for (const sourceModes of [['view'], ['view', 'edit'], ['edit']] as Array<Array<'view' | 'edit'>>) {
    it(`launches and reselects a source through real bindings restricted to ${sourceModes.join('/')}`, async () => {
      const { bindings, records, user } = await installSourceBinding(sourceModes, sourceModes.length === 1 && sourceModes[0] === 'edit');
      const mode = sourceModes.includes('view') ? 'view' : 'edit';
      const actions = await bindings.resolveActions({
        actor, brand: {} as any, user, record: await records.getMeta('activity-1'), mode,
      });
      expect(actions).to.have.length(1);
      const launched = await service.launch({ actor, brand: {} as any, user, bindingKey: actions[0].bindingKey, sourceOid: actions[0].sourceOid });
      const result = await service.execute({
        actor, brand: {} as any, user, runId: launched.runId, sourceOid: 'activity-2', answers: [],
        targetForm: { recordType: 'projectSummary', formName: 'summary-1.0-draft', mode: 'create' }, targetDraft: {},
      });
      expect(result.status).to.equal('queued');
      expect(rows[0].sourceRefs[0].oid).to.equal('activity-2');
    });
  }

  it('denies edit-only source bindings to a caller without current edit access', async () => {
    const { user } = await installSourceBinding(['edit'], false);
    let rejection: unknown;
    try { await service.launch({ actor, brand: {} as any, user, bindingKey: binding.key, sourceOid: 'activity-1' }); }
    catch (error) { rejection = error; }
    expect(rejection).to.have.property('code', 'GENERATION_SOURCE_FORBIDDEN');
    expect(rows).to.have.length(0);
  });

  it('rechecks edit-only source access before executing an already launched run', async () => {
    const { records, user } = await installSourceBinding(['edit'], true);
    const launched = await service.launch({ actor, brand: {} as any, user, bindingKey: binding.key, sourceOid: 'activity-1' });
    records.hasEditAccess.returns(false);
    let rejection: unknown;
    try {
      await service.execute({ actor, brand: {} as any, user, runId: launched.runId, answers: [],
        targetForm: { recordType: 'projectSummary', formName: 'summary-1.0-draft', mode: 'create' }, targetDraft: {} });
    } catch (error) { rejection = error; }
    expect(rejection).to.have.property('code', 'GENERATION_SOURCE_FORBIDDEN');
    expect(rows[0].status).to.equal('draft');
  });

  it('does not allow an explicit edit mode to bypass source edit permission', async () => {
    const { bindings, user } = await installSourceBinding(['view', 'edit'], false);
    let rejection: unknown;
    try { await bindings.authorizeLaunch({ actor, brand: {} as any, user, bindingKey: binding.key, sourceOid: 'activity-1', mode: 'edit' }); }
    catch (error) { rejection = error; }
    expect(rejection).to.have.property('code', 'GENERATION_SOURCE_FORBIDDEN');
  });

  it('pins the starting workflow form for an omitted binding form and executes the resolved client target', async () => {
    await service.launch({ actor, brand: {} as any, user: {} as any, bindingKey: binding.key });
    expect(rows[0].targetDescriptor.formName).to.equal('summary-1.0-draft');
    expect(buildTargetUrl.firstCall.args[0].targetFormName).to.equal('summary-1.0-draft');
    const result = await service.execute({
      actor, brand: {} as any, user: {} as any, runId: 'run-1', answers: [],
      targetForm: { recordType: 'projectSummary', formName: 'summary-1.0-draft', mode: 'create' }, targetDraft: {},
    });
    expect(result.status).to.equal('queued');
  });

  it('keeps an explicitly configured target form pinned', async () => {
    binding.targetFormName = 'summary-special';
    await service.launch({ actor, brand: {} as any, user: {} as any, bindingKey: binding.key });
    expect(rows[0].targetDescriptor.formName).to.equal('summary-special');
    expect(buildTargetUrl.firstCall.args[0].targetFormName).to.equal('summary-special');
  });

  for (const limit of ['perUserConcurrentRuns', 'perBrandConcurrentRuns', 'perUserDailyRuns', 'perBrandDailyRuns']) {
    it(`does not admit simultaneous launches above ${limit}`, async () => {
      Reflect.get(globalThis, 'sails').config.generation.limits[limit] = 1;
      const results = await Promise.allSettled([1, 2].map(() => service.launch({
        actor, brand: {} as any, user: {} as any, bindingKey: binding.key,
      })));
      expect(results.filter(result => result.status === 'fulfilled').length).to.be.at.most(1);
      expect(rows.length).to.be.at.most(1);
    });
  }

  it('does not queue a failed retry when another run fills the concurrent quota', async () => {
    const runtime = Reflect.get(globalThis, 'sails');
    runtime.config.generation.limits.perUserConcurrentRuns = 1;
    await service.launch({ actor, brand: {} as any, user: {} as any, bindingKey: binding.key });
    Object.assign(rows[0], { status: 'failed', attemptCount: 1, retryable: true });
    await service.launch({ actor, brand: {} as any, user: {} as any, bindingKey: binding.key });
    let rejection: unknown;
    try {
      await service.execute({
        actor, brand: {} as any, user: {} as any, runId: 'run-1', answers: [],
        targetForm: { recordType: 'projectSummary', formName: 'summary-1.0-draft', mode: 'create' }, targetDraft: {},
      });
    } catch (error) { rejection = error; }
    expect(rejection).to.have.property('code', 'GENERATION_RATE_LIMITED');
    expect(runtime.services.agendaqueueservice.now.called).to.equal(false);
    expect(runtime.services.generationcontextservice.prepare.called).to.equal(false);
    expect(rows[0].admissionPending).to.equal(false);
    expect(rows[0].status).to.equal('failed');
  });

  for (const limit of ['perUserConcurrentRuns', 'perBrandConcurrentRuns']) {
    it(`does not admit simultaneous failed retries above ${limit}`, async () => {
      const runtime = Reflect.get(globalThis, 'sails');
      for (let index = 0; index < 2; index++) {
        await service.launch({ actor, brand: {} as any, user: {} as any, bindingKey: binding.key });
        Object.assign(rows[index], { status: 'failed', attemptCount: 1, retryable: true });
      }
      runtime.config.generation.limits[limit] = 1;
      await Promise.allSettled(rows.map(row => service.execute({
        actor, brand: {} as any, user: {} as any, runId: row.id, answers: [],
        targetForm: { recordType: 'projectSummary', formName: 'summary-1.0-draft', mode: 'create' }, targetDraft: {},
      })));
      expect(rows.filter(row => row.status === 'queued').length).to.be.at.most(1);
      expect(runtime.services.agendaqueueservice.now.callCount).to.be.at.most(1);
      expect(rows.every(row => row.admissionPending === false)).to.equal(true);
    });
  }

  it('does not charge a retry as a new daily creation intent', async () => {
    const runtime = Reflect.get(globalThis, 'sails');
    runtime.config.generation.limits.perUserDailyRuns = 1;
    runtime.config.generation.limits.perBrandDailyRuns = 1;
    await service.launch({ actor, brand: {} as any, user: {} as any, bindingKey: binding.key });
    Object.assign(rows[0], { status: 'failed', attemptCount: 1, retryable: true });
    const result = await service.execute({
      actor, brand: {} as any, user: {} as any, runId: 'run-1', answers: [],
      targetForm: { recordType: 'projectSummary', formName: 'summary-1.0-draft', mode: 'create' }, targetDraft: {},
    });
    expect(result.status).to.equal('queued');
    expect(rows.length).to.equal(1);
  });

  it("does not clear another request's pending retry admission", async () => {
    const runtime = Reflect.get(globalThis, 'sails');
    await service.launch({ actor, brand: {} as any, user: {} as any, bindingKey: binding.key });
    Object.assign(rows[0], { status: 'failed', attemptCount: 1, retryable: true });
    let prepared!: () => void;
    let release!: () => void;
    const reachedPreparation = new Promise<void>(resolve => { prepared = resolve; });
    const continuePreparation = new Promise<void>(resolve => { release = resolve; });
    runtime.services.generationcontextservice.prepare.callsFake(async () => {
      prepared(); await continuePreparation;
      return { sources: [], baseTargetDigest: 'base-target' };
    });
    const input = {
      actor, brand: {} as any, user: {} as any, runId: 'run-1', answers: [],
      targetForm: { recordType: 'projectSummary', formName: 'summary-1.0-draft', mode: 'create' as const }, targetDraft: {},
    };
    const winner = service.execute(input);
    await reachedPreparation;
    let rejection: unknown;
    try { await service.execute(input); } catch (error) { rejection = error; }
    expect(rejection).to.have.property('code', 'GENERATION_INVALID_STATE');
    expect(rows[0].admissionPending).to.equal(true);
    release();
    expect((await winner).status).to.equal('queued');
    expect(rows[0].admissionPending).to.equal(false);
    expect(runtime.services.agendaqueueservice.now.callCount).to.equal(1);
  });

  it('holds concurrent capacity until requested cancellation is acknowledged', async () => {
    Reflect.get(globalThis, 'sails').config.generation.limits.perUserConcurrentRuns = 1;
    const launch = () => service.launch({ actor, brand: {} as any, user: {} as any, bindingKey: binding.key });
    await launch();
    rows[0].status = 'cancelRequested';
    let rejection: unknown;
    try { await launch(); } catch (error) { rejection = error; }
    expect(rejection).to.have.property('code', 'GENERATION_RATE_LIMITED');
    expect(rows.length).to.equal(1);
    rows[0].status = 'cancelled';
    expect(await launch()).to.have.property('runId');
    expect(rows.filter(row => row.status === 'draft').length).to.equal(1);
  });

  for (const maxRetries of [0, 1]) {
    it(`stops advertising retries after the final allowed attempt with maxRetries=${maxRetries}`, async () => {
      const runtime = Reflect.get(globalThis, 'sails');
      runtime.config.generation.provider.maxRetries = maxRetries;
      runtime.services.agendaqueueservice.now.rejects(new Error('queue unavailable'));
      await service.launch({ actor, brand: {} as any, user: {} as any, bindingKey: binding.key });
      const input = {
        actor, brand: {} as any, user: {} as any, runId: 'run-1', answers: [],
        targetForm: { recordType: 'projectSummary', formName: 'summary-1.0-draft', mode: 'create' as const }, targetDraft: {},
      };
      for (let attempt = 1; attempt <= maxRetries + 1; attempt++) {
        const result = await service.execute(input);
        expect(result.status).to.equal('failed');
        expect(result.attemptCount).to.equal(attempt);
        expect(result.retryable).to.equal(attempt <= maxRetries);
        expect(result.error?.retryable).to.equal(attempt <= maxRetries);
      }
      // The stored error remains transient, but this creation intent has no attempts left.
      expect(rows[0].retryable).to.equal(true);
      const polled = await service.getForActor(actor, 'run-1');
      expect(polled.retryable).to.equal(false);
      expect(polled.error?.retryable).to.equal(false);
      let rejection: unknown;
      try { await service.execute(input); } catch (error) { rejection = error; }
      expect(rejection).to.have.property('code', 'GENERATION_INVALID_STATE');
      expect(runtime.services.agendaqueueservice.now.callCount).to.equal(maxRetries + 1);
    });
  }

  for (const status of ['queued', 'running', 'validating', 'cancelRequested']) {
    it(`settles an expired ${status} run whose worker was lost`, async () => {
      rows.push({ id: 'lost-run', brandId: actor.brandId, status, attemptCount: 1, artifactExpiresAt: past });
      await service.expireAbandonedRuns();
      expect(rows[0].status).to.equal(status === 'cancelRequested' ? 'cancelled' : 'expired');
      expect(rows[0].retryable).to.equal(false);
    });
  }

  for (const commitLeaseExpiresAt of [undefined, past]) {
    it(`expires abandoned commits with ${commitLeaseExpiresAt ? 'expired' : 'missing'} leases after the artifact deadline`, async () => {
      rows.push({ id: 'commit-run', brandId: actor.brandId, status: 'committing', attemptCount: 1,
        artifactExpiresAt: past, commitToken: 'old-commit', commitLeaseExpiresAt });
      await service.expireAbandonedRuns();
      expect(rows[0]).to.include({ status: 'expired', retryable: false });
    });
  }

  it('keeps an abandoned commit recoverable before the artifact deadline', async () => {
    rows.push({ id: 'commit-run', brandId: actor.brandId, status: 'committing', attemptCount: 1,
      artifactExpiresAt: future, commitToken: 'old-commit', commitLeaseExpiresAt: past });
    await service.expireAbandonedRuns();
    expect(rows[0].status).to.equal('committing');
  });

  it('preserves a live commit lease after its artifact deadline', async () => {
    rows.push({ id: 'commit-run', brandId: actor.brandId, status: 'committing', attemptCount: 1,
      artifactExpiresAt: past, commitToken: 'live-commit', commitLeaseExpiresAt: future });
    await service.expireAbandonedRuns();
    expect(rows[0].status).to.equal('committing');
  });

  for (const change of ['token', 'lease', 'attempt', 'artifact', 'finalizing']) {
    it(`does not expire a commit after its ${change} changes concurrently`, async () => {
      rows.push({ id: 'commit-run', brandId: actor.brandId, status: 'committing', attemptCount: 1,
        artifactExpiresAt: past, commitToken: 'old-commit', commitLeaseExpiresAt: past });
      beforeUpdate = () => {
        if (change === 'token') rows[0].commitToken = 'replacement-commit';
        if (change === 'lease') rows[0].commitLeaseExpiresAt = future;
        if (change === 'attempt') rows[0].attemptCount = 2;
        if (change === 'artifact') rows[0].artifactExpiresAt = future;
        if (change === 'finalizing' && rows[0].status === 'completed') {
          rows[0].status = 'committing'; rows[0].commitToken = 'replacement-commit';
        }
      };
      await service.expireAbandonedRuns();
      expect(rows[0].status).to.equal('committing');
    });
  }

  it('clears a crashed retry admission when its failed run expires', async () => {
    rows.push({ id: 'pending-run', brandId: actor.brandId, status: 'failed', attemptCount: 1,
      artifactExpiresAt: past, admissionPending: true });
    await service.expireAbandonedRuns();
    expect(rows[0]).to.include({ status: 'expired', admissionPending: false });
  });

  it('preserves live work even when its last heartbeat is older than the queue lock', async () => {
    for (const status of ['queued', 'running', 'validating', 'cancelRequested']) {
      rows.push({ id: `live-${status}`, brandId: actor.brandId, status, attemptCount: 1, artifactExpiresAt: future, lastHeartbeatAt: past });
    }
    await service.expireAbandonedRuns();
    expect(rows.map(row => row.status)).to.deep.equal(['queued', 'running', 'validating', 'cancelRequested']);
  });

  it('does not expire a replacement attempt that wins after cleanup reads its snapshot', async () => {
    rows.push({ id: 'lost-run', brandId: actor.brandId, status: 'running', attemptCount: 1, artifactExpiresAt: past });
    beforeUpdate = () => { rows[0].attemptCount = 2; rows[0].artifactExpiresAt = future; };
    await service.expireAbandonedRuns();
    expect(rows[0]).to.include({ status: 'running', attemptCount: 2, artifactExpiresAt: future });
  });

  it('rechecks artifact expiry atomically before settling an observed expired run', async () => {
    rows.push({ id: 'lost-run', brandId: actor.brandId, status: 'running', attemptCount: 1, artifactExpiresAt: past });
    beforeUpdate = () => { rows[0].artifactExpiresAt = future; };
    await service.expireAbandonedRuns();
    expect(rows[0]).to.include({ status: 'running', attemptCount: 1, artifactExpiresAt: future });
  });
});
