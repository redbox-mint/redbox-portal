import { GenerationError } from '../model/generation';
import { getRouteParam } from '../utilities/RequestParamUtils';

/** Session authentication and Admin membership for the brand in the route. */
export function requireGenerationModelAdmin(req: Sails.Req) {
  const brand = BrandingService.getBrand(getRouteParam(req, 'branding'));
  const admin = brand ? RolesService.getAdmin(brand) : undefined;
  if (!brand || !admin || !req.isAuthenticated() || !req.user ||
      !(Array.isArray(req.user.roles) ? req.user.roles : []).some(role =>
        role && typeof role === 'object' && String(role.id) === String(admin.id))) {
    throw new GenerationError('GENERATION_SOURCE_FORBIDDEN', 'Brand Admin permission required');
  }
  return brand;
}

export function generationModelAdmin(req: Sails.Req, res: Sails.Res, next: Sails.NextFunction) {
  try {
    requireGenerationModelAdmin(req);
    return next();
  } catch {
    const error = new GenerationError('GENERATION_SOURCE_FORBIDDEN', 'Access denied');
    return res.status(error.status).json({ error: { code: error.code, retryable: false,
      messageKey: 'ai-models-error-generation-source-forbidden' } });
  }
}
