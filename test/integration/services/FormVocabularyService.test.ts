import sinon from 'sinon';

const runLiveIntegrationTests = process.env.RUN_LIVE_INTEGRATION_TESTS === 'true';

describe('The FormVocabularyService', function () {
  let lookupStub: sinon.SinonStub | undefined;

  afterEach(function () {
    lookupStub?.restore();
    lookupStub = undefined;
  });

  it('Build a named query parameter map that includes both the search string and logged in user attributes', function (done) {
    const user = {
      id: 1,
      username: 'testuser',
      email: 'test@redboxresearchdata.com.au',
      roles: ['Guest', 'Researcher', 'Admin']
    };

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
    };

    const queryParamMap = FormVocabularyService.buildNamedQueryParamMap(queryConfig, 'test', user);
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
      roles: ['Guest', 'Researcher', 'Admin']
    };

    const queryConfig = {
      querySource: 'solr',
      searchQuery: {
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
    };
    const brand = {
      id: '1'
    };

    const solrQuery = (FormVocabularyService as any).buildSolrParams(brand, 'test', queryConfig, 1, 1, 'json', user);
    expect(solrQuery).to.be.instanceOf(URLSearchParams);
    expect(solrQuery.get('q')).to.equal('metaMetadata_type:rdmp');
    expect(solrQuery.get('sort')).to.equal('date_object_modified desc');
    expect(solrQuery.get('version')).to.equal('2.2');
    expect(solrQuery.get('start')).to.equal('1');
    expect(solrQuery.get('rows')).to.equal('1');
    expect(solrQuery.get('wt')).to.equal('json');
    expect(solrQuery.getAll('fq')).to.deep.equal([
      'metaMetadata_brandId:1',
      'title:test*',
      'userEmail:test@redboxresearchdata.com.au',
      'userRole:Guest,Researcher,Admin'
    ]);
    done();
  });

  it('resolves dataciteDois to DoiService.lookupDataciteDois and returns service lookup results in the required format', async function () {
    const brand = BrandingService.getDefault();
    const expectedResponse = {
      data: [
        {
          label: 'DataCite Test Record (10.5555/test-doi) - DataCite, 2024',
          value: '10.5555/test-doi',
          sourceType: 'service',
          raw: {
            id: '10.5555/test-doi',
            attributes: {
              doi: '10.5555/test-doi'
            }
          }
        }
      ],
      meta: {
        total: 1,
        start: 0,
        rows: 25,
        source: 'datacite'
      }
    };

    lookupStub = sinon.stub(sails.services.doiservice, 'lookupDataciteDois').resolves(expectedResponse);

    const response = await FormVocabularyService.findInServiceLookup('dataciteDois', {
      search: 'climate data',
      start: 0,
      rows: 25,
      branding: 'default',
      portal: 'rdmp',
      brand,
      user: {
        username: 'admin'
      }
    });

    expect(lookupStub.calledOnce).to.equal(true);
    const request = lookupStub.firstCall.args[0];
    expect(request).to.include({
      serviceId: 'dataciteDois',
      search: 'climate data',
      start: 0,
      rows: 25,
      branding: 'default',
      portal: 'rdmp'
    });
    expect(request.options).to.deep.include({
      baseUrl: 'https://api.datacite.org',
      timeoutMs: 10000,
      maxRows: 25,
      valueField: 'doi',
      includeRaw: true,
      allowEmptySearch: false
    });
    expect(request.options.defaultParams).to.deep.equal({
      'disable-facets': true,
      state: 'findable',
      sort: 'relevance'
    });
    expect(request.options.fields).to.deep.equal(['doi', 'titles', 'publisher', 'publicationYear', 'types', 'url']);

    expect(response).to.deep.equal(expectedResponse);
    expect(response.data[0]).to.include({
      label: 'DataCite Test Record (10.5555/test-doi) - DataCite, 2024',
      value: '10.5555/test-doi',
      sourceType: 'service'
    });
    expect(response.data[0].raw).to.deep.equal({
      id: '10.5555/test-doi',
      attributes: {
        doi: '10.5555/test-doi'
      }
    });
  });

  it('queries the live dataciteDois provider when live integration tests are enabled', async function () {
    this.timeout(60_000);

    if (!runLiveIntegrationTests) {
      this.skip();
    }

    const brand = BrandingService.getDefault();
    const response = await FormVocabularyService.findInServiceLookup('dataciteDois', {
      search: '10.5438/0014',
      start: 0,
      rows: 10,
      branding: 'default',
      portal: 'rdmp',
      brand,
      user: {
        username: 'admin'
      }
    });

    expect(response).to.be.an('object');
    expect(response.data).to.be.an('array').that.is.not.empty;
    expect(response.meta).to.be.an('object');
    expect(response.meta.source).to.equal('datacite');

    const matchingOption = response.data.find((option: Record<string, unknown>) => option.value === '10.5438/0014');
    expect(matchingOption, 'Expected DataCite DOI 10.5438/0014 to be returned').to.exist;
    expect(matchingOption).to.include({
      value: '10.5438/0014',
      sourceType: 'service'
    });
    expect(String(matchingOption.label ?? '')).to.contain('10.5438/0014');
    expect(matchingOption.raw).to.be.an('object');
  });
});
