export interface BrandingThemeToken {
  key: string;
  cssVar: string;
  defaultValue: string;
  aliases?: string[];
  exposed?: boolean;
}

export const brandingThemeTokens: BrandingThemeToken[] = [
  { key: 'site-branding-area-background-color', cssVar: '--rb-site-branding-area-background-color', defaultValue: '#b1101a', aliases: ['site-branding-area-background-colour'], exposed: true },
  { key: 'site-branding-area-heading-color', cssVar: '--rb-site-branding-area-heading-color', defaultValue: '#888888', aliases: ['site-branding-area-heading-colour'], exposed: false },
  { key: 'panel-branding-background-color', cssVar: '--rb-panel-branding-background-color', defaultValue: '#b1101a', aliases: ['panel-branding-background-colour'], exposed: true },
  { key: 'panel-branding-color', cssVar: '--rb-panel-branding-color', defaultValue: '#ffffff', aliases: ['panel-branding-colour'], exposed: true },
  { key: 'panel-branding-border-color', cssVar: '--rb-panel-branding-border-color', defaultValue: '#dddddd', aliases: ['panel-branding-border-colour'], exposed: true },
  { key: 'main-menu-branding-background-color', cssVar: '--rb-main-menu-branding-background-color', defaultValue: '#500005', aliases: ['main-menu-branding-background-colour'], exposed: true },
  { key: 'header-branding-link-color', cssVar: '--rb-header-branding-link-color', defaultValue: '#222222', aliases: ['header-branding-link-colour'], exposed: true },
  { key: 'header-branding-background-color', cssVar: '--rb-header-branding-background-color', defaultValue: '#f4f4f4', aliases: ['header-branding-background-colour'], exposed: true },
  { key: 'header-branding-text-color', cssVar: '--rb-header-branding-text-color', defaultValue: '#333333', aliases: ['header-branding-text-colour'], exposed: true },
  { key: 'logo-link-color-branding', cssVar: '--rb-logo-link-color-branding', defaultValue: '#262626', aliases: ['logo-link-colour-branding'], exposed: false },
  { key: 'main-menu-active-item-color', cssVar: '--rb-main-menu-active-item-color', defaultValue: '#ffffff', aliases: ['main-menu-active-item-colour'], exposed: true },
  { key: 'main-menu-active-item-color-hover', cssVar: '--rb-main-menu-active-item-color-hover', defaultValue: '#888888', aliases: ['main-menu-active-item-colour-hover'], exposed: true },
  { key: 'main-menu-active-item-background-color', cssVar: '--rb-main-menu-active-item-background-color', defaultValue: '#500005', aliases: ['main-menu-active-item-background-colour'], exposed: true },
  { key: 'main-menu-active-item-background-color-hover', cssVar: '--rb-main-menu-active-item-background-color-hover', defaultValue: '#700007', aliases: ['main-menu-active-item-background-colour-hover'], exposed: true },
  { key: 'main-menu-inactive-item-color', cssVar: '--rb-main-menu-inactive-item-color', defaultValue: '#ffffff', aliases: ['main-menu-inactive-item-colour'], exposed: true },
  { key: 'main-menu-inactive-item-color-hover', cssVar: '--rb-main-menu-inactive-item-color-hover', defaultValue: '#888888', aliases: ['main-menu-inactive-item-colour-hover'], exposed: true },
  { key: 'main-menu-inactive-item-background-color', cssVar: '--rb-main-menu-inactive-item-background-color', defaultValue: '#500005', aliases: ['main-menu-inactive-item-background-colour'], exposed: true },
  { key: 'main-menu-inactive-item-background-color-hover', cssVar: '--rb-main-menu-inactive-item-background-color-hover', defaultValue: '#ffffff', aliases: ['main-menu-inactive-item-background-colour-hover'], exposed: true },
  { key: 'main-menu-inactive-dropdown-item-color', cssVar: '--rb-main-menu-inactive-dropdown-item-color', defaultValue: '#a9a9a9', aliases: ['main-menu-inactive-dropdown-item-colour'], exposed: true },
  { key: 'main-menu-inactive-dropdown-item-color-hover', cssVar: '--rb-main-menu-inactive-dropdown-item-color-hover', defaultValue: '#888888', aliases: ['main-menu-inactive-dropdown-item-colour-hover'], exposed: true },
  { key: 'main-menu-inactive-dropdown-item-background-color', cssVar: '--rb-main-menu-inactive-dropdown-item-background-color', defaultValue: '#222222', aliases: ['main-menu-inactive-dropdown-item-background-colour'], exposed: true },
  { key: 'main-menu-active-dropdown-item-color', cssVar: '--rb-main-menu-active-dropdown-item-color', defaultValue: '#a9a9a9', aliases: ['main-menu-active-dropdown-item-colour'], exposed: true },
  { key: 'main-menu-active-dropdown-item-color-hover', cssVar: '--rb-main-menu-active-dropdown-item-color-hover', defaultValue: '#888888', aliases: ['main-menu-active-dropdown-item-colour-hover'], exposed: true },
  { key: 'main-menu-active-dropdown-item-background-color', cssVar: '--rb-main-menu-active-dropdown-item-background-color', defaultValue: '#b1101a', aliases: ['main-menu-active-dropdown-item-background-colour'], exposed: true },
  { key: 'main-menu-active-dropdown-item-background-color-hover', cssVar: '--rb-main-menu-active-dropdown-item-background-color-hover', defaultValue: '#ffffff', aliases: ['main-menu-active-dropdown-item-background-colour-hover'], exposed: true },
  { key: 'main-menu-selected-item-color', cssVar: '--rb-main-menu-selected-item-color', defaultValue: '#000000', aliases: ['main-menu-selected-item-colour'], exposed: false },
  { key: 'main-menu-selected-item-background-color', cssVar: '--rb-main-menu-selected-item-background-color', defaultValue: '#500005', aliases: ['main-menu-selected-item-background-colour'], exposed: false },
  { key: 'body-background-color', cssVar: '--rb-body-background-color', defaultValue: '#ffffff', aliases: ['body-background-colour'], exposed: true },
  { key: 'body-text-color', cssVar: '--rb-body-text-color', defaultValue: '#333333', aliases: ['body-text-colour'], exposed: true },
  { key: 'anchor-color', cssVar: '--rb-anchor-color', defaultValue: '#337ab7', aliases: ['anchor-colour'], exposed: true },
  { key: 'anchor-color-hover', cssVar: '--rb-anchor-color-hover', defaultValue: '#23527c', aliases: ['anchor-colour-hover'], exposed: true },
  { key: 'anchor-color-focus', cssVar: '--rb-anchor-color-focus', defaultValue: '#23527c', aliases: ['anchor-colour-focus'], exposed: true },
  { key: 'main-content-heading-text-branding-color', cssVar: '--rb-main-content-heading-text-branding-color', defaultValue: '#000000', aliases: ['main-content-heading-text-branding-colour'], exposed: false },
  { key: 'footer-bottom-area-branding-background-color', cssVar: '--rb-footer-bottom-area-branding-background-color', defaultValue: '#000000', aliases: ['footer-bottom-area-branding-background-colour'], exposed: true },
  { key: 'footer-bottom-area-branding-color', cssVar: '--rb-footer-bottom-area-branding-color', defaultValue: '#ffffff', aliases: ['footer-bottom-area-branding-colour'], exposed: true },
  { key: 'submit-button-background-color', cssVar: '--rb-submit-button-background-color', defaultValue: '#428bca', aliases: ['submit-button-background-colour'], exposed: false },
  { key: 'submit-button-text-color', cssVar: '--rb-submit-button-text-color', defaultValue: '#ffffff', aliases: ['submit-button-text-colour'], exposed: false },
  { key: 'submit-button-hover-background-color', cssVar: '--rb-submit-button-hover-background-color', defaultValue: '#428bca', aliases: ['submit-button-hover-background-colour'], exposed: false },
  { key: 'navbar-toggle-border-color', cssVar: '--rb-navbar-toggle-border-color', defaultValue: '#ffffff', aliases: ['navbar-toggle-border-colour'], exposed: false },
  { key: 'navbar-toggle-icon-color', cssVar: '--rb-navbar-toggle-icon-color', defaultValue: '#ffffff', aliases: ['navbar-toggle-icon-colour'], exposed: false },
  { key: 'navbar-collapse-bg', cssVar: '--rb-navbar-collapse-bg', defaultValue: '#222222', aliases: ['navbar-collapse-bg-colour'], exposed: false },
  { key: 'primary', cssVar: '--rb-primary', defaultValue: '#0d6efd', exposed: true },
  { key: 'secondary', cssVar: '--rb-secondary', defaultValue: '#6c757d', exposed: true },
  { key: 'success', cssVar: '--rb-success', defaultValue: '#198754', exposed: true },
  { key: 'info', cssVar: '--rb-info', defaultValue: '#0dcaf0', exposed: true },
  { key: 'warning', cssVar: '--rb-warning', defaultValue: '#ffc107', exposed: true },
  { key: 'danger', cssVar: '--rb-danger', defaultValue: '#dc3545', exposed: true },
  { key: 'light', cssVar: '--rb-light', defaultValue: '#f8f9fa', exposed: true },
  { key: 'dark', cssVar: '--rb-dark', defaultValue: '#212529', exposed: true },
  { key: 'print-brand-accent', cssVar: '--rb-print-brand-accent', defaultValue: 'var(--rb-site-branding-area-background-color, #b1101a)', exposed: false },
  { key: 'print-section-bg', cssVar: '--rb-print-section-bg', defaultValue: 'var(--rb-header-branding-background-color, #f4f4f4)', exposed: false },
  { key: 'print-page-bg', cssVar: '--rb-print-page-bg', defaultValue: 'var(--rb-body-background-color, #ffffff)', exposed: false },
  { key: 'print-body-color', cssVar: '--rb-print-body-color', defaultValue: 'var(--rb-body-text-color, #333333)', exposed: false },
  { key: 'print-heading-color', cssVar: '--rb-print-heading-color', defaultValue: 'var(--rb-main-content-heading-text-branding-color, #000000)', exposed: false },
  { key: 'print-cell-border', cssVar: '--rb-print-cell-border', defaultValue: 'var(--rb-panel-branding-border-color, #dddddd)', exposed: false },
  { key: 'print-font-family', cssVar: '--rb-print-font-family', defaultValue: '"Titillium Web", "Helvetica Neue", Arial, sans-serif', exposed: false },
  { key: 'mu-panel-bg', cssVar: '--mu-panel-bg', defaultValue: 'var(--rb-panel-branding-background-color, #b1101a)', exposed: false },
  { key: 'mu-panel-color', cssVar: '--mu-panel-color', defaultValue: 'var(--rb-panel-branding-color, #ffffff)', exposed: false },
  { key: 'mu-panel-border', cssVar: '--mu-panel-border', defaultValue: 'var(--rb-panel-branding-border-color, #dddddd)', exposed: false },
  { key: 'mu-anchor-color', cssVar: '--mu-anchor-color', defaultValue: 'var(--rb-anchor-color, #337ab7)', exposed: false },
  { key: 'mu-anchor-color-hover', cssVar: '--mu-anchor-color-hover', defaultValue: 'var(--rb-anchor-color-hover, #23527c)', exposed: false },
  { key: 'mu-body-text', cssVar: '--mu-body-text', defaultValue: 'var(--rb-body-text-color, #333333)', exposed: false },
  { key: 'mu-body-bg', cssVar: '--mu-body-bg', defaultValue: 'var(--rb-body-background-color, #ffffff)', exposed: false },
  { key: 'mu-submit-btn-bg', cssVar: '--mu-submit-btn-bg', defaultValue: 'var(--rb-submit-button-background-color, #428bca)', exposed: false },
  { key: 'mu-submit-btn-color', cssVar: '--mu-submit-btn-color', defaultValue: 'var(--rb-submit-button-text-color, #ffffff)', exposed: false },
];

export const brandingThemeAllowedVariableKeys = brandingThemeTokens
  .filter(token => token.exposed !== false)
  .map(token => token.key);

export const brandingThemeAllowedVariableNames = brandingThemeTokens
  .filter(token => token.exposed !== false)
  .flatMap(token => [token.key, ...(token.aliases || [])]);

export const brandingThemeEditableTokens = brandingThemeTokens.filter(token => token.exposed !== false);

export const brandingThemeEditableTokenMap = new Map(brandingThemeEditableTokens.map(token => [token.key, token]));
export const brandingThemeEditableAliasMap = new Map(
  brandingThemeEditableTokens.flatMap(token => (token.aliases || []).map(alias => [alias, token] as const))
);

export const brandingThemeTokenMap = new Map(brandingThemeTokens.map(token => [token.key, token]));
export const brandingThemeAliasMap = new Map(
  brandingThemeTokens.flatMap(token => (token.aliases || []).map(alias => [alias, token] as const))
);
