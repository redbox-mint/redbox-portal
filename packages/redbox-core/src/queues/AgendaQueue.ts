import { withTimeout } from '../utilities/withTimeout';
import * as _ from 'lodash';
import {
  hasActivePersistenceWork,
  mongoDatabase,
  mongoResourceDatabase,
  runAcceptedPersistenceWork,
} from '../persistence/runtime';
import { PersistenceError } from '../persistence/errors';
import type { PersistenceOwner } from '../persistence/owner';
import { AsyncLocalStorage } from 'node:async_hooks';
import { randomUUID } from 'node:crypto';
import type { QueueService } from '../QueueService';
import type {
  AgendaQueueConfig,
  AgendaJobConfig,
  AgendaJobDefinition,
  AgendaJobsConfig,
  AgendaQueueBackend,
  AgendaQueueOptions,
} from '../config/agendaQueue.config';
import type { Agenda, AgendaBackend, Job, JobParameters, JobRepository, JobsQueryOptions, JobsResult } from 'agenda';
import type { Db } from '@agendajs/mongo-backend';
import { requireAgendaIndexes } from './indexes';
export type AgendaJobHandler = (job: Job) => Promise<void>;
export interface AgendaQueueInput {
  readonly owner: PersistenceOwner;
  readonly config: AgendaQueueConfig;
  readonly log: { verbose(message: string): void; info(message: string): void; error(message: unknown): void };
  handler(name: string): AgendaJobHandler | undefined;
  hasAcceptedRequest?(): boolean;
  drainRequests?(): Promise<void>;
  runAcceptedWork?<T>(work: () => Promise<T>): Promise<T>;
}
type AgendaMap = Partial<Record<AgendaQueueBackend, Agenda>>;
type LegacyAgendaJobsQuery = {
  name?: string | { $in?: string[] };
};
type AgendaQueueMongoCollection = {
  find: (filter: Record<string, unknown>) => { toArray: () => Promise<Record<string, unknown>[]> };
  replaceOne: (
    filter: Record<string, unknown>,
    doc: Record<string, unknown>,
    options: { upsert: boolean }
  ) => Promise<unknown>;
  deleteOne: (filter: Record<string, unknown>) => Promise<unknown>;
  deleteMany: (filter: Record<string, unknown>) => Promise<unknown>;
};
type AgendaQueueMongoManager = {
  collection: (name: string) => AgendaQueueMongoCollection;
};

export class AgendaQueueUnsupportedFeatureError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AgendaQueueUnsupportedFeatureError';
  }
}

const EXTERNAL_SCHEDULER_GUIDANCE = 'Use an external scheduler for SQS-backed recurring jobs.';

export class AgendaQueue implements QueueService {
  protected agenda?: Agenda;
  protected agendas: AgendaMap = {};
  protected defaultBackend: AgendaQueueBackend = 'mongodb';
  protected jobBackendByName = new Map<string, AgendaQueueBackend>();
  protected readyInitPromise?: Promise<void>;
  private queueInitialized = false;
  protected closing = false;
  protected startupFailed = false;
  private pending = new Set<Promise<unknown>>();
  private backendResources = new Set<AgendaBackend>();
  private workerContext = new AsyncLocalStorage<{ active: boolean }>();
  private workers = new Set<Promise<void>>();
  private jobCompletions = new Map<Job, { promise: Promise<void>; resolve: () => void }>();
  private backendOperations = new Set<Promise<unknown>>();
  private claimReleases = new Set<() => Promise<void>>();
  private workerDrain?: Promise<void>;
  private startedAgendas = new Set<Agenda>();
  private agendaDrains = new Map<Agenda, Promise<void>>();
  private agendaStarts = new Set<Promise<void>>();
  private application?: PersistenceOwner;
  private drainTimeoutMs = 30_000;

  private accepting(completion = false): void {
    const scopedCompletion =
      completion &&
      (this.workerContext.getStore()?.active ||
        (this.application &&
          (hasActivePersistenceWork(this.input.owner) || (this.input.hasAcceptedRequest?.() ?? false))));
    if (this.startupFailed && !scopedCompletion)
      throw new Error('AgendaQueue startup failed; finish cleanup before retrying.');
    if (this.closing && !scopedCompletion) throw new Error('AgendaQueue is draining; restart before queuing work.');
  }

  private acceptedJob(handler: AgendaJobHandler): AgendaJobHandler {
    return job => {
      const context = { active: true };
      const pending = this.workerContext.run(context, async () => {
        try {
          return await (this.input.runAcceptedWork
            ? this.input.runAcceptedWork(() => handler(job))
            : runAcceptedPersistenceWork(this.input.owner, () => handler(job)));
        } finally {
          // Detached descendants cannot keep admission after the handler settles.
          context.active = false;
        }
      });
      // Agenda's lock watchdog can finish before the actual handler. Its
      // processor count alone cannot authorize closing the handler's resources.
      this.workers.add(pending);
      void pending.then(
        () => this.workers.delete(pending),
        () => this.workers.delete(pending)
      );
      return pending;
    };
  }

