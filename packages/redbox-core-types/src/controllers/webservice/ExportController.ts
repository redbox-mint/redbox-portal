import { APIErrorResponse, BrandingModel, Controllers as controllers } from '../../index';
import { default as util } from 'util';
import { default as stream } from 'stream';

declare var sails: any;
declare var _: any;

const pipeline = util.promisify(stream.pipeline);
/**
 * Package that contains all Controllers.
 */
export module Controllers {
  /**
   * Responsible for exporting data
   *
   * Author: <a href='https://github.com/shilob' target='_blank'>Shilo Banihit</a>
   */
  export class Export extends controllers.Core.Controller {

    /**
     * Exported methods, accessible from internet.
     */
    protected override _exportedMethods: any = [
      'downloadRecs'
    ];

    /**
     * @override
     */
    public async downloadRecs(req, res) {
      try {
        const brand: BrandingModel = BrandingService.getBrand(req.session.branding);
        const format: string = req.param('format');
        const recType: string = req.param('recType');
        const before: string = _.isEmpty(req.query.before) ? null : req.query.before;
        const after: string = _.isEmpty(req.query.after) ? null : req.query.after;
        const filename: string = `${TranslationService.t(`${recType}-title`)} - Exported Records.${format}`;
        if (format == 'csv' || format == 'json') {
          res.set('Content-Type', `text/${format}`);
          sails.log.verbose("filename " + filename);
          res.attachment(filename);
          await pipeline(
            RecordsService.exportAllPlans(req.user.username, req.user.roles, brand, format, before, after, recType),
            res
          );
        } else {
          const errorResponse = new APIErrorResponse('Unsupported export format');
          return this.sendResp(req, res, {
            status: 500,
            displayErrors: [{ title: errorResponse.message, detail: errorResponse.details }],
            headers: this.getNoCacheHeaders()
          });
        }
      } catch (error) {
        const errorResponse = new APIErrorResponse(error.message);
        return this.sendResp(req, res, {
          status: 500,
          displayErrors: [{ title: errorResponse.message, detail: errorResponse.details }],
          headers: this.getNoCacheHeaders()
        });
      }
    }
  }
}
