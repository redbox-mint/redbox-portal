#!/usr/bin/env node
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { test } = require('node:test');
const assets = require('./integration-prebuilt-assets.cjs');

const helper = path.join(__dirname, 'integration-prebuilt-assets.cjs');
const repository = path.resolve(__dirname, '../..');
const revision = 'a'.repeat(40);
const otherRevision = 'b'.repeat(40);
const overlay = '1 0 0:1 / / rw - overlay overlay rw\n';

function put(root, filename, data, executable = false) {
  const absolute = path.join(root, filename);
  fs.mkdirSync(path.dirname(absolute), { recursive: true });
  fs.writeFileSync(absolute, data);
  if (executable) fs.chmodSync(absolute, 0o755);
}

function fixture(t, { generate = true } = {}) {
  // Keep all writes within the authorized shared checkout, clean on every test.
  const root = fs.mkdtempSync(path.join(__dirname, '.integration-assets-test-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const applications = [...assets.REQUIRED_APPS, 'form'];
  put(root, 'angular/angular.json', JSON.stringify({ projects: Object.fromEntries(applications.map(app => [app, {
    architect: { build: { builder: '@angular-devkit/build-angular:application' } },
  }])) }));
  for (const app of applications) {
    for (const directory of ['assets/angular', '.tmp/public/angular']) {
      const prefix = `${directory}/${app}/browser/`;
      put(root, `${prefix}main-123.js`, 'import { boot } from "./chunk-123.js"; boot(); import("./lazy-123.js");');
      put(root, `${prefix}chunk-123.js`, 'export function boot() {}');
      put(root, `${prefix}lazy-123.js`, 'export * from "./chunk-123.js";');
      put(root, `${prefix}polyfills-123.js`, 'console.log("polyfills");');
      put(root, `${prefix}styles-123.css`, 'body { background: url("./media/icon.svg"); }');
      put(root, `${prefix}media/icon.svg`, '<svg/>');
      put(root, `${prefix}index.html`, '<html><head><base href="/"><link rel="stylesheet" href="styles-123.css"></head>' +
        '<body><link rel="modulepreload" href="chunk-123.js"><script type="module" src="polyfills-123.js"></script>' +
        '<script type="module" src="main-123.js"></script></body></html>');
    }
  }
  for (const filename of assets.REQUIRED_WEBPACK) put(root, `.tmp/public/${filename}`, 'built payload');
  put(root, '.tmp/public/default/default/fonts/font.woff2', 'font payload');
  put(root, 'assets/default/default/styles/site.scss', 'body { color: black }');
  if (generate) assets.generate(root, revision);
  return root;
}

function optedEnv() {
  return { CI: 'true', RBPORTAL_REUSE_PREBUILT_ASSETS: 'true', RBPORTAL_EXPECTED_IMAGE_REVISION: revision };
}

test('generator CLI produces deterministic metadata and the CLI verifies it', t => {
  const root = fixture(t);
  const before = fs.readFileSync(path.join(root, assets.MANIFEST), 'utf8');
  const generated = spawnSync(process.execPath, [helper, 'generate', revision, root], { encoding: 'utf8' });
  assert.equal(generated.status, 0, generated.stderr);
  assert.equal(fs.readFileSync(path.join(root, assets.MANIFEST), 'utf8'), before);
  const verified = spawnSync(process.execPath, [helper, 'verify', revision, root], { encoding: 'utf8' });
  assert.equal(verified.status, 0, verified.stderr);
  assert.equal(assets.startupMode(root, optedEnv(), overlay), 'reuse');
});

test('reuse is disabled by default, requires explicit CI and a full expected revision', t => {
  const root = fixture(t);
  fs.rmSync(path.join(root, assets.MANIFEST));
  assert.equal(assets.startupMode(root, { CI: 'true' }, overlay), 'build');
  assert.equal(assets.startupMode(root, { RBPORTAL_REUSE_PREBUILT_ASSETS: 'false' }, overlay), 'build');
  assert.throws(() => assets.startupMode(root, { ...optedEnv(), CI: 'false' }, overlay), /CI=true/);
  assert.throws(() => assets.startupMode(root, { ...optedEnv(), RBPORTAL_EXPECTED_IMAGE_REVISION: '' }, overlay), /full lowercase Git revision/);
  assert.throws(() => assets.startupMode(root, { ...optedEnv(), RBPORTAL_EXPECTED_IMAGE_REVISION: 'abc' }, overlay), /full lowercase Git revision/);
  assert.throws(() => assets.startupMode(root, { ...optedEnv(), RBPORTAL_REUSE_PREBUILT_ASSETS: 'yes' }, overlay), /true or false/);
  assert.throws(() => assets.startupMode(root, optedEnv(), ''), /empty mountinfo/);
  assert.throws(() => assets.startupMode(root, optedEnv(), 'bad data'), /Invalid Linux mountinfo/);
  assert.equal(assets.startupMode(root, {}, ''), 'mounted');
});

for (const [description, mutate, pattern] of [
  ['missing manifest', root => fs.rmSync(path.join(root, assets.MANIFEST)), /ENOENT/],
  ['missing image identity', root => fs.rmSync(path.join(root, assets.IMAGE_IDENTITY)), /ENOENT/],
  ['wrong image revision', root => {
    const identity = JSON.parse(fs.readFileSync(path.join(root, assets.IMAGE_IDENTITY)));
    put(root, assets.IMAGE_IDENTITY, JSON.stringify({ ...identity, revision: otherRevision }));
  }, /Image revision/],
  ['corrupt manifest', root => fs.appendFileSync(path.join(root, assets.MANIFEST), 'broken'), /manifest checksum/],
  ['missing application bundle', root => fs.rmSync(path.join(root, 'assets/angular/form/browser/main-123.js')), /inventory\/checksum/],
  ['corrupt served bundle', root => put(root, '.tmp/public/angular/branding/browser/main-123.js', 'corrupt'), /inventory\/checksum/],
  ['missing stylesheet', root => fs.rmSync(path.join(root, '.tmp/public/default/default/styles/style.min.css')), /inventory\/checksum/],
  ['missing font', root => fs.rmSync(path.join(root, '.tmp/public/default/default/fonts/font.woff2')), /inventory\/checksum/],
  ['unexpected stale file', root => put(root, '.tmp/public/stale.js', 'old'), /inventory\/checksum/],
  ['symlinked asset tree', root => {
    fs.renameSync(path.join(root, 'assets'), path.join(root, 'moved-assets'));
    fs.symlinkSync('moved-assets', path.join(root, 'assets'));
  }, /Symlink/],
]) {
  test(`verification fails closed for ${description}`, t => {
    const root = fixture(t);
    mutate(root);
    assert.throws(() => assets.startupMode(root, optedEnv(), overlay), pattern);
  });
}

test('generator rejects incomplete outputs rather than blessing a broken image', t => {
  const root = fixture(t, { generate: false });
  fs.rmSync(path.join(root, '.tmp/public/angular/form/browser/main-123.js'));
  assert.throws(() => assets.generate(root, revision), /Missing Angular main bundle/);
  assert.throws(() => assets.generate(root, 'branch-name'), /full lowercase Git revision/);
});

for (const directory of ['assets/angular', '.tmp/public/angular']) {
  for (const filename of ['polyfills-123.js', 'styles-123.css', 'chunk-123.js', 'lazy-123.js', 'media/icon.svg']) {
    test(`generation rejects originally missing ${directory} dependency ${filename}`, t => {
      const root = fixture(t, { generate: false });
      fs.rmSync(path.join(root, `${directory}/form/browser/${filename}`));
      assert.throws(() => assets.generate(root, revision), /Missing or empty prepared asset/);
      assert.equal(fs.existsSync(path.join(root, assets.MANIFEST)), false);
      assert.equal(fs.existsSync(path.join(root, assets.IMAGE_IDENTITY)), false);
    });
  }
}

test('an unrelated main file cannot replace the index entry point', t => {
  const root = fixture(t, { generate: false });
  put(root, 'assets/angular/form/browser/index.html', '<html></html>');
  assert.throws(() => assets.generate(root, revision), /index does not reference a local main bundle/);
});

for (const statement of ['import { boot } from "./missing-static.js";', 'export * from "./missing-reexport.js";']) {
  test(`generation rejects a transitive dependency absent before inventory: ${statement}`, t => {
    const root = fixture(t, { generate: false });
    put(root, 'assets/angular/form/browser/chunk-123.js', statement);
    assert.throws(() => assets.generate(root, revision), /Missing or empty prepared asset.*missing-/);
    assert.equal(fs.existsSync(path.join(root, assets.MANIFEST)), false);
  });
}

test('a stale unreferenced main cannot hide a missing index-referenced main', t => {
  const root = fixture(t, { generate: false });
  fs.renameSync(path.join(root, 'assets/angular/form/browser/main-123.js'), path.join(root, 'assets/angular/form/browser/main-old.js'));
  assert.throws(() => assets.generate(root, revision), /Missing or empty prepared asset.*main-123.js/);
});

test('local base URLs, query strings, entities, encoded names and external URLs are handled explicitly', t => {
  const root = fixture(t, { generate: false });
  const prefix = 'assets/angular/form/browser/';
  put(root, `${prefix}index.html`, '<base href="/portal/"><script src="/portal/angular/form/browser/main-123.js?v=1&amp;lang=en#entry"></script>' +
    '<link href="styles-123.css?version=2"><img src="media/space%20icon.svg">' +
    '<script src="https://cdn.example/external.js"></script><link href="//cdn.example/style.css">' +
    '<img src="data:image/png;base64,aaa"><img src="#icon">');
  put(root, `${prefix}media/space icon.svg`, '<svg/>');
  assets.generate(root, revision);
  assets.verify(root, revision);
});

for (const reference of ['../escape.js', '%2e%2e/escape.js', '%252e%252e/escape.js',
  'foo%5cbar.js', 'file:///outside.js', '/other/main.js', 'main.js%00', 'bad%zz.js']) {
  test(`generation rejects unsafe or unresolvable local URL ${reference}`, t => {
    const root = fixture(t, { generate: false });
    put(root, 'assets/angular/form/browser/index.html', `<base href="/portal/"><script src="${reference}"></script>`);
    assert.throws(() => assets.generate(root, revision), /Unsafe asset URL|Unsupported asset URL|outside base href|URI malformed/);
    assert.equal(fs.existsSync(path.join(root, assets.MANIFEST)), false);
  });
}

for (const base of ['https://cdn.example/', '//cdn.example/', '/../outside/', '/bad%2fbase/', 'relative/']) {
  test(`generation rejects unsupported base URL ${base}`, t => {
    const root = fixture(t, { generate: false });
    put(root, 'assets/angular/form/browser/index.html', `<base href="${base}"><script src="main-123.js"></script>`);
    assert.throws(() => assets.generate(root, revision), /Unsupported Angular base href/);
  });
}

test('generation follows CSS imports and module-relative resource URLs', t => {
  const root = fixture(t, { generate: false });
  const prefix = 'assets/angular/form/browser/';
  put(root, `${prefix}main-123.js`, 'import "./side-effect.js"; new URL("./worker.js", import.meta.url);');
  put(root, `${prefix}side-effect.js`, 'export {};');
  put(root, `${prefix}worker.js`, 'export {};');
  put(root, `${prefix}styles-123.css`, '@import "./theme.css";');
  put(root, `${prefix}theme.css`, 'body { background: url(data:image/png;base64,aaa); }');
  assets.generate(root, revision);
  fs.rmSync(path.join(root, `${prefix}worker.js`));
  assert.throws(() => assets.generate(root, revision), /Missing or empty prepared asset.*worker.js/);
  put(root, `${prefix}worker.js`, 'export {};');
  fs.rmSync(path.join(root, `${prefix}theme.css`));
  assert.throws(() => assets.generate(root, revision), /Missing or empty prepared asset.*theme.css/);
});

test('empty Angular stylesheets are valid and diagnostic strings/comments are not dependencies', t => {
  const root = fixture(t, { generate: false });
  const prefix = 'assets/angular/form/browser/';
  put(root, `${prefix}styles-123.css`, '');
  put(root, `${prefix}main-123.js`, [
    'import { boot } from "./chunk-123.js";',
    '// import("./missing-comment.js")',
    '/* export * from "./missing-comment-too.js"; */',
    'console.log(`Component transformed from \'${name}\' to \'${other}\'.`);',
    'console.log("import(\'./missing-string.js\')");',
  ].join('\n'));
  assets.generate(root, revision);
  assets.verify(root, revision);
});

const angular20Reproduction = 'console.log(/"/.test(document.title)); document.body.addEventListener(\'click\',()=>import(\'./lazy\').then(m=>console.log(m.lazy)));';

for (const directory of ['assets/angular', '.tmp/public/angular']) {
  for (const [description, source, pattern] of [
    ['quote in regex before dynamic import', angular20Reproduction, /Missing or empty prepared asset.*lazy/],
    ['regex character class and division', String.raw`console.log(/["'\x60/]/.test(document.title), 4 / 2); import('./missing.js');`, /Missing or empty prepared asset.*missing/],
    ['import-looking regex is not a dependency', String.raw`console.log(/import\("\.\/fake.js"\)/); import('./missing.js');`, /Missing or empty prepared asset.*missing/],
    ['literal template import', 'import(`./missing.js`);', /Missing or empty prepared asset.*missing/],
    ['nested template substitution', 'console.log(`outer ${`inner ${import("./missing.js")}`}`);', /Missing or empty prepared asset.*missing/],
    ['escaped literal import', String.raw`import("\x2e/missing.js");`, /Missing or empty prepared asset.*missing/],
    ['escaped traversal', String.raw`import("\x2e\x2e/escape.js");`, /Unsafe asset URL/],
    ['escaped scheme', String.raw`export * from "\u0066ile:///outside.js";`, /Unsupported asset URL/],
    ['escaped resource URL', String.raw`new URL("\x2e/missing.js", import.meta.url);`, /Missing or empty prepared asset.*missing/],
    ['template resource URL', 'new URL(`./missing.js`, import.meta.url);', /Missing or empty prepared asset.*missing/],
    ['malformed JavaScript', 'console.log("unterminated); import("./missing.js");', /Cannot parse JavaScript asset/],
  ]) {
    test(`generation rejects ${description} in ${directory}`, t => {
      const root = fixture(t, { generate: false });
      put(root, `${directory}/form/browser/main-123.js`, source);
      assert.throws(() => assets.generate(root, revision), pattern);
      assert.equal(fs.existsSync(path.join(root, assets.MANIFEST)), false);
      assert.equal(fs.existsSync(path.join(root, assets.IMAGE_IDENTITY)), false);
    });
  }
}

test('parser ignores import-looking text and accepts real escaped/template dependencies', t => {
  const root = fixture(t, { generate: false });
  put(root, 'assets/angular/form/browser/main-123.js', [
    String.raw`console.log(/import\("\.\/fake.js"\)/, /["'\x60/]/, 4 / 2);`,
    'console.log(`import("./fake.js") ${"also fake"}`);',
    'const object = { import(value) {} }; object.import("./fake.js");',
    String.raw`import { boot } from "\x2e/chunk-123.js";`,
    'console.log(`loaded ${import(`./lazy-123.js`)}`);',
    'new URL(`./media/icon.svg`, import.meta.url);',
  ].join('\n'));
  assets.generate(root, revision);
  assets.verify(root, revision);
});

const angularModules = path.join(repository, 'angular/node_modules');
const angularBuilderInstalled = fs.existsSync(path.join(angularModules, '@angular-devkit/build-angular/package.json'));

test('real Angular 20 production regex reproduction rejects a missing lazy chunk in both roots', {
  skip: !angularBuilderInstalled && 'Requires the installed Angular workspace dependencies',
}, t => {
  const root = fixture(t, { generate: false });
  const workspace = path.join(root, 'reproduction');
  put(workspace, 'main.ts', angular20Reproduction);
  put(workspace, 'lazy.ts', 'export const lazy = 42;');
  put(workspace, 'index.html', '<html><head><base href="/"></head><body></body></html>');
  put(workspace, 'tsconfig.json', JSON.stringify({
    compilerOptions: { target: 'ES2022', module: 'ESNext', moduleResolution: 'bundler', types: [], lib: ['ES2022', 'DOM'] },
    files: ['main.ts', 'lazy.ts'],
  }));
  put(workspace, 'angular.json', JSON.stringify({
    version: 1, cli: { cache: { enabled: false }, analytics: false },
    projects: { reproduction: { root: '', projectType: 'application', architect: { build: {
      builder: '@angular-devkit/build-angular:application',
      options: { browser: 'main.ts', index: 'index.html', tsConfig: 'tsconfig.json', outputPath: 'dist' },
      configurations: { production: { optimization: true, outputHashing: 'all', sourceMap: false } },
    } } } },
  }));
  fs.symlinkSync(angularModules, path.join(workspace, 'node_modules'), 'dir');
  // Use Architect directly: the installed CLI major can differ from the pinned
  // Angular 20 application builder. No installs, shared config or cache writes.
  const result = spawnSync(process.execPath, ['-e', `
    const assert = require('node:assert/strict');
    const { Architect } = require('@angular-devkit/architect');
    const { WorkspaceNodeModulesArchitectHost } = require('@angular-devkit/architect/node');
    const { workspaces } = require('@angular-devkit/core');
    const { NodeJsSyncHost } = require('@angular-devkit/core/node');
    assert.match(require('@angular-devkit/build-angular/package.json').version, /^20\\./);
    (async () => {
      const { workspace } = await workspaces.readWorkspace('angular.json', workspaces.createWorkspaceHost(new NodeJsSyncHost()));
      const architect = new Architect(new WorkspaceNodeModulesArchitectHost(workspace, process.cwd()));
      const run = await architect.scheduleTarget({ project: 'reproduction', target: 'build', configuration: 'production' });
      try { assert.equal((await run.result).success, true); } finally { await run.stop(); }
    })().catch(error => { console.error(error); process.exitCode = 1; });
  `], { cwd: workspace, encoding: 'utf8', timeout: 120000, env: { ...process.env, NG_CLI_ANALYTICS: 'false' } });
  assert.equal(result.status, 0, `${result.error || ''}\n${result.stdout}\n${result.stderr}`);
  const output = path.join(workspace, 'dist/browser');
  const main = fs.readdirSync(output).find(name => /^main-.*\.js$/.test(name));
  const compiled = fs.readFileSync(path.join(output, main), 'utf8');
  assert.match(compiled, /\/"\//);
  const lazy = compiled.match(/import\("\.\/([^"/]+\.js)"\)/)?.[1];
  assert.ok(lazy, compiled);
  for (const directory of ['assets/angular', '.tmp/public/angular']) {
    const destination = path.join(root, directory, 'form/browser');
    fs.rmSync(destination, { recursive: true });
    fs.cpSync(output, destination, { recursive: true });
  }
  assets.generate(root, revision);
  assets.verify(root, revision);
  for (const directory of ['assets/angular', '.tmp/public/angular']) {
    fs.rmSync(path.join(root, assets.MANIFEST));
    fs.rmSync(path.join(root, assets.IMAGE_IDENTITY));
    const missing = path.join(root, directory, 'form/browser', lazy);
    fs.rmSync(missing);
    assert.throws(() => assets.generate(root, revision), error => error.message.includes(lazy) && /Missing or empty prepared asset/.test(error.message));
    assert.equal(fs.existsSync(path.join(root, assets.MANIFEST)), false);
    assert.equal(fs.existsSync(path.join(root, assets.IMAGE_IDENTITY)), false);
    fs.copyFileSync(path.join(output, lazy), missing);
    assets.generate(root, revision);
    assets.verify(root, revision);
  }
});

test('actual compiled local-auth outputs pass recursive validation in both roots', {
  skip: !['assets/angular', '.tmp/public/angular'].every(directory =>
    fs.existsSync(path.join(repository, directory, 'local-auth/browser/index.html'))) && 'Requires compiled local-auth outputs',
}, t => {
  const root = fixture(t, { generate: false });
  for (const directory of ['assets/angular', '.tmp/public/angular']) {
    const destination = path.join(root, directory, 'form/browser');
    fs.rmSync(destination, { recursive: true });
    fs.cpSync(path.join(repository, directory, 'local-auth/browser'), destination, { recursive: true });
  }
  assets.generate(root, revision);
  assets.verify(root, revision);
});

test('expected revision must match even when image and manifest agree', t => {
  const root = fixture(t);
  assert.throws(() => assets.verify(root, otherRevision), /Image revision/);
});

test('all source/asset mounts, including read-only parents and escaped paths, force rebuilding', t => {
  const root = fixture(t);
  fs.rmSync(path.join(root, assets.MANIFEST)); // Mount handling must precede verification.
  const mount = point => `${overlay}2 1 0:2 / ${point} ro - ext4 /dev/mock ro\n`;
  for (const point of [root, path.dirname(root), `${root}/assets`, `${root}/angular`, `${root}/packages`,
    `${root}/config/webpack.js`, `${root}/support`, `${root}/typescript`, `${root}/package.json`, `${root}/.redbox-ci`]) {
    assert.equal(assets.startupMode(root, optedEnv(), mount(point)), 'mounted', point);
  }
  const escapedRoot = `${root}/directory with spaces`;
  fs.mkdirSync(escapedRoot);
  assert.equal(assets.mountedSources(escapedRoot, mount(escapedRoot.replaceAll(' ', '\\040'))), true);
  for (const point of [`${root}/test`, `${root}/coverage`, `${root}/.tmp/junit/backend-mocha`, `${root}/bootstrap-data`]) {
    assert.equal(assets.mountedSources(root, mount(point)), false, point);
  }
  assert.equal(assets.mountedSources(root, mount(`${root}-another-project`)), false);
  put(root, '.git', 'gitdir: somewhere');
  assert.equal(assets.startupMode(root, optedEnv(), overlay), 'mounted');
});

function startupFixture(t, suite, { realAngular = false } = {}) {
  const root = fixture(t);
  put(root, 'mock-mountinfo', overlay);
  const logCode = `require('node:fs').appendFileSync(process.env.COMMAND_LOG, JSON.stringify({ command: MOCK_COMMAND_NAME, args: process.argv.slice(2), webpackSkip: process.env.WEBPACK_SKIP, tsProject: process.env.TS_NODE_PROJECT, tsTranspile: process.env.TS_NODE_TRANSPILE_ONLY }) + '\\n');`;
  put(root, 'node-driver.cjs', `
    const fs = require('node:fs');
    const args = process.argv.slice(2);
    if (args[0]?.endsWith('/integration-prebuilt-assets.cjs') || args[0] === 'support/build/integration-prebuilt-assets.cjs') {
      try {
        const helper = require(${JSON.stringify(helper)});
        console.log(helper.startupMode(process.cwd(), process.env, fs.readFileSync('mock-mountinfo', 'utf8')));
      } catch (error) { console.error(error.message); process.exitCode = 1; }
    } else if (args[0] === '--version' || (args[0] === '-e' && args[1]?.startsWith('require.resolve('))) {
      const result = require('node:child_process').spawnSync(process.execPath, args, { stdio: 'inherit' });
      process.exitCode = result.status;
    } else {
      ${logCode.replace('MOCK_COMMAND_NAME', "'shim-generation'")}
      process.exitCode = Number(process.env.MOCK_SHIM_STATUS || 0);
    }
  `);
  put(root, 'mock-bin/node', `#!/bin/bash\nexec '${process.execPath}' '${root}/node-driver.cjs' "$@"\n`, true);
  put(root, 'mock-bin/npm', `#!${process.execPath}\n${logCode.replace('MOCK_COMMAND_NAME', "'npm'")}\n
    if (process.env.EXPECT_CHANGED_ANGULAR === 'true' && process.argv.slice(2).join(' ') === 'run webpack') {
      require('node:assert/strict').equal(require('node:fs').readFileSync('assets/angular/local-auth/browser/main-123.js', 'utf8'),
        require('node:fs').readFileSync('angular/projects/researchdatabox/local-auth/changed.ts', 'utf8'));
    }
    process.exitCode = Number(process.env.MOCK_NPM_STATUS || 0);\n`, true);
  put(root, 'node_modules/.bin/mocha', '#!/bin/bash\nexit 0\n', true);
  put(root, 'node_modules/.bin/nyc', `#!${process.execPath}\n${logCode.replace('MOCK_COMMAND_NAME', "'nyc'")}\nrequire('node:fs').writeFileSync(require('node:path').join(process.env.RBPORTAL_COVERAGE_DIR, 'lcov.info'), 'mock coverage');\nprocess.exitCode = Number(process.env.MOCK_TEST_STATUS || 0);\n`, true);
  put(root, 'support/integration-testing/install-redbox-dependencies-if-writable.sh',
    '#!/bin/bash\nprintf \'{"command":"install-dependencies"}\\n\' >> "$COMMAND_LOG"\nexit "${MOCK_INSTALL_STATUS:-0}"\n');
  put(root, 'support/development/compileDevAngular.sh',
    '#!/bin/bash\nprintf \'{"command":"angular"}\\n\' >> "$COMMAND_LOG"\nexit "${MOCK_ANGULAR_STATUS:-0}"\n');
  if (realAngular) {
    put(root, 'support/development/compileDevAngular.sh',
      fs.readFileSync(path.join(repository, 'support/development/compileDevAngular.sh')));
    for (const project of ['portal-ng-common', 'portal-ng-form-custom', ...assets.REQUIRED_APPS]) {
      fs.mkdirSync(path.join(root, `angular/projects/researchdatabox/${project}`), { recursive: true });
    }
    put(root, 'angular/node_modules/esbuild/index.js', 'module.exports = {};');
    put(root, `angular/node_modules/@esbuild/linux-${process.arch}/index.js`, 'module.exports = {};');
    put(root, 'angular/node_modules/.bin/ng', `#!${process.execPath}\n${logCode.replace('MOCK_COMMAND_NAME', "'ng'")}\n
      if (process.argv.at(-1) === '@researchdatabox/local-auth' && require('node:fs').existsSync('projects/researchdatabox/local-auth/changed.ts')) {
        require('node:fs').copyFileSync('projects/researchdatabox/local-auth/changed.ts', '../assets/angular/local-auth/browser/main-123.js');
      }
      process.exitCode = Number(process.env.MOCK_ANGULAR_STATUS || 0);\n`, true);
  }
  // The production scripts have a fixed container path. Rewrite that constant
  // only in the disposable harness, never add a runtime bypass to production.
  const script = fs.readFileSync(path.join(repository, `support/integration-testing/run-${suite}-redbox.sh`), 'utf8')
    .replaceAll('/opt/redbox-portal', root);
  const log = path.join(root, 'commands.jsonl');
  return {
    root,
    run(overrides = {}, args = []) {
      const result = spawnSync('bash', ['-s', '--', ...args], {
        input: script, cwd: root, encoding: 'utf8',
        env: {
          ...process.env, CI: 'true', RBPORTAL_REUSE_PREBUILT_ASSETS: 'false', RBPORTAL_EXPECTED_IMAGE_REVISION: '',
          WEBPACK_SKIP: 'true', RBPORTAL_REMOTE_DEBUG: '', RBPORTAL_MOCHA_TEST_PATHS: '',
          MOCK_TEST_STATUS: '0', MOCK_SHIM_STATUS: '0', MOCK_NPM_STATUS: '0', MOCK_ANGULAR_STATUS: '0', MOCK_INSTALL_STATUS: '0',
          PATH: `${root}/mock-bin:${process.env.PATH}`, COMMAND_LOG: log,
          NYC_OUTPUT: `${root}/nyc-output`, RBPORTAL_COVERAGE_DIR: `${root}/coverage-output`,
          HOME: `${root}/empty-home`, BUILD_PORTAL_NG_FORM_CUSTOM: 'false',
          ...overrides,
        },
      });
      const commands = fs.existsSync(log) ? fs.readFileSync(log, 'utf8').trim().split('\n').filter(Boolean).map(JSON.parse) : [];
      return { ...result, commands };
    },
  };
}

for (const suite of ['mocha', 'playwright']) {
  test(`${suite}: valid opt-in skips downloads/builds, preserves coverage and startup`, t => {
    const harness = startupFixture(t, suite);
    const result = harness.run({ ...optedEnv(), RBPORTAL_MOCHA_TEST_PATHS: 'test/integration/one.test.ts\ntest/integration/two.test.ts', RBPORTAL_REMOTE_DEBUG: '0.0.0.0:9229' }, ['test/integration/cli.test.ts']);
    assert.equal(result.status, 0, result.stderr);
    assert.deepEqual(result.commands.map(command => command.command), suite === 'mocha' ? ['shim-generation', 'nyc'] : ['nyc']);
    const nyc = result.commands.at(-1);
    for (const option of ['--no-clean', '--reporter=lcov', '--exclude-after-remap=false', '--temp-dir', '--report-dir']) {
      assert.ok(nyc.args.includes(option), option);
    }
    assert.equal(nyc.webpackSkip, 'true');
    assert.equal(fs.readFileSync(path.join(harness.root, 'coverage-output/lcov.info'), 'utf8'), 'mock coverage');
    if (suite === 'mocha') {
      assert.ok(nyc.args.includes('--inspect=0.0.0.0:9229'));
      assert.equal(nyc.tsProject, `${harness.root}/tsconfig.json`);
      assert.equal(nyc.tsTranspile, 'true');
      assert.ok(nyc.args.includes('mocha-junit-reporter'));
      assert.ok(nyc.args.includes('mochaFile=./.tmp/junit/backend-mocha/backend-mocha.xml'));
      assert.deepEqual(nyc.args.slice(-4), ['test/bootstrap.test.ts', 'test/integration/one.test.ts', 'test/integration/two.test.ts', 'test/integration/cli.test.ts']);
    } else {
      assert.deepEqual(nyc.args.slice(-2), ['node', 'app.integrationtest.js']);
    }
  });

  for (const invalid of ['missing-manifest', 'wrong-revision', 'corrupt-asset', 'missing-dependencies']) {
    test(`${suite}: ${invalid} aborts prepared mode without downloads or test execution`, t => {
      const harness = startupFixture(t, suite);
      if (invalid === 'missing-manifest') fs.rmSync(path.join(harness.root, assets.MANIFEST));
      if (invalid === 'corrupt-asset') put(harness.root, '.tmp/public/angular/form/browser/main-123.js', 'broken');
      if (invalid === 'missing-dependencies') fs.rmSync(path.join(harness.root, 'node_modules/.bin/nyc'));
      const result = harness.run({ ...optedEnv(), RBPORTAL_EXPECTED_IMAGE_REVISION: invalid === 'wrong-revision' ? otherRevision : revision });
      assert.equal(result.status, 1, result.stderr);
      assert.deepEqual(result.commands, []);
      const reason = {
        'missing-manifest': /ENOENT.*integration-assets\.json/,
        'wrong-revision': /Image revision does not match/,
        'corrupt-asset': /inventory\/checksum mismatch/,
        'missing-dependencies': /missing .*test dependencies/,
      }[invalid];
      assert.match(result.stderr, reason);
    });
  }

  test(`${suite}: normal mode rebuilds without manifest and preserves test failure status`, t => {
    const harness = startupFixture(t, suite);
    fs.rmSync(path.join(harness.root, assets.MANIFEST));
    const result = harness.run({ MOCK_TEST_STATUS: '23' });
    assert.equal(result.status, 23, result.stderr);
    assert.ok(result.commands.some(command => command.command === 'npm' && command.args.join(' ') === 'run webpack'));
    assert.equal(result.commands.find(command => command.command === 'npm' && command.args[0] === 'run').webpackSkip, 'true');
    if (suite === 'mocha') {
      assert.ok(result.commands.some(command => command.command === 'npm' && command.args[0] === 'install'));
      assert.ok(result.commands.at(-1).args.includes('test/integration/**/*.test.ts'));
    } else {
      assert.ok(result.commands.some(command => command.command === 'install-dependencies'));
      assert.ok(!result.commands.some(command => command.command === 'angular'));
    }
  });

  test(`${suite}: source mount overrides opt-in and existing bundles`, t => {
    const harness = startupFixture(t, suite);
    put(harness.root, 'mock-mountinfo', `${overlay}2 1 0:2 / ${harness.root}/assets ro - ext4 /dev/mock ro\n`);
    fs.rmSync(path.join(harness.root, assets.MANIFEST));
    const result = harness.run(optedEnv());
    assert.equal(result.status, 0, result.stderr);
    const commands = result.commands.map(command => command.command);
    assert.ok(commands.includes('npm'));
    assert.equal(result.commands.find(command => command.command === 'npm' && command.args[0] === 'run').webpackSkip, 'false');
    if (suite === 'playwright') {
      assert.ok(commands.includes('angular'));
      assert.ok(commands.indexOf('angular') < commands.indexOf('npm'));
    }
  });

  test(`${suite}: prepared mode propagates test failure status`, t => {
    const harness = startupFixture(t, suite);
    const result = harness.run({ ...optedEnv(), MOCK_TEST_STATUS: '19' });
    assert.equal(result.status, 19, result.stderr);
  });

  test(`${suite}: webpack failure aborts bootstrap and tests`, t => {
    const harness = startupFixture(t, suite);
    put(harness.root, 'node_modules/redoc/bundles/redoc.standalone.js', 'redoc');
    const result = harness.run({ MOCK_NPM_STATUS: '17' });
    assert.equal(result.status, 17, result.stderr);
    assert.ok(!result.commands.some(command => ['nyc', 'shim-generation'].includes(command.command)));
  });
}

test('mocha preserves custom config, bootstrap, cleanup and shim failure status', t => {
  const harness = startupFixture(t, 'mocha');
  put(harness.root, 'test/integration/.mocharc.js', 'module.exports = {}');
  put(harness.root, 'node_modules/redoc/bundles/redoc.standalone.js', 'redoc');
  put(harness.root, 'node_modules/should/index.js', 'should');
  const result = harness.run(optedEnv());
  assert.equal(result.status, 0, result.stderr);
  const args = result.commands.at(-1).args;
  assert.ok(args.includes('--config'));
  assert.ok(args.includes('test/integration/.mocharc.js'));
  assert.ok(args.includes('test/bootstrap.test.ts'));
  assert.ok(!fs.existsSync(path.join(harness.root, 'node_modules/redoc')));
  assert.ok(!fs.existsSync(path.join(harness.root, 'node_modules/should')));
  fs.rmSync(path.join(harness.root, 'commands.jsonl'));
  const failed = harness.run({ ...optedEnv(), MOCK_SHIM_STATUS: '13' });
  assert.equal(failed.status, 13, failed.stderr);
  assert.deepEqual(failed.commands.map(command => command.command), ['shim-generation']);
});

test('playwright normal mode builds missing Angular before webpack and propagates Angular failure', t => {
  const harness = startupFixture(t, 'playwright');
  fs.rmSync(path.join(harness.root, 'assets/angular/local-auth/browser/main-123.js'));
  const result = harness.run();
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(result.commands.map(command => command.command), ['install-dependencies', 'angular', 'npm', 'nyc']);
  fs.rmSync(path.join(harness.root, 'commands.jsonl'));
  const failed = harness.run({ MOCK_ANGULAR_STATUS: '11' });
  assert.equal(failed.status, 11, failed.stderr);
  assert.deepEqual(failed.commands.map(command => command.command), ['install-dependencies', 'angular']);
});

test('playwright backend/support-only mounts preserve the image profile without Angular sources', t => {
  const harness = startupFixture(t, 'playwright');
  fs.rmSync(path.join(harness.root, 'angular'), { recursive: true });
  put(harness.root, 'mock-mountinfo', `${overlay}2 1 0:2 / ${harness.root}/support rw - ext4 /dev/mock rw\n`);
  const result = harness.run(optedEnv());
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(result.commands.map(command => command.command), ['install-dependencies', 'npm', 'nyc']);
});

test('playwright executes the real Angular helper without nvm for mounted sources with existing bundles', t => {
  const harness = startupFixture(t, 'playwright', { realAngular: true });
  // A changed source and complete old bundles must still rebuild on a mount.
  put(harness.root, 'angular/projects/researchdatabox/local-auth/changed.ts', 'export const changed = true;');
  put(harness.root, 'mock-mountinfo', `${overlay}2 1 0:2 / ${harness.root}/angular rw - ext4 /dev/mock rw\n`);
  const result = harness.run({ ...optedEnv(), EXPECT_CHANGED_ANGULAR: 'true' });
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stderr, /nvm unavailable; using installed Node v/);
  assert.doesNotMatch(result.stderr, /nvm: command not found/);
  const builds = result.commands.filter(command => command.command === 'ng');
  assert.equal(builds[0].args.at(-1), '@researchdatabox/portal-ng-common');
  assert.equal(builds[1].args.at(-1), '@researchdatabox/portal-ng-form-custom');
  for (const app of assets.REQUIRED_APPS) {
    assert.ok(builds.some(command => command.args.at(-1) === `@researchdatabox/${app}`));
  }
  const webpack = result.commands.findIndex(command => command.command === 'npm' && command.args.join(' ') === 'run webpack');
  assert.ok(webpack > result.commands.findLastIndex(command => command.command === 'ng'));
  assert.equal(result.commands[webpack].webpackSkip, 'false');
  assert.equal(result.commands.at(-1).command, 'nyc');
});

for (const withNvm of [false, true]) {
  test(`the real Angular helper aborts before webpack on build failure, nvm installed: ${withNvm}`, t => {
    const harness = startupFixture(t, 'playwright', { realAngular: true });
    if (withNvm) put(harness.root, 'empty-home/.nvm/nvm.sh', 'nvm() { printf \'{"command":"real-nvm"}\\n\' >> "$COMMAND_LOG"; }\n');
    put(harness.root, '.git', 'gitdir: a-worktree');
    const result = harness.run({ MOCK_ANGULAR_STATUS: '11' });
    assert.equal(result.status, 11, result.stderr);
    assert.equal(result.commands.filter(command => command.command === 'real-nvm').length, withNvm ? 2 : 0);
    if (withNvm) assert.doesNotMatch(result.stderr, /nvm unavailable/);
    assert.equal(result.commands.at(-1).command, 'ng');
    assert.ok(!result.commands.some(command => command.command === 'npm' && command.args[0] === 'run'));
    assert.ok(!result.commands.some(command => command.command === 'nyc'));
  });
}
