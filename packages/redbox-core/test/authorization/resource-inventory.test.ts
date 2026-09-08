import { strict as assert } from 'node:assert';
import { describe, it } from 'mocha';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import {
  RESOURCE_EXCLUDED_OPERATIONS,
  RESOURCE_FAMILIES,
  RESOURCE_OPERATION_INVENTORY,
} from '../../src/authorization/resource-inventory';
import { findAndRegisterHooks, generateModelShims } from '../../src/loader/index';
import { Controllers as AsynchControllers } from '../../src/controllers/AsynchController';
import { Controllers as VocabularyControllers } from '../../src/controllers/VocabularyController';
import { Controllers as TranslationControllers } from '../../src/controllers/TranslationController';

function prototypeOperations(instance: object): Set<string> {
  const names = new Set<string>();
  let current: object | null = instance;
  while (current !== null && current !== Object.prototype) {
    for (const name of Object.getOwnPropertyNames(current)) {
      if (name !== 'constructor') names.add(name);
    }
    current = Object.getPrototypeOf(current) as object | null;
  }
  return names;
}

function exportedOperations(instance: { exports(): Record<string, unknown> }): Set<string> {
  try {
    return new Set(Object.keys(instance.exports() as Record<string, unknown>));
  } catch {
    return new Set();
  }
}

/**
 * Deterministic service discovery: every top-level TypeScript file under the
 * src/services tree that defines a Sails service must contribute exactly one
 * instantiable service class exposing `exports()`. Labels are the Sails
 * service names (file basenames, e.g. `RecordsService`, `EmailService`),
 * matching the inventory. Files in NON_SERVICE_MODULES are pure helpers with
 * no service class. New service files, new exports, or files that stop
 * exposing a service class fail reconciliation until inventoried or
 * explicitly excluded.
 */
const NON_SERVICE_MODULES = new Set([
  'AuthorizationActorIssuer',
  // Read-only helper invoked by AuthorizationReadinessService; no service exports.
  'AuthorizationRollbackExposure',
  'AuthorizationServiceAccess',
  'BrandingThemeTokens',
  'form-record-access-user',
  'internal-record-schema-authorization',
]);

let cachedServiceInstances: Record<string, { exports(): Record<string, unknown> }> | undefined;
let cachedControllerInstances: Record<string, object> | undefined;

function discoverServiceInstances(): Record<string, { exports(): Record<string, unknown> }> {
  if (cachedServiceInstances !== undefined) return cachedServiceInstances;
  const packageRoot = path.resolve(__dirname, '..', '..');
  const servicesRoot = path.join(packageRoot, 'src', 'services');
  const files = fs
    .readdirSync(servicesRoot, { withFileTypes: true })
    .filter(entry => entry.isFile() && entry.name.endsWith('.ts') && entry.name !== 'index.ts')
    .map(entry => entry.name)
    .sort();
  assert.ok(files.length >= 60, `service discovery found ${files.length} files`);
  const instances: Record<string, { exports(): Record<string, unknown> }> = {};
  const collect = (node: unknown, found: Array<{ name: string; instance: object }>): void => {
    if (typeof node === 'function' && (node as { prototype?: unknown }).prototype !== undefined) {
      try {
        const instance = new (node as new () => object)();
        if (typeof (instance as { exports?: unknown }).exports === 'function') {
          found.push({ name: (node as { name?: string }).name ?? 'anonymous', instance });
        }
      } catch {
        // Non-instantiable exports (helpers, types) are not services.
      }
    } else if (typeof node === 'object' && node !== null && !Array.isArray(node)) {
      for (const value of Object.values(node as Record<string, unknown>)) collect(value, found);
    }
  };
  for (const file of files) {
    const label = file.replace(/\.ts$/, '');
    if (NON_SERVICE_MODULES.has(label)) continue;
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const moduleExports = require(path.join(servicesRoot, file)) as Record<string, unknown>;
    const found: Array<{ name: string; instance: object }> = [];
    collect(moduleExports, found);
    const unique = [...new Map(found.map(entry => [entry.name, entry])).values()];
    assert.equal(unique.length, 1, `${label} must expose exactly one service class, found ${unique.length}`);
    instances[label] = unique[0].instance as { exports(): Record<string, unknown> };
  }
  assert.ok(Object.keys(instances).length >= 60, `service discovery built ${Object.keys(instances).length} instances`);
  cachedServiceInstances = instances;
  return instances;
}

