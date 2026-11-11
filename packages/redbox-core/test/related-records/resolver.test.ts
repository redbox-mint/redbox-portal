import assert from 'node:assert/strict';
import { createSinonStubLogger } from '../logger.test';
import * as sinon from 'sinon';
import { cloneDeep } from 'lodash';
import { of } from 'rxjs';
import { createRelatedRecordsFixtures } from '../fixtures/related-records.fixtures';
import {
  resolveRelatedMetadata,
  RELATED_RESOLUTION_LIMITS,
  RequiredRelatedMetadataError,
  UnsupportedCalculatedSource,
  type RelatedResolverDependencies,
} from '../../src/related-records/resolver';
import { normalizeRelatedReferences } from '../../src/related-records/references';
import { projectRelatedMetadata } from '../../src/related-records/projection';
import { relatedOutputBytes } from '../../src/related-records/output-size';
import { projectRelatedSource } from '../../src/related-records/source-projection';
import { Services } from '../../src/services/RecordsService';
import type { RelatedRecordReadContext } from '../../src/related-records/types';
import type { RecordModel } from '../../src/model';
import type { RecordRelation } from '../../src/config/recordtype.config';

const asRecord = (value: unknown) => value as RecordModel;
describe('related output byte accounting', () => {
  it('counts serialized UTF-8, escaped keys/values, repeated objects and array holes exactly', () => {
    const shared = { value: 'é\n\u0000"\\', absent: undefined };
    const values = [{}, [], { first: shared, second: shared }, [null, undefined, NaN, Infinity, true],
      { 'é"': shared, date: new Date('2026-01-01T00:00:00Z') }, [Object('escaped\ntext'), Object(7), Object(false)], new Array(5)];
    for (const value of values) {
      const bytes = Buffer.byteLength(JSON.stringify(value));
      assert.equal(relatedOutputBytes(value, bytes), bytes);
      assert.throws(() => relatedOutputBytes(value, bytes - 1), RangeError);
    }
  });
  it('detaches overlapping projection paths without mutating borrowed ancestors', () => {
    const nested = Object.freeze({ title: 'Current', hidden: 'Retained' });
    const metadata = Object.freeze({ nested });
    const projection = projectRelatedMetadata(metadata, ['/nested', '/nested/title']);
    assert.deepEqual(projection.metadata, metadata);
    assert.notEqual(projection.metadata.nested, nested);
  });
});