  protected async drainWorkers(): Promise<void> {
    this.closing = true;
    if (!this.workerDrain) {
      const draining = (async () => {
        const requests = this.application ? (this.input.drainRequests?.() ?? Promise.resolve()) : Promise.resolve();
        const processors = (async () => {
          const started = new Set(this.startedAgendas);
          const early = Promise.all(Array.from(started, agenda => this.drainAgenda(agenda)));
          void early.catch(() => {});
          try {
            await this.readyInitPromise;
          } catch {
            /* preserve startup failure */
          }
          while (this.agendaStarts.size) await Promise.allSettled(this.agendaStarts);
          // A backend finishing start during shutdown quiesces itself below.
          await Promise.all([
            early,
            ...Array.from(this.startedAgendas)
              .filter(agenda => !started.has(agenda))
              .map(agenda => this.drainAgenda(agenda)),
          ]);
        })();
        await Promise.all([requests, processors]);
        do {
          while (this.workers.size || this.pending.size || this.jobCompletions.size || this.backendOperations.size)
            await Promise.allSettled([
              ...this.workers,
              ...this.pending,
              ...Array.from(this.jobCompletions.values(), completion => completion.promise),
              ...this.backendOperations,
            ]);
          for (const release of this.claimReleases) await release();
        } while (this.workers.size || this.pending.size || this.jobCompletions.size || this.backendOperations.size);
      })();
      this.workerDrain = draining;
      void draining.catch(() => {
        if (this.workerDrain === draining) this.workerDrain = undefined;
      });
    }
    await this.withDrainDeadline(this.workerDrain);
  }

  private drainAgenda(agenda: Agenda): Promise<void> {
    let draining = this.agendaDrains.get(agenda);
    if (!draining) {
      // stop(false) stops claims immediately and releases prefetched locks.
      // Application ownership below awaits handlers AND final backend writes;
      // Agenda's drain can forget handlers after its lock watchdog expires.
      draining = Promise.resolve().then(() => agenda.stop(false));
      this.agendaDrains.set(agenda, draining);
      const current = draining;
      void draining.catch(() => {
        if (this.agendaDrains.get(agenda) === current) this.agendaDrains.delete(agenda);
      });
    }
    return draining;
  }

  protected async withDrainDeadline(work: Promise<void>): Promise<void> {
    await withTimeout(
      work,
      this.drainTimeoutMs,
      () =>
        new PersistenceError(
          'agenda-drain-deadline',
          `Agenda drain deadline exceeded (${this.workers.size} handlers, ${this.jobCompletions.size} job completions, ${this.pending.size} enqueues, ${this.backendOperations.size} backend operations pending). Resources remain owned; stop users and retry cleanup.`
        )
    );
  }

  private track<T>(pending: Promise<T>): Promise<T> {
    this.pending.add(pending);
    void pending.then(
      () => this.pending.delete(pending),
      () => this.pending.delete(pending)
    );
    return pending;
  }

  private ownBackendOperation<T>(pending: Promise<T>): Promise<T> {
    this.backendOperations.add(pending);
    void pending.then(
      () => this.backendOperations.delete(pending),
      () => this.backendOperations.delete(pending)
    );
    return pending;
  }

  private ownAgendaRepository(
    repository: JobRepository,
    release: (claim: JobParameters) => Promise<void>,
    claimKey = (claim: JobParameters) => JSON.stringify([String(claim._id), claim.lastModifiedBy]),
    claimEnded = (_error: unknown) => false
  ): JobRepository {
    type Claim = { attrs: JobParameters; tail: Promise<void>; releasing?: Promise<void> };
    const claims = new Map<string, Claim>();
    const sequence = <T>(claim: Claim, work: () => Promise<T>): Promise<T> => {
      const pending = claim.tail.then(work);
      claim.tail = pending.then(
        () => {},
        () => {}
      );
      return pending;
    };
    const releaseClaim = (key: string): Promise<void> => {
      const claim = claims.get(key);
      if (!claim) return Promise.resolve();
      if (claim.releasing) return claim.releasing;
      // A release follows every submitted state save for this delivery. It
      // cannot race a renewal or forget another delivery of the same job.
      const releasing = sequence(claim, async () => {
        if (claims.get(key) !== claim) return;
        await release(claim.attrs);
        claims.delete(key);
      });
      claim.releasing = releasing;
      void releasing.then(
        () => {
          claim.releasing = undefined;
        },
        () => {
          claim.releasing = undefined;
        }
      );
      return releasing;
    };
    this.claimReleases.add(async () => {
      for (const key of claims.keys()) await releaseClaim(key);
    });
    return new Proxy(repository, {
      get: (target, property) => {
        const method = Reflect.get(target, property, target);
        if (typeof method !== 'function') return method;
        return (...args: unknown[]) => {
          const operation = (async () => {
            const acquiring = property === 'getNextJobToRun' || property === 'lockJob';
            if (acquiring && this.closing) return undefined;
            if (property === 'unlockJob') return releaseClaim(claimKey(args[0] as JobParameters));
            if (property === 'unlockJobs') {
              const ids = new Set((args[0] as Parameters<JobRepository['unlockJobs']>[0]).map(String));
              for (const [key, claim] of claims) {
                if (ids.has(String(claim.attrs._id))) await releaseClaim(key);
              }
              return;
            }
            const savingState = property === 'saveJobState';
            if (savingState || property === 'saveJob') {
              // Job.touch/run mutate attrs in place. Snapshot at admission,
              // before waiting for another write, and retain no job payload.
              const attrs = { ...(args[0] as JobParameters), ...(savingState ? { data: undefined } : {}) };
              const key = claimKey(attrs),
                claim = claims.get(key);
              if (!claim) {
                if (!savingState) return Reflect.apply(method, target, args);
                throw new Error('AgendaQueue claim is no longer owned.');
              }
              const options = { ...(args[1] as object), lastModifiedBy: claim.attrs.lastModifiedBy };
              return sequence(claim, async () => {
                if (claims.get(key) !== claim) throw new Error('AgendaQueue claim is no longer owned.');
                try {
                  const result = await Reflect.apply(method, target, [attrs, options]);
                  if (savingState && !attrs.lockedAt) claims.delete(key);
                  return result;
                } catch (error) {
                  // Confirmed ended receipts/claims convey no ownership.
                  // Ambiguous failures stay owned for the single release path.
                  if (claimEnded(error)) claims.delete(key);
                  throw error;
                }
              });
            }
            if (acquiring) {
              // Mongo uses lastModifiedBy as the persisted delivery identity.
              // A later claim by this same Agenda instance gets a new owner,
              // even if both lock timestamps are identical.
              const owner = `redbox-claim-${randomUUID()}`;
              const optionIndex = property === 'lockJob' ? 1 : 4;
              args[optionIndex] = { ...(args[optionIndex] as object), lastModifiedBy: owner };
              const result = (await Reflect.apply(method, target, args)) as JobParameters | undefined;
              if (!result) return result;
              result.lastModifiedBy = owner;
              const key = claimKey(result);
              // Retain just one compact record per live backend delivery.
              if (!claims.has(key)) claims.set(key, { attrs: { ...result, data: undefined }, tail: Promise.resolve() });
              if (this.closing) {
                await releaseClaim(key);
                return undefined;
              }
              return result;
            }
            return Reflect.apply(method, target, args);
          })();
          return this.ownBackendOperation(operation);
        };
      },
    });
  }

