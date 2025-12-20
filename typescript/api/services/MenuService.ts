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
  MenuConfig,
  MenuConfigData,
  ResolvedMenuItem,
  ResolvedMenu,
  DEFAULT_MENU_CONFIG
} from '../configmodels/MenuConfig';

declare var sails: Sails;
declare var BrandingService: any;
declare var RolesService: any;
declare var UsersService: any;
declare var TranslationService: any;
declare var _: any;

export module Services {
  /**
   * Menu rendering service that provides brand-aware menu configuration
   * 
   * This service reads menu configuration from the branding-aware config system
   * and resolves it into a ready-to-render structure with proper filtering
   * based on authentication state, roles, translations, and placeholder pages.
   *
   * Author: Generated based on design.md
   */
  export class Menu extends services.Core.Service {
    protected _exportedMethods: any = [
      'resolveMenu',
      'getDefaultMenuConfig'
    ];

    /**
     * Returns the default menu configuration
     */
    public getDefaultMenuConfig(): MenuConfigData {
      return DEFAULT_MENU_CONFIG;
    }

    /**
     * Resolves the menu configuration for the current request context
     * 
     * @param req - The Express/Sails request object
     * @returns ResolvedMenu ready for rendering in templates
     */
    public async resolveMenu(req: any): Promise<ResolvedMenu> {
      try {
        // 1. Determine brand/portal from request
        const brandName = BrandingService.getBrandFromReq(req);
        const brand = BrandingService.getBrand(brandName);
        const brandPortalPath = BrandingService.getBrandAndPortalPath(req);

        // 2. Pull config from brandingAware or fall back to defaults
        let menuConfig: MenuConfigData = DEFAULT_MENU_CONFIG;
        if (typeof sails.config.brandingAware === 'function') {
          const brandingConfig = sails.config.brandingAware(brandName);
          if (brandingConfig?.menu?.items) {
            menuConfig = this.mergeWithDefaults(brandingConfig.menu);
          }
        }

        // 3. Get authentication state
        const isAuthenticated = req.isAuthenticated ? req.isAuthenticated() : false;
        const user = req.user;

        // 4. Get current path for active state
        const currentPath = req.path || '';

        // 5. Filter and resolve menu items
        const resolvedItems = await this.resolveMenuItems(
          menuConfig.items,
          {
            isAuthenticated,
            user,
            brand,
            brandPortalPath,
            currentPath
          }
        );

        return {
          items: resolvedItems,
          showSearch: menuConfig.showSearch !== false
        };
      } catch (error) {
        sails.log.error('[MenuService] Error resolving menu:', error);
        // Return minimal menu on error
        return {
          items: [],
          showSearch: true
        };
      }
    }

    /**
     * Merges custom config with defaults, ensuring all required fields exist
     */
    private mergeWithDefaults(customConfig: Partial<MenuConfigData>): MenuConfigData {
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
      context: {
        isAuthenticated: boolean;
        user: any;
        brand: any;
        brandPortalPath: string;
        currentPath: string;
      }
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
      context: {
        isAuthenticated: boolean;
        user: any;
        brand: any;
        brandPortalPath: string;
        currentPath: string;
      }
    ): Promise<ResolvedMenuItem | null> {
      const { isAuthenticated, user, brand, brandPortalPath, currentPath } = context;

      // 1. Auth state filtering
      const requiresAuth = item.requiresAuth !== false; // default true
      const hideWhenAuth = item.hideWhenAuth === true;

      if (requiresAuth && !isAuthenticated) {
        return null;
      }
      if (hideWhenAuth && isAuthenticated) {
        return null;
      }

      // 2. Feature flag check
      if (item.featureFlag) {
        const flagValue = _.get(sails.config.appmode, item.featureFlag, true);
        if (!flagValue) {
          return null;
        }
      }

      // 3. Role filtering
      if (item.requiredRoles && item.requiredRoles.length > 0 && isAuthenticated && user) {
        const hasRequiredRole = this.userHasAnyRole(user, brand, item.requiredRoles);
        if (!hasRequiredRole) {
          return null;
        }
      }

      // 4. Translation and placeholder handling
      let label = this.translateLabel(item.labelKey);
      let href = item.href;
      let external = item.external === true;

      // Handle placeholder fallback logic
      if (item.placeholderFallback) {
        const translatedLink = this.translateLabel(item.placeholderFallback.translationKey);
        
        // Check if translation exists (returns actual URL, not the key)
        if (translatedLink !== item.placeholderFallback.translationKey && translatedLink.trim() !== '') {
          // Translation exists - use it as external link
          href = translatedLink;
          external = true;
        } else if (sails.config.appmode?.hidePlaceholderPages === false) {
          // No translation but placeholder pages are allowed
          href = item.placeholderFallback.placeholderPath;
          external = false;
        } else {
          // No translation and placeholder pages are hidden
          return null;
        }
      } else if (item.visibleWhenTranslationExists) {
        // Item should only show if translation exists
        if (label === item.labelKey) {
          return null;
        }
      }

      // 5. URL building
      href = this.resolveUrl(href, brandPortalPath, external);

      // 6. Process children recursively
      let children: ResolvedMenuItem[] | undefined;
      if (item.children && item.children.length > 0) {
        children = await this.resolveMenuItems(item.children, context);
        // If all children were filtered out, hide the parent dropdown
        if (children.length === 0) {
          return null;
        }
      }

      // 7. Compute active state
      const active = this.isActive(href, currentPath, children);

      // 8. Build resolved item
      const resolved: ResolvedMenuItem = {
        label,
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
        sails.log.warn(`[MenuService] Translation failed for key: ${key}`, error);
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
  }
}

module.exports = new Services.Menu().exports();
