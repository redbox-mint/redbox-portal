import assert from 'node:assert/strict';
import { createSinonStubLogger } from '../logger.test';

let expect: Chai.ExpectStatic;
import('chai').then(mod => (expect = mod.expect));
import * as sinon from 'sinon';
import { solr, SOLR_EXACT_ACL_FIELDS, SOLR_EXACT_ACL_VERSION } from '../../src/config/solr.config';
import type { SolrFieldDefinition, SolrCopyFieldDefinition } from '../../src/config/solr.config';
import { setupServiceTestGlobals, cleanupServiceTestGlobals, createMockSails } from './testHelper';

describe('SolrSearchService', function () {
  let mockSails: any;
  let SolrSearchService: any;
  let mockQueueService: any;

  beforeEach(function () {
    mockQueueService = {
      now: sinon.stub(),
    };

    mockSails = createMockSails({
      config: {
        appPath: '/app',
        solr: {
          cores: {
            default: {
              options: {
                host: 'localhost',
                port: 8983,
                core: 'redbox',
                https: false,
              },
              schema: {},
              initSchemaFlag: { name: '_schema_init_flag', type: 'string' },
              preIndex: {
                move: [{ source: 'metadata', dest: '' }],
                copy: [{ source: 'redboxOid', dest: 'storage_id' }],
                jsonString: [],
                template: [],
                flatten: {
                  options: { delimiter: '_', safe: true },
                  special: [],
                },
              },
            },
          },
          maxWaitTries: 3,
          waitTime: 1000,
          createOrUpdateJobName: 'SolrAddOrUpdate',
          deleteJobName: 'SolrDelete',
          clientSleepTimeMillis: 100,
        },
        queue: {
          serviceName: 'agendaqueueservice',
        },
      },
      log: createSinonStubLogger(sinon),
      services: {
        agendaqueueservice: mockQueueService,
      },
      on: sinon.stub(),
    });

    setupServiceTestGlobals(mockSails);
    (global as any).RecordsService = {
      getMeta: sinon.stub().resolves({}),
      hasEditAccess: sinon.stub().returns(true),
    };

    // Import after mocks are set up
    const { Services } = require('../../src/services/SolrSearchService');
    SolrSearchService = new Services.SolrSearchService();
    SolrSearchService.queueService = mockQueueService;
  });

  afterEach(function () {
    cleanupServiceTestGlobals();
    delete (global as any).RecordsService;
    sinon.restore();
  });

  function exactSchema(): {
    fields: SolrFieldDefinition[];
    fieldTypes: Array<{ name: string; class: string }>;
    dynamicFields: SolrFieldDefinition[];
    copyFields: SolrCopyFieldDefinition[];
  } {
    return {
      fields: [...structuredClone(SOLR_EXACT_ACL_FIELDS), mockSails.config.solr.cores.default.initSchemaFlag],
      fieldTypes: [{ name: 'string', class: 'solr.StrField' }],
      dynamicFields: [], copyFields: []
    };
  }

  describe('constructor', function() {
    it('should create instance with logHeader', function() {
      expect(SolrSearchService.logHeader).to.equal('SolrIndexer::');
    });

    it('should initialize clients as empty object', function () {
      expect(SolrSearchService.clients).to.be.an('object');
    });
  });

  describe('luceneEscape', function () {
    it('should escape special characters', function () {
      const result = (SolrSearchService as any).luceneEscape('test+query-with:special');

      expect(result).to.include('\\');
    });

    it('should escape brackets', function () {
      const result = (SolrSearchService as any).luceneEscape('test[1]');

      expect(result).to.include('\\[');
      expect(result).to.include('\\]');
    });

    it('should escape parentheses', function () {
      const result = (SolrSearchService as any).luceneEscape('test(value)');

      expect(result).to.include('\\(');
      expect(result).to.include('\\)');
    });

    it('should escape quotation marks', function () {
      const result = (SolrSearchService as any).luceneEscape('test"value"');

      expect(result).to.include('\\"');
    });

    it('should handle simple strings without special chars', function () {
      const result = (SolrSearchService as any).luceneEscape('simplestring');

      expect(result).to.equal('simplestring');
    });
  });

  describe('addAuthFilter', function () {
    it('should add authorization filter for username', function () {
      const url = 'http://localhost:8983/solr/redbox/select?q=*:*';
      const username = 'testuser';
      const roles = [{ name: 'Admin', branding: 'brand-1' }];
      const brand = { id: 'brand-1', name: 'default' };

      const result = new URL(SolrSearchService.addAuthFilter(url, username, roles, brand)).searchParams;

      expect(result.get('rbAclUser')).to.equal('testuser');
      expect(result.getAll('fq').join(' ')).to.include('f=redbox_acl2_edit v=$rbAclUser');
      expect(result.getAll('fq').join(' ')).to.include('f=redbox_acl2_view v=$rbAclUser');
    });

    it('should add role-based filters', function () {
      const url = 'http://localhost:8983/solr/redbox/select?q=*:*';
      const username = 'testuser';
      const roles = [
        { name: 'Admin', branding: 'brand-1' },
        { name: 'Researcher', branding: 'brand-1' },
      ];
      const brand = { id: 'brand-1', name: 'default' };

      const result = new URL(SolrSearchService.addAuthFilter(url, username, roles, brand)).searchParams;

      expect(result.getAll('fq').join(' ')).to.include('f=redbox_acl2_view_roles');
      expect(result.getAll('fq').join(' ')).to.include('f=redbox_acl2_edit_roles');
      expect(result.get('rbAclRole0')).to.equal('Admin');
      expect(result.get('rbAclRole1')).to.equal('Researcher');
    });

    it('should filter roles by brand', function () {
      const url = 'http://localhost:8983/solr/redbox/select?q=*:*';
      const username = 'testuser';
      const roles = [
        { name: 'Admin', branding: 'brand-1' },
        { name: 'OtherBrandRole', branding: 'brand-2' },
      ];
      const brand = { id: 'brand-1', name: 'default' };

      const result = new URL(SolrSearchService.addAuthFilter(url, username, roles, brand)).searchParams;

      expect(result.get('rbAclRole0')).to.equal('Admin');
      expect([...result.values()]).not.to.include('OtherBrandRole');
    });

    it('should exclude view access when editAccessOnly is true', function () {
      const url = 'http://localhost:8983/solr/redbox/select?q=*:*';
      const username = 'testuser';
      const roles = [{ name: 'Admin', branding: 'brand-1' }];
      const brand = { id: 'brand-1', name: 'default' };

      const result = new URL(SolrSearchService.addAuthFilter(url, username, roles, brand, true)).searchParams;

      expect(result.getAll('fq').join(' ')).to.include('f=redbox_acl2_edit');
      expect(result.getAll('fq').join(' ')).not.to.include('f=redbox_acl2_view');
    });

    it('should handle empty roles', function () {
      const url = 'http://localhost:8983/solr/redbox/select?q=*:*';
      const username = 'testuser';
      const roles: [] = [];
      const brand = { id: 'brand-1', name: 'default' };

      const result = new URL(SolrSearchService.addAuthFilter(url, username, roles, brand)).searchParams;

      expect(result.getAll('fq').join(' ')).to.include('f=redbox_acl2_edit v=$rbAclUser');
      expect(result.has('rbAclRole0')).to.equal(false);
    });

    it('replaces reserved URL parameters without losing filters, hashes or literal identity characters', function() {
      const input = new URL('http://localhost:8983/solr/redbox/select?q=*:*#retained');
      input.searchParams.append('fq', 'title:retained');
      input.searchParams.append('rbAclUser', '*');
      input.searchParams.append('rbAclUser', 'other');
      input.searchParams.append('rbAclBrand', 'other-brand');
      input.searchParams.append('rbAclRole99', 'Admin');
      const identity = 'A+B&fq=*:*#"\\$rbAclBrand';

      const result = new URL(SolrSearchService.addAuthFilter(input.toString(), identity, [], { id: 'brand-1' }));

      expect(result.hash).to.equal('#retained');
      expect(result.searchParams.getAll('rbAclUser')).to.deep.equal([identity]);
      expect(result.searchParams.getAll('rbAclBrand')).to.deep.equal(['brand-1']);
      expect(result.searchParams.has('rbAclRole99')).to.equal(false);
      expect(result.searchParams.getAll('fq')[0]).to.equal('title:retained');
      expect(result.searchParams.getAll('fq')).not.to.include('*:*');
    });
  });

  describe('addAuthParams', function () {
    it('should append the authorization filter as an fq param', function () {
      const params = new URLSearchParams();
      const roles = [{ name: 'Admin', branding: 'brand-1' }];
      const brand = { id: 'brand-1', name: 'default' };

      SolrSearchService.addAuthParams(params, 'testuser', roles, brand);

      const authFilters = params.getAll('fq');
      expect(authFilters).to.have.lengthOf(3);
      expect(authFilters[0]).to.equal('{!term f=redbox_acl2_version v=$rbAclVersion}');
      expect(authFilters[1]).to.equal('{!term f=redbox_acl2_brand v=$rbAclBrand}');
      expect(authFilters[2]).to.include('f=redbox_acl2_edit v=$rbAclUser');
      expect(authFilters[2]).to.include('f=redbox_acl2_view_roles v=$rbAclRole0');
      expect(params.get('rbAclRole0')).to.equal('Admin');
    });

    it('should not overwrite filters already collected', function () {
      const params = new URLSearchParams();
      params.append('fq', 'existing:filter');
      const brand = { id: 'brand-1', name: 'default' };

      SolrSearchService.addAuthParams(params, 'testuser', [], brand);

      expect(params.getAll('fq')).to.have.lengthOf(4);
      expect(params.getAll('fq')[0]).to.equal('existing:filter');
    });

    for (const identity of [
      'Alice.Example@Example.EDU', 'alice-example@example.edu', 'ALICE.EXAMPLE@example.edu',
      'administration-outsider-20261023', 'user with spaces', 'user,with,commas',
      'x" OR *:* OR authorization_view:x', '{!lucene v=*:*}', '$rbAclBrand',
      'x&fq=*:*&rbAclUser=admin', 'slash\\quote"+colon:?[x]!*', 'ユーザー'
    ]) {
      it(`keeps identity ${JSON.stringify(identity)} as literal parameter data`, function() {
        const params = new URLSearchParams();
        SolrSearchService.addAuthParams(params, identity, [], { id: 'brand-1' });

        expect(params.getAll('rbAclUser')).to.deep.equal([identity]);
        expect(params.getAll('fq')[2]).to.equal('{!lucene}(_query_:"{!term f=redbox_acl2_edit v=$rbAclUser}" OR _query_:"{!term f=redbox_acl2_view v=$rbAclUser}")');
      });
    }

    it('keeps case and punctuation in role and brand values and accepts either brand reference shape', function() {
      const params = new URLSearchParams();
      const brand = { id: 'Brand.A:* "' };
      SolrSearchService.addAuthParams(params, 'user', [
        { name: 'Review.Admin+Team', branding: brand.id },
        { name: 'review-admin team', branding: { id: brand.id } },
        { name: 'Other', branding: 'brand-a' },
        { name: 'Review.Admin+Team', branding: brand.id }
      ], brand);

      expect(params.get('rbAclBrand')).to.equal(brand.id);
      expect(params.get('rbAclRole0')).to.equal('Review.Admin+Team');
      expect(params.get('rbAclRole1')).to.equal('review-admin team');
      expect(params.has('rbAclRole2')).to.equal(false);
      expect(params.getAll('fq').join(' ')).not.to.include(brand.id);
      expect(params.getAll('fq').join(' ')).not.to.include('Review.Admin+Team');
    });

    it('requires declared Admin role membership in the document instead of bypassing ACLs', function() {
      const params = new URLSearchParams();
      SolrSearchService.addAuthParams(params, 'admin', [{ name: 'Admin', branding: 'brand-1' }], { id: 'brand-1' });

      expect(params.getAll('fq')).to.have.length(3);
      expect(params.getAll('fq')[2]).to.include('f=redbox_acl2_edit_roles v=$rbAclRole0');
      expect(params.getAll('fq')[2]).to.include('f=redbox_acl2_view_roles v=$rbAclRole0');
      expect(params.getAll('fq').join(' ')).not.to.include('*:*');
    });

    it('limits edit-only search to edit identity and edit roles', function() {
      const params = new URLSearchParams();
      SolrSearchService.addAuthParams(params, 'user', [{ name: 'Researcher', branding: 'brand-1' }], { id: 'brand-1' }, true);

      expect(params.getAll('fq')[2]).to.equal('{!lucene}(_query_:"{!term f=redbox_acl2_edit v=$rbAclUser}" OR _query_:"{!term f=redbox_acl2_edit_roles v=$rbAclRole0}")');
    });

    it('uses only the explicit guest identity and same-brand Guest role supplied by the caller', function() {
      const params = new URLSearchParams();
      SolrSearchService.addAuthParams(params, 'guest', [{ name: 'Guest', branding: 'brand-1' }], { id: 'brand-1' });

      expect(params.get('rbAclUser')).to.equal('guest');
      expect(params.get('rbAclRole0')).to.equal('Guest');
      expect(params.has('rbAclRole1')).to.equal(false);
      expect(params.getAll('fq')[2]).to.include('f=redbox_acl2_view v=$rbAclUser');
    });

    it('cannot create a grant from missing identity and empty roles', function() {
      const params = new URLSearchParams();
      SolrSearchService.addAuthParams(params, '', [], { id: 'brand-1' });

      expect(params.has('rbAclUser')).to.equal(false);
      expect(params.getAll('fq')).to.deep.equal([
        '{!term f=redbox_acl2_version v=$rbAclVersion}', '{!lucene}(*:* AND -(*:*))'
      ]);
    });

    it('fails closed for a missing brand even when a username and roles are supplied', function() {
      const params = new URLSearchParams();
      SolrSearchService.addAuthParams(params, 'user', [{ name: 'Admin', branding: '' }], { id: '' });

      expect(params.getAll('fq').at(-1)).to.equal('{!lucene}(*:* AND -(*:*))');
    });

    it('requires versioned exact fields without referring to legacy analyzed or pending grants', function() {
      const params = new URLSearchParams();
      SolrSearchService.addAuthParams(params, 'user', [{ name: 'Researcher', branding: 'brand-1' }], { id: 'brand-1' });

      expect(params.get('rbAclVersion')).to.equal(SOLR_EXACT_ACL_VERSION);
      const filters = params.getAll('fq').join(' ');
      expect(filters).not.to.match(/authorization_(?:view|edit|viewRoles|editRoles)(?:\s|:)/);
      expect(filters).not.to.include('_exact');
      expect(filters).not.to.include('authorization_exact_version');
      expect(filters).not.to.include('Pending');
      expect(filters).to.include('f=redbox_acl2_version');
    });

    it('overwrites reserved parameters in array input while preserving repeated independent filters', function() {
      const entries = [
        { key: 'fq', value: 'first:filter' }, { key: 'fq', value: 'second:filter' },
        { key: 'rbAclUser', value: '*' }, { key: 'rbAclVersion', value: '*' },
        { key: 'rbAclRole0', value: 'Admin' }
      ];
      SolrSearchService.addAuthParams(entries, 'actual', [], { id: 'brand-1' });
      const params = new URLSearchParams(entries.map(entry => [entry.key, entry.value]));

      expect(params.getAll('fq').slice(0, 2)).to.deep.equal(['first:filter', 'second:filter']);
      expect(params.getAll('rbAclUser')).to.deep.equal(['actual']);
      expect(params.getAll('rbAclVersion')).to.deep.equal([SOLR_EXACT_ACL_VERSION]);
      expect(params.has('rbAclRole0')).to.equal(false);
    });
  });

  describe('parseQueryFragment', function () {
    it('should treat a bare expression as the q param', function () {
      const params = (SolrSearchService as any).parseQueryFragment('metaMetadata_type:rdmp&rows=10');

      expect(params.get('q')).to.equal('metaMetadata_type:rdmp');
      expect(params.get('rows')).to.equal('10');
    });

    it('should strip a redundant q= prefix', function () {
      const params = (SolrSearchService as any).parseQueryFragment('q=*:*&wt=json');

      expect(params.get('q')).to.equal('*:*');
      expect(params.get('wt')).to.equal('json');
    });

    it('should preserve repeated filter params', function () {
      const params = (SolrSearchService as any).parseQueryFragment('*:*&fq=title:test*&fq=userEmail:a@b.com');

      expect(params.getAll('fq')).to.deep.equal(['title:test*', 'userEmail:a@b.com']);
    });

    it('should keep values that contain an equals sign intact', function () {
      const params = (SolrSearchService as any).parseQueryFragment('*:*&fq=note:a=b');

      expect(params.get('fq')).to.equal('note:a=b');
    });
  });

  describe('searchFuzzy', function () {
    const brand = { id: 'brand-1', name: 'default' };
    const user = { username: 'testuser' };

    beforeEach(async function() {
      sinon.stub(SolrSearchService, 'waitForSolr').resolves();
      sinon.stub(SolrSearchService, 'getSchema').resolves({ schema: exactSchema() });
      await SolrSearchService.buildSchema();
    });

    function stubAxiosGet() {
      return sinon.stub(require('axios'), 'get').resolves({
        data: { response: { numFound: 0, docs: [] } },
      });
    }

    it('should send every filter and facet field to solr', async function () {
      const axiosGet = stubAxiosGet();

      await SolrSearchService.searchFuzzy(
        'default',
        'rdmp',
        '',
        'search terms',
        [
          { name: 'title', value: 'first' },
          { name: 'owner', value: 'second' },
        ],
        [
          { name: 'workflow_stage', value: '' },
          { name: 'metaMetadata_type', value: 'rdmp' },
        ],
        brand,
        user,
        [],
        ['title'],
        0,
        10
      );

      const params: URLSearchParams = axiosGet.firstCall.args[1].params;
      expect(params).to.be.instanceOf(URLSearchParams);
      expect(params.getAll('facet.field')).to.deep.equal(['workflow_stage', 'metaMetadata_type']);
      // Two exact searches, one facet value, version, exact brand and ACL OR.
      expect(params.getAll('fq')).to.have.lengthOf(6);
      expect(params.getAll('fq')[0]).to.equal('title:first');
      expect(params.getAll('fq')[1]).to.equal('owner:second');
      expect(params.getAll('fq')[5]).to.include('f=redbox_acl2_edit v=$rbAclUser');
    });

    it('should build the q param from brand, type and search query', async function () {
      const axiosGet = stubAxiosGet();

      await SolrSearchService.searchFuzzy(
        'default',
        'rdmp',
        'draft',
        'search terms',
        [],
        [],
        brand,
        user,
        [],
        ['title'],
        0,
        10
      );

      const params: URLSearchParams = axiosGet.firstCall.args[1].params;
      expect(params.get('q')).to.equal(
        'metaMetadata_brandId:brand-1 AND metaMetadata_type:rdmp AND workflow_stage:draft AND full_text:search terms'
      );
    });

    it('preserves pagination and facet results with mandatory authorization outside user query syntax', async function() {
      const axiosGet = sinon.stub(require('axios'), 'get').resolves({ data: {
        response: { numFound: 2, docs: [{ title: 'Allowed result' }] },
        facet_counts: { facet_fields: { workflow_stage: ['draft', 2] } }
      } });

      const result = await SolrSearchService.searchFuzzy(
        'default', 'rdmp', '', '* OR *:*', [], [{ name: 'workflow_stage', value: '' }],
        brand, user, [], ['title'], 1, 1
      );

      const params: URLSearchParams = axiosGet.firstCall.args[1].params;
      expect(params.get('start')).to.equal('1');
      expect(params.get('rows')).to.equal('1');
      expect(params.getAll('fq')).to.have.length(3);
      expect(params.getAll('fq')[1]).to.equal('{!term f=redbox_acl2_brand v=$rbAclBrand}');
      expect(params.getAll('fq')[2]).not.to.include('* OR *:*');
      expect(result).to.deep.equal({
        records: [{ title: 'Allowed result', hasEditAccess: true }], totalItems: 2,
        facets: [{ name: 'workflow_stage', values: [{ value: 'draft', count: 2 }] }]
      });
    });
  });

  describe('searchAdvanced', function () {
    it('should pass the parsed query fragment to solr', async function () {
      const axiosGet = sinon.stub(require('axios'), 'get').resolves({ data: {} });

      await SolrSearchService.searchAdvanced('default', '', 'metaMetadata_type:rdmp&fq=title:a&fq=title:b');

      expect(axiosGet.firstCall.args[0]).to.equal('http://localhost:8983/solr/redbox/select');
      const params: URLSearchParams = axiosGet.firstCall.args[1].params;
      expect(params.get('q')).to.equal('metaMetadata_type:rdmp');
      expect(params.getAll('fq')).to.deep.equal(['title:a', 'title:b']);
    });

    it('should accept URLSearchParams directly', async function () {
      const axiosGet = sinon.stub(require('axios'), 'get').resolves({ data: {} });
      const query = new URLSearchParams([
        ['q', '*:*'],
        ['fq', 'title:a'],
      ]);

      await SolrSearchService.searchAdvanced('default', '', query);

      expect(axiosGet.firstCall.args[1].params).to.equal(query);
    });
  });

  describe('exact ACL schema readiness', function() {
    let schemaGet: sinon.SinonStub;
    let selectGet: sinon.SinonStub;
    let schemaPost: sinon.SinonStub;

    beforeEach(function() {
      sinon.stub(SolrSearchService, 'waitForSolr').resolves();
      schemaGet = sinon.stub(SolrSearchService, 'getSchema').resolves({ schema: exactSchema() });
      selectGet = sinon.stub(require('axios'), 'get').resolves({ data: { response: { numFound: 0, docs: [] } } });
      schemaPost = sinon.stub(require('axios'), 'post').resolves({ data: { responseHeader: { status: 0 } } });
    });

    function search(core = 'default') {
      return SolrSearchService.searchFuzzy(core, 'rdmp', '', '*', [], [], { id: 'brand-1' }, { username: 'user' }, [], ['title']);
    }

    async function expectNotReady(core = 'default') {
      const callsBefore = selectGet.callCount;
      let failure: unknown;
      try { await search(core); } catch (error) { failure = error; }
      expect(failure instanceof Error ? failure.message : failure).to.equal('Exact authorization search schema is not ready.');
      expect(selectGet.callCount).to.equal(callsBefore);
    }

    it('does not issue a search before the live schema has been verified', async function() {
      await expectNotReady();
    });

    it('allows search after verifying explicit exact fields and their non-analyzed field type', async function() {
      await SolrSearchService.buildSchema();
      await search();

      expect(schemaPost.called).to.equal(false);
      expect(selectGet.calledOnce).to.equal(true);
    });

    for (const required of SOLR_EXACT_ACL_FIELDS) {
      it(`stays closed when ${required.name} is missing even after an acknowledged schema update`, async function() {
        const schema = exactSchema();
        schema.fields = schema.fields.filter(field => field.name !== required.name);
        schemaGet.resolves({ schema });

        await assert.rejects(SolrSearchService.buildSchema());
        await expectNotReady();

        expect(schemaPost.calledOnce).to.equal(true);
        expect(schemaGet.calledTwice).to.equal(true);
      });
    }

    for (const conflict of [
      { type: 'text_general' }, { indexed: false }, { stored: false }, { multiValued: false }, { docValues: true }
    ]) {
      it(`stays closed for an exact ACL field conflict ${JSON.stringify(conflict)}`, async function() {
        const schema = exactSchema();
        schema.fields[0] = { ...schema.fields[0], ...conflict };
        schemaGet.resolves({ schema });

        await assert.rejects(SolrSearchService.buildSchema());
        await expectNotReady();

        expect(schemaPost.called).to.equal(false);
        expect(mockSails.log.error.calledWithMatch('Solr schema definition conflict')).to.equal(true);
      });
    }

    for (const fieldType of [undefined, { name: 'string', class: 'solr.TextField' }]) {
      it(`stays closed when the string field type is ${fieldType ? 'analyzed' : 'unverified'}`, async function() {
        const schema = exactSchema();
        schema.fieldTypes = fieldType ? [fieldType] : [];
        schemaGet.resolves({ schema });

        await assert.rejects(SolrSearchService.buildSchema());
        await expectNotReady();
      });
    }

    for (const required of SOLR_EXACT_ACL_FIELDS.filter(field => !field.multiValued)) {
      it(`stays closed if scalar ${required.name} has the catch-all multivalued layout`, async function() {
        const schema = exactSchema();
        const field = schema.fields.find(field => field.name === required.name);
        if (!field) throw new Error('Missing test schema field');
        field.multiValued = true;
        schemaGet.resolves({ schema });

        await assert.rejects(SolrSearchService.buildSchema());
        await expectNotReady();

        expect(schemaPost.called).to.equal(false);
      });
    }

    for (const destination of ['redbox_acl2_view', 'redbox_acl2_*', '*']) {
      it(`rejects copyField destination ${destination} that could add grants after the protected projection`, async function() {
        const schema = exactSchema();
        schema.copyFields = [{ source: 'untrusted_metadata', dest: destination }];
        schemaGet.resolves({ schema });

        await assert.rejects(SolrSearchService.buildSchema());
        await expectNotReady();
      });
    }

    it('verifies the schema again after adding exact fields to an existing legacy core', async function() {
      schemaGet.onFirstCall().resolves({ schema: { ...exactSchema(), fields: [] } });

      await SolrSearchService.buildSchema();
      await search();

      expect(schemaGet.calledTwice).to.equal(true);
      expect(schemaPost.calledOnce).to.equal(true);
      const additions: SolrFieldDefinition[] = schemaPost.firstCall.args[1]['add-field'];
      expect(additions.map(field => field.name)).to.include.members(SOLR_EXACT_ACL_FIELDS.map(field => field.name));
      expect(selectGet.calledOnce).to.equal(true);
    });

    it('revokes previous readiness when a later schema reconciliation fails', async function() {
      await SolrSearchService.buildSchema();
      schemaGet.rejects(new Error('schema unavailable'));

      await assert.rejects(SolrSearchService.buildSchema(), /schema unavailable/);
      await expectNotReady();
    });

    it('does not share schema readiness between configured cores', async function() {
      mockSails.config.solr.cores.other = structuredClone(mockSails.config.solr.cores.default);
      schemaGet.callsFake(async (core: string) => ({ schema: core === 'default' ? exactSchema() : { fields: [] } }));

      await assert.rejects(SolrSearchService.buildSchema());
      await search();
      await expectNotReady('other');

      expect(selectGet.calledOnce).to.equal(true);
    });
  });

  describe('index job schema startup gate', function() {
    let client: { add: sinon.SinonStub; commit: sinon.SinonStub; delete: sinon.SinonStub };
    let initClient: sinon.SinonStub;
    let schemaGet: sinon.SinonStub;
    let schemaPost: sinon.SinonStub;
    let buildSchema: sinon.SinonSpy;
    let preIndex: sinon.SinonSpy;

    function deferred<T>() {
      let resolve!: (value: T) => void;
      const promise = new Promise<T>(fulfil => { resolve = fulfil; });
      return { promise, resolve };
    }

    function nextTurn(): Promise<void> {
      return new Promise(resolve => setImmediate(resolve));
    }

    function job(id: string) {
      return { attrs: { data: {
        id, redboxOid: id, metaMetadata: { brandId: 'Brand.A' },
        authorization: { view: ['Owner+One'], edit: ['Editor.A'], viewRoles: [], editRoles: [] },
        metadata: { title: `Title ${id}` }
      } } };
    }

    function outcome(promise: Promise<unknown>): Promise<unknown> {
      return promise.then(() => undefined, (error: unknown) => error);
    }

    function expectNoIndexWork() {
      expect(preIndex.called).to.equal(false);
      expect(client.add.called).to.equal(false);
      expect(client.commit.called).to.equal(false);
      expect(client.delete.called).to.equal(false);
    }

    beforeEach(async function() {
      await SolrSearchService.processDynamicImports();
      client = { add: sinon.stub().resolves(), commit: sinon.stub().resolves(), delete: sinon.stub().resolves() };
      initClient = sinon.stub(SolrSearchService, 'initClient').callsFake(() => {
        SolrSearchService.clients.default = client;
      });
      sinon.stub(SolrSearchService, 'waitForSolr').resolves();
      schemaGet = sinon.stub(SolrSearchService, 'getSchema').resolves({ schema: exactSchema() });
      schemaPost = sinon.stub(require('axios'), 'post').resolves({ data: {} });
      // Any unmocked read transport would fail the test rather than use a service.
      sinon.stub(require('axios'), 'get').rejects(new Error('Unexpected read transport'));
      sinon.stub(SolrSearchService, 'clientSleep').resolves();
      buildSchema = sinon.spy(SolrSearchService, 'buildSchema');
      preIndex = sinon.spy(SolrSearchService, 'preIndex');
    });

    it('holds pre-ready concurrent add/delete jobs through schema update AND verification, then executes each once', async function() {
      const schemaWrite = deferred<{ data: object }>();
      const verifiedSchema = deferred<{ schema: ReturnType<typeof exactSchema> }>();
      schemaGet.onFirstCall().resolves({ schema: { ...exactSchema(), fields: [] } });
      schemaGet.onSecondCall().returns(verifiedSchema.promise);
      schemaPost.returns(schemaWrite.promise);
      const initialization = SolrSearchService.init();
      const first = job('queued-before-ready');
      const second = job('concurrent-job');
      const originalFirst = structuredClone(first);
      const originalSecond = structuredClone(second);

      // Agenda can invoke the handler before the asynchronous ready listener.
      const firstRun = SolrSearchService.solrAddOrUpdate(first);
      await nextTurn();
      expect(schemaPost.calledOnce).to.equal(true);
      expectNoIndexWork();

      const secondRun = SolrSearchService.solrAddOrUpdate(second);
      const deleteRun = SolrSearchService.solrDelete(job('delete-before-ready'));
      await nextTurn();
      expect(initClient.calledOnce).to.equal(true);
      expect(buildSchema.calledOnce).to.equal(true);
      expectNoIndexWork();

      schemaWrite.resolve({ data: { responseHeader: { status: 0 } } });
      await nextTurn();
      expect(schemaGet.calledTwice).to.equal(true);
      expectNoIndexWork();
      verifiedSchema.resolve({ schema: exactSchema() });
      await Promise.all([firstRun, secondRun, deleteRun, initialization]);

      expect(initClient.calledOnce).to.equal(true);
      expect(buildSchema.calledOnce).to.equal(true);
      expect(preIndex.calledTwice).to.equal(true);
      expect(client.add.callCount).to.equal(2);
      expect(client.delete.calledOnceWithExactly('id', 'delete-before-ready')).to.equal(true);
      expect(client.commit.callCount).to.equal(3);
      expect(client.add.getCalls().map(call => call.args[0].id)).to.deep.equal([first.attrs.data.id, second.attrs.data.id]);
      expect(client.add.firstCall.args[0]).to.include({ redbox_acl2_brand: 'Brand.A', redbox_acl2_version: SOLR_EXACT_ACL_VERSION });
      expect(client.add.firstCall.args[0].redbox_acl2_view).to.deep.equal(['Owner+One']);
      expect(first).to.deep.equal(originalFirst);
      expect(second).to.deep.equal(originalSecond);
    });

    it('lets a delete job initialize before ready without deadlock or early transport', async function() {
      const liveSchema = deferred<{ schema: ReturnType<typeof exactSchema> }>();
      schemaGet.returns(liveSchema.promise);
      const run = SolrSearchService.solrDelete(job('delete-starts-init'));
      await nextTurn();
      expect(initClient.calledOnce).to.equal(true);
      expectNoIndexWork();

      liveSchema.resolve({ schema: exactSchema() });
      await run;

      expect(preIndex.called).to.equal(false);
      expect(client.add.called).to.equal(false);
      expect(client.delete.calledOnceWithExactly('id', 'delete-starts-init')).to.equal(true);
      expect(client.commit.calledOnce).to.equal(true);
    });

    for (const failure of ['schema read failure', 'schema write failure', 'conflicting exact field', 'missing exact fields after update']) {
      it(`rejects retained add/delete jobs with no preprocessing or transport on ${failure}`, async function() {
        if (failure === 'schema read failure') schemaGet.rejects(new Error('Schema unavailable'));
        if (failure === 'schema write failure') {
          schemaGet.resolves({ schema: { ...exactSchema(), fields: [] } });
          schemaPost.rejects(new Error('Schema update refused'));
        }
        if (failure === 'conflicting exact field') {
          const schema = exactSchema();
          schema.fields[0].docValues = true;
          schemaGet.resolves({ schema });
        }
        if (failure === 'missing exact fields after update') {
          schemaGet.resolves({ schema: { ...exactSchema(), fields: [] } });
        }
        const pending = job('retained-failed-job');
        const original = structuredClone(pending);
        const initialization = outcome(SolrSearchService.init());

        const results = await Promise.all([
          outcome(SolrSearchService.solrAddOrUpdate(pending)),
          outcome(SolrSearchService.solrDelete(job('retained-delete'))),
          initialization
        ]);

        for (const result of results.slice(0, 2)) {
          expect(result).to.be.instanceOf(Error);
          if (!(result instanceof Error)) throw new Error('Expected rejected job');
          expect(result.message).to.match(/schema|Schema/);
        }
        expectNoIndexWork();
        expect(pending).to.deep.equal(original);
        // A later attempt can retry initialization, but remains closed on the same invalid schema.
        expect(await outcome(SolrSearchService.solrAddOrUpdate(pending))).to.be.instanceOf(Error);
        expect(initClient.calledTwice).to.equal(true);
        expect(buildSchema.calledTwice).to.equal(true);
        expectNoIndexWork();
      });
    }

    it('rejects indexing into an unverified core even when another core initialized successfully', async function() {
      const pending = job('unknown-core');
      Object.assign(pending.attrs.data.metaMetadata, { searchCore: 'other' });

      expect(await outcome(SolrSearchService.solrAddOrUpdate(pending))).to.be.instanceOf(Error);
      expectNoIndexWork();
    });

    for (const operation of ['add', 'commit', 'delete'] as const) {
      it(`propagates ${operation} transport failures to the queue instead of completing the job`, async function() {
        const error = new Error(`${operation} failed`);
        client[operation].rejects(error);
        const run = operation === 'delete'
          ? SolrSearchService.solrDelete(job('transport-failure'))
          : SolrSearchService.solrAddOrUpdate(job('transport-failure'));

        expect(await outcome(run)).to.equal(error);
        expect(client[operation].calledOnce).to.equal(true);
        expect(initClient.calledOnce).to.equal(true);
      });
    }

    it('returns false from the inline index fallback when schema verification fails', async function() {
      SolrSearchService.queueService = undefined;
      schemaGet.rejects(new Error('Schema unavailable'));

      const accepted = await SolrSearchService.index('inline-schema-failure', job('inline-schema-failure').attrs.data);

      expect(accepted).to.equal(false);
      expectNoIndexWork();
    });
  });

  describe('getBaseUrl', function() {
    it('should build HTTP URL', function() {
      const options = {
        host: 'localhost',
        port: 8983,
        https: false,
      };

      const result = (SolrSearchService as any).getBaseUrl(options);

      expect(result).to.equal('http://localhost:8983/solr/');
    });

    it('should build HTTPS URL', function () {
      const options = {
        host: 'solr.example.com',
        port: 443,
        https: true,
      };

      const result = (SolrSearchService as any).getBaseUrl(options);

      expect(result).to.equal('https://solr.example.com:443/solr/');
    });
  });

  describe('index', function () {
    it('should acknowledge a queued indexing job', async function () {
      const data: any = {
        metadata: { title: 'Test Record' },
        metaMetadata: { brandId: 'brand-1' },
      };

      expect(await SolrSearchService.index('record-123', data)).to.equal(true);

      expect(mockQueueService.now.called).to.be.true;
      expect(mockQueueService.now.firstCall.args[0]).to.equal('SolrAddOrUpdate');
    });

    it('should set id on data before queueing', async function () {
      const data: any = {
        metadata: { title: 'Test' },
      };

      await SolrSearchService.index('my-oid', data);

      expect(data.id).to.equal('my-oid');
    });

    it('should run inline when queue service is unavailable', async function () {
      const solrAddOrUpdateStub = sinon.stub(SolrSearchService, 'solrAddOrUpdate').resolves();
      SolrSearchService.queueService = undefined;
      const data: any = {
        metadata: { title: 'Inline Test' },
      };

      expect(await SolrSearchService.index('inline-oid', data)).to.equal(true);

      expect(solrAddOrUpdateStub.calledOnce).to.be.true;
      expect(solrAddOrUpdateStub.firstCall.args[0].attrs.data.id).to.equal('inline-oid');
    });

    it('does not acknowledge a failed queue submission', async function () {
      mockQueueService.now.rejects(new Error('queue unavailable'));

      expect(await SolrSearchService.index('record-123', { metadata: {} })).to.equal(false);
      expect(mockSails.log.error.called).to.equal(true);
    });
  });

  describe('remove', function () {
    it('should queue delete job', function () {
      SolrSearchService.remove('record-123');

      expect(mockQueueService.now.called).to.be.true;
      expect(mockQueueService.now.firstCall.args[0]).to.equal('SolrDelete');
    });

    it('should pass id in job data', function () {
      SolrSearchService.remove('record-456');

      const jobData = mockQueueService.now.firstCall.args[1];
      expect(jobData.id).to.equal('record-456');
    });

    it('should run delete inline when queue service is unavailable', function () {
      const solrDeleteStub = sinon.stub(SolrSearchService, 'solrDelete').resolves();
      SolrSearchService.queueService = undefined;

      SolrSearchService.remove('record-inline-delete');

      expect(solrDeleteStub.calledOnce).to.be.true;
      expect(solrDeleteStub.firstCall.args[0].attrs.data.id).to.equal('record-inline-delete');
    });
  });

  describe('preIndex', function () {
    beforeEach(async function () {
      await SolrSearchService.processDynamicImports();
    });

    it('flattens and moves metadata while copying the storage identifier', function () {
      const result = SolrSearchService.preIndex({
        redboxOid: 'record-123',
        metadata: { title: 'Test record', creator: { name: 'Researcher' } },
      });

      expect(result).to.deep.equal({
        redboxOid: 'record-123', storage_id: 'record-123',
        title: 'Test record', creator_name: 'Researcher',
        redbox_acl2_view: [], redbox_acl2_edit: [],
        redbox_acl2_view_roles: [], redbox_acl2_edit_roles: [],
        redbox_acl2_version: SOLR_EXACT_ACL_VERSION
      });
    });

    it('strips the retired poisoned fields without using them to grant fresh permissions', function() {
      const retired = {
        authorization_view_exact: ['retired-user'], authorization_edit_exact: ['retired-editor'],
        authorization_viewRoles_exact: ['retired-role'], authorization_editRoles_exact: ['Admin'],
        metaMetadata_brandId_exact: 'retired-brand', authorization_exact_version: '1'
      };
      const result = SolrSearchService.preIndex({
        ...retired, metadata: { ...retired, title: 'Keep title' },
        authorization: { view: ['actual-user'], edit: [], viewRoles: [], editRoles: [] },
        metaMetadata: { brandId: 'actual-brand' }
      });

      for (const field of Object.keys(retired)) expect(result).not.to.have.property(field);
      expect(result.redbox_acl2_view).to.deep.equal(['actual-user']);
      expect(result.redbox_acl2_edit_roles).to.deep.equal([]);
      expect(result.redbox_acl2_brand).to.equal('actual-brand');
      expect(result.redbox_acl2_version).to.equal('1');
      expect(result.title).to.equal('Keep title');
    });

    it('projects exact ACL arrays from the protected envelope after conflicting move/copy/template/flatten transforms', function() {
      mockSails.config.solr.cores.default = structuredClone(solr.cores.default);
      const preIndex = mockSails.config.solr.cores.default.preIndex;
      preIndex.copy.push({ source: 'metadata.spoof', dest: 'redbox_acl2_view' });
      preIndex.template = [
        { dest: 'redbox_acl2_edit', template: 'intruder-template' },
        { dest: 'redbox_acl2_brand', template: 'other-brand' },
        { dest: 'redbox_acl2_version', template: 'spoof-version' }
      ];
      preIndex.flatten.special.push({
        source: 'metadata.spoof', dest: 'redbox_acl2_view_roles', options: { safe: true, delimiter: '_' }
      });
      const data = {
        redboxOid: 'record-exact-acl',
        metaMetadata: { brandId: 'Brand.A' },
        authorization: {
          view: ['Creator.A@example.edu', 'creator-a@example.edu'], edit: ['Editor+One'],
          viewRoles: ['Review.Team'], editRoles: ['Admin'],
          viewPending: ['pending-user'], editPending: ['pending-editor']
        },
        metadata: {
          title: 'Keep title', spoof: ['intruder'],
          authorization: { view: ['intruder'] },
          redbox_acl2_edit_roles: ['Everyone'], redbox_acl2_brand: 'other-brand'
        }
      };
      const original = structuredClone(data);

      const result = SolrSearchService.preIndex(data);

      expect(result.redbox_acl2_view).to.deep.equal(data.authorization.view);
      expect(result.redbox_acl2_edit).to.deep.equal(data.authorization.edit);
      expect(result.redbox_acl2_view_roles).to.deep.equal(data.authorization.viewRoles);
      expect(result.redbox_acl2_edit_roles).to.deep.equal(data.authorization.editRoles);
      expect(result.redbox_acl2_brand).to.equal('Brand.A');
      expect(result.redbox_acl2_version).to.equal(SOLR_EXACT_ACL_VERSION);
      expect(result.title).to.equal('Keep title');
      expect(data).to.deep.equal(original);
      result.redbox_acl2_view.push('not-a-source-mutation');
      expect(data.authorization.view).to.deep.equal(original.authorization.view);
    });

    it('snapshots the protected ACL before a configured template can mutate its source array', function() {
      mockSails.config.solr.cores.default.preIndex.template = [{
        source: 'authorization.view', dest: 'template_output', template: '<% data.push("intruder") %>done'
      }];
      const data = { authorization: { view: ['owner'] }, metaMetadata: { brandId: 'brand-1' }, metadata: {} };

      const result = SolrSearchService.preIndex(data);

      expect(result.redbox_acl2_view).to.deep.equal(['owner']);
      expect(result.template_output).to.equal('done');
    });

    it('keeps legacy scalar ACL identities exact and rejects malformed non-string grants', function() {
      const result = SolrSearchService.preIndex({
        authorization: {
          view: 'Owner.With+Punctuation', edit: ['EDITOR', 'editor', null, 42, { name: 'intruder' }],
          viewRoles: ['Review.Team', 'review-team'], editRoles: false
        },
        metaMetadata: { brandId: 'Brand.A' }, metadata: {}
      });

      expect(result.redbox_acl2_view).to.deep.equal(['Owner.With+Punctuation']);
      expect(result.redbox_acl2_edit).to.deep.equal(['EDITOR', 'editor']);
      expect(result.redbox_acl2_view_roles).to.deep.equal(['Review.Team', 'review-team']);
      expect(result.redbox_acl2_edit_roles).to.deep.equal([]);
      expect(result.redbox_acl2_brand).to.equal('Brand.A');
    });

    it('cannot generate permissions or brand membership solely from metadata collisions or pending lists', function() {
      const result = SolrSearchService.preIndex({
        authorization: { viewPending: ['pending'], editPending: ['pending'] },
        metadata: {
          redbox_acl2_view: ['intruder'], redbox_acl2_edit: ['intruder'],
          redbox_acl2_view_roles: ['Admin'], redbox_acl2_edit_roles: ['Admin'],
          redbox_acl2_brand: 'brand-1', redbox_acl2_version: 'spoof'
        }
      });

      for (const field of ['redbox_acl2_view', 'redbox_acl2_edit', 'redbox_acl2_view_roles', 'redbox_acl2_edit_roles']) {
        expect(result[field]).to.deep.equal([]);
      }
      expect(result).not.to.have.property('redbox_acl2_brand');
      expect(result.redbox_acl2_version).to.equal(SOLR_EXACT_ACL_VERSION);
    });

    it('normalizes flattened date fields to UTC without changing other fields or the source record', function() {
      const data = {
        metadata: {
          date: {
            positiveOffset: '2026-09-24T14:30:00+10:00',
            negativeOffset: '2026-09-23T23:30:00-05:00',
            utc: '2026-09-24T04:30:00.123Z',
            noOffset: '2026-09-24T04:30:00',
            dateOnly: '2026-09-24',
            basicDate: '20260924',
            basicTimestamp: '20260924T143000+1000',
            native: new Date('2026-09-24T14:30:00+10:00'),
          },
          title: '2026-09-24T14:30:00+10:00',
        },
      };

      const result = SolrSearchService.preIndex(data);

      expect(result).to.include({
        date_positiveOffset: '2026-09-24T04:30:00.000Z',
        date_negativeOffset: '2026-09-24T04:30:00.000Z',
        date_utc: '2026-09-24T04:30:00.123Z',
        date_noOffset: '2026-09-24T04:30:00.000Z',
        date_dateOnly: '2026-09-24T00:00:00.000Z',
        date_basicDate: '2026-09-24T00:00:00.000Z',
        date_basicTimestamp: '2026-09-24T04:30:00.000Z',
        date_native: '2026-09-24T04:30:00.000Z',
        title: data.metadata.title,
      });
      expect(data.metadata.date.positiveOffset).to.equal('2026-09-24T14:30:00+10:00');
      expect(data.metadata.date.native).to.be.instanceOf(Date);
    });

    it('normalizes every date in arrays, including nested arrays', function () {
      const dates = [
        '2026-09-24T14:30:00+10:00',
        new Date('2026-09-23T23:30:00-05:00'),
        ['2026-09-24T04:30:00Z', null, 42, 'invalid'],
      ];

      const result = SolrSearchService.preIndex({ metadata: { date_events: dates, date_empty: [] } });

      expect(result.date_events).to.deep.equal([
        '2026-09-24T04:30:00.000Z',
        '2026-09-24T04:30:00.000Z',
        ['2026-09-24T04:30:00.000Z', null, 42, 'invalid'],
      ]);
      expect(result.date_empty).to.deep.equal([]);
      expect(dates[0]).to.equal('2026-09-24T14:30:00+10:00');
    });

    it('normalizes numbered date fields using the production default core configuration', function () {
      mockSails.config.solr.cores.default = structuredClone(solr.cores.default);
      const data = {
        redboxOid: 'record-123',
        metaMetadata: { createdOn: '2026-09-24T14:30:00+10:00' },
        lastSaveDate: '2026-09-24T14:45:00+10:00',
        metadata: {
          date_events: ['2026-09-24T14:30:00+10:00', new Date('2026-09-23T23:30:00-05:00'), '2024', 'invalid', null],
          title: '2026-09-24T14:30:00+10:00',
          finalKeywords: ['Dates', 'UTC'],
        },
      };
      const original = structuredClone(data);

      const result = SolrSearchService.preIndex(data);

      expect(result).to.include({
        'date_events.0': '2026-09-24T04:30:00.000Z',
        'date_events.1': '2026-09-24T04:30:00.000Z',
        'date_events.2': '2024',
        'date_events.3': 'invalid',
        'date_events.4': null,
        date_object_created: '2026-09-24T04:30:00.000Z',
        date_object_modified: '2026-09-24T04:45:00.000Z',
        title: data.metadata.title,
      });
      expect(result).not.to.have.property('date_events');
      expect(result.finalKeywords).to.deep.equal(['Dates', 'UTC']);
      expect(data).to.deep.equal(original);
    });

    it('preserves invalid dates and non-date values', function () {
      const result = SolrSearchService.preIndex({
        metadata: {
          date_invalid: 'not-a-date',
          date_empty: '',
          date_null: null,
          date_number: 42,
          date_boolean: false,
          date_undefined: undefined,
          date_invalidCalendar: '2026-02-30T10:30:00+10:00',
          date_invalidNative: new Date(NaN),
        },
      });

      expect(result).to.include({
        date_invalid: 'not-a-date',
        date_empty: '',
        date_null: null,
        date_number: 42,
        date_boolean: false,
        date_undefined: undefined,
        date_invalidCalendar: '2026-02-30T10:30:00+10:00',
      });
      expect(result.date_invalidNative).to.be.instanceOf(Date);
      expect(Number.isNaN(result.date_invalidNative.getTime())).to.equal(true);
    });

    for (const value of ['10:30', '10:30:00+10:00', '2024', '2024-09', '202409', '2024-09T10:30', '2024-W39']) {
      it(`preserves incomplete date ${value} in scalar and array fields`, function () {
        const result = SolrSearchService.preIndex({ metadata: { date_incomplete: value, date_array: [value] } });

        expect(result.date_incomplete).to.equal(value);
        expect(result.date_array).to.deep.equal([value]);
      });
    }

    it('normalizes dates produced by templates and special flattening', function () {
      const preIndex = mockSails.config.solr.cores.default.preIndex;
      preIndex.template = [{ source: 'metadata.modified', dest: 'date_modified', template: '<%= data %>' }];
      preIndex.flatten.special = [
        {
          field: 'events',
          source: 'metadata.events',
          dest: 'date_events',
          options: { delimiter: '_', safe: true },
        },
      ];

      const result = SolrSearchService.preIndex({
        metadata: {
          modified: '2026-09-24T14:30:00+10:00',
          events: { start: '2026-09-23T23:30:00-05:00' },
        },
      });

      expect(result.date_modified).to.equal('2026-09-24T04:30:00.000Z');
      expect(result.date_events_start).to.equal('2026-09-24T04:30:00.000Z');
      expect(result).not.to.have.property('events_start');
    });

    it('converts configured objects to JSON and removes empty keys', function () {
      mockSails.config.solr.cores.default.preIndex.jsonString = [{ source: 'metadata.details', dest: 'details_json' }];

      const result = SolrSearchService.preIndex({ metadata: { details: { title: 'Test' }, '': 'remove me' } });

      expect(result.details_json).to.equal('{"title":"Test"}');
      expect(result).not.to.have.property('');
    });
  });

  describe('initClient', function () {
    it('should initialize clients for all cores', function () {
      (SolrSearchService as any).initClient();

      expect(SolrSearchService.clients).to.have.property('default');
    });
  });

  describe('buildSchema', function () {
    const configuredSchema = {
      'add-field': [{ name: 'title', type: 'string', indexed: true, stored: true, multiValued: false }],
      'add-dynamic-field': [
        { name: 'date_*', type: 'pdate', indexed: true, stored: true },
        { name: '*', type: 'string', indexed: true, stored: true, multiValued: true },
      ],
      'add-copy-field': [{ source: '*', dest: 'title' }],
    };

    function prepareSchemaReconciliation(liveSchema: Record<string, unknown>) {
      mockSails.config.solr.cores.default.schema = configuredSchema;
      mockSails.config.solr.cores.default.initSchemaFlag = {
        name: 'schema_initialised',
        type: 'string',
        indexed: false,
        stored: false,
      };
      sinon.stub(SolrSearchService, 'waitForSolr').resolves();
      const axios = require('axios');
      const get = sinon.stub(axios, 'get').resolves({ data: { schema: {
        ...liveSchema,
        fieldTypes: [{ name: 'string', class: 'solr.StrField' }],
        fields: [...((liveSchema.fields as object[]) || []), ...SOLR_EXACT_ACL_FIELDS.filter(required =>
          !((liveSchema.fields as Array<{name: string}>) || []).some(field => field.name === required.name))],
      } } });
      get.onFirstCall().resolves({ data: { schema: liveSchema } });
      return sinon.stub(axios, 'post').resolves({ data: { responseHeader: { status: 0 } } });
    }

    it('adds all configured definitions to an empty schema', async function () {
      const post = prepareSchemaReconciliation({ fields: [], dynamicFields: [], copyFields: [] });

      await SolrSearchService.buildSchema();

      expect(post.calledOnce).to.equal(true);
      const payload = post.firstCall.args[1];
      expect(payload['add-field'].map((field: { name: string }) => field.name)).to.deep.equal([
        'title', ...SOLR_EXACT_ACL_FIELDS.map(field => field.name), 'schema_initialised'
      ]);
      expect(payload['add-dynamic-field'].map((field: { name: string }) => field.name)).to.deep.equal(['date_*', '*']);
      expect(payload['add-copy-field']).to.deep.equal([{ source: '*', dest: 'title' }]);
    });

    it('adds the catch-all field when the legacy initialization flag is present', async function () {
      const post = prepareSchemaReconciliation({
        fields: [{ name: 'schema_initialised', type: 'string', indexed: false, stored: false }],
        dynamicFields: [{ name: 'date_*', type: 'pdate', indexed: true, stored: true }],
        copyFields: [],
      });

      await SolrSearchService.buildSchema();

      expect(post.calledOnce).to.equal(true);
      expect(post.firstCall.args[1]['add-dynamic-field']).to.deep.equal([configuredSchema['add-dynamic-field'][1]]);
    });

    it('does not post when all definitions already exist', async function () {
      const post = prepareSchemaReconciliation({
        fields: [configuredSchema['add-field'][0], ...structuredClone(SOLR_EXACT_ACL_FIELDS), { name: 'schema_initialised', type: 'string', indexed: false, stored: false }],
        fieldTypes: [{ name: 'string', class: 'solr.StrField' }],
        dynamicFields: configuredSchema['add-dynamic-field'],
        copyFields: configuredSchema['add-copy-field'],
      });

      await SolrSearchService.buildSchema();

      expect(post.called).to.equal(false);
    });

    it('requests effective schema defaults before declaring exact fields ready', async function() {
      prepareSchemaReconciliation({ ...exactSchema(), dynamicFields: configuredSchema['add-dynamic-field'] });

      await SolrSearchService.buildSchema();

      expect(require('axios').get.firstCall.args[0]).to.equal('http://localhost:8983/solr/redbox/schema?wt=json&showDefaults=true');
    });

    it('adds only fresh fields while preserving incompatible retired definitions', async function() {
      const retiredFields = [
        'authorization_view_exact', 'authorization_edit_exact', 'authorization_viewRoles_exact',
        'authorization_editRoles_exact', 'metaMetadata_brandId_exact', 'authorization_exact_version'
      ].map(name => ({ name, type: 'string', indexed: true, stored: true, multiValued: true, docValues: true }));
      const snapshot = structuredClone(retiredFields);
      const post = prepareSchemaReconciliation({ fields: retiredFields, dynamicFields: [], copyFields: [] });

      await SolrSearchService.buildSchema();

      const payload = post.firstCall.args[1];
      const additions: SolrFieldDefinition[] = payload['add-field'];
      expect(additions.filter(field => field.name.startsWith('redbox_acl2_'))).to.deep.equal(SOLR_EXACT_ACL_FIELDS);
      expect(additions.some(field => retiredFields.some(retired => retired.name === field.name))).to.equal(false);
      expect(Object.keys(payload)).to.have.members(['add-field', 'add-dynamic-field', 'add-copy-field']);
      expect(retiredFields).to.deep.equal(snapshot);
    });

    it('reports conflicts without replacing existing fields', async function() {
      const post = prepareSchemaReconciliation({
        fields: [{ name: 'title', type: 'pdate', indexed: true, stored: true, multiValued: false }, ...structuredClone(SOLR_EXACT_ACL_FIELDS)],
        fieldTypes: [{ name: 'string', class: 'solr.StrField' }],
        dynamicFields: configuredSchema['add-dynamic-field'],
        copyFields: configuredSchema['add-copy-field'],
      });

      await SolrSearchService.buildSchema();

      expect(post.calledOnce).to.equal(true);
      expect(post.firstCall.args[1]['add-field']).to.deep.equal([
        { name: 'schema_initialised', type: 'string', indexed: false, stored: false },
      ]);
      expect(mockSails.log.error.calledWithMatch('Solr schema definition conflict')).to.equal(true);
    });

    it('does not duplicate initialization fields across reconciliations', async function () {
      const post = prepareSchemaReconciliation({ fields: [], dynamicFields: [], copyFields: [] });

      await SolrSearchService.buildSchema();
      await SolrSearchService.buildSchema();

      expect(
        post.firstCall.args[1]['add-field'].filter((field: { name: string }) => field.name === 'schema_initialised')
      ).to.have.length(1);
      expect(mockSails.config.solr.cores.default.schema['add-field']).to.have.length(1);
    });
  });

  describe('clientSleep', function () {
    it('should resolve immediately when no sleep time configured', async function () {
      mockSails.config.solr.clientSleepTimeMillis = undefined;

      const start = Date.now();
      await (SolrSearchService as any).clientSleep();
      const elapsed = Date.now() - start;

      expect(elapsed).to.be.lessThan(50);
    });

    it('should sleep for configured time', async function () {
      mockSails.config.solr.clientSleepTimeMillis = 50;

      const start = Date.now();
      await (SolrSearchService as any).clientSleep();
      const elapsed = Date.now() - start;

      expect(elapsed).to.be.at.least(40);
    });
  });

  describe('exports', function () {
    it('should export all public methods', function () {
      const exported = SolrSearchService.exports();

      expect(exported).to.have.property('index');
      expect(exported).to.have.property('remove');
      expect(exported).to.have.property('searchFuzzy');
      expect(exported).to.have.property('solrAddOrUpdate');
      expect(exported).to.have.property('solrDelete');
      expect(exported).to.have.property('searchAdvanced');
      expect(exported).to.have.property('preIndex');
    });
  });
});

