import {
  APIErrorResponse,
  BrandingModel,
  Controllers as controllers,
  getValidatedApiRequest,
  executeNamedQueryRoute,
} from '../../index';
import { Services as ReportServices, type ReportConfigDto } from '../../services/ReportsService';
import { summarizeChronicleValue } from '../../utilities/RequestChronicle';
import type { FormRecordAccessContext } from '../../services/FormsService';
import {
  boundedJsonBytes,
  NAMED_QUERY_PREVIEW_LIMITS,
  NamedQueryAssistanceError,
} from '../../utilities/NamedQueryPreview';
import { FieldDescriptionError } from '../../services/FieldDescriptionsService';

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
      'validateConfig',
      'describeQuery',
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
        this.updateChronicle(req, { namedQueryName: queryName });
        const namedQuery = await NamedQueryService.getNamedQueryConfig(brand, queryName);
        if (!namedQuery) {
          return this.sendResp(req, res, {
            status: 400,
            displayErrors: [{ title: 'Named query not found' }],
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
        this.updateChronicle(req, { namedQueryPagingStart: start, namedQueryPagingRows: rows });
        if (rows > 100) {
          return this.sendResp(req, res, {
            status: 400,
            displayErrors: [{ title: 'Rows must not be greater than 100' }],
            headers: this.getNoCacheHeaders(),
          });
        }
        const paramMap = _.clone(query);
        const response = await NamedQueryService.performNamedQueryFromConfig(namedQuery, paramMap, brand, start, rows);
        this.updateChronicle(req, { namedQueryResponse: summarizeChronicleValue(response) });
        return this.sendResp(req, res, {
          data: response,
          status: 200,
          headers: this.getNoCacheHeaders(),
        });
      } catch (error: unknown) {
        return this.sendResp(req, res, {
          status: 500,
          // Retain the existing client-facing message; the full error is recorded in the request chronicle.
          displayErrors: [{ title: error instanceof Error ? error.message : String(error) }],
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
      return this.assistance(req, res, (brand, portal, caller) =>
        ReportsService.previewConfig(brand, getValidatedApiRequest(req).body as ReportConfigDto, {
          param: (name: string) => req.query?.[name],
        }, {
          portal,
          caller,
        })
      );
    }

    public validateConfig(req: Sails.Req, res: Sails.Res) {
      return this.assistance(req, res, (brand, portal, caller) =>
        ReportsService.validateConfig(brand, portal, caller, getValidatedApiRequest(req).body)
      );
    }

    public describeQuery(req: Sails.Req, res: Sails.Res) {
      return this.assistance(req, res, (brand, portal, caller) => {
        const { params, query } = getValidatedApiRequest(req);
        return ReportsService.describeQuery(
          brand,
          portal,
          caller,
          String(params.name),
          String(query.property ?? ''),
          query.multivalue === 'true',
          query.recordType
            ? { recordType: String(query.recordType), ...(query.stage ? { stage: String(query.stage) } : {}) }
            : undefined
        );
      });
    }

    private async assistance(
      req: Sails.Req,
      res: Sails.Res,
      action: (brand: BrandingModel, portal: string, caller: FormRecordAccessContext) => Promise<unknown>
    ) {
      const headers = { ...this.getNoCacheHeaders(), 'Cache-Control': 'no-store' };
      try {
        const brand = BrandingService.getBrand(req.session.branding as string);
        const data = await action(brand, String(req.param('portal') ?? ''), {
          brand,
          user: req.user,
        } as unknown as FormRecordAccessContext);
        if (
          boundedJsonBytes({ data }, NAMED_QUERY_PREVIEW_LIMITS.responseBytes) >
          NAMED_QUERY_PREVIEW_LIMITS.responseBytes
        )
          throw new NamedQueryAssistanceError('RESPONSE_LIMIT', 413);
        return this.sendResp(req, res, { data, status: 200, headers });
      } catch (error) {
        const known = error instanceof NamedQueryAssistanceError || error instanceof FieldDescriptionError;
        const reportError = error instanceof ReportServices.ReportConfigServiceError;
        const code = known ? error.code : reportError ? 'INVALID_REPORT' : 'ASSISTANCE_UNAVAILABLE';
        const status =
          error instanceof NamedQueryAssistanceError || reportError
            ? error.status
            : known
              ? error.code === 'FORBIDDEN'
                ? 403
                : 400
              : 500;
        return this.sendResp(req, res, { status, displayErrors: [{ code, status: String(status) }], headers });
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
