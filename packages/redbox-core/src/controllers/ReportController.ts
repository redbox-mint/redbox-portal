import { Controllers as controllers } from '../CoreController';
import { BrandingModel, ReportModel } from '../model';
import { from } from 'rxjs';
import {RequestChronicleHelper} from "../utilities/RequestChronicle";


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
      'downloadCSV'
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
      const start = Number(req.param('start'));
      const rows = Number(req.param('rows'));

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

    /**
     **************************************************************************************************
     **************************************** Override magic methods **********************************
     **************************************************************************************************
     */
  }
}
