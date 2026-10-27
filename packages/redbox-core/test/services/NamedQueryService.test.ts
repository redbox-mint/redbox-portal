import * as storageQueries from '../../src/persistence/storage/NamedQueryTargets';
import { repositoryFixtures } from '../helpers/repositoryFixtures';
import { installIdentityRepositoryMock } from '../helpers/identityMock';
import { registerNamedQueryTarget, namedQueryCriteria } from '../../src/persistence/reference/NamedQueryExecution';
import {createSinonStubLogger} from "../logger.test";
import { RequestChronicleHelper } from '../../src/utilities/RequestChronicle';
import { runWithRequestChronicle } from '../../src/utilities/RequestChronicleContext';

let expect: Chai.ExpectStatic;
import("chai").then(mod => expect = mod.expect);
import * as sinon from 'sinon';
import { setupServiceTestGlobals, cleanupServiceTestGlobals, createMockSails, createQueryObject } from './testHelper';

describe('NamedQueryService', function() {
  let mockSails: any;
  let NamedQueryService: any;
  let NamedQueryConfig: any;
  let mockNamedQuery: any;
  let mockUser: any;
  let mockUserLink: any;
  let mockRecord: any;
  let mockRecordNativeCollection: any;
  let mockRelatedRecordModel: any;
  let mockRecordsService: any;

  beforeEach(function() {
    installIdentityRepositoryMock();
    mockSails = createMockSails({
      config: {
        appPath: '/app',
        namedQuery: {
          supportedCollections: ['record', 'user']
        },
        appmode: {
          bootstrapAlways: false
        }
      },
      log: createSinonStubLogger(sinon),
      queryFixtures: {}
    });

    mockNamedQuery = {
      find: sinon.stub().returns(createQueryObject([])),
      findOne: sinon.stub().resolves(null),
      create: sinon.stub().returns(createQueryObject({})),
      update: sinon.stub().returns(createQueryObject([])),
      updateOne: sinon.stub().returns(createQueryObject({})),
      destroy: sinon.stub().returns(createQueryObject([])),
      destroyOne: sinon.stub().resolves({})
    };

    mockUser = {
      count: sinon.stub().returns({ meta: sinon.stub().resolves(0) }),
      find: sinon.stub().returns({ meta: sinon.stub().resolves([]) })
    };

    mockUserLink = {
      find: sinon.stub().resolves([])
    };

    const nativeCursor = {
      sort: sinon.stub().returnsThis(),
      skip: sinon.stub().returnsThis(),
      limit: sinon.stub().returnsThis(),
      toArray: sinon.stub().resolves([])
    };
    mockRecordNativeCollection = {
      countDocuments: sinon.stub().resolves(0),
      find: sinon.stub().returns(nativeCursor),
      cursor: nativeCursor
    };

    mockRecord = {
      count: sinon.stub().returns({ meta: sinon.stub().resolves(0) }),
      find: sinon.stub().returns({ meta: sinon.stub().resolves([]) }),
      native: sinon.stub().callsFake((callback: any) => callback(null, mockRecordNativeCollection))
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
    repositoryFixtures.NamedQuery = mockNamedQuery;
    repositoryFixtures.User = mockUser;
    repositoryFixtures.UserLink = mockUserLink;
    repositoryFixtures.Record = mockRecord;

    mockSails.queryFixtures = {
      user: mockUser,
      userlink: mockUserLink,
      record: mockRecord,
      relatedmodel: mockRelatedRecordModel,
      custommodel: {
        attributes: { branding: {} },
        count: sinon.stub().returns({ meta: sinon.stub().resolves(1) }),
        find: sinon.stub().returns({ meta: sinon.stub().resolves([{ id: 'custom-1', name: 'Custom Record' }]) })
      },
      unscopedmodel: {
        attributes: { name: {} },
        count: sinon.stub().returns({ meta: sinon.stub().resolves(1) }),
        find: sinon.stub().returns({ meta: sinon.stub().resolves([{ id: 'unscoped-1', name: 'Unscoped Record' }]) })
      }
    };

    for (const name of ['custommodel', 'relatedmodel']) {
      registerNamedQueryTarget(mockSails, {
        metadata: { name, scope: { type: 'field', fieldPath: 'branding' } },
        async execute(request) {
          const model = mockSails.queryFixtures[name];
          const where = namedQueryCriteria(request.expression, false);
          const total = request.rows === undefined ? 0 : await model.count(where).meta({ enableExperimentalDeepTargets: true });
          const records = await model.find({ where, ...(request.select ? { select: request.select } : {}),
            ...(request.rows !== undefined ? { skip: request.start, limit: request.rows } : {}),
            ...(request.sort?.length ? { sort: request.sort } : {}) }).meta({ enableExperimentalDeepTargets: true });
          return { total, records };
        },
      });
    }

    sinon.stub(storageQueries, 'executeStorageQuery').callsFake(async (_app, request) => {
      const where = namedQueryCriteria(request.expression, 'record');
      const total = await mockRecordNativeCollection.countDocuments(where);
      let cursor = mockRecordNativeCollection.find(where);
      if (request.sort?.length) cursor = cursor.sort(Object.assign({}, ...request.sort.map(entry => Object.fromEntries(Object.entries(entry).map(([key, dir]) => [key, dir === 'DESC' ? -1 : 1])))));
      const records = total ? await cursor.skip(request.start).limit(request.rows).toArray() : [];
      return { total, records };
    });

    const module = require('../../src/services/NamedQueryService');
    const { Services } = module;
    NamedQueryConfig = module.NamedQueryConfig;
    NamedQueryService = new Services.NamedQueryService();
  });

  afterEach(function() {
    cleanupServiceTestGlobals();
    delete repositoryFixtures.NamedQuery;
    delete repositoryFixtures.User;
    delete repositoryFixtures.UserLink;
    delete repositoryFixtures.Record;
    sinon.restore();
  });

  describe('bootstrapData', function() {
    const stubFileOps = (fileOps: any) => sinon.stub(NamedQueryService, 'getBootstrapFileOps').returns(fileOps);

    it('should create a named query from a file when it is absent from the DB', async function() {
      const defBrand = { id: 'brand-1' };
      stubFileOps({
        readdir: sinon.stub().resolves([{ name: 'listParties.json', isFile: () => true }]),
        readFile: sinon.stub().resolves(JSON.stringify({
          collectionName: 'record',
          mongoQuery: {},
          queryParams: {},
          resultObjectMapping: {}
        }))
      });
      mockNamedQuery.findOne.resolves(null);
      const createStub = sinon.stub(NamedQueryService, 'create').resolves({});

      await NamedQueryService.bootstrapData(defBrand);

      expect(createStub.calledOnce).to.be.true;
      expect(createStub.firstCall.args[0]).to.equal(defBrand);
      expect(createStub.firstCall.args[1]).to.equal('listParties');
    });

    it('should skip a named query that already exists in the DB', async function() {
      const defBrand = { id: 'brand-1' };
      stubFileOps({
        readdir: sinon.stub().resolves([{ name: 'listParties.json', isFile: () => true }]),
        readFile: sinon.stub().resolves(JSON.stringify({
          collectionName: 'record',
          mongoQuery: {},
          queryParams: {},
          resultObjectMapping: {}
        }))
      });
      mockNamedQuery.findOne.resolves({ id: 'existing', key: 'brand-1_listParties' });
      const createStub = sinon.stub(NamedQueryService, 'create').resolves({});

      await NamedQueryService.bootstrapData(defBrand);

      expect(createStub.called).to.be.false;
    });

    it('should be a no-op when the bootstrap data directory is missing', async function() {
      const defBrand = { id: 'brand-1' };
      const enoent = Object.assign(new Error('not found'), { code: 'ENOENT' });
      stubFileOps({
        readdir: sinon.stub().rejects(enoent),
        readFile: sinon.stub()
      });
      const createStub = sinon.stub(NamedQueryService, 'create').resolves({});

      await NamedQueryService.bootstrapData(defBrand);

      expect(createStub.called).to.be.false;
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

      const result = await NamedQueryService.create(brand, 'test-query', config);

      expect(mockNamedQuery.create.called).to.be.true;
      expect(mockNamedQuery.create.firstCall.args[0]).to.include({ expandRelations: true });
      expect(mockNamedQuery.create.firstCall.args[0].brandIdFieldPath).to.equal('metaMetadata.brandId');
      expect(mockNamedQuery.create.firstCall.args[0].relatedRecordFilters).to.equal(JSON.stringify(config.relatedRecordFilters));
      expect(result).to.deep.equal({ id: 'new-query' });
    });

    it('should use explicitly registered institution target metadata', async function() {
      const brand = { id: 'brand-1' };
      const config = {
        mongoQuery: {},
        queryParams: {},
        collectionName: 'custommodel',
        resultObjectMapping: {},
        brandIdFieldPath: 'attackerSuppliedPath'
      };

      await NamedQueryService.create(brand, 'custom-query', config);

      expect(mockNamedQuery.create.firstCall.args[0].brandIdFieldPath).to.equal('branding');
    });

    it('should store no direct brand field for user queries', async function() {
      const brand = { id: 'brand-1' };
      const config = {
        mongoQuery: {},
        queryParams: {},
        collectionName: 'user',
        resultObjectMapping: {},
        brandIdFieldPath: 'attackerSuppliedPath'
      };

      await NamedQueryService.create(brand, 'user-query', config);

      expect(mockNamedQuery.create.firstCall.args[0].brandIdFieldPath).to.equal('');
    });

    it('should reject models without a brand scope', async function() {
      const brand = { id: 'brand-1' };
      const config = {
        mongoQuery: {},
        queryParams: {},
        collectionName: 'unscopedmodel',
        resultObjectMapping: {},
        brandIdFieldPath: 'attackerSuppliedPath'
      };

      try {
        await NamedQueryService.create(brand, 'unsafe-query', config);
        expect.fail('Expected error to be thrown');
      } catch (error: any) {
        expect(error.code).to.equal('named-query-compatibility');
        expect(error.message).to.include('register an explicit tenant-scoped');
      }
    });

    it('should throw if named query already exists', async function() {
      const brand = { id: 'brand-1' };
      const config = {
        mongoQuery: {},
        queryParams: {},
        collectionName: 'record',
        resultObjectMapping: {},
        brandIdFieldPath: 'branding'
      };

      mockNamedQuery.findOne.resolves({ id: 'existing-query', name: 'test-query' });

      try {
        await NamedQueryService.create(brand, 'test-query', config);
        expect.fail('Expected error to be thrown');
      } catch (error: any) {
        expect(error.message).to.equal("Named query 'test-query' already exists");
      }
    });
  });

  describe('list', function() {
    it('should return empty array when no named queries exist', async function() {
      const brand = { id: 'brand-1' };
      mockNamedQuery.find.returns(createQueryObject([]));

      const result = await NamedQueryService.list(brand);

      expect(mockNamedQuery.find.calledOnce).to.be.true;
      expect(mockNamedQuery.find.firstCall.args[0]).to.deep.equal({ branding: 'brand-1' });
      expect(result).to.deep.equal([]);
    });

    it('should deserialize and return named queries', async function() {
      const brand = { id: 'brand-1' };
      const dbRecords = [{
        name: 'test-query',
        collectionName: 'record',
        mongoQuery: '{"type":"test"}',
        queryParams: '{"status":{"type":"string","path":"status"}}',
        resultObjectMapping: '{"oid":"{{record.redboxOid}}"}',
        brandIdFieldPath: 'metaMetadata.brandId',
        sort: '[{"lastSaveDate":"DESC"}]',
        expandRelations: true,
        relatedRecordFilters: '[{"collectionName":"relatedmodel","mongoQuery":{},"localField":"relatedId","foreignField":"recordId"}]'
      }];

      mockNamedQuery.find.returns(createQueryObject(dbRecords));

      const result = await NamedQueryService.list(brand);

      expect(result).to.have.length(1);
      expect(result[0].name).to.equal('test-query');
      expect(result[0].mongoQuery).to.deep.equal({ type: 'test' });
      expect(result[0].queryParams).to.deep.equal({ status: { type: 'string', path: 'status' } });
      expect(result[0].resultObjectMapping).to.deep.equal({ oid: '{{record.redboxOid}}' });
      expect(result[0].brandIdFieldPath).to.equal('metaMetadata.brandId');
      expect(result[0].sort).to.deep.equal([{ lastSaveDate: 'DESC' }]);
      expect(result[0].expandRelations).to.be.true;
      expect(result[0].relatedRecordFilters).to.deep.equal([{ collectionName: 'relatedmodel', mongoQuery: {}, localField: 'relatedId', foreignField: 'recordId' }]);
    });

    it('should handle undefined optional fields gracefully', async function() {
      const brand = { id: 'brand-1' };
      const dbRecords = [{
        name: 'minimal-query',
        collectionName: 'user',
        mongoQuery: '{}',
        queryParams: '{}',
        resultObjectMapping: '{}',
        brandIdFieldPath: null,
        sort: '',
        expandRelations: false,
        relatedRecordFilters: ''
      }];

      mockNamedQuery.find.returns(createQueryObject(dbRecords));

      const result = await NamedQueryService.list(brand);

      expect(result[0].name).to.equal('minimal-query');
      expect(result[0].brandIdFieldPath).to.be.undefined;
      expect(result[0].sort).to.be.undefined;
      expect(result[0].expandRelations).to.be.false;
      expect(result[0].relatedRecordFilters).to.be.undefined;
    });
  });

  describe('update', function() {
    it('should update named query by composite key', async function() {
      const brand = { id: 'brand-1' };
      const config = {
        mongoQuery: { type: 'updated' },
        queryParams: {},
        collectionName: 'record',
        resultObjectMapping: {},
        brandIdFieldPath: 'branding',
        sort: [{ name: 'ASC' }],
        expandRelations: false,
        relatedRecordFilters: []
      };

      mockNamedQuery.findOne.resolves({ id: 'existing-query', name: 'test-query' });
      mockNamedQuery.updateOne.returns(createQueryObject({ id: 'updated-query' }));

      const result = await NamedQueryService.update(brand, 'test-query', config);

      expect(mockNamedQuery.updateOne.calledOnce).to.be.true;
      expect(mockNamedQuery.updateOne.firstCall.args[0]).to.deep.equal({ key: 'brand-1_test-query' });
      expect(mockNamedQuery.updateOne.firstCall.args[0].key).to.equal('brand-1_test-query');
      const queryObj = mockNamedQuery.updateOne.firstCall.returnValue;
      expect(queryObj.set.calledOnce).to.be.true;
      expect(queryObj.set.firstCall.args[0].mongoQuery).to.equal('{"type":"updated"}');
      expect(queryObj.set.firstCall.args[0].brandIdFieldPath).to.equal('metaMetadata.brandId');
      expect(result).to.deep.equal({ id: 'updated-query' });
    });
  });

  describe('delete', function() {
    it('should delete named query by composite key', async function() {
      const brand = { id: 'brand-1' };

      mockNamedQuery.findOne.resolves({ id: 'existing-query', name: 'test-query' });
      mockNamedQuery.destroyOne.returns(createQueryObject({ id: 'deleted-query' }));

      const result = await NamedQueryService.delete(brand, 'test-query');

      expect(mockNamedQuery.destroyOne.calledOnce).to.be.true;
      expect(mockNamedQuery.destroyOne.firstCall.args[0]).to.deep.equal({ key: 'brand-1_test-query' });
      expect(result).to.deep.equal({ id: 'deleted-query' });
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

    it('should return null when named query cannot be found', async function() {
      const brand = { id: 'brand-1' };

      mockNamedQuery.findOne.resolves(null);

      const config = await NamedQueryService.getNamedQueryConfig(brand, 'missing-query');

      expect(config).to.equal(null);
    });
  });

  describe('getSupportedCollections', function() {
    it('should return the configured supported collections', function() {
      expect(NamedQueryService.getSupportedCollections()).to.deep.equal(['record', 'user']);
    });

    it('should return an empty array when none are configured', function() {
      delete mockSails.config.namedQuery.supportedCollections;
      expect(NamedQueryService.getSupportedCollections()).to.deep.equal([]);
    });
  });

  describe('performNamedQuery', function() {
    it('should perform query on Record model', async function() {
      const brand = { id: 'brand-1' };
      const mongoQuery = { type: 'test' };

      mockRecordNativeCollection.countDocuments.resolves(1);
      mockRecordNativeCollection.cursor.toArray.resolves([
        { redboxOid: 'oid-1', metadata: { title: 'Test Record' }, lastSaveDate: '', dateCreated: '' }
      ]);

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

      expect(mockRecordNativeCollection.countDocuments.called).to.be.true;
      expect(mockRecordNativeCollection.countDocuments.firstCall.args[0]['metaMetadata.brandId']).to.equal('brand-1');
      expect(mockRecordNativeCollection.find.called).to.be.true;
      expect(result.records).to.have.length(1);
      expect(result.records[0].oid).to.equal('oid-1');
    });

    it('should perform query on User model', async function() {
      const brand = { id: 'brand-1' };
      const mongoQuery = { type: 'test' };
      const userQuery = {
        populate: sinon.stub().returnsThis(),
        meta: sinon.stub().resolves([
          {
            id: 'user-1',
            type: 'local',
            name: 'Brand User',
            email: 'brand@test.com',
            username: 'brand-user',
            roles: [{ branding: 'brand-1' }],
            updatedAt: '',
            createdAt: ''
          },
          {
            id: 'user-2',
            type: 'local',
            name: 'Other User',
            email: 'other@test.com',
            username: 'other-user',
            roles: [{ branding: 'brand-2' }],
            updatedAt: '',
            createdAt: ''
          }
        ])
      };

      mockUser.find.returns(userQuery);

      const result = await NamedQueryService.performNamedQuery(
        'ignoredClientPath',
        {},
        'user',
        mongoQuery,
        {},
        {},
        brand,
        0,
        10
      );

      expect(mockUser.find.called).to.be.true;
      expect(userQuery.populate.calledOnceWithExactly('roles')).to.be.true;
      expect(result.records).to.have.length(1);
      expect(result.summary.numFound).to.equal(1);
      expect(result.records[0].metadata).to.deep.include({ username: 'brand-user' });
    });

    it('should include linked alias users when scoping user queries to a brand', async function() {
      const brand = { id: 'brand-1' };
      const userQuery = {
        populate: sinon.stub().returnsThis(),
        meta: sinon.stub().resolves([
          {
            id: 'alias-1',
            type: 'local',
            name: 'Linked Alias',
            email: 'alias@test.com',
            username: 'alias-user',
            roles: [{ branding: 'brand-2' }],
            updatedAt: '',
            createdAt: ''
          }
        ])
      };
      mockUser.find.returns(userQuery);
      mockUserLink.find.resolves([{ secondaryUserId: 'alias-1', brandId: 'brand-1', status: 'active' }]);

      const result = await NamedQueryService.performNamedQuery(
        '',
        {},
        'user',
        {},
        {},
        {},
        brand,
        0,
        10
      );

      expect(mockUserLink.find.calledOnceWithExactly({ brandId: 'brand-1', status: 'active' })).to.be.true;
      expect(result.records).to.have.length(1);
      expect(result.records[0].metadata).to.deep.include({ username: 'alias-user' });
    });

    it('should remove user password and token before applying result mappings', async function() {
      const brand = { id: 'brand-1' };
      const userQuery = {
        populate: sinon.stub().returnsThis(),
        meta: sinon.stub().resolves([
          {
            id: 'user-1',
            roles: [{ branding: 'brand-1' }],
            password: 'secret',
            token: 'token-value',
            updatedAt: '',
            createdAt: ''
          }
        ])
      };
      mockUser.find.returns(userQuery);

      const result = await NamedQueryService.performNamedQuery(
        '',
        { password: '{{record.password}}', token: '{{record.token}}' },
        'user',
        {},
        {},
        {},
        brand,
        0,
        10
      );

      expect(result.records[0].metadata).to.deep.equal({ password: '', token: '' });
    });

    it('should execute an explicitly registered institution target', async function() {
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

      expect(mockSails.queryFixtures.custommodel.count.called).to.be.true;
      expect(mockSails.queryFixtures.custommodel.count.firstCall.args[0].branding).to.equal('brand-1');
      expect(mockSails.queryFixtures.custommodel.find.called).to.be.true;
      expect(result.records).to.have.length(1);
      expect(result.records[0].metadata.customName).to.equal('Custom Record');
    });

    it('should reject arbitrary dynamic models without brand scoping', async function() {
      const brand = { id: 'brand-1' };

      try {
        await NamedQueryService.performNamedQuery(
          '',
          {},
          'unscopedmodel',
          {},
          {},
          {},
          brand,
          0,
          10
        );
        expect.fail('Expected error to be thrown');
      } catch (error: any) {
        expect(error.code).to.equal('named-query-compatibility');
        expect(error.message).to.include('register an explicit tenant-scoped');
      }
    });

    it('captures pagination and counts without logging criteria or parameter values', async function() {
      const item = RequestChronicleHelper.fromReq(mockSails.log, { options: {} } as Sails.Req);
      item.start();
      const response = await runWithRequestChronicle(item, () => NamedQueryService.performNamedQueryFromConfig(
        { collectionName: 'record', mongoQuery: { 'metadata.title': 'PRIVATE TITLE' } },
        { search: 'PRIVATE SEARCH' },
        { id: 'brand-1' },
        0,
        10
      ));
      expect(response.records).to.deep.equal([]);
      expect(item.data).to.include({ namedQueryCollection: 'record', namedQueryRows: 10, namedQueryParameterCount: 1 });
      expect(JSON.stringify(item.data)).not.to.include('PRIVATE');
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

      expect(mockSails.log.debug.calledWithMatch({ info: { namedQueryRelationsIgnored: true } }, 'Service operation')).to.be.true;
    });

    it('should expand record relationships when configured', async function() {
      const brand = { id: 'brand-1' };

      mockRecordNativeCollection.countDocuments.resolves(1);
      mockRecordNativeCollection.cursor.toArray.resolves([
        { redboxOid: 'oid-1', metadata: { title: 'Test Record' }, lastSaveDate: '', dateCreated: '' }
      ]);

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
      mockRecordNativeCollection.countDocuments = countMeta;

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
      expect(mockRecordNativeCollection.countDocuments.calledOnce).to.be.true;
      expect(mockRecordNativeCollection.countDocuments.firstCall.args[0].relatedId).to.deep.equal({ $in: ['rel-1', 'rel-2'] });
    });

    it('should intersect related record filters targeting the same local field', async function() {
      const brand = { id: 'brand-1' };
      const countMeta = sinon.stub().resolves(0);

      mockRelatedRecordModel.find.onFirstCall().returns({ meta: sinon.stub().resolves([{ recordId: 'rel-1' }, { recordId: 'rel-2' }]) });
      mockRelatedRecordModel.find.onSecondCall().returns({ meta: sinon.stub().resolves([{ recordId: 'rel-2' }, { recordId: 'rel-3' }]) });
      mockRecordNativeCollection.countDocuments = countMeta;

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
      expect(mockRecordNativeCollection.countDocuments.firstCall.args[0].relatedId).to.deep.equal({ $in: ['rel-2'] });
    });

    it('should only apply query params to related filters when the filter query declares that path', async function() {
      const brand = { id: 'brand-1' };

      mockRelatedRecordModel.find.returns({ meta: sinon.stub().resolves([]) });
      mockRecordNativeCollection.countDocuments.resolves(0);

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
      expect(relatedCriteria.where).to.deep.equal({ status: 'active', branding: 'brand-1' });
    });
  });

  describe('performNamedQueryFromConfigResults', function() {
    it('should break the loop when maxRecords is exceeded', async function() {
      const brand = { id: 'brand-1' };
      const config = {
        mongoQuery: {},
        queryParams: {},
        collectionName: 'record',
        resultObjectMapping: {},
        brandIdFieldPath: 'branding',
        sort: [],
        expandRelations: false,
        relatedRecordFilters: []
      };

      const stub = sinon.stub(NamedQueryService, 'performNamedQueryFromConfig');
      stub.onCall(0).resolves({
        records: [{ id: '1' }, { id: '2' }],
        summary: { numFound: 10 }
      });
      stub.onCall(1).resolves({
        records: [{ id: '3' }, { id: '4' }],
        summary: { numFound: 10 }
      });
      stub.onCall(2).resolves({
        records: [{ id: '5' }, { id: '6' }],
        summary: { numFound: 10 }
      });

      const result = await NamedQueryService.performNamedQueryFromConfigResults(
        config, {}, brand, 'test-query', 0, 2, 3
      );

      expect(stub.callCount).to.equal(2);
      expect(result).to.have.length(4);
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

      expect(mongoQuery['metadata.l_fullName']).to.deep.equal({ contains: 'ada lovelace' });
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
