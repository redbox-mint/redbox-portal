import assert from 'node:assert/strict';
import sinon from 'sinon';
import type { ResolvedPortalInstallation } from '../../../src/application/portal/installation';
import * as rendering from '../../../src/pages/rendering';
import { browserPage, type BrowserPageInput } from '../../../src/pages/browser';
import { pageRoutes } from '../../../src/http/pageRoutes';
import { HttpFailure } from '../../../src/http/fastify/errorBoundary';
const audit = require('../../../../../support/specs/fastify-migration/evidence/reconcile-FM-030.cjs') as {
  offlineApplication(): Promise<{ portal: { installation: ResolvedPortalInstallation }; close(): Promise<void> }>;
  reconcile(
    installation: ResolvedPortalInstallation,
    runtime?: unknown
  ): { counts: { browserAndIntegration: number; migrated: number; intentionalOverrides: number; later: number } };
};
describe('FM-030 complete browser declaration and production binding reconciliation', function () {
  this.timeout(120000);
  let fixture: Awaited<ReturnType<typeof audit.offlineApplication>>;
  before(async () => {
    fixture = await audit.offlineApplication();
  });
  after(async () => {
    await fixture?.close();
  });
  it('accounts for every non-API FM-002 declaration and its later-task owner', () => {
    assert.deepEqual(audit.reconcile(fixture.portal.installation).counts, {
      browserAndIntegration: 183,
      migrated: 165,
      intentionalOverrides: 0,
      later: 18,
    });
  });
  it('rejects a missing browser route instead of deferring it', () => {
    const installation = fixture.portal.installation;
    assert.throws(
      () =>
        audit.reconcile({
          ...installation,
          routePlan: {
            ...installation.routePlan,
            routes: installation.routePlan.routes.filter(
              route => route.declaration.path !== '/:branding/:portal/record/view/:oid'
            ),
          },
        }),
      /Missing browser binding/
    );
  });
  for (const field of ['action', 'policy', 'csrf'] as const)
    it('rejects ' + field + ' drift from the browser declaration', () => {
      const installation = fixture.portal.installation;
      const routes = installation.routePlan.routes.map(route =>
        route.declaration.path === '/:branding/:portal/record/view/:oid'
          ? {
              ...route,
              ...(field === 'action'
                ? { declaration: { ...route.declaration, action: 'edit' } }
                : field === 'policy'
                  ? { effectivePolicies: ['nocache'] }
                  : { effectiveCsrf: 'none' }),
            }
          : route
      );
      assert.throws(() => audit.reconcile({ ...installation, routePlan: { ...installation.routePlan, routes } }));
    });
  it('rejects missing executable registrations even when declarations are intact', () => {
    const installation = fixture.portal.installation;
    assert.throws(
      () =>
        audit.reconcile({
          ...installation,
          routePlan: {
            ...installation.routePlan,
            bindings: installation.routePlan.bindings.filter(
              binding => binding.route.declaration.path !== '/:branding/:portal/record/view/:oid'
            ),
          },
        }),
      /No resolved runtime binding/
    );
  });
  it('rejects an empty live registry even when all declarations and bindings resolve', () => {
    assert.throws(() => audit.reconcile(fixture.portal.installation, []), /Missing actual registration/);
  });
});

describe('FM-030 browser action error boundary', () => {
  for (const status of [400, 403, 404])
    it('preserves typed ' + status + ' from the browser operation', async () => {
      const failure = new HttpFailure(status);
      const preparation = sinon.stub(rendering, 'preparePageRendering').resolves({
        locals: {},
        t: (key: string) => key,
        error: (status: number) => ({ status, headers: {} }),
      } as Awaited<ReturnType<typeof rendering.preparePageRendering>>);
      try {
        await assert.rejects(
          () =>
            browserPage(
              {
                context: { brand: { id: 'brand', name: 'default' }, portal: 'rdmp' },
                params: {},
                query: {},
                session: {},
                url: '/default/rdmp/home',
                originalUrl: '/portal/default/rdmp/home',
                path: '/default/rdmp/home',
                csrfToken: () => '',
                acceptsHtml: () => true,
              },
              {} as BrowserPageInput,
              pageRoutes[0],
              async () => {
                throw failure;
              },
              () => {}
            ),
          error => error === failure
        );
      } finally {
        preparation.restore();
      }
    });
});
