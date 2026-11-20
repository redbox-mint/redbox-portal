import { assertGoldenNext, goldenControls } from './goldenContracts';
import { userFromActor } from '../../../src/http/actors';
import assert from 'node:assert/strict';
import { of } from 'rxjs';
import type { FastifyRequest, FastifyReply } from 'fastify';
import { inventory, inventoryRegistration } from './inventory-fixture';
import { securityFixture } from './securityFixture';
import { requestContext } from '../../../src/http';
import { httpReplySubmitted } from '../../../src/http/fastify/errorBoundary';
import { validateRouteRequest } from '../../../src/http/fastify/validation';
import { sendApiData, sendApiErrors } from '../../../src/http/fastify/responses';

import { normalizeSearchQuery } from '../../../src/api-routes/groups/search-query';
import { hasViewAccess } from '../../../src/records/access';

import { BrandingModel } from '../../../src/model/storage/BrandingModel';
import { authorizeProgressRoom } from '../../../src/progress/authorization';

import { RecordAuditViews, AuditReadError } from '../../../src/queries/RecordAuditViews';
class Refusal extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly title = false
  ) {
    super(message);
  }
}
const integer = (value: unknown, fallback: number, min = 0, max = Number.MAX_SAFE_INTEGER) => {
  if (value === undefined || value === '') return fallback;
  if (
    (typeof value !== 'number' && (typeof value !== 'string' || !/^\d+$/.test(value))) ||
    !Number.isSafeInteger(Number(value)) ||
    Number(value) < min ||
    Number(value) > max
  )
    throw new Refusal(400, 'Invalid pagination parameter.');
  return Number(value);
};
const scalar = (value: unknown) => {
  if (typeof value !== 'string' || /[\x00-\x1f]/.test(value)) throw new Refusal(400, 'Invalid parameter');
  return value;
};
type Prelude = (request: FastifyRequest, reply: FastifyReply, ports: any, source: any) => Promise<unknown>;
interface Case {
  label: string;
  action: string;
  controller?: string;
  path?: string;
  target: string;
  query?: string;
  body?: unknown;
  method?: string;
  mode?: string;
  portState?: string;
  expected: number;
  contains?: string;
  trace?: string[];
}
/** These small native action probes preserve only the reviewed FM-004 preludes.
 * Golden observations come from the qualified complete family mounts. This is security
 * ordering qualification, not a claim that FM-023..FM-036 controllers are ported. */
