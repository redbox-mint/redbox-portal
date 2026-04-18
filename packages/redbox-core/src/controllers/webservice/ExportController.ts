import {
  APIErrorResponse,
  BrandingModel,
  Controllers as controllers,
  validateApiRouteRequest,
  downloadRecsRoute,
} from '../../index';
import { default as util } from 'util';
import { default as stream } from 'stream';

const pipeline = util.promisify(stream.pipeline);
/**
 * Package that contains all Controllers.
 */
export namespace Controllers {
  /**
   * Responsible for exporting data
   *
   * Author: <a href='https://github.com/shilob' target='_blank'>Shilo Banihit</a>
   */
  export class Export extends controllers.Core.Controller {
    /**
     * Exported methods, accessible from internet.
     */
    protected override _exportedMethods: string[] = ['downloadRecs'];

    /**
     * @override
     */
    public async downloadRecs(req: Sails.Req, res: Sails.Res) {
      try {
        const validated = validateApiRouteRequest(req, downloadRecsRoute);
        if (!validated.valid) {
          return this.sendResp(req, res, {
            status: 400,
            displayErrors: validated.issues.map(i => ({ title: i.path, detail: i.message })),
            headers: this.getNoCacheHeaders(),
          });
        }
        const { params, query } = validated;
        const brand: BrandingModel = BrandingService.getBrand(req.session.branding as string);
        const format = params.format as string;
        const recType = query.recType as string;
        const before: string | null = _.isEmpty(query.before) ? null : (query.before as string);
        const after: string | null = _.isEmpty(query.after) ? null : (query.after as string);
        const filename: string = `${TranslationService.t(`${recType}-title`)} - Exported Records.${format}`;
        if (format == 'csv' || format == 'json') {
          res.set('Content-Type', `text/${format}`);
          sails.log.verbose('filename ' + filename);
          res.attachment(filename);
          await pipeline(
            RecordsService.exportAllPlans(
              req.user!.username,
              req.user!.roles as globalThis.Record<string, unknown>[],
              brand,
              format,
              before,
              after,
              recType
            ),
            res
          );
          return res;
        } else {
          const errorResponse = new APIErrorResponse('Unsupported export format');
          return this.sendResp(req, res, {
            status: 500,
            displayErrors: [{ title: errorResponse.message, detail: errorResponse.details }],
            headers: this.getNoCacheHeaders(),
          });
        }
      } catch (error: unknown) {
        const errorResponse = new APIErrorResponse(error instanceof Error ? error.message : String(error));
        return this.sendResp(req, res, {
          status: 500,
          displayErrors: [{ title: errorResponse.message, detail: errorResponse.details }],
          headers: this.getNoCacheHeaders(),
        });
      }
    }
  }
}
