import {
  assertTestDestinationAllowed,
  resolveMaskedTestDestinationSecrets,
} from '../../integrations/SiemDestinationTests';
import { sanitizeSiemTestResponse } from '../../services/siem/SiemConfigSecrets';
import { APIErrorResponse, BrandingModel, Controllers as controllers, getValidatedApiRequest } from '../../index';
import {
  normalizeSiemConfiguration,
  normalizeSiemDestination,
  normalizeSiemRedaction,
  SiemConfigurationError,
  type SiemConfigDto,
  type SiemDestinationConfig,
} from '../../configmodels/SiemConfiguration';
import type { SiemTestInput } from '../../services/siem/SiemTypes';

type SecurityEventServiceApi = {
  queryEvents: (params: Record<string, unknown>) => Promise<unknown>;
};

type SiemForwardingServiceApi = {
  getDeliveryStatus: (params: Record<string, unknown>) => Promise<unknown>;
  testDestination: (input: SiemTestInput) => Promise<unknown>;
};

type QueryOptions = {
  allowedStringKeys: readonly string[];
  dateField: string;
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
      if (typeof req.session?.branding !== 'string' || req.session.branding.trim() === '') {
        throw new Error('Missing or invalid request branding session.');
      }
      return BrandingService.getBrand(req.session.branding);
    }

    private securityEventService(): SecurityEventServiceApi {
      const service = sails.services.securityeventservice;
      return { queryEvents: async params => service.queryEvents(params) };
    }

    private siemForwardingService(): SiemForwardingServiceApi {
      const service = sails.services.siemforwardingservice;
      return {
        getDeliveryStatus: async params => service.getDeliveryStatus(params),
        testDestination: async input => service.testDestination(input),
      };
    }

    private assertTestDestinationAllowed(destination: SiemDestinationConfig, config: SiemConfigDto): void {
      assertTestDestinationAllowed(destination, config);
    }

    private unmaskedSiemConfig(brand: BrandingModel): SiemConfigDto {
      const brandConfig = AppConfigService.getAppConfigurationForBrand(brand.name);
      return normalizeSiemConfiguration(Reflect.get(brandConfig, 'siem') ?? {});
    }

    private resolveMaskedTestDestinationSecrets(input: SiemTestInput, config: SiemConfigDto): SiemTestInput {
      return resolveMaskedTestDestinationSecrets(input, config);
    }

    private isQueryValidationError(error: unknown): boolean {
      return (
        error instanceof SiemConfigurationError ||
        (error instanceof Error &&
          (error.message.includes('pagination parameter') || error.message.includes('valid ISO date string')))
      );
    }

    private parsePagination(value: unknown, defaultValue: number, maxValue?: number): number {
      if (value == null || value === '') {
        return defaultValue;
      }
      const parsed = typeof value === 'number' ? value : Number(value);
      if (
        !Number.isSafeInteger(parsed) ||
        parsed < 0 ||
        (maxValue !== undefined && (parsed < 1 || parsed > maxValue))
      ) {
        throw new Error('Invalid pagination parameter.');
      }
      const normalized = Math.max(Math.trunc(parsed), 0);
      return maxValue == null ? normalized : Math.min(normalized, maxValue);
    }

    private parseIsoDate(value: unknown, fieldName: string): string | undefined {
      if (value == null || value === '') {
        return undefined;
      }
      if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T/.test(value) || Number.isNaN(Date.parse(value))) {
        throw new Error(`${fieldName} must be a valid ISO date string.`);
      }
      return new Date(value).toISOString();
    }

    private sanitizeListQuery(query: Record<string, unknown>, options: QueryOptions): Record<string, unknown> {
      const sanitizedQuery: Record<string, unknown> = {
        limit: this.parsePagination(query.limit, 50, 500),
        skip: this.parsePagination(query.offset, 0),
      };

      for (const key of options.allowedStringKeys) {
        const value = query[key];
        if (typeof value === 'string' && value.trim() !== '') {
          sanitizedQuery[key] = value.trim();
        }
      }

      const startDate = this.parseIsoDate(query.startDate, 'startDate');
      const endDate = this.parseIsoDate(query.endDate, 'endDate');
      if (startDate) {
        sanitizedQuery[`${options.dateField}Start`] = startDate;
      }
      if (endDate) {
        sanitizedQuery[`${options.dateField}End`] = endDate;
      }
      if (startDate && endDate && Date.parse(startDate) > Date.parse(endDate))
        throw new SiemConfigurationError('startDate must precede endDate.');
      return sanitizedQuery;
    }

    public async getConfig(req: Sails.Req, res: Sails.Res) {
      try {
        const brand = this.getBrand(req);
        const config = await AppConfigService.getAppConfigByBrandAndKey(brand.id, 'siem');
        return this.apiRespond(req, res, normalizeSiemConfiguration(config ?? {}), 200);
      } catch (error) {
        return this.respondError(req, res, error);
      }
    }

    public async saveConfig(req: Sails.Req, res: Sails.Res) {
      try {
        const { body } = getValidatedApiRequest(req);
        const brand = this.getBrand(req);
        const configData = normalizeSiemConfiguration(body);
        await AppConfigService.createOrUpdateConfig(brand, 'siem', { ...configData });
        const config = await AppConfigService.getAppConfigByBrandAndKey(brand.id, 'siem');
        return this.apiRespond(req, res, normalizeSiemConfiguration(config ?? {}), 200);
      } catch (error) {
        return this.respondError(req, res, error, error instanceof SiemConfigurationError ? 400 : 500);
      }
    }

    public async getEvents(req: Sails.Req, res: Sails.Res) {
      try {
        const { query } = getValidatedApiRequest(req);
        const brand = this.getBrand(req);
        const sanitizedQuery = this.sanitizeListQuery(query, {
          allowedStringKeys: ['eventType', 'category', 'severity', 'deliveryState'],
          dateField: 'occurredAt',
        });
        sanitizedQuery.brandId = brand.id;
        const result = await this.securityEventService().queryEvents(sanitizedQuery);
        return this.apiRespond(req, res, result, 200);
      } catch (error) {
        return this.respondError(req, res, error, this.isQueryValidationError(error) ? 400 : 500);
      }
    }

    public async getDeliveryStatus(req: Sails.Req, res: Sails.Res) {
      try {
        const { query } = getValidatedApiRequest(req);
        const brand = this.getBrand(req);
        const sanitizedQuery = this.sanitizeListQuery(query, {
          allowedStringKeys: ['eventId', 'destinationId', 'status'],
          dateField: 'startedAt',
        });
        sanitizedQuery.brandId = brand.id;
        const result = await this.siemForwardingService().getDeliveryStatus(sanitizedQuery);
        return this.apiRespond(req, res, result, 200);
      } catch (error) {
        return this.respondError(req, res, error, this.isQueryValidationError(error) ? 400 : 500);
      }
    }

    public async testDestination(req: Sails.Req, res: Sails.Res) {
      try {
        const { body } = getValidatedApiRequest(req);
        if (!body || typeof body !== 'object' || !('destination' in body)) {
          return this.respondError(req, res, new Error('A destination is required.'), 400);
        }
        const brand = this.getBrand(req);
        const config = normalizeSiemConfiguration(
          (await AppConfigService.getAppConfigByBrandAndKey(brand.id, 'siem')) ?? {}
        );
        const input: SiemTestInput = {
          destination: normalizeSiemDestination(body.destination),
          redaction: normalizeSiemRedaction('redaction' in body ? body.redaction : {}),
        };
        this.assertTestDestinationAllowed(input.destination, config);
        const resolvedInput = this.resolveMaskedTestDestinationSecrets(input, this.unmaskedSiemConfig(brand));
        let result: unknown;
        try {
          result = await this.siemForwardingService().testDestination(resolvedInput);
        } catch (error) {
          const message = sanitizeSiemTestResponse(this.getErrorMessage(error), resolvedInput.destination);
          throw new Error(typeof message === 'string' ? message : 'Destination test failed.');
        }
        return this.apiRespond(req, res, sanitizeSiemTestResponse(result, resolvedInput.destination), 200);
      } catch (error) {
        return this.respondError(req, res, error, 400);
      }
    }
  }
}
