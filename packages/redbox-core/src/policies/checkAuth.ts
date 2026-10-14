import * as BrandingServiceModule from '../services/BrandingService';
import * as RolesServiceModule from '../services/RolesService';
import * as PathRulesServiceModule from '../services/PathRulesService';
import {
  buildRecordSchemaForbiddenProblem,
  RECORD_SCHEMA_PROBLEM_MEDIA_TYPE,
  RECORD_SCHEMA_RESPONSE_CACHE_CONTROL,
  RECORD_SCHEMA_RESPONSE_VARY,
} from '../api-routes/record-schema-response';

declare const BrandingService: BrandingServiceModule.Services.Branding;
declare const RolesService: RolesServiceModule.Services.Roles;
declare const PathRulesService: PathRulesServiceModule.Services.PathRules;

/**
 * CheckAuth Policy
 *
 * Checks if the current user has permission to access the requested path
 * based on their roles and the path rules defined for the brand.
 */
function sendRecordSchemaForbidden(req: Sails.Req, res: Sails.Res): void {
  const instance = req.path ?? req.originalUrl ?? '/api/records/schemas';
  res.set({
    'Cache-Control': RECORD_SCHEMA_RESPONSE_CACHE_CONTROL,
    Vary: RECORD_SCHEMA_RESPONSE_VARY,
    'Content-Type': RECORD_SCHEMA_PROBLEM_MEDIA_TYPE,
  });
  res.status(403).json(buildRecordSchemaForbiddenProblem(instance));
}

function applyCheckAuth(
  req: Sails.Req,
  res: Sails.Res,
  next: Sails.NextFunction,
  recordSchemaProblemResponse: boolean
): void {
  const companionAttachmentUploadAuthorized = (req as Sails.Req & { companionAttachmentUploadAuthorized?: boolean })
    .companionAttachmentUploadAuthorized;
  if (companionAttachmentUploadAuthorized === true) {
    return next();
  }

  const brand = BrandingService.getBrand(req.session.branding ?? '');
  if (!brand) {
    sails.log.verbose('In checkAuth, no branding found.');
    // invalid brand
    res.status(404).json({
      branding: sails.config.auth.defaultBrand,
      portal: sails.config.auth.defaultPortal,
    });
    return;
  }

  let roles: unknown[];
  if (req.isAuthenticated()) {
    roles = (req.user?.roles ?? []) as unknown[];
  } else {
    // assign default role if needed...
    roles = [];
    roles.push(RolesService.getDefUnathenticatedRole(brand));
  }

  // get the rules if any....
  const rules = PathRulesService.getRulesFromPath(req.path, brand);
  if (rules) {
    // populate variables if this user has a role that can read or write...
    const canRead = PathRulesService.canRead(
      rules,
      roles as unknown as Parameters<typeof PathRulesService.canRead>[1],
      brand.name
    );
    if (!canRead) {
      if (recordSchemaProblemResponse) {
        sendRecordSchemaForbidden(req, res);
        return;
      }
      if (req.isAuthenticated()) {
        res.status(403).send();
        return;
      } else {
        const contentTypeHeader = req.headers['content-type'] == null ? '' : req.headers['content-type'];
        if (contentTypeHeader.indexOf('application/json') !== -1) {
          res.status(403).json({ message: 'Access Denied' });
          return;
        } else {
          (sails.getActions()['user/redirlogin'] as (r: Sails.Req, s: Sails.Res) => void)(req, res);
          return;
        }
      }
    }
  } else {
    sails.log.verbose('No rules for path:' + req.path);
  }

  // no rules can proceed...
  return next();
}

export function checkAuth(req: Sails.Req, res: Sails.Res, next: Sails.NextFunction): void {
  return applyCheckAuth(req, res, next, false);
}

/** Schema routes require their declared raw Problem Details representation even when policy authorization denies. */
export function checkRecordSchemaAuth(req: Sails.Req, res: Sails.Res, next: Sails.NextFunction): void {
  return applyCheckAuth(req, res, next, true);
}

export default checkAuth;
