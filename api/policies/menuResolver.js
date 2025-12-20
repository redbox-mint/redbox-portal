/**
 * Menu Resolver Policy
 * 
 * Adds the resolved menu configuration to template context for brand-aware
 * menu rendering. This policy should run after brandingAndPortal and before
 * rendering any layouts that include the menu.
 */

module.exports = async function (req, res, next) {
  try {
    // MenuService handles all the brand-aware config resolution,
    // auth filtering, role checks, translation, and URL building
    const resolvedMenu = await MenuService.resolveMenu(req);
    
    // Make the resolved menu available to templates
    res.locals = res.locals || {};
    res.locals.menu = resolvedMenu;
    
    // Also set in req.options.locals for controllers that use it
    if (req.options) {
      req.options.locals = req.options.locals || {};
      req.options.locals.menu = resolvedMenu;
    }
  } catch (e) {
    sails.log.warn('[menuResolver policy] Error resolving menu:', e?.message || e);
    // Provide empty menu on error so templates don't break
    const emptyMenu = { items: [], showSearch: true };
    res.locals = res.locals || {};
    res.locals.menu = emptyMenu;
    
    if (req.options) {
      req.options.locals = req.options.locals || {};
      req.options.locals.menu = emptyMenu;
    }
  }
  
  return next();
};
