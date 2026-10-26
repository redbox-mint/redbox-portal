import { PersistenceError } from '../../persistence/errors';

/** Own complete accepted work through remote I/O and its final durable checkpoint. */
export class FigshareWorkers {
  private draining = false;
  private readonly active = new Set<Promise<unknown>>();
  constructor(private readonly runWork: <T>(operation: () => Promise<T>) => Promise<T>) {}

  work<T>(operation: () => Promise<T>): Promise<T> {
    if (this.draining) return Promise.reject(new PersistenceError('lifecycle', 'Figshare workers are draining.'));
    let pending: Promise<T>;
    try {
      pending = this.runWork(operation);
    } catch (error) {
      return Promise.reject(error);
    }
    this.active.add(pending);
    void pending.then(
      () => this.active.delete(pending),
      () => this.active.delete(pending)
    );
    return pending;
  }
  quiesce(): void {
    this.draining = true;
  }
  async drain(): Promise<void> {
    this.quiesce();
    while (this.active.size) await Promise.allSettled([...this.active]);
  }
  close(): Promise<void> {
    return this.drain();
  }
}
