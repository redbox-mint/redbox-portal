let expect: Chai.ExpectStatic;
import('chai').then(mod => (expect = mod.expect));
import * as sinon from 'sinon';
import { of } from 'rxjs';
import { Controllers } from '../../src/controllers/RecordController';

describe('RecordController getWorkflowSteps', () => {
  let controller: Controllers.Record;
  let originalSails: any;
  let originalBrandingService: any;
  let originalRecordTypesService: any;
  let originalWorkflowStepsService: any;
  let originalDashboardTypesService: any;

  beforeEach(() => {
    originalSails = (global as any).sails;
    originalBrandingService = (global as any).BrandingService;
    originalRecordTypesService = (global as any).RecordTypesService;
    originalWorkflowStepsService = (global as any).WorkflowStepsService;
    originalDashboardTypesService = (global as any).DashboardTypesService;

    (global as any).sails = {
      config: {},
      log: {
        verbose: sinon.stub(),
        debug: sinon.stub(),
        info: sinon.stub(),
        warn: sinon.stub(),
        error: sinon.stub(),
        trace: sinon.stub(),
      },
    };
    (global as any)._ = require('lodash');
    (global as any).BrandingService = {
      getBrand: sinon.stub().returns({ id: 'brand-1', name: 'default' }),
    };
    (global as any).RecordTypesService = {
      get: sinon.stub(),
    };
    (global as any).WorkflowStepsService = {
      getAllForRecordType: sinon.stub(),
    };
    (global as any).DashboardTypesService = {
      getDashboardView: sinon.stub(),
    };

    controller = new Controllers.Record();
  });

  afterEach(() => {
    sinon.restore();
    (global as any).sails = originalSails;
    (global as any).BrandingService = originalBrandingService;
    (global as any).RecordTypesService = originalRecordTypesService;
    (global as any).WorkflowStepsService = originalWorkflowStepsService;
    (global as any).DashboardTypesService = originalDashboardTypesService;
  });

  it('returns 400 when record type is missing after normalization', async () => {
    const req = {
      param: sinon.stub().returns('   '),
      session: { branding: 'default' },
    } as unknown as Sails.Req;
    const res = {} as Sails.Res;
    const sendRespStub = sinon.stub(controller as any, 'sendResp');

    await controller.getWorkflowSteps(req, res);

    expect(sendRespStub.calledOnce).to.be.true;
    expect(sendRespStub.firstCall.args[2]).to.deep.equal({
      status: 400,
      displayErrors: [{ detail: 'Record Type is required' }],
    });
    expect((global as any).RecordTypesService.get.called).to.be.false;
    expect((global as any).WorkflowStepsService.getAllForRecordType.called).to.be.false;
  });

  it('returns 400 when record type is invalid', async () => {
    const req = {
      param: sinon.stub().returns('dataset'),
      session: { branding: 'default' },
    } as unknown as Sails.Req;
    const res = {} as Sails.Res;
    const sendRespStub = sinon.stub(controller as any, 'sendResp');
    (global as any).RecordTypesService.get.returns(of(null));

    await controller.getWorkflowSteps(req, res);

    expect((global as any).BrandingService.getBrand.calledWith('default')).to.be.true;
    expect((global as any).RecordTypesService.get.calledWith(sinon.match({ id: 'brand-1' }), 'dataset')).to.be.true;
    expect(sendRespStub.calledOnce).to.be.true;
    expect(sendRespStub.firstCall.args[2]).to.deep.equal({
      status: 400,
      displayErrors: [{ detail: 'Record Type provided is not valid' }],
    });
    expect((global as any).WorkflowStepsService.getAllForRecordType.called).to.be.false;
  });

  it('returns workflow steps for a valid trimmed record type', async () => {
    const req = {
      param: sinon.stub().returns(' dataset '),
      session: { branding: 'default' },
    } as unknown as Sails.Req;
    const res = {} as Sails.Res;
    const sendRespStub = sinon.stub(controller as any, 'sendResp');
    const recordType = { id: 'rt-1', name: 'dataset' };
    const wfSteps = [{ name: 'draft' }, { name: 'review' }];
    (global as any).RecordTypesService.get.returns(of(recordType));
    (global as any).WorkflowStepsService.getAllForRecordType.returns(of(wfSteps));

    await controller.getWorkflowSteps(req, res);

    expect((global as any).RecordTypesService.get.calledWith(sinon.match({ id: 'brand-1' }), 'dataset')).to.be.true;
    expect((global as any).WorkflowStepsService.getAllForRecordType.calledWith(recordType)).to.be.true;
    expect(sendRespStub.calledOnce).to.be.true;
    expect(sendRespStub.firstCall.args[2]).to.deep.equal({ data: wfSteps });
  });

  it('returns dashboard view metadata for a valid dashboard view', async () => {
    const req = {
      param: sinon.stub().withArgs('dashboardView').returns('consolidated'),
      session: { branding: 'default' },
    } as unknown as Sails.Req;
    const res = {} as Sails.Res;
    const sendRespStub = sinon.stub(controller as any, 'sendResp');
    const dashboardView = {
      name: 'consolidated',
      titleLabelKey: 'consolidated',
      dashboardType: 'consolidated',
      sourceRecordType: 'rdmp',
      showAdminSideBar: true,
      steps: [
        {
          name: 'consolidated',
          sourceRecordType: 'rdmp',
          fetchMode: 'allForRecordType',
          dashboardTable: { rowConfig: [] },
        },
      ],
    };
    (global as any).DashboardTypesService.getDashboardView.returns(dashboardView);

    await controller.getDashboardView(req, res);

    expect((global as any).DashboardTypesService.getDashboardView.calledWithExactly('consolidated')).to.be.true;
    expect(sendRespStub.calledOnce).to.be.true;
    expect(sendRespStub.firstCall.args[2].data).to.deep.include({
      name: 'consolidated',
      titleLabelKey: 'consolidated',
      dashboardType: 'consolidated',
      sourceRecordType: 'rdmp',
      showAdminSideBar: true,
    });
    expect(sendRespStub.firstCall.args[2].data.steps).to.deep.equal([
      {
        name: 'consolidated',
        sourceRecordType: 'rdmp',
        sourceWorkflowStage: undefined,
        fetchMode: 'allForRecordType',
        dashboardTable: { rowConfig: [] },
        baseRecordType: undefined,
      },
    ]);
  });

  it('returns 404 when dashboard view config is malformed', async () => {
    const req = {
      param: sinon.stub().withArgs('dashboardView').returns('malformed'),
      session: { branding: 'default' },
    } as unknown as Sails.Req;
    const res = {} as Sails.Res;
    const sendRespStub = sinon.stub(controller as any, 'sendResp');
    (global as any).DashboardTypesService.getDashboardView.returns({
      titleLabelKey: 'malformed',
      dashboardType: 'consolidated',
      sourceRecordType: 'rdmp',
      steps: [],
    });

    await controller.getDashboardView(req, res);

    expect(sendRespStub.calledOnce).to.be.true;
    expect(sendRespStub.firstCall.args[2]).to.deep.equal({
      status: 404,
      displayErrors: [{ detail: 'Dashboard view provided is not valid' }],
    });
  });

  it('redirects the legacy consolidated dashboard route', () => {
    const req = {} as Sails.Req;
    const res = {
      redirect: sinon.stub()
    } as unknown as Sails.Res;
    (global as any).BrandingService.getFullPath = sinon.stub().returns('/default/rdmp');

    controller.redirectLegacyConsolidatedDashboard(req, res);

    expect((res.redirect as any).calledWith('/default/rdmp/dashboard-view/consolidated')).to.be.true;
  });
});

