import { Observable } from 'rxjs';
import { Services as services } from '../CoreService';
import type { WorkspaceAsyncAttributes } from '../waterline-models/WorkspaceAsync';

import { DateTime } from 'luxon';
import { asScopeKey, type AuthorizationContext, type ScopeKey } from '../authorization';
import { Services as AuthorizationServiceModule } from './AuthorizationService';

type WorkspaceAsyncStartInput = {
  name: string;
  recordType: string;
  username: string;
  service: string;
  method: string;
  args?: unknown;
  actorId?: string;
  operationId: string;
  branding?: string;
  requiredScope: ScopeKey;
};

export namespace Services {
  /**
   * WorkspaceAsync Service
   *
   * @author <a target='_' href='https://github.com/moisbo'>moisbo</a>
   */
  export class WorkspaceAsyncService extends services.Core.Service {
    protected override _exportedMethods: string[] = ['start', 'update', 'pending', 'loop', 'status'];

    private isAllowedOperation(service: string, method: string): boolean {
      const allowedOperations = _.get(sails.config, 'workspaceAsync.allowedOperations', []) as unknown;
      return Array.isArray(allowedOperations) && allowedOperations.includes(`${service}.${method}`);
    }

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
    public start({
      name,
      recordType,
      username,
      service,
      method,
      args,
      actorId,
      operationId,
      branding,
      requiredScope,
    }: WorkspaceAsyncStartInput) {
      if (!this.isAllowedOperation(service, method)) {
        throw new Error('Workspace async operation is not allowlisted.');
      }
      if (!actorId || !branding || !operationId || !requiredScope) {
        throw new Error('Workspace async authorization context is incomplete.');
      }
      return super.getObservable(
        WorkspaceAsync.create({
          name: name,
          started_by: username,
          recordType: recordType,
          service: service,
          method: method,
          args: args,
          status: 'started',
          actorId,
          operationId,
          branding,
          requiredScope,
        })
      );
    }

    public update(id: string, obj: Record<string, unknown>) {
      const update = { ...obj };
      for (const field of ['actorId', 'operationId', 'branding', 'requiredScope', 'service', 'method']) {
        delete update[field];
      }
      if (update.status === 'finished') {
        update.date_completed = DateTime.local().toFormat('yyyy-LL-dd HH:mm:ss');
      }
      return super.getObservable(WorkspaceAsync.update({ id: id }, update));
    }

    public pending(): Observable<WorkspaceAsyncAttributes[]> {
      return super.getObservable(WorkspaceAsync.find({ status: 'pending' }).sort('id ASC').limit(100));
    }

    private async executePending(wa: WorkspaceAsyncAttributes): Promise<void> {
      if (!wa.actorId || !wa.operationId || !wa.branding || !wa.requiredScope) {
        await this.update(wa.id, { status: 'error', message: { code: 'authorization-context-missing' } }).toPromise();
        return;
      }
      if (!this.isAllowedOperation(wa.service, wa.method)) {
        await this.update(wa.id, { status: 'error', message: { code: 'operation-not-allowlisted' } }).toPromise();
        return;
      }
      const authorizationService = sails.services.authorizationservice as unknown as {
        resolveUserContext(userId: string, brandId: string, authMethod: 'session'): Promise<AuthorizationContext>;
        authorizeAction(context: AuthorizationContext, requiredScope: ScopeKey): { allowed: boolean };
      };
      const requiredScope = asScopeKey(wa.requiredScope);
      const [userContext, processContext] = await Promise.all([
        authorizationService.resolveUserContext(wa.actorId, wa.branding, 'session'),
        new AuthorizationServiceModule.AuthorizationService().createSystemProcessContext(
          `workspace-async:${wa.operationId}`,
          wa.branding,
          [requiredScope]
        ),
      ]);
      if (
        !authorizationService.authorizeAction(userContext, requiredScope).allowed ||
        !authorizationService.authorizeAction(processContext, requiredScope).allowed
      ) {
        await this.update(wa.id, { status: 'error', message: { code: 'authorization-revoked' } }).toPromise();
        return;
      }
      const target = sails.services[wa.service];
      const method = target?.[wa.method];
      if (typeof method !== 'function') throw new Error('Workspace async target is unavailable.');
      const result = method.call(target, {
        args: wa.args ?? null,
        authorization: userContext,
        operationId: wa.operationId,
        process: processContext.principal,
      });
      if (!result || typeof (result as Observable<unknown>).subscribe !== 'function') {
        throw new Error('Workspace async target did not return an Observable.');
      }
      await new Promise<void>((resolve, reject) => {
        (result as Observable<unknown>).subscribe({
          next: message => {
            void this.update(wa.id, { status: 'finished', message })
              .toPromise()
              .then(() => resolve(), reject);
          },
          error: reject,
        });
      });
    }

    loop(): void {
      sails.log.verbose('::::LOOP PENDING STATE::::::');
      //sails.log.debug(util.inspect(sails.services, {showHidden: false, depth: null}))
      this.pending().subscribe(
        (pending: WorkspaceAsyncAttributes[]) => {
          _.forEach(pending, (wa: WorkspaceAsyncAttributes) => {
            void this.executePending(wa).catch((error: unknown) => {
              this.update(wa.id, { status: 'error', message: { code: 'workspace-async-failed' } }).subscribe();
              sails.log.error('Workspace async job failed.', error);
            });
          });
        },
        (error: unknown) => {
          sails.log.error(error);
        }
      );
    }

    status({ status, recordType, branding }: { status: string; recordType: string; branding?: string }) {
      return super.getObservable(
        WorkspaceAsync.find({ status: status, recordType: recordType, branding }).sort('id ASC').limit(100)
      );
    }
  }
}

declare global {
  let WorkspaceAsyncService: Services.WorkspaceAsyncService;
}
