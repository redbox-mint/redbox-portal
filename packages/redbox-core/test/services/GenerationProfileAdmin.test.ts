import { strict as assert } from 'node:assert';
import * as sinon from 'sinon';
import { generation } from '../../src/config/generation.config';
import { Services } from '../../src/services/GenerationProfileAdminService';
import { profileQuestionContract, launchedQuestionContract } from '../../../../angular/projects/researchdatabox/form/src/app/generation/generation-question-contract.fixture';
import { Services as Runs } from '../../src/services/GenerationRunService';
import { Services as Profiles } from '../../src/services/GenerationProfileService';
import { Services as Schemas } from '../../src/services/GenerationSchemaService';
import { Services as Prompts } from '../../src/services/GenerationPromptService';
import { FakeGenerationProvider } from '../../src/services/generation/providers/FakeGenerationProvider';
import { Services as Context } from '../../src/services/GenerationContextService';
import { Services as Models } from '../../src/services/GenerationModelService';
import { GenerationError, canonicalHash } from '../../src/model/generation';
import { profileFormFields } from '../../src/services/generation/profile-admin-fields';
import type { ProfileOverview, GenerationProfileDefinition } from '@researchdatabox/sails-ng-common';
import { createMockSails } from './testHelper';
const definition = (): GenerationProfileDefinition => ({ purpose: 'Draft a plan', systemInstructions: 'Use supplied facts',
  sourceSlots: [{ id: 'source', recordType: 'activity', allowedPaths: ['/title'], maxBytes: 1024 }],
  targetForm: { recordType: 'plan', formName: 'plan-form' }, questions: [], targetFields: [{ id: 'summary', label: 'Summary', metadataPointer: '/summary', expectedComponentClasses: ['TextAreaComponent'], output: { kind: 'string', maxLength: 200 }, operation: 'fill', grounding: 'sourceRequired' }],
  modelDeploymentId: 'model', knowledgeCollectionVersionIds: [], contextLimits: { totalBytes: 4096, maxKnowledgeChunks: 5, maxChunkBytes: 1024 }, fixtureTests: [] });
