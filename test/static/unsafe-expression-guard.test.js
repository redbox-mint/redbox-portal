'use strict';

const assert = require('node:assert/strict');
const { execFileSync, spawnSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const {
  allowlistRelativePath,
  compareFindingsToAllowlist,
  documentationRelativePath,
  isManagedOrRemovedPath,
  isScannedSourcePath,
  normalizeRelativePath,
  runGuard,
  scanSource,
  sourceExclusionsRelativePath,
  validateAllowlist,
  validateSourceExclusions,
} = require('../../scripts/check-unsafe-expressions');

const repositoryRoot = path.resolve(__dirname, '../..');
const allowlist = JSON.parse(fs.readFileSync(path.join(repositoryRoot, allowlistRelativePath), 'utf8'));
const documentation = fs.readFileSync(path.join(repositoryRoot, documentationRelativePath), 'utf8');
const packageJson = JSON.parse(fs.readFileSync(path.join(repositoryRoot, 'package.json'), 'utf8'));
const sourceExclusions = JSON.parse(fs.readFileSync(path.join(repositoryRoot, sourceExclusionsRelativePath), 'utf8'));
const expectedEntryIds = [
  'legacy-eval-email-notify-success',
  'legacy-eval-rdmp-queued-trigger',
  'legacy-eval-user-post-save-hook',
  'legacy-eval-user-post-save-sync-hook',
  'legacy-eval-user-pre-save-hook',
  'legacy-template-angular-lodash-utility',
  'legacy-template-angular-utility',
  'legacy-template-core-trigger-condition',
  'legacy-template-form-vocabulary',
  'legacy-template-rdmp-contributor-rule',
  'legacy-template-rdmp-counter',
  'legacy-template-rdmp-run-templates',
  'legacy-template-solr-pre-index',
  'legacy-template-trigger-field-validation',
  'legacy-template-trigger-related-record',
  'legacy-template-workspace-allow-add',
];
const bypassCases = [
  {
    name: 'Reflect.apply invokes builtin eval',
    kind: 'direct-eval',
    source: `Reflect.apply(eval, globalThis, [configuredSource]);`,
  },
  {
    name: 'an array carries an eval alias',
    kind: 'direct-eval',
    source: `const executors = [eval]; const execute = executors[0]; execute(configuredSource);`,
  },
  {
    name: 'an array-rest carrier reindexes an eval alias',
    kind: 'direct-eval',
    source: `const [...carrier] = [eval]; carrier[0](configuredSource);`,
  },
  {
    name: 'an offset array-rest carrier reindexes an eval alias',
    kind: 'direct-eval',
    source: `const [safe, ...carrier] = [JSON.parse, eval]; carrier[0](configuredSource);`,
  },
  {
    name: 'an object carries an eval alias',
    kind: 'direct-eval',
    source: `const executors = { evaluate: eval }; executors.evaluate(configuredSource);`,
  },
  {
    name: 'a carrier object is itself aliased',
    kind: 'direct-eval',
    source: `const carrier = { evaluate: eval }; const alias = carrier; alias.evaluate(configuredSource);`,
  },
  {
    name: 'computed destructuring carries builtin eval',
    kind: 'direct-eval',
    source: `const evalKey = 'eval'; const { [evalKey]: execute } = globalThis; execute(configuredSource);`,
  },
  {
    name: 'Lodash runInContext returns a template-bearing namespace',
    kind: 'lodash-template',
    source: `import lodash from 'lodash'; lodash.runInContext().template(configuredSource);`,
  },
  {
    name: 'a bound Lodash runInContext remains callable until invoked',
    kind: 'lodash-template',
    source: `import lodash from 'lodash'; const ric = lodash.runInContext.bind(lodash); ric().template(configuredSource);`,
  },
  {
    name: 'Lodash runInContext.call returns a template-bearing namespace',
    kind: 'lodash-template',
    source: `import lodash from 'lodash'; lodash.runInContext.call(lodash).template(configuredSource);`,
  },
  {
    name: 'Lodash runInContext.apply returns a template-bearing namespace',
    kind: 'lodash-template',
    source: `import lodash from 'lodash'; lodash.runInContext.apply(lodash, []).template(configuredSource);`,
  },
  {
    name: 'computed destructuring carries Lodash template',
    kind: 'lodash-template',
    source: `import lodash from 'lodash'; const key = 'template'; const { [key]: compile } = lodash; compile(configuredSource);`,
  },
  {
    name: 'a named default import aliases the template subpath',
    kind: 'lodash-template',
    source: `import { default as compile } from 'lodash/template'; compile(configuredSource);`,
  },
  {
    name: 'a namespace subpath exposes template through default',
    kind: 'lodash-template',
    source: `import * as templateNamespace from 'lodash/template'; templateNamespace.default(configuredSource);`,
  },
  {
    name: 'the lodash-es template.js default subpath is unsafe',
    kind: 'lodash-template',
    source: `import compile from 'lodash-es/template.js'; compile(configuredSource);`,
  },
  {
    name: 'a whole-package namespace import retains Lodash provenance',
    kind: 'lodash-template',
    source: `import * as lodashNamespace from 'lodash-es'; lodashNamespace.template(configuredSource);`,
  },
  {
    name: 'a whole-package namespace default retains Lodash provenance',
    kind: 'lodash-template',
    source: `import * as lodashNamespace from 'lodash'; lodashNamespace.default.template(configuredSource);`,
  },
  {
    name: 'a whole-package default import retains Lodash provenance',
    kind: 'lodash-template',
    source: `import lodashDefault from 'lodash-es'; lodashDefault.template(configuredSource);`,
  },
  {
    name: 'a whole-package named import retains Lodash provenance',
    kind: 'lodash-template',
    source: `import { template as compile } from 'lodash'; compile(configuredSource);`,
  },
  {
    name: 'a CommonJS whole-package default alias retains Lodash provenance',
    kind: 'lodash-template',
    source: `const lodashDefault = require('lodash').default; lodashDefault.template(configuredSource);`,
  },
  {
    name: 'a CommonJS computed named alias retains Lodash provenance',
    kind: 'lodash-template',
    source: `const key = 'template'; const { [key]: compile } = require('lodash-es'); compile(configuredSource);`,
  },
  {
    name: 'a CommonJS template.js default alias retains Lodash provenance',
    kind: 'lodash-template',
    source: `const compile = require('lodash/template.js').default; compile(configuredSource);`,
  },
  {
    name: 'Reflect.apply invokes an aliased Lodash template compiler',
    kind: 'lodash-template',
    source: `import compile from 'lodash-es/template'; Reflect.apply(compile, undefined, [configuredSource]);`,
  },
  {
    name: 'a bound Reflect.apply retains its builtin eval target',
    kind: 'direct-eval',
    source: `const invoke = Reflect.apply.bind(Reflect, eval, globalThis); invoke([configuredSource]);`,
  },
  {
    name: 'Reflect.apply.call invokes builtin eval',
    kind: 'direct-eval',
    source: `Reflect.apply.call(null, eval, globalThis, [configuredSource]);`,
  },
  {
    name: 'Reflect.apply.apply invokes builtin eval',
    kind: 'direct-eval',
    source: `Reflect.apply.apply(null, [eval, globalThis, [configuredSource]]);`,
  },
  {
    name: 'a Lodash template compiler is invoked as a constructor',
    kind: 'lodash-template',
    source: `import compile from 'lodash/template'; new compile(configuredSource);`,
  },
  {
    name: 'a Lodash template compiler is invoked as a template tag',
    kind: 'lodash-template',
    source: "import compile from 'lodash/template'; compile`configured source`;",
  },
  {
    name: 'Reflect.construct invokes a Lodash template compiler',
    kind: 'lodash-template',
    source: `import compile from 'lodash/template'; Reflect.construct(compile, [configuredSource]);`,
  },
  {
    name: 'Reflect.construct.call invokes a Lodash template compiler',
    kind: 'lodash-template',
    source: `import compile from 'lodash/template'; Reflect.construct.call(null, compile, [configuredSource]);`,
  },
  {
    name: 'Reflect.construct.apply invokes a Lodash template compiler',
    kind: 'lodash-template',
    source: `import compile from 'lodash/template'; Reflect.construct.apply(null, [compile, [configuredSource]]);`,
  },
  {
    name: 'a bound Reflect.construct retains its Lodash template target',
    kind: 'lodash-template',
    source: `import compile from 'lodash/template'; const invoke = Reflect.construct.bind(Reflect, compile); invoke([configuredSource]);`,
  },
];
const sourceExtensionCases = [
  {
    extension: '.jsx',
    source: `const view = <div />; eval(configuredSource);`,
  },
  {
    extension: '.mts',
    source: `export {}; eval(configuredSource);`,
  },
  {
    extension: '.cts',
    source: `export = {}; eval(configuredSource);`,
  },
];

function writeJson(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

function createEndToEndGuardRepository() {
  const temporaryParent = path.join(repositoryRoot, '.tmp');
  fs.mkdirSync(temporaryParent, { recursive: true });
  const root = fs.mkdtempSync(path.join(temporaryParent, 'unsafe-expression-guard-'));
  const scriptPath = path.join(root, 'scripts/check-unsafe-expressions.js');
  fs.mkdirSync(path.dirname(scriptPath), { recursive: true });
  fs.copyFileSync(path.join(repositoryRoot, 'scripts/check-unsafe-expressions.js'), scriptPath);
  writeJson(path.join(root, allowlistRelativePath), {
    schemaVersion: 1,
    documentation: documentationRelativePath,
    entries: [],
  });
  writeJson(path.join(root, sourceExclusionsRelativePath), {
    schemaVersion: 1,
    documentation: documentationRelativePath,
    entries: [],
  });
  fs.mkdirSync(path.dirname(path.join(root, documentationRelativePath)), { recursive: true });
  fs.writeFileSync(path.join(root, documentationRelativePath), '# Test inventory\n');
  execFileSync('git', ['init', '--quiet'], { cwd: root });
  return root;
}

function invokeGuardWithTrackedSources(root, sources) {
  for (const { relativePath, source } of sources) {
    const absolutePath = path.join(root, ...relativePath.split('/'));
    fs.mkdirSync(path.dirname(absolutePath), { recursive: true });
    fs.writeFileSync(absolutePath, source);
  }
  execFileSync('git', ['add', '.'], { cwd: root });
  return spawnSync(process.execPath, ['scripts/check-unsafe-expressions.js'], {
    cwd: root,
    encoding: 'utf8',
  });
}

function invokeGuardWithTrackedSource(root, source, relativePath = 'packages/example/src/runtime.ts') {
  return invokeGuardWithTrackedSources(root, [{ relativePath, source }]);
}

test('detects direct eval without matching comments, strings, or property names', () => {
  const findings = scanSource(
    `
      // eval(configuredSource)
      const description = 'eval(configuredSource)';
      const safe = { eval: configuredSource };
      eval(configuredSource);
    `,
    'packages/example/src/runtime.ts'
  );

  assert.equal(findings.length, 1);
  assert.equal(findings[0].kind, 'direct-eval');
});

test('detects indirect, global-member, aliased, and call-form eval execution', () => {
  const findings = scanSource(
    `
      (0, eval)(configuredSource);
      globalThis['eval'](configuredSource);
      const executeConfiguredSource = eval;
      executeConfiguredSource(configuredSource);
      const { eval: destructuredEval } = globalThis;
      destructuredEval(configuredSource);
      eval.call(globalThis, configuredSource);
      const reboundEval = window.eval.bind(window);
      reboundEval(configuredSource);
    `,
    'packages/example/src/runtime.ts'
  );

  assert.ok(findings.length >= 6);
  assert.ok(findings.every(finding => finding.kind === 'direct-eval'));
});

test('detects Lodash template imports, bracket access, destructuring, and aliases', () => {
  const findings = scanSource(
    `
      import lodashDefault, { template as compileConfigured } from 'lodash-es';
      import compileSubpath from 'lodash/template';
      const lodashRequired = require('lodash');
      const lodashAlias = lodashDefault;
      const { template: destructuredCompile } = lodashRequired;
      const aliasedCompile = lodashDefault['template'];
      compileConfigured(firstConfig);
      lodashRequired['template'](secondConfig);
      destructuredCompile(thirdConfig);
      aliasedCompile(fourthConfig);
      lodashAlias.template(fifthConfig);
      compileSubpath(sixthConfig);
    `,
    'packages/example/src/runtime.ts'
  );

  assert.equal(findings.length, 6);
  assert.ok(findings.every(finding => finding.kind === 'lodash-template'));
});

for (const bypass of bypassCases) {
  test(`scanSource rejects ${bypass.name}`, () => {
    const findings = scanSource(bypass.source, 'packages/example/src/runtime.ts');
    assert.ok(
      findings.some(finding => finding.kind === bypass.kind),
      `${bypass.name} should produce a ${bypass.kind} finding`
    );
  });
}

test('the guard invocation rejects every provenance bypass', async t => {
  const root = createEndToEndGuardRepository();
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));

  for (const bypass of bypassCases) {
    await t.test(bypass.name, () => {
      const result = invokeGuardWithTrackedSource(root, bypass.source);
      assert.notEqual(result.status, 0);
      assert.match(result.stderr, new RegExp(`Unexpected unsafe execution: .* ${bypass.kind} `));
    });
  }
});

