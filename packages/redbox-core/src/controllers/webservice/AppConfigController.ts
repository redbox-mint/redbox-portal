import {
  APIErrorResponse,
  BrandingModel,
  Controllers as controllers,
  validateApiRouteRequest,
  getAppConfigByIdRoute,
  saveAppConfigByIdRoute,
} from '../../index';

export namespace Controllers {
  /**
   * Responsible for all things related to application configuration
   *
   * @class AppConfig
   */
  export class AppConfig extends controllers.Core.Controller {
    private getErrorMessage(error: unknown): string {
      return error instanceof Error ? error.message : String(error);
    }

    constructor() {
      super();
    }

    /**
     * Exported methods, accessible from internet.
     */
    protected override _exportedMethods: string[] = ['getAppConfig', 'saveAppConfig'];

    /**
     **************************************************************************************************
     **************************************** Add custom methods **************************************
     **************************************************************************************************
     */

    public bootstrap() { }

    public async saveAppConfig(req: Sails.Req, res: Sails.Res) {
      try {
        const validated = validateApiRouteRequest(req, saveAppConfigByIdRoute);
        if (!validated.valid) {
          return this.sendResp(req, res, {
            status: 400,
            displayErrors: validated.issues.map(i => ({ title: i.path, detail: i.message })),
            headers: this.getNoCacheHeaders(),
          });
        }
        const { params, body } = validated;
        const brand: BrandingModel = BrandingService.getBrand(req.session.branding as string);
        const appConfigId = params.appConfigId as string;
        const appConfig = body;
        await AppConfigService.createOrUpdateConfig(brand, appConfigId, appConfig as string);
        return this.apiRespond(req, res, appConfig, 200);
      } catch (error: unknown) {
        sails.log.error(error);
        const errorResponse = new APIErrorResponse(this.getErrorMessage(error));
        return this.sendResp(req, res, {
          status: 500,
          displayErrors: [{ title: errorResponse.message, detail: errorResponse.details }],
          headers: this.getNoCacheHeaders(),
        });
      }
    }

    public async getAppConfig(req: Sails.Req, res: Sails.Res) {
      try {
        const validated = validateApiRouteRequest(req, getAppConfigByIdRoute);
        if (!validated.valid) {
          return this.sendResp(req, res, {
            status: 400,
            displayErrors: validated.issues.map(i => ({ title: i.path, detail: i.message })),
            headers: this.getNoCacheHeaders(),
          });
        }
        const { params } = validated;
        const brand: BrandingModel = BrandingService.getBrand(req.session.branding as string);
        const appConfigId = params.appConfigId as string;
        const appConfig = await AppConfigService.getAppConfigByBrandAndKey(brand.id, appConfigId);

        return this.apiRespond(req, res, appConfig, 200);
      } catch (error) {
        sails.log.error(error);
        const errorResponse = new APIErrorResponse(this.getErrorMessage(error));
        return this.sendResp(req, res, {
          status: 500,
          displayErrors: [{ title: errorResponse.message, detail: errorResponse.details }],
          headers: this.getNoCacheHeaders(),
        });
      }
    }
  }
}
