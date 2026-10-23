import { firstValueFrom } from 'rxjs';
import { Services } from '../../src/CoreService';
import assert from 'node:assert/strict';
import {
  namedQueryCriteria,
  namedQueryScalar,
  namedQueryFieldType,
  namedQueryTarget,
  executeNamedQuery,
  registerNamedQueryTarget,
} from '../../src/persistence/reference/NamedQueryExecution';
import { NamedQueryConfig } from '../../src/services/NamedQueryService';
import { projectNamedQueryRecords } from '../../src/persistence/reference/projection';
import {
  encodeReference,
  decodeReference,
  referenceFields,
  type ReferenceCollection,
} from '../../src/persistence/reference/physical';
import { ObjectId } from 'mongodb';
import { initializeReferencePersistence, getReferenceRepositories } from '../../src/persistence/reference/runtime';
import { cleanupPersistence } from '../../src/persistence/runtime';

function application(): Sails.Application {
  return {
    config: {},
    log: { warn() {} },
  } as unknown as Sails.Application;
}
describe('reference persistence domain boundaries', () => {
  it('refuses inherited methods in projections while preserving stored properties with the same name', () => {
    assert.throws(
      () => projectNamedQueryRecords([{ id: 'fixture', configuration: {} }], ['configuration.toString']),
      /non-data member/
    );
    assert.deepEqual(
      projectNamedQueryRecords([{ id: 'fixture', configuration: { toString: 'stored' } }], ['configuration.toString']),
      [{ id: 'fixture', configuration: { toString: 'stored' } }]
    );
    assert.deepEqual(projectNamedQueryRecords([{ id: 'fixture', configuration: {} }], ['configuration.absent']), [
      { id: 'fixture' },
    ]);
  });
  it('keeps repository-backed service Observables cold and shares the first result/error', async () => {
    class Bridge extends Services.Core.Service {
      operation<T>(execute: () => Promise<T>) {
        return this.getObservable<T>(execute);
      }
    }
    const bridge = new Bridge();
    let calls = 0;
    const result = bridge.operation(async () => ++calls);
    assert.equal(calls, 0);
    assert.equal(await firstValueFrom(result), 1);
    assert.equal(await firstValueFrom(result), 1);
    assert.equal(calls, 1);
    const failure = new Error('repository failure');
    const failed = bridge.operation(async () => {
      calls++;
      throw failure;
    });
    await assert.rejects(firstValueFrom(failed), error => error === failure);
    await assert.rejects(firstValueFrom(failed), error => error === failure);
    assert.equal(calls, 2);
  });

  it('requires explicit named-query target metadata rather than attribute discovery', () => {
    const app = application();
    assert.throws(() => namedQueryTarget(app, 'institution'), /register an explicit tenant-scoped/);
    assert.equal(namedQueryTarget(app, 'form').scope.fieldPath, 'branding');
  });
  it('refuses native record Mongo-ID predicates/projections rather than silently returning fewer rows', async () => {
    const app = application();
    const request = { target: 'record', tenant: 'tenant', expression: {}, start: 0, rows: 1 };
    for (const input of [
      { ...request, expression: { id: '012345678901234567890123' } },
      { ...request, select: ['id'] },
      { ...request, sort: [{ _id: 'ASC' as const }] },
    ])
      await assert.rejects(
        executeNamedQuery(app, input),
        /use redboxOid|not valid record fields|storage persistence has not been initialized/
      );
  });
  it('validates and translates the existing comparison and logical dialect without dropping clauses', () => {
    assert.deepEqual(
      namedQueryCriteria(
        { metadata: { title: { contains: 'A.+[test]' } }, or: [{ score: { '>=': 2 } }, { flag: false }] },
        true
      ),
      {
        'metadata.title': { $regex: 'A\\.\\+\\[test\\]', $options: 'i' },
        $or: [{ score: { $gte: 2 } }, { flag: false }],
      }
    );
    assert.deepEqual(namedQueryCriteria({ id: { $in: ['id'] }, score: { $gte: 2, $lte: 5 } }, false), {
      id: { in: ['id'] },
      score: { '>=': 2, '<=': 5 },
    });
    for (const expression of [
      { $where: 'private' },
      { title: { like: '%x%' } },
      { title: { not: 'x' } },
      { title: { $unknown: 1 } },
      { $or: [] },
      { title: { in: 3 } },
      JSON.parse('{"__proto__":{"leak":1}}'),
    ])
      assert.throws(() => namedQueryCriteria(expression, true), /Unsupported named-query/);
  });
  it('validates nullable identity operands before passing through private BSON keys', () => {
    for (const expression of [{ $in: [null] }, { $nin: [null] }, { $gte: null }])
      assert.throws(() => namedQueryScalar(expression, 'id'), /Unsupported named-query/);
    const id = new ObjectId();
    assert.equal(namedQueryScalar(id, 'id'), id);
    assert.equal(namedQueryScalar(null, 'id'), null);
    assert.deepEqual(namedQueryScalar({ $in: [id] }, 'id'), { $in: [id] });
  });
  it('enforces tenant scope before an explicit institution executor receives a query', async () => {
    const app = application();
    registerNamedQueryTarget(app, {
      metadata: { name: 'institution', scope: { type: 'field', fieldPath: 'branding' } },
      async execute(request) {
        assert.equal(request.tenant, 'owner');
        assert.equal(request.expression.branding, 'owner');
        return { total: 0, records: [] };
      },
    });
    await executeNamedQuery(app, {
      target: 'institution',
      tenant: 'owner',
      expression: { branding: 'other' },
      start: 0,
      rows: 1,
    });
    assert.throws(() =>
      registerNamedQueryTarget(app, {
        metadata: { name: 'record', scope: { type: 'field', fieldPath: 'branding' } },
        async execute() {
          return { total: 0, records: [] };
        },
      })
    );
    await assert.rejects(
      executeNamedQuery(app, { target: 'institution', tenant: 'owner', expression: {}, start: 0, rows: 0 })
    );
  });
  it('refuses malformed and repeated sort terms before dispatching a query', async () => {
    const app = application();
    let dispatched = false;
    registerNamedQueryTarget(app, {
      metadata: { name: 'sortFixture', scope: { type: 'field', fieldPath: 'branding' } },
      async execute() {
        dispatched = true;
        return { total: 0, records: [] };
      },
    });
    for (const sort of [[{}], [{ name: 'ASC', id: 'DESC' }], [{ name: 'DESC' }, { name: 'ASC' }]])
      await assert.rejects(
        executeNamedQuery(app, {
          target: 'sortFixture',
          tenant: 'owner',
          expression: {},
          start: 0,
          sort: sort as Array<Record<string, 'ASC' | 'DESC'>>,
        }),
        /Unsupported named-query/
      );
    assert.equal(dispatched, false);
  });
  it('preserves Waterline intersections of multiple text modifiers on one field', () => {
    const expression = { name: { contains: 'red', endsWith: 'blue' } };
    assert.deepEqual(namedQueryCriteria(expression, false), expression);
    assert.deepEqual(namedQueryCriteria(expression, true), {
      $and: [{ name: { $regex: 'red', $options: 'i' } }, { name: { $regex: 'blue$', $options: 'i' } }],
    });
    assert.deepEqual(namedQueryCriteria({ and: [{ active: true }], ...expression }, true), {
      $and: [
        { active: true },
        { name: { $regex: 'red', $options: 'i' } },
        { name: { $regex: 'blue$', $options: 'i' } },
      ],
    });
  });
  it('refuses predicates that would silently overwrite a condition during normalization', () => {
    for (const expression of [
      { and: [{ name: 'red' }], $and: [{ name: 'blue' }] },
      { 'metadata.score': { '>': 5 }, metadata: { score: { '<': 10 } } },
      { score: { '>': 5, $gt: 10 } },
    ])
      for (const native of [false, true])
        assert.throws(() => namedQueryCriteria(expression, native), /predicates overlap/);
    assert.deepEqual(
      namedQueryCriteria({ and: [{ name: { contains: 'red' } }, { name: { endsWith: 'blue' } }] }, true),
      { $and: [{ name: { $regex: 'red', $options: 'i' } }, { name: { $regex: 'blue$', $options: 'i' } }] }
    );
  });
  it('refuses structured equality before Waterline can reinterpret its literal as modifiers', () => {
    for (const value of [{ contains: 'literal' }, [1, 2]]) {
      const expression = { data: { $eq: value } };
      assert.throws(() => namedQueryCriteria(expression, false), /cannot represent structured equality/);
      assert.deepEqual(namedQueryCriteria(expression, false, true), expression);
      assert.deepEqual(namedQueryCriteria(expression, true), expression);
    }
    assert.deepEqual(namedQueryCriteria({ data: { $eq: null } }, false), { data: null });
  });
  it('preserves explicit JSON equality while normalizing and scoping a query for its target', async () => {
    const app = application();
    registerNamedQueryTarget(app, {
      metadata: { name: 'institution-json', scope: { type: 'field', fieldPath: 'branding' } },
      async execute(request) {
        assert.deepEqual(namedQueryCriteria(request.expression, true), {
          $or: [{ data: { $eq: { a: 1 } } }, { data: { $eq: [1, 2] } }],
          branding: 'owner',
        });
        return { total: 0, records: [] };
      },
    });
    await executeNamedQuery(app, {
      target: 'institution-json',
      tenant: 'owner',
      start: 0,
      expression: { or: [{ data: { $eq: { a: 1 } } }, { data: { $eq: [1, 2] } }] },
    });
  });
  it('materializes observed defaults, keeps create-only keys and preserves declared extension writes', () => {
    const brand = '012345678901234567890123';
    const created = encodeReference('recordtype', { name: 'rdmp', branding: brand, key: 'ignored' });
    assert.equal(created.key, `${brand}_rdmp`);
    assert.throws(() => encodeReference('recordtype', { name: 'case', branding: 'ABCDEF0123456789ABCDEF01' }));
    assert.equal(created.searchable, true);
    assert.equal(created.searchCore, 'default');
    assert.equal(created.hooks, null);
    assert.deepEqual(
      encodeReference('form', { name: 'f', branding: brand, attachmentFields: ['file'] }).attachmentFields,
      ['file']
    );
    assert.equal(
      encodeReference('workspacetype', { name: 'w', branding: brand, label: 'Workspace' }).label,
      'Workspace'
    );
    assert.equal(encodeReference('recordtype', { name: 'renamed' }, true).key, undefined);
    assert.throws(() => encodeReference('workflowstep', { name: 'stage', starting: false }));
    assert.equal(encodeReference('workflowstep', { name: 'stage', starting: false, config: {} }).starting, false);
    assert.throws(() => encodeReference('themeconfig', { css: null }));
  });
  it('refuses unqualified raw BSON values instead of exposing them through a reference DTO', () => {
    for (const raw of [
      { configuration: { nested: new ObjectId() } },
      { institutionExtension: { at: new Date(0) } },
      { createdAt: new Date(0) },
    ]) {
      assert.throws(() => decodeReference('form', { _id: new ObjectId(), name: 'legacy', ...raw }), /unsupported BSON/);
    }
    assert.throws(
      () => decodeReference('themeconfig', { _id: new ObjectId(), name: 'legacy', constructor: { value: true } }),
      /Unsupported stored reference field/
    );
  });
  it('rejects lossy JSON writes without invoking getters or toJSON', () => {
    let invoked = 0;
    const accessor = Object.defineProperty({}, 'secret', {
      enumerable: true,
      get() {
        invoked++;
        return 'private';
      },
    });
    const custom = {
      toJSON() {
        invoked++;
        return 'private';
      },
    };
    for (const value of [{ nested: NaN }, { nested: undefined }, new Date(0), new ObjectId(), accessor, custom]) {
      for (const field of ['configuration', 'attachmentFields']) {
        assert.throws(() =>
          encodeReference('form', { name: 'invalid', branding: '012345678901234567890123', [field]: value })
        );
        assert.throws(() => encodeReference('form', { [field]: value }, true));
      }
    }
    assert.throws(() =>
      encodeReference(
        'form',
        Object.defineProperty({ name: 'invalid' }, 'configuration', {
          enumerable: true,
          get() {
            invoked++;
            return {};
          },
        })
      )
    );
    assert.equal(invoked, 0);
    const input = {
      name: 'valid',
      branding: '012345678901234567890123',
      configuration: { array: [null, false, 0, ''] },
      unused: undefined,
    };
    const encoded = encodeReference('form', input);
    assert.deepEqual(encoded.configuration, input.configuration);
    assert.notEqual(encoded.configuration, input.configuration);
    assert.equal(Object.hasOwn(encoded, 'unused'), false);
  });
  it('refuses extension field names that MongoDB updates would interpret as paths or operators', () => {
    for (const field of ['attachmentFields.flag', '$attachmentFields']) {
      assert.throws(() => encodeReference('themeconfig', { name: 'invalid', [field]: true }));
      assert.throws(() => encodeReference('themeconfig', { [field]: true }, true));
    }
    assert.deepEqual(encodeReference('form', { attachmentFields: { 'literal.dot': true } }, true).attachmentFields, {
      'literal.dot': true,
    });
  });
  it('refuses fixture-only fields in reference writes and named-query predicates', () => {
    for (const collection of Object.keys(referenceFields) as ReferenceCollection[]) {
      for (const field of ['syntheticUnknown', 'institutionUnknown', 'extension', 'unknown']) {
        assert.throws(() => encodeReference(collection, { [field]: 'fixture' }, true), /Undeclared reference field/);
        assert.throws(() => namedQueryFieldType(field, referenceFields[collection]), /Unsupported named-query/);
      }
    }
    assert.throws(
      () =>
        encodeReference('form', {
          name: 'fixture',
          branding: '012345678901234567890123',
          syntheticUnknown: 'fixture',
        }),
      /Undeclared reference field/
    );
  });
  it('refuses malformed stored expressions rather than executing an empty fallback', () => {
    assert.throws(() => new NamedQueryConfig({ mongoQuery: '{invalid' }), /stored named-query/);
  });
});
