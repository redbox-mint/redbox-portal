import { apiRoute } from '../route-factory';
import {
  arrayField,
  booleanField,
  idParams,
  integerField,
  listApiResponseSchema,
  objectField,
  responseField,
  stringField,
} from '../schemas/common';

const crosswalkSchema = objectField(
  {
    id: stringField(),
    name: stringField(),
    status: stringField('draft, approved or archived'),
    workingRevision: integerField(),
    approvedRevision: integerField().nullable(),
    approvedAt: stringField(),
    approvedBy: stringField(),
    localVocabularyId: stringField(),
    localVocabularyName: stringField(),
    figshareSourceId: stringField(),
    figshareSourceName: stringField(),
    scope: stringField(),
    taxonomyId: stringField(),
    approvedMappingCount: integerField(),
    workingMappingCount: integerField(),
    historicalTargetCount: integerField(),
  },
  ['id', 'name', 'status', 'workingRevision', 'localVocabularyId', 'figshareSourceId']
);

const mappingSchema = objectField(
  {
    id: stringField(),
    revision: integerField(),
    status: stringField(),
    matchType: stringField(),
    localEntryId: stringField(),
    localLabel: stringField(),
    localValue: stringField(),
    figshareCategoryId: stringField(),
    figshareSourceId: stringField(),
    figshareCategoryNumber: integerField().nullable(),
    historical: booleanField(),
    approvedAt: stringField().nullable(),
    approvedBy: stringField().nullable(),
  },
  ['id', 'revision', 'status', 'matchType', 'localEntryId', 'figshareCategoryId']
);

const localEntrySchema = objectField(
  {
    id: stringField(),
    label: stringField(),
    value: stringField(),
    identifier: stringField(),
    historical: booleanField(),
    targetCount: integerField('Targets already mapped in the requested revision'),
  },
  ['id', 'label', 'value', 'targetCount']
);

const usageSchema = objectField(
  {
    brandName: stringField(),
    configKey: stringField(),
    bindingPath: stringField(),
    outputs: stringField(),
    sourceVocabularyId: stringField(),
  },
  ['brandName', 'configKey', 'bindingPath']
);

export const listFigshareCrosswalksRoute = apiRoute(
  'get',
  '/:branding/:portal/api/figshare-crosswalks',
  'webservice/FigshareCrosswalkController',
  'list',
  {
    query: objectField({
      q: stringField(),
      status: stringField(),
      localVocabularyId: stringField(),
      sourceId: stringField(),
      limit: stringField(),
      offset: stringField(),
    }),
  },
  {
    tags: ['Figshare Crosswalk'],
    summary: 'List Figshare crosswalks',
    responses: { 200: responseField(listApiResponseSchema(crosswalkSchema), 'Figshare crosswalks') },
  }
);

export const createFigshareCrosswalkRoute = apiRoute(
  'post',
  '/:branding/:portal/api/figshare-crosswalks',
  'webservice/FigshareCrosswalkController',
  'create',
  {
    body: {
      required: true,
      content: {
        'application/json': {
          schema: objectField(
            { name: stringField(), localVocabularyId: stringField(), sourceId: stringField() },
            ['name', 'localVocabularyId', 'sourceId']
          ),
        },
      },
    },
  },
  {
    tags: ['Figshare Crosswalk'],
    summary: 'Create a draft Figshare crosswalk',
    responses: { 201: responseField(crosswalkSchema, 'Crosswalk created') },
  }
);

export const getFigshareCrosswalkUsageRoute = apiRoute(
  'get',
  '/:branding/:portal/api/figshare-crosswalks/:id/usage',
  'webservice/FigshareCrosswalkController',
  'usage',
  { params: idParams },
  {
    tags: ['Figshare Crosswalk'],
    summary: 'List the Figshare publishing configurations that select this crosswalk',
    responses: { 200: responseField(arrayField(usageSchema), 'Crosswalk usage') },
  }
);

