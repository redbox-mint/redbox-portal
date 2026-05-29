import { Controllers as controllers } from '../CoreController';
import { BrandingModel } from '../model';
import { from } from 'rxjs';


export namespace Controllers {
  /**
   * Responsible for all things related to the Dashboard
   *
   * @author <a target='_' href='https://github.com/andrewbrazzatti'>Andrew Brazzatti</a>
   */
  export class Reports extends controllers.Core.Controller {


    /**
     * Exported methods, accessible from internet.
     */
    protected override _exportedMethods: string[] = [
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
      const brand:BrandingModel = BrandingService.getBrand(req.session.branding as string);

      from(ReportsService.findAllReportsForBrand(brand)).subscribe(reports => {
        const locals = req.options!.locals as globalThis.Record<string, unknown>;
        locals["reports"] = reports;
        locals["isAdmin"] = this.isBrandAdmin(req, brand);
        return this.sendView(req, res, 'admin/reports');
      });
    }

    private isBrandAdmin(req: Sails.Req, brand: BrandingModel): boolean {
      const roles = (req.user?.roles ?? []) as Array<{ name?: string; branding?: string | { id?: string } }>;
      return roles.some(role => {
        const roleBranding = role?.branding;
        const roleBrandId = typeof roleBranding === 'string' ? roleBranding : roleBranding?.id;
        return role?.name === 'Admin' && roleBrandId === brand.id;
      });
    }



    /**
     **************************************************************************************************
     **************************************** Override magic methods **********************************
     **************************************************************************************************
     */
  }
}
