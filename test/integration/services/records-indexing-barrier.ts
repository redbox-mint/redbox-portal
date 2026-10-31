// Test-only: ordinary Agenda submissions, exact job IDs, and actual handler promises.
import { AsyncLocalStorage } from 'node:async_hooks';
import { performance } from 'node:perf_hooks';
import { beforeSolrFixtureDeadline, solrFixtureQueueSettings } from './solr-index-fixture-lifecycle';

type Submission = {
  number: number;
  recordId: string;
  jobId?: string;
  state: 'pending' | 'acknowledged' | 'rejected' | 'late';
  error?: string;
  observation?: 'missing' | 'pending' | 'complete' | 'failed';
};
type Attempt = {
  number: number;
  recordId: string;
  jobId?: string;
  submission?: number;
  state: 'running' | 'fulfilled' | 'rejected' | 'fenced';
  error?: string;
};
const message = (error: unknown) => (error instanceof Error ? error.message : String(error));
const id = (value: any): string | undefined =>
  typeof value === 'string' && value.length > 0
    ? value
    : typeof value?.toHexString === 'function'
      ? value.toHexString()
      : undefined;

export class RecordsIndexScope {
  state: 'open' | 'sealed' | 'complete' | 'incomplete' = 'open';
  admissionClosed = false;
  identityUncertain = false;
  readonly submissions: Submission[] = [];
  readonly attempts: Attempt[] = [];
  readonly errors: string[] = [];
  readonly active = new Set<Promise<unknown>>();
  readonly pending = new Set<Promise<unknown>>();

  constructor(readonly label: string) {}

  get cleanupSafe() {
    return this.admissionClosed && !this.identityUncertain && this.active.size === 0 && this.pending.size === 0;
  }

  ledger() {
    return {
      label: this.label,
      state: this.state,
      incomplete: this.state !== 'complete',
      admissionClosed: this.admissionClosed,
      identityUncertain: this.identityUncertain,
      cleanupSafe: this.cleanupSafe,
      activeHandlers: this.active.size,
      pendingAcknowledgements: this.pending.size,
      errors: [...this.errors],
      submissions: this.submissions.map(entry => ({ ...entry })),
      attempts: this.attempts.map(entry => ({ ...entry })),
    };
  }
}

export class RecordsIndexBarrierError extends Error {
  readonly ledger: ReturnType<RecordsIndexScope['ledger']>;
  constructor(scope: RecordsIndexScope) {
    const ledger = scope.ledger();
    super(`Records indexing barrier incomplete: ${JSON.stringify(ledger)}`);
    this.name = 'RecordsIndexBarrierError';
    this.ledger = ledger;
  }
}

/**
 * A single-processor barrier. It cannot join a handler in another process.
 * Neither Mongo timestamps, Agenda cancellation, nor job completion events prove
 * that an older watchdog-expired attempt has returned. Only active promises do.
 * Keep both wrappers installed until Sails lowers, including after failures.
 */
export class RecordsIndexingBarrier {
  private readonly context = new AsyncLocalStorage<RecordsIndexScope>();
  private readonly owners = new Map<string, RecordsIndexScope>();
  private readonly unownedActive = new Map<string, Set<Promise<unknown>>>();
  private readonly scopes = new Set<RecordsIndexScope>();
  private readonly jobIds = new Map<string, unknown>();
  private version = 0;
  private readonly listeners = new Set<() => void>();

  constructor(
    readonly jobName: string,
    private readonly jobs: any,
    private readonly history: any,
    private readonly submit: (name: string, data: any) => Promise<any>,
    private readonly index: (job: any) => Promise<unknown>
  ) {}

  open(label: string) {
    const scope = new RecordsIndexScope(label);
    this.scopes.add(scope);
    return scope;
  }

  run<T>(scope: RecordsIndexScope, action: () => T): T {
    if (!this.scopes.has(scope) || scope.state !== 'open') throw new Error('Records indexing scope is not open');
    return this.context.run(scope, action);
  }

