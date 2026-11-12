import type { ConfiguredAction } from '../../../src/http/actions/configuredActions';
import { HarvestRunServiceError } from '../../../src/HarvestRunService';
import { Services as Reports } from '../../../src/queries/Reports';
import { Services as Dashboard } from '../../../src/dashboards/DashboardConfig';
import { HttpIdentity } from '../../../src/http/express/identity';
import { getIdentityRepositories } from '../../../src/persistence/identity/runtime';
import {
  wire,
  session,
  seedMutationState,
  settleMutationWork,
  mutationJobs as jobs,
  type Fixture,
  type Wire,
  normalizeMutation as normalize,
  dashboardMutationPayload,
  mutationCollections as collections,
} from './mutationDifferentialSupport';
import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
import { ObjectId, type Document } from 'mongodb';
import sinon from 'sinon';
import { mutationDeclarations, configurationWriteRoutes, queryWriteRoutes } from '../../../src/http/mutationRoutes';
import { referenceReadDeclarations } from '../../../src/http/referenceRoutes';
import { recordQueryReadDeclarations } from '../../../src/http/readRoutes';
import { portalHttpPolicies } from '../../../src/application/portal/httpPolicies';
import { formatRecordEntityTag } from '../../../src/RecordEntityTag';
import { referenceProductionFixture, referenceOrigin } from './referenceProductionFixture';
import { retainedMutationExpress } from './retainedMutationExpress';

type Route = (typeof mutationDeclarations)[number];
const routes = mutationDeclarations.filter(
  route =>
    process.env.FM027_BODY_SWEEP ||
    !(route.controller === 'webservice/RecordController' && route.action === 'updateMeta')
);
const modes = ['retained', 'express', 'fastify'] as const;
const scope = [...referenceReadDeclarations, ...recordQueryReadDeclarations, ...mutationDeclarations];
const scenarios = [
  'body-empty',
  'body-absent',
  'body-object',
  'success',
  'session',
  'bearer-only',
  'anonymous',
  'invalid-bearer',
  'reader',
  'foreign-role',
  'foreign-brand',
  'unknown-brand',
  'no-csrf',
  'bad-csrf',
  'foreign-origin',
  'array-body',
  'invalid-body',
  'invalid-parameter',
  'nested-query',
  'duplicate-query',
  'parser-before-auth',
  'missing-actor',
  'domain-failure',
  'safe-version',
  'version-toString',
  'schema-conflict',
  'invalid-if-match',
  'stale-if-match',
  'missing-object',
  'private-object',
  'foreign-object',
  'array-version',
  'mixed-version',
  'header-version-priority',
  'typed-denial',
  'typed-missing',
  'serialization-failure',
  'invalid-body-anonymous',
  'invalid-body-brand',
  'invalid-body-csrf',
  'invalid-body-missing-actor',
] as const;
type Scenario = (typeof scenarios)[number];
const cases: { key: string; route: Route; scenario: Scenario; version: string; reduced: boolean }[] = [];
for (const reduced of [false, true])
  for (const route of routes)
    for (const version of ['1.0', '2.0'])
      for (const scenario of reduced ? (['anonymous', 'missing-actor', 'reader', 'invalid-body'] as const) : scenarios)
        if (
          (!scenario.startsWith('body-') || ['post', 'put'].includes(route.method)) &&
          (!process.env.FM026_SCENARIOS || process.env.FM026_SCENARIOS.split(',').includes(scenario))
        )
          cases.push({
            key: `${reduced ? 'reduced' : 'default'} ${route.method} ${route.path} ${version} ${scenario}`,
            route,
            scenario,
            version,
            reduced,
          });
const observations = new Map<string, unknown[]>();

