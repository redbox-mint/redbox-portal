/**
 * Navigation Resolver Policy
 * 
 * Adds the resolved menu and home panels configuration to template context for 
 * brand-aware rendering. This policy should run after brandingAndPortal and before
 * rendering any layouts that include the menu or researcher home page.
 */

module.exports = async function (req, res, next) {
  try {
    // NavigationService handles all the brand-aware config resolution,
    // auth filtering, role checks, translation, and URL building
    const resolvedMenu = await NavigationService.resolveMenu(req);
    const resolvedHomePanels = await NavigationService.resolveHomePanels(req);
    
    // Make the resolved menu and home panels available to templates
    res.locals = res.locals || {};
    res.locals.menu = resolvedMenu;
    res.locals.homePanels = resolvedHomePanels;
    
    // Also set in req.options.locals for controllers that use it
    if (req.options) {
      req.options.locals = req.options.locals || {};
      req.options.locals.menu = resolvedMenu;
      req.options.locals.homePanels = resolvedHomePanels;
    }
  } catch (e) {
    sails.log.warn('[menuResolver policy] Error resolving navigation:', e?.message || e);
    // Provide empty structures on error so templates don't break
    const emptyMenu = { items: [], showSearch: true };
    const emptyHomePanels = { panels: [] };
    res.locals = res.locals || {};
    res.locals.menu = emptyMenu;
    res.locals.homePanels = emptyHomePanels;
    
    if (req.options) {
      req.options.locals = req.options.locals || {};
      req.options.locals.menu = emptyMenu;
      req.options.locals.homePanels = emptyHomePanels;
    }
  }
  
  return next();
};
