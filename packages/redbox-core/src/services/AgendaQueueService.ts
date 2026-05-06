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
import type { AgendaJobDefinition, AgendaQueueBackend, AgendaQueueOptions } from '../config/agendaQueue.config';

import { Agenda, type Job, UnsupportedFeatureError } from '@researchdatabox/agenda';

type AgendaJobHandler = (job: Job) => Promise<void>;
type AgendaMap = Partial<Record<AgendaQueueBackend, Agenda>>;



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
      const that = this;
      this.registerSailsHook('on', 'ready', async function () {
        await that.handleReady();
      });
    }

    protected async handleReady() {
      const queueConfig = sails.config.agendaQueue;
      const queueOptions = queueConfig.options ?? {};
      const jobs = queueConfig.jobs;
      const dbManager = User.getDatastore().manager;
      this.defaultBackend = this.getDefaultBackend(queueOptions);
      this.jobBackendByName = new Map(
        jobs.map((job: AgendaJobDefinition) => [job.name, this.getBackendForJob(job)])
      );

      const requiredBackends = new Set(this.jobBackendByName.values());
      this.agendas = {};

      if (requiredBackends.has('mongodb')) {
        this.agendas.mongodb = this.createAgendaForBackend('mongodb', queueOptions, dbManager);
      }
      if (requiredBackends.has('sqs')) {
        this.agendas.sqs = this.createAgendaForBackend('sqs', queueOptions, dbManager);
      }

      this.agenda = this.agendas.mongodb ?? this.agendas[this.defaultBackend] ?? this.agendas.sqs;
      this.defineJobs(jobs, this);
      sails.log.verbose('AgendaQueue:: All jobs defined.');

      const activeAgendas = Object.values(this.agendas).filter((agenda): agenda is Agenda => !_.isNil(agenda));
      _.each(activeAgendas, (agenda) => this.registerAgendaEvents(agenda));
      await Promise.all(activeAgendas.map((agenda) => agenda.start()));

      if (this.agendas.mongodb) {
        await this.createMongoIndexes(dbManager, queueOptions);
      }

      this.runConfiguredStartupSchedules(jobs);
    }

    /*
     define the jobs... structure is:
     [
      {
         name: "jobName",
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
     ]
     */
    public defineJobs(jobs: AgendaJobDefinition[], ref: AgendaQueue = this): void {
      _.each(jobs, (job: AgendaJobDefinition) => {
        const serviceFn = _.get(sails.services, job.fnName) as unknown as AgendaJobHandler | undefined;
        if (_.isUndefined(serviceFn)) {
          sails.log.error(`AgendaQueue:: Job name: ${job.name}'s service function not found: ${job.fnName}`);
          sails.log.error(JSON.stringify(job));
        } else {
          const agenda = ref.getAgendaForBackend(ref.getBackendForJob(job));
          if (_.isEmpty(job.options)) {
            agenda.define(job.name, serviceFn as (job: Job) => Promise<void>);
          } else {
            agenda.define(job.name, serviceFn as (job: Job) => Promise<void>, job.options as Parameters<Agenda['define']>[2]);
          }
          sails.log.verbose(`AgendaQueue:: Defined job:`);
          sails.log.verbose(JSON.stringify(job));
        }
      });
    }

    public defineJob(name: string, options: unknown, serviceFn: AgendaJobHandler) {
      const backend = this.jobBackendByName.get(name) ?? this.defaultBackend;
      const agenda = this.agendas[backend] ?? this.agenda;
      if (!agenda) {
        sails.log.error(`AgendaQueue:: defineJob called before init for job: ${name}`);
        return;
      }
      this.jobBackendByName.set(name, backend);
      if (_.isEmpty(options)) {
        agenda.define(name, serviceFn as (job: Job) => Promise<void>);
      } else {
        agenda.define(name, serviceFn as (job: Job) => Promise<void>, options as Parameters<Agenda['define']>[2]);
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
      const dbManager = User.getDatastore().manager;
      const collectionName = String(_.get(sails.config.agendaQueue, 'options.collection', 'agendaJobs'));
      await dbManager.collection(collectionName).find({ nextRunAt: null }).forEach(async (doc: Record<string, unknown>) => {
        await dbManager.collection(`${collectionName}History`).insertOne(doc);
        await dbManager.collection(collectionName).deleteOne({ _id: (doc as { _id?: unknown })._id });
      });

      sails.log.verbose(`moveCompletedJobsToHistory:: Moved completed jobs to history`);
    }


    private setOptionIfDefined(agendaOpts: Record<string, unknown>, optionName: string, optionVal: unknown) {
      if (!_.isEmpty(optionVal)) {
        _.set(agendaOpts, optionName, optionVal);
      }
    }

    private getDefaultBackend(options: AgendaQueueOptions): AgendaQueueBackend {
      return options.backend ?? 'mongodb';
    }

    private getBackendForJob(job: Pick<AgendaJobDefinition, 'backend'>): AgendaQueueBackend {
      return job.backend ?? this.defaultBackend;
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
        throw new UnsupportedFeatureError(`AgendaQueue:: every() is not supported for SQS-backed job '${jobName}'. ${EXTERNAL_SCHEDULER_GUIDANCE}`);
      }
    }

    private createAgendaForBackend(backend: AgendaQueueBackend, options: AgendaQueueOptions, dbManager: unknown): Agenda {
      const agendaOpts: Record<string, unknown> = {};
      this.setOptionIfDefined(agendaOpts, 'backend', backend);
      this.setOptionIfDefined(agendaOpts, 'defaultLockLifetime', options.defaultLockLifetime);
      this.setOptionIfDefined(agendaOpts, 'processEvery', options.processEvery);

      if (backend === 'mongodb') {
        if (_.isEmpty(options.db)) {
          agendaOpts['mongo'] = dbManager;
        } else {
          this.setOptionIfDefined(agendaOpts, 'db.address', options.db);
        }
        this.setOptionIfDefined(agendaOpts, 'db.collection', options.collection);
      } else {
        if (_.isEmpty(options.sqs?.queueUrl) || _.isEmpty(options.sqs?.region)) {
          throw new Error('AgendaQueue:: SQS backend requires agendaQueue.options.sqs.queueUrl and agendaQueue.options.sqs.region.');
        }
        this.setOptionIfDefined(agendaOpts, 'sqs', options.sqs);
      }

      return new Agenda(agendaOpts as ConstructorParameters<typeof Agenda>[0]);
    }

    private registerAgendaEvents(agenda: Agenda) {
      const backend = agenda.attrs.backend;
      agenda.on('ready', () => {
        sails.log.verbose(`AgendaQueue:: Started ${backend} backend.`);
      });
      agenda.on('error', (err) => {
        sails.log.error(`AgendaQueue:: ${backend} backend error:`);
        sails.log.error(JSON.stringify(err));
      });
      agenda.on('start', (job: Job) => {
        sails.log.verbose(`AgendaQueue:: [${backend}] Job ${job.attrs.name} starting`);
      });
      agenda.on('complete', (job: Job) => {
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
        throw new UnsupportedFeatureError(`AgendaQueue:: schedule() only supports delays up to 15 minutes for SQS-backed job '${jobName}'.`);
      }
    }

    private queryTargetsSqsJobs(query: Parameters<Agenda['jobs']>[0]): boolean {
      if (_.isNil(query) || _.isNil((query as { name?: unknown }).name)) {
        return false;
      }

      const nameQuery = (query as { name?: unknown }).name;
      if (_.isString(nameQuery)) {
        return this.jobBackendByName.get(nameQuery) === 'sqs';
      }

      const inNames = (nameQuery as { $in?: unknown }).$in;
      if (Array.isArray(inNames)) {
        return inNames.some((name: unknown) => _.isString(name) && this.jobBackendByName.get(name) === 'sqs');
      }

      return false;
    }

    public async sampleFunctionToDemonstrateHowToDefineAJobFunction(job: unknown) {
      sails.log.info(`AgendaQueue:: sample function called by job: `);
      sails.log.info(JSON.stringify(job));
    }

    public every(jobName: string, interval: string, data: unknown = undefined, options: { timezone?: string; skipImmediate?: boolean; forkMode?: boolean } | undefined = undefined) {
      this.ensureRecurringScheduleSupported(jobName);
      void this.getAgendaForJobName(jobName).every(interval, jobName, data, options);
    }

    public schedule(jobName: string, schedule: string, data: unknown = undefined) {
      this.ensureScheduleSupported(jobName, schedule, data);
      void this.getAgendaForJobName(jobName).schedule(schedule, jobName, data);
    }

    public now(jobName: string, data: unknown = undefined) {
      sails.log.verbose(`AgendaQueue:: Starting job: '${jobName}' now!`)
      void this.getAgendaForJobName(jobName).now(jobName, data).catch((e) => {
        sails.log.error(`AgendaQueue:: Failed to start job now: ${jobName}`);
        sails.log.error(e);
      });
    }

    public async jobs(...args: Parameters<Agenda['jobs']>) {
      if (_.isNil(this.agendas.mongodb)) {
        throw new UnsupportedFeatureError('AgendaQueue:: jobs() is only supported when a MongoDB-backed agenda is configured.');
      }
      if (this.queryTargetsSqsJobs(args[0])) {
        throw new UnsupportedFeatureError('AgendaQueue:: jobs() is not supported for SQS-backed jobs.');
      }
      return await this.agendas.mongodb.jobs(...args);
    }
  }
}

declare global {
  let AgendaQueueService: Services.AgendaQueue;
}
