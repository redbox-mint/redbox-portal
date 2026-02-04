import { APIErrorResponse, BrandingModel, Controllers as controllers, ListAPIResponse, ListAPISummary } from '../../index';
import { firstValueFrom } from 'rxjs';


export module Controllers {
  /**
   * Responsible for all things related to the Dashboard
   *
   * @author <a target='_' href='https://github.com/andrewbrazzatti'>Andrew Brazzatti</a>
   */
  export class RecordType extends controllers.Core.Controller {
    private getErrorMessage(error: unknown): string {
      return error instanceof Error ? error.message : String(error);
    }

    /**
     * Exported methods, accessible from internet.
     */
    protected override _exportedMethods: any = [
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

    public async getRecordType(req: Sails.Req, res: Sails.Res) {

      try {
        let name = req.param('name');
        const brand: BrandingModel = BrandingService.getBrand(req.session.branding);
        let recordType = await firstValueFrom(RecordTypesService.get(brand, name));

        return this.apiRespond(req, res, recordType, 200)
      } catch (error: unknown) {
        const errorResponse = new APIErrorResponse(this.getErrorMessage(error));
        return this.sendResp(req, res, {
          status: 500,
          displayErrors: [{ title: errorResponse.message, detail: errorResponse.details }],
          headers: this.getNoCacheHeaders()
        });
      }
    }

    public async listRecordTypes(req: Sails.Req, res: Sails.Res) {
      try {
        const brand: BrandingModel = BrandingService.getBrand(req.session.branding);
        let recordTypes: any[] = await firstValueFrom(RecordTypesService.getAll(brand));
        let response: ListAPIResponse<any> = new ListAPIResponse();
        let summary: ListAPISummary = new ListAPISummary();
        summary.numFound = recordTypes.length;
        response.summary = summary;
        response.records = recordTypes;
        return this.apiRespond(req, res, response);
      } catch (error: unknown) {
        const errorResponse = new APIErrorResponse(this.getErrorMessage(error));
        return this.sendResp(req, res, {
          status: 500,
          displayErrors: [{ title: errorResponse.message, detail: errorResponse.details }],
          headers: this.getNoCacheHeaders()
        });
      }
    }


    /**
     **************************************************************************************************
     **************************************** Override magic methods **********************************
     **************************************************************************************************
     */
  }
}
