import { expect } from 'chai';
import * as sinon from 'sinon';
import { Services } from '../../src/services/I18nEntriesService';
import { setupServiceTestGlobals, cleanupServiceTestGlobals, createMockSails } from './testHelper';

describe('I18nEntriesService', function() {
  let service: Services.I18nEntries;
  let mockSails: any;

  beforeEach(function() {
    mockSails = createMockSails();
    setupServiceTestGlobals(mockSails);

    const mockDeferred = (result) => {
      const p: any = Promise.resolve(result);
      p.exec = sinon.stub().yields(null, result);
      return p;
    };

    (global as any).I18nBundle = {
      findOne: sinon.stub(),
      create: sinon.stub(),
      updateOne: sinon.stub().returns({ set: sinon.stub().resolves({}) })
    };

    (global as any).I18nTranslation = {
      find: sinon.stub().resolves([]),
      findOne: sinon.stub().resolves(null),
      create: sinon.stub().resolves({}),
      updateOne: sinon.stub().returns({ set: sinon.stub().resolves({}) }),
      destroyOne: sinon.stub().resolves({})
    };

    (global as any).BrandingService = {
      getBrand: sinon.stub().returns({ id: 'brand1' }),
      getBrandById: sinon.stub().returns({ id: 'brand1' })
    };

    service = new Services.I18nEntries();
  });

  afterEach(function() {
    cleanupServiceTestGlobals();
    delete (global as any).I18nBundle;
    delete (global as any).I18nTranslation;
    delete (global as any).BrandingService;
    sinon.restore();
  });

  describe('flatten/unflatten', function() {
    it('should flatten object', function() {
      const obj = { a: { b: 1 } };
      const flat = (service as any).flatten(obj);
      expect(flat).to.deep.equal({ 'a.b': 1 });
    });

    it('should unflatten object', function() {
      const flat = { 'a.b': 1 };
      const obj = (service as any).unflatten(flat);
      expect(obj).to.deep.equal({ a: { b: 1 } });
    });
  });
});
