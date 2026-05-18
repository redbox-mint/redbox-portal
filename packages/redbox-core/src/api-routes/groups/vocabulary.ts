import { apiRoute } from '../route-factory';
import {
  arrayField,
  idParams,
  integerField,
  listApiResponseSchema,
  objectField,
  responseField,
  stringField,
  vocabularySchema,
  vocabularyTreeNodeSchema,
} from '../schemas/common';

export const listVocabularyRoute = apiRoute(
  'get',
  '/:branding/:portal/api/vocabulary',
  'webservice/VocabularyController',
  'list',
  {
    query: objectField({
      q: stringField(),
      type: stringField(),
      source: stringField(),
      offset: stringField(),
      sort: stringField(),
    }),
  },
  {
    tags: ['Vocabulary'],
    summary: 'List vocabulary',
    responses: { 200: responseField(listApiResponseSchema(vocabularySchema), 'List vocabulary entries') },
  }
);

export const importVocabularyRoute = apiRoute(
  'post',
  '/:branding/:portal/api/vocabulary/import',
  'webservice/VocabularyController',
  'import',
  {
    body: {
      required: true,
      content: {
        'application/json': { schema: objectField({ rvaId: stringField(), versionId: stringField() }, ['rvaId']) },
      },
    },
  },
  {
    tags: ['Vocabulary'],
    summary: 'Import vocabulary',
    responses: { 200: responseField(vocabularySchema, 'Vocabulary imported') },
  }
);

export const getVocabularyRoute = apiRoute(
  'get',
  '/:branding/:portal/api/vocabulary/:id',
  'webservice/VocabularyController',
  'get',
  { params: idParams },
  {
    tags: ['Vocabulary'],
    summary: 'Get vocabulary',
    responses: {
      200: responseField(
        objectField({ vocabulary: vocabularySchema, entries: arrayField(vocabularyTreeNodeSchema) }, ['vocabulary', 'entries']),
        'Vocabulary details'
      ),
    },
  }
);

export const createVocabularyRoute = apiRoute(
  'post',
  '/:branding/:portal/api/vocabulary',
  'webservice/VocabularyController',
  'create',
  {
    body: {
      required: true,
      content: { 'application/json': { schema: objectField({}, [], 'Vocabulary payload', true) } },
    },
  },
  {
    tags: ['Vocabulary'],
    summary: 'Create vocabulary',
    responses: { 201: responseField(vocabularySchema, 'Vocabulary created') },
  }
);

export const updateVocabularyRoute = apiRoute(
  'put',
  '/:branding/:portal/api/vocabulary/:id',
  'webservice/VocabularyController',
  'update',
  {
    params: idParams,
    body: {
      required: true,
      content: { 'application/json': { schema: objectField({}, [], 'Vocabulary payload', true) } },
    },
  },
  {
    tags: ['Vocabulary'],
    summary: 'Update vocabulary',
    responses: { 200: responseField(vocabularySchema, 'Vocabulary updated') },
  }
);

export const reorderVocabularyRoute = apiRoute(
  'put',
  '/:branding/:portal/api/vocabulary/:id/reorder',
  'webservice/VocabularyController',
  'reorder',
  {
    params: idParams,
    body: { required: true, content: { 'application/json': { schema: objectField({}, [], 'Reorder payload', true) } } },
  },
  {
    tags: ['Vocabulary'],
    summary: 'Reorder vocabulary entries',
    responses: { 200: responseField(objectField({ updated: integerField() }, ['updated']), 'Vocabulary entries reordered') },
  }
);

export const deleteVocabularyRoute = apiRoute(
  'delete',
  '/:branding/:portal/api/vocabulary/:id',
  'webservice/VocabularyController',
  'delete',
  { params: idParams },
  {
    tags: ['Vocabulary'],
    summary: 'Delete vocabulary',
    responses: { 204: { description: 'Vocabulary deleted' } },
  }
);

export const syncVocabularyRoute = apiRoute(
  'post',
  '/:branding/:portal/api/vocabulary/:id/sync',
  'webservice/VocabularyController',
  'sync',
  {
    params: idParams,
    body: { required: true, content: { 'application/json': { schema: objectField({ versionId: stringField() }) } } },
  },
  {
    tags: ['Vocabulary'],
    summary: 'Sync vocabulary',
    responses: {
      200: responseField(
        objectField(
          {
            created: integerField(),
            updated: integerField(),
            skipped: integerField(),
            lastSyncedAt: stringField(),
          },
          ['created', 'updated', 'skipped', 'lastSyncedAt']
        ),
        'Vocabulary synchronized'
      ),
    },
  }
);

export const vocabularyApiRoutes = [
  listVocabularyRoute,
  importVocabularyRoute,
  getVocabularyRoute,
  createVocabularyRoute,
  updateVocabularyRoute,
  reorderVocabularyRoute,
  deleteVocabularyRoute,
  syncVocabularyRoute,
];
