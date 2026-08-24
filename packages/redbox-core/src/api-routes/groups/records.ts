import { apiRoute } from '../route-factory';
import {
  arrayField,
  apiErrorResponseSchema,
  apiHarvestResponseSchema,
  binaryField,
  datastreamSummarySchema,
  datastreamUploadResponseSchema,
  datastreamParams,
  datastreamUploadBody,
  deletedRecordListItemSchema,
  oidParams,
  objectField,
  objectMetadataReadResponseSchema,
  recordAuditEntrySchema,
  recordAuditQuery,
  recordDownloadQuery,
  recordHarvestQuery,
  harvestRouteResponseSchema,
  legacyRecordUpdateQuery,
  recordListQuery,
  recordListItemSchema,
  recordMetadataReadResponseSchema,
  recordMutationHeaders,
  recordOperationQuery,
  recordSaveFailureResponseSchema,
  recordSaveSuccessResponseSchema,
  recordUpdateQuery,
  recordTypeParams,
  recordEntityTagSchema,
  recordPermissionSaveResponseSchema,
  recordPermissionsReadResponseSchema,
  listApiResponseSchema,
  responseField,
  storageServiceResponseSchema,
  stringField,
} from '../schemas/common';

const bodyFallback = ['body'] as const;

const recordEntityTagResponseHeaders = {
  ETag: recordEntityTagSchema,
};

const recordResponseWithTag = (schema: Parameters<typeof responseField>[0], description: string) => ({
  ...responseField(schema, description),
  headers: recordEntityTagResponseHeaders,
});

const recordConcurrencyFailureResponses = {
  409: recordResponseWithTag(recordSaveFailureResponseSchema, 'Record or form-definition conflict'),
  412: recordResponseWithTag(recordSaveFailureResponseSchema, 'Record revision is stale or no longer active'),
  428: recordResponseWithTag(recordSaveFailureResponseSchema, 'Strict record precondition is required'),
};

const recordPermissionMutationResponses = {
  200: recordResponseWithTag(recordPermissionSaveResponseSchema, 'Record permissions updated'),
  400: recordResponseWithTag(recordSaveFailureResponseSchema, 'Invalid request or record validation failure'),
  403: recordResponseWithTag(recordSaveFailureResponseSchema, 'Record authorization failure'),
  ...recordConcurrencyFailureResponses,
  500: recordResponseWithTag(recordSaveFailureResponseSchema, 'Legacy or system save failure'),
};

const recordListLegacyFallbacks = {
  editOnly: bodyFallback,
  recordType: bodyFallback,
  state: bodyFallback,
  start: bodyFallback,
  rows: bodyFallback,
  packageType: bodyFallback,
  sort: bodyFallback,
  filterFields: bodyFallback,
  filter: bodyFallback,
} as const;

const recordAuditLegacyFallbacks = {
  dateFrom: bodyFallback,
  dateTo: bodyFallback,
} as const;

const recordDownloadLegacyFallbacks = {
  fileName: bodyFallback,
} as const;

export const createRecordRoute = apiRoute(
  'post',
  '/:branding/:portal/api/records/metadata/:recordType',
  'webservice/RecordController',
  'create',
  {
    params: objectField({ branding: stringField(), portal: stringField(), recordType: stringField() }, [
      'branding',
      'portal',
      'recordType',
    ]),
    query: recordOperationQuery,
    body: {
      required: true,
      content: { 'application/json': { schema: objectField({}, [], 'Record metadata payload', true) } },
    },
  },
  {
    tags: ['Records'],
    summary: 'Create record metadata',
    responses: {
      201: {
        description: 'Record created',
        content: { 'application/json': { schema: recordSaveSuccessResponseSchema } },
        headers: {
          Location: stringField('Location of the created record'),
          ...recordEntityTagResponseHeaders,
        },
      },
      400: responseField(recordSaveFailureResponseSchema, 'Invalid request or record validation failure'),
      403: responseField(recordSaveFailureResponseSchema, 'Record or operation authorization failure'),
      500: responseField(recordSaveFailureResponseSchema, 'Legacy or system save failure'),
    },
  }
);

