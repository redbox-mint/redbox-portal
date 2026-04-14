describe('The IntegrationAuditService', function () {
  const createdOids: string[] = [];
  let integrationAuditService;

  function wait(ms: number) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  async function waitForAuditCount(oid: string, expectedCount: number) {
    for (let attempt = 0; attempt < 20; attempt++) {
      const audits = await integrationAuditService.getAuditLog({ oid, page: 1, pageSize: 20 });
      if (audits.total === expectedCount) {
        return audits;
      }
      await wait(100);
    }
    return integrationAuditService.getAuditLog({ oid, page: 1, pageSize: 20 });
  }

  before(function () {
    integrationAuditService = sails.services.integrationauditservice;
    if (typeof integrationAuditService.getStorageService === 'function') {
      integrationAuditService.getStorageService(integrationAuditService);
    }
  });

  afterEach(async function () {
    if (createdOids.length === 0) {
      return;
    }

    const oidsToDelete = createdOids.splice(0, createdOids.length);
    await IntegrationAudit.destroy({
      or: oidsToDelete.map(redboxOid => ({ redboxOid })),
    });
  });

  it('reads persisted integration audit entries back in descending order', async function () {
    const oid = `integration-audit-service-${Date.now()}-1`;
    createdOids.push(oid);

    await IntegrationAudit.create({
      redboxOid: oid,
      brandId: 'default',
      integrationName: 'figshare',
      integrationAction: 'syncRecordWithFigshare',
      triggeredBy: 'integration-test',
      status: 'started',
      traceId: `trace-${Date.now()}-1`,
      spanId: `span-${Date.now()}-1`,
      startedAt: '2025-01-01T00:00:00.000Z',
    });
    await IntegrationAudit.create({
      redboxOid: oid,
      brandId: 'default',
      integrationName: 'figshare',
      integrationAction: 'syncRecordWithFigshare',
      triggeredBy: 'integration-test',
      status: 'failed',
      message: 'sync failed',
      errorDetail: 'downstream rejected request',
      httpStatusCode: 502,
      traceId: `trace-${Date.now()}-2`,
      spanId: `span-${Date.now()}-2`,
      startedAt: '2025-01-01T00:00:01.000Z',
      completedAt: '2025-01-01T00:00:02.000Z',
      durationMs: 1000,
      responseSummary: { safe: true },
    });

    const directAudits = await IntegrationAudit.find({ redboxOid: oid });
    expect(directAudits).to.have.length(2);

    const audits = await waitForAuditCount(oid, 2);

    expect(audits.total).to.equal(2);
    expect(audits.rows).to.have.length(2);
    expect(audits.rows[0]).to.have.property('status', 'failed');
    expect(audits.rows[1]).to.have.property('status', 'started');
    expect(audits.rows[0]).to.have.property('integrationAction', 'syncRecordWithFigshare');
    expect(audits.rows[0]).to.have.property('brandId', 'default');
    expect(audits.rows[0]).to.have.property('triggeredBy', 'integration-test');
    expect(audits.rows[0].responseSummary.safe).to.equal(true);
    expect(audits.rows[0].httpStatusCode).to.equal(502);
    expect(audits.rows[0].durationMs).to.equal(1000);
  });

  it('filters integration audit entries by status and paginates results', async function () {
    const oid = `integration-audit-service-${Date.now()}-2`;
    createdOids.push(oid);

    await IntegrationAudit.create({
      redboxOid: oid,
      brandId: 'default',
      integrationName: 'figshare',
      integrationAction: 'publishAfterUploadFilesJob',
      triggeredBy: 'integration-test',
      status: 'started',
      traceId: `trace-${Date.now()}-3`,
      spanId: `span-${Date.now()}-3`,
      startedAt: '2025-01-01T00:00:00.000Z',
    });
    await IntegrationAudit.create({
      redboxOid: oid,
      brandId: 'default',
      integrationName: 'figshare',
      integrationAction: 'publishAfterUploadFilesJob',
      triggeredBy: 'integration-test',
      status: 'success',
      message: 'publish ok',
      traceId: `trace-${Date.now()}-4`,
      spanId: `span-${Date.now()}-4`,
      startedAt: '2025-01-01T00:00:01.000Z',
      completedAt: '2025-01-01T00:00:02.000Z',
      durationMs: 1000,
    });
    await IntegrationAudit.create({
      redboxOid: oid,
      brandId: 'default',
      integrationName: 'figshare',
      integrationAction: 'publishAfterUploadFilesJob',
      triggeredBy: 'integration-test',
      status: 'started',
      traceId: `trace-${Date.now()}-5`,
      spanId: `span-${Date.now()}-5`,
      startedAt: '2025-01-01T00:00:03.000Z',
    });
    await IntegrationAudit.create({
      redboxOid: oid,
      brandId: 'default',
      integrationName: 'figshare',
      integrationAction: 'publishAfterUploadFilesJob',
      triggeredBy: 'integration-test',
      status: 'failed',
      message: 'publish failed',
      errorDetail: 'publish failed',
      traceId: `trace-${Date.now()}-6`,
      spanId: `span-${Date.now()}-6`,
      startedAt: '2025-01-01T00:00:04.000Z',
      completedAt: '2025-01-01T00:00:05.000Z',
      durationMs: 1000,
    });

    const directAudits = await IntegrationAudit.find({ redboxOid: oid });
    expect(directAudits).to.have.length(4);

    const allAudits = await waitForAuditCount(oid, 4);
    expect(allAudits.total).to.equal(4);
    expect(allAudits.rows).to.have.length(4);

    const successAudits = await integrationAuditService.getAuditLog({
      oid,
      status: 'success',
      page: 1,
      pageSize: 10,
    });
    expect(successAudits.total).to.equal(1);
    expect(successAudits.rows).to.have.length(1);
    expect(successAudits.rows[0]).to.have.property('status', 'success');

    const pageOne = await integrationAuditService.getAuditLog({
      oid,
      page: 1,
      pageSize: 2,
    });
    const pageTwo = await integrationAuditService.getAuditLog({
      oid,
      page: 2,
      pageSize: 2,
    });

    expect(pageOne.total).to.equal(4);
    expect(pageTwo.total).to.equal(4);
    expect(pageOne.rows).to.have.length(2);
    expect(pageTwo.rows).to.have.length(2);
    expect(pageOne.rows[0].startedAt >= pageOne.rows[1].startedAt).to.equal(true);
    expect(pageOne.rows[0].startedAt >= pageTwo.rows[0].startedAt).to.equal(true);
  });

  it('groups persisted integration audit entries by trace id for trace-oriented views', async function () {
    const oid = `integration-audit-service-${Date.now()}-3`;
    createdOids.push(oid);
    const traceSuccess = `trace-${Date.now()}-7`;
    const traceFailed = `trace-${Date.now()}-8`;
    const traceStarted = `trace-${Date.now()}-9`;

    await IntegrationAudit.create({
      redboxOid: oid,
      brandId: 'default',
      integrationName: 'figshare',
      integrationAction: 'syncRecordWithFigshare',
      triggeredBy: 'integration-test',
      status: 'success',
      traceId: traceSuccess,
      spanId: `span-${Date.now()}-7`,
      startedAt: '2025-01-01T00:00:00.000Z',
      completedAt: '2025-01-01T00:00:01.000Z',
      durationMs: 1000,
    });
    await IntegrationAudit.create({
      redboxOid: oid,
      brandId: 'default',
      integrationName: 'figshare',
      integrationAction: 'publishAfterUploadFilesJob',
      triggeredBy: 'integration-test',
      status: 'failed',
      traceId: traceFailed,
      spanId: 'child-span',
      parentSpanId: 'root-span',
      startedAt: '2025-01-01T00:00:04.000Z',
      completedAt: '2025-01-01T00:00:05.000Z',
      durationMs: 1000,
    });
    await IntegrationAudit.create({
      redboxOid: oid,
      brandId: 'default',
      integrationName: 'figshare',
      integrationAction: 'syncRecordWithFigshare',
      triggeredBy: 'integration-test',
      status: 'success',
      traceId: traceFailed,
      spanId: 'root-span',
      startedAt: '2025-01-01T00:00:03.000Z',
      completedAt: '2025-01-01T00:00:03.500Z',
      durationMs: 500,
    });
    await IntegrationAudit.create({
      redboxOid: oid,
      brandId: 'default',
      integrationName: 'figshare',
      integrationAction: 'publishAfterUploadFilesJob',
      triggeredBy: 'integration-test',
      status: 'started',
      traceId: traceStarted,
      spanId: `span-${Date.now()}-9`,
      startedAt: '2025-01-01T00:00:06.000Z',
    });

    const traces = await integrationAuditService.getTraceAuditLog({ oid, page: 1, pageSize: 10 });

    expect(traces.total).to.equal(3);
    expect(traces.rows).to.have.length(3);
    expect(traces.rows[0]).to.have.property('status', 'started');
    expect(traces.rows[1]).to.have.property('status', 'failed');
    expect(traces.rows[1].events).to.have.length(2);
    expect(traces.rows[1].events[0]).to.have.property('spanId', 'root-span');
    expect(traces.rows[1].events[1]).to.have.property('spanId', 'child-span');
    expect(traces.rows[1].events[1]).to.have.property('depth', 1);
  });

  it('supports DOI integration audit rows', async function () {
    const oid = `integration-audit-service-${Date.now()}-4`;
    createdOids.push(oid);

    await IntegrationAudit.create({
      redboxOid: oid,
      brandId: 'default',
      integrationName: 'doi',
      integrationAction: 'publishDoi',
      triggeredBy: 'integration-test',
      status: 'success',
      traceId: `trace-${Date.now()}-10`,
      spanId: `span-${Date.now()}-10`,
      startedAt: '2025-01-01T00:00:00.000Z',
      completedAt: '2025-01-01T00:00:01.000Z',
      durationMs: 1000,
      responseSummary: { doi: '10.1234/5678' },
    });

    const audits = await waitForAuditCount(oid, 1);
    expect(audits.rows[0]).to.have.property('integrationName', 'doi');
    expect(audits.rows[0]).to.have.property('integrationAction', 'publishDoi');
    expect(audits.rows[0].responseSummary.doi).to.equal('10.1234/5678');
  });
});
