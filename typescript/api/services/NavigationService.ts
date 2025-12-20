// Copyright (c) 2017 Queensland Cyber Infrastructure Foundation (http://www.qcif.edu.au/)
//
// GNU GENERAL PUBLIC LICENSE
//    Version 2, June 1991
//
// This program is free software; you can redistribute it and/or modify
// it under the terms of the GNU General Public License as published by
// the Free Software Foundation; either version 2 of the License, or
// (at your option) any later version.
//
// This program is distributed in the hope that it will be useful,
// but WITHOUT ANY WARRANTY; without even the implied warranty of
// MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
// GNU General Public License for more details.
//
// You should have received a copy of the GNU General Public License along
// with this program; if not, write to the Free Software Foundation, Inc.,
// 51 Franklin Street, Fifth Floor, Boston, MA 02110-1301 USA.

import { Services as services } from '@researchdatabox/redbox-core-types';
import { Sails } from 'sails';
import {
  MenuItem,
  MenuConfigData,
  ResolvedMenuItem,
  ResolvedMenu,
  DEFAULT_MENU_CONFIG
} from '../configmodels/MenuConfig';
import {
  HomePanel,
  HomePanelItem,
  HomePanelConfigData,
  ResolvedHomePanel,
  ResolvedHomePanelItem,
  ResolvedHomePanels,
  DEFAULT_HOME_PANEL_CONFIG
} from '../configmodels/HomePanelConfig';

declare var sails: Sails;
declare var BrandingService: any;
declare var RolesService: any;
declare var UsersService: any;
declare var TranslationService: any;
declare var _: any;

/**
 * Context object containing request state for visibility checks
 */
interface ResolutionContext {
  isAuthenticated: boolean;
  user: any;
  brand: any;
  brandPortalPath: string;
  currentPath: string;
}

/**
 * Common interface for items that can be visibility-filtered
 */
interface FilterableItem {
  requiresAuth?: boolean;
  hideWhenAuth?: boolean;
  featureFlag?: string;
  requiredRoles?: string[];
  placeholderFallback?: {
    translationKey: string;
    placeholderPath: string;
  };
  visibleWhenTranslationExists?: boolean;
  labelKey: string;
  href: string;
  external?: boolean;
}

export module Services {
  /**
   * Navigation service that provides brand-aware menu and home panel configuration
   * 
   * This service reads navigation configuration from the branding-aware config system
   * and resolves it into ready-to-render structures with proper filtering
   * based on authentication state, roles, translations, and placeholder pages.
   *
   * Author: Generated based on design.md
   */
  export class Navigation extends services.Core.Service {
    protected _exportedMethods: any = [
      'resolveMenu',
      'resolveHomePanels',
      'getDefaultMenuConfig',
      'getDefaultHomePanelConfig'
    ];

    // =========================================================================
    // Public API
    // =========================================================================

    /**
     * Returns the default menu configuration
     */
    public getDefaultMenuConfig(): MenuConfigData {
      return DEFAULT_MENU_CONFIG;
    }

    /**
     * Returns the default home panel configuration
     */
    public getDefaultHomePanelConfig(): HomePanelConfigData {
      return DEFAULT_HOME_PANEL_CONFIG;
    }

    /**
     * Resolves the menu configuration for the current request context
     * 
     * @param req - The Express/Sails request object
     * @returns ResolvedMenu ready for rendering in templates
     */
    public async resolveMenu(req: any): Promise<ResolvedMenu> {
      try {
        const context = this.buildResolutionContext(req);

        // Pull config from brandingAware or fall back to defaults
        let menuConfig: MenuConfigData = DEFAULT_MENU_CONFIG;
        const brandName = BrandingService.getBrandFromReq(req);
        if (typeof sails.config.brandingAware === 'function') {
          const brandingConfig = sails.config.brandingAware(brandName);
          if (brandingConfig?.menu?.items) {
            menuConfig = this.mergeMenuWithDefaults(brandingConfig.menu);
          }
        }

        // Filter and resolve menu items
        const resolvedItems = await this.resolveMenuItems(menuConfig.items, context);

        return {
          items: resolvedItems,
          showSearch: menuConfig.showSearch !== false
        };
      } catch (error) {
        sails.log.error('[NavigationService] Error resolving menu:', error);
        // Return minimal menu on error
        return {
          items: [],
          showSearch: true
        };
      }
    }

    /**
     * Resolves the home panel configuration for the current request context
     * 
     * @param req - The Express/Sails request object
     * @returns ResolvedHomePanels ready for rendering in templates
     */
    public async resolveHomePanels(req: any): Promise<ResolvedHomePanels> {
      try {
        const context = this.buildResolutionContext(req);

        // Pull config from brandingAware or fall back to defaults
        let homePanelConfig: HomePanelConfigData = DEFAULT_HOME_PANEL_CONFIG;
        const brandName = BrandingService.getBrandFromReq(req);
        if (typeof sails.config.brandingAware === 'function') {
          const brandingConfig = sails.config.brandingAware(brandName);
          if (brandingConfig?.homePanels?.panels) {
            homePanelConfig = this.mergeHomePanelsWithDefaults(brandingConfig.homePanels);
          }
        }

        // Resolve each panel
        const resolvedPanels: ResolvedHomePanel[] = [];
        for (const panel of homePanelConfig.panels) {
          const resolvedPanel = await this.resolveHomePanel(panel, context);
          if (resolvedPanel && resolvedPanel.items.length > 0) {
            resolvedPanels.push(resolvedPanel);
          }
        }

        return {
          panels: resolvedPanels
        };
      } catch (error) {
        sails.log.error('[NavigationService] Error resolving home panels:', error);
        // Return empty panels on error
        return {
          panels: []
        };
      }
    }