describe('RecordController TUS URL generation', () => {
  let controller: Controllers.Record;
  let originalSails: any;
  let originalStorageManagerService: any;
  let originalBrandingService: any;
  let originalTranslationService: any;
  let originalCheckDiskSpace: any;

  beforeEach(() => {
    originalSails = (global as any).sails;
    originalStorageManagerService = (global as any).StorageManagerService;
    originalBrandingService = (global as any).BrandingService;
    originalTranslationService = (global as any).TranslationService;
    (global as any).sails = {
      config: {
        record: {
          attachments: {
            store: 'file',
            path: '/uploads/attachments',
            file: {
              directory: '/tmp/redbox-test-attachments',
            },
          },
          diskSpaceThreshold: 100,
          mongodbDisk: '/legacy/mongodb-disk',
        },
      },
      log: {
        verbose: sinon.stub(),
        debug: sinon.stub(),
        info: sinon.stub(),
        warn: sinon.stub(),
        error: sinon.stub(),
        trace: sinon.stub(),
      },
    };
    (global as any)._ = require('lodash');
    (global as any).StorageManagerService = {
      stagingDisk: sinon.stub().returns({}),
      getStagingDiskConfig: sinon.stub().returns({
        driver: 'fs',
        config: { root: '/tmp/storage-manager-staging' },
      }),
    };
    (global as any).BrandingService = {
      getBrandAndPortalPath: sinon.stub().returns('/default/rdmp'),
      getBrand: sinon.stub().returns({ id: 'brand-1', name: 'default' }),
    };
    (global as any).TranslationService = {
      t: sinon.stub().callsFake((value: string) => value),
    };
    controller = new Controllers.Record();
  });

  afterEach(() => {
    sinon.restore();
    (global as any).sails = originalSails;
    (global as any).StorageManagerService = originalStorageManagerService;
    (global as any).BrandingService = originalBrandingService;
    (global as any).TranslationService = originalTranslationService;
  });

  it('returns routed attachment URLs instead of the internal TUS mount path', () => {
    (controller as any).initTusServer();
    const tusServer = (controller as any).tusServer;
    const generatedUrl = tusServer.options.generateUrl({
      _tusBaseUrl: '/default/rdmp/record/oid-1',
    }, {
      host: 'localhost:1500',
      path: '/uploads/attachments',
      id: 'file-123',
    });

    expect(generatedUrl).to.equal('//localhost:1500/default/rdmp/record/oid-1/attach/file-123');
  });

  it('normalizes routed attachment URLs when the base URL has a trailing slash', () => {
    (controller as any).initTusServer();
    const tusServer = (controller as any).tusServer;
    const generatedUrl = tusServer.options.generateUrl({
      _tusBaseUrl: '/default/rdmp/record/oid-1/',
    }, {
      host: 'localhost:1500',
      path: '/uploads/attachments',
      id: 'file-123',
    });

    expect(generatedUrl).to.equal('//localhost:1500/default/rdmp/record/oid-1/attach/file-123');
  });

  it('does not expose the internal TUS mount path in generated attachment URLs', () => {
    (controller as any).initTusServer();
    const tusServer = (controller as any).tusServer;
    const generatedUrl = tusServer.options.generateUrl({
      _tusBaseUrl: '/default/rdmp/record/oid-1',
    }, {
      host: 'localhost:1500',
      path: '/uploads/attachments',
      id: 'file-123',
    });

    expect(generatedUrl).to.not.include('/uploads/attachments');
    expect(generatedUrl).to.include('/default/rdmp/record/oid-1/attach/file-123');
  });

  it('uses the StorageManager staging disk datastore for the tus server', () => {
    (controller as any).initTusServer();

    expect((global as any).StorageManagerService.stagingDisk.calledOnce).to.equal(true);
    expect((controller as any).tusServer.datastore.constructor.name).to.equal('TusStorageManagerDataStore');
  });

  it('does not require record.attachments.file.directory when using the storage manager datastore', () => {
    (global as any).sails.config.record.attachments.file = undefined;
    (global as any).sails.config.record.attachments.stageDir = undefined;

    expect(() => (controller as any).initTusServer()).to.not.throw();
  });

  it('checks disk space against the staging disk root for filesystem staging uploads', async () => {
    const checkDiskSpaceModule = require('check-disk-space');
    const checkDiskSpaceStub = sinon.stub(checkDiskSpaceModule, 'default').resolves({ free: 10000, size: 20000, diskPath: '/tmp/storage-manager-staging' });
    const handleStub = sinon.stub();
    (controller as any).tusServer = { handle: handleStub };
    sinon.stub(controller as any, 'getRecord').returns(of({}));
    sinon.stub(controller as any, 'hasEditAccess').returns(of(true));

    const req = {
      method: 'POST',
      session: { branding: 'default' },
      user: { username: 'user' },
      url: '/default/rdmp/record/oid-1/attach',
      path: '/default/rdmp/record/oid-1/attach',
      headers: {
        host: 'localhost:1500',
        'upload-length': '1000',
      },
      param: sinon.stub().callsFake((name: string) => name === 'oid' ? 'oid-1' : undefined),
    } as unknown as Sails.Req;
    const res = {
      setHeader: sinon.stub(),
      end: sinon.stub(),
      once: sinon.stub(),
    } as unknown as Sails.Res;

    await controller.doAttachment(req, res);

    expect(checkDiskSpaceStub.calledOnceWith('/tmp/storage-manager-staging')).to.equal(true);
    expect(handleStub.calledOnce).to.equal(true);
  });

  it('skips local disk-space checks for non-filesystem staging uploads', async () => {
    const checkDiskSpaceModule = require('check-disk-space');
    const checkDiskSpaceStub = sinon.stub(checkDiskSpaceModule, 'default').resolves({ free: 10000, size: 20000, diskPath: '/tmp/storage-manager-staging' });
    (global as any).StorageManagerService.getStagingDiskConfig.returns({
      driver: 's3',
      config: { bucket: 'uploads', key: 'AK', secret: 'SK', region: 'ap-southeast-2' },
    });
    const handleStub = sinon.stub();
    (controller as any).tusServer = { handle: handleStub };
    sinon.stub(controller as any, 'getRecord').returns(of({}));
    sinon.stub(controller as any, 'hasEditAccess').returns(of(true));

    const req = {
      method: 'POST',
      session: { branding: 'default' },
      user: { username: 'user' },
      url: '/default/rdmp/record/oid-1/attach',
      path: '/default/rdmp/record/oid-1/attach',
      headers: {
        host: 'localhost:1500',
        'upload-length': '1000',
      },
      param: sinon.stub().callsFake((name: string) => name === 'oid' ? 'oid-1' : undefined),
    } as unknown as Sails.Req;
    const res = {
      setHeader: sinon.stub(),
      end: sinon.stub(),
      once: sinon.stub(),
    } as unknown as Sails.Res;

    await controller.doAttachment(req, res);

    expect(checkDiskSpaceStub.called).to.equal(false);
    expect(handleStub.calledOnce).to.equal(true);
  });

  it('does not use record.mongodbDisk for tus disk-space validation', async () => {
    const checkDiskSpaceModule = require('check-disk-space');
    const checkDiskSpaceStub = sinon.stub(checkDiskSpaceModule, 'default').resolves({ free: 10000, size: 20000, diskPath: '/tmp/storage-manager-staging' });
    const handleStub = sinon.stub();
    (controller as any).tusServer = { handle: handleStub };
    sinon.stub(controller as any, 'getRecord').returns(of({}));
    sinon.stub(controller as any, 'hasEditAccess').returns(of(true));

    const req = {
      method: 'POST',
      session: { branding: 'default' },
      user: { username: 'user' },
      url: '/default/rdmp/record/oid-1/attach',
      path: '/default/rdmp/record/oid-1/attach',
      headers: {
        host: 'localhost:1500',
        'upload-length': '1000',
      },
      param: sinon.stub().callsFake((name: string) => name === 'oid' ? 'oid-1' : undefined),
    } as unknown as Sails.Req;
    const res = {
      setHeader: sinon.stub(),
      end: sinon.stub(),
      once: sinon.stub(),
    } as unknown as Sails.Res;

    await controller.doAttachment(req, res);

    expect(checkDiskSpaceStub.firstCall.args[0]).to.not.equal('/legacy/mongodb-disk');
  });
});
