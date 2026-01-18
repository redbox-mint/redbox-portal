import { APIErrorResponse, BrandingModel, Controllers as controllers, ListAPIResponse, ListAPISummary } from '../../index';
import { firstValueFrom } from 'rxjs';

declare var BrandingService: any;
declare var RecordTypesService: any;

export module Controllers {
  /**
   * Responsible for all things related to the Dashboard
   *
   * @author <a target='_' href='https://github.com/andrewbrazzatti'>Andrew Brazzatti</a>
   */
  export class RecordType extends controllers.Core.Controller {

    /**
     * Exported methods, accessible from internet.
     */
    protected _exportedMethods: any = [
      'getRecordType',
      'listRecordTypes'
    ];

    /**
     **************************************************************************************************
     **************************************** Add custom methods **************************************
     **************************************************************************************************
     */

    public bootstrap() {

    }

    public async getRecordType(req, res) {

      try {
        let name = req.param('name');
        const brand: BrandingModel = BrandingService.getBrand(req.session.branding);
        let recordType = await firstValueFrom(RecordTypesService.get(brand, name));

        return this.apiRespond(req, res, recordType, 200)
      } catch (error) {
        this.apiFail(req, res, 500, new APIErrorResponse(error.message));
      }
    }

    public async listRecordTypes(req, res) {
      try {
        const brand: BrandingModel = BrandingService.getBrand(req.session.branding);
        let recordTypes: any[] = await firstValueFrom(RecordTypesService.getAll(brand));
        let response: ListAPIResponse<any> = new ListAPIResponse();
        let summary: ListAPISummary = new ListAPISummary();
        summary.numFound = recordTypes.length;
        response.summary = summary;
        response.records = recordTypes;
        this.apiRespond(req, res, response);
      } catch (error) {
        this.apiFail(req, res, 500, new APIErrorResponse(error.message));
      }
    }


    /**
     **************************************************************************************************
     **************************************** Override magic methods **********************************
     **************************************************************************************************
     */
  }
}