test('scans JSX and explicit TypeScript module extensions in packages and first-party assets', () => {
  for (const { extension, source } of sourceExtensionCases) {
    for (const relativePath of [
      `packages/example/src/runtime${extension}`,
      `assets/default/default/js/first-party-runtime${extension}`,
    ]) {
      assert.equal(isScannedSourcePath(relativePath), true, `${relativePath} should be scanned`);
      assert.deepEqual(
        scanSource(source, relativePath).map(finding => finding.kind),
        ['direct-eval'],
        `${relativePath} should use the appropriate parser mode and reject builtin eval`
      );
    }
  }
});

test('the guard invocation rejects JSX, MTS, and CTS in package and first-party asset paths', t => {
  const root = createEndToEndGuardRepository();
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const sources = sourceExtensionCases.flatMap(({ extension, source }) => [
    { relativePath: `packages/example/src/runtime${extension}`, source },
    { relativePath: `assets/default/default/js/first-party-runtime${extension}`, source },
  ]);
  const result = invokeGuardWithTrackedSources(root, sources);

  assert.notEqual(result.status, 0);
  for (const { relativePath } of sources) {
    assert.ok(result.stderr.includes(`Unexpected unsafe execution: ${relativePath}:`), result.stderr);
  }
});

test('standard lint keeps both the guard CLI and its regression suite enabled', () => {
  assert.match(packageJson.scripts.lint, /npm run lint:unsafe-expressions/);
  assert.equal(
    packageJson.scripts['lint:unsafe-expressions'],
    'node scripts/check-unsafe-expressions.js && npm run test:unsafe-expressions'
  );
  assert.equal(
    packageJson.scripts['test:unsafe-expressions'],
    'node --test test/static/unsafe-expression-guard.test.js'
  );
});

