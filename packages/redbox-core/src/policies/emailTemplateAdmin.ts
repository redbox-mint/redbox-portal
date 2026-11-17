import { EmailTemplateError } from '../services/EmailTemplateService';
import { getRouteParam } from '../utilities/RequestParamUtils';

/** Brand identity and the Admin role are resolved exclusively from route parameters. */
export function requireEmailTemplateAdmin(req: Sails.Req) {
  const brand = BrandingService.getBrand(getRouteParam(req, 'branding'));
  const admin = brand ? RolesService.getAdmin(brand) : undefined;
  if (
    !brand ||
    !admin ||
    !req.isAuthenticated() ||
    !req.user ||
    !((Array.isArray(req.user.roles) ? req.user.roles : []) as Array<{ id?: unknown }>).some(
      role => typeof role === 'object' && role !== null && String(role.id) === String(admin.id)
    )
  ) {
    throw new EmailTemplateError('FORBIDDEN', 'Access denied.');
  }
  return brand;
}

export function emailTemplateAdmin(req: Sails.Req, res: Sails.Res, next: Sails.NextFunction) {
  try {
    requireEmailTemplateAdmin(req);
    return next();
  } catch {
    return res
      .status(403)
      .json({ error: { code: 'FORBIDDEN', message: 'Access denied or preview record unavailable.' }, diagnostics: [] });
  }
}
