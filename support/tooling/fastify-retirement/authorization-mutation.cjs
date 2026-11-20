'use strict';

const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const { createHash } = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { parseArgs } = require('node:util');
const ts = require('typescript');
const { decisions, sourceDigests } = require('./authorization-coverage.cjs');

const repo = path.resolve(__dirname, '../../..');
const core = path.join(repo, 'packages/redbox-core');
const mappingFile = path.join(repo, 'support/specs/fastify-migration/evidence/FM-043-authorization-tests.json');
const hash = value => createHash('sha256').update(value).digest('hex');
const json = name => JSON.parse(fs.readFileSync(name, 'utf8'));
const { values } = parseArgs({
  options: {
    list: { type: 'boolean' },
    output: { type: 'string' },
    file: { type: 'string', multiple: true },
    id: { type: 'string', multiple: true },
    operator: { type: 'string', multiple: true },
    resume: { type: 'boolean' },
    'witness-timeout': { type: 'string', default: '480' },
    'max-decisions': { type: 'string' },
  },
});

function parentWhere(node, predicate) {
  for (let current = node.parent; current && !ts.isFunctionLike(current); current = current.parent)
    if (predicate(current)) return current;
}

const conditionOf = node =>
  ts.isIfStatement(node) ? node.expression : ts.isConditionalExpression(node) ? node.condition : undefined;

function multipartFieldRefusal(row, branch, source) {
  if (!row.file.endsWith('/multipart.ts') || !ts.isIfStatement(branch) || !ts.isBlock(branch.thenStatement))
    return undefined;
  const refusal = branch.thenStatement.statements[0];
  return refusal && /Invalid or repeated multipart field/.test(refusal.getText(source)) ? refusal : undefined;
}