const preludes: Record<string, Prelude> = {
  async query(req, reply, p, source) {
    const validated = await validateRouteRequest(req, reply, source);
    if (!validated) return;
    const q = validated.query;
    const { brand, actor } = requestContext(req);
    if (source.controller.includes('RecordAudit')) {
      for (const [key, value] of Object.entries(q))
        if (typeof value !== 'string') throw new Refusal(400, 'Invalid parameter: ' + key);
      integer(q.page, 1, 1);
      integer(q.pageSize, 20, 1);
      const user = userFromActor(actor!);
      if (source.action === 'getAuditData')
        return p.audit.audit(Object.assign(new BrandingModel(), brand), user, (req.params as any).oid, q, '/audit');
      return p.audit.integrationAudit(Object.assign(new BrandingModel(), brand), user, (req.params as any).oid, q);
    }
    if (source.action === 'getAuditLog') {
      if (q.dateFrom && Number.isNaN(Date.parse(String(q.dateFrom))))
        throw new Refusal(400, 'Invalid dateFrom parameter.');
      if (q.status === 'bad') throw new Refusal(400, 'Invalid status parameter.');
      await p.audit.integrationLog();
      return;
    }
    if (source.action === 'executeNamedQuery') {
      const config = await p.queries.getNamedQueryConfig(brand, scalar(q.queryName));
      if (!config) throw new Refusal(400, 'Named query not found', true);
      const start = integer(q.start, 0),
        rows = integer(q.rows, 10, 1, 100);
      await p.queries.performNamedQueryFromConfig(config, q, brand, start, rows);
    } else {
      const found = await p.recordTypes.get(brand, scalar(q.type));
      if (!found?.searchCore) throw new Refusal(400, 'Record Type provided is not valid');
      const normalized = normalizeSearchQuery(q);
      for (const key of ['exactNames', 'facetNames'] as const)
        for (const [name, value] of Object.entries(normalized[key] as Record<string, unknown>))
          if (
            !/^[A-Za-z_][A-Za-z0-9_]*$/.test(name) ||
            (value != null && typeof value !== 'string' && typeof value !== 'number')
          )
            throw new Refusal(400, 'Invalid search field');
      await p.search.searchFuzzy();
    }
  },
  async record(req, reply, p, source) {
    const validated = source.request
      ? await validateRouteRequest(req, reply, source)
      : { query: req.query as Record<string, unknown> };
    if (!validated) return;
    const q = validated.query,
      params = req.params as Record<string, string>;
    const { brand, actor } = requestContext(req);
    if (source.action === 'search') {
      const type = await p.recordTypes.get(brand, params.type);
      if (!type) throw new Refusal(400, 'Record Type provided is not valid');
      integer(q.rows, 10, 1);
      integer(q.page, 1, 1);
      await p.search.searchFuzzy();
      return;
    }
    const record = await p.storage.getMeta(scalar(params.oid));
    if (!record || record.metaMetadata.brandId !== brand.id) throw new Refusal(404, 'Record not found');
    const user = userFromActor(actor!);
    if (!(await hasViewAccess(Object.assign(new BrandingModel(), brand), user, user.roles, record)))
      throw new Refusal(403, 'Access Denied');
    if (source.action === 'getRecordAudit') {
      if (q.dateFrom && Number.isNaN(Date.parse(String(q.dateFrom))))
        throw new Refusal(400, 'Invalid dateFrom parameter.');
      await p.audit.getRecordAudit();
    } else {
      integer(q.relationshipDepth, 1);
      await p.storage.getRelatedRecords();
    }
  },
  async identity(req, reply, p, source) {
    const { brand, actor } = requestContext(req);
    if (!actor?.roles.some(r => r.brandId === brand.id && r.name === 'Admin')) throw new Refusal(403, 'Access Denied');
    const validated = source.request
      ? await validateRouteRequest(req, reply, source)
      : { query: req.query as Record<string, unknown> };
    if (!validated) return;
    const q = validated.query;
    if (source.action === 'searchLinkCandidates') {
      const target = await p.users.requireUserInBrand(String(q.primaryUserId), brand.id);
      if (!target) throw new Refusal(404, 'User not found');
      if (typeof q.query !== 'string') throw new Refusal(400, 'Invalid user parameter');
      await p.users.searchLinkCandidates();
    } else {
      const all = await p.users.getUsersForBrand(brand);
      const enriched = await p.users.enrichUsersWithLinkMetadata(all, brand.id);
      await p.users.enrichUsersWithEffectiveDisabledState(enriched);
      if (Number(q.page) < 1 || Number(q.pageSize) > 1000) throw new Refusal(400, 'Invalid pagination');
    }
  },
  async progress(req, reply, p, source) {
    const { brand, actor } = requestContext(req);
    const body = req.body as Record<string, unknown>;
    if (source.action === 'progress') {
      const rows = await p.progress.get({ where: { branding: brand.id }, limit: 1000 });
      const readable = [];
      for (const row of rows)
        if (await authorizeProgressRoom(row.relatedRecordId, brand, actor!, p)) readable.push(row);
      return sendApiData(req, reply, readable);
    }
    if (source.action === 'subscribe' || source.action === 'unsubscribe')
      throw new Refusal(410, 'Use direct Socket.IO subscribe/unsubscribe events with an owned socket grant.');
    const permitted = (room: string) => authorizeProgressRoom(room, brand, actor!, p);
    let existing: any;
    if (source.action !== 'start') {
      existing = (await p.progress.get({ id: body.id, branding: brand.id }))[0];
      if (!existing || existing.started_by !== actor!.username || !(await permitted(existing.relatedRecordId)))
        throw new Refusal(403, 'Access Denied');
    }
    const related = body.relatedRecordId ?? existing?.relatedRecordId;
    if (typeof related !== 'string' || !(await permitted(related))) throw new Refusal(403, 'Access Denied');
    if (existing && related !== existing.relatedRecordId)
      throw new Refusal(400, 'Progress record ownership cannot change');
    if (typeof body.name !== 'string' || typeof body.status !== 'string')
      throw new Refusal(400, 'Invalid progress fields');
    throw new Error('Unexpected progress mutation');
  },
  async configuration(req, reply, p, source) {
    const validated = await validateRouteRequest(req, reply, source);
    if (!validated) return;
    const { brand } = requestContext(req),
      q = validated.query;
    const form = await p.forms.getFormByName(String(q.name), true, brand.id);
    if (!form) throw new Refusal(404, 'Form not found', true);
    try {
      await p.loadRecord(q.oid);
    } catch {
      /* discovery fails closed */
    }
    return sendApiData(req, reply, p.forms.toPublicForm(form, []));
  },
  async datastream(req, reply, p, source) {
    const { brand, actor } = requestContext(req),
      oid = (req.params as any).oid;
    const record = await p.records.getMeta(oid);
    if (!record) throw new Refusal(404, 'Record not found');
    if (!p.records.hasViewAccess()) throw new Refusal(403, 'Access Denied');
    const q = req.query as Record<string, unknown>;
    if (
      !['getAttachments', 'listDatastreams'].includes(source.action) &&
      (typeof q.datastreamId !== 'string' || typeof q.fileName !== 'string')
    )
      throw new Refusal(400, 'Invalid datastream identifier or filename');
    const rows = await p.records.getAttachments(oid, undefined, { username: actor!.username });
    return sendApiData(
      req,
      reply,
      source.action === 'listDatastreams'
        ? { summary: { numFound: rows.length, page: 1, start: 0 }, records: rows }
        : rows
    );
  },
  async mutation(req, reply, p, source) {
    const validated = await validateRouteRequest(req, reply, source);
    if (!validated) return;
    const { brand } = requestContext(req);
    const type = await p.recordTypes.get(brand, (req.params as any).recordType);
    if (!type) throw new Refusal(400, 'Record Type provided is not valid');
    throw new Refusal(400, 'Invalid record body');
  },
  async harvest(req, reply, p, source) {
    const validated = await validateRouteRequest(req, reply, source);
    if (!validated) return;
    const { brand } = requestContext(req);
    const type = await p.recordTypes.get(brand, (req.params as any).recordType);
    if (!type) throw new Refusal(400, 'Record Type provided is not valid');
    throw new Refusal(400, 'updateMode is not supported for tracked harvest requests.');
  },
};
function ports(trace: string[], state: string) {
  const call =
    (name: string, value: unknown, fail = false) =>
    (..._args: unknown[]) => {
      trace.push(name);
      if (fail) throw new Error('private-domain-secret');
      return Promise.resolve(value);
    };
  const record =
    state === 'missing'
      ? null
      : {
          redboxOid: 'oid',
          revision: 1,
          metaMetadata: { brandId: state === 'foreign' ? 'foreign-brand' : 'brand-1' },
          metadata: {},
          authorization: { view: state === 'denied' ? [] : ['fixture'] },
        };
  const existing = {
    id: '0123456789abcdef01234567',
    relatedRecordId: 'record',
    started_by: state === 'foreign-owner' ? 'foreign' : 'fixture',
  };
  const result = {
    queries: {
      getNamedQueryConfig: call('query', state === 'missing' ? null : {}),
      performNamedQueryFromConfig: call('execute', []),
    },
    recordTypes: { get: call('type', state === 'missing' ? null : { name: 'dataset', searchCore: 'core' }) },
    search: { searchFuzzy: call('search', {}) },
    returnFields: [],
    reports: {},
    harvest: {},
    siem: {},
    siemConfig: async () => ({}),
    storage: {
      getMeta: call('record', record),
      getRecords: call('list', []),
      getDeletedRecords: call('deleted', []),
      getRelatedRecords: call('relationships', {}),
    },
    audit: { getRecordAudit: call('audit', []) },
    schemas: {},
    forms: {
      getFormByName: call('form', state === 'missing' ? null : { configuration: { type: 'dataset' } }),
      toPublicForm: () => ({ form: 'public' }),
      discoverValidationOperations: call('discovery', []),
    },
    loadRecord: call('record', null, true),
    appConfigs: {},
    translations: {},
    contextVariables: {},
    workflows: {},
    schemaEnabled: false,
    maxRows: 1000,
    translate: (s: string) => s,
    users: {
      requireUserInBrand: call('target', state === 'missing' ? null : { id: '0123456789abcdef01234567' }),
      searchLinkCandidates: call('searchUsers', []),
      getUsersForBrand: call('users', [], state === 'read-failed'),
      enrichUsersWithLinkMetadata: call('links', [], state === 'enrichment-failed'),
      enrichUsersWithEffectiveDisabledState: call('disabled', []),
    },
    progress: {
      get: call(
        'progress',
        state === 'filter'
          ? [
              { ...existing, relatedRecordId: 'visible' },
              { ...existing, relatedRecordId: 'hidden' },
            ]
          : state === 'missing-row'
            ? []
            : [existing]
      ),
      start: call('start', {}),
      update: call('update', []),
      finish: call('finish', []),
    },
    records: {
      getMeta: async (oid: string) => {
        trace.push('record');
        return state === 'missing' ? null : { redboxOid: oid, metaMetadata: { brandId: 'brand-1' } };
      },
      getAttachments: call('attachments', []),
      hasViewAccess: (...args: any[]) => state !== 'denied' && args[3]?.redboxOid !== 'hidden',
    },
    sockets: { issue: call('grant', 'grant'), emit: call('emit', undefined) },
  };
  const views = new RecordAuditViews({
    records: result.storage as any,
    forms: {} as any,
    integrations: {} as any,
    canView: async () => state !== 'denied',
    configuration: () => ({}),
    figshareStatus: async () => null,
    compareRecords: () => [],
  });
  Object.assign(result.audit, {
    audit: views.audit.bind(views),
    integrationAudit: views.integrationAudit.bind(views),
    integrationLog: call('integrationLog', []),
  });
  return result;
}
const cases: (Case & {
  family: 'query' | 'record' | 'identity' | 'progress' | 'configuration' | 'datastream' | 'mutation' | 'harvest';
})[] = [];
for (const field of ['start', 'rows'])
  for (const state of ['missing', 'existing'])
    cases.push({
      family: 'query',
      action: 'executeNamedQuery',
      label: `named query ${state} before bad ${field}`,
      target: '/default/rdmp/api/report/namedQuery',
      query: `queryName=records&${field}=bad`,
      portState: state,
      expected: 400,
      contains: state === 'missing' ? 'Named query not found' : 'Invalid pagination parameter.',
      trace: ['query'],
    });
