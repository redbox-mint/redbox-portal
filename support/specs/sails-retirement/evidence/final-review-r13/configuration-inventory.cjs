// Offline source inventory. Never imports/executes baseline application modules.
const { execFileSync } = require('node:child_process');
const { readFileSync, writeFileSync } = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const root = path.resolve(__dirname, '../../../../..');
const base = 'a49366803164429f9d8bdd249dadcdf856c9d13e';
const names = execFileSync('git', ['ls-tree', '-r', '--name-only', base], { cwd: root, encoding: 'utf8' }).trim().split('\n');
const selected = names.filter(file => /\.(?:ts|js|cjs|ejs|md|json)$/.test(file) &&
  !/^support\/docs\//.test(file) &&
  !/(?:package-lock|locales\/|language-defaults\/|dist\/|node_modules\/|\.map$)/.test(file));
const batch = execFileSync('git', ['cat-file', '--batch'], { cwd: root,
  input: selected.map(file => base + ':' + file).join('\n') + '\n', maxBuffer: 160 * 1024 * 1024 });
let offset = 0;
const source = new Map(selected.map(file => {
  const end = batch.indexOf(10, offset);
  const size = Number(batch.subarray(offset, end).toString().split(' ').at(-1));
  offset = end + 1;
  const text = batch.subarray(offset, offset + size).toString();
  offset += size + 1;
  return [file, text];
}));
const ast = new Map([...source].filter(([file]) => /\.[cm]?[jt]s$/.test(file))
  .map(([file, text]) => [file, ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true)]));
