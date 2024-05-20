declare var module;
declare var sails;

import {
  APIErrorResponse
} from '@researchdatabox/redbox-core-types';
declare var _;
import {Services as AppConfigServiceType} from '../../services/AppConfigService';
import {Services as BrandingServiceType} from '../../services/BrandingService';

/**
 * Package that contains all Controllers.
 */
import { Controllers as controllers} from '@researchdatabox/redbox-core-types';
declare var AppConfigService:AppConfigServiceType.AppConfigs, BrandingService:BrandingServiceType.Branding;

export module Controllers {
  /**
   * Responsible for all things related to application configuration
   *
   * @class AppConfig
   */
  export class AppConfig extends controllers.Core.Controller {

    
    private nameRBValidationError = 'RBValidationError';

    constructor() {
      super();
    }



    /**
     * Exported methods, accessible from internet.
     */
    protected _exportedMethods: any = [
      'getAppConfig',
      'saveAppConfig'
    ];

    /**
     **************************************************************************************************
     **************************************** Add custom methods **************************************
     **************************************************************************************************
     */

    public bootstrap() { }

    
    public async saveAppConfig(req, res) {
      try {
        const brand:any = BrandingService.getBrand(req.session.branding);
        let appConfigId:string = req.param('appConfigId');
        let appConfig = req.body;
        if(appConfigId === undefined) {
          return res.badRequest('appConfigId is required');
        }
        //TODO: validate post body against key?
        await AppConfigService.createOrUpdateConfig(brand,appConfigId,appConfig)
        return this.apiRespond(req,res, appConfig,200);
      } catch (error) {
        sails.log.error(error);
        return this.apiFail(req,res,500, new APIErrorResponse(error.message));
      }
    }

    public async getAppConfig(req, res) {
      try {
        const brand:any = BrandingService.getBrand(req.session.branding);
        let appConfigId:string = req.param('appConfigId');
        if(appConfigId === undefined) {
          return res.badRequest('appConfigId is required');
        }
        let appConfig = await AppConfigService.getAppConfigByBrandAndKey(brand.id, appConfigId);
        
        return res.json(appConfig);
      } catch (error) {
        sails.log.error(error);
        return res.serverError(error);
      }
    }
  }
}

module.exports = new Controllers.AppConfig().exports();