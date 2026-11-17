import { defineApiRoute } from '../define';
import { z } from '../zod-openapi';
import { responseField } from '../schemas/common';
import { profileCreateSchema, profileSaveSchema, profileCopySchema } from '../../services/GenerationProfileAdminService';
import type { HttpMethod } from '../types';
const id = z.string().min(1).max(200);
function route(method: HttpMethod, path: string, action: string, summary: string, body?: z.ZodType, param?: string) {
  return defineApiRoute({ method, path: '/:branding/:portal/app/ai-profiles' + path, controller: 'GenerationProfileAdminController', action,
    csrf: true, security: [{ sessionAuth: [] }], extensions: { 'x-redbox-roles': ['Admin'] }, tags: ['AI drafting profiles'], summary,
    description: 'Session-authenticated Admin for the route brand. Draft validation problems are returned as translated warnings; publication blocks invalid references and changed forms.',
    request: { ...(param ? { params: z.object({ [param]: id }) } : {}), ...(body ? { body: { required: true, content: { 'application/json': { schema: body } } } } : {}) },
    responses: { 200: responseField(z.record(z.string(), z.unknown()).or(z.array(z.record(z.string(), z.unknown()))), 'Profile operation result'),
      400: responseField(z.object({ error: z.object({ code: z.string(), messageKey: z.string(), retryable: z.boolean() }) }), 'Invalid settings'),
      403: responseField(z.unknown(), 'Brand Admin session and CSRF required'), 409: responseField(z.unknown(), 'Concurrent changes or immutable version'),
      422: responseField(z.unknown(), 'Fix profile problems before publishing'), 429: responseField(z.unknown(), 'Shared test cooldown') } });
}
export const generationProfileAdminRoutes = [
  route('get', '/overview', 'overview', 'List profiles and available form fields'),
  route('post', '/profiles', 'create', 'Create profile draft v1', profileCreateSchema),
  route('post', '/profiles/:key/duplicate', 'duplicate', 'Duplicate newest profile version', profileCopySchema, 'key'),
  route('delete', '/profiles/:key', 'remove', 'Delete unused unpublished profile', undefined, 'key'),
  route('put', '/versions/:versionId', 'save', 'Save draft and return validation warnings', profileSaveSchema, 'versionId'),
  route('post', '/versions/:versionId/publish', 'publish', 'Publish a valid draft', z.object({ expectedContentHash: id }).strict(), 'versionId'),
  route('post', '/versions/:versionId/versions', 'newVersion', 'Create next draft version', undefined, 'versionId'),
  route('post', '/versions/:versionId/retire', 'retire', 'Retire published version', undefined, 'versionId'),
  route('delete', '/versions/:versionId', 'discard', 'Discard draft', undefined, 'versionId'),
  route('post', '/versions/:versionId/tests', 'runTests', 'Run synthetic test cases without creating generation runs', undefined, 'versionId'),
];
