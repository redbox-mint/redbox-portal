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
  /** Whether this link represents the current admin screen */
  active?: boolean;
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
 * Canonical sidebar defaults shared by branding configuration and the app-config editor
 */
export const DEFAULT_ADMIN_SIDEBAR_CONFIG: AdminSidebarConfigData = {
  header: { titleKey: 'menu-admin', iconClass: 'fa fa-cog' },
  sections: [
    {
      id: 'records', titleKey: 'admin-nav-records', defaultExpanded: true,
      items: [
        { id: 'reports', labelKey: 'admin-nav-reports', href: '/admin/reports' },
        { id: 'named-query', labelKey: 'admin-nav-named-query', href: '/admin/named-query' },
        { id: 'harvest-runs', labelKey: 'admin-nav-harvest-runs', href: '/admin/harvest-runs' },
        { id: 'export', labelKey: 'admin-nav-export', href: '/admin/export' },
        { id: 'deleted', labelKey: 'admin-nav-deleted', href: '/admin/deletedRecords' },
      ]
    },
    {
      id: 'people', titleKey: 'admin-nav-people', defaultExpanded: true,
      requiredRoles: ['Admin'],
      items: [
        { id: 'users', labelKey: 'admin-nav-users', href: '/admin/users' },
        { id: 'roles', labelKey: 'admin-nav-roles', href: '/admin/roles' },
        { id: 'siem', labelKey: 'menu-siem', href: '/admin/appconfig/edit/siem' },
        { id: 'domains', labelKey: 'admin-nav-domains', href: '/admin/appconfig/edit/authorizedDomainsEmails' },
      ]
    },
    {
      id: 'site', titleKey: 'admin-nav-site', defaultExpanded: true,
      requiredRoles: ['Admin'],
      items: [
        { id: 'system-msg', labelKey: 'admin-nav-system-msg', href: '/admin/appconfig/edit/systemMessage' },
        { id: 'email-templates', labelKey: 'menu-email-templates', href: '/admin/email-templates' },
        { id: 'menu', labelKey: 'admin-nav-menu', href: '/admin/appconfig/edit/menu' },
        { id: 'homepanels', labelKey: 'admin-nav-homepanels', href: '/admin/appconfig/edit/homePanels' },
        { id: 'adminsidebar', labelKey: 'admin-nav-adminsidebar', href: '/admin/appconfig/edit/adminSidebar' },
        { id: 'dashboard-config', labelKey: 'admin-nav-dashboard-config', href: '/admin/dashboard-config' },
        { id: 'branding', labelKey: 'admin-nav-branding', href: '/admin/branding' },
        { id: 'translation', labelKey: 'admin-nav-translation', href: '/admin/translation' },
        { id: 'web-analytics', labelKey: 'admin-nav-web-analytics', href: '/admin/appconfig/edit/webAnalytics' },
      ]
    },
    {
      id: 'lookups', titleKey: 'admin-nav-lookups', defaultExpanded: true,
      requiredRoles: ['Admin'],
      items: [
        { id: 'party', labelKey: 'admin-nav-party', href: '/admin/parties' },
        { id: 'vocabulary', labelKey: 'admin-nav-vocabulary', href: '/admin/vocabulary/manager' },
        { id: 'figshare-vocabularies', labelKey: 'admin-nav-figshare-vocabularies', href: '/admin/integrations/figshare/vocabularies' },
      ]
    },
    {
      id: 'integrations', titleKey: 'admin-nav-integrations', defaultExpanded: true,
      requiredRoles: ['Admin'],
      items: [
        { id: 'figsharepublishing', labelKey: 'admin-nav-figsharepublishing', href: '/admin/appconfig/edit/figsharePublishing' },
        { id: 'onipublishing', labelKey: 'admin-nav-onipublishing', href: '/admin/appconfig/edit/oniPublishing' },
        { id: 'doipublishing', labelKey: 'admin-nav-doipublishing', href: '/admin/appconfig/edit/doiPublishing' },
        { id: 'raidpublishing', labelKey: 'admin-nav-raidpublishing', href: '/admin/appconfig/edit/raidPublishing' },
        { id: 'notifications', labelKey: 'admin-nav-notifications', href: '/admin/appconfig/edit/integrationNotification' },
      ]
    },
    {
      id: 'developer', titleKey: 'admin-nav-developer', defaultExpanded: true,
      requiredRoles: ['Admin'],
      items: [
        { id: 'api-docs', labelKey: 'admin-nav-api-docs', href: '/admin/api-docs' },
      ]
    },
  ],
  footerLinks: []
};

