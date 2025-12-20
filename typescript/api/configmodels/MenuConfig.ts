import { AppConfig } from './AppConfig.interface';

/**
 * Represents a single menu item with optional children for dropdowns
 */
export interface MenuItem {
  /**
   * Optional unique identifier for testing/override purposes
   * @title ID
   */
  id?: string;

  /**
   * Translation key for the menu item label
   * @title Label Key
   */
  labelKey: string;

  /**
   * URL path (relative to brand/portal) or absolute URL if external is true
   * @title URL
   */
  href: string;

  /**
   * If true, opens in new tab with rel="noopener noreferrer"
   * @title External Link
   * @default false
   */
  external?: boolean;

  /**
   * If true, item is only shown when user is authenticated
   * @title Requires Authentication
   * @default true
   */
  requiresAuth?: boolean;

  /**
   * If true, item is hidden when user is authenticated (for anonymous-only items)
   * @title Hide When Authenticated
   * @default false
   */
  hideWhenAuth?: boolean;

  /**
   * Role names required to see this item (user must have at least one)
   * @title Required Roles
   * @default []
   */
  requiredRoles?: string[];

  /**
   * Optional feature flag key (evaluated via sails.config.appmode)
   * @title Feature Flag
   */
  featureFlag?: string;

  /**
   * If true, item is hidden when translation equals the key (no translation exists)
   * @title Visible When Translation Exists
   * @default false
   */
  visibleWhenTranslationExists?: boolean;

  /**
   * Fallback behavior for placeholder pages
   * @title Placeholder Fallback
   */
  placeholderFallback?: {
    /**
     * Translation key to check for external link
     */
    translationKey: string;
    /**
     * Path to use when placeholder pages are allowed
     */
    placeholderPath: string;
  };

  /**
   * Child menu items (for dropdown menus)
   * @title Children
   * @default []
   */
  children?: MenuItem[];
}

/**
 * Resolved menu item ready for rendering (after filtering and URL resolution)
 */
export interface ResolvedMenuItem {
  /** Resolved display label */
  label: string;
  /** Resolved full URL */
  href: string;
  /** Whether to open in new tab */
  external: boolean;
  /** Target attribute value */
  target?: string;
  /** Whether this item is currently active */
  active?: boolean;
  /** Child items for dropdowns */
  children?: ResolvedMenuItem[];
}

/**
 * Resolved menu structure ready for rendering
 */
export interface ResolvedMenu {
  /** Menu items to render */
  items: ResolvedMenuItem[];
  /** Whether to show the search bar */
  showSearch: boolean;
}

/**
 * Interface for menu configuration data (used for config defaults and storage)
 */
export interface MenuConfigData {
  items: MenuItem[];
  showSearch: boolean;
}

/**
 * Menu configuration model for brand-aware menu rendering
 */
export class MenuConfig extends AppConfig {
  /**
   * Menu items to display
   * @title Menu Items
   */
  items: MenuItem[] = [];

  /**
   * Whether to show the search bar in the menu
   * @title Show Search Bar
   * @default true
   */
  showSearch: boolean = true;

  public static getFieldOrder(): string[] {
    return ['showSearch', 'items'];
  }
}

/**
 * Default menu configuration that mirrors the current static menu structure
 */
export const DEFAULT_MENU_CONFIG: MenuConfigData = {
  items: [
    {
      id: 'home-auth',
      labelKey: 'menu-home',
      href: '/researcher/home',
      requiresAuth: true
    },
    {
      id: 'plan',
      labelKey: 'menu-plan-nav',
      href: '#',
      requiresAuth: true,
      children: [
        { id: 'plan-create', labelKey: 'create-rdmp', href: '/record/rdmp/edit' },
        { id: 'plan-dashboard', labelKey: 'edit-dashboard-rdmp', href: '/dashboard/rdmp' },
        {
          id: 'plan-advice',
          labelKey: 'get-advice',
          href: '/getAdvice',
          placeholderFallback: {
            translationKey: 'get-advice-link',
            placeholderPath: '/getAdvice'
          },
          visibleWhenTranslationExists: true
        }
      ]
    },
    {
      id: 'org',
      labelKey: 'menu-organisation-nav',
      href: '#',
      requiresAuth: true,
      children: [
        { id: 'org-workspaces', labelKey: 'workspaces-dashboard', href: '/workspaces/list' },
        {
          id: 'org-services',
          labelKey: 'workspace-services-list',
          href: '/availableServicesList',
          placeholderFallback: {
            translationKey: 'workspace-services-list-link',
            placeholderPath: '/availableServicesList'
          },
          visibleWhenTranslationExists: true
        }
      ]
    },
    {
      id: 'manage',
      labelKey: 'menu-manage-nav',
      href: '#',
      requiresAuth: true,
      children: [
        { id: 'manage-create', labelKey: 'create-datarecord', href: '/record/dataRecord/edit' },
        { id: 'manage-dashboard', labelKey: 'edit-dashboard-datarecord', href: '/dashboard/dataRecord' }
      ]
    },
    {
      id: 'publish',
      labelKey: 'menu-publish-nav',
      href: '#',
      requiresAuth: true,
      children: [
        { id: 'publish-create', labelKey: 'create-data-publication', href: '/record/dataPublication/edit' },
        { id: 'publish-dashboard', labelKey: 'edit-dashboard-publication', href: '/dashboard/dataPublication' }
      ]
    },
    {
      id: 'admin',
      labelKey: 'menu-admin',
      href: '/admin',
      requiresAuth: true,
      requiredRoles: ['Admin', 'Librarians']
    },
    {
      id: 'home-anon',
      labelKey: 'menu-home',
      href: '/home',
      requiresAuth: false,
      hideWhenAuth: true
    }
  ],
  showSearch: true
};
