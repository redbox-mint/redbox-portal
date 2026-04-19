import {
  APIErrorResponse,
  BrandingModel,
  Controllers as controllers,
  getValidatedApiRequest,
  executeNamedQueryRoute,
} from '../../index';

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
    protected override _exportedMethods: string[] = ['executeNamedQuery'];

    /**
     **************************************************************************************************
     **************************************** Add custom methods **************************************
     **************************************************************************************************
     */

    public bootstrap() { }

    public async executeNamedQuery(req: Sails.Req, res: Sails.Res) {
      try {
        const validated = getValidatedApiRequest(req);
        const { query } = validated;
        const brand: BrandingModel = BrandingService.getBrand(req.session.branding as string);
        const queryName = query.queryName as string;
        const namedQuery = await NamedQueryService.getNamedQueryConfig(brand, queryName);
        if (_.isEmpty(namedQuery)) {
          const errorResponse = new APIErrorResponse('Named query not found');
          return this.sendResp(req, res, {
            status: 400,
            displayErrors: [{ title: errorResponse.message, detail: errorResponse.details }],
            headers: this.getNoCacheHeaders(),
          });
        }

        let start = 0;
        let rows = 10;
        if (!_.isEmpty(query.start)) {
          start = _.toNumber(query.start);
        }
        if (!_.isEmpty(query.rows)) {
          rows = _.toNumber(query.rows);
        }
        if (rows > 100) {
          const errorResponse = new APIErrorResponse('Rows must not be greater than 100');
          return this.sendResp(req, res, {
            status: 400,
            displayErrors: [{ title: errorResponse.message, detail: errorResponse.details }],
            headers: this.getNoCacheHeaders(),
          });
        }
        const namedQueryConfig = sails.config.namedQuery[queryName];
        const paramMap = _.clone(query);
        const response = await NamedQueryService.performNamedQueryFromConfig(
          namedQueryConfig,
          paramMap,
          brand,
          start,
          rows
        );
        sails.log.verbose(`NamedQueryService response: ${JSON.stringify(response)}`);
        return this.apiRespond(req, res, response, 200);
      } catch (error: unknown) {
        sails.log.error(`executeNamedQuery error: ${error}`);
        const errorResponse = new APIErrorResponse(error instanceof Error ? error.message : String(error));
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
