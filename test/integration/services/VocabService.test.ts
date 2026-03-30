

describe('The VocabService', function () {
  before(function (done) {
    done();
  });


  it('Build a named query parameter map that includes both the search string and logged in user attributes', function (done) {
    const user = {
      id: 1,
      username: 'testuser',
      email: 'test@redboxresearchdata.com.au',
      roles: ['Guest','Researcher','Admin']};

      const queryConfig = {
        querySource: 'database',
        databaseQuery: 'test',
        queryField: {
          property: 'title',
          type: 'string'
        },
        userQueryFields: [
          {
            property: 'userEmail',
            userValueProperty: 'email'
          },
          {
            property: 'userRole',
            userValueProperty: 'roles'
          }
        ]
      }
      
      const queryParamMap = VocabService.buildNamedQueryParamMap(queryConfig, 'test', user);
      expect(queryParamMap).to.be.an('object');
      expect(queryParamMap).to.have.property('userEmail');
      expect(queryParamMap.userEmail).to.equal(user.email);
      expect(queryParamMap).to.have.property('userRole');
      expect(queryParamMap.userRole).to.equal(user.roles);
      
      done();
  });

  it('Build a solr query that includes both the search string and logged in user attributes', function (done) {
    const user = {
      id: 1,
      username: 'testuser',
      email: 'test@redboxresearchdata.com.au',
      roles: ['Guest','Researcher','Admin']};

      const queryConfig = {
        querySource: 'solr',
        searchQuery:{
          baseQuery: 'metaMetadata_type:rdmp'
        },
        queryField: {
          property: 'title',
          type: 'text'
        },
        userQueryFields: [
          {
            property: 'userEmail',
            userValueProperty: 'email'
          },
          {
            property: 'userRole',
            userValueProperty: 'roles'
          }
        ]
      }
      const brand ={
        id: "1"
      }
      
      const solrQuery = VocabService.buildSolrParams(brand, 'test',queryConfig, 1, 1, 'json', user);
      expect(solrQuery).to.equal('metaMetadata_type:rdmp&sort=date_object_modified desc&version=2.2&start=1&rows=1&fq=metaMetadata_brandId:1&wt=json&fq=title:test*&fq=userEmail:test@redboxresearchdata.com.au&fq=userRole:Guest,Researcher,Admin');
      done();
  });

 
});
