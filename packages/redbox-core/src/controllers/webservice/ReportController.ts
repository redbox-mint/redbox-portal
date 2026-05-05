import { APIErrorResponse, BrandingModel, Controllers as controllers } from '../../index';


export namespace Controllers {
  /**
   * Responsible for all things related to the Dashboard
   *
   * @author <a target='_' href='https://github.com/andrewbrazzatti'>Andrew Brazzatti</a>
   */
  export class Report extends controllers.Core.Controller {

    /**
     * Exported methods, accessible from internet.
     */
    protected override _exportedMethods: string[] = [
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
        const brand: BrandingModel = BrandingService.getBrand(req.session.branding as string);
        const queryName = req.param('queryName');
        this.updateChronicle(req, {namedQueryName: queryName});
        const namedQuery = await NamedQueryService.getNamedQueryConfig(brand, queryName);
        if (_.isEmpty(namedQuery)) {
          return this.sendResp(req, res, {
            status: 400,
            displayErrors: [{ detail: "Named query not found" }],
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
        this.updateChronicle(req, {namedQueryPagingStart: start, namedQueryPagingRows: rows});
        if (rows > 100) {
          return this.sendResp(req, res, {
            status: 400,
            displayErrors: [{ detail: "Rows must not be greater than 100" }],
            headers: this.getNoCacheHeaders()
          });
        }
        const namedQueryConfig = sails.config.namedQuery[queryName];
        const paramMap = _.clone(req.query);
        const response = await NamedQueryService.performNamedQueryFromConfig(namedQueryConfig, paramMap, brand, start, rows);
        this.updateChronicle(req, {namedQueryResponse: response});
        this.sendResp(req, res, {
          data: response,
          status: 200,
          headers: this.getNoCacheHeaders()
        });
      } catch (error: unknown) {
        return this.sendResp(req, res, {
          status: 500,
          errors: [error],
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
