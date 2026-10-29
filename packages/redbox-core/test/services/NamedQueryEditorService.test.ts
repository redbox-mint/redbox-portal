import assert from 'node:assert/strict';
import * as sinon from 'sinon';
import {
  flattenContextFields,
  handlebarsInstance,
  type FieldDescription,
  type NamedQueryDraftRequest,
} from '@researchdatabox/sails-ng-common';
import { Services as EditorServices } from '../../src/services/NamedQueryEditorService';
import { Services as QueryServices } from '../../src/services/NamedQueryService';
import { BrandingModel } from '../../src/model/storage/BrandingModel';
import type { FormRecordAccessContext } from '../../src/services/FormsService';
import { FieldDescriptionError } from '../../src/services/FieldDescriptionsService';
import {
  checkDraftBudget,
  boundedJsonBytes,
  NAMED_QUERY_PREVIEW_LIMITS as limits,
  NamedQueryExecutionBudget,
} from '../../src/utilities/NamedQueryPreview';
import { createMockSails, setupServiceTestGlobals, cleanupServiceTestGlobals, createQueryObject } from './testHelper';

const brand = Object.assign(new BrandingModel(), { id: 'a', name: 'brand-a' });
const caller: FormRecordAccessContext = {
  brand,
  user: {
    id: 'author',
    username: 'author',
    type: 'local',
    name: 'Author',
    email: '',
    roles: [{ id: 'custom-author-role', name: 'QueryAuthor' }],
  },
};
const schema: FieldDescription = {
  recordType: 'rdmp',
  stage: 'draft',
  precision: 'record-schema',
  completeness: 'complete',
  fields: flattenContextFields(
    {
      type: 'object',
      properties: {
        title: { type: 'string', title: 'Title' },
        count: { type: 'number' },
        people: { type: 'array', items: { type: 'object', properties: { name: { type: 'string' } } } },
        'hook:field': { type: 'string' },
        issued: { type: 'string', format: 'date' },
      },
    },
    'record-schema'
  ),
};
const draft = (overrides: Record<string, unknown> = {}): Record<string, unknown> => ({
  collectionName: 'record',
  mongoQuery: {},
  queryParams: {},
  resultObjectMapping: {},
  ...overrides,
});

