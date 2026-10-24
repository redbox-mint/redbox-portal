import { Observable, firstValueFrom, defer } from 'rxjs';
import type { ILogger } from '@researchdatabox/sails-ng-common';
import type { ProgressRepositories } from '../persistence/progress/ProgressRepositories';
export interface WorkspaceAsyncInput {
  readonly repository: ProgressRepositories['workspaces'];
  readonly log: ILogger;
  resolveOperation(name: string): (args: unknown) => Observable<unknown>;
  runWork<T>(operation: () => Promise<T>): Promise<T>;
}
import type { WorkspaceStatus } from '../persistence/progress/ProgressRepositories';

import { DateTime } from 'luxon';

type WorkspaceAsyncStartInput = {
  name: string;
  recordType: string;
  username: string;
  service: string;
  method: string;
  args?: unknown;
};

export namespace Services {
  /**
   * WorkspaceAsync Service
   *
   * @author <a target='_' href='https://github.com/moisbo'>moisbo</a>
   */
  export class WorkspaceAsyncService {
    constructor(protected readonly input: WorkspaceAsyncInput) {}
    protected getObservable<T>(operation: () => Promise<T>): Observable<T> {
      let pending: Promise<T> | undefined;
      return defer(() => (pending ??= Promise.resolve().then(operation)));
    }
    public init(): Promise<void> {
      return Promise.resolve();
    }
    public initialize(): Promise<void> {
      return this.init();
    }
    public quiesce(): void {
      this.draining = true;
    }
    public close(): Promise<void> {
      return this.drain();
    }
    protected _exportedMethods: string[] = ['start', 'update', 'pending', 'loop', 'status', 'drain', 'init'];

    public start({ name, recordType, username, service, method, args }: WorkspaceAsyncStartInput) {
      return this.getObservable(() =>
        this.input.repository.registerWork({
          name: name,
          started_by: username,
          recordType: recordType,
          service: service,
          method: method,
          args: args ?? [],
          status: 'started',
        })
      );
    }

    public update(id: string, obj: Record<string, unknown>) {
      if (obj.status === 'finished') {
        obj.date_completed = DateTime.local().toFormat('yyyy-LL-dd HH:mm:ss');
      }
      return this.getObservable(() => this.input.repository.reviseStatus(id, obj));
    }

    public pending(): Observable<WorkspaceStatus[]> {
      return this.getObservable(() => this.input.repository.listStatus('pending'));
    }

    private draining = false;
    private readonly running = new Set<Promise<void>>();

    /** Stop producers and await this before persistence cleanup so result writes can finish. */
    public async drain(): Promise<void> {
      this.quiesce();
      while (this.running.size) await Promise.allSettled([...this.running]);
    }

    loop(): Promise<void> {
      if (this.draining) return Promise.resolve();
      const operation = this.input.runWork(() => this.runPending());
      this.running.add(operation);
      void operation.then(
        () => this.running.delete(operation),
        () => this.running.delete(operation)
      );
      return operation;
    }

    private async runPending(): Promise<void> {
      this.input.log.verbose('::::LOOP PENDING STATE::::::');
      try {
        const pending = await firstValueFrom(this.pending());
        const jobs = await Promise.allSettled(
          pending.map(
            wa =>
              new Promise<void>((resolve, reject) => {
                const updates: Promise<unknown>[] = [];
                const update = (values: Record<string, unknown>): void => {
                  const write = firstValueFrom(this.update(wa.id, values));
                  // Own rejections immediately, even while the job keeps emitting.
                  void write.catch(() => {});
                  updates.push(write);
                };
                const finish = (): void => {
                  void Promise.allSettled(updates).then(results => {
                    const failure = results.find(result => result.status === 'rejected');
                    if (failure?.status === 'rejected') reject(failure.reason);
                    else resolve();
                  });
                };
                this.input
                  .resolveOperation(wa.service + '.' + wa.method)(wa.args || null)
                  .subscribe({
                    next: message => {
                      update({ status: 'finished', message });
                    },
                    error: error => {
                      // Waterline serialized Error JSON to its enumerable properties; retain that stored shape.
                      const message: unknown = error instanceof Error ? JSON.parse(JSON.stringify(error)) : error;
                      update({ status: 'error', message });
                      finish();
                    },
                    complete: () => {
                      finish();
                    },
                  });
              })
          )
        );
        if (jobs.some(job => job.status === 'rejected'))
          this.input.log.error('Workspace async processing failed. Review worker status and persistence availability.');
      } catch {
        this.input.log.error('Workspace async processing failed. Review worker status and persistence availability.');
      }
    }

    status({ status, recordType }: { status: string; recordType: string }) {
      return this.getObservable(() => this.input.repository.listStatus(status, recordType));
    }
  }
}
