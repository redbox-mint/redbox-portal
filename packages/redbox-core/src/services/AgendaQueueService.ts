import { mongoDatabase, mongoResourceDatabase } from '../persistence/runtime';
import { registerPersistenceResource } from '../persistence/runtime';
import { PersistenceError } from '../persistence/errors';
import { AsyncLocalStorage } from 'node:async_hooks';
import { randomUUID } from 'node:crypto';
import { drainHttpRequests, hasActiveHttpRequest } from '../middleware/requestLifetime';
// Copyright (c) 2020 Queensland Cyber Infrastructure Foundation (http://www.qcif.edu.au/)
//
// GNU GENERAL PUBLIC LICENSE
//    Version 2, June 1991
//
// This program is free software; you can redistribute it and/or modify
// it under the terms of the GNU General Public License as published by
// the Free Software Foundation; either version 2 of the License, or
// (at your option) any later version.
//
// This program is distributed in the hope that it will be useful,
// but WITHOUT ANY WARRANTY; without even the implied warranty of
// MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
// GNU General Public License for more details.
//
// You should have received a copy of the GNU General Public License along
// with this program; if not, write to the Free Software Foundation, Inc.,
// 51 Franklin Street, Fifth Floor, Boston, MA 02110-1301 USA.

// Copyright (c) 2020 Queensland Cyber Infrastructure Foundation (http://www.qcif.edu.au/)
//
// GNU GENERAL PUBLIC LICENSE
//    Version 2, June 1991
//
// This program is free software; you can redistribute it and/or modify
// it under the terms of the GNU General Public License as published by
// the Free Software Foundation; either version 2 of the License, or
// (at your option) any later version.
//
// This program is distributed in the hope that it will be useful,
// but WITHOUT ANY WARRANTY; without even the implied warranty of
// MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
// GNU General Public License for more details.
//
// You should have received a copy of the GNU General Public License along
// with this program; if not, write to the Free Software Foundation, Inc.,
// 51 Franklin Street, Fifth Floor, Boston, MA 02110-1301 USA.


import { Services as services } from '../CoreService';
import { QueueService } from '../QueueService';
import type { AgendaJobConfig, AgendaJobDefinition, AgendaJobsConfig, AgendaQueueBackend, AgendaQueueOptions } from '../config/agendaQueue.config';
import type { Agenda, AgendaBackend, Job, JobParameters, JobRepository, JobsQueryOptions, JobsResult } from 'agenda';
import type { Db } from '@agendajs/mongo-backend';

