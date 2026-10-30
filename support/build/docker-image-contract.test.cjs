// Run with: node --test support/build/docker-image-contract.test.cjs
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { createRequire } = require('node:module');
const { test } = require('node:test');
const { dependencyContract, dependencyGraphContract, fileContract } = require('./docker-image-contract.cjs');

const dockerfile = fs.readFileSync(path.join(__dirname, '../../Dockerfile'), 'utf8');
const stages = new Map();
let current;
for (const line of dockerfile.replace(/\\\n/g, ' ').split('\n').map(line => line.trim())) {
  if (!line || line.startsWith('#')) continue;
  const from = /^FROM (\S+)(?: AS (\S+))?$/i.exec(line);
  if (from) {
    current = { base: from[1], instructions: [] };
    stages.set(from[2] || 'default', current);
  } else current.instructions.push(line);
}

function reachable(name, visited = new Set()) {
  if (!stages.has(name) || visited.has(name)) return visited;
  visited.add(name);
  const stage = stages.get(name);
  reachable(stage.base, visited);
  for (const line of stage.instructions) {
    const from = /--from=(\S+)/.exec(line);
    if (from) reachable(from[1], visited);
  }
  return visited;
}

test('test image bypasses the production reinstall; runtime targets bypass test assembly', () => {
  const production = [...stages].filter(([, stage]) => stage.instructions.some(line => /npm ci --omit=dev/.test(line))).map(([name]) => name);
  assert.equal(production.length, 1);
  assert.ok(reachable('runtime').has(production[0]));
  assert.ok(reachable('runtime_pdfgen').has(production[0]));
  assert.ok(!reachable('test').has(production[0]));
  assert.ok(!reachable('test').has('runtime'));
  for (const target of ['runtime', 'runtime_pdfgen']) assert.ok(!reachable(target).has('test'));
  assert.doesNotMatch(dockerfile, /\/tmp\/test-(?:node_modules|package-node-modules)|cp -a node_modules/);
  assert.equal(stages.get('default').base, 'runtime');
});

test('both dependency graphs retain root and package-local trees copied from the same native stage', () => {
  for (const target of ['test', 'runtime']) {
    const copies = stages.get(target).instructions.filter(line => line.startsWith('COPY '));
    const root = copies.filter(line => /\/opt\/redbox-portal\/node_modules \.\/node_modules$/.test(line));
    const packages = copies.filter(line => /\/opt\/redbox-portal\/packages \.\/packages$/.test(line));
    assert.equal(root.length, 1);
    assert.equal(packages.length, 1);
    assert.equal(/--from=(\S+)/.exec(root[0])[1], /--from=(\S+)/.exec(packages[0])[1]);
    for (const copy of copies) assert.match(copy, /--chown=node:node/);
  }
  assert.doesNotMatch(dockerfile, /FROM\s+--platform=/i, 'native dependency installation must follow the target platform');
  assert.equal(stages.get('base').base, 'node:26.12.1-bookworm');
});

test('runtime siblings share the slim base, application payload and execution settings', () => {
  const common = stages.get(stages.get('runtime').base);
  assert.equal(stages.get('runtime').base, stages.get('test').base);
  assert.equal(common.base, 'node:26.12.1-bookworm-slim');
  const settings = common.instructions;
  for (const line of ['ENV NODE_ENV=production', 'ENV TZ=Australia/Brisbane', 'WORKDIR /opt/redbox-portal',
    'USER node', 'EXPOSE 1337', 'CMD ["node", "app.js"]']) assert.ok(settings.includes(line), line);
  assert.ok(settings.some(line => /^HEALTHCHECK --interval=30s --timeout=5s --start-period=60s --retries=5/.test(line)));
  const copies = settings.filter(line => line.startsWith('COPY '));
  assert.deepEqual(copies.map(line => line.split(' ').at(-1)).sort(),
    ['./', './app.js', './api', './assets', './.tmp/public', './config', './bootstrap-data', './language-defaults', './views'].sort());
  for (const copy of copies) assert.match(copy, /--from=builder --chown=node:node/);
});

function fixture(t) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'redbox-image-contract-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  return directory;
}

test('container stdin invocation actually executes the contract', () => {
  const result = spawnSync(process.execPath, ['-', '--inside', 'runtime', 'linux/arm64'], {
    cwd: os.tmpdir(),
    input: fs.readFileSync(path.join(__dirname, 'docker-image-contract.cjs')),
    encoding: 'utf8',
  });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /\/opt\/redbox-portal/);
});

function manifest(directory, content) {
  fs.mkdirSync(directory, { recursive: true });
  fs.writeFileSync(path.join(directory, 'package.json'), JSON.stringify(content));
}

test('dependency contract preserves different nested versions and catches flattening', t => {
  const directory = fixture(t);
  const child = path.join(directory, 'packages/core');
  manifest(directory, { name: 'app', dependencies: { shared: '1.0.0' } });
  manifest(child, { name: 'core', dependencies: { shared: '2.0.0' } });
  manifest(path.join(directory, 'node_modules/shared'), { name: 'shared', version: '1.0.0', exports: './index.js' });
  manifest(path.join(child, 'node_modules/shared'), { name: 'shared', version: '2.0.0', exports: './index.js' });
  assert.equal(dependencyContract(directory, false).shared.version, '1.0.0');
  assert.equal(dependencyContract(child, false).shared.version, '2.0.0');
  fs.rmSync(path.join(child, 'node_modules'), { recursive: true });
  assert.throws(() => dependencyContract(child, false), /resolved version/);
});

