import { defineApiRoute } from '../define';
import { z } from '../zod-openapi';
import { apiErrorResponseSchema, responseField } from '../schemas/common';

const segment = z.string().min(1).max(64).regex(/^[a-zA-Z0-9][a-zA-Z0-9_-]*$/);
export const translationTarget = z.object({ locale: segment, namespace: segment });
export const translationDisplayNameBody = z.object({
  displayName: z.string().trim().min(1).max(100).regex(/^[^<>\u0000-\u001f\u007f]+$/),
}).strict();

export const renameTranslationRoute = defineApiRoute({
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
});

export const translationKey = z.string().min(1).max(512).regex(/^[^\u0000-\u001f\u007f<>]+$/)
  .refine(key => key.trim() === key && !!key.trim(), 'Invalid key whitespace')
  .refine(key => !key.split('.').some(part => ['__proto__', 'constructor', 'prototype', '_meta'].includes(part)), 'Invalid key');
export const revertTranslationBody = z.object({ key: translationKey }).strict();
const editorRow = z.object({
  key: z.string(), value: z.string(), provenance: z.enum(['default', 'override', 'missing']), hasDefault: z.boolean(),
  category: z.string().optional(), description: z.string().optional(), contentFormat: z.enum(['plain', 'html']).optional(),
});
function adminRoute(method: 'get' | 'post', tail: string, action: string, summary: string, response: z.ZodType, body?: z.ZodType) {
  return defineApiRoute({
    method, path: '/:branding/:portal/admin/translation/' + tail, controller: 'TranslationController', action, csrf: true,
    request: {
      ...(tail.includes(':locale') ? { params: translationTarget } : {}),
      headers: z.object({ 'x-csrf-token': z.string().optional() }),
      ...(body ? { body: { required: true, content: { 'application/json': { schema: body } } } } : {}),
    },
    extensions: { 'x-redbox-roles': ['Admin'] }, tags: ['Translation'], summary,
    description: 'Route brand Admin only. Session CSRF protected. Defaults combine English key coverage with locale-specific language-defaults values. Missing means a default key has no non-whitespace value. Override means a stored value differs from the default, or is a custom key. No historical new-default classification is inferred.',
    responses: {
      200: responseField(response, 'Translation admin response'),
      400: responseField(apiErrorResponseSchema, 'Invalid request'),
      403: responseField(apiErrorResponseSchema, 'Brand Admin permission and CSRF required'),
      404: responseField(apiErrorResponseSchema, 'Bundle or default key not found'),
    },
  });
}
export const adminTranslationApiRoutes = [
  renameTranslationRoute,
  adminRoute('get', 'languages', 'languageSummaries', 'Language metadata and translated/total key counts',
    z.array(z.object({ code: z.string(), displayName: z.string(), enabled: z.boolean(), translated: z.number(), total: z.number() }))),
  adminRoute('get', ':locale/:namespace/editor', 'editorEntries', 'Translation entries with per-key provenance', z.array(editorRow)),
  adminRoute('post', ':locale/:namespace/revert', 'revertEntry', 'Revert one translation to installation defaults', z.object({}).passthrough(), revertTranslationBody),
];
