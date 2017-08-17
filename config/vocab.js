module.exports.vocab = {
  clientUri: 'vocab',
  collectionUri: 'collection',
  clientCacheExpiry: 86400, // 1 day in seconds
  bootStrapVocabs: ['anzsrc-for'],
  bootStrapCollection: ['grid'],
  rootUrl: 'http://vocabs.ands.org.au/repository/api/lda/',
  conceptUri: 'concept.json?_view=all',
  cacheExpiry: 31536000, // one year in seconds
  collection: {
    grid: {
      url: "https://api.morph.io/andrewbrazzatti/global_research_identifier_database/data.json?key=mvGIRSPmn1Og%2FCfWFDaW&query=select%20*%20from%20%27data%27",
      saveMethod: "saveInst",
      searchMethod: "searchInst",
      getMethod: "getInst",
      type: 'gridInstitutes',
      searchField: 'text_name',
      fields: ['name', 'email_address', 'grid_id', 'wikipedia_url', 'established'],
      processingTime: 60000,
      processingBuffer: 100
    }
  }
};
