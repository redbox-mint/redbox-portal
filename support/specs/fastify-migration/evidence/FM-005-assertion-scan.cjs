// Run from the repository root: node support/specs/fastify-migration/evidence/FM-005-assertion-scan.cjs
// Conservative review candidates, not a proof of assertion execution or a test runner.
const fs = require('node:fs');
const cp = require('node:child_process');
const { createHash } = require('node:crypto');
const ts = require('typescript');

const paths = cp.execFileSync('git', ['ls-files', '-z'], { encoding: 'utf8' }).split('\0').filter(Boolean);
const sources = paths.filter(
  p =>
    /\.(?:[cm]?js|[cm]?tsx?|bru)$/.test(p) &&
    (/(^|\/)(?:test|tests|__tests__)\//.test(p) || /(?:^|\/)(?:[^/]*[.-])?(?:test|spec)\.[^/]+$/.test(p))
);
const hits = [];
const parseErrors = [];
const counts = {};
const hash = createHash('sha256');
for (const file of sources) {
  const family = file.endsWith('.bru')
    ? 'Bruno'
    : file.startsWith('angular/')
      ? 'Angular'
      : /playwright|\/browser\//.test(file)
        ? 'Playwright/harness'
        : 'Mocha/other JS test sources';
  counts[family] = (counts[family] || 0) + 1;
  const original = fs.readFileSync(file, 'utf8');
  hash.update(file + '\0' + original + '\0');
  let source = original;
  if (file.endsWith('.bru')) {
    const chars = source.split('').map(c => (c === '\n' || c === '\r' ? c : ' '));
    for (const m of source.matchAll(/^(?:tests|script:(?:pre-request|post-response))\s*\{([^]*?)^\}/gm)) {
      const start = m.index + m[0].indexOf('{') + 1;
      // Work with UTF-16 offsets, as used by the TypeScript parser.
      for (let i = start; i < m.index + m[0].length - 1; i++) chars[i] = original[i];
    }
    source = chars.join('');
  }
  const ast = ts.createSourceFile(
    file,
    source,
    ts.ScriptTarget.Latest,
    true,
    file.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS
  );
  for (const d of ast.parseDiagnostics)
    parseErrors.push({
      file,
      line: ast.getLineAndCharacterOfPosition(d.start).line + 1,
      message: ts.flattenDiagnosticMessageText(d.messageText, ' '),
    });
  const line = n => ast.getLineAndCharacterOfPosition(n.getStart(ast)).line + 1;
  const declarations = [];
  function collect(n) {
    if (ts.isVariableDeclaration(n) && ts.isIdentifier(n.name)) declarations.push(n);
    ts.forEachChild(n, collect);
  }
  collect(ast);
  function fixedInput(n, site, seen = new Set()) {
    if (!n || seen.has(n)) return false;
    seen.add(n);
    if (
      ts.isAsExpression(n) ||
      ts.isParenthesizedExpression(n) ||
      ts.isNonNullExpression(n) ||
      ts.isSatisfiesExpression(n)
    )
      return fixedInput(n.expression, site, seen);
    if (ts.isArrayLiteralExpression(n)) return n.elements.length > 0 && n.elements.some(e => !ts.isSpreadElement(e));
    if (ts.isObjectLiteralExpression(n))
      return n.properties.length > 0 && n.properties.some(e => !ts.isSpreadAssignment(e));
    if (ts.isIdentifier(n)) {
      const ancestors = new Set();
      for (let a = site; a; a = a.parent) ancestors.add(a);
      const d = declarations
        .filter(d => d.name.text === n.text && d.pos < site.pos && ancestors.has(d.parent.parent.parent))
        .at(-1);
      return d ? fixedInput(d.initializer, d, seen) : false;
    }
    if (ts.isCallExpression(n) && ts.isPropertyAccessExpression(n.expression)) {
      if (/^(entries|keys|values)$/.test(n.expression.name.text))
        return fixedInput(
          n.expression.expression.getText(ast) === 'Object' ? n.arguments[0] : n.expression.expression,
          site,
          seen
        );
    }
    return false;
  }
  const assertion = n =>
    (ts.isCallExpression(n) &&
      (/^(?:assert(?:\.|\s*\(|[A-Z])|expect(?:[A-Z]\w*)?\s*\(|fail\s*\(|should\s*\(|rejects\s*\()/.test(
        n.getText(ast)
      ) ||
        /(?:^|\.)assert\./.test(n.expression.getText(ast)) ||
        /require\(['"](?:node:)?assert(?:\/strict)?['"]\)\./.test(n.expression.getText(ast)) ||
        (ts.isPropertyAccessExpression(n.expression) && /^(expect|should|assert)$/.test(n.expression.name.text)))) ||
    (ts.isPropertyAccessExpression(n) && /\.should\./.test(n.getText(ast)));
  const assertions = n => {
    const found = new Set();
    function visit(c) {
      if (assertion(c)) found.add(line(c));
      ts.forEachChild(c, visit);
    }
    visit(n);
    return [...found].sort((a, b) => a - b);
  };
  const exits = n => {
    let found = false;
    function visit(c) {
      if (ts.isFunctionLike(c)) return;
      if (
        ts.isReturnStatement(c) ||
        ts.isThrowStatement(c) ||
        ts.isBreakStatement(c) ||
        ts.isContinueStatement(c) ||
        (ts.isCallExpression(c) && c.expression.getText(ast) === 'this.skip')
      )
        found = true;
      ts.forEachChild(c, visit);
    }
    visit(n);
    return found;
  };
  function visit(n) {
    let kind;
    let body;
    if (ts.isIterationStatement(n, false)) {
      kind = ts.SyntaxKind[n.kind];
      body = n.statement;
    } else if (ts.isIfStatement(n)) {
      kind = 'if';
      body = n;
    } else if (ts.isConditionalExpression(n)) {
      kind = 'ternary';
      body = n;
    } else if (ts.isCaseClause(n) || ts.isDefaultClause(n)) {
      kind = 'switch';
      body = n;
    } else if (ts.isCatchClause(n)) {
      kind = 'catch';
      body = n.block;
    } else if (
      ts.isBinaryExpression(n) &&
      [ts.SyntaxKind.AmpersandAmpersandToken, ts.SyntaxKind.BarBarToken, ts.SyntaxKind.QuestionQuestionToken].includes(
        n.operatorToken.kind
      )
    ) {
      kind = 'short-circuit';
      body = n.right;
    } else if (
      ts.isCallExpression(n) &&
      ts.isPropertyAccessExpression(n.expression) &&
      /^(forEach|map|flatMap|filter|reduce|some|every)$/.test(n.expression.name.text)
    ) {
      kind = n.expression.name.text;
      body = n.arguments.find(a => ts.isArrowFunction(a) || ts.isFunctionExpression(a));
    } else if (ts.isCallExpression(n) && ts.isPropertyAccessExpression(n.expression)) {
      if (n.expression.name.text === 'catch') {
        kind = 'promise-catch';
        body = n.arguments[0];
      } else if (n.expression.name.text === 'then' && n.arguments.length > 1) {
        kind = 'then-rejection';
        body = n.arguments[1];
      }
    }
    let lines = body ? assertions(body) : [];
    // Guarded return/skip/throw can omit later assertions in the same function.
    if (ts.isIfStatement(n) && exits(n)) {
      let block = n.parent;
      while (block && !ts.isBlock(block)) block = block.parent;
      const later = block ? assertions(block).filter(l => l > line(n)) : [];
      if (later.length) {
        kind = 'if/exit-or-guard';
        lines = [...new Set([...lines, ...later])].sort((a, b) => a - b);
      }
    }
    const input =
      ts.isForOfStatement(n) || ts.isForInStatement(n)
        ? n.expression
        : ts.isCallExpression(n) && ts.isPropertyAccessExpression(n.expression)
          ? n.expression.expression
          : undefined;
    if (kind && lines.length) {
      // Left-associated short-circuit expressions can share a source start.
      // Treat that chain as one site, retaining assertions from every segment.
      const id = `${file}:${n.getStart(ast)}`;
      const existing = hits.find(h => h.id === id);
      if (existing) existing.assertions = [...new Set([...existing.assertions, ...lines])].sort((a, b) => a - b);
      else
        hits.push({
          id,
          family,
          file,
          line: line(n),
          column: ast.getLineAndCharacterOfPosition(n.getStart(ast)).character + 1,
          kind,
          fixedInput: fixedInput(input, n),
          input: input?.getText(ast),
          assertions: lines,
          source: original.split(/\r?\n/)[line(n) - 1].trim(),
        });
    }
    ts.forEachChild(n, visit);
  }
  visit(ast);
}
const summary = {
  sourceFiles: sources.length,
  sourceSha256: hash.digest('hex'),
  counts,
  parseErrors,
  candidateSites: hits.length,
  candidateFiles: new Set(hits.map(h => h.file)).size,
};
if (process.argv.includes('--check')) {
  const ledger = fs.readFileSync(__dirname + '/FM-005-assertion-inventory.md', 'utf8');
  const remaining = new Set(hits.map(h => `${h.file}:${h.line}:${h.column}`));
  const classified = {};
  const byFamily = {};
  const errors = [];
  for (const row of ledger.matchAll(/^\| `([^`]+)` \| `([^`]+)` \| ([FGOPH]) \|/gm)) {
    const [, file, sites, category] = row;
    for (const site of sites.split(', ')) {
      const key = `${file}:${site}`;
      if (!remaining.delete(key)) errors.push('Stale or duplicate classification: ' + key);
      const hit = hits.find(h => `${h.file}:${h.line}:${h.column}` === key);
      classified[category] = (classified[category] || 0) + 1;
      if (hit) {
        byFamily[hit.family] ??= {};
        byFamily[hit.family][category] = (byFamily[hit.family][category] || 0) + 1;
      }
    }
  }
  for (const key of remaining) errors.push('Unclassified: ' + key);
  if (!ledger.includes('Source SHA-256: `' + summary.sourceSha256 + '`'))
    errors.push('Source manifest/content digest changed');
  console.log(JSON.stringify({ ...summary, classified, byFamily, unclassified: remaining.size, errors }, null, 2));
  if (parseErrors.length || errors.length) process.exitCode = 1;
} else {
  console.log(JSON.stringify({ ...summary, hits }, null, 2));
  if (parseErrors.length) process.exitCode = 1;
}
