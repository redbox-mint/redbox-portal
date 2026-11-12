import { firstValueFrom } from 'rxjs';
import { HttpIdentity } from '../../../src/http/express/identity';
import { getIdentityRepositories } from '../../../src/persistence/identity/runtime';
import { userFromActor } from '../../../src/http/actors';
import { formatRecordEntityTag } from '../../../src/RecordEntityTag';
import { ObjectId, type Document } from 'mongodb';
import assert from 'node:assert/strict';
import { request } from 'node:http';
import { getReferenceRepositories } from '../../../src/persistence/reference/runtime';
import { BrandingModel } from '../../../src/model/storage/BrandingModel';
import { referenceProductionFixture, referenceOrigin } from './referenceProductionFixture';
export type Fixture = Awaited<ReturnType<typeof referenceProductionFixture>>;
export type Wire = { status: number; headers: Record<string, unknown>; text: string; aborted?: boolean };
export const mutationJobs = /storeRecordAudit|solrAddOrUpdate|solrDelete|storeSecurityEvent|FM026-Trigger/i;
const jobs = mutationJobs;
export async function wire(
  url: string,
  method: string,
  headers: Record<string, string> = {},
  body = '',
  timeoutMs = 10000
): Promise<Wire> {
  return new Promise((resolve, reject) => {
    const req = request(
      url,
      {
        method,
        agent: false,
        headers: { ...headers, ...(body ? { 'Content-Length': String(Buffer.byteLength(body)) } : {}) },
      },
      res => {
        let text = '';
        res.setEncoding('utf8');
        res.on('data', chunk => {
          text += chunk;
        });
        const result = (aborted = false) =>
          resolve({ status: res.statusCode!, headers: res.headers, text, ...(aborted ? { aborted: true } : {}) });
        res.once('end', () => result());
        res.once('aborted', () => result(true));
        res.once('error', () => result(true));
      }
    );
    req.once('error', error =>
      error.message === 'socket hang up' ? resolve({ status: 0, headers: {}, text: '', aborted: true }) : reject(error)
    );
    req.setTimeout(timeoutMs, () => req.destroy(new Error('wire timeout')));
    req.end(body);
  });
}
export async function session(f: Fixture) {
  const csrf = await wire(f.url + '/csrfToken', 'GET');
  const cookie = String((csrf.headers['set-cookie'] as string[])[0]).split(';')[0];
  const login = await wire(
    f.url + '/user/login_local',
    'POST',
    { Cookie: cookie, Origin: referenceOrigin, 'Content-Type': 'application/x-www-form-urlencoded' },
    new URLSearchParams({
      username: 'pilot-admin',
      password: 'pilot-password',
      branding: 'default',
      portal: 'rdmp',
      _csrf: JSON.parse(csrf.text)._csrf,
    }).toString()
  );
  assert.equal(login.status, 302, login.text);
  const authenticatedCookie = String((login.headers['set-cookie'] as string[])[0]).split(';')[0];
  return {
    Cookie: authenticatedCookie,
    'X-CSRF-Token': JSON.parse((await wire(f.url + '/csrfToken', 'GET', { Cookie: authenticatedCookie })).text)
      ._csrf as string,
  };
}
export async function settleMutationWork(f: Fixture) {
  await f.data.records.get().drain();
  const deadline = Date.now() + 10000;
  while (
    await f.client
      .db()
      .collection('agendaJobs')
      .countDocuments({ name: jobs, $or: [{ nextRunAt: { $ne: null } }, { lockedAt: { $ne: null } }] })
  ) {
    assert(Date.now() < deadline, 'Production mutation jobs must settle');
    await new Promise(resolve => setTimeout(resolve, 10));
  }
}
export async function seedMutationState(f: Fixture, login: Record<string, string>) {
  const brand = Object.assign(new BrandingModel(), f.brand),
    refs = getReferenceRepositories(f.owner);
  await refs.workflows.createDefinition({
    name: 'published',
    recordType: '000000000000000000000021',
    starting: false,
    hidden: false,
    config: { form: 'dataRecord', authorization: { editRoles: ['Admin'], transitionRoles: ['Admin'] } },
  });
  const complete = {
    brandId: brand.id,
    type: 'dataRecord',
    form: 'dataRecord',
    searchCore: 'default',
    attachmentFields: [],
    createdBy: 'pilot-admin',
    createdOn: '2026-01-02T00:00:00.000Z',
    packageType: 'dataRecord',
  };
  await f.client
    .db()
    .collection('record')
    .updateOne(
      { redboxOid: 'reference-record' },
      { $set: { metaMetadata: complete, workflow: { stage: 'draft', stageLabel: 'Draft' } } }
    );
  for (const [oid, privateRecord] of [
    ['private-record', true],
    ['deleted-record', false],
  ] as const)
    await f.data.storage().create(
      brand,
      {
        redboxOid: oid,
        revision: 1,
        metadata: { title: oid },
        metaMetadata: complete,
        workflow: { stage: 'draft', stageLabel: 'Draft' },
        authorization: {
          view: [privateRecord ? 'elsewhere' : 'pilot-admin'],
          edit: [privateRecord ? 'elsewhere' : 'pilot-admin'],
          viewRoles: [],
          editRoles: [],
        },
      },
      'dataRecord'
    );
  const actor = await new HttpIdentity(getIdentityRepositories(f.owner)).bearer('pilot-api-token');
  assert(actor);
  const type = await firstValueFrom(f.data.reference.types.get().get(brand, 'dataRecord'));
  const current = await f.data.storage().getMeta('deleted-record');
  const deleted = await f.data.records.get().delete('deleted-record', false, current, type, userFromActor(actor));
  assert(deleted.wasPersisted());

  await f.data.reference.entries.get().setEntry(brand, 'en', 'translation', 'owned/key', 'Before');
  await f.data.reference.entries.get().setBundle(brand, 'en', 'owned', { value: 'Before' });
  const definition = {
    name: 'definition',
    collectionName: 'record',
    brandIdFieldPath: 'metaMetadata.brandId',
    resultObjectMapping: {},
    mongoQuery: {},
    queryParams: {},
  };
  await f.data.reference.queries.get().create(brand, 'definition', definition);
  await f.data.reference.reports.get().createConfig(brand, {
    name: 'definition',
    title: 'Definition',
    reportSource: 'database',
    databaseQuery: { queryName: 'definition' },
    solrQuery: null,
    filter: [],
    columns: [],
    readOnly: false,
    canEdit: true,
    canDelete: true,
    canPreview: true,
  });
  await settleMutationWork(f);
}