describe('shared related metadata resolver', () => {
  let fixture: ReturnType<typeof createRelatedRecordsFixtures>;
  let context: RelatedRecordReadContext;
  let relations: RecordRelation[];
  let dependencies: RelatedResolverDependencies;
  let getMeta: sinon.SinonStub;
  const request = { relations: [{ relationId: 'primary-activity' }] };
  const run = (root?: unknown, selected = request) =>
    resolveRelatedMetadata(asRecord(root ?? fixture.root), context, selected, dependencies);
  beforeEach(() => {
    fixture = createRelatedRecordsFixtures();
    context = { brand: { id: fixture.tenants.primary } as never, user: fixture.users.reader as never, audience: 'api' };
    relations = fixture.relations.map(relation => ({
      ...relation,
      resolution: { metadataFields: ['/title'] },
    })) as RecordRelation[];
    getMeta = sinon
      .stub()
      .callsFake(async oid => cloneDeep(fixture.activeRecords.find(record => record.redboxOid === oid)));
    dependencies = {
      storage: { getMeta },
      relations: async () => relations,
      authorizeRoot: async () => true,
      canRead: record => record.authorization.view.includes(fixture.users.reader.username),
      sourceMetadata: async record => record.metadata,
    };
  });
  it('uses unsaved candidate references, returns detached minimal envelopes and does not mutate or save', async () => {
    const candidate = cloneDeep(fixture.root);
    candidate.metadata.primaryActivity = fixture.ids.activityB;
    Object.assign(candidate, { relatedMetadata: { stale: { metadata: 'untrusted' } } });
    const before = cloneDeep(candidate);
    const result = await run(candidate);
    assert.equal(result['primary-activity'].records[0].metadata.title, 'Activity B');
    assert.deepEqual(candidate, before);
    assert.deepEqual(Object.keys(result['primary-activity'].records[0]).sort(), [
      'metaMetadata',
      'metadata',
      'redboxOid',
      'revision',
    ]);
    assert.equal(getMeta.callCount, 1);
    assert.equal(getMeta.firstCall.args[0], fixture.ids.activityB);
  });
  it('deduplicates reads across relations and preserves first reference order', async () => {
    relations[0].cardinality = 'many';
    relations[0].oidProperty = 'oid';
    relations[1].oidProperty = 'oid';
    const candidate = {
      ...fixture.root,
      metadata: { primaryActivity: fixture.references.array, supportingActivities: fixture.references.array },
    };
    const result = await run(candidate, { relations: relations.map(relation => ({ relationId: relation.id! })) });
    for (const entry of Object.values(result))
      assert.deepEqual(
        entry.records.map(record => record.redboxOid),
        fixture.references.expectedOrder
      );
    assert.equal(getMeta.callCount, 2);
  });
  it('fetches current source data on each operation', async () => {
    assert.equal((await run())['primary-activity'].records[0].metadata.title, 'Activity A');
    fixture.activityA.metadata.title = 'Changed';
    assert.equal((await run())['primary-activity'].records[0].metadata.title, 'Changed');
  });
  for (const shape of ['denied', 'missing', 'deleted', 'crossTenant'] as const)
    it(`returns the identical safe unavailable result for ${shape}`, async () => {
      fixture.root.metadata.primaryActivity = fixture.ids[shape];
      assert.deepEqual((await run())['primary-activity'], {
        status: 'unavailable',
        records: [],
        issues: [{ code: 'unavailable' }],
      });
    });
  it('never grants source read access from service audience or service identity alone', async () => {
    context = { ...context, audience: 'service', serviceId: 'email' };
    fixture.root.metadata.primaryActivity = fixture.ids.denied;
    assert.equal((await run())['primary-activity'].status, 'unavailable');
  });

  it('does not expose wrong-type sources', async () => {
    fixture.activityA.metaMetadata.type = 'different';
    assert.equal((await run())['primary-activity'].status, 'unavailable');
  });
  it('reports partial results without inaccessible identifiers', async () => {
    relations[0].cardinality = 'many';
    const result = await run({
      ...fixture.root,
      metadata: { primaryActivity: [fixture.ids.activityA, fixture.ids.denied] },
    });
    assert.equal(result['primary-activity'].status, 'partial');
    assert.ok(!JSON.stringify(result).includes(fixture.ids.denied));
  });
  it('enforces required nonempty and complete results before returning', async () => {
    fixture.root.metadata.primaryActivity = '';
    await assert.rejects(
      run(undefined, { relations: [{ relationId: 'primary-activity', required: true }] }),
      RequiredRelatedMetadataError
    );
    assert.equal((await run())['primary-activity'].status, 'empty');
  });
  it('enforces cardinality after access filtering', async () => {
    const candidate = {
      ...fixture.root,
      metadata: { primaryActivity: [fixture.ids.activityA, fixture.ids.activityB] },
    };
    assert.deepEqual((await run(candidate))['primary-activity'], {
      status: 'invalid',
      records: [],
      issues: [{ code: 'cardinality' }],
    });
    candidate.metadata.primaryActivity = [fixture.ids.activityA, fixture.ids.denied];
    assert.equal((await run(candidate))['primary-activity'].status, 'partial');
  });
  it('rejects malformed references and reports only caller-visible indices', async () => {
    const result = await run({
      ...fixture.root,
      metadata: { primaryActivity: [fixture.ids.activityA, [fixture.ids.activityB]] },
    });
    assert.deepEqual(result['primary-activity'], {
      status: 'invalid',
      records: [],
      issues: [{ code: 'invalid-reference', referenceIndex: 1 }],
    });
    assert.equal(getMeta.callCount, 0);
  });
  it('rejects oversized requests, duplicate IDs and oversized reference lists', async () => {
    await assert.rejects(
      run(undefined, { relations: Array.from({ length: 9 }, (_, index) => ({ relationId: String(index) })) })
    );
    await assert.rejects(run(undefined, { relations: [...request.relations, ...request.relations] }));
    assert.equal(
      (
        await run({
          ...fixture.root,
          metadata: { primaryActivity: Array.from({ length: 51 }, (_, index) => String(index)) },
        })
      )['primary-activity'].issues[0].code,
      'limit-exceeded'
    );
    assert.equal(
      (await run({ ...fixture.root, metadata: { primaryActivity: 'x'.repeat(65537) } }))['primary-activity'].issues[0]
        .code,
      'limit-exceeded'
    );
    assert.equal(getMeta.callCount, 0);
  });
  it('rejects a large declared source projection before cloning or invoking source preparation', async () => {
    fixture.activityA.metadata.title = 'large'.repeat(256 * 1024);
    const prepare = sinon.spy(dependencies, 'sourceMetadata');
    assert.deepEqual((await run())['primary-activity'], {
      status: 'failed', records: [], issues: [{ code: 'limit-exceeded' }],
    });
    assert.equal(prepare.callCount, 0);
  });
  it('bounds large nested array projections and UTF-8 output bytes', async () => {
    relations[0].resolution!.metadataFields = ['/large'];
    Object.assign(fixture.activityA.metadata, { large: Array.from({ length: 600 }, () => ({ text: 'é'.repeat(1000) })) });
    assert.equal((await run())['primary-activity'].issues[0]?.code, 'limit-exceeded');
  });
  it('checks oversized source-preparer output before cloning its projection', async () => {
    dependencies.sourceMetadata = async () => ({ title: 'x'.repeat(1024 * 1024 + 1) });
    assert.deepEqual((await run())['primary-activity'], {
      status: 'failed', records: [], issues: [{ code: 'limit-exceeded' }],
    });
  });
  it('charges repeated cached projections against the cumulative output budget', async () => {
    fixture.activityA.metadata.title = 'x'.repeat(600 * 1024);
    const prepare = sinon.spy(dependencies, 'sourceMetadata');
    relations = Array.from({ length: 8 }, (_, index) => ({ ...relations[0], id: `copy-${index}` }));
    const selected = { relations: relations.map(relation => ({ relationId: relation.id! })) };
    const result = await run(undefined, selected);
    assert.equal(Object.values(result).filter(entry => entry.status === 'resolved').length, 6);
    for (const index of [6, 7]) assert.deepEqual(result[`copy-${index}`], {
      status: 'failed', records: [], issues: [{ code: 'limit-exceeded' }],
    });
    assert.ok(Buffer.byteLength(JSON.stringify(result)) <= 4 * 1024 * 1024);
    assert.equal(getMeta.callCount, 1);
    assert.equal(prepare.callCount, 1);
    await assert.rejects(run(undefined, { relations: selected.relations.map(relation => ({ ...relation, required: true })) }),
      RequiredRelatedMetadataError);
  });
  it('does not spend the projection budget on unselected large metadata', async () => {
    Object.assign(fixture.activityA.metadata, { unselected: 'x'.repeat(2 * 1024 * 1024) });
    const result = await run();
    assert.equal(result['primary-activity'].status, 'resolved');
    assert.deepEqual(result['primary-activity'].records[0].metadata, { title: 'Activity A' });
  });
  it('fails closed for unauthorized or cross-tenant roots before reading sources', async () => {
    dependencies.authorizeRoot = async () => false;
    await assert.rejects(run(), /Record unavailable/);
    dependencies.authorizeRoot = async () => true;
    await assert.rejects(
      run({ ...fixture.root, metaMetadata: { ...fixture.root.metaMetadata, brandId: 'other' } }),
      /Record unavailable/
    );
    assert.equal(getMeta.callCount, 0);
  });
  it('requires an effective principal even for a service audience', async () => {
    context = { ...context, audience: 'service', serviceId: '' } as never;
    await assert.rejects(run(), /context/);
  });
  it('requires trusted declared projections and known unambiguous relation IDs', async () => {
    delete relations[0].resolution;
    assert.equal((await run())['primary-activity'].issues[0].code, 'configuration-error');
    assert.equal(
      (await run(undefined, { relations: [{ relationId: 'unknown' }] })).unknown.issues[0].code,
      'configuration-error'
    );
    assert.equal(getMeta.callCount, 0);
  });
  it('bounds adapter fallback concurrency to six reads', async () => {
    relations[0].cardinality = 'many';
    let active = 0,
      maximum = 0;
    getMeta.callsFake(async oid => {
      active++;
      maximum = Math.max(maximum, active);
      await new Promise(resolve => setTimeout(resolve, 2));
      active--;
      return { ...fixture.activityA, redboxOid: oid };
    });
    const result = await run({
      ...fixture.root,
      metadata: { primaryActivity: Array.from({ length: 20 }, (_, index) => String(index)) },
    });
    assert.equal(result['primary-activity'].records.length, 20);
    assert.equal(maximum, 6);
  });
  it('keeps the six-read bound across relations when an earlier worker fails', async () => {
    relations[0].cardinality = 'many';
    relations[1].cardinality = 'many';
    let active = 0,
      maximum = 0;
    getMeta.callsFake(async oid => {
      active++;
      maximum = Math.max(maximum, active);
      try {
        if (oid === 'fail') throw new Error('read failed');
        await new Promise(resolve => setTimeout(resolve, 2));
        return { ...fixture.activityA, redboxOid: oid };
      } finally {
        active--;
      }
    });
    const result = await run(
      {
        ...fixture.root,
        metadata: {
          primaryActivity: ['fail', ...Array.from({ length: 12 }, (_, i) => `a${i}`)],
          supportingActivities: Array.from({ length: 12 }, (_, i) => `b${i}`),
        },
      },
      { relations: relations.map(relation => ({ relationId: relation.id! })) }
    );
    assert.equal(result['primary-activity'].status, 'failed');
    assert.equal(result['supporting-activities'].status, 'resolved');
    assert.equal(maximum, 6);
    assert.equal(active, 0);
  });

  it('caps operation reads at 200', async () => {
    relations = Array.from({ length: 5 }, (_, index) => ({
      ...relations[0],
      id: String(index),
      cardinality: 'many',
      localField: `metadata.refs${index}`,
    }));
    const metadata = Object.fromEntries(
      relations.map((relation, index) => [
        `refs${index}`,
        Array.from({ length: 50 }, (_, offset) => `${index}-${offset}`),
      ])
    );
    const result = await run(
      { ...fixture.root, metadata },
      { relations: relations.map(relation => ({ relationId: relation.id! })) }
    );
    assert.equal(result['4'].issues[0].code, 'limit-exceeded');
    assert.equal(getMeta.callCount, 200);
  });
  it('expires stalled reads and never publishes late results', async () => {
    const clock = sinon.useFakeTimers();
    try {
      let finish!: (record: unknown) => void;
      getMeta.callsFake(
        () =>
          new Promise(resolve => {
            finish = resolve;
          })
      );
      const pending = run();
      await clock.tickAsync(RELATED_RESOLUTION_LIMITS.deadlineMs);
      const result = await pending;
      assert.equal(result['primary-activity'].issues[0].code, 'limit-exceeded');
      finish(fixture.activityA);
      await clock.tickAsync(1);
      assert.equal(result['primary-activity'].records.length, 0);
    } finally {
      clock.restore();
    }
  });
  it('does not inspect or clone prepared metadata arriving after the deadline', async () => {
    const clock = sinon.useFakeTimers();
    try {
      let finish!: (metadata: unknown) => void;
      dependencies.sourceMetadata = () => new Promise(resolve => { finish = resolve; });
      const pending = run();
      await clock.tickAsync(RELATED_RESOLUTION_LIMITS.deadlineMs);
      const result = await pending;
      let inspected = false;
      finish({ get title() { inspected = true; return 'Late title'; } });
      await clock.tickAsync(1);
      assert.equal(result['primary-activity'].issues[0].code, 'limit-exceeded');
      assert.equal(inspected, false);
    } finally {
      clock.restore();
    }
  });
  for (const direction of ['inbound', 'outbound'] as const)
    it(`reports unsupported ${direction} non-OID fallback without using the graph walker`, async () => {
      relations[0].direction = direction;
      relations[0].foreignField = 'metadata.plan';
      assert.equal((await run())['primary-activity'].issues[0].code, 'unsupported-relation');
      assert.equal(getMeta.callCount, 0);
    });
  it('queries only trusted relation fields; caller options cannot inject a native predicate', async () => {
    relations[0].foreignField = 'metadata.plan';
    relations[0].cardinality = 'many';
    const find = sinon
      .stub()
      .resolves({ records: [fixture.activityB, fixture.activityA, fixture.denied], complete: true, overflow: false });
    dependencies.storage.findRecordsByRelation = find;
    const injected = {
      relations: [{ relationId: 'primary-activity', predicate: { $where: 'evil' }, foreignField: 'authorization' }],
      predicate: { $where: 'evil' },
      context: { audience: 'service' },
    };
    const result = await run(undefined, injected);
    assert.deepEqual(find.firstCall.args[0], {
      context,
      recordType: 'related-activity',
      foreignField: 'metadata.plan',
      values: [fixture.ids.activityA],
      limit: 50,
    });
    assert.deepEqual(
      result['primary-activity'].records.map(record => record.redboxOid),
      [fixture.ids.activityA, fixture.ids.activityB]
    );
    assert.equal(result['primary-activity'].status, 'resolved');
  });
  it('uses native authorized direct lookups when supported and deduplicates across relations', async () => {
    relations[1] = { ...relations[0], id: 'second' };
    dependencies.storage.findRecordsByRelation = sinon
      .stub()
      .resolves({ records: [fixture.activityA], complete: true, overflow: false });
    await run(undefined, { relations: [{ relationId: 'primary-activity' }, { relationId: 'second' }] });
    assert.equal((dependencies.storage.findRecordsByRelation as sinon.SinonStub).callCount, 1);
    assert.equal(getMeta.callCount, 0);
  });
  it('does not present overflow or incomplete native matches as complete', async () => {
    relations[0].foreignField = 'metadata.plan';
    dependencies.storage.findRecordsByRelation = async () => ({
      records: [asRecord(fixture.activityA)],
      complete: false,
      overflow: true,
    });
    assert.deepEqual((await run())['primary-activity'], {
      status: 'failed',
      records: [],
      issues: [{ code: 'limit-exceeded' }],
    });
  });
  it('fails safely on source read/projection errors and calculated chains', async () => {
    getMeta.rejects(new Error('secret source identifier'));
    assert.deepEqual((await run())['primary-activity'], {
      status: 'failed',
      records: [],
      issues: [{ code: 'source-read-failed' }],
    });
    getMeta.callsFake(async () => fixture.activityA);
    dependencies.sourceMetadata = async () => {
      throw new UnsupportedCalculatedSource();
    };
    assert.equal((await run())['primary-activity'].issues[0].code, 'unsupported-relation');
  });
});

