// This file is generated from internal/sails-ts/api/services/NavigationService.ts. Do not edit directly.
import { Services as services } from '../../index';
import { Sails } from 'sails';

export interface ResolutionContext {
  isAuthenticated: boolean;
  user: any;
  brand: any;
  brandPortalPath: string;
  currentPath: string;
}
export interface FilterableItem {
  requiresAuth?: boolean;
  hideWhenAuth?: boolean;
  featureFlag?: string;
  requiredRoles?: string[];
  visibleWhenTranslationExists?: boolean;
  labelKey: string;
  href: string;
  external?: boolean;
}
type MenuItem = any;
type MenuConfigData = any;
type ResolvedMenuItem = any;
type ResolvedMenu = any;
type DEFAULT_MENU_CONFIG = any;
type HomePanel = any;
type HomePanelItem = any;
type HomePanelConfigData = any;
type ResolvedHomePanel = any;
type ResolvedHomePanelItem = any;
type ResolvedHomePanels = any;
type DEFAULT_HOME_PANEL_CONFIG = any;
type AdminSidebarSection = any;
type AdminSidebarItem = any;
type AdminSidebarConfigData = any;
type ResolvedAdminSidebar = any;
type ResolvedAdminSidebarSection = any;
type ResolvedAdminSidebarItem = any;
type DEFAULT_ADMIN_SIDEBAR_CONFIG = any;

export interface NavigationService {
  resolveMenu(req: any): Promise<ResolvedMenu>;
  resolveHomePanels(req: any): Promise<ResolvedHomePanels>;
  resolveAdminSidebar(req: any): Promise<ResolvedAdminSidebar>;
  getDefaultMenuConfig(): MenuConfigData;
  getDefaultHomePanelConfig(): HomePanelConfigData;
  getDefaultAdminSidebarConfig(): AdminSidebarConfigData;
}