function mutationFor(row, node, source, linkedCondition) {
  const change = (target, replacement, operation) => ({
    start: target.getStart(source),
    end: target.end,
    replacement,
    operation,
  });
  const invert = condition => change(condition, `!(${condition.getText(source)})`, 'negate condition');
  const conditionalOwner = parentWhere(node, candidate => {
    const condition = conditionOf(candidate);
    return condition && condition.pos <= node.pos && condition.end >= node.end;
  });
  if (['branch', 'selector branch'].includes(row.kind)) {
    const condition = conditionOf(node);
    if (ts.isIfStatement(node) && !node.elseStatement) {
      const multipartRefusal = multipartFieldRefusal(row, node, source);
      if (multipartRefusal) return change(multipartRefusal, ';', 'silently consume fields instead of refusing them');
      const tail = ts.isBlock(node.thenStatement) ? node.thenStatement.statements.at(-1) : node.thenStatement;
      if (tail && ts.isReturnStatement(tail) && tail.expression && ts.isArrowFunction(tail.expression)) {
        const handler = tail.expression;
        if (/\.code\(4\d\d\)\.send\(/.test(handler.body.getText(source)))
          return change(handler.body, 'undefined', 'bypass the installed refusal handler');
      }
      if (tail?.getText(source) === 'await request.session.regenerate();')
        return change(condition, 'false', 'disable the rejection-triggered session rotation');
      if (
        row.file.endsWith('/staticOwnership.ts') &&
        condition.getText(source) === "!entry.methods.includes('*') && !entry.methods.includes(method)"
      )
        return change(
          condition,
          `arguments.length < 4 && (${condition.getText(source)})`,
          'disable the method refusal during incoming-request selection'
        );
      if (tail && (ts.isReturnStatement(tail) || ts.isThrowStatement(tail)))
        return change(condition, 'false', 'disable early refusal');
    }
    return invert(condition);
  }
  if (row.kind === 'selector no match') {
    if (ts.isReturnStatement(node)) return change(node, ';', 'remove no-match return');
    return invert(conditionOf(node.parent));
  }
  if (row.kind === 'predicate' && ts.isCallExpression(node)) {
    // For a membership result, invert the decision even on an empty input.
    // For a filtering decision, invert each item's admission predicate.
    if (/\.(?:some|every)$/.test(node.expression.getText(source))) return invert(node);
    const callback = node.arguments[0];
    if (callback && (ts.isArrowFunction(callback) || ts.isFunctionExpression(callback))) {
      if (!ts.isBlock(callback.body)) return invert(callback.body);
      const last = callback.body.statements.at(-1);
      if (last && ts.isReturnStatement(last) && last.expression) return invert(last.expression);
    }
  }
  if (row.kind === 'membership lookup') {
    if (
      ts.isCallExpression(node) &&
      /\.(?:has|hasOwn|hasOwnProperty|includes|encodingExists)$/.test(node.expression.getText(source))
    )
      return invert(node);
    if (ts.isBinaryExpression(node) && node.operatorToken.kind === ts.SyntaxKind.InKeyword) return invert(node);
    if (linkedCondition) return invert(linkedCondition);
  }
  if (row.kind === 'short circuit') return invert(node.left);
  if (row.kind === 'denial throw') return change(node, ';', 'remove refusal throw');
  if (row.kind === 'credential catch') {
    const decline = node.block.statements.find(s => ts.isReturnStatement(s));
    if (decline) return change(decline, ';', 'remove credential rejection from catch');
  }
  if (row.kind === 'policy call' && ts.isCallExpression(node)) {
    const name = node.expression.getText(source);
    const argument = node.arguments[0];
    if (['sanitize', 'sanitizeSiemTestResponse', 'resolveMaskedTestDestinationSecrets'].includes(name) && argument)
      return change(node, '(' + argument.getText(source) + ')', 'bypass the policy projection');
    if (name === 'filterRelationshipGraph' && node.arguments[3])
      return change(node.arguments[3], 'async () => true', 'bypass delegated relationship visibility predicate');
    if (name === 'authorizeProgressRoom')
      return change(node, 'Promise.resolve(true)', 'bypass delegated progress-room check');
    if (ts.isExpressionStatement(node.parent))
      return change(node.parent, ';', 'remove the delegated refusal statement');
  }
  if (['redaction candidate', 'denial response', 'membership rejection', 'refusal helper call'].includes(row.kind)) {
    if (row.file.includes('/http/integrations/')) {
      const writer = ts.isNewExpression(node) ? node.parent : node;
      if (ts.isCallExpression(writer) && writer.expression.getText(source) === 'writeHttpError') {
        const target = writer.arguments[1];
        const socket =
          target && ts.isObjectLiteralExpression(target)
            ? target.properties.find(
                property => ts.isPropertyAssignment(property) && property.name.getText(source) === 'socket'
              )
            : undefined;
        // Suppress the refusal bytes while preserving disposal of the connection.
        // A leaked upgraded socket can hide the assertion behind a stop timeout.
        if (socket && ts.isPropertyAssignment(socket))
          return change(
            writer,
            `(${socket.initializer.getText(source)}).destroy()`,
            'close without the refusal response'
          );
      }
    }
    if (conditionalOwner) return invert(conditionOf(conditionalOwner));
    const refusal = parentWhere(
      node,
      candidate =>
        ts.isReturnStatement(candidate) || ts.isThrowStatement(candidate) || ts.isExpressionStatement(candidate)
    );
    if (refusal) return change(refusal, ';', 'remove refusal or redaction statement');
    if (row.kind === 'denial response' && ts.isCallExpression(node) && ts.isNumericLiteral(node.arguments[0]))
      return change(node.arguments[0], '200', 'replace the refusal status');
  }
  if (conditionalOwner) return invert(conditionOf(conditionalOwner));
  if (row.kind === 'case' && ts.isStringLiteralLike(node.expression))
    return change(node.expression, JSON.stringify('__fm043_no_selector_match__'), 'disable matching case');
  return {
    reason:
      'This row records a delegated call or a result value without a local boolean test or refusal statement. Removing the expression would change the return type rather than neutralize a guard.',
  };
}

function lookupMutations(row, node, source, linkedCondition) {
  const variant = (operator, target, replacement) => ({
    operator,
    mutation: { start: target.getStart(source), end: target.end, replacement, operation: operator },
  });
  const patch = (target, accept, reject) => [
    variant('accept-all', target, accept),
    variant('reject-all', target, reject),
  ];
  const text = node.getText(source);
  if (row.kind === 'branch' && /logoutOrigins\?\.includes/.test(row.condition)) {
    const membership = membershipCalls(conditionOf(node)).find(call => call.getText(source).includes('logoutOrigins'));
    assert(membership, `Expected origin membership call for ${row.id}`);
    return patch(membership, 'true', 'false');
  }
  if (row.kind === 'predicate' && ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression)) {
    const receiver = node.expression.expression.getText(source);
    return patch(node, `((${text}) ?? ${receiver}.find(() => true))`, 'undefined');
  }
  // This scope lookup admits a found record only if it belongs to the tenant.
  if (row.kind === 'branch' && /loaded\?\.metaMetadata.*brandId.*=== brand\.id/.test(row.condition))
    return patch(conditionOf(node), 'true', 'false');
  if (row.kind === 'branch' && row.file.endsWith('/configurationReads.ts') && row.condition === '!form') {
    const binding = node.parent.statements.at(node.parent.statements.indexOf(node) - 1).declarationList.declarations[0];
    const lookup = binding.initializer;
    const original = lookup.getText(source);
    const fallback = original.replace('String(query.name)', '"dataRecord"');
    assert.notEqual(original, fallback, 'Match-preserving form fallback requires the live form selector');
    return patch(lookup, `((${original}) ?? (${fallback}))`, 'undefined');
  }
  if (row.kind !== 'membership lookup') throw new Error(`Unsupported lookup decision: ${row.id}`);
  const multipartRefusal = linkedCondition && multipartFieldRefusal(row, linkedCondition.parent, source);
  if (multipartRefusal) {
    // A duplicate would otherwise throw while redefining the first immutable
    // field. Consume it silently so the mutant reaches the production handler.
    return [
      variant(
        'accept-all',
        multipartRefusal,
        `if (name === '__proto__' || name === 'constructor') ${multipartRefusal.getText(source)}`
      ),
      variant('reject-all', node, 'true'),
    ];
  }
  if (ts.isBinaryExpression(node) && node.operatorToken.kind === ts.SyntaxKind.InKeyword)
    return patch(node, 'true', 'false');
  if (row.file.endsWith('/configuredActions.ts')) {
    const selection = parentWhere(node, ts.isConditionalExpression);
    assert(selection, `Expected own-property action selector for ${row.id}`);
    return patch(selection, `(${selection.getText(source)} ?? Object.values(input.actions)[0])`, 'undefined');
  }
  if (
    ts.isCallExpression(node) &&
    /\.(?:has|hasOwn|hasOwnProperty|includes|encodingExists)$|\.hasOwnProperty\.call$/.test(
      node.expression.getText(source)
    )
  ) {
    // Forbid-list and duplicate checks treat presence as a refusal.
    const denyOnPresence = text === "id.includes('\\u0000')";
    return patch(node, denyOnPresence ? 'false' : 'true', denyOnPresence ? 'true' : 'false');
  }
  if (ts.isCallExpression(node) && text.startsWith('oidc.get('))
    return patch(node, `(${text} ?? oidc.values().next().value)`, 'undefined');
  if (ts.isCallExpression(node) && text.startsWith('decoders.get('))
    return patch(node, `(${text} ?? (() => new (require('node:stream').PassThrough)()))`, 'undefined');
  if (
    ts.isCallExpression(node) &&
    /^input\.(?:recordTypes\.get|reports\.get|queries\.getNamedQueryConfig)\(/.test(text)
  ) {
    // Resolve the original key first. An existing fixture entry stands in for
    // a manufactured match only on the absence path, preserving admitted keys.
    const value = parentWhere(node, ts.isAwaitExpression);
    const key = node.arguments[1];
    assert(value && key && linkedCondition, `Expected awaited registry result for ${row.id}`);
    const known = text.startsWith('input.recordTypes.') ? 'dataRecord' : 'records';
    const original = value.getText(source);
    const offset = key.getStart(source) - value.getStart(source);
    const alternate = original.slice(0, offset) + JSON.stringify(known) + original.slice(offset + key.getWidth(source));
    return patch(value, `((${original}) ?? (${alternate}))`, 'undefined');
  }
  throw new Error(`Define match-preserving and no-match operators for ${row.id}: ${text}`);
}

function membershipCalls(node) {
  const calls = ts.isCallExpression(node) ? [node] : [];
  ts.forEachChild(node, child => {
    calls.push(...membershipCalls(child));
  });
  return calls;
}

const mapping = json(mappingFile);
assert.deepEqual(sourceDigests(), mapping.sources, 'Refresh the source inventory before running mutants.');
const equivalentRefusals = {
  '8d6fc76e64c3ecda':
    'The unchanged immutable marker reaches nativeSessionSend, whose finally block strips Set-Cookie even when the session is absent or its store fails.',
  '86667f7849d9a83a':
    'A missing OIDC lookup reaches destructuring of undefined before any state or provider work. The HTTP boundary maps both exceptions to the same safe 500.',
  c9ecd5f85cbef214:
    'Removing the missing-provider throw reaches the same safe 500 at destructuring before any state or provider work.',
  e7612c717a929e30:
    'This is the same missing-provider throw and the same equivalent fallthrough at begin and callback.',
  '3598d60daba445b9':
    'With AAF inactive, reading secretOrKey on undefined fails before authentication work. Both exceptions take the same safe 500 and failure event path.',
  '2d38a61390311336':
    'The provider has already denied the callback. The caller suppresses OAUTH_AUTHORIZATION_RESPONSE_ERROR and emits the same unauthenticated response and failure event as a null return.',
};
const plan = [];
decisions(undefined, (row, node, source, linkedCondition) => {
  const entry = mapping.decisions[row.id];
  assert(entry, `Unreviewed decision ${row.id}`);
  if (!entry.tests?.length) return;
  const equivalence = Object.hasOwn(equivalentRefusals, row.id) ? equivalentRefusals[row.id] : undefined;
  plan.push({
    ...row,
    operator: 'primary',
    witnesses: entry.tests,
    mutation: mutationFor(row, node, source, linkedCondition),
    equivalence,
  });
  for (const variant of row.lookup ? lookupMutations(row, node, source, linkedCondition) : []) {
    const witnesses = entry.operatorTests?.[variant.operator];
    assert(witnesses?.length, `Missing ${variant.operator} witness for ${row.id}`);
    plan.push({
      ...row,
      ...variant,
      id: `${row.id}:${variant.operator}`,
      decision: row.id,
      witnesses,
    });
  }
});
const mapped = plan.filter(row => row.operator === 'primary').length;
assert.equal(mapped, Object.values(mapping.decisions).filter(entry => entry.tests?.length).length);
const selected = plan.filter(
  row =>
    (!values.file || values.file.some(file => row.file.endsWith(file))) &&
    (!values.id || values.id.includes(row.id) || values.id.includes(row.decision)) &&
    (!values.operator || values.operator.includes(row.operator))
);
assert(selected.length > 0, 'The selector did not identify any mapped decisions.');
for (const id of values.id ?? [])
  assert(
    plan.some(row => row.id === id),
    'Unmapped or unknown decision: ' + id
  );
for (const file of values.file ?? [])
  assert(
    plan.some(row => row.file.endsWith(file)),
    'No mapped decisions in source: ' + file
  );
if (values.list) {
  console.log(JSON.stringify(selected, null, 2));
  return;
}

assert(values.output, 'Pass --output=<report.json>.');
assert.equal(process.env.FM043_DISPOSABLE_TEST_SERVICES, '1', 'Use dedicated disposable local test services.');
const mongo = new URL(process.env.HTTP_PILOT_TEST_MONGO_URL);
const solr = new URL(`http://${process.env.HTTP_READ_SOLR_HOST ?? '127.0.0.1'}:${process.env.HTTP_READ_SOLR_PORT}`);
for (const service of [mongo, solr])
  assert(
    ['127.0.0.1', 'localhost'].includes(service.hostname),
    'Non-local services are not allowed for mutation runs.'
  );
assert.equal(mongo.pathname, '/sr_p4_http');
assert(/^\d+$/.test(values['witness-timeout']) && Number(values['witness-timeout']) > 0);
if (values['max-decisions']) assert(/^\d+$/.test(values['max-decisions']) && Number(values['max-decisions']) > 0);

const output = path.resolve(values.output);
const work = fs.mkdtempSync(path.join(os.tmpdir(), 'fm043-mutation-'));
const transpiled = path.join(work, 'transpiled');
fs.mkdirSync(transpiled);
const reportFile = path.join(work, 'mocha.json');
const loaded = path.join(work, 'loaded');
const copy = path.join(work, 'source.ts');
const traceLog = path.join(work, 'mocha.log');
const titleKey = t => `${path.resolve(core, t.file)}:${t.title}`;
const escape = value => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const reporter = path.join(__dirname, 'authorization-mutation-reporter.cjs');
const baseline = new Map();
const evaluated = new Map();
const results = values.resume && fs.existsSync(output) ? json(output).results : {};
const fingerprint = createHash('sha256');
for (const file of [
  __filename,
  reporter,
  path.join(__dirname, 'authorization-coverage.cjs'),
  path.join(__dirname, 'authorization-mutation-preload.cjs'),
  path.join(__dirname, 'authorization-requests.cjs'),
  mappingFile,
  path.join(repo, 'package-lock.json'),
  path.join(core, 'package-lock.json'),
])
  fingerprint.update(fs.readFileSync(file));
for (const directory of ['src', 'test'])
  for (const file of fs.readdirSync(path.join(core, directory), { recursive: true }).sort()) {
    if (/\.(?:[cm]?[jt]sx?|json)$/.test(file)) {
      const full = path.join(core, directory, file);
      if (fs.statSync(full).isFile()) fingerprint.update(full).update(fs.readFileSync(full));
    }
  }
const runKey = fingerprint.digest('hex');
function flush() {
  const current = plan.map(row => results[row.id]).filter(entry => entry?.runKey === runKey);
  const counts = Object.fromEntries(
    ['killed', 'survived', 'not-applicable', 'error'].map(status => [
      status,
      current.filter(row => row.status === status).length,
    ])
  );
  const data = { runKey, mapped, operations: plan.length, remaining: plan.length - current.length, counts, results };
  fs.writeFileSync(output + '.tmp', JSON.stringify(data, null, 2) + '\n');
  fs.renameSync(output + '.tmp', output);
  return data;
}

function run(witnesses, overlay) {
  const purge = spawnSync(
    'timeout',
    [
      '20',
      'curl',
      '-fsS',
      '--max-time',
      '15',
      '-H',
      'Content-Type: application/json',
      '--data',
      '{"delete":{"query":"*:*"}}',
      new URL('/solr/redbox/update?commit=true', solr).href,
    ],
    { encoding: 'utf8' }
  );
  if (purge.status !== 0) return { error: 'Could not clear the disposable Solr index: ' + purge.stderr };
  for (const file of [reportFile, loaded]) fs.rmSync(file, { force: true });
  const log = fs.openSync(traceLog, 'w');
  let proc;
  try {
    const files = [...new Set(witnesses.map(t => path.resolve(repo, t.file)))];
    const names = [...new Set(witnesses.map(t => t.title))];
    for (const file of files) assert(file.startsWith(core + '/test/'), 'Unexpected witness path.');
    proc = spawnSync(
      'timeout',
      [
        '--foreground',
        '--signal=TERM',
        '--kill-after=15',
        values['witness-timeout'],
        process.execPath,
        '--no-experimental-strip-types',
        path.join(repo, 'node_modules/mocha/bin/mocha.js'),
        '--no-config',
        '--require',
        'ts-node/register/transpile-only',
        '--require',
        path.join(__dirname, 'authorization-mutation-preload.cjs'),
        '--require',
        'chai',
        '--require',
        'test/setup.ts',
        '--reporter',
        reporter,
        '--exit',
        '--timeout',
        '120000',
        '--grep',
        `^(?:${names.map(escape).join('|')})$`,
        ...(overlay ? ['--bail'] : []),
        ...files,
      ],
      {
        cwd: core,
        env: {
          ...process.env,
          TMPDIR: work,
          TS_NODE_PROJECT: 'test/tsconfig.json',
          FM043_MUTATION_REPORT: reportFile,
          FM043_MUTATION_OVERLAY: JSON.stringify(overlay ?? null),
          FM043_MUTATION_TRANSPILED: transpiled,
          FM043_MUTATION_TITLES: JSON.stringify(names),
          FM043_MUTATION_SCRATCH_ROOT: work,
        },
        stdio: ['ignore', log, log],
      }
    );
  } finally {
    fs.closeSync(log);
  }
  if (proc.error || !fs.existsSync(reportFile) || (overlay && !fs.existsSync(loaded)) || ![0, 1].includes(proc.status))
    return {
      error: `Exit ${proc.status ?? proc.signal}; no usable witness or overlay receipt. ${fs.readFileSync(traceLog, 'utf8').slice(-1800)}`,
    };
  const result = json(reportFile);
  const expected = new Set(witnesses.map(t => titleKey({ ...t, file: path.resolve(repo, t.file) })));
  if (result.pending.length || [...result.failed, ...result.passed].some(t => !expected.has(titleKey(t))))
    return { error: 'Mocha skipped a witness, ran a different title, or failed in a hook.', result };
  if (!result.failed.length && new Set(result.passed.map(titleKey)).size !== expected.size)
    return { error: 'The exact witness selection did not pass every requested title.', result };
  return { result };
}

function check(row) {
  const { file, mutation, witnesses } = row;
  if (row.equivalence) return { status: 'not-applicable', reason: row.equivalence };
  if (mutation.reason) return { status: 'error', reason: mutation.reason };
  const original = path.join(repo, file);
  const source = fs.readFileSync(original, 'utf8');
  assert.equal(hash(source), mapping.sources[file]);
  const patched = source.slice(0, mutation.start) + mutation.replacement + source.slice(mutation.end);
  if (patched === source || ts.createSourceFile(file, patched, ts.ScriptTarget.Latest).parseDiagnostics.length)
    return { status: 'error', reason: 'Scratch mutation did not produce a different, parseable module.' };
  fs.writeFileSync(copy, patched);
  const key = JSON.stringify(witnesses.map(t => [t.file, t.title]).sort());
  if (!baseline.has(key)) baseline.set(key, run(witnesses));
  const before = baseline.get(key);
  if (before.error || before.result.failed.length)
    return { status: 'error', reason: 'The exact unmodified witness selection was not green.', baseline: before };
  const after = run(witnesses, { original, copy, loaded });
  if (after.error) return { status: 'error', reason: after.error, witnessResult: after.result };
  if (!after.result.failed.length) return { status: 'survived', witnessResult: after.result };
  if (
    !after.result.failed.some(
      test =>
        test.type === 'test' && (test.code === 'ERR_ASSERTION' || ['AssertionError', 'AssertError'].includes(test.name))
    )
  )
    return { status: 'error', reason: 'The mutant did not fail a witness assertion.', witnessResult: after.result };
  return { status: 'killed', witnessResult: after.result };
}

const cleanup = () => fs.rmSync(work, { recursive: true, force: true });
process.once('exit', cleanup);
process.once('SIGTERM', () => process.exit(143));
process.once('SIGINT', () => process.exit(130));

async function main() {
  try {
    let attempted = 0;
    for (const row of selected.sort((a, b) => a.file.localeCompare(b.file) || a.line - b.line)) {
      if (
        values.resume &&
        results[row.id]?.runKey === runKey &&
        ['killed', 'not-applicable'].includes(results[row.id].status)
      )
        continue;
      if (values['max-decisions'] && attempted >= Number(values['max-decisions'])) break;
      attempted++;
      const { id, file, line, kind, mutation, operator } = row;
      const key = JSON.stringify([
        file,
        mutation.start,
        mutation.end,
        mutation.replacement,
        row.witnesses.map(test => [test.file, test.title]).sort(),
      ]);
      const reused = mutation.reason || row.equivalence ? undefined : evaluated.get(key);
      const result = reused ? { ...reused.result, sameMutationAs: reused.id } : check(row);
      if (!reused && !mutation.reason && !row.equivalence) evaluated.set(key, { id, result });
      results[id] = { runKey, file, line, kind, operator, mutation, ...result };
      flush();
      console.log(`${result.status} ${file}:${line} ${id}`);
      await new Promise(resolve => setImmediate(resolve));
    }
    const { counts, mapped, operations, remaining } = flush();
    console.log(JSON.stringify({ mapped, operations, remaining, ...counts }));
    if (
      selected.some(row => {
        const result = results[row.id];
        return result?.runKey !== runKey || !['killed', 'not-applicable'].includes(result.status);
      })
    )
      process.exitCode = 1;
  } finally {
    cleanup();
  }
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
