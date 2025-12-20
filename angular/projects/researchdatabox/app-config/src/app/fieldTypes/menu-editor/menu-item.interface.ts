/**
 * MenuItem interface for the menu configuration editor
 * This mirrors the backend MenuConfig.ts interface
 */
export interface MenuItem {
  /** Optional unique identifier for testing/override purposes */
  id?: string;
  
  /** Translation key for the menu item label */
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
  
  /** Child menu items (for dropdown menus) */
  children?: MenuItem[];
}
