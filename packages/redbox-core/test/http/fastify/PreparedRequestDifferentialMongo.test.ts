import { goldenControls } from './goldenContracts';
import { assertProductionContract } from './productionContracts';
import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
import sinon from 'sinon';
import { Session } from 'node:inspector/promises';

import {
  integrationDeclarations,
  brandingOperationRoutes,
  vocabularyIntegrationRoutes,
} from '../../../src/http/integrationRoutes';
import { referenceProductionFixture, referenceOrigin } from './referenceProductionFixture';

import { integrationProviderFixture } from './integrationProviderFixture';
import { seedIntegrations, normalizeIntegrations } from './integrationDifferentialSupport';
import { wire, session, settleMutationWork } from './mutationDifferentialSupport';
import { onReplacement } from './requestReplacementHook';
const routes = [
  ...brandingOperationRoutes.filter(route => ['createPreview', 'preview'].includes(route.action)),
  ...vocabularyIntegrationRoutes.filter(route => route.action === 'sync'),
];
const cases = routes.flatMap(route =>
  ['1.0', '2.0'].flatMap(version => ['body', 'query', 'params'].map(field => ({ route, version, field })))
);
const observations = new Map<string, unknown[]>();
describe('FM-027 production beforeAction replacement differential', function () {
  this.timeout(300000);
  before(async () => {
    const provider = await integrationProviderFixture();
    try {
      for (const mode of ['fastify']) {
        const f = await referenceProductionFixture(mode === 'fastify', undefined, undefined, {
          declarations: integrationDeclarations,
          configuration: provider.configuration,
          hooksModule: require.resolve('./requestReplacementHook'),
        });
        try {
          const login = await session(f),
            ids = await seedIntegrations(f);
          const revision = (await f.data.reference.branding.get().getAdminState('default')).draft.revision;
          // Precise V8 call counts observe the real frozen preparers without
          // replacing declaration descriptors, providers or action inputs.
          const coverage = new Session();
          coverage.connect();
          await coverage.post('Profiler.enable');
          await coverage.post('Profiler.startPreciseCoverage', { callCount: true, detailed: false });
          const lookup = sinon.spy(f.data.reference.branding.get(), 'getAdminState');
          try {
            for (const test of cases) {
              await coverage.post('Profiler.takePreciseCoverage');
              lookup.resetHistory();
              let hookCalls = 0;
              const { route, version, field } = test;
              const isPreview = route.action !== 'sync';
              const params = {
                branding: 'default',
                portal: 'rdmp',
                ...(isPreview ? {} : { id: '000000000000000000999999' }),
                marker: 'replacement',
              };
              const replacement =
                field === 'body'
                  ? { body: isPreview ? { expectedDraftRevision: revision - 1 } : { versionId: 'invalid' } }
                  : field === 'query'
                    ? { query: { apiVersion: version, marker: 'replacement' } }
                    : { params };
              onReplacement(async request => {
                hookCalls++;
                const counts = await coverage.post('Profiler.takePreciseCoverage');
                for (const script of counts.result.filter(script =>
                  /\/(brandingOperations|vocabularyIntegrations)\.ts$/.test(script.url)
                ))
                  for (const fn of script.functions.filter(fn => fn.functionName === 'run'))
                    assert.equal(fn.ranges[0].count, 0, 'Preparation must run after hooks');
                assert.equal(lookup.callCount, 0, 'Retained alias revision preparation must run after hooks');
                if (field === 'params') assert.deepEqual(request.params, params);
              });
              const path = route.path
                .replace(':branding', 'default')
                .replace(':portal', 'rdmp')
                .replace(':id', ids.vocabulary);
              const response = await wire(
                f.url + path + '?apiVersion=' + (field === 'query' ? (version === '1.0' ? '2.0' : '1.0') : version),
                'POST',
                {
                  ...login,
                  Authorization: 'Bearer pilot-api-token',
                  Origin: referenceOrigin,
                  'Content-Type': 'application/json',
                  'x-fm027-replacement': JSON.stringify(replacement),
                },
                JSON.stringify(isPreview ? { expectedDraftRevision: revision } : {})
              );
              assert.equal(hookCalls, 1);
              const preparedPreview = route.action === 'createPreview',
                preparedSync = route.controller === 'VocabularyController';
              const counts = await coverage.post('Profiler.takePreciseCoverage');
              const runCount = (name: string) =>
                counts.result
                  .filter(script => script.url.endsWith('/actions/' + name + '.ts'))
                  .flatMap(script => script.functions)
                  .filter(fn => fn.functionName === 'run')
                  .reduce((count, fn) => count + fn.ranges[0].count, 0);
              // Node 26's precise coverage counts async entry and resumption.
              // This preparer has exactly one await; the domain lookup below
              // independently asserts one actual preparation, with no spy on
              // the frozen declaration. Optional-body preparation is synchronous.
              assert.equal(runCount('brandingOperations'), 2 * Number(preparedPreview));
              assert.equal(runCount('vocabularyIntegrations'), Number(preparedSync));
              assert.equal(
                lookup.callCount,
                Number(preparedPreview),
                `Exactly one alias revision lookup: ${mode} ${route.controller}.${route.action} ${field} ${version}: ${response.status} ${response.text}`
              );
              if (field === 'body') assert.equal(response.status, isPreview ? 409 : 400, response.text);
              else if (field === 'params' && !isPreview) assert.equal(response.status, 404, response.text);
              else assert.equal(response.status, 200, response.text);
              await settleMutationWork(f);
              const normalized = await normalizeIntegrations(f, response);
              const key = `${route.controller}.${route.action} ${route.path} ${field} v${version}`;
              // Other cases legitimately add audit/cache entries; compare the HTTP
              // result here. The complete integration gate compares persisted state.
              const entries = observations.get(key) ?? [];
              entries.push(normalized.wire);
              observations.set(key, entries);
            }
          } finally {
            await coverage.post('Profiler.stopPreciseCoverage');
            coverage.disconnect();
            lookup.restore();
            onReplacement();
          }
        } finally {
          await f.close();
        }
      }
    } finally {
      await provider.close();
    }
    if (process.env.FM027_HOOK_REPORT)
      await writeFile(process.env.FM027_HOOK_REPORT, JSON.stringify([...observations], null, 2));
  });
  for (const { route, version, field } of cases) {
    const key = `${route.controller}.${route.action} ${route.path} ${field} v${version}`;
    it(key, () => {
      const entries = observations.get(key)!;
      assert.equal(entries.length, 1);
      assertProductionContract('prepared', key, entries[0]);
    });
  }
});

goldenControls('prepared');
