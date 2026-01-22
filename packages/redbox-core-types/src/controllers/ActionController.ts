import { Controllers as controllers } from '../CoreController';

declare var sails: any;
declare var _: any;

export module Controllers {
  /**
   * Responsible for all things related to exporting anything
   *
   * Author: <a href='https://github.com/shilob' target='_blank'>Shilo Banihit</a>
   */
  export class Action extends controllers.Core.Controller {

    /**
     * Exported methods, accessible from internet.
     */
    protected _exportedMethods: any = [
        'callService'
    ];

    /**
     **************************************************************************************************
     **************************************** Add custom methods **************************************
     **************************************************************************************************
     */
    public callService(req, res) {
      const actionName = req.param('action')
      const oid = req.param('oid');
      const config = sails.config.action[actionName];
      const options = {config: config};
      let serviceFunction = _.get(config.service, config.method);
      // Can optionally return an observable to subscribe on if this is a lengthy and complicated call
      // For simpler operations, service functions can write directly to the response object
      const response = serviceFunction(req, res, options);
      if (!res.writableEnded) {
        return response.subscribe( result => {
          return this.ajaxOk(req, res, null, result);
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
