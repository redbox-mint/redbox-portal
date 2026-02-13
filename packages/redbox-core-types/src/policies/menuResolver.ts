declare const NavigationService: {
    resolveMenu(req: Sails.Req): Promise<unknown>;
    resolveHomePanels(req: Sails.Req): Promise<unknown>;
    resolveAdminSidebar(req: Sails.Req): Promise<unknown>;
};

/**
 * MenuResolver Policy
 *
 * Adds the resolved menu, home panels, and admin sidebar configuration to template
 * context for brand-aware rendering. This policy should run after brandingAndPortal
 * and before rendering any layouts that include the menu, researcher home page, or
 * admin sidebar.
 */
export async function menuResolver(req: Sails.Req, res: Sails.Res, next: Sails.NextFunction): Promise<void> {
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
            const locals = (req.options.locals ?? {}) as Record<string, unknown>;
            locals.menu = resolvedMenu;
            locals.homePanels = resolvedHomePanels;
            locals.adminSidebar = resolvedAdminSidebar;
            req.options.locals = locals;
        }
    } catch (e: unknown) {
        sails.log.warn('[menuResolver policy] Error resolving navigation:', e instanceof Error ? e.message : e);
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
            const locals = (req.options.locals ?? {}) as Record<string, unknown>;
            locals.menu = emptyMenu;
            locals.homePanels = emptyHomePanels;
            locals.adminSidebar = emptyAdminSidebar;
            req.options.locals = locals;
        }
    }

    return next();
}

export default menuResolver;
