import { Observable } from 'rxjs';
import { Services as services } from '../CoreService';

const util = require('util');
import { DateTime } from 'luxon';

declare var sails: any;
declare var _: any;
declare var WorkspaceAsync: any;

type WorkspaceAsyncStartInput = {
  name: string;
  recordType: string;
  username: string;
  service: string;
  method: string;
  args?: unknown;
};

export module Services {
  /**
   * WorkspaceAsync Service
   *
   * @author <a target='_' href='https://github.com/moisbo'>moisbo</a>
   */
  export class WorkspaceAsyncService extends services.Core.Service {

    protected override _exportedMethods: any = [
      'start',
      'update',
      'pending',
      'loop',
      'status'
    ];

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
    public start({name, recordType, username, service, method, args}: WorkspaceAsyncStartInput) {
      return super.getObservable(
        WorkspaceAsync.create(
          {name: name, started_by: username, recordType: recordType,
            service: service, method: method, args: args, status: 'started'}
        )
      );
    }

    public update(id: string, obj: Record<string, unknown>) {
      if(obj.status === 'finished'){
        obj.date_completed = DateTime.local().toFormat('yyyy-LL-dd HH:mm:ss');
      }
      return super.getObservable(
        WorkspaceAsync.update({id: id}, obj)
      );
    }

    public pending() {
      return super.getObservable(
        WorkspaceAsync.find({status: 'pending'})
      );
    }

    loop(): void {
      sails.log.verbose('::::LOOP PENDING STATE::::::');
      //sails.log.debug(util.inspect(sails.services, {showHidden: false, depth: null}))
      this.pending().subscribe((pending: any[]) => {
        _.forEach(pending, (wa: any) => {
          const args = wa.args || null;
          sails.services[wa.service][wa.method](args).subscribe((message: unknown) => {
            this.update(wa.id, {status: 'finished', message: message}).subscribe();
          }, (error: unknown) => {
            this.update(wa.id, {status: 'error', message: error}).subscribe();
          });
        });
      }, (error: unknown) => {
        sails.log.error(error);
      });
    }

    status({ status, recordType }: { status: string; recordType: string }) {
      return super.getObservable(
        WorkspaceAsync.find({status: status, recordType: recordType})
      )
    }

  }

}

declare global {
  let WorkspaceAsyncService: Services.WorkspaceAsyncService;
}
