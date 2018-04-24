module.exports.record = {
  baseUrl: {
    redbox: "http://redbox:9000/redbox",
    mint: "http://203.101.226.160/mint"
  },
  api: {
    create: {method: 'post', url: "/api/v1/object/$packageType"},
    search: {method: 'get', url: "/api/v1/search"},
    query: {method: 'post', url: "/api/v2/query"},
    getMeta: {method: 'get', url: "/api/v1/recordmetadata/$oid"},
    updateMeta: {method: 'post', url: "/api/v1/recordmetadata/$oid"},
    harvest: {method: 'post', url:"/api/v1.1/harvest/$packageType"},
    getDatastream: {method: 'get', url:"/api/v1/datastream/$oid"},
    addDatastream: {method: 'post', url:"/api/v1/datastream/$oid"},
    removeDatastream: {method: 'delete', url:"/api/v1/datastream/$oid"}
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
  }
};
