import {
  APIErrorResponse,
  BrandingModel,
  Controllers as controllers,
  getValidatedApiRequest,
  executeNamedQueryRoute,
} from '../../index';
import type { ReportConfigDto } from '../../services/ReportsService';

export namespace Controllers {
  /**
   * Responsible for all things related to the Dashboard
   *
   * @author <a target='_' href='https://github.com/andrewbrazzatti'>Andrew Brazzatti</a>
   */
  export class Report extends controllers.Core.Controller {
    /**
     * Exported methods, accessible from internet.
     */
    protected override _exportedMethods: string[] = [
      'executeNamedQuery',
      'listConfigs',
      'getConfig',
      'createConfig',
      'updateConfig',
      'deleteConfig',
      'previewConfig',
    ];

    /**
     **************************************************************************************************
     **************************************** Add custom methods **************************************
     **************************************************************************************************
     */

    public bootstrap() {}

    public async executeNamedQuery(req: Sails.Req, res: Sails.Res) {
      try {
        const validated = getValidatedApiRequest(req);
        const { query } = validated;
        const brand: BrandingModel = BrandingService.getBrand(req.session.branding as string);
        const queryName = query.queryName as string;
        this.updateChronicle(req, {namedQueryName: queryName});
        const namedQuery = await NamedQueryService.getNamedQueryConfig(brand, queryName);
        if (!namedQuery) {
          return this.sendResp(req, res, {
            status: 400,
            displayErrors: [{ detail: "Named query not found" }],
            headers: this.getNoCacheHeaders(),
          });
        }

        let start = 0;
        let rows = 10;
        if (!_.isEmpty(query.start)) {
          start = _.toNumber(query.start);
        }
        if (!_.isEmpty(query.rows)) {
          rows = _.toNumber(query.rows);
        }
        this.updateChronicle(req, {namedQueryPagingStart: start, namedQueryPagingRows: rows});
        if (rows > 100) {
          return this.sendResp(req, res, {
            status: 400,
            displayErrors: [{ detail: "Rows must not be greater than 100" }],
            headers: this.getNoCacheHeaders(),
          });
        }
        const paramMap = _.clone(query);
        const response = await NamedQueryService.performNamedQueryFromConfig(namedQuery, paramMap, brand, start, rows);
        this.updateChronicle(req, {namedQueryResponse: response});
        return this.sendResp(req, res, {
          data: response,
          status: 200,
          headers: this.getNoCacheHeaders(),
        });
      } catch (error: unknown) {
        return this.sendResp(req, res, {
          status: 500,
          errors: [error],
          headers: this.getNoCacheHeaders(),
        });
      }
    }

    public async listConfigs(req: Sails.Req, res: Sails.Res) {
      try {
        const brand: BrandingModel = BrandingService.getBrand(req.session.branding as string);
        return this.sendResp(req, res, {
          data: await ReportsService.listConfigs(brand),
          status: 200,
          headers: this.getNoCacheHeaders(),
        });
      } catch (error: unknown) {
        return this.sendReportConfigError(req, res, error);
      }
    }

    public async getConfig(req: Sails.Req, res: Sails.Res) {
      try {
        const validated = getValidatedApiRequest(req);
        const brand: BrandingModel = BrandingService.getBrand(req.session.branding as string);
        const report = await ReportsService.getConfig(brand, validated.params.name as string);
        if (!report) {
          const errorResponse = new APIErrorResponse('Report not found');
          return this.sendResp(req, res, {
            status: 404,
            displayErrors: [{ title: errorResponse.message, detail: errorResponse.details }],
            headers: this.getNoCacheHeaders(),
          });
        }
        return this.sendResp(req, res, { data: report, status: 200, headers: this.getNoCacheHeaders() });
      } catch (error: unknown) {
        return this.sendReportConfigError(req, res, error);
      }
    }

    public async createConfig(req: Sails.Req, res: Sails.Res) {
      try {
        const validated = getValidatedApiRequest(req);
        const brand: BrandingModel = BrandingService.getBrand(req.session.branding as string);
        return this.sendResp(req, res, {
          data: await ReportsService.createConfig(brand, validated.body as ReportConfigDto),
          status: 201,
          headers: this.getNoCacheHeaders(),
        });
      } catch (error: unknown) {
        return this.sendReportConfigError(req, res, error);
      }
    }

    public async updateConfig(req: Sails.Req, res: Sails.Res) {
      try {
        const validated = getValidatedApiRequest(req);
        const brand: BrandingModel = BrandingService.getBrand(req.session.branding as string);
        return this.sendResp(req, res, {
          data: await ReportsService.updateConfig(
            brand,
            validated.params.name as string,
            validated.body as ReportConfigDto
          ),
          status: 200,
          headers: this.getNoCacheHeaders(),
        });
      } catch (error: unknown) {
        return this.sendReportConfigError(req, res, error);
      }
    }

    public async deleteConfig(req: Sails.Req, res: Sails.Res) {
      try {
        const validated = getValidatedApiRequest(req);
        const brand: BrandingModel = BrandingService.getBrand(req.session.branding as string);
        return this.sendResp(req, res, {
          data: await ReportsService.deleteConfig(brand, validated.params.name as string),
          status: 200,
          headers: this.getNoCacheHeaders(),
        });
      } catch (error: unknown) {
        return this.sendReportConfigError(req, res, error);
      }
    }

    public async previewConfig(req: Sails.Req, res: Sails.Res) {
      try {
        const validated = getValidatedApiRequest(req);
        const brand: BrandingModel = BrandingService.getBrand(req.session.branding as string);
        return this.sendResp(req, res, {
          data: await ReportsService.previewConfig(brand, validated.body as ReportConfigDto, req),
          status: 200,
          headers: this.getNoCacheHeaders(),
        });
      } catch (error: unknown) {
        return this.sendReportConfigError(req, res, error);
      }
    }

    private sendReportConfigError(req: Sails.Req, res: Sails.Res, error: unknown) {
      sails.log.error(`report config error: ${error}`);
      const status =
        typeof error === 'object' && error !== null && 'status' in error
          ? Number((error as { status: number }).status)
          : 500;
      const errorResponse = new APIErrorResponse(error instanceof Error ? error.message : String(error));
      return this.sendResp(req, res, {
        status,
        displayErrors: [{ title: errorResponse.message, detail: errorResponse.details }],
        headers: this.getNoCacheHeaders(),
      });
    }

    /**
     **************************************************************************************************
     **************************************** Override magic methods **********************************
     **************************************************************************************************
     */
  }
}
