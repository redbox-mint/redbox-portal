/** Pure configuration helpers; reuse the existing implementation without the legacy barrel. */
export { createDefaultBinding, type DoiPublishingConfigData } from '../configmodels/DoiPublishing';
export { Services as BrandingThemeServices } from '../branding/BrandingThemeCss';
export { buildDoiPayload } from '../services/doi-v2/payload';
