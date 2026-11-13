import { Controllers as controllers } from '../../CoreController';
import { getValidatedApiRequest } from '../../api-routes';
import { graphqlFailure } from '../../services/RecordGraphqlService';
import { isObject } from '../../record-graphql/renderer';

export namespace Controllers {
  export class RecordGraphql extends controllers.Core.Controller {
    protected _exportedMethods = ['init', 'execute'];

    public init(): void {
      /* Services are resolved through the runtime Sails shims. */
    }

    public async execute(req: Sails.Req, res: Sails.Res): Promise<void> {
      const validated = getValidatedApiRequest(req);
      const brand = BrandingService.getBrand(req.session.branding ?? '');
      const portal = req.session.portal;
      const user = req.user;
      let result = graphqlFailure(401, 'UNAUTHENTICATED', 'Authentication is required.');
      if (
        brand &&
        typeof portal === 'string' &&
        isObject(user) &&
        typeof user.username === 'string' &&
        Array.isArray(user.roles) &&
        user.roles.every(isObject)
      ) {
        try {
          result = await RecordGraphqlService.execute({ brand, portal, user, roles: user.roles }, validated?.body);
        } catch {
          result = graphqlFailure(503, 'UNAVAILABLE', 'Record GraphQL is unavailable.');
        }
      }
      this.sendResp(req, res, {
        format: 'raw-json',
        mediaType: 'application/graphql-response+json',
        status: result.status,
        data: result.data,
        headers: { 'Cache-Control': 'private, no-store', Vary: 'Authorization, Cookie, Accept' },
      });
    }
  }
}
