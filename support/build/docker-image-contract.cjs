#!/usr/bin/env node
// Usage: node support/build/docker-image-contract.cjs IMAGE TARGET linux/arm64
// Run for baseline and candidate images; diff the JSON payloads to compare
// application checksums, recursive dependency resolution and local links. This does not
// replace portal startup/integration tests with MongoDB, Solr and Keycloak.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');
const { createRequire, isBuiltin } = require('node:module');
const { execFileSync } = require('node:child_process');

function packageManifest(from, name) {
  // Read via Node's search paths, including package-local node_modules and
  // symlinks, even when a package's exports hide its package.json.
  const ownManifest = path.join(from, 'package.json');
  const own = JSON.parse(fs.readFileSync(ownManifest));
  if (own.name === name && own.exports) return ownManifest;
  const resolver = createRequire(ownManifest);
  // A declared userland package may share a builtin name (punycode,
  // string_decoder) and be imported with a trailing slash/subpath.
  for (const directory of resolver.resolve.paths(isBuiltin(name) ? '__dependency_lookup__' : name) || []) {
    const candidate = path.join(directory, name, 'package.json');
    if (fs.existsSync(candidate)) return candidate;
  }
  throw Object.assign(new Error(`Cannot resolve ${name} from ${from}`), { code: 'MODULE_NOT_FOUND' });
}

function dependencyContract(directory, includeDev, installationRoot = directory) {
  const manifest = JSON.parse(fs.readFileSync(path.join(directory, 'package.json')));
  const lockPath = path.join(installationRoot, 'package-lock.json');
  const lockedPackages = fs.existsSync(lockPath) ? JSON.parse(fs.readFileSync(lockPath)).packages || {} : {};
  const dependencies = { ...manifest.dependencies, ...(includeDev ? manifest.devDependencies : {}), ...manifest.optionalDependencies };
  return Object.fromEntries(Object.entries(dependencies).sort().map(([name, spec]) => {
    let filename;
    try {
      filename = packageManifest(directory, name);
    } catch (error) {
      if (error.code === 'MODULE_NOT_FOUND' && Object.hasOwn(manifest.optionalDependencies || {}, name)) {
        return [name, { missing: true, optional: true }];
      }
      throw error;
    }
    const installed = JSON.parse(fs.readFileSync(filename));
    const local = spec.replace(/^file:/, '');
    if (/^(file:|\.\.?\/)/.test(spec) && !local.endsWith('.tgz')) {
      assert.equal(fs.realpathSync(path.dirname(filename)), fs.realpathSync(path.resolve(directory, local)),
        `${manifest.name}: ${name} must resolve to its local package`);
    } else {
      // Production is installed from the root lock, whereas each development
      // package is also installed independently. Respect the appropriate lock's
      // deliberate overrides rather than assuming every manifest wins over them.
      const locked = lockedPackages[path.relative(installationRoot, path.dirname(filename))]?.version;
      const expected = locked || (/^\d+\.\d+\.\d+(?:-.*)?$/.test(spec) ? spec : undefined);
      if (expected) assert.equal(installed.version, expected, `${manifest.name}: ${name} resolved version`);
    }
    return [name, { version: installed.version, manifest: path.relative(process.cwd(), filename) }];
  }));
}

function dependencyGraphContract(directories, includeDev, base = process.cwd()) {
  // Node normally resolves a linked package's imports from its real directory.
  // Key nodes by that directory, but retain the lookup path/link on every edge.
  // A flat package/version inventory loses which caller receives which version.
  const id = filename => path.relative(base, filename) || '.';
  const roots = Object.fromEntries(directories.map(directory => [id(directory),
    id(fs.realpathSync(path.join(directory, 'package.json')))]).sort());
  const rootManifests = new Set(Object.values(roots));
  const pending = Object.values(roots);
  const nodes = new Map();
  while (pending.length) {
    const key = pending.pop();
    if (nodes.has(key)) continue;
    const filename = path.resolve(base, key);
    const directory = path.dirname(filename);
    const manifest = JSON.parse(fs.readFileSync(filename));
    const node = { name: manifest.name, version: manifest.version, dependencies: {} };
    nodes.set(key, node); // Register before following edges, including cycles.
    const requests = new Map();
    for (const kind of ['dependencies', 'optionalDependencies', 'peerDependencies',
      ...(includeDev && rootManifests.has(key) ? ['devDependencies'] : [])]) {
      for (const [name, spec] of Object.entries(manifest[kind] || {})) {
        if (!requests.has(name)) requests.set(name, {});
        requests.get(name)[kind] = spec;
      }
    }
    for (const [name, declarations] of [...requests].sort(([a], [b]) => a.localeCompare(b))) {
      const peerOnly = Object.keys(declarations).every(kind => kind === 'peerDependencies');
      const optional = Object.hasOwn(declarations, 'optionalDependencies') ||
        (peerOnly && manifest.peerDependenciesMeta?.[name]?.optional === true);
      const edge = { requests: declarations, optional };
      if (isBuiltin(name)) edge.builtin = name;
      node.dependencies[name] = edge;
      let resolved;
      try {
        resolved = packageManifest(directory, name);
      } catch (error) {
        // Peers describe a host contract and may legitimately be absent. Keep
        // even unmet required peers visible; never hide a missing runtime dep.
        if (error.code !== 'MODULE_NOT_FOUND' || (!optional && !peerOnly && !edge.builtin)) throw error;
        edge.missing = true;
        continue;
      }
      const real = fs.realpathSync(resolved);
      const installed = JSON.parse(fs.readFileSync(real));
      edge.manifest = id(resolved);
      edge.package = id(real);
      edge.version = installed.version;
      if (fs.lstatSync(path.dirname(resolved)).isSymbolicLink()) {
        edge.link = fs.readlinkSync(path.dirname(resolved));
      }
      pending.push(edge.package);
    }
  }
  return { roots, nodes: Object.fromEntries([...nodes].sort(([a], [b]) => a.localeCompare(b))) };
}

