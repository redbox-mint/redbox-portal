let expect: Chai.ExpectStatic;
import("chai").then(mod => expect = mod.expect);
import * as sinon from 'sinon';
import { setupServiceTestGlobals, cleanupServiceTestGlobals, createMockSails } from './testHelper';

describe('StorageManagerService', function () {
  let mockSails: any;

  beforeEach(function () {
    mockSails = createMockSails({
      config: {
        appPath: '/app',
        storage: {
          serviceName: 'standarddatastreamservice',
          defaultDisk: 'primary',
          stagingDisk: 'staging',
          primaryDisk: 'primary',
          disks: {
            staging: {
              driver: 'fs',
              config: { root: '/tmp/test-staging' },
            },
            primary: {
              driver: 'fs',
              config: { root: '/tmp/test-primary' },
            },
          },
        },
      },
    });
    setupServiceTestGlobals(mockSails);
  });

  afterEach(function () {
    cleanupServiceTestGlobals();
    sinon.restore();
  });

  describe('exports', function () {
    it('should export bootstrap, disk, stagingDisk, primaryDisk, and isBootstrapped methods', function () {
      const { Services } = require('../../src/services/StorageManagerService');
      const service = new Services.StorageManager();
      const exported = service.exports();

      expect(exported).to.have.property('bootstrap');
      expect(exported).to.have.property('disk');
      expect(exported).to.have.property('stagingDisk');
      expect(exported).to.have.property('primaryDisk');
      expect(exported).to.have.property('isBootstrapped');
    });
  });

  describe('bootstrap', function () {
    it('should fall back to default disks when no disks are configured', async function () {
      mockSails.config.storage.disks = {};
      setupServiceTestGlobals(mockSails);

      const { Services } = require('../../src/services/StorageManagerService');
      const service = new Services.StorageManager();

      const mockDisk = { exists: sinon.stub(), get: sinon.stub() };
      (service as any)._DiskConstructor = class {
        constructor(_driver: unknown) {
          return mockDisk;
        }
      };
      (service as any)._FSDriver = class {
        constructor(_opts: unknown) { }
      };

      await service.bootstrap();

      expect(service.isBootstrapped()).to.be.true;
      expect(service.disk('staging')).to.equal(mockDisk);
    });

    it('should fall back to default disks when disks is undefined', async function () {
      mockSails.config.storage.disks = undefined;
      setupServiceTestGlobals(mockSails);

      const { Services } = require('../../src/services/StorageManagerService');
      const service = new Services.StorageManager();

      const mockDisk = { exists: sinon.stub(), get: sinon.stub() };
      (service as any)._DiskConstructor = class {
        constructor(_driver: unknown) {
          return mockDisk;
        }
      };
      (service as any)._FSDriver = class {
        constructor(_opts: unknown) { }
      };

      await service.bootstrap();

      expect(service.isBootstrapped()).to.be.true;
      expect(service.disk('staging')).to.equal(mockDisk);
    });

    it('should throw if stagingDisk references a non-existent disk', async function () {
      mockSails.config.storage.stagingDisk = 'nonexistent';
      setupServiceTestGlobals(mockSails);

      const { Services } = require('../../src/services/StorageManagerService');
      const service = new Services.StorageManager();

      try {
        await service.bootstrap();
        expect.fail('Should have thrown');
      } catch (err: any) {
        expect(err.message).to.include("stagingDisk 'nonexistent' is not defined");
      }
    });

    it('should throw if primaryDisk references a non-existent disk', async function () {
      mockSails.config.storage.primaryDisk = 'nonexistent';
      setupServiceTestGlobals(mockSails);

      const { Services } = require('../../src/services/StorageManagerService');
      const service = new Services.StorageManager();

      try {
        await service.bootstrap();
        expect.fail('Should have thrown');
      } catch (err: any) {
        expect(err.message).to.include("primaryDisk 'nonexistent' is not defined");
      }
    });

    it('should not re-bootstrap if already bootstrapped', async function () {
      const { Services } = require('../../src/services/StorageManagerService');
      const service = new Services.StorageManager();

      // Manually inject a mock Disk constructor to simulate processDynamicImports having run
      const mockDiskInstance = { exists: sinon.stub(), get: sinon.stub() };
      (service as any)._DiskConstructor = class {
        constructor(_driver: unknown) {
          return mockDiskInstance;
        }
      };
      (service as any)._FSDriver = class {
        constructor(_opts: unknown) { }
      };

      await service.bootstrap();
      expect(service.isBootstrapped()).to.be.true;

      // Second call should be a no-op
      await service.bootstrap();
      expect(service.isBootstrapped()).to.be.true;
    });

    it('should create disks when Disk constructor is available', async function () {
      const { Services } = require('../../src/services/StorageManagerService');
      const service = new Services.StorageManager();

      const createdDisks: unknown[] = [];
      (service as any)._DiskConstructor = class {
        constructor(driver: unknown) {
          createdDisks.push(driver);
        }
        exists() {
          return Promise.resolve(false);
        }
      };
      (service as any)._FSDriver = class {
        location: string;
        constructor(opts: { location: string }) {
          this.location = opts.location;
        }
      };

      await service.bootstrap();

      expect(service.isBootstrapped()).to.be.true;
      // Should have created 2 disks: staging and primary
      expect(createdDisks).to.have.length(2);
    });
  });

  describe('disk', function () {
    it('should throw when requesting an unregistered disk', function () {
      const { Services } = require('../../src/services/StorageManagerService');
      const service = new Services.StorageManager();

      try {
        service.disk('nonexistent');
        expect.fail('Should have thrown');
      } catch (err: any) {
        expect(err.message).to.include("disk 'nonexistent' is not registered");
      }
    });

    it('should return a registered disk by name', async function () {
      const { Services } = require('../../src/services/StorageManagerService');
      const service = new Services.StorageManager();

      const mockDisk = { exists: sinon.stub(), get: sinon.stub() };
      (service as any)._DiskConstructor = class {
        constructor(_driver: unknown) {
          return mockDisk;
        }
      };
      (service as any)._FSDriver = class {
        constructor(_opts: unknown) { }
      };

      await service.bootstrap();

      const disk = service.disk('staging');
      expect(disk).to.equal(mockDisk);
    });
  });

  describe('stagingDisk', function () {
    it('should return the disk configured as stagingDisk', async function () {
      const { Services } = require('../../src/services/StorageManagerService');
      const service = new Services.StorageManager();

      const diskMap = new Map<string, unknown>();
      const mockStagingDisk = { exists: sinon.stub(), name: 'staging-disk' };
      const mockPrimaryDisk = { exists: sinon.stub(), name: 'primary-disk' };

      (service as any)._DiskConstructor = class {
        name: string = '';
        constructor(_driver: any) {
          const disk = _driver._name === 'staging' ? mockStagingDisk : mockPrimaryDisk;
          diskMap.set(_driver._name, disk);
          return disk;
        }
      };
      (service as any)._FSDriver = class {
        _name: string;
        constructor(opts: any) {
          // Use the location to identify which disk this is
          this._name = opts.location.includes('staging') ? 'staging' : 'primary';
        }
      };

      await service.bootstrap();

      const staging = service.stagingDisk();
      expect(staging).to.have.property('name', 'staging-disk');
    });
  });

  describe('primaryDisk', function () {
    it('should return the disk configured as primaryDisk', async function () {
      const { Services } = require('../../src/services/StorageManagerService');
      const service = new Services.StorageManager();

      const mockStagingDisk = { exists: sinon.stub(), name: 'staging-disk' };
      const mockPrimaryDisk = { exists: sinon.stub(), name: 'primary-disk' };

      (service as any)._DiskConstructor = class {
        constructor(_driver: any) {
          return _driver._name === 'staging' ? mockStagingDisk : mockPrimaryDisk;
        }
      };
      (service as any)._FSDriver = class {
        _name: string;
        constructor(opts: any) {
          this._name = opts.location.includes('staging') ? 'staging' : 'primary';
        }
      };

      await service.bootstrap();

      const primary = service.primaryDisk();
      expect(primary).to.have.property('name', 'primary-disk');
    });
  });

  describe('createDriver', function () {
    it('should throw if FSDriver is not available but disk requires it', async function () {
      const { Services } = require('../../src/services/StorageManagerService');
      const service = new Services.StorageManager();

      // _FSDriver is null by default (no dynamic import ran)
      (service as any)._DiskConstructor = class {
        constructor(_driver: unknown) { }
      };
      // Leave _FSDriver as null

      try {
        await service.bootstrap();
        expect.fail('Should have thrown');
      } catch (err: any) {
        expect(err.message).to.include('FSDriver not available');
      }
    });

    it('should throw for an unknown driver type', async function () {
      mockSails.config.storage.disks = {
        custom: {
          driver: 'gcs',
          config: { bucket: 'test' },
        },
      };
      mockSails.config.storage.stagingDisk = undefined;
      mockSails.config.storage.primaryDisk = undefined;
      setupServiceTestGlobals(mockSails);

      const { Services } = require('../../src/services/StorageManagerService');
      const service = new Services.StorageManager();

      (service as any)._DiskConstructor = class {
        constructor(_driver: unknown) { }
      };

      try {
        await service.bootstrap();
        expect.fail('Should have thrown');
      } catch (err: any) {
        expect(err.message).to.include("Unknown driver 'gcs'");
      }
    });

    it('should throw if S3Driver is not available but disk requires it', async function () {
      mockSails.config.storage.disks = {
        s3disk: {
          driver: 's3',
          config: {
            key: 'AK',
            secret: 'SK',
            bucket: 'my-bucket',
            region: 'us-east-1',
          },
        },
      };
      mockSails.config.storage.stagingDisk = undefined;
      mockSails.config.storage.primaryDisk = undefined;
      setupServiceTestGlobals(mockSails);

      const { Services } = require('../../src/services/StorageManagerService');
      const service = new Services.StorageManager();

      (service as any)._DiskConstructor = class {
        constructor(_driver: unknown) { }
      };
      // Leave _S3Driver as null

      try {
        await service.bootstrap();
        expect.fail('Should have thrown');
      } catch (err: any) {
        expect(err.message).to.include('S3Driver not available');
      }
    });

    it('should create an S3 driver when S3Driver is available', async function () {
      mockSails.config.storage.disks = {
        s3disk: {
          driver: 's3',
          config: {
            key: 'AK',
            secret: 'SK',
            bucket: 'my-bucket',
            region: 'us-east-1',
            endpoint: 'http://localhost:9000',
          },
        },
      };
      mockSails.config.storage.stagingDisk = undefined;
      mockSails.config.storage.primaryDisk = undefined;
      setupServiceTestGlobals(mockSails);

      const { Services } = require('../../src/services/StorageManagerService');
      const service = new Services.StorageManager();

      let capturedOpts: any = null;
      (service as any)._DiskConstructor = class {
        constructor(_driver: unknown) { }
        exists() {
          return Promise.resolve(false);
        }
      };
      (service as any)._S3Driver = class {
        constructor(opts: any) {
          capturedOpts = opts;
        }
      };

      await service.bootstrap();

      expect(capturedOpts).to.not.be.null;
      expect(capturedOpts.credentials.accessKeyId).to.equal('AK');
      expect(capturedOpts.credentials.secretAccessKey).to.equal('SK');
      expect(capturedOpts.bucket).to.equal('my-bucket');
      expect(capturedOpts.region).to.equal('us-east-1');
      expect(capturedOpts.endpoint).to.equal('http://localhost:9000');
    });
  });
});