test('does not confuse safe template APIs and local render functions with Lodash', () => {
  const findings = scanSource(
    `
      import Handlebars from 'handlebars';
      const template = context => String(context);
      Handlebars.template(precompiledSpecification)(context);
      template(context);
    `,
    'packages/example/src/runtime.ts'
  );

  assert.deepEqual(findings, []);
});

test('distinguishes bound callables from invocation results', () => {
  const findings = scanSource(
    `
      import lodash from 'lodash';
      const ric = lodash.runInContext.bind(lodash);
      const invoke = Reflect.apply.bind(Reflect, eval, globalThis);
      ric.template(configuredSource);
      ric();
      void invoke;
    `,
    'packages/example/src/runtime.ts'
  );

  assert.deepEqual(findings, []);
});

test('respects lexical shadowing and excludes Handlebars and JSONata APIs', () => {
  const findings = scanSource(
    `
      import Handlebars from 'handlebars';
      import jsonata from 'jsonata';
      function runLocal(eval, Reflect, globalThis, _) {
        const carrier = { evaluate: eval, compile: _.template };
        const [...rest] = [eval];
        const ric = _.runInContext.bind(_);
        Reflect.apply(carrier.evaluate, globalThis, [configuredSource]);
        Reflect.apply.call(null, carrier.evaluate, globalThis, [configuredSource]);
        Reflect.construct(carrier.compile, [configuredSource]);
        carrier.compile(configuredSource);
        rest[0](configuredSource);
        ric().template(configuredSource);
      }
      const compile = function (source) { return source; };
      new compile(configuredSource);
      compile\`configured source\`;
      Handlebars.compile(configuredSource)({});
      jsonata(configuredSource).evaluate({});
      $eval(configuredSource);
    `,
    'packages/example/src/runtime.ts'
  );

  assert.deepEqual(findings, []);
});

