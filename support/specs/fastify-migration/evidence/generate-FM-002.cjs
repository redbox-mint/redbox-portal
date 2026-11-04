'use strict';

// Offline source inventory, not a dispatch table. Run from any working directory.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');
const root = path.resolve(__dirname, '../../../..');
require(path.join(root, 'node_modules/ts-node')).register({
  project: path.join(root, 'packages/redbox-core/test/tsconfig.json'),
  transpileOnly: true,
  preferTsExts: true,
});
const fromSource = file => require(path.join(root, file));
const prefix = 'packages/redbox-core/src/';
const http = prefix + 'http/express/';
const ts = require(path.join(root, 'node_modules/typescript'));
const sha256 = value => createHash('sha256').update(value).digest('hex');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const parse = file => ts.createSourceFile(file, read(file), ts.ScriptTarget.Latest, true);
const { canonicalHttpRoutePath } = fromSource(prefix + 'extensions/resolution.ts');
const { resolveEffectivePolicies, pilotPolicyChain } = fromSource(http + 'policies.ts');
const { portalHttpPolicies } = fromSource(prefix + 'application/portal/httpPolicies.ts');
const runtimePath = value => value.replace(':key*', '*key').replace('datastream*', 'datastream{*tail}');
const identity = (method, routePath) =>
  `core-http-${method}-${sha256(canonicalHttpRoutePath(runtimePath(routePath))).slice(0, 16)}`;
const test = name => `packages/redbox-core/test/${name}`;
const inventoryTest = 'support/specs/fastify-migration/evidence/FM-002.test.cjs';

// Ownership is per source collection, never a second list of API paths/actions.
const owners = {
  recordTypeApiRoutes: ['FM-023', 'http/RecordTypesMongo.test.ts'],
  metadataReadRoutes: ['FM-023', 'http/recordBrowserMetadata.test.ts'],
  configurationReadRoutes: ['FM-023', 'http/ConfigurationMongo.test.ts'],
  appConfigFormReadRoute: ['FM-023', 'http/ConfigurationMongo.test.ts'],
  configurationWriteRoutes: ['FM-026', 'http/ConfigurationMongo.test.ts'],
  formDeliveryRoutes: ['FM-023', 'http/recordBrowserForms.test.ts'],
  queryReadRoutes: ['FM-024', 'http/QueryReadsMongo.test.ts'],
  queryWriteRoutes: ['FM-026', 'http/IntegrationAdministrationMongo.test.ts'],
  recordReadRoutes: ['FM-024', 'http/recordApiReads.test.ts'],
  recordMutationRoutes: ['FM-026', 'http/recordApiMutations.test.ts'],
  harvestMutationRoutes: ['FM-026', 'http/recordHarvestDelegation.test.ts'],
  identityAdministrationRoutes: ['FM-025', 'http/IdentityAdministrationMongo.test.ts'],
  identityLinkRoutes: ['FM-025', 'http/identityDifferential.test.ts'],
  vocabularyIntegrationRoutes: ['FM-027', 'http/vocabularyVersionDifferential.test.ts'],
  vocabularyAdministrationRoutes: ['FM-027', 'http/IntegrationAdministrationMongo.test.ts'],
  siemWriteRoutes: ['FM-025', 'http/IntegrationAdministrationMongo.test.ts'],
  adminOperationRoutes: ['FM-025', 'http/IntegrationAdministrationMongo.test.ts'],
  brandingOperationRoutes: ['FM-027', 'http/IntegrationAdministrationMongo.test.ts'],
  brandingUploadRoutes: ['FM-034', 'http/IntegrationAdministrationMongo.test.ts'],
  figshareAdministrationRoutes: ['FM-027', 'http/IntegrationAdministrationMongo.test.ts'],
  integrationOperationRoutes: ['FM-027', 'http/IntegrationAdministrationMongo.test.ts'],
  datastreamReadRoutes: ['FM-033', 'http/recordDatastreamContracts.test.ts'],
  datastreamWriteRoutes: ['FM-034', 'http/recordDatastreamContracts.test.ts'],
  authenticationRoutes: ['FM-030', 'http/authentication-matrix.test.ts'],
  csrfTokenRoute: ['FM-016', 'http/CsrfMongo.test.ts'],
  pageRootRoute: ['FM-030', 'http/PagesMongo.test.ts'],
  pageRoutes: ['FM-030', 'http/recordBrowserPages.test.ts'],
  formVocabularyRoutes: ['FM-027', 'http/httpInputAcceptance.test.ts'],
  configuredActionRoutes: ['FM-026', 'http/IntegrationAdministrationMongo.test.ts'],
  resumableUploadRoutes: ['FM-034', 'http/recordResumableContracts.test.ts'],
  progressOperationRoutes: ['FM-035', 'http/recordProgressContracts.test.ts'],
  progressSocketGrantRoute: ['FM-035', 'http/ProgressSockets.test.ts'],
  brandingDeliveryRoutes: ['FM-031', 'http/PageArtifacts.test.ts'],
  fontDeliveryRoute: ['FM-031', 'http/PageArtifacts.test.ts'],
  dynamicAssetRoutes: ['FM-031', 'http/recordBrowserForms.test.ts'],
};

