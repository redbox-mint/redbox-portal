import assert from 'node:assert/strict';
import sinon from 'sinon';
import type { GroupFormComponentDefinitionFrame } from '@researchdatabox/sails-ng-common';
import { reusableRelatedObjectsFormDefinitions } from '../../src/config/reusableRelatedObjectsFormDefinitions.config';
import { GraphQLObjectType, GraphQLNonNull } from 'graphql';
import { Services, type RecordGraphqlDependencies } from '../../src/services/RecordGraphqlService';
import { Services as RecordServices } from '../../src/services/RecordsService';
import { Services as RoleServices } from '../../src/services/RolesService';
import { RoleModel } from '../../src/model/storage/RoleModel';
import { createRecordContractFixture } from '../fixtures/record-contract.fixtures';
import {
  RecordContractContributorRegistry,
  RecordContractCompiler,
  createCoreRecordContractContributors,
  recordContractPointer,
} from '../../src/record-contract';
import type {
  RecordContractComponentContributor,
  RecordContractEffectiveForm,
  ContractNode,
} from '../../src/record-contract';
import { fieldName, fromTree, renderMetadata, hash } from '../../src/record-graphql/renderer';
import type { ReadCaller } from '../../src/record-graphql/read-record';
import type { RecordModel } from '../../src/model/storage/RecordModel';
import { recordGraphql } from '../../src/config/recordGraphql.config';