  private active = false;
  private activating?: Promise<void>;
  private preparedJobs: AgendaJobDefinition[] = [];
  public constructor(protected readonly input: AgendaQueueInput) {}

  public initialize(): Promise<void> {
    return this.handleReady();
  }
  public activate(): Promise<void> {
    if (this.closing || this.startupFailed) return Promise.reject(new Error('AgendaQueue is stopping or failed.'));
    if (!this.queueInitialized) return Promise.reject(new Error('Initialize AgendaQueue before activation.'));
    return (this.activating ??= this.activatePrepared().catch(error => {
      this.startupFailed = true;
      throw error;
    }));
  }
  private processorsStarting?: Promise<void>;
  protected startProcessors(): Promise<void> {
    return (this.processorsStarting ??= this.startProcessorsInternal());
  }
  private async startProcessorsInternal(): Promise<void> {
    const activeAgendas = Object.values(this.agendas).filter((agenda): agenda is Agenda => agenda !== undefined);
    await Promise.all(
      activeAgendas.map(agenda => {
        const starting = (async () => {
          await agenda.start();
          this.startedAgendas.add(agenda);
          if (this.closing) await this.drainAgenda(agenda);
        })();
        this.agendaStarts.add(starting);
        void starting.then(
          () => this.agendaStarts.delete(starting),
          () => this.agendaStarts.delete(starting)
        );
        return starting;
      })
    );
  }
  private async activatePrepared(): Promise<void> {
    // Persist recurring definitions before any due persisted job can be claimed.
    // Otherwise schedule upserts can overwrite an active delivery's owner/lock.
    await this.runConfiguredStartupSchedules(this.preparedJobs);
    if (this.closing) throw new Error('AgendaQueue is stopping.');
    await this.startProcessors();
    if (this.closing) throw new Error('AgendaQueue is stopping.');
    this.active = true;
  }
  public quiesce(): void {
    this.closing = true;
    for (const agenda of this.startedAgendas) void this.drainAgenda(agenda).catch(() => {});
  }
  public async drain(): Promise<void> {
    await this.drainWorkers();
  }
  public async close(): Promise<void> {
    await this.drainWorkers();
    for (const backend of this.backendResources) {
      await backend.disconnect();
      this.backendResources.delete(backend);
    }
    this.queueInitialized = false;
    this.agendas = {};
    this.agenda = undefined;
    this.jobBackendByName.clear();
    this.readyInitPromise = undefined;
    this.startedAgendas.clear();
    this.agendaDrains.clear();
    this.claimReleases.clear();
    this.application = undefined;
  }
  protected normalAdmission(completion = false): void {
    if (!this.active && !(completion && this.workerContext.getStore()?.active))
      throw new Error('AgendaQueue submissions require active application admission.');
  }

  protected async handleReady() {
    if (this.closing) throw new Error('AgendaQueue is draining; restart before queuing work.');
    if (_.isNil(this.readyInitPromise)) {
      // A partial start keeps every acquired backend owned until cleanup.
      this.readyInitPromise = this.handleReadyInternal().catch(error => {
        this.startupFailed = true;
        if (this.application) void this.drainWorkers().catch(() => {});
        throw error;
      });
    }
    await this.readyInitPromise;
  }

