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
      }
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

    setupServiceTestGlobals(mockSails);
    (global as any).NamedQuery = mockNamedQuery;
    (global as any).User = mockUser;
    (global as any).Record = mockRecord;

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
        sort: []
      };
      
      mockNamedQuery.create.returns(createQueryObject({ id: 'new-query' }));
      
      const result = await NamedQueryService.create(brand, 'test-query', config).toPromise();
      
      expect(mockNamedQuery.create.called).to.be.true;
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
  });

  describe('runTemplate', function() {
    it('should run lodash template', function() {
      const template = 'Hello <%= name %>';
      const variables = { name: 'World' };
      
      const result = NamedQueryService.runTemplate(template, variables);
      
      expect(result).to.equal('Hello World');
    });

    it('should get value from path', function() {
      const path = 'user.name';
      const variables = { user: { name: 'John' } };
      
      const result = NamedQueryService.runTemplate(path, variables);
      
      expect(result).to.equal('John');
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
  });
});