export const updateMetaRoute = apiRoute(
  'put',
  '/:branding/:portal/api/records/metadata/:oid',
  'webservice/RecordController',
  'updateMeta',
  {
    params: oidParams,
    query: recordUpdateQuery,
    headers: recordMutationHeaders,
    body: {
      required: true,
      content: { 'application/json': { schema: objectField({}, [], 'Record metadata payload', true) } },
    },
    legacyParamFallbacks: {
      merge: bodyFallback,
      datastreams: bodyFallback,
    },
  },
  {
    tags: ['Records'],
    summary: 'Update record metadata',
    responses: {
      200: recordResponseWithTag(recordSaveSuccessResponseSchema, 'Record metadata updated'),
      400: recordResponseWithTag(recordSaveFailureResponseSchema, 'Invalid request or record validation failure'),
      403: recordResponseWithTag(recordSaveFailureResponseSchema, 'Record or operation authorization failure'),
      ...recordConcurrencyFailureResponses,
      500: recordResponseWithTag(recordSaveFailureResponseSchema, 'Legacy or system save failure'),
    },
  }
);

export const harvestRoute = apiRoute(
  'post',
  '/:branding/:portal/api/records/harvest/:recordType',
  'webservice/RecordController',
  'harvest',
  {
    params: recordTypeParams,
    query: recordHarvestQuery,
    body: { content: { 'application/json': { schema: objectField({}, [], 'Harvest payload', true) } } },
    legacyParamFallbacks: {
      updateMode: bodyFallback,
    },
  },
  {
    tags: ['Records'],
    summary: 'Harvest record metadata',
    responses: {
      200: responseField(harvestRouteResponseSchema, 'Harvest results'),
      400: responseField(apiErrorResponseSchema, 'Bad request'),
      500: responseField(apiErrorResponseSchema, 'Internal server error'),
    },
  }
);

export const legacyHarvestRoute = apiRoute(
  'post',
  '/:branding/:portal/api/mint/harvest/:recordType',
  'webservice/RecordController',
  'legacyHarvest',
  {
    params: recordTypeParams,
    query: legacyRecordUpdateQuery,
    body: { content: { 'application/json': { schema: objectField({}, [], 'Legacy harvest payload', true) } } },
    legacyParamFallbacks: {
      merge: bodyFallback,
    },
  },
  {
    tags: ['Records'],
    summary: 'Legacy harvest record metadata',
    responses: { 200: responseField(arrayField(apiHarvestResponseSchema), 'Harvest results') },
  }
);

export const updateObjectMetaRoute = apiRoute(
  'put',
  '/:branding/:portal/api/records/objectmetadata/:oid',
  'webservice/RecordController',
  'updateObjectMeta',
  {
    params: oidParams,
    headers: recordMutationHeaders,
    body: {
      required: true,
      content: { 'application/json': { schema: objectField({}, [], 'Object metadata payload', true) } },
    },
  },
  {
    tags: ['Records'],
    summary: 'Update object metadata',
    responses: {
      200: recordResponseWithTag(recordSaveSuccessResponseSchema, 'Object metadata updated'),
      400: recordResponseWithTag(recordSaveFailureResponseSchema, 'Invalid request or record validation failure'),
      403: recordResponseWithTag(recordSaveFailureResponseSchema, 'Record authorization failure'),
      ...recordConcurrencyFailureResponses,
      500: recordResponseWithTag(recordSaveFailureResponseSchema, 'Legacy or system save failure'),
    },
  }
);

export const getMetaRoute = apiRoute(
  'get',
  '/:branding/:portal/api/records/metadata/:oid',
  'webservice/RecordController',
  'getMeta',
  { params: oidParams },
  {
    tags: ['Records'],
    summary: 'Get record metadata',
    responses: {
      200: recordResponseWithTag(recordMetadataReadResponseSchema, 'Record metadata'),
      403: responseField(apiErrorResponseSchema, 'Record view authorization failure'),
      404: responseField(apiErrorResponseSchema, 'Record not found in the active brand'),
      500: responseField(apiErrorResponseSchema, 'Internal server error'),
    },
  }
);