/**
 * Custom JSON Schema for AdminSidebarConfig that specifies the admin-sidebar-editor widget
 * for the sections and footerLinks fields. This schema is used by @ngx-formly/core/json-schema
 * to render the custom visual editor instead of the generic array component.
 */
export const ADMIN_SIDEBAR_CONFIG_SCHEMA = {
  type: 'object',
  properties: {
    header: {
      type: 'object',
      title: 'admin-config-label-header',
      description: 'Header configuration for the admin sidebar',
      widget: {
        formlyConfig: {
          type: 'admin-sidebar-editor'
        }
      },
      properties: {
        titleKey: { type: 'string', title: 'admin-config-label-title-key', default: 'menu-admin' },
        iconClass: { type: 'string', title: 'admin-config-label-icon-class', default: 'fa fa-cog' }
      }
    },
    sections: {
      type: 'array',
      title: 'admin-config-label-sections',
      description: 'Collapsible sections in the admin sidebar',
      items: {
        type: 'object',
        properties: {
          id: { type: 'string', title: 'admin-config-label-id' },
          titleKey: { type: 'string', title: 'admin-config-label-title-key' },
          defaultExpanded: { type: 'boolean', title: 'admin-config-label-default-expanded', default: true },
          requiresAuth: { type: 'boolean', title: 'admin-config-label-requires-authentication', default: true },
          hideWhenAuth: { type: 'boolean', title: 'admin-config-label-hide-when-authenticated', default: false },
          requiredRoles: {
            type: 'array',
            title: 'admin-config-label-required-roles',
            items: { type: 'string' },
            default: []
          },
          featureFlag: { type: 'string', title: 'admin-config-label-feature-flag' },
          items: {
            type: 'array',
            title: 'admin-config-label-items',
            items: { $ref: '#/definitions/sidebarItem' },
            default: []
          }
        },
        required: ['id', 'titleKey', 'items']
      },
      default: []
    },
    footerLinks: {
      type: 'array',
      title: 'admin-config-label-footer-links',
      description: 'Links displayed at the bottom of the sidebar',
      items: { $ref: '#/definitions/sidebarItem' },
      default: []
    }
  },
  definitions: {
    sidebarItem: {
      type: 'object',
      properties: {
        id: { type: 'string', title: 'admin-config-label-id' },
        labelKey: { type: 'string', title: 'admin-config-label-label-key' },
        href: { type: 'string', title: 'admin-config-label-url' },
        external: { type: 'boolean', title: 'admin-config-label-external-link', default: false },
        requiresAuth: { type: 'boolean', title: 'admin-config-label-requires-authentication', default: true },
        hideWhenAuth: { type: 'boolean', title: 'admin-config-label-hide-when-authenticated', default: false },
        requiredRoles: {
          type: 'array',
          title: 'admin-config-label-required-roles',
          items: { type: 'string' },
          default: []
        },
        featureFlag: { type: 'string', title: 'admin-config-label-feature-flag' },
        visibleWhenTranslationExists: { type: 'boolean', title: 'admin-config-label-visible-when-translation-exists', default: false }
      },
      required: ['labelKey', 'href']
    }
  },
  required: ['sections', 'footerLinks']
};