/**
 * Deterministic controller discovery: every TypeScript file under the
 * src/controllers tree (minus the barrel) must contribute exactly one
 * instantiable controller class exposing `_exportedMethods`. Labels are the
 * controller-relative paths (`RecordController`,
 * `webservice/RecordController`), matching the inventory. New controllers,
 * actions, or files fail reconciliation until inventoried.
 */
function discoverControllerInstances(): Record<string, object> {
  if (cachedControllerInstances !== undefined) return cachedControllerInstances;
  const packageRoot = path.resolve(__dirname, '..', '..');
  const controllersRoot = path.join(packageRoot, 'src', 'controllers');
  const files: string[] = [];
  const walk = (dir: string): void => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(full);
      } else if (entry.isFile() && entry.name.endsWith('.ts') && entry.name !== 'index.ts') {
        files.push(full);
      }
    }
  };
  walk(controllersRoot);
  assert.ok(files.length >= 30, `controller discovery found ${files.length} files`);
  const instances: Record<string, object> = {};
  const collect = (node: unknown, found: Array<{ instance: object; methods: string[] }>): void => {
    if (typeof node === 'function' && (node as { prototype?: unknown }).prototype !== undefined) {
      try {
        const instance = new (node as new () => object)();
        const methods = (instance as { _exportedMethods?: unknown })._exportedMethods;
        if (Array.isArray(methods)) found.push({ instance, methods: methods as string[] });
      } catch {
        // Non-instantiable exports (helpers, types) are not controllers.
      }
    } else if (typeof node === 'object' && node !== null && !Array.isArray(node)) {
      for (const value of Object.values(node as Record<string, unknown>)) collect(value, found);
    }
  };
  for (const full of files.sort()) {
    const label = path.relative(controllersRoot, full).replace(/\.ts$/, '');
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const moduleExports = require(full) as Record<string, unknown>;
    const found: Array<{ instance: object; methods: string[] }> = [];
    collect(moduleExports, found);
    if (found.length === 0) continue; // Non-controller modules (e.g. error helpers).
    assert.equal(found.length, 1, `${label} must expose exactly one controller class, found ${found.length}`);
    instances[label] = found[0].instance;
  }
  assert.ok(
    Object.keys(instances).length >= 30,
    `controller discovery built ${Object.keys(instances).length} instances`
  );
  cachedControllerInstances = instances;
  return instances;
}

