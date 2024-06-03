module.exports.vocab = {
  clientUri: 'vocab',
  collectionUri: 'collection',
  userRootUri: 'user/find',
  clientCacheExpiry: 86400, // 1 day in seconds
  // bootStrapVocabs: ['anzsrc-for', 'anzsrc-seo'],
  bootStrapVocabs: [], // disable vocab pre-load as we're now hitting ANDs API endpoints directly from the for form
  rootUrl: 'http://vocabs.ardc.edu.au/repository/api/lda/',
  conceptUri: 'concept.json?_view=all',
  cacheExpiry: 31536000, // one year in seconds
  external: {
    geonames: {
      method: 'get',
      url: "http://mint:9001/geonames/search?func=search&q=${query}&format=json",
      options: {

      }
    }
  },
  party: {
    reportSource: 'solr',
    searchQuery: {
      searchCore: 'default',
      baseQuery : 'metaMetadata_type:rdmp'
    },
    queryField: {
      property: 'GIVEN_NAME',
      type: 'text'
    },
    resultObjectMapping: {
      fullName: '<%= record.GIVEN_NAME %>',
      email: '<%= record.EMAIL %>',
      orcid: '<%= record.ORCID %>'
    }
  },
  rdmp: {
    reportSource: 'database',
    databaseQuery: {
      queryName: 'listRDMPRecords',
    },
    queryField: {
      property: 'title',
      type: 'text'
    }
  }
};
