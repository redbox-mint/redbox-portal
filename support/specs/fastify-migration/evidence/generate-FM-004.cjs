'use strict';

// Source audit only: no host, module, provider or resource factory is invoked.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');
const { collectInventory, checkInventory } = require('./generate-FM-002.cjs');
const root = path.resolve(__dirname, '../../../..');
const ts = require(path.join(root, 'node_modules/typescript'));
const prefix = 'packages/redbox-core/src/';
const http = prefix + 'http/express/';
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const sha256 = value => createHash('sha256').update(value).digest('hex');

// Annotations describe action preludes, after the production prefix and the
// row's effective policies/CSRF. Branch details remain in the source operation
// index, with conditions, callback/function scopes and exact source positions.
const profiles = {
  recordTypeApiRoutes: [
    'mountRecordTypeRoutes',
    'Zod request -> brand context -> record-type lookup -> discovery/response',
  ],
  metadataReadRoutes: [
    'mountMetadataReadRoutes',
    'Zod if declared -> context -> action scalar/target validation -> tenant-qualified metadata/dashboard domain operation',
  ],
  configurationReadRoutes: [
    'mountConfigurationReadRoutes',
    'wildcard join -> Zod -> context -> tenant-qualified configuration/translation/form operation',
  ],
  appConfigFormReadRoute: [
    'mountConfigurationReadRoutes',
    'context -> nonempty appConfigId -> tenant-qualified form lookup',
  ],
  configurationWriteRoutes: [
    'mountConfigurationWriteRoutes',
    'wildcard join -> retired-operation denial if selected -> body shape -> Zod if declared -> context -> action scalar/target checks -> configuration/dashboard domain operation',
  ],
  formDeliveryRoutes: [
    'mountFormDeliveryRoutes',
    'context -> scalar query checks -> deliverForm (no OID: starting form lookup; OID: record existence, view/edit and brand checks, authoritative form/mismatch, form lookup) -> form projection/fingerprint before release',
  ],
  queryReadRoutes: [
    'mountQueryReadRoutes',
    'Zod if declared -> RecordAudit scalar/pagination checks if selected -> context/actor -> action scalar/pagination/date checks -> tenant/object-authorized query/report/audit operation',
  ],
  queryWriteRoutes: [
    'mountQueryWriteRoutes',
    'context -> actor -> brand Admin -> Zod -> reserved/consistent definition name -> tenant-qualified mutation -> audit',
  ],
  recordReadRoutes: [
    'mountRecordReadRoutes',
    'Zod if declared -> context/actor -> action inputs -> record lookup/brand/view authorization for object reads; list/search/download branches retain their own filters and checks',
  ],
  recordMutationRoutes: [
    'mountRecordMutationRoutes',
    'context -> actor -> brand membership -> body shape -> Zod if declared -> operation/concurrency/schema-header checks -> create: type lookup, metadata/ACL body checks and create domain operation; existing record: lookup/brand/edit authorization, type lookup, selected ACL/body checks and domain operation -> domain preconditions/validation/save',
  ],
  harvestMutationRoutes: [
    'mountHarvestMutationRoutes',
    'context -> actor -> brand membership -> Zod -> record-type existence -> tracked harvest rejects updateMode if supplied -> tracked/legacy/compatibility harvest domain validation and create authorization',
  ],
  identityAdministrationRoutes: [
    'mountIdentityAdministrationRoutes',
    'context -> actor -> brand membership -> Admin unless UserController self operation -> body shape -> Zod if declared -> brand roles -> browser create/update details shape -> create username scalar/lookup and existing-browser-account refusal OR selected user identifier -> target-brand/shared-account checks -> remaining action payload/role checks -> identity mutation/audit; list/create role actions branch after brand roles',
  ],
  identityLinkRoutes: [
    'mountIdentityLinkRoutes',
    'context -> actor -> brand Admin -> Zod if declared -> body shape -> action inputs -> target identifier/brand checks where required -> identity operation',
  ],
  vocabularyIntegrationRoutes: [
    'mountVocabularyIntegrationRoutes',
    'context -> requireAdministrator -> optional browser sync body normalization -> Zod -> RVA/version checks -> existing vocabulary brand check for sync -> provider operation/audit',
  ],
  vocabularyAdministrationRoutes: [
    'mountVocabularyAdministrationRoutes',
    'context -> actor -> brand Admin -> Zod -> vocabulary lookup/brand check if id -> entry sanitization -> action payload/pagination checks -> vocabulary operation/audit',
  ],
  siemWriteRoutes: [
    'mountSiemWriteRoutes',
    'context -> requireAdministrator -> Zod -> selected SIEM configuration/test operation -> audit',
  ],
  adminOperationRoutes: [
    'mountAdminOperationRoutes',
    'if HEAD: 405/Allow GET; otherwise context -> requireAdministrator -> Zod -> selected administration operation/audit',
  ],
  brandingOperationRoutes: [
    'mountBrandingOperationRoutes',
    'context -> requireAdministrator -> preview alias reads current draft revision if applicable -> Zod -> branding domain checks/operation -> audit on writes',
  ],
  brandingUploadRoutes: [
    'mountBrandingUploadRoutes',
    'context -> requireAdministrator -> multipart staging -> single expected file/face byte limit -> file schema -> field request Zod -> staged bytes -> branding domain operation/audit -> staging cleanup',
  ],
  figshareAdministrationRoutes: [
    'mountFigshareAdministrationRoutes',
    'context -> requireAdministrator -> Zod -> resource identifier/pagination/revision checks -> selected vocabulary/provider operation with brandId/userId context -> audit',
  ],
  integrationOperationRoutes: [
    'mountIntegrationOperationRoutes',
    'context -> requireAdministrator -> Zod -> index record-brand check or notification recipient/template checks -> selected operation/audit',
  ],
  datastreamReadRoutes: [
    'mountDatastreamReadRoutes',
    'attachment HEAD next() after policies -> context -> oid scalar -> actor -> record existence/brand -> view authorization -> datastream/filename validation -> attachment membership -> storage read -> response/pipeline',
  ],
  datastreamWriteRoutes: [
    'mountDatastreamWriteRoutes',
    'context -> actor -> brand membership -> request Zod with empty body -> concurrency/schema-header checks -> record existence/brand/edit authorization -> multipart staging -> file validation -> repeat record authorization -> updateMeta -> datastream finalization -> staging cleanup',
  ],
  authenticationRoutes: [
    'mountAuthenticationRoutes',
    'action-specific authentication prelude; see authenticationOrder',
  ],
  csrfTokenRoute: [
    'mountCsrfTokenRoute',
    'canonical-origin/fetch-site check -> generate token -> await session save -> no-store response',
  ],
  pageRoutes: [
    'mountPageRoutes',
    'context -> actor cross-brand denial -> scalar query/oid checks -> preparePage (CSRF token/locals) -> selected record existence/brand/view-or-edit or create authorization -> render/redirect',
  ],
  pageRootRoute: [
    'mountPageRoot',
    'deployment redirect target validated at mount -> redirect; no route access/CSRF/context check',
  ],
  formVocabularyRoutes: [
    'mountFormVocabularyRoutes',
    'context -> actor -> brand membership -> body shape -> action scalar/numeric/options checks -> tenant-qualified vocabulary/lookup operation',
  ],
  configuredActionRoutes: [
    'mountConfiguredActionRoutes',
    'context -> actor -> brand membership -> configured action existence -> body shape -> action.authorize -> action.execute -> audit',
  ],
  resumableUploadRoutes: [
    'mountResumableUploadRoutes',
    'uploads.handle -> closing gate -> context -> actor -> brand membership -> attachId validation -> pending-create or record existence/brand/edit authorization -> disk-space check -> TUS protocol and stored actor/brand/record ownership -> audit',
  ],
  progressOperationRoutes: [
    'mountProgressOperationRoutes',
    'context -> actor -> brand membership -> retired subscribe/unsubscribe 410 before body checks -> body/query/room validation -> room/object authorization -> progress operation/audit',
  ],
  progressSocketGrantRoute: [
    'mountProgressOperationRoutes',
    'context -> actor -> brand membership -> issue bounded expiring credential-bound grant; no body validation',
  ],
  brandingDeliveryRoutes: [
    'mountBrandingDeliveryRoutes',
    'delivery action -> method-specific brand/preview-token/asset containment checks -> bytes/conditional response; no common requireAdministrator prelude',
  ],
  fontDeliveryRoute: [
    'mountBrandingDeliveryRoutes',
    'renderFont -> scalar brand/hash/file checks -> verified/cached font bytes -> conditional 304 or HEAD metadata-only 200 or bytes; no route policy context',
  ],
  dynamicAssetRoutes: [
    'mountDynamicPageAssets',
    'fill absent brand/portal params from session/default BEFORE policies -> context -> persist brand/portal in session -> config asset allowlist OR scalar queries then record brand/view-or-edit/create authorization for form templates -> selected template extraction/compile',
  ],
};

