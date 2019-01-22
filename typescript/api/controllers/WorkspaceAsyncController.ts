
declare var module;
declare var sails;

declare var BrandingService;
declare var RolesService;
declare var  DashboardService;
declare var  UsersService;
declare var  User;
declare var WorkspaceAsyncService;

/**
 * Package that contains all Controllers.
 */
import controller = require('../core/CoreController.js');

export module Controllers {
  /**
   * WorkspaceAsync Controller
   *
   * @author <a target='_' href='https://github.com/moisbo'>moisbo</a>
   */
  export class WorkspaceAsync extends controller.Controllers.Core.Controller {

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
      return WorkspaceAsyncService.status({status, recordType})
      .subscribe(response => {
        this.ajaxOk(req, res, null, response);
      }, error => {
        sails.log.error(error);
        this.ajaxFail(req, res, 'Error checking status async workspace', error);
      })
    }

  }
}
