import type { Server } from 'node:http';
import { nothingLogger } from '@researchdatabox/sails-ng-common';
import type { RequestHandler, Router } from 'express';
import {
  ExpressHost,
  PathRules,
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
    parserExclusions?: readonly string[];
    policyBindings?: Readonly<Record<string, RequestHandler>>;
    prepareRoutes?(
      router: Router,
      fixture: Awaited<ReturnType<typeof mongoFixture>>,
      policies: Readonly<Record<string, RequestHandler>>,
      recordTypes: RecordTypes,
      realtime: {
        server: Server;
        authenticateCredential: Awaited<ReturnType<typeof prepareHttpMiddleware>>['authenticateCredential'];
      }
    ): Promise<void>;
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
  const pathRules = new PathRules(() => f.identities.list('pathrule', {}, { populate: ['role', 'branding'] }));
  const host = new ExpressHost(f.application, {
    owner: f.owner,
    hostname: '127.0.0.1',
    port: 0,
    rootContext: options.rootContext,
    prepare: async (router, server) => {
      await domain.initialize(f.brand);
      const auth = await prepareHttpMiddleware(router, {
        owner: f.owner,
        identity: f.identity,
        session,
        log: nothingLogger,
        parserExclusions: options.parserExclusions,
      });
      await pathRules.loadRules();
      const policies = createPilotPolicies({
        branding: f.branding,
        pathRules,
        defaultUnauthenticatedRole: () => undefined,
        emitRequestFailure: async () => {},
        portals: ['rdmp'],
        authenticate: req => auth.authenticate(req),
      });
      router.post('/__test/login', auth.local, (_req, res) => res.json({ success: true }));
      mountRecordTypeRoutes(router, {
        recordTypes: domain,
        policies: { ...policies, ...options.policyBindings },
        policyConfiguration: options.policyConfiguration ?? { '*': [...pilotPolicyChain] },
        routes: options.routes,
        recordSchema: options.recordSchema,
        rootContext: options.rootContext,
      });
      await options.prepareRoutes?.(router, f, policies, domain, {
        server,
        authenticateCredential: auth.authenticateCredential,
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
      pathRules,
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
