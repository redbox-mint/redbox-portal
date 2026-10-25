// Run from the repository root; evaluates the actual pre-feature resolver/rewrite.
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const cp = require('node:child_process');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const ts = require('typescript');
const source = cp.execFileSync('git', ['show', 'a49366803:packages/redbox-core/src/config/http.config.ts'], { encoding: 'utf8' });
const ast = ts.createSourceFile('baseline.ts', source, ts.ScriptTarget.Latest, true);
const names = new Set(['isStaticAssetPath', 'sanitizeStaticSegment', 'sanitizeStaticResourcePath', 'resolvePublicAssetPath', 'resolveHookStaticAssetPath', 'decodeStaticPathPart']);
const functions = ast.statements.filter(s => ts.isFunctionDeclaration(s) && names.has(s.name?.text));
assert.equal(functions.length, names.size);
let rewrite;
function visit(node) {
  if (ts.isPropertyAssignment(node) && node.name.getText(ast) === 'brandingAndPortalAwareStaticRouter') rewrite = node.initializer.getText(ast);
  ts.forEachChild(node, visit);
}
visit(ast);
assert(rewrite);
const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'sr-r10-baseline-assets-'));
const compiled = path.join(directory, '.tmp/public');
const hooks = [path.join(directory, 'hook-high'), path.join(directory, 'hook-low')];
const context = {
  exports: {}, fs, path,
  sails: { config: { appPath: directory }, log: {} },
  RequestChronicleHelper: { fromReq: () => ({ addInfo() {} }) },
  resolveHookAssetFile: (_app, candidate) => {
    for (const root of hooks) {
      const file = path.join(root, candidate);
      if (fs.existsSync(file)) return { absolutePath: file };
    }
    return null;
  },
};
vm.runInNewContext(ts.transpileModule(functions.map(s => s.getText(ast)).join('\n') + '\nexports.rewrite = ' + rewrite, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText, context);
function select(url) {
  const hook = context.exports.resolveHookStaticAssetPath(directory, url);
  if (hook) return hook;
  const req = { url };
  context.exports.rewrite(req, {}, () => {});
  const file = path.join(compiled, req.url);
  return fs.existsSync(file) ? file : undefined;
}
const rows = [
  ...['js/app.js', 'styles/app.css', 'images/logo.png', 'fonts/face.woff2', 'angular/form/browser/main-HASH.js', 'icons/HASH.svg'].flatMap(resource => [
    { url: '/institution/rdmp/' + resource, candidates: ['institution/rdmp/', 'default/rdmp/', 'default/default/'].map(prefix => prefix + resource), roots: [compiled, ...hooks] },
    { url: '/' + resource, candidates: [resource], roots: [compiled, ...hooks] },
  ]),
  ...['apple-touch-icon.png', 'favicon-32x32.png', 'site.webmanifest'].map(resource => ({ url: '/' + resource, candidates: [resource], roots: [compiled, ...hooks] })),
  // Outside the hook-static allowlist, only Sails www's compiled root is consulted.
  ...['favicon.ico', 'robots.txt', 'locales/en/translation.json', 'node_modules/vendor/script.js'].map(resource => ({ url: '/' + resource, candidates: [resource], roots: [compiled] })),
];
let checks = 0;
try {
  for (const row of rows) {
    const files = row.candidates.flatMap(candidate => row.roots.map(root => path.join(root, candidate)));
    const ignored = row.roots.length === 1 ? hooks.map(root => path.join(root, row.candidates[0])) : [];
    for (const file of ignored) {
      fs.mkdirSync(path.dirname(file), { recursive: true });
      fs.writeFileSync(file, 'outside legacy hook allowlist');
    }
    for (const file of files) {
      fs.mkdirSync(path.dirname(file), { recursive: true });
      fs.writeFileSync(file, file);
    }
    for (const expected of files) {
      assert.equal(select(row.url), expected, row.url);
      checks++;
      fs.rmSync(expected);
    }
    assert.equal(select(row.url), undefined, row.url);
    checks++;
    for (const file of ignored) fs.rmSync(file);
  }
  // Source assets are build inputs, never another old-host runtime fallback.
  fs.mkdirSync(path.join(directory, 'assets/js'), { recursive: true });
  fs.writeFileSync(path.join(directory, 'assets/js/source-only.js'), 'source-only');
  assert.equal(select('/js/source-only.js'), undefined);
  checks++;
  console.log(JSON.stringify({ baseline: 'a49366803', rows: rows.length, checks, candidateOrder: ['brand/portal', 'default/portal', 'default/default'], rootsPerCandidate: ['compiled public', 'high hook', 'low hook'], nonAllowlistedFiles: 'compiled public only', rawSource: 'build input only', explicitLegacyCopies: 'initialization mutates both source and compiled trees' }, null, 2));
} finally {
  fs.rmSync(directory, { recursive: true, force: true });
}
