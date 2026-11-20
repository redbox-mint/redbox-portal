const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { isBuiltin, createRequire } = require('node:module');
const { pathToFileURL, fileURLToPath } = require('node:url');
const ts = require('typescript');
const { resolve } = require('import-meta-resolve');
const app = __dirname;
const manifest = JSON.parse(fs.readFileSync(path.join(app, 'package.json'), 'utf8'));
const report = [];
const optionalFallbacks = [];
function walk(directory, visit) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const file = path.join(directory, entry.name);
    if (entry.isSymbolicLink())
      assert(fs.realpathSync(file).startsWith(app + path.sep), 'Installed workspace/source link: ' + file);
    if (entry.isDirectory()) walk(file, visit);
    else visit(file);
  }
}
// Every package, including nested third-party dependencies, must be a real copy.
walk(path.join(app, 'node_modules'), () => {});
for (const name of Object.keys(manifest.dependencies)) {
  if (!name.startsWith('@researchdatabox/') && !name.startsWith('redbox-hook-') && !name.startsWith('sr-')) continue;
  const root = path.join(app, 'node_modules', name);
  assert(fs.realpathSync(root).startsWith(app + path.sep));
  const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
  const declared = { ...pkg.dependencies, ...pkg.peerDependencies };
  const ownRequire = createRequire(path.join(root, 'package.json'));
  const imports = new Set();
  const declarations = [];
  function check(specifier, file) {
    if (isBuiltin(specifier)) return;
    if (specifier.startsWith('.')) {
      assert(
        path.resolve(path.dirname(file), specifier).startsWith(root + path.sep),
        `${pkg.name}: relative import escapes tarball: ${file}: ${specifier}`
      );
      if (!file.endsWith('.d.ts')) {
        const resolved = createRequire(file).resolve(specifier);
        assert(resolved.startsWith(root + path.sep), `${pkg.name}: relative resolution escapes tarball: ${resolved}`);
      }
      return;
    }
    const dependency = specifier
      .split('/')
      .slice(0, specifier.startsWith('@') ? 2 : 1)
      .join('/');
    if (dependency !== pkg.name && !declared[dependency]) {
      // Retained password adapter explicitly falls back to its declared bcryptjs.
      if (dependency === 'bcrypt' && file.endsWith('/dist/identity/Users.js')) {
        optionalFallbacks.push({ package: pkg.name, specifier, fallback: 'bcryptjs' });
        return;
      }
      // TypeScript's conventional @types resolution is an explicit package input.
      const types = '@types/' + dependency.replace(/^@/, '').replace('/', '__');
      assert(file.endsWith('.d.ts') && declared[types], `${pkg.name}: undeclared dependency ${specifier} in ${file}`);
    }
    imports.add(specifier);
    if (file.endsWith('.d.ts'))
      assert(
        !/^(?:express|express-session|express-serve-static-core)(?:\/|$)/.test(specifier),
        'Stale Express type: ' + file
      );
    let target;
    if (file.endsWith('.d.ts')) {
      target = ts.resolveModuleName(
        specifier,
        file,
        {
          module: ts.ModuleKind.NodeNext,
          moduleResolution: ts.ModuleResolutionKind.NodeNext,
        },
        ts.sys
      ).resolvedModule?.resolvedFileName;
    } else {
      try {
        target = createRequire(file).resolve(specifier);
      } catch {
        target = fileURLToPath(resolve(specifier, pathToFileURL(file).href));
      }
    }
    assert(target && fs.existsSync(target), 'Missing installed dependency target: ' + specifier + ' in ' + file);
    assert(target.startsWith(app + path.sep), 'Source resolution: ' + target);
  }
  walk(root, file => {
    if (file.includes(path.sep + 'node_modules' + path.sep, root.length)) return;
    if (!/\.(?:[cm]?js|d\.ts)$/.test(file)) return;
    const source = ts.createSourceFile(file, fs.readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true);
    if (file.endsWith('.d.ts')) declarations.push(path.relative(root, file));
    function visit(node) {
      let literal;
      if ((ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) && node.moduleSpecifier)
        literal = node.moduleSpecifier;
      if (ts.isImportTypeNode(node)) literal = node.argument.literal;
      if (
        ts.isCallExpression(node) &&
        (node.expression.getText(source) === 'require' || node.expression.kind === ts.SyntaxKind.ImportKeyword)
      )
        literal = node.arguments[0];
      if (literal && ts.isStringLiteralLike(literal)) check(literal.text, file);
      ts.forEachChild(node, visit);
    }
    visit(source);
  });
  const targets = [];
  function exports(target) {
    if (typeof target === 'string') targets.push(target);
    else if (target && typeof target === 'object') Object.values(target).forEach(exports);
  }
  exports(pkg.exports);
  for (const target of [pkg.main, pkg.types, ...targets].filter(Boolean))
    if (!target.includes('*'))
      assert(fs.existsSync(path.join(root, target)), `${pkg.name}: absent entrypoint ${target}`);
  for (const [peer, version] of Object.entries(pkg.peerDependencies ?? {})) {
    const installed = JSON.parse(fs.readFileSync(path.join(app, 'node_modules', peer, 'package.json'), 'utf8'));
    if (!version.startsWith('file:')) assert.equal(installed.version, version, `${pkg.name}: peer ${peer}`);
  }
  if (['@researchdatabox/redbox-core', '@researchdatabox/redbox-core-types'].includes(pkg.name)) {
    for (const subpath of ['http/express', 'dist/http/express', 'dist/application/portal/host', 'src/index.ts'])
      assert.throws(() => ownRequire.resolve(pkg.name + '/' + subpath), { code: 'ERR_PACKAGE_PATH_NOT_EXPORTED' });
    assert(!fs.existsSync(path.join(root, 'app.express.cjs')));
    assert(fs.existsSync(path.join(root, 'dist/application/portal/host.js')), 'Native production host is packaged');
    assert(
      !fs.existsSync(path.join(root, 'dist/application/portal/host.d.ts')),
      'Private declarations must not be published'
    );
  }
  report.push({
    name: pkg.name,
    version: pkg.version,
    main: pkg.main,
    types: pkg.types,
    exports: pkg.exports,
    dependencies: pkg.dependencies,
    peers: pkg.peerDependencies,
    imports: [...imports].sort(),
    declarations,
  });
}
async function offline() {
  const net = require('node:net');
  const listen = net.Server.prototype.listen,
    connect = net.Socket.prototype.connect;
  const signals = ['SIGINT', 'SIGTERM'].map(name => process.listenerCount(name));
  net.Server.prototype.listen = () => {
    throw new Error('Offline registration opened a listener');
  };
  net.Socket.prototype.connect = () => {
    throw new Error('Offline registration opened a connection');
  };
  try {
    const {
      inspectInstalledExtensionProviders,
      loadInstalledExtensionProvidersV2,
    } = require('@researchdatabox/redbox-core/extensions');
    const installed = await inspectInstalledExtensionProviders(app);
    for (const provider of installed.providers) assert(fs.realpathSync(provider.root).startsWith(app + path.sep));
    if (manifest.dependencies['sr-esm-hook']) {
      assert.equal(
        installed.providers.find(p => p.name === 'sr-esm-hook').declaration.config.packedESM,
        'ESM-only dependency awaited'
      );
      await assert.rejects(loadInstalledExtensionProvidersV2(app), /extension-api2/);
    } else {
      const selected = await loadInstalledExtensionProvidersV2(app);
      assert(selected.providers.every(provider => provider.declaration.apiVersion === 2));
    }
    assert.equal(global.sails, undefined);
    assert.deepEqual(
      ['SIGINT', 'SIGTERM'].map(name => process.listenerCount(name)),
      signals
    );
    for (const file of Object.keys(require.cache))
      assert(file.startsWith(app + path.sep), 'Repository module: ' + file);
    console.log(
      JSON.stringify({
        packages: report,
        optionalFallbacks,
        workspaceLinks: 0,
        sourceImports: 0,
        offline: true,
        installedProviders: installed.providers.map(p => p.name),
        esmOnly: !!manifest.dependencies['sr-esm-hook'],
      })
    );
  } finally {
    net.Server.prototype.listen = listen;
    net.Socket.prototype.connect = connect;
  }
}
offline().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