// These branches interleave lookups/authorization and validation differently
// from their collection's default. Key by collection AND action: e.g. the two
// search actions have different pagination, and subscribe also names a grant.
const actionOrders = {
  configurationReadRoutes: {
    getForm:
      'wildcard join -> Zod -> context -> tenant-qualified form lookup/existence -> optional OID record lookup/brand check (failure leaves operations empty) -> validation-operation discovery -> public form projection',
  },
  queryReadRoutes: {
    executeNamedQuery:
      'Zod (pagination strings only) -> context/actor -> queryName scalar -> tenant-qualified named-query configuration lookup -> missing query 400 -> numeric start/rows validation -> performNamedQueryFromConfig',
    search:
      'search query extractor/normalization -> Zod -> context/actor -> type scalar -> optional record-type lookup/searchCore check OR core scalar -> normalize search inputs -> workflow/searchStr scalars -> exact/facet field checks -> searchFuzzy',
    getAuditData:
      'all query scalar checks -> page/pageSize numeric checks -> context/actor -> OID scalar -> RecordAuditViews.audit: record existence/brand/view authorization -> form label lookup -> audit date/range checks -> audit read/diffs/filter/response',
    getIntegrationAuditData:
      'all query scalar checks -> page/pageSize numeric checks -> context/actor -> OID scalar -> RecordAuditViews.integrationAudit: OID nonempty -> brand Admin -> record existence/brand -> date/range/status checks -> integration trace read',
  },
  recordReadRoutes: {
    search:
      'context/actor -> type scalar -> record-type lookup/existence -> normalize search inputs -> rows/page numeric checks and maximum -> core/workflow/searchStr scalars -> exact/facet field checks -> searchFuzzy',
    getRecordAudit:
      'Zod -> context/actor -> OID scalar -> record existence/brand/view authorization -> dateFrom/dateTo scalar/date/range checks -> record audit read',
    getMeta:
      'Zod if declared -> context/actor -> OID scalar -> record existence/brand/view authorization -> browser form/client metadata projection if selected -> include/includeRelationships scalars -> optional relationship scalar/depth checks -> relationship graph read/filter -> API schema discovery if selected -> response',
    getRelatedRecords:
      'context/actor -> OID scalar -> record existence/brand/view authorization -> relationship scalar/depth checks -> relationship graph read/filter -> response',
  },
  identityLinkRoutes: {
    searchLinkCandidates:
      'context -> actor -> brand Admin -> Zod if declared -> body shape -> primaryUserId text/identifier -> target lookup/brand membership -> search query text checks -> searchLinkCandidates',
    listUsers:
      'context -> actor -> brand Admin -> Zod -> body shape -> search field/query text and allowlist checks -> brand users read -> link/disabled-state enrichment -> user filtering/sanitization -> numeric page/pageSize checks -> page slice/response',
  },
  datastreamReadRoutes: {
    getAttachments:
      'context -> OID scalar -> actor -> record existence/brand -> view authorization -> attachment list read -> JSON; no datastream identifier/filename validation',
    listDatastreams:
      'context -> OID scalar -> actor -> record existence/brand -> view authorization -> attachment list read -> paged JSON envelope; no datastream identifier/filename validation',
  },
  progressOperationRoutes: {
    start:
      'context -> actor -> brand membership -> body shape -> relatedRecordId shape/room-object authorization -> progress field checks -> progress.start -> socket emit -> audit',
    update:
      'context -> actor -> brand membership -> body shape -> progress identifier -> existing progress lookup -> started_by and stored related-record authorization -> proposed related-record authorization -> unchanged record ownership -> progress field checks -> progress.update -> socket emit -> audit',
    stop: 'context -> actor -> brand membership -> body shape -> progress identifier -> existing progress lookup -> started_by and stored related-record authorization -> proposed related-record authorization -> unchanged record ownership -> progress field checks -> progress.finish -> socket emit -> audit',
    progress:
      'context -> actor -> brand membership -> body shape -> fq parse/shape/allowed scalar fields -> brand-filtered progress read -> per-row related-record authorization/filter -> response',
    subscribe: 'context -> actor -> brand membership -> retired operation 410; no body/room validation',
    unsubscribe: 'context -> actor -> brand membership -> retired operation 410; no body/room validation',
  },
};

