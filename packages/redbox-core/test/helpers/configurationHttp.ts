import assert from 'node:assert/strict';
import sinon from 'sinon';
import type { ILogger } from '@researchdatabox/sails-ng-common';
import type { AppConfigs } from '../../src/configuration/AppConfigs';
import { referenceReadDeclarations } from '../../src/http/referenceRoutes';
import { identityAdministrationDeclarations } from '../../src/http/identityRoutes';
import { mutationDeclarations } from '../../src/http/mutationRoutes';
import { referenceProductionFixture } from '../http/fastify/referenceProductionFixture';
import { sourcePortal } from '../application/sourcePortal';

/** Native production routes with real authentication/CSRF; only the settings
 * domain is supplied by the service test whose persistence boundaries it checks. */
export async function configurationHttp(
  settings: AppConfigs,
  log: ILogger,
  run: (request: (method: string, path: string, data?: unknown) => Promise<{ status: number; body: any }>) => Promise<void>
): Promise<void> {
  const f = await referenceProductionFixture(true, { '*': ['brandingAndPortal', 'browserActor'] }, undefined, {
    declarations: [...referenceReadDeclarations, ...identityAdministrationDeclarations, ...mutationDeclarations],
    pages: {}, rootContext: '', log,
    hostFactory: portal => sourcePortal.createHost(portal),
  });
  const sandbox = sinon.createSandbox();
  try {
    assert.equal(f.host.constructor.name, 'FastifyHost');
    // All production controllers borrow this port lazily, after initialization.
    sandbox.stub(f.data.reference.appConfigs, 'get').returns(settings);
    const token = await fetch(f.url + '/csrfToken');
    const headers = { 'Content-Type': 'application/json', Authorization: 'Bearer pilot-api-token',
      Cookie: token.headers.get('set-cookie')!.split(';')[0], 'X-CSRF-Token': (await token.json())._csrf };
    await run(async (method, path, data) => {
      const response = await fetch(f.url + path, { method, headers,
        ...(data === undefined ? {} : { body: JSON.stringify(data) }) });
      return { status: response.status, body: await response.json() };
    });
  } finally {
    sandbox.restore();
    await f.close();
  }
}
