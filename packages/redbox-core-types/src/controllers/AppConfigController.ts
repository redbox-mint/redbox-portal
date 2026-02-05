import { Controllers as controllers } from '../CoreController';
import { ConfigModels } from '../configmodels/ConfigModels';
import { BrandingModel } from '../model/storage/BrandingModel';
import { Services as AppConfigServiceModule } from '../services/AppConfigService';
import { Services as BrandingServiceModule } from '../services/BrandingService';


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
      'getAppConfigForm',
      'saveAppConfig',
      'editAppConfig'
    ];

    /**
     * Helpers for accessing services
     */
    private get appConfigService(): AppConfigServiceModule.AppConfigs {
        return sails.services['appconfigservice'];
    }

    private get brandingService(): BrandingServiceModule.Branding {
        return sails.services['brandingservice'];
    }

    public bootstrap() { }

    public async editAppConfig(req: Sails.Req, res: Sails.Res) {
      try {
        const brand: BrandingModel = this.brandingService.getBrand(req.session.branding);
        let appConfigId: string = req.param('appConfigId');

        if (appConfigId === undefined) {
          return res.notFound('appConfigId is required');
        }
        const modelInfo = await ConfigModels.getModelInfo(appConfigId);
        if (modelInfo === undefined) {
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
    public async saveAppConfig(req: Sails.Req, res: Sails.Res) {
      try {
        const brand: BrandingModel = this.brandingService.getBrand(req.session.branding);
        let appConfigId: string = req.param('appConfigId');
        let appConfig = req.body;
        if (appConfigId === undefined) {
          return res.badRequest('appConfigId is required');
        }
        //TODO: validate post body against key?
        await this.appConfigService.createOrUpdateConfig(brand, appConfigId, appConfig)
        return res.json(appConfig);
      } catch (error) {
        sails.log.error(error);
        return res.serverError(error);
      }
    }

    public async getAppConfigForm(req: Sails.Req, res: Sails.Res) {
      try {
        const brand: BrandingModel = this.brandingService.getBrand(req.session.branding);
        let appConfigId: string = req.param('appConfigId');
        if (appConfigId === undefined) {
          return res.badRequest('appConfigId is required');
        }
        let appConfig = await this.appConfigService.getAppConfigForm(brand, appConfigId)

        return res.json(appConfig);
      } catch (error) {
        sails.log.error(error);
        return res.serverError(error);
      }
    }
  }
}