function authenticationOrder(row) {
  if (row.action === 'disallowedHeadRequestHandler') return '405; shared session/version/Passport work has already run';
  if (row.action === 'logout' && row.method === 'get')
    return '405/Allow POST; shared session/version/Passport work has already run';
  if (row.action === 'info') return 'fresh session identity -> branded context/membership if branded -> profile';
  if (row.action === 'logout')
    return 'selected brand/portal -> fresh session identity/brand membership -> allowed logout destination -> await logout/destroy -> audit -> clear cookie/redirect';
  if (row.action === 'beginOidc')
    return 'selected brand/portal -> session context/safe redirect -> bounded provider id -> provider state/PKCE/session persistence/redirect';
  return `${row.action === 'aafLogin' ? 'assertion string/size check -> ' : ''}selected context (${row.action === 'openidConnectLogin' ? 'saved OIDC brand/portal' : 'path/body/query/session/default'}) -> local credential bounds if local -> provider authentication -> fresh identity/brand membership -> profile -> await login rotation/save -> audit -> response; failures emit loginFailure and may render branded failure`;
}

const boundaryOrders = {
  health:
    'host exact GET health/readiness -> response before ordinary admission, lifetime, parser/session/authentication',
  'static-assets':
    'ordinary shared prefix -> all earlier matched routes -> GET/HEAD -> URI/manifest containment -> cookie suppression for immutable assets -> page headers -> awaited sendFile; no route policies, shared session work still occurs',
  'core-page-not-found':
    'shared prefix -> earlier routes/static/extensions -> OPTIONS next(route) -> nocache/brand/browseractor/checkauth -> unsafe-method CSRF -> cross-brand actor -> scalar query -> preparePage -> 404',
  'core-unmatched':
    'ordinary admission/lifetime -> router attempt (shared parser/session/authentication if mounted) -> host JSON 404',
  'core-progress-transport':
    'provider client JS is public; Engine.IO handshake: not closing + canonical origin; namespace: consume one-use expiring grant -> fresh identity/actor/brand -> connection; subscribe/emit: fresh identity -> room/object authorization -> live connection/subscription check',
  'conditional-raw-provider':
    'shared prefix except excluded body parser -> trusted session/default context -> scoped JSON/form parser extended:false -> mandatory pilot policies THEN configured chain (duplicates retained) -> unsafe-method apiProtect -> URL body check -> send-token override OR write audit -> provider handle ready/closing gate -> provider protocol',
  'core-companion-upgrade':
    'matching mount/path -> closing/readiness/origin -> tracked upload token OR bounded OAuth callback token -> unlistened bridge; no Express router/session/CSRF chain on upgrade',
  'core-authentication-providers':
    'shared session deserialize and route/provider-specific checks; see authentication route rows and identityProviders source',
  'core-multipart-parser':
    'owning route policies/CSRF and action prelude -> multipart bounded staging -> callback validation/finalization -> actual write/abort completion -> staging cleanup (failed deletes retained)',
  'extension-middleware-stages':
    'shared prefix -> beforeRoutes middleware and declared extension routes -> core routes/static -> afterRoutes middleware -> branded fallback; middleware can terminate before later guards',
  'extension-api-metadata': 'contract registration/duplicate validation only; no dispatch or implicit runtime access',
  'extension-http-contract':
    'shared prefix -> explicit HEAD-before-GET registration -> public OR ordered named policies; csrf maps to apiProtect only when named -> retained handler; domain/validation remain handler-owned',
};