test('dependency contract follows relative local links and detects broken links or missing dev tools', t => {
  const directory = fixture(t);
  const child = path.join(directory, 'packages/core');
  manifest(directory, { name: 'app', dependencies: { core: 'file:packages/core' }, devDependencies: { tool: '1.0.0' } });
  manifest(child, { name: 'core', version: '2.0.0' });
  fs.mkdirSync(path.join(directory, 'node_modules'));
  fs.symlinkSync('../packages/core', path.join(directory, 'node_modules/core'));
  assert.equal(dependencyContract(directory, false).core.version, '2.0.0');
  assert.throws(() => dependencyContract(directory, true), /Cannot resolve tool/);
  fs.unlinkSync(path.join(directory, 'node_modules/core'));
  fs.symlinkSync('../packages/missing', path.join(directory, 'node_modules/core'));
  assert.throws(() => dependencyContract(directory, false), /Cannot resolve core/);
  fs.unlinkSync(path.join(directory, 'node_modules/core'));
  manifest(path.join(directory, 'node_modules/core'), { name: 'core', version: '2.0.0' });
  assert.throws(() => dependencyContract(directory, false), /must resolve to its local package/);
});

test('dependency contract respects intentional lockfile overrides', t => {
  const directory = fixture(t);
  manifest(directory, { name: 'app', dependencies: { shared: '1.0.0' } });
  manifest(path.join(directory, 'node_modules/shared'), { name: 'shared', version: '1.0.1' });
  fs.writeFileSync(path.join(directory, 'package-lock.json'), JSON.stringify({
    packages: { 'node_modules/shared': { version: '1.0.1' } },
  }));
  assert.equal(dependencyContract(directory, false).shared.version, '1.0.1');
});

test('recursive regression: unchanged Companion/direct versions hide changed Express and session resolution', t => {
  const directory = fixture(t);
  const companion = path.join(directory, 'node_modules/@uppy/companion');
  manifest(directory, { name: 'app', dependencies: {
    '@uppy/companion': '7.0.2', express: '5.3.0', 'express-session': '1.19.0',
  } });
  manifest(companion, { name: '@uppy/companion', version: '7.0.2',
    dependencies: { express: '^5.2.1', 'express-session': '1.19.0' } });
  for (const [name, nested, hoisted] of [['express', '4.22.2', '5.3.0'], ['express-session', '1.18.2', '1.19.0']]) {
    for (const [location, version] of [[path.join(companion, 'node_modules', name), nested],
      [path.join(directory, 'node_modules', name), hoisted]]) {
      manifest(location, { name, version, exports: './index.js' });
      fs.writeFileSync(path.join(location, 'index.js'), '');
    }
  }
  const directBefore = dependencyContract(directory, false);
  const before = dependencyGraphContract([directory], false, directory);
  const key = 'node_modules/@uppy/companion/package.json';
  assert.equal(before.nodes[key].dependencies.express.version, '4.22.2');
  assert.equal(before.nodes[key].dependencies['express-session'].version, '1.18.2');
  fs.rmSync(path.join(companion, 'node_modules'), { recursive: true });
  const after = dependencyGraphContract([directory], false, directory);
  assert.deepEqual(dependencyContract(directory, false), directBefore);
  assert.notDeepEqual(after, before);
  assert.equal(after.nodes[key].dependencies.express.version, '5.3.0');
  assert.equal(after.nodes[key].dependencies['express-session'].version, '1.19.0');
  assert.equal(after.nodes[key].dependencies.express.manifest, 'node_modules/express/package.json');
  const resolved = createRequire(path.join(companion, 'package.json')).resolve('express');
  assert.equal(path.dirname(resolved), path.dirname(path.join(directory, after.nodes[key].dependencies.express.package)));

  // Also detect a version-only change at an unchanged physical location.
  manifest(path.join(directory, 'node_modules/express'), { name: 'express', version: '5.3.1' });
  assert.equal(dependencyGraphContract([directory], false, directory).nodes[key].dependencies.express.version, '5.3.1');
});

