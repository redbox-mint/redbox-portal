// Test-only coordination for the one-shot Mongo Agenda indexing fixture.
import { performance } from 'node:perf_hooks';

export async function beforeSolrFixtureDeadline<T>(deadline: number, label: string, action: () => Promise<T>): Promise<T> {
  const remaining = deadline - performance.now();
  if (remaining <= 0) throw new Error(`${label}: deadline exceeded`);
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      Promise.resolve().then(action),
      new Promise<never>((_resolve, reject) => {
        timer = setTimeout(() => reject(new Error(`${label}: deadline exceeded`)), remaining);
      })
    ]);
  } finally {
    clearTimeout(timer);
  }
}

export function solrFixtureQueueSettings(config: any, userDatastore: any, mongoDatastore: any) {
  const options = config.agendaQueue?.options ?? {};
  const name = config.solr.createOrUpdateJobName;
  const jobs = config.agendaQueue?.jobs;
  const definition = Array.isArray(jobs) ? jobs.find(job => job.name === name) : jobs?.[name];
  const backend = definition?.backend ?? options.backend ?? 'mongodb';
  const unsupported = (reason: string): never => { throw new Error(`Solr indexing fixture unsupported: ${reason}`); };
  if (config.queue?.serviceName?.toLowerCase() !== 'agendaqueueservice') unsupported('requires AgendaQueueService, not inline or a custom queue');
  if (!definition || definition.fnName?.toLowerCase() !== 'solrsearchservice.solraddorupdate' || definition.schedule) {
    unsupported('requires the configured one-shot solrAddOrUpdate job');
  }
  if ((options.backend ?? 'mongodb') !== 'mongodb') unsupported('dynamic fixture definitions require the MongoDB default backend');
  if (backend !== 'mongodb') unsupported(`job backend '${backend}' has no supported atomic cancellation/completion observation (including SQS)`);
  // Agenda creates its own connection for options.db; the history sweep still uses
  // User's manager. Do not silently observe/cancel jobs in the wrong database.
  if (options.db || userDatastore !== mongoDatastore || typeof userDatastore?.manager?.collection !== 'function') {
    unsupported('requires the shared User/mongodb datastore with no agendaQueue.options.db override');
  }
  return { collectionName: options.collection || 'agendaJobs' };
}

/**
 * This wrapper must be the ONLY definition of a fresh random job name, installed
 * before submission. Agenda scans/notifications only process defined names, so
 * other portal workers cannot claim it. Keep the closed definition installed
 * until Sails lowers: a claim may enter this function arbitrarily late.
 *
 * Mongo completion/disable/cancel and Agenda's watchdog do not join handlers.
 * Closing admission and joining these promises does, including older overlapping
 * attempts hidden by a newer completion. No lock timestamps enter that proof.
 */
export class SolrIndexFixtureLifecycle {
  private closed = false;
  private active = new Set<Promise<unknown>>();
  admittedCount = 0;

  constructor(private jobs: any, private history: any, private query: Record<string, unknown>,
    private label: string, private indexFixture: (job: any) => Promise<unknown>) {}

  // Arrow property preserves this when Agenda stores the handler directly.
  readonly handler = (job: any): Promise<unknown> => {
    const data = job.attrs.data;
    if (job.attrs.name !== this.query.name || data?.id !== this.query['data.id']
      || data?.metaMetadata?.searchCore !== this.query['data.metaMetadata.searchCore']) {
      return Promise.reject(new Error(`${this.label}: unexpected fixture job`));
    }
    if (this.closed) return Promise.resolve();
    // Register synchronously, before invoking even a synchronously throwing
    // handler. closeAdmission() cannot miss an admitted invocation.
    const pending = Promise.resolve().then(() => this.indexFixture(job));
    this.active.add(pending);
    this.admittedCount++;
    void pending.then(() => this.active.delete(pending), () => this.active.delete(pending));
    return pending;
  };

  closeAdmission() { this.closed = true; }

  async observe(deadline: number) {
    return beforeSolrFixtureDeadline<any>(deadline, `${this.label}: observe job`, async () =>
      await this.jobs.findOne(this.query, { readPreference: 'primary' })
        || await this.history.findOne(this.query, { readPreference: 'primary' }));
  }

  async cleanup(submission: Promise<boolean>, deadline: number, deleteFixture: () => Promise<unknown>) {
    // Before ANY await, including a pending submission. A late insertion/claim
    // can then only reach the closed wrapper, never write to Solr.
    this.closeAdmission();
    try {
      const acknowledged = await beforeSolrFixtureDeadline(deadline, 'waiting for submission', () => submission);
      if (acknowledged !== true) throw new Error('submission was not acknowledged');
      const disabled: any = await beforeSolrFixtureDeadline(deadline, 'disable fixture job', () =>
        this.jobs.updateOne(this.query, { $set: { disabled: true } }));
      if (!disabled.acknowledged) throw new Error('job disable was not acknowledged');
      // No new invocation can enter active after closing. Rejections still flow
      // to Agenda; cleanup must also remove a partially written failed fixture.
      await beforeSolrFixtureDeadline(deadline, 'join admitted handlers; Solr fixture retained', () =>
        Promise.allSettled([...this.active]));
      await beforeSolrFixtureDeadline(deadline, 'final Solr deletion', deleteFixture);
    } catch (error) {
      throw new Error(`${this.label}: cleanup failed; ${error instanceof Error ? error.message : String(error)}`, { cause: error });
    }
  }
}