function declarationImports(file) {
  return parse(file)
    .statements.filter(ts.isImportDeclaration)
    .flatMap(node => {
      const bindings = node.importClause?.namedBindings;
      if (node.importClause?.isTypeOnly || !bindings || !ts.isNamedImports(bindings)) return [];
      return bindings.elements
        .filter(item => !item.isTypeOnly && /Routes?$|Declarations$/.test(item.name.text))
        .map(item => ({
          file: path.posix.normalize(path.posix.join(path.posix.dirname(file), node.moduleSpecifier.text + '.ts')),
          export: item.propertyName?.text ?? item.name.text,
        }));
    });
}

function sourceReference(file, symbol) {
  const ast = parse(file);
  let line;
  function visit(node) {
    if (
      (ts.isVariableDeclaration(node) ||
        ts.isFunctionDeclaration(node) ||
        ts.isClassDeclaration(node) ||
        ts.isInterfaceDeclaration(node)) &&
      node.name?.getText(ast) === symbol
    )
      line = ast.getLineAndCharacterOfPosition(node.getStart(ast)).line + 1;
    ts.forEachChild(node, visit);
  }
  visit(ast);
  assert(line !== undefined, `Missing source declaration: ${file}#${symbol}`);
  return { file, export: symbol, line };
}

// Inspect declarations only: loading a bundled hook can acquire unrelated resources.
// Unknown syntax must fail closed so a spread cannot conceal HTTP contributions.
function inspectBundledRegistration(file, source = read(file)) {
  const ast = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true);
  const registrations = ast.statements.filter(
    node => ts.isFunctionDeclaration(node) && node.name?.text === 'registerRedboxExtension'
  );
  assert.equal(registrations.length, 1, 'Inspect new bundled registration: ' + file);
  const returns = [];
  function findReturns(node) {
    if (ts.isFunctionLike(node)) return;
    if (ts.isReturnStatement(node)) returns.push(node);
    ts.forEachChild(node, findReturns);
  }
  assert(registrations[0].body, 'Inspect new bundled registration body: ' + file);
  findReturns(registrations[0].body);
  assert.equal(returns.length, 1, 'Inspect new bundled registration return: ' + file);
  const returned = returns[0].expression;
  assert(returned && ts.isObjectLiteralExpression(returned), 'Inspect new bundled registration: ' + file);
  const fields = {};
  for (const field of returned.properties) {
    assert(
      field.name && (ts.isIdentifier(field.name) || ts.isStringLiteral(field.name)),
      'Inspect bundled spread/computed contribution: ' + file
    );
    if (['routes', 'handlers', 'middleware', 'integrations', 'views', 'assets'].includes(field.name.text))
      fields[field.name.text] = field.getText(ast);
  }
  assert.equal(Object.keys(fields).length, 0, 'Inventory new bundled HTTP contributions: ' + file);
  return fields;
}

// Keep exact metadata and executable schema references without attempting to
// translate Zod refinements/transforms into a lossy JSON Schema validation rule.
function metadata(value, reference) {
  if (value === undefined) return null;
  if (typeof value === 'function')
    return { function: value.name || 'anonymous', reference, sha256: sha256(String(value)) };
  if (!value || typeof value !== 'object') return value;
  if (typeof value.safeParse === 'function') {
    const shape = value.shape;
    return { zod: value.type ?? value._def?.type, reference, ...(shape ? { fields: Object.keys(shape) } : {}) };
  }
  if (Array.isArray(value)) return value.map((item, index) => metadata(item, `${reference}[${index}]`));
  return Object.fromEntries(
    Object.entries(value)
      .filter(([, item]) => item !== undefined)
      .map(([key, item]) => [key, metadata(item, `${reference}.${key}`)])
  );
}

