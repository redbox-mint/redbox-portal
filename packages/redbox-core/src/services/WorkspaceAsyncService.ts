import { Observable, firstValueFrom } from 'rxjs';
import { Services as services } from '../CoreService';
import type { WorkspaceStatus } from '../persistence/progress/ProgressRepositories';
import { getProgressRepositories } from '../persistence/runtime';

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
  export class WorkspaceAsyncService extends services.Core.Service {
    protected override _exportedMethods: string[] = ['start', 'update', 'pending', 'loop', 'status', 'drain', 'init'];

    /*
    Example call:
    sails.services.workspaceasyncservice.start(
      {
        name:'test', recordType: 'gitlab',
        username: 'admin',
        service: 'gitlabcontroller',
        method: 'checkrepo',
        args: ['fieldToCheck:https://git-test.research.uts.edu.au/135553/my-project-06']
      }
    ).subscribe(response=>{console.log('started')})
    */
    public start({ name, recordType, username, service, method, args }: WorkspaceAsyncStartInput) {
      return super.getObservable(() =>
        getProgressRepositories().workspaces.registerWork({
          name: name,
          started_by: username,
          recordType: recordType,
          service: service,
          method: method,
          args: args,
          status: 'started',
        })
      );
    }

    public update(id: string, obj: Record<string, unknown>) {
      if (obj.status === 'finished') {
        obj.date_completed = DateTime.local().toFormat('yyyy-LL-dd HH:mm:ss');
      }
      return super.getObservable(() => getProgressRepositories().workspaces.reviseStatus(id, obj));
    }

    public pending(): Observable<WorkspaceStatus[]> {
      return super.getObservable(() => getProgressRepositories().workspaces.listStatus('pending'));
    }

    private draining = false;
    private readonly running = new Set<Promise<void>>();

    private shutdownRegistered = false;

    public async init(): Promise<void> {
      if (this.shutdownRegistered) return;
      this.shutdownRegistered = true;
      const previous = sails.config.beforeShutdown;
      sails.config.beforeShutdown = callback => {
        void this.drain().then(() => {
          try {
            if (previous) previous(callback);
            else callback();
          } catch (error) {
            callback(error);
          }
        }, callback);
      };
    }

    /** Stop producers and await this before persistence cleanup so result writes can finish. */
    public async drain(): Promise<void> {
      this.draining = true;
      await Promise.allSettled(this.running);
    }

    loop(): void {
      if (this.draining) return;
      const operation = this.runPending();
      this.running.add(operation);
      void operation.finally(() => this.running.delete(operation));
    }

    private async runPending(): Promise<void> {
      sails.log.verbose('::::LOOP PENDING STATE::::::');
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
                (sails.services[wa.service][wa.method](wa.args || null) as Observable<unknown>).subscribe({
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
          sails.log.error('Workspace async processing failed. Review worker status and persistence availability.');
      } catch {
        sails.log.error('Workspace async processing failed. Review worker status and persistence availability.');
      }
    }

    status({ status, recordType }: { status: string; recordType: string }) {
      return super.getObservable(() => getProgressRepositories().workspaces.listStatus(status, recordType));
    }
  }
}

declare global {
  let WorkspaceAsyncService: Services.WorkspaceAsyncService;
}