export const listFigshareCrosswalkLocalEntriesRoute = apiRoute(
  'get',
  '/:branding/:portal/api/figshare-crosswalks/:id/local-entries',
  'webservice/FigshareCrosswalkController',
  'listLocalEntries',
  {
    params: idParams,
    query: objectField({
      q: stringField(),
      mapped: stringField("Filter by mapping state: 'mapped' or 'unmapped'"),
      revision: stringField(),
      limit: stringField(),
      offset: stringField(),
    }),
  },
  {
    tags: ['Figshare Crosswalk'],
    summary: 'Search the local vocabulary terms of a crosswalk with their target counts',
    responses: { 200: responseField(listApiResponseSchema(localEntrySchema), 'Crosswalk local entries') },
  }
);

export const listFigshareCrosswalkMappingsRoute = apiRoute(
  'get',
  '/:branding/:portal/api/figshare-crosswalks/:id/mappings',
  'webservice/FigshareCrosswalkController',
  'listMappings',
  {
    params: idParams,
    query: objectField({
      status: stringField(),
      q: stringField(),
      revision: stringField(),
      limit: stringField(),
      offset: stringField(),
    }),
  },
  {
    tags: ['Figshare Crosswalk'],
    summary: 'Search and page the mapping edges of a crosswalk revision',
    responses: { 200: responseField(listApiResponseSchema(mappingSchema), 'Crosswalk mappings') },
  }
);

export const saveFigshareCrosswalkMappingsRoute = apiRoute(
  'put',
  '/:branding/:portal/api/figshare-crosswalks/:id/mappings',
  'webservice/FigshareCrosswalkController',
  'saveMappings',
  {
    params: idParams,
    body: {
      required: true,
      content: {
        'application/json': {
          schema: objectField(
            {
              revision: integerField('Expected working revision'),
              changes: arrayField(
                objectField(
                  {
                    op: stringField("'add' or 'remove'"),
                    localEntryId: stringField(),
                    figshareCategoryId: stringField(),
                    matchType: stringField(),
                    status: stringField(),
                  },
                  ['op', 'localEntryId', 'figshareCategoryId']
                )
              ),
            },
            ['revision', 'changes']
          ),
        },
      },
    },
  },
  {
    tags: ['Figshare Crosswalk'],
    summary: 'Batch upsert or delete mapping edges with optimistic revision control',
    responses: { 200: responseField(crosswalkSchema, 'Crosswalk updated') },
  }
);

export const approveFigshareCrosswalkRoute = apiRoute(
  'post',
  '/:branding/:portal/api/figshare-crosswalks/:id/approve',
  'webservice/FigshareCrosswalkController',
  'approve',
  {
    params: idParams,
    body: {
      required: true,
      content: { 'application/json': { schema: objectField({ revision: integerField() }, ['revision']) } },
    },
  },
  {
    tags: ['Figshare Crosswalk'],
    summary: 'Promote the working revision to the approved revision',
    responses: { 200: responseField(crosswalkSchema, 'Crosswalk approved') },
  }
);

export const getFigshareCrosswalkRoute = apiRoute(
  'get',
  '/:branding/:portal/api/figshare-crosswalks/:id',
  'webservice/FigshareCrosswalkController',
  'get',
  { params: idParams },
  {
    tags: ['Figshare Crosswalk'],
    summary: 'Get a Figshare crosswalk',
    responses: { 200: responseField(crosswalkSchema, 'Figshare crosswalk') },
  }
);

export const deleteFigshareCrosswalkRoute = apiRoute(
  'delete',
  '/:branding/:portal/api/figshare-crosswalks/:id',
  'webservice/FigshareCrosswalkController',
  'delete',
  { params: idParams },
  {
    tags: ['Figshare Crosswalk'],
    summary: 'Delete a draft crosswalk; approved crosswalks archive instead',
    responses: { 204: { description: 'Crosswalk deleted or archived' } },
  }
);

export const figshareCrosswalkApiRoutes = [
  listFigshareCrosswalksRoute,
  createFigshareCrosswalkRoute,
  getFigshareCrosswalkUsageRoute,
  listFigshareCrosswalkLocalEntriesRoute,
  listFigshareCrosswalkMappingsRoute,
  saveFigshareCrosswalkMappingsRoute,
  approveFigshareCrosswalkRoute,
  getFigshareCrosswalkRoute,
  deleteFigshareCrosswalkRoute,
];
