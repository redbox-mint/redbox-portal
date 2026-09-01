'use strict';

const assert = require('node:assert/strict');
const { execFileSync, spawnSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const {
  compareFindingsToAllowlist,
  isManagedOrRemovedPath,
  isScannedSourcePath,
  normalizeRelativePath,
  runGuard,
  scanRepository,
  scanSource,
  validateAllowlist,
  validateSourceExclusions,
} = require('../../scripts/check-unsafe-expressions');

const repositoryRoot = path.resolve(__dirname, '../..');
const allowlist = require('../../support/security/unsafe-expression-allowlist.json');
const sourceExclusions = require('../../support/security/unsafe-expression-source-exclusions.json');
const runtimePath = 'packages/example/src/runtime.ts';

const unsafeCases = [
  ['direct eval', 'direct-eval', 'eval(configuredSource);'],
  ['an eval alias', 'direct-eval', 'const execute = eval; execute(configuredSource);'],
  [
    'a function-scoped var alias declared inside a block',
    'direct-eval',
    'if (enabled) { var execute = eval; } execute(configuredSource);',
  ],
  ['a global eval member', 'direct-eval', 'globalThis.eval(configuredSource);'],
  [
    'a named Lodash import',
    'lodash-template',
    "import { template as compile } from 'lodash-es'; compile(configuredSource);",
  ],
  [
    'a Lodash namespace import',
    'lodash-template',
    "import * as lodash from 'lodash'; lodash.template(configuredSource);",
  ],
  [
    'a CommonJS Lodash alias',
    'lodash-template',
    "const lodash = require('lodash'); const compile = lodash.template; compile(configuredSource);",
  ],
  ['a template subpath import', 'lodash-template', "import compile from 'lodash/template'; compile(configuredSource);"],
  ['the legacy Sails Lodash global', 'lodash-template', '_.template(configuredSource);'],
];

for (const [name, kind, source] of unsafeCases) {
  test(`finds ${name}`, () => {
    assert.deepEqual(
      scanSource(source, runtimePath).map(finding => finding.kind),
      [kind]
    );
  });
}

const safeCases = [
  ['a shadowed eval parameter', 'function run(eval) { eval(configuredSource); }'],
  ['a shadowed Lodash global', 'function run(_) { _.template(configuredSource); }'],
  [
    'Handlebars and JSONata',
    "import Handlebars from 'handlebars'; import jsonata from 'jsonata'; Handlebars.compile(source); jsonata(source).evaluate({});",
  ],
  ['ordinary local functions', 'const template = value => value; template(configuredSource);'],
  ['comments and strings', "const example = 'eval(source)'; // _.template(source)"],
];

for (const [name, source] of safeCases) {
  test(`ignores ${name}`, () => assert.deepEqual(scanSource(source, runtimePath), []));
}

test('keeps fingerprints tied to the normalized call expression', () => {
  const compact = scanSource('eval( source );', runtimePath)[0];
  const spaced = scanSource('eval(  \n source  );', runtimePath)[0];
  const changed = scanSource('eval(otherSource);', runtimePath)[0];
  assert.equal(compact.fingerprint, spaced.fingerprint);
  assert.notEqual(compact.fingerprint, changed.fingerprint);
});

test('bounds oversized source before parsing it', () => {
  const finding = scanSource(' '.repeat(4 * 1024 * 1024 + 1), runtimePath)[0];
  assert.equal(finding.kind, 'analysis-limit');
  assert.equal(finding.reason, 'source-byte-limit');
});

test('the deliberate fixtures are rejected at TypeScript and first-party asset boundaries', () => {
  const typescriptFixture = fs.readFileSync(
    path.join(repositoryRoot, 'test/resources/static-guard/unsafe-expressions.fixture.ts'),
    'utf8'
  );
  assert.deepEqual(
    new Set(scanSource(typescriptFixture, 'packages/example/src/unsafe-expressions.spec.ts').map(item => item.kind)),
    new Set(['direct-eval', 'lodash-template'])
  );
  const assetFixture = fs.readFileSync(
    path.join(repositoryRoot, 'test/resources/static-guard/unsafe-first-party-asset.fixture.js'),
    'utf8'
  );
  assert.deepEqual(
    scanSource(assetFixture, 'assets/default/default/js/first-party-runtime.js').map(item => item.kind),
    ['direct-eval']
  );
});

function createGuardRepository() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'redbox-unsafe-expression-'));
  for (const relativePath of [
    'scripts/check-unsafe-expressions.js',
    'support/security/unsafe-expression-allowlist.json',
    'support/security/unsafe-expression-source-exclusions.json',
    'support/wiki/Legacy-Unsafe-Expression-Inventory.md',
  ]) {
    const destination = path.join(root, relativePath);
    fs.mkdirSync(path.dirname(destination), { recursive: true });
    fs.copyFileSync(path.join(repositoryRoot, relativePath), destination);
  }
  for (const manifestPath of [
    'support/security/unsafe-expression-allowlist.json',
    'support/security/unsafe-expression-source-exclusions.json',
  ]) {
    const manifest = JSON.parse(fs.readFileSync(path.join(root, manifestPath), 'utf8'));
    manifest.entries = [];
    fs.writeFileSync(path.join(root, manifestPath), `${JSON.stringify(manifest, null, 2)}\n`);
  }
  execFileSync('git', ['init', '-q'], { cwd: root });
  return root;
}

