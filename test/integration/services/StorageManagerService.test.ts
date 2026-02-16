import { expect } from 'chai';
import { Services as StorageManagerServices } from '../../../packages/redbox-core-types/src/services/StorageManagerService';
import { Readable } from 'node:stream';

describe('StorageManagerService', function () {
  let originalStorageConfig: unknown;
  let manager: InstanceType<typeof StorageManagerServices.StorageManager>;

  beforeEach(function () {
    originalStorageConfig = (sails.config as Record<string, unknown>).storage;
    (sails.config as Record<string, unknown>).storage = {
      serviceName: 'standarddatastreamservice',
      defaultDisk: 'primary',
      stagingDisk: 'staging',
      primaryDisk: 'primary',
      disks: {
        staging: { driver: 'fs', config: { root: '/tmp/staging' } },
        primary: { driver: 'fs', config: { root: '/tmp/primary' } },
      },
    };

    manager = new StorageManagerServices.StorageManager();

    (manager as unknown as { _DiskConstructor: (new (driver: unknown) => unknown) | null })._DiskConstructor = class {
      constructor(_driver: unknown) {
        return {
          exists: async () => false,
          get: async () => '',
          getStream: async () => Readable.from([]),
          getBytes: async () => new Uint8Array(),
          getMetaData: async () => ({ contentLength: 0, etag: '', lastModified: new Date() }),
          put: async () => {},
          putStream: async () => {},
          copy: async () => {},
          copyFromFs: async () => {},
          move: async () => {},
          moveFromFs: async () => {},
          delete: async () => {},
          deleteAll: async () => {},
          listAll: async () => ({ objects: [] }),
        };
      }
    };
    (
      manager as unknown as {
        _FSDriver: (new (opts: { location: string | URL; visibility?: string }) => unknown) | null;
      }
    )._FSDriver = class {
      constructor(_opts: { location: string | URL; visibility?: string }) {}
    };
  });

  afterEach(function () {
    (sails.config as Record<string, unknown>).storage = originalStorageConfig;
  });

  it('bootstraps configured disks and resolves them', async function () {
    await manager.bootstrap();
    const staging = manager.stagingDisk();
    const primary = manager.primaryDisk();

    expect(staging).to.exist;
    expect(primary).to.exist;
    expect(manager.isBootstrapped()).to.equal(true);
  });

  it('throws when staging disk name is not configured', async function () {
    (sails.config as Record<string, unknown>).storage = {
      serviceName: 'standarddatastreamservice',
      stagingDisk: 'missing',
      primaryDisk: 'primary',
      disks: {
        primary: { driver: 'fs', config: { root: '/tmp/primary' } },
      },
    };

    try {
      await manager.bootstrap();
      expect.fail('Should have thrown');
    } catch (err: any) {
      expect(err.message).to.include("stagingDisk 'missing' is not defined");
    }
  });
});
