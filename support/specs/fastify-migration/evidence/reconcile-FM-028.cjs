'use strict';

// Qualification only. The production bootstrap resolves declarations and concrete
// bindings offline; this script never builds a second runtime dispatch table.
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const root = path.resolve(__dirname, '../../../..');
// Check for ts-node itself: coverage tools (nyc) install a plain-JS '.ts' hook.
if (!process[Symbol.for('ts-node.register.instance')])
  require(path.join(root, 'node_modules/ts-node')).register({
    project: path.join(root, 'packages/redbox-core/test/tsconfig.json'),
    transpileOnly: true,
    preferTsExts: true,
  });
const source = file => require(path.join(root, 'packages/redbox-core/src', file));
const inventory = require('./FM-002.inventory.json');
const { registerCoreApiRoutes, buildCoreApiOpenApiDocument, buildCoreApiBlueprint } =
  source('api-routes/route-registry');
const { coreRouteName, expressRuntimePath } = source('http/fastify/routes');
const { referenceReadDeclarations } = source('http/referenceRoutes');
const { recordQueryReadDeclarations } = source('http/readRoutes');
const { identityAdministrationDeclarations } = source('http/identityRoutes');
const { mutationDeclarations } = source('http/mutationRoutes');
const { integrationDeclarations } = source('http/integrationRoutes');
const { uploadDeclarations } = source('http/uploadRoutes');
const { getMetaRoute, listDatastreamsRoute, getDataStreamRoute } = source('api-routes/groups/records');
const apiDeclarations = registerCoreApiRoutes();
// Collections retain their executable definitions; metadata GET predates FM-024.
const migratedDeclarations = Object.freeze([
  ...new Set([
    ...referenceReadDeclarations,
    ...recordQueryReadDeclarations,
    ...identityAdministrationDeclarations,
    ...mutationDeclarations,
    ...integrationDeclarations,
    ...uploadDeclarations,
    getMetaRoute,
    listDatastreamsRoute,
    getDataStreamRoute,
  ]),
]);
assert(migratedDeclarations.every(Boolean));
const docsPath = value => value.replace(/:([A-Za-z0-9_]+)\*/g, '{$1}').replace(/:([A-Za-z0-9_]+)/g, '{$1}');

async function offlineApplication(declarations = migratedDeclarations, browser = false) {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'fm028-reconciliation-'));
  try {
    const provider = path.join(directory, 'node_modules/fm028-storage');
    await fs.mkdir(provider, { recursive: true });
    await fs.writeFile(
      path.join(directory, 'package.json'),
      JSON.stringify({
        name: 'fm028-reconciliation',
        version: '1.0.0',
        dependencies: { 'fm028-storage': '1.0.0' },
      })
    );
    await fs.writeFile(
      path.join(provider, 'package.json'),
      JSON.stringify({
        name: 'fm028-storage',
        version: '1.0.0',
        main: 'index.cjs',
        redbox: { extension: './index.cjs' },
      })
    );
    await fs.writeFile(
      path.join(provider, 'index.cjs'),
      'const storage=require(' +
        JSON.stringify(
          require.resolve('@researchdatabox/sails-hook-redbox-storage-mongo/extension', { paths: [root] })
        ) +
        ');\n' +
        'exports.inspectPrismaStagedStorage=storage.inspectPrismaStagedStorage;\n' +
        'exports.ensurePrismaStagedStorageIndexes=storage.ensurePrismaStagedStorageIndexes;\n' +
        'exports.registerRedboxExtension=()=>({...storage.registerRedboxExtension(),apiVersion:2});\n'
    );
    const config = path.join(directory, 'config.cjs');
    await fs.writeFile(
      config,
      'module.exports=' +
        JSON.stringify({
          server: { rootContext: '/portal' },
          companion: { enabled: false },
          redboxSession: { secret: 'fm028-synthetic-offline-secret-000000000000000001' },
        })
    );
    const portal = await source('application/portal/application').createPortalFastifyApplication({
      appPath: directory,
      log: require(path.join(root, 'node_modules/@researchdatabox/sails-ng-common')).nothingLogger,
      files: { application: config },
      env: {},
      argv: [],
      http: { declarations, ...(browser ? { pages: {} } : {}) },
    });
    assert.equal(source('persistence/runtime').persistenceStatus(portal.owner).pools, 0);
    return { portal, close: () => fs.rm(directory, { recursive: true, force: true }) };
  } catch (error) {
    await fs.rm(directory, { recursive: true, force: true });
    throw error;
  }
}