  seal(scope: RecordsIndexScope) {
    if (scope.state === 'open') scope.state = 'sealed';
    this.changed();
  }

  private fail(scope: RecordsIndexScope, error: unknown) {
    scope.errors.push(message(error));
    scope.state = 'incomplete';
    this.changed();
  }

  private changed() {
    this.version++;
    for (const wake of [...this.listeners]) wake();
  }

  private async changeAfter(version: number, deadline: number) {
    let wake: () => void;
    try {
      await beforeSolrFixtureDeadline(
        deadline,
        'waiting for owned indexing state',
        () =>
          new Promise<void>(resolve => {
            wake = resolve;
            this.listeners.add(wake);
            if (version !== this.version) resolve();
          })
      );
    } finally {
      this.listeners.delete(wake!);
    }
  }

  // Called by Agenda's complete event AFTER its completion persistence attempt.
  // This event wakes the observer; it never substitutes for durable state.
  readonly completed = (job: any) => {
    if (job?.attrs?.name === this.jobName && this.owners.has(id(job.attrs.data?.id)!)) this.changed();
  };

  readonly now = (name: string, data: any): Promise<any> => {
    if (name !== this.jobName) return this.submit(name, data);
    const recordId = id(data?.id);
    const context = this.context.getStore();
    const owner = recordId && this.owners.get(recordId);
    const scope = owner || context;
    if (!scope) return this.submit(name, data);
    const entry: Submission = {
      number: scope.submissions.length + 1,
      recordId: recordId ?? '<missing>',
      state: 'pending',
    };
    scope.submissions.push(entry);
    if (recordId && !owner) {
      this.owners.set(recordId, scope);
      for (const earlier of this.unownedActive.get(recordId) ?? []) {
        scope.active.add(earlier);
        void earlier.then(
          () => {
            scope.active.delete(earlier);
            this.changed();
          },
          () => {
            scope.active.delete(earlier);
            this.changed();
          }
        );
        this.fail(scope, 'handler entered before record ownership');
      }
    }
    if (
      !recordId ||
      typeof data?.id !== 'string' ||
      (context && owner && context !== owner) ||
      scope.state !== 'open'
    ) {
      entry.state = 'late';
      entry.error =
        !recordId || typeof data?.id !== 'string'
          ? 'owned submission requires a string record ID'
          : 'late or cross-scope owned submission';
      this.fail(scope, entry.error);
      if (context && context !== scope) this.fail(context, entry.error);
      return Promise.reject(new RecordsIndexBarrierError(scope));
    }
    // Register BEFORE invoking the producer: the handler may enter before now()
    // acknowledges. Reconcile provisional attempts by exact ID after the ack.
    const submissionData = { ...data, id: recordId };
    const pending = Promise.resolve()
      .then(() => this.submit(name, submissionData))
      .then(job => {
        const jobId = id(job?.attrs?._id);
        if (!jobId || job.attrs.name !== name || id(job.attrs.data?.id) !== recordId) {
          scope.identityUncertain = true;
          throw new Error('owned submission acknowledgement has missing/mismatched job identity');
        }
        if (this.jobIds.has(jobId)) {
          throw new Error(`duplicate submission job ID ${jobId}`);
        }
        entry.jobId = jobId;
        this.jobIds.set(jobId, job.attrs._id);
        entry.state = 'acknowledged';
        for (const attempt of scope.attempts)
          if (attempt.jobId === jobId && attempt.recordId === recordId) attempt.submission = entry.number;
        return job;
      })
      .catch(error => {
        // A rejected producer may still have persisted a job before failing.
        scope.identityUncertain = true;
        entry.state = 'rejected';
        entry.error = message(error);
        this.fail(scope, error);
        throw error;
      });
    scope.pending.add(pending);
    void pending.then(
      () => {
        scope.pending.delete(pending);
        this.changed();
      },
      () => {
        scope.pending.delete(pending);
        this.changed();
      }
    );
    return pending;
  };

