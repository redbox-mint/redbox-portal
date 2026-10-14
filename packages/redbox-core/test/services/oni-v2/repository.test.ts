let expect: Chai.ExpectStatic;
import('chai').then(mod => expect = mod.expect);
import { Readable } from 'node:stream';
import * as sinon from 'sinon';
import type { OniPublishingSiteConfig } from '../../../src/configmodels/OniPublishing';
import type { DatastreamService } from '../../../src/DatastreamService';
import type { Services as StorageManagerServices } from '../../../src/services/StorageManagerService';
import { createOniRepository } from '../../../src/services/oni-v2/repository';
import type {
  OcflModuleAdapter,
  OniCrateBuildResult,
  OniPublishInput,
  ResolvedOniPublishingConfigData,
} from '../../../src/services/oni-v2/types';

describe('Oni v2 OCFL repository', () => {
  const config = {
    rootCollection: { rootCollectionId: 'root-collection' },
    metadata: { jsonldFilename: 'ro-crate-metadata.json' },
  } as unknown as ResolvedOniPublishingConfigData;
  const site = {
    storage: {
      driver: 'flydrive',
      diskName: 'oni',
      rootPath: 'objects',
      workspacePath: 'workspace',
      prefix: 'prefix',
      keyEncoding: 'uri',
    },
  } as unknown as OniPublishingSiteConfig;

  function makeHarness(useImplementationFactory = false) {
    const transaction = { write: sinon.stub().resolves() };
    const rootObject = {
      load: sinon.stub().rejects(Object.assign(new Error('not found'), { code: 'ENOENT' })),
      update: sinon.stub().callsFake(async (updater: (tx: typeof transaction) => Promise<void>) => updater(transaction)),
    };
    const datasetObject = {
      load: sinon.stub().resolves(),
      update: sinon.stub().callsFake(async (updater: (tx: typeof transaction) => Promise<void>) => updater(transaction)),
    };
    const storage = {
      load: sinon.stub().resolves(),
      create: sinon.stub().resolves(),
      object: sinon.stub().callsFake((id: string) => id === 'root-collection' ? rootObject : datasetObject),
    };
    class FakeOcfl {
      storage = sinon.stub().returns(storage);
    }
    class FakeOcflStore {}
    const ocflModule = (useImplementationFactory
      ? {
          implementOcfl: sinon.stub().returns(new FakeOcfl()),
          OcflStore: FakeOcflStore,
        }
      : {
          Ocfl: FakeOcfl,
          OcflStore: FakeOcflStore,
        }) as unknown as OcflModuleAdapter;
    const disk = {};
    const storageManager = {
      isBootstrapped: sinon.stub().returns(false),
      bootstrap: sinon.stub().resolves(),
      disk: sinon.stub().returns(disk),
    } as unknown as StorageManagerServices.StorageManager;
    const datastreamService = {
      getDatastream: sinon.stub(),
    } as unknown as DatastreamService;
    const loadOcflModule = sinon.stub().resolves(ocflModule);
    const repository = createOniRepository(config, site, datastreamService, storageManager, loadOcflModule);
    return {
      repository,
      storage,
      rootObject,
      datasetObject,
      transaction,
      storageManager,
      datastreamService,
      loadOcflModule,
      ocflModule,
    };
  }

  beforeEach(() => {
    (global as unknown as { sails: unknown }).sails = {
      log: { verbose: sinon.stub() },
      config: {},
      services: {},
    };
  });

  afterEach(() => {
    sinon.restore();
    delete (global as unknown as { sails?: unknown }).sails;
  });

  it('rejects unsupported storage drivers before constructing a repository', () => {
    const invalidSite = {
      storage: { ...site.storage, driver: 'filesystem' },
    } as unknown as OniPublishingSiteConfig;

    expect(() => createOniRepository(
      config,
      invalidSite,
      {} as DatastreamService,
      {} as StorageManagerServices.StorageManager
    )).to.throw("storage driver 'filesystem' is not supported");
  });

  it('bootstraps the disk and creates an invalid OCFL storage root', async () => {
    const harness = makeHarness();
    harness.storage.load.onFirstCall().rejects(new Error('Invalid storage root'));
    harness.storage.load.onSecondCall().resolves();

    await harness.repository.ensureStorageRoot();

    expect((harness.storageManager.bootstrap as sinon.SinonStub).calledOnce).to.be.true;
    expect((harness.storageManager.disk as sinon.SinonStub).calledOnceWithExactly('oni')).to.be.true;
    expect(harness.storage.create.calledOnce).to.be.true;
    expect(harness.storage.load.calledTwice).to.be.true;
    expect(harness.loadOcflModule.calledOnce).to.be.true;
  });

  it('supports the implementOcfl factory exported by current @ocfl/ocfl releases', async () => {
    const harness = makeHarness(true);

    await harness.repository.ensureStorageRoot();

    expect((harness.ocflModule.implementOcfl as sinon.SinonStub).calledOnce).to.be.true;
    expect(harness.storage.load.calledOnce).to.be.true;
  });

  it('propagates unexpected storage-root load failures', async () => {
    const harness = makeHarness();
    harness.storage.load.rejects(new Error('permission denied'));

    let caught: unknown;
    try {
      await harness.repository.ensureStorageRoot();
    } catch (error) {
      caught = error;
    }

    expect(caught).to.be.an('error').with.property('message', 'permission denied');
    expect(harness.storage.create.called).to.be.false;
  });

  it('creates a missing root collection and leaves an existing one unchanged', async () => {
    const harness = makeHarness();

    await harness.repository.ensureRootCollection(config);

    expect(harness.rootObject.update.calledOnce).to.be.true;
    expect(harness.transaction.write.firstCall.args[0]).to.equal('ro-crate-metadata.json');
    expect(harness.transaction.write.firstCall.args[1]).to.contain('"@graph"');
    expect(harness.rootObject.update.firstCall.args[1]).to.equal('REPLACE');

    harness.rootObject.load.resolves();
    harness.rootObject.update.resetHistory();
    await harness.repository.ensureRootCollection(config);
    expect(harness.rootObject.update.called).to.be.false;
  });

  it('treats the S3 NoSuchKey response as a missing root collection', async () => {
    const harness = makeHarness();
    harness.rootObject.load.rejects(Object.assign(new Error('The specified key does not exist.'), { name: 'NoSuchKey' }));

    await harness.repository.ensureRootCollection(config, site);

    expect(harness.rootObject.update.calledOnce).to.be.true;
  });

  it('writes crate metadata and both streamed and buffered attachments in source order', async () => {
    const harness = makeHarness();
    const stream = Readable.from(['streamed']);
    (harness.datastreamService.getDatastream as sinon.SinonStub)
      .onFirstCall().resolves({ readstream: stream })
      .onSecondCall().resolves({ body: 'buffered' });
    const crate = {
      rootId: 'dataset-1',
      dataRecordOid: 'record-1',
      crateJson: { '@id': './' },
      attachments: [
        { fileId: 'file-1', logicalPath: 'files/one.txt' },
        { fileId: 'file-2', logicalPath: 'files/two.txt' },
      ],
    } as unknown as OniCrateBuildResult;

    await harness.repository.writeDatasetObject(crate, { oid: 'record-1' } as unknown as OniPublishInput);

    expect(harness.datasetObject.update.calledOnce).to.be.true;
    expect(harness.datasetObject.update.firstCall.args[1]).to.equal('REPLACE');
    expect(harness.transaction.write.getCall(0).args[0]).to.equal('ro-crate-metadata.json');
    expect(harness.transaction.write.getCall(1).args).to.deep.equal(['files/one.txt', stream]);
    expect(harness.transaction.write.getCall(2).args).to.deep.equal(['files/two.txt', 'buffered']);
  });
});
