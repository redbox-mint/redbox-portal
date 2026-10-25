'use strict';

// Git-dependent generation only. The permanent test consumes the retained JSON
// and never needs this helper, Git history, infrastructure, or a .git directory.
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { createRequire } = require('node:module');
const root = path.resolve(__dirname, '../../../..');
const core = path.join(root, 'packages/redbox-core');
const fromCore = createRequire(path.join(core, 'package.json'));
const ts = fromCore('typescript');
const baseline = 'a49366803164429f9d8bdd249dadcdf856c9d13e';
const prefix = 'packages/redbox-core/src/';
let cached;

function collectInventory() {
  if (cached) return cached;
  const names = execFileSync('git', ['ls-tree', '-r', '--name-only', baseline], { cwd: root, encoding: 'utf8' })
    .trim()
    .split('\n');
  const files = new Set(names),
    sources = new Map(),
    modules = new Map();
  const read = file => {
    if (!sources.has(file))
      sources.set(file, execFileSync('git', ['show', baseline + ':' + file], { cwd: root, encoding: 'utf8' }));
    return sources.get(file);
  };
  function load(file) {
    if (modules.has(file)) return modules.get(file).exports;
    const module = { exports: {} };
    modules.set(file, module);
    const code = ts.transpileModule(read(file), {
      compilerOptions: {
        target: ts.ScriptTarget.ES2022,
        module: ts.ModuleKind.CommonJS,
        esModuleInterop: true,
      },
      fileName: file,
    }).outputText;
    const localRequire = specifier => {
      if (!specifier.startsWith('.')) return fromCore(specifier);
      const stem = path.posix.normalize(path.posix.join(path.posix.dirname(file), specifier));
      const selected = [stem + '.ts', stem + '/index.ts', stem].find(candidate => files.has(candidate));
      if (!selected) throw new Error('Missing baseline dependency ' + file + ' -> ' + specifier);
      return load(selected);
    };
    new Function('require', 'module', 'exports', '__filename', '__dirname', code)(
      localRequire,
      module,
      module.exports,
      path.join(root, file),
      path.dirname(path.join(root, file))
    );
    return module.exports;
  }
  const current = file => require(path.join(core, 'src', file));
  const groups = [
    ['http/express/apiManifest.ts', 'ownedHttpDeclarations'],
    ['http/express/login.ts', 'authenticationRoutes'],
    ['http/express/csrf.ts', 'csrfTokenRoute'],
    ['http/express/configuration.ts', 'appConfigFormReadRoute'],
    ['http/express/pages.ts', 'pageRootRoute'],
    ['http/express/pages.ts', 'pageRoutes'],
    ['http/express/formVocabulary.ts', 'formVocabularyRoutes'],
    ['http/express/configuredActions.ts', 'configuredActionRoutes'],
    ['http/express/resumableUploads.ts', 'resumableUploadRoutes'],
    ['http/express/progressOperations.ts', 'progressOperationRoutes'],
    ['http/express/progressOperations.ts', 'progressSocketGrantRoute'],
    ['http/express/pageAssets.ts', 'brandingDeliveryRoutes'],
    ['http/express/pageAssets.ts', 'fontDeliveryRoute'],
    ['http/express/pageAssets.ts', 'dynamicAssetRoutes'],
  ];
  const declarations = groups.flatMap(([file, exported]) => {
    const value = current(file)[exported];
    return (Array.isArray(value) ? value : [value]).map(route => ({ ...route, declaration: prefix + file, exported }));
  });
  // Find the actual owning export behind the aggregate API manifest by identity.
  for (const file of fs.readdirSync(path.join(core, 'src/http/express')).filter(f => f.endsWith('.ts'))) {
    if (['apiManifest.ts', 'index.ts', 'ownedRoutes.ts'].includes(file)) continue;
    const source = fs.readFileSync(path.join(core, 'src/http/express', file), 'utf8');
    if (!/export const \w+Routes\b/.test(source)) continue;
    const exports = current('http/express/' + file);
    for (const [name, value] of Object.entries(exports)) {
      if (!name.endsWith('Routes') || !Array.isArray(value)) continue;
      for (const route of declarations.filter(r => r.exported === 'ownedHttpDeclarations')) {
        if (value.some(r => r.method === route.method && r.path === route.path && r.action === route.action)) {
          route.declaration = prefix + 'http/express/' + file;
          route.exported = name;
        }
      }
    }
  }
  // This owner imports its declarations rather than re-exporting a route array.
  for (const route of declarations.filter(r => r.controller === 'webservice/RecordTypeController')) {
    route.declaration = prefix + 'http/express/recordTypes.ts';
    route.exported = 'mountRecordTypeRoutes';
  }
  const baselineApi = load(prefix + 'api-routes/route-registry.ts').registerCoreApiRoutes();
  const baselineRoutes = load(prefix + 'config/routes.config.ts').routes;
  const baselineMethods = new Map();
  const controllers = names.filter(f => f.startsWith(prefix + 'controllers/') && f.endsWith('.ts'));
  for (const file of controllers) {
    const source = read(file),
      ast = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true);
    const methods = new Map();
    function visit(node) {
      if (ts.isMethodDeclaration(node)) methods.set(node.name.getText(ast), node);
      ts.forEachChild(node, visit);
    }
    visit(ast);
    baselineMethods.set(file, { ast, methods });
  }
  function methodInputs(controller, action) {
    const file = prefix + 'controllers/' + controller + '.ts';
    const parsed = baselineMethods.get(file);
    const method =
      parsed?.methods.get(action) ??
      [...(parsed?.methods.values() ?? [])].find(
        node => node.name.getText(parsed.ast).toLowerCase() === action?.toLowerCase()
      );
    if (!method) {
      if (controller === 'DashboardConfigController')
        return { ...methodInputs('webservice/DashboardConfigController', action), inheritedVia: file };
      return { file, action, resolved: false, inputs: [], helpers: [] };
    }
    const inputs = [],
      helpers = [],
      visited = new Set();
    function walkMethod(node, name) {
      if (visited.has(name)) return;
      visited.add(name);
      function walk(child) {
        const text = child.getText(parsed.ast);
        if (
          (ts.isPropertyAccessExpression(child) || ts.isElementAccessExpression(child) || ts.isCallExpression(child)) &&
          /^(?:req\.(?:param\(|(?:body|query|params|headers|session)(?:\?\.|\.|\[|$)|(?:header|allParams|file|files|get)\()|(?:validated|query|body|bodyObj|details|params)\.)/.test(
            text
          )
        ) {
          // Keep maximal expressions, so req.param('name') does not become an anonymous req.param row.
          let statement = child;
          while (statement.parent && !ts.isStatement(statement)) statement = statement.parent;
          if (!inputs.some(input => input.expression === text))
            inputs.push({
              expression: text,
              context: statement.getText(parsed.ast).slice(0, 2000),
              line: parsed.ast.getLineAndCharacterOfPosition(child.getStart(parsed.ast)).line + 1,
              method: name,
            });
        }
        if (
          ts.isCallExpression(child) &&
          ts.isPropertyAccessExpression(child.expression) &&
          child.expression.expression.kind === ts.SyntaxKind.ThisKeyword
        ) {
          const called = child.expression.name.text;
          if (parsed.methods.has(called)) {
            helpers.push(called);
            walkMethod(parsed.methods.get(called), called);
          }
        }
        ts.forEachChild(child, walk);
      }
      walk(node.body);
    }
    walkMethod(method, action);
    return {
      file,
      action,
      resolved: true,
      line: parsed.ast.getLineAndCharacterOfPosition(method.getStart(parsed.ast)).line + 1,
      inputs,
      helpers: [...new Set(helpers)],
    };
  }
  const normalize = p =>
    p
      .replace(':key*', '*key')
      .replace('datastream*', 'datastream{*tail}')
      .replace(':token([a-z0-9]+)', ':token')
      .replace(/\/:([A-Za-z_]\w*)\?/g, '{/:$1}');
  const key = r => r.method + ' ' + normalize(r.path);
  const oldApi = new Map(baselineApi.map(r => [key(r), r]));
  const oldExtract = load(prefix + 'api-routes/request-extraction.ts');
  const newExtract = current('api-routes/request-extraction.ts');
  const oldHelpers = load(prefix + 'api-routes/helpers.ts');
  const newHelpers = current('api-routes/helpers.ts');
  const routeMap = new Map();
  for (const route of declarations) routeMap.set(key(route), route);
  const rows = [...routeMap.values()].map((route, i) => {
    let target = route.controller && route.action ? { controller: route.controller, action: route.action } : undefined;
    // Follow the original route target, including native action aliases.
    const oldTarget = Object.entries(baselineRoutes).find(([pattern]) => {
      const match = /^(?:(GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS|ALL)\s+)?(\/.*)$/i.exec(pattern);
      return (
        match &&
        normalize(match[2]) === normalize(route.path) &&
        (!match[1] || match[1].toLowerCase() === route.method || route.method === 'all')
      );
    });
    if (oldTarget && typeof oldTarget[1] === 'object' && oldTarget[1].controller) target = oldTarget[1];
    if (oldTarget && typeof oldTarget[1] === 'string' && oldTarget[1].includes('.')) {
      const split = oldTarget[1].lastIndexOf('.');
      target = { controller: oldTarget[1].slice(0, split), action: oldTarget[1].slice(split + 1) };
    }
    const old = target ? methodInputs(target.controller, target.action) : undefined;
    const ast = ts.createSourceFile(
      route.declaration,
      fs.readFileSync(path.join(root, route.declaration), 'utf8'),
      ts.ScriptTarget.Latest,
      true
    );
    const nativeSites = [];
    function walk(node) {
      const text = node.getText(ast);
      if (
        (ts.isPropertyAccessExpression(node) || ts.isElementAccessExpression(node)) &&
        /^(?:req\.(?:body|query|params|headers)|(?:body|query|q|params|details)\.)/.test(text) &&
        !nativeSites.some(s => s.expression === text)
      )
        nativeSites.push({ expression: text, line: ast.getLineAndCharacterOfPosition(node.getStart(ast)).line + 1 });
      ts.forEachChild(node, walk);
    }
    walk(ast);
    const auth = route.declaration.endsWith('/login.ts');
    const disposition = auth
      ? 'parent-authentication-matrix'
      : route.action === 'entries' && route.controller === 'FormVocabularyController'
        ? 'A-P2-fixed-legacy-boolean'
        : route.action === 'expandPath'
          ? 'A-P2-fixed-notation-list'
          : route.action === 'listEntriesApp'
            ? 'A-P2-fixed-optional-translation-filters'
            : route.controller === 'AdminController' &&
                ['generateUserKey', 'revokeUserKey', 'updateUserDetails', 'updateUserRoles'].includes(route.action)
              ? 'A-P1-fixed-browser-userid-precedence'
              : route.controller === 'VocabularyController' && route.action === 'sync'
                ? 'A-P2-fixed-optional-browser-sync-body'
                : route.controller === 'RecordController' && ['edit', 'getForm'].includes(route.action)
                  ? 'A-P2-fixed-query-oid-selection'
                  : !old?.resolved
                    ? 'native-owner-or-explicit-migration-see-notes'
                    : 'source-reviewed-plus-contract-cases';
    const oldContract = oldApi.get(key(route));
    const contractCases = [];
    const fields = [];
    if (route.request) {
      const sourcesToRead = ['params', 'query', 'headers', 'body'];
      for (const source of sourcesToRead) {
        const schema =
          source === 'body' ? Object.values(route.request.body?.content ?? {})[0]?.schema : route.request[source];
        const oldSchema =
          source === 'body'
            ? Object.values(oldContract?.request?.body?.content ?? {})[0]?.schema
            : oldContract?.request?.[source];
        const shape = schema && newHelpers.getObjectSchemaShape(schema);
        const oldShape = oldSchema && oldHelpers.getObjectSchemaShape(oldSchema);
        for (const [name, field] of Object.entries(shape ?? {})) {
          const oldField = oldShape?.[name];
          fields.push({
            source,
            name,
            required: !field.safeParse(undefined).success,
            currentType: field._def?.type ?? field._def?.typeName,
            baselineType: oldField?._def?.type ?? oldField?._def?.typeName,
            precedence: [source, ...(route.request.legacyParamFallbacks?.[name] ?? []).filter(s => s !== source)],
          });
          for (const [label, value] of [
            ['absent', undefined],
            ['null', null],
            ['empty', ''],
            ['text', 'sample'],
            ['numeric-string', '12'],
            ['integer', 12],
            ['zero-string', '0'],
            ['true-string', 'true'],
            ['false-string', 'false'],
            ['boolean', true],
            ['array', ['sample']],
            ['object', { nested: 'sample' }],
          ]) {
            const input = { params: {}, query: {}, headers: {}, body: {} };
            if (value !== undefined) input[source][name] = value;
            const nowValue = newExtract.buildRequestSourceInput(input, route.request, source, schema)?.[name];
            const now = field.safeParse(nowValue).success;
            const oldValue = oldField
              ? oldExtract.buildRequestSourceInput(input, oldContract.request, source, oldSchema)?.[name]
              : undefined;
            const before = oldField ? oldField.safeParse(oldValue).success : null;
            contractCases.push({
              source,
              name,
              case: label,
              mode: 'field',
              before,
              after: now,
              baselineExtracted: { defined: oldValue !== undefined, value: oldValue },
              extractionChanged: oldField ? JSON.stringify(nowValue) !== JSON.stringify(oldValue) : null,
              disposition:
                before === null
                  ? 'new-field-or-browser-schema-alias'
                  : before === now && JSON.stringify(nowValue) === JSON.stringify(oldValue)
                    ? 'equivalent'
                    : 'review-difference',
            });
          }
          if (oldField)
            for (const fallback of route.request.legacyParamFallbacks?.[name] ?? []) {
              if (fallback === source) continue;
              const input = { params: {}, query: {}, headers: {}, body: {} };
              input[fallback][name] = '12';
              const now = newExtract.buildRequestSourceInput(input, route.request, source, schema)?.[name];
              const before = oldExtract.buildRequestSourceInput(input, oldContract.request, source, oldSchema)?.[name];
              contractCases.push({
                source,
                name,
                case: 'fallback-' + fallback,
                mode: 'extraction',
                before,
                after: now,
                disposition: JSON.stringify(before) === JSON.stringify(now) ? 'equivalent' : 'review-difference',
              });
            }
          if (oldField) {
            const input = {
              params: { [name]: '31' },
              query: { [name]: '32' },
              headers: { [name]: '33' },
              body: { [name]: '34' },
            };
            const now = newExtract.buildRequestSourceInput(input, route.request, source, schema)?.[name];
            const before = oldExtract.buildRequestSourceInput(input, oldContract.request, source, oldSchema)?.[name];
            contractCases.push({
              source,
              name,
              case: 'primary-precedence',
              mode: 'extraction',
              before,
              after: now,
              disposition: JSON.stringify(before) === JSON.stringify(now) ? 'equivalent' : 'review-difference',
            });
          }
        }
      }
    }
    return {
      id: 'HTTP-' + String(i + 1).padStart(3, '0'),
      method: route.method,
      path: normalize(route.path),
      controller: route.controller,
      action: route.action,
      current: {
        file: route.declaration,
        export: route.exported,
        // These are owner-level input sites, not a claim that every action consumes every site.
        ownerInputSites: nativeSites,
      },
      baseline: old ? { ...old, routePattern: oldTarget?.[0] } : { resolved: false, routePattern: oldTarget?.[0] },
      disposition,
      fields,
      contractCases,
      bodyRequired: route.request?.body?.required ?? false,
      coverageKind: auth
        ? 'source-and-parent-native-authentication-matrix'
        : disposition.startsWith('A-') || route.action === 'updateBundleEnabled'
          ? 'source-and-focused-native-http'
          : oldContract
            ? 'source-and-baseline-schema-differential'
            : contractCases.length
              ? 'source-and-current-schema-snapshot'
              : 'source-comparison',
      verification: auth
        ? [
            'test/http/authentication-matrix.test.ts',
            'evidence/final-review-r13/local-input-baseline.cjs',
            'evidence/final-review-r13/oidc-identifier-baseline.cjs',
            '5f887304f',
            '2f9634213',
          ]
        : disposition.startsWith('A-') || route.controller === 'FormVocabularyController'
          ? ['test/http/httpInputAcceptance.test.ts', 'afaf6ef010ff00e4cdf6f98b8bce62daf2c64db4']
          : route.action === 'updateBundleEnabled'
            ? ['test/http/httpInputAcceptance.test.ts', 'test/http/ConfigurationMongo.test.ts']
            : route.controller?.includes('QueryController') || route.action === 'listRecords'
              ? ['source comparison', 'test/http/recordReadLimits.test.ts', '2d7516aaa']
              : [
                  'source comparison',
                  ...(contractCases.length ? ['differential baseline/current extraction and field validation'] : []),
                ],
    };
  });
  const supplemental = [
    ['all', '/companion', 'companion.ts', 'Conditional configured base; authenticated provider protocol'],
    [
      'all',
      '/companion/{*companionPath}',
      'companion.ts',
      'Conditional configured subtree; provider owns OAuth/upload inputs',
    ],
    ['get', '/healthz', 'ExpressHost.ts', 'Public boolean health; no business input'],
    ['get', '/readyz', 'ExpressHost.ts', 'Public boolean readiness; no business input'],
    ['get/head', 'artifact-manifest-path', 'pageAssets.ts', 'Manifest-contained static fallback; pathname only'],
    ['all', '/:branding/:portal{/*pageNotFound}', 'pages.ts', 'Final page fallback; explicit 404 behavior'],
    [
      'upgrade',
      'configured-progress-socket-path',
      'progressSockets.ts',
      'Intentional one-use grant protocol replaces legacy room subscription',
    ],
    [
      'upgrade',
      'configured-companion-socket-path',
      'companion.ts',
      'Pinned provider transfer/OAuth callback capabilities',
    ],
    [
      'all',
      'registered-extension-routes',
      '../../extensions/composition.ts',
      'Open extension contract; no dynamic routes in three bundled registrations',
    ],
    ['all', 'unmatched', 'ExpressHost.ts', 'Final bounded 404'],
  ].map(([method, route, owner, disposition]) => ({ method, path: route, owner, disposition }));
  const bundled = ['redbox-hook-dev', 'sails-hook-redbox-pdfgen', 'sails-hook-redbox-storage-mongo'].map(name => ({
    package: name,
    source: 'packages/' + name + '/src/extension.ts',
    routeDeclarations: 0,
    disposition:
      name === 'redbox-hook-dev'
        ? 'Configuration-owned root landing path; native page routes'
        : 'Modules/jobs/migrations only; no HTTP declarations',
  }));
  const owners = Object.fromEntries(rows.map(row => [row.current.file, row.current.ownerInputSites]));
  for (const row of rows) delete row.current.ownerInputSites;
  const cells = rows.flatMap(row => row.contractCases);
  const baselineCoverage = Object.entries(baselineRoutes).map(([pattern]) => {
    const match = /^(?:(GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS|ALL)\s+)?(\/.*)$/i.exec(pattern);
    const mapped = rows.filter(
      row =>
        match &&
        normalize(match[2]) === row.path &&
        (!match[1] || match[1].toLowerCase() === row.method || row.method === 'all')
    );
    return {
      pattern,
      routes: mapped.map(row => row.id),
      disposition: mapped.length ? 'mapped-to-native-route' : 'unresolved',
    };
  });
  cached = {
    baseline,
    rows,
    supplemental,
    bundled,
    owners,
    inputScope: {
      compatibilityDocument: 'support/wiki/V6-Client-Compatibility.md#http-request-input-scope',
      recordListLimitOwnership: {
        restApi: {
          routes: ['HTTP-099', 'HTTP-100'],
          baseline: 'controllers/webservice/RecordController.ts:1686,2342',
          policy: 'api.max_requests applies to REST record/deleted-record lists only (default 20)',
        },
        browser: {
          routes: ['HTTP-106', 'HTTP-107'],
          baseline: 'controllers/RecordController.ts:99,2541,2627,2723,2798',
          policy:
            'Own browser controller/helpers never reference api.max_requests. Preserve the incoming native maxSearchRows policy (default 1000000) for browser lists/deleted lists; do not introduce the REST API cap.',
        },
        disposition:
          'Supporting correction to the existing API-limit fix, not a separate incoming defect; parent fix f1da6196e.',
        parentVerification: {
          baselineProbe: 'browser-list-baseline.cjs',
          baselinePasses: 4,
          nativeTest: 'test/http/recordReadLimits.test.ts',
          currentPasses: 15,
          previousPasses: 10,
          previousFailures: 5,
        },
      },
      supported:
        'Declared path/query inputs and route-owned write bodies, with explicit supported legacy aliases and precedence. Parent local-login cases retain body/query/nested passport-local lookup.',
      notUniversalReqParam:
        'Arbitrary GET request bodies and every theoretical Sails req.param source are not a compatibility promise. Send read inputs through the declared path/query transport.',
      intentionalBreaks: [
        {
          kind: 'structured-scalars',
          disposition: '400 for arrays/objects where a scalar is declared; declared list/JSON fields remain supported',
        },
        {
          kind: 'unknown-fields',
          disposition:
            'Per-route schema projection, passthrough or rejection; arbitrary record metadata remains domain data, not a globally stripped query field',
        },
        {
          kind: 'pagination-and-limits',
          disposition:
            'Declared integer/range limits, positive page/row sizes and nonnegative offsets; reject numeric prefixes and malformed scalar transports',
        },
        {
          kind: 'generic-actions',
          disposition:
            'Registered named operations replace evaluated service expressions; unknown operations are not compatibility regressions',
        },
        {
          kind: 'socket-protocols',
          disposition:
            'Legacy virtual HTTP subscribe/unsubscribe is retired (410); direct Socket.IO grants and separate Companion WebSocket protocol are explicit contracts',
        },
      ],
    },
    nativeCaseGroups: [
      {
        family: 'browser-administration-target',
        routes: ['HTTP-153', 'HTTP-154', 'HTTP-156', 'HTTP-157'],
        supported: 'body.userid; unrelated query.id must not redirect the write',
        acceptedCases: 4,
        malformedOrUnsupported: 'missing userid with only query.id/body.id/both',
        controlCases: 12,
        baselineExecutableProbes: 8,
        severity: 'P1',
        fix: 'afaf6ef01',
      },
      {
        family: 'optional-translation-filters',
        routes: ['HTTP-016'],
        supported: 'omitted or empty locale/namespace; namespace defaults to translation',
        acceptedCases: 4,
        malformedOrUnsupported: 'structured locale/namespace/keyPrefix',
        controlCases: 3,
        baselineExecutableProbes: 4,
        severity: 'P2',
        fix: 'afaf6ef01',
      },
      {
        family: 'historical-values-and-notation',
        routes: ['HTTP-302', 'HTTP-304'],
        supported: '13 existing toBoolean spellings and 4 split/deduplicated notation lists',
        acceptedCases: 17,
        malformedOrUnsupported: 'structured scalar/mixed notation, empty list, over 100 unique values',
        controlCases: 5,
        baselineExecutableProbes: 17,
        severity: 'P2',
        fix: 'afaf6ef01',
      },
      {
        family: 'optional-browser-vocabulary-sync',
        routes: ['HTTP-177'],
        supported: 'omitted browser body selects latest version',
        acceptedCases: 1,
        malformedOrUnsupported: 'same test asserts REST missing-body rejection',
        controlCases: 0,
        baselineExecutableProbes: 1,
        severity: 'P2',
        fix: 'afaf6ef01',
      },
      {
        family: 'query-oid-selection',
        routes: ['HTTP-063', 'HTTP-064', 'HTTP-292', 'HTTP-293', 'HTTP-294'],
        supported: 'query oid for editor/form; path oid takes precedence',
        acceptedCases: 4,
        controlCases: 0,
        baselineSourceAssertions: 1,
        severity: 'P2',
        fix: 'afaf6ef01',
      },
      {
        family: 'R12-translation-toggle',
        routes: rows.filter(row => row.action === 'updateBundleEnabled').map(row => row.id),
        supported: 'query-only true/false and legacy body/query truthiness precedence',
        acceptedCases: 5,
        malformedOrUnsupported: 'array/structured body/query and missing required bundle body',
        controlCases: 4,
        disposition: 'R12-e487ce22c-retained',
      },
      {
        family: 'parent-authentication-inputs',
        routes: rows.filter(row => row.current.file.endsWith('/login.ts')).map(row => row.id),
        supported: 'body/query/mixed/nested local credentials (15 cases), named OIDC identifiers (3 cases)',
        malformedOrUnsupported: '3 named OIDC malformed controls and remaining full authentication matrix negatives',
        verification: [
          'test/http/authentication-matrix.test.ts',
          'local-input-baseline.cjs',
          'oidc-identifier-baseline.cjs',
        ],
        parentReportedFullMatrixPasses: 118,
        parentReportedLocalBaselinePasses: 10,
        parentReportedOidcBaselinePasses: 6,
        fixes: ['5f887304f', '2f9634213'],
      },
    ],
    baselineCoverage,
    baselineRoutes: Object.entries(baselineRoutes).map(([pattern, target]) => ({
      pattern,
      target: typeof target === 'function' ? 'inline-function' : target,
    })),
    counts: {
      declarations: rows.length,
      api: rows.filter(r => r.path.includes('/api/')).length,
      baselineControllerResolved: rows.filter(r => r.baseline.resolved).length,
      fields: rows.reduce((n, r) => n + r.fields.length, 0),
      cases: rows.reduce((n, r) => n + r.contractCases.length, 0),
      differences: rows.reduce(
        (n, r) => n + r.contractCases.filter(c => c.disposition === 'review-difference').length,
        0
      ),
      differentialCases: cells.filter(cell => cell.disposition === 'equivalent').length,
      currentAliasSnapshotCases: cells.filter(cell => cell.before === null).length,
      baselineRoutePatterns: baselineCoverage.length,
      unresolvedBaselinePatterns: baselineCoverage.filter(row => row.disposition === 'unresolved').length,
      nativeHttpRegressionCases: 59,
      baselineControllerProbeCases: 30,
      baselineEditorSourceAssertions: 1,
      supplemental: supplemental.length,
      bundled: bundled.length,
    },
    provenance: {
      command: 'git diff a49366803...HEAD',
      initialHead: 'c8a5064d0f16ad9e10f083c6590ae4bc178085db',
      workingHead: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim(),
      comparison:
        'Baseline actual controller AST and route config; current actual route exports; per-field baseline/current executable extraction + Zod acceptance. Native HTTP cases are separately listed; inventory is not full end-to-end domain qualification.',
    },
  };
  return cached;
}
module.exports = { collectInventory, root };
