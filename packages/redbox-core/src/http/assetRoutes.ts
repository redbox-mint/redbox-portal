export const brandingDeliveryRoutes = (
  [
    ['/styles/theme.css', 'renderCss'],
    ['/preview/:token.css', 'renderPreviewCss'],
    ['/images/logo', 'renderImage'],
    ['/images/favicon', 'renderFavicon'],
    ['/api-docs.apib', 'renderApiB'],
    ['/api-docs.json', 'renderSwaggerJSON'],
    ['/api-docs.yaml', 'renderSwaggerYAML'],
    ['/admin/api-docs/openapi.json', 'renderSwaggerJSON'],
  ] as const
).map(([path, action]) => ({
  method: action === 'renderImage' || action === 'renderFavicon' ? ('all' as const) : ('get' as const),
  path: '/:branding/:portal' + path,
  controller: 'BrandingController',
  action,
}));
export const fontDeliveryRoute = {
  method: 'get' as const,
  path: '/fonts/branding/:branding/:sha256.woff2',
  controller: 'BrandingController',
  action: 'renderFont',
};
export const dynamicAssetRoutes = [
  ['/dynamic/:asset', 'get'],
  ['/:branding/:portal/dynamic/:asset', 'get'],
  ['/:branding/:portal/dynamicAsset/formCompiledItems/:recordType{/:oid}', 'getFormCompiledItems'],
  ['/:branding/:portal/dynamicAsset/adminReportTemplates/:reportName', 'getAdminReportTemplates'],
  [
    '/:branding/:portal/dynamicAsset/recordDashboardTemplates/:recordType/:workflowStage',
    'getRecordDashboardTemplates',
  ],
  ['/:branding/:portal/dynamicAsset/dashboardViewTemplates/:dashboardView/:stepName', 'getDashboardViewTemplates'],
].map(([path, action]) => ({ method: 'get' as const, path, action, controller: 'DynamicAssetController' }));
