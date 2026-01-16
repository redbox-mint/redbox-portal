import { expect } from 'chai';
import * as sinon from 'sinon';
import { Services } from '../../src/services/NamedQueryService';
import { setupServiceTestGlobals, cleanupServiceTestGlobals, createMockSails } from './testHelper';

describe('NamedQueryService', function() {
  let service: Services.NamedQueryService;
  let mockSails: any;

  beforeEach(function() {
    mockSails = createMockSails();
    mockSails.config.namedQuery = {};
    mockSails.config.appmode = { bootstrapAlways: false };
    setupServiceTestGlobals(mockSails);

    const mockDeferred = (result) => {
      const p: any = Promise.resolve(result);
      p.exec = sinon.stub().yields(null, result);
      return p;
    };

    (global as any).NamedQuery = {
      find: sinon.stub().callsFake(() => mockDeferred([])),
      create: sinon.stub().callsFake((data) => mockDeferred(data)),
      findOne: sinon.stub().callsFake(() => mockDeferred(null)),
      destroyOne: sinon.stub().callsFake(() => mockDeferred(null))
    };

    service = new Services.NamedQueryService();
  });

  afterEach(function() {
    cleanupServiceTestGlobals();
    delete (global as any).NamedQuery;
    sinon.restore();
  });

  describe('setParamsInQuery', function() {
    it('should replace parameters in query', function() {
      const mongoQuery = { field: 'value' };
      const queryParams: any = {
        'param1': { path: 'field', type: 'string' }
      };
      const paramMap = { 'param1': 'newValue' };
      
      service.setParamsInQuery(mongoQuery, queryParams, paramMap);
      
      expect(mongoQuery.field).to.equal('newValue');
    });
  });
});