describe('NamedQueryEditorService', () => {
  let editor: EditorServices.NamedQueryEditor;
  let executor: QueryServices.NamedQueryService;
  let fields: { describeFields: sinon.SinonStub; schemaTargets: sinon.SinonStub };
  let collection: { countDocuments: sinon.SinonStub; find: sinon.SinonStub };
  let cursor: { sort: sinon.SinonStub; skip: sinon.SinonStub; limit: sinon.SinonStub; toArray: sinon.SinonStub };
  let saved: { findOne: sinon.SinonStub; create: sinon.SinonStub; updateOne: sinon.SinonStub };
  let users: { find: sinon.SinonStub };
  let links: { find: sinon.SinonStub };
  let foreign: { attributes: { branding: object }; find: sinon.SinonStub; count: sinon.SinonStub };
  let relations: { getRelatedRecords: sinon.SinonStub };
  let previous: Record<'query' | 'editor' | 'model' | 'links', unknown>;
  const validate = (definition: unknown, extra: Partial<NamedQueryDraftRequest> = {}) =>
    editor.validateDraft(brand, 'rdmp', caller, { definition, guidance: { recordType: 'rdmp' }, ...extra });

  beforeEach(() => {
    previous = {
      query: Reflect.get(globalThis, 'NamedQueryService'),
      editor: Reflect.get(globalThis, 'NamedQueryEditorService'),
      model: Reflect.get(globalThis, 'NamedQuery'),
      links: Reflect.get(globalThis, 'UserLink'),
    };
    fields = {
      describeFields: sinon.stub().resolves(schema),
      schemaTargets: sinon.stub().resolves({
        recordTypes: [{ id: 'rdmp', label: 'Plan', stages: [{ id: 'draft', label: 'Draft', starting: true }] }],
      }),
    };
    cursor = {
      sort: sinon.stub().returnsThis(),
      skip: sinon.stub().returnsThis(),
      limit: sinon.stub().returnsThis(),
      toArray: sinon.stub().resolves([
        {
          redboxOid: 'oid-a',
          metadata: { title: 'Example', count: 4 },
          dateCreated: '2025-01-01',
          metaMetadata: { brandId: 'a' },
        },
      ]),
    };
    collection = { countDocuments: sinon.stub().resolves(1), find: sinon.stub().returns(cursor) };
    users = { find: sinon.stub().returns({ populate: sinon.stub().returnsThis(), meta: sinon.stub().resolves([]) }) };
    links = { find: sinon.stub().resolves([]) };
    foreign = {
      attributes: { branding: {} },
      find: sinon.stub().returns({ meta: sinon.stub().resolves([{ id: 'joined', project: 'oid-a' }]) }),
      count: sinon.stub().returns({ meta: sinon.stub().resolves(1) }),
    };
    relations = { getRelatedRecords: sinon.stub().resolves({ edges: [], rootOid: 'oid-a' }) };
    saved = {
      findOne: sinon.stub().resolves(null),
      create: sinon.stub().returns(createQueryObject({})),
      updateOne: sinon.stub().returns(createQueryObject({})),
    };
    setupServiceTestGlobals(
      createMockSails({
        models: {
          record: { native: (callback: (error: null, value: typeof collection) => void) => callback(null, collection) },
          user: users,
          foreign,
          unscoped: { attributes: {} },
        },
        services: { fielddescriptionsservice: fields, recordsservice: relations },
      })
    );
    executor = new QueryServices.NamedQueryService();
    editor = new EditorServices.NamedQueryEditor();
    Object.assign(globalThis, {
      NamedQueryService: executor,
      NamedQueryEditorService: editor,
      NamedQuery: saved,
      UserLink: links,
    });
  });
  afterEach(() => {
    sinon.restore();
    cleanupServiceTestGlobals();
    Object.assign(globalThis, {
      NamedQueryService: previous.query,
      NamedQueryEditorService: previous.editor,
      NamedQuery: previous.model,
      UserLink: previous.links,
    });
  });

  it('discovers targets under the feature caller, without an email Admin role', async () => {
    assert.equal((await editor.schemaTargets(brand, caller)).recordTypes[0].id, 'rdmp');
    assert.equal(fields.schemaTargets.firstCall.args[1], caller);
  });
  it('keeps metadata, envelope and mapping paths separate', async () => {
    const description = await editor.describeFields(brand, 'rdmp', caller, {
      collectionName: 'record',
      recordType: 'rdmp',
    });
    assert(description.fields.some(field => field.path === 'metadata.title' && field.title === 'Title'));
    assert(!description.fields.some(field => field.path === 'redboxOid'));
    assert(description.envelopeFields.some(field => field.path === 'redboxOid'));
    assert(description.envelopeFields.some(field => field.path === 'metaMetadata.type'));
    assert(description.mappingFields.some(field => field.path === 'record.metadata.title'));
    assert.equal(description.envelopeFields.find(field => field.path === 'dateCreated')?.format, undefined);
  });
  it('never supplies record metadata for users or branded custom collections', async () => {
    for (const collectionName of ['user', 'foreign']) {
      const description = await editor.describeFields(brand, 'rdmp', caller, { collectionName, recordType: 'rdmp' });
      assert.deepEqual(description.fields, []);
      assert.deepEqual(description.envelopeFields, []);
      const result = await editor.describeDraft(brand, 'rdmp', caller, {
        definition: draft({ collectionName }),
        guidance: { recordType: 'rdmp' },
      });
      assert(!result.result.fields.some(field => field.path === 'metadata.title'));
      assert.equal(result.result.completeness, 'unavailable');
    }
    assert.equal(fields.describeFields.callCount, 0);
  });
  it('denies explicit field discovery and does not disclose denied trees through validation', async () => {
    fields.describeFields.rejects(new FieldDescriptionError('FORBIDDEN'));
    await assert.rejects(
      editor.describeFields(brand, 'rdmp', caller, { collectionName: 'record', recordType: 'rdmp' }),
      /FORBIDDEN/
    );
    const result = await validate(draft({ mongoQuery: { 'metadata.titel': 'x' } }));
    assert.equal(result.valid, true);
    assert(!result.diagnostics.some(item => item.suggestion === 'metadata.title'));
    const description = await editor.describeDraft(brand, 'rdmp', caller, {
      definition: draft(),
      guidance: { recordType: 'rdmp' },
    });
    assert.equal(description.result.completeness, 'unavailable');
  });
  it('denies cross-brand callers for every operation', async () => {
    const other = { ...caller, brand: Object.assign(new BrandingModel(), { id: 'b' }) };
    for (const operation of [
      () => editor.schemaTargets(brand, other),
      () => editor.describeFields(brand, 'rdmp', other, { collectionName: 'record', recordType: 'rdmp' }),
      () => editor.validateDraft(brand, 'rdmp', other, { definition: draft() }),
      () => editor.describeSaved(brand, 'rdmp', other, 'saved'),
      () => editor.previewDraft(brand, 'rdmp', other, { definition: draft() }),
    ])
      await assert.rejects(operation(), /FORBIDDEN/);
    assert.equal(fields.describeFields.callCount, 0);
    assert.equal(collection.countDocuments.callCount, 0);
  });
  it('treats unknown fields and likely typos as nonblocking advice', async () => {
    const result = await validate(
      draft({ mongoQuery: { 'metadata.titel': 'x', 'metadata.hookField': { $custom: true } } })
    );
    assert.equal(result.valid, true);
    assert(result.diagnostics.some(item => item.code === 'UNKNOWN_FIELD' && item.suggestion === 'metadata.title'));
    assert(result.diagnostics.every(item => item.severity === 'warning'));
    assert.equal(collection.countDocuments.callCount, 0);
  });
  it('does not apply metadata value schemas to query operators', async () => {
    const result = await validate(
      draft({
        mongoQuery: { 'metadata.count': { $gte: 3, $in: [3, 4] }, $or: [{ 'metadata.title': { $regex: 'Plan' } }] },
      })
    );
    assert.equal(result.valid, true);
    assert.deepEqual(result.diagnostics, []);
  });
  it('advises on known type/operator mismatches and scalar/array comparisons', async () => {
    const result = await validate(
      draft({
        mongoQuery: { 'metadata.count': { $regex: 'x', $size: 2 }, 'metadata.people': 'Ann' },
        queryParams: { count: { path: 'metadata.count', type: 'boolean' } },
      })
    );
    for (const code of [
      'INCOMPATIBLE_OPERATOR',
      'ARRAY_OPERATOR_ON_SCALAR',
      'SCALAR_ARRAY_COMPARISON',
      'INCOMPATIBLE_PARAMETER_TYPE',
    ])
      assert(result.diagnostics.some(item => item.code === code));
    assert.equal(result.valid, true);
  });
  it('warns about direct and rendered mapping references and syntax without executing', async () => {
    const result = await validate(
      draft({
        resultObjectMapping: {
          typo: 'record.metadata.titel',
          rendered: '{{record.metadata.titel}}',
          malformed: '{{#if broken}}',
          custom: '{{hookHelper record.metadata.title}}',
        },
      })
    );
    assert(
      result.diagnostics.some(item => item.code === 'UNKNOWN_FIELD' && item.suggestion === 'record.metadata.title')
    );
    assert(result.diagnostics.some(item => item.code === 'TEMPLATE_SYNTAX'));
    assert.equal(result.valid, true);
    assert.equal(collection.countDocuments.callCount, 0);
  });
  it('does not treat Mongo implicit array traversal as a direct mapping lookup', async () => {
    const result = await validate(
      draft({ resultObjectMapping: { invalid: 'record.metadata.people.name', wholeArray: 'record.metadata.people' } })
    );
    assert(
      result.diagnostics.some(item => item.field === 'resultObjectMapping.invalid' && item.code === 'UNKNOWN_FIELD')
    );
    assert(!result.diagnostics.some(item => item.field === 'resultObjectMapping.wholeArray'));
    assert.equal(result.valid, true);
  });
  it('uses the foreign collection guidance for related predicates and join fields', async () => {
    const foreignFields = { ...schema, fields: [{ path: 'joinKey', type: 'string', required: false, isArray: false }] };
    fields.describeFields.callsFake(async (_brand, _portal, _caller, type) =>
      type === 'foreignType' ? foreignFields : schema
    );
    const result = await validate(
      draft({
        relatedRecordFilters: [
          {
            collectionName: 'record',
            localField: 'metadata.title',
            foreignField: 'metadata.joinKey',
            mongoQuery: { 'metadata.joinKey': 'x' },
          },
        ],
      }),
      { relatedGuidance: { '0': { recordType: 'foreignType' } } }
    );
    assert.deepEqual(result.diagnostics, []);
    assert(fields.describeFields.calledWith(brand, 'rdmp', caller, 'foreignType'));
    const nonRecord = await validate(
      draft({
        relatedRecordFilters: [
          { collectionName: 'user', localField: 'metadata.title', foreignField: 'email', mongoQuery: { email: 'x' } },
        ],
      }),
      { relatedGuidance: { '0': { recordType: 'foreignType' } } }
    );
    assert(!nonRecord.diagnostics.some(item => item.field.includes('foreignField')));
  });
  it('preserves partial and unavailable guidance without inventing a query constraint', async () => {
    fields.describeFields.resolves({
      ...schema,
      precision: 'form-config',
      completeness: 'partial',
      fields: schema.fields.map(field => ({ ...field, type: 'unknown' })),
    });
    const definition = draft({ mongoQuery: { 'metadata.hook:field': 'x' } });
    const before = JSON.stringify(definition);
    const description = await editor.describeDraft(brand, 'rdmp', caller, {
      definition,
      guidance: { recordType: 'rdmp', stage: 'review' },
    });
    assert.equal(description.result.completeness, 'partial');
    assert.equal(JSON.stringify(definition), before);
  });
  it('describes mapping aliases, parameter keys, direct types and rendered strings', async () => {
    const result = await editor.describeDraft(brand, 'rdmp', caller, {
      definition: draft({
        resultObjectMapping: {
          projectTitle: 'record.metadata.title',
          total: 'record.metadata.count',
          rendered: '{{record.metadata.count}}',
          custom: 'record.relationships.dynamic',
          issued: 'record.metadata.issued',
        },
        queryParams: {
          createdAfter: { type: 'date', path: 'dateCreated', queryType: '>=', whenUndefined: 'ignore', required: true },
        },
      }),
      guidance: { recordType: 'rdmp' },
    });
    const type = (path: string) => result.result.fields.find(field => field.path === path)?.type;
    assert.equal(type('metadata.projectTitle'), 'string');
    assert.equal(type('metadata.total'), 'number');
    assert.equal(type('metadata.rendered'), 'string');
    assert.equal(type('metadata.custom'), 'unknown');
    assert.equal(result.result.fields.find(field => field.path === 'metadata.issued')?.format, 'date');
    assert.equal(result.parameters[0].key, 'createdAfter');
    assert.equal(result.parameters[0].path, 'dateCreated');
    assert.equal(result.parameters[0].required, true);
    assert.equal(result.parameters[0].sourceField?.format, undefined);
    for (const path of ['oid', 'title', 'dateCreated', 'lastSaveDate']) assert(type(path));
  });
  it('bounds alias expansion of large result descriptions and reports partial precision', async () => {
    fields.describeFields.resolves({
      ...schema,
      fields: Array.from({ length: 100 }, (_, i) => ({
        path: `field${i}`,
        type: 'string',
        required: false,
        isArray: false,
      })),
    });
    const mapping = Object.fromEntries(Array.from({ length: 100 }, (_, i) => [`copy${i}`, 'record.metadata']));
    const result = await editor.describeDraft(brand, 'rdmp', caller, {
      definition: draft({ resultObjectMapping: mapping }),
      guidance: { recordType: 'rdmp' },
    });
    assert.equal(result.result.completeness, 'partial');
    assert(result.result.fields.length < 200);
    assert(result.result.fields.some(field => field.path === 'metadata.copy99'));
  });
  it('infers guidance only from an exact unparameterized type constraint', async () => {
    await editor.describeDraft(brand, 'rdmp', caller, {
      definition: draft({ mongoQuery: { 'metaMetadata.type': 'rdmp' } }),
    });
    assert(fields.describeFields.calledWith(brand, 'rdmp', caller, 'rdmp'));
    for (const definition of [
      draft({ mongoQuery: { 'metaMetadata.type': { $in: ['rdmp', 'data'] } } }),
      draft({
        mongoQuery: { 'metaMetadata.type': 'rdmp' },
        queryParams: { type: { path: 'metaMetadata.type', type: 'string' } },
      }),
      draft({ mongoQuery: { 'metaMetadata.type': 'rdmp', metaMetadata: { type: 'data' } } }),
    ]) {
      fields.describeFields.resetHistory();
      const description = await editor.describeDraft(brand, 'rdmp', caller, { definition });
      assert.equal(fields.describeFields.callCount, 0);
      assert.equal(description.result.completeness, 'unavailable');
    }
  });
  it('retains the record metadata wrapper without mappings', async () => {
    const result = await editor.describeDraft(brand, 'rdmp', caller, {
      definition: draft(),
      guidance: { recordType: 'rdmp' },
    });
    assert(result.result.fields.some(field => field.path === 'metadata.title'));
  });
  it('uses the saved definition in the requested brand, never the unsaved editor draft', async () => {
    saved.findOne.callsFake(async ({ key }) =>
      key === 'a_sharedName'
        ? {
            name: 'sharedName',
            collectionName: 'record',
            mongoQuery: '{}',
            queryParams: '{}',
            resultObjectMapping: '{"savedTitle":"record.metadata.title"}',
          }
        : null
    );
    const result = await editor.describeSaved(brand, 'rdmp', caller, 'sharedName', { recordType: 'rdmp' });
    assert.equal(saved.findOne.firstCall.args[0].key, 'a_sharedName');
    assert(result.result.fields.some(field => field.path === 'metadata.savedTitle'));
    const otherBrand = Object.assign(new BrandingModel(), { id: 'b' });
    await assert.rejects(
      editor.describeSaved(otherBrand, 'rdmp', { ...caller, brand: otherBrand }, 'sharedName'),
      /QUERY_NOT_FOUND/
    );
  });
  it('keeps legacy malformed configurations advisory but refuses unsafe preview execution', async () => {
    const definition = draft({
      mongoQuery: 'raw-json-string',
      queryParams: { p: { type: 'hook', path: '' } },
      resultObjectMapping: { invalid: '{{#if x}}' },
      sort: { wrong: true },
    });
    assert.equal((await validate(definition)).valid, true);
    const result = await editor.previewDraft(brand, 'rdmp', caller, { definition });
    assert.equal(result.valid, false);
    assert(result.diagnostics.some(item => item.code === 'PREVIEW_UNSAFE_DEFINITION'));
    assert.equal(collection.countDocuments.callCount, 0);
  });
  for (const definition of [null, [], 'text', 5, {}, { collectionName: 'missing' }, { collectionName: 'unscoped' }]) {
    it(`blocks structurally invalid definition ${JSON.stringify(definition)}`, async () => {
      const result = await validate(definition);
      assert.equal(result.valid, false);
      assert(result.diagnostics.some(item => item.severity === 'error'));
      assert.equal(collection.countDocuments.callCount, 0);
    });
  }
  it('does not tighten create/update for schema warnings or legacy template syntax', async () => {
    const definition = draft({
      mongoQuery: { 'metadata.hookField': { $custom: true } },
      resultObjectMapping: { malformed: '{{#if x}}' },
    });
    await executor.create(brand, 'legacy', definition as unknown as Parameters<typeof executor.create>[2]);
    saved.findOne.resolves({ key: 'a_legacy' });
    await executor.update(brand, 'legacy', definition as unknown as Parameters<typeof executor.update>[2]);
    assert.equal(saved.create.firstCall.args[0].resultObjectMapping, JSON.stringify(definition.resultObjectMapping));
    assert.equal(saved.updateOne.callCount, 1);
  });
  it('previews the real shaped report result with immutable draft, forced brand and sort', async () => {
    const definition = draft({
      brandIdFieldPath: 'metadata.evil',
      mongoQuery: {
        'metaMetadata.brandId': 'b',
        metaMetadata: { brandId: 'b' },
        $or: [{ 'metaMetadata.brandId': 'b' }, {}],
        $expr: { $eq: [1, 1] },
      },
      resultObjectMapping: { projectTitle: 'record.metadata.title', titleText: '{{record.metadata.title}}' },
      sort: [{ dateCreated: 'DESC' }],
    });
    const before = JSON.stringify(definition);
    const result = await editor.previewDraft(brand, 'rdmp', caller, { definition, guidance: { recordType: 'rdmp' } });
    assert.equal(result.valid, true);
    assert.deepEqual(result.records[0].metadata, { projectTitle: 'Example', titleText: 'Example' });
    assert.equal(result.records[0].oid, 'oid-a');
    assert.equal(collection.countDocuments.firstCall.args[0]['metaMetadata.brandId'], 'a');
    assert(collection.countDocuments.firstCall.args[1].maxTimeMS <= limits.timeMs);
    assert(collection.find.firstCall.args[1].maxTimeMS <= limits.timeMs);
    assert.deepEqual(collection.countDocuments.firstCall.args[0].$expr, { $eq: [1, 1] });
    assert.deepEqual(cursor.sort.firstCall.args[0], { dateCreated: -1 });
    assert.equal(relations.getRelatedRecords.callCount, 0);
    assert.equal(JSON.stringify(definition), before);
  });
  it('caps rows and reports row truncation', async () => {
    collection.countDocuments.resolves(150);
    cursor.toArray.resolves(
      Array.from({ length: 100 }, (_, i) => ({ redboxOid: `oid-${i}`, metadata: { title: 'Title' } }))
    );
    const result = await editor.previewDraft(brand, 'rdmp', caller, { definition: draft() });
    assert.equal(cursor.limit.firstCall.args[0], 100);
    assert.equal(result.records.length, 100);
    assert.equal(result.summary.numFound, 150);
    assert.equal(result.truncated, true);
    assert(result.truncationReasons.includes('rows'));
  });
  it('caps the entire response and reports byte truncation, even for a single oversized row', async () => {
    cursor.toArray.resolves([{ redboxOid: 'big', metadata: { title: 'x'.repeat(limits.responseBytes + 1) } }]);
    const result = await editor.previewDraft(brand, 'rdmp', caller, { definition: draft() });
    assert.equal(result.records.length, 0);
    assert.equal(result.truncated, true);
    assert.deepEqual(result.truncationReasons, ['bytes']);
    assert(Buffer.byteLength(JSON.stringify({ data: result })) <= limits.responseBytes);
  });
  it('enforces input bytes, nesting and node complexity before executing', async () => {
    const inputs = [
      draft({ mongoQuery: { title: 'x'.repeat(limits.inputBytes) } }),
      draft({ mongoQuery: { $in: Array(limits.nodes + 1).fill(1) } }),
    ];
    let nested: unknown = {};
    for (let i = 0; i <= limits.depth; i++) nested = { nested };
    inputs.push(draft({ mongoQuery: nested }));
    for (const definition of inputs)
      await assert.rejects(editor.previewDraft(brand, 'rdmp', caller, { definition }), /INPUT_LIMIT|COMPLEXITY_LIMIT/);
    assert.equal(collection.countDocuments.callCount, 0);
    const cyclic: { self?: unknown } = {};
    cyclic.self = cyclic;
    assert.throws(() => checkDraftBudget(cyclic), /COMPLEXITY_LIMIT/);
  });
  it('bounds waits and synchronous helper execution with the same deadline', async () => {
    const shortWait = new NamedQueryExecutionBudget(10);
    await assert.rejects(shortWait.wait(new Promise<never>(() => undefined)), /PREVIEW_TIMEOUT/);
    const shortRun = new NamedQueryExecutionBudget(10);
    assert.throws(
      () =>
        shortRun.run(() => {
          while (true) {
            /* simulated blocking hook helper */
          }
        }),
      /PREVIEW_TIMEOUT/
    );
  });
  it('reports native Mongo maxTimeMS failures as preview timeouts', async () => {
    collection.countDocuments.rejects(Object.assign(new Error('PRIVATE DATABASE DETAILS'), { code: 50 }));
    await assert.rejects(editor.previewDraft(brand, 'rdmp', caller, { definition: draft() }), /PREVIEW_TIMEOUT/);
  });
  it('does not start schema or hook reads without enforceable database deadlines during preview', async () => {
    fields.describeFields.returns(new Promise<never>(() => undefined));
    const result = await editor.previewDraft(brand, 'rdmp', caller, {
      definition: draft({ mongoQuery: { 'metaMetadata.type': 'rdmp' } }),
      guidance: { recordType: 'rdmp' },
      relatedGuidance: { '0': { recordType: 'rdmp' } },
    });
    assert.equal(result.valid, true);
    assert.equal(fields.describeFields.callCount, 0);
    assert.equal(collection.countDocuments.callCount, 1);
  });
  it('forces brand scope after nested and dotted criteria collide in saved execution too', async () => {
    await executor.performNamedQueryFromConfig(
      draft({ mongoQuery: { 'metaMetadata.brandId': 'b', metaMetadata: { brandId: 'b' } } }) as unknown as Parameters<
        typeof executor.performNamedQueryFromConfig
      >[0],
      {},
      brand,
      0,
      10
    );
    assert.equal(collection.countDocuments.firstCall.args[0]['metaMetadata.brandId'], 'a');
  });
  it('preserves saved related-filter execution without a preview budget', async () => {
    const definition = draft({
      relatedRecordFilters: [
        { collectionName: 'foreign', localField: 'redboxOid', foreignField: 'project', mongoQuery: { branding: 'b' } },
      ],
    });
    const before = JSON.stringify(definition);
    const result = await executor.performNamedQueryFromConfig(
      definition as unknown as Parameters<typeof executor.performNamedQueryFromConfig>[0],
      {},
      brand,
      0,
      100
    );
    assert.equal(foreign.find.firstCall.args[0].where.branding, 'b');
    assert.equal(foreign.find.firstCall.args[0].limit, undefined);
    assert.deepEqual(collection.countDocuments.firstCall.args[0].redboxOid, { $in: ['oid-a'] });
    assert.equal(result.records.length, 1);
    assert.equal(JSON.stringify(definition), before);
  });
  it('refuses unscoped related collections and server JavaScript before execution', async () => {
    for (const definition of [
      draft({
        relatedRecordFilters: [
          { collectionName: 'unscoped', localField: 'redboxOid', foreignField: 'id', mongoQuery: {} },
        ],
      }),
      draft({ mongoQuery: { $where: 'while(true){}' } }),
    ])
      assert.equal((await editor.previewDraft(brand, 'rdmp', caller, { definition })).valid, false);
    assert.equal(collection.countDocuments.callCount, 0);
  });
  for (const definition of [
    draft({ collectionName: 'user' }),
    draft({ collectionName: 'foreign' }),
    draft({ expandRelations: true }),
    ...['record', 'foreign', 'user'].map(collectionName =>
      draft({
        relatedRecordFilters: [{ collectionName, localField: 'redboxOid', foreignField: 'project', mongoQuery: {} }],
      })
    ),
  ]) {
    it(`refuses database paths without enforceable deadlines: ${JSON.stringify(definition)}`, async () => {
      const result = await editor.previewDraft(brand, 'rdmp', caller, { definition });
      assert.equal(result.valid, false);
      assert(
        result.diagnostics.some(item => item.code === 'PREVIEW_DEADLINE_UNSUPPORTED' && item.severity === 'error')
      );
      assert.deepEqual(result.records, []);
      assert.equal(collection.countDocuments.callCount, 0);
      assert.equal(collection.find.callCount, 0);
      assert.equal(users.find.callCount, 0);
      assert.equal(links.find.callCount, 0);
      assert.equal(foreign.find.callCount, 0);
      assert.equal(foreign.count.callCount, 0);
      assert.equal(relations.getRelatedRecords.callCount, 0);
      await assert.rejects(
        executor.performNamedQueryFromConfig(
          definition as unknown as Parameters<typeof executor.performNamedQueryFromConfig>[0],
          {},
          brand,
          0,
          100,
          caller.user,
          new NamedQueryExecutionBudget()
        ),
        /PREVIEW_DEADLINE_UNSUPPORTED/
      );
    });
  }
  it('returns diagnostics for missing required or malformed object parameters without database execution', async () => {
    for (const queryParams of [
      { p: { type: 'string', path: 'metadata.title', required: true } },
      { p: { type: 'object', path: 'metadata.title', whenUndefined: 'defaultValue', defaultValue: '[]' } },
    ]) {
      const result = await editor.previewDraft(brand, 'rdmp', caller, { definition: draft({ queryParams }) });
      assert.equal(result.valid, false);
      assert(result.diagnostics.some(item => item.field === 'parameters.p'));
    }
    assert.equal(collection.countDocuments.callCount, 0);
  });
  it('checks the effective query after parameter coercion and substitution', async () => {
    for (const definition of [
      draft({ queryParams: { payload: { path: '$where', type: 'string', whenUndefined: 'ignore' } } }),
      draft({ queryParams: { payload: { path: 'metadata.title', type: 'object', whenUndefined: 'ignore' } } }),
    ]) {
      const parameters =
        (definition.queryParams as Record<string, { type: string }>).payload.type === 'object'
          ? { payload: '{"$function":{"body":"function(){}"}}' }
          : { payload: 'while(true){}' };
      await assert.rejects(
        editor.previewDraft(brand, 'rdmp', caller, { definition, parameters }),
        /PREVIEW_UNSAFE_QUERY/
      );
    }
    assert.equal(collection.countDocuments.callCount, 0);
  });
  it('refuses oversized parameter templates before parsing or executing them', async () => {
    const result = await editor.previewDraft(brand, 'rdmp', caller, {
      definition: draft({
        queryParams: { p: { type: 'string', path: 'metadata.title', template: '{{#if value}}'.repeat(257) } },
      }),
    });
    assert.equal(result.valid, false);
    assert(result.diagnostics.some(item => item.code === 'TEMPLATE_COMPLEXITY'));
    assert.equal(collection.countDocuments.callCount, 0);
  });
  it('preserves saved user brand-role/link scope and password/token sanitization', async () => {
    users.find.returns({
      populate: sinon.stub().returnsThis(),
      meta: sinon.stub().resolves([
        { id: 'a-user', name: 'A', email: 'a@example', roles: [{ branding: 'a' }], password: 'secret', token: 'token' },
        { id: 'b-user', name: 'B', roles: [{ branding: 'b' }] },
        { id: 'linked', name: 'Linked', roles: [{ branding: 'b' }] },
      ]),
    });
    links.find.resolves([{ secondaryUserId: 'linked' }]);
    const result = await executor.performNamedQueryFromConfig(
      draft({
        collectionName: 'user',
        resultObjectMapping: { name: 'record.name', secret: 'record.password', token: 'record.token' },
      }) as unknown as Parameters<typeof executor.performNamedQueryFromConfig>[0],
      {},
      brand,
      0,
      100
    );
    assert.equal(result.summary.numFound, 2);
    assert.deepEqual(
      result.records.map(record => record.metadata),
      [
        { name: 'A', secret: undefined, token: undefined },
        { name: 'Linked', secret: undefined, token: undefined },
      ]
    );
    assert.equal(users.find.firstCall.args[0].limit, undefined);
    assert.equal(links.find.firstCall.args[0].brandId, 'a');
  });
  it('preserves branded custom-collection execution and forced brand scope', async () => {
    const result = await executor.performNamedQueryFromConfig(
      draft({
        collectionName: 'foreign',
        mongoQuery: { branding: 'b' },
        resultObjectMapping: { join: 'record.project' },
      }) as unknown as Parameters<typeof executor.performNamedQueryFromConfig>[0],
      {},
      brand,
      0,
      100
    );
    assert.equal(foreign.count.firstCall.args[0].branding, 'a');
    assert.deepEqual(result.records[0].metadata, { join: 'oid-a' });
  });
  it('refuses record adapters without native deadline support', async () => {
    Reflect.set(sails.models, 'record', { find: sinon.stub(), count: sinon.stub() });
    await assert.rejects(
      editor.previewDraft(brand, 'rdmp', caller, { definition: draft() }),
      /PREVIEW_DEADLINE_UNSUPPORTED/
    );
    assert.equal(collection.countDocuments.callCount, 0);
  });
  it('stops whole-metadata alias expansion before serialization overflows', async () => {
    cursor.toArray.resolves([{ redboxOid: 'big', metadata: { payload: 'x'.repeat(600000) } }]);
    const definition = draft({
      resultObjectMapping: Object.fromEntries(Array.from({ length: 1024 }, (_, i) => [`copy${i}`, 'record.metadata'])),
    });
    assert(Buffer.byteLength(JSON.stringify({ definition })) < limits.inputBytes);
    const render = sinon.spy(executor, 'runTemplate');
    const result = await editor.previewDraft(brand, 'rdmp', caller, { definition });
    assert.equal(result.valid, true);
    assert.equal(result.summary.numFound, 1);
    assert.deepEqual(result.records, []);
    assert.equal(result.truncated, true);
    assert.deepEqual(result.truncationReasons, ['bytes']);
    assert.equal(render.callCount, 1);
    assert(Buffer.byteLength(JSON.stringify({ data: result })) <= limits.responseBytes);
  });
  it('accounts for repeated aliases and accumulated rows before rendering further output', async () => {
    collection.countDocuments.resolves(100);
    cursor.toArray.resolves(
      Array.from({ length: 100 }, (_, i) => ({
        redboxOid: String(i),
        metadata: { payload: 'x'.repeat(10000) },
      }))
    );
    const render = sinon.spy(executor, 'runTemplate');
    const result = await editor.previewDraft(brand, 'rdmp', caller, {
      definition: draft({
        resultObjectMapping: Object.fromEntries(Array.from({ length: 10 }, (_, i) => [`copy${i}`, 'record.metadata'])),
      }),
    });
    assert(result.records.length > 0 && result.records.length < 100);
    assert(render.callCount < 100);
    assert.deepEqual(result.truncationReasons, ['bytes']);
    assert(Buffer.byteLength(JSON.stringify({ data: result })) <= limits.responseBytes);
  });
  for (const [name, expression] of Object.entries({
    each: '{{#each record.metadata.items}}{{@root.record.metadata.payload}}{{/each}}',
    nestedEach:
      '{{#each record.metadata.items}}{{#each @root.record.metadata.items}}{{@root.record.metadata.payload}}{{/each}}{{/each}}',
    with: '{{#with record.metadata}}{{#each items}}{{@root.record.metadata.payload}}{{/each}}{{/with}}',
    if: '{{#each record.metadata.items}}{{#if @root.record.metadata.payload}}{{@root.record.metadata.payload}}{{/if}}{{/each}}',
    unless: '{{#each record.metadata.items}}{{#unless missing}}{{@root.record.metadata.payload}}{{/unless}}{{/each}}',
    implicitBlock: '{{#record.metadata.items}}{{@root.record.metadata.payload}}{{/record.metadata.items}}',
    lookup: '{{#each record.metadata.items}}{{lookup @root.record.metadata "payload"}}{{/each}}',
    expression: '{{record.metadata.payload}}',
    helper: '{{toUpper record.metadata.payload}}',
    sourcePartial: '{{#each record.metadata.items}}{{> previewPayload}}{{/each}}',
    inlinePartial:
      '{{#*inline "payload"}}{{@root.record.metadata.payload}}{{/inline}}{{#each record.metadata.items}}{{> payload}}{{/each}}',
  })) {
    it(`byte-truncates ${name} template amplification during construction`, async () => {
      const shared = handlebarsInstance();
      shared.registerPartial('previewPayload', '{{@root.record.metadata.payload}}');
      try {
        // Exact reviewer source: valid BSON size, tiny draft, attempted 600M characters.
        cursor.toArray.resolves([
          { redboxOid: 'big', metadata: { payload: 'x'.repeat(600000), items: Array(1000).fill(0) } },
        ]);
        const definition = draft({ resultObjectMapping: { expanded: expression } });
        assert(Buffer.byteLength(JSON.stringify({ definition })) < limits.inputBytes);
        const result = await editor.previewDraft(brand, 'rdmp', caller, { definition });
        assert.equal(result.valid, true);
        assert.equal(result.summary.numFound, 1);
        assert.deepEqual(result.records, []);
        assert.equal(result.truncated, true);
        assert.deepEqual(result.truncationReasons, ['bytes']);
        assert(Buffer.byteLength(JSON.stringify({ data: result })) <= limits.responseBytes);
      } finally {
        shared.unregisterPartial('previewPayload');
      }
    });
  }
  it('stops nested helper block callbacks after at most the remaining budget of leaf output', async () => {
    const shared = handlebarsInstance();
    let emitted = 0;
    shared.registerHelper('previewObserve', (value: string) => {
      emitted += Buffer.byteLength(value);
      return value;
    });
    shared.registerHelper('previewRepeat', (options: Handlebars.HelperOptions) => {
      let result = '';
      for (let i = 0; i < 1000; i++) result += options.fn({});
      return result;
    });
    try {
      cursor.toArray.resolves([{ redboxOid: 'big', metadata: { payload: 'x'.repeat(10000) } }]);
      const result = await editor.previewDraft(brand, 'rdmp', caller, {
        definition: draft({
          resultObjectMapping: {
            expanded:
              '{{#previewRepeat}}{{#previewRepeat}}{{previewObserve @root.record.metadata.payload}}{{/previewRepeat}}{{/previewRepeat}}',
          },
        }),
      });
      assert(emitted > 0 && emitted <= limits.responseBytes);
      assert.deepEqual(result.records, []);
      assert.deepEqual(result.truncationReasons, ['bytes']);
    } finally {
      shared.unregisterHelper('previewObserve');
      shared.unregisterHelper('previewRepeat');
    }
  });
  it('checks helper arguments before allocating join/json output from repeated references', async () => {
    for (const expression of [
      '{{join record.metadata.items ""}}',
      '{{json record.metadata.items}}',
      '{{record.metadata.items}}',
    ]) {
      cursor.toArray.resolves([{ redboxOid: 'big', metadata: { items: Array(1000).fill('x'.repeat(600000)) } }]);
      const result = await editor.previewDraft(brand, 'rdmp', caller, {
        definition: draft({ resultObjectMapping: { expanded: expression } }),
      });
      assert.deepEqual(result.records, []);
      assert.deepEqual(result.truncationReasons, ['bytes']);
    }
  });
  it('guards custom overrides of builtin helpers before invoking them', async () => {
    const shared = handlebarsInstance();
    const original = shared.helpers.lookup;
    const helper = sinon.spy((values: string[]) => values.join(''));
    shared.registerHelper('lookup', helper);
    try {
      cursor.toArray.resolves([{ redboxOid: 'big', metadata: { items: Array(1000).fill('x'.repeat(600000)) } }]);
      const result = await editor.previewDraft(brand, 'rdmp', caller, {
        definition: draft({ resultObjectMapping: { expanded: '{{lookup record.metadata.items}}' } }),
      });
      assert.deepEqual(result.records, []);
      assert.deepEqual(result.truncationReasons, ['bytes']);
      assert.equal(helper.callCount, 0);
      assert.equal(executor.runTemplate('{{lookup items}}', { items: ['a', 'b'] }), 'ab');
    } finally {
      shared.registerHelper('lookup', original);
    }
  });
  it('uses the remaining response budget across rows and aliases for template construction', async () => {
    collection.countDocuments.resolves(2);
    cursor.toArray.resolves(
      Array.from({ length: 2 }, (_, i) => ({ redboxOid: String(i), metadata: { payload: 'x'.repeat(200000) } }))
    );
    const result = await editor.previewDraft(brand, 'rdmp', caller, {
      definition: draft({
        resultObjectMapping: { first: '{{record.metadata.payload}}', second: '{{record.metadata.payload}}' },
      }),
    });
    assert.equal(result.summary.numFound, 2);
    assert.equal(result.records.length, 1);
    assert.deepEqual(result.truncationReasons, ['bytes']);
    assert(Buffer.byteLength(JSON.stringify({ data: result })) <= limits.responseBytes);
  });
  it('counts literal amplification and UTF-8 bytes during rendering', async () => {
    cursor.toArray.resolves([
      { redboxOid: 'big', metadata: { items: Array(1000).fill(0), payload: '界'.repeat(200000) } },
    ]);
    for (const expression of [
      '{{#each record.metadata.items}}' + 'x'.repeat(10000) + '{{/each}}',
      '{{record.metadata.payload}}',
    ]) {
      const result = await editor.previewDraft(brand, 'rdmp', caller, {
        definition: draft({ resultObjectMapping: { expanded: expression } }),
      });
      assert.deepEqual(result.records, []);
      assert.deepEqual(result.truncationReasons, ['bytes']);
    }
  });
  it('bounds partial indentation and refuses uninstrumented function partials before invoking them', async () => {
    const shared = handlebarsInstance();
    const precompiled = sinon.spy(shared.compile('{{record.metadata.payload}}'));
    shared.registerPartial('previewLines', '\n'.repeat(1000));
    shared.registerPartial('previewCompiled', precompiled);
    try {
      for (const expression of [' '.repeat(1000) + '{{> previewLines}}', '{{> previewCompiled}}']) {
        const result = await editor.previewDraft(brand, 'rdmp', caller, {
          definition: draft({ resultObjectMapping: { expanded: expression } }),
        });
        assert.deepEqual(result.records, []);
        assert.deepEqual(result.truncationReasons, ['bytes']);
      }
      assert.equal(precompiled.callCount, 0);
      assert.equal(
        executor.runTemplate('{{> previewCompiled}}', { record: { metadata: { payload: 'saved' } } }),
        'saved'
      );
      assert.equal(precompiled.callCount, 1);
    } finally {
      shared.unregisterPartial('previewLines');
      shared.unregisterPartial('previewCompiled');
    }
  });
  it('bounds parameter-template construction before executing database reads', async () => {
    const result = await editor.previewDraft(brand, 'rdmp', caller, {
      definition: draft({
        queryParams: {
          text: {
            path: 'metadata.title',
            type: 'object',
            template: '{{#each value.items}}{{@root.value.payload}}{{/each}}',
          },
        },
      }),
      parameters: { text: { payload: 'x'.repeat(10000), items: Array(1000).fill(0) } },
    });
    assert.equal(result.valid, true);
    assert.deepEqual(result.records, []);
    assert.deepEqual(result.truncationReasons, ['bytes']);
    assert.equal(collection.countDocuments.callCount, 0);
  });
  it('maps rendering RangeError to byte truncation and preserves other failures', async () => {
    const render = sinon.stub(executor, 'runTemplate').throws(new RangeError('Invalid string length'));
    const request = { definition: draft({ resultObjectMapping: { value: '{{record.metadata}}' } }) };
    const result = await editor.previewDraft(brand, 'rdmp', caller, request);
    assert.deepEqual(result.records, []);
    assert.deepEqual(result.truncationReasons, ['bytes']);
    render.throws(new Error('unrelated helper failure'));
    await assert.rejects(editor.previewDraft(brand, 'rdmp', caller, request), /unrelated helper failure/);
  });
  it('preserves helper output, normalization, prototype restrictions and the saved renderer', async () => {
    const shared = handlebarsInstance();
    const originalEach = shared.helpers.each;
    const originalCompile = shared.compile;
    shared.registerHelper('previewHook', (text: string) => `hook:${text}`);
    try {
      const variables = { record: { metadata: { title: "Coffee & Tea <Blend> O'Brien", items: [1, 2] } } };
      const expressions = [
        '{{previewHook record.metadata.title}}|{{toLower record.metadata.title}}',
        '{{#each record.metadata.items}}{{@index}}:{{this}};{{/each}}',
        '{{#with record.metadata}}{{#if title}}{{title}}{{else}}empty{{/if}}{{/with}}',
        '{{record.metadata.constructor}}|{{record.metadata.__proto__}}',
        'Ｃｏｆｆｅｅ: {{record.metadata.title}}',
      ];
      for (const expression of expressions) {
        const before = executor.runTemplate(expression, variables);
        const preview = executor.runTemplate(expression, variables, new NamedQueryExecutionBudget());
        const after = executor.runTemplate(expression, variables);
        assert.equal(preview, before);
        assert.equal(after, before);
      }
      const text = 'x'.repeat(limits.responseBytes + 1);
      assert.equal(executor.runTemplate('{{payload}}', { payload: text }), text);
      assert.equal(shared.helpers.each, originalEach);
      assert.equal(shared.compile, originalCompile);
    } finally {
      shared.unregisterHelper('previewHook');
    }
  });
  it('caps mapping count independently of the request byte and node budgets', async () => {
    await assert.rejects(
      editor.previewDraft(brand, 'rdmp', caller, {
        definition: draft({
          resultObjectMapping: Object.fromEntries(
            Array.from({ length: limits.mappings + 1 }, (_, i) => [`copy${i}`, 'record.metadata'])
          ),
        }),
      }),
      /MAPPING_LIMIT/
    );
    assert.equal(collection.countDocuments.callCount, 0);
  });
  it('retains template blockers after 200 field warnings and refuses execution', async () => {
    const definition = draft({
      mongoQuery: Object.fromEntries(Array.from({ length: 201 }, (_, i) => [`metadata.custom${i}`, 'x'])),
      resultObjectMapping: { bad: '{{#if broken}}' },
    });
    const validation = await validate(definition);
    assert.equal(validation.valid, true); // Legacy save advice stays nonblocking.
    assert.equal(validation.diagnostics.length, 200);
    assert(validation.diagnostics.some(item => item.code === 'TEMPLATE_SYNTAX'));
    const result = await editor.previewDraft(brand, 'rdmp', caller, { definition, guidance: { recordType: 'rdmp' } });
    assert.equal(result.valid, false);
    assert(result.diagnostics.some(item => item.code === 'TEMPLATE_SYNTAX'));
    assert.equal(collection.countDocuments.callCount, 0);
  });
  it('keeps preview refusal independent of the displayed diagnostic limit', async () => {
    const definition = draft({
      queryParams: Object.fromEntries(Array.from({ length: 201 }, (_, i) => [`p${i}`, { path: '', type: 'hook' }])),
      resultObjectMapping: { bad: '{{#if broken}}' },
    });
    const result = await editor.previewDraft(brand, 'rdmp', caller, { definition });
    assert.equal(result.valid, false);
    assert.equal(result.diagnostics.length, 200);
    assert(result.diagnostics.some(item => item.severity === 'error'));
    assert.equal(collection.countDocuments.callCount, 0);
  });
  it('uses positive remaining maxTimeMS for every permitted preview database operation', async () => {
    const clock = sinon.useFakeTimers();
    collection.countDocuments.callsFake(async () => {
      await clock.tickAsync(25);
      return 1;
    });
    await editor.previewDraft(brand, 'rdmp', caller, { definition: draft() });
    const countTime = collection.countDocuments.firstCall.args[1].maxTimeMS;
    const findTime = collection.find.firstCall.args[1].maxTimeMS;
    assert(countTime > 0 && countTime <= limits.timeMs);
    assert(findTime > 0 && findTime <= countTime - 25);
  });
  it('reports native find deadline errors as timeouts too', async () => {
    cursor.toArray.rejects(Object.assign(new Error('PRIVATE DATABASE DETAILS'), { code: 50 }));
    await assert.rejects(editor.previewDraft(brand, 'rdmp', caller, { definition: draft() }), /PREVIEW_TIMEOUT/);
    assert(collection.find.firstCall.args[1].maxTimeMS > 0);
  });
  it('preserves saved relation expansion without applying preview limits', async () => {
    const result = await executor.performNamedQueryFromConfig(
      draft({ expandRelations: true }) as unknown as Parameters<typeof executor.performNamedQueryFromConfig>[0],
      {},
      brand,
      0,
      100
    );
    assert.equal(result.records.length, 1);
    assert.equal(relations.getRelatedRecords.firstCall.args[1], brand);
    assert.equal(collection.countDocuments.firstCall.args[1], undefined);
    assert.equal(collection.find.firstCall.args[1], undefined);
  });
});

describe('Bounded preview JSON accounting', () => {
  for (const value of [
    { text: 'ASCII \" \\ \b\t\n\f\r\u0000' },
    { text: 'é漢😀\ud800\udc00\ud800' },
    [undefined, null, NaN, Infinity, true, false, 123, -1.25, 1e100],
    { absent: undefined, date: new Date('2026-01-01T00:00:00Z'), nested: [{ value: 'x' }] },
  ]) {
    it(`matches serializer byte counts for ${JSON.stringify(value)}`, () => {
      const expected = Buffer.byteLength(JSON.stringify(value));
      assert.equal(boundedJsonBytes(value, expected), expected);
      assert(boundedJsonBytes(value, expected - 1) > expected - 1);
    });
  }
  it('stops visiting values as soon as the output cannot fit', () => {
    const value = {
      first: 'x'.repeat(600000),
      get later() {
        throw new Error('should never be read');
      },
    };
    assert.equal(boundedJsonBytes(value, limits.responseBytes), limits.responseBytes + 1);
  });
});
