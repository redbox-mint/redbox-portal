/* Source-derived raw boundary inventory. Deliberately independent of runtime
 * registration: early errors and upgrades have no route registration. */
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const root = path.resolve(__dirname, '../../../..');
const ts = require(path.join(root, 'node_modules/typescript'));
const base = 'packages/redbox-core/';
const sha = value => crypto.createHash('sha256').update(value).digest('hex');
const hooks = ['onRequest', 'preHandler', 'onSend', 'onResponse', 'onError'];
const test = name => base + 'test/http/' + name;
const streamTests = [test('fastify/DatastreamDifferentialMongo.test.ts'), test('fastify/ReadStreamsMongo.test.ts')];
const uploadTests = [test('fastify/UploadDifferentialMongo.test.ts')];
const socketTests = [test('fastify/rawSocketMongo.test.ts'), test('fastify/RawShutdownMongo.test.ts')];
const companionTests = [
  test('fastify/companionMongo.test.ts'),
  test('CompanionLifecycleProbe.test.ts'),
];
// These are concern restorations, not an inventory of call sites. Every site
// below is discovered by the AST walk, including aliases and computed writes.
const profiles = {
  stream: {
    owner: 'Host request lease + sendReadStream; storage owns source disposal',
    bypassed: [],
    restoration: {
      hooks:
        'Normal reply.send retains all native hooks. Before-byte faults enter the opaque raw error writer; after commit aborts, EOF disposal failures preserve the representation.',
      session: 'nativeSessionSend runs before Fastify consumes the qualified output.',
      observation:
        'Native onResponse records one completion; fixed redacted HTTP_STREAM_FAILED / HTTP_STREAM_DISPOSAL_FAILED records one fault. Post-EOF disposal is not a second HTTP error.',
      drain:
        'Await response AND finished(source/output), including iterator/pipeline settlement and asynchronous destroy. Argument/return handoffs keep the same producer lease; request and persistence drains retain disposal.',
      security: 'Domain/route guards and prepared representation/security headers precede stream publication.',
      upgrade: 'Not an upgrade path.',
    },
    tests: streamTests,
  },
  tus: {
    owner: 'portal-raw-http ResumableUploads; host owns listener and request lease',
    bypassed: ['onSend', 'onError'],
    restoration: {
      hooks:
        'Hijack occurs after onRequest/preHandler; native onResponse still runs. Raw provider exceptions do not re-enter Fastify onError.',
      session: 'commitNativeSessionForRawReply awaited before hijack and prepared headers/cookies copied.',
      observation:
        'One native onResponse completion/status; raw exceptions use writeHttpError fixed diagnostic; protocol denials remain TUS responses. Post-response audit remains awaited.',
      drain:
        'linkHttpRequestLifetime + trackHttpRequestWork join the protocol, provider, upload-part async iteration, finalization and audit. Returning/handing off a stream never releases that lease. Terminal callback adapter settles destroyed-response publication only.',
      security:
        'Native actor, brand/edit, CSRF/Origin and live validation before protocol; protocol version/offset/limit checks retained.',
      upgrade: 'Not an upgrade path.',
    },
    tests: uploadTests.concat(test('fastify/RawObservationsMongo.test.ts')),
  },
  multipart: {
    owner: 'portal-raw-http StreamingMultipart + host request lease',
    bypassed: [],
    restoration: {
      hooks:
        'Only body consumption is handed off. All native request/send/response hooks remain; complete fields precede beforeAction.',
      session: 'Ordinary nativeSessionSend before response publication.',
      observation:
        'Native response/error hooks; guarded safe upload errors. No duplicate host or provider response writer.',
      drain:
        'receiveMultipart tracks parse/provider/finalizer work, including the Transform async iterator and its failure/cancellation settlement. Staged lease joins cleanup onSend and action/hook finally; failed deletion remains owned for stop retry.',
      security:
        'Scoped raw parser preserves unread body; route guards before bytes, full declaration validation after staging; live domain input after hooks.',
      upgrade: 'Not an upgrade path.',
    },
    tests: uploadTests.concat(test('StreamingMultipart.test.ts')),
  },
  companion: {
    owner: 'portal-raw-http CompanionUploads; host owns server/pools',
    bypassed: ['onSend', 'onError'],
    restoration: {
      hooks:
        'HTTP handoff follows native onRequest/preHandler; native onResponse remains. Provider callback errors use shared error boundary.',
      session:
        'First-write barrier awaits commitNativeSessionForCompanion after provider session mutations, merges cookies, restores callbacks/backpressure.',
      observation:
        'Native HTTP completion observation once; bounded provider logger and shared opaque error writer. Transfer terminal events and tracked sockets observed by adapter; optional vendor metrics explicitly configured.',
      drain:
        'Aliased request lease, retained publication/callback/transfer work and module drain; idle sockets close after work, deadline closes grants/sockets but retains executing callbacks/session work.',
      security:
        'Native auth/policies/CSRF/canonical Origin; prepared headers + canonical popup COOP; Map transfer token and bounded callback token guards for upgrades.',
      upgrade:
        'ownUpgrade selects Companion on the sole host server. EventEmitter bridge never listens; listener removal leaves other owner intact.',
    },
    tests: companionTests,
  },
  engine: {
    owner: 'portal-raw-http ProgressSockets, borrowed host server',
    bypassed: hooks,
    restoration: {
      hooks:
        'Socket.IO serves client files/Engine.IO before Fastify. These are protocol transports, outside native route hooks, including upgrades. The borrowed request dispatcher restores native hooks for its ordinary Fastify fallback; only selected protocol traffic bypasses them.',
      session:
        'No native session mutation. One-use 30s grant issued by guarded native HTTP action; socket auth re-resolves the stored credential/actor/brand, never saves session data.',
      observation:
        'Engine.IO owns protocol status/error packets and client/connection accounting; ProgressSockets retains auth/emit promises and connections/upgraded close. No native route metric is emitted for bypassed requests. Production native route observers are unconfigured; provider protocol observations are separate.',
      drain:
        'Server-level host admission before third-party listeners; quiesce clears grants, drain awaits accepted auth/emits; engine close joins real TCP upgrade close, detaches its listeners without closing borrowed server.',
      security:
        'Canonical Origin on every sid polling/upgrade, grant auth/fresh identity/room authorization. Public client script headers remain vendor-owned.',
      upgrade: 'Single ownUpgrade dispatcher; Engine.IO raw prefix retained, unknown/ambiguous upgrades terminate.',
    },
    tests: socketTests.concat(test('fastify/ProgressDifferentialMongo.test.ts'), test('ProgressSockets.test.ts')),
  },
  error: {
    owner: 'Host single opaque error writer',
    bypassed: ['onSend', 'onError'],
    restoration: {
      hooks:
        'Terminal faults deliberately bypass serializers/send hooks and do not manufacture recursive onError. Normal pre-error hooks may already have run; malformed requests/upgrades may precede them. Native onResponse remains for constructed HTTP replies.',
      session:
        'Opaque failure publishes no success cookies or failed session mutation. Accepted session operations remain request-owned; deliberate public denials use ordinary send/session hooks.',
      observation:
        'Fixed redacted HTTP_REQUEST_FAILED diagnostic; safe socket refusal contains no exception text. Native onResponse once where a request exists; no synthetic route metrics for parser-level socket errors.',
      drain:
        'Raw end/destroy signals the same response lifetime; existing asynchronous handler/session/logger work is still retained independently.',
      security:
        'Safe status/body/header allowlist, HEAD/committed-response handling; no second send owner or untrusted error headers.',
      upgrade: 'Socket target is the shared terminate path for malformed/denied/unknown upgrade failures.',
    },
    tests: [
      test('fastify/securityFailures.test.ts'),
      test('fastify/loggingSurvival.test.ts'),
      test('fastify/FastifyClose.test.ts'),
    ],
  },
  host: {
    owner: 'FastifyHost / requestOwnership; sole listener and transport-close attempt',
    bypassed: [],
    restoration: {
      hooks:
        'Root admission runs before every raw listener. Sealed callback/producer qualification retains accepted work even after hijack/response/disconnect.',
      session: 'Session and callback work retained by shared request lifetime/store owner.',
      observation:
        'Shared error boundary + redacting logger; asynchronous observations and sink work remain owned. Hooks cannot replace terminal responses.',
      drain:
        'Stop intent closes admission, single transport-close attempt, request drain plus dependency-ordered application cleanup; deadline retains ownership, explicit retry, idempotent success.',
      security: 'Capability seal rejects unqualified stream/callback handoffs; no new raw registration capability.',
      upgrade: 'Server emit admission precedes sole owner dispatcher; close detaches integration listeners.',
    },
    tests: [test('fastify/FastifyClose.test.ts'), test('fastify/FastifyHost.test.ts'), ...socketTests],
  },
};
const assignments = {
  'http/fastify/readStreams.ts': 'stream',
  'http/fastify/readActions.ts': 'stream',
  'http/fastify/pages.ts': 'stream',
  'http/fastify/assets.ts': 'stream',
  'http/fastify/jsonOutput.ts': 'multipart',
  'http/fastify/datastreamReads.ts': 'stream',
  'http/actions/datastreamReads.ts': 'stream',
  'http/fastify/resumableUploads.ts': 'tus',
  'http/actions/resumableUploads.ts': 'tus',
  'http/fastify/rawMultipart.ts': 'multipart',
  'http/integrations/multipart.ts': 'multipart',
  'http/integrations/companion/fastify.ts': 'companion',
  'http/integrations/companion/uploads.ts': 'companion',
  'http/integrations/progressSockets.ts': 'engine',
  'http/fastify/errorBoundary.ts': 'error',
  'http/fastify/FastifyHost.ts': 'host',
  'http/fastify/requestOwnership.ts': 'host',
  'http/integrations/upgrades.ts': 'host',
  'middleware/requestLifetime.ts': 'host',
  'http/fastify/parsers.ts': 'host',
  'http/fastify/router.ts': 'upgrade',
  'http/fastify/routes.ts': 'host',
  'application/portal/pageHttpPlan.ts': 'stream',
};
profiles.companionUpgrade = {
  ...profiles.companion,
  bypassed: hooks,
  restoration: {
    ...profiles.companion.restoration,
    hooks: 'WebSocket upgrades never enter Fastify request hooks; host emit admission precedes the one dispatcher.',
    session:
      'No session writes on upgrades. Previously admitted transfer/callback token plus canonical Origin authorizes this transport; executing HTTP/session work retains its separate lease.',
    observation:
      'Adapter observes socket close/error and transfer terminal events; bounded vendor logger/optional protocol metrics. No synthetic native route completion for an upgrade.',
  },
};
profiles.upgrade = {
  ...profiles.host,
  bypassed: hooks,
  restoration: {
    ...profiles.host.restoration,
    hooks: 'Node upgrade/client-error dispatch precedes Fastify request creation; no native route hooks can run.',
    session: 'No session mutation or success cookie publication; protocol owner authenticates its grants.',
    observation:
      'Safe terminate path refuses missing/ambiguous owner or malformed protocol with no provider exception disclosure. Protocol owner observes admitted sockets; no native HTTP route metric exists.',
  },
};
profiles.parser = {
  ...profiles.host,
  restoration: {
    ...profiles.host.restoration,
    hooks:
      'Native preParsing consumes bounded JSON/form input on all methods; multipart/TUS are scoped unread handoffs. The remaining hooks run in their normal order.',
    session: 'Parsing precedes session loading; parser failures publish no session mutation/cookie.',
    observation:
      'Native parser failures enter the common safe error boundary and response observation; decoder errors are sanitized.',
    drain:
      'Tracked preParsing awaits the incoming iterator; finally unpipes/destroys the decoder and removes abort/error listeners. On bounded refusal the remaining input is resumed, not pre-consumed by another owner.',
  },
  tests: [
    test('fastify/securityBodies.test.ts'),
    test('fastify/securityFailures.test.ts'),
    test('fastify/RawShutdownMongo.test.ts'),
  ],
};
assignments['http/fastify/parsers.ts'] = 'parser';
// Resolve actual declarations from the package tsconfig. Transport discovery
// has no method-name filter: every operation on a transport (or a value reached
// through it) is considered, including aliases, computed members and nested calls.
const sourceRoot = path.join(root, base, 'src');
const fixtureDirectory = path.join(root, base, 'test/http/fastify/fixtures/raw-boundaries');
const anchorPath = path.join(sourceRoot, '.fm036-type-anchors.ts');
const anchorSource = `
import type { IncomingMessage, ServerResponse, Server } from 'node:http';
import type { Socket } from 'node:net';
import type { Duplex, Readable, Writable } from 'node:stream';
import type { EventEmitter } from 'node:events';
import type * as WebStreams from 'node:stream/web';
import type { FastifyRequest, FastifyReply } from 'fastify';
type FM036Transports = [IncomingMessage, ServerResponse, Socket, Duplex, Server,
 EventEmitter, Readable, Writable, ReadableStream, FastifyRequest, FastifyReply,
 AbortController, AbortSignal, WritableStream, TransformStream,
 ReadableStreamDefaultReader, ReadableStreamBYOBReader, WritableStreamDefaultWriter,
 WebStreams.ReadableStream, WebStreams.WritableStream, WebStreams.TransformStream,
 WebStreams.ReadableStreamDefaultReader, WebStreams.ReadableStreamBYOBReader,
 WebStreams.WritableStreamDefaultWriter];
const FM036Globals = [setTimeout, setInterval, setImmediate, clearTimeout, clearInterval, clearImmediate, AbortSignal.timeout];
`;
// These are structural type members, never an allowlist of operations to scan.
// Once a receiver qualifies, every method/property operation remains visible.
const structuralMembers = [
  'on',
  'once',
  'off',
  'addListener',
  'prependListener',
  'prependOnceListener',
  'removeListener',
  'removeAllListeners',
  'emit',
  'pipe',
  'unpipe',
  'destroy',
  'read',
  'write',
  'end',
];
const discoveryContract = {
  structuralScope: [base + 'src/http/**', base + 'src/storage/**'],
  supplementalScope: 'Canonical transport types and timer bindings throughout every core src TypeScript source',
  receiverTypeFamilies: [
    'Node http.IncomingMessage, http.ServerResponse and http.Server',
    'Node net.Socket and stream.Duplex',
    'NodeJS.ReadableStream and NodeJS.WritableStream interfaces',
    'Node stream.Readable, Writable, Duplex, Transform and PassThrough',
    'Node events.EventEmitter and structural emitter interfaces, including Companion EmitterLike',
    'Structural stream interfaces with any callable stream/emitter member',
    'Web ReadableStream/WritableStream/TransformStream, readers/writers/controllers (DOM globals and node:stream/web declarations)',
    'FastifyRequest/FastifyReply, their raw transports and reached descendants',
    'AbortController and AbortSignal',
    'Inherited/generic/constrained/union/intersection types, type/import aliases, Promise/PromiseLike/Awaited wrappers and reached property/call descendants',
  ],
  structuralCallableMembers: structuralMembers,
  operations:
    'All receiver calls/references/writes/constructions; async/sync iteration, yield delegation, independent argument handoffs and explicit/implicit returns; nested callees always visited',
  consumption:
    'for await / for of; Symbol.asyncIterator / iterator and next/return; pipeline / finished (callback and promise); Readable.from / compose / addAbortSignal; events.once / on; pipe source AND targets; every local/foreign function or constructor argument; explicit/arrow/aggregate/asserted/awaited returns; yield/yield*, spread and await using; AbortController/Signal and options wiring',
  exclusions:
    'Structural-only families outside HTTP/storage roots remain outside structural scope. Dynamic eval, any/unknown without typed/lexical origin, unconstrained generics and unresolved conditional/indexed types cannot reveal a concrete receiver statically. No valid resolved typed consumption form is excluded.',
  typeResolution:
    'Each canonical/structural classification follows checker.getAwaitedType, aliases, union/intersection members, generic constraints and inheritance. Web families match declaration file plus name in TypeScript lib.dom/lib.webworker and @types/node/stream/web.d.ts, including imported/namespace aliases.',
  timers: 'Canonical set/clear Timeout, Interval and Immediate bindings, aliases and AbortSignal.timeout',
  unclassified: 'Generation and --check both fail before publishing an inventory',
};
function unwrap(node) {
  while (
    node &&
    (ts.isParenthesizedExpression(node) ||
      ts.isAsExpression(node) ||
      ts.isNonNullExpression(node) ||
      ts.isTypeAssertionExpression(node) ||
      ts.isAwaitExpression(node))
  )
    node = node.expression;
  return node;
}
function member(node) {
  node = unwrap(node);
  if (node && ts.isPropertyAccessExpression(node)) return { name: node.name.text, receiver: unwrap(node.expression) };
  if (node && ts.isElementAccessExpression(node))
    return {
      name: ts.isStringLiteralLike(node.argumentExpression) ? node.argumentExpression.text : '<computed>',
      receiver: unwrap(node.expression),
    };
  return { name: node && ts.isIdentifier(node) ? node.text : '', receiver: undefined };
}
function context(node, ast) {
  const scopes = [],
    iterations = [];
  let child = node,
    socketTarget = false;
  for (let parent = node.parent; parent; parent = parent.parent) {
    if (
      (ts.isMethodDeclaration(parent) ||
        ts.isPropertyDeclaration(parent) ||
        ts.isFunctionDeclaration(parent) ||
        ts.isClassDeclaration(parent)) &&
      parent.name
    )
      scopes.unshift(parent.name.getText(ast));
    if (ts.isForOfStatement(parent)) iterations.unshift(parent.expression.getText(ast));
    if (
      ts.isIfStatement(parent) &&
      parent.thenStatement === child &&
      ts.isBinaryExpression(parent.expression) &&
      parent.expression.operatorToken.kind === ts.SyntaxKind.InKeyword &&
      ts.isStringLiteral(parent.expression.left) &&
      parent.expression.left.text === 'socket' &&
      ts.isIdentifier(parent.expression.right) &&
      parent.expression.right.text === 'target'
    )
      socketTarget = true;
    child = parent;
  }
  return { scopes, iterations, ...(socketTarget ? { socketTarget: true } : {}) };
}
function typedProject(sources) {
  const configPath = path.join(root, base, 'tsconfig.json');
  const read = ts.readConfigFile(configPath, ts.sys.readFile);
  if (read.error) throw new Error(ts.flattenDiagnosticMessageText(read.error.messageText, '\n'));
  const config = ts.parseJsonConfigFileContent(read.config, ts.sys, path.dirname(configPath), undefined, configPath);
  if (config.errors.length)
    throw new Error(
      ts.formatDiagnostics(config.errors, {
        getCanonicalFileName: x => x,
        getCurrentDirectory: () => root,
        getNewLine: () => '\n',
      })
    );
  const host = ts.createCompilerHost(config.options, true);
  host.getCurrentDirectory = () => root;
  const readFile = host.readFile.bind(host),
    exists = host.fileExists.bind(host);
  host.readFile = file => sources.get(path.resolve(file)) ?? readFile(file);
  host.fileExists = file => sources.has(path.resolve(file)) || exists(file);
  const program = ts.createProgram({
    rootNames: [...new Set([...config.fileNames, ...sources.keys()])],
    options: config.options,
    host,
  });
  const checker = program.getTypeChecker();
  const anchor = program.getSourceFile(anchorPath);
  const roots = anchor.statements.find(node => ts.isTypeAliasDeclaration(node));
  const rootTypes = roots.type.elements.map(node => checker.getTypeFromTypeNode(node));
  for (let index = 0; index < rootTypes.length; index++)
    if (!rootTypes[index].getSymbol())
      throw new Error('Unresolved canonical transport type: ' + roots.type.elements[index].getText(anchor));
  const rootSymbols = new Set(rootTypes.map(type => type.getSymbol()));
  const canonical = symbol =>
    symbol && (symbol.flags & ts.SymbolFlags.Alias ? checker.getAliasedSymbol(symbol) : symbol);
  const globals = anchor.statements.find(ts.isVariableStatement).declarationList.declarations[0].initializer.elements;
  const globalSymbols = new Set(globals.map(node => canonical(checker.getSymbolAtLocation(node))));
  if (globalSymbols.has(undefined)) throw new Error('Unresolved canonical timer binding');
  // Names identify the resource family only when declared in the pinned DOM or
  // Node Web Streams library. A same-named application interface is not enough.
  const webTypeNames = new Set([
    'ReadableStream',
    'WritableStream',
    'TransformStream',
    'ReadableStreamGenericReader',
    'ReadableStreamDefaultReader',
    'ReadableStreamBYOBReader',
    'WritableStreamDefaultWriter',
    'ReadableByteStreamController',
    'ReadableStreamDefaultController',
    'TransformStreamDefaultController',
    'WritableStreamDefaultController',
    'ReadableStreamBYOBRequest',
    'TextEncoderStream',
    'TextDecoderStream',
  ]);
  function webStreamSymbol(symbol) {
    symbol = canonical(symbol);
    return (symbol?.declarations ?? []).some(declaration => {
      if (!declaration.name || !webTypeNames.has(declaration.name.getText())) return false;
      const file = declaration.getSourceFile().fileName.replaceAll('\\', '/');
      return (
        /\/typescript\/lib\/lib\.(dom|webworker)(\.[^/]*)?\.d\.ts$/.test(file) ||
        /\/@types\/node\/stream\/web\.d\.ts$/.test(file)
      );
    });
  }
  const typeCache = new Map();
  function transportType(type, seen = new Set()) {
    if (!type || seen.has(type)) return false;
    if (typeCache.has(type)) return typeCache.get(type);
    seen.add(type);
    let result =
      rootSymbols.has(type.getSymbol()) ||
      rootSymbols.has(type.target?.getSymbol()) ||
      webStreamSymbol(type.getSymbol()) ||
      webStreamSymbol(type.target?.getSymbol());
    const awaited = checker.getAwaitedType(type);
    if (!result && awaited && awaited !== type) result = transportType(awaited, seen);
    if (!result && type.target && type.target !== type) result = transportType(type.target, seen);
    if (!result && type.isUnionOrIntersection()) result = type.types.some(item => transportType(item, seen));
    if (!result && type.flags & ts.TypeFlags.TypeParameter)
      result = transportType(checker.getBaseConstraintOfType(type), seen);
    if (!result && type.flags & ts.TypeFlags.Object && type.objectFlags & ts.ObjectFlags.ClassOrInterface)
      result = checker.getBaseTypes(type).some(base => transportType(base, seen));
    typeCache.set(type, result);
    return result;
  }
  const structuralCache = new Map();
  function streamEmitterType(type, seen = new Set()) {
    if (!type || seen.has(type)) return false;
    if (structuralCache.has(type)) return structuralCache.get(type);
    seen.add(type);
    const apparent = checker.getApparentType(type);
    let result = structuralMembers.some(name => {
      const property = checker.getPropertyOfType(apparent, name);
      if (!property) return false;
      const declaration = property.valueDeclaration ?? property.declarations?.[0] ?? anchor;
      const memberType = checker.getNonNullableType(checker.getTypeOfSymbolAtLocation(property, declaration));
      return checker.getSignaturesOfType(memberType, ts.SignatureKind.Call).length > 0;
    });
    const awaited = checker.getAwaitedType(type);
    if (!result && awaited && awaited !== type) result = streamEmitterType(awaited, seen);
    if (!result && type.isUnionOrIntersection()) result = type.types.some(item => streamEmitterType(item, seen));
    if (!result && type.flags & ts.TypeFlags.TypeParameter)
      result = streamEmitterType(checker.getBaseConstraintOfType(type), seen);
    structuralCache.set(type, result);
    return result;
  }
  function candidateType(node) {
    const type = checker.getTypeAtLocation(node);
    const relative = path.relative(sourceRoot, node.getSourceFile().fileName);
    const scoped =
      relative.startsWith('http/') || relative.startsWith('storage/') || relative.startsWith('.fm036-fixtures/');
    return transportType(type) || (scoped && streamEmitterType(type));
  }
  const originCache = new Map();
  function origin(node, seen = new Set()) {
    // Await/type assertions can reveal a stream even when the underlying call
    // is Promise<stream> or its original value was unknown. Keep that type.
    const qualified = node && candidateType(node);
    node = unwrap(node);
    if (!node || seen.has(node)) return false;
    if (originCache.has(node)) return originCache.get(node);
    seen.add(node);
    let result = qualified || candidateType(node);
    if (!result && (ts.isPropertyAccessExpression(node) || ts.isElementAccessExpression(node)))
      result = origin(node.expression, seen);
    if (!result && ts.isCallExpression(node)) {
      const receiver = member(node.expression).receiver;
      if (receiver) result = origin(receiver, seen);
      const returned = checker.getTypeAtLocation(node);
      if (!result && !(returned.flags & (ts.TypeFlags.Void | ts.TypeFlags.Undefined | ts.TypeFlags.Never)))
        result = node.arguments.some(argument => origin(argument, seen));
    }
    if (!result && ts.isIdentifier(node)) {
      const symbol = canonical(checker.getSymbolAtLocation(node));
      for (const declaration of symbol?.declarations ?? [])
        if (ts.isVariableDeclaration(declaration) && declaration.initializer && origin(declaration.initializer, seen))
          result = true;
    }
    if (!result && ts.isConditionalExpression(node))
      result = origin(node.whenTrue, seen) || origin(node.whenFalse, seen);
    if (!result && ts.isBinaryExpression(node)) result = origin(node.left, seen) || origin(node.right, seen);
    if (!result && (ts.isSpreadElement(node) || ts.isSpreadAssignment(node))) result = origin(node.expression, seen);
    if (!result && ts.isArrayLiteralExpression(node)) result = node.elements.some(item => origin(item, seen));
    if (!result && ts.isObjectLiteralExpression(node))
      result = node.properties.some(item =>
        ts.isPropertyAssignment(item)
          ? origin(item.initializer, seen)
          : ts.isShorthandPropertyAssignment(item)
            ? origin(item.name, seen)
            : ts.isSpreadAssignment(item) && origin(item.expression, seen)
      );
    originCache.set(node, result);
    return result;
  }
  // A wrapper call can consume a receiver without returning a receiver type
  // (events.on returns an iterator; pipeline/finished return completion promises).
  // Keep that handoff visible without pretending its callee owns the caller.
  function consumedValue(node, seen = new Set()) {
    if (node && origin(node)) return true;
    node = unwrap(node);
    if (!node || seen.has(node)) return false;
    seen.add(node);
    if (origin(node)) return true;
    if (ts.isCallExpression(node) || ts.isNewExpression(node))
      return (node.arguments ?? []).some(argument => consumedValue(argument, seen));
    if (ts.isConditionalExpression(node))
      return consumedValue(node.whenTrue, seen) || consumedValue(node.whenFalse, seen);
    if (ts.isArrayLiteralExpression(node)) return node.elements.some(item => consumedValue(item, seen));
    if (ts.isObjectLiteralExpression(node))
      return node.properties.some(item =>
        ts.isPropertyAssignment(item)
          ? consumedValue(item.initializer, seen)
          : ts.isShorthandPropertyAssignment(item)
            ? consumedValue(item.name, seen)
            : ts.isSpreadAssignment(item) && consumedValue(item.expression, seen)
      );
    if (ts.isSpreadElement(node) || ts.isSpreadAssignment(node)) return consumedValue(node.expression, seen);
    return false;
  }
  function globalBinding(node, seen = new Set()) {
    node = unwrap(node);
    if (!node || seen.has(node)) return false;
    seen.add(node);
    const symbol = canonical(checker.getSymbolAtLocation(node));
    if (globalSymbols.has(symbol)) return true;
    return (symbol?.declarations ?? []).some(
      declaration =>
        ts.isVariableDeclaration(declaration) && declaration.initializer && globalBinding(declaration.initializer, seen)
    );
  }
  function sites(file) {
    const ast = program.getSourceFile(file);
    if (!ast) throw new Error('TypeScript did not load source: ' + file);
    const found = [];
    function add(node, kind, receiver, detail = {}) {
      found.push({
        kind,
        line: ast.getLineAndCharacterOfPosition(node.getStart(ast)).line + 1,
        call: node.getText(ast).replace(/\s+/g, ' ').slice(0, 300),
        ...context(node, ast),
        syntaxSha256: sha(node.getText(ast)),
        operation: member(ts.isCallExpression(node) || ts.isNewExpression(node) ? node.expression : node).name,
        ...(receiver
          ? { receiverType: checker.typeToString(checker.getTypeAtLocation(receiver)), receiver: receiver.getText(ast) }
          : {}),
        ...detail,
      });
    }
    function visit(node) {
      if (ts.isCallExpression(node)) {
        const receiver = member(node.expression).receiver;
        if (receiver && origin(receiver)) add(node, 'typed-call', receiver);
        else if (origin(node.expression)) add(node, 'typed-call', node.expression);
        else if (globalBinding(node.expression)) add(node, 'owned-global-call');
        else if (candidateType(node)) add(node, 'typed-construction');
      }
      if (ts.isNewExpression(node) && candidateType(node)) add(node, 'typed-construction');
      if (ts.isCallExpression(node) || ts.isNewExpression(node))
        (node.arguments ?? []).forEach((argument, index) => {
          if (consumedValue(argument)) add(node, 'typed-handoff', argument, { argumentIndex: index });
        });
      if (ts.isForOfStatement(node) && consumedValue(node.expression))
        add(node, 'typed-iteration', node.expression, { operation: node.awaitModifier ? 'for-await' : 'for-of' });
      if (ts.isReturnStatement(node) && node.expression && consumedValue(node.expression))
        add(node, 'typed-return', node.expression, { operation: 'return' });
      if (ts.isArrowFunction(node) && !ts.isBlock(node.body) && consumedValue(node.body))
        add(node.body, 'typed-return', node.body, { operation: 'arrow-return' });
      if (ts.isYieldExpression(node) && node.asteriskToken && node.expression && consumedValue(node.expression))
        add(node, 'typed-delegation', node.expression, { operation: 'yield*' });
      if (ts.isYieldExpression(node) && !node.asteriskToken && node.expression && consumedValue(node.expression))
        add(node, 'typed-yield', node.expression, { operation: 'yield' });
      if ((ts.isSpreadElement(node) || ts.isSpreadAssignment(node)) && consumedValue(node.expression))
        add(node, 'typed-spread', node.expression, {
          operation: ts.isSpreadAssignment(node) ? 'spread-object' : 'spread',
        });
      if (
        ts.isVariableDeclaration(node) &&
        node.initializer &&
        consumedValue(node.initializer) &&
        node.parent.flags & ts.NodeFlags.Using
      )
        add(node, 'typed-disposal', node.initializer, {
          operation:
            (node.parent.flags & ts.NodeFlags.AwaitUsing) === ts.NodeFlags.AwaitUsing ? 'await-using' : 'using',
        });
      if (ts.isPropertyAccessExpression(node) || ts.isElementAccessExpression(node)) {
        // Reads retain raw captures and method aliases. Callees are not
        // suppressed: traversal continues through every child and nested call.
        if (candidateType(node) || candidateType(node.expression)) add(node, 'typed-reference', node.expression);
      }
      if (
        ts.isBinaryExpression(node) &&
        node.operatorToken.kind >= ts.SyntaxKind.FirstAssignment &&
        node.operatorToken.kind <= ts.SyntaxKind.LastAssignment
      ) {
        const target = unwrap(node.left),
          receiver = member(target).receiver;
        if (receiver && origin(receiver)) add(target, 'typed-property-write', receiver);
      }
      if (
        (ts.isPrefixUnaryExpression(node) || ts.isPostfixUnaryExpression(node)) &&
        [ts.SyntaxKind.PlusPlusToken, ts.SyntaxKind.MinusMinusToken].includes(node.operator)
      ) {
        const receiver = member(node.operand).receiver;
        if (receiver && origin(receiver)) add(node.operand, 'typed-property-write', receiver);
      }
      ts.forEachChild(node, visit);
    }
    visit(ast);
    return found;
  }
  return {
    sites,
    anchors: rootTypes.map(type => ({
      type: checker.typeToString(type),
      declarations: type
        .getSymbol()
        // Report dependency declarations independent of the install layout
        // (hoisted root or package-local node_modules).
        .declarations.map(declaration =>
          path
            .relative(root, declaration.getSourceFile().fileName)
            .replace(/^(?:.*\/)?node_modules\//, 'node_modules/')
        ),
    })),
  };
}
function readFixtures() {
  const declarations = fs.readFileSync(path.join(fixtureDirectory, 'context.d.ts.fixture'), 'utf8');
  const cases = [],
    sources = new Map(),
    files = {};
  for (const file of fs
    .readdirSync(fixtureDirectory)
    .filter(file => file.endsWith('.ts.fixture') && file !== 'context.d.ts.fixture')
    .sort()) {
    const source = fs.readFileSync(path.join(fixtureDirectory, file), 'utf8');
    files[base + 'test/http/fastify/fixtures/raw-boundaries/' + file] = { sha256: sha(source), cases: [] };
    source
      .trim()
      .split('\n\n')
      .forEach((block, index) => {
        const [expectation, ...lines] = block.split('\n');
        const [expectedKind, operation] = expectation.slice(3).split('|');
        const snippet = lines.join('\n');
        const virtual = path.join(sourceRoot, '.fm036-fixtures', file + '.' + index + '.ts');
        sources.set(virtual, declarations + '\n' + snippet);
        cases.push({ file, virtual, expectedKind, operation, source: snippet });
      });
  }
  for (const file of fs
    .readdirSync(fixtureDirectory)
    .filter(file => file.endsWith('.json.fixture') && file !== 'consumption-matrix.json.fixture')
    .sort()) {
    const source = fs.readFileSync(path.join(fixtureDirectory, file), 'utf8');
    files[base + 'test/http/fastify/fixtures/raw-boundaries/' + file] = { sha256: sha(source), cases: [] };
    for (const fixture of JSON.parse(source).cases) {
      const virtual = path.join(sourceRoot, fixture.scope, '.fm036-fixtures', fixture.id + '.ts');
      sources.set(virtual, declarations + '\n' + fixture.source);
      cases.push({ ...fixture, file, virtual });
    }
  }
  const matrixFile = 'consumption-matrix.json.fixture';
  const matrixSource = fs.readFileSync(path.join(fixtureDirectory, matrixFile), 'utf8');
  const matrix = JSON.parse(matrixSource);
  files[base + 'test/http/fastify/fixtures/raw-boundaries/' + matrixFile] = { sha256: sha(matrixSource), cases: [] };
  const coverage = [];
  for (const family of matrix.families)
    for (const form of matrix.forms) {
      if (form.requires && !family.capabilities.includes(form.requires)) {
        coverage.push({ family: family.id, form: form.id, discovered: false, reason: form.inapplicable });
        continue;
      }
      const receiver = family.expression ?? 'candidate';
      const source =
        family.declaration +
        '\n' +
        form.source
          .replaceAll('$candidate', receiver)
          .replaceAll(
            '$pipeline',
            family.capabilities.includes('node-writable') && !family.capabilities.includes('node-readable')
              ? 'stream, ' + receiver
              : receiver + ', parser'
          );
      const virtual = path.join(sourceRoot, '.fm036-fixtures', family.id + '.' + form.id + '.ts');
      sources.set(virtual, declarations + '\n' + source);
      cases.push({
        file: matrixFile,
        virtual,
        expectedKind: form.kind,
        operation: form.operation,
        source,
        expectedReceiver: (form.receiver ?? '$candidate').replaceAll('$candidate', receiver),
        family: family.id,
        form: form.id,
      });
      coverage.push({ family: family.id, form: form.id, discovered: true });
    }
  return { sources, cases, files, consumptionCoverage: coverage, contextSha256: sha(declarations) };
}

profiles.native = {
  owner: 'Native HTTP action/context facade; host owns accepted request and terminal publication',
  bypassed: [],
  restoration: {
    hooks:
      'Request context access/delegation and facade end retain the ordinary native lifecycle. This conservative candidate is not a hijack.',
    session:
      'Native session send/save remains in its normal phase; request-derived facade data never becomes a second session store.',
    observation:
      'Native response/error observation once through the existing host boundary; facade delegation does not add a response writer.',
    drain:
      'Accepted action, callback and session work remains inside the host request lease through response completion or disconnect.',
    security: 'Existing native route admission, policies, validation and prepared security headers remain in force.',
    upgrade: 'No upgrade dispatch; protocol integrations have their separate explicit owner profiles.',
  },
  tests: [
    test('fastify/FastifyHost.test.ts'),
    test('fastify/securityFailures.test.ts'),
    test('fastify/RawShutdownMongo.test.ts'),
  ],
};
profiles.service = {
  owner:
    'Application service resource; persistence/application owner retains service work independently of HTTP transport',
  bypassed: [],
  restoration: {
    hooks:
      'Shared service streams, deadlines and outbound cancellation do not bypass Fastify hooks; they execute beneath an accepted action or an independently owned job.',
    session:
      'No raw session publication. An HTTP caller retains its ordinary session/callback ownership independently of service cancellation.',
    observation:
      'Service observes its own completion/error; HTTP callers retain the one native response/error observation.',
    drain:
      'Service operation/finalizer and resource owner retain stream iterator/pipeline/completion/EOF/error settlement and outstanding work; argument/return/producer handoffs do not release the HTTP request or dependency frontier. Cancellable timers clear in finally/close, awaited delays settle before release, and AbortSignal.timeout owns its unreferenced expiry.',
    security:
      'No new inbound listener or raw header writer; upstream guards and service-specific validation continue to apply.',
    upgrade: 'Not an upgrade path; no host upgrade listener is acquired.',
  },
  tests: [test('fastify/FastifyClose.test.ts'), test('fastify/RawShutdownMongo.test.ts')],
};
profiles.companionHttpCancellation = {
  ...profiles.companion,
  owner: 'CompanionUploads admitted HTTP requests map; host retains HTTP callback/session work',
  restoration: {
    ...profiles.companion.restoration,
    hooks:
      'Deadline destroys admitted HTTP request sockets, not upgrades. HTTP handoff has run onRequest/preHandler; onSend/onError are bypassed and native onResponse observes finish/error, not raw close.',
    session:
      'Transport destruction does not release executing provider callbacks or pending session commits. beginHttpRequest/retainHttpCallback keep those operations owned until actual completion and stop retry.',
    observation:
      'Raw close is observed by the request lifetime; native onResponse observes finish/error only, so premature socket closure does not imply response completion; provider errors use the shared opaque boundary. Cancellation does not manufacture an upgrade metric or a second writer.',
    drain:
      'terminate iterates requests.values(); request promises remain retained after socket destruction. Borrowed dependencies cannot close until callback/session work settles; retry finishes owned cleanup.',
    upgrade: 'Not an upgrade path. WebSocket teardown iterates the separate sockets map and uses companionUpgrade.',
  },
};
for (const file of [
  'api-routes/helpers.ts',
  'api-routes/request-extraction.ts',
  'api-routes/validation.ts',
  'application/portal/application.ts',
  'application/portal/host.ts',
  'extensions/composition.ts',
  'forms/ContextVariables.ts',
  'http/actions/actionReply.ts',
  'http/actions/brandingOperations.ts',
  'http/actions/brandingUploads.ts',
  'http/actions/configurationReads.ts',
  'http/actions/configurationWrites.ts',
  'http/actions/configuredActions.ts',
  'http/actions/datastreamUpload.ts',
  'http/actions/figshareAdministration.ts',
  'http/actions/formDelivery.ts',
  'http/actions/formVocabulary.ts',
  'http/actions/harvestMutations.ts',
  'http/actions/integrationOperations.ts',
  'http/actions/identityAdministration.ts',
  'http/actions/identityLinks.ts',
  'http/actions/metadataReads.ts',
  'http/actions/progressGrant.ts',
  'http/actions/progressOperations.ts',
  'http/actions/queryWrites.ts',
  'http/actions/queryReads.ts',
  'http/actions/recordMetadata.ts',
  'http/actions/recordMutations.ts',
  'http/actions/recordTypeReads.ts',
  'http/actions/reference.ts',
  'http/actions/vocabularyAdministration.ts',
  'http/actions/vocabularyIntegrations.ts',
  'http/fastify/actionReply.ts',
  'http/fastify/authentication.ts',
  'http/fastify/brandingUploads.ts',
  'http/fastify/datastreamUploads.ts',
  'http/fastify/fallbacks.ts',
  'http/fastify/hooks.ts',
  'http/fastify/identityProviders.ts',
  'http/fastify/logging.ts',
  'http/fastify/policies.ts',
  'http/fastify/registry.ts',
  'http/fastify/session.ts',
  'http/fastify/staticOwnership.ts',
  'pages/brandingDelivery.ts',
  'pages/dynamicAssets.ts',
  'queries/Reports.ts',
  'utilities/RequestChronicle.ts',
])
  assignments[file] = 'native';
for (const file of [
  'CoreService.ts',
  'branding/BrandingLogo.ts',
  'configuration/AppConfigSecrets.ts',
  'forms/RecordValidation.ts',
  'integrations/figshare/admin.ts',
  'integrations/figshare/assets.ts',
  'integrations/figshare/managed-assets.ts',
  'integrations/figshare/worker.ts',
  'integrations/oni/repository.ts',
  'integrations/raid/http.ts',
  'queries/Solr.ts',
  'queues/AgendaQueue.ts',
  'record-contract/record-contract-compiler.ts',
  'records/Records.ts',
  'services/BrandingWoff2Inspector.ts',
  'services/doi-v2/http.ts',
  'services/figshare-v2/http.ts',
  'services/oni-v2/flydriveOcflStore.ts',
  'services/oni-v2/ingestion.ts',
  'storage/GridFSDriver.ts',
  'storage/StandardDatastream.ts',
  'storage/ownGridFSDownload.ts',
  'storage/writeGridFSStream.ts',
  'utilities/PromiseUtils.ts',
  'utilities/withTimeout.ts',
  'vocabulary/Vocabulary.ts',
])
  assignments[file] = 'service';
for (const file of [
  'action-execution/legacy-result.ts',
  'integrations/Raid.ts',
  'services/raid-v2/runtime.ts',
  'services/siem/SiemAdapters.ts',
])
  assignments[file] = 'service';
const serviceProofs = {
  'branding/BrandingLogo.ts': [
    'packages/redbox-core/test/services/BrandingLogoService.test.ts',
    'packages/redbox-core/test/services/BrandingLogoGridFS.test.ts',
  ],
  'configuration/AppConfigSecrets.ts': ['packages/redbox-core/test/services/AppConfigSecrets.test.ts'],
  'forms/RecordValidation.ts': ['packages/redbox-core/test/services/RecordValidationService.test.ts'],
  'integrations/figshare/admin.ts': ['packages/redbox-core/test/services/figshare-queued.test.ts'],
  'integrations/figshare/assets.ts': ['packages/redbox-core/test/services/figshare-managed-assets.test.ts'],
  'integrations/figshare/managed-assets.ts': ['packages/redbox-core/test/services/figshare-managed-assets.test.ts'],
  'integrations/figshare/worker.ts': ['packages/redbox-core/test/services/figshare-queued.test.ts'],
  'integrations/oni/repository.ts': ['packages/redbox-core/test/services/oni-v2/repository.test.ts'],
  'integrations/raid/http.ts': ['packages/redbox-core/test/services/raid-v2/http.test.ts'],
  'queues/AgendaQueue.ts': [
    'packages/redbox-core/test/services/AgendaQueueService.test.ts',
  ],
  'record-contract/record-contract-compiler.ts': ['packages/redbox-core/test/unit/record-contract/compiler.test.ts'],
  'services/BrandingWoff2Inspector.ts': ['packages/redbox-core/test/services/BrandingWoff2Inspector.test.ts'],
  'services/oni-v2/flydriveOcflStore.ts': ['packages/redbox-core/test/services/oni-v2/flydriveOcflStore.test.ts'],
  'storage/GridFSDriver.ts': ['packages/redbox-core/test/services/GridFSDriver.test.ts'],
  'storage/StandardDatastream.ts': [
    'packages/redbox-core/test/http/fastify/DatastreamDifferentialMongo.test.ts',
    'packages/redbox-core/test/http/fastify/UploadDifferentialMongo.test.ts',
  ],
  'storage/ownGridFSDownload.ts': [
    'packages/redbox-core/test/services/BrandingLogoGridFS.test.ts',
    'packages/redbox-core/test/http/fastify/DatastreamDifferentialMongo.test.ts',
  ],
  'storage/writeGridFSStream.ts': ['packages/redbox-core/test/services/writeGridFSStream.test.ts'],
};
for (const file of [
  'application/portal/installation.ts',
  'application/portal/integrationHttpPlan.ts',
  'application/portal/readHttpPlan.ts',
  'http/actions/recordReads.ts',
  'http/context.ts',
  'http/controllers/ApplicationStatusController.ts',
  'http/controllers/AssetControllers.ts',
  'http/controllers/BrowserControllers.ts',
  'http/controllers/IdentityAdministrationControllers.ts',
  'http/controllers/IntegrationControllers.ts',
  'http/controllers/MutationControllers.ts',
  'http/controllers/ProgressController.ts',
  'http/controllers/ReferenceControllers.ts',
  'http/controllers/UploadControllers.ts',
  'http/controllers/webservice/RecordController.ts',
  'http/fastify/composition.ts',
  'http/fastify/csrf.ts',
  'http/fastify/identityAdministration.ts',
  'http/fastify/integrations.ts',
  'http/fastify/mutations.ts',
  'http/fastify/preparation.ts',
  'http/fastify/referenceReads.ts',
  'http/fastify/responses.ts',
  'http/fastify/validation.ts',
  'model/RequestDetails.ts',
  'http/controllers/PageController.ts',
  'http/controllers/ReadControllers.ts',
  'http/controllers/webservice/DatastreamController.ts',
])
  assignments[file] = 'native';
for (const file of [
  'RecordEntityTag.ts',
  'RecordFormFingerprint.ts',
  'action-execution/policy.ts',
  'authentication/HttpIdentity.ts',
  'branding/BrandingThemeCss.ts',
  'branding/BrandingTypeface.ts',
  'branding/typefaceMigration.ts',
  'config/log.config.ts',
  'configmodels/DashboardSettings.ts',
  'http/ownedRoutes.ts',
  'http/fastify/targetNames.ts',
  'http/integrations/companion/companionLogging.ts',
  'identity/Users.ts',
  'identity/bootstrap.ts',
  'integrations/Email.ts',
  'persistence/indexes.ts',
  'persistence/mongodb/configuration.ts',
  'persistence/runtime.ts',
  'persistence/prisma/client.ts',
  'persistence/sessions/indexes.ts',
  'persistence/storage/PrismaAttachments.ts',
  'queues/ScheduledWork.ts',
  'queues/indexes.ts',
  'queues/migrateRecordHooks.ts',
  'record-contract/record-json-schema-artifact.ts',
  'recordSchema/RecordSchema.ts',
  'records/HarvestRuns.ts',
  'services/CacheService.ts',
  'services/figshare-v2/categories.ts',
])
  assignments[file] = 'service';
Object.assign(assignments, {
  'application/portal/rawHttp.ts': 'host',
  'storage/TusStorageManagerDataStore.ts': 'tus',
  'transformers/ExportJSONTransformer.ts': 'stream',
});
profiles.socketError = {
  ...profiles.error,
  owner: 'Host opaque socket-target refusal writer; HTTP parser/admission and rejected upgrades share it',
  bypassed: hooks,
  restoration: {
    ...profiles.error.restoration,
    hooks:
      'The socket-target branch can run before Fastify constructs an HTTP request, so no native hooks are assumed. Established request targets retain their independent native completion owner.',
    session:
      'No session/cookie publication by the socket refusal. Any already accepted HTTP callback or session operation keeps its existing request lease.',
    observation:
      'Pre-request malformed/admission/upgrade refusal has no native route completion metric; safe socket status/body and terminal close are observed at the transport owner. Existing HTTP request observations remain independent and occur once.',
    upgrade:
      'Socket does not imply upgrade. HTTP parser/admission failures and rejected upgrades use this common terminal writer; only ownUpgrade dispatch selects a protocol owner.',
  },
};
function profileFor(relative, site) {
  if (relative === 'http/integrations/companion/uploads.ts') {
    if (site.iterations.includes('this.requests.values()')) return 'companionHttpCancellation';
    if (
      site.scopes.includes('upgrade') ||
      site.iterations.includes('this.sockets.keys()') ||
      (site.operation === 'socket' && site.receiver === 'companion') ||
      site.operation === 'ownUpgrade' ||
      (site.operation === 'removeAllListeners' && site.receiver === 'this.bridge') ||
      (site.kind === 'typed-construction' && site.operation === 'EventEmitter' && site.scopes.includes('prepare'))
    )
      return 'companionUpgrade';
    return 'companion';
  }
  if (relative === 'http/fastify/errorBoundary.ts' && site.socketTarget) return 'socketError';
  if (relative === 'http/integrations/upgrades.ts') return 'upgrade';
  if (relative === 'http/fastify/router.ts')
    return site.scopes.includes('clientErrorHandler')
      ? 'socketError'
      : site.scopes.includes('frameworkErrors')
        ? 'error'
        : 'host';
  return assignments[relative];
}
function walk(folder) {
  return fs.readdirSync(folder, { withFileTypes: true }).flatMap(entry => {
    const file = path.join(folder, entry.name);
    return entry.isDirectory() ? walk(file) : file.endsWith('.ts') ? [file] : [];
  });
}
let cachedInventory;
function inventory(options = {}) {
  const fixtures = readFixtures();
  const files = walk(sourceRoot).sort();
  const inputs = new Map(files.map(file => [file, fs.readFileSync(file, 'utf8')]));
  for (const [file, source] of Object.entries(options.overrides ?? {})) {
    const absolute = path.isAbsolute(file) ? file : path.join(sourceRoot, file);
    inputs.set(absolute, source);
    if (!files.includes(absolute)) files.push(absolute);
  }
  files.sort();
  const key = sha(JSON.stringify([...inputs]) + JSON.stringify([...fixtures.sources]));
  if (!options.omitFixtureOperation && !options.omitFixtureForm && cachedInventory?.key === key)
    return cachedInventory.value;
  const project = typedProject(new Map([...inputs, ...fixtures.sources, [anchorPath, anchorSource]]));
  const scannerFixtures = fixtures.files;
  for (const fixture of fixtures.cases) {
    const discovered = project
      .sites(fixture.virtual)
      .filter(
        site =>
          site.operation !== options.omitFixtureOperation &&
          (!options.omitFixtureForm || fixture.form !== options.omitFixtureForm)
      );
    if (
      !discovered.some(
        site =>
          site.kind === fixture.expectedKind &&
          site.operation === fixture.operation &&
          (!fixture.expectedReceiver || site.receiver === fixture.expectedReceiver)
      )
    )
      throw new Error(
        'Missing raw fixture boundary: ' + fixture.file + ' ' + fixture.source + '\n' + JSON.stringify(discovered)
      );
    const { virtual, ...record } = fixture;
    scannerFixtures[base + 'test/http/fastify/fixtures/raw-boundaries/' + fixture.file].cases.push({
      ...record,
      sites: discovered,
    });
  }
  const boundaries = [],
    retainedExpress = [],
    sources = {},
    unmapped = [];
  for (const file of files) {
    const relative = path.relative(sourceRoot, file);
    sources[base + 'src/' + relative] = sha(inputs.get(file));
    for (const site of project.sites(file)) {
      const profile = profileFor(relative, site);
      if (!profile) {
        unmapped.push(relative + ':' + site.line + ' [' + site.kind + '|' + site.operation + '] ' + site.call);
        continue;
      }
      const contract = profiles[profile];
      const row = {
        file: base + 'src/' + relative,
        ...site,
        profile,
        ...contract,
        ...(profile === 'service'
          ? {
              owner: relative + '; ' + contract.owner,
              tests: [...new Set([...contract.tests, ...(serviceProofs[relative] ?? [])])],
            }
          : {}),
      };
      boundaries.push(row);
    }
  }
  if (unmapped.length) throw new Error('Unclassified raw boundary:\n' + unmapped.join('\n'));
  const proofs = {};
  for (const file of [...new Set([...boundaries, ...retainedExpress].flatMap(row => row.tests))].sort()) {
    const source = fs.readFileSync(path.join(root, file), 'utf8');
    const ast = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true);
    const cases = [];
    const visit = node => {
      if (ts.isCallExpression(node) && ts.isIdentifier(node.expression) && node.expression.text === 'it')
        cases.push({
          line: ast.getLineAndCharacterOfPosition(node.getStart(ast)).line + 1,
          title: node.arguments[0]?.getText(ast),
        });
      ts.forEachChild(node, visit);
    };
    visit(ast);
    if (!cases.length) throw new Error('Proof has no executable cases: ' + file);
    proofs[file] = { sha256: sha(source), cases };
  }
  const result = {
    schema: 5,
    scope:
      'Structural stream/emitter discovery in all core src/http/** and src/storage/**; supplemental canonical transport/timer discovery throughout core src; package tsconfig; no operation allowlist or callee suppression',
    discoveryContract,
    consumptionCoverage: fixtures.consumptionCoverage,
    sources,
    scannerFixtures,
    boundaries,
    retainedExpress,
    canonicalTypes: project.anchors,
    fixtureContextSha256: fixtures.contextSha256,
    proofs,
    counts: { boundaries: boundaries.length, retainedExpress: retainedExpress.length, sources: files.length },
  };
  cachedInventory = { key, value: result };
  return result;
}
const serialize = value => JSON.stringify(value, null, 2) + '\n';
function checkInventory(expected, ...args) {
  if (serialize(inventory(...args)) !== expected) throw new Error('FM-036 raw inventory drift');
}
if (require.main === module) {
  const output = path.join(__dirname, 'FM-036.raw-boundaries.json');
  const serialized = serialize(inventory());
  if (process.argv.includes('--check')) {
    checkInventory(fs.existsSync(output) ? fs.readFileSync(output, 'utf8') : '');
  } else fs.writeFileSync(output, serialized);
  console.log('FM-036 source-derived raw boundary inventory verified');
}
module.exports = { inventory, profiles, checkInventory };
