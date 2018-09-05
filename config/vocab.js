module.exports.vocab = {
  clientUri: 'vocab',
  collectionUri: 'collection',
  userRootUri: 'user/find',
  clientCacheExpiry: 86400, // 1 day in seconds
  // bootStrapVocabs: ['anzsrc-for', 'anzsrc-seo'],
  bootStrapVocabs: [], // disable vocab pre-load as we're now hitting ANDs API endpoints directly from the for form
  rootUrl: 'http://vocabs.ands.org.au/repository/api/lda/',
  conceptUri: 'concept.json?_view=all',
  cacheExpiry: 31536000, // one year in seconds
  providers: {
    geonames: {
      method: 'get',
      url: "http://203.101.226.35/geonames/search?func=search&q=${query}&format=json",
      options: {

      }
    }
  }
};
