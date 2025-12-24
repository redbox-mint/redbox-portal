
declare var module;
declare var sails;

declare var  User;


/**
 * Package that contains all Controllers.
 */
import { Controllers as controllers} from '@researchdatabox/redbox-core-types';

export module Controllers {
  /**
   * WorkspaceAsync Controller
   *
   * @author <a target='_' href='https://github.com/moisbo'>moisbo</a>
   */
  export class WorkspaceAsync extends controllers.Core.Controller {

    /**
     * Methods required for workspace dashboard.
     */
    protected _exportedMethods: any = [
      'start',
      'loop',
      'status'
    ];

    start(req, res){
      const name = req.param('name');
      const recordType = req.param('recordType');
      const username = req.username;
      const method = req.param('method');
      const service = req.param('service');
      const args = req.param('args');
      return WorkspaceAsyncService.start({name, recordType, username, service, method, args})
      .subscribe(response => {
        this.ajaxOk(req, res, null, {});
      }, error => {
        sails.log.error(error);
        this.ajaxFail(req, res, 'Error registering async workspace', error);
      });
    }

    status(req, res) {
      const status = req.param('status');
      const recordType = req.param('recordType');
      return WorkspaceAsyncService.status(status, recordType)
      .subscribe(response => {
        this.ajaxOk(req, res, null, response);
      }, error => {
        sails.log.error(error);
        this.ajaxFail(req, res, 'Error checking status async workspace', error);
      })
    }

  }
}