function accessFor(route, collection, configuration) {
  if (['authenticationRoutes', 'csrfTokenRoute', 'pageRootRoute', 'fontDeliveryRoute'].includes(collection)) return [];
  let mandatory = [];
  if (collection === 'pageRoutes')
    mandatory = [
      'nocache',
      'brandingandportal',
      'browseractor',
      ...(route.access === 'public' ? [] : ['browserauthenticated', 'brandactor']),
      'checkauth',
    ];
  if (collection === 'brandingDeliveryRoutes') mandatory = ['brandingandportal', 'browseractor', 'checkauth'];
  if (collection === 'dynamicAssetRoutes')
    mandatory = [
      'nocache',
      'brandingandportal',
      'browseractor',
      ...(route.action === 'get' ? [] : ['browserauthenticated', 'brandactor']),
      'checkauth',
    ];
  const configured = resolveEffectivePolicies(route, configuration);
  return mandatory.length ? [...new Set([...mandatory, ...configured])] : [...configured];
}

function csrfFor(route, collection) {
  if (collection === 'csrfTokenRoute') return 'canonical-origin; generate and await session save';
  if (collection === 'authenticationRoutes') {
    if (route.action === 'localLogin' || (route.action === 'logout' && route.method === 'post')) return 'protect';
    return route.action === 'aafLogin'
      ? 'verified provider assertion (no synchronizer token)'
      : /[Oo]idc|[Oo]penid/.test(route.action)
        ? 'provider state/PKCE/nonce; HEAD begin is denied'
        : 'none';
  }
  if (collection === 'resumableUploadRoutes') return 'apiProtect on ALL methods, including HEAD/OPTIONS';
  if (collection === 'recordReadRoutes') return 'none';
  if (collection === 'adminOperationRoutes') return route.action === 'getAppConfig' ? 'none' : 'apiProtect';
  if (collection === 'brandingDeliveryRoutes' || collection === 'pageRoutes') return 'protect except GET/HEAD/OPTIONS';
  if (
    ['pageRootRoute', 'fontDeliveryRoute', 'dynamicAssetRoutes'].includes(collection) ||
    route.method === 'get' ||
    route.method === 'head'
  )
    return 'none';
  return route.path.includes('/api/') ||
    ['resumableUploadRoutes', 'progressOperationRoutes', 'progressSocketGrantRoute'].includes(collection)
    ? 'apiProtect'
    : 'protect';
}

