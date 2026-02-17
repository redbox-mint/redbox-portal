import { APIErrorResponse, ListAPIResponse, ListAPISummary, Controllers as controllers } from '../../index';
import { FormAttributes } from '../../waterline-models/Form';
import { BrandingModel } from '../../model/storage/BrandingModel';
import { firstValueFrom } from 'rxjs';

type BrandReqLike = { params?: globalThis.Record<string, unknown>; body?: globalThis.Record<string, unknown>; session?: globalThis.Record<string, unknown> };

export namespace Controllers {
  /**
   * Responsible for all things related to the Dashboard
   *
   * @author <a target='_' href='https://github.com/andrewbrazzatti'>Andrew Brazzatti</a>
   */
  export class FormManagement extends controllers.Core.Controller {
    private getErrorMessage(error: unknown): string {
      return error instanceof Error ? error.message : String(error);
    }

    /**
     * Exported methods, accessible from internet.
     */
    protected override _exportedMethods: string[] = [
      'getForm',
      'listForms'
    ];

    /**
     **************************************************************************************************
     **************************************** Add custom methods **************************************
     **************************************************************************************************
     */

    public bootstrap() {

    }

    public async getForm(req: Sails.Req, res: Sails.Res) {
      try {
        const name: string = req.param('name');
        const editableParam = req.param('editable');
        const editable: boolean = editableParam !== 'false';
        const brand: BrandingModel = BrandingService.getBrandFromReq(req as Sails.ReqParamProvider) ?? BrandingService.getDefault();
        const form = await firstValueFrom(FormsService.getFormByName(name, editable, String(brand.id)));
        if (!form) {
          return this.sendResp(req, res, {
            status: 404,
            displayErrors: [{ title: 'Form not found' }],
            headers: this.getNoCacheHeaders()
          });
        }
        return this.apiRespond(req, res, form, 200)
      } catch (error: unknown) {
        const errorResponse = new APIErrorResponse(this.getErrorMessage(error));
        return this.sendResp(req, res, {
          status: 500,
          displayErrors: [{ title: errorResponse.message, detail: errorResponse.details }],
          headers: this.getNoCacheHeaders()
        });
      }
    }

    public async listForms(req: Sails.Req, res: Sails.Res) {
      try {
        const brand: BrandingModel = BrandingService.getBrandFromReq(req as Sails.ReqParamProvider) ?? BrandingService.getDefault();
        const forms: FormAttributes[] = await firstValueFrom(FormsService.listForms(String(brand.id)));
        const response: ListAPIResponse<FormAttributes> = new ListAPIResponse();
        const summary: ListAPISummary = new ListAPISummary();
        summary.numFound = forms.length;
        response.summary = summary;
        response.records = forms;
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