// This is a lexical operation index, NOT an executed or interprocedural trace.
// Including scope and control ancestors prevents a callback definition, catch,
// alternative branch or nested helper from looking like an unconditional step.
function sourceUnit(file, symbol) {
  const ast = ts.createSourceFile(file, read(file), ts.ScriptTarget.Latest, true);
  let selected;
  const find = node => {
    if (
      (ts.isFunctionDeclaration(node) || ts.isClassDeclaration(node) || ts.isInterfaceDeclaration(node)) &&
      node.name?.text === symbol
    )
      selected = node;
    ts.forEachChild(node, find);
  };
  find(ast);
  assert(selected, `Missing source unit ${file}#${symbol}`);
  const line = node => ast.getLineAndCharacterOfPosition(node.getStart(ast)).line + 1;
  const compact = node => node.getText(ast).replace(/\s+/g, ' ');
  const operations = [];
  const scopes = [];
  const scopeIds = new Map();
  const operation = (node, kind, expression, under) => {
    const key = JSON.stringify(under);
    if (!scopeIds.has(key)) {
      scopeIds.set(key, scopes.length);
      scopes.push(under);
    }
    operations.push([line(node), kind, expression, scopeIds.get(key)]);
  };
  const visit = (node, under) => {
    let scope = under;
    if (ts.isFunctionLike(node) && node !== selected)
      scope = [...scope, `function@${line(node)} ${node.name ? compact(node.name) : '(callback/helper)'}`];
    if (ts.isIfStatement(node)) {
      visit(node.expression, [...scope, `if-test@${line(node)}`]);
      visit(node.thenStatement, [...scope, `if ${compact(node.expression)}`]);
      if (node.elseStatement) visit(node.elseStatement, [...scope, `else ${compact(node.expression)}`]);
      return;
    }
    if (ts.isConditionalExpression(node)) {
      visit(node.condition, [...scope, `ternary-test@${line(node)}`]);
      visit(node.whenTrue, [...scope, `when ${compact(node.condition)}`]);
      visit(node.whenFalse, [...scope, `otherwise ${compact(node.condition)}`]);
      return;
    }
    if (ts.isCaseClause(node)) scope = [...scope, `case ${compact(node.expression)}`];
    if (ts.isDefaultClause(node)) scope = [...scope, 'default case'];
    if (ts.isCatchClause(node)) scope = [...scope, `catch@${line(node)}`];
    if (ts.isForStatement(node) || ts.isForOfStatement(node) || ts.isWhileStatement(node))
      scope = [...scope, `loop@${line(node)}`];
    if (ts.isCallExpression(node) || ts.isNewExpression(node)) operation(node, 'call', compact(node.expression), scope);
    if (ts.isThrowStatement(node)) operation(node, 'throw', compact(node.expression), scope);
    ts.forEachChild(node, child => visit(child, scope));
  };
  visit(selected, []);
  return { file, symbol, line: line(selected), sha256: sha256(selected.getText(ast)), scopes, operations };
}

