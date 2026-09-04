const { Cause, Effect } = require('effect');
const sinon = require('sinon');
const { expect } = require('@researchdatabox/redbox-dev-tools/testing');
const {
  clearPdfgenTestGlobals,
  installPdfgenTestGlobals,
  waitForAssertion,
} = require('../support/globals');

const globalAny = global as any;

type StubAuditService = {
  startAudit: sinon.SinonStub;
  completeAudit: sinon.SinonStub;
  failAudit: sinon.SinonStub;
};

function installAuditServiceStub(): StubAuditService {
  let nextId = 0;
  const startAudit = sinon.stub().callsFake((oid: string, action: string, opts?: any) => {
    nextId += 1;
    return {
      redboxOid: oid,
      integrationName: opts?.integrationName ?? 'pdf',
      integrationAction: action,
      triggeredBy: opts?.triggeredBy,
      traceId: opts?.traceId ?? `trace-${nextId}`,
      spanId: `span-${nextId}`,
      parentSpanId: opts?.parentSpanId,
      startedAt: new Date().toISOString(),
      requestSummary: opts?.requestSummary,
      brandId: opts?.brandId,
    };
  });
  const completeAudit = sinon.stub();
  const failAudit = sinon.stub();
  const stub: StubAuditService = { startAudit, completeAudit, failAudit };
  (globalThis as any).IntegrationAuditService = stub;
  return stub;
}

function clearAuditServiceStub() {
  delete (globalThis as any).IntegrationAuditService;
}