cases.push({
  family: 'query',
  action: 'executeNamedQuery',
  label: 'named query structured pagination Zod before lookup',
  target: '/default/rdmp/api/report/namedQuery',
  query: 'queryName=records&start[x]=bad',
  expected: 400,
  trace: [],
});
for (const field of ['exactNames', 'facetNames'])
  for (const state of ['missing', 'existing'])
    cases.push({
      family: 'query',
      action: 'search',
      controller: 'webservice/SearchController',
      label: `API search ${state} type before bad ${field}`,
      target: '/default/rdmp/api/search',
      query: `type=dataset&${field}[invalid.name]=x`,
      portState: state,
      expected: 400,
      contains: state === 'missing' ? 'Record Type provided is not valid' : 'Invalid search field',
      trace: ['type'],
    });
cases.push({
  family: 'query',
  action: 'search',
  controller: 'webservice/SearchController',
  label: 'API search Zod before type',
  target: '/default/rdmp/api/search',
  query: 'type=dataset&rows=bad',
  expected: 400,
  trace: [],
});
for (const state of ['missing', 'existing'])
  cases.push({
    family: 'record',
    action: 'search',
    controller: 'RecordController',
    label: `browser search ${state} type before bad rows`,
    target: '/default/rdmp/record/search/dataset',
    query: 'rows=bad',
    portState: state,
    expected: 400,
    contains: state === 'missing' ? 'Record Type provided is not valid' : 'Invalid pagination parameter.',
    trace: ['type'],
  });
