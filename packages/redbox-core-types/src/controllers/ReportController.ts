import { Controllers as controllers } from '../CoreController';
import { BrandingModel } from '../model';
import { from } from 'rxjs';

declare var sails: any;
declare var BrandingService: any;
declare var ReportsService: any;

export module Controllers {
  /**
   * Responsible for all things related to the Dashboard
   *
   * @author <a target='_' href='https://github.com/andrewbrazzatti'>Andrew Brazzatti</a>
   */
  export class Report extends controllers.Core.Controller {


    /**
     * Exported methods, accessible from internet.
     */
    protected _exportedMethods: any = [
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

    public render(req, res) {
      return this.sendView(req, res, 'admin/report');
    }

    public async get(req, res) {
      const brand: BrandingModel = BrandingService.getBrand(req.session.branding);
      const report: any = await ReportsService.get(brand, req.param('name'));
      return this.ajaxOk(req, res, null, ReportsService.getReportDto(report));
    }

    public getResults(req, res) {
      const brand: BrandingModel = BrandingService.getBrand(req.session.branding);
      var response = from(ReportsService.getResults(brand, req.param('name'), req, req.param('start'), req.param('rows')));
      return response.subscribe(responseObject => {
        if (responseObject) {
          let response: any = responseObject;
          response.success = true;
          this.ajaxOk(req, res, null, response);
        } else {
          this.ajaxFail(req, res, null, responseObject);
        }
      }, error => {
        sails.log.error("Error updating meta:");
        sails.log.error(error);
        this.ajaxFail(req, res, error.message);
      });;
    }

    public async downloadCSV(req, res) {
      try {
        const brand: BrandingModel = BrandingService.getBrand(req.session.branding);

        var results = await ReportsService.getCSVResult(brand, req.param('name'), req);
        let fileName = req.param('name') + '.csv';
        sails.log.verbose("fileName " + fileName);
        res.attachment(fileName);
        res.set('Content-Type', 'text/csv');
        res.status(200).send(results);
        return res
      } catch (error) {
        sails.log.error(error);
        this.ajaxFail(req, res, error.message);
      }
    }

    /**
     **************************************************************************************************
     **************************************** Override magic methods **********************************
     **************************************************************************************************
     */
  }
}
