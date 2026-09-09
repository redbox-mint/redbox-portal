'use strict';

const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const {
  baselineDocument,
  compareSummaries,
  emitDeclarationSummaries,
  isAuthoredSourcePath,
  runGuard,
  scanTypeNodes,
  summarizeFindings,
  validateBaseline,
} = require('../../scripts/check-explicit-type-nodes');

const repositoryRoot = path.resolve(__dirname, '../..');
const runtimePath = 'packages/example/src/runtime.ts';

test('finds explicit any and unknown AST nodes but not names, comments, or strings', () => {
  const findings = scanTypeNodes(
    `
      type Unsafe = any;
      const value = input as unknown;
      interface SafeNames { anything: string; unknownValue: string }
      const text = 'any unknown'; // any and unknown are not type nodes
    `,
    runtimePath
  );
  assert.deepEqual(
    findings.map(finding => finding.kind),
    ['any', 'unknown']
  );
});

test('distinguishes changed findings from unexpected and stale baseline paths', () => {
  const initial = summarizeFindings('source', runtimePath, scanTypeNodes('type Legacy = any;', runtimePath));
  const changed = summarizeFindings('source', runtimePath, scanTypeNodes('type Legacy = unknown;', runtimePath));
  const added = summarizeFindings(
    'source',
    'packages/example/src/added.ts',
    scanTypeNodes('type Added = any;', 'packages/example/src/added.ts')
  );
  assert.ok(initial);
  assert.ok(changed);
  assert.ok(added);
  assert.deepEqual(compareSummaries([changed], [initial]), {
    unexpected: [],
    stale: [],
    changed: [{ actual: changed, expected: initial }],
  });
  assert.deepEqual(compareSummaries([initial, added], [initial]), {
    unexpected: [added],
    stale: [],
    changed: [],
  });
  assert.deepEqual(compareSummaries([], [initial]), { unexpected: [], stale: [initial], changed: [] });
});

test('scans production source while exempting test-only typing', () => {
  assert.equal(isAuthoredSourcePath('packages/example/src/runtime.ts'), true);
  assert.equal(isAuthoredSourcePath('angular/projects/example/src/app/runtime.ts'), true);
  assert.equal(isAuthoredSourcePath('packages/example/test/runtime.ts'), false);
  assert.equal(isAuthoredSourcePath('packages/example/src/runtime.test.ts'), false);
  assert.equal(isAuthoredSourcePath('angular/projects/example/src/test.ts'), false);
  assert.equal(isAuthoredSourcePath('support/tooling.ts'), false);
});

function createGateRepository(source) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'redbox-explicit-type-node-'));
  const sourcePath = path.join(root, 'packages/redbox-core/src/index.ts');
  fs.mkdirSync(path.dirname(sourcePath), { recursive: true });
  fs.mkdirSync(path.join(root, 'support/security'), { recursive: true });
  fs.mkdirSync(path.join(root, 'support/wiki'), { recursive: true });
  fs.writeFileSync(sourcePath, source);
  fs.writeFileSync(
    path.join(root, 'packages/redbox-core/tsconfig.json'),
    `${JSON.stringify(
      {
        compilerOptions: {
          declaration: true,
          module: 'nodenext',
          moduleResolution: 'nodenext',
          outDir: './dist',
          rootDir: './src',
          strict: false,
        },
        include: ['src/**/*.ts'],
      },
      null,
      2
    )}\n`
  );
  fs.writeFileSync(path.join(root, 'support/wiki/Legacy-Explicit-Type-Node-Baseline.md'), '# Test baseline\n');
  fs.writeFileSync(
    path.join(root, 'support/security/explicit-type-node-baseline.json'),
    `${JSON.stringify(baselineDocument([]), null, 2)}\n`
  );
  spawnSync('git', ['init', '-q'], { cwd: root });
  spawnSync('git', ['add', '.'], { cwd: root });
  return root;
}

test('detects inferred any in an isolated emitted declaration', t => {
  const root = createGateRepository('export function identity(value) { return value; }\n');
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const declarations = emitDeclarationSummaries(root);
  assert.equal(declarations.length, 1);
  assert.deepEqual(
    { anyCount: declarations[0].anyCount, unknownCount: declarations[0].unknownCount },
    { anyCount: 2, unknownCount: 0 }
  );
});

test('the CLI rejects declaration leakage even when authored source has no explicit node', t => {
  const root = createGateRepository('export function identity(value) { return value; }\n');
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const result = spawnSync(process.execPath, ['scripts/check-explicit-type-nodes.js', '--root', root], {
    cwd: repositoryRoot,
    encoding: 'utf8',
  });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /Unexpected explicit type nodes: declaration:packages\/redbox-core\/dist\/index\.d\.ts/);
});

test('validates strict baseline metadata and rejects a test-only allowlist entry', () => {
  const baseline = require('../../support/security/explicit-type-node-baseline.json');
  assert.deepEqual(validateBaseline(baseline, repositoryRoot), []);
  const invalid = structuredClone(baseline);
  invalid.entries = [
    {
      scope: 'source',
      path: 'packages/example/test/fixture.ts',
      anyCount: 1,
      unknownCount: 0,
      fingerprint: `sha256:${'a'.repeat(64)}`,
    },
  ];
  assert.ok(validateBaseline(invalid, repositoryRoot).some(error => error.includes('not authored runtime/source')));
});

test('the repository findings exactly match the reviewed baseline', { timeout: 120_000 }, () => {
  const result = runGuard(repositoryRoot);
  assert.deepEqual(result.metadataErrors, []);
  assert.deepEqual(result.unexpected, []);
  assert.deepEqual(result.changed, []);
  assert.deepEqual(result.stale, []);
});
