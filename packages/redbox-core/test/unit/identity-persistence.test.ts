import assert from 'node:assert/strict';
import * as sinon from 'sinon';
import { MongoClient } from 'mongodb';
import { AggregateCommand, MongoAndExpr, MongoFieldFilter } from '@prisma/orm-mongo/query-ast';
import type { MongoQueryPlan } from '@prisma/orm-mongo/query-ast';
import { createCorePrismaClient } from '../../src/persistence/prisma/client';
import { prismaIdentityRepositories } from '../../src/persistence/identity/PrismaIdentityRepositories';

describe('identity timestamp predicates', () => {
  afterEach(() => sinon.restore());

  for (const entity of ['user', 'role', 'pathrule'] as const) {
    it(`compiles ${entity} timestamp equality, ranges, null and membership as stored strings`, async () => {
      const client = createCorePrismaClient(new MongoClient('mongodb://fixture/unit'), 'unit');
      const stop = new Error('stop before transport');
      const where = sinon.stub(client.orm[entity], 'where').throws(stop);
      const repo = prismaIdentityRepositories(
        client,
        async () => {},
        async () => null
      );
      try {
        await assert.rejects(
          repo.list(entity, {
            and: [
              { createdAt: '2026-01-01T00:00:00.000Z' },
              { createdAt: { '>=': 20, '<': '30' } },
              { updatedAt: null },
              { updatedAt: ['10', 20] },
            ],
          })
        );
        assert.equal(where.callCount, 1);
        assert.deepEqual(
          where.firstCall.args[0],
          MongoAndExpr.of([
            MongoAndExpr.of([
              MongoAndExpr.of([MongoFieldFilter.eq('createdAt', '2026-01-01T00:00:00.000Z')]),
              MongoAndExpr.of([
                MongoAndExpr.of([
                  MongoFieldFilter.of('createdAt', '$gte', '20'),
                  MongoFieldFilter.of('createdAt', '$lt', '30'),
                ]),
              ]),
              MongoAndExpr.of([MongoFieldFilter.eq('updatedAt', null)]),
              MongoAndExpr.of([MongoFieldFilter.in('updatedAt', ['10', '20'])]),
            ]),
          ])
        );
      } finally {
        await client.close();
      }
    });
  }
});

describe('identity sort plans', () => {
  let client: ReturnType<typeof createCorePrismaClient>;
  let plans: MongoQueryPlan[];
  beforeEach(() => {
    client = createCorePrismaClient(new MongoClient('mongodb://fixture/unit'), 'unit');
    plans = [];
    sinon.stub(client, 'runtime').resolves({
      query(plan: MongoQueryPlan) {
        plans.push(plan);
        return { toArray: async () => [] };
      },
    } as any);
  });
  afterEach(async () => {
    sinon.restore();
    await client.close();
  });
  const repository = () =>
    prismaIdentityRepositories(
      client,
      async () => {},
      async () => null
    );

  it('keeps dotted and secondary sort terms ahead of skip and limit in a typed plan', async () => {
    await repository().list(
      'user',
      {},
      {
        sort: [{ 'additionalAttributes.department': 'ASC' }, { username: 'DESC' }],
        skip: 2,
        limit: 3,
      }
    );
    assert.equal(plans.length, 1);
    const command = plans[0].command;
    assert(command instanceof AggregateCommand, 'uses the typed builder rather than raw aggregation');
    const stages = command.pipeline.filter(stage => ['sort', 'skip', 'limit'].includes(stage.kind));
    assert.deepEqual(
      stages.map(stage => ({ ...stage })),
      [
        { kind: 'sort', sort: { 'additionalAttributes.department': 1, username: -1 } },
        { kind: 'skip', skip: 2 },
        { kind: 'limit', limit: 3 },
      ]
    );
  });

  it('keeps every root sort term on the model API', async () => {
    const order = sinon.stub().throws(new Error('stop before transport'));
    sinon.stub(client.orm.user, 'where').returns({ orderBy: order } as any);
    await assert.rejects(repository().list('user', {}, { sort: [{ name: 'ASC' }, { username: 'DESC' }] }));
    assert.equal(order.callCount, 1);
    assert.deepEqual(order.firstCall.args[0], { name: 1, username: -1 });
  });

  it('refuses undeclared, scalar and unsafe deep sort paths before transport', async () => {
    for (const field of ['unknown.department', 'username.department', 'additionalAttributes.__proto__.name'])
      await assert.rejects(
        repository().list('user', {}, { sort: [{ [field]: 'ASC' }] }),
        (error: any) => error.code === 'identity-query'
      );
    assert.equal(plans.length, 0);
  });

  it('keeps native failures behind the credential-safe identity boundary', async () => {
    const failure = new Error('password=fixture-secret');
    sinon.restore();
    sinon.stub(client, 'runtime').rejects(failure);
    await assert.rejects(
      repository().list('user', {}, { sort: [{ 'additionalAttributes.department': 'ASC' }] }),
      (error: any) => error.code === 'identity-operation' && !error.message.includes('fixture-secret')
    );
  });
});
