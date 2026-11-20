import assert from 'node:assert/strict';
import { integrationDeclarations } from '../../../src/http/integrationRoutes';
import { referenceOrigin, referenceProductionFixture } from './referenceProductionFixture';
import { integrationProviderFixture } from './integrationProviderFixture';
import { normalizeIntegrations } from './integrationDifferentialSupport';
import { session, wire } from './mutationDifferentialSupport';
import { assertGolden, goldenControls } from './goldenContracts';

describe('Optional RVA vocabulary version', function () {
  this.timeout(120000);
  for (const prefix of ['api', 'admin'])
    for (const action of ['import', 'sync'])
      for (const versionId of ['', undefined, '123'])
        it(`${prefix} ${action} preserves version ${JSON.stringify(versionId)}`, async () => {
          const provider = await integrationProviderFixture();
          try {
            const f = await referenceProductionFixture(true, undefined, undefined, {
              declarations: integrationDeclarations,
              configuration: provider.configuration,
            });
            try {
              const auth = await session(f);
              const vocabulary = f.data.reference.vocabulary.get();
              const previous =
                action === 'sync'
                  ? await vocabulary.create({
                      name: 'Owned',
                      slug: 'owned',
                      branding: f.brand.id,
                      source: 'rva',
                      sourceId: '225',
                      sourceVersionId: '44',
                      entries: [],
                    })
                  : undefined;
              provider.reset();
              const response = await wire(
                `${f.url}/default/rdmp/${prefix}/vocabulary/${previous ? previous.id + '/sync' : 'import'}?apiVersion=1.0`,
                'POST',
                {
                  ...auth,
                  Origin: referenceOrigin,
                  'Content-Type': 'application/json',
                  ...(prefix === 'api' ? { Authorization: 'Bearer pilot-api-token' } : {}),
                },
                JSON.stringify({
                  ...(previous ? {} : { rvaId: '225' }),
                  ...(versionId === undefined ? {} : { versionId }),
                })
              );
              assert.equal(response.status, 200, response.text);
              const selected = versionId || '1';
              const treeCalls = provider.calls.filter(call => call.path.endsWith('/conceptTree'));
              assert.deepEqual(treeCalls, [
                { method: 'GET', path: `/api/resource/versions/${selected}/versionArtefacts/conceptTree` },
              ]);
              const body = JSON.parse(response.text);
              const saved = await vocabulary.getById(String(previous?.id ?? body.id));
              assert(saved);
              assert.equal(saved.sourceVersionId, selected);
              const { state, wire: envelope } = await normalizeIntegrations(f, response);
              assert(
                (state as { useraudit: { action: string }[] }).useraudit.some(
                  audit => audit.action === action + '-vocabulary'
                )
              );
              assertGolden('rvaVersion', `${prefix}/${action}/${String(versionId)}`, {
                wire: envelope,
                state,
                providers: provider.calls,
              });
            } finally {
              await f.close();
            }
          } finally {
            await provider.close();
          }
        });
});
goldenControls('rvaVersion');
