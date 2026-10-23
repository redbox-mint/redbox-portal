import { Services as Core } from '../CoreService';
import { Services as Owned } from '../navigation/Navigation';
import type { BrandingModel } from '../model/storage/BrandingModel';

export namespace Services {
  export class Navigation extends Core.Core.Service {
    protected override _exportedMethods = [
      'resolveMenu',
      'resolveHomePanels',
      'resolveAdminSidebar',
      'getDefaultMenuConfig',
      'getDefaultHomePanelConfig',
      'getDefaultAdminSidebarConfig',
    ];
    private operation(req?: Sails.Req) {
      const brandName = req ? BrandingService.getBrandNameFromReq(req) : 'default';
      return new Owned.Navigation({
        context: {
          isAuthenticated: req?.isAuthenticated?.() ?? false,
          user: req?.user,
          brand: BrandingService.getBrand(brandName) ?? null,
          brandPortalPath: req ? BrandingService.getBrandAndPortalPath(req) : '',
          currentPath: req?.path ?? '',
        },
        configuration: typeof sails.config.brandingAware === 'function' ? sails.config.brandingAware(brandName) : {},
        appmode: { ...sails.config.appmode },
        log: sails.log,
        translate: key => TranslationService.t(key),
        hasRole: (user, brand: BrandingModel, name) => {
          const role = RolesService.getRoleByName(brand, name);
          return !!role && !!UsersService.hasRole(user, role);
        },
      });
    }
    public async resolveMenu(req: Sails.Req) {
      try {
        return await this.operation(req).resolveMenu();
      } catch (error) {
        sails.log.error(error);
        return { items: [], showSearch: true };
      }
    }
    public async resolveHomePanels(req: Sails.Req) {
      try {
        return await this.operation(req).resolveHomePanels();
      } catch (error) {
        console.error('[NavigationService] Error resolving home panels:', error);
        sails.log.error(error);
        return { panels: [] };
      }
    }
    public async resolveAdminSidebar(req: Sails.Req) {
      try {
        return await this.operation(req).resolveAdminSidebar();
      } catch (error) {
        sails.log.error(error);
        return { header: { title: 'Admin', iconClass: 'fa fa-cog' }, sections: [], footerLinks: [] };
      }
    }
    public getDefaultMenuConfig() {
      return this.operation().getDefaultMenuConfig();
    }
    public getDefaultHomePanelConfig() {
      return this.operation().getDefaultHomePanelConfig();
    }
    public getDefaultAdminSidebarConfig() {
      return this.operation().getDefaultAdminSidebarConfig();
    }
  }
}
declare global {
  let NavigationService: Services.Navigation;
}
