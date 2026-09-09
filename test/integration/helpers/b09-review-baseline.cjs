// Read-only source overlay: demonstrate regressions against B09 without changing the worktree.
const ts = require('typescript');
const path = require('node:path');
const cp = require('node:child_process');
const Module = require('node:module');
const fs = require('node:fs');
const groups = {
  parser: ['config/http.config'],
  provider: ['services/action-secrets/storage'],
  draft: ['services/RecordDefinitionAdminService'],
};
const selected = groups[process.env.B09_REVIEW_BASELINE];
if (!selected) throw new Error('Select parser, provider or draft with B09_REVIEW_BASELINE.');
// The mounted runtime image has no git; prepare this optional JSON on the host with git show.
const captured = process.env.B09_REVIEW_BASELINE_SOURCE
  ? JSON.parse(fs.readFileSync(process.env.B09_REVIEW_BASELINE_SOURCE, 'utf8'))
  : null;
const originals = new Map(
  selected.map(file => [
    file,
    captured
      ? captured[file]
      : cp.execFileSync(
          'git',
          ['show', `441441b608fa4a2648b991cd18a0a98ba9107018:packages/redbox-core/src/${file}.ts`],
          { encoding: 'utf8' }
        ),
  ])
);
for (const extension of ['.js', '.ts']) {
  const previous = Module._extensions[extension];
  Module._extensions[extension] = function (module, filename) {
    const relative = path
      .relative(path.join(process.cwd(), 'packages/redbox-core'), filename)
      .replaceAll(path.sep, '/');
    const key = relative.replace(/^(src|dist)\//, '').replace(/\.(js|ts)$/, '');
    if (!/^(src|dist)\//.test(relative) || !originals.has(key)) return previous(module, filename);
    const result = ts.transpileModule(originals.get(key), {
      compilerOptions: {
        target: ts.ScriptTarget.ES2022,
        module: ts.ModuleKind.CommonJS,
        experimentalDecorators: true,
        esModuleInterop: true,
      },
    });
    module._compile(result.outputText, filename);
  };
}
