const { Cause, Effect } = require('effect');
const sinon = require('sinon');
const { expect } = require('@researchdatabox/redbox-dev-tools/testing');
const {
  clearPdfgenTestGlobals,
  installPdfgenTestGlobals,
  waitForAssertion,
  navigationResponse,
} = require('../support/globals');

const globalAny = global as any;

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
      setRequestInterception: sinon.stub().resolves(),
      on: sinon.stub(),
      mainFrame: sinon.stub().returns({}),
      url: sinon.stub().callsFake(() => mockPage.goto.lastCall.args[0]),
      goto: sinon.stub().callsFake(async (url: string) => navigationResponse(url)),
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

  afterEach(async () => {
    await pdfService?.shutdownPDFRetries();
    sinon.restore();
    clearPdfgenTestGlobals();
  });

  it('should accept an assertion that passes on the final retry', async () => {
    const clock = sinon.useFakeTimers();
    let attempts = 0;
    const assertion = waitForAssertion(() => {
      attempts += 1;
      if (attempts < 3) {
        throw new Error('not ready');
      }
    }, 10);

    await clock.tickAsync(10);
    await assertion;

    expect(attempts).to.equal(3);
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

  it('should await PDF cleanup before delegating to sails.lower', async () => {
    let finishCleanup!: () => void;
    const cleanup = new Promise<void>((resolve) => {
      finishCleanup = resolve;
    });
    const originalLower = sinon.stub();
    const lowerOptions = { hardShutdown: true };
    const lowerCallback = sinon.stub();
    globalAny.sails.lower = originalLower;
    sinon.stub(pdfService, 'registerSailsHook');
    const shutdownStub = sinon.stub(pdfService, 'shutdownPDFRetries').returns(cleanup);

    pdfService.init();
    globalAny.sails.lower(lowerOptions, lowerCallback);

    expect(shutdownStub.calledOnce).to.be.true;
    expect(originalLower.called).to.be.false;

    finishCleanup();
    await waitForAssertion(() => {
      expect(originalLower.calledOnceWithExactly(lowerOptions, lowerCallback)).to.be.true;
    });
  });

  it('should return the record and log in the background when its brand cannot be resolved', async () => {
    globalAny.BrandingService.getBrandById.returns(null);
    const record = { metaMetadata: { brandId: 404 } };

    let observable: any;
    expect(() => {
      observable = pdfService.createPDF('oid-missing-brand', record, {}, {});
    }).to.not.throw();

    const result = await new Promise((resolve, reject) => {
      observable.subscribe({ next: resolve, error: reject });
    });

    expect(result).to.equal(record);
    await waitForAssertion(() => {
      expect(globalAny.sails.log.error.calledWithMatch(/Background PDF generation failed/)).to.be.true;
    });
    expect(mockPage.goto.called).to.be.false;
  });

  it('should derive sourceUrlBase from a non-default brand when it is unset', async () => {
    const record = { metaMetadata: { brandId: 2 } };
    const service: any = pdfService;

    await Effect.runPromise(service.attemptPDFGeneration('oid-branded', record, {}, { name: 'research' }, 1));

    expect(mockPage.goto.calledWith(
      'http://localhost:1500/research/rdmp/record/view/oid-branded',
      { waitUntil: 'domcontentloaded' }
    )).to.be.true;
  });

  it('rejects a login redirect even when the final page returns HTTP 200', async () => {
    const recordUrl = 'http://localhost:1500/default/rdmp/record/view/oid-login';
    const loginUrl = 'http://localhost:1500/default/rdmp/user/login';
    mockPage.goto.resolves(navigationResponse(loginUrl, 200, [recordUrl]));
    mockPage.url.returns(loginUrl);

    const exit = await Effect.runPromiseExit(
      pdfService.attemptPDFGeneration('oid-login', {}, {}, { name: 'default' }, 1)
    );

    expect(exit._tag).to.equal('Failure');
    expect(JSON.stringify((exit as any).cause)).to.contain('BrowserError');
    expect(mockPage.waitForNetworkIdle.called).to.be.false;
    expect(mockPage.pdf.called).to.be.false;
    expect(storageDiskPutStub.called).to.be.false;
    expect(addDatastreamStub.called).to.be.false;
  });

  it('rejects a non-2xx record response before rendering', async () => {
    const recordUrl = 'http://localhost:1500/default/rdmp/record/view/oid-denied';
    mockPage.goto.resolves(navigationResponse(recordUrl, 403));

    const exit = await Effect.runPromiseExit(
      pdfService.attemptPDFGeneration('oid-denied', {}, {}, { name: 'default' }, 1)
    );

    expect(exit._tag).to.equal('Failure');
    expect(mockPage.pdf.called).to.be.false;
    expect(storageDiskPutStub.called).to.be.false;
    expect(addDatastreamStub.called).to.be.false;
  });

  it('rejects an authentication redirect even if it returns to the record route', async () => {
    const recordUrl = 'http://localhost:1500/default/rdmp/record/view/oid-returned';
    const loginUrl = 'http://localhost:1500/default/rdmp/user/login';
    mockPage.goto.resolves(navigationResponse(recordUrl, 200, [recordUrl, loginUrl]));

    const exit = await Effect.runPromiseExit(
      pdfService.attemptPDFGeneration('oid-returned', {}, {}, { name: 'default' }, 1)
    );

    expect(exit._tag).to.equal('Failure');
    expect(mockPage.pdf.called).to.be.false;
  });

  it('accepts a same-origin redirect that ends at the requested record', async () => {
    const recordUrl = 'http://localhost:1500/default/rdmp/record/view/oid-redirected';
    const intermediateUrl = 'http://localhost:1500/default/rdmp/record/resolve/oid-redirected';
    mockPage.goto.resolves(navigationResponse(recordUrl, 200, [recordUrl, intermediateUrl]));

    await Effect.runPromise(
      pdfService.attemptPDFGeneration('oid-redirected', {}, {}, { name: 'default' }, 1)
    );

    expect(mockPage.pdf.calledOnce).to.be.true;
    expect(storageDiskPutStub.calledOnce).to.be.true;
    expect(addDatastreamStub.calledOnce).to.be.true;
  });

  for (const redirectUrl of ['http://[invalid', '/default/rdmp/user/login']) {
    it(`rejects an invalid redirect URL: ${redirectUrl}`, async () => {
      const recordUrl = 'http://localhost:1500/default/rdmp/record/view/oid-invalid-redirect';
      mockPage.goto.resolves(navigationResponse(recordUrl, 200, [recordUrl, redirectUrl]));

      const exit = await Effect.runPromiseExit(
        pdfService.attemptPDFGeneration('oid-invalid-redirect', {}, {}, { name: 'default' }, 1)
      );

      expect(exit._tag).to.equal('Failure');
      const failure = Cause.failureOption(exit.cause);
      expect(failure._tag).to.equal('Some');
      expect(failure.value._tag).to.equal('BrowserError');
      expect(failure.value.cause.message).to.equal(`Record navigation contained an invalid redirect URL: ${redirectUrl}`);
      expect(mockPage.waitForNetworkIdle.called).to.be.false;
      expect(mockPage.pdf.called).to.be.false;
      expect(storageDiskPutStub.called).to.be.false;
      expect(addDatastreamStub.called).to.be.false;
    });
  }

  for (const { change, sourceUrlBase, responsePath } of [
    {
      change: 'adds',
      sourceUrlBase: '/default/rdmp/record/view',
      responsePath: '/default/rdmp/record/view/oid-query?version=other',
    },
    {
      change: 'changes',
      sourceUrlBase: '/default/rdmp/record/render?oid=',
      responsePath: '/default/rdmp/record/render?oid=/another-record',
    },
    {
      change: 'removes',
      sourceUrlBase: '/default/rdmp/record/render?oid=',
      responsePath: '/default/rdmp/record/render',
    },
  ]) {
    it(`rejects a record response that ${change} the requested query string`, async () => {
      mockPage.goto.resolves(navigationResponse(`http://localhost:1500${responsePath}`));

      const exit = await Effect.runPromiseExit(
        pdfService.attemptPDFGeneration('oid-query', {}, { sourceUrlBase }, { name: 'default' }, 1)
      );

      expect(exit._tag).to.equal('Failure');
      expect(mockPage.waitForNetworkIdle.called).to.be.false;
      expect(mockPage.pdf.called).to.be.false;
      expect(storageDiskPutStub.called).to.be.false;
      expect(addDatastreamStub.called).to.be.false;
    });
  }

  it('accepts a redirect that preserves the requested query string', async () => {
    const sourceUrlBase = '/default/rdmp/record/render?oid=';
    const recordUrl = 'http://localhost:1500/default/rdmp/record/render?oid=/oid-query';
    mockPage.goto.resolves(navigationResponse(recordUrl, 200, [recordUrl]));

    await Effect.runPromise(
      pdfService.attemptPDFGeneration('oid-query', {}, { sourceUrlBase }, { name: 'default' }, 1)
    );

    expect(mockPage.goto.firstCall.args[0]).to.equal(recordUrl);
    expect(mockPage.pdf.calledOnce).to.be.true;
    expect(storageDiskPutStub.calledOnce).to.be.true;
    expect(addDatastreamStub.calledOnce).to.be.true;
  });

  it('rejects a page that changes the query string while becoming ready', async () => {
    mockPage.waitForNetworkIdle.callsFake(async () => {
      mockPage.url.returns('http://localhost:1500/default/rdmp/record/view/oid-late-query?version=other');
    });

    const exit = await Effect.runPromiseExit(
      pdfService.attemptPDFGeneration('oid-late-query', {}, {}, { name: 'default' }, 1)
    );

    expect(exit._tag).to.equal('Failure');
    expect(mockPage.pdf.called).to.be.false;
    expect(storageDiskPutStub.called).to.be.false;
    expect(addDatastreamStub.called).to.be.false;
  });

  it('rejects a missing navigation response', async () => {
    mockPage.goto.resolves(null);

    const exit = await Effect.runPromiseExit(
      pdfService.attemptPDFGeneration('oid-empty', {}, {}, { name: 'default' }, 1)
    );

    expect(exit._tag).to.equal('Failure');
    expect(mockPage.pdf.called).to.be.false;
  });

  it('rejects a page that leaves the record route while becoming ready', async () => {
    mockPage.waitForNetworkIdle.callsFake(async () => {
      mockPage.url.returns('http://localhost:1500/default/rdmp/user/login');
    });

    const exit = await Effect.runPromiseExit(
      pdfService.attemptPDFGeneration('oid-late-login', {}, {}, { name: 'default' }, 1)
    );

    expect(exit._tag).to.equal('Failure');
    expect(mockPage.pdf.called).to.be.false;
    expect(storageDiskPutStub.called).to.be.false;
  });

  it('renders a successful same-origin record response', async () => {
    await Effect.runPromise(
      pdfService.attemptPDFGeneration('oid-success', {}, {}, { name: 'default' }, 1)
    );

    expect(mockPage.pdf.calledOnce).to.be.true;
    expect(storageDiskPutStub.calledOnce).to.be.true;
    expect(addDatastreamStub.calledOnce).to.be.true;
  });

  it('blocks off-origin navigation and keeps the bearer token on portal requests', async () => {
    const handler = () => mockPage.on.getCalls()
      .find((call: any) => call.args[0] === 'request')?.args[1];
    const portalRequest = {
      url: () => 'http://localhost:1500/default/rdmp/record/view/oid-redirect',
      isNavigationRequest: () => true,
      frame: () => mockPage.mainFrame(),
      headers: () => ({}),
      continue: sinon.stub().resolves(),
      abort: sinon.stub().resolves(),
    };
    const externalRequest = {
      ...portalRequest,
      url: () => 'https://ds.aaf.edu.au/discovery',
      headers: () => ({ Authorization: 'Bearer test-token' }),
      continue: sinon.stub().resolves(),
      abort: sinon.stub().resolves(),
    };
    const externalAsset = {
      ...externalRequest,
      isNavigationRequest: () => false,
      continue: sinon.stub().resolves(),
      abort: sinon.stub().resolves(),
    };

    mockPage.goto.callsFake(async () => {
      handler()(portalRequest);
      handler()(externalRequest);
      handler()(externalAsset);
      throw new Error('net::ERR_BLOCKED_BY_CLIENT');
    });

    const exit = await Effect.runPromiseExit(
      pdfService.attemptPDFGeneration('oid-redirect', {}, {}, { name: 'default' }, 1)
    );

    expect(portalRequest.continue.firstCall.args[0].headers.Authorization).to.equal('Bearer test-token');
    expect(externalRequest.abort.calledOnce).to.be.true;
    expect(externalRequest.continue.called).to.be.false;
    expect(externalAsset.continue.firstCall.args[0].headers).to.not.have.property('Authorization');
    expect(externalAsset.abort.called).to.be.false;
    expect(exit._tag).to.equal('Failure');
    expect(mockPage.pdf.called).to.be.false;
    expect(storageDiskPutStub.called).to.be.false;
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

    const observable = pdfService.createPDF('oid-1', record, options, {});
    const result = await new Promise((resolve, reject) => {
      observable.subscribe({ next: resolve, error: reject });
    });

    expect(result).to.equal(record);

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

    mockPage.goto.callsFake(async (url: string) => {
      options.readinessStrategy = 'selector';
      return navigationResponse(url);
    });

    const service: any = pdfService;
    await Effect.runPromise(
      service.attemptPDFGeneration('oid-stable-readiness', record, options, { name: 'default' }, 1)
    );

    expect(mockPage.waitForNetworkIdle.calledOnce).to.be.true;
    expect(mockPage.waitForSelector.called).to.be.false;
  });

  it('should enable request interception before navigation', async () => {
    const record = { metaMetadata: { brandId: 1 } };
    let releaseHeaders: (() => void) | undefined;
    let markHeadersStarted: (() => void) | undefined;
    const headersStarted = new Promise<void>(resolve => {
      markHeadersStarted = resolve;
    });

    mockPage.setRequestInterception.callsFake(
      () =>
        new Promise<void>(resolve => {
          markHeadersStarted?.();
          releaseHeaders = resolve;
        })
    );

    const service: any = pdfService;
    const generation = Effect.runPromise(service.attemptPDFGeneration('oid-1', record, {}, { name: 'default' }, 1));

    await headersStarted;

    expect(mockPage.setRequestInterception.calledOnceWithExactly(true)).to.be.true;
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

    mockPage.setRequestInterception.callsFake(
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

  it('should return the record before the initial browser render completes', async () => {
    const record = { metaMetadata: { brandId: 1 } };
    let releaseNavigation: (() => void) | undefined;
    let markNavigationStarted: (() => void) | undefined;
    const navigationStarted = new Promise<void>(resolve => {
      markNavigationStarted = resolve;
    });

    mockPage.goto.callsFake((url: string) => new Promise(resolve => {
      markNavigationStarted?.();
      releaseNavigation = () => resolve(navigationResponse(url));
    }));

    const observable = pdfService.createPDF('oid-1', record, {}, {});
    const result = await new Promise((resolve, reject) => {
      observable.subscribe({ next: resolve, error: reject });
    });

    expect(result).to.equal(record);
    await navigationStarted;
    expect(mockPage.pdf.called).to.be.false;

    releaseNavigation?.();
    await waitForAssertion(() => {
      expect(addDatastreamStub.calledOnce).to.be.true;
    });
  });

  it('should cancel a pending retry when a fresh request succeeds during the retry delay', async () => {
    const record = { metaMetadata: { brandId: 1 } };
    const options = {
      maxRetries: 1,
      retryDelayMs: 50,
    };

    mockPage.goto.onFirstCall().rejects(new Error('Navigation timeout'));

    const firstObservable = pdfService.createPDF('oid-1', record, options, {});
    await new Promise((resolve, reject) => {
      firstObservable.subscribe({ next: resolve, error: reject });
    });

    await waitForAssertion(() => {
      expect(globalAny.sails.log.warn.calledWithMatch(/Retry scheduled: true/)).to.be.true;
    });

    const secondObservable = pdfService.createPDF('oid-1', record, options, {});
    await new Promise((resolve, reject) => {
      secondObservable.subscribe({ next: resolve, error: reject });
    });

    await new Promise(resolve => setTimeout(resolve, 90));

    expect(mockPage.goto.callCount).to.equal(2);
  });
});