const caller: ReadCaller = {
  brand: { id: 'brand-default', name: 'default', css: '', roles: [] },
  portal: 'rdmp',
  user: { username: 'viewer', roles: [{ id: 'viewer', name: 'Viewer' }] },
  roles: [{ id: 'viewer', name: 'Viewer' }],
};
const scalar = (scalarType: 'string' | 'number'): ContractNode => ({ kind: 'scalar', scalarType, nullable: false });
// Synthetic hook fixture: real checked-in publication forms are title-only stubs.
const hook: RecordContractComponentContributor = {
  kind: 'component',
  key: 'graphql.fixture',
  version: '1',
  componentType: 'ExampleHookComponent',
  ownedPointers: [''],
  nullability: 'non-null',
  compile: () => ({
    kind: 'node',
    node: {
      kind: 'conditional',
      nullable: false,
      condition: { kind: 'exists', pointer: recordContractPointer('') },
      thenNode: {
        kind: 'object',
        nullable: false,
        unknownProperties: 'allow',
        properties: { explanation: scalar('string') },
      },
      elseNode: {
        kind: 'object',
        nullable: false,
        unknownProperties: 'allow',
        properties: { score: scalar('number') },
      },
    },
  }),
};
function registry(withHook = true) {
  return new RecordContractContributorRegistry([
    ...createCoreRecordContractContributors().map(contributor => ({ contributor, source: 'core' as const })),
    ...(withHook ? [{ contributor: hook, source: 'hook' as const, packageName: '@example/graphql-test' }] : []),
  ]);
}
function harness() {
  const fixture = createRecordContractFixture();
  const form: RecordContractEffectiveForm = {
    ...fixture.form,
    componentDefinitions: [
      ...fixture.form.componentDefinitions,
      ...['view_only', 'dc:title', '__private', 'rb_name'].map(name => ({
        name,
        constraints: { allowModes: ['view' as const] },
        component: { class: 'SimpleInputComponent' as const },
        model: { class: 'SimpleInputModel' as const, config: {} },
      })),
    ],
  };
  let candidates = ['draft', 'queued', 'published'].map(step => ({
    recordType: 'publication',
    workflowStep: step,
    form: `publication-${step}`,
    configuration: { ...form, name: `publication-${step}` },
  }));
  let currentRegistry = registry();
  let reusable = fixture.reusableFormDefinitions;
  const record: RecordModel = {
    id: 'id',
    harvestId: '',
    redboxOid: 'record',
    dateCreated: '',
    lastSaveDate: '',
    metaMetadata: {
      brandId: caller.brand.id,
      type: 'publication',
      form: 'publication-draft',
      createdBy: 'owner',
      searchCore: 'default',
      attachmentFields: [],
    },
    workflow: { stage: 'draft', stageLabel: 'Draft' },
    metadata: {
      title: 'Stored title',
      view_only: 'Historical view field',
      'dc:title': 'mapped',
      details: { description: 'Nested', role_only_note: 'REST-readable', edit_only_note: 'Stored' },
      contributors: [{ name: 'A' }],
      custom_hook_value: { explanation: 'Conditional', score: 1.5 },
      fixed_choice: 'retired',
      count: 3_000_000_000,
    },
    authorization: {
      view: ['viewer'],
      edit: [],
      viewRoles: [],
      editRoles: [],
      editPending: [],
      viewPending: [],
      stored: { view: ['viewer'], edit: [], viewRoles: [], editRoles: [], editPending: [], viewPending: [] },
    },
  };
  const getRecord = sinon.spy(async (oid: string) => {
    if (oid !== record.redboxOid) throw new Error('missing');
    return record;
  });
  const actual = new RecordServices.Records();
  const hasViewAccess = sinon.spy((actor: ReadCaller, value: RecordModel) =>
    actual.hasViewAccess(actor.brand, actor.user, actor.roles, value)
  );
  let config = { ...recordGraphql, enabled: true };
  const deps: RecordGraphqlDependencies = {
    getConfig: () => config,
    getCandidates: async () => candidates,
    getReusableDefinitions: () => reusable,
    getContributorRegistry: () => currentRegistry,
    getContributorRegistrationIssues: () => [],
    getRecord,
    hasViewAccess,
  };
  const service = new Services.RecordGraphql(deps);
  const typeName = (step = 'draft', actor = caller) =>
    `M_publication_${step}_${hash(JSON.stringify([actor.brand.name, actor.portal, 'publication', step, `publication-${step}`]))}`;
  const query = (fields: string, oid = 'record', actor = caller) =>
    service.execute(actor, {
      query: `{ record(oid: "${oid}") { oid metadata { ... on ${typeName(record.workflow.stage, actor)} { ${fields} } } } }`,
    });
  return {
    service,
    record,
    getRecord,
    hasViewAccess,
    deps,
    typeName,
    query,
    setCacheEntries: (cacheEntries: number) => {
      config = { ...config, cacheEntries };
    },
    changeForm: (definitions: RecordContractEffectiveForm['componentDefinitions']) => {
      candidates = candidates.map(c => ({
        ...c,
        configuration: { ...c.configuration, componentDefinitions: [...definitions] },
      }));
    },
    candidates: () => candidates,
    replaceRegistry: (value: RecordContractContributorRegistry) => {
      currentRegistry = value;
    },
    changeReusable: () => {
      reusable = {
        ...reusable,
        'contact-details-v1': [
          {
            name: 'changed_contact',
            component: { class: 'SimpleInputComponent' },
            model: { class: 'SimpleInputModel', config: {} },
          },
        ],
      };
    },
  };
}
function payload(value: Awaited<ReturnType<Services.RecordGraphql['execute']>>) {
  return value.data as unknown as {
    data?: { record: { oid: string; metadata: Record<string, unknown> | null } | null };
    errors?: { message: string; extensions: { code: string } }[];
  };
}