  readonly handler = (job: any): Promise<unknown> => {
    const recordId = id(job?.attrs?.data?.id);
    const scope = recordId && this.owners.get(recordId);
    if (!scope) {
      if (!recordId) return this.index(job);
      const active = this.unownedActive.get(recordId) ?? new Set<Promise<unknown>>();
      this.unownedActive.set(recordId, active);
      const pending = Promise.resolve().then(() => this.index(job));
      active.add(pending);
      const remove = () => {
        active.delete(pending);
        if (active.size === 0) this.unownedActive.delete(recordId);
      };
      void pending.then(remove, remove);
      return pending;
    }
    const jobId = id(job?.attrs?._id);
    const attempt: Attempt = {
      number: scope.attempts.length + 1,
      recordId,
      jobId,
      submission: scope.submissions.find(entry => entry.jobId === jobId && entry.recordId === recordId)?.number,
      state: scope.admissionClosed ? 'fenced' : 'running',
    };
    scope.attempts.push(attempt);
    if (scope.admissionClosed) {
      this.changed();
      return Promise.resolve();
    }
    if (!jobId || job.attrs.name !== this.jobName) {
      attempt.state = 'rejected';
      attempt.error = 'owned handler has missing/mismatched job identity';
      this.fail(scope, attempt.error);
      return Promise.reject(new RecordsIndexBarrierError(scope));
    }
    if (
      !scope.submissions.some(
        entry => entry.recordId === recordId && (entry.jobId === jobId || entry.state === 'pending')
      )
    ) {
      attempt.state = 'rejected';
      attempt.error = 'owned handler has no admitted submission';
      this.fail(scope, attempt.error);
      return Promise.reject(new RecordsIndexBarrierError(scope));
    }
    const pending = Promise.resolve().then(() => this.index(job));
    scope.active.add(pending);
    void pending.then(
      () => {
        attempt.state = 'fulfilled';
        scope.active.delete(pending);
        this.changed();
      },
      error => {
        attempt.state = 'rejected';
        attempt.error = message(error);
        scope.active.delete(pending);
        this.fail(scope, error);
      }
    );
    this.changed();
    return pending;
  };

  async finish(scope: RecordsIndexScope, deadline: number, joinDeadline: number = deadline) {
    // Seal synchronously, before waiting even for acknowledgements.
    this.seal(scope);
    try {
      await beforeSolrFixtureDeadline(deadline, 'owned submission acknowledgements', () =>
        Promise.allSettled([...scope.pending])
      );
      while (true) {
        const version = this.version;
        if (scope.errors.length) throw new Error('owned indexing errors');
        let complete = true;
        for (const entry of scope.submissions) {
          if (!entry.jobId || entry.state !== 'acknowledged') throw new Error('owned submission is not acknowledged');
          const query = { _id: this.jobIds.get(entry.jobId), name: this.jobName, 'data.id': entry.recordId };
          // Preserve the acknowledged driver's BSON ID; no broad name/ID scans.
          const state = await beforeSolrFixtureDeadline<any>(
            deadline,
            'observe exact owned job',
            async () =>
              (await this.jobs.findOne(query, { readPreference: 'primary' })) ||
              (await this.history.findOne(query, { readPreference: 'primary' }))
          );
          entry.observation = !state
            ? 'missing'
            : state.failReason || state.failedAt || state.failCount
              ? 'failed'
              : state.lastFinishedAt && !state.lockedAt && !state.nextRunAt
                ? 'complete'
                : 'pending';
          if (entry.observation === 'missing' || entry.observation === 'failed') {
            throw new Error(
              `${entry.jobId}: ${entry.observation} durable indexing state${state?.failReason ? `: ${state.failReason}` : ''}`
            );
          }
          if (
            entry.observation !== 'complete' ||
            !scope.attempts.some(
              attempt =>
                attempt.jobId === entry.jobId && attempt.recordId === entry.recordId && attempt.state === 'fulfilled'
            )
          )
            complete = false;
        }
        if (
          scope.attempts.some(
            attempt =>
              !attempt.jobId ||
              !scope.submissions.some(entry => entry.jobId === attempt.jobId && entry.recordId === attempt.recordId)
          )
        ) {
          throw new Error('owned handler attempt has no exact acknowledged submission');
        }
        // No await between the final active/error check and closing admission.
        if (complete && scope.active.size === 0 && scope.errors.length === 0) {
          if (performance.now() >= deadline) throw new Error('owned indexing completion: deadline exceeded');
          scope.admissionClosed = true;
          scope.state = 'complete';
          return scope.ledger();
        }
        await this.changeAfter(version, deadline);
      }
    } catch (error) {
      scope.admissionClosed = true;
      this.fail(scope, error);
      // Failure and watchdog events do not cancel the actual admitted promises.
      try {
        await beforeSolrFixtureDeadline(
          joinDeadline,
          'join acknowledgements and admitted handlers; fixtures/config retained',
          async () => {
            while (scope.pending.size || scope.active.size) {
              await Promise.allSettled([...scope.pending, ...scope.active]);
            }
          }
        );
      } catch (joinError) {
        this.fail(scope, joinError);
      }
      throw new RecordsIndexBarrierError(scope);
    }
  }