  private async handleReadyInternal() {
    this.queueInitialized = false;
    const queueConfig = this.input.config;
    const queueOptions = queueConfig.options ?? {};
    this.drainTimeoutMs = queueOptions.drainTimeoutMs ?? 30_000;
    if (!Number.isSafeInteger(this.drainTimeoutMs) || this.drainTimeoutMs <= 0 || this.drainTimeoutMs > 2_147_483_647)
      throw new Error(
        'AgendaQueue options.drainTimeoutMs must be a positive timer interval in milliseconds (maximum 2147483647).'
      );
    const jobs = this.normalizeJobDefinitions(queueConfig.jobs);
    this.application = this.input.owner;
    this.defaultBackend = this.getDefaultBackend(queueOptions);

    const requiredBackends = new Set<AgendaQueueBackend>();
    this.jobBackendByName = new Map<string, AgendaQueueBackend>();
    _.each(jobs, (job: AgendaJobDefinition) => {
      const backend = this.getBackendForJob(job);
      this.jobBackendByName.set(job.name, backend);
      requiredBackends.add(backend);
    });
    if (requiredBackends.size === 0) {
      requiredBackends.add(this.defaultBackend);
    }
    const dbManager = requiredBackends.has('mongodb') ? await this.mongoJobDatabase(queueOptions) : undefined;
    this.agendas = {};

    if (requiredBackends.has('mongodb')) {
      this.agendas.mongodb = await this.createAgendaForBackend('mongodb', queueOptions, dbManager);
    }
    if (requiredBackends.has('sqs')) {
      this.agendas.sqs = await this.createAgendaForBackend('sqs', queueOptions, dbManager);
    }
    if (this.closing) return;

    this.agenda = this.agendas.mongodb ?? this.agendas[this.defaultBackend] ?? this.agendas.sqs;
    this.queueInitialized = true;
    this.defineJobs(jobs, this);
    this.input.log.verbose('AgendaQueue:: All jobs defined.');

    for (const [backend, agenda] of Object.entries(this.agendas))
      if (agenda) this.registerAgendaEvents(agenda, backend as AgendaQueueBackend);
    await this.prepareBackends(dbManager, queueOptions);
    this.preparedJobs = jobs;
  }

  private normalizeJobDefinitions(jobs: AgendaJobsConfig | AgendaJobDefinition[] | undefined): AgendaJobDefinition[] {
    if (_.isNil(jobs)) {
      return [];
    }
    if (Array.isArray(jobs)) {
      return jobs;
    }
    return Object.entries(jobs).map(([name, jobConfig]: [string, AgendaJobConfig]) => ({
      name,
      ...jobConfig,
    }));
  }

  /*
   define the jobs... structure is a map keyed by job name:
   {
     "jobName": {
       options: {}, // optional, see https://github.com/agenda/agenda#defining-job-processors
       fnName: "Fully qualified path to service function name", // e.g. "AgendaQueueService.sampleFunctionToDemonstrateHowToDefineAJobFunction"
       // optional, if you want to in-line schedule a job, based on https://github.com/agenda/agenda#creating-jobs
       schedule: {
         method: 'every',
         when: '1 minute',
         data: 'sample log string',
         // options: optional, see: https://github.com/agenda/agenda#repeateveryinterval-options
       }
     }
   }
   */
  public defineJobs(jobs: AgendaJobDefinition[], ref: AgendaQueue = this): void {
    _.each(jobs, (job: AgendaJobDefinition) => {
      const serviceFn = this.input.handler(job.fnName);
      if (_.isUndefined(serviceFn)) {
        this.missingHandler(job);
      } else {
        const agenda = ref.getAgendaForBackend(ref.getBackendForJob(job));
        const handler = ref.acceptedJob(serviceFn);
        if (_.isEmpty(job.options)) {
          agenda.define(job.name, handler);
        } else {
          agenda.define(job.name, handler, job.options as Parameters<Agenda['define']>[2]);
        }
        this.input.log.verbose(`AgendaQueue:: Defined job: ${job.name}`);
      }
    });
  }

  public defineJob(name: string, options: unknown, serviceFn: AgendaJobHandler) {
    this.accepting();
    const backend = this.jobBackendByName.get(name) ?? this.defaultBackend;
    const agenda = this.agendas[backend] ?? this.agenda;
    if (!agenda) {
      this.input.log.error(`AgendaQueue:: defineJob called before init for job: ${name}`);
      return;
    }
    this.jobBackendByName.set(name, backend);
    const handler = this.acceptedJob(serviceFn);
    if (_.isEmpty(options)) {
      agenda.define(name, handler);
    } else {
      agenda.define(name, handler, options as Parameters<Agenda['define']>[2]);
    }
    this.input.log.verbose(`AgendaQueue:: Defined job: ${name}`);
  }

  /**
   *
   * There are significant slowdowns with Agenda when the jobs collection grows large. This function moves all completed jobs to a history collection so we still have the data but it doesn't affect the peformance of the job processor.
   *
   * @param job
   */
  public async moveCompletedJobsToHistory(_job: Job) {
    this.accepting();
    return this.track(this.moveHistory());
  }

