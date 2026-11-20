import { assertGoldenNext, goldenControls } from './goldenContracts';
import assert from 'node:assert/strict';
import { mkdir, symlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { referenceReadDeclarations } from '../../../src/http/referenceRoutes';
import { referenceProductionFixture } from './referenceProductionFixture';
import { wire } from './mutationDifferentialSupport';
describe('FM-038 bundled hooks on the production composition', function () {
  this.timeout(120000);
  it('loads the real three public extension entrypoints with concrete storage/PDF bindings and preserves configured HTTP behavior', async () => {
    const observations: unknown[] = [];
    for (const native of [true]) {
      const fixture = await referenceProductionFixture(native, undefined, undefined, {
        declarations: referenceReadDeclarations,
        pages: {},
        artifacts: async directory => {
          const repository = path.resolve(__dirname, '../../../../..');
          const packages = ['redbox-hook-dev', 'sails-hook-redbox-storage-mongo', 'sails-hook-redbox-pdfgen'];
          const dependencies: Record<string, string> = {};
          for (const directoryName of packages) {
            const manifest = require(path.join(repository, 'packages', directoryName, 'package.json'));
            dependencies[manifest.name] = manifest.version;
            const destination = path.join(directory, 'node_modules', manifest.name);
            await mkdir(path.dirname(destination), { recursive: true });
            await symlink(path.join(repository, 'packages', directoryName), destination, 'dir');
          }
          await writeFile(
            path.join(directory, 'package.json'),
            JSON.stringify({ name: 'fm038-consumer', dependencies })
          );
        },
      });
      try {
        const installed = fixture.portal.resolved.providers.filter(provider => provider.name !== 'core');
        assert.equal(installed.length, 3);
        assert(installed.some(provider => provider.name === 'redbox-hook-dev'));
        assert(fixture.portal.models.getModelInfo('pdfgen'));
        assert(fixture.portal.resolveHook('pdf.create'));
        assert(fixture.data.storage());
        const declaration = installed.find(provider => provider.name === 'redbox-hook-dev')!.declaration;
        assert(declaration.forms?.['default-1.0-draft']);
        assert(declaration.workflows?.rdmp);
        {
          assert('installation' in fixture.portal);
          assert(installed.every(provider => provider.declaration.apiVersion === 2));
          assert.equal(
            fixture.portal.resolved.controllerRegistrations.filter(item =>
              installed.some(provider => provider.name === item.provider)
            ).length,
            0
          );
          assert.equal(
            fixture.portal.resolved.routeRegistrations.filter(item =>
              installed.some(provider => provider.name === item.provider)
            ).length,
            0
          );
        }
        const root = await wire(fixture.url + '/', 'GET');
        const anonymous = await wire(fixture.url + '/default/rdmp/api/recordtypes', 'GET');
        const allowed = await wire(fixture.url + '/default/rdmp/api/recordtypes', 'GET', {
          Authorization: 'Bearer pilot-api-token',
        });
        assert.equal(root.status, 302);
        assert.equal(anonymous.status, 401);
        assert.equal(allowed.status, 200, allowed.text);
        assert(allowed.text.includes('rdmp'), 'Development hook record type is served by the real selected domain');
        const conditional = await wire(fixture.url + '/default/rdmp/api/recordtypes', 'HEAD', {
          Authorization: 'Bearer pilot-api-token',
          'If-None-Match': '*',
        });
        assert.equal(conditional.text, '');
        observations.push({
          root: { status: root.status, location: root.headers.location },
          anonymous: { status: anonymous.status, body: anonymous.text },
          allowed: {
            status: allowed.status,
            contentType: allowed.headers['content-type'],
            names: JSON.stringify(JSON.parse(allowed.text), (key, value) =>
              ['id', 'createdAt', 'updatedAt'].includes(key) ? undefined : value
            ),
          },
          conditional: { status: conditional.status, cache: conditional.headers['cache-control'] },
        });
      } finally {
        await fixture.close();
      }
    }
    assertGoldenNext('bundled-hooks-mongo', observations[0]);
  });
});

goldenControls('bundled-hooks-mongo');