test('recursive graph follows real linked callers, retains cycles and distinguishes equal-version hoisting', t => {
  const directory = fixture(t);
  const core = path.join(directory, 'packages/core');
  manifest(directory, { name: 'app', dependencies: { core: 'file:packages/core', shared: '1.0.0' } });
  manifest(core, { name: 'core', version: '1.0.0', dependencies: { core: 'file:.', shared: '1.0.0' } });
  manifest(path.join(directory, 'node_modules/shared'), { name: 'shared', version: '1.0.0', dependencies: { core: '1.0.0' } });
  manifest(path.join(core, 'node_modules/shared'), { name: 'shared', version: '1.0.0' });
  fs.symlinkSync('../packages/core', path.join(directory, 'node_modules/core'));
  const before = dependencyGraphContract([directory], false, directory);
  const edge = before.nodes['package.json'].dependencies.core;
  assert.equal(edge.link, '../packages/core');
  assert.equal(edge.manifest, 'node_modules/core/package.json');
  assert.equal(edge.package, 'packages/core/package.json');
  assert.equal(before.nodes[edge.package].dependencies.core.package, edge.package);
  assert.equal(Object.keys(before.nodes).length, 4);
  fs.rmSync(path.join(core, 'node_modules'), { recursive: true });
  const after = dependencyGraphContract([directory], false, directory);
  assert.equal(after.nodes[edge.package].dependencies.shared.version, '1.0.0');
  assert.equal(after.nodes[edge.package].dependencies.shared.package, 'node_modules/shared/package.json');
  assert.notDeepEqual(before, after);
  assert.equal(Object.keys(after.nodes).length, 3);
});

test('recursive graph records missing optional deps and peers, but rejects missing required transitive deps', t => {
  const directory = fixture(t);
  manifest(directory, { name: 'app', dependencies: { child: '1.0.0' }, optionalDependencies: { native: '1.0.0' } });
  const child = path.join(directory, 'node_modules/child');
  manifest(child, { name: 'child', version: '1.0.0', dependencies: { native: '0.9.0' },
    optionalDependencies: { native: '1.0.0' }, peerDependencies: { host: '*', adapter: '*' },
    peerDependenciesMeta: { adapter: { optional: true } } });
  const before = dependencyGraphContract([directory], false, directory);
  const edges = before.nodes['node_modules/child/package.json'].dependencies;
  assert.deepEqual(edges.native, { requests: { dependencies: '0.9.0', optionalDependencies: '1.0.0' }, optional: true, missing: true });
  assert.equal(edges.host.missing, true);
  assert.equal(edges.host.optional, false);
  assert.equal(edges.adapter.optional, true);
  assert.deepEqual(dependencyContract(directory, false).native, { optional: true, missing: true });
  manifest(path.join(directory, 'node_modules/native'), { name: 'native', version: '1.0.0' });
  assert.notDeepEqual(dependencyGraphContract([directory], false, directory), before);
  manifest(child, { name: 'child', version: '1.0.0', dependencies: { absent: '1.0.0' } });
  assert.throws(() => dependencyGraphContract([directory], false, directory), /Cannot resolve absent/);
});

test('recursive graph includes dev deps only for explicit roots, and has deterministic output', t => {
  const directory = fixture(t);
  const child = path.join(directory, 'node_modules/child');
  manifest(directory, { name: 'app', dependencies: { child: '1.0.0' }, devDependencies: { tool: '1.0.0' } });
  manifest(child, { name: 'child', version: '1.0.0', devDependencies: { unpublished: '*' } });
  manifest(path.join(directory, 'node_modules/tool'), { name: 'tool', version: '1.0.0' });
  const production = dependencyGraphContract([directory], false, directory);
  assert.equal(production.nodes['package.json'].dependencies.tool, undefined);
  const development = dependencyGraphContract([directory], true, directory);
  assert.equal(development.nodes['package.json'].dependencies.tool.version, '1.0.0');
  assert.deepEqual(development.nodes['node_modules/child/package.json'].dependencies, {});
  assert.throws(() => dependencyGraphContract([directory, child], true, directory), /Cannot resolve unpublished/);
  assert.equal(JSON.stringify(development), JSON.stringify(dependencyGraphContract([directory], true, directory)));
});

test('recursive graph captures userland packages sharing builtin names as well as bare builtin resolution', t => {
  const directory = fixture(t);
  manifest(directory, { name: 'app', dependencies: { string_decoder: '1.0.0', fs: '*' } });
  manifest(path.join(directory, 'node_modules/string_decoder'), { name: 'string_decoder', version: '1.0.0' });
  const graph = dependencyGraphContract([directory], false, directory);
  const edges = graph.nodes['package.json'].dependencies;
  assert.equal(edges.string_decoder.builtin, 'string_decoder');
  assert.equal(edges.string_decoder.version, '1.0.0');
  assert.equal(edges.string_decoder.package, 'node_modules/string_decoder/package.json');
  assert.equal(edges.fs.builtin, 'fs');
  assert.equal(edges.fs.missing, true); // No userland package; bare require still succeeds.
});

test('payload manifest hashes assets and retains symlink identity without traversing dependencies', t => {
  const directory = fixture(t);
  fs.writeFileSync(path.join(directory, 'asset.js'), 'first');
  fs.symlinkSync('asset.js', path.join(directory, 'local-link'));
  manifest(path.join(directory, 'node_modules/ignored'), { name: 'ignored' });
  const before = fileContract(directory);
  assert.equal(Object.keys(before).length, 2);
  assert.deepEqual(before[path.join(directory, 'local-link')], { link: 'asset.js' });
  fs.writeFileSync(path.join(directory, 'asset.js'), 'changed');
  assert.notEqual(before[path.join(directory, 'asset.js')], fileContract(directory)[path.join(directory, 'asset.js')]);
});
