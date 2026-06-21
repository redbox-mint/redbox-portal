import { z } from '../zod-openapi';
import { apiRoute } from '../route-factory';
import {
  apiErrorResponseSchema,
  arrayField,
  idParams,
  integerField,
  listApiResponseSchema,
  nonNegativeIntegerField,
  objectField,
  patternStringField,
  responseField,
  stringField,
  vocabularyTypeField,
  vocabularySchema,
  vocabularyTreeNodeSchema,
} from '../schemas/common';

const vocabularyEntryInputSchema = objectField(
  {
    id: patternStringField('^[A-Za-z0-9_.-]+$', 'Vocabulary entry id'),
    label: stringField('Entry label'),
    value: stringField('Entry value'),
    identifier: stringField('Entry identifier'),
    parent: patternStringField('^[A-Za-z0-9_.-]+$', 'Parent entry id'),
    order: nonNegativeIntegerField('Entry order'),
  },
  ['label', 'value'],
  'Vocabulary entry payload',
  true
);

export const listVocabularyRoute = apiRoute(
  'get',
  '/:branding/:portal/api/vocabulary',
  'webservice/VocabularyController',
  'list',
  {
    query: objectField({
      q: patternStringField('^[A-Za-z0-9_.*-]+$'),
      type: patternStringField('^[A-Za-z0-9_-]+$'),
      source: patternStringField('^[A-Za-z0-9_.-]+$'),
      offset: nonNegativeIntegerField('Result offset'),
      limit: nonNegativeIntegerField('Result limit'),
      sort: patternStringField('^[A-Za-z0-9_. -]+$'),
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
        'application/json': {
          schema: objectField(
            {
              rvaId: patternStringField('^[1-9][0-9]*$'),
              versionId: patternStringField('^[1-9][0-9]*$'),
            },
            ['rvaId']
          ),
        },
      },
    },
  },
  {
    tags: ['Vocabulary'],
    summary: 'Import vocabulary',
    responses: {
      200: responseField(vocabularySchema, 'Vocabulary imported'),
      400: responseField(apiErrorResponseSchema, 'RVA import request rejected'),
      409: responseField(apiErrorResponseSchema, 'Vocabulary cannot be imported in its current state'),
    },
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
      content: {
        'application/json': {
          schema: objectField(
            {
              name: patternStringField('^[A-Za-z0-9_ -]+$'),
              slug: patternStringField('^[A-Za-z0-9][A-Za-z0-9_-]*$'),
              type: vocabularyTypeField('Vocabulary type'),
              source: patternStringField('^(local|rva)$', 'Vocabulary source'),
              description: stringField('Vocabulary description'),
              entries: arrayField(vocabularyEntryInputSchema, 'Vocabulary entries'),
            },
            ['name'],
            'Vocabulary payload'
          ),
        },
      },
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
      content: {
        'application/json': {
          schema: objectField(
            {
              name: patternStringField('^[A-Za-z0-9_ -]+$'),
              slug: patternStringField('^[A-Za-z0-9_-]+$'),
              type: vocabularyTypeField('Vocabulary type'),
            },
            [],
            'Vocabulary payload',
            true
          ),
        },
      },
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
    body: {
      required: true,
      content: {
        'application/json': {
          schema: objectField(
            {
              entries: (arrayField(
                objectField(
                  { id: patternStringField('^[A-Za-z0-9_.-]+$', 'Vocabulary entry id'), order: nonNegativeIntegerField('Entry order') },
                  ['id', 'order'],
                  'Vocabulary entry order item'
                )
              ) as z.ZodArray<any>).min(1),
            },
            ['entries'],
            'Reorder payload'
          ),
        },
      },
    },
  },
  {
    tags: ['Vocabulary'],
    summary: 'Reorder vocabulary entries',
    responses: {
      200: responseField(objectField({ updated: integerField() }, ['updated']), 'Vocabulary entries reordered'),
      409: responseField(apiErrorResponseSchema, 'Duplicate entry ids in reorder payload'),
    },
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
    body: { required: true, content: { 'application/json': { schema: objectField({ versionId: patternStringField('^[1-9][0-9]*$') }, ['versionId']) } } },
  },
  {
    tags: ['Vocabulary'],
    summary: 'Sync vocabulary',
    responses: {
      409: responseField(apiErrorResponseSchema, 'Vocabulary cannot be synced in its current state'),
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
