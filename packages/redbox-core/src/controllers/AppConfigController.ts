import { Controllers as controllers } from '../CoreController';
import { authorizedEmailTestBody, resetAppConfigBody, integrationConnectionBody, integrationKeySchema } from '../api-routes/groups/appconfig';
import { evaluateAuthorizedEmail } from '../utilities/AuthorizedEmailAccess';
import type { AuthorizedDomainsEmails } from '../configmodels/AuthorizedDomainsEmails';
import { ConfigModels } from '../configmodels/ConfigModels';
import { BrandingModel } from '../model/storage/BrandingModel';
import { Services as AppConfigServiceModule } from '../services/AppConfigService';
import { Services as BrandingServiceModule } from '../services/BrandingService';


export namespace Controllers {
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
    protected override _exportedMethods: string[] = [
      'getAppConfigForm',
      'saveAppConfig',
      'editAppConfig',
      'testAuthorizedEmail',
      'testConnection',
      'resetAppConfig'
    ];

    /**
     * Helpers for accessing services
     */
    private get appConfigService(): AppConfigServiceModule.AppConfigs {
        return sails.services['appconfigservice'] as unknown as AppConfigServiceModule.AppConfigs;
    }

    private get brandingService(): BrandingServiceModule.Branding {
        return sails.services['brandingservice'] as unknown as BrandingServiceModule.Branding;
    }

    public bootstrap() { }

    public testAuthorizedEmail(req: Sails.Req, res: Sails.Res) {
      // Also validate here for direct controller adapters; never echo or log inputs.
      const parsed = authorizedEmailTestBody.safeParse(req.body);
      if (!parsed.success) return res.badRequest({ message: 'Invalid address test request' });
      const { email, provider, draft } = parsed.data;
      const brandName = this.brandingService.getBrandNameFromReq(req);
      const config = draft ?? sails.config.brandingAware(brandName).authorizedDomainsEmails ?? {};
      // AAF and OIDC both normalize the incoming claim this way before the gate.
      return res.json(evaluateAuthorizedEmail(email.toLowerCase(), config as Partial<AuthorizedDomainsEmails>, provider));
    }

    public async testConnection(req: Sails.Req, res: Sails.Res) {
      const parsed = integrationConnectionBody.safeParse(req.body);
      const key = integrationKeySchema.safeParse(req.param('integration'));
      if (!parsed.success || !key.success) return res.badRequest({ message: 'Invalid connection test request' });
      try {
        const brandName = this.brandingService.getBrandNameFromReq(req);
        const userId = String(req.user?.id ?? '');
        if (!userId) return res.status(403).json({ message: 'Authentication required' });
        const { result, retryAfter } = await this.appConfigService.testConnection(brandName, userId, key.data, parsed.data.draft);
        if (retryAfter) {
          res.set('Retry-After', String(retryAfter));
          return res.status(429).json(result);
        }
        return res.json(result);
      } catch {
        // Never log a draft, upstream error, headers, credentials or response body.
        return res.json({ ok: false, status: 'misconfigured', latencyMs: 0, message: 'Unable to read connection settings. Check the integration configuration.' });
      }
    }

    public async resetAppConfig(req: Sails.Req, res: Sails.Res) {
      try {
        if (!resetAppConfigBody.safeParse(req.body).success) return res.badRequest({ message: 'Reset requires an empty object' });
        const configKey = req.param('appConfigId');
        if (typeof configKey !== 'string' || !/^[a-zA-Z][a-zA-Z0-9_-]*$/.test(configKey) || !ConfigModels.getModelInfo(configKey)) {
          return res.badRequest({ message: 'Unknown app config' });
        }
        const brand = this.brandingService.getBrand(this.brandingService.getBrandNameFromReq(req));
        return res.json(await this.appConfigService.resetConfig(brand, configKey));
      } catch (error) {
        const status = (error as { status?: number }).status;
        if (status === 400 || status === 410) return res.status(status).json({ message: (error as Error).message });
        sails.log.error(error);
        return res.serverError({ message: 'Unable to reset app config' });
      }
    }

    public async editAppConfig(req: Sails.Req, res: Sails.Res) {
      try {
        const appConfigId: string = req.param('appConfigId');

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
        const brand: BrandingModel = this.brandingService.getBrand(req.session.branding as string);
        const appConfigId: string = req.param('appConfigId');
        const appConfig = req.body;
        if (appConfigId === undefined) {
          return res.badRequest('appConfigId is required');
        }
        //TODO: validate post body against key?
        const savedConfig = await this.appConfigService.createOrUpdateConfig(brand, appConfigId, appConfig)
        return res.json(savedConfig);
      } catch (error) {
        if ([400, 410].includes((error as { status?: number })?.status ?? 500)) {
          return res.status((error as { status: number }).status).json({ message: (error as Error).message });
        }
        sails.log.error(error);
        return res.serverError(error);
      }
    }

    public async getAppConfigForm(req: Sails.Req, res: Sails.Res) {
      try {
        const brand: BrandingModel = this.brandingService.getBrand(req.session.branding as string);
        const appConfigId: string = req.param('appConfigId');
        if (appConfigId === undefined) {
          return res.badRequest('appConfigId is required');
        }
        const appConfig = await this.appConfigService.getAppConfigForm(brand, appConfigId)

        return res.json(appConfig);
      } catch (error) {
        sails.log.error(error);
        return res.serverError(error);
      }
    }
  }
}
