// Also runnable without Sails: TS_NODE_COMPILER_OPTIONS='{"module":"CommonJS","moduleResolution":"Node"}'
// node --no-experimental-strip-types -r ts-node/register/transpile-only node_modules/mocha/bin/mocha.js \
//   --no-config test/integration/services/records-indexing-barrier.test.ts
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { performance } from 'node:perf_hooks';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
import {
  RecordsIndexingBarrier,
  RecordsIndexBarrierError,
  installRecordsIndexingBarrier,
} from './records-indexing-barrier';

function deferred<T = void>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}
const deadline = () => performance.now() + 3000;
const expired = () => performance.now() - 1;
const field = (doc: any, path: string) => path.split('.').reduce((value, key) => value?.[key], doc);
class Collection {
  docs: any[] = [];
  queries: any[] = [];
  beforeRead?: () => Promise<void>;
  async findOne(query: any, options: any) {
    this.queries.push(query);
    assert.equal(options.readPreference, 'primary');
    if (this.beforeRead) await this.beforeRead();
    return (
      this.docs.find(doc => Object.entries(query).every(([key, value]) => String(field(doc, key)) === String(value))) ??
      null
    );
  }
}
function fixture() {
  const jobs = new Collection();
  const history = new Collection();
  const writes: string[] = [];
  let next = 0;
  const f = {
    jobs,
    history,
    writes,
    action: async (job: any) => {
      writes.push(String(job.attrs._id));
    },
    submit: async (name: string, data: any) => {
      const attrs = { _id: String(++next), name, data: structuredClone(data), nextRunAt: new Date() };
      jobs.docs.push(attrs);
      return { attrs };
    },
  };
  const barrier = new RecordsIndexingBarrier(
    'index',
    jobs,
    history,
    (name, data) => f.submit(name, data),
    job => f.action(job)
  );
  const scope = barrier.open('RecordsService fixture');
  const submit = (recordId = 'record-a') => barrier.run(scope, () => barrier.now('index', { id: recordId }));
  const run = async (job: any) => {
    await barrier.handler(job);
    Object.assign(job.attrs, { lastFinishedAt: new Date(), lockedAt: null, nextRunAt: null });
    barrier.completed(job);
  };
  return { ...f, f, barrier, scope, submit, run };
}

