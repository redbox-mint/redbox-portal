import { APIErrorResponse, BrandingModel, Controllers as controllers } from '../../index';

declare var sails: any;
declare var _: any;

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
    protected override _exportedMethods: any = [
      'executeNamedQuery'
    ];

    /**
     **************************************************************************************************
     **************************************** Add custom methods **************************************
     **************************************************************************************************
     */

    public bootstrap() {

    }


    public async executeNamedQuery(req: Sails.Req, res: Sails.Res) {
      try {
        const brand: BrandingModel = BrandingService.getBrand(req.session.branding);
        let queryName = req.param('queryName');
        let namedQuery = await NamedQueryService.getNamedQueryConfig(brand, queryName);
        if (_.isEmpty(namedQuery)) {
          const errorResponse = new APIErrorResponse("Named query not found");
          return this.sendResp(req, res, {
            status: 400,
            displayErrors: [{ title: errorResponse.message, detail: errorResponse.details }],
            headers: this.getNoCacheHeaders()
          });
        }

        let start = 0;
        let rows = 10;
        if (!_.isEmpty(req.param('start'))) {
          start = _.toNumber(req.param('start'))
        }
        if (!_.isEmpty(req.param('rows'))) {
          rows = _.toNumber(req.param('rows'))
        }
        if (rows > 100) {
          const errorResponse = new APIErrorResponse("Rows must not be greater than 100");
          return this.sendResp(req, res, {
            status: 400,
            displayErrors: [{ title: errorResponse.message, detail: errorResponse.details }],
            headers: this.getNoCacheHeaders()
          });
        }
        let namedQueryConfig = sails.config.namedQuery[queryName];
        let paramMap = _.clone(req.query);
        let response = await NamedQueryService.performNamedQueryFromConfig(namedQueryConfig, paramMap, brand, start, rows);
        sails.log.verbose(`NamedQueryService response: ${JSON.stringify(response)}`);
        return this.apiRespond(req, res, response, 200)
      } catch (error: unknown) {
        sails.log.error(`executeNamedQuery error: ${error}`);
        const errorResponse = new APIErrorResponse(error instanceof Error ? error.message : String(error));
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
