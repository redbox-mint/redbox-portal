import {
  APIActionResponse,
  APIErrorResponse,
  BrandingModel,
  Controllers as controllers,
  getValidatedApiRequest,
} from '../../index';

export namespace Controllers {
  /**
   * Responsible for all things related to the Dashboard
   *
   * @author <a target='_' href='https://github.com/andrewbrazzatti'>Andrew Brazzatti</a>
   */
  export class Admin extends controllers.Core.Controller {
    private getErrorMessage(error: unknown): string {
      return error instanceof Error ? error.message : String(error);
    }

    private getErrorStatus(error: unknown): number {
      const message = this.getErrorMessage(error);
      if (/no config found/i.test(message)) {
        return 404;
      }
      return /invalid|required|must/i.test(message) ? 400 : 500;
    }

    /**
     * Exported methods, accessible from internet.
     */
    protected override _exportedMethods: string[] = ['refreshCachedResources', 'setAppConfig', 'getAppConfig'];

    public bootstrap() { }

    public async refreshCachedResources(req: Sails.Req, res: Sails.Res) {
      try {
        const response = new APIActionResponse();
        await TranslationService.reloadResources();
        sails.config.startupMinute = Math.floor(Date.now() / 60000);

        return this.apiRespond(req, res, response, 200);
      } catch (error: unknown) {
        const errorResponse = new APIErrorResponse(this.getErrorMessage(error));
        return this.sendResp(req, res, {
          status: this.getErrorStatus(error),
          displayErrors: [{ title: errorResponse.message, detail: errorResponse.details }],
          headers: this.getNoCacheHeaders(),
        });
      }
    }

    public async setAppConfig(req: Sails.Req, res: Sails.Res) {
      try {
        const validated = getValidatedApiRequest(req);
        const { params, body } = validated;
        const configKey = params.configKey as string;

        const brandName: string = BrandingService.getBrandNameFromReq(req);
        const brand: BrandingModel = BrandingService.getBrand(brandName);

        await AppConfigService.createOrUpdateConfig(brand, configKey, body as Record<string, unknown>);

        const response = new APIActionResponse('App configuration updated successfully');

        return this.apiRespond(req, res, response, 200);
      } catch (error: unknown) {
        const errorResponse = new APIErrorResponse(this.getErrorMessage(error));
        return this.sendResp(req, res, {
          status: this.getErrorStatus(error),
          displayErrors: [{ title: errorResponse.message, detail: errorResponse.details }],
          headers: this.getNoCacheHeaders(),
        });
      }
    }

    public async getAppConfig(req: Sails.Req, res: Sails.Res) {
      try {
        const validated = getValidatedApiRequest(req);
        const { params } = validated;
        const validatedConfigKey = params.configKey as string | undefined;

        const brandName: string = BrandingService.getBrandNameFromReq(req);

        const brand: BrandingModel = BrandingService.getBrand(brandName);

        let config: unknown = AppConfigService.getAppConfigurationForBrand(brand.name);
        if (!_.isEmpty(validatedConfigKey)) {
          config = _.get(config, validatedConfigKey!, null);
          // A missing key resolves to null; respond with a documented 404 rather than
          // letting a null payload fall through to the generic 500 path in sendResp.
          if (config === null || config === undefined) {
            return this.sendResp(req, res, {
              status: 404,
              displayErrors: [{ title: 'No config found', detail: `No configuration found for key: ${validatedConfigKey}` }],
              headers: this.getNoCacheHeaders(),
            });
          }
        }

        return this.apiRespond(req, res, config, 200);
      } catch (error: unknown) {
        const errorResponse = new APIErrorResponse(this.getErrorMessage(error));
        return this.sendResp(req, res, {
          status: this.getErrorStatus(error),
          displayErrors: [{ title: errorResponse.message, detail: errorResponse.details }],
          headers: this.getNoCacheHeaders(),
        });
      }
    }
  }
}
