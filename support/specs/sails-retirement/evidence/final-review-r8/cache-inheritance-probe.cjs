const assert = require('node:assert/strict');
const path = require('node:path');
const root = process.env.REDBOX_REVIEW_ROOT || process.cwd();
const ts = require(path.join(root, 'node_modules/typescript'));
const { isImmutableAssetPath: current } = require(
  path.join(root, 'packages/redbox-core/dist/http/express/pageHeaders')
);
// Baseline source is supplied by the parent so the disposable image need not contain Git.
const fs = require('node:fs');
const source = fs.readFileSync(process.argv[2], 'utf8');
const ast = ts.createSourceFile('baseline.ts', source, ts.ScriptTarget.Latest, true);
const functions = ast.statements
  .filter(x => ts.isFunctionDeclaration(x) && ['isStaticAssetPath', 'isImmutableAssetPath'].includes(x.name?.text))
  .map(x => x.getText(ast))
  .join('\n');
const code = ts.transpileModule('const path = require("node:path");\n' + functions, {
  compilerOptions: { module: ts.ModuleKind.CommonJS },
}).outputText;
const baseline = {};
new Function('require', 'exports', code)(require, baseline);
for (const p of [
  '/default/rdmp/images/checklist.png',
  '/js/redbox-progress.js',
  '/angular/form/browser/main-ABC12345.js',
]) {
  const old = baseline.isImmutableAssetPath(p),
    now = current(p);
  assert.equal(now, true);
  assert.equal(old, now);
  console.log(JSON.stringify({ path: p, baselineImmutable: old, currentImmutable: now }));
}
