import assert from 'node:assert/strict';
import { of, defer } from 'rxjs';
import * as Effect from 'effect/Effect';
import { nothingLogger } from '@researchdatabox/sails-ng-common';
import { ApplicationRuntime } from '../../src/application';
import { persistenceOperation, runAcceptedPersistenceWork, persistenceStatus } from '../../src/persistence/runtime';
const { portalProviderPlan } = require('../../src/application/portal/providers');

describe('production email callback ownership', () => {
  for (const kind of ['Promise', 'Observable', 'Effect', 'synchronous throw'])
    it(`keeps ${kind} notification callbacks admitted after the sending scope settles`, async () => {
      const owner = { config: {}, log: nothingLogger };
      const pending = new Set<Promise<unknown>>();
      const entered = Promise.withResolvers<void>(), release = Promise.withResolvers<void>();
      let writes = 0;
      const body = async () => {
        entered.resolve(); await release.promise;
        await persistenceOperation(owner, async () => { writes++; });
      };
      const plan = portalProviderPlan(owner, { emailnotification: {} }, nothingLogger, { reference: {} }, {
        env: {},
        retainFollowup: (work: Promise<unknown>) => {
          pending.add(work);
          void work.then(() => pending.delete(work), () => pending.delete(work));
          return work;
        },
        resolveEmailHook: () => () => { if (kind === 'synchronous throw') throw new Error('callback failure'); return kind === 'Effect'
          ? Effect.tryPromise({ try: body, catch: error => error })
          : kind === 'Observable' ? defer(body) : body(); },
      });
      const app = new ApplicationRuntime(owner, [
        { name: 'email', create: plan.email.bind({ declaration: plan.email.declaration }) },
        { name: 'followups', create: () => ({ initialize: async () => {}, close: async () => {},
          drain: async () => { while (pending.size) await Promise.allSettled(pending); } }) },
      ]);
      try {
        await app.initialize(); await app.activate();
        const email = plan.email.get();
        email.metTriggerCondition = () => 'true';
        email.evaluateProperties = () => ({ toRendered: 'fixture@example.invalid', templateRendered: of({ status: 200, body: 'Fixture' }) });
        email.sendMessage = () => of({ success: true });
        if (kind === 'synchronous throw') {
          await assert.rejects(runAcceptedPersistenceWork(owner, () => email.sendRecordNotification(
            'oid', {}, { onNotifySuccess: [{ function: 'callback' }] }, {}, {}
          )), /callback failure/);
          await app.stop(); return;
        }
        await runAcceptedPersistenceWork(owner, async () => {
          await email.sendRecordNotification('oid', {}, { onNotifySuccess: [{ function: 'callback' }] }, {}, {});
          await entered.promise;
        });
        await assert.rejects(app.stop({ deadlineMs: 15 }), /deadline/);
        assert.equal(app.status().cleanupPending, true);
        await assert.rejects(persistenceOperation(owner, async () => {}), /draining/);
        release.resolve(); await app.stop({ deadlineMs: 1000 });
        assert.equal(writes, 1);
        assert.equal(persistenceStatus(owner).operations, 0);
      } finally { release.resolve(); await app.stop(); }
    });
});