type AgendaJobHandler = (job: Job) => Promise<void>;
type AgendaMap = Partial<Record<AgendaQueueBackend, Agenda>>;
type LegacyAgendaJobsQuery = {
  name?: string | { $in?: string[] };
};
type AgendaQueueMongoCollection = {
  find: (filter: Record<string, unknown>) => { toArray: () => Promise<Record<string, unknown>[]> };
  replaceOne: (filter: Record<string, unknown>, doc: Record<string, unknown>, options: { upsert: boolean }) => Promise<unknown>;
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


export namespace Services {
  const EXTERNAL_SCHEDULER_GUIDANCE = 'Use an external scheduler for SQS-backed recurring jobs.';

  /**
   * Service class for queuing using Agenda: https://github.com/agenda/agenda
   *
   */
  export class AgendaQueue extends services.Core.Service implements QueueService {
    protected override _exportedMethods: string[] = [
      'every',
      'schedule',
      'now',
      'jobs',
      'sampleFunctionToDemonstrateHowToDefineAJobFunction',
      'defineJob',
      'moveCompletedJobsToHistory',
      'init'
    ];

    protected agenda?: Agenda;
    protected agendas: AgendaMap = {};
    protected defaultBackend: AgendaQueueBackend = 'mongodb';
    protected jobBackendByName = new Map<string, AgendaQueueBackend>();
    private readyInitPromise?: Promise<void>;
    private queueInitialized = false;
    private resourceRegistered = false;
    private shutdownRegistered = false;
    private closing = false;
    private startupFailed = false;
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
    private application?: Sails.Application;
    private completionAdmission = true;
    private completionDeadline?: ReturnType<typeof setTimeout>;
    private drainTimeoutMs = 30_000;

    private accepting(completion = false): void {
      const scopedCompletion = completion && this.completionAdmission &&
        (this.workerContext.getStore()?.active || (this.application && hasActiveHttpRequest(this.application)));
      if (this.startupFailed && !scopedCompletion) throw new Error('AgendaQueue startup failed; finish cleanup before retrying.');
      if (this.closing && !scopedCompletion)
        throw new Error('AgendaQueue is draining; restart before queuing work.');
    }

    private acceptedJob(handler: AgendaJobHandler): AgendaJobHandler {
      return job => {
        const context = { active: true };
        const pending = this.workerContext.run(context, async () => {
          try {
            return await handler(job);
          } finally {
            // Detached descendants cannot keep admission after the handler settles.
            context.active = false;
          }
        });
        // Agenda's lock watchdog can finish before the actual handler. Its
        // processor count alone cannot authorize closing the handler's resources.
        this.workers.add(pending);
        void pending.then(() => this.workers.delete(pending), () => this.workers.delete(pending));
        return pending;
      };
    }

    private async drainWorkers(): Promise<void> {
      if (!this.closing) {
        // A failed stop/unlock must not revoke accepted completion work early,
        // or extend its original admission deadline when cleanup is retried.
        this.completionDeadline = setTimeout(() => { this.completionAdmission = false; }, this.drainTimeoutMs);
        this.completionDeadline.unref();
      }
      this.closing = true;
      if (!this.workerDrain) {
        const draining = (async () => {
          const requests = this.application ? drainHttpRequests(this.application) : Promise.resolve();
          const processors = (async () => {
            const started = new Set(this.startedAgendas);
            const early = Promise.all(Array.from(started, agenda => this.drainAgenda(agenda)));
            void early.catch(() => {});
            try { await this.readyInitPromise; } catch { /* preserve startup failure */ }
            while (this.agendaStarts.size) await Promise.allSettled(this.agendaStarts);
            // A backend finishing start during shutdown quiesces itself below.
            await Promise.all([early, ...Array.from(this.startedAgendas)
              .filter(agenda => !started.has(agenda)).map(agenda => this.drainAgenda(agenda))]);
          })();
          await Promise.all([requests, processors]);
          do {
            while (this.workers.size || this.pending.size || this.jobCompletions.size || this.backendOperations.size)
              await Promise.allSettled([...this.workers, ...this.pending,
                ...Array.from(this.jobCompletions.values(), completion => completion.promise), ...this.backendOperations]);
            for (const release of this.claimReleases) await release();
          } while (this.workers.size || this.pending.size || this.jobCompletions.size || this.backendOperations.size);
          this.completionAdmission = false;
          clearTimeout(this.completionDeadline);
          this.completionDeadline = undefined;
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

    private async withDrainDeadline(work: Promise<void>): Promise<void> {
      let timer: ReturnType<typeof setTimeout> | undefined;
      try {
        await Promise.race([
          work,
          new Promise<never>((_, reject) => {
            timer = setTimeout(() => {
              this.completionAdmission = false;
              reject(new PersistenceError('agenda-drain-deadline', `Agenda drain deadline exceeded (${this.workers.size} handlers, ${this.jobCompletions.size} job completions, ${this.pending.size} enqueues, ${this.backendOperations.size} backend operations pending). Resources remain owned; stop users and retry cleanup.`));
            }, this.drainTimeoutMs);
          }),
        ]);
      } finally {
        if (timer) clearTimeout(timer);
      }
    }

    private track<T>(pending: Promise<T>): Promise<T> {
      this.pending.add(pending);
      void pending.then(() => this.pending.delete(pending), () => this.pending.delete(pending));
      return pending;
    }

    private ownBackendOperation<T>(pending: Promise<T>): Promise<T> {
      this.backendOperations.add(pending);
      void pending.then(() => this.backendOperations.delete(pending), () => this.backendOperations.delete(pending));
      return pending;
    }

    private ownAgendaRepository(repository: JobRepository, release: (claim: JobParameters) => Promise<void>,
      claimKey = (claim: JobParameters) => JSON.stringify([String(claim._id), claim.lastModifiedBy]),
      claimEnded = (_error: unknown) => false): JobRepository {
      type Claim = { attrs: JobParameters; tail: Promise<void>; releasing?: Promise<void> };
      const claims = new Map<string, Claim>();
      const sequence = <T>(claim: Claim, work: () => Promise<T>): Promise<T> => {
        const pending = claim.tail.then(work);
        claim.tail = pending.then(() => {}, () => {});
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
        void releasing.then(() => { claim.releasing = undefined; }, () => { claim.releasing = undefined; });
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
                const attrs = { ...args[0] as JobParameters, ...(savingState ? { data: undefined } : {}) };
                const key = claimKey(attrs), claim = claims.get(key);
                if (!claim) {
                  if (!savingState) return Reflect.apply(method, target, args);
                  throw new Error('AgendaQueue claim is no longer owned.');
                }
                const options = { ...args[1] as object, lastModifiedBy: claim.attrs.lastModifiedBy };
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
                args[optionIndex] = { ...args[optionIndex] as object, lastModifiedBy: owner };
                const result = await Reflect.apply(method, target, args) as JobParameters | undefined;
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

    constructor() {
      super();
    }

    /**
     * Looks `sails.config.agendaQueue` to init and fill the jobs collection
     *
     * @author <a target='_' href='https://github.com/shilob'>Shilo Banihit</a>
     * @return
     */
    public override async init() {
      if (this.resourceRegistered && (this.closing || this.startupFailed))
        throw new Error('Finish AgendaQueue cleanup before initialization.');
      this.closing = false;
      this.startupFailed = false;
      this.completionAdmission = true;
      const that = this;
      this.registerSailsHook('on', 'ready', async function () {
        await that.handleReady();
      });
    }

    protected async handleReady() {
      if (this.closing) throw new Error('AgendaQueue is draining; restart before queuing work.');
      if (_.isNil(this.readyInitPromise)) {
        // A partial start keeps every acquired backend owned until cleanup.
        this.readyInitPromise = this.handleReadyInternal().catch(error => {
          this.startupFailed = true;
          if (this.resourceRegistered) void this.drainWorkers().catch(() => {});
          throw error;
        });
      }
      await this.readyInitPromise;
    }

    private async handleReadyInternal() {
      if (process.env.REDBOX_FIGSHARE_ADMIN === 'true') return;
      this.queueInitialized = false;
      const queueConfig = sails.config.agendaQueue;
      const queueOptions = queueConfig.options ?? {};
      this.drainTimeoutMs = queueOptions.drainTimeoutMs ?? 30_000;
      if (!Number.isSafeInteger(this.drainTimeoutMs) || this.drainTimeoutMs <= 0 || this.drainTimeoutMs > 2_147_483_647)
        throw new Error('AgendaQueue options.drainTimeoutMs must be a positive timer interval in milliseconds (maximum 2147483647).');
      const jobs = this.normalizeJobDefinitions(queueConfig.jobs);
      if (!this.resourceRegistered) {
        const app = sails;
        this.application = app;
        const resource = {
          drain: () => this.drainWorkers(),
          close: async () => {
            // stop(false) clears Agenda's processor without disconnecting.
            // Keep backend ownership separately, including
            // backends acquired by a partial start. Borrowed Mongo DBs stay open.
            for (const backend of this.backendResources) {
              await backend.disconnect();
              this.backendResources.delete(backend);
            }
            this.queueInitialized = false;
            this.readyInitPromise = undefined;
            this.resourceRegistered = false;
            this.agendas = {};
            this.agenda = undefined;
            this.jobBackendByName.clear();
            this.workerDrain = undefined;
            this.startedAgendas.clear();
            this.agendaDrains.clear();
            this.agendaStarts.clear();
            this.claimReleases.clear();
            this.application = undefined;
          }
        };
        registerPersistenceResource(app, 'agenda', resource);
        if (!this.shutdownRegistered) {
          const previous = app.config.beforeShutdown;
          // Accepted jobs still need repositories for completion/checkpoint writes.
          // Stop and drain producers before the foundation refuses new operations.
          app.config.beforeShutdown = callback => {
            // One attempt also bounds the later producer/session hooks. A
            // timed-out hook retains its own work; never call Sails back twice
            // if that original hook eventually finishes.
            const shutdown = (async () => {
              await resource.drain();
              await new Promise<void>((resolve, reject) => {
                if (previous) previous(error => error ? reject(error) : resolve());
                else resolve();
              });
            })();
            void this.withDrainDeadline(shutdown).then(() => callback(), callback);
          };
          this.shutdownRegistered = true;
        }
        this.resourceRegistered = true;
      }
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
      const dbManager = requiredBackends.has('mongodb') ? await mongoDatabase(sails, 'mongodb') : undefined;
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
      sails.log.verbose('AgendaQueue:: All jobs defined.');

      const activeAgendas = Object.values(this.agendas).filter((agenda): agenda is Agenda => !_.isNil(agenda));
      if (this.agendas.mongodb) {
        this.registerAgendaEvents(this.agendas.mongodb, 'mongodb');
      }
      if (this.agendas.sqs) {
        this.registerAgendaEvents(this.agendas.sqs, 'sqs');
      }
      // A rejected start must not abandon the other in-flight starts. Those can
      // still create live processors, so cleanup owns them until they settle.
      await Promise.all(activeAgendas.map(agenda => {
        const starting = (async () => {
          await agenda.start();
          this.startedAgendas.add(agenda);
          if (this.closing) await this.drainAgenda(agenda);
        })();
        this.agendaStarts.add(starting);
        void starting.then(() => this.agendaStarts.delete(starting), () => this.agendaStarts.delete(starting));
        return starting;
      }));

      if (this.agendas.mongodb && dbManager) {
        await this.createMongoIndexes(dbManager, queueOptions);
      }

      if (!this.closing) this.runConfiguredStartupSchedules(jobs);
    }

    private hasQueueRuntimeState() {
      return this.queueInitialized || this.jobBackendByName.size > 0 || Object.keys(this.agendas).length > 0;
    }

    private async ensureQueueInitialized() {
      if (!this.hasQueueRuntimeState()) {
        await this.handleReady();
      }
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
        ...jobConfig
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
        const serviceFn = _.get(sails.services, job.fnName) as unknown as AgendaJobHandler | undefined;
        if (_.isUndefined(serviceFn)) {
          sails.log.error(`AgendaQueue:: Job name: ${job.name}'s service function not found: ${job.fnName}`);
          sails.log.error(JSON.stringify(job));
        } else {
          const agenda = ref.getAgendaForBackend(ref.getBackendForJob(job));
          const handler = ref.acceptedJob(serviceFn);
          if (_.isEmpty(job.options)) {
            agenda.define(job.name, handler);
          } else {
            agenda.define(job.name, handler, job.options as Parameters<Agenda['define']>[2]);
          }
          sails.log.verbose(`AgendaQueue:: Defined job:`);
          sails.log.verbose(JSON.stringify(job));
        }
      });
    }

    public defineJob(name: string, options: unknown, serviceFn: AgendaJobHandler) {
      this.accepting();
      const backend = this.jobBackendByName.get(name) ?? this.defaultBackend;
      const agenda = this.agendas[backend] ?? this.agenda;
      if (!agenda) {
        sails.log.error(`AgendaQueue:: defineJob called before init for job: ${name}`);
        return;
      }
      this.jobBackendByName.set(name, backend);
      const handler = this.acceptedJob(serviceFn);
      if (_.isEmpty(options)) {
        agenda.define(name, handler);
      } else {
        agenda.define(name, handler, options as Parameters<Agenda['define']>[2]);
      }
      sails.log.verbose(`AgendaQueue:: Defined job: ${name}`);
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
      const historyRetentionHours = sails.config.agendaQueue.options?.historyRetentionHours ?? 25;
      const historyRetentionMs = historyRetentionHours * 60 * 60 * 1000;
      const dbManager = await mongoDatabase(sails, 'mongodb') as unknown as AgendaQueueMongoManager;
      const collectionName = String(_.get(sails.config.agendaQueue, 'options.collection', 'agendaJobs'));
      const jobsCollection = dbManager.collection(collectionName);
      const historyCollection = dbManager.collection(`${collectionName}History`);
      const finishedFilter = { nextRunAt: null, lockedAt: null, lastFinishedAt: { $type: 'date' } };
      const completedJobs = await jobsCollection.find(finishedFilter).toArray();

      for (const doc of completedJobs) {
        await historyCollection.replaceOne({ _id: (doc as { _id?: unknown })._id }, doc, { upsert: true });
        await jobsCollection.deleteOne({ ...finishedFilter, _id: (doc as { _id?: unknown })._id, lastFinishedAt: doc['lastFinishedAt'] });
      }

      const historyCutoff = new Date(Date.now() - historyRetentionMs);
      await historyCollection.deleteMany({ lastFinishedAt: { $lt: historyCutoff } });

      sails.log.verbose(`moveCompletedJobsToHistory:: Moved completed jobs to history and removed history older than ${historyRetentionHours} hours`);
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
        throw new Error(`AgendaQueue:: Unknown job '${jobName}'. Define it in sails.config.agendaQueue.jobs before queuing it.`);
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
        throw new AgendaQueueUnsupportedFeatureError(`AgendaQueue:: every() is not supported for SQS-backed job '${jobName}'. ${EXTERNAL_SCHEDULER_GUIDANCE}`);
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
        return value.map((item) => this.toSerializableJobData(item, seen));
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

    private async createAgendaForBackend(backendName: AgendaQueueBackend, options: AgendaQueueOptions, dbManager: unknown): Promise<Agenda> {
      const { Agenda: AgendaConstructor } = await import('agenda');
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
      const own = async (backend: AgendaBackend, release = (claim: JobParameters) => backend.repository.unlockJob(claim),
        claimKey?: (claim: JobParameters) => string, claimEnded?: (error: unknown) => boolean): Promise<Agenda> => {
        this.backendResources.add(backend);
        // Agenda's constructor starts connect() without handling rejection. Own
        // and await it first, so partial failures reject startup and remain closable.
        await backend.connect();
        agendaOptions.backend = {
          name: backend.name,
          repository: this.ownAgendaRepository(backend.repository, release, claimKey, claimEnded),
          notificationChannel: backend.notificationChannel,
          logger: backend.logger,
          ownsConnection: false,
          connect: async () => {},
          disconnect: async () => {},
        } satisfies AgendaBackend;
        return new AgendaConstructor(agendaOptions as ConstructorParameters<typeof AgendaConstructor>[0]);
      };

      if (backendName === 'mongodb') {
        const { MongoBackend, MongoJobRepository, ObjectId } = await import('@agendajs/mongo-backend');
        // All queue addresses borrow app-owned transport; history retains
        // its established application-database routing.
        const address = typeof options.db === 'string' && options.db.length > 0 ? options.db : undefined;
        const queueDb = address
          ? await mongoResourceDatabase(sails, 'agenda', { mongoUrl: address })
          : dbManager as Db;
        const backend = new MongoBackend({ mongo: queueDb, collection: options.collection });
        const repository = backend.repository;
        if (!(repository instanceof MongoJobRepository)) throw new Error('Agenda Mongo repository is unavailable.');
        const lostClaim = () => Object.assign(new Error('AgendaQueue Mongo claim is no longer owned.'), { name: 'AgendaClaimLostError' });
        const collection = () => repository.getDb().collection(options.collection || 'agendaJobs');
        const owned = (claim: JobParameters) => ({
          _id: new ObjectId(String(claim._id)), name: claim.name,
          lastModifiedBy: claim.lastModifiedBy, lockedAt: { $type: 'date' },
        });
        // The pinned Agenda state save matches only the job ID/name. Fence it
        // to the same delivery as release, so an expired handler cannot clear a
        // successor's lock or replace its retry state.
        repository.saveJobState = async claim => {
          const result = await collection().updateOne(owned(claim), { $set: {
            lockedAt: claim.lockedAt ? new Date(claim.lockedAt) : null,
            nextRunAt: claim.nextRunAt ? new Date(claim.nextRunAt) : null,
            lastRunAt: claim.lastRunAt ? new Date(claim.lastRunAt) : null,
            progress: claim.progress ?? null, failReason: claim.failReason ?? null,
            failCount: claim.failCount ?? null,
            failedAt: claim.failedAt ? new Date(claim.failedAt) : null,
            lastFinishedAt: claim.lastFinishedAt ? new Date(claim.lastFinishedAt) : null,
            lastModifiedBy: claim.lastModifiedBy,
          } });
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
          for (const field of ['lockedAt', 'lastRunAt', 'lastFinishedAt', 'failedAt', 'failCount', 'failReason', 'progress', 'lastModifiedBy'] as const)
            delete values[field];
          const saved = await collection().findOneAndUpdate(owned(claim), { $set: values }, { returnDocument: 'after' });
          if (!saved) throw lostClaim();
          return { ...claim, nextRunAt: saved.nextRunAt, debounceStartedAt: saved.debounceStartedAt };
        };
        return own(backend, async claim => {
          // The unique delivery owner covers every acknowledged or ambiguous
          // heartbeat without retaining timestamp candidates. An applied final
          // save has no lock and must never be resurrected by release retry.
          await collection().updateOne(owned(claim), [
            { $set: { nextRunAt: { $ifNull: ['$nextRunAt', new Date()] } } },
            { $unset: 'lockedAt' },
          ]);
        }, undefined, error => error instanceof Error && error.name === 'AgendaClaimLostError');
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
        fifo: sqsOptions.queueType === 'fifo'
          ? {
            enabled: true,
            messageGroupId: sqsOptions.fifoMessageGroupId,
            deduplicationIdStrategy: 'job-id'
          }
          : undefined
      });
      const receiptEnded = (error: unknown) => error instanceof Error &&
        (error.name === 'MessageNotInflight' || error.name === 'ReceiptHandleIsInvalid');
      return own(backend, async claim => {
        try {
          await backend.repository.unlockJob(claim);
        } catch (error) {
          // Expired/deleted receipts no longer convey ownership. Retrying them
          // forever would prevent shutdown after the visibility lease ended.
          if (!receiptEnded(error)) throw error;
          this.application?.log.warn('AgendaQueue:: SQS receipt is no longer active; claim release is complete.');
        }
      }, claim => {
        // A redelivery has the same job id but a new receipt. Old final saves
        // and unlocks must never forget or release that newer delivery.
        const metadata = Reflect.get(claim, SQS_METADATA) as import('@researchdatabox/agenda-sqs-backend').SqsRuntimeMetadata | undefined;
        return JSON.stringify([String(claim._id), metadata?.receiptHandle]);
      }, receiptEnded);
    }

    private registerAgendaEvents(agenda: Agenda, backend: AgendaQueueBackend) {
      agenda.on('ready', () => {
        sails.log.verbose(`AgendaQueue:: Started ${backend} backend.`);
      });
      agenda.on('error', (err) => {
        sails.log.error(`AgendaQueue:: ${backend} backend error:`);
        sails.log.error(err instanceof Error ? err.stack ?? err.message : JSON.stringify(err));
      });
      agenda.on('start', (job: Job) => {
        // complete precedes removeOnComplete. Own the entire public remove()
        // promise before cancel() yields on ready and reaches the repository.
        const remove = job.remove.bind(job);
        job.remove = () => this.ownBackendOperation(remove());
        let resolve!: () => void;
        const promise = new Promise<void>(done => { resolve = done; });
        this.jobCompletions.set(job, { promise, resolve });
        sails.log.verbose(`AgendaQueue:: [${backend}] Job ${job.attrs.name} starting`);
      });
      agenda.on('complete', (job: Job) => {
        this.jobCompletions.get(job)?.resolve();
        this.jobCompletions.delete(job);
        sails.log.verbose(`AgendaQueue:: [${backend}] Job ${job.attrs.name} finished`);
      });
      agenda.on('fail', (err, job) => {
        sails.log.error(`AgendaQueue:: [${backend}] Job ${job.attrs.name} failed`);
        sails.log.error(err);
      });
    }

    private async createMongoIndexes(dbManager: { collection: (name: string) => { createIndex: (query: Record<string, number>) => Promise<unknown> } }, options: AgendaQueueOptions) {
      const collectionName = String(options.collection ?? 'agendaJobs');
      await dbManager.collection(collectionName).createIndex({ name: 1, disabled: 1, lockedAt: 1, nextRunAt: 1 });
      await dbManager.collection(collectionName).createIndex({ name: -1, disabled: -1, lockedAt: -1, nextRunAt: -1 });
    }

    private runConfiguredStartupSchedules(jobs: AgendaJobDefinition[]) {
      _.each(jobs, (job: AgendaJobDefinition) => {
        if (_.isEmpty(job.schedule)) {
          return;
        }

        const method = job.schedule?.method;
        const intervalOrSchedule = job.schedule?.intervalOrSchedule;
        const data = job.schedule?.data;
        const opts = job.schedule?.opts;

        if (method === 'now') {
          this.now(job.name, data);
          return;
        }

        if (method === 'every' && intervalOrSchedule) {
          this.every(job.name, intervalOrSchedule, data, opts);
          return;
        }

        if (method === 'schedule' && intervalOrSchedule) {
          this.schedule(job.name, intervalOrSchedule, data);
          return;
        }

        sails.log.error('AgendaQueue:: incorrect job schedule definition, method not found:');
        sails.log.error(JSON.stringify(job));
      });
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
        throw new AgendaQueueUnsupportedFeatureError(`AgendaQueue:: schedule() only supports delays up to 15 minutes for SQS-backed job '${jobName}'.`);
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
        const supportedKeys = ['$in'];
        const nameQueryKeys = Object.keys(structuredNameQuery);
        const hasOnlySupportedKeys = nameQueryKeys.length > 0 && nameQueryKeys.every((key) => supportedKeys.includes(key));
        if (!hasOnlySupportedKeys) {
          throw new AgendaQueueUnsupportedFeatureError('AgendaQueue:: jobs() only supports name queries using an exact string or $in when SQS-backed jobs are configured.');
        }

        const inNames = structuredNameQuery.$in;
        if (!Array.isArray(inNames) || !inNames.every((name: unknown) => _.isString(name))) {
          throw new AgendaQueueUnsupportedFeatureError('AgendaQueue:: jobs() only supports name queries using an exact string or $in when SQS-backed jobs are configured.');
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
      sails.log.info(`AgendaQueue:: sample function called by job: `);
      sails.log.info(JSON.stringify(job));
    }

    public every(jobName: string, interval: string, data: unknown = undefined, options: { timezone?: string; skipImmediate?: boolean; forkMode?: boolean } | undefined = undefined) {
      this.accepting();
      this.ensureRecurringScheduleSupported(jobName);
      void this.track(this.getAgendaForJobName(jobName).every(interval, jobName, this.toSerializableJobData(data), options)).catch(() => {
        sails.log.error('AgendaQueue:: Failed to persist recurring schedule.');
      });
    }

    public schedule(jobName: string, schedule: string, data: unknown = undefined) {
      this.accepting(true);
      this.ensureScheduleSupported(jobName, schedule, data);
      return this.track(this.getAgendaForJobName(jobName).schedule(schedule, jobName, this.toSerializableJobData(data)));
    }

    public async now(jobName: string, data: unknown = undefined) {
      this.accepting(true);
      if (!this.hasQueueRuntimeState()) {
        await this.handleReady();
      }
      this.accepting(true);
      sails.log.verbose(`AgendaQueue:: Starting job: '${jobName}' now!`)
      const queuedJob = this.track(this.getAgendaForJobName(jobName).now(jobName, this.toSerializableJobData(data)));
      queuedJob.catch((e) => {
        sails.log.error(`AgendaQueue:: Failed to start job now: ${jobName}`);
        sails.log.error(e);
      });
      return await queuedJob;
    }

    public async jobs(query?: LegacyAgendaJobsQuery): Promise<JobsResult> {
      this.accepting();
      if (_.isNil(this.agendas.mongodb)) {
        throw new AgendaQueueUnsupportedFeatureError('AgendaQueue:: jobs() is only supported when a MongoDB-backed agenda is configured.');
      }
      if (this.queryTargetsSqsJobs(query)) {
        throw new AgendaQueueUnsupportedFeatureError('AgendaQueue:: jobs() is not supported for SQS-backed jobs.');
      }
      return await this.track(this.agendas.mongodb.queryJobs(this.toJobsQueryOptions(query)));
    }
  }
}

declare global {
  let AgendaQueueService: Services.AgendaQueue;
}
