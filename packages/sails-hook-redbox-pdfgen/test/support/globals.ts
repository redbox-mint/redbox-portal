const { _ } = require('@researchdatabox/redbox-dev-tools/testing');
const sinon = require('sinon');

type LogFn = (...args: unknown[]) => void;

function installPdfgenTestGlobals(overrides: Record<string, unknown> = {}): void {
  const storageDiskPutStub = sinon.stub().resolves();
  const storageDiskDeleteStub = sinon.stub().resolves();
  const addDatastreamStub = sinon.stub().resolves({});

  (global as any)._ = _;
  (global as any).sails = {
    log: {
      verbose: sinon.stub(),
      debug: sinon.stub(),
      info: sinon.stub(),
      warn: sinon.stub(),
      error: sinon.stub(),
    } satisfies Record<string, LogFn>,
    services: {
      storagemanagerservice: {
        stagingDisk: () => ({
          put: storageDiskPutStub,
          delete: storageDiskDeleteStub,
        }),
      },
      standarddatastreamservice: {
        addDatastream: addDatastreamStub,
      },
    },
    config: {
      appUrl: 'http://localhost:1500',
      brandingAware: () => ({
        pdfgen: {
          token: 'test-token',
        },
      }),
      record: {
        datastreamService: 'standarddatastreamservice',
        attachments: {
          stageDir: '/tmp',
        },
      },
      ...overrides,
    },
  };

  (global as any).BrandingService = {
    getBrandById: sinon.stub().returns({ name: 'default' }),
  };
  (global as any).StorageManagerService = (global as any).sails.services.storagemanagerservice;
}

function clearPdfgenTestGlobals(): void {
  delete (global as any)._;
  delete (global as any).sails;
  delete (global as any).BrandingService;
  delete (global as any).StorageManagerService;
}

module.exports = {
  installPdfgenTestGlobals,
  clearPdfgenTestGlobals,
};
