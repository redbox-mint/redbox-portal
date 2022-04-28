module.exports.record = {
  auditing: {
    enabled:true,
    recordAuditJobName: 'RecordsService-StoreRecordAudit'
  },
  baseUrl: {
    redbox: "http://localhost:9000/redbox",
    mint: "https://demo.redboxresearchdata.com.au/mint"
  },
  maxUploadSize: 1073741824,
  mongodbDisk: '/attachments', //volume name as seen from within the docker container /attachments == /mnt/data
  diskSpaceThreshold: 0, //set diskSpaceThreshold to a reasonable amount of space on disk that will be left free as a safety buffer
  api: {
    create: {method: 'post', url: "/api/v1/object/$packageType"},
    search: {method: 'get', url: "/api/v1/search"},
    query: {method: 'post', url: "/api/v2/query"},
    getMeta: {method: 'get', url: "/api/v1/recordmetadata/$oid"},
    info: {method: 'get', url: "/api/v1/info"},
    updateMeta: {method: 'post', url: "/api/v1/recordmetadata/$oid"},
    harvest: {method: 'post', url:"/api/v1.1/harvest/$packageType"},
    getDatastream: {method: 'get', url:"/api/v1/datastream/$oid", readTimeout: 120000},
    addDatastream: {method: 'post', url:"/api/v1/datastream/$oid"},
    removeDatastream: {method: 'delete', url:"/api/v1/datastream/$oid"},
    addDatastreams: {method: 'put', url:"/api/v1/datastream/$oid"},
    addAndRemoveDatastreams: {method: 'patch', url:"/api/v1/datastream/$oid"},
    listDatastreams: {method: 'get', url:"/api/v2/datastream/$oid/list"},
    getRecordRelationships: {method: 'post', url:"/api/v2/recordmetadata/$oid/relationships"},
    delete: {method: 'delete', url: "/api/v1/object/$oid/delete"}
  },
  customFields: {
    '@branding': {
      source: 'request',
      type: 'session',
      field: 'branding'
    },
    '@portal': {
      source: 'request',
      type: 'session',
      field: 'portal'
    },
    '@oid': {
      source: 'request',
      type: 'param',
      field: 'oid'
    },
    '@user_name': {
      source: 'request',
      type: 'user',
      field: 'name'
    },
    '@user_email': {
      source: 'request',
      type: 'user',
      field: 'email'
    },
    '@user_username': {
      source: 'request',
      type: 'user',
      field: 'username'
    },
    '@referrer_rdmp': {
      source: 'request',
      type: 'header',
      field: 'referrer',
      parseUrl: true,
      searchParams: 'rdmp'
    },
    '@metadata': {
      source: 'metadata'
    },
    '@record': {
      source: 'record'
    }
  },
  export: {
    maxRecords: 20
  },
  transfer: {
    maxRecordsPerPage: 1000000
  },
  search: {
    returnFields: ['title', 'description', 'storage_id'],
    maxRecordsPerPage: 1000000
  },
  attachments: {
    stageDir: '/attachments/staging',
    path: '/attach'
  },
  // Set Datastream output source by specifing service, defaults to Mongo GridFS
  // datastreamService: 'datastreamservice'
  helpEmail: 'support@redboxresearchdata.com.au'


};
