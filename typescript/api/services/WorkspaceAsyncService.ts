import { Observable } from 'rxjs/Rx';
import {Services as services}   from '@researchdatabox/redbox-core-types';
import { Sails, Model } from "sails";

const util = require('util');
import { DateTime } from 'luxon';

declare var sails: Sails;
declare var _this;
declare var _;
declare var WorkspaceAsync;

export module Services {
  /**
   * WorkspaceAsync Service
   *
   * @author <a target='_' href='https://github.com/moisbo'>moisbo</a>
   */
  export class WorkspaceAsyncService extends services.Core.Service {

    protected _exportedMethods: any = [
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
    public start({name, recordType, username, service, method, args}) {
      return super.getObservable(
        WorkspaceAsync.create(
          {name: name, started_by: username, recordType: recordType,
            service: service, method: method, args: args, status: 'started'}
        )
      );
    }

    public update(id, obj) {
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

    loop() {
      sails.log.verbose('::::LOOP PENDING STATE::::::');
      //sails.log.debug(util.inspect(sails.services, {showHidden: false, depth: null}))
      this.pending().subscribe(pending => {
        _.forEach(pending, wa => {
          const args = wa.args || null;
          sails.services[wa.service][wa.method](args).subscribe(message => {
            this.update(wa.id, {status: 'finished', message: message}).subscribe();
          }, error => {
            this.update(wa.id, {status: 'error', message: error}).subscribe();
          });
        });
      }, error => {
        sails.log.error(error);
      });
    }

    status(status, recordType) {
      return super.getObservable(
        WorkspaceAsync.find({status: status, recordType: recordType})
      )
    }

  }

}
module.exports = new Services.WorkspaceAsyncService().exports();
