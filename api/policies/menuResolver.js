/**
 * Navigation Resolver Policy
 * 
 * Adds the resolved menu, home panels, and admin sidebar configuration to template 
 * context for brand-aware rendering. This policy should run after brandingAndPortal 
 * and before rendering any layouts that include the menu, researcher home page, or 
 * admin sidebar.
 */

module.exports = async function (req, res, next) {
  try {
    // NavigationService handles all the brand-aware config resolution,
    // auth filtering, role checks, translation, and URL building
    const resolvedMenu = await NavigationService.resolveMenu(req);
    const resolvedHomePanels = await NavigationService.resolveHomePanels(req);
    const resolvedAdminSidebar = await NavigationService.resolveAdminSidebar(req);
    
    // Make the resolved navigation data available to templates
    res.locals = res.locals || {};
    res.locals.menu = resolvedMenu;
    res.locals.homePanels = resolvedHomePanels;
    res.locals.adminSidebar = resolvedAdminSidebar;
    
    // Also set in req.options.locals for controllers that use it
    if (req.options) {
      req.options.locals = req.options.locals || {};
      req.options.locals.menu = resolvedMenu;
      req.options.locals.homePanels = resolvedHomePanels;
      req.options.locals.adminSidebar = resolvedAdminSidebar;
    }
  } catch (e) {
    sails.log.warn('[menuResolver policy] Error resolving navigation:', e?.message || e);
    // Provide empty structures on error so templates don't break
    const emptyMenu = { items: [], showSearch: true };
    const emptyHomePanels = { panels: [] };
    const emptyAdminSidebar = { 
      header: { title: 'Admin', iconClass: 'fa fa-cog' }, 
      sections: [], 
      footerLinks: [] 
    };
    res.locals = res.locals || {};
    res.locals.menu = emptyMenu;
    res.locals.homePanels = emptyHomePanels;
    res.locals.adminSidebar = emptyAdminSidebar;
    
    if (req.options) {
      req.options.locals = req.options.locals || {};
      req.options.locals.menu = emptyMenu;
      req.options.locals.homePanels = emptyHomePanels;
      req.options.locals.adminSidebar = emptyAdminSidebar;
    }
  }
  
  return next();
};