const names = ['sails', 'GenerationProfile', 'GenerationProfileVersion', 'GenerationBinding', 'GenerationRun', 'GenerationRunArtifact', 'GenerationModelDeployment', 'GenerationModelConnection', 'TranslationService', 'User', 'BrandingService'];
describe('Drafting profile administration', () => {
  let service: Services.GenerationProfileAdminService, tables: Record<string, any[]>, originals: Map<string, unknown>, catalog: Omit<ProfileOverview, 'profiles'>;
  const matches = (r: any, c: any) => Object.entries(c).every(([k, v]: [string, any]) => k === 'or' ? v.some((branch: any) => matches(r, branch)) : v === null ? r[k] == null : Array.isArray(v) ? v.includes(r[k]) : v && typeof v === 'object' && v.in ? v.in.includes(r[k]) : r[k] === v);
  beforeEach(() => {
    originals = new Map(names.map(n => [n, Reflect.get(globalThis, n)]));
    const mock = createMockSails(); mock.config.generation = { ...structuredClone(generation), enabled: true }; Reflect.set(globalThis, 'sails', mock);
    Reflect.set(globalThis, 'TranslationService', { t: (s: string) => s });
    tables = {};
    for (const n of names.filter(n => !['sails','TranslationService','User','BrandingService'].includes(n))) {
      const rows = tables[n] = [];
      Reflect.set(globalThis, n, { find: async (c: any) => structuredClone(rows.filter(r => matches(r, c))), findOne: async (c: any) => structuredClone(rows.find(r => matches(r, c))),
        count: async (c: any) => rows.filter(r => matches(r, c)).length,
        create: (v: any) => ({ fetch: async () => { const r = { id: n + (rows.length + 1), ...structuredClone(v) }; rows.push(r); return structuredClone(r); } }),
        updateOne: (c: any) => ({ set: async (v: any) => { const r = rows.find(r => matches(r, c)); if (r) Object.assign(r, structuredClone(v)); return structuredClone(r); } }),
        destroyOne: async (c: any) => { const i = rows.findIndex(r => matches(r, c)); return i < 0 ? undefined : rows.splice(i, 1)[0]; },
        destroy: async (c: any) => { const deleted = rows.filter(r => matches(r, c)); for (const r of deleted) rows.splice(rows.indexOf(r), 1); return deleted; } });
    }
    tables.GenerationModelDeployment.push({ id: 'model', brandId: 'a', status: 'published' });
    catalog = { enabled: true, models: [{ id: 'model', key: 'demo', name: 'Demo', version: 1, provider: 'Demo', available: true }], guidance: [],
      recordTypes: [{ name: 'activity', label: 'Activity', formName: 'activity-form' }, { name: 'plan', label: 'Plan', formName: 'plan-form' }],
      forms: [{ name: 'activity-form', label: 'Activity', recordType: 'activity', fields: [{ pointer: '/title', label: 'Project title', group: 'Project', component: 'SimpleInputComponent', output: { kind: 'string' } }] },
        { name: 'plan-form', label: 'Plan', recordType: 'plan', fields: [{ pointer: '/summary', label: 'Summary', group: 'Plan', component: 'TextAreaComponent', output: { kind: 'string', maxLength: 200 } }] }],
      limits: { context: generation.context, documents: { ...generation.documents, formats: ['pdf', 'docx', 'txt'] }, cooldownMs: 5000 } };
    sails.services.generationcontextservice = new Context.GenerationContextService();
    sails.services.generationprofileservice = new Profiles.GenerationProfileService();
    sails.services.generationschemaservice = new Schemas.GenerationSchemaService();
    sails.services.generationpromptservice = new Prompts.GenerationPromptService();
    service = new Services.GenerationProfileAdminService(); sinon.stub(service, 'catalog').resolves(catalog);
    tables.GenerationProfile.push({ id: 'p', brandId: 'a', key: 'plan', name: 'Plan', enabled: true, latestVersionId: 'v' });
    tables.GenerationProfileVersion.push({ id: 'v', brandId: 'a', profileId: 'p', version: 1, status: 'draft', definition: definition(), contentHash: canonicalHash(definition()), createdBy: 'admin' });
  });
  afterEach(() => { sinon.restore(); for (const [n, v] of originals) v === undefined ? Reflect.deleteProperty(globalThis, n) : Reflect.set(globalThis, n, v); });
  it('preserves a publication that wins after deletion reads its version snapshot', async () => {
    const validate = service.validate.bind(service); let published = false;
    sinon.stub(service, 'validate').callsFake(async (...args) => {
      const problems = await validate(...args);
      if (!published) { published = true; await sails.services.generationprofileservice.publish('a', 'v', 'publisher', tables.GenerationProfileVersion[0].contentHash); }
      return problems;
    });
    await assert.rejects(service.remove('a', 'plan'), (e: GenerationError) => e.code === 'GENERATION_TARGET_CONFLICT');
    assert.equal(tables.GenerationProfileVersion[0].status, 'published');
    assert.equal(tables.GenerationProfileVersion[0].publishedBy, 'publisher');
    assert.equal(tables.GenerationProfile[0].publishedVersionId, 'v');
  });
  it('blocks deletion even while a winning publication has reserved the parent but not updated its version', async () => {
    const update = GenerationProfileVersion.updateOne.bind(GenerationProfileVersion);
    let deletion: Promise<unknown> | undefined;
    sinon.stub(GenerationProfileVersion, 'updateOne').callsFake((criteria: any) => ({ set: async (values: any) => {
      if (values.status === 'published') {
        deletion = assert.rejects(service.remove('a', 'plan'), (e: GenerationError) => e.code === 'GENERATION_TARGET_CONFLICT');
        await deletion;
      }
      return update(criteria).set(values);
    } }) as any);
    await sails.services.generationprofileservice.publish('a', 'v', 'publisher', tables.GenerationProfileVersion[0].contentHash);
    assert.ok(deletion); assert.equal(tables.GenerationProfileVersion[0].status, 'published');
  });
  it('refuses publication when deletion wins the parent claim after the publisher reads its parent', async () => {
    const update = GenerationProfile.updateOne.bind(GenerationProfile);
    sinon.stub(GenerationProfile, 'updateOne').callsFake((criteria: any) => ({ set: async (values: any) => {
      assert.equal((await service.remove('a', 'plan')).deleted, true);
      return update(criteria).set(values);
    } }) as any);
    await assert.rejects(sails.services.generationprofileservice.publish('a', 'v', 'publisher', tables.GenerationProfileVersion[0].contentHash), (e: GenerationError) => e.code === 'GENERATION_TARGET_CONFLICT');
    assert.equal(tables.GenerationProfile.length, 0); assert.equal(tables.GenerationProfileVersion.length, 0);
  });
  it('releases the parent publication reservation when a draft changes before its version update', async () => {
    sinon.stub(GenerationProfileVersion, 'updateOne').returns({ set: async () => undefined } as any);
    await assert.rejects(sails.services.generationprofileservice.publish('a', 'v', 'publisher', tables.GenerationProfileVersion[0].contentHash));
    assert.equal(tables.GenerationProfile[0].publishedVersionId, '');
    assert.equal((await service.remove('a', 'plan')).deleted, true);
  });
  for (const mismatch of ['record type', 'slot', 'document-only', 'required record', 'extra required record']) it('blocks publication when a consuming action has an incompatible ' + mismatch, async () => {
    const v = tables.GenerationProfileVersion[0];
    const binding: any = { brandId: 'a', profileId: 'p', name: 'Create plan from activity', sourceRecordType: 'activity', sourceRelationship: { sourceSlotId: 'source' }, targetRecordType: 'plan', targetFormName: 'plan-form' };
    tables.GenerationBinding.push(binding);
    assert.equal((await service.validate('a', v.definition, 'p')).length, 0);
    if (mismatch === 'record type') { v.definition.sourceSlots[0].recordType = 'plan'; v.definition.sourceSlots[0].allowedPaths = ['/summary']; }
    if (mismatch === 'slot') v.definition.sourceSlots[0].id = 'replacement';
    if (mismatch === 'document-only') { v.definition.sourceSlots = []; v.definition.documentSources = { ...generation.documents, formats: ['txt'] }; }
    if (mismatch === 'required record') { delete binding.sourceRecordType; delete binding.sourceRelationship; v.definition.documentSources = { ...generation.documents, formats: ['txt'] }; }
    if (mismatch === 'extra required record') v.definition.sourceSlots.push({ ...v.definition.sourceSlots[0], id: 'extra', required: true });
    const problems = await service.validate('a', v.definition, 'p');
    assert.ok(problems.some(p => p.section === 'source' && p.messageKey === 'ai-profiles-problem-action-source' && p.label === binding.name));
    await assert.rejects(service.publish('a', 'v', { expectedContentHash: v.contentHash }, 'admin'), (e: GenerationError) => e.code === 'GENERATION_PROFILE_INVALID');
  });
  it('accepts document-only actions with no required records and matching record actions with optional extra records', async () => {
    const d = definition(); d.documentSources = { ...generation.documents, formats: ['txt'] }; d.sourceSlots[0].required = false;
    tables.GenerationBinding.push({ brandId: 'a', profileId: 'p', name: 'Documents', targetRecordType: 'plan', targetFormName: 'plan-form' });
    assert.deepEqual(await service.validate('a', d, 'p'), []);
    tables.GenerationBinding[0].sourceRecordType = 'activity'; tables.GenerationBinding[0].sourceRelationship = { sourceSlotId: 'source' };
    d.sourceSlots.push({ ...d.sourceSlots[0], id: 'optional' });
    assert.deepEqual(await service.validate('a', d, 'p'), []);
  });
  for (const [config, kind] of [[{ multipleValues: false }, 'enum'], [{ multipleValues: true }, 'enumArray'], [{}, 'enumArray'], [{ booleanMode: true }, 'boolean'], [{ booleanMode: true, multipleValues: false }, 'boolean']] as const) it('derives checkbox output ' + kind + ' for ' + JSON.stringify(config), async () => {
    const form: any = { componentDefinitions: [{ name: 'summary', model: { class: 'CheckboxInputModel' }, component: { class: 'CheckboxInputComponent', config: { ...config, options: [{ value: 'one', label: 'One' }] } } }] };
    const fields = profileFormFields(form, s => s); assert.equal(fields[0].output?.kind, kind);
    catalog.forms[1].fields = fields;
    const d = definition(); d.targetFields[0].expectedComponentClasses = ['CheckboxInputComponent']; d.targetFields[0].output = fields[0].output!;
    assert.deepEqual(await service.validate('a', d), []);
    d.targetFields[0].output = { kind: kind === 'enumArray' ? 'enum' : 'enumArray', values: ['one'] };
    assert.ok((await service.validate('a', d)).some(p => p.messageKey === 'ai-profiles-problem-field-changed'));
  });
  it('preserves saved profile question text across publication, run launch and the researcher API contract consumed by the panel', async () => {
    const d = definition(); d.questions = structuredClone(profileQuestionContract);
    d.sourceSlots[0].required = false; d.documentSources = { ...generation.documents, formats: ['txt'] };
    const saved = await service.save('a', 'v', { name: 'Plan', definition: d, expectedContentHash: tables.GenerationProfileVersion[0].contentHash }, 'admin');
    await service.publish('a', 'v', { expectedContentHash: saved.contentHash }, 'admin');
    const binding = { id: 'binding', brandId: 'a', key: 'create-plan', profileId: 'p', enabled: true, allowedRoles: ['Researcher'], targetRecordType: 'plan', targetFormName: 'plan-form', targetStartingWorkflowStage: 'draft' };
    tables.GenerationBinding.push(binding);
    sails.config.workflow = { plan: { draft: { starting: true, config: { form: 'plan-form', workflow: { stage: 'draft' }, authorization: { editRoles: ['Researcher'] } } } } } as any;
    Reflect.set(globalThis, 'User', { findOne: () => ({ populate: async () => ({ id: 'researcher', roles: [{ name: 'Researcher' }] }) }) });
    Reflect.set(globalThis, 'BrandingService', { getBrandById: () => ({ id: 'a' }) });
    sails.services.generationbindingservice = {
      authorizeLaunch: async () => ({ binding, profileVersion: await sails.services.generationprofileservice.resolvePublished('a', 'p') }),
      buildTargetUrl: () => '/plan', buildCompletionValues: () => [],
    };
    sails.services.generationcryptoservice = {
      encrypt: async (_brand: string, _run: string, payload: unknown) => ({ payloadVersion: 1, encryptionKeyId: 'test', iv: 'iv', authTag: 'tag', ciphertext: JSON.stringify(payload) }),
      decrypt: async (_brand: string, _run: string, envelope: any) => JSON.parse(envelope.ciphertext),
    };
    const actor = { brandId: 'a', branding: 'default', portal: 'rdmp', userId: 'researcher', username: 'researcher', roles: ['Researcher'] };
    const runs = new Runs.GenerationRunService();
    const launch = await runs.launch({ actor, brand: {} as any, user: {} as any, bindingKey: binding.key });
    const view = await runs.getForActor(actor, launch.runId);
    assert.deepEqual(JSON.parse(JSON.stringify(view.questions)), launchedQuestionContract);
    assert.equal(view.status, 'draft'); assert.equal(tables.GenerationRunArtifact.length, 1);
  });
  it('creates an incomplete saveable first draft without a template', async () => {
    const p = await service.create('a', { name: 'New plan', sourceRecordType: 'activity', targetFormName: 'plan-form' }, 'admin');
    assert.equal(p.versions[0].version, 1); assert.equal(p.versions[0].status, 'draft'); assert.ok(p.versions[0].problems.length); assert.equal(p.versions[0].definition.targetForm?.formName, 'plan-form');
  });
  it('preselects the only available published model but leaves a genuine choice blank', async () => {
    const create = () => service.create('a', { name: 'Model choice', sourceRecordType: 'activity', targetFormName: 'plan-form' }, 'admin');
    assert.equal((await create()).versions[0].definition.modelDeploymentId, 'model');
    catalog.models.push({ ...catalog.models[0], id: 'other' });
    assert.equal((await create()).versions[0].definition.modelDeploymentId, '');
    catalog.models[1].available = false;
    assert.equal((await create()).versions[0].definition.modelDeploymentId, 'model');
  });
  it('names incomplete sections without a catch-all drafting-rules problem', async () => {
    const d = definition(); d.purpose = ''; d.systemInstructions = ''; d.targetFields = []; d.sourceSlots[0].allowedPaths = [];
    const problems = await service.validate('a', d);
    assert.deepEqual(problems.map(p => p.messageKey).sort(), ['ai-profiles-problem-fields', 'ai-profiles-problem-instructions', 'ai-profiles-problem-purpose', 'ai-profiles-problem-source']);
    const badField = definition(); badField.targetFields[0].reviewedAnswerIds = ['gone'];
    const fieldProblems = await service.validate('a', badField);
    assert.ok(fieldProblems.some(p => p.row === 'summary' && p.label === 'Summary' && p.section === 'fields'));
    const badLimits = definition(); badLimits.contextLimits.totalBytes = 0;
    assert.ok((await service.validate('a', badLimits)).some(p => p.messageKey === 'ai-profiles-problem-model-limits'));
  });
  it('accepts ordinary question/help/choice text while retaining bootstrap keys', () => {
    const d = definition(); d.questions = [{ id: 'question', label: 'Which kind?', helpText: 'Pick a kind', type: 'enum', required: true, options: [{ value: 'One', label: 'One' }] }];
    assert.equal(new Profiles.GenerationProfileService().validateDefinition(d), d); d.questions[0] = { id: 'old', labelKey: 'old-question', type: 'text', required: false };
    assert.equal(new Profiles.GenerationProfileService().validateDefinition(d), d);
  });
  it('saves incomplete drafts with translated warnings and a new content hash', async () => {
    const d = definition(); d.purpose = ''; d.targetFields[0].metadataPointer = '/gone';
    const result = await service.save('a', 'v', { name: 'Plan', definition: d, expectedContentHash: tables.GenerationProfileVersion[0].contentHash }, 'admin');
    assert.equal(result.definition.purpose, ''); assert.equal(result.contentHash, canonicalHash(d));
    assert.ok(result.problems.some(p => p.messageKey === 'ai-profiles-problem-target-field' && p.label === 'Summary'));
  });
  it('rejects malformed settings instead of persisting broken containers', async () => {
    await assert.rejects(service.save('a', 'v', { name: 'Plan', definition: { ...definition(), questions: [null] }, expectedContentHash: tables.GenerationProfileVersion[0].contentHash }, 'admin'), (e: GenerationError) => e.code === 'GENERATION_REQUEST_INVALID');
  });
  it('refuses two suggestions for the same target field', () => {
    const d = definition(); d.targetFields.push({ ...d.targetFields[0], id: 'second-answer' });
    assert.throws(() => new Profiles.GenerationProfileService().validateDefinition(d), GenerationError);
  });
  it('refuses stale hashes and immutable versions without overwriting content', async () => {
    await assert.rejects(service.save('a', 'v', { name: 'Plan', definition: definition(), expectedContentHash: 'stale' }, 'admin'), (e: GenerationError) => e.status === 409);
    tables.GenerationProfileVersion[0].status = 'published';
    await assert.rejects(service.save('a', 'v', { name: 'Plan', definition: definition(), expectedContentHash: tables.GenerationProfileVersion[0].contentHash }, 'admin'), (e: GenerationError) => e.status === 409);
  });
  it('never resolves a foreign brand version or profile key', async () => {
    await assert.rejects(service.save('b', 'v', { name: 'Plan', definition: definition(), expectedContentHash: 'hash' }, 'actor'), (e: GenerationError) => e.status === 404);
    await assert.rejects(service.remove('b', 'plan'), (e: GenerationError) => e.status === 404);
  });
  it('checks model/guidance/source references in the active brand catalogue', async () => {
    const d = definition(); d.modelDeploymentId = 'foreign'; d.knowledgeCollectionVersionIds = ['foreign']; d.sourceSlots[0].allowedPaths = ['/gone'];
    const problems = await service.validate('a', d);
    for (const key of ['model', 'guidance', 'source-field']) assert.ok(problems.some(p => p.messageKey === 'ai-profiles-problem-' + key));
  });
  it('checks target component and vocabulary option drift in every consuming form action', async () => {
    tables.GenerationBinding.push({ brandId: 'a', profileId: 'p', targetRecordType: 'plan', targetFormName: 'other-form' });
    catalog.forms.push({ name: 'other-form', label: 'Other plan', recordType: 'plan', fields: [{ pointer: '/summary', label: 'Summary', group: 'Plan', component: 'DropdownInputComponent', output: { kind: 'enum', values: ['new'] } }] });
    const problems = await service.validate('a', definition(), 'p'); assert.ok(problems.some(p => p.messageKey === 'ai-profiles-problem-field-changed' && p.label === 'Summary' && p.form === 'Other plan'));
    catalog.forms[1].fields[0] = { ...catalog.forms[1].fields[0], output: { kind: 'enum', values: ['new'] } };
    const d = definition(); d.targetFields[0].output = { kind: 'enum', values: ['old'] };
    assert.ok((await service.validate('a', d)).some(p => p.messageKey === 'ai-profiles-problem-field-changed'));
  });
  it('blocks publication of invalid targets and stale drafts', async () => {
    const v = tables.GenerationProfileVersion[0]; v.definition.targetFields[0].metadataPointer = '/gone';
    await assert.rejects(service.publish('a', 'v', { expectedContentHash: v.contentHash }, 'admin'), (e: GenerationError) => e.code === 'GENERATION_PROFILE_INVALID');
    await assert.rejects(service.publish('a', 'v', { expectedContentHash: 'stale' }, 'admin'), (e: GenerationError) => e.status === 409);
  });
  it('does not publish a replacement saved while publication validation was running', async () => {
    const oldHash = tables.GenerationProfileVersion[0].contentHash;
    sinon.stub(service, 'validate').callsFake(async () => { tables.GenerationProfileVersion[0].contentHash = 'replacement-hash'; return []; });
    await assert.rejects(service.publish('a', 'v', { expectedContentHash: oldHash }, 'admin'), (e: GenerationError) => e.code === 'GENERATION_TARGET_CONFLICT');
    assert.equal(tables.GenerationProfileVersion[0].status, 'draft');
  });
  it('duplicates the newest version into independent draft v1', async () => {
    const p = await service.duplicate('a', 'plan', { name: 'Copy' }, 'admin'); assert.equal(p.versions[0].version, 1); assert.notEqual(p.id, 'p'); assert.equal(p.hasPublished, false);
    p.versions[0].definition.purpose = 'changed'; assert.equal(tables.GenerationProfileVersion[0].definition.purpose, 'Draft a plan');
  });
  it('deletes an unused unpublished profile and all its drafts', async () => { assert.equal((await service.remove('a', 'plan')).deleted, true); assert.equal(tables.GenerationProfile.length, 0); assert.equal(tables.GenerationProfileVersion.length, 0); });
  for (const reason of ['published', 'retired', 'form action', 'run']) it('blocks deletion for ' + reason, async () => {
    if (reason === 'published' || reason === 'retired') tables.GenerationProfileVersion[0].status = reason;
    if (reason === 'form action') tables.GenerationBinding.push({ brandId: 'a', profileId: 'p', key: 'action', name: 'Create plan', targetRecordType: 'plan' });
    if (reason === 'run') tables.GenerationRun.push({ brandId: 'a', profileVersionId: 'v' });
    const r = await service.remove('a', 'plan'); assert.equal(r.deleted, false); assert.equal(tables.GenerationProfile.length, 1);
    if (reason === 'form action') assert.equal(r.uses[0].name, 'Create plan');
  });
  it('discards a draft without changing the live version and returns its latest pointer', async () => {
    const old = tables.GenerationProfileVersion[0]; old.status = 'published';
    tables.GenerationProfileVersion.push({ ...structuredClone(old), id: 'v2', version: 2, status: 'draft' });
    assert.equal((await service.discard('a', 'v2')).deleted, true); assert.equal(tables.GenerationProfileVersion.length, 1); assert.equal(tables.GenerationProfile[0].latestVersionId, 'v');
  });
  it('runs synthetic cases through the model/schema path without writing a GenerationRun', async () => {
    tables.GenerationProfileVersion[0].definition.fixtureTests = [{ name: 'Synthetic project', source: { '/title': 'Synthetic title' }, answers: {} }];
    sails.services.generationknowledgeservice = { retrieve: async () => [] };
    const invoke = sinon.stub().resolves([{ content: JSON.stringify({ answers: { summary: { value: 'Synthetic title', evidenceIds: ['E1'], rationale: 'Source' } } }) }]);
    sails.services.generationmodelservice = { testProfileRequests: invoke };
    const result = await service.runTests('a', 'v', 'admin'); assert.equal(result[0].passed, true); assert.equal(result[0].fields[0].label, 'Summary'); assert.equal(result[0].fields[0].value, 'Synthetic title'); assert.equal(tables.GenerationRun.length, 0); assert.equal(invoke.firstCall.args[0], 'a'); assert.ok(invoke.firstCall.args[3][0].messages.some((m: any) => m.content.includes('\"label\":\"Summary\"')));
    invoke.resolves([{ content: JSON.stringify({ answers: { summary: { value: 'X', evidenceIds: ['UNKNOWN'], rationale: 'Bad' } } }) }]);
    assert.equal((await service.runTests('a', 'v', 'admin'))[0].passed, false);
  });
  it('shares cooldown with model tests, enforces provider limits and redacts resolved keys', async () => {
    Object.assign(tables.GenerationModelDeployment.find(v => v.id === 'model'), { id: 'model', brandId: 'a', status: 'published', connectionId: 'c', modelId: 'demo' });
    tables.GenerationModelConnection.push({ id: 'c', brandId: 'a', enabled: true, adapterId: 'fake', endpoint: '', timeoutMs: 1000, secretRef: 'env:key' });
    sails.services.generationproviderregistryservice = { list: () => ['fake'], get: () => ({ invoke: async () => ({ content: 'secret value', requestedModel: 'demo' }) }) };
    sails.services.generationsecretresolverservice = { schemes: () => ['env'], status: async () => ({ configured: true }), resolve: async () => 'secret' };
    const model = new Models.GenerationModelService(); const requests: any[] = [{ messages: [], correlationId: 'test', connection: {}, deployment: {} }];
    assert.equal((await model.testProfileRequests('a', 'admin', 'model', requests))[0].content, '[redacted] value');
    await assert.rejects(model.testProfileRequests('a', 'admin', 'model', requests), (e: GenerationError) => e.code === 'GENERATION_RATE_LIMITED');
  });
  it('uses the demo provider for a new profile’s generated field IDs', async () => {
    const d = definition(); d.fixtureTests = [{ name: 'Synthetic', source: { '/title': 'Synthetic project' }, answers: {} }];
    tables.GenerationProfileVersion[0].definition = d;
    Object.assign(tables.GenerationModelDeployment.find(v => v.id === 'model'), { id: 'model', brandId: 'a', status: 'published', connectionId: 'c', modelId: 'demo' });
    tables.GenerationModelConnection.push({ id: 'c', brandId: 'a', enabled: true, adapterId: 'fake', endpoint: '', timeoutMs: 1000 });
    sails.services.generationproviderregistryservice = { list: () => ['fake'], get: () => new FakeGenerationProvider() };
    sails.services.generationsecretresolverservice = { schemes: () => [], status: async () => ({ configured: false }), resolve: async () => '' };
    sails.services.generationmodelservice = new Models.GenerationModelService();
    sails.services.generationknowledgeservice = { retrieve: async () => [] };
    const result = await service.runTests('a', 'v', 'admin');
    assert.equal(result[0].passed, true); assert.equal(result[0].fields[0].value, 'Synthetic project');
  });
  it('derives labels, choices and unsupported target exclusions from the form', () => {
    const form: any = { componentDefinitions: [{ name: 'summary', model: { class: 'TextAreaModel' }, layout: { config: { label: 'Summary' } }, component: { class: 'TextAreaComponent', config: { maxLength: 50 } } }, { name: 'upload', model: { class: 'AttachmentModel' }, layout: { config: { label: 'Document' } }, component: { class: 'AttachmentComponent' } }] };
    const fields = profileFormFields(form, s => s); assert.equal(fields[0].label, 'Summary'); assert.deepEqual(fields[0].output, { kind: 'string', maxLength: 50 }); assert.equal(fields[1].output, undefined);
  });
  for (const legacy of [false, true]) it(`sends the meaning and answer of a ${legacy ? 'legacy' : 'direct'} boolean question to the provider`, async () => {
    const d = tables.GenerationProfileVersion[0].definition;
    d.questions = [{ id: 'question-opaque-123', type: 'boolean', ...(legacy
      ? { labelKey: 'legacy-question', helpTextKey: 'legacy-help' }
      : { label: 'Will participant names be retained?', helpText: 'Consider the final dataset.' }) }];
    Reflect.set(globalThis, 'TranslationService', { t: (key: string) => key === 'legacy-question' ? 'Will participant names be retained?' : 'Consider the final dataset.' });
    d.fixtureTests = [{ name: 'Boolean', source: { '/title': 'Synthetic' }, answers: { 'question-opaque-123': true } }];
    sails.services.generationknowledgeservice = { retrieve: async () => [] };
    Object.assign(tables.GenerationModelDeployment.find(v => v.id === 'model'), { id: 'model', brandId: 'a', status: 'published', connectionId: 'c', modelId: 'demo' });
    tables.GenerationModelConnection.push({ id: 'c', brandId: 'a', enabled: true, adapterId: 'fake', endpoint: '', timeoutMs: 1000 });
    const invoke = sinon.stub().resolves({ content: '{}' });
    sails.services.generationproviderregistryservice = { list: () => ['fake'], get: () => ({ invoke }) };
    sails.services.generationsecretresolverservice = { schemes: () => [], resolve: async () => '', status: async () => ({ configured: false }) };
    sails.services.generationmodelservice = new Models.GenerationModelService();
    await service.runTests('a', 'v', 'admin');
    const messages = invoke.firstCall.args[0].messages;
    const user = messages.find((m: any) => m.role === 'user').content;
    const payload = JSON.parse(user.split('\n').slice(1, -1).join('\n'));
    assert.deepEqual(payload.reviewedAnswers[0], { id: 'question-opaque-123', value: true,
      label: 'Will participant names be retained?', helpText: 'Consider the final dataset.', evidenceId: 'E1' });
    assert.ok(!messages.filter((m: any) => m.role === 'system').some((m: any) => m.content.includes('Will participant')));
  });
  it('returns a clear translated limitation for document-only synthetic tests and permits publication', async () => {
    const d = tables.GenerationProfileVersion[0].definition;
    d.sourceSlots = []; d.documentSources = { formats: ['txt'], maxFiles: 1, maxFileBytes: 1024, maxTextBytes: 1024 };
    d.fixtureTests = [{ name: 'Document example', source: {}, answers: {} }];
    assert.deepEqual(await service.validate('a', d, 'p'), []);
    const results = await service.runTests('a', 'v', 'admin');
    assert.equal(results[0].passed, false);
    assert.equal(results[0].fields[0].errorKey, 'ai-profiles-test-documents-unavailable');
    assert.equal((await service.publish('a', 'v', { expectedContentHash: tables.GenerationProfileVersion[0].contentHash }, 'admin')).status, 'published');
  });
  for (const operation of ['create', 'createDraft', 'updateDraft', 'adminCreate', 'adminSave']) {
    it(`compensates a profile ${operation} when model deletion wins before its reference is stored`, async () => {
      const model = new Models.GenerationModelService(); const profiles = sails.services.generationprofileservice;
      tables.GenerationModelDeployment.push({ id: 'new-model', key: 'new-model', brandId: 'a', status: 'published', contentHash: 'model-hash' });
      const d = { ...definition(), modelDeploymentId: 'new-model' };
      if (operation === 'createDraft') tables.GenerationProfileVersion[0].definition = d;
      const method = ['updateDraft', 'adminSave'].includes(operation) ? 'updateOne' : 'create';
      const original = (GenerationProfileVersion as any)[method].bind(GenerationProfileVersion);
      let intercepted = false;
      sinon.stub(GenerationProfileVersion, method as any).callsFake((...args: any[]) => {
        const query = original(...args); const terminal = method === 'create' ? 'fetch' : 'set';
        return { [terminal]: async (...values: any[]) => {
          // Snapshot taken by deletion predates this reference; deletion finishes first.
          if (!intercepted) {
            intercepted = true;
            if (operation === 'createDraft') tables.GenerationProfileVersion[0].definition = definition();
            assert.equal((await model.deleteModel('a', 'new-model')).deleted, true);
          }
          return query[terminal](...values);
        } };
      });
      catalog.models = [{ ...catalog.models[0], id: 'new-model' }];
      const action = operation === 'adminCreate' ? service.create('a', { name: 'New', sourceRecordType: 'activity', targetFormName: 'plan-form' }, 'admin')
        : operation === 'adminSave' ? service.save('a', 'v', { name: 'Plan', definition: d, expectedContentHash: tables.GenerationProfileVersion[0].contentHash }, 'admin') : operation === 'create' ? profiles.create('a', { key: 'new', name: 'New', definition: d }, 'admin') : operation === 'createDraft'
        ? profiles.createDraft('a', 'p', 'v', 'admin') : profiles.updateDraft('a', 'v', d);
      await assert.rejects(action, (e: GenerationError) => e.code === 'GENERATION_TARGET_CONFLICT');
      assert.equal(tables.GenerationProfileVersion.some(v => v.definition.modelDeploymentId === 'new-model'), false);
      assert.equal(tables.GenerationProfile.length, 1);
    });
  }
  it('keeps a model when a profile reference wins before the deletion scan', async () => {
    tables.GenerationModelDeployment.push({ id: 'new-model', key: 'new-model', brandId: 'a', status: 'published', contentHash: 'hash' });
    await sails.services.generationprofileservice.updateDraft('a', 'v', { ...definition(), modelDeploymentId: 'new-model' });
    const result = await new Models.GenerationModelService().deleteModel('a', 'new-model');
    assert.equal(result.deleted, false); assert.equal(tables.GenerationModelDeployment.find(v => v.id === 'new-model').status, 'published');
  });

  it('rejects an admin save while model deletion holds its claim before scanning references', async () => {
    tables.GenerationModelDeployment.push({ id: 'new-model', key: 'new-model', brandId: 'a', status: 'published', contentHash: 'hash' });
    catalog.models.push({ ...catalog.models[0], id: 'new-model' });
    const find = GenerationProfileVersion.find.bind(GenerationProfileVersion);
    let attempted = false;
    sinon.stub(GenerationProfileVersion, 'find').callsFake(async (criteria: any) => {
      if (!attempted) {
        attempted = true;
        await assert.rejects(service.save('a', 'v', { name: 'Plan', expectedContentHash: tables.GenerationProfileVersion[0].contentHash,
          definition: { ...definition(), modelDeploymentId: 'new-model' } }, 'admin'), (e: GenerationError) => e.code === 'GENERATION_TARGET_CONFLICT');
      }
      return find(criteria);
    });
    assert.equal((await new Models.GenerationModelService().deleteModel('a', 'new-model')).deleted, true);
    assert.ok(attempted); assert.equal(tables.GenerationProfileVersion[0].definition.modelDeploymentId, 'model');
  });

});
