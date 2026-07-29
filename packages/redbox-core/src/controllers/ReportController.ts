import { Controllers as controllers } from '../CoreController';
import { BrandingModel, ReportModel } from '../model';
import { from } from 'rxjs';


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
      'render',
      'get',
      'getResults',
      'downloadCSV',
      'listConfigs',
      'getConfig',
      'createConfig',
      'updateConfig',
      'deleteConfig',
      'previewConfig'
    ];

    /**
     **************************************************************************************************
     **************************************** Add custom methods **************************************
     **************************************************************************************************
     */

    public bootstrap() {

    }

    public render(req: Sails.Req, res: Sails.Res) {
      return this.sendView(req, res, 'admin/report');
    }

    public async get(req: Sails.Req, res: Sails.Res) {
      const brand: BrandingModel = BrandingService.getBrand(req.session.branding as string);
      const name = req.param('name');

      this.updateChronicle(req, {reportName: name});

      const report = await ReportsService.get(brand, name) as unknown as ReportModel;
      return this.sendResp(req, res, {data: ReportsService.getReportDto(report), headers: this.getNoCacheHeaders()});
    }

    public getResults(req: Sails.Req, res: Sails.Res) {
      const brand: BrandingModel = BrandingService.getBrand(req.session.branding as string);
      const name = req.param('name');
      const start = this.getNumber(req.param('start'), 0);
      const rows = this.getNumber(req.param('rows'), 10);

      this.updateChronicle(req, {reportName: name, reportPagingStart: start, reportPagingRows: rows});

      // TODO: Passing the full req object to the service layer is not ideal. We should refactor this to only pass the necessary parameters to avoid tight coupling between the controller and service layers.
      const response = from(ReportsService.getResults(brand, name, req, start, rows));
      return response.subscribe((responseObject: unknown) => {
        if (responseObject) {
          const response = responseObject as globalThis.Record<string, unknown>;
          response.success = true;
          this.sendResp(req, res, {
            data: response,
            headers: this.getNoCacheHeaders(),
            chronicle: {
              reportResultPage: {
                total: response.total,
                pageNum: response.pageNum,
                recordPerPage: response.recordPerPage,
                recordCount: (response.records as unknown[])?.length ?? 0,
                success: response.success,
              }
            },
          });
        } else {
          const payload = responseObject ?? { status: false, message: null };
          this.sendResp(req, res, {
            data: payload,
            headers: this.getNoCacheHeaders(),
            chronicle: {reportResultPage: payload},
          });
        }
      }, (error: unknown) => {
        const message = error instanceof Error ? error.message : String(error);
        this.sendResp(req, res, { data: { status: false, message }, headers: this.getNoCacheHeaders(), errors: [error]});
      });
    }

    public async downloadCSV(req: Sails.Req, res: Sails.Res) {
      try {
        const brand: BrandingModel = BrandingService.getBrand(req.session.branding as string);

        const name = req.param('name');

        this.updateChronicle(req, {reportName: name});

        const results = await ReportsService.getCSVResult(brand, name, { param: (name: string) => req.param(name) as string | undefined | null });
        const fileName = name + '.csv';
        this.updateChronicle(req, {reportDownloadFilename: fileName});

        res.attachment(fileName);
        res.set('Content-Type', 'text/csv');
        res.status(200).send(results);
        return res
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return this.sendResp(req, res, { data: { status: false, message }, headers: this.getNoCacheHeaders(), errors: [error] });
      }
    }

    public async listConfigs(req: Sails.Req, res: Sails.Res) {
      try {
        const brand = BrandingService.getBrand(req.session.branding as string);
        return this.sendResp(req, res, { data: await ReportsService.listConfigs(brand), headers: this.getNoCacheHeaders() });
      } catch (error: unknown) {
        return this.sendReportConfigError(req, res, error);
      }
    }

    public async getConfig(req: Sails.Req, res: Sails.Res) {
      try {
        const brand = BrandingService.getBrand(req.session.branding as string);
        const report = await ReportsService.getConfig(brand, req.param('name'));
        if (!report) {
          return this.sendResp(req, res, { status: 404, data: { status: false, message: 'Report not found' }, headers: this.getNoCacheHeaders() });
        }
        return this.sendResp(req, res, { data: report, headers: this.getNoCacheHeaders() });
      } catch (error: unknown) {
        return this.sendReportConfigError(req, res, error);
      }
    }

    public async createConfig(req: Sails.Req, res: Sails.Res) {
      try {
        const brand = BrandingService.getBrand(req.session.branding as string);
        const report = await ReportsService.createConfig(brand, req.body);
        return this.sendResp(req, res, { status: 201, data: report, headers: this.getNoCacheHeaders() });
      } catch (error: unknown) {
        return this.sendReportConfigError(req, res, error);
      }
    }

    public async updateConfig(req: Sails.Req, res: Sails.Res) {
      try {
        const brand = BrandingService.getBrand(req.session.branding as string);
        const report = await ReportsService.updateConfig(brand, req.param('name'), req.body);
        return this.sendResp(req, res, { data: report, headers: this.getNoCacheHeaders() });
      } catch (error: unknown) {
        return this.sendReportConfigError(req, res, error);
      }
    }

    public async deleteConfig(req: Sails.Req, res: Sails.Res) {
      try {
        const brand = BrandingService.getBrand(req.session.branding as string);
        return this.sendResp(req, res, { data: await ReportsService.deleteConfig(brand, req.param('name')), headers: this.getNoCacheHeaders() });
      } catch (error: unknown) {
        return this.sendReportConfigError(req, res, error);
      }
    }

    public async previewConfig(req: Sails.Req, res: Sails.Res) {
      try {
        const brand = BrandingService.getBrand(req.session.branding as string);
        const params = { param: (name: string) => req.param(name) as string | undefined | null };
        return this.sendResp(req, res, { data: await ReportsService.previewConfig(brand, req.body, params), headers: this.getNoCacheHeaders() });
      } catch (error: unknown) {
        return this.sendReportConfigError(req, res, error);
      }
    }

    private sendReportConfigError(req: Sails.Req, res: Sails.Res, error: unknown) {
      sails.log.error(error);
      const status = typeof error === 'object' && error !== null && 'status' in error ? Number((error as { status: number }).status) : 500;
      const message = error instanceof Error ? error.message : String(error);
      return this.sendResp(req, res, { status, data: { status: false, message }, headers: this.getNoCacheHeaders() });
    }

    /**
     **************************************************************************************************
     **************************************** Override magic methods **********************************
     **************************************************************************************************
     */
  }
}
