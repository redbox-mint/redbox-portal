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
      url: "https://geonames.redboxresearchdata.com.au/select?timeAllowed=1000&q=${query}",
      options: {

      }
    }
  },
  queries: {
    party: {
      querySource: "database",
      databaseQuery: {
          queryName: "listPartiesPeople",
      },
      queryField: {
          property: "search",
          type: "text",
      },
      resultObjectMapping: {
          honorific: "<%= _.get(record,'metadata.honorific','') %>",
          text_full_name: "<%= _.get(record,'metadata.fullName','') %>",
          email: "<%= _.get(record,'metadata.email','') %>",
          orcid: "<%= _.get(record,'metadata.orcid','') %>",
          ID: "<%= _.get(record,'metadata.ID','') %>",
      },
  },
  activity: {
      querySource: "database",
      databaseQuery: {
          queryName: "listResearchActivities",
      },
      queryField: {
          property: "search",
          type: "text",
      },
      userQueryFields: [
          // filter the returned activity records to only those the current user has permission to access
          {
              property: "userAccessByUsername",
              userValueProperty: "username",
          },
      ],
      // resultObjectMapping: {
      //     "oid": "<%= _.get(record, 'metadata.oid', '') %>",
      //     "ID": "<%= _.get(record, 'metadata.ID', '') %>",
      //     "coversheet-id": "<%= _.get(record, 'metadata.coversheet-id', '') %>",
      //     "irma-id": "<%= _.get(record, 'metadata.irma-id', '') %>",
      //     "type": "<%= _.get(record, 'metadata.type', '') %>",
      //     "status": "<%= _.get(record, 'metadata.status', '') %>",
      //     "title": "<%= _.get(record, 'metadata.title', '') %>",
      //     "original_title": "<%= _.get(record, 'metadata.title', '') %>",
      //     "display_title": "<%= `${_.get(record, 'metadata.ID', '')} ${_.get(record, 'metadata.type', '')} ${_.get(record, 'metadata.title', '')}` %>",
      //     "description": "<%= _.get(record,'metadata.description','') %>",
      //     "dc:subject_anzsrc:toa_rdf:resource": "<%= _.get(record,'metadata.dc:subject_anzsrc:toa_rdf:resource','') %>",
      //     "dc:subject_anzsrc:for": "<% return _.get(record,'metadata.dc:subject_anzsrc:for',[]); %>",
      //     "dc:subject_anzsrc:seo": "<% return _.get(record,'metadata.dc:subject_anzsrc:seo',[]); %>",
      //     "dc:coverage_vivo:DateTimeInterval_vivo:start": "<%= _.get(record,'metadata.dc:coverage_vivo:DateTimeInterval_vivo:start','') %>",
      //     "dc:coverage_vivo:DateTimeInterval_vivo:end": "<%= _.get(record,'metadata.dc:coverage_vivo:DateTimeInterval_vivo:end','') %>",
      //     "foaf:fundedBy_foaf:Agent": "<% return _.get(record,'metadata.foaf:fundedBy_foaf:Agent',[]); %>",
      //     "contributor_ci": `<% let contributor = _.get(record,'metadata.contributor_ci', {});
      //     contributor.text_full_name = contributor.fullName;
      //     return contributor %>`,
      //     "contributor_author": `<% let contributor = _.get(record,'metadata.contributor_author', {});
      //     contributor.text_full_name = contributor.fullName;
      //     return contributor %>`,
      //     "contributors_supervisor": `<% let supervisors = _.get(record,'metadata.contributors_supervisor', []);
      //     if(!_.isArray(supervisors)) {
      //         supervisors = [supervisors];
      //     }
      //     for(let supervisor of supervisors) {
      //         supervisor.text_full_name = supervisor.fullName;
      //     }
      //     return supervisors %>`,
      //     "contributors": `<% let contributors = _.get(record,'metadata.contributors', []);
      //     if(!_.isArray(contributors)) {
      //         contributors = [contributors];
      //     }
      //     for(let contributor of contributors) {
      //         contributor.text_full_name = contributor.fullName;
      //     }
      //     return contributors %>`,
      //     "contributors_external": `<% let contributors = _.get(record,'metadata.contributors_external', []);
      //     if(!_.isArray(contributors)) {
      //         contributors = [contributors];
      //     }
      //     for(let contributor of contributors) {
      //         contributor.text_full_name = contributor.fullName;
      //     }
      //     return contributors %>`,
      //     "contributors_data_manager": `<% let contributors = _.get(record,'metadata.contributors_data_manager', []);
      //     if(!_.isArray(contributors)) {
      //         contributors = [contributors];
      //     }
      //     for(let contributor of contributors) {
      //         contributor.text_full_name = contributor.fullName;
      //     }
      //     return contributors %>`,
      // },
  },
  funding: {
      querySource: "database",
      databaseQuery: {
          queryName: "listFundingBodies",
      },
      queryField: {
          property: "search",
          type: "text",
      },
      // resultObjectMapping: {
      //     "provider-name": "<%= _.get(record, 'metadata.provider-name', '') %>",
      //     "provider-id": "<%= _.get(record, 'metadata.provider-id', '') %>",
      // },
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
