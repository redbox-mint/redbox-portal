import { AppConfig } from './AppConfig.interface';

/**
 * Represents a single item within an admin sidebar section
 * Mirrors the link behavior from menu/home panel items
 */
export interface AdminSidebarItem {
  /**
   * Optional unique identifier for testing/override purposes
   * @title ID
   */
  id?: string;

  /**
   * Translation key for the item label
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
}

/**
 * Represents a collapsible section in the admin sidebar
 */
export interface AdminSidebarSection {
  /**
   * Unique identifier for the section (used for collapse target IDs)
   * @title ID
   */
  id: string;

  /**
   * Translation key for the section heading
   * @title Title Key
   */
  titleKey: string;

  /**
   * Whether the section is expanded by default
   * @title Default Expanded
   * @default true
   */
  defaultExpanded?: boolean;

  /**
   * Role names required to see this section (user must have at least one)
   * @title Required Roles
   * @default []
   */
  requiredRoles?: string[];

  /**
   * If true, section is only shown when user is authenticated
   * @title Requires Authentication
   * @default true
   */
  requiresAuth?: boolean;

  /**
   * If true, section is hidden when user is authenticated (for anonymous-only sections)
   * @title Hide When Authenticated
   * @default false
   */
  hideWhenAuth?: boolean;

  /**
   * Optional feature flag key (evaluated via sails.config.appmode)
   * @title Feature Flag
   */
  featureFlag?: string;

  /**
   * Items within this section
   * @title Items
   */
  items: AdminSidebarItem[];
}

/**
 * Header configuration for the admin sidebar
 */
export interface AdminSidebarHeader {
  /**
   * Translation key for the sidebar title
   * @title Title Key
   * @default "menu-admin"
   */
  titleKey?: string;

  /**
   * Icon class for the sidebar header (e.g., 'fa fa-cog')
   * @title Icon Class
   * @default "fa fa-cog"
   */
  iconClass?: string;
}

/**
 * Resolved admin sidebar item ready for rendering (after filtering and URL resolution)
 */
export interface ResolvedAdminSidebarItem {
  /** Resolved display label */
  label: string;
  /** Resolved full URL */
  href: string;
  /** Whether to open in new tab */
  external: boolean;
  /** Target attribute value */
  target?: string;
}

/**
 * Resolved admin sidebar section ready for rendering
 */
export interface ResolvedAdminSidebarSection {
  /** Section ID for collapse target */
  id: string;
  /** Resolved section title */
  title: string;
  /** Whether the section is expanded by default */
  defaultExpanded: boolean;
  /** Resolved items to render */
  items: ResolvedAdminSidebarItem[];
}

/**
 * Resolved admin sidebar header ready for rendering
 */
export interface ResolvedAdminSidebarHeader {
  /** Resolved sidebar title */
  title: string;
  /** Icon class for the sidebar header */
  iconClass: string;
}

/**
 * Resolved admin sidebar structure ready for rendering
 */
export interface ResolvedAdminSidebar {
  /** Sidebar header */
  header: ResolvedAdminSidebarHeader;
  /** Sections to render */
  sections: ResolvedAdminSidebarSection[];
  /** Footer links to render */
  footerLinks: ResolvedAdminSidebarItem[];
}

/**
 * Interface for admin sidebar configuration data (used for config defaults and storage)
 */
export interface AdminSidebarConfigData {
  header?: AdminSidebarHeader;
  sections: AdminSidebarSection[];
  footerLinks: AdminSidebarItem[];
}

/**
 * Admin sidebar configuration model for brand-aware admin navigation rendering
 */
export class AdminSidebarConfig extends AppConfig {
  /**
   * Header configuration for the sidebar
   * @title Header
   */
  header?: AdminSidebarHeader;

  /**
   * Collapsible sections in the admin sidebar
   * @title Sections
   */
  sections: AdminSidebarSection[] = [];

  /**
   * Footer links at the bottom of the sidebar
   * @title Footer Links
   */
  footerLinks: AdminSidebarItem[] = [];

  public static getFieldOrder(): string[] {
    return ['header', 'sections', 'footerLinks'];
  }
}

/**
 * Default admin sidebar configuration that mirrors the current static sidebar structure
 */
export const DEFAULT_ADMIN_SIDEBAR_CONFIG: AdminSidebarConfigData = {
  header: {
    titleKey: 'menu-admin',
    iconClass: 'fa fa-cog'
  },
  sections: [
    {
      id: 'analyze',
      titleKey: 'menu-analyze',
      defaultExpanded: true,
      items: [
        { id: 'reports', labelKey: 'reports-heading', href: '/admin/reports' },
        { id: 'export', labelKey: 'menu-export', href: '/admin/export' },
        { id: 'deleted', labelKey: 'deleted-records-heading', href: '/admin/deletedRecords' }
      ]
    },
    {
      id: 'system',
      titleKey: 'menu-syssettings',
      defaultExpanded: true,
      requiredRoles: ['Admin'],
      items: [
        { id: 'roles', labelKey: 'menu-rolemgmt', href: '/admin/roles' },
        { id: 'users', labelKey: 'menu-usermgmt', href: '/admin/users' },
        { id: 'support', labelKey: 'menu-supportagreement', href: '/admin/supportAgreement' },
        { id: 'system-msg', labelKey: 'menu-systemmessages', href: '/admin/appconfig/edit/systemMessage' },
        { id: 'domains', labelKey: 'menu-authorizeddomainsemails', href: '/admin/appconfig/edit/authorizedDomainsEmails' },
        { id: 'menu', labelKey: 'menu-menuconfiguration', href: '/admin/appconfig/edit/menu' },
        { id: 'homepanels', labelKey: 'menu-homepanelsconfiguration', href: '/admin/appconfig/edit/homePanels' },
        { id: 'adminsidebar', labelKey: 'menu-adminsidebarconfiguration', href: '/admin/appconfig/edit/adminSidebar' }
      ]
    },
    {
      id: 'lookup',
      titleKey: 'system-lookup-records',
      defaultExpanded: true,
      requiredRoles: ['Admin'],
      items: [
        { id: 'party', labelKey: 'system-lookup-record-item1', href: '/dashboard/party' }
      ]
    }
  ],
  footerLinks: [
    { id: 'branding', labelKey: 'admin-configure-branding', href: '/admin/branding' },
    { id: 'translation', labelKey: 'admin-configure-translation', href: '/admin/translation' }
  ]
};
