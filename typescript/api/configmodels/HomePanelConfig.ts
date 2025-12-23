import { AppConfig } from './AppConfig.interface';

/**
 * Represents a single item within a home panel (mirrors menu link behavior)
 */
export interface HomePanelItem {
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
 * Represents a single home panel with heading and items
 */
export interface HomePanel {
  /**
   * Optional unique identifier for the panel
   * @title ID
   */
  id?: string;

  /**
   * Translation key for the panel heading
   * @title Title Key
   */
  titleKey: string;

  /**
   * Icon class for the panel header (e.g., 'icon-checklist' or 'fa fa-rocket')
   * @title Icon Class
   */
  iconClass: string;

  /**
   * Optional CSS class for the panel column (defaults to 'col-md-3 homepanel')
   * @title Column Class
   * @default "col-md-3 homepanel"
   */
  columnClass?: string;

  /**
   * Items to display within this panel
   * @title Items
   */
  items: HomePanelItem[];
}

/**
 * Resolved home panel item ready for rendering (after filtering and URL resolution)
 */
export interface ResolvedHomePanelItem {
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
 * Resolved home panel ready for rendering
 */
export interface ResolvedHomePanel {
  /** Panel ID */
  id?: string;
  /** Resolved panel title */
  title: string;
  /** Icon class for the panel header */
  iconClass: string;
  /** CSS class for the panel column */
  columnClass: string;
  /** Resolved items to render */
  items: ResolvedHomePanelItem[];
}

/**
 * Resolved home panels structure ready for rendering
 */
export interface ResolvedHomePanels {
  /** Panels to render */
  panels: ResolvedHomePanel[];
}

/**
 * Interface for home panel configuration data (used for config defaults and storage)
 */
export interface HomePanelConfigData {
  panels: HomePanel[];
}

/**
 * Home panel configuration model for brand-aware researcher home page rendering
 */
export class HomePanelConfig extends AppConfig {
  /**
   * Home panels to display on the researcher home page
   * @title Home Panels
   */
  panels: HomePanel[] = [];

  public static getFieldOrder(): string[] {
    return ['panels'];
  }
}

/**
 * Default home panel configuration that mirrors the current static home page structure
 */
export const DEFAULT_HOME_PANEL_CONFIG: HomePanelConfigData = {
  panels: [
    {
      id: 'plan',
      titleKey: 'menu-plan',
      iconClass: 'icon-checklist icon-3x',
      columnClass: 'col-md-3 homepanel',
      items: [
        { id: 'plan-create', labelKey: 'create-rdmp', href: '/record/rdmp/edit' },
        { id: 'plan-dashboard', labelKey: 'edit-dashboard-rdmp', href: '/dashboard/rdmp' },
        {
          id: 'plan-advice',
          labelKey: 'get-advice',
          href: '/getAdvice'
        }
      ]
    },
    {
      id: 'organise',
      titleKey: 'menu-organise-worspace',
      iconClass: 'fa fa-sitemap fa-3x',
      columnClass: 'col-md-3 homepanel',
      items: [
        { id: 'org-workspaces', labelKey: 'workspaces-dashboard', href: '/workspaces/list' },
        {
          id: 'org-services',
          labelKey: 'workspace-services-list',
          href: '/availableServicesList'
        }
      ]
    },
    {
      id: 'manage',
      titleKey: 'menu-manage',
      iconClass: 'fa fa-laptop fa-3x',
      columnClass: 'col-md-3 homepanel',
      items: [
        { id: 'manage-create', labelKey: 'create-datarecord', href: '/record/dataRecord/edit' },
        { id: 'manage-dashboard', labelKey: 'edit-dashboard-datarecord', href: '/dashboard/dataRecord' }
      ]
    },
    {
      id: 'publish',
      titleKey: 'menu-publish',
      iconClass: 'fa fa-rocket fa-3x',
      columnClass: 'col-md-3 homepanel',
      items: [
        { id: 'publish-create', labelKey: 'create-data-publication', href: '/record/dataPublication/edit' },
        { id: 'publish-dashboard', labelKey: 'edit-dashboard-publication', href: '/dashboard/dataPublication' }
      ]
    }
  ]
};

/**
 * Custom JSON Schema for HomePanelConfig that specifies the home-panels-editor widget
 * for the panels field. This schema is used by @ngx-formly/core/json-schema
 * to render the custom visual editor instead of the generic array component.
 */
export const HOME_PANEL_CONFIG_SCHEMA = {
  type: 'object',
  properties: {
    panels: {
      type: 'array',
      title: 'Home Panels',
      description: 'Panels to display on the researcher home page',
      widget: {
        formlyConfig: {
          type: 'home-panels-editor'
        }
      },
      items: {
        type: 'object',
        properties: {
          id: { type: 'string', title: 'ID' },
          titleKey: { type: 'string', title: 'Title Key' },
          iconClass: { type: 'string', title: 'Icon Class' },
          columnClass: { type: 'string', title: 'Column Class', default: 'col-md-3 homepanel' },
          items: {
            type: 'array',
            title: 'Panel Items',
            items: {
              type: 'object',
              properties: {
                id: { type: 'string', title: 'ID' },
                labelKey: { type: 'string', title: 'Label Key' },
                href: { type: 'string', title: 'URL' },
                external: { type: 'boolean', title: 'External Link', default: false },
                requiresAuth: { type: 'boolean', title: 'Requires Authentication', default: true },
                hideWhenAuth: { type: 'boolean', title: 'Hide When Authenticated', default: false },
                requiredRoles: { 
                  type: 'array', 
                  title: 'Required Roles',
                  items: { type: 'string' },
                  default: []
                },
                featureFlag: { type: 'string', title: 'Feature Flag' },
                visibleWhenTranslationExists: { type: 'boolean', title: 'Visible When Translation Exists', default: false }
              },
              required: ['labelKey', 'href']
            },
            default: []
          }
        },
        required: ['titleKey', 'iconClass', 'items']
      },
      default: []
    }
  },
  required: ['panels']
};