export const getRecordAuditRoute = apiRoute(
  'get',
  '/:branding/:portal/api/records/audit/:oid',
  'webservice/RecordController',
  'getRecordAudit',
  {
    params: oidParams,
    query: recordAuditQuery,
    legacyParamFallbacks: recordAuditLegacyFallbacks,
  },
  {
    tags: ['Records'],
    summary: 'Get record audit',
    responses: { 200: responseField(listApiResponseSchema(recordAuditEntrySchema), 'Record audit list') },
  }
);

export const listRecordsRoute = apiRoute(
  'get',
  '/:branding/:portal/api/records/list',
  'webservice/RecordController',
  'listRecords',
  {
    query: recordListQuery,
    legacyParamFallbacks: recordListLegacyFallbacks,
  },
  {
    tags: ['Records'],
    summary: 'List records',
    responses: { 200: responseField(listApiResponseSchema(recordListItemSchema), 'Record list') },
  }
);

export const listDeletedRecordsRoute = apiRoute(
  'get',
  '/:branding/:portal/api/deletedrecords/list',
  'webservice/RecordController',
  'listDeletedRecords',
  {
    query: recordListQuery,
    legacyParamFallbacks: recordListLegacyFallbacks,
  },
  {
    tags: ['Records'],
    summary: 'List deleted records',
    responses: { 200: responseField(listApiResponseSchema(deletedRecordListItemSchema), 'Deleted record list') },
  }
);

export const restoreRecordRoute = apiRoute(
  'put',
  '/:branding/:portal/api/deletedrecords/:oid',
  'webservice/RecordController',
  'restoreRecord',
  { params: oidParams },
  {
    tags: ['Records'],
    summary: 'Restore deleted record',
    responses: { 200: responseField(storageServiceResponseSchema, 'Record restored') },
  }
);

export const destroyDeletedRecordRoute = apiRoute(
  'delete',
  '/:branding/:portal/api/deletedrecords/:oid',
  'webservice/RecordController',
  'destroyDeletedRecord',
  { params: oidParams },
  {
    tags: ['Records'],
    summary: 'Destroy deleted record',
    responses: { 200: responseField(storageServiceResponseSchema, 'Deleted record destroyed') },
  }
);

export const getObjectMetaRoute = apiRoute(
  'get',
  '/:branding/:portal/api/records/objectmetadata/:oid',
  'webservice/RecordController',
  'getObjectMeta',
  { params: oidParams },
  {
    tags: ['Records'],
    summary: 'Get object metadata',
    responses: {
      200: recordResponseWithTag(objectMetadataReadResponseSchema, 'Object metadata'),
      403: responseField(apiErrorResponseSchema, 'Record view authorization failure'),
      404: responseField(apiErrorResponseSchema, 'Record not found in the active brand'),
      500: responseField(apiErrorResponseSchema, 'Internal server error'),
    },
  }
);

export const deleteRecordRoute = apiRoute(
  'delete',
  '/:branding/:portal/api/records/metadata/:oid',
  'webservice/RecordController',
  'deleteRecord',
  { params: oidParams },
  {
    tags: ['Records'],
    summary: 'Delete record metadata',
    responses: { 200: responseField(storageServiceResponseSchema, 'Record deleted') },
  }
);

export const addUserEditRoute = apiRoute(
  'post',
  '/:branding/:portal/api/records/permissions/edit/:oid',
  'webservice/RecordController',
  'addUserEdit',
  {
    params: oidParams,
    headers: recordMutationHeaders,
    body: {
      content: {
        'application/json': {
          schema: objectField(
            { users: arrayField(stringField()), pendingUsers: arrayField(stringField()) },
            [],
            'Permissions payload',
            true
          ),
        },
      },
    },
  },
  {
    tags: ['Records'],
    summary: 'Add edit permissions',
    responses: recordPermissionMutationResponses,
  }
);

