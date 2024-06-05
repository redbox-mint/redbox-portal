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
  queries: {
    party: {
      querySource: 'solr',
      searchQuery: {
        searchCore: 'default',
        baseQuery : 'metaMetadata_type:rdmp'
      },
      queryField: {
        property: 'title',
        type: 'text'
      },
      resultObjectMapping: {
        fullName: '<%= _.get(record,"contributor_ci.text_full_name","") %>',
        email: '<%= _.get(record,"contributor_ci.email","") %>',
        orcid: '<%= _.get(record,"contributor_ci.orcid","") %>'
      }
    },
    rdmp: {
      querySource: 'database',
      databaseQuery: {
        queryName: 'listRDMPRecords',
      },
      queryField: {
        property: 'title',
        type: 'text'
      }
    }
  }
};
