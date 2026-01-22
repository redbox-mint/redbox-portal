import { APIErrorResponse, BrandingModel, Controllers as controllers } from '../../index';

declare var sails: any;
declare var BrandingService: any;
declare var NamedQueryService: any;
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
    protected _exportedMethods: any = [
      'executeNamedQuery'
    ];

    /**
     **************************************************************************************************
     **************************************** Add custom methods **************************************
     **************************************************************************************************
     */

    public bootstrap() {

    }


    public async executeNamedQuery(req, res) {
      try {
        const brand: BrandingModel = BrandingService.getBrand(req.session.branding);
        let queryName = req.param('queryName');
        let namedQuery = await NamedQueryService.getNamedQueryConfig(brand, queryName);
        if (_.isEmpty(namedQuery)) {
          return this.apiFail(req, res, 400, new APIErrorResponse("Named query not found"));
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
          return this.apiFail(req, res, 400, new APIErrorResponse("Rows must not be greater than 100"));
        }
        let namedQueryConfig = sails.config.namedQuery[queryName];
        let paramMap = _.clone(req.query);
        let response = await NamedQueryService.performNamedQueryFromConfig(namedQueryConfig, paramMap, brand, start, rows);
        sails.log.verbose(`NamedQueryService response: ${JSON.stringify(response)}`);
        return this.apiRespond(req, res, response, 200)
      } catch (error) {
        sails.log.error(`executeNamedQuery error: ${error}`);
        return this.apiFail(req, res, 500, new APIErrorResponse(error.message));
      }
    }


    /**
     **************************************************************************************************
     **************************************** Override magic methods **********************************
     **************************************************************************************************
     */
  }
}
