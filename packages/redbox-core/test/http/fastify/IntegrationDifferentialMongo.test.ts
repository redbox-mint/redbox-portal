import { authorizationWitness } from './authorizationRequests';
import { goldenControls } from './goldenContracts';
import { assertProductionContract } from './productionContracts';
import assert from 'node:assert/strict';
import { mutationWitnessCases } from './mutationWitnessSelection';
import { open } from 'node:fs/promises';
import { ObjectId, type Document } from 'mongodb';
import { integrationDeclarations } from '../../../src/http/integrationRoutes';
import { referenceReadDeclarations } from '../../../src/http/referenceRoutes';
import { recordQueryReadDeclarations } from '../../../src/http/readRoutes';
import { identityAdministrationDeclarations } from '../../../src/http/identityRoutes';
import { mutationDeclarations } from '../../../src/http/mutationRoutes';
import { portalHttpPolicies } from '../../../src/application/portal/httpPolicies';
import { referenceProductionFixture, referenceOrigin } from './referenceProductionFixture';

import { integrationProviderFixture } from './integrationProviderFixture';
import {
  wire,
  session,
  settleMutationWork,
  mutationJobs,
  type Fixture,
  type Wire,
} from './mutationDifferentialSupport';
import {
  seedIntegrations,
  normalizeIntegrations,
  stateCollections,
  type IntegrationIds,
} from './integrationDifferentialSupport';
type Route = (typeof integrationDeclarations)[number];
const scope = [
  ...referenceReadDeclarations,
  ...recordQueryReadDeclarations,
  ...identityAdministrationDeclarations,
  ...mutationDeclarations,
  ...integrationDeclarations,
];
const scenarios = [
  'success',
  'session',
  'anonymous',
  'missing-actor',
  'reader',
  'foreign-role',
  'foreign-brand',
  'invalid-bearer',
  'no-csrf',
  'foreign-origin',
  'invalid-body',
  'invalid-body-anonymous',
  'invalid-body-missing-actor',
  'nested-query',
  'duplicate-query',
  'safe-version',
  'version-toString',
  'header-version-priority',
  'array-version',
  'missing-object',
  'head',
  'conditional-get',
  'conditional-head',
] as const;
const providerActions = new Set([
  'import',
  'sync',
  'listCatalogues',
  'createPreview',
  'createSourcePreview',
  'externalEntries',
  'serviceEntries',
  'sendNotification',
]);
const cases: {
  key: string;
  route: Route;
  scenario: string;
  version: string;
  reduced: boolean;
}[] = [];
for (const reduced of [false, true])
  for (const route of integrationDeclarations)
    for (const version of ['1.0', '2.0']) {
      const selected: string[] = reduced
        ? ['anonymous', 'missing-actor', 'invalid-body-anonymous', 'invalid-body-missing-actor', 'reader']
        : [...scenarios];
      if (['post', 'put'].includes(route.method)) selected.push('body-empty', 'body-absent', 'body-object');
      if (!reduced && providerActions.has(route.action) && !route.controller.includes('Branding'))
        selected.push(
          'upstream-error',
          'malformed',
          'invalid-json',
          'disconnect',
          ...(route.action === 'externalEntries' ? [] : ['timeout'])
        );
      if (!reduced && route.action === 'children') selected.push('invalid-parent', 'missing-parent');
      if (!reduced && ['import', 'sync'].includes(route.action)) selected.push('malformed-tree');
      for (const scenario of selected) {
        if (['head', 'conditional-get', 'conditional-head'].includes(scenario) && route.method !== 'get') continue;
        if (process.env.FM027_SCENARIOS && !process.env.FM027_SCENARIOS.split(',').includes(scenario)) continue;
        cases.push({
          key: `${reduced ? 'reduced' : 'default'} ${route.method} ${route.path} ${version} ${scenario}`,
          route,
          scenario,
          version,
          reduced,
        });
      }
    }