test('keeps nested shadow bindings separate from imported Lodash provenance', () => {
  const findings = scanSource(
    `
      import lodash from 'lodash';
      namespace SafeNamespace {
        const lodash = { template: value => value };
        lodash.template(configuredSource);
      }
      function runLocal(lodash) {
        lodash.template(configuredSource);
      }
      lodash.template(configuredSource);
    `,
    'packages/example/src/runtime.ts'
  );

  assert.deepEqual(
    findings.map(finding => finding.kind),
    ['lodash-template']
  );
});

test('the deliberately unsafe fixture fails even when presented with a test-like runtime filename', () => {
  const fixture = fs.readFileSync(
    path.join(repositoryRoot, 'test/resources/static-guard/unsafe-expressions.fixture.ts'),
    'utf8'
  );
  const disguisedRuntimePath = 'packages/example/src/unsafe-expressions.spec.ts';
  assert.equal(isScannedSourcePath(disguisedRuntimePath), true);

  const findings = scanSource(fixture, disguisedRuntimePath);
  const comparison = compareFindingsToAllowlist(findings, []);
  assert.deepEqual(
    new Set(comparison.unexpected.map(finding => finding.kind)),
    new Set(['direct-eval', 'lodash-template'])
  );
  assert.deepEqual(comparison.stale, []);
});

