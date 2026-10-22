import assert from 'node:assert/strict';
import * as sinon from 'sinon';
import { Readable } from 'node:stream';
import { GridFSBucket, MongoClient, ObjectId } from 'mongodb';
import * as runtime from '../../src/persistence/runtime';
import { Services } from '../../src/services/BrandingLogoService';
import { cleanupServiceTestGlobals, createMockSails, setupServiceTestGlobals } from './testHelper';

describe('legacy branding GridFS download ownership', () => {
  afterEach(() => {
    cleanupServiceTestGlobals();
    Reflect.deleteProperty(globalThis, 'StorageManagerService');
    sinon.restore();
  });

  it('keeps an errored read tracked until its chunk cursor closes', async () => {
    const app = createMockSails();
    app.config.datastores = { mongodb: { url: 'mongodb://fixture/logos' } };
    setupServiceTestGlobals(app);
    Reflect.set(globalThis, 'StorageManagerService', {
      primaryDisk: () => ({
        getBytes: async () => {
          throw new Error('ENOENT');
        },
      }),
    });
    await runtime.initializePersistence(app);
    sinon.stub(runtime, 'mongoDatabase').resolves(new MongoClient('mongodb://fixture/logos').db());
    let release!: () => void, entered!: () => void;
    const held = new Promise<void>(resolve => {
      release = resolve;
    });
    const closing = new Promise<void>(resolve => {
      entered = resolve;
    });
    const cursor = {
      close: sinon.stub().callsFake(async () => {
        entered();
        await held;
      }),
    };
    const stream = Object.assign(
      new Readable({
        read() {
          this.destroy(new Error('malformed chunk'));
        },
      }),
      {
        s: { cursor },
        abort: sinon.stub().resolves(),
      }
    );
    sinon
      .stub(GridFSBucket.prototype, 'openDownloadStream')
      .returns(stream as unknown as ReturnType<GridFSBucket['openDownloadStream']>);
    const service = new Services.BrandingLogo();
    let completed = false,
      drained = false;
    const read = service.getBinaryAsync(new ObjectId().toHexString()).then(value => {
      completed = true;
      return value;
    });
    await closing;
    const cleanup = runtime.cleanupPersistence(app).then(() => {
      drained = true;
    });
    try {
      await new Promise<void>(resolve => setImmediate(resolve));
      assert.equal(stream.destroyed, true);
      assert.equal(cursor.close.callCount, 1);
      assert.equal(completed, false);
      assert.equal(drained, false);
    } finally {
      release();
      assert.equal(await read, null);
      await cleanup;
    }
    assert.equal(drained, true);
  });
});
