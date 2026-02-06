/**
 * Branding Config Interface
 * (sails.config.branding)
 * 
 * Branding variable allowlist and settings.
 */

export interface BrandingConfig {
    /** Allowed SCSS variable names for branding customization */
    variableAllowList: string[];

    /** Maximum logo upload size in bytes */
    logoMaxBytes: number;

    /** In-memory logo cache TTL in milliseconds */
    logoCacheTtlMs: number;
}

/**
 * Default branding configuration
 */
export const branding: BrandingConfig = {
    /**
     * Keys (without leading $) allowed in BrandingConfig.variables
     */
    variableAllowList: [
        // CSS-property-name variants (using 'color' to match CSS)
        'primary-color',
        'primary-text-color',
        'secondary-color',
        'secondary-text-color',
        'accent-color',
        'accent-text-color',
        'body-text-color',
        'surface-color',
        'heading-text-color',
        'site-branding-area-background-color',
        'panel-branding-color',
        'main-menu-branding-background-colour',
        'header-branding-link-colour',
        'header-branding-background-colour',
        'logo-link-colour-branding',
        'main-menu-active-item-colour',
        'main-menu-active-item-background-colour',
        'main-menu-inactive-item-colour',
        'main-menu-inactive-item-colour-hover',
        'main-menu-inactive-item-background-colour-hover',
        'main-menu-inactive-item-background-colour',
        'main-menu-inactive-dropdown-item-colour',
        'main-menu-inactive-dropdown-item-colour-hover',
        'main-menu-active-dropdown-item-colour',
        'main-menu-active-dropdown-item-colour-hover',
        'main-menu-active-dropdown-item-background-colour-hover',
        'main-menu-active-dropdown-item-background-colour-hover', // Added from JS content, slight mismatch in previous JS file on key name? No, seems valid.
        'main-menu-selected-item-colour',
        'main-menu-selected-item-background-colour',
        'footer-bottom-area-branding-background-colour',
        'footer-bottom-area-branding-colour',
        'main-content-heading-text-branding-colour',
        // Font families
        'branding-font-family',
        'branding-main-menu-font-family',
        'branding-footer-font-family',
        'branding-main-content-heading-font-family',
        // Bootstrap control sizes (optional exposure)
        'input-btn-font-size',
        'input-btn-padding-y',
        'input-btn-padding-x',
        // Hyperlink colours
        'anchor-colour',
        'anchor-colour-hover',
        'anchor-colour-focus',
        // Extended set to support contrast validation pairs
        'primary-colour',
        'primary-text-colour',
        'secondary-colour',
        'secondary-text-colour',
        'accent-colour',
        'accent-text-colour',
        'surface-colour',
        'body-text-colour',
        'heading-text-colour',
        'header-branding-link-color',
        'header-branding-background-color',
        'header-branding-text-color',
        'body-background-color',
        'footer-bottom-area-branding-background-color',
        'footer-bottom-area-branding-color',
        'panel-branding-background-color',
        'panel-branding-border-color',
        'anchor-color',
        'anchor-color-hover',
        'anchor-color-focus',
        'main-menu-branding-background-color',
        'main-menu-inactive-item-color',
        'main-menu-inactive-item-color-hover',
        'main-menu-inactive-item-background-color-hover',
        'main-menu-inactive-item-background-color',
        'main-menu-active-item-color',
        'main-menu-active-item-color-hover',
        'main-menu-active-item-background-color',
        'main-menu-active-item-background-color-hover',
        'main-menu-inactive-dropdown-item-color',
        'main-menu-inactive-dropdown-item-color-hover',
        'main-menu-inactive-dropdown-item-background-color',
        'main-menu-active-dropdown-item-color',
        'main-menu-active-dropdown-item-color-hover',
        'main-menu-active-dropdown-item-background-color',
        'main-menu-active-dropdown-item-background-color-hover',
        // Bootstrap contextual theme variables
        'primary', 'secondary', 'success', 'info', 'warning', 'danger', 'light', 'dark'
    ],
    /** Maximum logo upload size in bytes */
    logoMaxBytes: 512 * 1024,
    /** In-memory logo cache TTL in milliseconds */
    logoCacheTtlMs: 24 * 60 * 60 * 1000
};

