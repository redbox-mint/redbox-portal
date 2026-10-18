const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { test } = require('node:test');
const { measureBundles, budgetBytes, checkProject } = require('./angular-bundle-stats.cjs');

test('initial size includes shared static JS and CSS once and excludes lazy features', () => {
  const report = measureBundles({ outputs: {
    'main-ABCDEFGH.js': { bytes: 100, entryPoint: 'src/main.ts', imports: [
      { path: 'shared.js', kind: 'import-statement' },
      { path: 'editor.js', kind: 'dynamic-import' },
      { path: 'https://example.com/external.js', kind: 'import-statement', external: true }
    ] },
    'polyfills-ABCDEFGH.js': { bytes: 20, entryPoint: 'angular:polyfills', imports: [
      { path: 'shared.js', kind: 'import-statement' }
    ] },
    'shared.js': { bytes: 30, imports: [{ path: 'main-ABCDEFGH.js', kind: 'import-statement' }] },
    'styles-ABCDEFGH.css': { bytes: 40, entryPoint: 'angular:styles/global:styles', imports: [
      { path: 'theme.css', kind: 'import-rule' }, { path: 'font.woff2', kind: 'url-token' }
    ] },
    'theme.css': { bytes: 10 },
    'font.woff2': { bytes: 2000 },
    'editor.js': { bytes: 500, entryPoint: 'src/editor.ts' },
    'editor.css': { bytes: 50 },
    'inline.component-ABCDEFGH.css': { bytes: 10000, 'ng-component': true },
    'main-ABCDEFGH.js.map': { bytes: 9000 }
  } });
  assert.equal(report.initialBytes, 200);
  assert.equal(report.lazyBytes, 550);
  assert.equal(report.files.length, 7);
});

test('supports named injected entry bundles and extracted entry CSS', () => {
  const report = measureBundles({ outputs: {
    'main.js': { bytes: 10, entryPoint: 'src/main.ts', cssBundle: 'main.css' },
    'main.css': { bytes: 20 },
    'theme.js': { bytes: 30, entryPoint: 'theme.ts' },
    'optional.js': { bytes: 40, entryPoint: 'optional.ts' }
  } }, ['main', 'theme']);
  assert.equal(report.initialBytes, 60);
  assert.equal(report.lazyBytes, 40);
});

test('rejects missing or incomplete stats instead of reporting a misleading small bundle', () => {
  assert.throws(() => measureBundles({}), /Missing esbuild outputs/);
  assert.throws(() => measureBundles({ outputs: {} }), /Missing main entry/);
  assert.throws(() => measureBundles({ outputs: {
    'main.js': { entryPoint: 'main.ts', bytes: 1, imports: [{ path: 'missing.js', kind: 'import-statement' }] }
  } }), /Missing statically imported output/);
  assert.throws(() => measureBundles({ outputs: {
    'main.js': { entryPoint: 'main.ts', bytes: -1 }
  } }), /Invalid byte size/);
});

test('matches Angular decimal budget units', () => {
  assert.equal(budgetBytes('500kb'), 500000);
  assert.equal(budgetBytes('1.25 MB'), 1250000);
  assert.equal(budgetBytes('120b'), 120);
  assert.throws(() => budgetBytes('10%'), /Unsupported absolute bundle budget/);
});

test('validates Angular 22 stats against emitted files, budgets and production optimisation', t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'redbox-bundle-stats-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  fs.mkdirSync(path.join(root, 'angular'));
  const base = path.join(root, 'assets/angular/example');
  fs.mkdirSync(path.join(base, 'browser'), { recursive: true });
  const production = {
    optimization: { scripts: true },
    budgets: [{ type: 'initial', maximumWarning: '90b', maximumError: '110b' }]
  };
  const writeWorkspace = () => fs.writeFileSync(path.join(root, 'angular/angular.json'), JSON.stringify({
    projects: { '@researchdatabox/example': { projectType: 'application', architect: { build: {
      options: { outputPath: { base: '../assets/angular/example' } }, configurations: { production }
    } } } }
  }));
  writeWorkspace();
  assert.throws(() => checkProject(root, 'example'), /missing production stats/);
  fs.writeFileSync(path.join(base, 'browser-stats.json'), JSON.stringify({ outputs: {
    'main-ABCDEFGH.js': { bytes: 100, entryPoint: 'src/main.ts' }
  } }));
  const bundle = path.join(base, 'browser/main-ABCDEFGH.js');
  fs.writeFileSync(bundle, 'a'.repeat(100));
  assert.equal(checkProject(root, 'example').initialBytes, 100);
  assert.equal(checkProject(root, 'example').warning, true);
  fs.writeFileSync(bundle, 'stale');
  assert.throws(() => checkProject(root, 'example'), /stats do not match/);
  fs.writeFileSync(bundle, 'a'.repeat(100));
  production.budgets[0].maximumError = '99b';
  writeWorkspace();
  assert.throws(() => checkProject(root, 'example'), /exceeds 99b/);
  production.optimization.scripts = false;
  writeWorkspace();
  assert.throws(() => checkProject(root, 'example'), /optimisation is disabled/);
});
