import { z } from '../zod-openapi';
import { apiRoute } from '../route-factory';
import {
  anyField,
  arrayField,
  booleanField,
  idParams,
  integerField,
  objectField,
  responseField,
  stringField,
} from '../schemas/common';

export const publicationTargetTermSchema = objectField(
  {
    id: stringField(),
    namespace: stringField(),
    value: stringField(),
    sourceId: stringField(),
    label: stringField(),
    parentId: stringField(),
    selectable: booleanField(),
    historical: booleanField(),
    firstSeenAt: stringField(),
    lastSeenAt: stringField(),
  },
  ['id', 'namespace', 'value', 'sourceId', 'label', 'selectable']
);
const mappingSchema = objectField(
  {
    id: stringField(),
    localEntryId: stringField(),
    targetId: stringField(),
    status: z.enum(['proposed', 'approved', 'rejected']),
    matchType: stringField(),
  },
  ['id', 'localEntryId', 'targetId', 'status', 'matchType']
);
const sourceImportSchema = objectField(
  {
    id: stringField(),
    provider: stringField(),
    scope: stringField(),
    catalogueId: stringField(),
    namespace: stringField(),
    displayName: stringField(),
    expectedVersion: integerField(),
    importId: stringField(),
    terms: arrayField(publicationTargetTermSchema),
  },
  ['provider', 'scope', 'catalogueId', 'namespace', 'displayName', 'importId', 'terms']
);
const controller = 'webservice/PublicationVocabularyController';
const base = '/:branding/:portal/api/publication-vocabularies';
const responses = { 200: responseField(anyField(), 'Brand-scoped publication vocabulary result') };
const body = (schema: ReturnType<typeof objectField>) => ({
  required: true,
  content: { 'application/json': { schema } },
});
export const publicationVocabularyApiRoutes = [
  apiRoute(
    'get',
    `${base}/capabilities`,
    controller,
    'capabilities',
    {},
    {
      tags: ['Publication Vocabulary'],
      summary: 'Read available administration controls for the current brand',
      responses,
    }
  ),
  apiRoute(
    'get',
    `${base}/sources/:id/history`,
    controller,
    'sourceHistory',
    { params: idParams },
    { tags: ['Publication Vocabulary'], summary: 'Read original source import identities and attribution', responses }
  ),
  apiRoute(
    'get',
    `${base}/crosswalks/:id/local-entries`,
    controller,
    'localEntries',
    { params: idParams, query: objectField({ q: stringField(), limit: stringField(), offset: stringField() }) },
    { tags: ['Publication Vocabulary'], summary: 'Search the brand-owned local terms of a crosswalk', responses }
  ),
  apiRoute(
    'get',
    `${base}/sources`,
    controller,
    'sources',
    {},
    { tags: ['Publication Vocabulary'], summary: 'List shared vocabulary sources', responses }
  ),
  apiRoute(
    'get',
    `${base}/sources/:id/terms`,
    controller,
    'terms',
    {
      params: idParams,
      query: objectField({
        q: stringField(),
        includeHistorical: stringField(),
        limit: stringField(),
        offset: stringField(),
      }),
    },
    { tags: ['Publication Vocabulary'], summary: 'Search namespaced target terms', responses }
  ),
  apiRoute(
    'post',
    `${base}/sources/import`,
    controller,
    'importSource',
    { body: body(sourceImportSchema) },
    { tags: ['Publication Vocabulary'], summary: 'Import a reviewed vocabulary snapshot', responses }
  ),
  apiRoute(
    'post',
    `${base}/figshare/import`,
    controller,
    'importFigshare',
    {
      body: body(
        objectField(
          {
            scope: z.enum(['public', 'account']),
            taxonomyId: stringField(),
            expectedVersion: integerField(),
            importId: stringField(),
          },
          ['scope', 'taxonomyId', 'importId']
        )
      ),
    },
    { tags: ['Publication Vocabulary'], summary: 'Import the configured Figshare catalogue', responses }
  ),
  apiRoute(
    'get',
    `${base}/crosswalks`,
    controller,
    'crosswalks',
    {},
    { tags: ['Publication Vocabulary'], summary: 'List shared crosswalks', responses }
  ),
  apiRoute(
    'get',
    `${base}/crosswalks/:id`,
    controller,
    'crosswalk',
    { params: idParams },
    { tags: ['Publication Vocabulary'], summary: 'Read crosswalk revisions and approval history', responses }
  ),
  apiRoute(
    'post',
    `${base}/crosswalks`,
    controller,
    'createCrosswalk',
    {
      body: body(
        objectField(
          {
            name: stringField(),
            sourceId: stringField(),
            localVocabularyId: stringField(),
            normalizer: z.enum(['exact-v1', 'figshare-code-v1']),
          },
          ['name', 'sourceId', 'localVocabularyId']
        )
      ),
    },
    { tags: ['Publication Vocabulary'], summary: 'Create a shared draft crosswalk', responses }
  ),
  apiRoute(
    'put',
    `${base}/crosswalks/:id/mappings`,
    controller,
    'saveMappings',
    {
      params: idParams,
      body: body(
        objectField({ version: integerField(), mappings: arrayField(mappingSchema) }, ['version', 'mappings'])
      ),
    },
    { tags: ['Publication Vocabulary'], summary: 'Save a draft with optimistic version control', responses }
  ),
  apiRoute(
    'post',
    `${base}/crosswalks/:id/approve`,
    controller,
    'approve',
    { params: idParams, body: body(objectField({ version: integerField() }, ['version'])) },
    { tags: ['Publication Vocabulary'], summary: 'Approve an immutable vocabulary revision', responses }
  ),
];