describe('related reference and field projection helpers', () => {
  it('normalizes scalar, object, custom-path and ordered mixed references', () => {
    assert.deepEqual(normalizeRelatedReferences(['b', { nested: { oid: ' a ' } }, 'b', '', null], 'nested.oid'), {
      values: ['b', 'a'],
      invalidIndices: [],
    });
    assert.deepEqual(normalizeRelatedReferences({ oid: 1 }, 'oid'), { values: [], invalidIndices: [0] });
    assert.deepEqual(normalizeRelatedReferences([' ', 42, ['a'], {}], 'oid'), {
      values: [],
      invalidIndices: [1, 2, 3],
    });
  });
  it('retains Lodash literal dotted-key precedence and inherited identifier paths', () => {
    const reference = Object.assign(Object.create({ inherited: { oid: ' inherited ' } }), {
      'nested.oid': 'literal', nested: { oid: 'nested' },
    });
    assert.deepEqual(normalizeRelatedReferences(reference, 'nested.oid').values, ['literal']);
    assert.deepEqual(normalizeRelatedReferences(reference, ['nested', 'oid']).values, ['nested']);
    assert.deepEqual(normalizeRelatedReferences(reference, 'inherited.oid').values, ['inherited']);
  });
  it('preserves literal keys and every explicit empty value; omits absent fields', () => {
    const fixture = createRelatedRecordsFixtures();
    const fields = [
      '/literal.key',
      '/literal/key',
      '/slash~1key',
      '/tilde~0key',
      '/namespace:title',
      '/emptyText',
      '/nullable',
      '/enabled',
      '/count',
      '/emptyList',
      '/absent',
    ];
    const projected = projectRelatedMetadata(fixture.activityA.metadata, fields);
    assert.deepEqual(projected, {
      metadata: {
        'literal.key': 'literal dot',
        literal: { key: 'nested value' },
        'slash/key': 'literal slash',
        'tilde~key': 'literal tilde',
        'namespace:title': 'literal colon',
        emptyText: '',
        nullable: null,
        enabled: false,
        count: 0,
        emptyList: [],
      },
      absent: ['/absent'],
    });
  });
  it('rejects invalid and unrestricted pointers and preserves array containers', () => {
    assert.throws(() => projectRelatedMetadata({}, ['']));
    assert.throws(() => projectRelatedMetadata({}, ['/bad~2pointer']));
    assert.deepEqual(projectRelatedMetadata({ rows: [{ title: 'A', secret: true }] }, ['/rows/0/title']).metadata, {
      rows: [{ title: 'A' }],
    });
  });
  it('uses own properties and safely handles prototype-named literal keys', () => {
    const projected = projectRelatedMetadata(JSON.parse('{"__proto__":{"x":1}}'), ['/__proto__/x', '/constructor']);
    assert.deepEqual(projected.metadata, JSON.parse('{"__proto__":{"x":1}}'));
    assert.deepEqual(projected.absent, ['/constructor']);
    assert.equal(({} as { x?: number }).x, undefined);
  });
});

