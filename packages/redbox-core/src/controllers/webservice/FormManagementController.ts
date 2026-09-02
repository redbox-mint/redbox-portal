import {
  APIErrorResponse,
  ListAPIResponse,
  ListAPISummary,
  Controllers as controllers,
  getValidatedApiRequest,
  getFormRoute,
  listFormsRoute,
} from '../../index';
import { FormAttributes } from '../../waterline-models/Form';
import { BrandingModel } from '../../model/storage/BrandingModel';
import { firstValueFrom } from 'rxjs';
import type { RecordsService } from '../../RecordsService';

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
    protected override _exportedMethods: string[] = ['getForm', 'listForms'];

    /**
     **************************************************************************************************
     **************************************** Add custom methods **************************************
     **************************************************************************************************
     */

    public bootstrap() { }

    public async getForm(req: Sails.Req, res: Sails.Res) {
      try {
        const validated = getValidatedApiRequest(req);
        const { query } = validated;
        const name = query.name as string;
        const editable: boolean = query.editable !== 'false';
        const oid = typeof query.oid === 'string' ? query.oid.trim() : '';
        const requestedRecordType = typeof query.recordType === 'string' ? query.recordType.trim() : '';
        const targetStep = typeof query.targetStep === 'string' ? query.targetStep.trim() : undefined;
        const brand: BrandingModel =
          BrandingService.getBrandFromReq(req as Sails.ReqParamProvider) ?? BrandingService.getDefault();
        const form = await firstValueFrom(FormsService.getFormByName(name, editable, String(brand.id)));
        if (!form) {
          return this.sendResp(req, res, {
            status: 404,
            displayErrors: [{ title: 'Form not found' }],
            headers: this.getNoCacheHeaders(),
          });
        }
        let record = null;
        let recordContextResolved = !oid;
        if (oid) {
          try {
            const recordsService = sails.services.recordsservice as unknown as RecordsService;
            const loaded = await recordsService.getMeta(oid);
            const recordBrandId = String(loaded?.metaMetadata?.brandId ?? '').trim();
            if (recordBrandId === String(brand.id)) {
              record = loaded;
              recordContextResolved = true;
            }
          } catch (error: unknown) {
            const errorType = error instanceof Error ? error.name : typeof error;
            sails.log.warn(
              `Validation operation discovery record context could not be resolved (errorType=${errorType}).`
            );
            record = null;
          }
        }
        const validationOperations = recordContextResolved
          ? await FormsService.discoverValidationOperations({
              brand,
              form,
              recordType: record
                ? String(record.metaMetadata?.type ?? '')
                : requestedRecordType || String(form.configuration?.type ?? ''),
              record,
              user: req.user,
              editable,
              targetStep,
            })
          : [];
        return this.apiRespond(req, res, FormsService.toPublicForm(form, validationOperations), 200);
      } catch (error: unknown) {
        const errorResponse = new APIErrorResponse(this.getErrorMessage(error));
        return this.sendResp(req, res, {
          status: 500,
          displayErrors: [{ title: errorResponse.message, detail: errorResponse.details }],
          headers: this.getNoCacheHeaders(),
        });
      }
    }

    public async listForms(req: Sails.Req, res: Sails.Res) {
      try {
        const validated = getValidatedApiRequest(req);
        const brand: BrandingModel =
          BrandingService.getBrandFromReq(req as Sails.ReqParamProvider) ?? BrandingService.getDefault();
        const forms: FormAttributes[] = await firstValueFrom(FormsService.listForms(String(brand.id)));
        const response: ListAPIResponse<FormAttributes> = new ListAPIResponse();
        const summary: ListAPISummary = new ListAPISummary();
        summary.numFound = forms.length;
        response.summary = summary;
        response.records = forms.map(form => FormsService.toPublicForm(form));
        return this.apiRespond(req, res, response);
      } catch (error: unknown) {
        const errorResponse = new APIErrorResponse(this.getErrorMessage(error));
        return this.sendResp(req, res, {
          status: 500,
          displayErrors: [{ title: errorResponse.message, detail: errorResponse.details }],
          headers: this.getNoCacheHeaders(),
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
