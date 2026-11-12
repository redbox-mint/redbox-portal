import assert from 'node:assert/strict';
import { request } from 'node:http';
import { integrationDeclarations } from '../../../src/http/integrationRoutes';
import { persistenceStatus } from '../../../src/persistence/runtime';
import { referenceProductionFixture, referenceOrigin } from './referenceProductionFixture';
import { retainedIntegrationExpress } from './retainedIntegrationExpress';
import { integrationProviderFixture } from './integrationProviderFixture';
import { session, type Fixture } from './mutationDifferentialSupport';

/** Hold only the external socket response. Production registration, provider
 * request and request-lifetime ownership remain untouched. */
describe('FM-027 accepted external provider work', function () {
  this.timeout(120000);
  for (const version of ['1.0', '2.0'])
    it(`retains provider work after disconnect and stop deadline, then drains (${version})`, async () => {
      const retained = await retainedIntegrationExpress();
      try {
        for (const mode of ['retained', 'express', 'fastify'] as const) {
          const provider = await integrationProviderFixture();
          let f: Fixture | undefined;
          let gate: ReturnType<typeof provider.hold> | undefined;
          let client: ReturnType<typeof request> | undefined;
          let timer: ReturnType<typeof setTimeout> | undefined;
          try {
            f = await referenceProductionFixture(
              mode === 'fastify',
              undefined,
              mode === 'retained' ? retained.install : undefined,
              {
                declarations: integrationDeclarations,
                configuration: provider.configuration,
              }
            );
            const login = await session(f);
            provider.reset();
            gate = provider.hold();
            const route = integrationDeclarations.find(r => r.action === 'externalEntries');
            assert(route);
            const path = route.path
              .replace(':branding', 'default')
              .replace(':portal', 'rdmp')
              .replace(':provider', 'fixture');
            const body = JSON.stringify({ options: { query: 'Alpha' } });
            const completed = Promise.withResolvers<void>();
            client = request(f.url + path, {
              method: route.method.toUpperCase(),
              agent: false,
              headers: {
                ...login,
                Authorization: 'Bearer pilot-api-token',
                Origin: referenceOrigin,
                'X-ReDBox-Api-Version': version,
                'Content-Type': 'application/json',
                'Content-Length': String(Buffer.byteLength(body)),
              },
            });
            client.on('error', () => completed.resolve());
            client.on('response', response => {
              response.resume();
              response.once('end', () => completed.resolve());
            });
            client.end(body);
            await Promise.race([
              gate.entered,
              new Promise<never>((_resolve, reject) => {
                timer = setTimeout(() => reject(new Error('Provider must receive accepted request')), 8000);
              }),
            ]);
            clearTimeout(timer);
            client.destroy(new Error('Intentional client disconnect'));
            await completed.promise;
            await assert.rejects(f.host.stop({ deadlineMs: 25 }), /deadline|timeout/i);
            assert(
              persistenceStatus(f.owner).pools > 0,
              'Borrowed dependencies must remain open for pending provider work'
            );
            assert.equal(provider.calls.length, 1);
            gate.release();
            await f.host.stop({ deadlineMs: 30000 });
            assert.equal(persistenceStatus(f.owner).pools, 0);
            assert.equal(provider.calls.length, 1, 'Stop retry must not repeat the external operation');
          } finally {
            clearTimeout(timer);
            gate?.release();
            client?.destroy();
            await f?.close();
            await provider.close();
          }
        }
      } finally {
        await retained.close();
      }
    });
});
