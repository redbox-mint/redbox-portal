import { brandingFaceUploadRoute, brandingLogoRoute, brandingFaviconRoute } from '../api-routes/groups/branding';
import { addDataStreamsRoute } from '../api-routes/groups/records';
export const resumableUploadRoutes = ['', '/:attachId'].flatMap(suffix =>
  [false, true].map(companion => ({
    method: 'all' as const,
    responses: {},
    path: `/:branding/:portal/${companion ? 'companion/' : ''}record/:oid/attach${suffix}`,
    controller: 'RecordController',
    action: 'doAttachment',
  }))
);

const api = [brandingFaceUploadRoute, brandingLogoRoute, brandingFaviconRoute];
export const brandingUploadRoutes = [
  ...api,
  ...api.map(route => ({
    ...route,
    path: route.path.replace('/api/branding/', '/app/branding/'),
    controller: 'BrandingAppController',
  })),
];
export const uploadDeclarations = [addDataStreamsRoute, ...brandingUploadRoutes, ...resumableUploadRoutes];
