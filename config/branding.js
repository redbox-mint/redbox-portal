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
    'site-branding-area-background',
    'site-branding-area-heading-color',
    'panel-branding-background-color',
    'panel-branding-color',
    'panel-branding-border-color',
    'main-menu-branding-background-color',
    'header-branding-link-color',
    'header-branding-background-color',
    'logo-link-color-branding',
    'main-menu-active-item-color',
    'main-menu-active-item-background-color',
    'main-menu-inactive-item-color',
    'main-menu-inactive-item-color-hover',
    'main-menu-inactive-item-background-color-hover',
    'main-menu-inactive-item-background-color',
    'main-menu-inactive-dropdown-item-color',
    'main-menu-inactive-dropdown-item-color-hover',
    'main-menu-active-dropdown-item-color',
    'main-menu-active-dropdown-item-color-hover',
    'main-menu-active-dropdown-item-background-color-hover',
    'main-menu-selected-item-color',
    'main-menu-selected-item-background-color',
    'footer-bottom-area-branding-background-color',
    'footer-bottom-area-branding-color',
    'main-content-heading-text-branding-color',
    // Font families
    'branding-font-family',
    'branding-main-menu-font-family',
    'branding-footer-font-family',
    'branding-main-content-heading-font-family',
    // Bootstrap control sizes (optional exposure)
    'input-btn-font-size',
    'input-btn-padding-y',
    'input-btn-padding-x',
    // Hyperlink colors
    'anchor-color',
    'anchor-color-hover',
    'anchor-color-focus',
    // Extended set to support contrast validation pairs (Task 5 tests)
    'primary-color',
    'primary-text-color',
    'secondary-color',
    'secondary-text-color',
    'accent-color',
    'accent-text-color',
    'surface-color',
    'body-text-color',
    'heading-text-color'
  ]
  ,
  /** Preview token TTL in seconds */
  previewTtlSeconds: 300
  ,
  /** Maximum logo upload size in bytes (Task 6) */
  logoMaxBytes: 512 * 1024
};
