let expect: Chai.ExpectStatic;
import("chai").then(mod => expect = mod.expect);
import * as sinon from 'sinon';
import { setupServiceTestGlobals, cleanupServiceTestGlobals, createMockSails, createQueryObject } from './testHelper';
import { of } from 'rxjs';

describe('NamedQueryService', function() {
  let mockSails: any;
  let NamedQueryService: any;
  let NamedQueryConfig: any;
  let mockNamedQuery: any;
  let mockUser: any;
  let mockRecord: any;
  let mockRelatedRecordModel: any;
  let mockRecordsService: any;

  beforeEach(function() {
    mockSails = createMockSails({
      config: {
        appPath: '/app',
        namedQuery: {
          'test-query': {
            mongoQuery: { type: 'test' },
            queryParams: {},
            collectionName: 'record',
            resultObjectMapping: {},
            brandIdFieldPath: 'branding'
          }
        },
        appmode: {
          bootstrapAlways: false
        }
      },
      log: {
        verbose: sinon.stub(),
        debug: sinon.stub(),
        info: sinon.stub(),
        warn: sinon.stub(),
        error: sinon.stub()
      },
      models: {}
    });

    mockNamedQuery = {
      find: sinon.stub().returns(createQueryObject([])),
      findOne: sinon.stub().resolves(null),
      create: sinon.stub().returns(createQueryObject({})),
      destroyOne: sinon.stub().resolves({})
    };

    mockUser = {
      count: sinon.stub().returns({ meta: sinon.stub().resolves(0) }),
      find: sinon.stub().returns({ meta: sinon.stub().resolves([]) })
    };

    mockRecord = {
      count: sinon.stub().returns({ meta: sinon.stub().resolves(0) }),
      find: sinon.stub().returns({ meta: sinon.stub().resolves([]) })
    };

    mockRelatedRecordModel = {
      count: sinon.stub().returns({ meta: sinon.stub().resolves(0) }),
      find: sinon.stub().returns({ meta: sinon.stub().resolves([]) })
    };

    mockRecordsService = {
      getRelatedRecords: sinon.stub().resolves({ rootOid: 'oid-1', edges: [], relatedObjects: {}, omittedByAccess: {} })
    };

    mockSails.services = {
      recordsservice: mockRecordsService
    };

    setupServiceTestGlobals(mockSails);
    (global as any).NamedQuery = mockNamedQuery;
    (global as any).User = mockUser;
    (global as any).Record = mockRecord;

    mockSails.models = {
      user: mockUser,
      record: mockRecord,
      relatedmodel: mockRelatedRecordModel,
      custommodel: {
        count: sinon.stub().returns({ meta: sinon.stub().resolves(1) }),
        find: sinon.stub().returns({ meta: sinon.stub().resolves([{ id: 'custom-1', name: 'Custom Record' }]) })
      }
    };

    const module = require('../../src/services/NamedQueryService');
    const { Services } = module;
    NamedQueryConfig = module.NamedQueryConfig;
    NamedQueryService = new Services.NamedQueryService();
  });

  afterEach(function() {
    cleanupServiceTestGlobals();
    delete (global as any).NamedQuery;
    delete (global as any).User;
    delete (global as any).Record;
    sinon.restore();
  });

  describe('bootstrap', function() {
    it('should create named queries for brand if none exist', async function() {
      const defBrand = { id: 'brand-1' };
      mockNamedQuery.find.returns(createQueryObject([]));
      
      sinon.stub(NamedQueryService, 'create').returns(of({}));
      
      await NamedQueryService.bootstrap(defBrand);
      
      expect(NamedQueryService.create.called).to.be.true;
    });

    it('should skip creation if queries exist', async function() {
      const defBrand = { id: 'brand-1' };
      mockNamedQuery.find.returns(createQueryObject([{ id: 'existing' }]));
      
      sinon.stub(NamedQueryService, 'create').returns(of({}));
      
      await NamedQueryService.bootstrap(defBrand);
      
      expect(NamedQueryService.create.called).to.be.false;
    });
  });

  describe('create', function() {
    it('should create named query', async function() {
      const brand = { id: 'brand-1' };
      const config = {
        mongoQuery: {},
        queryParams: {},
        collectionName: 'record',
        resultObjectMapping: {},
        brandIdFieldPath: 'branding',
        sort: [],
        expandRelations: true,
        relatedRecordFilters: [{
          collectionName: 'relatedmodel',
          mongoQuery: { status: 'active' },
          localField: 'relatedId',
          foreignField: 'recordId'
        }]
      };
      
      mockNamedQuery.create.returns(createQueryObject({ id: 'new-query' }));
      
      const result = await NamedQueryService.create(brand, 'test-query', config).toPromise();
      
      expect(mockNamedQuery.create.called).to.be.true;
      expect(mockNamedQuery.create.firstCall.args[0]).to.include({ expandRelations: true });
      expect(mockNamedQuery.create.firstCall.args[0].relatedRecordFilters).to.equal(JSON.stringify(config.relatedRecordFilters));
      expect(result).to.deep.equal({ id: 'new-query' });
    });
  });

  describe('getNamedQueryConfig', function() {
    it('should return config object', async function() {
      const brand = { id: 'brand-1' };
      const namedQueryData = {
        name: 'test',
        branding: 'brand-1',
        queryParams: '{}',
        mongoQuery: '{}',
        collectionName: 'record',
        resultObjectMapping: '{}',
        brandIdFieldPath: 'branding',
        sort: '[]'
      };
      
      mockNamedQuery.findOne.resolves(namedQueryData);
      
      const config = await NamedQueryService.getNamedQueryConfig(brand, 'test');
      
      expect(config).to.be.instanceOf(NamedQueryConfig);
      expect(config.collectionName).to.equal('record');
    });

    it('should fall back to sails config when db entry is missing', async function() {
      const brand = { id: 'brand-1' };

      mockNamedQuery.findOne.resolves(null);

      const config = await NamedQueryService.getNamedQueryConfig(brand, 'test-query');

      expect(config).to.be.instanceOf(NamedQueryConfig);
      expect(config?.collectionName).to.equal('record');
      expect(config?.brandIdFieldPath).to.equal('branding');
    });

    it('should return null when named query cannot be found', async function() {
      const brand = { id: 'brand-1' };

      mockNamedQuery.findOne.resolves(null);

      const config = await NamedQueryService.getNamedQueryConfig(brand, 'missing-query');

      expect(config).to.equal(null);
    });
  });

  describe('performNamedQuery', function() {
    it('should perform query on Record model', async function() {
      const brand = { id: 'brand-1' };
      const mongoQuery = { type: 'test' };
      
      mockRecord.count.returns({ meta: sinon.stub().resolves(1) });
      mockRecord.find.returns({ meta: sinon.stub().resolves([
        { redboxOid: 'oid-1', metadata: { title: 'Test Record' }, lastSaveDate: '', dateCreated: '' }
      ]) });
      
      const result = await NamedQueryService.performNamedQuery(
        'branding', 
        {}, 
        'record', 
        mongoQuery, 
        {}, 
        {}, 
        brand, 
        0, 
        10
      );
      
      expect(mockRecord.count.called).to.be.true;
      expect(mockRecord.find.called).to.be.true;
      expect(result.records).to.have.length(1);
      expect(result.records[0].oid).to.equal('oid-1');
    });

    it('should perform query on User model', async function() {
      const brand = { id: 'brand-1' };
      const mongoQuery = { type: 'test' };
      
      mockUser.count.returns({ meta: sinon.stub().resolves(1) });
      mockUser.find.returns({ meta: sinon.stub().resolves([
        { id: 'user-1', updatedAt: '', createdAt: '' }
      ]) });
      
      const result = await NamedQueryService.performNamedQuery(
        'branding', 
        {}, 
        'user', 
        mongoQuery, 
        {}, 
        {}, 
        brand, 
        0, 
        10
      );
      
      expect(mockUser.count.called).to.be.true;
      expect(mockUser.find.called).to.be.true;
      expect(result.records).to.have.length(1);
    });

    it('should perform query on arbitrary dynamic model', async function() {
      const brand = { id: 'brand-1' };
      const result = await NamedQueryService.performNamedQuery(
        'branding',
        { customName: '{{record.name}}' },
        'custommodel',
        {},
        {},
        {},
        brand,
        0,
        10
      );
      
      expect(mockSails.models.custommodel.count.called).to.be.true;
      expect(mockSails.models.custommodel.find.called).to.be.true;
      expect(result.records).to.have.length(1);
      expect(result.records[0].metadata.customName).to.equal('Custom Record');
    });

    it('should log when expandRelations is configured for a non-record model', async function() {
      const brand = { id: 'brand-1' };

      await NamedQueryService.performNamedQuery(
        'branding',
        { customName: '{{record.name}}' },
        'custommodel',
        {},
        {},
        {},
        brand,
        0,
        10,
        undefined,
        undefined,
        true
      );

      expect(mockSails.log.debug.calledWith("expandRelations is only supported for the 'record' collection; ignoring for 'custommodel'")).to.be.true;
    });

    it('should expand record relationships when configured', async function() {
      const brand = { id: 'brand-1' };

      mockRecord.count.returns({ meta: sinon.stub().resolves(1) });
      mockRecord.find.returns({ meta: sinon.stub().resolves([
        { redboxOid: 'oid-1', metadata: { title: 'Test Record' }, lastSaveDate: '', dateCreated: '' }
      ]) });

      const result = await NamedQueryService.performNamedQuery(
        'branding',
        { edges: '{{json record.relationships.edges}}' },
        'record',
        {},
        {},
        {},
        brand,
        0,
        10,
        undefined,
        undefined,
        true
      );

      expect(mockRecordsService.getRelatedRecords.calledOnceWithExactly('oid-1', brand)).to.be.true;
      expect(result.records[0].metadata.edges).to.equal('[]');
    });

    it('should filter results using related record filters', async function() {
      const brand = { id: 'brand-1' };
      const countMeta = sinon.stub().resolves(0);

      mockRelatedRecordModel.find.returns({ meta: sinon.stub().resolves([{ recordId: 'rel-1' }, { recordId: 'rel-2' }, { recordId: 'rel-1' }]) });
      mockRecord.count.returns({ meta: countMeta });

      await NamedQueryService.performNamedQuery(
        'branding',
        {},
        'record',
        {},
        {
          status: { path: 'status', type: 'string', whenUndefined: 'ignore' }
        },
        { status: 'active' },
        brand,
        0,
        10,
        undefined,
        undefined,
        false,
        [{
          collectionName: 'relatedmodel',
          mongoQuery: { status: null },
          localField: 'relatedId',
          foreignField: 'recordId'
        }]
      );

      expect(mockRelatedRecordModel.find.calledOnce).to.be.true;
      expect(mockRecord.count.calledOnce).to.be.true;
      expect(mockRecord.count.firstCall.args[0].relatedId).to.deep.equal({ $in: ['rel-1', 'rel-2'] });
    });

    it('should intersect related record filters targeting the same local field', async function() {
      const brand = { id: 'brand-1' };
      const countMeta = sinon.stub().resolves(0);

      mockRelatedRecordModel.find.onFirstCall().returns({ meta: sinon.stub().resolves([{ recordId: 'rel-1' }, { recordId: 'rel-2' }]) });
      mockRelatedRecordModel.find.onSecondCall().returns({ meta: sinon.stub().resolves([{ recordId: 'rel-2' }, { recordId: 'rel-3' }]) });
      mockRecord.count.returns({ meta: countMeta });

      await NamedQueryService.performNamedQuery(
        'branding',
        {},
        'record',
        {},
        {},
        {},
        brand,
        0,
        10,
        undefined,
        undefined,
        false,
        [{
          collectionName: 'relatedmodel',
          mongoQuery: { status: 'active' },
          localField: 'relatedId',
          foreignField: 'recordId'
        }, {
          collectionName: 'relatedmodel',
          mongoQuery: { type: 'primary' },
          localField: 'relatedId',
          foreignField: 'recordId'
        }]
      );

      expect(mockRelatedRecordModel.find.calledTwice).to.be.true;
      expect(mockRecord.count.firstCall.args[0].relatedId).to.deep.equal({ $in: ['rel-2'] });
    });

    it('should only apply query params to related filters when the filter query declares that path', async function() {
      const brand = { id: 'brand-1' };

      mockRelatedRecordModel.find.returns({ meta: sinon.stub().resolves([]) });
      mockRecord.count.returns({ meta: sinon.stub().resolves(0) });

      await NamedQueryService.performNamedQuery(
        'branding',
        {},
        'record',
        {},
        {
          search: { path: 'metadata.l_fullName', type: 'string', queryType: 'contains', whenUndefined: 'ignore' },
          status: { path: 'status', type: 'string', whenUndefined: 'ignore' }
        },
        { search: 'Ada Lovelace', status: 'active' },
        brand,
        0,
        10,
        undefined,
        undefined,
        false,
        [{
          collectionName: 'relatedmodel',
          mongoQuery: { status: null },
          localField: 'relatedId',
          foreignField: 'recordId'
        }]
      );

      const relatedCriteria = mockRelatedRecordModel.find.firstCall.args[0];
      expect(relatedCriteria.where).to.deep.equal({ status: 'active' });
    });
  });

  describe('runTemplate', function() {
    it('should not execute legacy lodash templates', function() {
      const template = 'Hello <%= name %>';
      const variables = { name: 'World' };
      
      const result = NamedQueryService.runTemplate(template, variables);
      
      expect(result).to.equal(undefined);
    });

    it('should run handlebars template with shared helpers', function() {
      const result = NamedQueryService.runTemplate('{{formatDate createdAt "yyyy-MM-dd"}} | {{get user "name"}}', {
        createdAt: '2026-05-18T01:02:03.000Z',
        user: { name: 'World' }
      });

      expect(result).to.equal('2026-05-18 | World');
    });

    it('should preserve non-HTML data characters in handlebars templates', function() {
      const result = NamedQueryService.runTemplate('{{title}} | {{toLower author}}', {
        title: 'Coffee & Tea <Blend>',
        author: "O'Brien"
      });

      expect(result).to.equal("Coffee & Tea <Blend> | o'brien");
    });

    it('should get value from path', function() {
      const path = 'user.name';
      const variables = { user: { name: 'John' } };
      
      const result = NamedQueryService.runTemplate(path, variables);
      
      expect(result).to.equal('John');
    });

    it('should throw handlebars template errors', function() {
      expect(() => {
        NamedQueryService.runTemplate('{{#if title}}', { title: 'Broken' });
      }).to.throw();
      expect(mockSails.log.error.calledOnce).to.be.true;
    });
  });

  describe('setParamsInQuery', function() {
    it('should replace parameters in query', function() {
      const mongoQuery = { status: 'param-status' };
      const queryParams = {
        'status': { path: 'status', type: 'string', required: true }
      };
      const paramMap = { status: 'published' };
      
      NamedQueryService.setParamsInQuery(mongoQuery, queryParams, paramMap);
      
      expect(mongoQuery.status).to.equal('published');
    });

    it('should transform query parameter values with handlebars helpers', function() {
      const mongoQuery: any = {};
      const queryParams = {
        'search': {
          path: 'metadata.l_fullName',
          type: 'string',
          template: '{{toLower value}}',
          queryType: 'contains',
          whenUndefined: 'ignore'
        }
      };

      NamedQueryService.setParamsInQuery(mongoQuery, queryParams, { search: 'Ada Lovelace' });

      expect(mongoQuery.metadata.l_fullName).to.deep.equal({ contains: 'ada lovelace' });
    });

    it('should throw if required param missing', function() {
      const mongoQuery = {};
      const queryParams = {
        'status': { path: 'status', type: 'string', required: true }
      };
      const paramMap = {};
      
      expect(() => {
        NamedQueryService.setParamsInQuery(mongoQuery, queryParams, paramMap);
      }).to.throw('status is a required parameter');
    });

    it('should parse boolean and array parameters', function() {
      const mongoQuery: any = {};
      const queryParams = {
        'isActive': { path: 'isActive', type: 'boolean' },
        'tags': { path: 'tags', type: 'array', queryType: '$in' }
      };
      const paramMap = { isActive: 'true', tags: 'science' };
      
      NamedQueryService.setParamsInQuery(mongoQuery, queryParams, paramMap);
      
      expect(mongoQuery.isActive).to.be.true;
      expect(mongoQuery.tags).to.deep.equal({ $in: ['science'] });
    });

    it('should ignore undefined optional boolean and array parameters', function() {
      const mongoQuery: any = { isActive: true, tags: { $in: ['existing'] } };
      const queryParams = {
        'isActive': { path: 'isActive', type: 'boolean', whenUndefined: 'ignore' },
        'tags': { path: 'tags', type: 'array', queryType: '$in', whenUndefined: 'ignore' }
      };

      NamedQueryService.setParamsInQuery(mongoQuery, queryParams, {});

      expect(mongoQuery).to.deep.equal({});
    });

    it('should parse object parameters from json strings', function() {
      const mongoQuery: any = {};
      const queryParams = {
        'constraints': { path: 'constraints', type: 'object', whenUndefined: 'ignore' }
      };

      NamedQueryService.setParamsInQuery(mongoQuery, queryParams, {
        constraints: '{"status":"active","limit":5}'
      });

      expect(mongoQuery.constraints).to.deep.equal({ status: 'active', limit: 5 });
    });

    it('should reject invalid object parameters', function() {
      const mongoQuery: any = {};
      const queryParams = {
        'constraints': { path: 'constraints', type: 'object', whenUndefined: 'ignore' }
      };

      expect(() => {
        NamedQueryService.setParamsInQuery(mongoQuery, queryParams, {
          constraints: 'not-json'
        });
      }).to.throw('constraints must be a valid JSON object');
    });
  });
});
