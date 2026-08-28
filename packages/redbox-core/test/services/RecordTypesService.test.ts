let expect: Chai.ExpectStatic;
import('chai').then(mod => (expect = mod.expect));
import * as sinon from 'sinon';
import { Services } from '../../src/services/RecordTypesService';
import { setupServiceTestGlobals, cleanupServiceTestGlobals, createMockSails } from './testHelper';
import { firstValueFrom, of } from 'rxjs';
import { RecordTypeResponseModel } from '../../src/model/RecordTypeResponseModel';
import { FULL_RECORD_STORAGE_CONCURRENCY_CAPABILITIES } from '../../src/RecordStorageConcurrency';

describe('RecordTypesService', function () {
  let service: Services.RecordTypes;
  let mockSails: any;

  beforeEach(function () {
    mockSails = createMockSails();
    mockSails.config.recordtype = {
      dataset: {
        packageType: 'pt',
        searchCore: 'sc',
        searchFilters: [],
        hooks: {},
        actionPlan: {
          schemaVersion: 1,
          recordTypeKey: 'dataset',
          bindings: [],
        },
        automaticTransitions: [
          {
            schemaVersion: 1,
            id: 'draft-to-published',
            mode: 'automatic',
            sourceStage: 'draft',
            targetStage: 'published',
            priority: 10,
            condition: 'true',
          },
        ],
        transferResponsibility: false,
        relatedTo: [],
        searchable: true,
        dashboard: {},
        recordValidation: {
          mode: 'shadow',
          operations: {
            publish: { mode: 'enforce', enabledValidationGroups: ['publish'] },
          },
        },
        concurrentModification: { mode: 'observe' },
      },
    };
    mockSails.config.appmode = { bootstrapAlways: false };
    mockSails.config.storage = { serviceName: 'teststorage' };
    mockSails.services.teststorage = {
      getCapabilities: () => ({
        recordConcurrency: { ...FULL_RECORD_STORAGE_CONCURRENCY_CAPABILITIES },
      }),
    };

    setupServiceTestGlobals(mockSails);

    // `.create()` only resolves to the created record when `.fetch()` is
    // chained, so the deferred mock mirrors that chain.
    const mockDeferred = (result: unknown) => {
      const deferred = {
        exec: sinon.stub().yields(null, result),
        fetch: () => deferred,
      };
      return deferred;
    };

    (global as any).RecordType = {
      find: sinon.stub().returns(mockDeferred([])),
      create: sinon.stub().returns(mockDeferred({})),
      destroy: sinon.stub().returns(mockDeferred([])),
      findOne: sinon.stub().returns(mockDeferred({})),
    };

    service = new Services.RecordTypes();
  });

  afterEach(function () {
    cleanupServiceTestGlobals();
    delete (global as any).RecordType;
    sinon.restore();
  });

  describe('bootstrap', function () {
    it('should load existing record types', async function () {
      const brand = { id: 'brand1' };
      const existingTypes = [{ name: 'dataset', branding: 'brand1' }];

      const findStub = sinon.stub().resolves(existingTypes);
      (global as any).RecordType.find = findStub;

      const result = await service.bootstrap(brand as any);

      expect(result).to.deep.equal(existingTypes);
      expect(service.getAllCache()).to.deep.equal(existingTypes);
    });

    it('should create default record types if missing', async function () {
      const brand = { id: 'brand1' };

      const findStub = sinon.stub().resolves([]);
      (global as any).RecordType.find = findStub;

      const createDeferred = (data: unknown) => {
        const deferred = { exec: sinon.stub().yields(null, data), fetch: () => deferred };
        return deferred;
      };
      (global as any).RecordType.create.callsFake((data: unknown) => createDeferred(data));

      const result = await service.bootstrap(brand as any);

      expect(result).to.have.length(1);
      expect(result[0]).to.have.property('name', 'dataset');
      // The cache must hold the created types, not a list of `undefined`.
      expect(service.getAllCache()).to.deep.equal(result);
      expect((global as any).RecordType.create.called).to.be.true;
      expect((global as any).RecordType.create.firstCall.args[0].recordValidation).to.deep.equal({
        mode: 'shadow',
        operations: {
          publish: { mode: 'enforce', enabledValidationGroups: ['publish'] },
        },
      });
      expect((global as any).RecordType.create.firstCall.args[0].concurrentModification).to.deep.equal({
        mode: 'observe',
      });
      expect((global as any).RecordType.create.firstCall.args[0].actionPlan).to.deep.equal({
        schemaVersion: 1,
        recordTypeKey: 'dataset',
        bindings: [],
      });
      expect((global as any).RecordType.create.firstCall.args[0].automaticTransitions).to.deep.equal([
        {
          schemaVersion: 1,
          id: 'draft-to-published',
          mode: 'automatic',
          sourceStage: 'draft',
          targetStage: 'published',
          priority: 10,
          condition: 'true',
        },
      ]);
    });

    it('should destroy and recreate if bootstrapAlways is true', async function () {
      mockSails.config.appmode.bootstrapAlways = true;
      const brand = { id: 'brand1' };

      (global as any).RecordType.find.resolves([{ name: 'old' }]);
      (global as any).RecordType.destroy.resolves([]);

      const createDeferred = (data: unknown) => {
        const deferred = { exec: sinon.stub().yields(null, data), fetch: () => deferred };
        return deferred;
      };
      (global as any).RecordType.create.callsFake((data: unknown) => createDeferred(data));

      const result = await service.bootstrap(brand as any);

      expect((global as any).RecordType.destroy.called).to.be.true;
      expect((global as any).RecordType.create.called).to.be.true;
      expect(result).to.have.length(1);
    });
  });

  describe('create', function () {
    it('should create record type', async function () {
      const brand = { id: 'brand1' };
      const config = { packageType: 'pt' };
      const expected = { name: 'newType', packageType: 'pt' };

      const execStub = sinon.stub().yields(null, expected);
      const created: Record<string, unknown> = { exec: execStub };
      created.fetch = () => created;
      (global as any).RecordType.create.returns(created);

      const result = await new Promise((resolve, reject) => {
        service.create(brand as any, 'newType', config as any).subscribe(resolve, reject);
      });

      expect(result).to.deep.equal(expected);
      expect((global as any).RecordType.create.firstCall.args[0].concurrentModification).to.deep.equal({
        mode: 'last-write-wins',
      });
    });

    it('should reject a malformed explicit concurrency mode', function () {
      const brand = { id: 'brand1' };
      expect(() =>
        service.create(brand as any, 'newType', {
          packageType: 'pt',
          concurrentModification: { mode: 'invalid' },
        } as any)
      ).to.throw(TypeError);
      expect((global as any).RecordType.create.called).to.be.false;
    });
  });

  describe('get', function () {
    it('should find one record type', async function () {
      const brand = { id: 'brand1' };
      const expected = { name: 'type1' };

      const execStub = sinon.stub().yields(null, expected);
      (global as any).RecordType.findOne.returns({ exec: execStub });

      const result = await new Promise((resolve, reject) => {
        service.get(brand as any, 'type1').subscribe(resolve, reject);
      });

      expect(result).to.deep.equal(expected);
      expect((global as any).RecordType.findOne.calledWith(sinon.match({ where: { name: 'type1' } }))).to.be.true;
      // Reads return the stored model verbatim: defaulting belongs to the
      // policy resolver and the discovery response, not to a read.
      expect((result as any).concurrentModification).to.equal(undefined);
    });
  });

  describe('concurrent modification policy', function () {
    it('normalizes discovery responses with the compatibility default', function () {
      const response = new RecordTypeResponseModel('dataset', 'pt', [], true);
      expect(response.concurrentModification).to.deep.equal({ mode: 'last-write-wins' });

      const strictResponse = new RecordTypeResponseModel('dataset', 'pt', [], true, [], { mode: 'strict' });
      expect(strictResponse.concurrentModification).to.deep.equal({ mode: 'strict' });
    });

    it('reports the default rather than failing discovery for corrupt stored policy', function () {
      // One unreadable stored policy must not break listing every record type;
      // the mutation boundary still refuses the same value.
      const response = new RecordTypeResponseModel('dataset', 'pt', [], true, [], { mode: 'permissive' });
      expect(response.concurrentModification).to.deep.equal({ mode: 'last-write-wins' });
    });

    it('resolves each request from the current persisted record type', async function () {
      const brand = { id: 'brand1' };
      let storedRecordType: Record<string, unknown> = {
        name: 'dataset',
        concurrentModification: { mode: 'observe' },
      };
      (global as any).RecordType.findOne.callsFake(() => ({
        exec: (callback: (error: unknown, result: unknown) => void) => callback(null, storedRecordType),
      }));

      expect(await firstValueFrom(service.resolveConcurrentModificationMode(brand as any, 'dataset'))).to.equal(
        'observe'
      );

      // Neither request/config candidates nor the record carry a copied mode;
      // changing the authoritative type therefore applies on the next lookup.
      mockSails.config.recordtype.dataset.concurrentModification = { mode: 'strict' };
      storedRecordType = {
        name: 'dataset',
        concurrentModification: { mode: 'last-write-wins' },
      };
      expect(await firstValueFrom(service.resolveConcurrentModificationMode(brand as any, 'dataset'))).to.equal(
        'last-write-wins'
      );
      expect((global as any).RecordType.findOne.callCount).to.equal(2);
      expect(
        (global as any).RecordType.findOne.alwaysCalledWith(
          sinon.match({
            where: { branding: 'brand1', name: 'dataset' },
            select: ['concurrentModification'],
          })
        )
      ).to.equal(true);
    });

    it('fails closed when persisted policy is malformed', async function () {
      (global as any).RecordType.findOne.returns({
        exec: (callback: (error: unknown, result: unknown) => void) =>
          callback(null, {
            name: 'dataset',
            concurrentModification: { mode: 'invalid' },
          }),
      });

      let failure: unknown;
      try {
        await firstValueFrom(service.resolveConcurrentModificationMode({ id: 'brand1' } as any, 'dataset'));
      } catch (error) {
        failure = error;
      }
      expect(failure).to.be.instanceOf(TypeError);
    });

    it('fails closed at runtime when a strict policy uses an unsupported adapter', async function () {
      mockSails.services.teststorage = {};
      (global as any).RecordType.findOne.returns({
        exec: (callback: (error: unknown, result: unknown) => void) =>
          callback(null, {
            name: 'dataset',
            concurrentModification: { mode: 'strict' },
          }),
      });

      let failure: any;
      try {
        await firstValueFrom(service.resolveConcurrentModificationMode({ id: 'brand1' } as any, 'dataset'));
      } catch (error) {
        failure = error;
      }
      expect(failure?.code).to.equal('record-concurrency-capability-unavailable');
    });
  });

  describe('storage capability startup gate', function () {
    it('rejects an existing strict type when the adapter declaration is absent', async function () {
      mockSails.services.teststorage = {};
      (global as any).RecordType.find.resolves([
        {
          name: 'dataset',
          concurrentModification: { mode: 'strict' },
        },
      ]);

      let failure: any;
      try {
        await service.bootstrap({ id: 'brand1' } as any);
      } catch (error) {
        failure = error;
      }
      expect(failure?.code).to.equal('record-concurrency-capability-unavailable');
    });

    it('accepts an existing strict type with the complete adapter declaration', async function () {
      const types = [{ name: 'dataset', concurrentModification: { mode: 'strict' } }];
      (global as any).RecordType.find.resolves(types);
      expect(await service.bootstrap({ id: 'brand1' } as any)).to.deep.equal(types);
    });
  });

  describe('getAll', function () {
    it('should find all record types', async function () {
      const brand = { id: 'brand1' };
      const expected = [{ name: 'type1' }];

      const execStub = sinon.stub().yields(null, expected);
      (global as any).RecordType.find.returns({ exec: execStub });

      const result = await new Promise((resolve, reject) => {
        service.getAll(brand as any).subscribe(resolve, reject);
      });

      expect(result).to.deep.equal(expected);
    });
  });

  describe('exports', function () {
    it('should export all public methods', function () {
      const exported = service.exports();
      expect(exported).to.have.property('bootstrap');
      expect(exported).to.have.property('create');
      expect(exported).to.have.property('get');
      expect(exported).to.have.property('getAll');
      expect(exported).to.have.property('getAllCache');
      expect(exported).to.have.property('assertConcurrentModificationCapability');
      expect(exported).to.have.property('resolveConcurrentModificationMode');
      expect(exported).to.have.property('resolveConcurrentModificationPolicy');
    });
  });
});