describe('RecordGraphqlService', () => {
  afterEach(() => sinon.restore());
  it('reads nullable nested, repeatable, conditional, hook and view-only fields for REST viewers', async () => {
    const h = harness();
    const result = payload(
      await h.query(
        `title amount fixed_choice count view_only ${fieldName('dc:title')} details { description role_only_note edit_only_note } contributors { name } custom_hook_value { explanation score }`
      )
    );
    assert.equal(result.errors, undefined);
    assert.deepEqual(result.data?.record?.metadata, {
      title: 'Stored title',
      amount: null,
      fixed_choice: 'retired',
      count: 3_000_000_000,
      view_only: 'Historical view field',
      [fieldName('dc:title')]: 'mapped',
      details: { description: 'Nested', role_only_note: 'REST-readable', edit_only_note: 'Stored' },
      contributors: [{ name: 'A' }],
      custom_hook_value: { explanation: 'Conditional', score: 1.5 },
    });
    assert.equal(h.hasViewAccess.callCount, 1);
    assert.deepEqual(h.record.authorization.edit, []);
  });
  it('serves configured edit/view URL variants through the production service', async () => {
    const h = harness();
    h.changeForm(reusableRelatedObjectsFormDefinitions['related-objects-field-url']);
    h.record.metadata.related_url = 'https://example.edu.au/record';
    const result = await h.query('related_url');
    assert.equal(result.status, 200);
    assert.equal(payload(result).errors, undefined);
    assert.deepEqual(payload(result).data?.record?.metadata, { related_url: 'https://example.edu.au/record' });
  });
  it('exposes merged role-specific stored fields to an authorized REST viewer', async () => {
    const h = harness();
    const group = (role: string, names: string[]): GroupFormComponentDefinitionFrame => ({
      name: 'details',
      constraints: { authorization: { allowRoles: [role] } },
      component: {
        class: 'GroupComponent',
        config: {
          componentDefinitions: names.map(name => ({
            name,
            component: { class: 'SimpleInputComponent' },
            model: { class: 'SimpleInputModel', config: {} },
          })),
        },
      },
      model: { class: 'GroupModel', config: {} },
    });
    h.changeForm([group('Researcher', ['title']), group('Admin', ['title', 'admin_note'])]);
    h.record.metadata.details = { title: 'Stored title', admin_note: 'REST-readable note' };
    const result = await h.query('details { title admin_note }');
    assert.equal(result.status, 200);
    assert.equal(payload(result).errors, undefined);
    assert.deepEqual(payload(result).data?.record?.metadata, {
      details: { title: 'Stored title', admin_note: 'REST-readable note' },
    });
  });
  for (const stage of ['draft', 'queued', 'published'])
    it(`resolves the ${stage} workflow/form union member`, async () => {
      const h = harness();
      h.record.workflow.stage = stage;
      h.record.metaMetadata.form = `publication-${stage}`;
      assert.equal(payload(await h.query('title')).errors, undefined);
    });
  it('keeps every generated metadata field nullable', async () => {
    const h = harness();
    const compile = new RecordContractCompiler(registry(), {
      maxDepth: 64,
      maxProperties: 10_000,
      maxDocumentBytes: 1_048_576,
      maxDiagnostics: 1_000,
      contributorTimeoutMs: 1_000,
    });
    const c = h.candidates()[0];
    const result = await compile.compile({
      form: c.configuration,
      reusableFormDefinitions: createRecordContractFixture().reusableFormDefinitions,
      context: {
        brand: 'default',
        portal: 'rdmp',
        kind: 'update',
        recordType: 'publication',
        workflowStep: 'draft',
        form: c.form,
        operation: 'strict-all',
        unknownProperties: 'allow',
        enforcement: 'shadow',
      },
      fieldMode: 'read',
    });
    assert.equal(result.kind, 'compiled');
    if (result.kind !== 'compiled') return;
    const seen = new Set<string>();
    const inspect = (type: GraphQLObjectType) => {
      if (seen.has(type.name)) return;
      seen.add(type.name);
      for (const field of Object.values(type.getFields())) {
        assert.ok(!(field.type instanceof GraphQLNonNull));
        if (field.type instanceof GraphQLObjectType) inspect(field.type);
      }
    };
    inspect(renderMetadata(fromTree(result.contract.root), 'NullableMetadata').type);
  });
  it('returns safe partial errors for mismatched historical types', async () => {
    const h = harness();
    h.record.metadata.amount = 'old-number-string';
    const result = payload(await h.query('title amount'));
    assert.equal(result.data?.record?.metadata?.amount, null);
    assert.equal(result.errors?.[0].extensions.code, 'HISTORICAL_VALUE_TYPE');
    assert.ok(!JSON.stringify(result).includes('old-number-string'));
  });
  it('uses opaque JSON for unsupported hook shapes and updates when contributors change', async () => {
    const h = harness();
    h.replaceRegistry(registry(false));
    assert.deepEqual(
      payload(await h.query('custom_hook_value')).data?.record?.metadata?.custom_hook_value,
      h.record.metadata.custom_hook_value
    );
    h.replaceRegistry(registry());
    assert.equal(payload(await h.query('custom_hook_value { score }')).errors, undefined);
  });
  it('uses collision-safe field names including invalid UTF-16 and reserved prefixes', () => {
    const names = ['title', 'dc:title', 'dc/title', '__private', 'rb_name', '9start', '', '\ud800', '\ud801', '\ufffd'];
    assert.equal(new Set(names.map(fieldName)).size, names.length);
  });
  it('refreshes configuration and reusable definitions without changing the variant name', async () => {
    const h = harness();
    const before = await h.service.describeReadSchema(caller);
    await h.query('title');
    h.changeForm(h.candidates()[0].configuration.componentDefinitions.filter(f => f.name !== 'title'));
    const after = await h.service.describeReadSchema(caller);
    assert.ok(after.includes(h.typeName()));
    assert.notEqual(before, after);
    assert.ok(payload(await h.query('title')).errors);
    assert.equal(h.getRecord.callCount, 1);
    h.changeReusable();
    assert.ok((await h.service.describeReadSchema(caller)).includes('changed_contact'));
  });
  it('isolates brand and portal schemas and maintains a bounded cache', async () => {
    const h = harness();
    h.setCacheEntries(2);
    const compiled = sinon.spy(RecordContractCompiler.prototype, 'compile');
    for (const portal of ['first', 'second', 'third']) {
      const actor = { ...caller, portal };
      const sdl = await h.service.describeReadSchema(actor);
      assert.ok(sdl.includes(h.typeName('draft', actor)));
      assert.ok(!sdl.includes(h.typeName()));
    }
    assert.equal(compiled.callCount, 9);
    await h.service.describeReadSchema({ ...caller, portal: 'third' });
    assert.equal(compiled.callCount, 9);
    await h.service.describeReadSchema({ ...caller, portal: 'first' });
    assert.equal(compiled.callCount, 12);
    h.setCacheEntries(1);
    await h.service.describeReadSchema({ ...caller, portal: 'first' });
    assert.equal(compiled.callCount, 12);
    await h.service.describeReadSchema({ ...caller, portal: 'third' });
    assert.equal(compiled.callCount, 15);
    const foreign = { ...caller, brand: { ...caller.brand, id: 'foreign', name: 'other' } };
    assert.equal(payload(await h.query('title', 'record', foreign)).errors?.[0].extensions.code, 'NOT_FOUND');
  });
  it('coalesces concurrent builds of the same configuration', async () => {
    const h = harness();
    const compiled = sinon.spy(RecordContractCompiler.prototype, 'compile');
    const results = await Promise.all([h.service.describeReadSchema(caller), h.service.describeReadSchema(caller)]);
    assert.equal(results[0], results[1]);
    assert.equal(compiled.callCount, 3);
  });
  it('returns a bounded timeout for an unresponsive storage provider', async () => {
    const h = harness();
    const clock = sinon.useFakeTimers();
    const service = new Services.RecordGraphql({ ...h.deps, getRecord: () => new Promise(() => {}) });
    const result = service.execute(caller, { query: '{ record(oid:"record") { oid } }' });
    await clock.tickAsync(5_001);
    assert.equal((await result).status, 503);
    assert.equal(payload(await result).errors?.[0].extensions.code, 'QUERY_TIMEOUT');
  });
  for (const kind of ['denied', 'foreign', 'missing'])
    it(`preserves REST ${kind} record authorization`, async () => {
      const h = harness();
      if (kind === 'denied') h.record.authorization.view = [];
      if (kind === 'foreign') h.record.metaMetadata.brandId = 'foreign';
      const result = payload(await h.query('title', kind === 'missing' ? 'missing' : 'record'));
      assert.equal(result.data?.record, null);
      assert.equal(result.errors?.[0].extensions.code, kind === 'denied' ? 'FORBIDDEN' : 'NOT_FOUND');
    });
  it('memoizes aliased reads and denials within each request, reauthorizing subsequent requests', async () => {
    const h = harness();
    const request = { query: '{ first: record(oid:"record") { oid } second: record(oid:"record") { oid } }' };
    await h.service.execute(caller, request);
    assert.equal(h.getRecord.callCount, 1);
    assert.equal(h.hasViewAccess.callCount, 1);
    h.record.authorization.view = [];
    const denied = await h.service.execute(caller, request);
    assert.equal(h.getRecord.callCount, 2);
    assert.equal(h.hasViewAccess.callCount, 2);
    assert.equal(payload(denied).errors?.length, 2);
  });
  it('retains editor and role-based record read permissions', async () => {
    const h = harness();
    h.record.authorization.view = [];
    h.record.authorization.edit = ['viewer'];
    assert.equal(payload(await h.query('title')).errors, undefined);
    h.record.authorization.edit = [];
    h.record.authorization.viewRoles = ['Viewer'];
    const previous = Reflect.get(globalThis, 'RolesService');
    Reflect.set(globalThis, 'RolesService', new RoleServices.Roles());
    try {
      const actor = {
        ...caller,
        brand: { ...caller.brand, roles: [Object.assign(new RoleModel(), { id: 'viewer', name: 'Viewer' })] },
      };
      assert.equal(payload(await h.query('title', 'record', actor)).errors, undefined);
      assert.equal(payload(await h.query('title')).errors?.[0].extensions.code, 'FORBIDDEN');
    } finally {
      if (previous === undefined) Reflect.deleteProperty(globalThis, 'RolesService');
      else Reflect.set(globalThis, 'RolesService', previous);
    }
  });
  it('keeps the envelope readable when the stored form is no longer configured', async () => {
    const h = harness();
    h.record.metaMetadata.form = 'removed';
    const result = payload(await h.query('title'));
    assert.equal(result.data?.record?.oid, 'record');
    assert.equal(result.data?.record?.metadata, null);
    assert.equal(result.errors?.[0].extensions.code, 'UNRESOLVED_READ_CONTRACT');
  });
  for (const request of [
    { query: 'mutation { record(oid:"record") { oid } }' },
    { query: 'subscription { record(oid:"record") { oid } }' },
    { query: '{ __schema { queryType { name } } }' },
    { query: `{ ${Array.from({ length: 6 }, (_, i) => `r${i}:record(oid:"record"){oid}`).join(' ')} }` },
    { query: `{ record(oid:"record") { ${Array.from({ length: 201 }, (_, i) => `o${i}:oid`).join(' ')} } }` },
    { query: 'query { ...F ...F ...F ...F ...F ...F } fragment F on Query { record(oid:"record") { oid } }' },
    { query: 'query { ...F } fragment F on Query { ...F }' },
    { query: '{ record(oid:"record") { oid } }', variables: { padding: 'x'.repeat(65_536) } },
  ])
    it('rejects an excessive or non-read query before storage access', async () => {
      const h = harness();
      const result = await h.service.execute(caller, request);
      assert.ok(payload(result).errors);
      assert.equal(h.getRecord.callCount, 0);
    });
  it('bounds selected lists, opaque traversal and serialized responses', async () => {
    const h = harness();
    h.record.metadata.contributors = Array.from({ length: 1001 }, () => ({ name: 'A' }));
    assert.equal(payload(await h.query('contributors { name }')).errors?.[0].extensions.code, 'QUERY_LIMIT');
    h.replaceRegistry(registry(false));
    h.record.metadata.custom_hook_value = {
      children: Array.from({ length: 1000 }, () => Array.from({ length: 1000 }, () => true)),
    };
    assert.equal(payload(await h.query('custom_hook_value')).errors?.[0].extensions.code, 'QUERY_LIMIT');
    h.record.metadata.title = 'x'.repeat(262_145);
    assert.equal(payload(await h.query('title')).errors?.[0].extensions.code, 'QUERY_LIMIT');
    h.record.metadata.title = '"'.repeat(140_000);
    assert.equal((await h.query('title')).status, 413);
  });
  it('fails closed for disabled and invalid configuration or missing contributors', async () => {
    for (const overrides of [
      { getConfig: () => recordGraphql },
      { getConfig: () => ({ ...recordGraphql, enabled: true, cacheEntries: 0 }) },
      { getContributorRegistry: () => undefined },
    ]) {
      const h = harness();
      const service = new Services.RecordGraphql({ ...h.deps, ...overrides });
      assert.equal((await service.execute(caller, { query: '{ record(oid:"record") { oid } }' })).status, 503);
      assert.equal(h.getRecord.callCount, 0);
    }
  });
});