describe('PDFService Integration Audit', () => {
  let pdfService: any;
  let mockPage: any;
  let mockBrowser: any;
  let auditStub: StubAuditService;

  beforeEach(function () {
    this.timeout(10000);
    installPdfgenTestGlobals();
    auditStub = installAuditServiceStub();

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
      pdf: sinon.stub().resolves(Buffer.from('mock pdf content')),
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
    clearAuditServiceStub();
    clearPdfgenTestGlobals();
  });

  it('records a startAudit + completeAudit pair on successful PDF generation', async () => {
    const record = { metaMetadata: { brandId: 1 } };
    const options = {};

    const service: any = pdfService;
    await Effect.runPromise(service.attemptPDFGeneration('oid-success', record, options, { name: 'default' }, 1));

    expect(auditStub.startAudit.calledOnce).to.be.true;
    const [oid, action, opts] = auditStub.startAudit.getCall(0).args;
    expect(oid).to.equal('oid-success');
    expect(action).to.equal('generatePdf');
    expect(opts.integrationName).to.equal('pdf');
    expect(opts.triggeredBy).to.equal('createPDF');
    expect(opts.brandId).to.equal('1');
    expect(opts.requestSummary).to.deep.include({
      attempt: 1,
      url: 'http://localhost:1500/default/rdmp/record/view/oid-success',
      sourceUrlBase: '/default/rdmp/record/view',
      readinessStrategy: 'networkIdle',
    });

    expect(auditStub.completeAudit.calledOnce).to.be.true;
    expect(auditStub.failAudit.called).to.be.false;
    const [, completeDetails] = auditStub.completeAudit.getCall(0).args;
    expect(completeDetails.message).to.equal('PDF generated successfully.');
    expect(completeDetails.responseSummary).to.have.property('fileId');
    expect(String(completeDetails.responseSummary.fileId)).to.match(/oid-success.*\.pdf$/);
    expect(completeDetails.responseSummary.pdfBufferSize).to.be.greaterThan(0);
    expect(completeDetails.responseSummary.attempt).to.equal(1);
  });

  it('records duplicate suppression as a skipped audit outcome', async () => {
    const record = { metaMetadata: { brandId: 1 } };
    const options = {};
    const currentURL = 'http://localhost:1500/default/rdmp/record/view/oid-duplicate';
    const service: any = pdfService;

    service.processMap.add(currentURL);
    await Effect.runPromise(service.attemptPDFGeneration('oid-duplicate', record, options, { name: 'default' }, 1));

    expect(auditStub.startAudit.calledOnce).to.be.true;
    expect(auditStub.completeAudit.calledOnce).to.be.true;
    expect(auditStub.failAudit.called).to.be.false;
    expect(mockBrowser.newPage.called).to.be.false;

    const [, completeDetails] = auditStub.completeAudit.getCall(0).args;
    expect(completeDetails.message).to.equal(
      'PDF generation skipped because a duplicate request was already in progress.'
    );
    expect(completeDetails.responseSummary).to.deep.equal({
      outcome: 'duplicateSuppressed',
      attempt: 1,
    });
  });

  it('marks the parent audit as skipped when the initial attempt is a duplicate', async () => {
    const record = { metaMetadata: { brandId: 1 } };
    const options = {};
    const currentURL = 'http://localhost:1500/default/rdmp/record/view/oid-parent-duplicate';

    pdfService.processMap.add(currentURL);
    const observable = pdfService.createPDF('oid-parent-duplicate', record, options, {});
    await new Promise((resolve, reject) => {
      observable.subscribe({ next: resolve, error: reject });
    });

    let parentSkipped: any;
    await waitForAssertion(() => {
      parentSkipped = auditStub.completeAudit
        .getCalls()
        .find(
          (call: any) =>
            call.args[0]?.integrationAction === 'generatePdfTrigger' &&
            call.args[1]?.responseSummary?.finalStatus === 'skipped'
        );
      expect(parentSkipped).to.exist;
    });
    pdfService.processMap.delete(currentURL);

    expect(parentSkipped!.args[1].message).to.equal('PDF generation pipeline skipped.');
    expect(parentSkipped!.args[1].responseSummary).to.deep.equal({
      attemptsRun: 1,
      finalStatus: 'skipped',
    });
  });

  it('records a startAudit + failAudit pair when navigation fails', async () => {
    const record = { metaMetadata: { brandId: 1 } };
    const options = {};

    mockPage.goto.rejects(new Error('navigation kaboom'));

    const service: any = pdfService;
    const exit = await Effect.runPromiseExit(
      service.attemptPDFGeneration('oid-fail', record, options, { name: 'default' }, 1)
    );

    expect(exit._tag).to.equal('Failure');

    expect(auditStub.startAudit.calledOnce).to.be.true;
    expect(auditStub.completeAudit.called).to.be.false;
    expect(auditStub.failAudit.calledOnce).to.be.true;

    const [, failedError, failDetails] = auditStub.failAudit.getCall(0).args;
    expect(failedError._tag).to.equal('BrowserError');
    expect(failDetails.message).to.equal('PDF generation failed.');
    expect(failDetails.responseSummary).to.deep.include({
      errorTag: 'BrowserError',
      url: 'http://localhost:1500/default/rdmp/record/view/oid-fail',
      attempt: 1,
    });
    expect(failDetails.responseSummary.cause).to.equal('navigation kaboom');
  });

  it('records a child audit failure when readiness config validation fails', async () => {
    const record = { metaMetadata: { brandId: 1 } };
    const options = {
      readinessStrategy: 'selector',
      waitForSelector: '   ',
    };

    const service: any = pdfService;
    const exit = await Effect.runPromiseExit(
      service.attemptPDFGeneration('oid-invalid-readiness', record, options, { name: 'default' }, 1)
    );

    expect(exit._tag).to.equal('Failure');
    expect(auditStub.startAudit.calledOnce).to.be.true;
    expect(auditStub.completeAudit.called).to.be.false;
    expect(auditStub.failAudit.calledOnce).to.be.true;

    const [, failedError, failDetails] = auditStub.failAudit.getCall(0).args;
    expect(failedError._tag).to.equal('InvalidReadinessOptionError');
    expect(failDetails.message).to.equal('PDF generation failed.');
    expect(failDetails.responseSummary).to.deep.include({
      errorTag: 'InvalidReadinessOptionError',
      url: 'http://localhost:1500/default/rdmp/record/view/oid-invalid-readiness',
      attempt: 1,
    });
    expect(mockPage.goto.called).to.be.false;
  });

  it('marks the parent audit as failed when retries are exhausted with maxRetries set to zero', async () => {
    const record = { metaMetadata: { brandId: 1 } };
    const options = { maxRetries: 0, retryDelayMs: 1 };

    mockPage.goto.rejects(new Error('navigation kaboom'));

    const observable = pdfService.createPDF('oid-no-retries', record, options, {});
    await new Promise((resolve, reject) => {
      observable.subscribe({ next: resolve, error: reject });
    });

    let parentFailure: any;
    await waitForAssertion(() => {
      parentFailure = auditStub.failAudit
        .getCalls()
        .find((call: any) => call.args[0]?.integrationAction === 'generatePdfTrigger');
      expect(parentFailure).to.exist;
    });
    expect(parentFailure).to.exist;
    expect(parentFailure!.args[2].responseSummary.finalStatus).to.equal('failed');
    expect(parentFailure!.args[2].responseSummary.attemptsRun).to.equal(1);
    expect(
      auditStub.completeAudit
        .getCalls()
        .some(
          (call: any) =>
            call.args[1]?.message === 'PDF generation pipeline completed.' &&
            call.args[1]?.responseSummary?.finalStatus === 'failed'
        )
    ).to.be.false;
  });

  it('marks the parent audit as skipped when PDF generation is disabled by a missing token', async () => {
    const record = { metaMetadata: { brandId: 1 } };
    const options = { token: '' };

    const observable = pdfService.createPDF('oid-missing-token', record, options, {});
    await new Promise((resolve, reject) => {
      observable.subscribe({ next: resolve, error: reject });
    });

    let parentSkipped: any;
    await waitForAssertion(() => {
      parentSkipped = auditStub.completeAudit
        .getCalls()
        .find(
          (call: any) =>
            call.args[0]?.integrationAction === 'generatePdfTrigger' &&
            call.args[1]?.responseSummary?.finalStatus === 'skipped'
        );
      expect(parentSkipped).to.exist;
    });

    expect(parentSkipped!.args[1].message).to.equal('PDF generation pipeline skipped.');
    expect(parentSkipped!.args[1].responseSummary).to.deep.equal({
      attemptsRun: 1,
      finalStatus: 'skipped',
      errorTag: 'MissingTokenError',
    });
    expect(auditStub.failAudit.getCalls().some((call: any) => call.args[0]?.integrationAction === 'generatePdfTrigger'))
      .to.be.false;
  });

  it('inherits traceId and parentSpanId from a supplied parent context', async () => {
    const record = { metaMetadata: { brandId: 1 } };
    const options = {};
    const parentCtx = {
      redboxOid: 'oid-child',
      integrationName: 'pdf',
      integrationAction: 'generatePdfTrigger',
      traceId: 'trace-parent',
      spanId: 'span-parent',
      startedAt: new Date().toISOString(),
    };

    const service: any = pdfService;
    await Effect.runPromise(
      service.attemptPDFGeneration('oid-child', record, options, { name: 'default' }, 2, parentCtx)
    );

    expect(auditStub.startAudit.calledOnce).to.be.true;
    const [, , opts] = auditStub.startAudit.getCall(0).args;
    expect(opts.traceId).to.equal('trace-parent');
    expect(opts.parentSpanId).to.equal('span-parent');
    expect(opts.triggeredBy).to.equal('pdfRetry');
    expect(opts.requestSummary.attempt).to.equal(2);
  });

  it('emits a parent generatePdfTrigger audit and a child generatePdf audit on createPDF success', async () => {
    const record = { metaMetadata: { brandId: 1 } };
    const options = {};

    const observable = pdfService.createPDF('oid-parent-success', record, options, {});
    await new Promise((resolve, reject) => {
      observable.subscribe({ next: resolve, error: reject });
    });

    await waitForAssertion(() => {
      expect(auditStub.startAudit.callCount).to.equal(2);
      expect(auditStub.completeAudit.callCount).to.equal(2);
    });
    const [parentOid, parentAction, parentOpts] = auditStub.startAudit.getCall(0).args;
    const [childOid, childAction, childOpts] = auditStub.startAudit.getCall(1).args;

    expect(parentOid).to.equal('oid-parent-success');
    expect(parentAction).to.equal('generatePdfTrigger');
    expect(parentOpts.triggeredBy).to.equal('createPDF');
    expect(parentOpts.requestSummary).to.have.property('maxRetries');

    expect(childOid).to.equal('oid-parent-success');
    expect(childAction).to.equal('generatePdf');
    expect(childOpts.parentSpanId).to.equal('span-1');
    expect(childOpts.traceId).to.equal('trace-1');

    const finalParentResult = auditStub.completeAudit
      .getCalls()
      .find((call: any) => call.args[1]?.message === 'PDF generation pipeline completed.');
    expect(finalParentResult).to.exist;
    expect(finalParentResult!.args[1].responseSummary.finalStatus).to.equal('success');
    expect(finalParentResult!.args[1].responseSummary.attemptsRun).to.equal(1);
  });

  it('uses options.triggerSource for the parent triggeredBy when provided', async () => {
    const record = { metaMetadata: { brandId: 1 } };
    const options = { triggerSource: 'PDFService-CreatePDF-job' };

    const observable = pdfService.createPDF('oid-trigger-source', record, options, {});
    await new Promise((resolve, reject) => {
      observable.subscribe({ next: resolve, error: reject });
    });

    await waitForAssertion(() => {
      expect(auditStub.startAudit.called).to.be.true;
    });
    const [, , parentOpts] = auditStub.startAudit.getCall(0).args;
    expect(parentOpts.triggeredBy).to.equal('PDFService-CreatePDF-job');
  });

  it('records audit entries for each background retry under the same parent trace', async () => {
    const record = { metaMetadata: { brandId: 1 } };
    const options = { maxRetries: 1, retryDelayMs: 10 };

    mockPage.goto.onFirstCall().rejects(new Error('transient'));
    mockPage.goto.onSecondCall().resolves();

    const observable = pdfService.createPDF('oid-retry', record, options, {});
    await new Promise((resolve, reject) => {
      observable.subscribe({ next: resolve, error: reject });
    });

    await waitForAssertion(() => {
      expect(auditStub.startAudit.callCount).to.equal(3);
      expect(auditStub.failAudit.callCount).to.equal(1);
      expect(auditStub.completeAudit.callCount).to.equal(2);
    }, 500);

    expect(auditStub.startAudit.getCall(0).args[1]).to.equal('generatePdfTrigger');
    expect(auditStub.startAudit.getCall(1).args[1]).to.equal('generatePdf');
    expect(auditStub.startAudit.getCall(2).args[1]).to.equal('generatePdf');

    // Both child attempts share the parent's traceId
    const parentTrace = auditStub.startAudit.getCall(0).returnValue.traceId;
    expect(auditStub.startAudit.getCall(1).args[2].traceId).to.equal(parentTrace);
    expect(auditStub.startAudit.getCall(2).args[2].traceId).to.equal(parentTrace);

    const parentFinal = auditStub.completeAudit
      .getCalls()
      .find((call: any) => call.args[1]?.message === 'PDF generation pipeline completed.');
    expect(parentFinal).to.exist;
    expect(parentFinal!.args[1].responseSummary.attemptsRun).to.equal(2);
    expect(parentFinal!.args[1].responseSummary.finalStatus).to.equal('success');
  });

  it('marks the parent audit as skipped when a retry attempt is a duplicate', async () => {
    const record = { metaMetadata: { brandId: 1 } };
    const options = { maxRetries: 1, retryDelayMs: 100 };
    const currentURL = 'http://localhost:1500/default/rdmp/record/view/oid-retry-duplicate';

    mockPage.goto.rejects(new Error('transient'));
    const observable = pdfService.createPDF('oid-retry-duplicate', record, options, {});
    await new Promise((resolve, reject) => {
      observable.subscribe({ next: resolve, error: reject });
    });

    await waitForAssertion(() => {
      expect(pdfService.retryTasks.size).to.equal(1);
    });
    pdfService.processMap.add(currentURL);

    let parentSkipped: any;
    await waitForAssertion(() => {
      parentSkipped = auditStub.completeAudit
        .getCalls()
        .find(
          (call: any) =>
            call.args[0]?.integrationAction === 'generatePdfTrigger' &&
            call.args[1]?.responseSummary?.finalStatus === 'skipped'
        );
      expect(parentSkipped).to.exist;
    });
    pdfService.processMap.delete(currentURL);

    expect(mockPage.goto.calledOnce).to.be.true;
    expect(parentSkipped!.args[1].responseSummary).to.deep.equal({
      attemptsRun: 2,
      finalStatus: 'skipped',
    });
  });

  it('fails the parent audit when a pending background retry is interrupted on shutdown', async () => {
    const record = { metaMetadata: { brandId: 1 } };
    const options = { maxRetries: 1, retryDelayMs: 500 };

    mockPage.goto.rejects(new Error('transient'));

    const observable = pdfService.createPDF('oid-shutdown-retry', record, options, {});
    await new Promise((resolve, reject) => {
      observable.subscribe({ next: resolve, error: reject });
    });

    await waitForAssertion(() => {
      expect(pdfService.retryTasks.size).to.equal(1);
    });

    await pdfService.shutdownPDFRetries();

    const parentFailure = auditStub.failAudit
      .getCalls()
      .find((call: any) => call.args[0]?.integrationAction === 'generatePdfTrigger');
    expect(parentFailure).to.exist;
    expect(parentFailure!.args[2].responseSummary).to.deep.equal({
      attemptsRun: 1,
      finalStatus: 'failed',
    });
    expect(mockPage.goto.calledOnce).to.be.true;
  });

  it('fails the child and parent audits when initial generation is interrupted on shutdown', async () => {
    const record = { metaMetadata: { brandId: 1 } };
    const options = {};
    let markNavigationStarted!: () => void;
    const navigationStarted = new Promise<void>((resolve) => {
      markNavigationStarted = resolve;
    });

    mockPage.goto.callsFake(() => {
      markNavigationStarted();
      return new Promise<never>(() => undefined);
    });

    const observable = pdfService.createPDF('oid-shutdown-initial', record, options, {});
    await new Promise((resolve, reject) => {
      observable.subscribe({ next: resolve, error: reject });
    });
    await navigationStarted;

    await pdfService.shutdownPDFRetries();

    expect(auditStub.startAudit.callCount).to.equal(2);
    expect(auditStub.completeAudit.called).to.be.false;
    expect(auditStub.failAudit.callCount).to.equal(2);

    const childFailure = auditStub.failAudit
      .getCalls()
      .find((call: any) => call.args[0]?.integrationAction === 'generatePdf');
    expect(childFailure).to.exist;
    expect(childFailure!.args[1].name).to.equal('PDFGenerationInterruptedError');
    expect(childFailure!.args[2]).to.deep.equal({
      message: 'PDF generation interrupted during service shutdown.',
      responseSummary: {
        errorTag: 'PDFGenerationInterruptedError',
        url: 'http://localhost:1500/default/rdmp/record/view/oid-shutdown-initial',
        attempt: 1,
      },
    });

    const parentFailure = auditStub.failAudit
      .getCalls()
      .find((call: any) => call.args[0]?.integrationAction === 'generatePdfTrigger');
    expect(parentFailure).to.exist;
    expect(parentFailure!.args[1].name).to.equal('PDFGenerationInterruptedError');
    expect(parentFailure!.args[2]).to.deep.equal({
      message: 'PDF generation pipeline failed.',
      responseSummary: {
        attemptsRun: 1,
        finalStatus: 'failed',
      },
    });
  });

  it('still generates a PDF when IntegrationAuditService global is missing', async () => {
    clearAuditServiceStub();

    const record = { metaMetadata: { brandId: 1 } };
    const options = {};

    const service: any = pdfService;
    await Effect.runPromise(service.attemptPDFGeneration('oid-no-audit', record, options, { name: 'default' }, 1));

    // No throws, no audit calls, page.goto reached as normal
    expect(mockPage.goto.calledOnce).to.be.true;
    expect(auditStub.startAudit.called).to.be.false;
    expect(auditStub.completeAudit.called).to.be.false;
    expect(auditStub.failAudit.called).to.be.false;
  });

  it('still returns an Observable when the parent audit start throws', async () => {
    auditStub.startAudit.throws(new Error('audit start unavailable'));

    const record = { metaMetadata: { brandId: 1 } };
    const options = {};

    const observable = pdfService.createPDF('oid-parent-start-throws', record, options, {});
    await new Promise((resolve, reject) => {
      observable.subscribe({ next: resolve, error: reject });
    });

    await waitForAssertion(() => {
      expect(mockPage.goto.calledOnce).to.be.true;
      expect(auditStub.startAudit.called).to.be.true;
    });
  });

  it('still completes PDF generation when child audit completion throws', async () => {
    auditStub.completeAudit.throws(new Error('audit complete unavailable'));

    const record = { metaMetadata: { brandId: 1 } };
    const options = {};

    const service: any = pdfService;
    await Effect.runPromise(
      service.attemptPDFGeneration('oid-child-complete-throws', record, options, { name: 'default' }, 1)
    );

    expect(mockPage.goto.calledOnce).to.be.true;
    expect(auditStub.completeAudit.calledOnce).to.be.true;
  });

  it('preserves the original PDF failure when audit failure recording throws', async () => {
    auditStub.failAudit.throws(new Error('audit fail unavailable'));
    mockPage.goto.rejects(new Error('navigation kaboom'));

    const record = { metaMetadata: { brandId: 1 } };
    const options = {};

    const service: any = pdfService;
    const exit = await Effect.runPromiseExit(
      service.attemptPDFGeneration('oid-child-fail-throws', record, options, { name: 'default' }, 1)
    );

    expect(exit._tag).to.equal('Failure');
    if (exit._tag === 'Failure') {
      expect(Cause.squash(exit.cause)._tag).to.equal('BrowserError');
    }
    expect(auditStub.failAudit.calledOnce).to.be.true;
  });
});