export const removeUserEditRoute = apiRoute(
  'delete',
  '/:branding/:portal/api/records/permissions/edit/:oid',
  'webservice/RecordController',
  'removeUserEdit',
  {
    params: oidParams,
    headers: recordMutationHeaders,
    body: {
      content: {
        'application/json': {
          schema: objectField(
            { users: arrayField(stringField()), pendingUsers: arrayField(stringField()) },
            [],
            'Permissions payload',
            true
          ),
        },
      },
    },
  },
  {
    tags: ['Records'],
    summary: 'Remove edit permissions',
    responses: recordPermissionMutationResponses,
  }
);

export const addUserViewRoute = apiRoute(
  'post',
  '/:branding/:portal/api/records/permissions/view/:oid',
  'webservice/RecordController',
  'addUserView',
  {
    params: oidParams,
    headers: recordMutationHeaders,
    body: {
      content: {
        'application/json': {
          schema: objectField(
            { users: arrayField(stringField()), pendingUsers: arrayField(stringField()) },
            [],
            'Permissions payload',
            true
          ),
        },
      },
    },
  },
  {
    tags: ['Records'],
    summary: 'Add view permissions',
    responses: recordPermissionMutationResponses,
  }
);

export const removeUserViewRoute = apiRoute(
  'delete',
  '/:branding/:portal/api/records/permissions/view/:oid',
  'webservice/RecordController',
  'removeUserView',
  {
    params: oidParams,
    headers: recordMutationHeaders,
    body: {
      content: {
        'application/json': {
          schema: objectField(
            { users: arrayField(stringField()), pendingUsers: arrayField(stringField()) },
            [],
            'Permissions payload',
            true
          ),
        },
      },
    },
  },
  {
    tags: ['Records'],
    summary: 'Remove view permissions',
    responses: recordPermissionMutationResponses,
  }
);

export const addRoleEditRoute = apiRoute(
  'post',
  '/:branding/:portal/api/records/permissions/editRole/:oid',
  'webservice/RecordController',
  'addRoleEdit',
  {
    params: oidParams,
    headers: recordMutationHeaders,
    body: {
      content: {
        'application/json': {
          schema: objectField({ roles: arrayField(stringField()) }, [], 'Role permissions payload', true),
        },
      },
    },
  },
  {
    tags: ['Records'],
    summary: 'Add edit role permissions',
    responses: recordPermissionMutationResponses,
  }
);

export const removeRoleEditRoute = apiRoute(
  'delete',
  '/:branding/:portal/api/records/permissions/editRole/:oid',
  'webservice/RecordController',
  'removeRoleEdit',
  {
    params: oidParams,
    headers: recordMutationHeaders,
    body: {
      content: {
        'application/json': {
          schema: objectField({ roles: arrayField(stringField()) }, [], 'Role permissions payload', true),
        },
      },
    },
  },
  {
    tags: ['Records'],
    summary: 'Remove edit role permissions',
    responses: recordPermissionMutationResponses,
  }
);

export const addRoleViewRoute = apiRoute(
  'post',
  '/:branding/:portal/api/records/permissions/viewRole/:oid',
  'webservice/RecordController',
  'addRoleView',
  {
    params: oidParams,
    headers: recordMutationHeaders,
    body: {
      content: {
        'application/json': {
          schema: objectField({ roles: arrayField(stringField()) }, [], 'Role permissions payload', true),
        },
      },
    },
  },
  {
    tags: ['Records'],
    summary: 'Add view role permissions',
    responses: recordPermissionMutationResponses,
  }
);

export const removeRoleViewRoute = apiRoute(
  'delete',
  '/:branding/:portal/api/records/permissions/viewRole/:oid',
  'webservice/RecordController',
  'removeRoleView',
  {
    params: oidParams,
    headers: recordMutationHeaders,
    body: {
      content: {
        'application/json': {
          schema: objectField({ roles: arrayField(stringField()) }, [], 'Role permissions payload', true),
        },
      },
    },
  },
  {
    tags: ['Records'],
    summary: 'Remove view role permissions',
    responses: recordPermissionMutationResponses,
  }
);

