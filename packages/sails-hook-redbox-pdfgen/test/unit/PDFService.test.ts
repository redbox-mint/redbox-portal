const { Effect } = require('effect');
const sinon = require('sinon');
const { expect } = require('@researchdatabox/redbox-dev-tools/testing');
const { clearPdfgenTestGlobals, installPdfgenTestGlobals } = require('../support/globals');

const globalAny = global as any;

async function waitForAssertion(assertion: () => void, timeoutMs = 250): Promise<void> {
  const startedAt = Date.now();
  let lastError: unknown;

  while (Date.now() - startedAt < timeoutMs) {
    try {
      assertion();
      return;
    } catch (error) {
      lastError = error;
      await new Promise(resolve => setTimeout(resolve, 5));
    }
  }

  assertion();
  if (lastError != null) {
    throw lastError;
  }
}

describe('PDFService Unit Tests', () => {
  let pdfService: any;
  let mockPage: any;
  let mockBrowser: any;
  let storageDiskPutStub: any;
  let storageDiskDeleteStub: any;
  let addDatastreamStub: any;

  beforeEach(function () {
    this.timeout(10000);
    installPdfgenTestGlobals();
    const stagingDisk = globalAny.sails.services.storagemanagerservice.stagingDisk();
    storageDiskPutStub = stagingDisk.put;
    storageDiskDeleteStub = stagingDisk.delete;
    addDatastreamStub = globalAny.sails.services.standarddatastreamservice.addDatastream;

    const compiledServicePath = require.resolve('../../dist/api/services/PDFService.js');
    const requireCache = (require as NodeJS.Require & { cache?: Record<string, unknown> }).cache;
    if (requireCache?.[compiledServicePath]) {
      delete requireCache[compiledServicePath];
    }
    const compiledService = require(compiledServicePath);
    pdfService = new compiledService.Services.PDF();
    pdfService.DatastreamService = globalAny.sails.services.standarddatastreamservice;

    mockPage = {
      setExtraHTTPHeaders: sinon.stub(),
      on: sinon.stub(),
      goto: sinon.stub().resolves(),
      waitForNetworkIdle: sinon.stub().resolves(),
      waitForSelector: sinon.stub().resolves(),
      waitForFunction: sinon.stub().resolves(),
      pdf: sinon.stub().resolves(Buffer.from('mock pdf')),
      close: sinon.stub().resolves(),
    };

    mockBrowser = {
      newPage: sinon.stub().resolves(mockPage),
      close: sinon.stub().resolves(),
      process: () => ({ kill: sinon.stub() }),
    };

    sinon.stub(pdfService, 'launchBrowser').resolves(mockBrowser);
  });

  afterEach(() => {
    sinon.restore();
    clearPdfgenTestGlobals();
  });

  it('should fail fast if required services are missing', async () => {
    delete globalAny.sails.services.storagemanagerservice;
    delete globalAny.StorageManagerService;

    const service: any = pdfService;
    const exit = await Effect.runPromiseExit(
      service.attemptPDFGeneration('oid-1', { metaMetadata: { brandId: 1 } }, {}, { name: 'default' }, 1)
    );

    expect(exit._tag).to.equal('Failure');
    expect((exit as any).cause).to.exist;
  });

  it('should return an error Observable when the record brand cannot be resolved', async () => {
    globalAny.BrandingService.getBrandById.returns(null);

    let observable: any;
    expect(() => {
      observable = pdfService.createPDF('oid-missing-brand', { metaMetadata: { brandId: 404 } }, {}, {});
    }).to.not.throw();

    const error = await new Promise((resolve, reject) => {
      observable.subscribe({
        next: () => reject(new Error('Expected createPDF to emit an error')),
        error: resolve,
        complete: () => reject(new Error('Expected createPDF to emit an error')),
      });
    });

    expect((error as any)._tag).to.equal('MissingBrandError');
    expect((error as any).brandId).to.equal(404);
  });

  it('should fall back to networkIdle strategy if unknown strategy provided', async () => {
    const record = { metaMetadata: { brandId: 1 } };
    const options = { readinessStrategy: 'invalidStrategy' };

    const service: any = pdfService;
    await Effect.runPromise(service.attemptPDFGeneration('oid-1', record, options, { name: 'default' }, 1));

    expect(mockPage.waitForNetworkIdle.called).to.be.true;
    expect(globalAny.sails.log.warn.calledWithMatch(/Unknown readinessStrategy/)).to.be.true;
  });

  it('should use selector strategy', async () => {
    const record = { metaMetadata: { brandId: 1 } };
    const options = {
      readinessStrategy: 'selector',
      waitForSelector: '#ready',
    };

    const service: any = pdfService;
    await Effect.runPromise(service.attemptPDFGeneration('oid-1', record, options, { name: 'default' }, 1));

    expect(mockPage.waitForSelector.calledWith('#ready')).to.be.true;
    expect(mockPage.waitForNetworkIdle.called).to.be.false;
  });

  it('should use jsFlag strategy', async () => {
    const record = { metaMetadata: { brandId: 1 } };
    const options = {
      readinessStrategy: 'jsFlag',
      waitForFunction: 'window.isReady === true',
    };

    const service: any = pdfService;
    await Effect.runPromise(service.attemptPDFGeneration('oid-1', record, options, { name: 'default' }, 1));

    expect(mockPage.waitForFunction.calledWith('window.isReady === true')).to.be.true;
  });

  it('should fail fast when selector strategy is missing a selector', async () => {
    const record = { metaMetadata: { brandId: 1 } };
    const options = {
      readinessStrategy: 'selector',
      waitForSelector: '   ',
    };

    const service: any = pdfService;
    const exit = await Effect.runPromiseExit(
      service.attemptPDFGeneration('oid-1', record, options, { name: 'default' }, 1)
    );

    expect(exit._tag).to.equal('Failure');
    expect(JSON.stringify((exit as any).cause)).to.contain('InvalidReadinessOptionError');
    expect(mockPage.waitForSelector.called).to.be.false;
    expect(mockPage.goto.called).to.be.false;
  });

  it('should clean up the staged PDF when addDatastream fails', async () => {
    const record = { metaMetadata: { brandId: 1 } };
    addDatastreamStub.rejects(new Error('datastream save failed'));

    const service: any = pdfService;
    const exit = await Effect.runPromiseExit(service.attemptPDFGeneration('oid-1', record, {}, { name: 'default' }, 1));

    expect(exit._tag).to.equal('Failure');
    expect(storageDiskPutStub.calledOnce).to.equal(true);
    expect(storageDiskDeleteStub.calledOnce).to.equal(true);
    expect(storageDiskDeleteStub.firstCall.args[0]).to.match(/oid-1.*\.pdf$/);
  });

  it('should retry transient failures in the background retry loop', async () => {
    const record = { metaMetadata: { brandId: 1 } };
    const options = {
      retryDelayMs: 10,
    };

    mockPage.goto.onFirstCall().rejects(new Error('Navigation timeout'));
    mockPage.goto.onSecondCall().resolves();

    const observable = pdfService.createPDF('oid-1', record, options, {});
    const result = await new Promise((resolve, reject) => {
      observable.subscribe({ next: resolve, error: reject });
    });

    expect(result).to.equal(record);
    expect(mockPage.goto.callCount).to.equal(1);

    await waitForAssertion(() => {
      expect(mockPage.goto.calledTwice).to.be.true;
    });
  });

  it('should retry datastream save failures in the background retry loop', async () => {
    const record = { metaMetadata: { brandId: 1 } };
    const options = {
      retryDelayMs: 10,
    };

    storageDiskPutStub.onFirstCall().rejects(new Error('temporary storage failure'));
    storageDiskPutStub.onSecondCall().resolves();

    const observable = pdfService.createPDF('oid-storage-retry', record, options, {});
    const result = await new Promise((resolve, reject) => {
      observable.subscribe({ next: resolve, error: reject });
    });

    expect(result).to.equal(record);
    expect(storageDiskPutStub.callCount).to.equal(1);

    await waitForAssertion(() => {
      expect(storageDiskPutStub.calledTwice).to.be.true;
      expect(addDatastreamStub.calledOnce).to.be.true;
    });
  });

  it('should use the readiness strategy resolved before navigation', async () => {
    const record = { metaMetadata: { brandId: 1 } };
    const options = {
      readinessStrategy: 'networkIdle',
    };

    mockPage.goto.callsFake(async () => {
      options.readinessStrategy = 'selector';
    });

    const service: any = pdfService;
    await Effect.runPromise(
      service.attemptPDFGeneration('oid-stable-readiness', record, options, { name: 'default' }, 1)
    );

    expect(mockPage.waitForNetworkIdle.calledOnce).to.be.true;
    expect(mockPage.waitForSelector.called).to.be.false;
  });

  it('should await auth headers before navigation', async () => {
    const record = { metaMetadata: { brandId: 1 } };
    let releaseHeaders: (() => void) | undefined;
    let markHeadersStarted: (() => void) | undefined;
    const headersStarted = new Promise<void>(resolve => {
      markHeadersStarted = resolve;
    });

    mockPage.setExtraHTTPHeaders.callsFake(
      () =>
        new Promise<void>(resolve => {
          markHeadersStarted?.();
          releaseHeaders = resolve;
        })
    );

    const service: any = pdfService;
    const generation = Effect.runPromise(service.attemptPDFGeneration('oid-1', record, {}, { name: 'default' }, 1));

    await headersStarted;

    expect(mockPage.setExtraHTTPHeaders.calledOnce).to.be.true;
    expect(mockPage.goto.called).to.be.false;

    releaseHeaders?.();
    await generation;

    expect(mockPage.goto.calledOnce).to.be.true;
  });

  it('should skip duplicate generation for the same URL while work is in progress', async () => {
    const record = { metaMetadata: { brandId: 1 } };
    let releaseHeaders: (() => void) | undefined;
    let markHeadersStarted: (() => void) | undefined;
    const headersStarted = new Promise<void>(resolve => {
      markHeadersStarted = resolve;
    });

    mockPage.setExtraHTTPHeaders.callsFake(
      () =>
        new Promise<void>(resolve => {
          markHeadersStarted?.();
          releaseHeaders = resolve;
        })
    );

    const service: any = pdfService;
    const firstGeneration = Effect.runPromise(
      service.attemptPDFGeneration('oid-1', record, {}, { name: 'default' }, 1)
    );

    await headersStarted;

    await Effect.runPromise(service.attemptPDFGeneration('oid-1', record, {}, { name: 'default' }, 1));

    expect(mockBrowser.newPage.calledOnce).to.be.true;
    expect(mockPage.goto.called).to.be.false;
    expect(globalAny.sails.log.warn.calledWithMatch(/already in progress/)).to.be.true;

    releaseHeaders?.();
    await firstGeneration;

    expect(mockPage.goto.calledOnce).to.be.true;
  });

  it('should stop background retrying beyond maxRetries', async () => {
    const record = { metaMetadata: { brandId: 1 } };
    const options = {
      maxRetries: 1,
      retryDelayMs: 1,
    };

    mockPage.goto.rejects(new Error('Navigation timeout'));

    const observable = pdfService.createPDF('oid-1', record, options, {});
    const result = await new Promise((resolve, reject) => {
      observable.subscribe({ next: resolve, error: reject });
    });

    expect(result).to.equal(record);
    await waitForAssertion(() => {
      expect(mockPage.goto.callCount).to.equal(2);
    });
  });

  it('should omit PDFOptions path without mutating the provided options object', async () => {
    const record = { metaMetadata: { brandId: 1 } };
    const configuredPDFOptions = {
      path: '/tmp/should-not-be-used.pdf',
      landscape: true,
      scale: 1.25,
      margin: {
        top: '10mm',
        bottom: '12mm',
      },
    };
    const options = {
      PDFOptions: configuredPDFOptions,
    };

    const service: any = pdfService;
    await Effect.runPromise(service.attemptPDFGeneration('oid-1', record, options, { name: 'default' }, 1));

    expect(mockPage.pdf.calledOnce).to.equal(true);
    const pdfOptions = mockPage.pdf.firstCall.args[0];
    expect(pdfOptions).to.deep.include({
      format: 'A4',
      printBackground: true,
      landscape: true,
      scale: 1.25,
    });
    expect(pdfOptions.margin).to.deep.equal({
      top: '10mm',
      bottom: '12mm',
    });
    expect(pdfOptions).to.not.have.property('path');
    expect(configuredPDFOptions).to.have.property('path', '/tmp/should-not-be-used.pdf');
  });

  it('should return the record immediately from createPDF and schedule background retries', async () => {
    const record = { metaMetadata: { brandId: 1 } };
    const options = {
      maxRetries: 1,
      retryDelayMs: 10,
    };

    mockPage.goto.onFirstCall().rejects(new Error('Navigation timeout'));
    mockPage.goto.onSecondCall().resolves();

    const observable = pdfService.createPDF('oid-1', record, options, {});
    const result = await new Promise((resolve, reject) => {
      observable.subscribe({ next: resolve, error: reject });
    });

    expect(result).to.equal(record);
    expect(mockPage.goto.callCount).to.equal(1);

    await waitForAssertion(() => {
      expect(mockPage.goto.callCount).to.equal(2);
    });
    expect(globalAny.sails.log.warn.calledWithMatch(/Retry scheduled: true/)).to.be.true;
  });

  it('should cancel a pending retry when a fresh request succeeds during the retry delay', async () => {
    const record = { metaMetadata: { brandId: 1 } };
    const options = {
      maxRetries: 1,
      retryDelayMs: 50,
    };

    mockPage.goto.onFirstCall().rejects(new Error('Navigation timeout'));
    mockPage.goto.onSecondCall().resolves();

    const firstObservable = pdfService.createPDF('oid-1', record, options, {});
    await new Promise((resolve, reject) => {
      firstObservable.subscribe({ next: resolve, error: reject });
    });

    const secondObservable = pdfService.createPDF('oid-1', record, options, {});
    await new Promise((resolve, reject) => {
      secondObservable.subscribe({ next: resolve, error: reject });
    });

    await new Promise(resolve => setTimeout(resolve, 90));

    expect(mockPage.goto.callCount).to.equal(2);
  });
});