test('the CLI rejects an unsafe tracked first-party asset', t => {
  const root = createGuardRepository();
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const relativePath = 'assets/default/default/js/first-party-runtime.js';
  const destination = path.join(root, relativePath);
  fs.mkdirSync(path.dirname(destination), { recursive: true });
  fs.copyFileSync(
    path.join(repositoryRoot, 'test/resources/static-guard/unsafe-first-party-asset.fixture.js'),
    destination
  );
  execFileSync('git', ['add', '.'], { cwd: root });
  const result = spawnSync(process.execPath, ['scripts/check-unsafe-expressions.js'], {
    cwd: root,
    encoding: 'utf8',
    env: { ...process.env, NODE_PATH: path.join(repositoryRoot, 'node_modules') },
  });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /Unexpected unsafe execution: assets\/default\/default\/js\/first-party-runtime\.js/);
});

test('reconciles allowlist additions, removals, and metadata without a duplicate Markdown inventory', () => {
  assert.deepEqual(validateAllowlist(allowlist, ''), []);
  const finding = {
    kind: allowlist.entries[0].kind,
    path: allowlist.entries[0].path,
    fingerprint: allowlist.entries[0].fingerprint,
  };
  assert.deepEqual(compareFindingsToAllowlist([finding], [allowlist.entries[0]]), { unexpected: [], stale: [] });
  assert.equal(compareFindingsToAllowlist([], [allowlist.entries[0]]).stale.length, 1);
  assert.equal(compareFindingsToAllowlist([finding], []).unexpected.length, 1);

  const incomplete = structuredClone(allowlist);
  delete incomplete.entries[0].followUp;
  assert.ok(validateAllowlist(incomplete, '').some(error => error.includes('must contain exactly')));
  const managed = structuredClone(allowlist);
  managed.entries[0].path = 'packages/redbox-core/src/action-registry/injected.ts';
  assert.ok(validateAllowlist(managed, '').some(error => error.includes('cannot allowlist managed or removed')));
});

test('limits source exclusions to explicit asset files', () => {
  assert.deepEqual(validateSourceExclusions(sourceExclusions, '', repositoryRoot), []);
  assert.ok(sourceExclusions.entries.every(entry => !isScannedSourcePath(entry.path)));
  const broad = structuredClone(sourceExclusions);
  broad.entries[0].path = 'assets/';
  assert.ok(validateSourceExclusions(broad, '', repositoryRoot).some(error => error.includes('must name an assets')));
});

test('normalizes scan paths and preserves the managed-code ban', () => {
  assert.equal(isScannedSourcePath('packages/example/src/hidden.spec.ts'), true);
  assert.equal(isScannedSourcePath('test/resources/fixture.ts'), false);
  assert.equal(isScannedSourcePath('packages/example/test/fixture.ts'), false);
  assert.equal(isScannedSourcePath('support/documentation/tool.ts'), false);
  assert.equal(isScannedSourcePath('assets/first-party.js'), true);
  assert.equal(isManagedOrRemovedPath('packages/redbox-core/src/expression-runtime/injected.ts'), true);
  assert.throws(() => normalizeRelativePath('../packages/example/src/runtime.ts'));
  assert.throws(() => normalizeRelativePath('packages\\example\\src\\runtime.ts'));
});

test('refuses a tracked source symlink', t => {
  const root = createGuardRepository();
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const relativePath = 'packages/example/src/runtime.ts';
  const destination = path.join(root, relativePath);
  fs.mkdirSync(path.dirname(destination), { recursive: true });
  fs.writeFileSync(path.join(root, 'safe-target.ts'), 'eval(source);\n');
  fs.symlinkSync('../../../safe-target.ts', destination);
  execFileSync('git', ['add', '.'], { cwd: root });
  assert.throws(() => scanRepository(root, new Set()), /Refusing to scan source symlink/);
});

test('the repository findings exactly match the JSON allowlist', () => {
  const result = runGuard(repositoryRoot);
  assert.deepEqual(result.metadataErrors, []);
  assert.deepEqual(result.unexpected, []);
  assert.deepEqual(result.stale, []);
  assert.equal(result.findings.length, allowlist.entries.length);
  assert.ok(result.findings.every(finding => !isManagedOrRemovedPath(finding.path)));
});
