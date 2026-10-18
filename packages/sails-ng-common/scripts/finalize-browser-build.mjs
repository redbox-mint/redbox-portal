import { readdir, readFile, writeFile } from 'node:fs/promises';
import ts from 'typescript';

// TypeScript preserves package/extensionless specifiers. Keep the original
// CommonJS output untouched, but make the browser output valid native ESM and
// use the pinned, equivalent ESM implementation of Lodash for tree shaking.
const output = new URL('../dist/esm/', import.meta.url);
function rewriteModuleSpecifiers(source, filename) {
  const file = ts.createSourceFile(filename, source, ts.ScriptTarget.Latest, true);
  const edits = [];
  function rewrite(node) {
    if (!node || !ts.isStringLiteralLike(node)) return;
    let specifier = node.text;
    if (specifier === 'lodash') specifier = 'lodash-es';
    else if (specifier.startsWith('.') && !/\.(?:js|mjs|cjs|json)$/i.test(specifier)) specifier += '.js';
    if (specifier !== node.text) edits.push({ start: node.getStart(file) + 1, end: node.getEnd() - 1, specifier });
  }
  function visit(node) {
    if (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) rewrite(node.moduleSpecifier);
    else if (ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.ImportKeyword)
      rewrite(node.arguments[0]);
    else if (ts.isImportTypeNode(node) && ts.isLiteralTypeNode(node.argument)) rewrite(node.argument.literal);
    ts.forEachChild(node, visit);
  }
  visit(file);
  // Edit only module specifiers, never strings containing generated templates
  // or hook configuration. Preserve the rest of tsc's JavaScript/declarations.
  for (const edit of edits.sort((a, b) => b.start - a.start)) {
    source = source.slice(0, edit.start) + edit.specifier + source.slice(edit.end);
  }
  return source;
}

async function finalize(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const file = new URL(entry.name, directory);
    if (entry.isDirectory()) {
      await finalize(new URL(`${entry.name}/`, directory));
    } else if (entry.name.endsWith('.js') || entry.name.endsWith('.d.ts')) {
      const source = await readFile(file, 'utf8');
      await writeFile(file, rewriteModuleSpecifiers(source, file.pathname));
    }
  }
}
await finalize(output);
// This is a package boundary for Node's ESM loader. Repeat the audited side
// effect policy here because bundlers use the nearest package.json.
await writeFile(
  new URL('package.json', output),
  JSON.stringify({ type: 'module', sideEffects: ['./config/dictionary.model.js'] }) + '\n'
);