// Test the SolrClient class separately
describe('SolrClient', function () {
  let SolrClient: any;
  let mockAxios: any;

  beforeEach(function () {
    // Access the SolrClient class through the module
    const mockSails = createMockSails({});
    setupServiceTestGlobals(mockSails);
    (global as any).RecordsService = {};
  });

  afterEach(function () {
    cleanupServiceTestGlobals();
    delete (global as any).RecordsService;
    sinon.restore();
  });

  describe('constructor', function () {
    it('should create axios instance with correct base URL', function () {
      // Test through service initialization
      const mockSails = createMockSails({
        config: {
          solr: {
            cores: {
              default: {
                options: {
                  host: 'localhost',
                  port: 8983,
                  core: 'redbox',
                  https: false,
                },
                initSchemaFlag: { name: 'flag' },
                preIndex: { move: [], copy: [], jsonString: [], template: [], flatten: { options: {}, special: [] } },
              },
            },
          },
          queue: { serviceName: 'agendaqueueservice' },
        },
        services: { agendaqueueservice: { now: sinon.stub() } },
      });
      setupServiceTestGlobals(mockSails);

      const { Services } = require('../../src/services/SolrSearchService');
      const service = new Services.SolrSearchService();
      (service as any).initClient();

      expect(service.clients.default).to.exist;
    });
  });
});
