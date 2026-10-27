import assert from 'node:assert/strict';
import * as sinon from 'sinon';
import { MongoClient, ObjectId } from 'mongodb';
import * as runtime from '../../src/persistence/runtime';
import * as storage from '../../src/persistence/storage/runtime';
import { executeStorageQuery } from '../../src/persistence/storage/NamedQueryTargets';
import { namedQueryTarget } from '../../src/persistence/reference/NamedQueryExecution';
import type { CorePrismaClient } from '../../src/persistence/prisma/client';
import { prismaModelFilter } from '../../src/persistence/prisma/modelFilter';

describe('storage named-query translation', () => {
  const app = {
    config: { datastores: { mongodb: { url: 'mongodb://fixture/unit' } } },
    log: { warn() {} },
  } as unknown as Sails.Application;
  let client: CorePrismaClient;
  const stop = new Error('stop before transport');
  const request = { target: 'counter', tenant: new ObjectId().toHexString(), start: 0 };

  beforeEach(async () => {
    sinon.stub(MongoClient.prototype, 'connect').callsFake(async function (this: MongoClient) {
      return this;
    });
    await runtime.initializePersistence(app);
    client = await runtime.prismaDatabase(app, 'mongodb');
    sinon.stub(storage, 'getStorageRepositories');
  });
  afterEach(async () => {
    await runtime.cleanupPersistence(app);
    sinon.restore();
  });

  it('normalizes nested Counter identities and scalars while preserving ObjectId operands', async () => {
    const id = new ObjectId();
    const branding = new ObjectId();
    const where = sinon.stub(client.orm.counter, 'where').throws(stop);
    await assert.rejects(
      executeStorageQuery(
        app,
        {
          ...request,
          expression: {
            and: [{ id: { in: [id, id.toHexString().toUpperCase()] } }, { branding }, { value: { '>=': '2' } }],
            createdAt: 20,
          },
        },
        true
      ),
      error => error === stop
    );
    assert.deepEqual(
      where.firstCall.args[0],
      prismaModelFilter({
        $and: [{ _id: { $in: [id, id] } }, { branding }, { value: { $gte: 2 } }],
        createdAt: '20',
      })
    );
  });

  it('intersects case-sensitive escaped Counter text modifiers and omits empty modifiers', async () => {
    const where = sinon.stub(client.orm.counter, 'where').throws(stop);
    await assert.rejects(
      executeStorageQuery(
        app,
        {
          ...request,
          expression: { name: { contains: 'A.', endsWith: 'ha' }, createdAt: { contains: '' } },
        },
        true
      ),
      error => error === stop
    );
    assert.deepEqual(
      where.firstCall.args[0],
      prismaModelFilter({
        $and: [{ name: { $regex: 'A\\.' } }, { name: { $regex: 'ha$' } }],
      })
    );
  });

  it('maps Counter ID sorting and retains every secondary term', async () => {
    const query = client.orm.counter.where({ name: 'fixture' });
    sinon.stub(client.orm.counter, 'where').returns(query);
    const order = sinon.stub(query, 'orderBy').throws(stop);
    await assert.rejects(
      executeStorageQuery(
        app,
        {
          ...request,
          expression: {},
          sort: [{ id: 'DESC' }, { value: 'ASC' }],
        },
        true
      ),
      error => error === stop
    );
    assert.deepEqual(order.firstCall.args[0], { _id: -1, value: 1 });
  });

  it('refuses undeclared Counter predicates, sorts and projections before transport', async () => {
    const where = sinon.spy(client.orm.counter, 'where');
    for (const field of ['unknown', 'name.child']) {
      for (const extra of [
        { expression: { [field]: 'x' } },
        { sort: [{ [field]: 'ASC' as const }] },
        { select: [field] },
      ])
        await assert.rejects(
          executeStorageQuery(app, { ...request, expression: {}, ...extra }, true),
          error => error instanceof Error && Reflect.get(error, 'code') === 'named-query-compatibility'
        );
    }
    assert.equal(where.callCount, 0);
  });

  for (const target of [
    'deletedrecord',
    'recordidentity',
    'recordaudit',
    'integrationaudit',
    'attachmentmetadata',
    'attachmentaccessaudit',
    'recordschemaartifact',
    'recordschemareference',
  ]) {
    it(`refuses ${target} rather than routing it to Counter`, async () => {
      sinon.stub(client.orm.counter, 'where').throws(stop);
      assert.throws(
        () => namedQueryTarget(app, target),
        error => error instanceof Error && Reflect.get(error, 'code') === 'named-query-compatibility'
      );
      await assert.rejects(
        executeStorageQuery(app, { ...request, target, expression: {} }, true),
        error => error instanceof Error && Reflect.get(error, 'code') === 'named-query-compatibility'
      );
    });
  }
});