describe('RecordsService test-only indexing barrier', function () {
  it('captures the submitted record ID before the caller mutates its data', async function () {
    const s = fixture();
    const data = { id: 'a' };
    const promise = s.barrier.run(s.scope, () => s.barrier.now('index', data));
    data.id = 'b';
    const job = await promise;
    assert.equal(job.attrs.data.id, 'a');
    await s.run(job);
    await s.barrier.cleanup(s.scope, deadline(), deadline(), async () => {});
  });

  it('retains fixtures when an acknowledgement has uncertain ownership', async function () {
    const s = fixture();
    s.f.submit = async (name, data) => ({ attrs: { _id: '1', name, data: { ...data, id: 'other' } } });
    await assert.rejects(s.submit());
    let cleaned = false;
    await assert.rejects(
      s.barrier.cleanup(s.scope, deadline(), deadline(), async () => {
        cleaned = true;
      })
    );
    assert.equal(cleaned, false);
    assert.equal(s.scope.cleanupSafe, false);
  });

  it('uses the join budget to settle acknowledgements after work expires', async function () {
    const s = fixture();
    const ack = deferred<any>();
    s.f.submit = () => ack.promise;
    const submission = s.submit();
    await Promise.resolve();
    let cleaned = false;
    const cleanup = s.barrier.cleanup(s.scope, expired(), deadline(), async () => {
      cleaned = true;
    });
    await new Promise<void>(resolve => setImmediate(resolve));
    ack.resolve({ attrs: { _id: '1', name: 'index', data: { id: 'record-a' } } });
    await submission;
    await assert.rejects(cleanup, RecordsIndexBarrierError);
    assert.equal(cleaned, true);
  });
  it('joins an earlier unowned writer before allowing cleanup', async function () {
    const s = fixture();
    const release = deferred();
    s.f.action = async () => {
      await release.promise;
    };
    const old = s.barrier.handler({ attrs: { name: 'index', _id: 'old', data: { id: 'record-a' } } });
    await assert.rejects(s.submit());
    let cleaned = false;
    const cleanup = s.barrier.cleanup(s.scope, expired(), expired(), async () => {
      cleaned = true;
    });
    await assert.rejects(cleanup, RecordsIndexBarrierError);
    assert.equal(cleaned, false);
    assert.equal(s.scope.cleanupSafe, false);
    release.resolve();
    await old;
  });

  it('rejects attempts whose job IDs belong to different records', async function () {
    const s = fixture();
    const a = await s.submit('a');
    const b = await s.submit('b');
    await assert.rejects(s.barrier.handler({ attrs: { ...a.attrs, data: { id: 'b' } } }), RecordsIndexBarrierError);
    await assert.rejects(s.barrier.handler({ attrs: { ...b.attrs, data: { id: 'a' } } }), RecordsIndexBarrierError);
    await assert.rejects(s.barrier.finish(s.scope, deadline()), RecordsIndexBarrierError);
  });
  it('keeps exact submissions for repeated record IDs and reads only their jobs/history', async function () {
    const s = fixture();
    const a = await s.submit();
    const b = await s.submit();
    await s.run(a);
    await s.run(b);
    s.history.docs.push(s.jobs.docs.shift());
    let deleted = false;
    await s.barrier.cleanup(s.scope, deadline(), deadline(), async () => {
      deleted = true;
    });
    assert(deleted);
    assert.equal(s.scope.ledger().incomplete, false);
    assert.deepEqual(
      s.scope.submissions.map(entry => entry.jobId),
      ['1', '2']
    );
    assert.deepEqual(
      s.scope.attempts.map(entry => entry.submission),
      [1, 2]
    );
    assert(s.jobs.queries.every(query => query._id && query.name === 'index' && query['data.id'] === 'record-a'));
    assert.equal(s.scope.cleanupSafe, true);
  });

  it('registers submission before acknowledgement and handler before same-turn cleanup', async function () {
    const s = fixture();
    const ack = deferred();
    const entered = deferred();
    const release = deferred();
    let running!: Promise<void>;
    s.f.action = async job => {
      entered.resolve();
      await release.promise;
      s.writes.push(job.attrs._id);
    };
    const original = s.f.submit;
    s.f.submit = async (...args) => {
      const job = await original(...args);
      running = s.run(job);
      await ack.promise;
      return job;
    };
    const submission = s.submit();
    await entered.promise;
    assert.equal(s.scope.attempts[0].submission, undefined, 'attempt is provisional until exact ID acknowledgement');
    let deleted = false;
    const cleaning = s.barrier.cleanup(s.scope, deadline(), deadline(), async () => {
      deleted = true;
    });
    assert.equal(s.scope.state, 'sealed');
    assert.equal(s.scope.active.size, 1);
    assert.equal(deleted, false);
    release.resolve();
    await running;
    assert.equal(deleted, false, 'handler completion alone cannot substitute for acknowledgement');
    ack.resolve();
    await submission;
    await cleaning;
    assert.equal(s.scope.attempts[0].submission, 1);
    assert(deleted);
  });

  it('preserves the acknowledged BSON identity in exact Mongo reads', async function () {
    const s = fixture();
    const bsonId = { toHexString: () => '0123456789abcdef01234567' };
    const original = s.f.submit;
    s.f.submit = async (...args) => {
      const job = await original(...args);
      (job.attrs as any)._id = bsonId;
      return job;
    };
    const job = await s.submit();
    await s.run(job);
    await s.barrier.finish(s.scope, deadline());
    assert.equal(s.jobs.queries[0]._id, bsonId);
    assert.equal(s.scope.submissions[0].jobId, bsonId.toHexString());
    assert.doesNotThrow(() => JSON.stringify(s.scope.ledger()));
  });

  it('joins all overlapping attempts even when the newest attempt has persisted completion', async function () {
    const s = fixture();
    const oldEntered = deferred();
    const oldRelease = deferred();
    const observed = deferred();
    const allowRead = deferred();
    const job = await s.submit();
    s.f.action = async invocation => {
      if (invocation.old) {
        oldEntered.resolve();
        await oldRelease.promise;
      }
      s.writes.push(invocation.old ? 'old' : 'new');
    };
    const old = s.run({ attrs: job.attrs, old: true });
    await oldEntered.promise;
    await s.run(job);
    s.jobs.beforeRead = async () => {
      observed.resolve();
      await allowRead.promise;
    };
    let deleted = false;
    const cleaning = s.barrier.cleanup(s.scope, deadline(), deadline(), async () => {
      deleted = true;
    });
    await observed.promise;
    assert.equal(s.scope.active.size, 1);
    assert.deepEqual(s.writes, ['new']);
    assert.equal(deleted, false);
    allowRead.resolve();
    // Event-loop checkpoint, not an elapsed-time/polling sleep: let the observer
    // consume the completed durable state while the old handler remains blocked.
    await new Promise<void>(resolve => setImmediate(resolve));
    assert.equal(deleted, false, 'observed newest completion must not license cleanup');
    oldRelease.resolve();
    await old;
    await cleaning;
    assert.deepEqual(s.writes, ['new', 'old']);
    assert(deleted);
    await s.barrier.handler(job); // An arbitrarily late prefetched claim.
    assert.equal(s.scope.attempts[2].state, 'fenced');
    assert.deepEqual(s.writes, ['new', 'old']);
  });

  it('rejects a detached late submission even after successful cleanup and retains its owner', async function () {
    const s = fixture();
    const release = deferred();
    const late = s.barrier.run(s.scope, async () => {
      await release.promise;
      return s.barrier.now('index', { id: 'late-generated-id' });
    });
    const rejected = assert.rejects(late, /late or cross-scope/);
    await s.barrier.finish(s.scope, deadline());
    release.resolve();
    await rejected;
    assert.equal(s.jobs.docs.length, 0, 'late submission must not reach the real producer');
    assert.equal(s.scope.state, 'incomplete');
    await s.barrier.handler({ attrs: { name: 'index', _id: 'late-job', data: { id: 'late-generated-id' } } });
    assert.equal(s.scope.attempts[0].state, 'fenced');
    assert.deepEqual(s.writes, []);
  });

  it('leaves unrelated submissions and handlers alone, including other job names', async function () {
    const s = fixture();
    const unrelated = await s.barrier.now('index', { id: 'not-owned' });
    await s.barrier.handler(unrelated);
    await s.barrier.run(s.scope, () => s.barrier.now('audit', { id: 'record-a' }));
    await s.barrier.finish(s.scope, deadline());
    assert.equal(s.scope.submissions.length, 0);
    assert.equal(s.scope.attempts.length, 0);
    assert.deepEqual(s.writes, ['1']);
  });

  it('registers a handler synchronously before its implementation starts', async function () {
    const s = fixture();
    const job = await s.submit();
    const events: string[] = [];
    s.f.action = async () => {
      events.push('handler');
    };
    const running = s.run(job);
    assert.equal(s.scope.active.size, 1);
    const cleaning = s.barrier.cleanup(s.scope, deadline(), deadline(), async () => {
      events.push('cleanup');
    });
    assert.deepEqual(events, []);
    await running;
    await cleaning;
    assert.deepEqual(events, ['handler', 'cleanup']);
  });

  it('fences on observation failure and joins the admitted writer before restoring fixtures/config', async function () {
    const s = fixture();
    const entered = deferred();
    const release = deferred();
    s.f.action = async () => {
      entered.resolve();
      await release.promise;
      s.writes.push('last write');
    };
    const job = await s.submit();
    const running = s.run(job);
    await entered.promise;
    s.jobs.docs.length = 0; // Missing persistence is a failure, not completion.
    let cleaned = false;
    const cleaning = s.barrier.cleanup(s.scope, deadline(), deadline(), async () => {
      assert.deepEqual(s.writes, ['last write']);
      cleaned = true;
    });
    const rejected = assert.rejects(cleaning, /missing durable indexing state/);
    await new Promise<void>(resolve => setImmediate(resolve));
    assert.equal(s.scope.admissionClosed, true);
    assert.equal(s.scope.active.size, 1);
    assert.equal(cleaned, false);
    await s.barrier.handler(job);
    release.resolve();
    await running;
    await rejected;
    assert(cleaned);
    assert.equal(s.scope.attempts[1].state, 'fenced');
  });

  it('rejects an attempt that cannot be reconciled to the exact acknowledged job ID', async function () {
    const s = fixture();
    const ack = deferred();
    const entered = deferred();
    const original = s.f.submit;
    s.f.submit = async (...args) => {
      const job = await original(...args);
      await s.barrier.handler({ attrs: { ...job.attrs, _id: 'unacknowledged-attempt' } });
      entered.resolve();
      await ack.promise;
      return job;
    };
    const submission = s.submit();
    await entered.promise;
    ack.resolve();
    await submission;
    await assert.rejects(s.barrier.finish(s.scope, deadline()), /no exact acknowledged submission/);
    assert.equal(s.scope.ledger().incomplete, true);
    assert.equal(s.scope.attempts[0].submission, undefined);
  });

  it('rejects record ownership crossing scopes without submitting another job', async function () {
    const s = fixture();
    await s.submit();
    const second = s.barrier.open('another test');
    await assert.rejects(
      s.barrier.run(second, () => s.barrier.now('index', { id: 'record-a' })),
      /cross-scope/
    );
    assert.equal(s.jobs.docs.length, 1);
    assert.equal(s.scope.state, 'incomplete');
    assert.equal(second.state, 'incomplete');
  });

  it('rejects submissions during sealing while still joining earlier admitted handlers', async function () {
    const s = fixture();
    const entered = deferred();
    const release = deferred();
    s.f.action = async () => {
      entered.resolve();
      await release.promise;
    };
    const job = await s.submit();
    const running = s.run(job);
    await entered.promise;
    let cleaned = false;
    const cleaning = s.barrier.cleanup(s.scope, deadline(), deadline(), async () => {
      cleaned = true;
    });
    const rejected = assert.rejects(cleaning, /late or cross-scope/);
    await assert.rejects(s.barrier.now('index', { id: 'record-a' }), /late or cross-scope/);
    assert.equal(s.jobs.docs.length, 1);
    assert.equal(cleaned, false);
    release.resolve();
    await running;
    await rejected;
    assert(cleaned);
    assert.equal(s.scope.state, 'incomplete');
  });

  for (const failure of ['handler', 'missing', 'failed', 'missing-ack-id', 'submission'] as const) {
    it(`rejects ${failure} with a structured incomplete ledger and joins before cleanup`, async function () {
      const s = fixture();
      if (failure === 'submission')
        s.f.submit = async () => {
          throw new Error('queue unavailable');
        };
      if (failure === 'missing-ack-id')
        s.f.submit = async () => ({ attrs: { name: 'index', data: { id: 'record-a' } } }) as any;
      const submission = s.submit();
      if (failure === 'submission' || failure === 'missing-ack-id') await assert.rejects(submission);
      else {
        const job = await submission;
        if (failure === 'handler') {
          s.f.action = () => {
            throw new Error('partial write failed');
          };
          await assert.rejects(s.barrier.handler(job), /partial write failed/);
        } else if (failure === 'missing') s.jobs.docs.length = 0;
        else Object.assign(job.attrs, { failReason: 'watchdog', lastFinishedAt: new Date(), nextRunAt: null });
      }
      let cleaned = false;
      await assert.rejects(
        s.barrier.cleanup(s.scope, deadline(), deadline(), async () => {
          assert.equal(s.scope.active.size, 0);
          cleaned = true;
        }),
        (error: any) => {
          assert(error instanceof RecordsIndexBarrierError);
          assert.equal(error.ledger.incomplete, true);
          assert.equal(error.ledger.admissionClosed, true);
          assert.equal(error.ledger.cleanupSafe, failure !== 'missing-ack-id' && failure !== 'submission');
          return true;
        }
      );
      assert.equal(cleaned, failure !== 'missing-ack-id' && failure !== 'submission');
    });
  }

  it('retains fixtures and config on a join deadline, then fences new attempts while the old one finishes', async function () {
    const s = fixture();
    const entered = deferred();
    const release = deferred();
    s.f.action = async job => {
      entered.resolve();
      await release.promise;
      s.writes.push(job.attrs._id);
    };
    const job = await s.submit();
    const running = s.run(job);
    await entered.promise;
    let cleaned = false;
    await assert.rejects(
      s.barrier.cleanup(s.scope, expired(), expired(), async () => {
        cleaned = true;
      }),
      (error: any) => {
        assert.equal(error.ledger.activeHandlers, 1);
        assert.equal(error.ledger.cleanupSafe, false);
        return true;
      }
    );
    assert.equal(cleaned, false);
    await s.barrier.handler(job);
    assert.equal(s.scope.attempts[1].state, 'fenced');
    release.resolve();
    await running;
    assert.deepEqual(s.writes, ['1']);
    assert.equal(s.scope.state, 'incomplete', 'late settlement must never rewrite the failed result as success');
    assert.equal(cleaned, false, 'no background cleanup after a deadline');
  });

  it('keeps a pending acknowledgement explicitly incomplete on a deadline', async function () {
    const s = fixture();
    const ack = deferred();
    const submitted = deferred();
    const original = s.f.submit;
    s.f.submit = async (...args) => {
      const job = await original(...args);
      submitted.resolve();
      await ack.promise;
      return job;
    };
    const submission = s.submit();
    await submitted.promise;
    await assert.rejects(s.barrier.finish(s.scope, expired(), expired()), (error: any) => {
      assert.equal(error.ledger.pendingAcknowledgements, 1);
      assert.equal(error.ledger.cleanupSafe, false);
      return true;
    });
    ack.resolve();
    const job = await submission;
    await s.barrier.handler(job);
    assert.deepEqual(s.writes, []);
    assert.equal(s.scope.state, 'incomplete');
  });

  it('does not lose a completion notification arriving during the durable read', async function () {
    const s = fixture();
    const job = await s.submit();
    const read = deferred();
    const release = deferred();
    s.jobs.beforeRead = async () => {
      read.resolve();
      await release.promise;
    };
    const finishing = s.barrier.finish(s.scope, deadline());
    await read.promise;
    await s.run(job);
    release.resolve();
    await finishing;
    assert.equal(s.scope.state, 'complete');
  });

  it('uses the real installed Agenda run path: cancel does not join an older handler', async function () {
    const requireCore = createRequire(resolve('packages/redbox-core/package.json'));
    // Native import survives ts-node CommonJS transpilation for Agenda's ESM.
    const { Job } = await new Function('url', 'return import(url)')(
      new URL('Job.js', pathToFileURL(requireCore.resolve('agenda'))).href
    );
    const s = fixture();
    const entered = deferred();
    const release = deferred();
    const acknowledged = await s.submit();
    const agenda = Object.assign(new EventEmitter(), {
      attrs: {},
      definitions: { index: { fn: s.barrier.handler, lockLifetime: 3000 } },
      db: {
        async saveJobState(attrs: any) {
          Object.assign(acknowledged.attrs, attrs);
        },
      },
      logJobEvent() {},
      publishJobStateNotification() {},
    });
    agenda.on('complete:index', s.barrier.completed);
    const old = new Job(agenda, { ...acknowledged.attrs }, true);
    const newer = new Job(agenda, { ...acknowledged.attrs }, true);
    s.f.action = async job => {
      if (job === old) {
        entered.resolve();
        await release.promise;
      }
      s.writes.push(job === old ? 'old' : 'new');
    };
    const oldRun = old.run();
    await entered.promise;
    old.cancel(new Error('watchdog expired'));
    await newer.run();
    assert(acknowledged.attrs.lastFinishedAt);
    assert.equal(s.scope.active.size, 1);
    const read = deferred();
    const allowRead = deferred();
    s.jobs.beforeRead = async () => {
      read.resolve();
      await allowRead.promise;
    };
    let cleaned = false;
    const cleaning = s.barrier.cleanup(s.scope, deadline(), deadline(), async () => {
      cleaned = true;
    });
    await read.promise;
    assert.equal(cleaned, false);
    allowRead.resolve();
    await new Promise<void>(resolve => setImmediate(resolve));
    assert.equal(cleaned, false, 'real Agenda cancellation/completion cannot join the old attempt');
    release.resolve();
    await oldRun;
    await cleaning;
    assert.deepEqual(s.writes, ['new', 'old']);
    assert(cleaned);
  });

  it('preserves the ordinary live definition/options and rejects unsupported topology before mutation', async function () {
    const jobs = new Collection();
    const history = new Collection();
    const datastore = { manager: { collection: (name: string) => (name.endsWith('History') ? history : jobs) } };
    const realHandler = async (_job: any) => {};
    const definition = { fn: realHandler, concurrency: 1, lockLimit: 1, lockLifetime: 3000, priority: 4 };
    const original = { ...definition };
    const agenda = Object.assign(new EventEmitter(), { definitions: { index: definition }, attrs: {} });
    const names: string[] = [];
    const queue = {
      ensureQueueInitialized: async () => {},
      getAgendaForJobName(name: string) {
        names.push(name);
        return agenda;
      },
      now: async (name: string, data: any) => ({ attrs: { _id: 'id', name, data } }),
    };
    const config = {
      queue: { serviceName: 'agendaqueueservice' },
      solr: { createOrUpdateJobName: 'index' },
      agendaQueue: { options: {}, jobs: { index: { fnName: 'solrsearchservice.solrAddOrUpdate' } } },
    };
    const options = {
      config,
      queue,
      userDatastore: datastore,
      mongoDatastore: datastore,
      realHandler,
      soleProcessor: false,
    };
    await assert.rejects(installRecordsIndexingBarrier(options), /cannot fence\/join another Agenda processor/);
    assert.equal(definition.fn, realHandler);
    const barrier = await installRecordsIndexingBarrier({ ...options, soleProcessor: true });
    assert.equal(agenda.definitions.index, definition);
    assert.deepEqual({ ...definition, fn: realHandler }, original);
    assert.equal(config.solr.createOrUpdateJobName, 'index');
    assert.deepEqual(names, ['index']);
    assert.equal(definition.fn, barrier.handler);
    assert.equal(queue.now, barrier.now);
  });
});
