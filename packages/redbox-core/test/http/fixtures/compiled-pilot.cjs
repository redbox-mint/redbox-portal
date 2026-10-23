const assert = require('node:assert/strict');
const Module = require('node:module');
const load = Module._load;
const forbidden =
  /\/redbox-core\/(?:src\/|dist\/(?:compat\/|controllers\/|(?:index|CoreController)\.js$))|\/node_modules\/sails\//;
Module._load = function (name, ...args) {
  assert(!['sails', '@researchdatabox/redbox-core'].includes(name), 'Forbidden standalone import: ' + name);
  const resolved = Module._resolveFilename(name, args[0]);
  assert(!forbidden.test(resolved), 'Forbidden standalone module: ' + resolved);
  return load.call(this, name, ...args);
};
const before = ['SIGINT', 'SIGTERM'].map(name => process.listenerCount(name));
const { ApplicationRuntime } = require('@researchdatabox/redbox-core/application');
const { RecordTypes } = require('@researchdatabox/redbox-core/record-types');
// Every newly extracted metadata entrypoint must remain safe in the compiled graph.
require('@researchdatabox/redbox-core/configuration');
require('@researchdatabox/redbox-core/forms');
require('@researchdatabox/redbox-core/translations');
require('@researchdatabox/redbox-core/dashboards');
require('@researchdatabox/redbox-core/workflows');
require('@researchdatabox/redbox-core/workspaces');
require('@researchdatabox/redbox-core/record-schema');
const {
  ExpressHost,
  PathRules,
  HttpIdentity,
  createPilotPolicies,
  pilotPolicyChain,
  prepareHttpMiddleware,
  mountRecordTypeRoutes,
  httpErrorHandler,
} = require('@researchdatabox/redbox-core/http/express');
const {
  initializeReferencePersistence,
  getReferenceRepositories,
} = require('../../../dist/persistence/reference/runtime');
const {
  initializeIdentityPersistence,
  getIdentityRepositories,
} = require('../../../dist/persistence/identity/runtime');
const { initializeBrandingPersistence, getBrandingRepository } = require('../../../dist/persistence/branding/runtime');
const { persistenceStatus } = require('../../../dist/persistence/runtime');
const { nothingLogger } = require('@researchdatabox/sails-ng-common');
assert.deepEqual(
  ['SIGINT', 'SIGTERM'].map(name => process.listenerCount(name)),
  before
);
assert.equal(global.sails, undefined);
(async () => {
  const url = process.env.HTTP_PILOT_COMPILED_MONGO_URL;
  assert(/^\/sr_p4_http_\d+_\d+$/.test(new URL(url).pathname));
  const owner = {
    config: { datastores: { mongodb: { url, maxPoolSize: 2 }, redboxStorage: { url, maxPoolSize: 2 } } },
    log: nothingLogger,
  };
  let domain;
  const application = new ApplicationRuntime(owner, [
    {
      name: 'reference',
      create: () => ({ initialize: () => initializeReferencePersistence(owner), close: async () => {} }),
    },
    {
      name: 'identity',
      create: () => ({ initialize: () => initializeIdentityPersistence(owner), close: async () => {} }),
    },
    {
      name: 'branding',
      create: () => ({ initialize: () => initializeBrandingPersistence(owner), close: async () => {} }),
    },
    {
      name: 'recordTypes',
      create: () => {
        domain = new RecordTypes({
          repository: getReferenceRepositories(owner).recordTypes,
          config: { appmode: {}, recordtype: { dataRecord: { packageType: 'dataRecord' } } },
          log: nothingLogger,
          storageCapability: () => undefined,
        });
        return {
          initialize: async () => {
            const brand = await getBrandingRepository(owner).getBrand({ name: 'default' });
            await domain.initialize(brand);
          },
          close: () => domain.close(),
        };
      },
    },
  ]);
  const host = new ExpressHost(application, {
    owner,
    hostname: '127.0.0.1',
    port: 0,
    prepare: async router => {
      const identity = getIdentityRepositories(owner);
      const auth = await prepareHttpMiddleware(router, {
        owner,
        identity: new HttpIdentity(identity),
        log: nothingLogger,
        session: {
          name: 'redbox.v6.sid',
          secret: 'synthetic-secret-at-least-32-characters-long',
          adapter: 'mongo',
          mongoUrl: url,
          collection: 'pilotSessions',
          cookie: { secure: false },
        },
      });
      const pathRules = new PathRules(() => identity.list('pathrule', {}, { populate: ['role', 'branding'] }));
      await pathRules.loadRules();
      mountRecordTypeRoutes(router, {
        recordTypes: domain,
        policyConfiguration: { '*': [...pilotPolicyChain] },
        policies: createPilotPolicies({
          branding: getBrandingRepository(owner),
          pathRules,
          defaultUnauthenticatedRole: () => undefined,
          emitRequestFailure: async () => {},
          portals: ['rdmp'],
          authenticate: req => auth.authenticate(req),
        }),
      });
      router.use(httpErrorHandler(nothingLogger));
    },
  });
  process.once('message', () => {
    void host
      .stop()
      .then(() => {
        assert.equal(persistenceStatus(owner).prismaClients, 0);
        assert.equal(persistenceStatus(owner).pools, 0);
        assert.equal(
          Object.keys(require.cache).some(path => forbidden.test(path)),
          false
        );
        assert.equal(global.sails, undefined);
        process.disconnect();
      })
      .catch(error => {
        console.error(error);
        process.exitCode = 1;
        process.disconnect();
      });
  });
  try {
    await host.initialize();
    await host.activate();
    process.send({ port: host.address().port });
  } catch (error) {
    await host.stop();
    throw error;
  }
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
  if (process.connected) process.disconnect();
});
