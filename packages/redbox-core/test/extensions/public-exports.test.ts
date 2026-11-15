import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const { auditPublicExports, auditBundledHookImports } = require('../../scripts/public-export-audit.cjs');
const root = path.resolve(__dirname, '../..');

describe('FM-038 public HTTP exports', function () {
  this.timeout(120000);
  it('keeps bundled hook consumers on public core entrypoints without Express imports or Sails globals', () => {
    assert(auditBundledHookImports(path.resolve(root, '../..')).length > 30);
  });
  it('keeps Express types/helpers out of every core and bundled-hook public entrypoint', () => {
    const result = auditPublicExports(
      ['redbox-core', 'redbox-hook-dev', 'sails-hook-redbox-storage-mongo', 'sails-hook-redbox-pdfgen'].map(name =>
        path.resolve(root, '..', name)
      )
    );
    assert(result.length > 20);
    for (const specifier of [
      'http/express',
      'dist/http/express',
      'dist/http/express/index.js',
      'dist/http/express/middleware',
      'src/http/express/ExpressHost.ts',
      'dist/extensions/legacyContract.js',
    ])
      assert.throws(() => require.resolve('@researchdatabox/redbox-core/' + specifier), {
        code: 'ERR_PACKAGE_PATH_NOT_EXPORTED',
      });
    const extensions = require('@researchdatabox/redbox-core/extensions');
    for (const name of [
      'composeExtensionApplication',
      'loadExtensions',
      'loadInstalledExtensionProviders',
      'resolveExtensions',
    ])
      assert.equal(extensions[name], undefined);
    const portal = require('@researchdatabox/redbox-core/portal');
    for (const name of ['createPortalHost', 'createPortalApplication', 'PortalHttp'])
      assert.equal(portal[name], undefined);
    assert.equal(require('@researchdatabox/redbox-core').RequestDetails, undefined);
  });

  for (const [name, source] of [
    ['renamed type', "export type { RequestHandler as InnocentName } from 'express';"],
    [
      'nested signature',
      "import type { Request } from 'express'; export interface Nested { run(input: { nested: Request }): void }",
    ],
    ['helper return', "export declare function makeHelper(): import('express').RequestHandler;"],
  ])
    it(`detects an Express ${name} behind a public re-export`, () => {
      const directory = mkdtempSync(path.join(root, '.fm038-export-'));
      try {
        mkdirSync(path.join(directory, 'dist'));
        writeFileSync(
          path.join(directory, 'package.json'),
          JSON.stringify({
            name: 'fm038-negative',
            exports: { '.': { types: './dist/index.d.ts', default: './dist/index.js' } },
          })
        );
        writeFileSync(path.join(directory, 'dist/index.d.ts'), "export * from './hidden';\n");
        writeFileSync(path.join(directory, 'dist/hidden.d.ts'), source);
        assert.throws(() => auditPublicExports([directory]), /Express public signature/);
      } finally {
        rmSync(directory, { recursive: true, force: true });
      }
    });
});