function reconcile(installation, document = buildCoreApiOpenApiDocument(), blueprint = buildCoreApiBlueprint()) {
  const { buildOpenApiDocument } = source('api-routes/openapi');
  const apiRows = inventory.routes.filter(row => row.kind === 'api');
  assert.equal(apiRows.length, 152);
  assert.equal(apiDeclarations.length, apiRows.length);
  assert.equal(
    Object.values(document.paths).reduce((count, methods) => count + Object.keys(methods).length, 0),
    152
  );
  const rows = apiRows.map(row => {
    const declarations = apiDeclarations.filter(route => coreRouteName(route.method, route.path) === row.name);
    assert.equal(declarations.length, 1, row.name);
    const declaration = declarations[0];
    assert.equal(declaration.method, row.method);
    assert.equal(expressRuntimePath(declaration.path), row.path);
    assert.equal(declaration.controller, row.controller);
    assert.equal(declaration.action, row.action);
    const docPath = docsPath(declaration.path);
    const operation = document.paths[docPath]?.[declaration.method];
    assert(operation, 'Missing OpenAPI operation: ' + row.name);
    assert.deepEqual(
      operation,
      buildOpenApiDocument([declaration], document.info).paths[docPath][declaration.method],
      'OpenAPI request/response/security metadata drift: ' + row.name
    );
    assert(
      blueprint.split('\n').includes(declaration.method.toUpperCase() + ' ' + docPath),
      'Missing generated API Blueprint entry: ' + row.name
    );
    const resolved = installation.routePlan.routes.filter(route => route.declaration.name === row.name);
    const base = {
      name: row.name,
      method: row.method,
      path: row.path,
      declaration: row.apiDeclaration,
      docs: {
        path: docPath,
        method: declaration.method,
        operationId: operation.operationId ?? null,
        metadata: 'complete operation equals the executable declaration-derived operation',
        blueprint: true,
      },
    };
    if (!row.nativeBinding) {
      assert(['FM-033', 'FM-034'].includes(row.ownerTask), 'Unowned API: ' + row.name);
      assert.equal(resolved.length, 0, 'Later task unexpectedly selected: ' + row.name);
      return {
        ...base,
        classification: 'owned-by-later-task',
        owner: row.ownerTask,
        reason:
          row.ownerTask === 'FM-033'
            ? 'Complete datastream list/download authorization and streaming matrix (P5)'
            : 'Complete multipart/staging/upload concurrency matrix (P5)',
        runtime: null,
      };
    }
    assert.equal(resolved.length, 1, 'API must resolve exactly once: ' + row.name);
    const route = resolved[0];
    assert.strictEqual(route.declaration.api, declaration, 'Runtime must retain the executable API declaration');
    assert.equal(route.declaration.method, declaration.method);
    assert.equal(route.declaration.path, declaration.path);
    assert.equal(route.declaration.controller, declaration.controller);
    assert.equal(route.declaration.action, declaration.action);
    assert.deepEqual(route.effectivePolicies, row.access.effectivePolicies);
    assert.equal(route.effectiveCsrf ?? 'none', row.csrf.effective);
    assert.equal(route.replaced, undefined, 'Undocumented intentional override: ' + row.name);
    const factories = installation.controllerPlan.controllers.filter(
      item => item.declaration.name === declaration.controller
    );
    assert.equal(factories.length, 1, 'Exactly one selected production factory');
    assert(factories[0].declaration.actions.includes(declaration.action));
    assert.equal(installation.bindings.filter(binding => binding.factory === factories[0].declaration).length, 1);
    const bindings = installation.routePlan.bindings.filter(
      binding => binding.route === route && binding.kind === 'action'
    );
    assert(bindings.length > 0, 'No executable registration: ' + row.name);
    return {
      ...base,
      classification: 'migrated',
      owner: row.nativeBinding.migratedBy ?? row.ownerTask,
      runtime: {
        provider: route.provider,
        factory: factories[0].declaration.name,
        action: declaration.action,
        bindings: bindings.map(binding => ({ method: binding.method, path: binding.path.url })),
        policies: route.effectivePolicies,
        csrf: route.effectiveCsrf ?? 'none',
        validation: 'same executable declaration object; response schemas remain documentation only',
        head: route.declaration.method === 'get' ? (route.declaration.head?.kind ?? 'implicit') : 'not-applicable',
      },
    };
  });
  return {
    formatVersion: 1,
    counts: {
      api: rows.length,
      migrated: rows.filter(row => row.classification === 'migrated').length,
      intentionalOverrides: 0,
      later: rows.filter(row => row.classification === 'owned-by-later-task').length,
    },
    composition: {
      declarations: installation.routePlan.routes.length,
      controllers: installation.controllerPlan.controllers.length,
    },
    rows,
  };
}