for (const state of ['missing', 'denied', 'visible'])
  for (const action of ['getRecordAudit', 'getRelatedRecords'])
    cases.push({
      family: 'record',
      action,
      label: `${action} ${state} before bad date/depth`,
      target:
        action === 'getRecordAudit' ? '/default/rdmp/api/records/audit/oid' : '/default/rdmp/record/oid/relatedRecords',
      query: action === 'getRecordAudit' ? 'dateFrom=bad' : 'relationshipDepth=bad',
      portState: state,
      expected: state === 'missing' ? 404 : state === 'denied' ? 403 : 400,
      contains:
        state === 'missing'
          ? 'Record not found'
          : state === 'denied'
            ? 'Access Denied'
            : action === 'getRecordAudit'
              ? 'Invalid dateFrom parameter.'
              : 'Invalid pagination parameter.',
      trace: ['record'],
    });
for (const state of ['missing', 'existing'])
  cases.push({
    family: 'identity',
    action: 'searchLinkCandidates',
    controller: 'AdminController',
    label: `link candidate ${state} target before structured query`,
    target: '/default/rdmp/admin/users/link/candidates',
    query: 'primaryUserId=0123456789abcdef01234567&query[x]=bad',
    portState: state,
    expected: state === 'missing' ? 404 : 400,
    contains: state === 'missing' ? 'User not found' : 'Invalid user parameter',
    trace: ['target'],
  });
