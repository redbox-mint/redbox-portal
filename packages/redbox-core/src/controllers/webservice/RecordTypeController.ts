import {
  APIErrorResponse,
  BrandingModel,
  Controllers as controllers,
  ListAPIResponse,
  ListAPISummary,
  RecordTypeModel,
  getValidatedApiRequest,
  getRecordTypeRoute,
  listRecordTypesRoute,
} from '../../index';
import { firstValueFrom } from 'rxjs';
import { recordSchemaCreateResolverUrl } from '../../api-routes/record-schema-response';

export type DiscoverableRecordType = RecordTypeModel & {
  readonly recordSchemaCreateResolver?: string;
};

export namespace Controllers {
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
    protected override _exportedMethods: string[] = ['getRecordType', 'listRecordTypes'];

    /**
     **************************************************************************************************
     **************************************** Add custom methods **************************************
     **************************************************************************************************
     */

    public bootstrap() {}

    private publicRecordTypeName(recordType: RecordTypeModel, fallback?: string): string {
      const name = Reflect.get(recordType, 'name');
      return typeof name === 'string' && name.trim() ? name.trim() : (fallback?.trim() ?? '');
    }

    private discoverableRecordType(
      req: Sails.Req,
      recordType: RecordTypeModel,
      fallbackName?: string
    ): DiscoverableRecordType {
      if (sails.config.recordSchema?.enabled !== true) {
        return recordType;
      }
      const branding = BrandingService.getBrandNameFromReq(req).trim();
      const portal = BrandingService.getPortalFromReq(req).trim();
      const name = this.publicRecordTypeName(recordType, fallbackName);
      return {
        ...recordType,
        recordSchemaCreateResolver: recordSchemaCreateResolverUrl(
          branding,
          portal,
          name,
          BrandingService.getRootContext()
        ),
      };
    }

    public async getRecordType(req: Sails.Req, res: Sails.Res) {
      try {
        const validated = getValidatedApiRequest(req);
        const { query } = validated;
        const name = query.name as string;
        const brand: BrandingModel = BrandingService.getBrand(req.session.branding as string);
        const recordType = await firstValueFrom(RecordTypesService.get(brand, name));

        return this.apiRespond(req, res, this.discoverableRecordType(req, recordType, name), 200);
      } catch (error: unknown) {
        const errorResponse = new APIErrorResponse(this.getErrorMessage(error));
        return this.sendResp(req, res, {
          status: 500,
          displayErrors: [{ title: errorResponse.message, detail: errorResponse.details }],
          headers: this.getNoCacheHeaders(),
        });
      }
    }

    public async listRecordTypes(req: Sails.Req, res: Sails.Res) {
      try {
        const validated = getValidatedApiRequest(req);
        const brand: BrandingModel = BrandingService.getBrand(req.session.branding as string);
        const recordTypes: RecordTypeModel[] = await firstValueFrom(RecordTypesService.getAll(brand));
        const response: ListAPIResponse<DiscoverableRecordType> = new ListAPIResponse();
        const summary: ListAPISummary = new ListAPISummary();
        summary.numFound = recordTypes.length;
        response.summary = summary;
        response.records = recordTypes.map(recordType => this.discoverableRecordType(req, recordType));
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