    // =========================================================================
    // Context Building
    // =========================================================================

    /**
     * Builds the resolution context from a request
     */
    private buildResolutionContext(req: any): ResolutionContext {
      const brandName = BrandingService.getBrandFromReq(req);
      const brand = BrandingService.getBrand(brandName);
      const brandPortalPath = BrandingService.getBrandAndPortalPath(req);
      const isAuthenticated = req.isAuthenticated ? req.isAuthenticated() : false;
      const user = req.user;
      const currentPath = req.path || '';

      return {
        isAuthenticated,
        user,
        brand,
        brandPortalPath,
        currentPath
      };
    }

    // =========================================================================
    // Menu Resolution
    // =========================================================================

    /**
     * Merges custom menu config with defaults
     */
    private mergeMenuWithDefaults(customConfig: Partial<MenuConfigData>): MenuConfigData {
      return {
        items: customConfig.items || DEFAULT_MENU_CONFIG.items,
        showSearch: customConfig.showSearch !== undefined ? customConfig.showSearch : DEFAULT_MENU_CONFIG.showSearch
      };
    }

    /**
     * Recursively resolves menu items with filtering and URL resolution
     */
    private async resolveMenuItems(
      items: MenuItem[],
      context: ResolutionContext
    ): Promise<ResolvedMenuItem[]> {
      const resolvedItems: ResolvedMenuItem[] = [];

      for (const item of items) {
        const resolved = await this.resolveMenuItem(item, context);
        if (resolved) {
          resolvedItems.push(resolved);
        }
      }

      return resolvedItems;
    }

    /**
     * Resolves a single menu item, returning null if it should be hidden
     */
    private async resolveMenuItem(
      item: MenuItem,
      context: ResolutionContext
    ): Promise<ResolvedMenuItem | null> {
      // Check visibility rules (shared logic)
      const visibilityResult = this.checkItemVisibility(item, context);
      if (!visibilityResult.visible) {
        return null;
      }

      // Get the resolved href and external flag
      let href = visibilityResult.resolvedHref || item.href;
      let external = visibilityResult.resolvedExternal ?? (item.external === true);

      // URL building
      href = this.resolveUrl(href, context.brandPortalPath, external);

      // Process children recursively
      let children: ResolvedMenuItem[] | undefined;
      if (item.children && item.children.length > 0) {
        children = await this.resolveMenuItems(item.children, context);
        // If all children were filtered out, hide the parent dropdown
        if (children.length === 0) {
          return null;
        }
      }

      // Compute active state
      const active = this.isActive(href, context.currentPath, children);

      // Build resolved item
      const resolved: ResolvedMenuItem = {
        label: visibilityResult.resolvedLabel,
        href,
        external,
        active
      };

      if (external) {
        resolved.target = '_blank';
      }

      if (children && children.length > 0) {
        resolved.children = children;
      }

      return resolved;
    }

    /**
     * Determines if a menu item is active based on current path
     */
    private isActive(href: string, currentPath: string, children?: ResolvedMenuItem[]): boolean {
      // Check if any child is active (bubbles up to parent)
      if (children && children.length > 0) {
        return children.some(child => child.active === true);
      }

      // Don't mark anchor links as active
      if (href === '#') {
        return false;
      }

      // Exact match or prefix match for nested routes
      if (currentPath === href) {
        return true;
      }

      // Check if current path starts with this href (for nested routes)
      if (href !== '/' && currentPath.startsWith(href)) {
        return true;
      }

      return false;
    }

    // =========================================================================
    // Home Panel Resolution
    // =========================================================================

    /**
     * Merges custom home panel config with defaults
     */
    private mergeHomePanelsWithDefaults(customConfig: Partial<HomePanelConfigData>): HomePanelConfigData {
      return {
        panels: customConfig.panels || DEFAULT_HOME_PANEL_CONFIG.panels
      };
    }

    /**
     * Resolves a single home panel
     */
    private async resolveHomePanel(
      panel: HomePanel,
      context: ResolutionContext
    ): Promise<ResolvedHomePanel | null> {
      // Resolve panel items
      const resolvedItems: ResolvedHomePanelItem[] = [];
      for (const item of panel.items) {
        const resolved = await this.resolveHomePanelItem(item, context);
        if (resolved) {
          resolvedItems.push(resolved);
        }
      }

      // If no items passed the filter, don't render the panel
      if (resolvedItems.length === 0) {
        return null;
      }

      return {
        id: panel.id,
        title: this.translateLabel(panel.titleKey),
        iconClass: panel.iconClass,
        columnClass: panel.columnClass || 'col-md-3 homepanel',
        items: resolvedItems
      };
    }