for (const state of ['enrichment-failed', 'existing'])
  cases.push({
    family: 'identity',
    action: 'listUsers',
    label: `user listing ${state} enrichment before numeric bounds`,
    target: '/default/rdmp/api/users',
    query: 'page=0&pageSize=1001',
    portState: state,
    expected: state === 'existing' ? 400 : 500,
    contains: state === 'existing' ? 'Invalid pagination' : 'Failed to process user request',
    trace: state === 'existing' ? ['users', 'links', 'disabled'] : ['users', 'links'],
  });
cases.push({
  family: 'identity',
  action: 'listUsers',
  label: 'user list malformed integer fails Zod before reads',
  target: '/default/rdmp/api/users',
  query: 'page=bad',
  expected: 400,
  trace: [],
});
for (const action of ['start', 'update', 'stop'])
  for (const state of ['missing', 'denied', 'visible', ...(action === 'start' ? [] : ['foreign-owner'])])
    cases.push({
      family: 'progress',
      action,
      controller: 'AsynchController',
      label: `progress ${action} ${state} before invalid fields`,
      target: '/default/rdmp/asynch',
      method: action === 'start' ? 'POST' : action === 'update' ? 'PUT' : 'DELETE',
      body: { id: '0123456789abcdef01234567', relatedRecordId: 'record', name: [], status: [] },
      portState: state,
      expected: state === 'visible' ? 400 : 403,
      contains: state === 'visible' ? 'Invalid progress fields' : 'Access Denied',
      trace:
        action === 'start'
          ? ['record']
          : state === 'foreign-owner'
            ? ['progress']
            : state === 'visible'
              ? ['progress', 'record', 'record']
              : ['progress', 'record'],
    });
for (const action of ['subscribe', 'unsubscribe'])
  cases.push({
    family: 'progress',
    action,
    controller: 'AsynchController',
    label: `retired ${action} before payload/room`,
    target: '/default/rdmp/asynch/subscribe/%20',
    method: action === 'subscribe' ? 'GET' : 'DELETE',
    body: action === 'subscribe' ? undefined : [],
    expected: 410,
    contains: 'Use direct Socket.IO',
    trace: [],
  });
for (const action of ['getAuditData', 'getIntegrationAuditData'])
  for (const state of ['missing', 'foreign', 'visible'])
    cases.push({
      family: 'query',
      action,
      label: `browser ${action} ${state} before dates`,
      target: `/default/rdmp/record/viewAudit/oid/${action === 'getAuditData' ? 'audit' : 'integration-audit'}`,
      query: 'dateFrom=bad',
      portState: state,
      expected: state === 'missing' ? 404 : state === 'foreign' ? 403 : 400,
      contains:
        state === 'missing'
          ? 'Record not found'
          : state === 'foreign'
            ? 'view-error-no-permissions'
            : action === 'getAuditData'
              ? 'Invalid audit start date.'
              : 'Invalid integration audit start date.',
      trace: ['record'],
    });
