'use strict';
// Build-only derivation. The installed runtime never reads a repository/specification path.
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const ts = require('typescript');
const root = path.resolve(__dirname, '../../..');
const inventory = JSON.parse(
  fs.readFileSync(path.join(root, 'support/specs/fastify-migration/evidence/FM-002.inventory.json'))
);
function namespace(route) {
  const parts = route
    .replace(/\{[/*].*$/, '')
    .split('/')
    .filter(Boolean);
  const first = parts.findIndex(part => !part.startsWith(':') && !part.startsWith('*'));
  return first < 0
    ? { path: '/' + parts.join('/'), kind: 'path' }
    : { path: (route.startsWith('${') ? '' : '/') + parts.slice(0, first + 1).join('/'), kind: 'namespace' };
}
function collect() {
  const entries = new Map();
  function add(value, source, global = false) {
    const key = JSON.stringify([global, value.kind, value.path, value.pattern]);
    const entry = entries.get(key) ?? { ...value, global, sources: [] };
    if (!entry.sources.includes(source)) entry.sources.push(source);
    entries.set(key, entry);
  }
  for (const route of inventory.routes) add(namespace(route.path), route.name);
  for (const route of inventory.integrations) {
    // Fallbacks and open extension contracts are not protected namespaces.
    if (route.kind === 'fallback') continue;
    for (const value of Array.isArray(route.path) ? route.path : [route.path]) {
      if (typeof value !== 'string' || !/^(?:\/|\$\{)/.test(value)) continue;
      add(namespace(value.replace('${rootContext}', '')), route.name, route.kind === 'health');
    }
  }
  function asset(name, source) {
    const parts = name.replace(/^\.\//, '').split('/');
    assert(parts.length && !parts.some(part => part === '..' || !part), 'Invalid asset declaration: ' + name);
    // StaticPageArtifacts' branded/default lookup consumes two context directories.
    add(
      {
        path:
          '/' + (parts.length >= 3 && parts[0] === 'default' ? [':branding', ':portal', parts[2]].join('/') : parts[0]),
        kind: 'namespace',
      },
      source
    );
  }
  // Explicit source manifest: Docker excludes .git and generated assets. Its
  // tracked-file identity is verified by httpNamespaceInputs.test.ts, not by a
  // build-time filesystem walk that can absorb developer output.
  for (const file of require('./http-asset-sources.json')) {
    assert(file.startsWith('assets/'), 'Asset source must be under assets/');
    assert(fs.statSync(path.join(root, file)).isFile(), 'Missing asset source: ' + file);
    asset(file.slice('assets/'.length), 'core-static-artifacts');
  }
  // Angular outputs are declarations, whether or not any bundle exists yet.
  const angular = JSON.parse(fs.readFileSync(path.join(root, 'angular/angular.json'), 'utf8'));
  for (const project of Object.values(angular.projects)) {
    const build = (project.architect ?? project.targets)?.build;
    for (const options of [build?.options, ...Object.values(build?.configurations ?? {})]) {
      const output = typeof options?.outputPath === 'string' ? options.outputPath : options?.outputPath?.base;
      if (!output) continue;
      const relative = path.relative(path.join(root, 'assets'), path.resolve(root, 'angular', output));
      assert(!relative.startsWith('..') && !path.isAbsolute(relative), 'Angular output must be under assets/');
      asset(relative, 'angular/angular.json');
    }
  }
  // Derive explicit AND implicit output names using the pinned public defaults.
  // Configuration is read as syntax; plugins/builds and emitted trees are never run/read.
  const webpackFile = 'packages/redbox-core/src/config/webpack.config.ts';
  const webpack = ts.createSourceFile(
    webpackFile,
    fs.readFileSync(path.join(root, webpackFile), 'utf8'),
    ts.ScriptTarget.Latest,
    true
  );
  require('./http-generated-assets.cjs')(
    webpack,
    name => asset(name, webpackFile),
    value => add(value, webpackFile)
  );
  return [...entries.values()]
    .map(entry => ({ ...entry, sources: entry.sources.sort() }))
    .sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));
}
function content() {
  return (
    '// FM-002 and core asset namespace manifest. Refresh with scripts/http-namespaces.cjs.\n' +
    '// Do not edit: build checks retained inventory and tracked asset/build declarations.\n' +
    '// prettier-ignore\nexport const coreHttpNamespaces = ' +
    JSON.stringify(collect(), null, 2) +
    ' as const;\n'
  );
}
if (require.main === module) {
  if (fs.existsSync(path.join(root, '.git'))) {
    const tracked = require('node:child_process')
      .execFileSync('git', ['ls-files', '-z', '--', 'assets'], { cwd: root, encoding: 'utf8' })
      .split('\0')
      .filter(file => file && !file.split('/').some(part => part.startsWith('.')))
      .sort();
    assert.deepEqual(
      require('./http-asset-sources.json'),
      tracked,
      'Asset source manifest drift: update http-asset-sources.json from git ls-files assets'
    );
  }
  const target = path.join(root, 'packages/redbox-core/src/http/fastify/coreNamespaces.ts');
  if (process.argv.includes('--check'))
    assert.equal(
      fs.readFileSync(target, 'utf8'),
      content(),
      'Core namespace inventory drift: inspect and refresh scripts/http-namespaces.cjs'
    );
  else fs.writeFileSync(target, content());
  console.log('Core namespace inventory verified: ' + collect().length);
}
module.exports = { collect, namespace, content };