async function main() {
  const app = await offlineApplication();
  try {
    const report = reconcile(app.portal.installation);
    const filename = path.join(__dirname, 'FM-028.reconciliation.json');
    const bytes = JSON.stringify(report, null, 2) + '\n';
    if (process.argv.includes('--check'))
      assert.equal(await fs.readFile(filename, 'utf8'), bytes, 'G3 reconciliation drift');
    else await fs.writeFile(filename, bytes);
    console.log(JSON.stringify(report.counts));
    if (process.argv.includes('--controllers')) {
      const ts = require(path.join(root, 'node_modules/typescript'));
      const configPath = path.join(root, 'packages/redbox-core/tsconfig.json');
      const config = ts.readConfigFile(configPath, ts.sys.readFile);
      const parsed = ts.parseJsonConfigFileContent(config.config, ts.sys, path.dirname(configPath));
      const program = ts.createProgram(parsed.fileNames, { ...parsed.options, noEmit: true });
      const checker = program.getTypeChecker();
      const files = [
        'ReferenceControllers',
        'ReadControllers',
        'IdentityAdministrationControllers',
        'MutationControllers',
        'IntegrationControllers',
        'UploadControllers',
        'webservice/RecordController',
        'webservice/DatastreamController',
      ];
      const controllers = app.portal.installation.controllerPlan.controllers.map(({ declaration: factory }) => {
        let match;
        for (const file of files) {
          const filename = 'http/controllers/' + file + '.ts';
          const exported = Object.entries(source(filename)).find(([, value]) => value === factory);
          if (!exported) continue;
          const ast = program.getSourceFile(path.join(root, 'packages/redbox-core/src', filename));
          const visit = node => {
            if (ts.isVariableDeclaration(node) && node.name.getText(ast) === exported[0]) match = node;
            ts.forEachChild(node, visit);
          };
          visit(ast);
        }
        assert(match, 'Audit selected factory source: ' + factory.name);
        const create = match.initializer.arguments[0].properties.find(node => node.name?.getText() === 'create');
        const parameter = create.initializer.parameters[0];
        assert(parameter?.type, 'Export a concrete named constructor input: ' + factory.name);
        const inputType = checker.getTypeAtLocation(parameter);
        const signature = checker.getSignatureFromDeclaration(create.initializer);
        let type = checker.getReturnTypeOfSignature(signature);
        const classes = [];
        while (type) {
          const node = type.symbol?.declarations?.find(ts.isClassDeclaration);
          assert(node, 'Explicit controller class: ' + factory.name);
          const ast = node.getSourceFile();
          const constructor = node.members.find(ts.isConstructorDeclaration);
          const calls = [];
          const visit = child => {
            if (ts.isCallExpression(child) && child.expression.kind !== ts.SyntaxKind.SuperKeyword)
              calls.push(child.getText(ast));
            ts.forEachChild(child, visit);
          };
          if (constructor) visit(constructor);
          assert.equal(calls.length, 0, 'Constructors borrow inputs without acquiring resources: ' + factory.name);
          classes.push({
            name: node.name.text,
            file: path.relative(root, ast.fileName),
            lines:
              ast.getLineAndCharacterOfPosition(node.end).line -
              ast.getLineAndCharacterOfPosition(node.getStart(ast)).line +
              1,
            methods: node.members.filter(ts.isMethodDeclaration).map(method => method.name.getText(ast)),
          });
          type = checker.getBaseTypes(type)?.[0];
        }
        const dependencies = checker
          .getPropertiesOfType(inputType)
          .map(property => property.name)
          .sort();
        assert(
          !dependencies.some(name => ['services', 'application', 'container', 'sails'].includes(name)),
          'No controller service locator: ' + factory.name
        );
        return {
          factory: factory.name,
          input: parameter.type.getText(),
          inputFields: dependencies,
          exposedActions: factory.actions,
          moduleRequirements: factory.requires ?? [],
          classes,
        };
      });
      const data = {
        numericLimit: null,
        rule: 'Design sections 4/5/10 and P3 require concrete borrowed inputs, resource-free constructors, explicit actions, separate browser/API identities, and responsibility-based splits; no numeric line/action/dependency threshold is specified.',
        controllers,
      };
      const output = path.join(__dirname, 'FM-028.controllers.json');
      const contents = JSON.stringify(data, null, 2) + '\n';
      if (process.argv.includes('--check'))
        assert.equal(await fs.readFile(output, 'utf8'), contents, 'Controller audit drift');
      else await fs.writeFile(output, contents);
      console.log('Audited ' + controllers.length + ' selected controllers.');
    }
  } finally {
    await app.close();
  }
}
if (require.main === module)
  main().catch(error => {
    console.error(error);
    process.exitCode = 1;
  });
module.exports = { offlineApplication, reconcile, migratedDeclarations };
