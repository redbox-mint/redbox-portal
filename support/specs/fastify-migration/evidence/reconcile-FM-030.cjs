'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const previous = require('./reconcile-FM-028.cjs');
const inventory = require('./FM-002.inventory.json');
const root = path.resolve(__dirname, '../../../..');
const source = file => require(path.join(root, 'packages/redbox-core/src', file));
const { coreRouteName, expressRuntimePath } = source('http/fastify/routes');
const { pageRoutes } = source('http/pageRoutes');
const { authenticationRoutes } = source('http/authenticationRoutes');
const { brandingDeliveryRoutes, fontDeliveryRoute, dynamicAssetRoutes } = source('http/assetRoutes');
const assetDeclarations = [...brandingDeliveryRoutes, fontDeliveryRoute, ...dynamicAssetRoutes];
const { pageRootRoute } = source('http/express/pages');
const { resolveEffectivePolicies } = source('http/express/policies');
const { datastreamReadRoutes } = source('http/datastreamRoutes');
const { uploadDeclarations } = source('http/uploadRoutes');
const migratedDeclarations = [
  ...new Set([...previous.migratedDeclarations, ...datastreamReadRoutes, ...uploadDeclarations]),
];
const declarations = [
  ...datastreamReadRoutes,
  ...uploadDeclarations,
  ...pageRoutes,
  ...authenticationRoutes,
  pageRootRoute,
  ...assetDeclarations,
];
const offlineApplication = () => previous.offlineApplication(migratedDeclarations, true);
function reconcile(installation, runtime) {
  const rows = inventory.routes
    .filter(row => row.kind !== 'api')
    .map(row => {
      const resolved = installation.routePlan.routes.filter(route => route.declaration.name === row.name);
      const base = {
        name: row.name,
        method: row.method,
        path: row.path,
        source: row.source,
        originalOwner: row.ownerTask,
      };
      if (!resolved.length) {
        if (row.source.export === 'csrfTokenRoute') {
          if (runtime)
            for (const method of ['GET', 'HEAD'])
              assert(runtime.some(route => route.path === '/portal' + row.path && route.method === method));
          return {
            ...base,
            classification: 'migrated',
            owner: 'FM-016',
            runtime: { kind: 'native session/CSRF owner', csrf: row.csrf.effective },
          };
        }
        assert(['FM-035'].includes(row.ownerTask), 'Missing browser binding: ' + row.name);
        return {
          ...base,
          classification: 'owned-by-later-task',
          owner: row.ownerTask,
          reason: {
            'FM-033': 'Datastream/attachment read and conditional streaming',
            'FM-034': 'Multipart/staging/TUS upload and fallthrough',
            'FM-035': 'Progress/socket/Companion protocol completion',
          }[row.ownerTask],
          runtime: null,
        };
      }
      assert.equal(resolved.length, 1, 'Duplicate browser binding: ' + row.name);
      const route = resolved[0];
      assert.equal(route.declaration.method, row.method);
      assert.equal(expressRuntimePath(route.declaration.path), row.path);
      assert.equal(route.replaced, undefined, 'Undocumented override: ' + row.name);
      const original = declarations.find(item => coreRouteName(item.method, item.path) === row.name);
      if (original) {
        assert.equal(route.declaration.controller, original.controller ?? 'PageRootController');
        assert.equal(route.declaration.action, original.action ?? 'redirect');
        if (pageRoutes.includes(original)) {
          const mandatory = [
            'nocache',
            'brandingandportal',
            'browseractor',
            ...(original.access === 'public' ? [] : ['browserauthenticated', 'brandactor']),
            'checkauth',
          ];
          assert.deepEqual(route.effectivePolicies, [
            ...new Set([...mandatory, ...resolveEffectivePolicies(original, installation.policyConfiguration)]),
          ]);
        } else if (assetDeclarations.includes(original)) {
          const mandatory =
            original === fontDeliveryRoute
              ? []
              : dynamicAssetRoutes.includes(original)
                ? [
                    'nocache',
                    'brandingandportal',
                    'browseractor',
                    ...(original.action === 'get' ? [] : ['browserauthenticated', 'brandactor']),
                    'checkauth',
                  ]
                : ['brandingandportal', 'browseractor', 'checkauth'];
          assert.deepEqual(
            route.effectivePolicies,
            original === fontDeliveryRoute
              ? []
              : [...new Set([...mandatory, ...resolveEffectivePolicies(original, installation.policyConfiguration)])]
          );
        } else assert.deepEqual(route.effectivePolicies, row.access.effectivePolicies);
      } else {
        const declaration = migratedDeclarations.find(item => coreRouteName(item.method, item.path) === row.name);
        assert(declaration, 'Missing executable browser-operation declaration: ' + row.name);
        assert.equal(route.declaration.controller, declaration.controller);
        assert.equal(route.declaration.action, declaration.action);
        assert.equal(route.declaration.api, declaration.method === 'all' ? undefined : declaration);
        assert.deepEqual(route.declaration.validation, declaration.method === 'all' ? declaration.request : undefined);
        assert.deepEqual(
          route.effectivePolicies,
          resolveEffectivePolicies(declaration, installation.policyConfiguration)
        );
      }
      const expectedCsrf =
        row.source.export === 'authenticationRoutes'
          ? row.action === 'localLogin' || (row.action === 'logout' && row.method === 'post')
            ? 'protect'
            : 'none'
          : row.method === 'all' && row.ownerTask === 'FM-034'
            ? 'apiProtect'
            : row.csrf.effective;
      if (row.method === 'all' && row.ownerTask === 'FM-034')
        assert.equal(row.csrf.effective, 'apiProtect on ALL methods, including HEAD/OPTIONS');
      assert.equal(route.effectiveCsrf ?? 'none', expectedCsrf);
      const factory = installation.controllerPlan.controllers.filter(
        item => item.declaration.name === route.declaration.controller
      );
      assert.equal(factory.length, 1);
      assert(factory[0].declaration.actions.includes(route.declaration.action));
      assert.equal(installation.bindings.filter(item => item.factory === factory[0].declaration).length, 1);
      const bindings = installation.routePlan.bindings.filter(
        binding => binding.route === route && binding.kind !== 'automatic-options'
      );
      assert(
        bindings.some(binding => binding.kind === 'action'),
        'No resolved runtime binding: ' + row.name
      );
      if (runtime)
        for (const binding of bindings)
          assert.equal(
            runtime.filter(
              actual =>
                actual.name === row.name &&
                actual.method === binding.method.toUpperCase() &&
                actual.path === binding.path.url
            ).length,
            1,
            'Missing actual registration: ' + row.name + ' ' + binding.method
          );
      return {
        ...base,
        classification: 'migrated',
        owner: original ? row.ownerTask : (row.nativeBinding?.migratedBy ?? row.ownerTask),
        runtime: {
          controller: route.declaration.controller,
          action: route.declaration.action,
          factory: factory[0].declaration.name,
          provider: route.provider,
          policies: route.effectivePolicies,
          csrf: route.effectiveCsrf ?? 'none',
          bindings: bindings.map(binding => ({ method: binding.method, path: binding.path.url, kind: binding.kind })),
        },
      };
    });
  assert.equal(rows.length, 183);
  assert.equal(rows.filter(row => row.originalOwner === 'FM-030').length, 44);
  return {
    formatVersion: 1,
    counts: {
      browserAndIntegration: rows.length,
      migrated: rows.filter(row => row.classification === 'migrated').length,
      intentionalOverrides: 0,
      later: rows.filter(row => row.classification === 'owned-by-later-task').length,
    },
    boundaries: inventory.integrations
      .filter(row => ['FM-030', 'FM-031', 'FM-033', 'FM-034', 'FM-035'].includes(row.ownerTask))
      .map(row => ({
        name: row.name,
        owner: row.ownerTask,
        classification:
          row.ownerTask === 'FM-031'
            ? 'migrated: contained static assets after declared routes, before fallback'
            : row.ownerTask === 'FM-034'
              ? 'migrated: scoped multipart owner with staging, cleanup and drain'
              : row.ownerTask === 'FM-030'
                ? 'migrated: shared branded page-not-found behind reserved namespaces'
                : 'owned-by-later-task',
      })),
    rows,
  };
}
async function main() {
  const f = await offlineApplication();
  try {
    const report = reconcile(f.portal.installation);
    const bytes = JSON.stringify(report, null, 2) + '\n';
    const file = path.join(__dirname, 'FM-030.reconciliation.json');
    if (process.argv.includes('--check'))
      assert.equal(await fs.readFile(file, 'utf8'), bytes, 'Browser reconciliation drift');
    else await fs.writeFile(file, bytes);
    console.log(JSON.stringify(report.counts));
  } finally {
    await f.close();
  }
}
module.exports = { offlineApplication, reconcile, declarations: migratedDeclarations };
if (require.main === module)
  main().catch(error => {
    console.error(error);
    process.exitCode = 1;
  });
