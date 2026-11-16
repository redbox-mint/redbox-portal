import { isObject } from '../record-graphql/renderer';
import { graphqlFailure } from '../services/RecordGraphqlService';

/** GraphQL requires authentication AND applicable read rules; missing rules deny. */
export function checkRecordGraphqlAuth(req: Sails.Req, res: Sails.Res, next: Sails.NextFunction): void {
  const brand = BrandingService.getBrand(req.session.branding ?? '');
  const user = req.user;
  let status = 401;
  let code = 'UNAUTHENTICATED';
  if (
    brand &&
    isObject(user) &&
    typeof user.username === 'string' &&
    Array.isArray(user.roles) &&
    user.roles.every(
      (role): role is Record<string, unknown> & { id: string } => isObject(role) && typeof role.id === 'string'
    )
  ) {
    const rules = PathRulesService.getRulesFromPath(req.path, brand);
    if (rules?.length && PathRulesService.canRead(rules, user.roles, brand.name)) return next();
    status = 403;
    code = 'FORBIDDEN';
  }
  res.set({
    'Cache-Control': 'private, no-store',
    Vary: 'Authorization, Cookie, Accept',
    'Content-Type': 'application/graphql-response+json',
  });
  res
    .status(status)
    .json(
      graphqlFailure(status, code, status === 401 ? 'Authentication is required.' : 'GraphQL route access is denied.')
        .data
    );
}
