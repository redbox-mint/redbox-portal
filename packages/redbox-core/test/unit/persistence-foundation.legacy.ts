// Explicit retained Express adapter cases, removed with FM-043.
import type { PersistenceOwner } from '../../src/persistence/owner';
import assert from 'node:assert/strict';
import { createSecureContext } from 'node:tls';
import { definePersistenceGroup } from '../../src/persistence/groupRuntime';
import * as sinon from 'sinon';
import { resolveDatastore } from '../../src/persistence/mongodb/configuration';
import { assertPersistenceConfiguration } from '../../src/persistence/selection';
import {
  initializePersistence,
  cleanupPersistence,
  registerPersistenceResource,
  persistenceOperation,
  mongoDatabase,
} from '../../src/persistence/runtime';
import { MongoClient } from 'mongodb';

function app(config: PersistenceOwner['config'] = {}): PersistenceOwner {
  return { config, log: { warn() {} } };
}

describe('app-scoped non-model resource ownership', function () {
  afterEach(() => {
    sinon.restore();
  });

  it('closes the connect-mongo store created by middleware exactly once', async () => {
    const { composeHttpSession } =
      require('../../src/http/express/session') as typeof import('../../src/http/express/session');
    const MongoStore = require('connect-mongo').default as typeof import('connect-mongo').default;
    const store = { close: sinon.stub().resolves(), on: sinon.stub().returnsThis() };
    sinon.stub(MongoStore, 'create').returns(store as unknown as import('connect-mongo').default);
    const application = app();
    await initializePersistence(application);
    sinon
      .stub(require('../../src/persistence/runtime'), 'mongoSessionDatabase')
      .resolves({ client: {}, databaseName: 'fixture' });
    await composeHttpSession({ adapter: 'mongo', secret: 'fixture-only', mongoUrl: 'mongodb://localhost/fixture' }, application).ready;
    await cleanupPersistence(application);
    await cleanupPersistence(application);
    assert.equal(store.close.callCount, 1);
  });
});