function fileContract(directory, result = {}) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
    if (entry.name === 'node_modules') continue;
    const filename = path.join(directory, entry.name);
    if (entry.isDirectory()) fileContract(filename, result);
    else if (entry.isSymbolicLink()) result[filename] = { link: fs.readlinkSync(filename) };
    else result[filename] = createHash('sha256').update(fs.readFileSync(filename)).digest('hex');
  }
  return result;
}

async function inside(target, platform) {
  // Loaded application packages can log during asynchronous initialization.
  // Keep stdout exclusively for the JSON contract, including those late logs.
  for (const method of ['log', 'info', 'debug']) console[method] = (...args) => console.error(...args);
  assert.equal(process.cwd(), '/opt/redbox-portal');
  assert.equal(process.getuid(), 1000);
  assert.equal(process.version, 'v26.12.1');
  assert.equal(process.arch, { 'linux/arm64': 'arm64', 'linux/amd64': 'x64' }[platform]);
  assert.equal(process.env.NODE_ENV, 'production');
  assert.equal(process.env.TZ, 'Australia/Brisbane');
  const appRequire = createRequire(path.join(process.cwd(), 'package.json'));
  const corePath = appRequire.resolve('@researchdatabox/redbox-core');
  appRequire(corePath);
  createRequire(corePath)('@uppy/companion');
  appRequire('@uppy/companion');

  const test = target === 'test';
  const pdf = target === 'runtime_pdfgen';
  for (const [name, expected] of [['redbox-hook-dev', test], ['@researchdatabox/sails-hook-redbox-pdfgen', pdf]]) {
    if (expected) appRequire(name);
    else assert.throws(() => appRequire.resolve(name), { code: 'MODULE_NOT_FOUND' }, `${name} must not be installed`);
  }
  if (!test) assert.ok(!fs.existsSync('packages/redbox-hook-dev'));
  if (target === 'runtime') assert.ok(!fs.existsSync('packages/sails-hook-redbox-pdfgen'));
  if (test) assert.equal(fs.readlinkSync('node_modules/redbox-hook-dev'), '../packages/redbox-hook-dev');

  const packages = ['', 'packages/agenda-sqs-backend', 'packages/raido', 'packages/rva-registry',
    'packages/sails-ng-common', 'packages/redbox-core', 'packages/sails-hook-redbox-storage-mongo'];
  if (test) {
    packages.push('packages/redbox-dev-tools', 'packages/redbox-hook-dev');
    assert.ok(!fs.existsSync('packages/sails-hook-redbox-pdfgen/package.json'));
    assert.ok(fs.existsSync('packages/sails-hook-redbox-pdfgen/node_modules'));
  }
  if (pdf) packages.push('packages/sails-hook-redbox-pdfgen');
  const dependencies = {};
  for (const directory of packages) {
    const absolute = path.resolve(directory);
    dependencies[directory || '.'] = dependencyContract(absolute, test, test ? absolute : process.cwd());
    const manifest = JSON.parse(fs.readFileSync(path.join(absolute, 'package.json')));
    if (directory) {
      const entry = path.join(absolute, manifest.main);
      assert.ok(fs.statSync(entry).size > 0, `${entry} compiled entry point`);
      if (manifest.types) assert.ok(fs.statSync(path.join(absolute, manifest.types)).size > 0);
      if (directory === 'packages/redbox-core') {
        const map = /sourceMappingURL=data:application\/json;base64,([^\s]+)/.exec(fs.readFileSync(entry, 'utf8'));
        assert.ok(map, 'core inline source map');
        assert.equal(JSON.parse(Buffer.from(map[1], 'base64')).version, 3);
        assert.ok(fs.existsSync(path.join(absolute, `${manifest.types}.map`)), 'core declaration source map');
      }
    }
  }

  const files = {};
  for (const directory of ['api', 'config', 'assets', '.tmp/public', 'bootstrap-data', 'language-defaults', 'views', 'packages']) {
    fileContract(directory, files);
    assert.equal(fs.statSync(directory).uid, 1000, `${directory} ownership`);
  }
  files['app.js'] = createHash('sha256').update(fs.readFileSync('app.js')).digest('hex');
  for (const asset of ['default/default/js/index.bundle.js', 'default/default/js/bootstrap.bundle.min.js',
    'default/default/js/jquery.min.js', 'default/default/js/redoc.standalone.js', 'default/default/styles/style.min.css']) {
    assert.ok(fs.statSync(path.join('.tmp/public', asset)).size > 0, `${asset} production asset`);
  }
  const applications = fs.readdirSync('assets/angular');
  assert.ok(applications.length > 0, 'Angular applications are present');
  for (const application of applications) {
    assert.ok(Object.keys(files).some(name => name.startsWith(`.tmp/public/angular/${application}/`) && /\/main[^/]*\.js$/.test(name)),
      `${application} served Angular bundle`);
  }

  let pdfBytes;
  if (pdf) {
    assert.equal(process.env.PUPPETEER_EXECUTABLE_PATH, '/usr/bin/chromium');
    assert.equal(process.env.PUPPETEER_SKIP_DOWNLOAD, '1');
    const pdfRequire = createRequire(appRequire.resolve('@researchdatabox/sails-hook-redbox-pdfgen'));
    const browser = await pdfRequire('puppeteer').launch({
      executablePath: process.env.PUPPETEER_EXECUTABLE_PATH,
      args: ['--no-sandbox', '--disable-dev-shm-usage'],
    });
    try {
      const page = await browser.newPage();
      await page.setContent('<html><body>ReDBox image contract</body></html>');
      const data = Buffer.from(await page.pdf());
      assert.equal(data.subarray(0, 5).toString(), '%PDF-');
      assert.ok(data.length > 500);
      pdfBytes = data.length;
    } finally {
      await browser.close();
    }
  }
  const dependencyGraph = dependencyGraphContract(packages.map(directory => path.resolve(directory)), test);
  return { target, platform, node: process.version, dependencies, dependencyGraph, files, pdfBytes };
}