export const mutationCollections = [
  'record',
  'deletedrecord',
  'recordidentity',
  'recordschemareference',
  'recordaudit',
  'appconfig',
  'i18ntranslation',
  'i18nbundle',
  'namedquery',
  'report',
  'dashboardconfiguration',
  'harvestrun',
  'harvestrunchunk',
  'harvestrecordevent',
  'useraudit',
  'securityevent',
];
const collections = mutationCollections;
export async function normalizeMutation(f: Fixture, response: Wire, headEntityText?: string) {
  const headers = { ...response.headers };
  for (const key of ['date', 'connection', 'keep-alive', 'x-request-id']) delete headers[key];
  if (headers['set-cookie'])
    headers['set-cookie'] = (headers['set-cookie'] as string[]).map(v =>
      v.replace(/^([^=]+)=[^;]*/, '$1=<session>').replace(/Expires=[^;]+/i, 'Expires=<time>')
    );
  const state: Record<string, unknown[]> = {},
    ids = new Map<string, string>();
  for (const name of collections) state[name] = await f.client.db().collection(name).find({}).toArray();
  for (const row of state.record as Document[]) {
    if (!['reference-record', 'foreign-record', 'private-record', 'deleted-record'].includes(row.redboxOid)) {
      ids.set(row.redboxOid, 'created-record:' + String(row.harvestId ?? row.metadata?.title));
      // Verify the opaque validator before substituting the generated record identity.
      const tag = formatRecordEntityTag(row.redboxOid, row.revision);
      ids.set(tag, formatRecordEntityTag(ids.get(row.redboxOid)!, row.revision));
    }
  }
  for (const [name, rows] of Object.entries(state))
    for (const row of rows as Document[]) {
      const identity = String(
        row.redboxOid ?? row.name ?? row.configKey ?? row.key ?? row.sourceRunId ?? row.action ?? row.eventType ?? 'row'
      );
      const label = name + ':' + (ids.get(identity) ?? identity);
      if (row._id && !String(row._id).startsWith('000000000000000000') && !ids.has(String(row._id)))
        ids.set(String(row._id), label);
      if (name === 'recordschemareference' && row.kind === 'save')
        ids.set(row.referenceKey, 'save:' + (ids.get(row.oid) ?? row.oid) + ':' + row.schemaKind + ':' + row.digest);
    }
  const clean = (value: unknown, key = ''): unknown => {
    if (value instanceof ObjectId) return ids.get(value.toString()) ?? value.toString();
    if (value instanceof Date) return '<time>';
    if (Array.isArray(value)) return value.map(item => clean(item));
    if (value && typeof value === 'object')
      return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, clean(v, k)]));
    if (
      [
        'durationMs',
        'startedAt',
        'completedAt',
        'occurredAt',
        'capturedAt',
        'lastSaveDate',
        'createdAt',
        'updatedAt',
        'createdOn',
        'dateCreated',
        'dateModified',
        'timestamp',
        'terminalAt',
        'expiresAt',
        'migratedAt',
        'dateDeleted',
        'lastLogin',
        'lastChunkAt',
        'submittedAt',
      ].includes(key) &&
      value != null
    )
      return '<time>';
    if (
      [
        'executionId',
        'requestId',
        'incarnationId',
        'eventId',
        'runId',
        'lifecycleOperationId',
        'claimToken',
        'operationId',
      ].includes(key) &&
      value != null
    )
      return '<' + key + '>';
    if (typeof value !== 'string') return value;
    let text = value;
    for (const [id, label] of ids) text = text.split(id).join(label);
    if (key === 'additionalContext' || key === 'additionalAttributes') {
      try {
        return JSON.stringify(clean(JSON.parse(text)));
      } catch {}
    }
    return text;
  };
  for (const [name, rows] of Object.entries(state))
    state[name] = rows
      .map(row => {
        const value = clean(row) as Record<string, unknown>;
        if (['recordaudit', 'useraudit', 'securityevent', 'harvestrecordevent'].includes(name)) delete value._id;
        return value;
      })
      .sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));
  state.jobs = (await f.client.db().collection('agendaJobs').find({ name: jobs }).toArray())
    .map(row => clean({ name: row.name, data: row.data, failReason: row.failReason }) as unknown)
    .sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));
  let text = headEntityText ?? response.text;
  try {
    text = JSON.stringify(clean(JSON.parse(text)));
  } catch {}
  const cleanedHeaders = clean(headers) as Record<string, unknown>;
  if (headers['content-length']) cleanedHeaders['content-length'] = String(Buffer.byteLength(text));
  if (response.headers['content-length'])
    assert.equal(Number(response.headers['content-length']), Buffer.byteLength(headEntityText ?? response.text));
  return { wire: { ...response, headers: cleanedHeaders, text: headEntityText === undefined ? text : '' }, state };
}

