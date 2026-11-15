// Run from the repository root after building core and the bundled hooks.
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const { execFileSync } = require('node:child_process');
const ts = require('typescript');

const baseline = '52c67fe732f45ea83916e8bf652cbb5a2b2e6bf2';
const root = path.resolve(__dirname, '../../../..');
const target = path.join(__dirname, 'FM-038.inventory.json');
const hash = value => crypto.createHash('sha256').update(value).digest('hex');
const git = file =>
  execFileSync('git', ['show', `${baseline}:${file}`], { cwd: root, encoding: 'utf8', timeout: 10000 });

function declaration(file, source) {
  const compiled = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2024 },
  });
  file = file.replace('/src/extension.ts', '/dist/extension.js');
  const compiledModule = new Module(file, module);
  compiledModule.filename = file;
  compiledModule.paths = Module._nodeModulePaths(path.dirname(file));
  compiledModule._compile(compiled.outputText, file);
  return compiledModule.exports.registerRedboxExtension();
}
function describe(value) {
  return Object.fromEntries(
    Object.entries(value).map(([field, entries]) => [
      field,
      {
        entries: Array.isArray(entries)
          ? entries.map(item => (typeof item === 'string' ? item : item.name))
          : Object.keys(entries ?? {}).sort(),
        sha256: hash(JSON.stringify(entries, (_key, item) => (typeof item === 'function' ? item.toString() : item))),
      },
    ])
  );
}

function inventory() {
  const packages = fs
    .readdirSync(path.join(root, 'packages'))
    .filter(name => fs.existsSync(path.join(root, 'packages', name, 'package.json')))
    .sort();
  const bundled = packages.map(directory => {
    const manifest = JSON.parse(fs.readFileSync(path.join(root, 'packages', directory, 'package.json'), 'utf8'));
    if (!manifest.redbox?.extension) return { package: manifest.name, directory, extension: false };
    const relative = `packages/${directory}/src/extension.ts`;
    const absolute = path.join(root, relative);
    const previous = declaration(absolute, git(relative));
    const current = declaration(absolute, fs.readFileSync(absolute, 'utf8'));
    assert.equal(previous.apiVersion, 1);
    assert.equal(current.apiVersion, 2);
    const { apiVersion: _previousVersion, ...before } = previous;
    const { apiVersion: _currentVersion, ...after } = current;
    const beforeContributions = describe(before);
    const afterContributions = describe(after);
    assert.deepEqual(afterContributions, beforeContributions, `${manifest.name}: non-HTTP contribution drift`);
    const httpFields = ['controllers', 'handlers', 'routes', 'middleware', 'integrations', 'hooks', 'fallbacks'];
    const http = Object.fromEntries(
      httpFields.map(field => [field, { before: previous[field] ?? [], after: current[field] ?? [] }])
    );
    for (const field of httpFields)
      assert.deepEqual(
        http[field],
        { before: [], after: [] },
        `${manifest.name}: HTTP contribution needs differential qualification`
      );
    return {
      package: manifest.name,
      directory,
      extension: true,
      source: relative,
      apiVersion: { before: 1, after: 2 },
      http,
      before: beforeContributions,
      after: afterContributions,
    };
  });
  const tracked = execFileSync('git', ['ls-files', '*.ts', '*.js', '*.cjs', '*.mjs'], {
    cwd: root,
    encoding: 'utf8',
    timeout: 10000,
  })
    .trim()
    .split('\n');
  const registrations = tracked
    .filter(file => !/(?:^|\/)(?:test|templates|evidence|documentation)\//.test(file))
    .filter(file =>
      /(?:export\s+function\s+registerRedboxExtension\s*\(|exports\.registerRedboxExtension\s*=)/.test(
        fs.readFileSync(path.join(root, file), 'utf8')
      )
    );
  assert.deepEqual(
    registrations.sort(),
    bundled
      .filter(item => item.extension)
      .map(item => item.source)
      .sort(),
    'Uninventoried bundled registration'
  );
  return { baseline, packages: bundled, registrations, httpRoutePolicyChanges: [], nonHttpParity: true };
}

if (require.main === module) {
  const bytes = JSON.stringify(inventory(), null, 2) + '\n';
  if (process.argv.includes('--check'))
    assert.equal(fs.readFileSync(target, 'utf8'), bytes, 'Regenerate FM-038 inventory');
  else fs.writeFileSync(target, bytes);
  console.log('FM-038 bundled contribution reconciliation passed');
}
module.exports = { inventory };
