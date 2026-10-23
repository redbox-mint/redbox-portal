import * as _ from 'lodash';
import { AgendaQueue } from '../../queues/AgendaQueue';
import { registerPersistenceResource } from '../../persistence/runtime';
import { drainHttpRequests, hasActiveHttpRequest } from '../../middleware/requestLifetime';
import type { AgendaJobDefinition, AgendaQueueOptions } from '../../config/agendaQueue.config';
import type { Db } from '@agendajs/mongo-backend';
import { Services } from '../../CoreService';

/** Deferred global access allows legacy shim generation before Sails exists. */
export class LegacyAgendaQueue extends AgendaQueue {
  protected _exportedMethods = [
    'every',
    'schedule',
    'now',
    'jobs',
    'sampleFunctionToDemonstrateHowToDefineAJobFunction',
    'defineJob',
    'moveCompletedJobsToHistory',
    'init',
  ];
  public convertToType = Services.Core.Service.prototype.convertToType;
  private shutdownRegistered = false;
  public constructor() {
    let selected: Sails.Application | undefined;
    const app = () => (selected ??= sails);
    super({
      get owner() {
        return app();
      },
      get config() {
        return app().config.agendaQueue;
      },
      get log() {
        return app().log;
      },
      handler: name => {
        const handler: unknown = _.get(app().services, name);
        return typeof handler === 'function'
          ? async job => {
              await handler(job);
            }
          : undefined;
      },
      hasAcceptedRequest: () => hasActiveHttpRequest(app()),
      drainRequests: () => drainHttpRequests(app()),
    });
  }
  public exports(): Record<string, unknown> {
    return Object.fromEntries(
      [...this._exportedMethods, 'convertToType'].map(name => {
        const member: unknown = Reflect.get(this, name);
        return [name, typeof member === 'function' ? member.bind(this) : member];
      })
    );
  }
  public async init(): Promise<void> {
    if (this.closing || this.startupFailed) throw new Error('Finish AgendaQueue cleanup before initialization.');
    if (typeof sails !== 'undefined' && typeof sails.on === 'function') sails.on('ready', () => this.handleReady());
  }
  protected override normalAdmission(): void {}
  public override every(...args: Parameters<AgendaQueue['every']>): void {
    try {
      return super.every(...args);
    } catch (error) {
      if (error instanceof Error && error.message.includes('Define it in agendaQueue.jobs'))
        error.message = error.message.replace(
          'Define it in agendaQueue.jobs',
          'Define it in sails.config.agendaQueue.jobs'
        );
      throw error;
    }
  }
  protected override async handleReady(): Promise<void> {
    if (process.env.REDBOX_FIGSHARE_ADMIN === 'true') return;
    await super.handleReady();
    if (!this.closing) await this.activate();
  }
  protected override registerOwnership(): void {
    const app = sails;
    registerPersistenceResource(app, 'agenda', { drain: () => this.drain(), close: () => this.close() });
    if (this.shutdownRegistered) return;
    const previous = app.config.beforeShutdown;
    app.config.beforeShutdown = callback => {
      const shutdown = (async () => {
        await this.drain();
        await new Promise<void>((resolve, reject) =>
          previous ? previous(error => (error ? reject(error) : resolve())) : resolve()
        );
      })();
      void this.withDrainDeadline(shutdown).then(() => callback(), callback);
    };
    this.shutdownRegistered = true;
  }
  protected override missingHandler(job: AgendaJobDefinition): void {
    sails.log.error(`AgendaQueue:: Job name: ${job.name}'s service function not found: ${job.fnName}`);
  }
  protected override async prepareBackends(db: Db | undefined, options: AgendaQueueOptions): Promise<void> {
    await this.startProcessors();
    if (this.agendas.mongodb && db) await this.createMongoIndexes(db, options);
  }
  protected override async createMongoBackend(db: Db, options: AgendaQueueOptions) {
    const { MongoBackend } = await import('@agendajs/mongo-backend');
    return new MongoBackend({ mongo: db, collection: options.collection });
  }
  protected override async createMongoIndexes(db: Db, options: AgendaQueueOptions): Promise<void> {
    const collection = db.collection(options.collection ?? 'agendaJobs');
    await collection.createIndex({ name: 1, disabled: 1, lockedAt: 1, nextRunAt: 1 });
    await collection.createIndex({ name: -1, disabled: -1, lockedAt: -1, nextRunAt: -1 });
  }
}
