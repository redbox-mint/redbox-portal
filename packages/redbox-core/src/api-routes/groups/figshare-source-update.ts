import { figshareSourceSchema } from './figshare-vocabulary';
import { z } from '../zod-openapi';
import { defineApiRoute } from '../define';
import { apiErrorResponseSchema, responseField } from '../schemas/common';
export const figshareSourceUpdateInput = z.object({
  expectedRevision: z.number().int().min(0),
  displayName: z.string().trim().min(1).max(200).refine(value => !/[<>\u0000-\u001f\u007f]/.test(value)),
  scope: z.enum(['public', 'account']),
  archived: z.boolean(),
  syncSchedule: z.enum(['manual', 'daily', 'weekly']),
}).strict();
export const updateFigshareSourceRoute = defineApiRoute({
  method: 'put', path: '/:branding/:portal/api/figshare-vocabularies/sources/:sourceId',
  controller: 'webservice/FigshareVocabularyController', action: 'updateSource', csrf: true,
  extensions: { 'x-redbox-roles': ['Admin'] }, tags: ['Figshare Vocabulary'], summary: 'Edit source metadata and automatic mirror sync schedule',
  description: 'Brand Admin session and CSRF required. expectedRevision is settingsRevision (legacy sources use 0). scope identifies the remote catalogue and is immutable after source creation: supply the existing value. Use discovery to add a different scope. Editable metadata: displayName and archived. Manual clears nextSyncAt; daily/weekly run after 24 hours/7 days and thereafter, within the five-minute Agenda dispatch interval. Archived sources are not scheduled. Automatic sync updates the remote mirror only and never approves crosswalk mappings. A persistent unique source claim serializes edits, scheduled sync and manual apply. A crashed worker retains its claim for operator recovery, so another sync cannot overlap a still-running worker.',
  request: { params: z.object({ sourceId: z.string().min(1).max(100) }), body: { required: true, content: { 'application/json': { schema: figshareSourceUpdateInput } } } },
  responses: { 200: responseField(figshareSourceSchema, 'Updated source, schedule, nextSyncAt, settingsRevision and lastScheduleStatus'),
    400: responseField(apiErrorResponseSchema, 'Invalid metadata or schedule'), 403: responseField(apiErrorResponseSchema, 'Brand Admin session or CSRF missing'),
    404: responseField(apiErrorResponseSchema, 'Source not found in this brand'), 409: responseField(apiErrorResponseSchema, 'Concurrent edit or source busy'),
    422: responseField(apiErrorResponseSchema, 'Scope is part of the source identity; discover a new source instead') },
});
