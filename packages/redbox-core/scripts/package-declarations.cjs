// Publish the declaration closure of the supported entrypoints. The pre-cutover
// executable still needs private Express JavaScript, but consumers must not load
// its declarations merely by importing the production Fastify composition.
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
function packageDeclarations(root) {
  const dist = path.join(root, 'dist');
  const output = path.join(root, 'types');
  const manifest = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
  const options = { moduleResolution: ts.ModuleResolutionKind.NodeNext, module: ts.ModuleKind.NodeNext };
  const seen = new Set();
  const printer = ts.createPrinter();

  function publicDeclaration(file) {
    const source = ts.createSourceFile(file, fs.readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true);
    const statements = source.statements.filter(
      statement => !ts.getJSDocTags(statement).some(tag => tag.tagName.text === 'preCutover')
    );
    // Dropping an explicitly private declaration also drops imports used only by
    // that declaration. All other declarations and their types remain unchanged.
    const used = new Set();
    function visit(node) {
      if (ts.isIdentifier(node)) used.add(node.text);
      ts.forEachChild(node, visit);
    }
    for (const statement of statements) if (!ts.isImportDeclaration(statement)) visit(statement);
    return printer.printFile(
      ts.factory.updateSourceFile(
        source,
        statements.flatMap(statement => {
          if (!ts.isImportDeclaration(statement) || !statement.importClause) return [statement];
          const clause = statement.importClause;
          const name = clause.name && used.has(clause.name.text) ? clause.name : undefined;
          let bindings = clause.namedBindings;
          if (bindings && ts.isNamedImports(bindings)) {
            const elements = bindings.elements.filter(element => used.has(element.name.text));
            bindings = elements.length ? ts.factory.updateNamedImports(bindings, elements) : undefined;
          } else if (bindings && !used.has(bindings.name.text)) bindings = undefined;
          if (!name && !bindings) return [];
          return [
            ts.factory.updateImportDeclaration(
              statement,
              statement.modifiers,
              ts.factory.updateImportClause(clause, clause.isTypeOnly, name, bindings),
              statement.moduleSpecifier,
              statement.attributes
            ),
          ];
        })
      )
    );
  }

  function copy(file) {
    if (seen.has(file)) return;
    seen.add(file);
    if (!file.startsWith(dist + path.sep)) throw new Error('Declaration escaped package: ' + file);
    const text = publicDeclaration(file).replace(/\n?\/\/# sourceMappingURL=.*$/gm, '');
    if (/['"](?:express|express-session|express-serve-static-core)(?:\/[^'"]*)?['"]/.test(text))
      throw new Error('Express declaration in public closure: ' + file);
    const destination = path.join(output, path.relative(dist, file));
    fs.mkdirSync(path.dirname(destination), { recursive: true });
    fs.writeFileSync(destination, text);
    const specifiers = new Set();
    function references(node) {
      if ((ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) && node.moduleSpecifier)
        specifiers.add(node.moduleSpecifier.text);
      if (ts.isImportTypeNode(node) && ts.isLiteralTypeNode(node.argument)) specifiers.add(node.argument.literal.text);
      ts.forEachChild(node, references);
    }
    references(ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true));
    for (const specifier of specifiers) {
      if (!specifier.startsWith('.')) continue;
      const resolved = ts.resolveModuleName(specifier, file, options, ts.sys).resolvedModule;
      if (!resolved || !resolved.resolvedFileName.endsWith('.d.ts'))
        throw new Error(`Unresolved declaration: ${file}: ${specifier}`);
      copy(resolved.resolvedFileName);
    }
  }

  fs.rmSync(output, { recursive: true, force: true });
  function entries(target) {
    if (typeof target === 'string') {
      if (target.startsWith('./types/') && target.endsWith('.d.ts'))
        copy(path.join(dist, target.slice('./types/'.length)));
    } else if (target && typeof target === 'object') Object.values(target).forEach(entries);
  }
  entries(manifest.exports);
  return seen.size;
}

if (require.main === module)
  console.log(`Packaged ${packageDeclarations(path.resolve(__dirname, '..'))} public declaration files`);
module.exports = { packageDeclarations };
