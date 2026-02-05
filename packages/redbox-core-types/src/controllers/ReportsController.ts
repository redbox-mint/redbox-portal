import { Controllers as controllers } from '../CoreController';
import { BrandingModel } from '../model';
import { from } from 'rxjs';


export module Controllers {
  /**
   * Responsible for all things related to the Dashboard
   *
   * @author <a target='_' href='https://github.com/andrewbrazzatti'>Andrew Brazzatti</a>
   */
  export class Reports extends controllers.Core.Controller {


    /**
     * Exported methods, accessible from internet.
     */
    protected override _exportedMethods: any = [
        'render'
    ];

    /**
     **************************************************************************************************
     **************************************** Add custom methods **************************************
     **************************************************************************************************
     */

    public bootstrap() {

    }

    public render(req: Sails.Req, res: Sails.Res) {
      const brand:BrandingModel = BrandingService.getBrand(req.session.branding);

      from(ReportsService.findAllReportsForBrand(brand)).subscribe(reports => {
        req.options.locals["reports"] = reports;
        return this.sendView(req, res, 'admin/reports');
      });
    }



    /**
     **************************************************************************************************
     **************************************** Override magic methods **********************************
     **************************************************************************************************
     */
  }
}
