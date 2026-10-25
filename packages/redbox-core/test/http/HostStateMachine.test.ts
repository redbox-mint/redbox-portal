import assert from 'node:assert/strict';
import { ApplicationRuntime } from '../../src/application';
import { ExpressHost } from '../../src/http/express/ExpressHost';

const stages = ['initialize', 'prepare', 'activate'] as const;
type Stage = typeof stages[number];
const cases = [
  { event: 'normal' }, { event: 'stop-constructed' }, { event: 'stop-before-bind' },
  ...stages.flatMap(stage => [
    { event: 'stop-stage', stage }, { event: 'deadline-stage', stage }, { event: 'failure-stage', stage },
  ]),
  { event: 'close-failure' }, { event: 'quiesce-failure' }, { event: 'drain-deadline' },
] as const;

describe('Express host lifecycle transition table', function () {
  this.timeout(8000);
  for (const ownerSupplied of [false, true]) for (const row of cases)
    it(`${row.event} ${'stage' in row ? row.stage : ''} owner=${ownerSupplied}`, async () => {
      const owner = { config: {}, log: { warn() {} } };
      const entered = Promise.withResolvers<void>();
      const release = Promise.withResolvers<void>();
      const sentinel = Error('stage failed');
      const events: string[] = [];
      let closeFailures = row.event === 'close-failure' ? 1 : 0;
      let quiesceFailures = row.event === 'quiesce-failure' ? 1 : 0;
      let retained = false;
      const stage = async (name: Stage) => {
        events.push(name);
        if ('stage' in row && row.stage === name) {
          if (row.event === 'failure-stage') throw sentinel;
          entered.resolve(); await release.promise;
        }
        if (name === 'prepare') retained = true;
      };
      const application = new ApplicationRuntime(owner, [{ name: 'native', create: () => ({
        initialize: () => stage('initialize'), activate: () => stage('activate'),
        quiesce: () => { events.push('quiesce'); if (quiesceFailures-- > 0) throw Error('quiesce failed'); },
        drain: async () => { if (row.event === 'drain-deadline') { entered.resolve(); await release.promise; } },
        close: async () => { events.push('close'); if (closeFailures-- > 0) throw Error('close failed'); retained = false; },
      }) }]);
      const host = new ExpressHost(application, { hostname: '127.0.0.1', port: 0,
        ...(ownerSupplied ? { owner } : {}), prepare: async router => {
          await stage('prepare'); router.get('/probe', (_req, res) => res.end('ready'));
        },
      });
      const request = async (path = '/probe') => {
        const address = host.address(); assert(address);
        const response = await fetch(`http://127.0.0.1:${address.port}${path}`);
        await response.text(); return response.status;
      };
      try {
        await assert.rejects(host.activate(), /initialization/);
        if (row.event === 'stop-constructed') {
          await host.stop(); assert.equal(events.length, 0);
        } else {
          const initializing = host.initialize(); assert.equal(host.initialize(), initializing);
          void initializing.catch(() => {});
          if (row.event === 'stop-before-bind') {
            await host.stop(); await assert.rejects(initializing, /stop has begun/);
            assert(!events.includes('initialize'));
          } else if (row.event === 'failure-stage') {
            if (row.stage === 'activate') {
              await initializing; await assert.rejects(host.activate(), error => error === sentinel);
            } else await assert.rejects(initializing, error => error === sentinel);
            assert.equal(host.status().failure, row.stage === 'activate' ? 'activate' : 'initialize');
            assert.equal(events.filter(event => event === 'close').length, 1);
          } else if (row.event === 'stop-stage' || row.event === 'deadline-stage') {
            let startup = initializing;
            if (row.stage === 'activate') { await initializing; startup = host.activate(); }
            void startup.catch(() => {});
            await entered.promise;
            assert.equal(await request(), 503); assert.equal(await request('/readyz'), 503);
            const stopping = host.stop({ deadlineMs: row.event === 'deadline-stage' ? 25 : 3000 });
            assert.equal(host.stop(), stopping);
            if (row.event === 'deadline-stage') {
              await assert.rejects(stopping, /deadline/);
              assert.equal(host.status().stopFailed, true);
              assert(!events.includes('close'));
              assert.equal(application.status().cleanupPending, true);
            }
            release.resolve(); await assert.rejects(startup, /stop has begun/);
            if (row.event === 'stop-stage') await stopping;
            else { assert(!host.status().stopped); await host.stop(); }
            if (row.stage === 'initialize') assert(!events.includes('prepare'));
            if (row.stage !== 'activate') assert(!events.includes('activate'));
          } else {
            await initializing; assert.equal(retained, true);
            assert.equal(await request(), 503);
            const activating = host.activate(); assert.equal(host.activate(), activating); await activating;
            assert.equal(await request(), 200); assert.equal(await request('/readyz'), 200);
            if (row.event === 'drain-deadline') {
              await assert.rejects(host.stop({ deadlineMs: 25 }), /deadline/);
              assert.equal(retained, true); assert.equal(host.status().stopFailed, true); release.resolve();
            } else if (row.event === 'close-failure' || row.event === 'quiesce-failure') {
              await assert.rejects(host.stop()); assert.equal(host.status().stopFailed, true);
              // An owner-backed stop may complete application cleanup after a
              // transient first quiesce failure; host failure stays observable.
              if (row.event === 'close-failure' || !ownerSupplied) {
                assert.equal(retained, true); assert.equal(application.status().cleanupPending, true);
              }
            }
            const stopping = host.stop(); assert.equal(host.stop(), stopping); await stopping;
          }
        }
        assert.equal(host.address(), null); assert.equal(host.status().ready, false);
        assert.equal(host.status().stopped, true); assert.equal(host.status().stopFailed, false);
        assert.equal(retained, false); assert.equal(application.status().cleanupPending, false);
        await host.stop(); await assert.rejects(host.initialize(), /fresh host/); await assert.rejects(host.activate(), /fresh host/);
      } finally { release.resolve(); await host.stop(); }
    });
});
