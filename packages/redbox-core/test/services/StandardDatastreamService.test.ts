let expect: Chai.ExpectStatic;
import("chai").then(mod => expect = mod.expect);
import * as sinon from 'sinon';
import { of } from 'rxjs';
import { Readable } from 'node:stream';
import { setupServiceTestGlobals, cleanupServiceTestGlobals, createMockSails } from './testHelper';
import { Datastream } from '../../src/Datastream';

async function waitFor(predicate: () => boolean): Promise<void> {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    if (predicate()) {
      return;
    }
    await new Promise(resolve => setImmediate(resolve));
  }
}

describe('StandardDatastreamService', function () {
  let mockSails: any;
  let mockStorageManager: any;
  let mockStagingDisk: any;
  let mockPrimaryDisk: any;

  beforeEach(function () {
    // Create mock disks
    mockStagingDisk = {
      exists: sinon.stub().resolves(true),
      get: sinon.stub().resolves('file-contents'),
      getStream: sinon.stub().resolves(Readable.from(Buffer.from('test-data'))),
      move: sinon.stub().rejects(new Error('move not supported')),
      getBytes: sinon.stub().resolves(new Uint8Array([1, 2, 3])),
      getMetaData: sinon.stub().resolves({
        contentType: 'application/pdf',
        contentLength: 1024,
        etag: 'abc123',
        lastModified: new Date(),
      }),
      put: sinon.stub().resolves(),
      putStream: sinon.stub().resolves(),
      delete: sinon.stub().resolves(),
      deleteAll: sinon.stub().resolves(),
      listAll: sinon.stub().resolves({ objects: [] }),
    };

    mockPrimaryDisk = {
      exists: sinon.stub().resolves(true),
      get: sinon.stub().resolves('file-contents'),
      getStream: sinon.stub().resolves(Readable.from(Buffer.from('test-data'))),
      getBytes: sinon.stub().resolves(new Uint8Array([1, 2, 3])),
      getMetaData: sinon.stub().resolves({
        contentType: 'application/pdf',
        contentLength: 1024,
        etag: 'abc123',
        lastModified: new Date(),
      }),
      put: sinon.stub().resolves(),
      putStream: sinon.stub().resolves(),
      delete: sinon.stub().resolves(),
      deleteAll: sinon.stub().resolves(),
      listAll: sinon.stub().resolves({ objects: [] }),
    };

    mockStorageManager = {
      stagingDisk: sinon.stub().returns(mockStagingDisk),
      primaryDisk: sinon.stub().returns(mockPrimaryDisk),
      getMergedStorageConfig: sinon.stub().returns({ keyPrefix: 'attachments/' }),
      disk: sinon.stub().callsFake((name: string) => {
        if (name === 'staging') return mockStagingDisk;
        if (name === 'primary') return mockPrimaryDisk;
        throw new Error(`Unknown disk: ${name}`);
      }),
      isBootstrapped: sinon.stub().returns(true),
    };

    mockSails = createMockSails({
      config: {
        appPath: '/app',
        storage: {
          serviceName: 'standarddatastreamservice',
          defaultDisk: 'primary',
          stagingDisk: 'staging',
          primaryDisk: 'primary',
          disks: {},
        },
        record: {
          attachments: {
            file: {
              directory: '/tmp/staging',
            },
          },
        },
      },
      services: {
        storagemanagerservice: mockStorageManager,
      },
    });

    setupServiceTestGlobals(mockSails);
    (global as any).StorageManagerService = mockStorageManager;
  });

  afterEach(function () {
    const { Services } = require('../../src/services/StandardDatastreamService');
    (Services.StandardDatastream as any).promotionGuards?.clear?.();
    cleanupServiceTestGlobals();
    sinon.restore();
  });

  describe('exports', function () {
    it('should export all DatastreamService methods', function () {
      const { Services } = require('../../src/services/StandardDatastreamService');
      const service = new Services.StandardDatastream();
      const exported = service.exports();

      expect(exported).to.have.property('addDatastreams');
      expect(exported).to.have.property('updateDatastream');
      expect(exported).to.have.property('removeDatastream');
      expect(exported).to.have.property('addDatastream');
      expect(exported).to.have.property('addAndRemoveDatastreams');
      expect(exported).to.have.property('getDatastream');
      expect(exported).to.have.property('listDatastreams');
    });
  });

  describe('addDatastream', function () {
    it('should read from staging disk and write to primary disk', async function () {
      const { Services } = require('../../src/services/StandardDatastreamService');
      const service = new Services.StandardDatastream();

      const ds = new Datastream({ fileId: 'test-file-id' });
      await service.addDatastream('oid-123', ds);

      expect(mockStagingDisk.exists.calledOnce).to.be.true;
      expect(mockStagingDisk.exists.firstCall.args[0]).to.equal('test-file-id');

      // Should read from staging with just the fileId
      expect(mockStagingDisk.getStream.calledOnce).to.be.true;
      expect(mockStagingDisk.getStream.firstCall.args[0]).to.equal('test-file-id');

      // Should write to primary with oid/fileId key
      expect(mockPrimaryDisk.putStream.calledOnce).to.be.true;
      expect(mockPrimaryDisk.putStream.firstCall.args[0]).to.equal('attachments/oid-123/test-file-id');
    });

    it('should not use staging disk move for cross-disk promotion', async function () {
      const { Services } = require('../../src/services/StandardDatastreamService');
      const service = new Services.StandardDatastream();

      mockStagingDisk.move.resolves();

      const ds = new Datastream({ fileId: 'move-file-id' });
      await service.addDatastream('oid-123', ds);

      expect(mockStagingDisk.move.called).to.be.false;
      expect(mockPrimaryDisk.putStream.calledOnce).to.be.true;
      expect(mockPrimaryDisk.putStream.firstCall.args[0]).to.equal('attachments/oid-123/move-file-id');
      expect(mockStagingDisk.delete.calledOnce).to.be.true;
    });

    it('should delete the staged file only after a successful primary write', async function () {
      const { Services } = require('../../src/services/StandardDatastreamService');
      const service = new Services.StandardDatastream();

      const ds = new Datastream({ fileId: 'ordered-file-id' });
      await service.addDatastream('oid-123', ds);

      expect(mockStagingDisk.getStream.calledBefore(mockPrimaryDisk.putStream)).to.be.true;
      expect(mockPrimaryDisk.putStream.calledBefore(mockStagingDisk.delete)).to.be.true;
      expect(mockStagingDisk.delete.firstCall.args[0]).to.equal('ordered-file-id');
    });

    it('should keep the staged file when the primary write fails', async function () {
      const { Services } = require('../../src/services/StandardDatastreamService');
      const service = new Services.StandardDatastream();

      mockPrimaryDisk.putStream.rejects(new Error('primary write failed'));

      const ds = new Datastream({ fileId: 'failed-file-id' });
      try {
        await service.addDatastream('oid-123', ds);
        expect.fail('Should have thrown');
      } catch (err: any) {
        expect(err.message).to.include('primary write failed');
      }

      expect(mockStagingDisk.delete.called).to.be.false;
    });

    it('should normalize a key prefix without a trailing slash', async function () {
      const { Services } = require('../../src/services/StandardDatastreamService');
      const service = new Services.StandardDatastream();

      mockStorageManager.getMergedStorageConfig.returns({ keyPrefix: 'uploads' });

      const ds = new Datastream({ fileId: 'move-file-id' });
      await service.addDatastream('oid-123', ds);

      expect(mockPrimaryDisk.putStream.calledOnce).to.be.true;
      expect(mockPrimaryDisk.putStream.firstCall.args[0]).to.equal('uploads/oid-123/move-file-id');
    });

    it('should throw when staging file does not exist', async function () {
      const { Services } = require('../../src/services/StandardDatastreamService');
      const service = new Services.StandardDatastream();

      mockStagingDisk.exists.resolves(false);

      const ds = new Datastream({ fileId: 'missing-file' });
      try {
        await service.addDatastream('oid-123', ds);
        expect.fail('Should have thrown');
      } catch (err: any) {
        expect(err.message).to.include('Attachment not found in staging');
      }
    });
  });

  describe('addDatastreams', function () {
    it('should add multiple datastreams and return success response', async function () {
      const { Services } = require('../../src/services/StandardDatastreamService');
      const service = new Services.StandardDatastream();

      const ds1 = new Datastream({ fileId: 'file-1' });
      const ds2 = new Datastream({ fileId: 'file-2' });

      const response = await service.addDatastreams('oid-123', [ds1, ds2]);

      expect(response.success).to.be.true;
      expect(response.message).to.include('file-1');
      expect(response.message).to.include('file-2');
      expect(mockPrimaryDisk.putStream.callCount).to.equal(2);
    });

    it('should report failure when a datastream upload fails', async function () {
      const { Services } = require('../../src/services/StandardDatastreamService');
      const service = new Services.StandardDatastream();

      // Make the second getStream call fail
      mockStagingDisk.getStream.onSecondCall().rejects(new Error('read error'));

      const ds1 = new Datastream({ fileId: 'file-1' });
      const ds2 = new Datastream({ fileId: 'file-2' });

      const response = await service.addDatastreams('oid-123', [ds1, ds2]);

      expect(response.success).to.be.false;
      expect(response.message).to.include('Successfully uploaded');
      expect(response.message).to.include('Failed to upload');
    });

    it('should return success for an empty datastreams array', async function () {
      const { Services } = require('../../src/services/StandardDatastreamService');
      const service = new Services.StandardDatastream();

      const response = await service.addDatastreams('oid-123', []);

      expect(response.success).to.be.true;
    });
  });

  describe('removeDatastream', function () {
    it('should delete the file from primary disk', async function () {
      const { Services } = require('../../src/services/StandardDatastreamService');
      const service = new Services.StandardDatastream();

      const ds = new Datastream({ fileId: 'file-to-delete' });
      await service.removeDatastream('oid-123', ds);

      expect(mockPrimaryDisk.delete.calledOnce).to.be.true;
      expect(mockPrimaryDisk.delete.firstCall.args[0]).to.equal('attachments/oid-123/file-to-delete');
    });

    it('should not throw when file does not exist', async function () {
      const { Services } = require('../../src/services/StandardDatastreamService');
      const service = new Services.StandardDatastream();

      mockPrimaryDisk.delete.rejects(new Error('file not found'));

      const ds = new Datastream({ fileId: 'missing-file' });
      // Should not throw
      const result = await service.removeDatastream('oid-123', ds);
      expect(result).to.deep.equal({ success: true });
    });
  });

  describe('addAndRemoveDatastreams', function () {
    it('should add then remove datastreams in order', async function () {
      const { Services } = require('../../src/services/StandardDatastreamService');
      const service = new Services.StandardDatastream();

      const addDs = new Datastream({ fileId: 'add-file' });
      const removeDs = new Datastream({ fileId: 'remove-file' });

      await service.addAndRemoveDatastreams('oid-123', [addDs], [removeDs], mockStagingDisk);

      // Add should be called before remove
      expect(mockPrimaryDisk.putStream.calledOnce).to.be.true;
      expect(mockPrimaryDisk.delete.calledOnce).to.be.true;
      expect(mockPrimaryDisk.putStream.calledBefore(mockPrimaryDisk.delete)).to.be.true;
    });
  });

  describe('getDatastream', function () {
    it('should return an object with a readstream', async function () {
      const { Services } = require('../../src/services/StandardDatastreamService');
      const service = new Services.StandardDatastream();

      const result = await service.getDatastream('oid-123', 'file-123');

      expect(result).to.have.property('readstream');
      expect(result).to.have.property('contentType', 'application/pdf');
      expect(result).to.have.property('size', 1024);

      // Check correct key was used
      expect(mockPrimaryDisk.exists.firstCall.args[0]).to.equal('attachments/oid-123/file-123');
      expect(mockPrimaryDisk.getStream.firstCall.args[0]).to.equal('attachments/oid-123/file-123');
    });

    it('should throw when file does not exist', async function () {
      const { Services } = require('../../src/services/StandardDatastreamService');
      const service = new Services.StandardDatastream();

      mockPrimaryDisk.exists.resolves(false);
      mockStagingDisk.exists.resolves(false);

      try {
        await service.getDatastream('oid-123', 'missing-file');
        expect.fail('Should have thrown');
      } catch (err: any) {
        expect(err.message).to.include('Attachment not found');
      }
    });

    it('promotes a stranded staging file when primary is missing', async function () {
      const { Services } = require('../../src/services/StandardDatastreamService');
      const service = new Services.StandardDatastream();

      mockPrimaryDisk.exists.onFirstCall().resolves(false);
      mockPrimaryDisk.exists.onSecondCall().resolves(false);
      mockStagingDisk.exists.resolves(true);

      const result = await service.getDatastream('oid-123', 'file-123');

      expect(result).to.have.property('readstream');
      expect(mockStagingDisk.getStream.firstCall.args[0]).to.equal('file-123');
      expect(mockPrimaryDisk.putStream.firstCall.args[0]).to.equal('attachments/oid-123/file-123');
      expect(mockStagingDisk.delete.firstCall.args[0]).to.equal('file-123');
      expect(mockPrimaryDisk.getStream.firstCall.args[0]).to.equal('attachments/oid-123/file-123');
    });

    it('keeps a stranded staging file when promotion to primary fails', async function () {
      const { Services } = require('../../src/services/StandardDatastreamService');
      const service = new Services.StandardDatastream();

      mockPrimaryDisk.exists.resolves(false);
      mockStagingDisk.exists.resolves(true);
      mockPrimaryDisk.putStream.rejects(new Error('primary promotion failed'));

      try {
        await service.getDatastream('oid-123', 'file-123');
        expect.fail('Should have thrown');
      } catch (err: any) {
        expect(err.message).to.include('primary promotion failed');
      }

      expect(mockStagingDisk.delete.called).to.be.false;
    });

    it('should still return readstream when getMetaData fails', async function () {
      const { Services } = require('../../src/services/StandardDatastreamService');
      const service = new Services.StandardDatastream();

      mockPrimaryDisk.getMetaData.rejects(new Error('no metadata'));

      const result = await service.getDatastream('oid-123', 'file-123');

      expect(result).to.have.property('readstream');
      expect(result).to.have.property('contentType', '');
      expect(result).to.have.property('size', 0);
    });

    it('coalesces concurrent staging promotions for the same file', async function () {
      const { Services } = require('../../src/services/StandardDatastreamService');
      const service = new Services.StandardDatastream();

      let resolvePromotion: (() => void) | undefined;
      mockPrimaryDisk.exists.onCall(0).resolves(false);
      mockPrimaryDisk.exists.onCall(1).resolves(false);
      mockPrimaryDisk.exists.onCall(2).resolves(false);
      mockStagingDisk.exists.resolves(true);
      mockPrimaryDisk.putStream.callsFake(() => new Promise<void>((resolve) => {
        resolvePromotion = resolve;
      }));

      const firstRead = service.getDatastream('oid-123', 'file-123');
      const secondRead = service.getDatastream('oid-123', 'file-123');

      await waitFor(() => mockPrimaryDisk.putStream.calledOnce);

      expect(mockStagingDisk.getStream.calledOnce).to.be.true;
      expect(mockPrimaryDisk.putStream.calledOnce).to.be.true;

      resolvePromotion?.();

      const [firstResult, secondResult] = await Promise.all([firstRead, secondRead]);

      expect(firstResult).to.have.property('readstream');
      expect(secondResult).to.have.property('readstream');
      expect(mockStagingDisk.delete.calledOnce).to.be.true;
    });

    it('treats already-promoted writes as successful', async function () {
      const { Services } = require('../../src/services/StandardDatastreamService');
      const service = new Services.StandardDatastream();

      mockPrimaryDisk.exists.onCall(0).resolves(false);
      mockPrimaryDisk.exists.onCall(1).resolves(false);
      mockPrimaryDisk.exists.onCall(2).resolves(true);
      mockStagingDisk.exists.resolves(true);
      mockPrimaryDisk.putStream.rejects(new Error('already exists'));

      const result = await service.getDatastream('oid-123', 'file-123');

      expect(result).to.have.property('readstream');
      expect(mockStagingDisk.delete.calledOnce).to.be.true;
    });

    it('ignores already-deleted staging files after promotion', async function () {
      const { Services } = require('../../src/services/StandardDatastreamService');
      const service = new Services.StandardDatastream();

      mockPrimaryDisk.exists.onFirstCall().resolves(false);
      mockPrimaryDisk.exists.onSecondCall().resolves(false);
      mockStagingDisk.exists.resolves(true);
      mockStagingDisk.delete.rejects(new Error('ENOENT'));

      const result = await service.getDatastream('oid-123', 'file-123');

      expect(result).to.have.property('readstream');
      expect(mockPrimaryDisk.putStream.calledOnce).to.be.true;
    });
  });

  describe('listDatastreams', function () {
    it('should list a specific file when fileId is provided', async function () {
      const { Services } = require('../../src/services/StandardDatastreamService');
      const service = new Services.StandardDatastream();

      const result = await service.listDatastreams('oid-123', 'file-123');

      expect(result).to.be.an('array').with.length(1);
      expect(result[0]).to.have.property('filename', 'attachments/oid-123/file-123');
      expect(result[0]).to.have.property('contentType', 'application/pdf');
    });

    it('should return empty array when specific file does not exist', async function () {
      const { Services } = require('../../src/services/StandardDatastreamService');
      const service = new Services.StandardDatastream();

      mockPrimaryDisk.exists.resolves(false);

      const result = await service.listDatastreams('oid-123', 'missing-file');

      expect(result).to.be.an('array').with.length(0);
    });

    it('should list all files under an oid prefix when fileId is empty', async function () {
      const { Services } = require('../../src/services/StandardDatastreamService');
      const service = new Services.StandardDatastream();
      const lastModified = new Date('2026-05-13T07:01:32.533Z');

      mockPrimaryDisk.listAll.resolves({
        objects: [
          { key: 'attachments/oid-123/file-a', name: 'file-a' },
          { key: 'attachments/oid-123/file-b', name: 'file-b' },
        ],
      });
      mockPrimaryDisk.getMetaData.resolves({
        contentType: 'application/pdf',
        contentLength: 2048,
        etag: 'etag-123',
        lastModified,
      });

      const result = await service.listDatastreams('oid-123', '');

      expect(result).to.be.an('array').with.length(2);
      expect(mockPrimaryDisk.listAll.firstCall.args[0]).to.equal('attachments/oid-123/');
      expect(mockStagingDisk.listAll.called).to.be.false;
      expect(mockPrimaryDisk.getMetaData.calledTwice).to.be.true;
      expect(mockPrimaryDisk.getMetaData.firstCall.args[0]).to.equal('attachments/oid-123/file-a');
      expect(result[0]).to.include({
        filename: 'attachments/oid-123/file-a',
        contentType: 'application/pdf',
        contentLength: 2048,
        etag: 'etag-123',
        lastModified,
      });
    });

    it('should still list all files when metadata lookup fails', async function () {
      const { Services } = require('../../src/services/StandardDatastreamService');
      const service = new Services.StandardDatastream();

      mockPrimaryDisk.listAll.resolves({
        objects: [
          { key: 'attachments/oid-123/file-a', name: 'file-a' },
        ],
      });
      mockPrimaryDisk.getMetaData.rejects(new Error('no metadata'));

      const result = await service.listDatastreams('oid-123', '');

      expect(result).to.be.an('array').with.length(1);
      expect(result[0]).to.have.property('filename', 'attachments/oid-123/file-a');
      expect(result[0]).not.to.have.property('lastModified');
    });

    it('should normalize a key prefix without a trailing slash when listing all files', async function () {
      const { Services } = require('../../src/services/StandardDatastreamService');
      const service = new Services.StandardDatastream();

      mockStorageManager.getMergedStorageConfig.returns({ keyPrefix: 'uploads' });

      await service.listDatastreams('oid-123', '');

      expect(mockPrimaryDisk.listAll.calledOnce).to.be.true;
      expect(mockPrimaryDisk.listAll.firstCall.args[0]).to.equal('uploads/oid-123/');
    });

    it('should fall back to an empty key prefix when storage config does not provide one', async function () {
      const { Services } = require('../../src/services/StandardDatastreamService');
      const service = new Services.StandardDatastream();
      mockStorageManager.getMergedStorageConfig.returns({});

      await service.getDatastream('oid-123', 'file-123');

      expect(mockPrimaryDisk.exists.firstCall.args[0]).to.equal('oid-123/file-123');
    });

    it('should use the configured key prefix for migration-compatible keys', async function () {
      const { Services } = require('../../src/services/StandardDatastreamService');
      const service = new Services.StandardDatastream();
      const ds = new Datastream({ fileId: 'file-123' });

      await service.addDatastream('oid-123', ds);

      expect(mockPrimaryDisk.putStream.firstCall.args[0]).to.equal('attachments/oid-123/file-123');
    });
  });

  describe('updateDatastream', function () {
    it('should call FormsService.getFormByName and process attachment diffs', function (done) {
      // Set up a global FormsService mock
      const mockFormsService = {
        getFormByName: sinon.stub().returns(of({ attachmentFields: ['dataLocations'] })),
      };
      (global as any).FormsService = mockFormsService;

      const { Services } = require('../../src/services/StandardDatastreamService');
      const service = new Services.StandardDatastream();

      const record = {
        metaMetadata: { form: 'test-form-1.0-draft', brandId: 'brand-1' },
        metadata: {
          dataLocations: [
            { fileId: 'existing-file', type: 'attachment' },
            { fileId: 'removed-file', type: 'attachment' },
          ],
        },
      };

      const newMetadata = {
        dataLocations: [
          { fileId: 'existing-file', type: 'attachment' },
          { fileId: 'new-file', type: 'attachment' },
        ],
      };

      const fileIdsAdded: any[] = [];

      service.updateDatastream('oid-123', record, newMetadata, mockStagingDisk, fileIdsAdded).subscribe({
        next: () => {
          // FormsService should have been called
          expect(mockFormsService.getFormByName.calledOnce).to.be.true;
          expect(mockFormsService.getFormByName.firstCall.args[0]).to.equal('test-form-1.0-draft');
          expect(mockFormsService.getFormByName.firstCall.args[2]).to.equal('brand-1');

          // new-file should have been added to fileIdsAdded
          const addedFileIds = fileIdsAdded.map((ds: any) => ds.fileId);
          expect(addedFileIds).to.include('new-file');

          delete (global as any).FormsService;
          done();
        },
        error: (err: any) => {
          delete (global as any).FormsService;
          done(err);
        },
      });
    });

    it('should handle null form gracefully', function (done) {
      const mockFormsService = {
        getFormByName: sinon.stub().returns(of(null)),
      };
      (global as any).FormsService = mockFormsService;

      const { Services } = require('../../src/services/StandardDatastreamService');
      const service = new Services.StandardDatastream();

      const record = {
        metaMetadata: { form: 'unknown-form' },
        metadata: {},
      };

      const fileIdsAdded: any[] = [];

      service.updateDatastream('oid-123', record, {}, mockStagingDisk, fileIdsAdded).subscribe({
        next: () => {
          // Should complete without errors even with null form
          delete (global as any).FormsService;
          done();
        },
        error: (err: any) => {
          delete (global as any).FormsService;
          done(err);
        },
      });
    });
  });
});
