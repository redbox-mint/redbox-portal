import { expect } from 'chai';
import * as sinon from 'sinon';
import {
  recordHasAccess,
  recordRoleNames,
  recordSolrAuthorization,
  reportingMongoAuthorization,
} from '../../src/reporting/authorization';
import { ReportingError } from '../../src/reporting/types';
import { validateReportingQuery, resolveReportingRegistry, reportingDate } from '../../src/reporting/registry';
import { compileReportingPipeline } from '../../src/reporting/mongo';
import { reportingSearchInput } from '../../src/reporting/query';
import { Services } from '../../src/services/ReportingService';
import {
  principal,
  brand,
  user,
  role,
  registry,
  storedRecord,
  configuration,
  recordTypes,
  installReportingTestSails,
} from './fixtures';

const bad = async (action: () => unknown, code = 'INVALID_QUERY') => {
  try {
    await action();
    throw new Error('Expected rejection');
  } catch (error) {
    expect(error).to.be.instanceOf(ReportingError);
    expect((error as ReportingError).code).to.equal(code);
  }
};
describe('Reporting authorization and validation', () => {
  it('matches the union of view/edit usernames and canonical brand role IDs without administrator bypass', () => {
    for (const permission of ['view', 'edit']) {
      const record = storedRecord();
      record.authorization.view = [];
      record.authorization.edit = [];
      Reflect.set(record.authorization, permission, ['alice']);
      expect(recordHasAccess(brand, user.username, principal.roles, record)).to.equal(true);
    }
    for (const permission of ['viewRoles', 'editRoles']) {
      const record = storedRecord();
      record.authorization.view = [];
      Reflect.set(record.authorization, permission, ['Reporter']);
      expect(recordHasAccess(brand, 'other', [role], record)).to.equal(true);
      expect(recordHasAccess(brand, 'other', [{ id: 'reporter-other-brand', name: 'Reporter' }], record)).to.equal(
        false
      );
    }
    const record = storedRecord();
    record.authorization.view = [];
    record.authorization.viewPending = ['alice'];
    expect(recordHasAccess(brand, 'alice', principal.roles, record)).to.equal(false);
    expect(recordHasAccess(brand, 'admin', [brand.roles[1]], record)).to.equal(false);
    expect(recordHasAccess(brand, 'alice', [], { authorization_edit: 'alice' })).to.equal(true);
  });
  it('quotes Solr usernames/roles and omits empty role clauses', () => {
    expect(recordSolrAuthorization(brand, 'x" OR *:*', [])).to.equal(
      '(authorization_edit:"x\\" OR *:*" OR authorization_view:"x\\" OR *:*")'
    );
    expect(recordSolrAuthorization(brand, 'alice', [role])).to.include('authorization_viewRoles:("Reporter")');
    expect(recordRoleNames(brand, [{ id: 'foreign-role', name: 'Reporter' }])).to.deep.equal([]);
    const duplicate = { ...brand, roles: [role, { ...role, id: 'duplicate-reporter' }] };
    expect(recordRoleNames(duplicate, [{ id: 'duplicate-reporter', name: 'Reporter' }])).to.deep.equal([]);
  });
  it('requires a valid principal at the pipeline boundary and puts branding/record authorization first', async () => {
    const fields = await registry();
    const pipeline = compileReportingPipeline(principal, { operation: 'count', recordType: 'rdmp' }, fields);
    expect(pipeline[0]).to.deep.equal({
      $match: { $and: [reportingMongoAuthorization(principal), { 'metaMetadata.type': 'rdmp' }] },
    });
    await bad(
      () =>
        compileReportingPipeline(
          undefined as unknown as typeof principal,
          { operation: 'count', recordType: 'rdmp' },
          fields
        ),
      'AUTHENTICATION_REQUIRED'
    );
    await bad(() => registry({ ...principal, user: { ...user, loginDisabled: true } }), 'AUTHENTICATION_REQUIRED');
    await bad(() => registry({ ...principal, roles: [brand.roles[1]] }), 'AUTHENTICATION_REQUIRED');
    await bad(
      () => registry({ ...principal, user: { ...user, username: { $ne: null } } } as unknown as typeof principal),
      'AUTHENTICATION_REQUIRED'
    );
  });
  it('rejects raw query fields, paths, operators, excessive limits and unsupported operations', async () => {
    const fields = await registry();
    const inputs: unknown[] = [
      { operation: 'count', recordType: 'rdmp', principal },
      { operation: 'count', recordType: 'rdmp', brand: 'other' },
      { operation: 'count', recordType: 'rdmp', pipeline: [{ $where: 'x' }] },
      { operation: 'count', recordType: 'rdmp', filters: [{ field: 'metadata.faculty', operator: 'eq', value: 'A' }] },
      { operation: 'count', recordType: 'rdmp', filters: [{ field: 'faculty', operator: '$where', value: 'A' }] },
      { operation: 'count', recordType: 'rdmp', filters: [{ field: 'faculty', operator: 'eq', value: { $ne: null } }] },
      { operation: 'count', recordType: 'rdmp', filters: [{ field: 'noSuchField', operator: 'eq', value: 'A' }] },
      { operation: 'count', recordType: 'rdmp', filters: [{ field: 'sensitiveData', operator: 'eq', value: 'true' }] },
      {
        operation: 'count',
        recordType: 'rdmp',
        filters: [{ field: 'faculty', operator: 'between', start: '2026-01-01', end: '2027-01-01' }],
      },
      { operation: 'group', recordType: 'rdmp', groupBy: ['created'] },
      { operation: 'group', recordType: 'rdmp', groupBy: ['faculty', 'faculty'] },
      {
        operation: 'group',
        recordType: 'rdmp',
        groupBy: ['faculty'],
        metrics: [{ operation: 'sum', field: 'faculty', id: 'sum' }],
      },
      {
        operation: 'group',
        recordType: 'rdmp',
        groupBy: ['faculty'],
        sort: { by: 'metadata.faculty', direction: 'asc' },
      },
      { operation: 'group', recordType: 'rdmp', groupBy: ['faculty'], pagination: { limit: 101 } },
      { operation: 'search', recordType: 'rdmp', text: 'machine learning', filters: [] },
      {
        operation: 'count',
        recordType: 'rdmp',
        filters: Array.from({ length: 21 }, () => ({ field: 'faculty', operator: 'eq', value: 'A' })),
      },
    ];
    for (const input of inputs) await bad(() => validateReportingQuery(input, fields));
    expect(
      validateReportingQuery(
        { operation: 'count', recordType: 'rdmp', filters: [{ field: 'faculty', operator: 'eq', value: '$where' }] },
        fields
      )
    ).to.be.ok;
  });
  it('rejects invalid/reversed/overlong dates and supports explicit timezone instants', async () => {
    const fields = await registry();
    for (const start of ['2026-02-30', 'not a date', '2026-01-01T12:00:00', '2028-01-01', '2000-01-01']) {
      await bad(() =>
        validateReportingQuery(
          {
            operation: 'time_series',
            recordType: 'rdmp',
            dateHistogram: { field: 'created', interval: 'month', start, end: '2027-01-01' },
          },
          fields
        )
      );
    }
    expect(reportingDate('2025-12-31T23:30:00-01:00').toISOString()).to.equal('2026-01-01T00:30:00.000Z');
  });
  it('hides role-restricted and view-form-hidden fields; rejects unsafe server configuration', async () => {
    const fields = await resolveReportingRegistry(
      principal,
      'rdmp',
      configuration,
      recordTypes,
      async () => new Set(['metadata.faculty'])
    );
    expect([...fields.fields.keys()]).to.deep.equal(['created', 'faculty', 'workflowStage']);
    const unsafe = structuredClone(recordTypes);
    unsafe.rdmp.reporting!.fields[0].path = 'authorization.view';
    await bad(
      () => resolveReportingRegistry(principal, 'rdmp', configuration, unsafe, async () => new Set()),
      'FORBIDDEN'
    );
    await bad(
      () =>
        resolveReportingRegistry(
          principal,
          'rdmp',
          { ...configuration, enabled: false },
          recordTypes,
          async () => new Set()
        ),
      'UNAVAILABLE'
    );
  });
});

