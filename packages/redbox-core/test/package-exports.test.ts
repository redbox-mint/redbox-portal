import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import os from 'node:os';
import path from 'node:path';

const packageName = '@researchdatabox/redbox-core';
const packageRoot = path.resolve(__dirname, '..');

describe('redbox-core package exports', () => {
  let consumerRoot: string;
  let consumerRequire: NodeRequire;

  before(() => {
    consumerRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'redbox-core-package-exports-'));
    const scopeRoot = path.join(consumerRoot, 'node_modules', '@researchdatabox');
    fs.mkdirSync(scopeRoot, { recursive: true });
    fs.symlinkSync(packageRoot, path.join(scopeRoot, 'redbox-core'), process.platform === 'win32' ? 'junction' : 'dir');
    consumerRequire = createRequire(path.join(consumerRoot, 'consumer.cjs'));
  });

  after(() => {
    fs.rmSync(consumerRoot, { recursive: true, force: true });
  });

  it('resolves the root and intentional legacy subpaths from a package consumer', () => {
    const supportedEntries = [
      [packageName, 'dist/index.js'],
      [`${packageName}/package.json`, 'package.json'],
      [`${packageName}/dist/hooks/webpack`, 'dist/hooks/webpack.js'],
      [`${packageName}/dist/config/webpack.config`, 'dist/config/webpack.config.js'],
      [`${packageName}/src/hooks/webpack.ts`, 'src/hooks/webpack.ts'],
      [`${packageName}/src/config/webpack.config.ts`, 'src/config/webpack.config.ts'],
    ] as const;

    for (const [request, relativeTarget] of supportedEntries) {
      assert.equal(consumerRequire.resolve(request), path.join(packageRoot, relativeTarget));
    }
  });

  it('blocks both consumer-reachable spellings of the emitted secret runtime', () => {
    assert.equal(fs.existsSync(path.join(packageRoot, 'dist/action-registry/secrets.js')), true);

    for (const request of [
      `${packageName}/dist/action-registry/secrets`,
      `${packageName}/dist/action-registry/secrets.js`,
    ]) {
      try {
        consumerRequire.resolve(request);
      } catch (error) {
        assert.equal(error instanceof Error, true);
        if (!(error instanceof Error)) {
          throw error;
        }
        assert.equal((error as NodeJS.ErrnoException).code, 'ERR_PACKAGE_PATH_NOT_EXPORTED');
        continue;
      }
      assert.fail(`Expected ${request} to be blocked by the package exports map.`);
    }
  });
});