  private async moveHistory(): Promise<void> {
    const historyRetentionHours = this.input.config.options?.historyRetentionHours ?? 25;
    const historyRetentionMs = historyRetentionHours * 60 * 60 * 1000;
    const dbManager = (await this.mongoJobDatabase(
      this.input.config.options ?? {}
    )) as unknown as AgendaQueueMongoManager;
    const collectionName = String(_.get(this.input.config, 'options.collection', 'agendaJobs'));
    const jobsCollection = dbManager.collection(collectionName);
    const historyCollection = dbManager.collection(`${collectionName}History`);
    const finishedFilter = { nextRunAt: null, lockedAt: null, lastFinishedAt: { $type: 'date' } };
    const completedJobs = await jobsCollection.find(finishedFilter).toArray();

    for (const doc of completedJobs) {
      await historyCollection.replaceOne({ _id: (doc as { _id?: unknown })._id }, doc, { upsert: true });
      await jobsCollection.deleteOne({
        ...finishedFilter,
        _id: (doc as { _id?: unknown })._id,
        lastFinishedAt: doc['lastFinishedAt'],
      });
    }

    const historyCutoff = new Date(Date.now() - historyRetentionMs);
    await historyCollection.deleteMany({ lastFinishedAt: { $lt: historyCutoff } });

    this.input.log.verbose(
      `moveCompletedJobsToHistory:: Moved completed jobs to history and removed history older than ${historyRetentionHours} hours`
    );
  }

  private getDefaultBackend(options: AgendaQueueOptions): AgendaQueueBackend {
    return options.backend ?? 'mongodb';
  }

  private getBackendForJob(job: Pick<AgendaJobDefinition, 'backend'>): AgendaQueueBackend {
    if (job.backend === 'mongodb' || job.backend === 'sqs') {
      return job.backend;
    }
    return this.defaultBackend;
  }

  private getBackendForJobName(jobName: string): AgendaQueueBackend {
    const backend = this.jobBackendByName.get(jobName);
    if (_.isNil(backend)) {
      throw new Error(`AgendaQueue:: Unknown job '${jobName}'. Define it in agendaQueue.jobs before queuing it.`);
    }
    return backend;
  }

  private getAgendaForBackend(backend: AgendaQueueBackend): Agenda {
    const agenda = this.agendas[backend];
    if (_.isNil(agenda)) {
      throw new Error(`AgendaQueue:: No Agenda instance is configured for backend '${backend}'.`);
    }
    return agenda;
  }

  private getAgendaForJobName(jobName: string): Agenda {
    return this.getAgendaForBackend(this.getBackendForJobName(jobName));
  }

  private ensureRecurringScheduleSupported(jobName: string) {
    if (this.getBackendForJobName(jobName) === 'sqs') {
      throw new AgendaQueueUnsupportedFeatureError(
        `AgendaQueue:: every() is not supported for SQS-backed job '${jobName}'. ${EXTERNAL_SCHEDULER_GUIDANCE}`
      );
    }
  }