  async cleanup(
    scope: RecordsIndexScope,
    deadline: number,
    joinDeadline: number,
    cleanupFixturesAndConfig: () => Promise<void>
  ) {
    try {
      await this.finish(scope, deadline, joinDeadline);
    } catch {
      if (!scope.cleanupSafe) throw new RecordsIndexBarrierError(scope);
    }
    // Admission remains closed during every fixture/config restoration await.
    try {
      await beforeSolrFixtureDeadline(joinDeadline, 'fixture/config cleanup', cleanupFixturesAndConfig);
    } catch (error) {
      this.fail(scope, error);
    }
    if (scope.state !== 'complete') throw new RecordsIndexBarrierError(scope);
  }
}

/**
 * No production exports are changed. The live adapter requires Mocha's private
 * accessor AND an explicit assertion of an isolated, single Agenda processor.
 * The normal compose Mocha topology has one portal and a private Mongo container;
 * this assertion must not be made for a shared development/worker database.
 */
export async function installRecordsIndexingBarrier(options: {
  config: any;
  queue: any;
  userDatastore: any;
  mongoDatastore: any;
  realHandler: (job: any) => Promise<unknown>;
  soleProcessor: boolean;
}) {
  const { config, queue, userDatastore, mongoDatastore, realHandler } = options;
  if (options.soleProcessor !== true)
    throw new Error('Records indexing barrier unsupported: cannot fence/join another Agenda processor');
  const { collectionName } = solrFixtureQueueSettings(config, userDatastore, mongoDatastore);
  if (typeof queue.ensureQueueInitialized !== 'function' || typeof queue.getAgendaForJobName !== 'function') {
    throw new Error('Records indexing barrier unsupported: requires Mocha-only Agenda accessors');
  }
  await queue.ensureQueueInitialized();
  const jobName = config.solr.createOrUpdateJobName;
  const agenda = queue.getAgendaForJobName(jobName);
  const definition = agenda.definitions[jobName];
  if (
    definition?.fn !== realHandler ||
    definition.fn.length !== 1 ||
    definition.fork ||
    definition.removeOnComplete ||
    agenda.attrs?.removeOnComplete
  ) {
    throw new Error(
      'Records indexing barrier unsupported: requires retained one-shot jobs and the real in-process async Solr handler'
    );
  }
  const originalNow = queue.now;
  const barrier = new RecordsIndexingBarrier(
    jobName,
    userDatastore.manager.collection(collectionName),
    userDatastore.manager.collection(`${collectionName}History`),
    (name, data) => originalNow.call(queue, name, data),
    job => realHandler(job)
  );
  // Mutate only fn: preserve the exact definition object, name and all options.
  definition.fn = barrier.handler;
  queue.now = barrier.now;
  agenda.on(`complete:${jobName}`, barrier.completed);
  // Intentionally no restore/dispose API: prefetched claims and detached test
  // continuations must remain fenced until this Sails process is lowered.
  return barrier;
}