describe('resource operation inventory', function () {
  it('lists every documented family exactly once', function () {
    assert.deepEqual([...RESOURCE_FAMILIES].sort(), [
      'active-deleted-records',
      'app-navigation-config',
      'attachments-audit-related-integration-audit-schemas-forms',
      'branding-assets',
      'dashboard-types-config',
      'figshare-rva-state-crosswalks',
      'forms-record-types-workflows',
      'harvest-integration-state',
      'hook-entities',
      'named-queries',
      'record-acl-search-storage-exports',
      'reports-exports',
      'translation-bundles',
      'user-jobs-async-progress',
      'user-management-linking',
      'vocabularies-entries',
      'websocket-events',
    ]);
    const familiesInInventory = [...new Set(RESOURCE_OPERATION_INVENTORY.map(row => row.family))].sort();
    assert.deepEqual(familiesInInventory, [...RESOURCE_FAMILIES].sort());
  });

  it('classifies ID-only reads as internal primitives with brand-bearing counterparts', function () {
    const byOp = new Map(RESOURCE_OPERATION_INVENTORY.map(row => [`${row.service}#${row.operation}`, row]));
    // Records: ID-only vs authorized.
    assert.equal(byOp.get('RecordsService#getMeta')?.classification, 'id-only-internal');
    assert.equal(byOp.get('RecordsService#getAuthorizedMeta')?.classification, 'brand-bearing');
    assert.equal(byOp.get('RecordsService#getDeletedRecordMeta')?.classification, 'id-only-internal');
    assert.equal(byOp.get('RecordsService#getAuthorizedDeletedRecordMeta')?.classification, 'brand-bearing');
    // Vocabularies: ID-only vs authorized.
    assert.equal(byOp.get('VocabularyService#getById')?.classification, 'id-only-internal');
    assert.equal(byOp.get('VocabularyService#getAuthorizedByIdOrSlug')?.classification, 'brand-bearing');
    assert.equal(byOp.get('VocabularyService#list')?.classification, 'id-only-internal');
    assert.equal(byOp.get('VocabularyService#listAuthorized')?.classification, 'brand-bearing');
    // Users: ID-only vs brand.
    assert.equal(byOp.get('UsersService#getUserWithId')?.classification, 'id-only-internal');
    assert.equal(byOp.get('UsersService#getUserForBrand')?.classification, 'brand-bearing');
  });

  it('enumerates list/search/export operations with brand predicates', function () {
    const listOps = RESOURCE_OPERATION_INVENTORY.filter(row => row.classification === 'list-search-export');
    assert.ok(listOps.length >= 8);
    for (const required of [
      'RecordsService#authorizeRecordCollection',
      'RecordsService#getRecords',
      'RecordsService#searchFuzzy',
      'SolrSearchService#searchFuzzy',
      'UsersService#getUsersForBrand',
      'UsersService#searchLinkCandidates',
      'HarvestRunService#listRuns',
    ]) {
      assert.ok(
        listOps.some(row => `${row.service}#${row.operation}` === required),
        required
      );
    }
  });

  it('enumerates internal jobs and websocket re-authorization', function () {
    const jobs = RESOURCE_OPERATION_INVENTORY.filter(row => row.classification === 'internal-job');
    assert.ok(jobs.some(row => row.service === 'AsynchsService' && row.operation === 'start'));
    assert.ok(jobs.some(row => row.service === 'AsynchsService' && row.operation === 'get'));
    assert.ok(jobs.some(row => row.service === 'AsynchController' && row.operation === 'subscribe'));
    assert.ok(jobs.some(row => row.service === 'AsynchController' && row.operation === 'progress'));
  });

  it('routes vocabulary import/sync/export through authorized wrappers with no dedicated Authorized methods', function () {
    const adapters = RESOURCE_OPERATION_INVENTORY.filter(row => row.classification === 'vocabulary-export-adapter');
    assert.ok(adapters.some(row => row.operation === 'import'));
    assert.ok(adapters.some(row => row.operation === 'sync'));
    assert.ok(adapters.some(row => row.operation === 'export'));
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const vocabularyModule = require('../../src/services/VocabularyService') as Record<string, unknown>;
    const collectVocabulary: Array<object> = [];
    const walkVocabulary = (node: unknown): void => {
      if (typeof node === 'function' && (node as { prototype?: unknown }).prototype !== undefined) {
        try {
          const instance = new (node as new () => object)();
          if (typeof (instance as { exports?: unknown }).exports === 'function') collectVocabulary.push(instance);
        } catch {
          // Non-instantiable exports are not services.
        }
      } else if (typeof node === 'object' && node !== null && !Array.isArray(node)) {
        for (const value of Object.values(node as Record<string, unknown>)) walkVocabulary(value);
      }
    };
    walkVocabulary(vocabularyModule);
    assert.equal(collectVocabulary.length, 1);
    const exported = (collectVocabulary[0] as { exports(): Record<string, unknown> }).exports() as Record<
      string,
      unknown
    >;
    assert.equal('importAuthorized' in exported, false);
    assert.equal('syncAuthorized' in exported, false);
    assert.equal('exportAuthorized' in exported, false);
  });

  it('reconciles every inventoried code operation against the implementation', async function () {
    // Dynamic service/controller discovery plus executed HookLoader evidence
    // exceeds Mocha's default 5s budget on first load; retain full discovery
    // and real findAndRegisterHooks/generateModelShims execution with a
    // bounded deterministic timeout and memoized discovery for later tests.
    this.timeout(30000);
    const serviceInstances: Record<string, object> = discoverServiceInstances();
    // Controller classes for prototype-backed rows: discovered
    // deterministically from every controller file (exactly one exported
    // controller class per file), so newly added controllers and actions fail
    // until they are inventoried. Nothing is skipped.
    // HookLoader has no runtime service file; its row is verified by executing
    // the real model registration/ownership contract (findAndRegisterHooks
    // ownership map plus generated model-shim embedding) instead of being
    // skipped.
    const controllerInstances: Record<string, object> = discoverControllerInstances();
    // Executed HookLoader evidence: run the real loader against a sandbox app
    // with a hook exposing registerRedboxModels, plus a hook claiming
    // hasModels without the export (missing-export gate). Ownership must map
    // each model to its providing module, the incomplete hook must contribute
    // nothing, and the generated shim must embed the registerRedboxModels
    // ownership lookup with the model globalId.
    const sandboxDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'resource-inventory-hookloader-'));
    try {
      const packageName = 'redbox-hook-inventory-models';
      const incompleteName = 'redbox-hook-inventory-incomplete';
      const moduleDir = path.join(sandboxDir, 'node_modules', packageName);
      const incompleteDir = path.join(sandboxDir, 'node_modules', incompleteName);
      await fs.promises.mkdir(moduleDir, { recursive: true });
      await fs.promises.mkdir(incompleteDir, { recursive: true });
      await fs.promises.writeFile(
        path.join(moduleDir, 'package.json'),
        JSON.stringify({ name: packageName, version: '1.0.0', sails: { hasModels: true } })
      );
      await fs.promises.writeFile(
        path.join(moduleDir, 'index.js'),
        `module.exports.registerRedboxModels = function() { return { InventoryModel: { attributes: { title: { type: 'string' } } } }; };`
      );
      await fs.promises.writeFile(
        path.join(incompleteDir, 'package.json'),
        JSON.stringify({ name: incompleteName, version: '1.0.0', sails: { hasModels: true } })
      );
      await fs.promises.writeFile(path.join(incompleteDir, 'index.js'), 'module.exports = {};');
      for (const request of [
        `${packageName}/package.json`,
        packageName,
        `${incompleteName}/package.json`,
        incompleteName,
      ]) {
        try {
          delete require.cache[require.resolve(request, { paths: [sandboxDir] })];
        } catch {
          // Ignore unresolved cache entries for freshly created test modules.
        }
      }
      await fs.promises.writeFile(
        path.join(sandboxDir, 'package.json'),
        JSON.stringify({
          name: 'resource-inventory-hookloader-app',
          dependencies: { [packageName]: '1.0.0', [incompleteName]: '1.0.0' },
          devDependencies: {},
        })
      );
      const registrations = await findAndRegisterHooks(sandboxDir);
      assert.deepEqual(registrations.hookModels, {
        InventoryModel: { module: packageName },
      });
      const modelsDir = path.join(sandboxDir, 'api', 'models');
      await fs.promises.mkdir(modelsDir, { recursive: true });
      const stats = await generateModelShims(modelsDir, registrations.hookModels);
      assert.equal(stats.fromHooks, 1);
      const shim = await fs.promises.readFile(path.join(modelsDir, 'InventoryModel.js'), 'utf8');
      assert.ok(shim.includes(`require('${packageName}').registerRedboxModels()['InventoryModel']`));
      assert.ok(shim.includes(`globalId: 'InventoryModel'`));
    } finally {
      await fs.promises.rm(sandboxDir, { recursive: true, force: true });
    }
    const missing: string[] = [];
    for (const row of RESOURCE_OPERATION_INVENTORY) {
      if (row.service === 'HookLoader') {
        continue;
      }
      const controllerInstance = controllerInstances[row.service];
      if (controllerInstance !== undefined) {
        // The documented vocabulary export adapter has no dedicated controller
        // action or Authorized method by design; the absence itself is pinned
        // below and in vocabulary-inventory.test.ts.
        if (row.service === 'VocabularyController' && row.operation === 'export') continue;
        const prototyped = prototypeOperations(controllerInstance);
        if (!prototyped.has(row.operation)) {
          missing.push(`${row.service}#${row.operation}`);
        }
        continue;
      }
      const instance = serviceInstances[row.service] as { exports(): Record<string, unknown> } | undefined;
      assert.ok(instance !== undefined, `unknown service: ${row.service}`);
      const exported = exportedOperations(instance);
      const prototyped = prototypeOperations(instance);
      if (!exported.has(row.operation) && !prototyped.has(row.operation)) {
        missing.push(`${row.service}#${row.operation}`);
      }
    }
    assert.deepEqual(missing, [], `inventoried operations missing from code:\n${missing.join('\n')}`);
    // HookLoader rows resolve to the executed model registration/ownership
    // contract above (ownership map plus generated shim embedding), never to
    // a skip and never to the unrelated scope-provider registration.
    const hookRows = RESOURCE_OPERATION_INVENTORY.filter(row => row.service === 'HookLoader');
    assert.ok(
      hookRows.some(row => row.operation === 'registerRedboxModels'),
      'HookLoader#registerRedboxModels'
    );
    assert.ok(
      hookRows.every(row => row.operation !== 'registerHookModel'),
      'HookLoader must not name the non-existent registerHookModel export'
    );
    // Controller operations are code-backed via prototype checks.
    const asynchProto = prototypeOperations(new AsynchControllers.Asynch());
    assert.ok(asynchProto.has('subscribe'));
    assert.ok(asynchProto.has('progress'));
    const vocabProto = prototypeOperations(new VocabularyControllers.Vocabulary());
    assert.ok(vocabProto.has('import'), 'VocabularyController#import');
    assert.ok(vocabProto.has('sync'), 'VocabularyController#sync');
    // No dedicated exportAuthorized method: export runs through the authorized
    // vocabulary wrapper plus the Figshare brand contract.
    assert.ok(!vocabProto.has('export'), 'VocabularyController must not grow a dedicated export action');
    const translationProto = prototypeOperations(new TranslationControllers.Translation());
    assert.ok(translationProto.has('getNamespace'), 'TranslationController#getNamespace');
  });

  it('reconciles code operations back to the inventory with explicit exclusions', function () {
    // Bidirectional reconciliation over EVERY discovered production service
    // module and EVERY discovered controller: every exported service operation
    // and every reachable controller action (runtime `_exportedMethods`, so
    // commented entries never count) must be inventoried or explicitly
    // excluded with a reason, so silently added services or operations fail.
    const excluded = new Set(RESOURCE_EXCLUDED_OPERATIONS.map(entry => entry.operation));
    assert.equal(excluded.size, RESOURCE_EXCLUDED_OPERATIONS.length, 'duplicate resource exclusions');
    for (const entry of RESOURCE_EXCLUDED_OPERATIONS) {
      assert.ok(entry.operation.length > 0);
      assert.ok(entry.reason.length > 0, entry.operation);
      assert.ok(entry.operation.includes('#'), `exclusion must name a service operation: ${entry.operation}`);
    }
    assert.ok(excluded.has('VocabularyService#convertToType'));
    // Phase 5 guarded writers: newly exported user-access and account-link
    // operations remain authorization-operation surface with brand-scoped
    // writers, explicitly excluded with their required scopes documented.
    for (const operation of ['RoleAdministrationService#linkUserAccounts', 'RoleAdministrationService#setUserAccess']) {
      assert.ok(excluded.has(operation), operation);
      const entry = RESOURCE_EXCLUDED_OPERATIONS.find(candidate => candidate.operation === operation);
      assert.ok(
        entry?.reason.includes('authorization.assignment.manage'),
        `${operation} must document the required assignment scope`
      );
    }
    // Durable link recovery listing runs server-side over the stored plan with
    // no new authority; the shadow mismatch operator listing is read-only
    // review plumbing that never writes the append-only audit, while
    // acknowledgement and retention append typed operator audit events.
    for (const operation of [
      'RoleAdministrationService#recoverIncompleteLinkOperations',
      'AuthorizationRolloutService#listUnresolvedShadowMismatches',
      'AuthorizationRolloutService#acknowledgeShadowMismatch',
      'AuthorizationRolloutService#closeRemediatedShadowMismatch',
      'AuthorizationRolloutService#retainResolvedShadowMismatches',
    ]) {
      assert.ok(excluded.has(operation), operation);
    }

    const inventoried = new Set(RESOURCE_OPERATION_INVENTORY.map(row => `${row.service}#${row.operation}`));

    // Services: every export of every discovered production service module.
    const serviceInstances = discoverServiceInstances();
    assert.ok(Object.keys(serviceInstances).length >= 60, 'discovered service modules');
    const unlistedService: string[] = [];
    const serviceExported = new Map<string, Set<string>>();
    for (const [service, instance] of Object.entries(serviceInstances)) {
      const exported = exportedOperations(instance);
      serviceExported.set(service, exported);
      for (const operation of exported) {
        const key = `${service}#${operation}`;
        if (!inventoried.has(key) && !excluded.has(key)) unlistedService.push(key);
      }
    }
    assert.deepEqual(
      unlistedService.sort(),
      [],
      `service exports missing from the resource inventory:\n${unlistedService.sort().join('\n')}`
    );
    // The cited Phase 0 omissions must stay inventoried.
    for (const operation of [
      'getChildren',
      'getEntryByNotation',
      'getAncestorChain',
      'expandPaths',
      'create',
      'update',
      'reorderEntries',
      'delete',
    ]) {
      assert.ok(inventoried.has(`VocabularyService#${operation}`), operation);
    }
    // The previously-omittable families must now resolve through the inventory.
    for (const operation of [
      'RecordsService#create',
      'RecordsService#delete',
      'RecordsService#getRecords',
      'FormsService#getForm',
      'RecordTypesService#get',
      'WorkflowStepsService#getAllForRecordType',
      'ReportsService#getResults',
      'ReportsService#getCSVResult',
      'HookLoader#registerRedboxModels',
    ]) {
      assert.ok(inventoried.has(operation), operation);
    }
    // Durable user-mutation saga, recovery, and compensation operations are
    // internal-job plumbing over the stored plan, except the brand-constrained
    // detail compensator which carries the request brand.
    const sagaByOp = new Map(RESOURCE_OPERATION_INVENTORY.map(row => [`${row.service}#${row.operation}`, row]));
    for (const operation of [
      'UsersService#beginUserMutationOperation',
      'UsersService#markUserMutationRunning',
      'UsersService#completeUserMutationOperation',
      'UsersService#failUserMutationOperation',
      'UsersService#recoverIncompleteUserMutationOperations',
      'UsersService#replayIncompleteUserMutationOperations',
      'UsersService#destroyNewlyCreatedUserRecord',
    ]) {
      assert.equal(sagaByOp.get(operation)?.classification, 'internal-job', operation);
    }
    assert.equal(sagaByOp.get('UsersService#compensateUserDetailsForBrand')?.classification, 'brand-bearing');
    // Restart-safe link replay is user-management-linking internal-job
    // plumbing over the stored brand/record plan: bounded rewrite, stored
    // brand predicate, CAS-claimed attempts, process identity, and audit
    // semantics — never a rebuild from mutable live users.
    const linkReplay = sagaByOp.get('RoleAdministrationService#replayIncompleteLinkOperations');
    assert.equal(linkReplay?.family, 'user-management-linking');
    assert.equal(linkReplay?.classification, 'internal-job');
    for (const semantic of [
      'stored brandId',
      'bounded record',
      'brand predicate',
      'CAS-claimed',
      'bounded retry',
      'system-process',
      'audit',
      'never rebuilds',
    ]) {
      assert.ok(
        linkReplay?.notes.toLowerCase().includes(semantic.toLowerCase()),
        `link replay inventory must document ${semantic}`
      );
    }

    // Controllers: every reachable (_exportedMethods) action of every
    // discovered controller is inventoried or explicitly excluded.
    const controllerInstances = discoverControllerInstances();
    const unlistedController: string[] = [];
    const controllerExported = new Map<string, Set<string>>();
    for (const [service, instance] of Object.entries(controllerInstances)) {
      const exportedMethods = (instance as unknown as { _exportedMethods?: unknown })._exportedMethods;
      assert.ok(Array.isArray(exportedMethods), `${service}._exportedMethods`);
      const actions = new Set(exportedMethods as string[]);
      controllerExported.set(service, actions);
      for (const action of actions) {
        const key = `${service}#${action}`;
        if (!inventoried.has(key) && !excluded.has(key)) unlistedController.push(key);
      }
    }
    assert.deepEqual(
      unlistedController.sort(),
      [],
      `controller actions missing from the resource inventory:\n${unlistedController.sort().join('\n')}`
    );

    // Exclusions must all resolve to real code operations (no stale entries).
    const staleExclusions: string[] = [];
    const resolveExclusion = (key: string): boolean => {
      const hash = key.indexOf('#');
      const service = key.slice(0, hash);
      const operation = key.slice(hash + 1);
      if (service === 'HookLoader') return false;
      const serviceOps = serviceExported.get(service);
      if (serviceOps !== undefined) return serviceOps.has(operation);
      const controllerOps = controllerExported.get(service);
      if (controllerOps !== undefined) return controllerOps.has(operation);
      // Prototype-backed members that are not Sails-exported (e.g. inherited
      // Core.Controller helpers such as `respond`) still count as real code.
      const controllerInstance = (controllerInstances as Record<string, object>)[service];
      if (controllerInstance !== undefined) return prototypeOperations(controllerInstance).has(operation);
      return false;
    };
    for (const key of excluded) {
      if (!resolveExclusion(key)) staleExclusions.push(key);
    }
    assert.deepEqual(staleExclusions, [], `stale resource exclusions:\n${staleExclusions.join('\n')}`);
  });
});
