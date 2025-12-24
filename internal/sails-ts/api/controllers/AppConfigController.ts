declare var module;
declare var sails;

import {
  BrandingModel
} from '@researchdatabox/redbox-core-types';
declare var _;

/**
 * Package that contains all Controllers.
 */
import { Controllers as controllers} from '@researchdatabox/redbox-core-types';
import { ConfigModels } from '../configmodels/ConfigModels';


export module Controllers {
  /**
   * Responsible for all things related to application configuration
   *
   * @class AppConfig
   */
  export class AppConfig extends controllers.Core.Controller {

    constructor() {
      super();
    }



    /**
     * Exported methods, accessible from internet.
     */
    protected _exportedMethods: any = [
      'getAppConfigForm',
      'saveAppConfig',
      'editAppConfig'
    ];

    /**
     **************************************************************************************************
     **************************************** Add custom methods **************************************
     **************************************************************************************************
     */

    public bootstrap() { }

    public async editAppConfig(req,res) {
      try {
      const brand:BrandingModel = BrandingService.getBrand(req.session.branding);
      let appConfigId:string = req.param('appConfigId');

      if(appConfigId === undefined) {
        return res.notFound('appConfigId is required');
      }
      const modelInfo = await ConfigModels.getModelInfo(appConfigId);
      if(modelInfo === undefined) {
        return res.notFound('No config found for key');
      }

      return this.sendView(req, res, 'admin/appconfig', {
       configKey: appConfigId,
       formTitle: modelInfo.title
      });
      } catch (error) {
        sails.log.error(error);
        return res.serverError(error);
      }
    }
    public async saveAppConfig(req, res) {
      try {
        const brand:BrandingModel = BrandingService.getBrand(req.session.branding);
        let appConfigId:string = req.param('appConfigId');
        let appConfig = req.body;
        if(appConfigId === undefined) {
          return res.badRequest('appConfigId is required');
        }
        //TODO: validate post body against key?
        await AppConfigService.createOrUpdateConfig(brand,appConfigId,appConfig)
        return res.json(appConfig);
      } catch (error) {
        sails.log.error(error);
        return res.serverError(error);
      }
    }

    public async getAppConfigForm(req, res) {
      try {
        const brand:BrandingModel = BrandingService.getBrand(req.session.branding);
        let appConfigId:string = req.param('appConfigId');
        if(appConfigId === undefined) {
          return res.badRequest('appConfigId is required');
        }
        let appConfig = await AppConfigService.getAppConfigForm(brand,appConfigId)

        return res.json(appConfig);
      } catch (error) {
        sails.log.error(error);
        return res.serverError(error);
      }
    }
  }
}

module.exports = new Controllers.AppConfig().exports();
