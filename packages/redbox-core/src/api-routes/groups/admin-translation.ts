import { defineApiRoute } from '../define';
import { z } from '../zod-openapi';
import { apiErrorResponseSchema, responseField } from '../schemas/common';

const segment = z.string().min(1).max(64).regex(/^[a-zA-Z0-9][a-zA-Z0-9_-]*$/);
export const translationTarget = z.object({ locale: segment, namespace: segment });
export const translationDisplayNameBody = z.object({
  displayName: z.string().trim().min(1).max(100).regex(/^[^<>\u0000-\u001f\u007f]+$/),
}).strict();

export const adminTranslationApiRoutes = [defineApiRoute({
  method: 'post',
  path: '/:branding/:portal/admin/translation/:locale/:namespace/display-name',
  controller: 'TranslationController',
  action: 'updateDisplayName',
  csrf: true,
  request: {
    params: translationTarget,
    headers: z.object({ 'x-csrf-token': z.string().optional() }),
    body: { required: true, content: { 'application/json': { schema: translationDisplayNameBody } } },
  },
  extensions: { 'x-redbox-roles': ['Admin'] },
  tags: ['Translation'],
  summary: 'Rename a language (brand Admin only)',
  description: 'CSRF protected metadata-only update of the route brand bundle. Trims a display name of 1–100 characters; rejects markup and control characters. Does not read or resynchronize translation entries. Returns 404 if the bundle is absent.',
  responses: {
    200: responseField(z.object({ locale: z.string(), namespace: z.string(), displayName: z.string() }), 'Language metadata'),
    400: responseField(apiErrorResponseSchema, 'Invalid metadata'),
    403: responseField(apiErrorResponseSchema, 'Brand Admin permission and CSRF required'),
    404: responseField(apiErrorResponseSchema, 'Bundle not found'),
  },
})];