function collectInventory() {
  const inputs = new Set([
    __filename.slice(root.length + 1),
    prefix + 'http/express/ownedRoutes.ts',
    http + 'apiManifest.ts',
    prefix + 'api-routes/route-registry.ts',
    prefix + 'api-routes/route-factory.ts',
    prefix + 'api-routes/define.ts',
    http + 'policies.ts',
    prefix + 'application/portal/httpPolicies.ts',
    prefix + 'application/portal/http.ts',
    prefix + 'extensions/contract.ts',
    prefix + 'extensions/resolution.ts',
    prefix + 'extensions/composition.ts',
    prefix + 'config/companion.config.ts',
    prefix + 'config/companionDefaults.ts',
    http + 'ExpressHost.ts',
    http + 'progressSockets.ts',
    http + 'companion.ts',
    http + 'middleware.ts',
    http + 'responses.ts',
    'packages/sails-ng-common/src/siem.model.ts',
  ]);
  // Imports are the current production manifests, including browser aliases.
  const collections = [
    ...declarationImports(http + 'apiManifest.ts'),
    ...declarationImports(http + 'ownedRoutes.ts').filter(item => item.export !== 'ownedHttpDeclarations'),
  ];
  const api = fromSource(prefix + 'api-routes/route-registry.ts').registerCoreApiRoutes();
  const apiReferences = new Map();
  for (const file of fs
    .readdirSync(path.join(root, prefix, 'api-routes/groups'))
    .filter(name => name.endsWith('.ts'))
    .sort()) {
    const filename = prefix + 'api-routes/groups/' + file;
    inputs.add(filename);
    for (const [name, value] of Object.entries(fromSource(filename))) {
      if (api.includes(value)) apiReferences.set(value, sourceReference(filename, name));
      if (Array.isArray(value))
        value.forEach((route, index) => {
          if (api.includes(route) && !apiReferences.has(route))
            apiReferences.set(route, { ...sourceReference(filename, name), index });
        });
    }
  }
  for (const file of fs.readdirSync(path.join(root, prefix, 'api-routes/schemas')))
    inputs.add(prefix + 'api-routes/schemas/' + file);
  const configuration = portalHttpPolicies();
  const routes = collections.flatMap(collection => {
    assert(owners[collection.export], 'Unassigned source collection: ' + collection.export);
    inputs.add(collection.file);
    const value = fromSource(collection.file)[collection.export];
    assert(value, 'Missing declaration export: ' + collection.export);
    return (Array.isArray(value) ? value : [value]).map((route, index) => {
      const reference = apiReferences.get(route) ?? sourceReference(collection.file, collection.export);
      const declarationIndex = Array.isArray(value) ? { index } : {};
      const referenceIndex = apiReferences.has(route) ? reference.index : declarationIndex.index;
      const original = metadata(
        route,
        `${reference.file}#${reference.export}${referenceIndex === undefined ? '' : `[${referenceIndex}]`}`
      );
      const effectivePolicies = accessFor(route, collection.export, configuration);
      return {
        name: identity(route.method, route.path),
        kind: api.includes(route) ? 'api' : collection.export === 'pageRoutes' ? 'page' : 'browser-or-integration',
        provider: '@researchdatabox/redbox-core',
        source: { ...sourceReference(collection.file, collection.export), ...declarationIndex },
        apiDeclaration: apiReferences.get(route) ?? null,
        original,
        method: route.method,
        path: runtimePath(route.path),
        deploymentPath: '${rootContext}' + runtimePath(route.path),
        controller: route.controller ?? null,
        action: route.action ?? null,
        selectedFactory: null,
        implementation: {
          file:
            route.controller === 'webservice/RecordSchemaController'
              ? http + 'recordSchemaReads.ts'
              : collection.export === 'recordTypeApiRoutes'
                ? http + 'recordTypes.ts'
                : collection.file,
          kind: 'explicit Express adapter; no controller factory exists at this revision',
        },
        access: {
          declaredPolicy: route.policy ?? null,
          declaredAccess: route.access ?? null,
          effectivePolicies,
          domainGuards:
            'Action/domain authorization is additional; see implementation, not implied public by an empty chain',
        },
        csrf: { declared: route.csrf ?? null, effective: csrfFor(route, collection.export) },
        validation: {
          requestRef: original.request ? 'original.request' : null,
          reference,
          owner: 'route adapter and selected domain; Zod references retain executable semantics',
        },
        responses: {
          declaredRef: original.responses ? 'original.responses' : null,
          view: route.view ?? null,
          reference: collection.file,
          serialization: 'existing response helpers; schemas are documentation, not field filtering',
        },
        head: {
          behavior:
            route.method === 'head'
              ? 'explicit-405'
              : route.method === 'get'
                ? 'implicit-get'
                : route.method === 'all'
                  ? 'all-handler'
                  : 'not-handled',
          explicitTarget: null,
        },
        replacement: { replaces: route.replaces ?? false, target: null },
        ownerTask: owners[collection.export][0],
        testReferences: [
          { file: test('http/httpInputInventory.test.ts'), scope: 'per-route input inventory assertions' },
          {
            file: test(owners[collection.export][1]),
            scope: 'family coverage; not a claim every route has an individual end-to-end case',
          },
        ],
      };
    });
  });
  for (const route of routes) {
    if (route.method === 'get') {
      const explicit = routes.find(other => other.method === 'head' && other.path === route.path);
      if (explicit) route.head = { behavior: 'explicit-head-wins', explicitTarget: explicit.name };
      if (route.source.export === 'adminOperationRoutes') {
        route.head = {
          behavior: 'explicit-405',
          explicitTarget: null,
          status: 405,
          allow: 'GET',
          after: ['effectivePolicies', ...(route.csrf.effective === 'apiProtect' ? ['apiProtect'] : [])],
          before: 'request context, administrator/domain checks, validation and action work',
          reference: sourceReference(http + 'adminOperations.ts', 'mountAdminOperationRoutes'),
        };
        route.testReferences.push({
          file: inventoryTest,
          scope: 'all three administration GET HEAD denials, Allow: GET and policy/CSRF precedence over HTTP',
        });
      }
      if (route.source.export === 'fontDeliveryRoute') {
        route.head = {
          behavior: 'explicit-metadata-only',
          explicitTarget: null,
          details:
            'renderFont validates brand/hash and reads verified or cached bytes before conditional 304 or HEAD 200 with file headers and no body',
          reference: sourceReference(http + 'brandingDelivery.ts', 'BrandingDelivery'),
        };
        route.testReferences.push({
          file: test('controllers/BrandingFontDelivery.test.ts'),
          scope: 'explicit font HEAD headers/no body, conditional ETag and invalid/missing/corrupt object checks',
        });
      }
      if (route.source.export === 'datastreamReadRoutes' && route.action === 'doAttachment')
        route.head = {
          behavior: 'policies then next(); falls through to TUS ALL handler',
          explicitTarget: identity('all', route.path),
        };
    }
    route.replacementTargets = (
      route.method === 'all'
        ? ['get', 'head', 'post', 'put', 'patch', 'delete', 'options']
        : route.method === 'get'
          ? ['get', ...(route.head.behavior === 'explicit-head-wins' ? [] : ['head'])]
          : [route.method]
    ).map(method => ({ method, name: identity(method, route.path) }));
  }

  const surface = (name, kind, file, symbol, method, routePath, task, coverage, details) => {
    inputs.add(file);
    return {
      name,
      kind,
      provider: '@researchdatabox/redbox-core',
      source: sourceReference(file, symbol),
      method,
      path: routePath,
      controller: null,
      action: symbol,
      selectedFactory: null,
      ownerTask: task,
      testReferences: [{ file: test(coverage), scope: 'existing integration/contract coverage' }],
      ...details,
    };
  };
  const integrations = [
    ...['healthz', 'readyz'].map(name =>
      surface(
        identity('get', '/' + name),
        'health',
        http + 'ExpressHost.ts',
        'ExpressHost',
        'get',
        '/' + name,
        'FM-011',
        'http/ExpressHost.test.ts',
        {
          access: 'public, outside rootContext and ordinary readiness admission',
          csrf: 'none',
          validation: 'exact case-sensitive req.method GET and req.path match',
          responses: { status: [200, 503], body: name === 'healthz' ? '{healthy:boolean}' : '{ready:boolean}' },
          head: 'not intercepted; falls through admission/router, no implicit health HEAD',
          replacement: 'host-owned; no extension replacement',
        }
      )
    ),
    surface(
      'core-static-artifacts',
      'static-assets',
      http + 'pageAssets.ts',
      'mountStaticPageArtifacts',
      'get/head',
      'manifest-contained pathname after owned routes',
      'FM-031',
      'http/PageArtifacts.test.ts',
      {
        access: 'public contained manifest lookup',
        csrf: 'none',
        validation: 'URI decoding, manifest containment; branded/default portal/default fallback',
        responses: 'sendFile, immutable caching, nosniff, no immutable Set-Cookie; miss calls next()',
        head: 'same file metadata, no body',
        replacement: 'deployment overrides > extension assets > core assets',
      }
    ),
    surface(
      'core-page-not-found',
      'fallback',
      http + 'pages.ts',
      'mountPageNotFound',
      'all',
      '/:branding/:portal{/*pageNotFound}',
      'FM-030',
      'http/PagesMongo.test.ts',
      {
        access: ['nocache', 'brandingandportal', 'browseractor', 'checkauth'],
        csrf: 'protect except GET/HEAD/OPTIONS',
        validation: 'brand/portal, cross-brand actor, scalar query',
        responses: 'branded EJS 404 or policy response',
        head: 'same guards, no body; OPTIONS next(route)',
        replacement: 'after extension afterRoutes; not an onResponse hook',
      }
    ),
    surface(
      'core-unmatched',
      'fallback',
      http + 'ExpressHost.ts',
      'ExpressHost',
      'all',
      'unmatched outside portal router',
      'FM-011',
      'http/ExpressHost.test.ts',
      {
        access: 'ordinary admission gate',
        csrf: 'none',
        validation: 'none',
        responses: '404 {error:not-found}',
        head: '404 without body',
        replacement: 'host-owned',
      }
    ),
    surface(
      'core-progress-transport',
      'http-and-upgrade',
      http + 'progressSockets.ts',
      'ProgressSockets',
      'provider HTTP + upgrade',
      '${rootContext}/portal-socket.io',
      'FM-035',
      'http/ProgressSockets.test.ts',
      {
        access: {
          clientAssets: 'public provider client JS and source maps; no origin or grant required',
          transportHandshake: 'not closing; canonical origin; no grant required yet',
          namespaceConnection: 'one-use expiring grant; fresh identity and brand authorization',
          rooms: 'fresh identity and brand/room authorization on subscribe and emit',
        },
        csrf: 'grant endpoint is protected separately',
        validation: 'socket auth token, subscribe/unsubscribe room, maxHttpBufferSize 16384',
        responses: 'Engine.IO polling/WebSocket; serveClient:true also serves client JS',
        head: 'provider-owned HTTP handling; characterize in FM-003',
        replacement: 'one attach to the host server; not a router/controller factory',
        testReferences: [
          { file: test('http/ProgressSockets.test.ts'), scope: 'authenticated namespace and room authorization' },
          { file: inventoryTest, scope: 'public client JS versus origin-checked Engine.IO handshake before any grant' },
        ],
      }
    ),
    ...['${companion.route}', '${companion.route}/{*companionPath}'].map((routePath, index) =>
      surface(
        `core-companion-http-${index}`,
        'conditional-raw-provider',
        http + 'companion.ts',
        'mountCompanionRoutes',
        'all',
        routePath,
        'FM-035',
        'http/CompanionUploadsMongo.test.ts',
        {
          enabledWhen: 'companion.enabled (default false)',
          deploymentPath: '${rootContext}' + routePath,
          access: {
            mandatory: pilotPolicyChain.map(name => name.toLowerCase()),
            configured: [
              ...resolveEffectivePolicies({ controller: 'CompanionController', action: 'handle' }, configuration),
            ],
            context: 'validated session/default brand and portal',
          },
          csrf: 'apiProtect except GET/HEAD/OPTIONS',
          validation: 'scoped JSON/urlencoded parser (extended:false), URL/meta/get body check, provider protocol',
          responses: 'provider HTTP; canonical send-token HTML override and sanitized errors',
          head: 'ALL handler guards; provider responds',
          replacement: 'method-specific existing core-http hash identities at configured mount',
        }
      )
    ),
    surface(
      'core-companion-upgrade',
      'conditional-upgrade',
      http + 'companion.ts',
      'CompanionUploads',
      'upgrade',
      [
        '${rootContext}${companion.server.path}/api/:token',
        '${rootContext}${companion.server.path}/api2/auth-callback/token/:token',
      ],
      'FM-035',
      'http/CompanionUploadsMongo.test.ts',
      {
        enabledWhen: 'companion.enabled',
        access: {
          common: ['not closing', 'ready', 'canonical origin'],
          byPath: [
            {
              path: '${rootContext}${companion.server.path}/api/:token',
              trackedTransferRequired: true,
              tokenPattern: '[^/]+',
            },
            {
              path: '${rootContext}${companion.server.path}/api2/auth-callback/token/:token',
              trackedTransferRequired: false,
              tokenPattern: '[A-Za-z0-9_-]{16,256}',
            },
          ],
          sharedSecret: 'not a user identity',
        },
        csrf: 'HTTP upgrade capability checks',
        validation: 'api token must belong to a tracked transfer; auth-callback token uses [A-Za-z0-9_-]{16,256}',
        responses: 'pinned Companion WebSocket protocol or denial',
        head: 'not applicable',
        replacement: 'single owned server with unlistened dedicated bridge',
        testReferences: [
          { file: test('http/CompanionUploadsMongo.test.ts'), scope: 'real provider tracked upload integration' },
          {
            file: inventoryTest,
            scope:
              'actual forwarding gate: tracked/untracked upload tokens, OAuth callbacks without transfers, token format, origin/readiness/quiesce denials; provider bridge is a fixture',
          },
        ],
      }
    ),
    surface(
      'core-authentication-providers',
      'authentication-integration',
      http + 'identityProviders.ts',
      'installLocalAuthentication',
      'provider callbacks',
      'local, bearer, session, OIDC and AAF (route rows above)',
      'FM-015',
      'http/authentication-matrix.test.ts',
      {
        access: 'fresh credential, linked/disabled account, version and brand checks',
        csrf: 'local synchronizer / OIDC state-PKCE / AAF verified assertion',
        validation: 'provider/domain checks',
        responses: 'session rotation, login/logout redirects and safe errors',
        head: 'OIDC begin explicit 405',
        replacement: 'application-local provider bindings',
      }
    ),
    surface(
      'core-multipart-parser',
      'raw-multipart-integration',
      http + 'multipart.ts',
      'StreamingMultipart',
      'post',
      'datastreamWriteRoutes and brandingUploadRoutes',
      'FM-034',
      'http/StreamingMultipart.test.ts',
      {
        access: 'route policies/CSRF before parser acquisition',
        csrf: 'owned by route mount',
        validation: 'bounded files, fileSize, fields, fieldSize and staging; no ordinary body parser pre-consumption',
        responses: 'route-owned response and staged cleanup',
        head: 'not applicable',
        replacement: 'one application-owned parser; fields may occur before/after file parts',
      }
    ),
    surface(
      'extension-middleware-stages',
      'extension-middleware',
      prefix + 'extensions/composition.ts',
      'composeExtensionApplication',
      'all',
      'beforeRoutes / afterRoutes global middleware',
      'FM-018',
      'extensions/handler-lifetime.test.ts',
      {
        access: 'current API1 middleware has no per-route access declaration; core admission remains host-owned',
        csrf: 'handler-owned',
        validation: 'offline handler binding and named stage',
        responses: 'middleware may respond or call next; afterRoutes is dispatch fallback, not observation',
        head: 'middleware sees HEAD',
        replacement: 'named handler/middleware resolution; convert deliberately to scoped hooks/fallback',
      }
    ),
    surface(
      'extension-api-metadata',
      'api-provider-contract',
      prefix + 'api-routes/route-registry.ts',
      'registerHookApiRoutes',
      'declared method',
      'configuration.apiRoutesHooks providers',
      'FM-017',
      'unit/api-routes.test.ts',
      {
        access: 'declaration metadata does not grant runtime access',
        csrf: 'actual handler/route access remains authoritative',
        validation: 'duplicate contract detection; source Zod metadata',
        responses: 'merged documentation metadata, not an automatic HTTP dispatcher',
        head: 'actual registered handler determines HEAD',
        replacement: 'contract collisions rejected; explicit extension route needed for dispatch',
      }
    ),
    surface(
      'extension-http-contract',
      'extension-contract',
      prefix + 'extensions/contract.ts',
      'ExtensionRoute',
      'declared method',
      'installed extension declarations',
      'FM-017',
      'extensions/head-routes.test.ts',
      {
        access: 'literal public OR non-empty ordered policy-name array; csrf only when explicitly named in access',
        csrf: 'extension access chain may name csrf => apiProtect',
        validation: 'offline names, handler bindings and replacements; domain inputs remain handler-owned',
        responses: 'selected handler owns metadata',
        head: 'explicit HEAD sorted before GET independent of declaration/provider order',
        replacement:
          'stable route.name and replaces:true; same core name/method/path required; missing replacement rejected',
        testReferences: [
          {
            file: test('extensions/head-routes.test.ts'),
            scope: 'public GET read vs protected HEAD headers, both orders, standalone and production',
          },
          { file: test('extensions/resolution.test.ts'), scope: 'stable names, access and deliberate replacement' },
          {
            file: test('extensions/handler-lifetime.test.ts'),
            scope: 'beforeRoutes/afterRoutes and owned handler work',
          },
        ],
        note: 'Open supported contract, not a claim external institution declarations have been located; FM-006/FM-040 own WSU discovery/qualification',
      }
    ),
  ];
  const exampleFile = 'support/documentation/examples/hook-override.ts';
  inputs.add(exampleFile);
  const examples = fromSource(exampleFile)
    .registerRedboxExtension()
    .routes.map(route => ({
      ...route,
      provider: 'documentation example (opt-in; not a bundled production route)',
      ownerTask: 'FM-037',
      testReferences: [{ file: test('extensions/HookExample.test.ts'), scope: 'compiled example route' }],
      source: sourceReference(exampleFile, 'registerRedboxExtension'),
      head: 'implicit GET; extension explicit HEAD precedence applies',
      csrf: 'none (explicit public GET)',
      validation: 'none; response {ready:boolean}',
      replacement: route.replaces ?? false,
    }));
  const bundled = fs
    .readdirSync(path.join(root, 'packages'))
    .sort()
    .flatMap(name => {
      const file = `packages/${name}/src/extension.ts`;
      if (!fs.existsSync(path.join(root, file))) return [];
      inputs.add(file);
      const fields = inspectBundledRegistration(file);
      return [
        {
          provider: name,
          source: file,
          httpContributions: fields,
          ownerTask: 'FM-038',
          testReferences: [
            {
              file: 'support/specs/fastify-migration/evidence/FM-002.test.cjs',
              scope: 'bundled registration source audit; no HTTP route asserted',
            },
          ],
          note:
            name === 'redbox-hook-dev'
              ? 'Config landingPath is consumed by core pageRootRoute, not an independent route'
              : 'Non-HTTP modules/jobs/migrations only',
        },
      ];
    });
  const declaredApis = routes.filter(route => route.kind === 'api');
  assert.equal(declaredApis.length, api.length, 'API registry/production manifest count drift');
  for (const route of api)
    assert.equal(
      routes.filter(
        row =>
          row.apiDeclaration &&
          row.original.method === route.method &&
          row.original.path === route.path &&
          row.controller === route.controller &&
          row.action === route.action
      ).length,
      1,
      'API not owned exactly once: ' + route.path
    );
  // Include relative executable source dependencies: imported schema/refinement
  // changes must be visible even when the route's shape/name/count is unchanged.
  for (const file of inputs) {
    if (!file.endsWith('.ts')) continue;
    for (const node of parse(file).statements) {
      if (
        (!ts.isImportDeclaration(node) && !ts.isExportDeclaration(node)) ||
        !node.moduleSpecifier ||
        node.importClause?.isTypeOnly ||
        node.isTypeOnly
      )
        continue;
      const specifier = node.moduleSpecifier.text;
      if (!specifier.startsWith('.')) continue;
      const stem = path.posix.normalize(path.posix.join(path.posix.dirname(file), specifier)).replace(/\.js$/, '');
      const dependency = [stem + '.ts', stem + '/index.ts'].find(candidate =>
        fs.existsSync(path.join(root, candidate))
      );
      if (dependency) inputs.add(dependency);
    }
  }
  const sourceHashes = Object.fromEntries([...inputs].sort().map(file => [file, sha256(read(file))]));
  const inventory = {
    formatVersion: 1,
    scope:
      'current core production declarations, configurable integration boundaries, bundled registrations and opt-in documentation example',
    generation:
      'node --no-experimental-strip-types support/specs/fastify-migration/evidence/generate-FM-002.cjs [--check]',
    identityRule:
      'core-http-${lowercase declared method}-${first 16 hex SHA256(canonicalHttpRoutePath(runtimePath))}; existing per-method replacement names unchanged; all uses a new collection identity and lists concrete replacementTargets',
    allMethodSemantics:
      'Express ALL handles every supported Express/Node method. Seven replacementTargets reproduce the existing offline manifest reservations, not a restriction of runtime ALL. FM-003 characterizes other methods.',
    policyConfiguration: configuration,
    sourceHashes,
    counts: {
      routes: routes.length,
      api: declaredApis.length,
      otherDeclared: routes.length - declaredApis.length,
      integrations: integrations.length,
      exampleRoutes: examples.length,
      bundledProviders: bundled.length,
    },
    routes,
    integrations,
    examples,
    bundled,
  };
  validateInventory(inventory);
  return inventory;
}

