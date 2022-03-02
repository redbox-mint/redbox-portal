module.exports.namedQuery = {
  "listRDMPRecords": {
    mongoQuery: {
      'metaMetadata.type': "rdmp",
      'metadata.title': null,
      'dateCreated': null
    },
    queryParams: {
      'title': {
        type: 'string',
        path: 'metadata.title',
        queryType: 'contains',
        whenUndefined: 'defaultValue',
        defaultValue: ''
      },
      'dateCreatedBefore': {
        type: 'string',
        path: 'dateCreated',
        queryType: '<=',
        whenUndefined: 'defaultValue',
        defaultValue: '3000-01-01T00:00:00.000Z'
      },
      'dateCreatedAfter': {
        type: 'string',
        path: 'dateCreated',
        queryType: '>=',
        whenUndefined: 'defaultValue',
        defaultValue: '1900-01-01T00:00:00.000Z'
      }
    }
  }
};