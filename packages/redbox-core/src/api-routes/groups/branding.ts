import { apiRoute } from '../route-factory';
import {
  arrayField,
  brandingAdminStateSchema,
  brandingDraftBody,
  brandingExpectedRevisionBody,
  brandingFaceUploadBody,
  brandingHistoryRecordSchema,
  brandingLogoResponseSchema,
  brandingPreviewResponseSchema,
  brandingPublishBody,
  brandingPublishStateResponseSchema,
  brandingRestoreBody,
  brandingRollbackResponseSchema,
  brandingSlotParams,
  brandingVersionEntrySchema,
  brandingVersionIdParams,
  faviconUploadBody,
  logoUploadBody,
  responseField,
} from '../schemas/common';

export const brandingConfigRoute = apiRoute(
  'get',
  '/:branding/:portal/api/branding/config',
  'webservice/BrandingController',
  'config',
  {},
  {
    tags: ['Branding'],
    summary: 'Get branding Admin state',
    responses: { 200: responseField(brandingAdminStateSchema, 'Active, draft, versions, limits, counters, warnings') },
  }
);

export const brandingDraftRoute = apiRoute(
  'post',
  '/:branding/:portal/api/branding/draft',
  'webservice/BrandingController',
  'draft',
  {
    body: { required: true, content: { 'application/json': { schema: brandingDraftBody } } },
  },
  {
    tags: ['Branding'],
    summary: 'Save colour draft with expected revision',
    responses: { 200: responseField(brandingAdminStateSchema, 'Complete canonical Admin state') },
  }
);

export const brandingFaceUploadRoute = apiRoute(
  'put',
  '/:branding/:portal/api/branding/draft/typeface/faces/:slot',
  'webservice/BrandingController',
  'uploadFace',
  {
    params: brandingSlotParams,
    body: { content: { 'multipart/form-data': { schema: brandingFaceUploadBody } } },
    files: {
      face: {
        required: true,
        multiple: false,
        // Default maximum; operator-configurable at runtime (see branding config).
        // The service re-enforces the runtime value as the second boundary.
        maxBytes: 2 * 1024 * 1024,
        description: 'Typeface face upload (WOFF2 validated structurally; client MIME is not trusted)',
      },
    },
  },
  {
    tags: ['Branding'],
    summary: 'Upload a typeface face to the draft',
    responses: { 200: responseField(brandingAdminStateSchema, 'Complete canonical Admin state') },
  }
);

export const brandingFaceDeleteRoute = apiRoute(
  'delete',
  '/:branding/:portal/api/branding/draft/typeface/faces/:slot',
  'webservice/BrandingController',
  'deleteFace',
  {
    params: brandingSlotParams,
    body: { content: { 'application/json': { schema: brandingExpectedRevisionBody } } },
  },
  {
    tags: ['Branding'],
    summary: 'Remove one draft typeface face',
    responses: { 200: responseField(brandingAdminStateSchema, 'Complete canonical Admin state') },
  }
);

export const brandingUseDefaultRoute = apiRoute(
  'post',
  '/:branding/:portal/api/branding/draft/typeface/use-default',
  'webservice/BrandingController',
  'useDefault',
  {
    body: { required: true, content: { 'application/json': { schema: brandingExpectedRevisionBody } } },
  },
  {
    tags: ['Branding'],
    summary: 'Set the draft typeface to Default Typography',
    responses: { 200: responseField(brandingAdminStateSchema, 'Complete canonical Admin state') },
  }
);

export const brandingRevertRoute = apiRoute(
  'post',
  '/:branding/:portal/api/branding/draft/typeface/revert',
  'webservice/BrandingController',
  'revert',
  {
    body: { required: true, content: { 'application/json': { schema: brandingExpectedRevisionBody } } },
  },
  {
    tags: ['Branding'],
    summary: 'Copy the active typeface into the draft only',
    responses: { 200: responseField(brandingAdminStateSchema, 'Complete canonical Admin state') },
  }
);

export const brandingPreviewRoute = apiRoute(
  'post',
  '/:branding/:portal/api/branding/preview',
  'webservice/BrandingController',
  'preview',
  { body: { content: { 'application/json': { schema: brandingExpectedRevisionBody } } } },
  {
    tags: ['Branding'],
    summary: 'Create a single-use CSS preview for the exact draft revision',
    responses: { 200: responseField(brandingPreviewResponseSchema, 'Branding preview generated') },
  }
);

