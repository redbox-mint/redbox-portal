const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');

// Follow the emitted public declaration graph, including inferred return types,
// nested members, aliases and inherited contracts, including dependency signatures.
// This is a public-signature check, not the later FM-043 source/dependency audit.
function auditPublicExports(packageRoots) {
  const entries = [];
  for (const root of packageRoots) {
    const manifest = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
    for (const [name, target] of Object.entries(manifest.exports ?? { '.': manifest.types ?? manifest.main })) {
      if (name.includes('*'))
        throw new Error(`${manifest.name}: wildcard export permits private transport imports: ${name}`);
      if (/http\/express/.test(name)) throw new Error(`${manifest.name}: Express entrypoint ${name}`);
      if (name === './package.json') continue;
      const destination = typeof target === 'string' ? target : (target.types ?? target.default);
      const declaration = path.resolve(root, destination.replace(/\.js$/, '.d.ts'));
      if (!fs.existsSync(declaration)) throw new Error(`Build public declaration first: ${declaration}`);
      entries.push({ package: manifest.name, name, declaration });
    }
  }
  const program = ts.createProgram(
    entries.map(entry => entry.declaration),
    {
      module: ts.ModuleKind.NodeNext,
      moduleResolution: ts.ModuleResolutionKind.NodeNext,
      target: ts.ScriptTarget.ES2024,
      skipLibCheck: true,
      strict: true,
      types: ['node'],
    }
  );
  const checker = program.getTypeChecker();
  const forbidden =
    /(?:\/node_modules\/(?:@types\/)?express(?:-serve-static-core|-session)?\/)|\/model\/RequestDetails\.d\.ts$/;
  const seen = new Set();
  function visitSymbol(original, trail) {
    if (!original) return;
    const symbol = original.flags & ts.SymbolFlags.Alias ? checker.getAliasedSymbol(original) : original;
    if (seen.has(symbol)) return;
    seen.add(symbol);
    for (const declaration of symbol.declarations ?? []) {
      const file = declaration.getSourceFile().fileName;
      if (forbidden.test(file)) throw new Error(`Express public signature: ${trail} -> ${symbol.name}`);
      function visit(node) {
        if (ts.getCombinedModifierFlags(node) & ts.ModifierFlags.Private) return;
        if (ts.isTypeReferenceNode(node) || ts.isTypeQueryNode(node) || ts.isExpressionWithTypeArguments(node)) {
          const name = node.typeName ?? node.exprName ?? node.expression;
          visitSymbol(checker.getSymbolAtLocation(name), `${trail} -> ${name.getText()}`);
        }
        if (ts.isImportTypeNode(node)) {
          const text = node.argument.getText();
          if (/['"]express(?:-serve-static-core|-session)?['"]/.test(text))
            throw new Error(`Express public signature: ${trail} -> ${text}`);
          if (node.qualifier) visitSymbol(checker.getSymbolAtLocation(node.qualifier), trail);
        }
        ts.forEachChild(node, visit);
      }
      visit(declaration);
    }
  }
  return entries.map(entry => {
    const source = program.getSourceFile(entry.declaration);
    const module = source && checker.getSymbolAtLocation(source);
    for (const statement of source?.statements ?? []) {
      if (!ts.isExportDeclaration(statement) && !ts.isImportDeclaration(statement)) continue;
      const specifier = statement.moduleSpecifier;
      if (
        specifier &&
        (/^['"]express(?:-serve-static-core|-session)?['"]$/.test(specifier.getText()) ||
          /http\/express/.test(specifier.getText()))
      )
        throw new Error(`Express public signature: ${entry.package}/${entry.name}`);
    }
    if (!module) throw new Error(`No public module: ${entry.declaration}`);
    const exports = checker.getExportsOfModule(module).sort((a, b) => a.name.localeCompare(b.name));
    for (const exported of exports) {
      const symbol = exported.flags & ts.SymbolFlags.Alias ? checker.getAliasedSymbol(exported) : exported;
      visitSymbol(symbol, `${entry.package}/${entry.name}:${exported.name}`);
    }
    return { package: entry.package, entrypoint: entry.name, exports: exports.map(symbol => symbol.name) };
  });
}

function auditBundledHookImports(repository) {
  const core = JSON.parse(fs.readFileSync(path.join(repository, 'packages/redbox-core/package.json'), 'utf8'));
  const imports = [];
  for (const name of ['redbox-hook-dev', 'sails-hook-redbox-storage-mongo', 'sails-hook-redbox-pdfgen']) {
    function scan(directory) {
      for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
        const file = path.join(directory, entry.name);
        if (entry.isDirectory()) scan(file);
        else if (entry.name.endsWith('.ts')) {
          const source = ts.createSourceFile(file, fs.readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true);
          function visit(node) {
            if (ts.isIdentifier(node) && node.text === 'sails')
              throw new Error(`Sails global in bundled hook: ${file}`);
            if (ts.isStringLiteralLike(node)) {
              const specifier = node.text;
              if (/^express(?:\/|-|$)|^sails$/.test(specifier))
                throw new Error(`Legacy HTTP import in bundled hook: ${file}: ${specifier}`);
              if (specifier === core.name || specifier.startsWith(core.name + '/')) {
                const subpath = '.' + specifier.slice(core.name.length);
                if (!(subpath in core.exports) || /^\.\/(?:dist|src)(?:\/|$)/.test(subpath))
                  throw new Error(`Private core import: ${file}: ${specifier}`);
                imports.push({ file: path.relative(repository, file), specifier });
              }
              if (/(?:^|\/)redbox-core\/(?:src|dist)\//.test(specifier))
                throw new Error(`Private core import: ${file}: ${specifier}`);
            }
            ts.forEachChild(node, visit);
          }
          visit(source);
        }
      }
    }
    scan(path.join(repository, 'packages', name, 'src'));
  }
  return imports;
}

module.exports = { auditPublicExports, auditBundledHookImports };
