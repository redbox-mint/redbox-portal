'use strict';

const assert = require('node:assert/strict');
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
  validateAllowlist,
} = require('../../scripts/check-unsafe-expressions');

const repositoryRoot = path.resolve(__dirname, '../..');
const allowlist = JSON.parse(fs.readFileSync(path.join(repositoryRoot, allowlistRelativePath), 'utf8'));
const documentation = fs.readFileSync(path.join(repositoryRoot, documentationRelativePath), 'utf8');
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
  assert.equal(isScannedSourcePath('assets/vendor.js'), false);
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