    /**
     * Resolves a single home panel item, returning null if it should be hidden
     */
    private async resolveHomePanelItem(
      item: HomePanelItem,
      context: ResolutionContext
    ): Promise<ResolvedHomePanelItem | null> {
      // Check visibility rules (shared logic)
      const visibilityResult = this.checkItemVisibility(item, context);
      if (!visibilityResult.visible) {
        return null;
      }

      // Get the resolved href and external flag
      let href = visibilityResult.resolvedHref || item.href;
      let external = visibilityResult.resolvedExternal ?? (item.external === true);

      // URL building
      href = this.resolveUrl(href, context.brandPortalPath, external);

      // Build resolved item
      const resolved: ResolvedHomePanelItem = {
        label: visibilityResult.resolvedLabel,
        href,
        external
      };

      if (external) {
        resolved.target = '_blank';
      }

      return resolved;
    }

    // =========================================================================
    // Shared Visibility and Resolution Logic
    // =========================================================================

    /**
     * Result of visibility check
     */
    private checkItemVisibility(
      item: FilterableItem,
      context: ResolutionContext
    ): {
      visible: boolean;
      resolvedLabel: string;
      resolvedHref?: string;
      resolvedExternal?: boolean;
    } {
      const { isAuthenticated, user, brand } = context;

      // 1. Auth state filtering
      const requiresAuth = item.requiresAuth !== false; // default true
      const hideWhenAuth = item.hideWhenAuth === true;

      if (requiresAuth && !isAuthenticated) {
        return { visible: false, resolvedLabel: '' };
      }
      if (hideWhenAuth && isAuthenticated) {
        return { visible: false, resolvedLabel: '' };
      }

      // 2. Feature flag check
      if (item.featureFlag) {
        const flagValue = _.get(sails.config.appmode, item.featureFlag, true);
        if (!flagValue) {
          return { visible: false, resolvedLabel: '' };
        }
      }

      // 3. Role filtering
      if (item.requiredRoles && item.requiredRoles.length > 0 && isAuthenticated && user) {
        const hasRequiredRole = this.userHasAnyRole(user, brand, item.requiredRoles);
        if (!hasRequiredRole) {
          return { visible: false, resolvedLabel: '' };
        }
      }

      // 4. Translation and placeholder handling
      const label = this.translateLabel(item.labelKey);
      let resolvedHref: string | undefined;
      let resolvedExternal: boolean | undefined;

      // Handle placeholder fallback logic
      if (item.placeholderFallback) {
        const translatedLink = this.translateLabel(item.placeholderFallback.translationKey);
        
        // Check if translation exists (returns actual URL, not the key)
        if (translatedLink !== item.placeholderFallback.translationKey && translatedLink.trim() !== '') {
          // Translation exists - use it as external link
          resolvedHref = translatedLink;
          resolvedExternal = true;
        } else if (sails.config.appmode?.hidePlaceholderPages === false) {
          // No translation but placeholder pages are allowed
          resolvedHref = item.placeholderFallback.placeholderPath;
          resolvedExternal = false;
        } else {
          // No translation and placeholder pages are hidden
          return { visible: false, resolvedLabel: '' };
        }
      } else if (item.visibleWhenTranslationExists) {
        // Item should only show if translation exists
        if (label === item.labelKey) {
          return { visible: false, resolvedLabel: '' };
        }
      }

      return {
        visible: true,
        resolvedLabel: label,
        resolvedHref,
        resolvedExternal
      };
    }

    /**
     * Checks if user has any of the specified roles for the brand
     */
    private userHasAnyRole(user: any, brand: any, roleNames: string[]): boolean {
      if (!user || !brand) {
        return false;
      }

      for (const roleName of roleNames) {
        const role = RolesService.getRoleByName(brand, roleName);
        if (role && UsersService.hasRole(user, role)) {
          return true;
        }
      }
      return false;
    }

    /**
     * Translates a label key using the TranslationService
     */
    private translateLabel(key: string): string {
      try {
        return TranslationService.t(key);
      } catch (error) {
        sails.log.warn(`[NavigationService] Translation failed for key: ${key}`, error);
        return key;
      }
    }

    /**
     * Resolves a URL, prefixing with brand/portal path if needed
     */
    private resolveUrl(href: string, brandPortalPath: string, external: boolean): string {
      // Don't prefix external URLs, absolute URLs, or anchor links
      if (external || href.startsWith('http://') || href.startsWith('https://') || href === '#') {
        return href;
      }

      // Don't prefix if already contains the brand/portal path
      if (href.startsWith(brandPortalPath)) {
        return href;
      }

      // Prefix relative URLs with brand/portal path
      if (href.startsWith('/')) {
        return `${brandPortalPath}${href}`;
      }

      return `${brandPortalPath}/${href}`;
    }
  }
}

module.exports = new Services.Navigation().exports();
