'use strict';

const assert = require('node:assert/strict');
const { createHash } = require('node:crypto');
const { readFileSync, readdirSync, statSync, writeFileSync } = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const { requiresEffectObservation } = require('./authorization-requests.cjs');

const root = path.resolve(__dirname, '../../..');
const core = 'packages/redbox-core';
const evidence = 'support/specs/fastify-migration/evidence';
const inventoryPath = `${evidence}/FM-043-authorization-decisions.md`;
const mappingPath = `${evidence}/FM-043-authorization-tests.json`;

function* sourceFiles(dir) {
  for (const entry of readdirSync(path.join(root, dir), { withFileTypes: true }).sort((a, b) =>
    a.name.localeCompare(b.name)
  )) {
    const file = `${dir}/${entry.name}`;
    if (entry.isSymbolicLink()) throw new Error(`Authorization inventory requires regular source paths: ${file}`);
    if (entry.isDirectory()) yield* sourceFiles(file);
    else if (/\.[cm]?[jt]sx?$/.test(entry.name) && !/\.d\.[cm]?ts$/.test(entry.name)) yield file;
  }
}

const policy =
  /\b(?:actor|currentActor|activeActor|guest|roles|hiddenRoles|hiddenUsers|admin|sameBrand|brandId|tenantId|oidOwned|brands|brandScoped|ownership|foreign|refusal|permitted|view|editable|readable|csrf|bearer|credentials?|assertion|secret|password|nonce|token|redirectUri|redirUrl|logoutOrigins|authorization|authenticate\w*|authoriz\w*|has\w*Access|can\w*(?:Read|Write|View|Edit|Create)|is\w*(?:Admin|Forbidden|Denied)|\w*(?:[Aa]llowed|[Aa]llowlist|[Oo]wned|[Rr]edact\w*|[Ss]anitiz\w*))\b/i;
const credentialFiles = /\/fastify\/(?:authentication|identityProviders|csrf)\.ts$/;
const tenantPredicate = /\b(?:brand(?:ing)?|tenant)\??\.id\b|\b(?:brand(?:ing)?|tenant)I[dD]\b/;
const policyRejection =
  /Invalid (?:branding or portal|login parameters|assertion|OIDC identifier|credential input|permission subjects)|Unknown OIDC provider|Cannot link a user account to itself|Manage the primary account instead|Invalid (?:or reserved definition name|search field|filter field|user identifier|user search field)|User not found|No user found with given criteria|unbound (?:policy|CSRF)|requires explicit access|forbidden action|authentication-rejected|Pending.*authori[sz]|(?:immutable|create|update)SchemaFailure/i;
const denial =
  /\b(?:401|403|authentication-required|not-authorised|forbidden)\b|Access Denied|[Cc]ross[- ](?:origin|brand|tenant)|[Oo]wnership cannot change/;
// Some tenant-scoped reads publish an ordinary not-found response after a
// scoped lookup. Do not rely solely on explicit 401/403 status literals.
const scopedTarget =
  /(?:Named query(?: '.{1,60}')? not found|Harvest run not found|Report not found|vocabulary-not-found|Form not found)/i;
const delegated =
  /^(?:assertTestDestinationAllowed|resolveMaskedTestDestinationSecrets|sanitizeSiemTestResponse|sanitize|filterRecordGraph|filterReadableRecordRelationships|authorize\w+|\w*AccessDenial|\w*AccessRefusal|scopedActor|\w*Redact\w*)$/i;
const lexical =
  /\b(?:brand|portal|access|actor|credential|query|policy|scope|tenant|owner|target|namespace|secret|provider|authorization|origin)\b/i;
