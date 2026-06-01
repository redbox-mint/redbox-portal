import {
  APIErrorResponse,
  BrandingModel,
  Controllers as controllers,
  HarvestRunService as HarvestRunServiceContract,
  ListAPIResponse,
  getValidatedApiRequest,
} from '../../index';

declare const HarvestRunService: HarvestRunServiceContract;

export namespace Controllers {
  export class HarvestRun extends controllers.Core.Controller {
    protected override _exportedMethods: string[] = ['listRuns', 'getRun', 'listRunEvents'];

    private parsePageSize(value: unknown): number {
      return Math.min(this.parsePositiveInt(value, 'pageSize') ?? 20, 100);
    }

    private parseDate(value: unknown, fieldName: string): Date | undefined {
      if (_.isEmpty(value)) {
        return undefined;
      }
      const parsed = new Date(String(value));
      if (Number.isNaN(parsed.getTime())) {
        throw new APIErrorResponse(`Invalid ${fieldName} parameter.`);
      }
      return parsed;
    }

    private parsePositiveInt(value: unknown, fieldName: string): number | undefined {
      if (_.isEmpty(value)) {
        return undefined;
      }
      const parsed = Number.parseInt(String(value), 10);
      if (!Number.isInteger(parsed) || parsed <= 0) {
        throw new APIErrorResponse(`Invalid ${fieldName} parameter.`);
      }
      return parsed;
    }

    public async listRuns(req: Sails.Req, res: Sails.Res) {
      try {
        const brand: BrandingModel = BrandingService.getBrand(req.session.branding!);
        const validated = getValidatedApiRequest(req);
        const { query } = validated;
        const page = this.parsePositiveInt(query.page, 'page') ?? 1;
        const pageSize = this.parsePageSize(query.pageSize);

        const result = await HarvestRunService.listRuns(brand, {
          brandId: String(brand.id ?? ''),
          status: query.status as string | undefined,
          recordType: query.recordType as string | undefined,
          sourceName: query.sourceName as string | undefined,
          dateFrom: this.parseDate(query.dateFrom, 'dateFrom'),
          dateTo: this.parseDate(query.dateTo, 'dateTo'),
          page,
          pageSize,
        });

        const response = new ListAPIResponse<typeof result.rows[number]>();
        response.summary.numFound = result.total;
        response.summary.page = page;
        response.summary.start = (page - 1) * pageSize;
        response.records = result.rows;
        return this.apiRespond(req, res, response, 200);
      } catch (error) {
        const errorResponse = error instanceof APIErrorResponse ? error : new APIErrorResponse(error instanceof Error ? error.message : String(error));
        return this.sendResp(req, res, {
          status: error instanceof APIErrorResponse ? 400 : 500,
          displayErrors: [{ detail: errorResponse.message }],
          headers: this.getNoCacheHeaders(),
        });
      }
    }

    public async getRun(req: Sails.Req, res: Sails.Res) {
      try {
        const brand: BrandingModel = BrandingService.getBrand(req.session.branding!);
        const validated = getValidatedApiRequest(req);
        const runId = String(validated.params.id ?? '').trim();
        if (_.isEmpty(runId)) {
          return this.sendResp(req, res, {
            status: 400,
            displayErrors: [{ detail: 'Run id is required.' }],
            headers: this.getNoCacheHeaders(),
          });
        }

        const result = await HarvestRunService.getRun(brand, runId);
        if (!result) {
          return this.sendResp(req, res, {
            status: 404,
            displayErrors: [{ detail: 'Harvest run not found.' }],
            headers: this.getNoCacheHeaders(),
          });
        }
        return this.apiRespond(req, res, result, 200);
      } catch (error) {
        const errorResponse = new APIErrorResponse(error instanceof Error ? error.message : String(error));
        return this.sendResp(req, res, {
          status: 500,
          displayErrors: [{ detail: errorResponse.message }],
          headers: this.getNoCacheHeaders(),
        });
      }
    }

    public async listRunEvents(req: Sails.Req, res: Sails.Res) {
      try {
        const brand: BrandingModel = BrandingService.getBrand(req.session.branding!);
        const validated = getValidatedApiRequest(req);
        const runId = String(validated.params.id ?? '').trim();
        if (_.isEmpty(runId)) {
          return this.sendResp(req, res, {
            status: 400,
            displayErrors: [{ detail: 'Run id is required.' }],
            headers: this.getNoCacheHeaders(),
          });
        }

        const runExists = await HarvestRunService.runExists(brand, runId);
        if (!runExists) {
          return this.sendResp(req, res, {
            status: 404,
            displayErrors: [{ detail: 'Harvest run not found.' }],
            headers: this.getNoCacheHeaders(),
          });
        }

        const { query } = validated;
        const page = this.parsePositiveInt(query.page, 'page') ?? 1;
        const pageSize = this.parsePageSize(query.pageSize);
        const result = await HarvestRunService.listRunEvents(brand, runId, {
          runId,
          brandId: String(brand.id ?? ''),
          outcome: query.outcome as string | undefined,
          operation: query.operation as string | undefined,
          harvestId: query.harvestId as string | undefined,
          oid: query.oid as string | undefined,
          page,
          pageSize,
        });

        const response = new ListAPIResponse<typeof result.rows[number]>();
        response.summary.numFound = result.total;
        response.summary.page = page;
        response.summary.start = (page - 1) * pageSize;
        response.records = result.rows;
        return this.apiRespond(req, res, response, 200);
      } catch (error) {
        const errorResponse = error instanceof APIErrorResponse ? error : new APIErrorResponse(error instanceof Error ? error.message : String(error));
        return this.sendResp(req, res, {
          status: error instanceof APIErrorResponse ? 400 : 500,
          displayErrors: [{ detail: errorResponse.message }],
          headers: this.getNoCacheHeaders(),
        });
      }
    }
  }
}
