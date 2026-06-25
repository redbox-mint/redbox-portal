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

    await waitForAuditCount(oid, 4);

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

  it('returns status summary grouped by integration name without sensitive fields', async function () {
    const oid = `integration-audit-service-${Date.now()}-5`;
    createdOids.push(oid);
    const traceDoi1 = `trace-${Date.now()}-doi1`;
    const traceDoi2 = `trace-${Date.now()}-doi2`;
    const traceFigshare = `trace-${Date.now()}-fig`;

    await IntegrationAudit.create({
      redboxOid: oid,
      brandId: 'default',
      integrationName: 'doi',
      integrationAction: 'publishDoi',
      triggeredBy: 'test',
      status: 'success',
      traceId: traceDoi1,
      spanId: `span-${Date.now()}-doi1`,
      startedAt: '2025-01-01T00:00:00.000Z',
      completedAt: '2025-01-01T00:00:01.000Z',
      durationMs: 1000,
      responseSummary: { doi: '10.1234/5678' },
    });
    await IntegrationAudit.create({
      redboxOid: oid,
      brandId: 'default',
      integrationName: 'doi',
      integrationAction: 'updateDoi',
      triggeredBy: 'test',
      status: 'started',
      traceId: traceDoi2,
      spanId: `span-${Date.now()}-doi2`,
      startedAt: '2025-01-01T00:00:02.000Z',
    });
    await IntegrationAudit.create({
      redboxOid: oid,
      brandId: 'default',
      integrationName: 'figshare',
      integrationAction: 'syncRecordWithFigshare',
      triggeredBy: 'test',
      status: 'failed',
      traceId: traceFigshare,
      spanId: `span-${Date.now()}-fig`,
      startedAt: '2025-01-01T00:00:03.000Z',
      completedAt: '2025-01-01T00:00:04.000Z',
      durationMs: 1000,
      message: 'figshare sync failed',
      errorDetail: 'connection refused',
      httpStatusCode: 502,
      requestSummary: { query: 'select *' },
      responseSummary: { error: 'timeout' },
    });

    await waitForAuditCount(oid, 3);

    const summary = await integrationAuditService.getStatusSummary({ oid });

    expect(summary).to.have.length(2);

    const doiStatus = summary.find(s => s.integrationName === 'doi');
    expect(doiStatus).to.be.ok;
    expect(doiStatus!.status).to.equal('started');
    expect(doiStatus!.integrationAction).to.equal('updateDoi');
    expect(doiStatus!.keyResult).to.be.undefined;

    const figshareStatus = summary.find(s => s.integrationName === 'figshare');
    expect(figshareStatus).to.be.ok;
    expect(figshareStatus!.status).to.equal('failed');
    expect(figshareStatus!.message).to.equal('figshare sync failed');
    expect(figshareStatus!.keyResult).to.be.undefined;

    // Verify no sensitive fields are present
    expect(figshareStatus).to.not.have.property('errorDetail');
    expect(figshareStatus).to.not.have.property('requestSummary');
    expect(figshareStatus).to.not.have.property('responseSummary');
    expect(figshareStatus).to.not.have.property('httpStatusCode');
  });

  describe('getStatusSummaryWithOutcomes', function () {
    it('doi success with event publish returns published outcome', async function () {
      const oid = `outcome-doi-${Date.now()}-pub`;
      createdOids.push(oid);
      const traceId = `trace-${Date.now()}-out-pub`;

      await IntegrationAudit.create({
        redboxOid: oid, brandId: 'default', integrationName: 'doi',
        integrationAction: 'publishDoi', triggeredBy: 'test', status: 'success',
        traceId, spanId: `span-${Date.now()}`,
        startedAt: '2025-01-01T00:00:00.000Z',
        completedAt: '2025-01-01T00:00:01.000Z', durationMs: 1000,
        requestSummary: { event: 'publish' },
        responseSummary: { doi: '10.1234/published' },
      });

      await waitForAuditCount(oid, 1);
      const result = await integrationAuditService.getStatusSummaryWithOutcomes(
        { oid }, { workflowStage: 'queued' }
      );

      expect(result).to.have.length(1);
      const item = result[0];
      expect(item.outcome).to.be.ok;
      expect(item.outcome!.state).to.equal('published');
      expect(item.outcome!.severity).to.equal('success');
      expect(item.outcome!.labelKey).to.equal('@integration-status-outcome-doi-published');
      expect(item.outcome!.helpKey).to.be.undefined;
      expect(item.keyResult!['event']).to.equal('publish');
    });

    it('doi success with event draft returns draft-assigned outcome with help', async function () {
      const oid = `outcome-doi-${Date.now()}-draft`;
      createdOids.push(oid);
      const traceId = `trace-${Date.now()}-out-draft`;

      await IntegrationAudit.create({
        redboxOid: oid, brandId: 'default', integrationName: 'doi',
        integrationAction: 'publishDoi', triggeredBy: 'test', status: 'success',
        traceId, spanId: `span-${Date.now()}`,
        startedAt: '2025-01-01T00:00:00.000Z',
        completedAt: '2025-01-01T00:00:01.000Z', durationMs: 1000,
        requestSummary: { event: 'draft' },
        responseSummary: { doi: '10.1234/draft-doi' },
      });

      await waitForAuditCount(oid, 1);
      const result = await integrationAuditService.getStatusSummaryWithOutcomes(
        { oid }, {}
      );

      expect(result).to.have.length(1);
      const item = result[0];
      expect(item.outcome!.state).to.equal('draft-assigned');
      expect(item.outcome!.severity).to.equal('pending');
      expect(item.outcome!.helpKey).to.equal('@integration-status-outcome-doi-draft-assigned-help');
    });

    it('doi success no event derives from record context', async function () {
      const oid = `outcome-doi-${Date.now()}-noevent`;
      createdOids.push(oid);
      const traceId = `trace-${Date.now()}-out-noevent`;

      await IntegrationAudit.create({
        redboxOid: oid, brandId: 'default', integrationName: 'doi',
        integrationAction: 'publishDoi', triggeredBy: 'test', status: 'success',
        traceId, spanId: `span-${Date.now()}`,
        startedAt: '2025-01-01T00:00:00.000Z',
        completedAt: '2025-01-01T00:00:01.000Z', durationMs: 1000,
        responseSummary: { doi: '10.1234/stage-doi' },
      });

      await waitForAuditCount(oid, 1);

      // Record context with published stage -> published
      const resultPub = await integrationAuditService.getStatusSummaryWithOutcomes(
        { oid }, { citationDoi: '10.1234/stage-doi', workflowStage: 'published' }
      );
      expect(resultPub[0].outcome!.state).to.equal('published');
      expect(resultPub[0].outcome!.severity).to.equal('success');

      // Record context with draft stage -> draft-assigned
      const resultDraft = await integrationAuditService.getStatusSummaryWithOutcomes(
        { oid }, { citationDoi: '10.1234/stage-doi', workflowStage: 'draft' }
      );
      expect(resultDraft[0].outcome!.state).to.equal('draft-assigned');
      expect(resultDraft[0].outcome!.severity).to.equal('pending');
    });

    it('figshare success with publishResult returns published outcome', async function () {
      const oid = `outcome-fig-${Date.now()}-pub`;
      createdOids.push(oid);
      const traceId = `trace-${Date.now()}-out-figpub`;

      await IntegrationAudit.create({
        redboxOid: oid, brandId: 'default', integrationName: 'figshare',
        integrationAction: 'syncRecordWithFigshare', triggeredBy: 'test', status: 'success',
        traceId, spanId: `span-${Date.now()}`,
        startedAt: '2025-01-01T00:00:00.000Z',
        completedAt: '2025-01-01T00:00:01.000Z', durationMs: 1000,
        responseSummary: { articleId: '12345', publishResult: { id: 'abc', status: 'published' } },
      });

      await waitForAuditCount(oid, 1);
      const result = await integrationAuditService.getStatusSummaryWithOutcomes(
        { oid }, {}
      );

      expect(result).to.have.length(1);
      const item = result[0];
      expect(item.outcome!.state).to.equal('published');
      expect(item.outcome!.severity).to.equal('success');
      expect(item.keyResult!['figsharePublished']).to.equal(true);
      expect(item.keyResult!['figsharePublishStatus']).to.equal('published');
    });

    it('figshare success without publishResult returns deposited outcome', async function () {
      const oid = `outcome-fig-${Date.now()}-dep`;
      createdOids.push(oid);
      const traceId = `trace-${Date.now()}-out-figdep`;

      await IntegrationAudit.create({
        redboxOid: oid, brandId: 'default', integrationName: 'figshare',
        integrationAction: 'publishAfterUploadFilesJob', triggeredBy: 'test', status: 'success',
        traceId, spanId: `span-${Date.now()}`,
        startedAt: '2025-01-01T00:00:00.000Z',
        completedAt: '2025-01-01T00:00:01.000Z', durationMs: 1000,
        responseSummary: { articleId: '67890' },
      });

      await waitForAuditCount(oid, 1);
      const result = await integrationAuditService.getStatusSummaryWithOutcomes(
        { oid }, {}
      );

      expect(result).to.have.length(1);
      expect(result[0].outcome!.state).to.equal('deposited');
      expect(result[0].outcome!.severity).to.equal('success');
    });

    it('synthesizes rows for requested integrations with zero audit rows', async function () {
      const oid = `outcome-synth-${Date.now()}`;
      createdOids.push(oid);

      const result = await integrationAuditService.getStatusSummaryWithOutcomes(
        { oid, integrationName: 'doi,figshare' },
        { citationDoi: '10.1234/legacy', workflowStage: 'queued' }
      );

      expect(result).to.have.length(2);

      const doiRow = result.find(r => r.integrationName === 'doi');
      expect(doiRow).to.be.ok;
      expect(doiRow!.synthesized).to.equal(true);
      expect(doiRow!.traceId).to.equal('synthetic:doi');
      expect(doiRow!.status).to.equal('none');
      expect(doiRow!.keyResult!['doi']).to.equal('10.1234/legacy');
      expect(doiRow!.outcome!.state).to.equal('draft-assigned');

      const figRow = result.find(r => r.integrationName === 'figshare');
      expect(figRow).to.be.ok;
      expect(figRow!.synthesized).to.equal(true);
      expect(figRow!.traceId).to.equal('synthetic:figshare');
      expect(figRow!.status).to.equal('none');
      expect(figRow!.outcome!.state).to.equal('none');
    });

    it('doi started returns in-progress outcome', async function () {
      const oid = `outcome-doi-${Date.now()}-started`;
      createdOids.push(oid);
      const traceId = `trace-${Date.now()}-doistart`;

      await IntegrationAudit.create({
        redboxOid: oid, brandId: 'default', integrationName: 'doi',
        integrationAction: 'publishDoi', triggeredBy: 'test', status: 'started',
        traceId, spanId: `span-${Date.now()}`,
        startedAt: '2025-01-01T00:00:00.000Z',
      });

      await waitForAuditCount(oid, 1);
      const result = await integrationAuditService.getStatusSummaryWithOutcomes({ oid }, {});

      expect(result).to.have.length(1);
      expect(result[0].outcome!.state).to.equal('in-progress');
      expect(result[0].outcome!.severity).to.equal('in-progress');
    });

    it('doi update started returns updating outcome', async function () {
      const oid = `outcome-doi-${Date.now()}-updstart`;
      createdOids.push(oid);
      const traceId = `trace-${Date.now()}-doiupdstart`;

      await IntegrationAudit.create({
        redboxOid: oid, brandId: 'default', integrationName: 'doi',
        integrationAction: 'updateDoi', triggeredBy: 'test', status: 'started',
        traceId, spanId: `span-${Date.now()}`,
        startedAt: '2025-01-01T00:00:00.000Z',
      });

      await waitForAuditCount(oid, 1);
      const result = await integrationAuditService.getStatusSummaryWithOutcomes({ oid }, {});

      expect(result).to.have.length(1);
      expect(result[0].outcome!.state).to.equal('updating');
      expect(result[0].outcome!.severity).to.equal('in-progress');
      expect(result[0].outcome!.labelKey).to.equal('@integration-status-outcome-doi-updating');
    });

    it('doi failed returns error outcome with help', async function () {
      const oid = `outcome-doi-${Date.now()}-failed`;
      createdOids.push(oid);
      const traceId = `trace-${Date.now()}-doifail`;

      await IntegrationAudit.create({
        redboxOid: oid, brandId: 'default', integrationName: 'doi',
        integrationAction: 'publishDoi', triggeredBy: 'test', status: 'failed',
        traceId, spanId: `span-${Date.now()}`,
        startedAt: '2025-01-01T00:00:00.000Z',
        completedAt: '2025-01-01T00:00:01.000Z', durationMs: 1000,
        message: 'something went wrong',
      });

      await waitForAuditCount(oid, 1);
      const result = await integrationAuditService.getStatusSummaryWithOutcomes({ oid }, {});

      expect(result).to.have.length(1);
      expect(result[0].outcome!.state).to.equal('error');
      expect(result[0].outcome!.severity).to.equal('error');
      expect(result[0].outcome!.helpKey).to.equal('@integration-status-outcome-doi-error-help');
    });

    it('figshare started returns in-progress outcome', async function () {
      const oid = `outcome-fig-${Date.now()}-started`;
      createdOids.push(oid);
      const traceId = `trace-${Date.now()}-figstart`;

      await IntegrationAudit.create({
        redboxOid: oid, brandId: 'default', integrationName: 'figshare',
        integrationAction: 'syncRecordWithFigshare', triggeredBy: 'test', status: 'started',
        traceId, spanId: `span-${Date.now()}`,
        startedAt: '2025-01-01T00:00:00.000Z',
      });

      await waitForAuditCount(oid, 1);
      const result = await integrationAuditService.getStatusSummaryWithOutcomes({ oid }, {});

      expect(result).to.have.length(1);
      expect(result[0].outcome!.state).to.equal('in-progress');
      expect(result[0].outcome!.severity).to.equal('in-progress');
    });

    it('figshare failed returns error outcome with help', async function () {
      const oid = `outcome-fig-${Date.now()}-failed`;
      createdOids.push(oid);
      const traceId = `trace-${Date.now()}-figfail`;

      await IntegrationAudit.create({
        redboxOid: oid, brandId: 'default', integrationName: 'figshare',
        integrationAction: 'syncRecordWithFigshare', triggeredBy: 'test', status: 'failed',
        traceId, spanId: `span-${Date.now()}`,
        startedAt: '2025-01-01T00:00:00.000Z',
        completedAt: '2025-01-01T00:00:01.000Z', durationMs: 1000,
        message: 'deposit rejected',
      });

      await waitForAuditCount(oid, 1);
      const result = await integrationAuditService.getStatusSummaryWithOutcomes({ oid }, {});

      expect(result).to.have.length(1);
      expect(result[0].outcome!.state).to.equal('error');
      expect(result[0].outcome!.severity).to.equal('error');
      expect(result[0].outcome!.helpKey).to.equal('@integration-status-outcome-figshare-error-help');
    });

    it('sanitization preserved: no sensitive fields in outcomes path', async function () {
      const oid = `outcome-safe-${Date.now()}`;
      createdOids.push(oid);
      const traceId = `trace-${Date.now()}-safe`;

      await IntegrationAudit.create({
        redboxOid: oid, brandId: 'default', integrationName: 'doi',
        integrationAction: 'publishDoi', triggeredBy: 'test', status: 'success',
        traceId, spanId: `span-${Date.now()}`,
        startedAt: '2025-01-01T00:00:00.000Z',
        completedAt: '2025-01-01T00:00:01.000Z', durationMs: 1000,
        requestSummary: { event: 'publish', requestBody: 'secret', profile: 'admin' },
        responseSummary: { doi: '10.1234/safe' },
      });

      await waitForAuditCount(oid, 1);
      const result = await integrationAuditService.getStatusSummaryWithOutcomes(
        { oid }, {}
      );

      expect(result).to.have.length(1);
      const item = result[0];
      expect(item).to.not.have.property('errorDetail');
      expect(item).to.not.have.property('requestSummary');
      expect(item).to.not.have.property('responseSummary');
      expect(item).to.not.have.property('httpStatusCode');
      // Allowed keys only
      const krKeys = Object.keys(item.keyResult ?? {});
      expect(krKeys.every(k => ['doi', 'articleId', 'event', 'figsharePublished', 'figsharePublishStatus'].includes(k))).to.equal(true);
    });
  });
});
