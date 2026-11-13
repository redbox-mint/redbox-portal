import { expect } from 'chai';
import * as sinon from 'sinon';
import { generation } from '../../src/config/generation.config';
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
      if (value && typeof value === 'object') {
        if ('in' in value) return value.in.includes(row[key]);
        if ('<=' in value) return row[key] <= value['<='];
        if ('>=' in value) return row[key] >= value['>='];
      }
      return row[key] === value;
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
        const row = { id: 'run-1', ...structuredClone(values) };
        rows.push(row);
        return structuredClone(row);
      } }),
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

  for (const status of ['queued', 'running', 'validating', 'cancelRequested']) {
    it(`settles an expired ${status} run whose worker was lost`, async () => {
      rows.push({ id: 'lost-run', brandId: actor.brandId, status, attemptCount: 1, artifactExpiresAt: past });
      await service.expireAbandonedRuns();
      expect(rows[0].status).to.equal(status === 'cancelRequested' ? 'cancelled' : 'expired');
      expect(rows[0].retryable).to.equal(false);
    });
  }

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
