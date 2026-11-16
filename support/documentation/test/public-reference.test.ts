import { strict as assert } from 'node:assert';
import fs from 'node:fs';

// The compiled test runs from .tmp; source.ts's module-relative root is for ts-node.
// Invoke the source checker through its supported CLI for production path resolution.
import { execFileSync } from 'node:child_process';

describe('API2 reference contracts', function () {
  this.timeout(180_000);
  it('checks generated exports, declared REST routes and local site links', function () {
    execFileSync(
      process.execPath,
      [
        'node_modules/ts-node/dist/bin.js',
        '--transpile-only',
        '--project',
        'support/documentation/tsconfig.json',
        'support/documentation/src/check.ts',
      ],
      { stdio: 'pipe', timeout: 150_000 }
    );
  });
  it('keeps the migration example identical to the public-import compile fixture', function () {
    const fixture = fs.readFileSync('support/documentation/examples/hook-override.ts', 'utf8').trim();
    const guide = fs.readFileSync('support/specs/fastify-migration/extension-api2.md', 'utf8');
    const example = guide.match(/<!-- api2-example:start -->\n```ts\n([\s\S]*?)\n```\n<!-- api2-example:end -->/);
    assert.ok(example, 'missing compile-checked example markers');
    assert.equal(example[1].trim(), fixture);
  });
  it('rejects missing/private/stale catalogue entries and stale REST operations', function () {
    const control = `
      const assert = require('node:assert/strict');
      const fs = require('node:fs');
      const os = require('node:os');
      const path = require('node:path');
      const {checkCatalogue, checkRestReference} = require('./support/documentation/src/check');
      const {createProgram} = require('./support/documentation/src/source');
      const program = createProgram();
      const catalogue = JSON.parse(fs.readFileSync('.tmp/generated-docs-site/artifacts/catalogue.json', 'utf8'));
      const missing = structuredClone(catalogue);
      missing.surfaces = missing.surfaces.filter(s => s.name !== 'RedboxExtensionV2');
      assert.throws(() => checkCatalogue(program, missing), /missing public API2 protocol/);
      const privateEntry = structuredClone(catalogue);
      privateEntry.surfaces.find(s => s.name === 'RedboxExtensionV2').source.file = 'private.ts';
      assert.throws(() => checkCatalogue(program, privateEntry), /non-public protocol/);
      const stale = structuredClone(catalogue);
      stale.surfaces.find(s => s.name === 'RedboxExtensionV2').members[0].type = 'obsolete';
      assert.throws(() => checkCatalogue(program, stale), /differs from current declarations/);
      const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'fm041-reference-'));
      (async () => {
        try {
          const doc = JSON.parse(fs.readFileSync('.tmp/generated-docs-site/api/openapi.json', 'utf8'));
          const operations = Object.values(doc.paths)[0];
          const method = Object.keys(operations).find(m => ['get','post','put','patch','delete','head','options'].includes(m));
          operations[method].operationId = 'stale-operation';
          fs.writeFileSync(path.join(dir, 'openapi.json'), JSON.stringify(doc));
          await assert.rejects(checkRestReference(dir), /differs from declared API routes/);
          delete operations[method];
          fs.writeFileSync(path.join(dir, 'openapi.json'), JSON.stringify(doc));
          await assert.rejects(checkRestReference(dir), /differs from declared API routes/);
        } finally { fs.rmSync(dir, {recursive:true, force:true}); }
      })().catch(e => { console.error(e); process.exitCode = 1; });
    `;
    execFileSync(
      process.execPath,
      [
        'node_modules/ts-node/dist/bin.js',
        '--transpile-only',
        '--project',
        'support/documentation/tsconfig.json',
        '-e',
        control,
      ],
      { stdio: 'pipe', timeout: 150_000 }
    );
  });
  it('keeps the API1 refusal linked to the real migration guide', function () {
    const source = fs.readFileSync('packages/redbox-core/src/extensions/v2.ts', 'utf8');
    const target = source.match(
      /https:\/\/github.com\/redbox-mint\/redbox-portal\/blob\/feature\/fastify-migration\/([^']+)/
    );
    assert.ok(target, 'API1 refusal must include the migration URL');
    assert.equal(target[1], 'support/specs/fastify-migration/extension-api2.md');
    assert.match(fs.readFileSync(target[1], 'utf8'), /^# Migrating hooks from API1 \/ Express to API2 \/ Fastify/);
  });
});
