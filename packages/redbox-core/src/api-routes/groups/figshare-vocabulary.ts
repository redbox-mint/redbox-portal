import { apiRoute } from '../route-factory';
import {
  anyField,
  arrayField,
  booleanField,
  integerField,
  listApiResponseSchema,
  objectField,
  responseField,
  stringField,
} from '../schemas/common';

const taxonomySummarySchema = objectField(
  {
    taxonomyId: stringField('Figshare taxonomy identifier'),
    title: stringField('Display title'),
    categoryCount: integerField('Number of categories in the taxonomy'),
    selectableCount: integerField('Number of selectable categories'),
    missingParentCount: integerField('Categories whose parent is absent from the catalogue'),
  },
  ['taxonomyId', 'title', 'categoryCount', 'selectableCount', 'missingParentCount']
);

const syncPreviewSummarySchema = objectField({
  added: integerField(),
  changed: integerField(),
  removed: integerField(),
  reappeared: integerField(),
  unchanged: integerField(),
  proposed: integerField(),
  preselected: integerField(),
  unresolved: integerField(),
  historicalWarnings: integerField(),
});

const syncPreviewSchema = objectField(
  {
    runId: stringField('Synchronisation run identifier'),
    state: stringField('Run state'),
    scope: stringField('Catalogue scope'),
    taxonomyId: stringField('Selected taxonomy'),
    sourceId: stringField('Figshare source identifier').nullable(),
    localVocabularyId: stringField('Local vocabulary identifier').nullable(),
    crosswalkId: stringField('Crosswalk identifier').nullable(),
    createLocalClone: booleanField('Whether an editable clone will be created'),
    baseHash: stringField('Mirror hash the preview was computed against'),
    remoteHash: stringField('Hash of the reviewed remote snapshot'),
    expiresAt: stringField('Preview expiry timestamp'),
    normalizerVersion: stringField('Normalizer version'),
    summary: syncPreviewSummarySchema,
    warnings: arrayField(anyField()),
  },
  ['runId', 'state', 'scope', 'taxonomyId', 'remoteHash', 'expiresAt', 'summary']
);

const pagedSyncPreviewSchema = objectField(
  {
    runId: stringField(),
    state: stringField(),
    scope: stringField(),
    taxonomyId: stringField(),
    sourceId: stringField().nullable(),
    localVocabularyId: stringField().nullable(),
    crosswalkId: stringField().nullable(),
    createLocalClone: booleanField(),
    baseHash: stringField(),
    remoteHash: stringField(),
    expiresAt: stringField(),
    normalizerVersion: stringField(),
    summary: syncPreviewSummarySchema,
    warnings: arrayField(anyField()),
    page: objectField({
      view: stringField('proposals or diff'),
      records: arrayField(anyField()),
      total: integerField(),
      limit: integerField(),
      offset: integerField(),
    }),
    unresolved: arrayField(anyField()),
  },
  ['runId', 'state', 'page']
);

const applyResultSchema = objectField(
  {
    runId: stringField(),
    state: stringField(),
    sourceId: stringField(),
    vocabularyId: stringField(),
    localVocabularyId: stringField().nullable(),
    crosswalkId: stringField().nullable(),
    crosswalkRevision: integerField().nullable(),
    categories: objectField({
      created: integerField(),
      updated: integerField(),
      historical: integerField(),
      reappeared: integerField(),
    }),
    mappings: objectField({ created: integerField(), removed: integerField() }),
    cloneCreated: booleanField(),
    appliedAt: stringField(),
  },
  ['runId', 'state', 'sourceId', 'vocabularyId', 'appliedAt']
);

const figshareSourceSchema = objectField(
  {
    id: stringField(),
    displayName: stringField(),
    scope: stringField(),
    taxonomyId: stringField(),
    vocabularyId: stringField(),
    vocabularyName: stringField(),
    lastSyncedAt: stringField().nullable(),
    archived: booleanField(),
    mirroredCount: integerField(),
    historicalCount: integerField(),
    crosswalkCount: integerField(),
  },
  ['id', 'displayName', 'scope', 'taxonomyId', 'vocabularyId']
);

const previewBodySchema = objectField(
  {
    scope: stringField("Catalogue scope: 'public' or 'account'"),
    taxonomyId: stringField('Figshare taxonomy identifier'),
    sourceId: stringField('Existing Figshare source to resynchronise'),
    crosswalkId: stringField('Existing crosswalk to resynchronise'),
    localVocabularyId: stringField('Existing local vocabulary to crosswalk'),
    createLocalClone: booleanField('Create an editable local clone instead'),
    localCloneName: stringField('Clone vocabulary name'),
    localCloneSlug: stringField('Clone vocabulary slug'),
  },
  ['scope', 'taxonomyId']
);

const applyBodySchema = objectField(
  {
    remoteHash: stringField('Hash of the reviewed remote snapshot'),
    expectedRevision: integerField('Expected crosswalk working revision'),
    approvedProposalIds: arrayField(stringField(), 'Proposal identifiers the administrator approved'),
    manualMappings: arrayField(
      objectField({
        localEntryId: stringField(),
        localEntryKey: stringField('Remote sourceId when the local entry is created by this run'),
        figshareSourceIds: arrayField(stringField()),
      }),
      'Manually added mapping targets'
    ),
  },
  ['remoteHash']
);

export const listFigshareCataloguesRoute = apiRoute(
  'get',
  '/:branding/:portal/api/figshare-vocabularies/catalogues',
  'webservice/FigshareVocabularyController',
  'listCatalogues',
  { query: objectField({ scope: stringField("Catalogue scope: 'public' or 'account'") }, ['scope']) },
  {
    tags: ['Figshare Vocabulary'],
    summary: 'Discover Figshare category taxonomies',
    responses: {
      200: responseField(arrayField(taxonomySummarySchema), 'Available Figshare taxonomies'),
    },
  }
);