for (const action of ['getAuditData', 'getIntegrationAuditData'])
  cases.push({
    family: 'query',
    action,
    label: `browser ${action} bad page before object`,
    target: `/default/rdmp/record/viewAudit/oid/${action === 'getAuditData' ? 'audit' : 'integration-audit'}`,
    query: 'page=bad&dateFrom=bad',
    portState: 'missing',
    expected: 400,
    contains: 'Invalid pagination parameter.',
    trace: [],
  });
cases.push({
  family: 'query',
  action: 'getAuditLog',
  label: 'raw integration audit date before authorized domain',
  target: '/default/rdmp/api/integration-audit/oid',
  query: 'dateFrom=bad',
  portState: 'missing',
  expected: 400,
  contains: 'Invalid dateFrom parameter.',
  trace: [],
});
for (const state of ['missing', 'existing'])
  cases.push({
    family: 'configuration',
    action: 'getForm',
    controller: 'webservice/FormManagementController',
    label: `configuration ${state} form before optional OID discovery`,
    target: '/default/rdmp/api/forms/get',
    query: 'name=form&oid=oid',
    portState: state,
    expected: state === 'missing' ? 404 : 200,
    trace: state === 'missing' ? ['form'] : ['form', 'record'],
  });
for (const action of ['getAttachments', 'listDatastreams'])
  cases.push({
    family: 'datastream',
    action,
    label: `${action} ignores unused malformed byte parameters`,
    target:
      action === 'getAttachments'
        ? '/default/rdmp/record/oid/attachments'
        : '/default/rdmp/api/records/datastreams/oid',
    query: 'datastreamId[x]=bad&fileName[x]=bad',
    expected: 200,
    trace: ['record', 'attachments'],
  });
for (const state of ['missing', 'denied', 'visible'])
  cases.push({
    family: 'datastream',
    action: 'getDataStream',
    controller: 'RecordController',
    label: `datastream ${state} authorization before identifier`,
    target: '/default/rdmp/record/oid/datastream',
    query: 'datastreamId[x]=bad&fileName[x]=bad',
    portState: state,
    expected: state === 'missing' ? 404 : state === 'denied' ? 403 : 400,
    contains:
      state === 'missing'
        ? 'Record not found'
        : state === 'denied'
          ? 'Access Denied'
          : 'Invalid datastream identifier or filename',
    trace: ['record'],
  });
for (const field of ['metadata', 'authorization'])
  for (const state of ['missing', 'existing'])
    cases.push({
      family: 'mutation',
      action: 'create',
      controller: 'webservice/RecordController',
      label: `record create ${state} type before ${field} shape`,
      target: '/default/rdmp/api/records/metadata/dataset',
      method: 'POST',
      body: { [field]: field === 'authorization' ? ['invalid'] : [] },
      portState: state,
      expected: 400,
      contains: state === 'missing' ? 'Record Type provided is not valid' : 'Invalid record body',
      trace: ['type'],
    });
for (const state of ['missing', 'existing'])
  cases.push({
    family: 'harvest',
    action: 'harvest',
    label: `tracked harvest ${state} type before updateMode`,
    target: '/default/rdmp/api/records/harvest/dataset',
    method: 'POST',
    query: 'updateMode=override',
    body: { sourceRunId: 'run', records: [] },
    portState: state,
    expected: 400,
    contains: state === 'missing' ? 'Record Type provided is not valid' : 'updateMode is not supported',
    trace: ['type'],
  });
for (const action of ['update', 'stop'])
  cases.push({
    family: 'progress',
    action,
    controller: 'AsynchController',
    label: `progress ${action} reassignment before invalid fields`,
    target: '/default/rdmp/asynch',
    method: action === 'update' ? 'PUT' : 'DELETE',
    body: { id: '0123456789abcdef01234567', relatedRecordId: 'other', name: [], status: [] },
    expected: 400,
    contains: 'Progress record ownership cannot change',
    trace: ['progress', 'record', 'record'],
  });
