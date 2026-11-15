import assert from 'node:assert/strict';
import { cp, mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { nothingLogger } from '@researchdatabox/sails-ng-common';
import { loadInstalledExtensionProvidersV2 } from '../../src/extensions';
import { createPortalFastifyApplication } from '../../src/application/portal';

describe('FM-038 bundled extension migration', function () {
  this.timeout(60000);

  it('reconciles every bundled contribution against FM-037 without changing non-HTTP behavior', () => {
    const { inventory } = require('../../../../support/specs/fastify-migration/evidence/reconcile-FM-038.cjs');
    const result = inventory();
    assert.equal(result.packages.filter((item: { extension: boolean }) => item.extension).length, 3);
    assert.equal(result.nonHttpParity, true);
  });

  it('rejects an installed API1 fixture before acquisition with hook, contribution and migration instructions', async () => {
    const directory = await mkdtemp(path.join(tmpdir(), 'fm038-api1-'));
    try {
      await mkdir(path.join(directory, 'node_modules'));
      await cp(path.join(__dirname, 'fixtures/api1-http'), path.join(directory, 'node_modules/fm017-api1-http'), {
        recursive: true,
      });
      await writeFile(
        path.join(directory, 'package.json'),
        JSON.stringify({ dependencies: { 'fm017-api1-http': '1.0.0' } })
      );
      const refusal = (error: unknown) => {
        assert(error instanceof Error);
        for (const fragment of [
          'fm017-api1-http',
          'handlers[0] (legacy)',
          'routes[0] (legacy-route).handler',
          'middleware[0] (legacy-after)',
          'integrations[0] (legacy-server)',
          'apiVersion 2',
          'extension-api2.md',
          'redbox-dev-tools init example --template v6',
        ])
          assert(error.message.includes(fragment), error.message);
        return true;
      };
      await assert.rejects(loadInstalledExtensionProvidersV2(directory), refusal);
      await assert.rejects(
        createPortalFastifyApplication({
          appPath: directory,
          log: nothingLogger,
          http: {
            declarations: [
              {
                method: 'get',
                path: '/unused',
                controller: 'Unused',
                action: 'unused',
                policy: ['nocache'],
                responses: {},
              },
            ],
          },
        }),
        refusal
      );
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });
});
