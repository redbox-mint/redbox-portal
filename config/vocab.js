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
      searchCore: 'parties',
      baseQuery : 'metaMetadata_type:party'
    },
    queryField: {
      property: 'full_name',
      type: 'text'
    },
    resultObjectMapping: {
      fullname: '<%= record.full_name %>',
      email: '<%= record.email %>',
      orcid: '<%= record.orcid %>'
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
