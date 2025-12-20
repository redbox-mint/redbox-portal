/**
 * AdminSidebarItem interface for the admin sidebar configuration editor
 * This mirrors the backend AdminSidebarConfig.ts interfaces
 */
export interface AdminSidebarItem {
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
  
  /** Fallback behavior for placeholder pages */
  placeholderFallback?: {
    translationKey: string;
    placeholderPath: string;
  };
}

/**
 * AdminSidebarSection interface for collapsible sections
 */
export interface AdminSidebarSection {
  /** Unique identifier for the section (used for collapse target IDs) */
  id: string;
  
  /** Translation key for the section heading */
  titleKey: string;
  
  /** Whether the section is expanded by default */
  defaultExpanded?: boolean;
  
  /** Role names required to see this section */
  requiredRoles?: string[];
  
  /** If true, section is only shown when user is authenticated */
  requiresAuth?: boolean;
  
  /** If true, section is hidden when user is authenticated */
  hideWhenAuth?: boolean;
  
  /** Optional feature flag key */
  featureFlag?: string;
  
  /** Items within this section */
  items: AdminSidebarItem[];
}

/**
 * AdminSidebarHeader interface for sidebar header configuration
 */
export interface AdminSidebarHeader {
  /** Translation key for the sidebar title */
  titleKey?: string;
  
  /** Icon class for the sidebar header (e.g., 'fa fa-cog') */
  iconClass?: string;
}
