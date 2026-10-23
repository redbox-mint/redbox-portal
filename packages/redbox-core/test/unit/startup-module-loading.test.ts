import { strict as assert } from 'node:assert';
import { spawnSync } from 'node:child_process';
import path from 'node:path';

describe('startup module loading', function () {
  it('loads core without a browser DOM or the full Effect barrel, then sanitizes on first use', function () {
    // This child transpiles the source barrel (615 TS modules on the qualified
    // Node 26 toolchain). Profiling attributes ~7.2s to transpilation alone;
    // compiled import plus the first sanitize is ~2.6s. Allow source-loader
    // headroom without changing the production host's separate startup bound.
    this.timeout(30000);
    const packagePath = path.resolve(__dirname, '../..');
    const result = spawnSync(
      process.execPath,
      [
        '--no-experimental-strip-types',
        '--require',
        'ts-node/register/transpile-only',
        '-e',
        `
        const assert = require('node:assert/strict');
        const core = require('./src');
        assert.equal(Object.keys(require.cache).some(file => file.includes('/@prisma/orm-mongo/')), false);
        assert.equal(Object.keys(require.cache).some(file => file.includes('/jsdom/')), false);
        assert.equal(Boolean(require.cache[require.resolve('effect')]), false);
        assert.equal(Object.keys(require.cache).some(file => /\\/persistence\\/(migration|reference|configuration|progress|harvest|siem|figshare|vocabulary|branding|identity|storage)\\/(Prisma|physical|preflight|validation)/.test(file)), false);
        const html = require('./src/utilities/TranslationHtml');
        assert.equal(html.sanitizeTranslationHtml('<p onclick="bad()">Hello</p>'), '<p>Hello</p>');
        // Comparison globals resolve an explicit legacy application owner after the offline import.
        globalThis.sails = {config:{},log:require('@researchdatabox/sails-ng-common').nothingLogger};
        const purifier = globalThis.DOMPurify;
        assert.equal(typeof purifier.sanitize, 'function');
        assert.equal(globalThis.DOMPurify, purifier);
        assert.equal(purifier.sanitize('<p>Hello<script>bad()</script></p>'), '<p>Hello</p>');
        require('./src/persistence/runtime').cleanupPersistence(globalThis.sails).then(() => {
          assert.equal(require('./src/persistence/runtime').persistenceStatus(globalThis.sails).resources.length, 0);
        }).catch(error => { console.error(error); process.exitCode = 1; });
      `,
      ],
      {
        cwd: packagePath,
        encoding: 'utf8',
        env: { ...process.env, TS_NODE_PROJECT: path.join(packagePath, 'test/tsconfig.json') },
        timeout: 25000,
      }
    );
    assert.equal(result.status, 0, result.error?.message ?? result.stderr);
  });
});