function endpoint(route: Route, scenario: Scenario) {
  const replacements: Record<string, string> = {
    branding:
      scenario === 'foreign-brand'
        ? 'other'
        : scenario === 'unknown-brand' || scenario === 'invalid-body-brand'
          ? 'missing'
          : 'default',
    portal: 'rdmp',
    recordType: 'dataRecord',
    oid: route.action.includes('Deleted') || route.action === 'restoreRecord' ? 'deleted-record' : 'reference-record',
    targetStep: 'published',
    appConfigId: 'systemMessage',
    locale: 'en',
    namespace: route.action.includes('Entry') || route.action === 'deleteEntry' ? 'translation' : 'owned',
    recordTypeName: 'dataRecord',
    stage: 'draft',
    view: 'referenceView',
    step: 'draft',
    workflowStage: 'draft',
    viewName: 'referenceView',
    stepName: 'draft',
    name: 'definition',
    action: scenario === 'typed-missing' ? 'missing' : 'owned',
  };
  if (scenario === 'invalid-parameter')
    for (const key of ['recordType', 'oid', 'appConfigId', 'locale', 'name']) replacements[key] = 'bad%00parameter';
  if (scenario === 'missing-object') replacements.oid = 'missing-record';
  if (scenario === 'private-object') replacements.oid = 'private-record';
  if (scenario === 'foreign-object') replacements.oid = 'foreign-record';
  return route.path
    .replace(':key*', '*key')
    .replace(/:([A-Za-z]+)/g, (_match, key) => replacements[key] ?? 'missing')
    .replace('*key', 'owned%2Fkey');
}
async function payload(f: Fixture, route: Route): Promise<unknown> {
  const action = route.action;
  if (action === 'saveAppConfig') return { enabled: true, message: 'Mutation λ' };
  if (['setEntry', 'setEntryApp'].includes(action)) return { value: 'Mutation λ', category: 'test' };
  if (['setBundle', 'setBundleApp'].includes(action))
    return { data: { value: 'Mutation λ' }, splitToEntries: true, overwriteEntries: true };
  if (action === 'updateBundleEnabled') return { enabled: false };
  if (route.controller.includes('DashboardConfigController')) return dashboardMutationPayload(f, action);
  if (action.endsWith('Query'))
    return {
      name: action === 'createQuery' ? 'createdDefinition' : 'definition',
      collectionName: 'record',
      brandIdFieldPath: 'metaMetadata.brandId',
      resultObjectMapping: {},
      mongoQuery: {},
      queryParams: {},
    };
  if (['createConfig', 'updateConfig'].includes(action))
    return {
      name: action === 'createConfig' ? 'createdDefinition' : 'definition',
      title: 'Mutation',
      reportSource: 'database',
      databaseQuery: { queryName: 'definition' },
      solrQuery: null,
      filter: [],
      columns: [],
    };
  if (action === 'create')
    return route.controller === 'RecordController' ? { title: 'Mutation' } : { metadata: { title: 'Mutation' } };
  if (action === 'update') return { title: 'Mutation' };
  if (action === 'updateObjectMeta') return { ...(await f.data.storage().getMeta('reference-record')).metaMetadata };
  if (/(User|Role)(Edit|View)$/.test(action))
    return { users: ['reader'], roles: ['Researcher'], pendingUsers: ['pending@example.invalid'] };
  if (action === 'harvest')
    return {
      sourceRunId: 'fm026-run',
      sourceName: 'fm026',
      chunk: { index: 0 },
      records: [{ harvestId: 'fm026-harvest', operation: 'create', recordRequest: { metadata: { title: 'Harvest' } } }],
    };
  if (action === 'legacyHarvest')
    return { records: [{ harvest_id: 'fm026-legacy', metadata: { data: { title: 'Legacy' } } }] };
  return {};
}
function fault(f: Fixture, route: Route, scenario: Scenario) {
  const a = route.action;
  if (a === 'retiredOperation') return undefined;
  if (route.controller === 'ActionController') return undefined;
  const configuration = configurationWriteRoutes.some(r => r.controller === route.controller && r.action === a);
  const query = queryWriteRoutes.some(r => r.controller === route.controller && r.action === a);
  const domain = configuration
    ? route.controller.includes('Dashboard')
      ? f.data.reference.dashboardConfig.get()
      : route.controller.includes('Translation')
        ? f.data.reference.entries.get()
        : f.data.reference.appConfigs.get()
    : query
      ? a.endsWith('Query')
        ? f.data.reference.queries.get()
        : f.data.reference.reports.get()
      : a === 'harvest' || a === 'legacyHarvest'
        ? f.data.harvest.get()
        : f.data.records.get();
  const method =
    (
      {
        saveAppConfig: 'createOrUpdateConfig',
        resetAppConfig: 'resetConfigOverride',
        setEntryApp: 'setEntry',
        setBundleApp: 'setBundle',
        saveWorkflowTarget: 'saveTargetSettings',
        saveViewTarget: 'saveTargetSettings',
        validateSettings: 'validateTargetSettings',
        harvest: 'submitChunk',
        legacyHarvest: 'submitLegacyRecords',
        update: 'updateMeta',
        stepTo: 'updateMeta',
        transitionWorkflow: 'updateMeta',
        delete: 'delete',
        deleteRecord: 'delete',
        updateObjectMeta: 'updateMeta',
        createQuery: 'create',
        updateQuery: 'update',
        deleteQuery: 'delete',
      } as Record<string, string>
    )[a] ?? (/^(add|remove)/.test(a) ? 'updateMeta' : a);
  assert.equal(typeof Reflect.get(domain, method), 'function', a + ' fault seam');
  const stub = sinon.stub(domain as unknown as Record<string, unknown>, method);
  if (scenario === 'serialization-failure')
    return stub.resolves({
      toJSON() {
        throw new Error('private-backend-password-token-marker');
      },
    });
  const status = scenario === 'typed-denial' ? 403 : 404;
  if (scenario === 'typed-denial' || scenario === 'typed-missing') {
    if (query && !a.endsWith('Query'))
      return stub.rejects(new Reports.ReportConfigServiceError(status, 'Typed domain refusal'));
    if (a === 'harvest' || a === 'legacyHarvest')
      return stub.rejects(new HarvestRunServiceError('Typed domain refusal', status));
    if (configuration && route.controller.includes('Dashboard'))
      return stub.rejects(
        new Dashboard.DashboardConfigError(
          scenario === 'typed-denial' ? 'stale-revision' : 'target-not-found',
          'Typed domain refusal'
        )
      );
  }
  return stub.rejects(new Error('private-backend-password-token-marker'));
}

