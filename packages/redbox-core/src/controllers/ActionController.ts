import { Controllers as controllers } from '../CoreController';


export namespace Controllers {
  /**
   * Responsible for all things related to exporting anything
   *
   * Author: <a href='https://github.com/shilob' target='_blank'>Shilo Banihit</a>
   */
  export class Action extends controllers.Core.Controller {

    /**
     * Exported methods, accessible from internet.
     */
    protected override _exportedMethods: string[] = [
        'callService'
    ];

    /**
     **************************************************************************************************
     **************************************** Add custom methods **************************************
     **************************************************************************************************
     */
    public callService(req: Sails.Req, res: Sails.Res) {
      const actionName = req.param('action')
      const config = sails.config.action[actionName];
      const options = {config: config};
      const serviceFunction = _.get(config.service, config.method);
      // Can optionally return an observable to subscribe on if this is a lengthy and complicated call
      // For simpler operations, service functions can write directly to the response object
      const response = serviceFunction(req, res, options);
      if (!res.writableEnded) {
        return response.subscribe((result: unknown) => {
          return this.sendResp(req, res, { data: result, headers: this.getNoCacheHeaders() });
        });
      }
    }


    /**
     **************************************************************************************************
     **************************************** Override magic methods **********************************
     **************************************************************************************************
     */
  }
}
