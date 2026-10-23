import { pageLocals } from '../../pages/locals';

/** Comparison-only bindings. Templates never discover the Sails application. */
export function comparisonPageLocals(req: Sails.Req, locals: Record<string, unknown>) {
  const branding = String(locals.branding ?? req.session?.branding ?? 'default');
  const portal = String(locals.portal ?? req.session?.portal ?? 'rdmp');
  const brand = BrandingService.getBrand(branding);
  return pageLocals(
    {
      root: BrandingService.getRootContext(),
      origin: String(sails.config.appUrl),
      brand: brand ?? { name: branding },
      portal,
      typeface: BrandingService.getActiveTypefaceFontInfo?.(branding) ?? null,
      faviconUrl: BrandingService.getFaviconUrl(req),
      settings: typeof sails.config.brandingAware === 'function' ? { ...sails.config.brandingAware(branding) } : {},
      config: {
        appUrl: sails.config.appUrl,
        appmode: { ...sails.config.appmode },
        static_assets: sails.config.static_assets,
        startupMinute: sails.config.startupMinute,
        angularDev: sails.config.angularDev,
      },
      t: (key, context) => TranslationService.t(key, context),
      param: name => req.param(name),
      bundleHash: (...args) => CacheService.getNgAppFileHash(...args),
      hasRole: name => {
        const role = RolesService.getRoleByName(brand, name);
        return !!role && !!UsersService.hasRole(req.user, role);
      },
    },
    locals
  );
}