  private toSerializableJobData(value: unknown, seen = new WeakSet<object>()): unknown {
    if (_.isNil(value) || typeof value !== 'object') {
      return value;
    }
    if (value instanceof Date || Buffer.isBuffer(value)) {
      return value;
    }

    const bsonLikeValue = value as { _bsontype?: unknown; toHexString?: () => string; toJSON?: () => unknown };
    if (_.isString(bsonLikeValue._bsontype)) {
      if (typeof bsonLikeValue.toHexString === 'function') {
        return bsonLikeValue.toHexString();
      }
      if (typeof bsonLikeValue.toJSON === 'function') {
        return this.toSerializableJobData(bsonLikeValue.toJSON(), seen);
      }
    }

    if (seen.has(value)) {
      return undefined;
    }
    seen.add(value);

    if (Array.isArray(value)) {
      return value.map(item => this.toSerializableJobData(item, seen));
    }

    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .map(([key, item]) => [key, this.toSerializableJobData(item, seen)])
        .filter(([, item]) => !_.isUndefined(item))
    );
  }

  private applyCommonAgendaOptions(
    agendaOptions: {
      backend: unknown;
      defaultLockLifetime?: number;
      processEvery?: string;
    },
    options: AgendaQueueOptions
  ) {
    if (!_.isNil(options.defaultLockLifetime)) {
      agendaOptions.defaultLockLifetime = options.defaultLockLifetime;
    }
    if (!_.isNil(options.processEvery)) {
      agendaOptions.processEvery = options.processEvery;
    }
  }

  private async createAgendaForBackend(
    backendName: AgendaQueueBackend,
    options: AgendaQueueOptions,
    dbManager: unknown
  ): Promise<Agenda> {
    const agendaOptions: {
      backend: unknown;
      name: string;
      defaultLockLifetime?: number;
      processEvery?: string;
    } = {
      backend: undefined,
      name: `redbox-${randomUUID()}`,
    };
    this.applyCommonAgendaOptions(agendaOptions, options);
    const own = async (
      backend: AgendaBackend,
      release = (claim: JobParameters) => backend.repository.unlockJob(claim),
      claimKey?: (claim: JobParameters) => string,
      claimEnded?: (error: unknown) => boolean
    ): Promise<Agenda> => {
      agendaOptions.backend = {
        name: backend.name,
        repository: this.ownAgendaRepository(backend.repository, release, claimKey, claimEnded),
        notificationChannel: backend.notificationChannel,
        logger: backend.logger,
        ownsConnection: false,
        connect: async () => {},
        disconnect: async () => {},
      } satisfies AgendaBackend;
      return this.createConnectedAgenda(backend, agendaOptions, options);
    };

    if (backendName === 'mongodb') {
      const { MongoJobRepository, ObjectId } = await import('@agendajs/mongo-backend');
      // Readiness, processing and history use the same selected, app-owned database.
      const queueDb = dbManager as Db;
      const backend = await this.createMongoBackend(queueDb, options);
      const repository = backend.repository;
      if (!(repository instanceof MongoJobRepository)) throw new Error('Agenda Mongo repository is unavailable.');
      const lostClaim = () =>
        Object.assign(new Error('AgendaQueue Mongo claim is no longer owned.'), { name: 'AgendaClaimLostError' });
      const collection = () => repository.getDb().collection(options.collection || 'agendaJobs');
      const owned = (claim: JobParameters) => ({
        _id: new ObjectId(String(claim._id)),
        name: claim.name,
        lastModifiedBy: claim.lastModifiedBy,
        lockedAt: { $type: 'date' },
      });
      // The pinned Agenda state save matches only the job ID/name. Fence it
      // to the same delivery as release, so an expired handler cannot clear a
      // successor's lock or replace its retry state.
      repository.saveJobState = async claim => {
        const result = await collection().updateOne(owned(claim), {
          $set: {
            lockedAt: claim.lockedAt ? new Date(claim.lockedAt) : null,
            nextRunAt: claim.nextRunAt ? new Date(claim.nextRunAt) : null,
            lastRunAt: claim.lastRunAt ? new Date(claim.lastRunAt) : null,
            progress: claim.progress ?? null,
            failReason: claim.failReason ?? null,
            failCount: claim.failCount ?? null,
            failedAt: claim.failedAt ? new Date(claim.failedAt) : null,
            lastFinishedAt: claim.lastFinishedAt ? new Date(claim.lastFinishedAt) : null,
            lastModifiedBy: claim.lastModifiedBy,
          },
        });
        if (!result.acknowledged) throw new Error('AgendaQueue Mongo state save was not acknowledged.');
        if (result.matchedCount !== 1) throw lostClaim();
      };
      const saveJob = repository.saveJob.bind(repository);
      repository.saveJob = async (claim, saveOptions) => {
        if (!saveOptions?.lastModifiedBy?.startsWith('redbox-claim-')) {
          if (claim.lastModifiedBy?.startsWith('redbox-claim-')) throw lostClaim();
          return saveJob(claim, saveOptions);
        }
        // Job.save() excludes processor fields, but the pinned repository
        // fills those omitted fields with null and changes lastModifiedBy.
        // An active delivery must keep its lock/owner until its final state
        // save; update only the submitted user/scheduling fields under that
        // same ownership predicate.
        const { _id, unique: _unique, uniqueOpts: _uniqueOpts, ...values } = claim;
        for (const field of [
          'lockedAt',
          'lastRunAt',
          'lastFinishedAt',
          'failedAt',
          'failCount',
          'failReason',
          'progress',
          'lastModifiedBy',
        ] as const)
          delete values[field];
        const saved = await collection().findOneAndUpdate(owned(claim), { $set: values }, { returnDocument: 'after' });
        if (!saved) throw lostClaim();
        return { ...claim, nextRunAt: saved.nextRunAt, debounceStartedAt: saved.debounceStartedAt };
      };
      return own(
        backend,
        async claim => {
          // The unique delivery owner covers every acknowledged or ambiguous
          // heartbeat without retaining timestamp candidates. An applied final
          // save has no lock and must never be resurrected by release retry.
          await collection().updateOne(owned(claim), [
            { $set: { nextRunAt: { $ifNull: ['$nextRunAt', new Date()] } } },
            { $unset: 'lockedAt' },
          ]);
        },
        undefined,
        error => error instanceof Error && error.name === 'AgendaClaimLostError'
      );
    }

    const sqsOptions = options.sqs;
    if (_.isNil(sqsOptions) || _.isEmpty(sqsOptions.queueUrl)) {
      throw new Error('AgendaQueue:: SQS backend requires agendaQueue.options.sqs.queueUrl.');
    }

    const { SqsBackend, SQS_METADATA } = await import('@researchdatabox/agenda-sqs-backend');
    const backend = new SqsBackend({
      queueUrl: sqsOptions.queueUrl,
      region: sqsOptions.region,
      waitTimeSeconds: sqsOptions.waitTimeSeconds,
      receiveBatchSize: sqsOptions.maxMessagesPerPoll,
      visibilityTimeoutSeconds: sqsOptions.visibilityTimeout,
      fifo:
        sqsOptions.queueType === 'fifo'
          ? {
              enabled: true,
              messageGroupId: sqsOptions.fifoMessageGroupId,
              deduplicationIdStrategy: 'job-id',
            }
          : undefined,
    });
    const receiptEnded = (error: unknown) =>
      error instanceof Error && (error.name === 'MessageNotInflight' || error.name === 'ReceiptHandleIsInvalid');
    return own(
      backend,
      async claim => {
        try {
          await backend.repository.unlockJob(claim);
        } catch (error) {
          // Expired/deleted receipts no longer convey ownership. Retrying them
          // forever would prevent shutdown after the visibility lease ended.
          if (!receiptEnded(error)) throw error;
          this.application?.log.warn('AgendaQueue:: SQS receipt is no longer active; claim release is complete.');
        }
      },
      claim => {
        // A redelivery has the same job id but a new receipt. Old final saves
        // and unlocks must never forget or release that newer delivery.
        const metadata = Reflect.get(claim, SQS_METADATA) as
          | import('@researchdatabox/agenda-sqs-backend').SqsRuntimeMetadata
          | undefined;
        return JSON.stringify([String(claim._id), metadata?.receiptHandle]);
      },
      receiptEnded
    );
  }

    private getConnectionTimeoutMs(options: AgendaQueueOptions): number {
      const configured = Number(options.connectionTimeoutMs);
      return Number.isFinite(configured) && configured > 0 ? Math.ceil(configured) : 30000;
    }

    private async createConnectedAgenda(
      backend: AgendaBackend,
      agendaOptions: { backend: unknown; defaultLockLifetime?: number; processEvery?: string },
      options: AgendaQueueOptions
    ): Promise<Agenda> {
      const { Agenda: AgendaConstructor } = await import('agenda');
      this.backendResources.add(backend);
      let discarded = false;
      let connectionSettled = false;
      let deadline: ReturnType<typeof setTimeout> | undefined;
      const connecting = this.ownBackendOperation(Promise.resolve().then(async () => {
        try {
          await backend.connect();
        } finally {
          connectionSettled = true;
          // A timed-out connection may open resources before failing later.
          // Clean up both outcomes once the discarded attempt settles.
          if (discarded) {
            await backend.disconnect();
            this.backendResources.delete(backend);
          }
        }
      }));
      try {
        await Promise.race([
          connecting,
          new Promise<never>((_resolve, reject) => {
            deadline = setTimeout(() => reject(new Error('AgendaQueue:: Backend connection timed out.')),
              this.getConnectionTimeoutMs(options));
          })
        ]);
        this.accepting();
        // Agenda 6 starts connect() in its constructor without a rejection handler.
        // Give it the already-successful connection, not another fallible attempt.
        const agenda = new AgendaConstructor(agendaOptions as ConstructorParameters<typeof AgendaConstructor>[0]);
        await agenda.ready;
        this.accepting();
        return agenda;
      } catch (error) {
        discarded = true;
        void this.ownBackendOperation(Promise.resolve().then(async () => {
          await backend.disconnect();
          // Retain the backend until late connection cleanup has also succeeded.
          if (connectionSettled) this.backendResources.delete(backend);
        })).catch(() => {
          this.input.log.error('AgendaQueue:: Failed to close discarded backend.');
        });
        throw error;
      } finally {
        clearTimeout(deadline);
      }
    }

  private registerAgendaEvents(agenda: Agenda, backend: AgendaQueueBackend) {
    agenda.on('ready', () => {
      this.input.log.verbose(`AgendaQueue:: Started ${backend} backend.`);
    });
    agenda.on('error', () => {
      this.input.log.error(`AgendaQueue:: ${backend} backend error`);
    });
    agenda.on('start', (job: Job) => {
      // complete precedes removeOnComplete. Own the entire public remove()
      // promise before cancel() yields on ready and reaches the repository.
      const remove = job.remove.bind(job);
      job.remove = () => this.ownBackendOperation(remove());
      const { promise, resolve } = Promise.withResolvers<void>();
      this.jobCompletions.set(job, { promise, resolve });
      this.input.log.verbose(`AgendaQueue:: [${backend}] Job ${job.attrs.name} starting`);
    });
    agenda.on('complete', (job: Job) => {
      this.jobCompletions.get(job)?.resolve();
      this.jobCompletions.delete(job);
      this.input.log.verbose(`AgendaQueue:: [${backend}] Job ${job.attrs.name} finished`);
    });
    agenda.on('fail', (_err, job) => {
      this.input.log.error(`AgendaQueue:: [${backend}] Job ${job.attrs.name} failed`);
    });
  }

  protected async prepareBackends(db: Db | undefined, options: AgendaQueueOptions): Promise<void> {
    if (this.agendas.mongodb && db) await this.createMongoIndexes(db, options);
  }
  private mongoJobDatabase(options: AgendaQueueOptions): Promise<Db> {
    return options.db
      ? mongoResourceDatabase(this.input.owner, 'agenda', { mongoUrl: options.db })
      : mongoDatabase(this.input.owner, 'mongodb');
  }
  protected async createMongoBackend(db: Db, options: AgendaQueueOptions): Promise<AgendaBackend> {
    const { MongoJobRepository } = await import('@agendajs/mongo-backend');
    // Persistent Agenda logging is disabled. MongoBackend.connect would still
    // create logger indexes; use the same pinned repository's supported seam.
    const repository = new MongoJobRepository({
      mongo: db,
      db: { collection: options.collection },
      ensureIndex: false,
    });
    return {
      name: 'MongoDB',
      repository,
      ownsConnection: false,
      connect: () => repository.connect(),
      disconnect: () => repository.disconnect(),
    };
  }
  protected async createMongoIndexes(db: Db, options: AgendaQueueOptions): Promise<void> {
    await requireAgendaIndexes(db, options.collection);
  }
  protected missingHandler(job: AgendaJobDefinition): void {
    throw new Error(`AgendaQueue job '${job.name}' requires a bound handler.`);
  }
  private async runConfiguredStartupSchedules(jobs: AgendaJobDefinition[]): Promise<void> {
    for (const job of jobs) {
      const schedule = job.schedule;
      if (!schedule) continue;
      this.accepting();
      const agenda = this.getAgendaForJobName(job.name);
      const data = this.toSerializableJobData(schedule.data);
      if (schedule.method === 'now') await this.track(agenda.now(job.name, data));
      else if (schedule.method === 'every' && schedule.intervalOrSchedule) {
        this.ensureRecurringScheduleSupported(job.name);
        await this.track(agenda.every(schedule.intervalOrSchedule, job.name, data, schedule.opts));
      } else if (schedule.method === 'schedule' && schedule.intervalOrSchedule) {
        this.ensureScheduleSupported(job.name, schedule.intervalOrSchedule, data);
        await this.track(agenda.schedule(schedule.intervalOrSchedule, job.name, data));
      } else throw new Error(`AgendaQueue job '${job.name}' has an invalid startup schedule.`);
    }
  }

  private ensureScheduleSupported(jobName: string, schedule: string, data: unknown) {
    if (this.getBackendForJobName(jobName) !== 'sqs') {
      return;
    }

    const agenda = this.getAgendaForJobName(jobName);
    const scheduledJob = agenda.create(jobName, data).schedule(schedule);
    const nextRunAt = scheduledJob.attrs.nextRunAt;
    if (!(nextRunAt instanceof Date) || Number.isNaN(nextRunAt.getTime())) {
      throw new Error(`AgendaQueue:: schedule() received an invalid schedule for SQS-backed job '${jobName}'.`);
    }

    const delayMs = nextRunAt.getTime() - Date.now();
    if (delayMs > 15 * 60 * 1000) {
      throw new AgendaQueueUnsupportedFeatureError(
        `AgendaQueue:: schedule() only supports delays up to 15 minutes for SQS-backed job '${jobName}'.`
      );
    }
  }

  private queryTargetsSqsJobs(query: LegacyAgendaJobsQuery | undefined): boolean {
    if (_.isNil(query) || _.isNil((query as { name?: unknown }).name)) {
      return false;
    }

    const nameQuery = (query as { name?: unknown }).name;
    if (_.isString(nameQuery)) {
      return this.jobBackendByName.get(nameQuery) === 'sqs';
    }

    if (_.isPlainObject(nameQuery)) {
      const structuredNameQuery = nameQuery as { $in?: unknown } & Record<string, unknown>;
      const keys = Object.keys(structuredNameQuery);
      const inNames = keys.length === 1 && keys[0] === '$in' ? structuredNameQuery.$in : undefined;
      if (!Array.isArray(inNames) || !inNames.every(_.isString)) {
        throw new AgendaQueueUnsupportedFeatureError(
          'AgendaQueue:: jobs() only supports name queries using an exact string or $in when SQS-backed jobs are configured.'
        );
      }

      return inNames.some((name: string) => this.jobBackendByName.get(name) === 'sqs');
    }

    return false;
  }

  private toJobsQueryOptions(query: LegacyAgendaJobsQuery | undefined): JobsQueryOptions | undefined {
    if (_.isNil(query?.name)) {
      return undefined;
    }

    if (_.isString(query.name)) {
      return { name: query.name };
    }

    return { names: query.name.$in };
  }

  public async sampleFunctionToDemonstrateHowToDefineAJobFunction(job: unknown) {
    this.input.log.info(`AgendaQueue:: sample function called by job: `);
    this.input.log.info(JSON.stringify(job));
  }

  public every(
    jobName: string,
    interval: string,
    data: unknown = undefined,
    options: { timezone?: string; skipImmediate?: boolean; forkMode?: boolean } | undefined = undefined
  ) {
    this.normalAdmission();
    this.accepting();
    this.ensureRecurringScheduleSupported(jobName);
    return this.track(this.getAgendaForJobName(jobName).every(interval, jobName, this.toSerializableJobData(data), options));
  }

  public schedule(jobName: string, schedule: string, data: unknown = undefined) {
    this.normalAdmission(true);
    this.accepting(true);
    this.ensureScheduleSupported(jobName, schedule, data);
    return this.track(this.getAgendaForJobName(jobName).schedule(schedule, jobName, this.toSerializableJobData(data)));
  }

  public async now(jobName: string, data: unknown = undefined) {
    this.normalAdmission(true);
    this.accepting(true);
    this.input.log.verbose(`AgendaQueue:: Starting job: '${jobName}' now!`);
    const queuedJob = this.track(this.getAgendaForJobName(jobName).now(jobName, this.toSerializableJobData(data)));
    queuedJob.catch(() => {
      this.input.log.error(`AgendaQueue:: Failed to start job now: ${jobName}`);
    });
    return await queuedJob;
  }

  public async jobs(query?: LegacyAgendaJobsQuery): Promise<JobsResult> {
    this.accepting();
    if (_.isNil(this.agendas.mongodb)) {
      throw new AgendaQueueUnsupportedFeatureError(
        'AgendaQueue:: jobs() is only supported when a MongoDB-backed agenda is configured.'
      );
    }
    if (this.queryTargetsSqsJobs(query)) {
      throw new AgendaQueueUnsupportedFeatureError('AgendaQueue:: jobs() is not supported for SQS-backed jobs.');
    }
    return await this.track(this.agendas.mongodb.queryJobs(this.toJobsQueryOptions(query)));
  }
}
