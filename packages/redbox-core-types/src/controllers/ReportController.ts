import { Controllers as controllers } from '../CoreController';
import { BrandingModel } from '../model';
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
    protected override _exportedMethods: any = [
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
      const brand: BrandingModel = BrandingService.getBrand(req.session.branding);
      const report: any = await ReportsService.get(brand, req.param('name'));
      return this.sendResp(req, res, { data: ReportsService.getReportDto(report), headers: this.getNoCacheHeaders() });
    }

    public getResults(req: Sails.Req, res: Sails.Res) {
      const brand: BrandingModel = BrandingService.getBrand(req.session.branding);
      const response = from(ReportsService.getResults(brand, req.param('name'), req, req.param('start'), req.param('rows')));
      return response.subscribe((responseObject: any) => {
        if (responseObject) {
          const response: any = responseObject;
          response.success = true;
          this.sendResp(req, res, { data: response, headers: this.getNoCacheHeaders() });
        } else {
          const payload = responseObject ?? { status: false, message: null };
          this.sendResp(req, res, { data: payload, headers: this.getNoCacheHeaders() });
        }
      }, (error: unknown) => {
        sails.log.error("Error updating meta:");
        sails.log.error(error);
        const message = error instanceof Error ? error.message : String(error);
        this.sendResp(req, res, { data: { status: false, message }, headers: this.getNoCacheHeaders() });
      });;
    }

    public async downloadCSV(req: Sails.Req, res: Sails.Res) {
      try {
        const brand: BrandingModel = BrandingService.getBrand(req.session.branding);

        const results = await ReportsService.getCSVResult(brand, req.param('name'), req);
        const fileName = req.param('name') + '.csv';
        sails.log.verbose("fileName " + fileName);
        res.attachment(fileName);
        res.set('Content-Type', 'text/csv');
        res.status(200).send(results);
        return res
      } catch (error: unknown) {
        sails.log.error(error);
        const message = error instanceof Error ? error.message : String(error);
        return this.sendResp(req, res, { data: { status: false, message }, headers: this.getNoCacheHeaders() });
      }
    }

    /**
     **************************************************************************************************
     **************************************** Override magic methods **********************************
     **************************************************************************************************
     */
  }
}
