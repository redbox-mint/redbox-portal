import { assertGoldenNext, goldenControls } from './goldenContracts';
import { recordApiRoutes } from '../../../src/api-routes/groups/records';
import { firstValueFrom } from 'rxjs';
import type { Document } from 'mongodb';
import assert from 'node:assert/strict';
import { createServer, request } from 'node:http';
import { once } from 'node:events';
import { writeFile } from 'node:fs/promises';
import { setTimeout as pause } from 'node:timers/promises';

import { mutationDeclarations, recordMutationRoutes, configurationWriteRoutes } from '../../../src/http/mutationRoutes';
import { referenceReadDeclarations } from '../../../src/http/referenceRoutes';
import { recordQueryReadDeclarations } from '../../../src/http/readRoutes';
import { getReferenceRepositories } from '../../../src/persistence/reference/runtime';
import { BrandingModel } from '../../../src/model/storage/BrandingModel';
import { formatRecordEntityTag } from '../../../src/RecordEntityTag';
import { persistenceStatus } from '../../../src/persistence/runtime';
import { referenceProductionFixture, referenceOrigin } from './referenceProductionFixture';

import {
  recordRace,
  recordInterleavings,
  raceRequestIds,
  dashboardRace,
  dashboardInterleavings,
} from './mutationRaceSupport';
import {
  wire,
  session,
  seedMutationState,
  settleMutationWork,
  normalizeMutation,
  mutationCollections,
  mutationJobs,
  dashboardMutationPayload,
  type Fixture,
} from './mutationDifferentialSupport';
const retainedObservations: Record<string, any> = {};
const modes = ['fastify'] as const;
const scope = [...referenceReadDeclarations, ...recordQueryReadDeclarations, ...mutationDeclarations];