export const listFigshareSourcesRoute = apiRoute(
  'get',
  '/:branding/:portal/api/figshare-vocabularies/sources',
  'webservice/FigshareVocabularyController',
  'listSources',
  {
    query: objectField({
      q: stringField(),
      scope: stringField(),
      limit: stringField(),
      offset: stringField(),
    }),
  },
  {
    tags: ['Figshare Vocabulary'],
    summary: 'List configured Figshare category sources',
    responses: { 200: responseField(listApiResponseSchema(figshareSourceSchema), 'Figshare sources') },
  }
);

export const getFigshareSourceRoute = apiRoute(
  'get',
  '/:branding/:portal/api/figshare-vocabularies/sources/:sourceId',
  'webservice/FigshareVocabularyController',
  'getSource',
  { params: objectField({ sourceId: stringField('Figshare source identifier') }, ['sourceId']) },
  {
    tags: ['Figshare Vocabulary'],
    summary: 'Get a Figshare category source',
    responses: { 200: responseField(figshareSourceSchema, 'Figshare source') },
  }
);

export const createFigshareSourcePreviewRoute = apiRoute(
  'post',
  '/:branding/:portal/api/figshare-vocabularies/sources/:sourceId/preview',
  'webservice/FigshareVocabularyController',
  'createSourcePreview',
  {
    params: objectField({ sourceId: stringField('Figshare source identifier') }, ['sourceId']),
    body: {
      required: false,
      content: {
        'application/json': {
          schema: objectField({
            localVocabularyId: stringField(),
            crosswalkId: stringField(),
          }),
        },
      },
    },
  },
  {
    tags: ['Figshare Vocabulary'],
    summary: 'Create a resynchronisation preview for an existing Figshare source',
    responses: { 201: responseField(syncPreviewSchema, 'Synchronisation preview created') },
  }
);

export const cloneFigshareSourceRoute = apiRoute(
  'post',
  '/:branding/:portal/api/figshare-vocabularies/sources/:sourceId/clone',
  'webservice/FigshareVocabularyController',
  'cloneSource',
  {
    params: objectField({ sourceId: stringField('Figshare source identifier') }, ['sourceId']),
    body: {
      required: true,
      content: {
        'application/json': { schema: objectField({ name: stringField(), slug: stringField() }, ['name']) },
      },
    },
  },
  {
    tags: ['Figshare Vocabulary'],
    summary: 'Create an editable local clone of a Figshare mirror',
    responses: {
      201: responseField(
        objectField(
          { localVocabularyId: stringField(), crosswalkId: stringField(), entries: integerField() },
          ['localVocabularyId', 'crosswalkId', 'entries']
        ),
        'Editable clone created'
      ),
    },
  }
);

export const listFigshareSyncRunsRoute = apiRoute(
  'get',
  '/:branding/:portal/api/figshare-vocabularies/sync-runs',
  'webservice/FigshareVocabularyController',
  'listSyncRuns',
  {
    query: objectField({
      sourceId: stringField(),
      limit: stringField(),
      offset: stringField(),
    }),
  },
  {
    tags: ['Figshare Vocabulary'],
    summary: 'List Figshare synchronisation history',
    responses: { 200: responseField(listApiResponseSchema(anyField()), 'Synchronisation runs') },
  }
);

export const createFigsharePreviewRoute = apiRoute(
  'post',
  '/:branding/:portal/api/figshare-vocabularies/previews',
  'webservice/FigshareVocabularyController',
  'createPreview',
  { body: { required: true, content: { 'application/json': { schema: previewBodySchema } } } },
  {
    tags: ['Figshare Vocabulary'],
    summary: 'Fetch, normalise, hash, diff and propose without mutating stored vocabularies',
    responses: { 201: responseField(syncPreviewSchema, 'Synchronisation preview created') },
  }
);

export const getFigsharePreviewRoute = apiRoute(
  'get',
  '/:branding/:portal/api/figshare-vocabularies/previews/:runId',
  'webservice/FigshareVocabularyController',
  'getPreview',
  {
    params: objectField({ runId: stringField('Synchronisation run identifier') }, ['runId']),
    query: objectField({
      view: stringField("'proposals' or 'diff'"),
      changeClass: stringField(),
      matchType: stringField(),
      q: stringField(),
      unresolvedOnly: stringField(),
      historicalOnly: stringField(),
      limit: stringField(),
      offset: stringField(),
    }),
  },
  {
    tags: ['Figshare Vocabulary'],
    summary: 'Read a paged, filterable synchronisation preview',
    responses: { 200: responseField(pagedSyncPreviewSchema, 'Synchronisation preview') },
  }
);

export const applyFigsharePreviewRoute = apiRoute(
  'post',
  '/:branding/:portal/api/figshare-vocabularies/previews/:runId/apply',
  'webservice/FigshareVocabularyController',
  'applyPreview',
  {
    params: objectField({ runId: stringField('Synchronisation run identifier') }, ['runId']),
    body: { required: true, content: { 'application/json': { schema: applyBodySchema } } },
  },
  {
    tags: ['Figshare Vocabulary'],
    summary: 'Apply the approved proposals from a reviewed preview',
    responses: { 200: responseField(applyResultSchema, 'Synchronisation applied') },
  }
);

export const figshareVocabularyApiRoutes = [
  listFigshareCataloguesRoute,
  listFigshareSourcesRoute,
  getFigshareSourceRoute,
  createFigshareSourcePreviewRoute,
  cloneFigshareSourceRoute,
  listFigshareSyncRunsRoute,
  createFigsharePreviewRoute,
  getFigsharePreviewRoute,
  applyFigsharePreviewRoute,
];
