import { expect } from 'chai';
import { Readable } from 'node:stream';
import { Datastream } from '../../../packages/redbox-core/src/Datastream.ts';
import { Services as StandardDatastreamServices } from '../../../packages/redbox-core/src/services/StandardDatastreamService.ts';

describe('StandardDatastreamService', function () {
  let originalServices: Record<string, unknown> | undefined;
  let calls: {
    exists: number;
    getStream: number;
    putStream: number;
    delete: number;
    getMetaData: number;
    listAll: number;
    metadataUpsert: number;
    metadataDelete: number;
    metadataFindByOid: number;
    metadataFindOne: number;
    recordAccess: number;
  };
  let recordedKeys: {
    putStreamKey?: string;
    listPrefix?: string;
  };
  let metadataRows: Array<Record<string, unknown>>;
  let auditRows: Array<Record<string, unknown>>;
  let primaryFiles: string[];
  let failMetadataUpsert: boolean;
  let failRecordAccess: boolean;
  let nextMetaId: number;
  let diskLastModified: unknown;

  beforeEach(function () {
    originalServices = sails.services;
    calls = {
      exists: 0,
      getStream: 0,
      putStream: 0,
      delete: 0,
      getMetaData: 0,
      listAll: 0,
      metadataUpsert: 0,
      metadataDelete: 0,
      metadataFindByOid: 0,
      metadataFindOne: 0,
      recordAccess: 0,
    };
    recordedKeys = {};
    metadataRows = [];
    auditRows = [];
    primaryFiles = ['attachments/oid-1/file-1'];
    failMetadataUpsert = false;
    failRecordAccess = false;
    nextMetaId = 0;
    diskLastModified = new Date('2024-01-01T00:00:00.000Z');

    const createMetadataId = (): string => {
      const maxExistingId = metadataRows.reduce((maxId, row) => {
        const match = String(row.id ?? '').match(/^meta-(\d+)$/);
        return match ? Math.max(maxId, Number(match[1])) : maxId;
      }, 0);
      nextMetaId = Math.max(nextMetaId, maxExistingId) + 1;
      return `meta-${nextMetaId}`;
    };

    const stagingDisk = {
      exists: async () => {
        calls.exists += 1;
        return true;
      },
      move: async (_source: string, _destination: string) => undefined,
      putStream: async (_key: string, _contents: Readable) => undefined,
      getStream: async (_key: string) => {
        calls.getStream += 1;
        return Readable.from(['data']);
      },
      delete: async (_key: string) => {
        calls.delete += 1;
      },
      getMetaData: async (_key: string) => ({ contentType: 'text/plain', contentLength: 4, etag: 'stage-etag', lastModified: diskLastModified }),
      listAll: async (_prefix?: string) => ({ objects: [] }),
    };

    const primaryDisk = {
      putStream: async (_key: string, _contents: Readable) => {
        calls.putStream += 1;
        recordedKeys.putStreamKey = _key;
        if (!primaryFiles.includes(_key)) {
          primaryFiles.push(_key);
        }
      },
      exists: async (_key: string) => primaryFiles.includes(_key),
      getStream: async (_key: string) => Readable.from(['data']),
      getMetaData: async (_key: string) => {
        calls.getMetaData += 1;
        return {
          contentType: 'text/plain',
          contentLength: 4,
          etag: `etag-${_key}`,
          lastModified: diskLastModified
        };
      },
      listAll: async (_prefix?: string) => {
        calls.listAll += 1;
        recordedKeys.listPrefix = _prefix;
        return {
          objects: primaryFiles
            .filter(key => !_prefix || key.startsWith(_prefix))
            .map(key => ({ key }))
        };
      },
      delete: async (_key: string) => {
        primaryFiles = primaryFiles.filter(key => key !== _key);
      },
      move: async (_source: string, _destination: string) => undefined,
      get: async (_key: string) => '',
      getBytes: async (_key: string) => new Uint8Array(),
      put: async (_key: string, _contents: string | Uint8Array) => undefined,
      copy: async (_source: string, _destination: string) => undefined,
      copyFromFs: async (_source: string | URL, _destination: string) => undefined,
      moveFromFs: async (_source: string | URL, _destination: string) => undefined,
      deleteAll: async (_prefix?: string) => undefined,
    };

    const attachmentMetadataService = {
      upsert: async (row: Record<string, unknown>) => {
        calls.metadataUpsert += 1;
        if (failMetadataUpsert) {
          throw new Error('metadata upsert failed');
        }
        const existingIndex = metadataRows.findIndex(existing => existing.storageKey === row.storageKey);
        const merged = {
          ...metadataRows[existingIndex],
          ...row,
          id: metadataRows[existingIndex]?.id ?? createMetadataId(),
        };
        if (existingIndex >= 0) {
          metadataRows[existingIndex] = merged;
        } else {
          metadataRows.push(merged);
        }
      },
      findByOid: async (oid: string) => {
        calls.metadataFindByOid += 1;
        return metadataRows.filter(row => row.oid === oid) as any[];
      },
      findOneByStorageKey: async (storageKey: string) => {
        calls.metadataFindOne += 1;
        return metadataRows.find(row => row.storageKey === storageKey) as any;
      },
      deleteByStorageKey: async (storageKey: string) => {
        calls.metadataDelete += 1;
        metadataRows = metadataRows.filter(row => row.storageKey !== storageKey);
      },
      recordAccess: async (event: Record<string, unknown>) => {
        calls.recordAccess += 1;
        if (failRecordAccess) {
          throw new Error('record access failed');
        }
        auditRows.push(event);
        if (event.storageKey && event.action !== 'list') {
          const row = metadataRows.find(entry => entry.storageKey === event.storageKey);
          if (row) {
            row.lastAccessedAt = new Date().toISOString();
            row.lastAccessedBy = event.accessedBy;
            row.accessCount = Number(row.accessCount ?? 0) + (event.action === 'download' || event.action === 'access' ? 1 : 0);
          }
        }
      },
    };

    sails.services = {
      ...sails.services,
      storagemanagerservice: {
        stagingDisk: () => stagingDisk,
        primaryDisk: () => primaryDisk,
        getMergedStorageConfig: () => ({ keyPrefix: 'attachments/' }),
        disk: (_name: string) => primaryDisk,
        isBootstrapped: () => true,
      },
      attachmentmetadataservice: attachmentMetadataService,
    } as Record<string, unknown>;
    (global as any).StorageManagerService = (sails.services as any).storagemanagerservice;
  });

  afterEach(function () {
    sails.services = originalServices as Record<string, unknown>;
    delete (global as any).StorageManagerService;
  });

  it('promotes files from staging to primary without cross-disk move', async function () {
    const service = new StandardDatastreamServices.StandardDatastream();
    const ds = new Datastream({ fileId: 'file-1', name: 'Paper.pdf', mimeType: 'application/pdf', attachmentField: 'files' });

    await service.addDatastream('oid-1', ds);

    expect(calls.exists).to.equal(1);
    expect(calls.getStream).to.equal(1);
    expect(calls.putStream).to.equal(1);
    expect(calls.delete).to.equal(1);
    expect(recordedKeys.putStreamKey).to.equal('attachments/oid-1/file-1');
    expect(calls.metadataUpsert).to.equal(1);
    expect(calls.recordAccess).to.equal(1);
    expect(metadataRows[0].filename).to.equal('Paper.pdf');
    expect(metadataRows[0].mimeType).to.equal('application/pdf');
    expect(metadataRows[0].attachmentField).to.equal('files');
    expect(auditRows[0].action).to.equal('upload');
  });

  it('lists datastreams using the configured key prefix', async function () {
    const service = new StandardDatastreamServices.StandardDatastream();

    await service.listDatastreams('oid-1', '');

    expect(recordedKeys.listPrefix).to.equal('attachments/oid-1/');
  });

  it('removes metadata row and writes remove audit on delete', async function () {
    const service = new StandardDatastreamServices.StandardDatastream();
    metadataRows.push({ oid: 'oid-1', fileId: 'file-1', storageKey: 'attachments/oid-1/file-1' });

    await service.removeDatastream('oid-1', new Datastream({ fileId: 'file-1' }));

    expect(calls.metadataDelete).to.equal(1);
    expect(metadataRows).to.have.length(0);
    expect(auditRows).to.have.length(1);
    expect(auditRows[0].action).to.equal('remove');
  });

  it('records download access and reuses stored metadata for getDatastream', async function () {
    const service = new StandardDatastreamServices.StandardDatastream();
    metadataRows.push({
      oid: 'oid-1',
      fileId: 'file-1',
      storageKey: 'attachments/oid-1/file-1',
      contentType: 'application/pdf',
      contentLength: 42,
      accessCount: 0,
    });

    const response = await service.getDatastream('oid-1', 'file-1', { username: 'alice' });

    expect(response.contentType).to.equal('application/pdf');
    expect(response.size).to.equal(42);
    expect(calls.getMetaData).to.equal(0);
    expect(auditRows).to.have.length(1);
    expect(auditRows[0].action).to.equal('download');
    expect(auditRows[0].accessedBy).to.equal('alice');
    expect(metadataRows[0].accessCount).to.equal(1);
  });

  it('listDatastreams uses metadata rows when present and writes one list audit row', async function () {
    const service = new StandardDatastreamServices.StandardDatastream();
    metadataRows.push({
      oid: 'oid-1',
      fileId: 'file-1',
      storageKey: 'attachments/oid-1/file-1',
      filename: 'Report.docx',
      mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      contentLength: 10,
    });

    const response = await service.listDatastreams('oid-1', '', { username: 'bob' });

    expect(calls.getMetaData).to.equal(0);
    expect(response).to.have.length(1);
    expect(response[0].metadata['name']).to.equal('Report.docx');
    expect(auditRows).to.have.length(1);
    expect(auditRows[0].action).to.equal('list');
    expect(auditRows[0].itemCount).to.equal(1);
    expect(auditRows[0].accessedBy).to.equal('bob');
  });

  it('listDatastreams falls back to disk metadata and backfills rows when missing', async function () {
    const service = new StandardDatastreamServices.StandardDatastream();
    metadataRows = [];

    const response = await service.listDatastreams('oid-1', '');

    expect(calls.getMetaData).to.equal(1);
    expect(calls.metadataUpsert).to.equal(1);
    expect(response).to.have.length(1);
    expect(metadataRows).to.have.length(1);
    expect(auditRows).to.have.length(1);
    expect(auditRows[0].action).to.equal('list');
  });

  it('listDatastreams backfill tolerates missing disk lastModified', async function () {
    const service = new StandardDatastreamServices.StandardDatastream();
    metadataRows = [];
    diskLastModified = undefined;

    const response = await service.listDatastreams('oid-1', '');

    expect(response).to.have.length(1);
    expect(metadataRows).to.have.length(1);
    expect(metadataRows[0].lastModified).to.equal(undefined);
  });

  it('assigns unique metadata ids when rows are recreated after delete', async function () {
    const service = new StandardDatastreamServices.StandardDatastream();

    await service.addDatastream('oid-1', new Datastream({ fileId: 'file-2' }));
    const firstId = metadataRows[0].id;

    await service.removeDatastream('oid-1', new Datastream({ fileId: 'file-2' }));
    await service.addDatastream('oid-1', new Datastream({ fileId: 'file-3' }));

    expect(metadataRows).to.have.length(1);
    expect(metadataRows[0].id).to.not.equal(firstId);
  });

  it('metadata or audit failures do not break addDatastream and getDatastream', async function () {
    const service = new StandardDatastreamServices.StandardDatastream();
    failMetadataUpsert = true;
    failRecordAccess = true;

    await service.addDatastream('oid-1', new Datastream({ fileId: 'file-1' }));
    const response = await service.getDatastream('oid-1', 'file-1');

    expect(response.readstream).to.exist;
  });
});
