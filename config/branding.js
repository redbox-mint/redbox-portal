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
    'site-branding-area-heading-colour',
    'panel-branding-background-colour',
    'panel-branding-colour',
    'panel-branding-border-colour',
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
    'heading-text-colour'
  ]
  ,
  /** Preview token TTL in seconds */
  previewTtlSeconds: 300
  ,
  /** Maximum logo upload size in bytes (Task 6) */
  logoMaxBytes: 512 * 1024
};
