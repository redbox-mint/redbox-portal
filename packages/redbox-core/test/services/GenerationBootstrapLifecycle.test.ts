import { expect } from 'chai';
import * as sinon from 'sinon';
import { promises as fs } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { of } from 'rxjs';
import { generation } from '../../src/config/generation.config';
import { Services as BootstrapServices } from '../../src/services/GenerationBootstrapService';
import { Services as ModelServices } from '../../src/services/GenerationModelService';
import { Services as ProfileServices } from '../../src/services/GenerationProfileService';
import { Services as BindingServices } from '../../src/services/GenerationBindingService';
import { Services as SchemaServices } from '../../src/services/GenerationSchemaService';
import { GenerationModelConnectionWLDef } from '../../src/waterline-models/GenerationModelConnection';
import { GenerationModelDeploymentWLDef } from '../../src/waterline-models/GenerationModelDeployment';
import { GenerationProfileWLDef } from '../../src/waterline-models/GenerationProfile';
import { GenerationProfileVersionWLDef } from '../../src/waterline-models/GenerationProfileVersion';
import { GenerationBindingWLDef } from '../../src/waterline-models/GenerationBinding';
import { KnowledgeCollectionWLDef } from '../../src/waterline-models/KnowledgeCollection';
import { KnowledgeCollectionVersionWLDef } from '../../src/waterline-models/KnowledgeCollectionVersion';
import type { GenerationProfileDefinitionV1 } from '../../src/model/generation';

