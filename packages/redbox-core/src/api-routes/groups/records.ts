import { apiRoute } from '../route-factory';
import {
  arrayField,
  apiHarvestResponseSchema,
  binaryField,
  datastreamSummarySchema,
  datastreamUploadResponseSchema,
  datastreamParams,
  datastreamUploadBody,
  deletedRecordListItemSchema,
  oidParams,
  objectField,
  objectMetadataSchema,
  recordAuditEntrySchema,
  recordAuditQuery,
  recordDownloadQuery,
  recordHarvestQuery,
  recordListQuery,
  recordListItemSchema,
  recordMetadataSchema,
  recordUpdateQuery,
  recordTypeParams,
  recordAuthorizationSchema,
  listApiResponseSchema,
  responseField,
  storageServiceResponseSchema,
  stringField,
} from '../schemas/common';

const bodyFallback = ['body'] as const;

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
        content: { 'application/json': { schema: storageServiceResponseSchema } },
        headers: {
          Location: stringField('Location of the created record'),
        },
      },
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
    responses: { 200: responseField(storageServiceResponseSchema, 'Record metadata updated') },
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
    responses: { 200: responseField(arrayField(apiHarvestResponseSchema), 'Harvest results') },
  }
);

export const legacyHarvestRoute = apiRoute(
  'post',
  '/:branding/:portal/api/mint/harvest/:recordType',
  'webservice/RecordController',
  'legacyHarvest',
  {
    params: recordTypeParams,
    query: recordUpdateQuery,
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
    body: {
      required: true,
      content: { 'application/json': { schema: objectField({}, [], 'Object metadata payload', true) } },
    },
  },
  {
    tags: ['Records'],
    summary: 'Update object metadata',
    responses: { 200: responseField(storageServiceResponseSchema, 'Object metadata updated') },
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
    responses: { 200: responseField(recordMetadataSchema, 'Record metadata') },
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
    responses: { 200: responseField(objectMetadataSchema, 'Object metadata') },
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
    responses: { 200: responseField(recordAuthorizationSchema, 'Updated edit permissions') },
  }
);

export const removeUserEditRoute = apiRoute(
  'delete',
  '/:branding/:portal/api/records/permissions/edit/:oid',
  'webservice/RecordController',
  'removeUserEdit',
  {
    params: oidParams,
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
    responses: { 200: responseField(recordAuthorizationSchema, 'Updated edit permissions') },
  }
);

export const addUserViewRoute = apiRoute(
  'post',
  '/:branding/:portal/api/records/permissions/view/:oid',
  'webservice/RecordController',
  'addUserView',
  {
    params: oidParams,
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
    responses: { 200: responseField(recordAuthorizationSchema, 'Updated view permissions') },
  }
);

export const removeUserViewRoute = apiRoute(
  'delete',
  '/:branding/:portal/api/records/permissions/view/:oid',
  'webservice/RecordController',
  'removeUserView',
  {
    params: oidParams,
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
    responses: { 200: responseField(recordAuthorizationSchema, 'Updated view permissions') },
  }
);

export const addRoleEditRoute = apiRoute(
  'post',
  '/:branding/:portal/api/records/permissions/editRole/:oid',
  'webservice/RecordController',
  'addRoleEdit',
  {
    params: oidParams,
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
    responses: { 200: responseField(recordAuthorizationSchema, 'Updated role permissions') },
  }
);

export const removeRoleEditRoute = apiRoute(
  'delete',
  '/:branding/:portal/api/records/permissions/editRole/:oid',
  'webservice/RecordController',
  'removeRoleEdit',
  {
    params: oidParams,
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
    responses: { 200: responseField(recordAuthorizationSchema, 'Updated role permissions') },
  }
);

export const addRoleViewRoute = apiRoute(
  'post',
  '/:branding/:portal/api/records/permissions/viewRole/:oid',
  'webservice/RecordController',
  'addRoleView',
  {
    params: oidParams,
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
    responses: { 200: responseField(recordAuthorizationSchema, 'Updated role permissions') },
  }
);

export const removeRoleViewRoute = apiRoute(
  'delete',
  '/:branding/:portal/api/records/permissions/viewRole/:oid',
  'webservice/RecordController',
  'removeRoleView',
  {
    params: oidParams,
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
    responses: { 200: responseField(recordAuthorizationSchema, 'Updated role permissions') },
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
    responses: { 200: responseField(recordAuthorizationSchema, 'Record permissions') },
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
    body: {
      required: true,
      content: { 'application/json': { schema: objectField({}, [], 'Workflow transition payload', true) } },
    },
  },
  {
    tags: ['Records'],
    summary: 'Transition workflow step',
    responses: { 200: responseField(storageServiceResponseSchema, 'Workflow transition complete') },
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
