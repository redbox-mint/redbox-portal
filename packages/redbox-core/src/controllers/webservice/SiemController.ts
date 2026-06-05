import {
  APIErrorResponse,
  BrandingModel,
  Controllers as controllers,
  getValidatedApiRequest,
} from '../../index';
import type { SiemTestInput } from '../../services/siem/SiemTypes';

type SecurityEventServiceApi = {
  queryEvents: (params: Record<string, unknown>) => Promise<unknown>;
};

type SiemForwardingServiceApi = {
  getDeliveryStatus: (params: Record<string, unknown>) => Promise<unknown>;
  testDestination: (input: SiemTestInput) => Promise<unknown>;
};

export namespace Controllers {
  export class Siem extends controllers.Core.Controller {
    protected override _exportedMethods: string[] = [
      'getConfig',
      'saveConfig',
      'getEvents',
      'getDeliveryStatus',
      'testDestination',
    ];

    private getErrorMessage(error: unknown): string {
      return error instanceof Error ? error.message : String(error);
    }

    private respondError(req: Sails.Req, res: Sails.Res, error: unknown, status = 500) {
      sails.log.error(error);
      const errorResponse = new APIErrorResponse(this.getErrorMessage(error));
      return this.sendResp(req, res, {
        status,
        displayErrors: [{ title: errorResponse.message, detail: errorResponse.details }],
        headers: this.getNoCacheHeaders(),
      });
    }

    private getBrand(req: Sails.Req): BrandingModel {
      return BrandingService.getBrand(req.session.branding as string);
    }

    private securityEventService(): SecurityEventServiceApi {
      return sails.services.securityeventservice as unknown as SecurityEventServiceApi;
    }

    private siemForwardingService(): SiemForwardingServiceApi {
      return sails.services.siemforwardingservice as unknown as SiemForwardingServiceApi;
    }

    public async getConfig(req: Sails.Req, res: Sails.Res) {
      try {
        const brand = this.getBrand(req);
        const config = await AppConfigService.getAppConfigByBrandAndKey(brand.id, 'siem');
        return this.apiRespond(req, res, config, 200);
      } catch (error) {
        return this.respondError(req, res, error);
      }
    }

    public async saveConfig(req: Sails.Req, res: Sails.Res) {
      try {
        const { body } = getValidatedApiRequest(req);
        const brand = this.getBrand(req);
        await AppConfigService.createOrUpdateConfig(brand, 'siem', body as Record<string, unknown>);
        const config = await AppConfigService.getAppConfigByBrandAndKey(brand.id, 'siem');
        return this.apiRespond(req, res, config, 200);
      } catch (error) {
        return this.respondError(req, res, error);
      }
    }

    public async getEvents(req: Sails.Req, res: Sails.Res) {
      try {
        const result = await this.securityEventService().queryEvents(req.query as Record<string, unknown>);
        return this.apiRespond(req, res, result, 200);
      } catch (error) {
        return this.respondError(req, res, error);
      }
    }

    public async getDeliveryStatus(req: Sails.Req, res: Sails.Res) {
      try {
        const result = await this.siemForwardingService().getDeliveryStatus(req.query as Record<string, unknown>);
        return this.apiRespond(req, res, result, 200);
      } catch (error) {
        return this.respondError(req, res, error);
      }
    }

    public async testDestination(req: Sails.Req, res: Sails.Res) {
      try {
        const { body } = getValidatedApiRequest(req);
        if (!body || typeof body !== 'object' || !('destination' in body)) {
          return this.respondError(req, res, new Error('A destination is required.'), 400);
        }
        const result = await this.siemForwardingService().testDestination(body as SiemTestInput);
        return this.apiRespond(req, res, result, 200);
      } catch (error) {
        return this.respondError(req, res, error);
      }
    }
  }
}