async function fingerprint(
  f: Fixture,
  record: Parameters<ReturnType<Fixture['data']['records']['get']>['getRecordFormFingerprint']>[0]
) {
  const type = await firstValueFrom(
    f.data.reference.types.get().get(Object.assign(new BrandingModel(), f.brand), 'dataRecord')
  );
  assert(type);
  const value = await f.data.records.get().getRecordFormFingerprint(record, { ...type });
  assert(value);
  return value;
}
async function fixture(
  mode: (typeof modes)[number],
  extra: Omit<NonNullable<Parameters<typeof referenceProductionFixture>[3]>, 'declarations'> = {}
) {
  try {
    return {
      f: await referenceProductionFixture(mode === 'fastify', undefined, undefined, {
        declarations: scope,
        ...extra,
      }),
      release: () => undefined,
    };
  } catch (error) {
    throw error;
  }
}
function headers(login: Record<string, string>, version = '2.0') {
  return {
    ...login,
    Origin: referenceOrigin,
    Authorization: 'Bearer pilot-api-token',
    'Content-Type': 'application/json',
    'X-ReDBox-Api-Version': version,
    'X-ReDBox-Save-Request-Id': 'fm026-lifecycle',
  };
}
async function solrRecord(oid: string) {
  const response = await fetch(
    'http://127.0.0.1:' + process.env.HTTP_READ_SOLR_PORT + '/solr/redbox/select?q=id:' + encodeURIComponent(oid)
  );
  assert(response.ok);
  return (await response.json()).response.docs;
}
async function resetSolr() {
  const response = await fetch(
    'http://127.0.0.1:' + process.env.HTTP_READ_SOLR_PORT + '/solr/redbox/update?commit=true',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ delete: { query: '*:*' } }),
    }
  );
  assert(response.ok);
}
describe('FM-026 production concurrency, revision, retry and accepted side effects', function () {
  this.timeout(240000);
  after(async () => {
    if (process.env.FM026_LIFECYCLE_REPORT)
      await writeFile(process.env.FM026_LIFECYCLE_REPORT, JSON.stringify(retainedObservations, null, 2));
  });
  it('combines native raw upload, inherited metadata, reads and mutation actions in one resolved controller', async () => {
    const upload = recordApiRoutes.find(route => route.action === 'addDataStreams');
    assert(upload);
    const f = await referenceProductionFixture(true, undefined, undefined, { declarations: [...scope, upload] });
    try {
      const login = await session(f);
      await seedMutationState(f, login);
      const base = headers(login);
      const created = await wire(
        f.url + '/default/rdmp/api/records/metadata/dataRecord',
        'POST',
        base,
        JSON.stringify({ metadata: { title: 'Combined create' } })
      );
      assert.equal(created.status, 201, created.text);
      const updated = await wire(
        f.url + '/default/rdmp/api/records/metadata/reference-record',
        'PUT',
        base,
        JSON.stringify({ title: 'Inherited update' })
      );
      assert.equal(updated.status, 200, updated.text);
      const uploaded = await wire(f.url + '/default/rdmp/api/records/datastreams/reference-record', 'POST', base, '{}');
      assert.equal(uploaded.status, 400, uploaded.text);
      await settleMutationWork(f);
      assert.equal((await f.data.storage().getMeta('reference-record')).metadata.title, 'Inherited update');
    } finally {
      await f.close();
    }
  });
  it('matches strict record writes and real races across every migrated concurrency-capable action', async () => {
    const observations: unknown[][] = [];
    for (const mode of modes) {
      const { f, release } = await fixture(mode);
      try {
        const login = await session(f);
        await seedMutationState(f, login);
        await getReferenceRepositories(f.owner).recordTypes.reviseDefinition('000000000000000000000021', {
          concurrentModification: { mode: 'strict' },
        });
        const baseline = new Map<string, Document[]>();
        for (const name of mutationCollections)
          baseline.set(name, await f.client.db().collection(name).find({}).toArray());
        const results = [];
        for (const version of ['1.0', '2.0'])
          for (const route of recordMutationRoutes.filter(route => route.action !== 'create'))
            for (const interleaving of recordInterleavings) {
              for (const [name, rows] of baseline) {
                await f.client.db().collection(name).deleteMany({});
                if (rows.length) await f.client.db().collection(name).insertMany(rows);
              }
              await f.client.db().collection('agendaJobs').deleteMany({ name: mutationJobs });
              await resetSolr();
              const deleted = route.action === 'restoreRecord' || route.action === 'destroyDeletedRecord';
              const oid = deleted ? 'deleted-record' : 'reference-record';
              const current = deleted
                ? await f.data.records.get().getDeletedRecordMeta(oid, Object.assign(new BrandingModel(), f.brand))
                : await f.data.storage().getMeta(oid);
              assert(current);
              const path = route.path
                .replace(':branding', 'default')
                .replace(':portal', 'rdmp')
                .replace(':oid', oid)
                .replace(':targetStep', 'published');
              const body =
                route.action === 'updateObjectMeta'
                  ? current.metaMetadata
                  : /^(add|remove)/.test(route.action)
                    ? { users: ['reader'], roles: ['Researcher'], pendingUsers: ['pending@example.invalid'] }
                    : { title: 'Identical racing value' };
              const base = {
                  ...headers(login, version),
                  ...(route.controller === 'RecordController'
                    ? { 'X-ReDBox-Form-Fingerprint': await fingerprint(f, current) }
                    : {}),
                },
                tag = formatRecordEntityTag(oid, current.revision!);
              const missing = await wire(f.url + path, route.method.toUpperCase(), base, JSON.stringify(body));
              assert.equal(missing.status, 428, mode + ' ' + path + ' ' + missing.text);
              const stale = await wire(
                f.url + path,
                route.method.toUpperCase(),
                { ...base, 'If-Match': formatRecordEntityTag(oid, current.revision! + 10) },
                JSON.stringify(body)
              );
              assert.equal(stale.status, 412, mode + ' ' + path + ' ' + stale.text);
              const { responses, trace } = await recordRace(f, route.action, interleaving, participant =>
                wire(
                  f.url + path,
                  route.method.toUpperCase(),
                  {
                    ...base,
                    'If-Match': tag,
                    'X-ReDBox-Save-Request-Id': raceRequestIds[participant],
                  },
                  JSON.stringify(body)
                )
              );
              (retainedObservations.recordRaceWire ??= []).push({
                mode,
                route: route.controller + '.' + route.action,
                version,
                interleaving,
                responses,
              });
              await settleMutationWork(f);
              const winner = await normalizeMutation(f, responses[0]),
                loser = await normalizeMutation(f, responses[1]);
              assert.deepEqual(winner.state, loser.state);
              results.push({
                route: route.controller + '.' + route.action,
                version,
                interleaving,
                trace,
                missing: (await normalizeMutation(f, missing)).wire,
                stale: (await normalizeMutation(f, stale)).wire,
                winner: winner.wire,
                loser: loser.wire,
                state: winner.state,
              });
            }
        observations.push(results);
      } finally {
        await f.close();
        await release();
      }
    }
    retainedObservations.races = observations;
    assertGoldenNext('mutation-lifecycle-mongo', observations[0]);
  });
  it('matches workflow transitions, revision history, tracked-harvest retries and legacy duplicate-create behavior', async () => {
    const observations = [];
    for (const mode of modes) {
      const { f, release } = await fixture(mode);
      try {
        const login = await session(f);
        await seedMutationState(f, login);
        const base = headers(login);
        const transitions = [];
        for (const [path, body] of [
          ['/api/records/workflow/step/published/reference-record', {}],
          ['/record/workflow/step/draft/reference-record', { title: 'Browser transition' }],
        ] as const) {
          const before = await f.data.storage().getMeta('reference-record');
          const response = await wire(
            f.url + '/default/rdmp' + path,
            'POST',
            {
              ...base,
              'If-Match': formatRecordEntityTag('reference-record', before.revision!),
              ...(path.startsWith('/record/') ? { 'X-ReDBox-Form-Fingerprint': await fingerprint(f, before) } : {}),
            },
            JSON.stringify(body)
          );
          assert.equal(response.status, 200, response.text);
          const current = await f.data.storage().getMeta('reference-record');
          assert(current.revision! > before.revision!);
          assert.equal(current.workflow.stage, path.includes('/published/') ? 'published' : 'draft');
          await settleMutationWork(f);
          transitions.push(await normalizeMutation(f, response));
        }
        const tracked = {
          sourceRunId: 'retry-run',
          sourceName: 'fm026',
          chunk: { index: 0 },
          records: [
            { harvestId: 'retry-record', operation: 'create', recordRequest: { metadata: { title: 'Harvest retry' } } },
          ],
        };
        const first = await wire(
          f.url + '/default/rdmp/api/records/harvest/dataRecord',
          'POST',
          base,
          JSON.stringify(tracked)
        );
        assert.equal(first.status, 200, first.text);
        await settleMutationWork(f);
        const revision = (await f.client.db().collection('record').findOne({ harvestId: 'retry-record' }))!.revision;
        const auditCount = await f.client.db().collection('recordaudit').countDocuments({});
        const jobsCount = await f.client.db().collection('agendaJobs').countDocuments({ name: mutationJobs });
        const retry = await wire(
          f.url + '/default/rdmp/api/records/harvest/dataRecord',
          'POST',
          base,
          JSON.stringify(tracked)
        );
        assert.equal(retry.status, 200, retry.text);
        await settleMutationWork(f);
        assert.equal(await f.client.db().collection('record').countDocuments({ harvestId: 'retry-record' }), 1);
        assert.equal(
          (await f.client.db().collection('record').findOne({ harvestId: 'retry-record' }))!.revision,
          revision
        );
        assert.equal(await f.client.db().collection('recordaudit').countDocuments({}), auditCount);
        assert.equal(await f.client.db().collection('agendaJobs').countDocuments({ name: mutationJobs }), jobsCount);
        // Characterize the retained behavior; do not add transport-level idempotency.
        const create = () =>
          wire(
            f.url + '/default/rdmp/api/records/metadata/dataRecord',
            'POST',
            base,
            JSON.stringify({ metadata: { title: 'Repeated create' } })
          );
        const created1 = await create(),
          created2 = await create();
        assert.equal(created1.status, 201, created1.text);
        assert.equal(created2.status, 201, created2.text);
        assert.notEqual(JSON.parse(created1.text).data.oid, JSON.parse(created2.text).data.oid);
        assert.equal(
          await f.client.db().collection('record').countDocuments({ 'metadata.title': 'Repeated create' }),
          2
        );
        await settleMutationWork(f);
        assert(
          (await f.client.db().collection('recordschemareference').countDocuments({ oid: 'reference-record' })) >= 1
        );
        assert.equal(
          await f.client.db().collection('recordaudit').countDocuments({ redboxOid: 'reference-record' }),
          2
        );
        observations.push({
          transitions,
          first: await normalizeMutation(f, first),
          retry: await normalizeMutation(f, retry),
          repeatedCreates: 2,
        });
      } finally {
        await f.close();
        await release();
      }
    }
    retainedObservations.workflows = observations;
    assertGoldenNext('mutation-lifecycle-mongo', observations[0]);
  });
  it('matches dashboard revision saves and copy races through browser and API routes', async () => {
    const observations = [];
    for (const mode of modes) {
      const { f, release } = await fixture(mode);
      try {
        const login = await session(f);
        await seedMutationState(f, login);
        const baseline = new Map<string, Document[]>();
        for (const name of mutationCollections)
          baseline.set(name, await f.client.db().collection(name).find({}).toArray());
        const results = [];
        for (const version of ['1.0', '2.0'])
          for (const route of configurationWriteRoutes.filter(route =>
            ['saveWorkflowTarget', 'saveViewTarget', 'applyCopy'].includes(route.action)
          ))
            for (const interleaving of dashboardInterleavings.filter(
              value => route.action !== 'applyCopy' || value !== 'save-read-after-winner'
            )) {
              for (const [name, rows] of baseline) {
                await f.client.db().collection(name).deleteMany({});
                if (rows.length) await f.client.db().collection(name).insertMany(rows);
              }
              await f.data.reference.appConfigs.get().bootstrap();
              const payload = await dashboardMutationPayload(f, route.action);
              const path = route.path
                .replace(':branding', 'default')
                .replace(':portal', 'rdmp')
                .replace(':recordType', 'dataRecord')
                .replace(':stage', 'draft')
                .replace(':view', 'referenceView')
                .replace(':step', 'draft');
              const send = () =>
                wire(f.url + path, route.method.toUpperCase(), headers(login, version), JSON.stringify(payload));
              const { responses, trace } = await dashboardRace(f, route.action, interleaving, send);
              (retainedObservations.dashboardRaceWire ??= []).push({
                mode,
                route: route.controller + '.' + route.action,
                version,
                interleaving,
                responses,
              });
              const retry = await send();
              assert.equal(retry.status, 409, retry.text);
              await settleMutationWork(f);
              results.push({
                route: route.controller + '.' + route.action,
                version,
                interleaving,
                trace,
                winner: (await normalizeMutation(f, responses[0])).wire,
                loser: (await normalizeMutation(f, responses[1])).wire,
                retry: await normalizeMutation(f, retry),
              });
            }
        observations.push(results);
      } finally {
        await f.close();
        await release();
      }
    }
    retainedObservations.dashboard = observations;
    assertGoldenNext('mutation-lifecycle-mongo', observations[0]);
  });
  it('owns a disconnected configured action and characterizes repeated save-request IDs', async () => {
    const observations = [];
    for (const mode of modes) {
      let calls = 0;
      const entered = Promise.withResolvers<void>(),
        resume = Promise.withResolvers<void>();
      const { f, release } = await fixture(mode, {
        actions: {
          owned: {
            authorize: async () => true,
            execute: async () => {
              calls++;
              entered.resolve();
              await resume.promise;
              return { accepted: true };
            },
          },
        },
      });
      try {
        const login = await session(f);
        await seedMutationState(f, login);
        const completed = Promise.withResolvers<number>(),
          base = headers(login);
        const client = request(
          f.url + '/default/rdmp/action/owned',
          { method: 'POST', agent: false, headers: base },
          res => {
            res.resume();
            completed.resolve(res.statusCode!);
          }
        );
        client.on('error', () => completed.resolve(0));
        client.end('{}');
        try {
          await Promise.race([
            entered.promise,
            completed.promise.then(status => {
              throw new Error('Action ended before gate: ' + status);
            }),
          ]);
          const closed = new Promise<void>(resolve => client.once('close', () => resolve()));
          client.destroy();
          await closed;
          assert.equal(calls, 1);
          resume.resolve();
          const deadline = Date.now() + 10000;
          while ((await f.client.db().collection('useraudit').countDocuments({ action: 'action:owned' })) !== 1) {
            assert(Date.now() < deadline, 'Accepted action must audit');
            await pause(10);
          }
          const retry = await wire(f.url + '/default/rdmp/action/owned', 'POST', base, '{}');
          assert.equal(retry.status, 200, retry.text);
          assert.equal(calls, 2);
          assert.equal(await f.client.db().collection('useraudit').countDocuments({ action: 'action:owned' }), 2);
          await settleMutationWork(f);
          observations.push({ calls, result: await normalizeMutation(f, retry) });
        } finally {
          resume.resolve();
          client.destroy();
        }
      } finally {
        await f.close();
        await release();
      }
    }
    retainedObservations.configuredAction = observations;
    assertGoldenNext('mutation-lifecycle-mongo', observations[0]);
  });
  it('keeps hooks, triggers, audit, real Solr and queue side effects owned after disconnect and stop timeout, without duplicate conditional retries', async () => {
    const observations = [];
    for (const mode of modes) {
      const sinkEvents: string[] = [];
      const sink = createServer((req, res) => {
        sinkEvents.push(req.url!);
        req.resume();
        res.end('ok');
      });
      sink.listen(0, '127.0.0.1');
      await once(sink, 'listening');
      const address = sink.address();
      assert(address && typeof address === 'object');
      let f: Fixture | undefined,
        release: () => Promise<void> | undefined = () => undefined;
      const gate = () => ({
        sync: Promise.withResolvers<void>(),
        syncRelease: Promise.withResolvers<void>(),
        post: Promise.withResolvers<void>(),
        postRelease: Promise.withResolvers<void>(),
        job: Promise.withResolvers<void>(),
        jobRelease: Promise.withResolvers<void>(),
      });
      let gates = gate(),
        syncCalls = 0,
        postCalls = 0,
        jobCalls = 0;
      try {
        const created = await fixture(mode, {
          configuration: {
            agendaQueue: {
              options: { processEvery: '0.05 seconds' },
              jobs: { 'FM026-Trigger': { fnName: 'rdmpservice.queuedTriggerSubscriptionHandler' } },
            },
          },
          bindings: {
            recordOperations: {
              'fm026.sync': async (_oid: unknown, record: unknown) => {
                syncCalls++;
                gates.sync.resolve();
                await gates.syncRelease.promise;
                return record;
              },
              'fm026.post': async (_oid: unknown, record: unknown) => {
                postCalls++;
                gates.post.resolve();
                await gates.postRelease.promise;
                assert((await fetch('http://127.0.0.1:' + address.port + '/post/' + postCalls)).ok);
                return record;
              },
              'fm026.job': async (_oid: unknown, record: unknown) => {
                jobCalls++;
                gates.job.resolve();
                await gates.jobRelease.promise;
                assert((await fetch('http://127.0.0.1:' + address.port + '/job/' + jobCalls)).ok);
                return record;
              },
            },
          },
        });
        f = created.f;
        release = created.release;
        const login = await session(f);
        await seedMutationState(f, login);
        await resetSolr();
        await getReferenceRepositories(f.owner).recordTypes.reviseDefinition('000000000000000000000021', {
          concurrentModification: { mode: 'strict' },
          hooks: {
            onUpdate: {
              postSync: [{ function: 'fm026.sync' }],
              post: [
                { function: 'fm026.post' },
                {
                  function: 'record.queueTriggerCall',
                  options: { jobName: 'FM026-Trigger', triggerConfiguration: { function: 'fm026.job' } },
                },
              ],
            },
          },
        });
        for (let iteration = 1; iteration <= 2; iteration++) {
          gates = gate();
          const before = await f.data.storage().getMeta('reference-record'),
            tag = formatRecordEntityTag('reference-record', before.revision!);
          const base = {
            ...headers(login),
            'If-Match': tag,
            'X-ReDBox-Form-Fingerprint': await fingerprint(f, before),
          };
          const completed = Promise.withResolvers<number>();
          const client = request(
            f.url + '/default/rdmp/recordmeta/reference-record',
            { method: 'PUT', agent: false, headers: base },
            res => {
              let body = '';
              res.on('data', chunk => (body += chunk));
              res.on('end', () => {
                if (res.statusCode !== 200)
                  process.stderr.write('Lifecycle response ' + res.statusCode + ' ' + body + '\n');
                completed.resolve(res.statusCode!);
              });
            }
          );
          client.on('error', () => completed.resolve(0));
          client.end(JSON.stringify({ title: 'Owned ' + iteration }));
          try {
            await Promise.race([
              gates.sync.promise,
              completed.promise.then(status => {
                throw new Error('Request ended before held hook: ' + status);
              }),
            ]);
            const closed = new Promise<void>(resolve => client.once('close', () => resolve()));
            client.destroy();
            await closed;
            assert.equal((await f.data.storage().getMeta('reference-record')).metadata.title, 'Owned ' + iteration);
            assert(persistenceStatus(f.owner).pools > 0);
            const retry = await wire(
              f.url + '/default/rdmp/recordmeta/reference-record',
              'PUT',
              base,
              JSON.stringify({ title: 'Owned ' + iteration })
            );
            assert.equal(retry.status, 412, retry.text);
            assert.equal(syncCalls, iteration);
            gates.syncRelease.resolve();
            await Promise.all([gates.post.promise, gates.job.promise]);
            if (iteration === 2) {
              // The existing audit grace expires while the detached work is held.
              // Wait for the real audit/index workers before quiescing claims; queued
              // trigger execution itself remains held across the stop deadline.
              const deadline = Date.now() + 10000;
              while (
                (await f.client.db().collection('recordaudit').countDocuments({ redboxOid: 'reference-record' })) !==
                  2 ||
                !JSON.stringify(await solrRecord('reference-record')).includes('Owned 2')
              ) {
                assert(Date.now() < deadline, 'Audit and real index must settle');
                await pause(10);
              }
              await assert.rejects(f.host.stop({ deadlineMs: 25 }), /deadline|timeout/i);
              assert(persistenceStatus(f.owner).pools > 0);
              assert.equal(sinkEvents.length, 2);
            }
            gates.postRelease.resolve();
            gates.jobRelease.resolve();
            if (iteration === 2) await f.host.stop({ deadlineMs: 30000 });
            else await settleMutationWork(f);
            assert.equal(syncCalls, iteration);
            assert.equal(postCalls, iteration);
            assert.equal(jobCalls, iteration);
            assert.equal(sinkEvents.length, iteration * 2);
          } finally {
            client.destroy();
            gates.syncRelease.resolve();
            gates.postRelease.resolve();
            gates.jobRelease.resolve();
          }
        }
        assert.equal(persistenceStatus(f.owner).pools, 0);
        assert.equal(
          await f.client.db().collection('recordaudit').countDocuments({ redboxOid: 'reference-record' }),
          2
        );
        assert.equal(await f.client.db().collection('agendaJobs').countDocuments({ name: 'FM026-Trigger' }), 2);
        const indexed = await solrRecord('reference-record');
        assert.equal(indexed.length, 1);
        assert(JSON.stringify(indexed).includes('Owned 2'));
        observations.push({
          syncCalls,
          postCalls,
          jobCalls,
          sinkEvents: [...sinkEvents].sort(),
          audit: 2,
          jobs: 2,
          state: await normalizeMutation(f, { status: 0, headers: {}, text: '' }),
        });
      } finally {
        gates.syncRelease.resolve();
        gates.postRelease.resolve();
        gates.jobRelease.resolve();
        await f?.close();
        await release();
        await new Promise<void>((resolve, reject) => sink.close(error => (error ? reject(error) : resolve())));
      }
    }
    retainedObservations.ownership = observations;
    assertGoldenNext('mutation-lifecycle-mongo', observations[0]);
  });
});

goldenControls('mutation-lifecycle-mongo');