export const brandingVersionsRoute = apiRoute(
  'get',
  '/:branding/:portal/api/branding/versions',
  'webservice/BrandingController',
  'versions',
  {},
  {
    tags: ['Branding'],
    summary: 'List newest retained branding versions',
    responses: { 200: responseField(arrayField(brandingVersionEntrySchema), 'Retained versions newest first') },
  }
);

export const brandingVersionPreviewRoute = apiRoute(
  'post',
  '/:branding/:portal/api/branding/versions/:versionId/preview',
  'webservice/BrandingController',
  'versionPreview',
  {
    params: brandingVersionIdParams,
  },
  {
    tags: ['Branding'],
    summary: 'Preview a retained version without mutating the draft',
    responses: { 200: responseField(brandingPreviewResponseSchema, 'Historical preview generated') },
  }
);

export const brandingPublishRoute = apiRoute(
  'post',
  '/:branding/:portal/api/branding/publish',
  'webservice/BrandingController',
  'publish',
  {
    body: { required: true, content: { 'application/json': { schema: brandingPublishBody } } },
  },
  {
    tags: ['Branding'],
    summary: 'Publish the draft using both expected counters',
    responses: { 200: responseField(brandingPublishStateResponseSchema, 'Complete Admin state after publish') },
  }
);

export const brandingRestoreRoute = apiRoute(
  'post',
  '/:branding/:portal/api/branding/restore/:versionId',
  'webservice/BrandingController',
  'restore',
  {
    params: brandingVersionIdParams,
    body: { required: true, content: { 'application/json': { schema: brandingRestoreBody } } },
  },
  {
    tags: ['Branding'],
    summary: 'Immediately restore a retained version as a new version',
    responses: { 200: responseField(brandingPublishStateResponseSchema, 'Complete Admin state after restore') },
  }
);

export const brandingRollbackRoute = apiRoute(
  'post',
  '/:branding/:portal/api/branding/rollback/:versionId',
  'webservice/BrandingController',
  'rollback',
  {
    params: brandingVersionIdParams,
    body: { content: { 'application/json': { schema: brandingRestoreBody } } },
  },
  {
    tags: ['Branding'],
    summary: 'Deprecated rollback alias with restore semantics',
    description:
      'Deprecated: calls the same implementation as restore, returns a Deprecation header, and will be removed in the next major release. Use restore instead.',
    responses: { 200: responseField(brandingRollbackResponseSchema, 'Branding restore complete (deprecated alias)') },
  }
);

export const brandingLogoRoute = apiRoute(
  'post',
  '/:branding/:portal/api/branding/logo',
  'webservice/BrandingController',
  'logo',
  {
    body: { content: { 'multipart/form-data': { schema: logoUploadBody } } },
    files: {
      logo: {
        required: true,
        multiple: false,
        maxBytes: 512 * 1024,
        mimeTypes: ['image/png', 'image/jpeg', 'image/svg+xml'],
        description: 'Branding logo upload',
      },
    },
  },
  {
    tags: ['Branding'],
    summary: 'Upload branding logo',
    responses: { 200: responseField(brandingLogoResponseSchema, 'Branding logo uploaded') },
  }
);

export const brandingFaviconRoute = apiRoute(
  'post',
  '/:branding/:portal/api/branding/favicon',
  'webservice/BrandingController',
  'favicon',
  {
    body: { content: { 'multipart/form-data': { schema: faviconUploadBody } } },
    files: {
      favicon: {
        required: true,
        multiple: false,
        maxBytes: 256 * 1024,
        mimeTypes: ['image/png', 'image/svg+xml', 'image/x-icon', 'image/vnd.microsoft.icon'],
        description: 'Branding favicon upload',
      },
    },
  },
  {
    tags: ['Branding'],
    summary: 'Upload branding favicon',
    responses: { 200: responseField(brandingLogoResponseSchema, 'Branding favicon uploaded') },
  }
);

export const brandingHistoryRoute = apiRoute(
  'get',
  '/:branding/:portal/api/branding/history',
  'webservice/BrandingController',
  'history',
  {},
  {
    tags: ['Branding'],
    summary: 'Get branding history',
    responses: { 200: responseField(arrayField(brandingHistoryRecordSchema), 'Branding history') },
  }
);

export const brandingApiRoutes = [
  brandingConfigRoute,
  brandingDraftRoute,
  brandingFaceUploadRoute,
  brandingFaceDeleteRoute,
  brandingUseDefaultRoute,
  brandingRevertRoute,
  brandingPreviewRoute,
  brandingVersionsRoute,
  brandingVersionPreviewRoute,
  brandingPublishRoute,
  brandingRestoreRoute,
  brandingRollbackRoute,
  brandingLogoRoute,
  brandingFaviconRoute,
  brandingHistoryRoute,
];