const entries = new Map();
const fixtures = [];
const environmentReads = [];
const unresolved = [];
const key = node => node && (ts.isIdentifier(node) || ts.isStringLiteralLike(node) || ts.isNumericLiteral(node)) ? node.text : undefined;
const unwrap = node => node && (ts.isParenthesizedExpression(node) || ts.isAsExpression(node) || ts.isTypeAssertionExpression(node) || ts.isSatisfiesExpression(node)) ? unwrap(node.expression) : node;
function add(parts, file, node, kind, expression) {
  if (!parts.length) return;
  const location = parts.join('.');
  const row = entries.get(location) ?? { path: parts, provenance: [] };
  const line = node ? ast.get(file).getLineAndCharacterOfPosition(node.getStart()).line + 1 : 1;
  const item = { file, line, kind, ...(expression ? { expression } : {}) };
  if (!row.provenance.some(p => JSON.stringify(p) === JSON.stringify(item))) row.provenance.push(item);
  entries.set(location, row);
}
const symbols = new Map();
const types = new Map();
for (const [file, tree] of ast) {
  const map = new Map();
  function visit(node) {
    if ((ts.isInterfaceDeclaration(node) || ts.isTypeAliasDeclaration(node)) && !types.has(node.name.text)) types.set(node.name.text, { node, file });
    if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.initializer) map.set(node.name.text, node.initializer);
    if (ts.isImportDeclaration(node) && node.importClause?.namedBindings && ts.isNamedImports(node.importClause.namedBindings)) {
      const from = node.moduleSpecifier.text;
      if (from.startsWith('.')) for (const binding of node.importClause.namedBindings.elements) {
        const target = path.posix.normalize(path.posix.join(path.posix.dirname(file), from));
        const resolved = [target + '.ts', target + '.js', target + '/index.ts'].find(name => ast.has(name));
        if (resolved) map.set(binding.name.text, { import: resolved, name: binding.propertyName?.text ?? binding.name.text });
      }
    }
    ts.forEachChild(node, visit);
  }
  visit(tree);
  symbols.set(file, map);
}
const unknown = Symbol('unresolved');
function value(raw, file, seen = new Set()) {
  const node = unwrap(raw);
  if (!node) return unknown;
  if (ts.isStringLiteralLike(node)) return node.text;
  if (ts.isNumericLiteral(node)) return Number(node.text);
  if (node.kind === ts.SyntaxKind.TrueKeyword) return true;
  if (node.kind === ts.SyntaxKind.FalseKeyword) return false;
  if (node.kind === ts.SyntaxKind.NullKeyword) return null;
  if (ts.isIdentifier(node)) {
    const id = file + ':' + node.text;
    if (seen.has(id)) return unknown;
    const declaration = symbols.get(file)?.get(node.text);
    const next = new Set([...seen, id]);
    if (declaration?.import) return value(symbols.get(declaration.import)?.get(declaration.name), declaration.import, next);
    return declaration ? value(declaration, file, next) : unknown;
  }
  if (ts.isObjectLiteralExpression(node)) {
    const result = {};
    for (const property of node.properties) {
      if (ts.isSpreadAssignment(property)) {
        const spread = value(property.expression, file, seen);
        if (spread && typeof spread === 'object' && !Array.isArray(spread)) Object.assign(result, spread);
        continue;
      }
      const name = ts.isComputedPropertyName(property.name) ? value(property.name.expression, file, seen) : key(property.name);
      if (name === undefined || !ts.isPropertyAssignment(property)) continue;
      const item = value(property.initializer, file, seen);
      if (item !== unknown) result[name] = item;
    }
    return result;
  }
  if (ts.isArrayLiteralExpression(node)) {
    const items = node.elements.map(item => value(item, file, seen));
    return items.every(item => item !== unknown) ? items : unknown;
  }
  if (ts.isPropertyAccessExpression(node) || ts.isElementAccessExpression(node)) {
    const object = value(node.expression, file, seen);
    const member = ts.isPropertyAccessExpression(node) ? node.name.text : value(node.argumentExpression, file, seen);
    return object !== unknown && object != null && Object.hasOwn(object, member) ? object[member] : unknown;
  }
  if (ts.isPrefixUnaryExpression(node)) {
    const item = value(node.operand, file, seen);
    return typeof item === 'number' ? (node.operator === ts.SyntaxKind.MinusToken ? -item : item) : unknown;
  }
  if (ts.isBinaryExpression(node)) {
    const left = value(node.left, file, seen), right = value(node.right, file, seen);
    if (left === unknown || right === unknown) return unknown;
    switch (node.operatorToken.kind) {
      case ts.SyntaxKind.PlusToken: return left + right;
      case ts.SyntaxKind.MinusToken: return left - right;
      case ts.SyntaxKind.AsteriskToken: return left * right;
      case ts.SyntaxKind.SlashToken: return left / right;
    }
  }
  if (ts.isTemplateExpression(node)) {
    let result = node.head.text;
    for (const span of node.templateSpans) {
      const item = value(span.expression, file, seen);
      if (item === unknown) return unknown;
      result += item + span.literal.text;
    }
    return result;
  }
  return unknown;
}
function shape(raw, parts, file, kind, seen = new Set()) {
  const node = unwrap(raw);
  if (!node) return;
  add(parts, file, node, kind);
  if (ts.isIdentifier(node)) {
    const id = file + ':' + node.text;
    if (seen.has(id)) return;
    const definition = symbols.get(file)?.get(node.text);
    const next = new Set([...seen, id]);
    if (definition?.import) shape(symbols.get(definition.import)?.get(definition.name), parts, definition.import, kind, next);
    else if (definition) shape(definition, parts, file, kind, next);
    else unresolved.push({ file, line: ast.get(file).getLineAndCharacterOfPosition(node.getStart()).line + 1, kind, path: parts, expression: node.getText(), reason: 'Unresolved external/symbolic identifier; no value fabricated' });
    return;
  }
  if (ts.isObjectLiteralExpression(node)) for (const prop of node.properties) {
    if (ts.isSpreadAssignment(prop)) shape(prop.expression, parts, file, kind, seen);
    else if (ts.isPropertyAssignment(prop)) {
      const name = ts.isComputedPropertyName(prop.name) ? value(prop.name.expression, file, seen) : key(prop.name);
      if (name !== undefined && name !== unknown) shape(prop.initializer, [...parts, String(name)], file, kind, seen);
      else unresolved.push({ file, line: ast.get(file).getLineAndCharacterOfPosition(prop.getStart()).line + 1, kind, expression: prop.getText().slice(0, 240) });
    }
  }
  if (ts.isArrayLiteralExpression(node)) for (const item of node.elements) shape(item, [...parts, '*'], file, kind, seen);
  if (!ts.isObjectLiteralExpression(node) && !ts.isArrayLiteralExpression(node) && value(node, file) === unknown) unresolved.push({ file, line: ast.get(file).getLineAndCharacterOfPosition(node.getStart()).line + 1, kind, path: parts, expression: node.getText().slice(0, 240), reason: 'Executable/resource/symbolic expression is inventoried but never evaluated; compare its replacement contract separately' });
}
function typeShape(node, parts, file, seen = new Set()) {
  if (!node) return;
  if (ts.isTypeReferenceNode(node)) {
    const name = node.typeName.getText();
    if (['Partial', 'Readonly', 'Required'].includes(name)) return typeShape(node.typeArguments?.[0], parts, file, seen);
    if (name === 'Record') return typeShape(node.typeArguments?.[1], [...parts, '*'], file, seen);
    if (name === 'Array' || name === 'ReadonlyArray') return typeShape(node.typeArguments?.[0], [...parts, '*'], file, seen);
    if (seen.has(name)) return;
    const target = types.get(name);
    if (target) typeShape(target.node, parts, target.file, new Set([...seen, name]));
  } else if (ts.isTypeAliasDeclaration(node)) typeShape(node.type, parts, file, seen);
  else if (ts.isArrayTypeNode(node)) typeShape(node.elementType, [...parts, '*'], file, seen);
  else if (ts.isUnionTypeNode(node) || ts.isIntersectionTypeNode(node)) node.types.forEach(item => typeShape(item, parts, file, seen));
  else if (ts.isTypeLiteralNode(node) || ts.isInterfaceDeclaration(node)) for (const member of node.members) {
    if (ts.isPropertySignature(member) && key(member.name)) {
      const next = [...parts, key(member.name)];
      add(next, file, member, 'declared type shape', member.type?.getText().slice(0, 240));
      typeShape(member.type, next, file, seen);
    } else if (ts.isIndexSignatureDeclaration(member)) typeShape(member.type, [...parts, '*'], file, seen);
  }
}
// Every declaration in core/bundled config modules and environment files, including retired settings.
for (const [file, tree] of ast) {
  if (!/(?:\/src\/config\/|^config\/env\/)/.test(file) || file.endsWith('.d.ts')) continue;
  const core = /^packages\/redbox-core\/src\/config\/(.+)\.config\.ts$/.exec(file);
  const hook = /^packages\/(?:redbox-hook-dev|sails-hook-redbox-(?:pdfgen|storage-mongo))\/src\/config\/(.+)\.ts$/.exec(file);
  const name = core?.[1] ?? hook?.[1];
  if (name && !symbols.get(file)?.has(name)) {
    const declared = tree.statements.find(node => ts.isInterfaceDeclaration(node) && node.name.text.toLowerCase() === (name + 'Config').toLowerCase());
    if (declared) { add([name], file, declared, 'declared type shape'); typeShape(declared, [name], file); }
  }
  if (name && symbols.get(file)?.has(name)) {
    const node = symbols.get(file).get(name);
    shape(node, [name], file, 'default/declaration');
    if (node.parent?.type) typeShape(node.parent.type, [name], file);
    const sample = value(node, file);
    if (sample !== unknown) fixtures.push({ file, line: tree.getLineAndCharacterOfPosition(node.getStart()).line + 1, name, sample });
    else unresolved.push({ file, line: tree.getLineAndCharacterOfPosition(node.getStart()).line + 1, kind: 'nonliteral default', expression: node.getText().slice(0, 240) });
  }
  function visit(node) {
    if (ts.isBinaryExpression(node) && node.operatorToken.kind === ts.SyntaxKind.EqualsToken && node.left.getText() === 'module.exports') {
      const declaration = unwrap(node.right);
      if (ts.isObjectLiteralExpression(declaration)) for (const prop of declaration.properties) if (ts.isPropertyAssignment(prop) && key(prop.name)) {
        const name = key(prop.name);
        shape(prop.initializer, [name], file, 'environment declaration');
        const sample = value(prop.initializer, file);
        if (sample !== unknown) fixtures.push({ file, line: tree.getLineAndCharacterOfPosition(prop.initializer.getStart()).line + 1, name, sample });
      }
    }
    ts.forEachChild(node, visit);
  }
  visit(tree);
}
const rootNames = new Set([...entries.values()].map(row => row.path[0]));
// Follow local aliases of sails.config and branded blocks, including lodash path reads.
for (const [file, tree] of ast) {
  const aliases = new Map();
  function chain(raw, seen = new Set()) {
    const node = unwrap(raw);
    if (!node) return undefined;
    if (node.getText() === 'sails.config' || node.getText() === 'this.sails.config') return [];
    if (ts.isIdentifier(node)) return aliases.get(node.text);
    if (ts.isPropertyAccessExpression(node) || ts.isElementAccessExpression(node)) {
      const parent = chain(node.expression, seen);
      if (parent) return [...parent, ts.isPropertyAccessExpression(node) ? node.name.text : (ts.isStringLiteralLike(node.argumentExpression) || ts.isNumericLiteral(node.argumentExpression) ? node.argumentExpression.text : '*')];
    }
    if (ts.isCallExpression(node)) {
      const method = node.expression.getText();
      if (/\.(?:getBrand|brandingAware)$/.test(method)) {
        const block = node.arguments.map(key).find(item => rootNames.has(item));
        return block ? ['brandingConfigurationDefaults', block] : undefined;
      }
      if (/^(?:_|lodash)\.(?:get|has)$/.test(method)) {
        const parent = chain(node.arguments[0], seen);
        const suffix = node.arguments[1] && ts.isStringLiteralLike(node.arguments[1]) ? node.arguments[1].text : '*';
        if (parent && suffix) return [...parent, ...suffix.replace(/\[(\d+)\]/g, '.*').split('.')];
      }
    }
    return undefined;
  }
  for (let round = 0; round < 4; round++) {
    function collect(node) {
      if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.initializer) {
        const parts = chain(node.initializer);
        if (parts) aliases.set(node.name.text, parts);
      }
      ts.forEachChild(node, collect);
    }
    collect(tree);
  }
  function visit(node) {
    if ((ts.isPropertyAccessExpression(node) || ts.isElementAccessExpression(node)) && node.expression.getText() === 'process.env') {
      const name = ts.isPropertyAccessExpression(node) ? node.name.text : (ts.isStringLiteralLike(node.argumentExpression) ? node.argumentExpression.text : '*');
      environmentReads.push({ name, file, line: tree.getLineAndCharacterOfPosition(node.getStart()).line + 1, expression: node.getText().slice(0, 240) });
    }
    if (ts.isPropertyAccessExpression(node) || ts.isElementAccessExpression(node) || ts.isCallExpression(node)) {
      const parts = chain(node);
      if (parts?.length) add(parts, file, node, /\/test\/|^test\//.test(file) ? 'fixture read' : 'runtime read', node.getText().slice(0, 240));
    }
    // Config-shaped test fixtures: explicit property named config or assignments to sails.config sections.
    if (/(?:\/test\/|^test\/)/.test(file) && ts.isPropertyAssignment(node) && key(node.name) === 'config' && ts.isObjectLiteralExpression(unwrap(node.initializer))) {
      for (const prop of unwrap(node.initializer).properties) if (ts.isPropertyAssignment(prop) && rootNames.has(key(prop.name))) {
        const name = key(prop.name);
        shape(prop.initializer, [name], file, 'fixture declaration');
        const sample = value(prop.initializer, file);
        if (sample !== unknown) fixtures.push({ file, line: tree.getLineAndCharacterOfPosition(prop.initializer.getStart()).line + 1, name, sample });
      }
    }
    if (/(?:\/test\/|^test\/)/.test(file) && ts.isBinaryExpression(node) && node.operatorToken.kind === ts.SyntaxKind.EqualsToken) {
      const parts = chain(node.left);
      if (parts?.length) shape(node.right, parts, file, 'fixture assignment');
    }
    ts.forEachChild(node, visit);
  }
  visit(tree);
}
// Ordinary tracked wiki and EJS consumers are part of the source inventory too.
for (const [file, text] of source) if (/\.(?:md|ejs)$/.test(file)) {
  const expression = /(?:sails\.config\.|(?:configuration|config)\.)([A-Za-z_$][\w$]*(?:\??\.[\w$-]+)*)/g;
  for (const match of text.matchAll(expression)) {
    const parts = match[1].replaceAll('?', '').split('.');
    if (!rootNames.has(parts[0]) && !match[0].startsWith('sails.config.')) continue;
    const row = entries.get(parts.join('.')) ?? { path: parts, provenance: [] };
    row.provenance.push({ file, line: text.slice(0, match.index).split('\n').length, kind: file.endsWith('.ejs') ? 'template read' : 'documented option', expression: match[0] });
    entries.set(parts.join('.'), row);
  }
}
const inventory = {
  baseline: base, method: 'TypeScript AST: all core/bundled defaults, environment declarations, sails.config/local aliases/lodash reads, config-shaped tests; tracked wiki/EJS references. Static values only; no baseline code executed.',
  scannedFiles: selected, excludedFiles: names.filter(name => !selected.includes(name)).map(file => ({ file, reason: /^support\/docs\//.test(file) ? 'legacy documentation; AGENTS routes to tracked wiki' : /package-lock|locales\/|language-defaults\/|dist\/|node_modules\//.test(file) ? 'dependency/generated/localization content' : 'non-source asset (all repository source extensions scanned)' })),
  entries: [...entries.values()].sort((a, b) => a.path.join('.').localeCompare(b.path.join('.'))),
  fixtures, unresolved, environmentReads,
};
inventory.counts = { scannedFiles: selected.length, excludedFiles: inventory.excludedFiles.length, paths: inventory.entries.length, provenance: inventory.entries.reduce((n, row) => n + row.provenance.length, 0), fixtures: fixtures.length, unresolved: unresolved.length, environmentReads: environmentReads.length };
const destination = path.join(__dirname, 'configuration-inventory.json');
const output = JSON.stringify(inventory, null, 2) + '\n';
if (process.argv.includes('--check')) {
  if (readFileSync(destination, 'utf8') !== output) throw Error('Baseline configuration inventory is stale');
} else writeFileSync(destination, output);
console.log(JSON.stringify(inventory.counts));