test('a first-party asset fixture is scanned and rejected', () => {
  const fixture = fs.readFileSync(
    path.join(repositoryRoot, 'test/resources/static-guard/unsafe-first-party-asset.fixture.js'),
    'utf8'
  );
  const firstPartyAssetPath = 'assets/default/default/js/first-party-runtime.js';
  assert.equal(isScannedSourcePath(firstPartyAssetPath), true);
  assert.deepEqual(
    scanSource(fixture, firstPartyAssetPath).map(finding => finding.kind),
    ['direct-eval']
  );
});

test('the guard invocation rejects unsafe first-party asset JavaScript', t => {
  const root = createEndToEndGuardRepository();
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const fixture = fs.readFileSync(
    path.join(repositoryRoot, 'test/resources/static-guard/unsafe-first-party-asset.fixture.js'),
    'utf8'
  );
  const result = invokeGuardWithTrackedSource(root, fixture, 'assets/default/default/js/first-party-runtime.js');

  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /Unexpected unsafe execution: assets\/default\/default\/js\/first-party-runtime\.js/);
});

test('requires complete metadata and an identical documentation row for every allowlist entry', () => {
  assert.deepEqual(validateAllowlist(allowlist, documentation), []);
  assert.equal(allowlist.entries.length, 16);
  assert.equal(allowlist.entries.filter(entry => entry.kind === 'direct-eval').length, 5);
  assert.equal(allowlist.entries.filter(entry => entry.kind === 'lodash-template').length, 11);

  const incomplete = structuredClone(allowlist);
  delete incomplete.entries[0].followUp;
  assert.ok(validateAllowlist(incomplete, documentation).some(error => error.includes('must contain exactly')));

  const undocumented = structuredClone(allowlist);
  undocumented.entries[0].rationale = 'A replacement rationale long enough to satisfy the metadata length gate.';
  assert.ok(validateAllowlist(undocumented, documentation).some(error => error.includes('not explicitly mirrored')));
});

