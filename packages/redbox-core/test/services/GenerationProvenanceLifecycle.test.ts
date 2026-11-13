import { expect } from 'chai';
import * as sinon from 'sinon';
import { Services as ProvenanceServices } from '../../src/services/GenerationProvenanceService';
import { Services as PersistenceServices } from '../../src/services/GenerationPersistenceService';
import { canonicalHash, type GenerationProfileDefinitionV1 } from '../../src/model/generation';
import { Services as SchemaServices } from '../../src/services/GenerationSchemaService';
import type { FormConfigFrame } from '@researchdatabox/sails-ng-common';

// Real service lifecycle over scoped rows, with database failures and interrupted ownership.
describe('Generation provenance commit recovery', () => {
  const names = ['sails', 'GenerationRun', 'GenerationRunArtifact', 'GenerationBinding', 'GenerationProfileVersion',
    'GenerationFieldProvenance', 'User', 'BrandingService'];
  const actor = { brandId: 'brand-1', userId: 'user-1', username: 'researcher', branding: 'default', portal: 'rdmp', roles: ['Editor'] };
  let originals: Map<string, unknown>;
  let run: Record<string, any>;
  let artifact: Record<string, any> | null;
  let rows: Array<Record<string, any>>;
  let payload: Record<string, any>;
  let service: ProvenanceServices.GenerationProvenanceService;
  let savedMetadata: Record<string, unknown>;
  let destroy: sinon.SinonStub;
  let artifactUpdate: sinon.SinonStub;
  let beforeCreate: ((values: Record<string, any>) => Promise<void>) | undefined;
  let beforeFinalise: (() => void) | undefined;
  let beforeRunUpdate: (() => void) | undefined;
  const request = () => ({ targetOid: 'target-1', candidateDigest: run.candidateDigest, reviewedFieldIds: ['title'], appliedFieldIds: ['title', 'description'] });
  const commit = () => service.commit(actor, { roles: [] } as any, {} as any, run.id, request());

  function matches(row: Record<string, any>, criteria: Record<string, any>): boolean {
    return Object.entries(criteria).every(([key, value]) => {
      if (value && typeof value === 'object') {
        if ('in' in value) return value.in.includes(row[key]);
        if ('<=' in value) return row[key] <= value['<='];
      }
      return row[key] === value || (value === null && row[key] === undefined);
    });
  }
  beforeEach(() => {
    originals = new Map(names.map(name => [name, Reflect.get(globalThis, name)]));
    savedMetadata = { title: 'title value', description: 'description value' };
    rows = []; beforeCreate = undefined; beforeFinalise = undefined; beforeRunUpdate = undefined;
    const items = ['title', 'description'].map(fieldId => ({ fieldId, metadataPointer: '/'+fieldId,
      value: fieldId+' value', valueHash: canonicalHash(fieldId+' value'), reviewRequired: true,
      evidence: [], rationale: 'Approved context', groundingState: 'grounded' }));
    payload = { candidate: { runId: 'run-1', items,
      candidateDigest: canonicalHash(items.map(({ fieldId, value, valueHash }) => ({ fieldId, value, valueHash }))) },
      frozenInput: { secretSourceText: 'must be removed' }, documents: [{ text: 'private document text' }] };
    run = { id: 'run-1', brandId: actor.brandId, initiatedByUserId: actor.userId, initiatedByUsername: actor.username,
      bindingId: 'binding-1', profileVersionId: 'profile-1', sourceRefs: [], attemptCount: 1,
      targetDescriptor: { recordType: 'plan' }, status: 'completed', phase: 'population',
      completedAt: '2026-01-01T00:00:00.000Z', candidateDigest: payload.candidate.candidateDigest, diagnosticRetentionDays: 0 };
    artifact = { id: 'artifact-1', brandId: actor.brandId, runId: run.id,
      payloadVersion: 1, encryptionKeyId: 'test', iv: 'iv', authTag: 'tag', ciphertext: 'original',
      expiresAt: '2099-01-01T00:00:00.000Z', contentKinds: ['candidate', 'frozenInput', 'documents'] };
    const logger = Object.fromEntries(['debug', 'info', 'warn', 'error', 'trace', 'fatal', 'verbose', 'silly', 'log'].map(name => [name, sinon.stub()]));
    Reflect.set(globalThis, 'sails', { config: { workflow: { plan: { draft: { starting: true, config: {
      workflow: { stage: 'draft' }, authorization: { editRoles: ['Editor'] },
    } } } }, log: { createNamespaceLogger: () => logger, customLogger: logger } }, log: logger, services: {} });
    Reflect.set(globalThis, 'GenerationRun', {
      findOne: async (criteria: Record<string, any>) => matches(run, criteria) ? structuredClone(run) : null,
      updateOne: (criteria: Record<string, any>) => ({ set: async (changes: Record<string, any>) => {
        beforeRunUpdate?.();
        if (changes.status === 'committed') beforeFinalise?.();
        if (!matches(run, criteria)) return null;
        Object.assign(run, structuredClone(changes)); return structuredClone(run);
      } }),
    });
    destroy = sinon.stub().callsFake(async () => { artifact = null; });
    artifactUpdate = sinon.stub().callsFake((criteria: Record<string, any>) => ({ set: async (changes: Record<string, any>) => {
      if (!artifact || !matches(artifact, criteria)) return null;
      Object.assign(artifact, changes); return structuredClone(artifact);
    } }));
    Reflect.set(globalThis, 'GenerationRunArtifact', {
      findOne: async () => artifact && structuredClone(artifact), destroy, updateOne: artifactUpdate,
    });
    Reflect.set(globalThis, 'GenerationFieldProvenance', {
      count: async () => rows.length,
      find: async (criteria: Record<string, any>) => structuredClone(rows.filter(row => matches(row, criteria))),
      findOne: async (criteria: Record<string, any>) => structuredClone(rows.find(row => matches(row, criteria)) ?? null),
      create: (values: Record<string, any>) => ({ fetch: async () => {
        await beforeCreate?.(values);
        if (rows.some(row => row.profileFieldId === values.profileFieldId)) throw new Error('duplicate');
        const row = { id: String(rows.length+1), ...structuredClone(values) }; rows.push(row); return structuredClone(row);
      } }),
      updateOne: (criteria: Record<string, any>) => ({ set: async (values: Record<string, any>) => {
        const row = rows.find(row => matches(row, criteria)); if (!row) return null;
        Object.assign(row, values); return structuredClone(row);
      } }),
    });
    Reflect.set(globalThis, 'GenerationBinding', { findOne: async () => ({ enabled: true, targetRecordType: 'plan',
      targetStartingWorkflowStage: 'draft', allowedRoles: ['Editor'] }) });
    Reflect.set(globalThis, 'GenerationProfileVersion', { findOne: async () => ({ definition: { documentSources: {}, sourceSlots: [] } }) });
    Reflect.set(globalThis, 'User', { findOne: () => ({ populate: async () => ({ roles: [{ name: 'Editor' }] }) }) });
    Reflect.set(globalThis, 'BrandingService', { getBrandById: () => ({ id: actor.brandId }) });
    sails.services.recordsservice = { getMeta: async () => ({ metadata: savedMetadata,
      metaMetadata: { brandId: actor.brandId, type: 'plan', createdBy: actor.username } }), hasViewAccess: () => true, hasEditAccess: () => true };
    sails.services.generationcryptoservice = {
      decrypt: async () => structuredClone(payload),
      encrypt: async (_brand: string, _run: string, value: any) => {
        payload = structuredClone(value); return { encryptionKeyId: 'test', iv: 'iv2', authTag: 'tag2', ciphertext: 'reduced', payloadVersion: 1 };
      },
    };
    sails.services.generationpersistenceservice = new PersistenceServices.GenerationPersistenceService();
    service = new ProvenanceServices.GenerationProvenanceService();
  });
  afterEach(() => {
    sinon.restore();
    for (const [name, value] of originals) {
      if (value === undefined) Reflect.deleteProperty(globalThis, name); else Reflect.set(globalThis, name, value);
    }
  });
  async function rejectCommit(): Promise<void> {
    let failed = false;
    try { await commit(); } catch { failed = true; }
    expect(failed).to.equal(true);
  }

  it('reloads generated provenance for a flat saved field beneath layout-only tabs', async () => {
    const form: FormConfigFrame = {
      name: 'tabbed', type: 'plan', componentDefinitions: [{
        name: 'mainTab', component: { class: 'TabComponent', config: { tabs: [{
          name: 'details', component: { class: 'TabContentComponent', config: { componentDefinitions: [{
            name: 'summary', model: { class: 'TextAreaModel', config: {} },
            component: { class: 'TextAreaComponent', config: {} },
          }] } },
        }] } },
      }],
    };
    const definition: GenerationProfileDefinitionV1 = {
      purpose: 'Summary', systemInstructions: 'Use reviewed context', sourceSlots: [], questions: [],
      knowledgeCollectionVersionIds: [], modelDeploymentId: 'deployment-1',
      contextLimits: { totalBytes: 4096, maxKnowledgeChunks: 0, maxChunkBytes: 1024 },
      targetFields: [{ id: 'summary', metadataPointer: '/summary', expectedComponentClasses: ['TextAreaComponent'],
        output: { kind: 'string', maxLength: 200 }, operation: 'fill', grounding: 'inferenceAllowed' }],
    };
    const targets = new SchemaServices.GenerationSchemaService().validateTargets(definition, form);
    expect(targets.get('/summary')?.metadataPointer).to.equal('/summary');
    const item = { ...payload.candidate.items[0], fieldId: 'summary', metadataPointer: '/summary', value: 'Generated summary',
      valueHash: canonicalHash('Generated summary') };
    payload.candidate.items = [item];
    payload.candidate.candidateDigest = canonicalHash([{ fieldId: item.fieldId, value: item.value, valueHash: item.valueHash }]);
    run.candidateDigest = payload.candidate.candidateDigest; savedMetadata = { summary: item.value };
    await service.commit(actor, { roles: [] } as any, {} as any, run.id,
      { ...request(), appliedFieldIds: ['summary'], reviewedFieldIds: ['summary'] });
    const reloaded = await service.getForRecord(actor, { roles: [] } as any, {} as any, 'target-1');
    expect(reloaded.fields).to.have.length(1);
    expect(reloaded.fields[0]).to.include({ metadataPointer: '/summary', displayState: 'generated', reviewRequired: false });
  });
  it('persists only applied fields and preserves the original candidate receipt on reload', async () => {
    savedMetadata.description = 'Preexisting researcher text';
    const receipt = { ...request(), appliedFieldIds: ['title'] };
    const result = await service.commit(actor, { roles: [] } as any, {} as any, run.id, receipt);
    expect(result.provenanceCount).to.equal(1); expect(rows).to.have.length(1);
    expect(rows[0].profileFieldId).to.equal('title');
    expect(rows[0].candidateDigest).to.equal(payload.candidate.candidateDigest);
    expect(run.candidateDigest).to.equal(payload.candidate.candidateDigest);
    const reloaded = await service.getForRecord(actor, { roles: [] } as any, {} as any, 'target-1');
    expect(reloaded.fields.map(field => field.profileFieldId)).to.deep.equal(['title']);
    expect(reloaded.fields[0].displayState).to.equal('generated');
  });
  it('retains edited provenance for a field applied and then changed by the researcher', async () => {
    savedMetadata.title = 'Researcher edited generated draft';
    await service.commit(actor, { roles: [] } as any, {} as any, run.id, { ...request(), appliedFieldIds: ['title'] });
    const reloaded = await service.getForRecord(actor, { roles: [] } as any, {} as any, 'target-1');
    expect(reloaded.fields).to.have.length(1); expect(reloaded.fields[0].displayState).to.equal('edited');
  });
  it('rejects review acknowledgements for skipped candidate fields', async () => {
    let failed = false;
    try { await service.commit(actor, { roles: [] } as any, {} as any, run.id,
      { ...request(), appliedFieldIds: ['title'], reviewedFieldIds: ['description'] }); }
    catch { failed = true; }
    expect(failed).to.equal(true); expect(rows).to.have.length(0);
  });
  for (const appliedFieldIds of [undefined, ['unknown'], ['title', 'title']]) {
    it(`rejects an invalid applied-field receipt ${JSON.stringify(appliedFieldIds)}`, async () => {
      let failed = false;
      try { await service.commit(actor, { roles: [] } as any, {} as any, run.id, { ...request(), appliedFieldIds } as any); }
      catch { failed = true; }
      expect(failed).to.equal(true); expect(rows).to.have.length(0);
    });
  }
  it('rejects a changed applied subset for an already committed receipt', async () => {
    await service.commit(actor, { roles: [] } as any, {} as any, run.id, { ...request(), appliedFieldIds: ['title'] });
    await rejectCommit(); expect(rows).to.have.length(1);
  });
  it('rejects a changed applied subset when retrying a partial commit', async () => {
    let writes = 0;
    beforeCreate = async () => { if (++writes === 2) throw new Error('second write failed'); };
    await rejectCommit(); beforeCreate = undefined;
    let failed = false;
    try { await service.commit(actor, { roles: [] } as any, {} as any, run.id, { ...request(), appliedFieldIds: ['title'] }); }
    catch { failed = true; }
    expect(failed).to.equal(true); expect(rows).to.have.length(1);
    await commit(); expect(rows).to.have.length(2);
  });
  it('pins the target before the first provenance write', async () => {
    beforeCreate = async () => { expect(run.targetDescriptor.targetOid).to.equal('target-1'); };
    await commit(); expect(run.status).to.equal('committed'); expect(rows).to.have.length(2);
  });
  it('resumes an interrupted partial commit after its ownership deadline', async () => {
    run.status = 'committing'; run.targetDescriptor.targetOid = 'target-1';
    run.commitToken = 'dead-process'; run.commitLeaseExpiresAt = '2020-01-01T00:00:00.000Z';
    run.commitStartedAt = '2026-01-02T00:00:00.000Z'; run.commitReviewedFieldIds = ['title'];
    rows.push({ id: '1', brandId: actor.brandId, runId: run.id, profileFieldId: 'title',
      targetRecordOid: 'target-1', candidateDigest: run.candidateDigest, reviewRequired: false, reviewedBy: 'later-human' });
    await commit();
    expect(run.status).to.equal('committed'); expect(rows).to.have.length(2);
    expect(rows[0].reviewedBy).to.equal('later-human');
  });
  it('recovers a committing row with no ownership fields', async () => {
    run.status = 'committing'; run.targetDescriptor.targetOid = 'target-1';
    await commit(); expect(run.status).to.equal('committed'); expect(rows).to.have.length(2);
  });
  it('does not steal a lease renewed after the initial read', async () => {
    run.status = 'committing'; run.targetDescriptor.targetOid = 'target-1';
    run.commitToken = 'live-process'; run.commitLeaseExpiresAt = '2020-01-01T00:00:00.000Z';
    beforeRunUpdate = () => {
      beforeRunUpdate = undefined; run.commitLeaseExpiresAt = '2099-01-01T00:00:00.000Z';
    };
    await rejectCommit(); expect(run.commitToken).to.equal('live-process');
    expect(run.commitLeaseExpiresAt).to.equal('2099-01-01T00:00:00.000Z'); expect(rows).to.have.length(0);
  });
  it('rejects a different target after partial commit even after the lease expires', async () => {
    run.status = 'committing'; run.targetDescriptor.targetOid = 'another-target';
    run.commitToken = 'dead-process'; run.commitLeaseExpiresAt = '2020-01-01T00:00:00.000Z';
    await rejectCommit(); expect(rows).to.have.length(0);
  });
  it('does not steal an unexpired commit lease', async () => {
    run.status = 'committing'; run.targetDescriptor.targetOid = 'target-1';
    run.commitToken = 'live-process'; run.commitLeaseExpiresAt = '2099-01-01T00:00:00.000Z';
    await rejectCommit(); expect(run.commitToken).to.equal('live-process'); expect(rows).to.have.length(0);
  });
  it('cannot finalize or roll back a commit owned by a replacement process', async () => {
    beforeFinalise = () => { run.commitToken = 'replacement'; run.commitLeaseExpiresAt = '2099-01-01T00:00:00.000Z'; };
    await rejectCommit(); expect(run.status).to.equal('committing'); expect(run.commitToken).to.equal('replacement');
  });
  it('keeps the target pinned when a caught partial write is retried', async () => {
    let writes = 0;
    beforeCreate = async () => { if (++writes === 2) throw new Error('second write failed'); };
    await rejectCommit();
    expect(run.status).to.equal('completed'); expect(rows).to.have.length(1);
    expect(run.targetDescriptor.targetOid).to.equal('target-1');
    let rejected = false;
    try { await service.commit(actor, { roles: [] } as any, {} as any, run.id, { ...request(), targetOid: 'another-target' }); }
    catch { rejected = true; }
    expect(rejected).to.equal(true);
    beforeCreate = undefined;
    await commit(); expect(rows).to.have.length(2); expect(run.status).to.equal('committed');
  });
  it('tolerates a unique-row race without overwriting a human review or the new owner', async () => {
    beforeCreate = async values => {
      beforeCreate = undefined;
      rows.push({ id: '1', ...structuredClone(values), reviewedBy: 'later-human', reviewRequired: false });
      run.commitToken = 'replacement'; run.commitLeaseExpiresAt = '2099-01-01T00:00:00.000Z';
    };
    await rejectCommit();
    expect(rows).to.have.length(1); expect(rows[0].reviewedBy).to.equal('later-human');
    expect(run.status).to.equal('committing'); expect(run.commitToken).to.equal('replacement');
  });
  it('retries zero-retention deletion after a committed transition', async () => {
    destroy.onFirstCall().rejects(new Error('temporary database failure'));
    await rejectCommit(); expect(run.status).to.equal('committed'); expect(artifact).not.to.equal(null);
    await commit(); expect(artifact).to.equal(null); expect(rows).to.have.length(2);
    await commit(); expect(rows).to.have.length(2);
  });
  it('retries diagnostic reduction without extending its fixed retention deadline', async () => {
    run.diagnosticRetentionDays = 2;
    artifactUpdate.onFirstCall().returns({ set: async () => { throw new Error('temporary database failure'); } });
    await rejectCommit(); expect(run.status).to.equal('committed');
    const deadline = new Date(Date.parse(run.committedAt) + 2*86_400_000).toISOString();
    await commit(); expect(artifact?.contentKinds).to.deep.equal(['candidate']); expect(artifact?.expiresAt).to.equal(deadline);
    expect(payload).to.have.keys(['candidate']);
    await commit(); expect(artifact?.expiresAt).to.equal(deadline);
  });
});
