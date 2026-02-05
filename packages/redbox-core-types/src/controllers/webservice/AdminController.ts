import { APIActionResponse, APIErrorResponse, BrandingModel, Controllers as controllers } from '../../index';


export module Controllers {
  /**
   * Responsible for all things related to the Dashboard
   *
   * @author <a target='_' href='https://github.com/andrewbrazzatti'>Andrew Brazzatti</a>
   */
  export class Admin extends controllers.Core.Controller {
    private getErrorMessage(error: unknown): string {
      return error instanceof Error ? error.message : String(error);
    }

    /**
     * Exported methods, accessible from internet.
     */
    protected override _exportedMethods: any = [
      'refreshCachedResources',
      'setAppConfig',
      'getAppConfig'
    ];

    public bootstrap() {

    }

    public async refreshCachedResources(req: Sails.Req, res: Sails.Res) {
      try {
        let response = new APIActionResponse();
        TranslationService.reloadResources();
        sails.config.startupMinute = Math.floor(Date.now() / 60000);

        return this.apiRespond(req, res, response, 200)
      } catch (error: unknown) {
        const errorResponse = new APIErrorResponse(this.getErrorMessage(error));
        return this.sendResp(req, res, {
          status: 500,
          displayErrors: [{ title: errorResponse.message, detail: errorResponse.details }],
          headers: this.getNoCacheHeaders()
        });
      }
    }

    public async setAppConfig(req: Sails.Req, res: Sails.Res) {
      try {
        let configKey = req.param('configKey')

        let brandName: string = BrandingService.getBrandFromReq(req);
        let brand: BrandingModel = BrandingService.getBrand(brandName);

        let config = await AppConfigService.createOrUpdateConfig(brand, configKey, req.body)

        let response = new APIActionResponse('App configuration updated successfully');

        return this.apiRespond(req, res, response, 200)
      } catch (error: unknown) {
        const errorResponse = new APIErrorResponse(this.getErrorMessage(error));
        return this.sendResp(req, res, {
          status: 500,
          displayErrors: [{ title: errorResponse.message, detail: errorResponse.details }],
          headers: this.getNoCacheHeaders()
        });
      }
    }

    public async getAppConfig(req: Sails.Req, res: Sails.Res) {
      try {
        let configKey = req.param('configKey')

        let brandName: string = BrandingService.getBrandFromReq(req);

        let brand: BrandingModel = BrandingService.getBrand(brandName);

        let config = AppConfigService.getAppConfigurationForBrand(brand.name)
        if (!_.isEmpty(configKey)) {
          config = _.get(config, configKey, null)
        }

        return this.apiRespond(req, res, config, 200)
      } catch (error: unknown) {
        const errorResponse = new APIErrorResponse(this.getErrorMessage(error));
        return this.sendResp(req, res, {
          status: 500,
          displayErrors: [{ title: errorResponse.message, detail: errorResponse.details }],
          headers: this.getNoCacheHeaders()
        });
      }
    }
  }
}
