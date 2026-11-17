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
export const translationImportMaxBytes = 2 * 1024 * 1024;
export const translationImportBody = z.object({
  json: z.string().min(2).max(translationImportMaxBytes),
  keepUnknown: z.boolean().default(false),
}).strict();
export const translationImportApplyBody = translationImportBody.extend({ previewToken: z.string().regex(/^[a-f0-9]{64}$/) });
// Validate raw own keys before any object-schema parsing: record parsers may
// discard __proto__, but imports must reject it rather than silently accept it.
export const translationImportValues = z.custom<Record<string, string>>(value =>
  value !== null && typeof value === 'object' && !Array.isArray(value) &&
  Object.keys(value).length <= 10000 && Object.entries(value).every(([key, entry]) =>
    translationKey.safeParse(key).success && typeof entry === 'string'));
const importCounts = z.object({ added: z.number(), changed: z.number(), unchanged: z.number(), unknown: z.number(), ignored: z.number() });
const importSample = z.object({ key: z.string(), before: z.string().nullable(), after: z.string(), action: z.enum(['added', 'changed', 'unchanged', 'ignored']) });
const importPreview = z.object({ counts: importCounts, sample: z.array(importSample), previewToken: z.string() });
const importResult = z.object({ counts: importCounts, applied: z.number(), failed: z.number(),
  results: z.array(z.object({ key: z.string(), status: z.enum(['applied', 'unchanged', 'ignored', 'failed']), message: z.string().optional() })) });
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
      409: responseField(apiErrorResponseSchema, 'Preview is stale; preview again'),
      413: responseField(apiErrorResponseSchema, 'Import exceeds 2 MiB'),
    },
  });
}
export const adminTranslationApiRoutes = [
  renameTranslationRoute,
  adminRoute('get', 'languages', 'languageSummaries', 'Language metadata and translated/total key counts',
    z.array(z.object({ code: z.string(), displayName: z.string(), enabled: z.boolean(), translated: z.number(), total: z.number() }))),
  adminRoute('get', ':locale/:namespace/editor', 'editorEntries', 'Translation entries with per-key provenance', z.array(editorRow)),
  adminRoute('post', ':locale/:namespace/revert', 'revertEntry', 'Revert one translation to installation defaults', z.object({}).passthrough(), revertTranslationBody),
  adminRoute('post', ':locale/:namespace/import/preview', 'previewImport', 'Preview a flat JSON translation import without writing', importPreview, translationImportBody),
  adminRoute('post', ':locale/:namespace/import/apply', 'applyImport', 'Apply a previewed import with per-key outcomes', importResult, translationImportApplyBody),
  defineApiRoute({
    method: 'get', path: '/:branding/:portal/admin/translation/:locale/:namespace/export',
    controller: 'TranslationController', action: 'exportBundle', csrf: true,
    request: { params: translationTarget, query: z.object({ overridesOnly: z.enum(['true', 'false']).optional() }).strict() },
    extensions: { 'x-redbox-roles': ['Admin'] }, tags: ['Translation'],
    summary: 'Download flat translation JSON (brand Admin only)',
    description: 'Exports stored string values, including empty values, with metadata excluded and dotted parent/child keys retained. Optional overridesOnly=true restricts the download to keys with override provenance. Import accepts at most 2 MiB UTF-8 JSON, 10,000 flat string-valued keys; rejects markup/control characters and prototype/metadata key segments. Existing custom keys are known; keys absent from both defaults and storage are ignored unless keepUnknown is true. Preview includes sanitized values, counts and at most 20 diff rows. Applying requires its content token and rejects changed bundle/default/sanitization state with 409. Omitted keys are preserved. Apply reports every key result; entry/bundle sync failures are marked failed and may need retry after a fresh preview.',
    responses: {
      200: { ...responseField(z.record(z.string(), z.string()), 'Flat key/value JSON'), headers: { 'Content-Disposition': z.string() } },
      403: responseField(apiErrorResponseSchema, 'Brand Admin permission required'),
      404: responseField(apiErrorResponseSchema, 'Bundle not found'),
    },
  }),
];