describe('related source projection and RecordsService integration', () => {
  let fixture: ReturnType<typeof createRelatedRecordsFixtures>;
  let context: RelatedRecordReadContext;
  let saved: Record<string, unknown>;
  let forms: { getFormByName: sinon.SinonStub; buildClientFormConfig: sinon.SinonStub };
  let project: sinon.SinonStub;
  let service: Services.Records;
  let getMeta: sinon.SinonStub;
  let relations: RecordRelation[];
  const request = { relations: [{ relationId: 'primary-activity' }] };
  beforeEach(() => {
    fixture = createRelatedRecordsFixtures();
    context = {
      brand: { id: fixture.tenants.primary, name: 'test' } as never,
      user: fixture.users.reader as never,
      audience: 'browser',
    };
    relations = fixture.relations.map(relation => ({
      ...relation,
      resolution: { metadataFields: ['/title', '/emptyText', '/absent'] },
    })) as RecordRelation[];
    forms = {
      getFormByName: sinon
        .stub()
        .returns(of({ configuration: { type: 'related-activity', componentDefinitions: [] } })),
      buildClientFormConfig: sinon.stub().resolves({ componentDefinitions: [] }),
    };
    project = sinon.stub().callsFake(async metadata => ({ title: metadata.title, emptyText: metadata.emptyText }));
    saved = Object.fromEntries(
      ['sails', 'FormsService', 'FormRecordConsistencyService', 'RecordTypesService', 'RolesService', '_'].map(key => [
        key,
        Reflect.get(globalThis, key),
      ])
    );
    Object.assign(globalThis, {
      sails: { config: { reusableFormDefinitions: {}, record: {} }, log: createSinonStubLogger(sinon) },
      RolesService: { getRole: (_brand: unknown, name: string) => ({ id: name, name }) },
      FormsService: forms,
      FormRecordConsistencyService: { projectMetadataClientFormConfig: project },
      RecordTypesService: {
        get: sinon
          .stub()
          .callsFake((_brand, type) => of({ name: type, relatedTo: type === 'related-plan' ? relations : [] })),
      },
      _: require('lodash'),
    });
    service = new Services.Records();
    getMeta = sinon
      .stub()
      .callsFake(async oid => cloneDeep(fixture.activeRecords.find(record => record.redboxOid === oid)));
    service.storageService = { getMeta } as never;
  });
  afterEach(() => {
    for (const [key, value] of Object.entries(saved)) {
      if (value === undefined) Reflect.deleteProperty(globalThis, key);
      else Reflect.set(globalThis, key, value);
    }
  });
  it('reuses caller-effective browser selection and intersects its output without raw fallback', async () => {
    const result = await service.resolveRelatedMetadata(asRecord(fixture.root), context, request);
    assert.deepEqual(result['primary-activity'].records[0].metadata, { title: 'Activity A', emptyText: '' });
    assert.deepEqual(result['primary-activity'].issues, [{ code: 'field-absent', fieldPointer: '/absent' }]);
    assert.deepEqual(
      forms.getFormByName.getCalls().map(call => call.args[1]),
      [true, false]
    );
    assert.equal(forms.buildClientFormConfig.firstCall.args[1], 'view');
    assert.equal(project.firstCall.args[2], 'view');
    assert.equal(forms.buildClientFormConfig.firstCall.args[8], false);
    assert.equal(forms.buildClientFormConfig.firstCall.args[9], true); // never recurse during projection
    assert.equal(project.callCount, 1);
    project.rejects(new Error('restricted'));
    const failed = await service.resolveRelatedMetadata(asRecord(fixture.root), context, request);
    assert.equal(failed['primary-activity'].status, 'failed');
    assert.equal(failed['primary-activity'].records.length, 0);
  });
  function useModeConstrainedSourceForm() {
    const { Services: FormServices } = require('../../src/services/FormsService');
    const { Services: ConsistencyServices } = require('../../src/services/FormRecordConsistencyService');
    const formService = new FormServices.Forms();
    const consistency = new ConsistencyServices.FormRecordConsistency();
    const configuration = {
      name: 'related-activity-1.0-draft',
      type: 'related-activity',
      componentDefinitions: [
        { name: 'title', component: { class: 'SimpleInputComponent' } },
        { name: 'editOnly', constraints: { allowModes: ['edit'] }, component: { class: 'SimpleInputComponent' } },
      ],
    };
    forms.getFormByName.returns(of({ configuration }));
    forms.buildClientFormConfig.callsFake(formService.buildClientFormConfig.bind(formService));
    project.callsFake(consistency.projectMetadataClientFormConfig.bind(consistency));
    for (const relation of relations) relation.resolution!.metadataFields = ['/title', '/editOnly'];
    Object.assign(fixture.activityA.metadata, { editOnly: 'Only editors of A' });
    Object.assign(fixture.activityB.metadata, { editOnly: 'Only editors of B' });
  }

  it('excludes edit-only fields for a view-only caller using the real form and metadata projectors', async () => {
    useModeConstrainedSourceForm();
    const result = await service.resolveRelatedMetadata(asRecord(fixture.root), context, request);
    assert.equal(result['primary-activity'].status, 'resolved');
    assert.ok(!Object.hasOwn(result['primary-activity'].records[0].metadata, 'editOnly'));
    assert.ok(
      result['primary-activity'].issues.some(
        issue => issue.code === 'field-absent' && issue.fieldPointer === '/editOnly'
      )
    );
    assert.equal(forms.getFormByName.lastCall.args[1], false);
    assert.equal(forms.buildClientFormConfig.lastCall.args[1], 'view');
    assert.equal(project.lastCall.args[2], 'view');
  });

  it('includes edit-only fields for an edit-capable caller and keeps projections isolated between callers', async () => {
    useModeConstrainedSourceForm();
    const editorContext = { ...context, user: fixture.users.editor as never };
    const edited = await service.resolveRelatedMetadata(asRecord(fixture.root), editorContext, request);
    assert.equal(edited['primary-activity'].records[0].metadata.editOnly, 'Only editors of A');
    assert.equal(forms.getFormByName.lastCall.args[1], true);
    assert.equal(forms.buildClientFormConfig.lastCall.args[1], 'edit');
    assert.equal(project.lastCall.args[2], 'edit');
    const viewed = await service.resolveRelatedMetadata(asRecord(fixture.root), context, request);
    assert.ok(!Object.hasOwn(viewed['primary-activity'].records[0].metadata, 'editOnly'));
    const editedAgain = await service.resolveRelatedMetadata(asRecord(fixture.root), editorContext, request);
    assert.equal(editedAgain['primary-activity'].records[0].metadata.editOnly, 'Only editors of A');
  });

  for (const populated of [false, true]) {
    it(`scopes related field visibility to the source brand with ${populated ? 'populated' : 'primitive'} role branding`, async () => {
      const { Services: FormServices } = require('../../src/services/FormsService');
      const { Services: ConsistencyServices } = require('../../src/services/FormRecordConsistencyService');
      const formService = new FormServices.Forms();
      const consistency = new ConsistencyServices.FormRecordConsistency();
      const roleBrand = (id: string) => populated ? { id } : id;
      const roles = [
        { id: 'local-researcher', name: 'researcher', branding: roleBrand(fixture.tenants.primary) },
        // Mix populated and primitive representations in the same effective user.
        { id: 'foreign-admin', name: 'admin', branding: populated ? fixture.tenants.other : { id: fixture.tenants.other } },
      ];
      const user = { ...fixture.users.reader, roles };
      const browserContext = { ...context, user: user as never };
      fixture.activityA.authorization.edit.push(user.username);
      const configuration = { name: 'related-activity-1.0-draft', type: 'related-activity', componentDefinitions: [
        { name: 'title', model: { class: 'SimpleInputModel' }, component: { class: 'SimpleInputComponent' } },
        { name: 'researcherOnly', model: { class: 'SimpleInputModel' }, constraints: { authorization: { allowRoles: ['researcher'] } },
          component: { class: 'SimpleInputComponent' } },
        { name: 'adminOnly', model: { class: 'SimpleInputModel' }, constraints: { authorization: { allowRoles: ['admin'] } },
          component: { class: 'SimpleInputComponent' } },
      ] };
      forms.getFormByName.returns(of({ configuration }));
      forms.buildClientFormConfig.callsFake(formService.buildClientFormConfig.bind(formService));
      project.callsFake(consistency.projectMetadataClientFormConfig.bind(consistency));
      relations[0].resolution!.metadataFields = ['/title', '/researcherOnly', '/adminOnly'];
      Object.assign(fixture.activityA.metadata, { researcherOnly: 'Local researcher field', adminOnly: 'Local admin secret' });
      const originalUser = cloneDeep(user);

      const foreignAdmin = await service.resolveRelatedMetadata(asRecord(fixture.root), browserContext, request);
      assert.equal(foreignAdmin['primary-activity'].status, 'resolved');
      assert.deepEqual(foreignAdmin['primary-activity'].records[0].metadata,
        { title: 'Activity A', researcherOnly: 'Local researcher field' });
      assert.ok(!JSON.stringify(foreignAdmin).includes('Local admin secret'));
      assert.equal(forms.buildClientFormConfig.lastCall.args[1], 'edit');
      assert.deepEqual(forms.buildClientFormConfig.lastCall.args[2], ['researcher']);
      assert.deepEqual(user, originalUser);

      roles.push({ id: 'local-admin', name: 'admin', branding: roleBrand(fixture.tenants.primary) });
      const localAdmin = await service.resolveRelatedMetadata(asRecord(fixture.root), browserContext, request);
      assert.equal(localAdmin['primary-activity'].records[0].metadata.adminOnly, 'Local admin secret');
      assert.deepEqual(forms.buildClientFormConfig.lastCall.args[2], ['researcher', 'admin']);

      roles.pop();
      const foreignAgain = await service.resolveRelatedMetadata(asRecord(fixture.root), browserContext, request);
      assert.ok(!Object.hasOwn(foreignAgain['primary-activity'].records[0].metadata, 'adminOnly'));
      assert.deepEqual(user, originalUser);
    });
  }
  it('ignores missing and malformed role branding when constructing related source fields', async () => {
    const { getEffectiveRelatedClientForm } = require('../../src/related-records/effective-form');
    const roles = [
      { name: 'admin' }, { name: 'admin', branding: null }, { name: 'admin', branding: {} },
      { name: 'admin', branding: { id: null } }, { name: 'admin', branding: false },
      { name: 'researcher', branding: fixture.tenants.primary },
    ];
    const req = { user: { ...fixture.users.reader, roles }, session: {}, headers: {}, param: () => undefined };
    await getEffectiveRelatedClientForm(req, context.brand, fixture.activityA, 'related-activity-1.0-draft', false, 'view', true);
    assert.equal(forms.buildClientFormConfig.lastCall.args[1], 'view');
    assert.deepEqual(forms.buildClientFormConfig.lastCall.args[2], ['researcher']);
    for (const id of [undefined, null, {}, false, '']) {
      const malformedReq = { ...req, user: { ...req.user, roles: [{ name: 'admin', branding: String(id) }] } };
      await getEffectiveRelatedClientForm(malformedReq, { id }, fixture.activityA, 'related-activity-1.0-draft', false, 'view', true);
      assert.deepEqual(forms.buildClientFormConfig.lastCall.args[2], []);
    }
  });

  it('selects each source permission mode independently within one deduplicated result', async () => {
    useModeConstrainedSourceForm();
    relations[0].cardinality = 'many';
    fixture.activityB.authorization.edit.push(fixture.users.reader.username);
    const candidate = {
      ...fixture.root,
      metadata: { primaryActivity: [fixture.ids.activityA, fixture.ids.activityB, fixture.ids.activityA] },
    };
    const result = await service.resolveRelatedMetadata(asRecord(candidate), context, request);
    assert.deepEqual(
      result['primary-activity'].records.map(record => record.redboxOid),
      [fixture.ids.activityA, fixture.ids.activityB]
    );
    assert.deepEqual(
      result['primary-activity'].records.map(record => Object.hasOwn(record.metadata, 'editOnly')),
      [false, true]
    );
    assert.equal(result['primary-activity'].records[1].metadata.editOnly, 'Only editors of B');
    assert.deepEqual(
      forms.buildClientFormConfig.getCalls().map(call => call.args[1]),
      ['view', 'edit']
    );
    assert.deepEqual(
      project.getCalls().map(call => call.args[2]),
      ['view', 'edit']
    );
    assert.deepEqual(
      forms.getFormByName.getCalls().map(call => call.args[1]),
      [true, false, true, true]
    );
    assert.equal(getMeta.getCalls().filter(call => call.args[0] === fixture.ids.activityA).length, 1);
  });

  it('denies a forged candidate ACL using the authoritative stored root', async () => {
    fixture.root.authorization.view = [];
    fixture.root.authorization.edit = [];
    fixture.root.authorization.viewRoles = [];
    fixture.root.authorization.editRoles = [];
    const forged = {
      ...fixture.root,
      authorization: { view: [fixture.users.reader.username], edit: [], viewRoles: [], editRoles: [] },
    };
    await assert.rejects(service.resolveRelatedMetadata(asRecord(forged), context, request), /Record unavailable/);
    assert.equal(getMeta.callCount, 1);
  });
  it('authorizes an unsaved root through existing create checks and follows its candidate reference', async () => {
    const create = sinon.stub(service, 'hasCreateAccess').resolves(true);
    const candidate = {
      ...fixture.root,
      redboxOid: '',
      metadata: { ...fixture.root.metadata, primaryActivity: fixture.ids.activityB },
    };
    const result = await service.resolveRelatedMetadata(asRecord(candidate), context, request);
    assert.equal(create.callCount, 1);
    assert.equal(result['primary-activity'].records[0].redboxOid, fixture.ids.activityB);
    create.resolves(false);
    await assert.rejects(service.resolveRelatedMetadata(asRecord(candidate), context, request), /Record unavailable/);
  });
  it('authorizes a preallocated create OID only with explicit server-owned create context', async () => {
    const create = sinon.stub(service, 'hasCreateAccess').resolves(true);
    const candidate = { ...fixture.root, redboxOid: 'preallocated-create-oid' };
    const createContext = { ...context, rootOperation: 'create' as const };
    const result = await service.resolveRelatedMetadata(asRecord(candidate), createContext, request);
    assert.equal(result['primary-activity'].records[0].redboxOid, fixture.ids.activityA);
    assert.equal(create.callCount, 1);
    assert.equal(getMeta.getCalls().some(call => call.args[0] === candidate.redboxOid), false);

    getMeta.resetHistory();
    create.resolves(false);
    await assert.rejects(service.resolveRelatedMetadata(asRecord(candidate), createContext, request), /Record unavailable/);
    assert.equal(getMeta.callCount, 0);

    create.resolves(true);
    await assert.rejects(service.resolveRelatedMetadata(asRecord(candidate), context, request), /Record unavailable/);
    assert.equal(getMeta.calledOnceWithExactly(candidate.redboxOid), true);
    assert.equal(create.callCount, 2);
    create.restore();
  });
  it('retains source ACL checks for preallocated creates', async () => {
    const create = sinon.stub(service, 'hasCreateAccess').resolves(true);
    const candidate = { ...fixture.root, redboxOid: 'preallocated-create-oid',
      metadata: { primaryActivity: fixture.ids.denied } };
    const result = await service.resolveRelatedMetadata(asRecord(candidate), { ...context, rootOperation: 'create' }, request);
    assert.equal(result['primary-activity'].status, 'unavailable');
    assert.deepEqual(result['primary-activity'].records, []);
    create.restore();
  });
  it('always checks stored-root access for stored read operations, even with create context', async () => {
    const create = sinon.stub(service, 'hasCreateAccess').resolves(true);
    fixture.root.authorization = { view: [], edit: [], viewRoles: [], editRoles: [] };
    await assert.rejects(service.getMetaWithRelatedMetadata(fixture.ids.root, { ...context, rootOperation: 'create' }, request),
      /Record unavailable/);
    assert.equal(create.callCount, 0);
    assert.equal(getMeta.callCount, 1);
    create.restore();
  });
  it('rebuilds stale runtime enrichment on a detached record, preserving all local state and audit fields', async () => {
    const candidate = Object.assign(cloneDeep(fixture.root), { relatedMetadata: { old: {} } });
    const before = cloneDeep(candidate);
    const enriched = await service.enrichWithRelatedMetadata(asRecord(candidate), context, request);
    assert.deepEqual(candidate, before);
    assert.notEqual(enriched, candidate);
    assert.equal(enriched.relatedMetadata!['primary-activity'].records[0].metadata.title, 'Activity A');
    const stripped = { ...enriched };
    delete stripped.relatedMetadata;
    const original = { ...candidate } as Record<string, unknown>;
    delete original.relatedMetadata;
    assert.deepEqual(stripped, original);
  });
  it('loads a stored root only once and leaves raw and graph exports intact', async () => {
    const enriched = await service.getMetaWithRelatedMetadata(fixture.ids.root, context, request);
    assert.ok(enriched.relatedMetadata);
    assert.equal(getMeta.getCalls().filter(call => call.args[0] === fixture.ids.root).length, 1);
    const raw = await service.getMeta(fixture.ids.root);
    assert.deepEqual(raw, fixture.root);
    const testing = process.env.sails_redbox__mochaTesting;
    let exported: Record<string, unknown>;
    try {
      process.env.sails_redbox__mochaTesting = 'false';
      exported = service.exports();
    } finally {
      if (testing === undefined) delete process.env.sails_redbox__mochaTesting;
      else process.env.sails_redbox__mochaTesting = testing;
    }
    for (const method of [
      'resolveRelatedMetadata',
      'enrichWithRelatedMetadata',
      'getMetaWithRelatedMetadata',
      'getMeta',
      'getRelatedRecords',
      'getMetaWithRelationships',
    ])
      assert.equal(typeof exported[method], 'function');
  });
  it('includes stalled stored-root reads in the operation deadline and starts no late source reads', async () => {
    const clock = sinon.useFakeTimers();
    try {
      let finish!: (record: unknown) => void;
      getMeta.callsFake(
        () =>
          new Promise(resolve => {
            finish = resolve;
          })
      );
      const pending = assert.rejects(service.getMetaWithRelatedMetadata(fixture.ids.root, context, request));
      await clock.tickAsync(RELATED_RESOLUTION_LIMITS.deadlineMs);
      await pending;
      finish(fixture.root);
      await clock.tickAsync(1);
      assert.equal(getMeta.callCount, 1);
    } finally {
      clock.restore();
    }
  });

  it('uses declared fields for imported sources without a form, including browser audiences', async () => {
    fixture.activityA.metaMetadata.form = '';
    const result = await service.resolveRelatedMetadata(asRecord(fixture.root), context, request);
    assert.equal(result['primary-activity'].records[0].metadata.title, 'Activity A');
    assert.equal(forms.getFormByName.callCount, 0);
    assert.equal(project.callCount, 0);
  });
  it('treats the generated-view-only placeholder form like an imported source without a form', async () => {
    fixture.activityA.metaMetadata.form = 'generated-view-only';
    const result = await service.resolveRelatedMetadata(asRecord(fixture.root), context, request);
    assert.equal(result['primary-activity'].status, 'resolved');
    assert.equal(result['primary-activity'].records[0].metadata.title, 'Activity A');
    assert.equal(forms.getFormByName.callCount, 0);
    assert.equal(project.callCount, 0);
  });
  it('fails closed when a declared source form cannot be loaded', async () => {
    forms.getFormByName.returns(of(null));
    const result = await service.resolveRelatedMetadata(asRecord(fixture.root), context, request);
    assert.equal(result['primary-activity'].status, 'failed');
    assert.equal(result['primary-activity'].records.length, 0);
  });
  it('rejects active calculated-source chains using authoritative compiled descriptors, without fetching or expressions', async () => {
    const canonical = {
      type: 'related-activity',
      componentDefinitions: [
        {
          name: 'title',
          model: { class: 'TextField' },
          relatedDisplay: { relationId: 'parent' },
          component: { class: 'TextFieldComponent', config: {} },
        },
      ],
    };
    forms.getFormByName.returns(of({ configuration: canonical }));
    Reflect.set(globalThis, 'RecordTypesService', {
      get: () =>
        of({
          relatedTo: [
            {
              id: 'parent',
              recordType: 'related-activity',
              localField: 'metadata.parent',
              foreignField: 'redboxOid',
              resolution: { metadataFields: ['/title'] },
            },
          ],
        }),
    });
    fixture.activityA.metadata['parent'] = fixture.ids.activityB;
    await assert.rejects(
      projectRelatedSource(asRecord(fixture.activityA), ['/title'], { ...context, audience: 'api' }, service),
      UnsupportedCalculatedSource
    );
    assert.equal(getMeta.callCount, 0);
    assert.equal(forms.buildClientFormConfig.callCount, 0);
    delete fixture.activityA.metadata['parent'];
    assert.equal(
      await projectRelatedSource(asRecord(fixture.activityA), ['/title'], { ...context, audience: 'api' }, service),
      fixture.activityA.metadata
    );
  });
});