function validateInventory(inventory) {
  const tasks = new Set(
    [...read('support/specs/fastify-migration/tasks.md').matchAll(/\*\*(FM-\d+) /g)].map(match => match[1])
  );
  const names = new Set();
  for (const row of [...inventory.routes, ...inventory.integrations, ...inventory.examples, ...inventory.bundled]) {
    assert(
      typeof row.ownerTask === 'string' && /^FM-\d{3}$/.test(row.ownerTask) && tasks.has(row.ownerTask),
      'Missing/unknown single task owner: ' + (row.name ?? row.provider)
    );
    assert(Array.isArray(row.testReferences) && row.testReferences.length, 'Missing executable test reference');
    for (const reference of row.testReferences) {
      assert(
        typeof reference.file === 'string' && /\.test\.(?:ts|cjs)$/.test(reference.file),
        'Invalid executable test reference: ' + reference.file
      );
      assert(fs.existsSync(path.join(root, reference.file)), 'Missing test: ' + reference.file);
      assert(typeof reference.scope === 'string' && reference.scope.trim(), 'Missing test coverage scope');
    }
    if (row.name) {
      assert(!names.has(row.name), 'Duplicate stable identity: ' + row.name);
      names.add(row.name);
    }
  }
  return true;
}

function checkInventory(inventory, filename) {
  assert.equal(
    fs.readFileSync(filename, 'utf8'),
    JSON.stringify(inventory, null, 2) + '\n',
    'Inventory drift: inspect the source/ownership change, then regenerate deliberately'
  );
}
if (require.main === module) {
  const inventory = collectInventory();
  const filename = path.join(__dirname, 'FM-002.inventory.json');
  if (process.argv.includes('--check')) checkInventory(inventory, filename);
  else fs.writeFileSync(filename, JSON.stringify(inventory, null, 2) + '\n');
  console.log(JSON.stringify(inventory.counts));
  console.log(
    process.argv.includes('--check')
      ? 'Inventory matches source; ownership/test references valid.'
      : 'Inventory written.'
  );
}
module.exports = { collectInventory, validateInventory, checkInventory, identity, inspectBundledRegistration };
