/** A rejected SDK call may still execute remotely. Only fully acknowledged I/O proves quiescence. */
export class OniWriter {
  private pending = new Set<Promise<unknown>>();
  private failed = false;
  private finished = false;
  track<T>(run: () => Promise<T>): Promise<T> {
    if (this.finished) return Promise.reject(new Error('Oni writer is closed'));
    const task = Promise.resolve().then(run);
    this.pending.add(task);
    task.then(
      () => this.pending.delete(task),
      () => {
        this.failed = true;
        this.pending.delete(task);
      }
    );
    return task;
  }
  async settle(): Promise<boolean> {
    // OCFL 0.4 uses Promise.all for root inventory/sidecar replacement. A rejected
    // sibling must not leave another disk mutation running after ownership release.
    while (this.pending.size) await Promise.allSettled([...this.pending]);
    this.finished = true;
    return !this.failed;
  }
}
