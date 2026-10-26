import assert from 'node:assert/strict';
import * as sinon from 'sinon';
import { of } from 'rxjs';
import { RecordAuditViews, auditActionLabelKey } from '../../src/queries/RecordAuditViews';
import { RecordAuditActionType } from '../../src/model/storage/RecordAuditModel';
import { httpRouteFixture } from '../helpers/httpRouteFixture';
import { httpPagesFixture } from '../helpers/httpPagesFixture';
import { mountQueryReadRoutes } from '../../src/http/express/queryReads';

describe('Record audit views through owned HTTP and domain composition', () => {
  let f: Awaited<ReturnType<typeof httpRouteFixture>>;
  let recordPort: any;
  let forms: any;
  let consistency: any;
  let integrations: any;
  let configuration: sinon.SinonStub;
  beforeEach(async () => {
    configuration = sinon
      .stub()
      .returns({ doiPublishing: { writeBack: { citationDoiPath: 'metadata.citation_doi' } } });
    recordPort = {
      getMeta: sinon.stub().resolves({
        redboxOid: 'oid-1',
        metaMetadata: { form: 'rdmp-form', brandId: 'brand-1' },
        authorization: { view: ['alice'] },
        metadata: { contributors: [{ name: 'New Name' }] },
      }),
      hasViewAccess: sinon.stub().returns(true),
      getRecordAudit: sinon.stub().resolves([
        {
          id: 'audit-1',
          redboxOid: 'oid-1',
          action: 'created',
          createdAt: '2026-03-01T00:00:00Z',
          record: { workflow: { stageLabel: 'Draft' }, metadata: { contributors: [{ name: 'Old Name' }] } },
          user: {},
        },
        {
          id: 'audit-2',
          redboxOid: 'oid-1',
          action: 'updated',
          createdAt: '2026-03-02T00:00:00Z',
          record: { workflow: { stageLabel: 'Review' }, metadata: { contributors: [{ name: 'New Name' }] } },
          user: { username: 'editor', name: 'Editor', email: 'editor@example.com' },
        },
      ]),
      getResolvedPermissionsSummary: sinon.stub().resolves({
        edit: [{ username: 'editor', name: 'Editor', email: 'editor@example.com' }],
        view: [],
        editPending: [],
        viewPending: [],
        editRoles: ['Admin'],
        viewRoles: ['Researcher'],
      }),
    };
    forms = {
      getFormByName: sinon.stub().returns(
        of({
          configuration: [
            {
              name: 'contributors',
              component: { config: { label: 'Contributors' } },
              children: [{ name: 'name', component: { config: { label: 'Contributor Name' } } }],
            },
          ],
        })
      ),
    };
    consistency = {
      compareRecords: sinon.stub().returns([
        {
          kind: 'change',
          path: ['metadata', 'contributors', 0, 'name'],
          original: 'Old Name',
          changed: 'New Name',
        },
      ]),
    };
    integrations = {
      getTraceAuditLog: sinon.stub().resolves({
        total: 1,
        rows: [
          {
            id: 'trace-1',
            traceId: 'trace-1',
            startedAt: '2026-03-03T00:00:00Z',
            completedAt: '2026-03-03T00:01:00Z',
            durationMs: 60000,
            status: 'success',
            actions: ['publish'],
            eventCount: 1,
            events: [
              {
                id: 'integration-1',
                redboxOid: 'oid-1',
                startedAt: '2026-03-03T00:00:00Z',
                status: 'success',
                integrationAction: 'publish',
                traceId: 'trace-1',
                spanId: 'span-1',
                depth: 0,
                hasChildren: false,
              },
            ],
          },
        ],
      }),
      getStatusSummaryWithOutcomes: sinon.stub().resolves([]),
    };
    const audit = new RecordAuditViews({
      records: recordPort,
      forms,
      compareRecords: consistency.compareRecords,
      integrations,
      configuration: brand => configuration(brand),
      figshareStatus: async () => null,
      canView: async () => recordPort.hasViewAccess(),
    });
    f = await httpRouteFixture((router, input) => mountQueryReadRoutes(router, { ...input, audit } as any));
  });
  afterEach(async () => {
    await f.close();
  });
  function query(values: Record<string, string>) {
    return (
      '?' + new URLSearchParams(Object.entries(values).filter(([key]) => !['oid', 'branding', 'portal'].includes(key)))
    );
  }

  it('does not dispatch an audit page without an oid', async () => {
    const pages = await httpPagesFixture();
    try {
      assert.equal((await pages.request('/default/portal/record/viewAudit/')).status, 404);
    } finally {
      await pages.close();
    }
  });
  it('renders the audit application and admin attributes for current record viewers', async () => {
    const pages = await httpPagesFixture(input => {
      input.loadRecord = recordPort.getMeta;
    });
    try {
      const response = await pages.request('/default/portal/record/viewAudit/oid-1');
      assert.equal(response.status, 200);
      assert.match(response.text, /<record-audit/);
      assert.match(response.text, /oid="oid-1"/);
      assert.match(response.text, /is-admin="true"/);
      assert.match(response.text, /angular\/record-audit\/browser\/main/);
    } finally {
      await pages.close();
    }
  });

  it('returns audit rows with diff metadata and wrapper data', async () => {
    const values: Record<string, string> = {};
    values.oid = 'oid-1';
    values.branding = 'default';
    values.portal = 'rdmp';
    values.dateFrom = '';
    values.dateTo = '';
    values.action = '';
    values.workflowState = '';

    const response = await f.request(`/default/portal/record/viewAudit/${values.oid}/audit` + query(values));

    const payload = response.body;
    assert.equal(payload?.summary?.returnedCount, 2);
    assert.equal(payload?.rawAuditUrl, '/default/portal/api/records/audit/oid-1');
    assert.equal(payload?.records?.[0]?.actionLabelKey, '@record-audit-action-updated');
    assert.equal(payload?.records?.[0]?.changeSummary?.changes?.[0]?.displayName, 'Contributor Name');
    assert.equal(payload?.records?.[0]?.actor?.displayName, 'Editor');
    assert.equal(payload?.records?.[1]?.changeSummary?.note, '@record-audit-note-update-only');
  });

  it('maps validation bypass audit actions to registered language-default keys', () => {
    const metadata = require('../../../../language-defaults/meta.json');
    const english = require('../../../../language-defaults/en/translation.json');
    const actions = [RecordAuditActionType.validationBypassed, RecordAuditActionType.batchValidationBypassed];

    for (const action of actions) {
      const key = auditActionLabelKey(action);
      assert.equal(key, `@record-audit-action-${action}`);
      assert.equal(metadata[key]?.contentFormat, 'plain');
      assert.equal(typeof english[key], 'string');
      assert.notEqual(english[key].trim(), '');
    }
  });

  it('passes action and workflow filters through without insertion date bounds', async () => {
    const values: Record<string, string> = {};
    values.oid = 'oid-1';
    values.branding = 'default';
    values.portal = 'rdmp';
    values.dateFrom = '2026-03-01';
    values.dateTo = '2026-03-31';
    values.action = 'updated';
    values.workflowState = 'Draft';

    const response = await f.request(`/default/portal/record/viewAudit/${values.oid}/audit` + query(values));

    assert.equal(recordPort.getRecordAudit.calledOnce, true);
    assert.equal(recordPort.getRecordAudit.firstCall.args[0]?.action, 'updated');
    assert.equal(recordPort.getRecordAudit.firstCall.args[0]?.workflowState, 'Draft');
    assert.equal(recordPort.getRecordAudit.firstCall.args[0]?.dateFrom, undefined);
    assert.equal(recordPort.getRecordAudit.firstCall.args[0]?.dateTo, undefined);
  });

  it('displays, sorts and filters by event time when queue insertion is delayed', async () => {
    const oldTime = new Date(2026, 1, 28, 12).toISOString();
    const legacyTime = new Date(2026, 2, 1, 12).toISOString();
    const newTime = new Date(2026, 2, 2, 12).toISOString();
    const audit = recordPort.getRecordAudit;
    audit.resolves([
      {
        id: 'old',
        action: 'created',
        occurredAt: oldTime,
        createdAt: '2026-03-03T00:00:00Z',
        record: { metadata: { title: 'Old' } },
      },
      {
        id: 'legacy',
        action: 'updated',
        createdAt: '2026-03-05T00:00:00Z',
        record: { lastSaveDate: legacyTime, metaMetadata: { lastSaveDate: oldTime }, metadata: { title: 'Legacy' } },
      },
      {
        id: 'new',
        action: 'updated',
        occurredAt: newTime,
        createdAt: '2026-03-04T00:00:00Z',
        record: { metadata: { title: 'New' } },
      },
    ]);
    const values: Record<string, string> = {};
    values.oid = 'oid-1';
    values.dateFrom = '2026-03-01';
    values.dateTo = '2026-03-02';

    const response = await f.request(`/default/portal/record/viewAudit/${values.oid}/audit` + query(values));

    const records = response.body.records;
    assert.deepEqual(
      records.map((row: { id: string }) => row.id),
      ['new', 'legacy']
    );
    assert.equal(records[0].timestamp, newTime);
    assert.equal(records[1].timestamp, legacyTime);
    assert.equal(records[1].changeSummary.available, true);
    assert.equal(consistency.compareRecords.firstCall.args[0].title, 'Old');
  });

  for (const bounds of [
    { name: 'no bounds', dateFrom: '', dateTo: '', includeUndated: true },
    { name: 'a start bound', dateFrom: '2026-03-01', dateTo: '', includeUndated: false },
    { name: 'an end bound', dateFrom: '', dateTo: '2026-03-02', includeUndated: false },
    { name: 'both bounds', dateFrom: '2026-03-01', dateTo: '2026-03-02', includeUndated: false },
  ]) {
    it(`handles missing and invalid event dates with ${bounds.name}`, async () => {
      recordPort.getRecordAudit.resolves([
        { id: 'missing', action: 'created', record: {} },
        { id: 'invalid', action: 'created', occurredAt: 'invalid', createdAt: 'invalid', record: {} },
        { id: 'dated', action: 'created', occurredAt: new Date(2026, 2, 1, 12).toISOString(), record: {} },
      ]);
      const values: Record<string, string> = {};
      values.oid = 'oid-1';
      values.dateFrom = bounds.dateFrom;
      values.dateTo = bounds.dateTo;

      const response = await f.request(`/default/portal/record/viewAudit/${values.oid}/audit` + query(values));

      const records = response.body.records;
      assert.deepEqual(
        records.map((row: { id: string }) => row.id),
        bounds.includeUndated ? ['dated', 'missing', 'invalid'] : ['dated']
      );
    });
  }

  it('rejects invalid audit date filters', async () => {
    const values: Record<string, string> = {};
    values.oid = 'oid-1';
    values.branding = 'default';
    values.portal = 'rdmp';
    values.dateFrom = 'bad-date';
    values.dateTo = '';
    values.action = '';
    values.workflowState = '';

    const response = await f.request(`/default/portal/record/viewAudit/${values.oid}/audit` + query(values));

    assert.equal(response.status, 400);
    assert.equal(response.body.message, 'Invalid audit start date.');
  });

  it('refuses invalid public brand route segments without falling back to another brand', async () => {
    f.getBrand.resolves(undefined);
    const response = await f.request('/..%2Fbad-brand/portal/record/viewAudit/oid-1/audit');
    assert.equal(response.status, 404);
    assert.equal(recordPort.getRecordAudit.called, false);
  });

  it('blocks admin-only data for non-admin users', async () => {
    f.authenticate.resolves(f.actor);
    const values: Record<string, string> = {};
    values.oid = 'oid-1';

    const response = await f.request(`/default/portal/record/viewAudit/${values.oid}/permissions` + query(values));

    assert.equal(response.status, 403);
  });

  it('returns paginated integration audit data for admins', async () => {
    const values: Record<string, string> = {};
    values.oid = 'oid-1';
    values.page = '2';
    values.pageSize = '10';
    values.status = 'success';
    values.integrationName = 'figshare';
    values.dateFrom = '2026-03-01';
    values.dateTo = '2026-03-31';

    const response = await f.request(
      `/default/portal/record/viewAudit/${values.oid}/integration-audit` + query(values)
    );

    assert.equal(integrations.getTraceAuditLog.calledOnce, true);
    assert.equal(integrations.getTraceAuditLog.firstCall.args[0]?.integrationName, 'figshare');
    assert.equal(integrations.getTraceAuditLog.firstCall.args[0]?.status, 'success');
    assert.equal(
      integrations.getTraceAuditLog.firstCall.args[0]?.dateFrom?.toISOString(),
      new Date(2026, 2, 1, 0, 0, 0, 0).toISOString()
    );
    assert.equal(
      integrations.getTraceAuditLog.firstCall.args[0]?.dateTo?.toISOString(),
      new Date(2026, 2, 31, 23, 59, 59, 999).toISOString()
    );
    assert.equal(response.body?.summary?.page, 2);
    assert.equal(response.body?.summary?.pageSize, 10);
  });

  it('uses the brand-specific DOI write-back path when building integration status context', async () => {
    configuration = sinon.stub().callsFake(() => ({
      doiPublishing: {
        writeBack: {
          citationDoiPath: 'metadata.alternate_doi',
        },
      },
    }));
    recordPort.getMeta.resolves({
      redboxOid: 'oid-1',
      metaMetadata: { form: 'rdmp-form', brandId: 'brand-1' },
      metadata: { alternate_doi: '10.1234/custom-doi' },
    });
    integrations.getStatusSummaryWithOutcomes.resolves([]);

    const values: Record<string, string> = {};
    values.oid = 'oid-1';

    const response = await f.request(`/default/portal/record/integrationStatus/${values.oid}` + query(values));

    assert.equal(integrations.getStatusSummaryWithOutcomes.calledOnce, true);
    assert.equal(integrations.getStatusSummaryWithOutcomes.firstCall.args[1]?.citationDoi, '10.1234/custom-doi');
  });

  it('preserves the fallback integration audit id when a row id is missing', async () => {
    integrations.getTraceAuditLog.resolves({
      total: 1,
      rows: [
        {
          id: undefined,
          traceId: 'trace-1',
          startedAt: '2026-03-03T00:00:00Z',
          status: 'success',
          actions: ['publish'],
          eventCount: 1,
          events: [
            {
              id: undefined,
              redboxOid: 'oid-1',
              startedAt: '2026-03-03T00:00:00Z',
              status: 'success',
              integrationAction: 'publish',
              traceId: 'trace-1',
              spanId: 'span-1',
              depth: 0,
              hasChildren: false,
            },
          ],
        },
      ],
    });

    const values: Record<string, string> = {};
    values.oid = 'oid-1';
    values.page = '2';
    values.pageSize = '10';
    values.status = 'success';
    values.integrationName = '';
    values.dateFrom = '';
    values.dateTo = '';

    const response = await f.request(
      `/default/portal/record/viewAudit/${values.oid}/integration-audit` + query(values)
    );

    assert.equal(response.body?.records?.[0]?.id, 'trace-1');
    assert.equal(response.body?.records?.[0]?.events?.[0]?.id, 'trace-1:event:0');
  });

  it('rejects invalid integration audit statuses', async () => {
    const values: Record<string, string> = {};
    values.oid = 'oid-1';
    values.page = '1';
    values.pageSize = '10';
    values.status = 'invalid-status';
    values.integrationName = '';
    values.dateFrom = '';
    values.dateTo = '';

    const response = await f.request(
      `/default/portal/record/viewAudit/${values.oid}/integration-audit` + query(values)
    );

    assert.equal(integrations.getTraceAuditLog.called, false);
    assert.equal(response.status, 400);
    assert.equal(response.body.message, 'Invalid integration audit status.');
  });

  it('rejects invalid integration audit date filters', async () => {
    const values: Record<string, string> = {};
    values.oid = 'oid-1';
    values.page = '1';
    values.pageSize = '10';
    values.status = '';
    values.integrationName = '';
    values.dateFrom = 'not-a-date';
    values.dateTo = '';

    const response = await f.request(
      `/default/portal/record/viewAudit/${values.oid}/integration-audit` + query(values)
    );

    assert.equal(integrations.getTraceAuditLog.called, false);
    assert.equal(response.status, 400);
    assert.equal(response.body.message, 'Invalid integration audit start date.');
  });
});
