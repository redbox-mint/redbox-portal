/**
 * HomePanelItem interface for the home panels configuration editor
 * This mirrors the backend HomePanelConfig.ts interface
 */
export interface HomePanelItem {
  /** Optional unique identifier for testing/override purposes */
  id?: string;
  
  /** Translation key for the item label */
  labelKey: string;
  
  /** URL path (relative to brand/portal) or absolute URL if external is true */
  href: string;
  
  /** If true, opens in new tab with rel="noopener noreferrer" */
  external?: boolean;
  
  /** If true, item is only shown when user is authenticated */
  requiresAuth?: boolean;
  
  /** If true, item is hidden when user is authenticated (for anonymous-only items) */
  hideWhenAuth?: boolean;
  
  /** Role names required to see this item (user must have at least one) */
  requiredRoles?: string[];
  
  /** Optional feature flag key */
  featureFlag?: string;
  
  /** If true, item is hidden when translation equals the key */
  visibleWhenTranslationExists?: boolean;
}

/**
 * HomePanel interface for the home panels configuration editor
 * This mirrors the backend HomePanelConfig.ts interface
 */
export interface HomePanel {
  /** Optional unique identifier for the panel */
  id?: string;
  
  /** Translation key for the panel heading */
  titleKey: string;
  
  /** Icon class for the panel header (e.g., 'icon-checklist' or 'fa fa-rocket') */
  iconClass: string;
  
  /** Optional CSS class for the panel column */
  columnClass?: string;
  
  /** Items to display within this panel */
  items: HomePanelItem[];
}