function responseBoundary(row) {
  if (row.source.export === 'resumableUploadRoutes')
    return 'TUS writes req/res directly; httpAction awaits handle and post-response audit; Express session end wrapper still applies. Port must retain explicit session/completion/error ownership.';
  if (row.source.export === 'datastreamReadRoutes' && !['getAttachments', 'listDatastreams'].includes(row.action))
    return 'Authorized pipeline(readstream,res), or buffered fallback; action awaits stream completion and releases pending streams on disconnect/error. No generic API data envelope for bytes; Express session end still applies.';
  if (row.source.export === 'csrfTokenRoute') return 'Explicit await session.save before token JSON.';
  if (row.source.export === 'authenticationRoutes')
    return 'Successful login and POST logout explicitly await session operations; OIDC begin delegates save-before-redirect to provider; shared session middleware still runs for HEAD/405.';
  if (['fontDeliveryRoute', 'brandingDeliveryRoutes'].includes(row.source.export))
    return 'Custom buffered asset/document/conditional response; selected delivery method owns checks and headers; not a generic API envelope. Express session end still applies.';
  if (row.action === 'downloadRecs')
    return 'Awaited pipeline(storage.exportAllPlans(...),res) after format/date checks, using actor/brand/role-filtered export; stream action lifetime and Express session end still apply.';
  if (row.action === 'downloadCSV')
    return 'Buffered CSV attachment response; action lifetime and Express session end still apply.';
  return 'Ordinary retained action and Express response/session completion; custom HTML/JSON/status choices remain in source.';
}