// The in-memory datastore runs actual exported Waterline hooks on creates/updates.
// This catches normalized-key and content-hash behavior hidden by simple service stubs.
describe('Generation bootstrap and deployment lifecycle', () => {
  const names = ['sails', 'FormsService', 'GenerationModelConnection', 'GenerationModelDeployment',
    'GenerationProfile', 'GenerationProfileVersion', 'GenerationBinding', 'KnowledgeCollection', 'KnowledgeCollectionVersion'];
  let originals: Map<string, unknown>;
  let directory: string;
  let tables: Map<string, Array<Record<string, any>>>;
  let logger: Record<string, sinon.SinonStub>;
  let models: ModelServices.GenerationModelService;
  let profiles: ProfileServices.GenerationProfileService;
  let bindings: BindingServices.GenerationBindingService;
  const actor = { brandId: 'brand-1', userId: 'user-1', username: 'researcher', branding: 'default', portal: 'rdmp', roles: ['Editor'] };
  const definition = (): GenerationProfileDefinitionV1 => ({
    purpose: 'Summary', systemInstructions: 'Use approved documents', sourceSlots: [], questions: [],
    documentSources: { formats: ['txt'], maxFiles: 1, maxFileBytes: 1024, maxTextBytes: 1024 },
    targetFields: [{ id: 'summary', metadataPointer: '/summary', expectedComponentClasses: ['TextAreaComponent'],
      output: { kind: 'string', maxLength: 200 }, operation: 'fill', grounding: 'inferenceAllowed' }],
    knowledgeCollectionVersionIds: [], modelDeploymentId: 'deployment-1',
    contextLimits: { totalBytes: 4096, maxKnowledgeChunks: 0, maxChunkBytes: 1024 },
  });
  const bindingInput = (profileId: string) => ({ key: 'Mixed_Binding', name: 'Binding', profileId,
    enabled: true, allowedRoles: ['Editor'], targetRecordType: 'plan', targetStartingWorkflowStage: 'draft',
    targetMode: 'create', maxSuccessfulRunsPerIntent: 1, allowMultipleTargetsPerSource: true,
    createdBy: 'test', updatedBy: 'test' });
  const deploymentInput = (changes: Record<string, unknown> = {}) => ({
    key: 'Mixed_Deployment', name: 'Deployment', version: 1, status: 'draft', connectionId: 'connection-1',
    modelId: 'model-a', parameters: { temperature: 0.2 }, routingPolicy: { order: ['provider-a'] },
    requiredCapabilities: { structuredOutput: true }, createdBy: 'test', ...changes,
  });
  function matches(row: Record<string, any>, criteria: Record<string, any>): boolean {
    return Object.entries(criteria).every(([key, value]) => value && typeof value === 'object' && 'in' in value
      ? value.in.includes(row[key]) : row[key] === value);
  }
  function install(name: string, definition: unknown): void {
    const rows: Array<Record<string, any>> = []; tables.set(name, rows);
    const runHook = async (hookName: string, values: Record<string, any>) => {
      const hook = Reflect.get(definition as object, hookName);
      if (typeof hook === 'function') await new Promise<void>((resolve, reject) => hook(values, (error?: Error) => error ? reject(error) : resolve()));
    };
    Reflect.set(globalThis, name, {
      create: (input: Record<string, any>) => ({ fetch: async () => {
        const values = structuredClone(input); await runHook('beforeCreate', values);
        if (values.key && rows.some(row => row.brandId === values.brandId && row.key === values.key && row.version === values.version)) throw new Error('duplicate canonical key');
        const row = { id: name+'-'+(rows.length+1), ...values }; rows.push(row); return structuredClone(row);
      } }),
      findOne: async (criteria: Record<string, any>) => structuredClone(rows.find(row => matches(row, criteria))),
      find: async (criteria: Record<string, any>) => structuredClone(rows.filter(row => matches(row, criteria))),
      updateOne: (criteria: Record<string, any>) => ({ set: async (input: Record<string, any>) => {
        const values = structuredClone(input); await runHook('beforeUpdate', values);
        const row = rows.find(row => matches(row, criteria)); if (!row) return undefined;
        Object.assign(row, values); return structuredClone(row);
      } }),
    });
  }
  beforeEach(async () => {
    originals = new Map(names.map(name => [name, Reflect.get(globalThis, name)]));
    directory = await fs.mkdtemp(path.join(tmpdir(), 'redbox-generation-bootstrap-'));
    tables = new Map();
    logger = Object.fromEntries(['debug', 'info', 'warn', 'error', 'trace', 'fatal', 'verbose', 'silly', 'log'].map(name => [name, sinon.stub()]));
    const config = structuredClone(generation); config.enabled = true; config.bootstrap.enabled = true; config.bootstrap.directory = '.';
    Reflect.set(globalThis, 'sails', { config: { generation: config, bootstrap: { bootstrapDataPath: directory },
      workflow: { plan: { draft: { starting: true, config: { form: 'plan-form', workflow: { stage: 'draft' }, authorization: { editRoles: ['Editor'] } } } } },
      log: { createNamespaceLogger: () => logger, customLogger: logger } }, log: logger, services: {} });
    Reflect.set(globalThis, 'FormsService', { getFormByName: () => of({ configuration: {
      name: 'plan-form', type: 'plan', componentDefinitions: [{ name: 'summary', model: { class: 'TextAreaModel', config: {} }, component: { class: 'TextAreaComponent', config: {} } }],
    } }) });
    install('GenerationModelConnection', GenerationModelConnectionWLDef); install('GenerationModelDeployment', GenerationModelDeploymentWLDef);
    install('GenerationProfile', GenerationProfileWLDef); install('GenerationProfileVersion', GenerationProfileVersionWLDef);
    install('GenerationBinding', GenerationBindingWLDef); install('KnowledgeCollection', KnowledgeCollectionWLDef);
    install('KnowledgeCollectionVersion', KnowledgeCollectionVersionWLDef);
    models = new ModelServices.GenerationModelService(); profiles = new ProfileServices.GenerationProfileService(); bindings = new BindingServices.GenerationBindingService();
    sails.services.generationmodelservice = models; sails.services.generationprofileservice = profiles;
    sails.services.generationbindingservice = bindings; sails.services.generationschemaservice = new SchemaServices.GenerationSchemaService();
    sails.services.generationproviderregistryservice = { get: () => ({ healthCheck: async () => ({ ok: true,
      capabilities: { structuredOutput: true, nonStreaming: true, textInput: true } }) }) };
    sails.services.generationsecretresolverservice = { resolve: async () => '', status: async () => ({ configured: true, scheme: '' }) };
  });
  afterEach(async () => {
    sinon.restore(); await fs.rm(directory, { recursive: true, force: true });
    for (const [name, value] of originals) {
      if (value === undefined) Reflect.deleteProperty(globalThis, name); else Reflect.set(globalThis, name, value);
    }
  });
  async function seedConnection(id = 'connection-1') {
    tables.get('GenerationModelConnection')?.push({ id, brandId: actor.brandId, enabled: true, adapterId: 'fake', endpoint: 'https://provider.example', timeoutMs: 1000 });
  }
  async function seedPublishedProfile() {
    const created = await profiles.create(actor.brandId, { key: 'Mixed_Profile', name: 'Profile', definition: definition() }, 'test');
    await GenerationProfileVersion.updateOne({ id: created.version.id }).set({ status: 'published' });
    await GenerationProfile.updateOne({ id: created.profile.id }).set({ publishedVersionId: created.version.id });
    return created.profile.id;
  }
  it('resolves mixed-case and underscore bootstrap keys and remains idempotent on rerun', async () => {
    const collection = await KnowledgeCollection.create({ brandId: actor.brandId, key: 'Guidance_ABC', name: 'Guidance', createdBy: 'test', updatedBy: 'test' }).fetch();
    const version = await KnowledgeCollectionVersion.create({ brandId: actor.brandId, collectionId: collection.id, version: 1, status: 'published', manifest: {}, contentHash: 'unused', createdBy: 'test' }).fetch();
    await KnowledgeCollection.updateOne({ id: collection.id }).set({ publishedVersionId: version.id });
    const manifests = [
      { kind: 'connection', key: 'Demo_Connection', name: 'Connection', adapterId: 'fake', endpoint: 'https://provider.example', authStrategy: 'none' },
      { kind: 'deployment', key: 'Demo_Deployment', name: 'Deployment', connectionKey: 'Demo_Connection', modelId: 'model-a' },
      { kind: 'profile', key: 'Demo_Profile', name: 'Profile', modelDeploymentKey: 'Demo_Deployment', knowledgeCollectionKeys: ['Guidance_ABC'], definition: definition() },
      { kind: 'binding', ...bindingInput('unused'), key: 'Demo_Binding', profileKey: 'Demo_Profile' },
    ];
    for (const [index, manifest] of manifests.entries()) await fs.writeFile(path.join(directory, index+'.json'), JSON.stringify(manifest));
    const service = new BootstrapServices.GenerationBootstrapService();
    await service.bootstrap({ id: actor.brandId } as any); await service.bootstrap({ id: actor.brandId } as any);
    expect(logger.warn.getCalls().map(call => call.args)).to.deep.equal([]);
    for (const name of ['GenerationModelConnection', 'GenerationModelDeployment', 'GenerationProfile', 'GenerationProfileVersion', 'GenerationBinding']) expect(tables.get(name), name).to.have.length(1);
    expect(tables.get('GenerationProfileVersion')?.[0].definition.knowledgeCollectionVersionIds).to.deep.equal([version.id]);
    expect(tables.get('GenerationModelDeployment')?.[0].key).to.equal('demo-deployment');
  });
  it('updates the canonical binding when its caller retains the original mixed-case key', async () => {
    const profileId = await seedPublishedProfile();
    await bindings.createOrUpdate(actor.brandId, bindingInput(profileId) as any);
    await bindings.createOrUpdate(actor.brandId, { ...bindingInput(profileId), name: 'Updated binding' } as any);
    expect(tables.get('GenerationBinding')).to.have.length(1); expect(tables.get('GenerationBinding')?.[0].name).to.equal('Updated binding');
  });
  it('authorizes a binding by the original mixed-case key after model normalization', async () => {
    const profileId = await seedPublishedProfile(); await bindings.createOrUpdate(actor.brandId, bindingInput(profileId) as any);
    const authorized = await bindings.authorizeLaunch({ actor, brand: {} as any, user: { roles: [] } as any, bindingKey: 'Mixed_Binding' });
    expect(authorized.binding.key).to.equal('mixed-binding');
  });
  it('hashes full deployment configuration through the actual create hook', async () => {
    await seedConnection(); await seedConnection('connection-2');
    const base = await models.createDeployment(actor.brandId, deploymentInput() as any);
    const variants = [
      { modelId: 'model-b' }, { connectionId: 'connection-2' }, { routingPolicy: { order: ['provider-b'] } },
      { parameters: { temperature: 0.5 } }, { requiredCapabilities: { structuredOutput: true, textInput: true } },
    ];
    for (const [index, changes] of variants.entries()) {
      const variant = await models.createDeployment(actor.brandId, deploymentInput({ version: index+2, ...changes }) as any);
      expect(variant.contentHash).not.to.equal(base.contentHash);
    }
    const same = await models.createDeployment(actor.brandId, deploymentInput({ version: 20, name: 'Audit label', createdBy: 'other-actor' }) as any);
    expect(same.contentHash).to.equal(base.contentHash);
    expect(base.key).to.equal('mixed-deployment');
  });
});