const denialPublishers = new Set([
  'actionApiErrors',
  'code',
  'writeHttpError',
  'errorResponse',
  'jsonResult',
  'readError',
  'referenceErrors',
  'response',
  'schemaProblem',
  'sendApiErrors',
  'status',
]);
// These boundary checks use generic persistence/transport names rather than HTTP status literals.
const sessionDecision =
  /^(?:!document|!pathname\.startsWith\(path\)|!result\.matchedCount|initial\?\.automaticFailed \|\| options\.store\.isRevoked\(session\)|session\.cookie\.secure !== true \|\| secure\(request, options\.proxy, trust\)|proxy === false|proxy === undefined && !trust\()/;
const ownershipDecision =
  /^(?:entry\.rawTarget && !rawTarget\.startsWith\(|!entry\.methods\.includes\(|entry\.phase !== phase|!path$|matched$)/;
const membership = /(?:\.has\(|\.includes\(|\bObject.hasOwn\()/;
const redaction = /(?:\.setProjectedMetadata\(null\)|\.concurrency\s*=\s*undefined\b|\.removeHeader\(|\.setCookie\()/;
const projectText = (node, source) => node.getText(source).replace(/\s+/g, ' ').trim();

const selectionName =
  /(?:allowlist|registr|dispatch|provider|adapter|destination|action|handler|target|definition|namedquery|encoding)/i;
const inputBag = /(?:^|\.)(?:headers|params|query|body|cookies|session|searchParams)\??$/;
const status4xx = node => ts.isNumericLiteral(node) && /^4\d\d$/.test(node.text);
const callName = node => (ts.isPropertyAccessExpression(node) ? node.name.text : node.getText());

function walkExpression(node, visit) {
  if (ts.isFunctionLike(node)) return;
  visit(node);
  ts.forEachChild(node, child => walkExpression(child, visit));
}

// Follow a local lookup result back to its initializer. Stop at the nearest
// declaration; do not infer membership from a similarly named variable in
// another block/function.
function localInitializer(identifier) {
  for (let scope = identifier.parent; scope; scope = scope.parent) {
    if (ts.isFunctionLike(scope)) break;
    if (!ts.isBlock(scope) && !ts.isSourceFile(scope)) continue;
    let found = false;
    let value;
    for (const statement of scope.statements) {
      if (statement.pos > identifier.pos) break;
      if (ts.isVariableStatement(statement)) {
        for (const declaration of statement.declarationList.declarations)
          if (
            declaration.pos < identifier.pos &&
            ts.isIdentifier(declaration.name) &&
            declaration.name.text === identifier.text
          ) {
            found = true;
            value = declaration.initializer;
          }
      } else if (found && ts.isExpressionStatement(statement)) {
        const assignment = statement.expression;
        if (
          assignment.end <= identifier.pos &&
          ts.isBinaryExpression(assignment) &&
          assignment.operatorToken.kind === ts.SyntaxKind.EqualsToken &&
          ts.isIdentifier(assignment.left) &&
          assignment.left.text === identifier.text
        )
          value = assignment.right;
      }
    }
    if (found) return value;
  }
}

// Follow direct lexical calls only. Imported, dynamic, and shadowed names are
// not evidence that a local helper will execute.
function localCallable(callee) {
  if (!ts.isIdentifier(callee)) return;
  for (let scope = callee.parent; scope; scope = scope.parent) {
    if (ts.isFunctionLike(scope) && scope.parameters.some(p => ts.isIdentifier(p.name) && p.name.text === callee.text))
      return;
    if (!ts.isBlock(scope) && !ts.isSourceFile(scope)) continue;
    for (const statement of scope.statements) {
      if (ts.isFunctionDeclaration(statement) && statement.name?.text === callee.text) return statement;
      if (!ts.isVariableStatement(statement)) continue;
      const declaration = statement.declarationList.declarations.find(
        decl => ts.isIdentifier(decl.name) && decl.name.text === callee.text
      );
      if (declaration) {
        const value = declaration.initializer;
        return value && (ts.isArrowFunction(value) || ts.isFunctionExpression(value)) ? value : undefined;
      }
    }
  }
}

function membershipLookups(condition) {
  const matches = new Set();
  const seen = new Set();
  function trace(expression, fromInitializer = false) {
    if (seen.has(expression)) return;
    seen.add(expression);
    walkExpression(expression, node => {
      if (ts.isBinaryExpression(node) && node.operatorToken.kind === ts.SyntaxKind.InKeyword) matches.add(node);
      else if (
        ts.isElementAccessExpression(node) &&
        !ts.isNumericLiteral(node.argumentExpression) &&
        !inputBag.test(node.expression.getText())
      )
        matches.add(node);
      else if (ts.isCallExpression(node)) {
        const name = callName(node.expression);
        const receiver = ts.isPropertyAccessExpression(node.expression) ? node.expression.expression : undefined;
        if (
          ['has', 'hasOwn', 'hasOwnProperty'].includes(name) ||
          (name === 'call' && receiver && /\.hasOwnProperty$/.test(receiver.getText())) ||
          (name === 'includes' && receiver && !ts.isStringLiteralLike(receiver)) ||
          (name === 'find' && receiver && selectionName.test(receiver.getText())) ||
          (name === 'get' &&
            receiver &&
            (receiver.getText() === 'Reflect'
              ? selectionName.test(node.arguments[0]?.getText() ?? '')
              : !inputBag.test(receiver.getText()))) ||
          (selectionName.test(name) && /^(?:(?:get|find|lookup|resolve|select)[A-Z]\w*|\w+Exists)$/.test(name))
        )
          matches.add(node);
        if (['some', 'every', 'find'].includes(name)) {
          const predicate = node.arguments[0];
          if (predicate && ts.isArrowFunction(predicate) && !ts.isBlock(predicate.body)) trace(predicate.body);
        }
      } else if (ts.isIdentifier(node)) {
        // A lookup result tested for absence is a guard; a later check of
        // one of its properties (e.g. action.authorize()) is a different guard.
        if (
          ts.isPropertyAccessExpression(node.parent) ||
          ts.isElementAccessExpression(node.parent) ||
          (ts.isCallExpression(node.parent) && (!fromInitializer || node.parent.expression === node))
        )
          return;
        const initializer = localInitializer(node);
        if (initializer) trace(initializer, true);
      }
    });
  }
  trace(condition);
  return matches;
}

function clientRejections(arms, source) {
  const matches = new Set();
  const helperCalls = new Set();
  const inspected = new Set();
  const activeHelpers = new Set();
  const helperResults = new Map();
  function visibleRefusal(node) {
    if (ts.isCallExpression(node) || ts.isNewExpression(node)) {
      return (
        ((ts.isNewExpression(node) || denialPublishers.has(callName(node.expression))) &&
          node.arguments?.some(status4xx)) ||
        policyRejection.test(projectText(node, source)) ||
        scopedTarget.test(projectText(node, source))
      );
    }
    return (
      ts.isPropertyAssignment(node) &&
      /^['"]?status(?:Code)?['"]?$/.test(node.name.getText()) &&
      status4xx(node.initializer)
    );
  }
  function alwaysRefuses(expression, aliases = new Set()) {
    if (!expression || aliases.has(expression)) return false;
    aliases.add(expression);
    if (ts.isIdentifier(expression)) return alwaysRefuses(localInitializer(expression), aliases);
    if (ts.isParenthesizedExpression(expression)) return alwaysRefuses(expression.expression, aliases);
    if (ts.isConditionalExpression(expression))
      return alwaysRefuses(expression.whenTrue, new Set(aliases)) && alwaysRefuses(expression.whenFalse, aliases);
    let refuses = false;
    walkExpression(expression, node => {
      if (visibleRefusal(node) || (node === expression && ts.isCallExpression(node) && refusalHelper(node)))
        refuses = true;
    });
    return refuses;
  }
  function refusalHelper(node) {
    const fn = localCallable(node.expression);
    if (!fn?.body || activeHelpers.has(fn) || fn.modifiers?.some(m => m.kind === ts.SyntaxKind.AsyncKeyword))
      return false;
    if (helperResults.has(fn)) return helperResults.get(fn);
    function exits(statement) {
      if (!statement) return false;
      if (ts.isBlock(statement)) return exits(statement.statements.at(-1));
      if (ts.isIfStatement(statement)) return exits(statement.thenStatement) && exits(statement.elseStatement);
      if (ts.isExpressionStatement(statement)) return alwaysRefuses(statement.expression);
      return ts.isReturnStatement(statement) || ts.isThrowStatement(statement);
    }
    activeHelpers.add(fn);
    if (ts.isBlock(fn.body) && !exits(fn.body)) {
      activeHelpers.delete(fn);
      return false;
    }
    // A helper that can return a value and only sometimes throws (for example
    // a scalar parser) isn't a refusal just because it appears in a branch.
    const outcomes = [];
    if (ts.isBlock(fn.body)) {
      walkExpression(fn.body, statement => {
        if (ts.isReturnStatement(statement) || ts.isThrowStatement(statement)) {
          const previous = ts.isBlock(statement.parent)
            ? statement.parent.statements[statement.parent.statements.indexOf(statement) - 1]
            : undefined;
          outcomes.push(
            statement.expression ?? (previous && ts.isExpressionStatement(previous) ? previous.expression : undefined)
          );
        }
      });
      const tail = fn.body.statements.at(-1);
      if (tail && ts.isExpressionStatement(tail)) outcomes.push(tail.expression);
    } else outcomes.push(fn.body);
    const refuses = outcomes.length > 0 && outcomes.every(outcome => alwaysRefuses(outcome));
    activeHelpers.delete(fn);
    helperResults.set(fn, refuses);
    return refuses;
  }
  function inspect(expression) {
    if (!expression || inspected.has(expression)) return;
    inspected.add(expression);
    if (ts.isIdentifier(expression)) return inspect(localInitializer(expression));
    if (ts.isParenthesizedExpression(expression)) return inspect(expression.expression);
    if (ts.isConditionalExpression(expression)) {
      inspect(expression.whenTrue);
      inspect(expression.whenFalse);
      return;
    }
    if (ts.isCallExpression(expression) && refusalHelper(expression)) {
      helperCalls.add(expression);
      matches.add(expression);
    }
    walkExpression(expression, node => {
      if (visibleRefusal(node)) matches.add(ts.isPropertyAssignment(node) ? node.parent : node);
    });
  }
  function terminal(node) {
    // Nested guards and functions have their own conditions.
    if (ts.isBlock(node)) node.statements.forEach(terminal);
    else if (ts.isReturnStatement(node) || ts.isThrowStatement(node) || ts.isExpressionStatement(node))
      inspect(node.expression);
    else if (ts.isExpressionNode(node)) inspect(node);
  }
  arms.forEach(terminal);
  for (const match of matches)
    for (let parent = match.parent; parent; parent = parent.parent) if (matches.has(parent)) matches.delete(parent);
  return { rejections: matches, helperCalls };
}

const noMatch = node =>
  !node ||
  node.kind === ts.SyntaxKind.NullKeyword ||
  ts.isVoidExpression(node) ||
  (ts.isIdentifier(node) && node.text === 'undefined');

function selectorReturns(fn) {
  const returns = [];
  function collect(node) {
    if (node && ts.isConditionalExpression(node)) {
      collect(node.whenTrue);
      collect(node.whenFalse);
    } else {
      returns.push(node);
    }
  }
  if (ts.isBlock(fn.body)) {
    walkExpression(fn.body, node => {
      if (ts.isReturnStatement(node)) collect(node.expression);
    });
  } else collect(fn.body);
  return returns;
}

function selectorRefusals(node, condition, arms, selectors, consumed) {
  let fn = node.parent;
  while (fn && !ts.isFunctionLike(fn)) fn = fn.parent;
  if (!fn?.body) return [];
  if (!selectors.has(fn)) {
    const returns = selectorReturns(fn);
    selectors.set(fn, returns.some(noMatch) && returns.some(value => !noMatch(value)));
  }
  if (!selectors.get(fn)) return [];
  const name =
    fn.name?.getText() ??
    (ts.isVariableDeclaration(fn.parent) || ts.isPropertyAssignment(fn.parent) ? fn.parent.name.getText() : '');
  const namedSelector = /^(?:select|choose|pick|find|match|resolve)/i.test(name);
  if (!consumed.has(fn) && !namedSelector && (!ts.isFunctionDeclaration(fn) || !membershipLookups(condition).size))
    return [];
  return arms.flatMap(arm => {
    if (ts.isBlock(arm)) arm = arm.statements.at(-1);
    if (!arm) return [];
    return (ts.isReturnStatement(arm) ? noMatch(arm.expression) : ts.isExpressionNode(arm) && noMatch(arm))
      ? [arm]
      : [];
  });
}

// Find calls supplying a value checked by a denial guard, including an alias
// of the result. Don't chase calls on that value (e.g. it.authorize()).
function guardedCallables(condition) {
  const functions = new Set();
  const seen = new Set();
  function trace(expression) {
    if (seen.has(expression)) return;
    seen.add(expression);
    walkExpression(expression, node => {
      if (ts.isCallExpression(node)) {
        const fn = localCallable(node.expression);
        if (fn?.body) functions.add(fn);
      } else if (
        ts.isIdentifier(node) &&
        !ts.isCallExpression(node.parent) &&
        !ts.isPropertyAccessExpression(node.parent) &&
        !ts.isElementAccessExpression(node.parent)
      ) {
        const value = localInitializer(node);
        if (value) trace(value);
      }
    });
  }
  trace(condition);
  return functions;
}

function followingRejection(statement) {
  if (statement.elseStatement) return [];
  const arm = statement.thenStatement;
  const last = ts.isBlock(arm) ? arm.statements.at(-1) : arm;
  if (!last || (!ts.isReturnStatement(last) && !ts.isThrowStatement(last))) return [];
  const siblings = statement.parent.statements;
  const next = siblings?.[siblings.indexOf(statement) + 1];
  return next && (ts.isReturnStatement(next) || ts.isThrowStatement(next)) ? [next] : [];
}

function* productionSources() {
  for (const dir of ['actions', 'fastify', 'integrations'])
    for (const file of sourceFiles(`${core}/src/http/${dir}`))
      yield [file, readFileSync(path.join(root, file), 'utf8')];
}

function decisions(sources = productionSources(), visitSite) {
  const found = [];
  const seen = new Map();
  for (const [file, contents] of sources) {
    const source = ts.createSourceFile(file, contents, ts.ScriptTarget.Latest, true);
    function add(node, kind, condition) {
      const seed = `${file}\0${kind}\0${condition}`;
      const ordinal = (seen.get(seed) ?? 0) + 1;
      seen.set(seed, ordinal);
      const id = createHash('sha256').update(`${seed}\0${ordinal}`).digest('hex').slice(0, 16);
      const { line } = source.getLineAndCharacterOfPosition(node.getStart(source));
      const lookup =
        kind === 'membership lookup' ||
        (kind === 'predicate' && ts.isCallExpression(node) && callName(node.expression) === 'find') ||
        (kind === 'branch' &&
          /(?:logoutOrigins\?\.includes|loaded\?\.metaMetadata.*brandId.*=== brand\.id)/.test(condition)) ||
        (kind === 'branch' && file.endsWith('/configurationReads.ts') && condition === '!form');
      const row = { id, file, line: line + 1, kind, condition, lookup };
      found.push(row);
      visitSite?.(row, node, source, registryLookups.get(node));
    }
    const registryLookups = new Map();
    const registryRejections = new Set();
    const refusalCalls = new Set();
    const selectors = new Map();
    const consumedSelectors = new Set();
    const selectorGuards = [];
    const noMatches = new Set();
    function trackRegistryGuard(condition, branches) {
      const { rejections, helperCalls } = clientRejections(branches, source);
      if (!rejections.size) return false;
      for (const fn of guardedCallables(condition)) consumedSelectors.add(fn);
      const lookups = membershipLookups(condition);
      if (!lookups.size && !helperCalls.size) return false;
      for (const call of helperCalls) refusalCalls.add(call);
      if (lookups.size) {
        for (const lookup of lookups) if (!registryLookups.has(lookup)) registryLookups.set(lookup, condition);
        for (const rejection of rejections) if (!helperCalls.has(rejection)) registryRejections.add(rejection);
      }
      return true;
    }
    function checkBranch(node, condition, branches, fallthrough = []) {
      const text = projectText(condition, source);
      selectorGuards.push([node, condition, branches, text]);
      // Use the immediate effects and still traverse nested conditions separately.
      const effects = branches.map(branch => projectText(branch, source)).join(' ');
      if (
        trackRegistryGuard(condition, [...branches, ...fallthrough]) ||
        credentialFiles.test(file) ||
        (file.endsWith('/fastify/session.ts') && sessionDecision.test(text)) ||
        (file.endsWith('/fastify/staticOwnership.ts') && ownershipDecision.test(text)) ||
        (file.endsWith('/fastify/router.ts') && /requestPathname\(.*\) === undefined/.test(text)) ||
        (file.endsWith('/fastify/policies.ts') && text === 'schema(request)') ||
        policy.test(text) ||
        tenantPredicate.test(text) ||
        denial.test(effects) ||
        policyRejection.test(effects) ||
        scopedTarget.test(effects) ||
        (/\b400\b/.test(effects) && (lexical.test(text) || membership.test(text) || policy.test(effects)))
      )
        add(node, 'branch', text);
    }
    function walk(node) {
      if (ts.isIfStatement(node))
        checkBranch(
          node,
          node.expression,
          node.elseStatement ? [node.thenStatement, node.elseStatement] : [node.thenStatement],
          followingRejection(node)
        );
      else if (ts.isConditionalExpression(node)) checkBranch(node, node.condition, [node.whenTrue, node.whenFalse]);
      else if (
        ts.isCatchClause(node) &&
        credentialFiles.test(file) &&
        node.block.statements.some(s => ts.isReturnStatement(s) && s.expression?.kind === ts.SyntaxKind.NullKeyword)
      )
        add(node, 'credential catch', projectText(node.block, source));
      else if (
        ts.isCaseClause(node) &&
        (policy.test(projectText(node.expression, source)) ||
          node.statements.some(s => denial.test(projectText(s, source))))
      )
        add(node, 'case', projectText(node.expression, source));
      else if (
        ts.isBinaryExpression(node) &&
        [
          ts.SyntaxKind.AmpersandAmpersandToken,
          ts.SyntaxKind.BarBarToken,
          ts.SyntaxKind.QuestionQuestionToken,
        ].includes(node.operatorToken.kind) &&
        !ts.isIfStatement(node.parent) &&
        !ts.isConditionalExpression(node.parent) &&
        !ts.isBinaryExpression(node.parent) &&
        (trackRegistryGuard(node.left, [node.right]) ||
          (ts.isCallExpression(node.right) &&
            (policy.test(projectText(node.left, source)) || denial.test(projectText(node.right, source)))))
      )
        add(node, 'short circuit', projectText(node, source));
      else if (ts.isCallExpression(node)) {
        const name = ts.isPropertyAccessExpression(node.expression)
          ? node.expression.name.text
          : node.expression.getText(source);
        const text = projectText(node, source);
        if (delegated.test(name) || ['filterRelationshipGraph', 'canCreate', 'canEdit'].includes(name))
          add(node, 'policy call', text);
        else if (
          ['filter', 'find', 'some', 'every'].includes(name) &&
          (policy.test(text) || /\b(?:brand|tenant|origin)\b/.test(text))
        )
          add(node, 'predicate', text);
        else if (denialPublishers.has(name) && denial.test(text)) add(node, 'denial response', text);
        else if (
          (redaction.test(text) && ['setProjectedMetadata', 'removeHeader', 'setCookie'].includes(name)) ||
          (name === 'clearCookie' && file.endsWith('/fastify/session.ts'))
        )
          add(node, 'redaction candidate', text);
      } else if (ts.isBinaryExpression(node) && node.operatorToken.kind === ts.SyntaxKind.EqualsToken) {
        const text = projectText(node, source);
        if (redaction.test(text)) add(node, 'redaction candidate', text);
      } else if (ts.isDeleteExpression(node)) {
        const text = projectText(node, source);
        if (policy.test(text)) add(node, 'redaction candidate', text);
      } else if (ts.isThrowStatement(node)) {
        const text = projectText(node, source);
        if (
          denial.test(text) ||
          policyRejection.test(text) ||
          scopedTarget.test(text) ||
          (/\b400\b/.test(text) && (policy.test(text) || lexical.test(text)))
        )
          add(node, 'denial throw', text);
      }
      ts.forEachChild(node, walk);
    }
    walk(source);
    for (const [node, condition, branches, text] of selectorGuards) {
      const misses = selectorRefusals(node, condition, branches, selectors, consumedSelectors);
      if (misses.length) {
        add(node, 'selector branch', text);
        for (const miss of misses) noMatches.add(miss);
      }
    }
    for (const lookup of registryLookups.keys()) add(lookup, 'membership lookup', projectText(lookup, source));
    for (const rejection of registryRejections) add(rejection, 'membership rejection', projectText(rejection, source));
    for (const call of refusalCalls) add(call, 'refusal helper call', projectText(call, source));
    for (const miss of noMatches) add(miss, 'selector no match', projectText(miss, source));
  }
  return found;
}

function checkMembershipDiscovery() {
  const samples = [
    ['if (!choices.has(id)) return { status: 404 };', ['choices.has(id)']],
    ['if (id in choices) return dispatch(); return reply.code(404).send();', ['id in choices']],
    ['const item = choices.get(id); if (item === undefined) throw new ClientError(400);', ['choices.get(id)']],
    ['let item; item = choices.get(id); if (!item) return { status: 404 };', ['choices.get(id)']],
    [
      'const item = Object.hasOwn(choices, id) ? choices[id] : undefined; if (!item) return referenceErrors(req, 404, []);',
      ['Object.hasOwn(choices, id)', 'choices[id]'],
    ],
    [
      'if (!Object.prototype.hasOwnProperty.call(choices, id)) { const refusal = { status: 404 }; return refusal; }',
      ['Object.prototype.hasOwnProperty.call(choices, id)'],
    ],
    ['if (choices[id] == null) { reply.code(403).send(); return; }', ['choices[id]']],
    ['return choices.get(id) ?? { statusCode: 404 };', ['choices.get(id)']],
  ];
  for (const [body, lookups] of samples) {
    const rows = decisions([['scratch.ts', `function run() { ${body} }`]]);
    assert.deepEqual(
      rows.filter(row => row.kind === 'membership lookup').map(row => row.condition),
      lookups,
      body
    );
    assert.equal(rows.filter(row => row.kind === 'membership rejection').length, 1, body);
    assert(
      rows.some(row => ['branch', 'short circuit'].includes(row.kind)),
      body
    );
  }
  const helper = decisions([
    [
      'scratch.ts',
      `function run() {
    const ordinary = ['known'];
    function status() { return reply.code(404).send(); }
    const refuse = () => status();
    if (!ordinary.includes(id)) return refuse();
    return dispatch();
  }`,
    ],
  ]);
  assert(helper.some(row => row.kind === 'membership lookup' && row.condition === 'ordinary.includes(id)'));
  assert(helper.some(row => row.kind === 'refusal helper call' && row.condition === 'refuse()'));
  const sent = decisions([
    [
      'scratch.ts',
      `function run() {
    function sendMissing() { reply.code(404).send(); }
    if (!ordinary.includes(id)) { sendMissing(); return; }
  }`,
    ],
  ]);
  assert(sent.some(row => row.kind === 'refusal helper call' && row.condition === 'sendMissing()'));
  const selectors = decisions([
    [
      'scratch.ts',
      `function run() {
    function resolve() { if (!options.has(id)) return; return options.get(id); }
    const choose = () => options.has(id) ? options.get(id) : undefined;
    const evaluate = () => valid ? value : undefined;
    const selected = evaluate();
    if (!selected) return { status: 404 };
    return selected;
  }`,
    ],
  ]);
  assert.deepEqual(
    selectors.filter(row => row.kind === 'selector branch').map(row => row.condition),
    ['!options.has(id)', 'options.has(id)', 'valid']
  );
  assert.equal(selectors.filter(row => row.kind === 'selector no match').length, 3);
  for (const body of [
    'if (!choices.has(id)) return { status: 200 };',
    'if (!choices.has(id)) return () => ({ status: 404 });',
    'if (!req.headers[key]) return { status: 400 };',
    'const maybe = () => { if (invalid) return { status: 404 }; }; if (!choices.has(id)) return maybe();',
  ])
    assert(
      !decisions([['scratch.ts', `function run() { ${body} }`]]).some(row => row.kind.startsWith('membership ')),
      body
    );
}

function sourceDigests() {
  return Object.fromEntries(
    ['actions', 'fastify', 'integrations']
      .flatMap(dir => [...sourceFiles(`${core}/src/http/${dir}`)])
      .map(file => [
        file,
        createHash('sha256')
          .update(readFileSync(path.join(root, file)))
          .digest('hex'),
      ])
  );
}

function escape(value) {
  return String(value).replace(/\|/g, '\\|').replace(/`/g, '&#96;');
}

function mappedWitnesses(entry) {
  return [...(entry.tests ?? []), ...Object.values(entry.operatorTests ?? {}).flat()];
}

function receiptErrors(key, { operations, observedRequestIds }) {
  if (!Array.isArray(operations) || !operations.length) return [`No correlated HTTP requests for ${key}`];
  if (!Array.isArray(observedRequestIds)) return [`Missing observer receipt list for ${key}`];
  const ids = new Set(operations.map(operation => operation.id));
  const observed = new Set(observedRequestIds);
  if (
    ids.size !== operations.length ||
    [...ids].some(id => typeof id !== 'string' || !id) ||
    [...observed].some(id => !ids.has(id))
  )
    return [`Invalid authorization request correlation for ${key}`];
  const incomplete = operations.find(
    operation => typeof operation.method !== 'string' || !Number.isInteger(operation.status)
  );
  if (incomplete)
    return [`Incomplete HTTP result for ${key}: ${incomplete.method} ${incomplete.path} (${incomplete.id})`];
  return operations
    .filter(operation => requiresEffectObservation(operation) && !observed.has(operation.id))
    .map(
      operation =>
        `Missing shared denial effect assertion for ${key}: ${operation.method} ${operation.path} ${operation.status} (${operation.id})`
    );
}

function checkEffectCorrelation() {
  const operations = [
    { id: 'safe-read', method: 'GET', path: '/records', status: 403 },
    { id: 'denied-write', method: 'DELETE', path: '/records/example', status: 403 },
    { id: 'denied-upgrade', method: 'GET', path: '/socket', upgrade: true, status: 403 },
    { id: 'denied-handshake', method: 'GET', path: '/socket', socketHandshake: true, status: 403 },
    { id: 'declared-effect', method: 'HEAD', path: '/extension', sideEffecting: true, status: 400 },
    { id: 'success', method: 'POST', path: '/records', status: 200 },
  ];
  const needed = ['denied-write', 'denied-upgrade', 'denied-handshake', 'declared-effect'];
  assert.deepEqual(receiptErrors('fixture', { operations, observedRequestIds: needed }), []);
  assert.match(
    receiptErrors('fixture', {
      operations: [...operations, { id: 'lost', method: 'POST', path: '/records' }],
      observedRequestIds: needed,
    })[0],
    /Incomplete HTTP result.*\(lost\)$/
  );
  for (const absent of needed) {
    const observedRequestIds = [...needed.filter(id => id !== absent), 'safe-read', 'success'];
    const errors = receiptErrors('fixture', { operations, observedRequestIds });
    assert.equal(errors.length, 1);
    assert(errors[0].endsWith(`(${absent})`));
  }
}

function productionPasses() {
  const args = process.argv.filter(arg => arg.startsWith('--mocha-report='));
  if (!args.length) throw new Error('Pass --mocha-report=<path> for each completed production Mocha run.');
  const passes = new Map();
  for (const arg of args) {
    const filename = path.resolve(arg.slice('--mocha-report='.length));
    const report = JSON.parse(readFileSync(filename, 'utf8'));
    if (report.stats?.failures !== 0 || !Array.isArray(report.passes) || !report.passes.length)
      throw new Error(`Production test report is empty, incomplete, or has failures: ${filename}`);
    for (const test of report.passes) {
      const file = path.relative(root, path.resolve(root, test.file));
      const key = `${file}:${test.fullTitle ?? test.title}`;
      const invocations = passes.get(key) ?? [];
      invocations.push(test);
      passes.set(key, invocations);
    }
  }
  return passes;
}

function main() {
  checkMembershipDiscovery();
  checkEffectCorrelation();
  if (process.argv.includes('--check-membership-discovery')) {
    console.log('Registry discovery controls passed.');
    return;
  }
  const rows = decisions();
  if (process.argv.includes('--list')) {
    process.stdout.write(JSON.stringify({ sources: sourceDigests(), decisions: rows }, null, 2) + '\n');
    return;
  }
  const { sources, decisions: mapping } = JSON.parse(readFileSync(path.join(root, mappingPath), 'utf8'));
  if (process.argv.includes('--missing-test-files')) {
    const passes = productionPasses();
    const missing = new Set();
    for (const entry of Object.values(mapping))
      for (const test of mappedWitnesses(entry)) {
        if (!/^packages\/redbox-core\/test\/(?:http\/fastify|application)\/[\w-]+\.test\.ts$/.test(test.file))
          throw new Error(`Unexpected witness path: ${test.file}`);
        if (!passes.has(`${test.file}:${test.title}`)) missing.add(test.file.slice(core.length + 1));
      }
    for (const file of [...missing].sort()) console.log(file);
    return;
  }
  const known = new Set(rows.map(row => row.id));
  const stale = Object.keys(mapping).filter(id => !known.has(id));
  const errors = stale.map(id => `Stale decision: ${id}`);
  const live = sourceDigests();
  // Lexical discovery assists review. Whole-file digests force re-review even
  // when a new or renamed decision uses none of the discovery vocabulary.
  for (const file of new Set([...Object.keys(live), ...Object.keys(sources)]))
    if (live[file] !== sources[file]) errors.push(`Source requires decision review: ${file}`);
  const references = new Set();
  const report = [
    '# FM-043 HTTP authorization decision inventory',
    '',
    'Generated by `node support/tooling/fastify-retirement/authorization-coverage.cjs --write`.',
    'Candidate discovery is intentionally broad. Non-policy entries require an explicit review rationale.',
    'Registry guards track membership expressions, the consuming condition, and client refusals, including local helpers.',
    'Selector rows expose early no-match outcomes separately from the downstream HTTP response.',
    'An unmapped candidate is a failure; its presence does not mean a denial branch has been proved.',
    'For mapped rows, the witness must exercise the branch itself; a denial by an earlier guard does not qualify.',
    'Denied mutating HTTP operations and socket handshakes require an observer receipt for the same request.',
    'The audit also pins the exact source files so even edits outside the discovery vocabulary require review.',
    '',
    '| Decision | Kind | Condition/effect | Production-host Mocha test or non-policy rationale |',
    '| --- | --- | --- | --- |',
  ];
  let mapped = 0;
  let excluded = 0;
  for (const { id, file, line, kind, condition, lookup } of rows) {
    const entry = Object.hasOwn(mapping, id) ? mapping[id] : undefined;
    let detail = '**UNMAPPED**';
    if (entry?.outOfScope?.trim() && !entry.tests) {
      detail = escape(entry.outOfScope);
      excluded++;
    } else if (entry?.tests?.length && !entry.outOfScope) {
      if (lookup && ['accept-all', 'reject-all'].some(direction => !entry.operatorTests?.[direction]?.length))
        errors.push(`Missing directional lookup witnesses for ${id}`);
      const cases = [];
      for (const test of mappedWitnesses(entry)) {
        if (
          !/^packages\/redbox-core\/test\/(?:http\/fastify|application)\/[\w-]+\.test\.ts$/.test(test.file) ||
          !statSync(path.join(root, test.file), { throwIfNoEntry: false })?.isFile() ||
          !test.title?.trim() ||
          !test.asserts?.trim()
        ) {
          errors.push(`Invalid exact test mapping for ${id}`);
          continue;
        }
        const key = `${test.file}:${test.title}`;
        references.add(key);
        const description = '`' + escape(test.file) + '`: ' + escape(test.title) + ' — ' + escape(test.asserts);
        if (!cases.includes(description)) cases.push(description);
      }
      if (cases.length) {
        detail = cases.join('<br>');
        mapped++;
      }
    }
    if (detail === '**UNMAPPED**') errors.push(`Unmapped: ${file}:${line} ${id} ${condition}`);
    report.push(
      `| [${file.split('/').slice(-2).join('/')}:${line}](../../../../${file}#L${line}) \`${id}\` | ${kind} | \`${escape(condition)}\` | ${detail} |`
    );
  }
  if (references.size) {
    try {
      const passed = productionPasses();
      for (const key of references) {
        const invocations = passed.get(key);
        if (!invocations) {
          errors.push(`No passing production-host test: ${key}`);
          continue;
        }
        for (const invocation of invocations) errors.push(...receiptErrors(key, invocation));
      }
    } catch (error) {
      errors.push(error.message);
    }
  }
  const markdown = report.join('\n') + '\n';
  if (process.argv.includes('--write')) writeFileSync(path.join(root, inventoryPath), markdown);
  else if (readFileSync(path.join(root, inventoryPath), 'utf8') !== markdown)
    errors.push(`Stale evidence table: regenerate ${inventoryPath}`);
  for (const error of errors) console.error(error);
  console.log(
    `${rows.length} candidates; ${mapped} mapped; ${excluded} out of scope; ${rows.length - mapped - excluded} unmapped; ${errors.length} audit errors`
  );
  if (errors.length) process.exitCode = 1;
}

if (require.main === module) main();
module.exports = { decisions, sourceDigests };
