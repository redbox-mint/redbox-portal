import { apiRoute } from '../route-factory';
import {
  arrayField,
  brandingDraftResponseSchema,
  brandingHistoryRecordSchema,
  brandingLogoResponseSchema,
  brandingPreviewResponseSchema,
  brandingPublishResponseSchema,
  brandingRollbackResponseSchema,
  brandingDraftBody,
  brandingPublishBody,
  logoUploadBody,
  objectField,
  responseField,
  stringField,
} from '../schemas/common';

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
    summary: 'Save draft branding',
    responses: { 200: responseField(brandingDraftResponseSchema, 'Branding draft saved') },
  }
);

export const brandingPreviewRoute = apiRoute(
  'post',
  '/:branding/:portal/api/branding/preview',
  'webservice/BrandingController',
  'preview',
  { body: { content: { 'application/json': { schema: brandingDraftBody } } } },
  {
    tags: ['Branding'],
    summary: 'Create branding preview',
    responses: { 200: responseField(brandingPreviewResponseSchema, 'Branding preview generated') },
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
    summary: 'Publish branding',
    responses: { 200: responseField(brandingPublishResponseSchema, 'Branding published') },
  }
);

export const brandingRollbackRoute = apiRoute(
  'post',
  '/:branding/:portal/api/branding/rollback/:versionId',
  'webservice/BrandingController',
  'rollback',
  {
    params: objectField({ versionId: stringField() }, ['versionId']),
  },
  {
    tags: ['Branding'],
    summary: 'Rollback branding',
    responses: { 200: responseField(brandingRollbackResponseSchema, 'Branding rollback complete') },
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
  brandingDraftRoute,
  brandingPreviewRoute,
  brandingPublishRoute,
  brandingRollbackRoute,
  brandingLogoRoute,
  brandingHistoryRoute,
];