test('limits source exclusions to the named vendored and generated asset files', () => {
  assert.deepEqual(validateSourceExclusions(sourceExclusions, documentation, repositoryRoot), []);
  assert.deepEqual(
    sourceExclusions.entries.map(entry => [entry.path, entry.kind]),
    [
      ['assets/default/default/js/v0_3_1-leaflet-omnivore.min.js', 'vendored'],
      ['assets/default/default/js/vocab_widget_v2.js', 'vendored'],
      ['assets/js/dependencies/sails.io.js', 'generated'],
    ]
  );
  assert.ok(sourceExclusions.entries.every(entry => !isScannedSourcePath(entry.path)));
  assert.equal(isScannedSourcePath('assets/default/default/js/admin-api-docs-bootstrap.js'), true);
  assert.equal(isScannedSourcePath('assets/default/default/js/admin-api-docs-init.js'), true);
  assert.equal(isScannedSourcePath('assets/js/index.js'), true);
  assert.equal(isScannedSourcePath('assets/js/dependencies/first-party.js'), true);

  const broad = structuredClone(sourceExclusions);
  broad.entries[0].path = 'assets/';
  assert.ok(
    validateSourceExclusions(broad, documentation, repositoryRoot).some(error =>
      error.includes('must name a JavaScript or TypeScript source file')
    )
  );
});

test('freezes the allowlist entry identities so growth requires an explicit test change', () => {
  assert.deepEqual(allowlist.entries.map(entry => entry.id).sort(), expectedEntryIds);
});

test('forbids managed record workflow and removed generic-action paths from the allowlist', () => {
  assert.ok(allowlist.entries.every(entry => !isManagedOrRemovedPath(entry.path)));

  for (const forbiddenPath of [
    'packages/redbox-core/src/action-registry/injected.ts',
    'packages/redbox-core/src/expression-runtime/injected.ts',
    'packages/redbox-core/src/record-workflow-administration/injected.ts',
    'packages/redbox-core/src/workflow-transition/injected.ts',
    `packages/redbox-core/src/controllers/${['Action', 'Controller'].join('')}.ts`,
  ]) {
    const mutated = structuredClone(allowlist);
    mutated.entries[0].path = forbiddenPath;
    assert.ok(validateAllowlist(mutated, '').some(error => error.includes('cannot allowlist managed or removed')));
  }
});

test('normalizes repository paths and keeps only declared non-runtime roots out of scope', () => {
  assert.equal(isScannedSourcePath('packages/example/src/hidden.spec.ts'), true);
  assert.equal(isScannedSourcePath('test/resources/fixture.ts'), false);
  assert.equal(isScannedSourcePath('packages/example/test/fixture.ts'), false);
  assert.equal(isScannedSourcePath('support/documentation/tool.ts'), false);
  assert.equal(isScannedSourcePath('assets/first-party.js'), true);
  assert.throws(() => normalizeRelativePath('../packages/example/src/runtime.ts'));
  assert.throws(() => normalizeRelativePath('packages\\example\\src\\runtime.ts'));
  assert.throws(() => normalizeRelativePath('/packages/example/src/runtime.ts'));
});

test('the repository findings exactly match the bounded legacy allowlist', () => {
  const result = runGuard(repositoryRoot);
  assert.deepEqual(result.metadataErrors, []);
  assert.deepEqual(result.unexpected, []);
  assert.deepEqual(result.stale, []);
  assert.deepEqual(
    result.findings.filter(finding => isManagedOrRemovedPath(finding.path)),
    []
  );
  assert.equal(result.findings.length, 16);
});
