declare var module;
declare var sails;
import {
  Observable
} from 'rxjs/Rx';
import {
  BrandingModel
} from '@researchdatabox/redbox-core-types';
import { default as moment } from 'moment';
import * as tus from 'tus-node-server';
import * as fs from 'fs';
import * as url from 'url';
import { default as checkDiskSpace } from 'check-disk-space';
declare var _;
import {Services as AppConfigServiceType} from '../services/AppConfigService';
import {Services as BrandingServiceType} from '../services/BrandingService';

/**
 * Package that contains all Controllers.
 */
import { Controllers as controllers, DatastreamService, RecordsService, SearchService } from '@researchdatabox/redbox-core-types';
import { ConfigModels } from '../configmodels/ConfigModels';
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