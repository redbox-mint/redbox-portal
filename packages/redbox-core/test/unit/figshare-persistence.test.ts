import { expect } from 'chai';
import { MongoClient } from 'mongodb';
import type { MongoQueryPlan } from '@prisma/orm-mongo/query-ast';
import type { FigshareSyncModel } from '../../src/model/storage/FigshareSyncModel';
import { prismaFigshareRepository } from '../../src/persistence/figshare/PrismaFigshareRepository';
import { createCorePrismaClient, type CorePrismaClient } from '../../src/persistence/prisma/client';
const work = () => ({ requested: 0, processed: 0, sourceGeneration: 0, dueAt: null, policies: [], requestedBy: '' });
const initial = (): FigshareSyncModel => ({
  oid: 'one',
  brandId: 'brand',
  revision: 0,
  importedGeneration: 0,
  work: { sync: work(), cleanup: work(), observe: work() },
  nextActionAt: null,
  dispatchUntil: 0,
  leaseOwner: null,
  leaseUntil: 0,
  receipts: [],
  checkpoints: {},
  status: 'queued',
});
/** Exercise the actual typed plan construction with an offline runtime result boundary. */
function fixture(read: () => object, write: () => Promise<object | null>) {
  const client = createCorePrismaClient(new MongoClient('mongodb://192.0.2.1/unit'), 'unit');
  return prismaFigshareRepository({
    query: client.query,
    runtime: async () => ({
      query(plan: MongoQueryPlan) {
        return { toArray: async () => (plan.command.kind === 'aggregate' ? [{ state: read() }] : [await write()]) };
      },
    }),
  } as unknown as CorePrismaClient);
}
describe('Figshare durable repository boundary', () => {
  it('bounds unmatched CAS retries and never treats contention as successful persistence', async () => {
    let calls = 0;
    const repo = fixture(
      () => ({ ...initial() }),
      async () => {
        calls++;
        return null;
      }
    );
    try {
      await repo.change('one', s => {
        s.status = 'synced';
      });
      throw Error('Unexpected success');
    } catch (e) {
      expect(String(e)).to.contain('contention');
    }
    expect(calls).to.equal(30);
  });
  it('does not retry an applied write with a failed acknowledgement', async () => {
    let calls = 0,
      saved: FigshareSyncModel | undefined;
    const repo = fixture(
      () => ({ ...initial() }),
      async () => {
        calls++;
        throw Error('secret URL');
      }
    );
    try {
      await repo.change('one', s => {
        s.status = 'synced';
        saved = s;
      });
      throw Error('Unexpected success');
    } catch (e) {
      expect(String(e)).to.contain('unknown outcome');
      expect(String(e)).not.to.contain('secret URL');
    }
    expect(calls).to.equal(1);
    expect(saved?.status).to.equal('synced');
  });
  it('refuses non-JSON nested fields and nonnumeric leases without rewriting', async () => {
    let calls = 0;
    let row: object = { ...initial() };
    const repo = fixture(
      () => row,
      async () => {
        calls++;
        throw Error('should not write');
      }
    );
    try {
      await repo.change('one', s => {
        Reflect.set(s.checkpoints, 'optional', undefined);
      });
      throw Error('Unexpected success');
    } catch (e) {
      expect(String(e)).to.contain('plain JSON');
    }
    row = { ...initial(), leaseUntil: new Date() };
    try {
      await repo.get('one');
      throw Error('Unexpected success');
    } catch (e) {
      expect(String(e)).to.contain('plain JSON');
    }
    expect(calls).to.equal(0);
  });
});
