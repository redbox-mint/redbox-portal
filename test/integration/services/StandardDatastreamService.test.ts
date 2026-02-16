import { expect } from 'chai';
import { Readable } from 'node:stream';
import { Datastream } from '../../../packages/redbox-core-types/src/Datastream';
import { Services as StandardDatastreamServices } from '../../../packages/redbox-core-types/src/services/StandardDatastreamService';

describe('StandardDatastreamService', function () {
  let originalServices: Record<string, unknown> | undefined;
  let calls: {
    exists: number;
    move: number;
    putStream: number;
    delete: number;
  };

  beforeEach(function () {
    originalServices = sails.services;
    calls = {
      exists: 0,
      move: 0,
      putStream: 0,
      delete: 0,
    };

    const stagingDisk = {
      exists: async () => {
        calls.exists += 1;
        return true;
      },
      move: async (_source: string, _destination: string) => {
        calls.move += 1;
      },
      putStream: async (_key: string, _contents: Readable) => {},
      getStream: async (_key: string) => Readable.from([]),
      delete: async (_key: string) => {
        calls.delete += 1;
      },
      getMetaData: async (_key: string) => ({ contentLength: 0, etag: '', lastModified: new Date() }),
      listAll: async (_prefix?: string) => ({ objects: [] }),
    };

    const primaryDisk = {
      putStream: async (_key: string, _contents: Readable) => {
        calls.putStream += 1;
      },
      exists: async (_key: string) => true,
      getStream: async (_key: string) => Readable.from([]),
      getMetaData: async (_key: string) => ({ contentLength: 0, etag: '', lastModified: new Date() }),
      listAll: async (_prefix?: string) => ({ objects: [] }),
      delete: async (_key: string) => {},
      move: async (_source: string, _destination: string) => {},
      get: async (_key: string) => '',
      getBytes: async (_key: string) => new Uint8Array(),
      put: async (_key: string, _contents: string | Uint8Array) => {},
      copy: async (_source: string, _destination: string) => {},
      copyFromFs: async (_source: string | URL, _destination: string) => {},
      moveFromFs: async (_source: string | URL, _destination: string) => {},
      deleteAll: async (_prefix?: string) => {},
    };

    sails.services = {
      ...sails.services,
      storagemanagerservice: {
        stagingDisk: () => stagingDisk,
        primaryDisk: () => primaryDisk,
        disk: (_name: string) => primaryDisk,
        isBootstrapped: () => true,
      },
    } as Record<string, unknown>;
    (global as any).StorageManagerService = (sails.services as any).storagemanagerservice;
  });

  afterEach(function () {
    sails.services = originalServices as Record<string, unknown>;
    delete (global as any).StorageManagerService;
  });

  it('moves files from staging to primary when available', async function () {
    const service = new StandardDatastreamServices.StandardDatastream();
    const ds = new Datastream({ fileId: 'file-1' });

    await service.addDatastream('oid-1', ds);

    expect(calls.exists).to.equal(1);
    expect(calls.move).to.equal(1);
    expect(calls.putStream).to.equal(0);
    expect(calls.delete).to.equal(0);
  });
});
