module.exports.record = {
  api: {
    create: {method: 'post', url: "http://redbox:9000/redbox/api/v1/object/rdmp"},
    search: {method: 'get', url: "http://redbox:9000/redbox/api/v1/search"},
    getMeta: {method: 'get', url: "http://redbox:9000/redbox/api/v1/recordmetadata/$oid"},
    updateMeta: {method: 'post', url: "http://redbox:9000/redbox/api/v1/recordmetadata/$oid"},
    harvest: {method: 'post', url:"http://redbox:9000/redbox/api/v1.1/harvest/$packageType"}
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
  }
};
