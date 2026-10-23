import { Job } from 'node-schedule';

export interface ScheduledOperation {
  readonly name: string;
  readonly interval: string;
  run(): Promise<void>;
}

/** Own node-schedule timers and their actual callbacks, separately from transports. */
export class ScheduledWork {
  private readonly operations: readonly ScheduledOperation[];
  private readonly timers = new Set<Job>();
  private readonly pending = new Set<Promise<void>>();
  private active = false;
  private stopping = false;
  public constructor(
    operations: readonly ScheduledOperation[],
    private readonly log: { warn(message: string): void }
  ) {
    const names = new Set<string>();
    this.operations = operations.map(operation => {
      if (!operation.name || names.has(operation.name)) throw new Error('Scheduled operations require unique names.');
      names.add(operation.name);
      return { ...operation, run: operation.run.bind(operation) };
    });
  }
  public async initialize(): Promise<void> {}
  public async activate(): Promise<void> {
    if (this.stopping) throw new Error('Schedules are stopping.');
    if (this.active) return;
    this.active = true;
    for (const operation of this.operations) {
      const timer = new Job(() => {
        if (!this.active) return;
        const pending = Promise.resolve().then(() => operation.run());
        this.pending.add(pending);
        void pending.then(
          () => this.pending.delete(pending),
          () => {
            this.pending.delete(pending);
            this.log.warn('Scheduled operation failed.');
          }
        );
      });
      this.timers.add(timer);
      if (!timer.schedule(operation.interval)) throw new Error('Scheduled operation has an invalid interval.');
    }
  }
  public quiesce(): void {
    this.active = false;
    this.stopping = true;
    for (const timer of this.timers) timer.cancel();
    this.timers.clear();
  }
  public async drain(): Promise<void> {
    this.quiesce();
    await Promise.allSettled(this.pending);
  }
  public async close(): Promise<void> {
    await this.drain();
  }
}
