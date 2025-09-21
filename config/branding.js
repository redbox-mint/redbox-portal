/**
 * config/branding.js
 *
 * Semantic variable whitelist for tenant branding overrides.
 * Using left-hand (semantic) SCSS variable names from assets/styles/default-variables.scss.
 *
 * Requirements: Req 1 (per-tenant config), Req 3 (controlled palette), foundation for Tasks 1-3.
 */
module.exports.branding = {
  /**
   * Keys (without leading $) allowed in BrandingConfig.variables
   */
  variableWhitelist: [
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
    // Extended set to support contrast validation pairs (Task 5 tests)
    'primary-colour',
    'primary-text-colour',
    'secondary-colour',
    'secondary-text-colour',
    'accent-colour',
    'accent-text-colour',
    'surface-colour',
    'body-text-colour',
    'heading-text-colour',
    'site-branding-area-background-color',
    'header-branding-link-color',
    'header-branding-background-color',
    'header-branding-text-color',
    'body-background-color',
    'body-text-color',
    'footer-bottom-area-branding-background-color',
    'footer-bottom-area-branding-color',
    'panel-branding-background-color',
    'panel-branding-color',
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
  ]
  ,
  /** Preview token TTL in seconds */
  previewTtlSeconds: 300
  ,
  /** Maximum logo upload size in bytes (Task 6) */
  logoMaxBytes: 512 * 1024
};