// Extract registration from the real production method, excluding the callbacks
// it passes as collaborators. This is mount precedence, not a request execution
// trace: a prior route/middleware may terminate or fall through.
function productionStages() {
  const file = prefix + 'application/portal/http.ts';
  const ast = ts.createSourceFile(file, read(file), ts.ScriptTarget.Latest, true);
  const owner = ast.statements.find(node => ts.isClassDeclaration(node) && node.name?.text === 'PortalHttp');
  const prepare = owner?.members.find(node => ts.isMethodDeclaration(node) && node.name.getText(ast) === 'prepare');
  assert(prepare?.body, 'Missing production PortalHttp.prepare');
  const stages = [];
  const visit = (node, conditions) => {
    if (ts.isFunctionLike(node)) return;
    if (ts.isIfStatement(node)) {
      visit(node.thenStatement, [...conditions, node.expression.getText(ast)]);
      if (node.elseStatement) visit(node.elseStatement, [...conditions, `!(${node.expression.getText(ast)})`]);
      return;
    }
    if (ts.isCallExpression(node)) {
      const target = node.expression.getText(ast);
      if (
        /^http\.(?:mount\w+|prepareHttpMiddleware)$/.test(target) ||
        ['router.use', 'this.portal.prepareExtensions', 'this.sockets.attach', 'this.companion.initialize'].includes(
          target
        )
      ) {
        stages.push({
          index: stages.length,
          file,
          line: ast.getLineAndCharacterOfPosition(node.getStart(ast)).line + 1,
          target,
          arguments: node.arguments.map(argument => {
            if (ts.isCallExpression(argument)) return argument.expression.getText(ast) + '(...)';
            return ts.isObjectLiteralExpression(argument) ? '{...collaborators}' : argument.getText(ast);
          }),
          conditions,
        });
        return;
      }
    }
    ts.forEachChild(node, child => visit(child, conditions));
  };
  visit(prepare.body, []);
  assert.equal(stages[0]?.arguments[0], 'http.pageResponseHeaders(...)');
  assert.equal(stages[1]?.target, 'http.prepareHttpMiddleware');
  assert.equal(stages.at(-1)?.arguments[0], 'http.httpErrorHandler(...)');
  return stages;
}