export async function dashboardMutationPayload(f: Fixture, action: string) {
  // Use the same resolved brand (including roles) as the production request.
  // A bare persistence seed caches a forbidden field catalogue until its TTL.
  const brand = f.data.reference.branding.get().getBrand('default');
  assert(brand);
  if (action === 'retiredOperation') return {};
  const source = { kind: 'workflow' as const, recordType: 'dataRecord', stage: 'draft' },
    destination = { kind: 'view' as const, view: 'referenceView', step: 'draft' };
  const actor = await new HttpIdentity(getIdentityRepositories(f.owner)).bearer('pilot-api-token');
  assert(actor);
  const options = {
    portal: 'rdmp',
    caller: {
      brand,
      user: {
        ...actor,
        type: actor.type ?? '',
        name: actor.name ?? '',
        email: actor.email ?? '',
        roles: actor.roles.map(role => ({ ...role, name: role.name ?? '' })),
      },
    },
  };
  const current = await f.data.reference.dashboardConfig
    .get()
    .getTargetSettings(brand, action === 'saveViewTarget' ? destination : source);
  const valid = await f.data.reference.dashboardConfig
    .get()
    .validateTargetSettings(
      brand,
      action === 'saveViewTarget' ? destination : source,
      current.revision,
      current.settings,
      options
    );
  if (action === 'validateSettings')
    return { target: source, expectedRevision: current.revision, settings: current.settings };
  if (action === 'previewCopy') return { source, destinations: [destination], groups: ['all'] };
  if (action === 'applyCopy') {
    const preview = await f.data.reference.dashboardConfig
      .get()
      .previewCopy(brand, { source, destinations: [destination], groups: ['all'] }, options);
    return {
      source,
      destinations: [destination],
      groups: ['all'],
      expectedRevision: preview.expectedRevision,
      previewFingerprint: preview.previewFingerprint,
      acknowledgedWarningIds: (preview.warnings ?? []).map(w => w.id),
    };
  }
  return {
    settings: current.settings,
    expectedRevision: current.revision,
    validationFingerprint: valid.validationFingerprint,
    acknowledgedWarningIds: valid.warnings.map(w => w.id),
  };
}
