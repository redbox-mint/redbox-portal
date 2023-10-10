module.exports.namedQuery = {
  'listRDMPRecords': {
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
      },
      'dateModifiedBefore': {
        type: 'string',
        path: 'lastSaveDate',
        queryType: '<=',
        whenUndefined: 'defaultValue',
        defaultValue: '3000-01-01T00:00:00.000Z'
      },
      'dateModifiedAfter': {
        type: 'string',
        path: 'lastSaveDate',
        queryType: '>=',
        whenUndefined: 'defaultValue',
        defaultValue: '1900-01-01T00:00:00.000Z'
      }
    }
  },
  'listDRRecords': {
    mongoQuery: {
      'metaMetadata.type': "dataRecord",
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
      },
      'dateModifiedBefore': {
        type: 'string',
        path: 'lastSaveDate',
        queryType: '<=',
        whenUndefined: 'defaultValue',
        defaultValue: '3000-01-01T00:00:00.000Z'
      },
      'dateModifiedAfter': {
        type: 'string',
        path: 'lastSaveDate',
        queryType: '>=',
        whenUndefined: 'defaultValue',
        defaultValue: '1900-01-01T00:00:00.000Z'
      }
    }
  },
  'listDPRecords': {
    mongoQuery: {
      'metaMetadata.type': "dataPublication",
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
      },
      'dateModifiedBefore': {
        type: 'string',
        path: 'lastSaveDate',
        queryType: '<=',
        whenUndefined: 'defaultValue',
        defaultValue: '3000-01-01T00:00:00.000Z'
      },
      'dateModifiedAfter': {
        type: 'string',
        path: 'lastSaveDate',
        queryType: '>=',
        whenUndefined: 'defaultValue',
        defaultValue: '1900-01-01T00:00:00.000Z'
      }
    }
  },
  'listEmbargoedDPRecords': {
    mongoQuery: {
      'metaMetadata.type': "dataPublication",
      'workflow.stage': "embargoed",
      'metadata.title': null,
      'metadata.embargoUntil': null,
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
      },
      'dateModifiedBefore': {
        type: 'string',
        path: 'lastSaveDate',
        queryType: '<=',
        whenUndefined: 'defaultValue',
        defaultValue: '3000-01-01T00:00:00.000Z'
      },
      'dateModifiedAfter': {
        type: 'string',
        path: 'lastSaveDate',
        queryType: '>=',
        whenUndefined: 'defaultValue',
        defaultValue: '1900-01-01T00:00:00.000Z'
      },
      'dateEmbargoedBefore': {
        type: 'string',
        path: 'metadata.embargoUntil',
        queryType: '<=',
        whenUndefined: 'defaultValue',
        defaultValue: '3000-01-01T00:00:00.000Z'
      },
      'dateEmbargoedAfter': {
        type: 'string',
        path: 'metadata.embargoUntil',
        queryType: '>=',
        whenUndefined: 'defaultValue',
        defaultValue: '1900-01-01T00:00:00.000Z'
      }
    }
  },
  'listWorkspaceRecords': {
    mongoQuery: {
      'metaMetadata.packageType': "workspace",
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
      },
      'dateModifiedBefore': {
        type: 'string',
        path: 'lastSaveDate',
        queryType: '<=',
        whenUndefined: 'defaultValue',
        defaultValue: '3000-01-01T00:00:00.000Z'
      },
      'dateModifiedAfter': {
        type: 'string',
        path: 'lastSaveDate',
        queryType: '>=',
        whenUndefined: 'defaultValue',
        defaultValue: '1900-01-01T00:00:00.000Z'
      }
    }
  },
  'listDraftInactiveRDMPRecords': {
    mongoQuery: {
      'metaMetadata.type': "rdmp",
      'workflow.stage': 'draft'
    },
    queryParams: {
      'lastSaveDateToCheck': {
        type: 'date', //When using "date" data type the path is expected to be a date in mongo db
        path: 'lastSaveDate', 
        queryType: '<=', //<= is equivalent to $lte and >= is equivalent to $gte
        format: 'days', //When using "date" data type format is required and can be "days" or "ISODate" 
                        //if format is "days"  
                        //0 = 0 days difference = now
                        //-365 = 365 days difference in the past
                        //20 = 20 days difference in the future
                        //if format is "ISODate" 
                        //a full ISO date like 2021-06-01T07:09:51.498Z is expected
        whenUndefined: 'defaultValue',
        defaultValue: '-365'
      }
    }
  } 
};