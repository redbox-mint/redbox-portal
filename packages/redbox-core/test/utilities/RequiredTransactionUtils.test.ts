import { strict as assert } from 'node:assert';
import { describe, it } from 'mocha';
import {
  AUTHORIZATION_TRANSACTION_UNAVAILABLE,
  AuthorizationTransactionUnavailableError,
  probeRequiredTransactionCapability,
  runWithRequiredTransaction,
} from '../../src/utilities/RequiredTransactionUtils';

function datastoreWithTransaction(transaction: NonNullable<Sails.Datastore['transaction']>): Sails.Datastore {
  return {
    manager: {
      collection: () => ({
        createIndex: async () => undefined,
        find: () => ({ forEach: async () => undefined }),
        insertOne: async () => undefined,
        deleteOne: async () => undefined,
      }),
    },
    transaction,
  };
}

describe('RequiredTransactionUtils', () => {
  it('rejects absent transaction capability without invoking work', async () => {
    let invoked = false;
    await assert.rejects(
      runWithRequiredTransaction(undefined, async () => {
        invoked = true;
      }),
      (error: unknown) =>
        error instanceof AuthorizationTransactionUnavailableError &&
        error.code === AUTHORIZATION_TRANSACTION_UNAVAILABLE
    );
    assert.equal(invoked, false);
  });

  it('commits the result on the leased connection', async () => {
    const connection = Object.freeze({ lease: 'transaction-1' });
    const datastore = datastoreWithTransaction(async work => work(connection));
    const result = await runWithRequiredTransaction(datastore, async leasedConnection => {
      assert.equal(leasedConnection, connection);
      return 'committed';
    });
    assert.equal(result, 'committed');
  });

  it('propagates work failures and never retries outside the transaction', async () => {
    let invocations = 0;
    const datastore = datastoreWithTransaction(async work => work({}));
    await assert.rejects(
      runWithRequiredTransaction(datastore, async () => {
        invocations += 1;
        throw new Error('primary mutation failed');
      }),
      /primary mutation failed/
    );
    assert.equal(invocations, 1);
  });

  it('converts unsupported adapters without invoking or retrying work', async () => {
    let invocations = 0;
    const datastore = datastoreWithTransaction(async () => {
      throw new Error('The installed adapter does not support transactions.');
    });
    await assert.rejects(
      runWithRequiredTransaction(datastore, async () => {
        invocations += 1;
      }),
      (error: unknown) => error instanceof AuthorizationTransactionUnavailableError
    );
    assert.equal(invocations, 0);
  });

  it('converts MongoDB IllegalOperation failures without relying on driver message text', async () => {
    let invocations = 0;
    const datastore = datastoreWithTransaction(async work => {
      await work(Object.freeze({ lease: 'failed-commit' }));
      throw Object.assign(new Error("Failing command via 'failCommand' failpoint"), {
        code: 20,
        codeName: 'IllegalOperation',
      });
    });

    await assert.rejects(
      runWithRequiredTransaction(datastore, async () => {
        invocations += 1;
      }),
      (error: unknown) => error instanceof AuthorizationTransactionUnavailableError
    );
    assert.equal(invocations, 1);
  });

  it('runs a read-only probe inside the leased transaction', async () => {
    const connection = Object.freeze({ lease: 'probe' });
    let observedConnection: Sails.Connection;
    const datastore = datastoreWithTransaction(async work => work(connection));
    const result = await probeRequiredTransactionCapability(datastore, async leasedConnection => {
      observedConnection = leasedConnection;
    });
    assert.deepEqual(result, { available: true });
    assert.equal(observedConnection, connection);
  });

  it('uses a native Mongo session when sails-mongo has no transactional interface', async () => {
    const session = {
      started: false,
      committed: false,
      aborted: false,
      ended: false,
      startTransaction() {
        session.started = true;
      },
      async commitTransaction() {
        session.committed = true;
      },
      async abortTransaction() {
        session.aborted = true;
      },
      async endSession() {
        session.ended = true;
      },
    };
    let insertOptions: Record<string, unknown> | undefined;
    let probeOptions: Record<string, unknown> | undefined;
    const manager = {
      client: {
        startSession: () => session,
      },
      collection: () => ({
        async findOne(_filter: Record<string, unknown>, options?: Record<string, unknown>) {
          probeOptions = options;
          return null;
        },
        async insertOne(_record: Record<string, unknown>, options?: Record<string, unknown>) {
          insertOptions = options;
          return { acknowledged: true };
        },
        async createIndex() {
          return undefined;
        },
        find() {
          return { forEach: async () => undefined };
        },
        async deleteOne() {
          return undefined;
        },
      }),
    };
    const datastore: Sails.Datastore = { manager };

    const result = await runWithRequiredTransaction(datastore, async connection => {
      assert.equal(typeof connection, 'object');
      assert.notEqual(connection, null);
      if (typeof connection !== 'object' || connection === null || !('collection' in connection)) {
        throw new Error('Expected a native Mongo connection.');
      }
      const collectionFactory = connection.collection;
      if (typeof collectionFactory !== 'function') {
        throw new Error('Expected a native Mongo collection factory.');
      }
      const collection = Reflect.apply(collectionFactory, connection, ['role']);
      if (typeof collection !== 'object' || collection === null || !('insertOne' in collection)) {
        throw new Error('Expected a native Mongo collection.');
      }
      const insertOne = collection.insertOne;
      if (typeof insertOne !== 'function') {
        throw new Error('Expected a native Mongo insertOne method.');
      }
      await Reflect.apply(insertOne, collection, [{ name: 'Admin' }, { ordered: true }]);
      return 'native-committed';
    });

    assert.equal(result, 'native-committed');
    assert.deepEqual(probeOptions, { projection: { _id: 1 }, session });
    assert.deepEqual(insertOptions, { ordered: true, session });
    assert.equal(session.started, true);
    assert.equal(session.committed, true);
    assert.equal(session.aborted, false);
    assert.equal(session.ended, true);
  });

  it('proves native Mongo capability before invoking caller work', async () => {
    let workInvocations = 0;
    let aborted = false;
    let ended = false;
    const manager = {
      client: {
        startSession: () => ({
          startTransaction() {},
          async commitTransaction() {},
          async abortTransaction() {
            aborted = true;
          },
          async endSession() {
            ended = true;
          },
        }),
      },
      collection: () => ({
        async findOne() {
          throw new Error('Transaction numbers are only allowed on a replica set member or mongos');
        },
        async createIndex() {
          return undefined;
        },
        find() {
          return { forEach: async () => undefined };
        },
        async insertOne() {
          return undefined;
        },
        async deleteOne() {
          return undefined;
        },
      }),
    };
    const datastore: Sails.Datastore = { manager };

    await assert.rejects(
      runWithRequiredTransaction(datastore, async () => {
        workInvocations += 1;
      }),
      (error: unknown) => error instanceof AuthorizationTransactionUnavailableError
    );

    assert.equal(workInvocations, 0);
    assert.equal(aborted, true);
    assert.equal(ended, true);
  });
});