async function main() {
  const [image, target, platform] = process.argv.slice(2);
  assert.ok(['runtime', 'runtime_pdfgen', 'test'].includes(target), 'TARGET must be runtime, runtime_pdfgen or test');
  assert.ok(['linux/amd64', 'linux/arm64'].includes(platform), 'Specify linux/amd64 or linux/arm64');
  if (image === '--inside') {
    process.stdout.write(`${JSON.stringify(await inside(target, platform), null, 2)}\n`);
    return;
  }
  const [metadata] = JSON.parse(execFileSync('docker', ['image', 'inspect', image], { encoding: 'utf8' }));
  assert.equal(`${metadata.Os}/${metadata.Architecture}`, platform);
  assert.equal(metadata.Config.User, 'node');
  assert.equal(metadata.Config.WorkingDir, '/opt/redbox-portal');
  assert.deepEqual(metadata.Config.Entrypoint, ['docker-entrypoint.sh']);
  assert.deepEqual(metadata.Config.Cmd, ['node', 'app.js']);
  assert.ok(Object.hasOwn(metadata.Config.ExposedPorts, '1337/tcp'));
  assert.deepEqual(metadata.Config.Healthcheck, {
    Test: ['CMD', 'sh', '-c', 'curl -fsS "http://localhost:${PORT:-1337}/" >/dev/null'],
    Interval: 30000000000, Timeout: 5000000000, StartPeriod: 60000000000, Retries: 5,
  });
  execFileSync('docker', ['run', '--rm', '-i', '--network=none', '--platform', platform,
    '--entrypoint', 'node', image, '-', '--inside', target, platform], {
    input: fs.readFileSync(__filename), stdio: ['pipe', 'inherit', 'inherit'], timeout: 180000,
  });
}

module.exports = { dependencyContract, dependencyGraphContract, fileContract };
// Node's stdin entry point does not set require.main on every supported version.
if (require.main === module || (process.argv[1] === '-' && process.argv[2] === '--inside')) {
  main().catch(error => { console.error(error); process.exitCode = 1; });
}
