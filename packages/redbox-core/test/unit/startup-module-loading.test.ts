import { strict as assert } from 'node:assert';
import { spawnSync } from 'node:child_process';
import path from 'node:path';

describe('startup module loading', function () {
  it('loads core without a browser DOM or the full Effect barrel, then sanitizes on first use', function () {
    this.timeout(15000);
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
        assert.equal(Object.keys(require.cache).some(file => file.includes('/jsdom/')), false);
        assert.equal(Boolean(require.cache[require.resolve('effect')]), false);
        const html = require('./src/utilities/TranslationHtml');
        assert.equal(html.sanitizeTranslationHtml('<p onclick="bad()">Hello</p>'), '<p>Hello</p>');
        const purifier = globalThis.DOMPurify;
        assert.equal(typeof purifier.sanitize, 'function');
        assert.equal(globalThis.DOMPurify, purifier);
        assert.equal(purifier.sanitize('<p>Hello<script>bad()</script></p>'), '<p>Hello</p>');
      `,
      ],
      {
        cwd: packagePath,
        encoding: 'utf8',
        env: { ...process.env, TS_NODE_PROJECT: path.join(packagePath, 'test/tsconfig.json') },
        timeout: 12000,
      }
    );
    assert.equal(result.status, 0, result.error?.message ?? result.stderr);
  });
});
