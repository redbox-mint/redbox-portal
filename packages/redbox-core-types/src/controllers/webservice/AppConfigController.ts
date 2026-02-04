import {
  APIErrorResponse,
  BrandingModel,
  AppConfigService as AppConfigServiceModule,
  BrandingService as BrandingServiceModule,
  Controllers as controllers
} from '../../index';

declare var sails: any;
declare var _: any;

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
    protected override _exportedMethods: any = [
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
        const brand: BrandingModel = BrandingService.getBrand(req.session.branding);
        let appConfigId: string = req.param('appConfigId');
        let appConfig = req.body;
        if (appConfigId === undefined) {
          return res.badRequest('appConfigId is required');
        }
        //TODO: validate post body against key?
        await AppConfigService.createOrUpdateConfig(brand, appConfigId, appConfig)
        return this.apiRespond(req, res, appConfig, 200);
      } catch (error) {
        sails.log.error(error);
        const errorResponse = new APIErrorResponse(error.message);
        return this.sendResp(req, res, {
          status: 500,
          displayErrors: [{ title: errorResponse.message, detail: errorResponse.details }],
          headers: this.getNoCacheHeaders()
        });
      }
    }

    public async getAppConfig(req, res) {
      try {
        const brand: BrandingModel = BrandingService.getBrand(req.session.branding);
        let appConfigId: string = req.param('appConfigId');
        if (appConfigId === undefined) {
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