export const getPermissionsRoute = apiRoute(
  'get',
  '/:branding/:portal/api/records/permissions/:oid',
  'webservice/RecordController',
  'getPermissions',
  { params: oidParams },
  {
    tags: ['Records'],
    summary: 'Get record permissions',
    responses: {
      200: recordResponseWithTag(recordPermissionsReadResponseSchema, 'Record permissions'),
      403: responseField(apiErrorResponseSchema, 'Record view authorization failure'),
      404: responseField(apiErrorResponseSchema, 'Record not found in the active brand'),
      500: responseField(apiErrorResponseSchema, 'Internal server error'),
    },
  }
);

export const addDataStreamsRoute = apiRoute(
  'post',
  '/:branding/:portal/api/records/datastreams/:oid',
  'webservice/RecordController',
  'addDataStreams',
  {
    params: oidParams,
    body: { content: { 'multipart/form-data': { schema: datastreamUploadBody } } },
    files: {
      attachmentFields: {
        required: true,
        multiple: true,
        maxBytes: 104857600,
        description: 'Datastream files',
      },
    },
  },
  {
    tags: ['Records'],
    summary: 'Upload record datastreams',
    responses: {
      200: responseField(datastreamUploadResponseSchema, 'Datastreams uploaded'),
    },
  }
);

export const getDataStreamRoute = apiRoute(
  'get',
  '/:branding/:portal/api/records/datastreams/:oid/:datastreamId',
  'webservice/RecordController',
  'getDataStream',
  {
    params: datastreamParams,
    query: recordDownloadQuery,
    legacyParamFallbacks: recordDownloadLegacyFallbacks,
  },
  {
    tags: ['Records'],
    summary: 'Download datastream',
    responses: {
      200: {
        description: 'Datastream file download',
        headers: {
          'Content-Disposition': stringField('Attachment filename'),
        },
        content: {
          'application/octet-stream': {
            schema: binaryField('Datastream file contents'),
          },
        },
      },
    },
  }
);

export const listDatastreamsRoute = apiRoute(
  'get',
  '/:branding/:portal/api/records/datastreams/:oid',
  'webservice/RecordController',
  'listDatastreams',
  { params: oidParams },
  {
    tags: ['Records'],
    summary: 'List datastreams',
    responses: { 200: responseField(listApiResponseSchema(datastreamSummarySchema), 'Datastream list') },
  }
);

export const transitionWorkflowRoute = apiRoute(
  'post',
  '/:branding/:portal/api/records/workflow/step/:targetStep/:oid',
  'webservice/RecordController',
  'transitionWorkflow',
  {
    params: objectField({ targetStep: stringField(), oid: stringField() }, ['targetStep', 'oid']),
    query: recordOperationQuery,
    headers: recordMutationHeaders,
    body: {
      required: true,
      content: { 'application/json': { schema: objectField({}, [], 'Workflow transition payload', true) } },
    },
  },
  {
    tags: ['Records'],
    summary: 'Transition workflow step',
    responses: {
      200: recordResponseWithTag(recordSaveSuccessResponseSchema, 'Workflow transition complete'),
      400: recordResponseWithTag(recordSaveFailureResponseSchema, 'Invalid request or record validation failure'),
      403: recordResponseWithTag(recordSaveFailureResponseSchema, 'Record or operation authorization failure'),
      ...recordConcurrencyFailureResponses,
      500: recordResponseWithTag(recordSaveFailureResponseSchema, 'Legacy or system save failure'),
    },
  }
);

export const recordApiRoutes = [
  createRecordRoute,
  updateMetaRoute,
  harvestRoute,
  legacyHarvestRoute,
  updateObjectMetaRoute,
  getMetaRoute,
  getRecordAuditRoute,
  listRecordsRoute,
  listDeletedRecordsRoute,
  restoreRecordRoute,
  destroyDeletedRecordRoute,
  getObjectMetaRoute,
  deleteRecordRoute,
  addUserEditRoute,
  removeUserEditRoute,
  addUserViewRoute,
  removeUserViewRoute,
  addRoleEditRoute,
  removeRoleEditRoute,
  addRoleViewRoute,
  removeRoleViewRoute,
  getPermissionsRoute,
  addDataStreamsRoute,
  getDataStreamRoute,
  listDatastreamsRoute,
  transitionWorkflowRoute,
];
