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
    'main.css': { bytes: 1, entryPoint: 'main.css' }
  } }), /Missing main entry/);
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
  assert.equal(budgetBytes(' 500 kb '), 500000);
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
      options: { outputPath: { base: '../assets/angular/example' }, optimization: { scripts: false } }, configurations: { production }
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
  fs.renameSync(path.join(base, 'browser-stats.json'), path.join(base, 'stats.json'));
  assert.equal(checkProject(root, 'example').initialBytes, 100);
  fs.renameSync(path.join(base, 'stats.json'), path.join(base, 'browser-stats.json'));
  fs.writeFileSync(bundle, 'stale');
  assert.throws(() => checkProject(root, 'example'), /stats do not match/);
  fs.writeFileSync(bundle, 'a'.repeat(100));
  production.budgets[0].maximumError = '99b';
  writeWorkspace();
  assert.throws(() => checkProject(root, 'example'), /exceeds 99b/);
  production.optimization.scripts = false;
  writeWorkspace();
  assert.throws(() => checkProject(root, 'example'), /optimisation is disabled/);
  production.optimization = { styles: true };
  writeWorkspace();
  assert.throws(() => checkProject(root, 'example'), /optimisation is disabled/);
});

test('accepts mixed-case URL-safe hashes of different lengths and reports JS/CSS separately', () => {
  const report = measureBundles({ outputs: {
    'main-aZ0_-91xy.js': { bytes: 100, entryPoint: 'src/main.ts', imports: [
      { path: 'chunk-Ab_c-d.js', kind: 'import-statement' }
    ] },
    'chunk-Ab_c-d.js': { bytes: 30 },
    'styles-aBc_D123.css': { bytes: 20, entryPoint: 'angular:styles/global:styles' }
  } });
  assert.equal(report.initialJsBytes, 130);
  assert.equal(report.initialCssBytes, 20);
  assert.equal(report.initialBytes, 150);
});

test('requires configured entries and does not confuse a non-injected named style with a hash', () => {
  const stats = { outputs: {
    'main.js': { bytes: 10, entryPoint: 'main.ts' },
    'theme-aB_c1234.css': { bytes: 20, entryPoint: 'angular:styles/global:theme' },
    'theme-dark.css': { bytes: 30, entryPoint: 'angular:styles/global:theme-dark' },
    'scripts.js': { bytes: 40, entryPoint: 'angular:script/global:scripts.js' }
  } };
  assert.equal(measureBundles(stats, ['main', 'theme'], ['main', 'theme']).initialBytes, 30);
  assert.equal(measureBundles(stats, ['main', 'scripts'], ['main', 'scripts']).initialBytes, 50);
  assert.throws(() => measureBundles(stats, ['main', 'missing'], ['main', 'missing']), /Missing missing entry/);
});

test('checks injected custom bundles, disabled defaults, all initial budgets and ambiguous stats', t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'redbox-bundle-entries-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  fs.mkdirSync(path.join(root, 'angular'));
  const base = path.join(root, 'assets/angular/example');
  fs.mkdirSync(path.join(base, 'browser'), { recursive: true });
  const production = {
    styles: [{ input: 'theme.css', bundleName: 'theme' }, { input: 'optional.css', inject: false }],
    scripts: [{ input: 'optional.js', inject: false }, { input: 'custom.js', bundleName: 'custom' }],
    budgets: [{ type: 'initial', maximumWarning: '100b', maximumError: '110b' }]
  };
  const writeWorkspace = () => fs.writeFileSync(path.join(root, 'angular/angular.json'), JSON.stringify({
    projects: { '@researchdatabox/example': { projectType: 'application', architect: { build: {
      options: { outputPath: { base: '../assets/angular/example' } }, configurations: { production }
    } } } }
  }));
  const outputs = {
    'main-aBc_-123.js': { bytes: 40, entryPoint: 'main.ts' },
    'theme-XyZ98765.css': { bytes: 60, entryPoint: 'angular:styles/global:theme' },
    'styles.css': { bytes: 500, entryPoint: 'angular:styles/global:styles' },
    'scripts.js': { bytes: 500, entryPoint: 'angular:script/global:scripts.js' },
    'custom-aB_cD123.js': { bytes: 0, entryPoint: 'angular:script/global:custom.js' }
  };
  for (const [file, output] of Object.entries(outputs)) fs.writeFileSync(path.join(base, 'browser', file), 'x'.repeat(output.bytes));
  const stats = JSON.stringify({ outputs });
  fs.writeFileSync(path.join(base, 'browser-stats.json'), stats);
  writeWorkspace();
  const report = checkProject(root, 'example');
  assert.equal(report.initialBytes, 100);
  assert.equal(report.lazyBytes, 1000);
  assert.equal(report.warning, false); // equality is allowed by Angular
  production.budgets.push({ type: 'initial', maximumWarning: '80b', maximumError: '90b' });
  writeWorkspace();
  assert.throws(() => checkProject(root, 'example'), /exceeds 90b/);
  production.budgets.pop();
  production.budgets[0].baseline = '1kb';
  writeWorkspace();
  assert.throws(() => checkProject(root, 'example'), /without a baseline/);
  delete production.budgets[0].baseline;
  production.budgets[0].maximumWarning = '120b';
  writeWorkspace();
  assert.throws(() => checkProject(root, 'example'), /warning budget exceeds/);
  production.budgets[0].maximumWarning = '100b';
  production.styles.push({ input: 'missing.css', bundleName: 'missing' });
  writeWorkspace();
  assert.throws(() => checkProject(root, 'example'), /Missing missing entry/);
  production.styles.pop();
  writeWorkspace();
  fs.writeFileSync(path.join(base, 'stats.json'), stats);
  assert.throws(() => checkProject(root, 'example'), /ambiguous production stats/);
});
