import express from 'express';
import type { AddressInfo } from 'node:net';
import { createServer } from 'node:http';
import type { ILogger } from '@researchdatabox/sails-ng-common';
import type { AppConfigs } from '../../src/configuration/AppConfigs';
import { createHttpPolicies } from '../../src/http/express/policies';
import { httpErrorHandler } from '../../src/http/express/middleware';
import { mountAdminOperationRoutes } from '../../src/http/express/adminOperations';
import { mountConfigurationWriteRoutes } from '../../src/http/express/configurationWrites';

/** Actual route owners with a fixed authenticated administrator for configuration boundary tests. */
export async function configurationHttp(
  settings: AppConfigs,
  log: ILogger,
  run: (
    request: (method: string, path: string, data?: unknown) => Promise<{ status: number; body: any }>
  ) => Promise<void>
): Promise<void> {
  const app = express();
  app.use(express.json());
  const policies = createHttpPolicies({
    branding: { getBrand: async () => ({ id: 'brand1', name: 'default' }) },
    portals: ['rdmp'],
    pathRules: { getRulesFromPath: () => null, canRead: () => true },
    defaultUnauthenticatedRole: () => undefined,
    emitRequestFailure: async () => {},
    authenticate: async () => ({
      id: 'admin',
      username: 'admin',
      roles: [{ id: 'admin-role', name: 'Admin', brandId: 'brand1' }],
    }),
  });
  const policyConfiguration = { '*': ['brandingAndPortal', 'browserActor'] };
  const pass: express.RequestHandler = (_req, _res, next) => next();
  mountAdminOperationRoutes(app, {
    settings,
    policies,
    policyConfiguration,
    log,
    csrf: { apiProtect: pass },
    reloadTranslations: async () => {},
    invalidateAssets() {},
    audit: async () => {},
  });
  mountConfigurationWriteRoutes(app, {
    appConfigs: settings,
    policies,
    policyConfiguration,
    csrf: { protect: pass, apiProtect: pass },
    translations: {} as never,
    dashboardConfig: {} as never,
    reloadTranslations: async () => {},
  });
  app.use(httpErrorHandler(log));
  const server = createServer(app);
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  try {
    await run(async (method, path, data) => {
      const response = await fetch(`http://127.0.0.1:${(server.address() as AddressInfo).port}${path}`, {
        method,
        headers: { 'Content-Type': 'application/json' },
        ...(data === undefined ? {} : { body: JSON.stringify(data) }),
      });
      return { status: response.status, body: await response.json() };
    });
  } finally {
    await new Promise<void>((resolve, reject) => server.close(error => (error ? reject(error) : resolve())));
  }
}