describe('FM-026 retained production mutation raw-HTTP differential', function () {
  this.timeout(2400000);
  before(async () => {
    const retained = await retainedMutationExpress();
    try {
      for (const reduced of [false, true])
        for (const mode of modes) {
          if (!cases.some(test => test.reduced === reduced)) continue;
          const policies = portalHttpPolicies();
          if (reduced)
            for (const controller of new Set(routes.map(route => route.controller)))
              policies[controller] = ['noCache', 'brandingAndPortal'];
          const action: ConfiguredAction = { authorize: async () => true, execute: async () => ({ accepted: true }) };
          const f = await referenceProductionFixture(
            mode === 'fastify',
            policies,
            mode === 'retained' ? retained.install : undefined,
            { declarations: scope, actions: { owned: action } }
          );
          try {
            const login = await session(f);
            await seedMutationState(f, login);
            const baseline = new Map<string, Document[]>();
            for (const name of [...collections, 'user', 'referenceSessions'])
              baseline.set(name, await f.client.db().collection(name).find({}).toArray());
            let observed = 0;
            for (const test of cases.filter(c => c.reduced === reduced)) {
              for (const [name, rows] of baseline) {
                await f.client.db().collection(name).deleteMany({});
                if (rows.length) await f.client.db().collection(name).insertMany(rows);
              }
              await f.client.db().collection('agendaJobs').deleteMany({ name: jobs });
              await f.data.reference.appConfigs.get().bootstrap();
              const { route, scenario, version } = test;
              let body = await payload(f, route),
                query = '';
              const headers: Record<string, string> = {
                ...login,
                Authorization: 'Bearer pilot-api-token',
                Origin: referenceOrigin,
                'Content-Type': 'application/json',
                'X-ReDBox-Api-Version': version,
                'X-ReDBox-Save-Request-Id': 'fm026-request',
              };
              if (['session', 'missing-actor', 'invalid-body-missing-actor'].includes(scenario))
                delete headers.Authorization;
              if (
                scenario === 'bearer-only' ||
                scenario === 'anonymous' ||
                scenario === 'parser-before-auth' ||
                scenario === 'invalid-body-anonymous'
              ) {
                delete headers.Cookie;
                delete headers['X-CSRF-Token'];
              }
              if (
                scenario === 'anonymous' ||
                scenario === 'parser-before-auth' ||
                scenario === 'invalid-body-anonymous'
              )
                delete headers.Authorization;
              if (scenario === 'invalid-bearer') headers.Authorization = 'Bearer invalid';
              if (scenario === 'reader' || scenario === 'private-object') headers.Authorization = 'Bearer reader-token';
              if (scenario === 'foreign-role') headers.Authorization = 'Bearer foreign-token';
              if (scenario === 'missing-actor' || scenario === 'invalid-body-missing-actor')
                assert.equal(
                  (
                    await f.client
                      .db()
                      .collection('user')
                      .deleteOne({ _id: new ObjectId('000000000000000000000015') })
                  ).deletedCount,
                  1
                );
              if (scenario === 'no-csrf') {
                delete headers['X-CSRF-Token'];
                delete headers.Authorization;
              }
              if (scenario === 'bad-csrf' || scenario === 'invalid-body-csrf') {
                headers['X-CSRF-Token'] = 'wrong';
                delete headers.Authorization;
              }
              if (scenario === 'foreign-origin') headers.Origin = 'https://foreign.invalid';
              if (scenario === 'array-body') body = [];
              if (scenario === 'invalid-body' || scenario.startsWith('invalid-body-'))
                body = { settings: false, value: 1, metadata: [], name: '__proto__', users: 42 };
              if (scenario === 'nested-query')
                query = '?targetStep[bad]=x&merge[bad]=x&operation[bad]=x&enabled[bad]=x&splitToEntries[bad]=x';
              if (scenario === 'duplicate-query')
                query = '?targetStep=draft&targetStep=published&merge=true&merge=false&operation=x&operation=y';
              if (scenario === 'safe-version' || scenario === 'version-toString') {
                delete headers['X-ReDBox-Api-Version'];
                query = scenario === 'safe-version' ? '?apiVersion[unknown]=invalid' : '?apiVersion[toString]=bad';
              }
              if (scenario === 'array-version') {
                delete headers['X-ReDBox-Api-Version'];
                query = '?apiVersion=1.0&apiVersion=2.0';
              }
              if (scenario === 'mixed-version') {
                delete headers['X-ReDBox-Api-Version'];
                query = '?apiVersion=2.0&apiVersion[unknown]=x';
              }
              if (scenario === 'header-version-priority') query = '?apiVersion=1.0&version=1.0';
              if (scenario === 'schema-conflict')
                headers['X-ReDBox-Record-Schema-If-Match'] = '"' + 'a'.repeat(64) + '"';
              if (scenario === 'invalid-if-match') headers['If-Match'] = 'invalid';
              if (scenario === 'stale-if-match') headers['If-Match'] = formatRecordEntityTag('reference-record', 0);
              const stub = ['domain-failure', 'typed-denial', 'typed-missing', 'serialization-failure'].includes(
                scenario
              )
                ? fault(f, route, scenario)
                : undefined;
              if (route.controller === 'ActionController') {
                if (scenario === 'typed-denial') sinon.stub(action, 'authorize').resolves(false);
                if (scenario === 'domain-failure')
                  sinon.stub(action, 'execute').rejects(new Error('private-backend-password-token-marker'));
                if (scenario === 'serialization-failure')
                  sinon.stub(action, 'execute').resolves({
                    toJSON() {
                      throw new Error('private-backend-password-token-marker');
                    },
                  });
              }
              if (scenario === 'body-empty') headers['Content-Length'] = '0';
              if (scenario === 'body-absent') delete headers['Content-Type'];
              let result: Wire;
              try {
                result = await wire(
                  f.url + endpoint(route, scenario) + query,
                  route.method.toUpperCase(),
                  headers,
                  scenario === 'parser-before-auth'
                    ? '{'
                    : scenario === 'body-object'
                      ? '{}'
                      : scenario.startsWith('body-')
                        ? ''
                        : JSON.stringify(body)
                );
              } finally {
                stub?.restore();
                sinon.restore();
              }
              await settleMutationWork(f);
              const value = await normalize(f, result);
              const values = observations.get(test.key) ?? [];
              values.push(value);
              observations.set(test.key, values);
              if (++observed % 100 === 0)
                process.stdout.write(
                  'FM026 observations ' + mode + ' ' + (reduced ? 'reduced' : 'default') + ' ' + test.key + '\n'
                );
              if (scenario === 'success' && !reduced)
                assert.equal(
                  result.status,
                  route.action === 'retiredOperation'
                    ? 410
                    : (route.action === 'create' && route.controller.startsWith('webservice/')) ||
                        (route.action.startsWith('create') && route.action !== 'create')
                      ? 201
                      : 200,
                  mode + ' ' + test.key + ' ' + result.text
                );
            }
          } finally {
            await f.close();
          }
        }
    } finally {
      await retained.close();
      if (process.env.FM026_HTTP_REPORT)
        await writeFile(process.env.FM026_HTTP_REPORT, JSON.stringify({ cases: [...observations] }, null, 2));
    }
  });
  for (const test of cases)
    it(test.key, () => {
      const values = observations.get(test.key) as { wire: Wire; state: Record<string, unknown> }[];
      assert.equal(values?.length, 3, test.key);
      if (values[0].wire.aborted || values[1].wire.aborted) {
        assert.equal(test.scenario, 'version-toString', 'Only accepted FM-016 nested-version abort is permitted');
        const control = observations.get(test.key.replace(/version-toString$/, 'safe-version'))!;
        assert.deepEqual(values[2], control[2]);
        assert.deepEqual(control[2], control[0]);
        if (!values[1].wire.aborted) assert.deepEqual(values[1], control[1]);
      } else {
        assert.deepEqual(values[1], values[0]);
        assert.deepEqual(values[2], values[0]);
      }
      if (['domain-failure', 'serialization-failure'].includes(test.scenario))
        for (const value of values) assert(!JSON.stringify(value).includes('private-backend-password-token-marker'));
    });
});
