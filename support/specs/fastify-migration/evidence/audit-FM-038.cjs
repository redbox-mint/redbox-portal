const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const ts = require('typescript');
const {
  auditPublicExports,
  auditBundledHookImports,
} = require('../../../../packages/redbox-core/scripts/public-export-audit.cjs');

const baseline = '52c67fe732f45ea83916e8bf652cbb5a2b2e6bf2';
const root = path.resolve(__dirname, '../../../..');
const target = path.join(__dirname, 'FM-038.exports.json');
const packageNames = ['redbox-core', 'redbox-hook-dev', 'sails-hook-redbox-storage-mongo', 'sails-hook-redbox-pdfgen'];
const git = file =>
  execFileSync('git', ['show', `${baseline}:${file}`], { cwd: root, encoding: 'utf8', timeout: 10000 });

function previousExports() {
  const entries = [];
  for (const directory of packageNames) {
    const manifest = JSON.parse(git(`packages/${directory}/package.json`));
    for (const [name, target] of Object.entries(manifest.exports)) {
      if (name.includes('*') || name === './package.json') continue;
      const destination = typeof target === 'string' ? target : (target.types ?? target.default);
      const source = path.join(
        root,
        'packages',
        directory,
        destination.replace(/^\.\/dist\//, 'src/').replace(/\.d\.ts$|\.js$/, '.ts')
      );
      entries.push({ package: manifest.name, entrypoint: name, source });
    }
  }
  const changed = execFileSync('git', ['diff', '--name-only', baseline, '--', 'packages'], {
    cwd: root,
    encoding: 'utf8',
    timeout: 10000,
  })
    .trim()
    .split('\n');
  const snapshots = new Map(
    changed.filter(file => /\/src\/.*\.ts$/.test(file)).map(file => [path.join(root, file), git(file)])
  );
  const host = ts.createCompilerHost({});
  const read = host.readFile;
  host.readFile = file => snapshots.get(file) ?? read(file);
  const program = ts.createProgram(
    entries.map(entry => entry.source),
    {
      module: ts.ModuleKind.NodeNext,
      moduleResolution: ts.ModuleResolutionKind.NodeNext,
      target: ts.ScriptTarget.ES2024,
      skipLibCheck: true,
    },
    host
  );
  const checker = program.getTypeChecker();
  return entries.map(({ source, ...entry }) => ({
    ...entry,
    exports: checker
      .getExportsOfModule(checker.getSymbolAtLocation(program.getSourceFile(source)))
      .map(symbol => symbol.name)
      .sort(),
  }));
}

const previous = previousExports();
const current = auditPublicExports(packageNames.map(name => path.join(root, 'packages', name)));
const manifests = packageNames.map(directory => {
  const before = JSON.parse(git(`packages/${directory}/package.json`));
  const after = JSON.parse(fs.readFileSync(path.join(root, 'packages', directory, 'package.json'), 'utf8'));
  return {
    package: before.name,
    removed: Object.keys(before.exports).filter(key => !(key in after.exports)),
    retained: Object.keys(before.exports).filter(key => key in after.exports),
    added: Object.keys(after.exports).filter(key => !(key in before.exports)),
  };
});
const exportAudit = [...new Set([...previous, ...current].map(entry => `${entry.package} ${entry.entrypoint}`))]
  .sort()
  .map(key => {
    const [name, entrypoint] = key.split(' ');
    const before = previous.find(entry => entry.package === name && entry.entrypoint === entrypoint)?.exports ?? [];
    const after = current.find(entry => entry.package === name && entry.entrypoint === entrypoint)?.exports ?? [];
    return {
      package: name,
      entrypoint,
      removed: before.filter(name => !after.includes(name)),
      retained: before.filter(name => after.includes(name)),
      added: after.filter(name => !before.includes(name)).sort(),
    };
  });
const bytes =
  JSON.stringify(
    {
      baseline,
      manifests,
      exports: exportAudit,
      bundledImports: auditBundledHookImports(root),
      expressPublicSignatures: 0,
      privateWildcardExports: 0,
    },
    null,
    2
  ) + '\n';
if (process.argv.includes('--check'))
  assert.equal(fs.readFileSync(target, 'utf8'), bytes, 'Regenerate FM-038 export audit');
else fs.writeFileSync(target, bytes);
console.log('FM-038 public export audit passed');