function collectOrdering() {
  const inventory = collectInventory();
  checkInventory(inventory, path.join(__dirname, 'FM-002.inventory.json'));
  const stages = productionStages();
  const units = {};
  const unit = (file, symbol) => {
    const key = `${file}#${symbol}`;
    units[key] ??= sourceUnit(file, symbol);
    return key;
  };
  const routes = inventory.routes.map(row => {
    const profile = profiles[row.source.export];
    assert(profile, `Unreviewed collection ${row.source.export}`);
    const file = row.implementation.file;
    const symbol = file.endsWith('/recordSchemaReads.ts') ? 'mountRecordSchemaReadRoutes' : profile[0];
    const mounts = stages.filter(stage => stage.target === 'http.' + profile[0]);
    assert.equal(mounts.length, 1, `Expected one production mount for ${row.name}: ${profile[0]}`);
    return {
      name: row.name,
      method: row.method,
      path: row.path,
      controller: row.controller,
      action: row.action,
      collection: row.source.export,
      sharedPrefix: 'ordinary-production',
      productionStage: mounts[0].index,
      beforePolicies:
        row.source.export === 'dynamicAssetRoutes'
          ? 'Fill absent brand/portal from session/default.'
          : 'None beyond shared prefix and route matching.',
      policies: row.access.effectivePolicies,
      csrf: row.csrf.effective,
      head: row.head,
      actionOrder: file.endsWith('/recordSchemaReads.ts')
        ? 'Zod -> context/actor -> selected schema resolver (create/update authorization or immutable discovery) -> safe problem/conditional response'
        : row.source.export === 'authenticationRoutes'
          ? authenticationOrder(row)
          : (actionOrders[row.source.export]?.[row.action] ?? profile[1]),
      sourceUnit: unit(file, symbol),
      requestSchema: row.original.request ?? null,
      responseBoundary: responseBoundary(row),
      testReferences: row.testReferences,
    };
  });
  for (const [file, symbol] of [
    [http + 'ExpressHost.ts', 'ExpressHost'],
    [prefix + 'application/portal/http.ts', 'PortalHttp'],
    [http + 'middleware.ts', 'prepareHttpMiddleware'],
    [http + 'policies.ts', 'resolveEffectivePolicies'],
    [http + 'policies.ts', 'createHttpPolicies'],
    [http + 'csrf.ts', 'createHttpCsrf'],
    [http + 'actors.ts', 'requireAdministrator'],
    [http + 'resumableUploads.ts', 'ResumableUploads'],
    [http + 'brandingDelivery.ts', 'BrandingDelivery'],
    [prefix + 'forms/FormDelivery.ts', 'deliverForm'],
  ])
    unit(file, symbol);
  const boundaries = inventory.integrations.map(row => {
    const order = boundaryOrders[row.name] ?? boundaryOrders[row.kind];
    assert(order, `Unreviewed integration ${row.name}`);
    return {
      name: row.name,
      kind: row.kind,
      order,
      source: row.source,
      sourceUnit: unit(row.source.file, row.source.export),
    };
  });
  const inputs = new Set([
    ...Object.keys(inventory.sourceHashes),
    ...Object.values(units).map(value => value.file),
    __filename.slice(root.length + 1),
    'app.express.cjs',
    prefix + 'application/Application.ts',
    prefix + 'application/portal/application.ts',
    prefix + 'application/portal/host.ts',
    prefix + 'application/portal/data.ts',
    prefix + 'application/portal/providers.ts',
    prefix + 'middleware/requestLifetime.ts',
    prefix + 'persistence/runtime.ts',
    prefix + 'queues/AgendaQueue.ts',
    prefix + 'queues/ScheduledWork.ts',
    prefix + 'pages/Artifacts.ts',
    prefix + 'branding/BrandingLogo.ts',
    prefix + 'extensions/integrationModule.ts',
  ]);
  // Cover implementation dependencies of the additional lifecycle/domain units,
  // including type imports: their concrete operations are part of this audit.
  for (const file of inputs) {
    if (!file.endsWith('.ts')) continue;
    const ast = ts.createSourceFile(file, read(file), ts.ScriptTarget.Latest, true);
    for (const node of ast.statements) {
      if ((!ts.isImportDeclaration(node) && !ts.isExportDeclaration(node)) || !node.moduleSpecifier) continue;
      const specifier = node.moduleSpecifier.text;
      if (!specifier.startsWith('.')) continue;
      const stem = path.posix.normalize(path.posix.join(path.posix.dirname(file), specifier)).replace(/\.js$/, '');
      const dependency = [stem + '.ts', stem + '/index.ts'].find(candidate =>
        fs.existsSync(path.join(root, candidate))
      );
      if (dependency) inputs.add(dependency);
    }
  }
  const result = {
    formatVersion: 1,
    generation:
      'node --no-experimental-strip-types support/specs/fastify-migration/evidence/generate-FM-004.cjs [--check]',
    scope:
      'FM-002 identities; default portalHttpPolicies configuration. Static source audit, not full-portal execution or Fastify qualification.',
    operationIndexSemantics:
      'operations tuples are [sourceLine, call-or-throw, expression, scopesIndex], in lexical AST preorder, not runtime/evaluation order. scopes retain branches and function/callback boundaries. Follow the named action branch and helper/domain source; do not execute this data as a pipeline. actionOrder is reviewed explanatory annotation, fingerprinted by --check.',
    sharedPrefixes: {
      'ordinary-production': [
        'ExpressHost exact GET health/readiness short-circuit OR ordinary ready admission',
        'beginHttpRequest + runAcceptedPersistenceWork + request AsyncLocalStorage; rootContext router',
        'pageResponseHeaders',
        'request chronicle (safe observation)',
        'JSON then urlencoded extended:true, 1mb each, except configured Companion prefix (multipart/TUS types are not consumed)',
        'owned session load; regenerate authenticated non-v6 session; Passport initialize/session deserialize',
        'extension beforeRoutes middleware + explicit extension routes/integrations (may respond)',
        'selected core mount in PortalHttp.prepare order; policies/CSRF/action as recorded on row',
      ],
    },
    counts: {
      routes: routes.length,
      api: inventory.counts.api,
      boundaries: boundaries.length,
      sourceUnits: Object.keys(units).length,
      productionStages: stages.length,
    },
    productionStages: stages,
    sourceHashes: Object.fromEntries([...inputs].sort().map(file => [file, sha256(read(file))])),
    routes,
    boundaries,
    units,
  };
  assert.equal(
    new Set(routes.map(row => row.name)).size,
    inventory.routes.length,
    'Every FM-002 identity must occur once'
  );
  return result;
}

function checkOrdering(value, filename) {
  assert.equal(
    read(path.relative(root, filename)),
    JSON.stringify(value, null, 2) + '\n',
    'FM-004 ordering/source drift: inspect and regenerate deliberately'
  );
}
if (require.main === module) {
  const value = collectOrdering();
  const filename = path.join(__dirname, 'FM-004.ordering.json');
  if (process.argv.includes('--check')) checkOrdering(value, filename);
  else fs.writeFileSync(filename, JSON.stringify(value, null, 2) + '\n');
  console.log(JSON.stringify(value.counts));
  console.log(process.argv.includes('--check') ? 'FM-004 matches source and FM-002 identities.' : 'FM-004 written.');
}
module.exports = { collectOrdering, checkOrdering };
