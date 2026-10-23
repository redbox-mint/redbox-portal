import { nothingLogger } from '@researchdatabox/sails-ng-common';
import {
  ExpressHost,
  createPilotPolicies,
  pilotPolicyChain,
  prepareHttpMiddleware,
  mountRecordTypeRoutes,
  httpErrorHandler,
  type RecordTypeHttpInput,
} from '../../src/http/express';
import { RecordTypes } from '../../src/recordTypes';
import { prepareSessionIndexes } from '../../src/persistence/sessions/indexes';
import { mongoFixture } from './mongoFixture';

export async function pilotFixture(
  options: Partial<Pick<RecordTypeHttpInput, 'routes' | 'policyConfiguration' | 'recordSchema'>> & {
    rootContext?: string;
  } = {}
) {
  const f = await mongoFixture();
  const domain = new RecordTypes({
    repository: f.recordTypes,
    config: { appmode: {}, recordtype: { dataRecord: { packageType: 'dataRecord', searchable: true } } },
    log: nothingLogger,
    storageCapability: () => undefined,
  });
  const session = {
    name: 'redbox.v6.sid',
    secret: 'synthetic-secret-at-least-32-characters-long',
    adapter: 'mongo',
    mongoUrl: process.env.HTTP_PILOT_TEST_MONGO_URL!.replace('/sr_p4_http', '/' + f.native.db().databaseName),
    collection: 'pilotSessions',
    cookie: { secure: false },
  };
  const host = new ExpressHost(f.application, {
    owner: f.owner,
    hostname: '127.0.0.1',
    port: 0,
    rootContext: options.rootContext,
    prepare: async router => {
      await domain.initialize(f.brand);
      const auth = await prepareHttpMiddleware(router, {
        owner: f.owner,
        identity: f.identity,
        session,
        log: nothingLogger,
      });
      const policies = createPilotPolicies({
        branding: f.branding,
        identity: f.identities,
        portals: ['rdmp'],
        authenticate: req => auth.authenticate(req),
      });
      mountRecordTypeRoutes(router, {
        recordTypes: domain,
        policies,
        policyConfiguration: options.policyConfiguration ?? { '*': [...pilotPolicyChain] },
        routes: options.routes,
        recordSchema: options.recordSchema,
        rootContext: options.rootContext,
      });
      router.use(httpErrorHandler(nothingLogger));
    },
  });
  async function close() {
    await host.stop();
    await domain.close();
    await f.close();
  }
  try {
    await prepareSessionIndexes(f.owner, session, 'ensure');
    await host.initialize();
    await host.activate();
    return {
      ...f,
      domain,
      host,
      url: 'http://127.0.0.1:' + host.address()!.port + (options.rootContext ?? ''),
      headers: { Authorization: 'Bearer pilot-api-token' },
      close,
    };
  } catch (error) {
    await close();
    throw error;
  }
}
