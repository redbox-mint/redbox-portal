import type { SailsConfig } from "redbox-core-types";

const baseUrl = "https://geonames.redboxresearchdata.com.au/select";

const geonamesDefault = new URLSearchParams();
geonamesDefault.set("timeAllowed", "1000");
geonamesDefault.set("rows", "7");
// A - country, state, region; H - stream, lake; P - city, village; T - mountain, rock
geonamesDefault.set("fq", "((feature_class:P AND -population:0) OR feature_class:H OR feature_class:T OR feature_class:A)");
// prioritise the country, region, city names
geonamesDefault.set("defType", "edismax");
geonamesDefault.set("bq", "feature_code:COUNTRY^1.5 feature_class:A^2.0 feature_class:P^2.0");

const geonamesCountry = new URLSearchParams();
geonamesCountry.set("timeAllowed", "1000");
geonamesCountry.set("rows", "7");
geonamesCountry.set("fq", "feature_class:A AND feature_code:COUNTRY");

const vocabConfig: SailsConfig["vocab"] = {
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
      // 'geonames' provides a search for all places in the world
      method: "get",
      url: `${baseUrl}?q=basic_name%3A$\{query}*&${geonamesDefault.toString()}`,
      options: { },
    },
    geonamesCountries: {
      // 'geonamesCountries' provides a search for all country names
      method: "get",
      url: `${baseUrl}?q=basic_name%3A$\{query}*&${geonamesCountry.toString()}`,
      options: { },
    },
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

module.exports.vocab = vocabConfig;