cases.push({
  family: 'progress',
  action: 'progress',
  controller: 'AsynchController',
  label: 'progress listing filters unauthorized rows after branded read',
  target: '/default/rdmp/asynch',
  query: 'fq[where][status]=running',
  portState: 'filter',
  expected: 200,
  trace: ['progress', 'record', 'record'],
});
for (const state of ['missing', 'foreign', 'visible'])
  cases.push({
    family: 'query',
    action: 'getIntegrationAuditData',
    label: `browser integration audit ${state} before status`,
    target: '/default/rdmp/record/viewAudit/oid/integration-audit',
    query: 'status=bad',
    portState: state,
    expected: state === 'missing' ? 404 : state === 'foreign' ? 403 : 400,
    contains:
      state === 'missing'
        ? 'Record not found'
        : state === 'foreign'
          ? 'view-error-no-permissions'
          : 'Invalid integration audit status.',
    trace: ['record'],
  });
for (const action of ['getAuditData', 'getIntegrationAuditData'])
  cases.push({
    family: 'query',
    action,
    label: `browser ${action} structured filter before object`,
    target: `/default/rdmp/record/viewAudit/oid/${action === 'getAuditData' ? 'audit' : 'integration-audit'}`,
    query: 'dateFrom[x]=bad',
    portState: 'missing',
    expected: 400,
    trace: [],
  });
cases.push({
  family: 'query',
  action: 'getAuditLog',
  label: 'raw integration audit status before authorized domain',
  target: '/default/rdmp/api/integration-audit/oid',
  query: 'status=bad',
  portState: 'missing',
  expected: 400,
  contains: 'Invalid status parameter.',
  trace: [],
});
cases.push({
  family: 'identity',
  action: 'listUsers',
  label: 'user listing read failure before numeric bounds',
  target: '/default/rdmp/api/users',
  query: 'page=0&pageSize=1001',
  portState: 'read-failed',
  expected: 500,
  contains: 'Failed to process user request',
  trace: ['users'],
});
for (const action of ['update', 'stop'])
  cases.push({
    family: 'progress',
    action,
    controller: 'AsynchController',
    label: `progress ${action} missing row before invalid fields`,
    target: '/default/rdmp/asynch',
    method: action === 'update' ? 'PUT' : 'DELETE',
    body: { id: '0123456789abcdef01234567', relatedRecordId: 'record', name: [], status: [] },
    portState: 'missing-row',
    expected: 403,
    contains: 'Access Denied',
    trace: ['progress'],
  });
describe('FM-016 FM-004 simultaneous-failure action-prelude differential', function () {
  this.timeout(10000);
  for (const c of cases)
    it(c.label, async () => {
      const row = inventory.routes.find(
        r =>
          r.action === c.action &&
          (!c.controller || r.controller === c.controller) &&
          (c.action !== 'subscribe' || r.path.includes('/subscribe/'))
      )!;
      assert(row, c.label);
      const r = inventoryRegistration(row);
      const source = r.declaration.api ?? { ...r.declaration, request: r.declaration.validation };
      const results = [];
      for (const native of [true]) {
        const trace: string[] = [],
          p = ports(trace, c.portState ?? 'existing');
        const f = await securityFixture(native, {
          routes: [r],
          action: async (req, reply) => {
            try {
              await preludes[c.family](req, reply, p, source);
              if (httpReplySubmitted(reply)) return reply;
              return reply.send({ unexpected: true });
            } catch (error) {
              if (error instanceof AuditReadError)
                return sendApiErrors(req, reply, error.status, [{ detail: error.message }]);
              if (error instanceof Refusal)
                return sendApiErrors(req, reply, error.status, [
                  error.title ? { title: error.message } : { detail: error.message },
                ]);
              return sendApiErrors(req, reply, 500, [
                { detail: c.family === 'identity' ? 'Failed to process user request' : 'Internal server error' },
              ]);
            }
          },
        });
        try {
          const response = await fetch(f.url + c.target + (c.query ? '?' + c.query : ''), {
            method: c.method ?? 'GET',
            headers: {
              Authorization: 'Bearer good',
              ...(c.body !== undefined ? { 'Content-Type': 'application/json' } : {}),
            },
            ...(c.body !== undefined ? { body: JSON.stringify(c.body) } : {}),
          });
          const text = await response.text();
          assert.equal(response.status, c.expected, text);
          if (c.contains) assert(text.includes(c.contains), text);
          if (c.trace) assert.deepEqual(trace, c.trace);
          results.push({ status: response.status, text, trace });
        } finally {
          await f.close();
        }
      }
      assertGoldenNext('security-ordering', results[0]);
    });
});

goldenControls('security-ordering');