type Observation = {
  wire: Pick<Wire, 'status' | 'text' | 'aborted'>;
  providers: {
    calls: unknown[];
    deliveries: unknown[];
  };
};
const observations = new Map<string, Observation[]>();
/** Keep the production checks both incremental and individually reported. */
function verifyObservations(test: (typeof cases)[number], values: Observation[]) {
  if (test.scenario === 'version-toString') {
    const control = observations.get(test.key.replace(/version-toString$/, 'safe-version'))!;
    for (let index = 0; index < values.length; index++) {
      assert.deepEqual(values[index], control[index], test.key);
    }
  }
  for (const value of values) {
    assert(!value.wire.text.includes('provider-password-token-marker'), test.key);
    if (
      ['anonymous', 'missing-actor', 'invalid-body-anonymous', 'invalid-body-missing-actor'].includes(test.scenario)
    ) {
      assert([401, 403].includes(value.wire.status), test.key);
      assert.equal(value.providers.calls.length, 0, test.key);
    }
    if (
      ['upstream-error', 'timeout', 'malformed', 'invalid-json', 'disconnect', 'malformed-tree'].includes(test.scenario)
    )
      assert(value.providers.calls.length > 0, test.key + ': provider fault must cross the network boundary');
    if (test.scenario === 'invalid-parent') assert.equal(value.wire.status, 500, test.key);
    if (test.scenario === 'missing-parent') assert.equal(value.wire.status, 400, test.key);
    if (
      !test.reduced &&
      test.scenario.startsWith('body-') &&
      (test.route.controller === 'BrandingController' ||
        (test.route.controller === 'VocabularyController' && test.route.action === 'sync'))
    )
      assert.equal(value.wire.status, 200, test.key + ': ' + value.wire.text);
    if (test.scenario === 'success')
      assert([200, 201, 204].includes(value.wire.status), test.key + ': ' + value.wire.text);
    if (['conditional-get', 'conditional-head'].includes(test.scenario)) assert.equal(value.wire.status, 304, test.key);
  }
}
function endpoint(route: Route, ids: IntegrationIds, scenario: string) {
  const replacements: Record<string, string> = {
    branding: scenario === 'foreign-brand' ? 'other' : 'default',
    portal: 'rdmp',
    id: route.controller.includes('Figshare') ? ids.crosswalk : ids.vocabulary,
    sourceId: ids.source,
    runId: ids.run,
    versionId: ids.version,
    slot: 'regular',
    vocabIdOrSlug: 'owned',
    queryId: 'owned',
    serviceId: 'datacite',
    provider: 'fixture',
  };
  if (scenario === 'missing-object')
    for (const key of ['id', 'sourceId', 'runId', 'versionId', 'vocabIdOrSlug', 'queryId', 'serviceId', 'provider'])
      replacements[key] = '000000000000000000000099';
  return route.path.replace(/:([A-Za-z]+)/g, (_match, key) => replacements[key] ?? 'missing');
}
async function payload(f: Fixture, route: Route, ids: IntegrationIds): Promise<unknown> {
  const a = route.action;
  if (route.controller.includes('Branding')) {
    const state = await f.data.reference.branding.get().getAdminState('default');
    return { expectedDraftRevision: state.draft.revision, expectedVersion: state.active.version, variables: {} };
  }
  if (route.controller.includes('FigshareCrosswalk')) {
    if (a === 'create') return { name: 'New crosswalk', localVocabularyId: ids.vocabulary, sourceId: ids.source };
    return { revision: ids.revision, changes: [] };
  }
  if (route.controller.includes('FigshareVocabulary')) {
    if (a === 'applyPreview') {
      const preview = await f.portal.providers.figshareVocabulary
        .get()
        .getPreview(ids.run, {}, { brandId: f.brand.id, userId: 'pilot-admin' });
      return {
        remoteHash: ids.remoteHash,
        approvedProposalIds: preview.page.records.map(row => String(Reflect.get(Object(row), 'proposalId'))),
      };
    }
    return { scope: 'public', taxonomyId: '10', sourceId: ids.source, name: 'Cloned', slug: 'cloned' };
  }
  if (a === 'import') return { rvaId: '225' };
  if (a === 'sync') return { versionId: '1' };
  if (a === 'reorder') return { entryOrders: [{ id: ids.entry, order: 0 }] };
  if (a === 'sendNotification')
    return {
      to: 'recipient@example.invalid',
      from: 'sender@example.invalid',
      format: 'text',
      subject: 'Integration',
      template: 'test',
      data: { name: 'Alpha' },
    };
  if (a === 'serviceEntries') return { search: 'Alpha', rows: 5 };
  if (a === 'externalEntries') return { options: { query: 'Alpha' } };
  return {
    name: route.action === 'create' ? 'Created' : 'Updated',
    entries: [{ label: 'Beta', identifier: 'beta', value: 'B' }],
  };
}
const integrationSuiteTitle = 'FM-027 retained production integration HTTP differential';
describe(integrationSuiteTitle, function () {
  this.timeout(2400000);
  before(async () => {
    const prepared = mutationWitnessCases(integrationSuiteTitle, cases, test => test.key);
    const provider = await integrationProviderFixture();
    try {
      for (const reduced of [false, true])
        for (const mode of ['fastify']) {
          if (!prepared.some(c => c.reduced === reduced)) continue;
          const policies = portalHttpPolicies();
          if (reduced)
            for (const controller of new Set(integrationDeclarations.map(r => r.controller)))
              policies[controller] = ['noCache', 'brandingAndPortal'];
          provider.reset();
          const f = await referenceProductionFixture(mode === 'fastify', policies, undefined, {
            declarations: scope,
            configuration: provider.configuration,
          });
          try {
            const login = await session(f),
              ids = await seedIntegrations(f),
              baseline = new Map<string, Document[]>();
            for (const name of stateCollections)
              baseline.set(name, await f.client.db().collection(name).find({}).toArray());
            let observed = 0;
            for (const test of prepared.filter(c => c.reduced === reduced)) {
              for (const [name, rows] of baseline) {
                await f.client.db().collection(name).deleteMany({});
                if (rows.length) await f.client.db().collection(name).insertMany(rows);
              }
              await f.client.db().collection('agendaJobs').deleteMany({ name: mutationJobs });
              provider.reset();
              const { route, scenario, version } = test;
              let body = await payload(f, route, ids);
              const headers: Record<string, string> = {
                ...login,
                Authorization: 'Bearer pilot-api-token',
                Origin: referenceOrigin,
                'Content-Type': 'application/json',
                'X-ReDBox-Api-Version': version,
              };
              if (['session', 'missing-actor', 'invalid-body-missing-actor', 'no-csrf'].includes(scenario))
                delete headers.Authorization;
              if (['anonymous', 'invalid-body-anonymous'].includes(scenario)) {
                delete headers.Authorization;
                delete headers.Cookie;
                delete headers['X-CSRF-Token'];
              }
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
              if (scenario === 'reader') headers.Authorization = 'Bearer reader-token';
              if (scenario === 'foreign-role') headers.Authorization = 'Bearer foreign-token';
              if (scenario === 'invalid-bearer') headers.Authorization = 'Bearer invalid';
              if (scenario === 'no-csrf') delete headers['X-CSRF-Token'];
              if (scenario === 'foreign-origin') headers.Origin = 'https://foreign.invalid';
              if (scenario.startsWith('invalid-body')) body = [];
              if (scenario === 'body-object') body = {};
              if (scenario === 'body-empty') headers['Content-Length'] = '0';
              if (scenario === 'body-absent') delete headers['Content-Type'];
              const query = new URLSearchParams();
              if (route.action === 'listCatalogues') query.set('scope', 'public');
              if (route.action === 'index') query.set('oid', 'reference-record');
              if (route.action === 'expandPath') query.set('notation', 'A');
              if (route.action === 'find') query.set('name', 'pilot');
              if (scenario === 'invalid-parent') query.set('parentId', 'not-a-valid-parent-id');
              if (scenario === 'missing-parent') query.set('parentId', '000000000000000000000099');
              let tail = query.toString();
              if (scenario === 'nested-query')
                tail += '&limit[bad]=x&offset[bad]=x&name[bad]=x&scope[bad]=x&oid[bad]=x';
              if (scenario === 'duplicate-query') tail += '&limit=1&limit=2&scope=public&scope=account&name=x&name=y';
              if (['safe-version', 'version-toString', 'array-version'].includes(scenario)) {
                delete headers['X-ReDBox-Api-Version'];
                tail +=
                  '&' +
                  (scenario === 'safe-version'
                    ? 'apiVersion[unknown]=invalid'
                    : scenario === 'version-toString'
                      ? 'apiVersion[toString]=bad'
                      : 'apiVersion=1.0&apiVersion=2.0');
              }
              if (scenario === 'header-version-priority') tail += '&apiVersion=1.0';
              const url = f.url + endpoint(route, ids, scenario) + (tail ? '?' + tail : '');
              if (['conditional-get', 'conditional-head'].includes(scenario)) {
                const control = await wire(url, 'GET', headers);
                assert.equal(control.status, 200, control.text);
                headers['If-None-Match'] = String(control.headers.etag ?? '*');
              }
              if (
                ['upstream-error', 'timeout', 'malformed', 'invalid-json', 'disconnect', 'malformed-tree'].includes(
                  scenario
                )
              )
                provider.setMode(scenario);
              const method = ['head', 'conditional-head'].includes(scenario) ? 'HEAD' : route.method.toUpperCase();
              const headControl =
                method === 'HEAD' ? await wire(url, 'GET', { ...headers, 'If-None-Match': '' }) : undefined;
              const response = await authorizationWitness(`${integrationSuiteTitle} ${test.key}`, () =>
                wire(
                  url,
                  method,
                  headers,
                  ['GET', 'HEAD'].includes(method) || ['body-empty', 'body-absent'].includes(scenario)
                    ? ''
                    : JSON.stringify(body),
                  30000
                )
              );
              await settleMutationWork(f);
              const value = {
                ...(await normalizeIntegrations(f, response, headControl?.text)),
                providers: {
                  calls: provider.calls.map(c => ({ ...c, path: c.path.replace(/page%5B/gi, 'page[') })),
                  deliveries: provider.deliveries.map(text =>
                    text.replace(/^(Message-ID|Date):.*$/gm, '$1: <generated>')
                  ),
                },
              };
              const values = observations.get(test.key) ?? [];
              values.push(value);
              observations.set(test.key, values);
              verifyObservations(test, values);
              if (++observed % 100 === 0)
                process.stdout.write(`FM027 ${mode} ${reduced ? 'reduced' : 'default'} ${observed}\n`);
            }
          } finally {
            await f.close();
          }
        }
    } finally {
      await provider.close();

      if (process.env.FM027_HTTP_REPORT) {
        // Each observation includes full persisted state. Stream entries instead
        // of allocating one string beyond V8's maximum string length.
        const report = await open(process.env.FM027_HTTP_REPORT, 'w');
        try {
          await report.writeFile('{"cases":[');
          let separator = '';
          for (const entry of observations) {
            await report.writeFile(separator + JSON.stringify(entry));
            separator = ',';
          }
          await report.writeFile(']}\n');
        } finally {
          await report.close();
        }
      }
    }
  });
  for (const test of cases)
    it(test.key, () => {
      const values = observations.get(test.key)!;
      assert.equal(values?.length, 1);
      assertProductionContract('integration', test.key, values[0]);
      verifyObservations(test, values);
    });
});

goldenControls('integration');
