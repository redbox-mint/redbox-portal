// Enforce the installed core boundary in every other package, including JS tools.
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');

let failures = 0;
function visitDirectory(directory) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    if (['node_modules', 'dist', 'coverage', '.tmp', '.git'].includes(entry.name)) continue;
    const file = path.join(directory, entry.name);
    if (entry.isDirectory()) visitDirectory(file);
    else if (/\.[cm]?[jt]sx?$/.test(entry.name)) {
      const source = ts.createSourceFile(file, fs.readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true);
      function visit(node) {
        const specifier =
          ts.isImportDeclaration(node) || ts.isExportDeclaration(node)
            ? node.moduleSpecifier
            : ts.isImportEqualsDeclaration(node) && ts.isExternalModuleReference(node.moduleReference)
              ? node.moduleReference.expression
              : ts.isCallExpression(node) &&
                  (node.expression.kind === ts.SyntaxKind.ImportKeyword ||
                    (ts.isIdentifier(node.expression) && node.expression.text === 'require'))
                ? node.arguments[0]
                : undefined;
        if (
          specifier &&
          ts.isStringLiteralLike(specifier) &&
          specifier.text.startsWith('@researchdatabox/redbox-core/dist/')
        ) {
          const { line } = source.getLineAndCharacterOfPosition(specifier.getStart(source));
          console.error(`${file}:${line + 1}: import redbox-core through its package entry`);
          failures++;
        }
        ts.forEachChild(node, visit);
      }
      visit(source);
    }
  }
}
for (const entry of fs.readdirSync('packages', { withFileTypes: true })) {
  if (entry.isDirectory() && entry.name !== 'redbox-core') visitDirectory(path.join('packages', entry.name));
}
if (failures) process.exitCode = 1;
else console.log('PASS cross-package core imports use the package entry');
