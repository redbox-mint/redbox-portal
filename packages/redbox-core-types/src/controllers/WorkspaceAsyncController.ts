import { Controllers as controllers } from '../CoreController';


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
    protected override _exportedMethods: any = [
      'start',
      'loop',
      'status'
    ];

    public start(req: Sails.Req, res: Sails.Res) {
      const name = req.param('name');
      const recordType = req.param('recordType');
      const username = req.username;
      const method = req.param('method');
      const service = req.param('service');
      const args = req.param('args');
      return WorkspaceAsyncService.start({ name, recordType, username, service, method, args })
        .subscribe((response: unknown) => {
          this.sendResp(req, res, { data: {}, headers: this.getNoCacheHeaders() });
        }, (error: unknown) => {
          sails.log.error(error);
          const payload = error ?? { status: false, message: 'Error registering async workspace' };
          this.sendResp(req, res, { data: payload, headers: this.getNoCacheHeaders() });
        });
    }

    public status(req: Sails.Req, res: Sails.Res) {
      const status = req.param('status');
      const recordType = req.param('recordType');
      return WorkspaceAsyncService.status({ status, recordType })
        .subscribe((response: unknown) => {
          this.sendResp(req, res, { data: response, headers: this.getNoCacheHeaders() });
        }, (error: unknown) => {
          sails.log.error(error);
          const payload = error ?? { status: false, message: 'Error checking status async workspace' };
          this.sendResp(req, res, { data: payload, headers: this.getNoCacheHeaders() });
        })
    }

    public loop(req: Sails.Req, res: Sails.Res) {
      try {
        WorkspaceAsyncService.loop();
        this.sendResp(req, res, { data: { status: true }, headers: this.getNoCacheHeaders() });
      } catch (error: unknown) {
        sails.log.error(error);
        const payload = error ?? { status: false, message: 'Error running async workspace loop' };
        this.sendResp(req, res, { data: payload, headers: this.getNoCacheHeaders() });
      }
    }

  }
}
