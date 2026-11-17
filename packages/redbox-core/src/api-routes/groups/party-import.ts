import { z } from '../zod-openapi';
import { defineApiRoute } from '../define';
import { responseField, apiErrorResponseSchema } from '../schemas/common';
const column = z.number().int().min(0).max(49).optional();
export const partyMapping = z.object({ fullName: column, givenName: column, surname: column, email: column, orcid: column }).strict()
  .refine(value => value.email !== undefined && (value.fullName !== undefined || value.givenName !== undefined || value.surname !== undefined));
const file = z.string().max(2 * 1024 * 1024);
export const partyImportInput = z.object({ csv: file, mapping: partyMapping }).strict();
const row = z.object({ row: z.number(), metadata: z.record(z.string(), z.string()), reasons: z.array(z.string()), status: z.string(), oid: z.string().optional() });
const responses = {
  400: responseField(apiErrorResponseSchema, 'Invalid CSV or mapping'),
  403: responseField(apiErrorResponseSchema, 'Brand Admin and session CSRF required'),
  409: responseField(apiErrorResponseSchema, 'Preview expired, consumed or changed; do not replay an unknown creation outcome'),
  413: responseField(apiErrorResponseSchema, 'File exceeds 2 MiB or 5,000 rows'),
};
export const partyImportApiRoutes = (['inspect', 'preview', 'apply'] as const).map(action => defineApiRoute({
  method: 'post', path: `/:branding/:portal/admin/parties/import/${action}`,
  controller: 'PartyImportController', action, csrf: true, extensions: { 'x-redbox-roles': ['Admin'] }, tags: ['Parties'],
  summary: `${action} party CSV import`,
  description: 'Session only, path-brand Admin. CSV UTF-8 text in a JSON envelope, at most 2 MiB / 5,000 data rows / 50 columns. Mapping uses zero-based column indexes. Formula/control/markup values and likely duplicate emails are skipped. Full form validation, authorization, hooks and indexing run through RecordsService.create on apply. A one-use preview expires after 15 minutes; changed file/mapping requires preview again. Concurrent independent imports may race on duplicate checks; party emails are not a global unique key.',
  request: { body: { required: true, content: { 'application/json': { schema: action === 'inspect' ? z.object({ csv: file }).strict() : action === 'apply' ? partyImportInput.extend({ token: z.string().uuid() }) : partyImportInput } } } },
  responses: { ...responses, 200: responseField(action === 'inspect' ? z.object({ headers: z.array(z.string()), sample: z.array(z.array(z.string())), total: z.number(), fields: z.array(z.string()) }) : action === 'preview' ? z.object({ headers: z.array(z.string()), rows: z.array(row), valid: z.number(), invalid: z.number(), token: z.string() }) : z.object({ rows: z.array(row) }), 'Party import result') },
}));