describe('ReportingService safety and independent use', () => {
  let service: Services.Reporting;
  let restoreSails: () => void;
  const record = storedRecord();
  const getMeta = sinon.stub();
  const project = sinon.stub();
  const search = sinon.stub();
  const executeReporting = sinon.stub();
  const resolveRegistry = sinon.stub();
  beforeEach(() => {
    restoreSails = installReportingTestSails();
    getMeta.reset();
    project.reset();
    search.reset();
    executeReporting.reset();
    resolveRegistry.reset();
    resolveRegistry.callsFake(registry);
    getMeta.resolves(structuredClone(record));
    project.resolves({ faculty: 'A' });
    search.resolves(['record-1']);
    executeReporting.resolves({ count: 10 });
    service = new Services.Reporting({
      registry: resolveRegistry,
      provider: () => ({ executeReporting }),
      records: {
        getMeta,
        hasViewAccess: (activeBrand, activeUser, roles, stored) =>
          recordHasAccess(
            activeBrand as typeof brand,
            String(activeUser.username),
            roles as typeof principal.roles,
            stored
          ),
      },
      project,
      search,
    });
  });
  afterEach(() => {
    sinon.restore();
    restoreSails();
  });
  it('executes directly without MCP and emits bounded schemas without paths', async () => {
    expect(await service.count(principal, { recordType: 'rdmp' })).to.deep.equal({ count: 10 });
    const schema = await service.getReportingSchema(principal, { recordType: 'rdmp' });
    expect(JSON.stringify(schema)).not.to.include('metadata.');
    expect(schema.fields.some(field => field.id === 'hidden')).to.equal(false);
  });
  it('uses RecordsService authorization before projection and returns only registered fields', async () => {
    const value = await service.getRecord(principal, { recordType: 'rdmp', oid: 'record-1' });
    expect(value).to.deep.equal({
      oid: 'record-1',
      recordType: 'rdmp',
      fields: {
        created: '2026-01-02T00:00:00Z',
        faculty: 'A',
        workflowStage: 'draft',
        sensitiveData: null,
        amount: null,
        tags: null,
      },
    });
    expect(JSON.stringify(value)).not.to.include('private');
    expect(project.calledOnce).to.equal(true);
    getMeta.resolves({ ...record, metaMetadata: { ...record.metaMetadata, brandId: 'other' } });
    await bad(() => service.getRecord(principal, { recordType: 'rdmp', oid: 'record-1' }), 'NOT_FOUND');
    expect(project.calledOnce).to.equal(true);
    getMeta.resolves({ ...record, authorization: { ...record.authorization, view: [] } });
    await bad(() => service.getRecord(principal, { recordType: 'rdmp', oid: 'record-1' }), 'NOT_FOUND');
  });
  it('fails closed on projection/backend errors and does not expose database error text', async () => {
    project.rejects(new Error('database password secret'));
    await bad(() => service.getRecord(principal, { recordType: 'rdmp', oid: 'record-1' }), 'UNAVAILABLE');
    executeReporting.rejects(new Error('raw Mongo failure'));
    await bad(() => service.count(principal, { recordType: 'rdmp' }), 'UNAVAILABLE');
  });
  it('rejects hidden-text probes before contacting Solr unless a safe search core is explicitly opted in', async () => {
    // The accessible record contains a value excluded by its projected view contract.
    getMeta.resolves(storedRecord('record-1', { metadata: { faculty: 'A', hidden: 'confidential-sentinel' } }));
    for (const reporting of [
      { ...recordTypes.rdmp.reporting!, searchFullTextVisibleToAllReportingRoles: undefined },
      { ...recordTypes.rdmp.reporting!, searchFullTextVisibleToAllReportingRoles: false },
      { ...recordTypes.rdmp.reporting!, searchCore: undefined },
    ]) {
      resolveRegistry.callsFake(() =>
        resolveReportingRegistry(
          principal,
          'rdmp',
          configuration,
          { rdmp: { ...recordTypes.rdmp, reporting } },
          async () => new Set(['metadata.faculty'])
        )
      );
      await bad(() => service.search(principal, { recordType: 'rdmp', text: 'confidential-sentinel' }), 'FORBIDDEN');
    }
    expect(search.called).to.equal(false);
    expect(getMeta.called).to.equal(false);
    expect(await service.count(principal, { recordType: 'rdmp' })).to.deep.equal({ count: 10 });
  });
  it('clamps omitted search limits to configured caps while preserving offsets', async () => {
    const fields = await registry();
    resolveRegistry.resolves({ ...fields, limits: { ...fields.limits, maxPageSize: 2, maxSearchResults: 1 } });
    search.resolves(['record-1', 'record-2']);
    for (const pagination of [undefined, {}, { offset: 5 }, { offset: 5, limit: 1 }]) {
      const result = await service.search(
        principal,
        reportingSearchInput.parse({ recordType: 'rdmp', text: 'phrase', pagination })
      );
      expect(result).to.include({ returned: 1, offset: pagination?.offset ?? 0, truncated: true });
      expect(search.lastCall.args.slice(-2)).to.deep.equal([pagination?.offset ?? 0, 2]);
    }
    await bad(
      () =>
        service.search(principal, {
          recordType: 'rdmp',
          text: 'phrase',
          pagination: { limit: 2, offset: 0 },
        }),
      'LIMIT_EXCEEDED'
    );
  });
  it('rechecks stale Solr hits and returns no index counts that include inaccessible records', async () => {
    getMeta.resolves({ ...record, authorization: { ...record.authorization, view: [] } });
    expect(await service.search(principal, { recordType: 'rdmp', text: 'secret phrase' })).to.include({
      total: null,
      returned: 0,
      truncated: null,
    });
    expect(project.called).to.equal(false);
  });
  it('rejects excessive output and audits safe metadata without record values or search text', async () => {
    const info = sinon.spy();
    const originalInfo = sails.log.info;
    sails.log.info = info;
    try {
      await service.search(principal, { recordType: 'rdmp', text: 'never log this phrase' });
    } finally {
      sails.log.info = originalInfo;
    }
    const event = info.lastCall.args[0];
    expect(event).to.include({
      userId: 'alice-id',
      brandId: 'brand-a',
      success: true,
      operation: 'search',
      resultCount: 1,
    });
    expect(JSON.stringify(event)).not.to.include('never log');
    project.resolves({ faculty: 'A'.repeat(70_000) });
    await bad(() => service.getRecord(principal, { recordType: 'rdmp', oid: 'record-1' }), 'LIMIT_EXCEEDED');
  });
});
