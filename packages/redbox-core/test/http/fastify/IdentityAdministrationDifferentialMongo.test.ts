import { authorizationWitness } from './authorizationRequests';
import { goldenControls } from './goldenContracts';
import { assertProductionContract } from './productionContracts';
import assert from 'node:assert/strict';
import { mutationWitnessCases } from './mutationWitnessSelection';
import { assertNoObservedEffects, observeNoSideEffects } from './noSideEffects';
import { createServer, request } from 'node:http';
import { once } from 'node:events';
import { createHash } from 'node:crypto';
import { writeFile } from 'node:fs/promises';
import { ObjectId, type Document } from 'mongodb';
import { of, throwError } from 'rxjs';
import sinon from 'sinon';
import { identityAdministrationDeclarations as routes } from '../../../src/http/identityRoutes';
import { queryReadRoutes } from '../../../src/http/readRoutes';
import { portalHttpPolicies } from '../../../src/application/portal/httpPolicies';
import { getIdentityRepositories } from '../../../src/persistence/identity/runtime';
import { RoleModel } from '../../../src/model/storage/RoleModel';
import { referenceProductionFixture, referenceOrigin } from './referenceProductionFixture';

import type { createPortalFastifyApplication } from '../../../src/application/portal/application';
type Fixture = Awaited<ReturnType<typeof referenceProductionFixture>>;
type Route = (typeof routes)[number];
type Wire = {
  status: number;
  headers: Record<string, unknown>;
  text: string;
  aborted?: boolean;
};
type Scenario = {
  name: string;
  auth?: string | false;
  cookie?: boolean;
  csrf?: boolean;
  login?: 'foreign' | 'linked';
  version?: string;
  query?: string;
  method?: string;
  target?: 'alias' | 'disabled' | 'foreign' | 'shared' | 'missing' | 'bad';
  body?: 'array' | 'invalid' | 'parser' | 'empty' | 'absent' | 'object';
  brand?: 'other' | 'unknown';
  origin?: string;
  fault?: 'domain' | 'audit' | 'roles' | 'serialization' | 'once';
  stale?: boolean;
  control?: string;
};
const modes = ['fastify'] as const;
const ids = {
  admin: '000000000000000000000015',
  reader: '000000000000000000000017',
  foreign: '000000000000000000000018',
  primary: '000000000000000000000051',
  secondary: '000000000000000000000052',
  alias: '000000000000000000000053',
  disabled: '000000000000000000000054',
  shared: '000000000000000000000055',
  aliasAdmin: '000000000000000000000056',
  disabledAdmin: '000000000000000000000057',
  orphan: '000000000000000000000058',
  cyclic: '000000000000000000000059',
  otherTarget: '000000000000000000000060',
  otherSecondary: '000000000000000000000061',
};
const baseScenarios: Scenario[] = [
  { name: 'v1' },
  { name: 'case-trailing' },
  { name: 'v2', version: '2.0' },
  { name: 'query-v2', query: 'apiVersion=2.0' },
  { name: 'conflicting-version', version: '2.0', query: 'apiVersion=1.0' },
  { name: 'browser-session', auth: false, cookie: true, csrf: true },
  { name: 'API-bearer-only', auth: 'pilot-api-token', cookie: false, csrf: false },
  { name: 'session-no-csrf', auth: false, cookie: true, csrf: false },
  { name: 'session-invalid-bearer', auth: 'invalid', cookie: true, csrf: true },
  { name: 'distinct-browser-and-API-actors', auth: 'reader-token', cookie: true, csrf: true },
  { name: 'AJAX-with-CSRF', auth: false, cookie: true, csrf: true },
  { name: 'anonymous', auth: false, cookie: false, csrf: false },
  { name: 'missing-actor', auth: false, cookie: true, csrf: true, stale: true },
  { name: 'reader', auth: 'reader-token', cookie: false },
  { name: 'foreign-role', auth: 'foreign-token', cookie: false },
  { name: 'foreign-brand-denied', brand: 'other' },
  { name: 'other-brand-success', brand: 'other', auth: 'foreign-token', cookie: true, csrf: true, login: 'foreign' },
  { name: 'unknown-brand', brand: 'unknown' },
  { name: 'foreign-target', target: 'foreign' },
  { name: 'shared-target', target: 'shared' },
  { name: 'missing-target', target: 'missing' },
  { name: 'bad-target', target: 'bad' },
  { name: 'linked-target', target: 'alias' },
  { name: 'disabled-target', target: 'disabled' },
  { name: 'linked-actor', auth: 'alias-admin-token', cookie: false, csrf: true },
  { name: 'disabled-actor', auth: 'disabled-admin-token', cookie: false },
  { name: 'linked-browser-actor', auth: false, cookie: true, csrf: true, login: 'linked' },
  { name: 'disabled-browser-actor', auth: false, cookie: true, csrf: true },
  { name: 'linked-disabled-browser-actor', auth: false, cookie: true, csrf: true, login: 'linked' },
  { name: 'orphan-actor', auth: 'orphan-token', cookie: false },
  { name: 'cyclic-actor', auth: 'cyclic-token', cookie: false },
  { name: 'foreign-origin', origin: 'https://foreign.invalid' },
  { name: 'array-body', body: 'array' },
  { name: 'invalid-body', body: 'invalid' },
  { name: 'parser-before-auth', auth: false, cookie: false, body: 'parser' },
  { name: 'nested-query', query: 'id[bad]=x&primaryUserId[bad]=x&searchBy[bad]=x&query[bad]=x&page[bad]=2' },
  { name: 'duplicate-query', query: 'id=x&id=y&query=x&query=y&page=1&page=2' },
  { name: 'domain-failure', fault: 'domain' },
  { name: 'domain-failure-v2', fault: 'domain', version: '2.0' },
  { name: 'audit-failure', fault: 'audit' },
  { name: 'role-failure', fault: 'roles' },
  { name: 'version-array', query: 'apiVersion[]=2.0' },
  { name: 'version-mixed', query: 'apiVersion[0]=2.0&apiVersion[1][toString]=bad', control: 'safe-version' },
  { name: 'version-alias', query: 'apiversion[toString]=bad', control: 'safe-version' },
  { name: 'linked-disabled-actor', auth: 'alias-admin-token', cookie: false },
  { name: 'include-disabled', query: 'includeDisabled=true' },
  { name: 'pagination', query: 'page=2&pageSize=1' },
  { name: 'unfiltered-users', query: 'searchBy=&query=&includeDisabled=true' },
  { name: 'safe-version', query: 'apiVersion[unknown]=invalid' },
  ...Object.getOwnPropertyNames(Object.prototype).map(key => ({
    name: 'version-' + key,
    query: `apiVersion[${key}]=bad`,
    control: 'safe-version',
  })),
];
const observations = new Map<string, unknown[]>();
const flows = new Map<string, unknown[]>();
const flowNames = ['token freshness', 'linked disabled-account lifecycle'] as const;
const aliasDisableEffects = new Map<string, string[]>();
const cases: {
  key: string;
  route: Route;
  scenario: Scenario;
  reduced: boolean;
}[] = [];
for (const reduced of [false, true])
  for (const route of routes) {
    const scenarios: Scenario[] = reduced
      ? [
          { name: 'anonymous-v1', auth: false, cookie: false, csrf: false, body: 'invalid' },
          { name: 'anonymous-v2', auth: false, cookie: false, csrf: false, body: 'invalid', version: '2.0' },
          { name: 'missing-actor-v1', auth: false, cookie: true, csrf: true, stale: true, body: 'invalid' },
          {
            name: 'missing-actor-v2',
            auth: false,
            cookie: true,
            csrf: true,
            stale: true,
            body: 'invalid',
            version: '2.0',
          },
        ]
      : [
          ...baseScenarios,
          ...(['listSystemRoles', 'getBrandRoles', 'getAppConfig'].includes(route.action)
            ? [
                { name: 'serialization-once', fault: 'once' as const },
                { name: 'serialization-failure', fault: 'serialization' as const },
              ]
            : []),
          ...(route.method === 'get'
            ? [
                { name: 'HEAD', method: 'HEAD' },
                { name: 'conditional-GET', query: 'apiVersion=2.0', method: 'GET' },
                { name: 'conditional-HEAD', method: 'HEAD' },
              ]
            : []),
        ];
    if (!reduced && ['post', 'put'].includes(route.method))
      for (const version of ['1.0', '2.0'])
        for (const body of ['empty', 'absent', 'object'] as const)
          scenarios.push({ name: 'body-' + body + '-' + version, body, version, cookie: true, csrf: true });
    for (const scenario of scenarios.filter(s => !process.env.FM027_BODY_SWEEP || s.name.startsWith('body-')))
      cases.push({
        key: `${reduced ? 'reduced' : 'default'} ${route.method} ${route.path} ${scenario.name}`,
        route,
        scenario,
        reduced,
      });
  }
async function wire(url: string, method: string, headers: Record<string, string> = {}, body = ''): Promise<Wire> {
  return new Promise((resolve, reject) => {
    const req = request(
      url,
      { method, headers: { ...headers, ...(body ? { 'Content-Length': String(Buffer.byteLength(body)) } : {}) } },
      res => {
        const chunks: Buffer[] = [];
        res.on('data', chunk => chunks.push(chunk));
        res.on('aborted', () =>
          resolve({
            status: res.statusCode!,
            headers: res.headers,
            text: Buffer.concat(chunks).toString(),
            aborted: true,
          })
        );
        res.on('error', reject);
        res.on('end', () =>
          resolve({ status: res.statusCode!, headers: res.headers, text: Buffer.concat(chunks).toString() })
        );
      }
    );
    req.setTimeout(10000, () => req.destroy(new Error('HTTP timeout')));
    req.on('error', reject);
    req.end(body);
  });
}
async function session(f: Fixture, username = 'pilot-admin', password = 'pilot-password', branding = 'default') {
  const csrf = await wire(f.url + '/csrfToken', 'GET');
  const cookie = String((csrf.headers['set-cookie'] as string[])[0]).split(';')[0];
  const login = await wire(
    f.url + '/user/login_local',
    'POST',
    { Cookie: cookie, Origin: referenceOrigin, 'Content-Type': 'application/x-www-form-urlencoded' },
    new URLSearchParams({ username, password, branding, portal: 'rdmp', _csrf: JSON.parse(csrf.text)._csrf }).toString()
  );
  assert.equal(login.status, 302, login.text);
  const authenticatedCookie = String((login.headers['set-cookie'] as string[])[0]).split(';')[0];
  const token = JSON.parse((await wire(f.url + '/csrfToken', 'GET', { Cookie: authenticatedCookie })).text)._csrf;
  return { cookie: authenticatedCookie, token };
}
const stateCollections = ['user', 'role', 'role_users__user_roles', 'userlink', 'appconfig', 'record', 'recordaudit'];
async function seed(f: Fixture) {
  const repository = getIdentityRepositories(f.owner);
  for (const [key, username, roles, extra] of [
    ['primary', 'primary', ['000000000000000000000014'], {}],
    ['secondary', 'secondary', ['000000000000000000000014'], {}],
    [
      'alias',
      'linked-alias',
      ['000000000000000000000014'],
      { linkedPrimaryUserId: ids.primary, accountLinkState: 'linked-alias' },
    ],
    ['disabled', 'disabled', ['000000000000000000000014'], { loginDisabled: true }],
    ['shared', 'shared', ['000000000000000000000014', '000000000000000000000016'], {}],
    [
      'aliasAdmin',
      'alias-admin',
      ['000000000000000000000013'],
      { linkedPrimaryUserId: ids.admin, accountLinkState: 'linked-alias' },
    ],
    ['disabledAdmin', 'disabled-admin', ['000000000000000000000013'], { loginDisabled: true }],
    [
      'orphan',
      'orphan',
      ['000000000000000000000013'],
      { linkedPrimaryUserId: '000000000000000000000099', accountLinkState: 'linked-alias' },
    ],
    ['otherTarget', 'other-target', ['000000000000000000000016'], {}],
    ['otherSecondary', 'other-secondary', ['000000000000000000000016'], {}],
    [
      'cyclic',
      'cyclic',
      ['000000000000000000000013'],
      { linkedPrimaryUserId: ids.cyclic, accountLinkState: 'linked-alias' },
    ],
  ] as const)
    await repository.create('user', {
      id: ids[key],
      username,
      name: username,
      email: username + '@example.invalid',
      type: 'local',
      password: 'synthetic-password',
      token: createHash('sha256')
        .update(username + '-token')
        .digest('base64'),
      roles: [...roles],
      ...extra,
    });
  for (const [oid, username] of [['reference-record', 'secondary']]) {
    await f.client
      .db()
      .collection('record')
      .updateOne(
        { redboxOid: oid },
        {
          $set: {
            authorization: {
              view: ['pilot-admin', username],
              edit: [username],
              viewPending: [username + '@example.invalid'],
              editPending: [username + '@example.invalid'],
              viewRoles: [],
              editRoles: [],
            },
          },
        }
      );
  }
}
async function settleEvents(f: Fixture) {
  // Await the real production queue's persisted capture jobs, rather than calling
  // a worker or injecting a replacement event writer into the fixture.
  const limit = Date.now() + 10000;
  while (true) {
    const pending = await f.client
      .db()
      .collection('agendaJobs')
      .countDocuments({
        name: /StoreSecurityEvent|ForwardSecurityEvents|storeRecordAudit/i,
        $or: [{ nextRunAt: { $ne: null } }, { lockedAt: { $ne: null } }],
      });
    if (!pending) return;
    assert(Date.now() < limit, 'Security capture/forwarding queue did not settle');
    await new Promise(resolve => setTimeout(resolve, 10));
  }
}
function target(route: Route, s: Scenario) {
  const id =
    s.target === 'bad'
      ? 'bad'
      : s.target === 'missing'
        ? '000000000000000000000099'
        : s.target
          ? ids[s.target]
          : s.brand === 'other'
            ? ids.otherTarget
            : ids.primary;
  let path = route.path
    .replace('/:branding/:portal', '/' + (s.brand ?? 'default') + '/rdmp')
    .replace(':id', id)
    .replace(':roleName', 'FixtureRole')
    .replace(':configKey', 'siem');
  if (s.name === 'case-trailing') path = path.replace(/\/(api|admin|user)(?=\/)/g, value => value.toUpperCase()) + '/';
  const query = new URLSearchParams({
    id,
    primaryUserId: id,
    query:
      route.action === 'searchLinkCandidates'
        ? s.brand === 'other'
          ? 'other-secondary'
          : 'secondary'
        : s.brand === 'other'
          ? 'other-target'
          : 'primary',
    searchBy: 'username',
  });
  if (s.query) for (const key of new URLSearchParams(s.query).keys()) query.delete(key.split('[')[0]);
  const normal = Object.fromEntries(query);
  return { path: path + '?' + query + (s.query ? '&' + s.query : ''), id, normal };
}
function payload(route: Route, id: string, endpoint: string, other = false) {
  const role = other ? 'Admin' : 'Researcher';
  if (['createUser', 'addLocalUser'].includes(route.action)) {
    const details = {
      name: 'Created',
      email: 'created@example.invalid',
      password: 'synthetic-password',
      roles: [role],
    };
    return route.path.includes('/api/')
      ? { username: 'created-user', ...details }
      : { username: 'created-user', details };
  }
  if (['updateUser', 'updateUserDetails', 'update'].includes(route.action)) {
    const details = {
      name: 'Changed',
      email: 'changed@example.invalid',
      password: '',
      ...(route.controller !== 'UserController' ? { roles: [role] } : {}),
    };
    return route.path.includes('/api/') ? { id, ...details } : { userid: id, details };
  }
  if (route.action === 'linkAccounts')
    return { primaryUserId: id, secondaryUserId: other ? ids.otherSecondary : ids.secondary };
  if (route.action === 'updateUserRoles') return { userid: id, roles: [role] };
  if (route.action === 'testDestination')
    return {
      destination: {
        id: 'fixture',
        enabled: false,
        adapterType: 'splunk-hec-json',
        endpointUrl: endpoint,
        token: '********',
      },
    };
  if (['saveConfig', 'setAppConfig'].includes(route.action))
    return {
      enabled: true,
      destinations: [
        {
          id: 'fixture',
          enabled: false,
          adapterType: 'splunk-hec-json',
          endpointUrl: endpoint,
          token: 'synthetic-siem-secret',
        },
      ],
    };
  return { userid: id };
}
function faults(f: Fixture, route: Route, s: Scenario) {
  const stubs: sinon.SinonStub[] = [];
  let encodings = 0;
  const fail = () => {
    throw new Error('private-backend-password-token-marker');
  };
  if (s.fault === 'serialization' || s.fault === 'once') {
    const value = Object.assign(new RoleModel(), { id: '000000000000000000000077', name: 'Serialization' });
    Object.defineProperty(value, 'toJSON', {
      value: () => {
        encodings++;
        if (s.fault === 'serialization') throw new Error('private-backend-password-token-marker');
        return {
          id: value.id,
          name: value.name,
          date: new Date('2020-01-02T03:04:05Z'),
          unicode: 'Ω',
          extra: null,
          large: 'λ'.repeat(65537),
        };
      },
    });
    if (route.action === 'getAppConfig')
      stubs.push(sinon.stub(f.data.reference.appConfigs.get(), 'getMaskedAppConfigurationForBrand').returns(value));
    else stubs.push(sinon.stub(f.data.reference.roles.get(), 'getRolesWithBrand').returns(of([value])));
  }
  if (s.fault === 'audit') stubs.push(sinon.stub(f.data.users.get(), 'addUserAuditEvent').callsFake(fail));
  if (s.fault === 'roles')
    stubs.push(sinon.stub(f.data.users.get(), 'updateUserRoles').callsFake(() => throwError(fail)));
  if (s.fault === 'domain') {
    if (route.controller === 'webservice/AdminController' || route.controller === 'webservice/SiemController') {
      stubs.push(sinon.stub(f.data.reference.appConfigs.get(), 'getMaskedAppConfigurationForBrand').callsFake(fail));
      stubs.push(sinon.stub(f.data.reference.appConfigs.get(), 'createOrUpdateConfig').callsFake(fail));
      stubs.push(sinon.stub(f.data.reference.appConfigs.get(), 'getAppConfigByBrandAndKey').callsFake(fail));
      stubs.push(sinon.stub(f.data.reference.translation.get(), 'bootstrap').callsFake(fail));
    } else if (
      [
        'listUsers',
        'getUser',
        'getUsers',
        'searchLinkCandidates',
        'getUserLinks',
        'getUserAudit',
        'linkAccounts',
      ].includes(route.action)
    ) {
      stubs.push(sinon.stub(f.data.users.get(), 'requireUserInBrand').callsFake(fail));
      stubs.push(sinon.stub(f.data.users.get(), 'getUsersForBrand').callsFake(() => throwError(fail)));
      stubs.push(sinon.stub(f.data.users.get(), 'findUsersWithQuery').callsFake(() => throwError(fail)));
    } else stubs.push(sinon.stub(f.data.reference.roles.get(), 'getRolesWithBrand').callsFake(() => throwError(fail)));
  }
  return { restore: () => stubs.forEach(stub => stub.restore()), encodings: () => encodings };
}
async function normalize(f: Fixture, wire: Wire, endpoint: string, generate: boolean, knownToken?: string) {
  const headers = { ...wire.headers };
  for (const key of ['date', 'connection', 'keep-alive', 'x-request-id']) delete headers[key];
  if (headers['set-cookie'])
    headers['set-cookie'] = (headers['set-cookie'] as string[]).map(value =>
      value.replace(/^([^=]+)=[^;]*/, '$1=<session>').replace(/Expires=[^;]+/i, 'Expires=<time>')
    );
  const map = new Map<string, string>();
  for (const name of [...stateCollections, 'useraudit'])
    for (const row of await f.client.db().collection(name).find({}).toArray()) {
      if (!String(row._id).startsWith('000000000000000000'))
        map.set(
          String(row._id),
          name + ':' + String(row.username ?? row.name ?? row.configKey ?? row.redboxOid ?? row.action ?? 'row')
        );
    }
  let rawToken: string | undefined = knownToken;
  if (generate && wire.status === 200) {
    const value = JSON.parse(wire.text);
    rawToken = (value.data ?? value).token ?? (value.data ?? value).message;
    assert.match(rawToken!, /^[0-9a-f-]{36}$/);
    const saved = await f.client
      .db()
      .collection('user')
      .findOne({ token: createHash('sha256').update(rawToken!).digest('base64') });
    assert(saved, 'Generated token is hashed in Mongo');
  }
  const clean = (value: unknown, key = ''): unknown => {
    if (value instanceof ObjectId) return map.get(value.toString()) ?? value.toString();
    if (Array.isArray(value)) return value.map(item => clean(item));
    if (value && typeof value === 'object')
      return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, clean(v, k)]));
    if (key === 'durationMs') return '<duration>';
    if (typeof value !== 'string') return value;
    if (key === 'executionId') return '<execution>';
    if (key === 'requestId') return '<request>';
    if (
      [
        'createdAt',
        'updatedAt',
        'lastLogin',
        'occurredAt',
        'terminalAt',
        'dateCreated',
        'dateModified',
        'capturedAt',
        'linkedAt',
        'timestamp',
      ].includes(key)
    )
      return '<time>';
    if (key === 'eventId') return '<event>';
    if (key === 'incarnationId') return '<incarnation>';
    if (key === 'lastSaveDate') return '<time>';
    if (key === 'password' && /^\$2/.test(value)) return '<bcrypt>';
    if (
      key === 'token' &&
      generate &&
      value !== '' &&
      !new Set(
        [
          'pilot-api-token',
          'reader-token',
          'foreign-token',
          ...Object.keys(ids).map(k => k.replace(/[A-Z]/g, x => '-' + x.toLowerCase()) + '-token'),
        ].map(token => createHash('sha256').update(token).digest('base64'))
      ).has(value)
    )
      return '<token-hash>';
    let result = value.split(endpoint).join('<collector>');
    if (rawToken)
      result = result
        .split(rawToken)
        .join('<generated-token>')
        .split(createHash('sha256').update(rawToken).digest('base64'))
        .join('<token-hash>');
    for (const [id, label] of map) result = result.split(id).join(label);
    if (/^(additionalContext|additionalAttributes)$/.test(key)) {
      try {
        return JSON.stringify(clean(JSON.parse(result)));
      } catch {
        /* Existing scalar attributes remain scalar. */
      }
    }
    return result;
  };
  let text = wire.text;
  try {
    text = JSON.stringify(clean(JSON.parse(text)));
  } catch {
    /* Preserve non-JSON bodies. */
  }
  const state: Record<string, unknown> = {};
  for (const name of [...stateCollections, 'useraudit', 'securityevent']) {
    const rows = await f.client.db().collection(name).find({}).toArray();
    const cleaned = rows.map(row => {
      const value = clean(row) as Record<string, unknown>;
      if (name === 'useraudit' || name === 'securityevent') delete value._id;
      return value;
    });
    state[name] = cleaned.sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));
  }
  return { wire: { ...wire, headers, text }, state };
}
const identitySuiteTitle = 'FM-025 retained production identity/administration raw-HTTP differential';
describe(identitySuiteTitle, function () {
  this.timeout(900000);
  const prohibitedEffects = new Map<string, string[]>();
  before(async () => {
    const prepared = mutationWitnessCases(identitySuiteTitle, cases, test => test.key);
    const flowsSelected = mutationWitnessCases(identitySuiteTitle, flowNames, name => name);
    const collector = createServer((req, res) => {
      req.resume();
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ code: 0, text: 'synthetic-siem-secret private-backend-password-token-marker' }));
    });
    collector.listen(0, '127.0.0.1');
    await once(collector, 'listening');
    const address = collector.address();
    assert(address && typeof address === 'object');
    const endpoint = 'http://127.0.0.1:' + address.port;
    try {
      for (const reduced of [false, true])
        for (const mode of modes) {
          if (!prepared.some(c => c.reduced === reduced) && (reduced || !flowsSelected.length)) continue;
          const policies = portalHttpPolicies();
          if (reduced)
            for (const name of new Set(routes.map(r => r.controller)))
              policies[name] = ['noCache', 'brandingAndPortal'];
          const f = await referenceProductionFixture(mode === 'fastify', policies, undefined, {
            // Include the inherited SIEM reads to prove there is one selected controller.
            declarations: [...routes, ...queryReadRoutes.filter(r => r.controller === 'webservice/SiemController')],
            configuration: {
              auth: {
                roles: [{ name: 'Admin' }, { name: 'Researcher' }, { name: 'Guest' }],
                rules: [{ path: '/:branding/:portal(/*)', role: 'Admin', can_update: true }],
                hiddenRoles: ['Researcher'],
                hiddenUsers: ['secondary'],
              },
              brandingConfigurationDefaults: {
                auth: {
                  active: ['local'],
                  local: {
                    default: {
                      adminUser: 'pilot-admin',
                      adminPw: 'pilot-password',
                      email: 'synthetic@example.invalid',
                      token: 'pilot-api-token',
                    },
                  },
                },
                siem: {
                  enabled: true,
                  destinations: [
                    {
                      id: 'fixture',
                      enabled: false,
                      adapterType: 'splunk-hec-json',
                      endpointUrl: endpoint,
                      token: 'synthetic-siem-secret',
                    },
                  ],
                },
              },
            },
          });
          try {
            await seed(f);
            const login = await session(f);
            const logins = {
              foreign: await session(f, 'foreign', 'pilot-password', 'other'),
              linked: await session(f, 'alias-admin', 'synthetic-password'),
            };
            await settleEvents(f);
            const baseline = new Map<string, Document[]>();
            // Authentication can destroy a stale actor's session. Restore the real
            // host-specific session alongside domain state for each independent case.
            // Session representations intentionally differ and are not compared.
            for (const name of [...stateCollections, 'referenceSessions'])
              baseline.set(name, await f.client.db().collection(name).find({}).toArray());
            if (!reduced && !process.env.FM027_BODY_SWEEP) {
              const reset = async () => {
                for (const [name, rows] of baseline) {
                  await f.client.db().collection(name).deleteMany({});
                  if (rows.length) await f.client.db().collection(name).insertMany(rows);
                }
                for (const name of ['useraudit', 'securityevent', 'siemdeliveryattempt'])
                  await f.client.db().collection(name).deleteMany({});
                await f.data.reference.appConfigs.get().bootstrap();
              };
              const browserHeaders = {
                Cookie: login.cookie,
                Origin: referenceOrigin,
                'X-CSRF-Token': login.token,
                'X-Requested-With': 'XMLHttpRequest',
                'Content-Type': 'application/json',
              };
              const apiHeaders = {
                Authorization: 'Bearer pilot-api-token',
                Origin: referenceOrigin,
                'Content-Type': 'application/json',
                'X-ReDBox-API-Version': '2.0',
              };
              for (const flow of flowsSelected) {
                await reset();
                const steps: unknown[] = [];
                const flowValues = flows.get(flow) ?? [];
                flowValues[modes.indexOf(mode)] = steps;
                flows.set(flow, flowValues);
                let token: string | undefined;
                const call = async (
                  path: string,
                  method: string,
                  headers: Record<string, string>,
                  body: unknown,
                  status: number,
                  generate = false
                ) => {
                  const assertInWitness =
                    method === 'POST' && path === '/api/users/' + ids.secondary + '/disable' && status === 400;
                  const observer = assertInWitness ? await observeNoSideEffects(f) : undefined;
                  const response = await (async () => {
                    try {
                      const result = await authorizationWitness(`${identitySuiteTitle} ${flow}`, () =>
                        wire(
                          f.url + '/default/rdmp' + path,
                          method,
                          headers,
                          body === undefined ? '' : JSON.stringify(body)
                        )
                      );
                      if (observer) aliasDisableEffects.set(flow, await observer.differences());
                      else assert.equal(result.status, status, flow + ': ' + path + ': ' + result.text);
                      return result;
                    } finally {
                      observer?.restore();
                    }
                  })();
                  if (generate) token = JSON.parse(response.text).message;
                  await settleEvents(f);
                  steps.push(await normalize(f, response, endpoint, generate, token));
                  return JSON.parse(response.text || 'null');
                };
                if (flow === 'token freshness') {
                  await call('/user/genKey', 'POST', browserHeaders, {}, 200, true);
                  await call('/api/roles', 'GET', apiHeaders, undefined, 401);
                  await call('/api/roles', 'GET', { ...apiHeaders, Authorization: 'Bearer ' + token }, undefined, 200);
                  await call('/admin/roles/get', 'GET', browserHeaders, undefined, 200);
                  await call('/user/revokeKey', 'POST', browserHeaders, {}, 200);
                  await call('/api/roles', 'GET', { ...apiHeaders, Authorization: 'Bearer ' + token }, undefined, 401);
                } else {
                  const linked = await call(
                    '/api/users/link',
                    'POST',
                    apiHeaders,
                    { primaryUserId: ids.primary, secondaryUserId: ids.secondary },
                    200
                  );
                  assert.equal(linked.data.impact.recordsRewritten, 1);
                  await call('/api/users/' + ids.primary + '/links', 'GET', apiHeaders, undefined, 200);
                  await call('/api/users/' + ids.primary + '/audit', 'GET', apiHeaders, undefined, 200);
                  await call('/api/users/' + ids.secondary + '/disable', 'POST', apiHeaders, {}, 400);
                  await call('/api/users/' + ids.primary + '/disable', 'POST', apiHeaders, {}, 200);
                  const listed = await call(
                    '/api/users?includeDisabled=true&pageSize=100',
                    'GET',
                    apiHeaders,
                    undefined,
                    200
                  );
                  assert(
                    !listed.data.records.some((user: { id: string }) => user.id === ids.secondary),
                    'Retain the existing validated includeDisabled boolean/string mismatch'
                  );
                  const found = await call(
                    '/api/users/get?searchBy=username&query=secondary',
                    'GET',
                    apiHeaders,
                    undefined,
                    200
                  );
                  assert.equal(found.data.effectiveLoginDisabled, true);
                  await call('/api/users/' + ids.primary + '/enable', 'POST', apiHeaders, {}, 200);
                  assert.equal(
                    (await f.client
                      .db()
                      .collection('user')
                      .findOne({ _id: new ObjectId(ids.secondary) }))!.token,
                    ''
                  );
                }
              }
            }
            let resetConfig = false;
            for (const test of prepared.filter(c => c.reduced === reduced)) {
              const { route, scenario: s, key } = test;
              for (const [name, rows] of baseline) {
                await f.client.db().collection(name).deleteMany({});
                if (rows.length) await f.client.db().collection(name).insertMany(rows);
              }
              for (const name of ['useraudit', 'securityevent', 'siemdeliveryattempt'])
                await f.client.db().collection(name).deleteMany({});
              if (resetConfig) await f.data.reference.appConfigs.get().bootstrap();
              if (['linked-disabled-actor', 'disabled-browser-actor', 'linked-disabled-browser-actor'].includes(s.name))
                await f.client
                  .db()
                  .collection('user')
                  .updateOne({ _id: new ObjectId(ids.admin) }, { $set: { loginDisabled: true } });
              if (s.stale)
                assert.equal(
                  (
                    await f.client
                      .db()
                      .collection('user')
                      .deleteOne({ _id: new ObjectId(ids.admin) })
                  ).deletedCount,
                  1
                );
              const browser = !route.path.includes('/api/');
              const useCookie = s.cookie ?? browser;
              const auth = s.auth === undefined ? (browser ? false : 'pilot-api-token') : s.auth;
              const method = s.method ?? route.method.toUpperCase();
              const t = target(route, s);
              const credential = s.login ? logins[s.login] : login;
              const headers: Record<string, string> = {
                'Content-Type': 'application/json',
                Origin: s.origin ?? referenceOrigin,
              };
              if (s.name === 'AJAX-with-CSRF') headers['X-Requested-With'] = 'XMLHttpRequest';
              if (useCookie) headers.Cookie = credential.cookie;
              if (s.csrf ?? browser) headers['X-CSRF-Token'] = credential.token;
              if (auth) headers.Authorization = 'Bearer ' + auth;
              if (s.version) headers['X-ReDBox-API-Version'] = s.version;
              if (s.name.startsWith('conditional')) headers['If-None-Match'] = '*';
              if (s.body === 'empty') headers['Content-Length'] = '0';
              if (s.body === 'absent') delete headers['Content-Type'];
              const body =
                method === 'GET' || method === 'HEAD'
                  ? ''
                  : s.body === 'empty' || s.body === 'absent'
                    ? ''
                    : s.body === 'object'
                      ? '{}'
                      : s.body === 'parser'
                        ? '{'
                        : JSON.stringify(
                            s.body === 'array'
                              ? []
                              : s.body === 'invalid'
                                ? {}
                                : payload(route, t.id, endpoint, s.brand === 'other')
                          );
              const fault = faults(f, route, s);
              const cache =
                mode === 'fastify' && route.action === 'refreshCachedResources'
                  ? (f.portal as Awaited<ReturnType<typeof createPortalFastifyApplication>>).installation.assetCache
                  : undefined;
              if (cache) {
                cache.cssResponseCache.set('fixture', { css: 'body{}', etag: 'fixture', createdAt: 0 });
                cache.fontResponseCache.set('fixture', Buffer.from('font'));
                cache.fontResponseCacheBytes = 4;
              }
              let response;
              const deniesWithoutWrite =
                (method === 'POST' &&
                  route.path.endsWith('/api/users') &&
                  ['foreign-target', 'shared-target'].includes(s.name)) ||
                (method === 'POST' && route.path.endsWith('/api/users/:id/disable') && s.name === 'bad-target');
              const observer = deniesWithoutWrite ? await observeNoSideEffects(f) : undefined;
              try {
                response = await authorizationWitness(`${identitySuiteTitle} ${key}`, () =>
                  wire(f.url + t.path, method, headers, body)
                );
                if (observer) prohibitedEffects.set(key, await observer.differences());
              } catch (error) {
                if (s.control) response = { status: 0, headers: {}, text: '', aborted: true };
                else throw new Error(key + ': ' + error);
              } finally {
                observer?.restore();
                fault.restore();
              }
              if (cache) {
                // Invalidation precedes the required audit, so its failure keeps
                // the committed cache change just as the retained action does.
                const size = response.status < 400 || s.fault === 'audit' ? 0 : 1;
                assert.equal(cache.cssResponseCache.size, size, key + ': installed CSS cache');
                assert.equal(cache.fontResponseCache.size, size, key + ': installed font cache');
                assert.equal(cache.fontResponseCacheBytes, size * 4, key + ': installed cache bytes');
              }
              resetConfig = ['saveConfig', 'setAppConfig'].includes(route.action) && response.status < 300;
              await settleEvents(f);
              if (['API-bearer-only', 'linked-actor'].includes(s.name)) {
                const principals = (rows: Document[]) =>
                  rows.map(row => JSON.parse(row.session).passport?.user ?? null).sort();
                assert.deepEqual(
                  principals(await f.client.db().collection('referenceSessions').find({}).toArray()),
                  principals(baseline.get('referenceSessions')!),
                  'Bearer authentication must not create or replace browser login sessions'
                );
              }
              const value = {
                ...(await normalize(
                  f,
                  response,
                  endpoint,
                  ['generateAPIToken', 'generateUserKey'].includes(route.action)
                )),
                encodings: fault.encodings(),
              };
              const values = observations.get(key) ?? [];
              values[modes.indexOf(mode)] = value;
              observations.set(key, values);
            }
          } finally {
            await f.close();
          }
          if (process.env.FM025_HTTP_REPORT)
            process.stdout.write(`FM-025 completed ${reduced ? 'reduced' : 'default'} ${mode}\n`);
        }
    } finally {
      await new Promise<void>((resolve, reject) => collector.close(error => (error ? reject(error) : resolve())));
      if (process.env.FM025_HTTP_REPORT)
        await writeFile(
          process.env.FM025_HTTP_REPORT,
          JSON.stringify(
            {
              observations: Object.fromEntries(observations),
              flows: Object.fromEntries(flows),
            },
            null,
            2
          )
        );
    }
  });
  for (const { key, route, scenario: s, reduced } of cases)
    it(key, () => {
      const effects = prohibitedEffects.get(key);
      if (effects) assertNoObservedEffects(effects);
      const values = observations.get(key)!;
      assert.equal(values.length, 1);
      assertProductionContract('identity', key, values[0]);
      const expected = values[0] as {
        wire: Wire;
        state: Record<string, unknown[]>;
      };
      const browser = !route.path.includes('/api/');
      if (reduced && s.stale)
        assert.equal(expected.wire.status, 401, 'Missing actor guard must precede declared validation');
      if (!reduced && ['API-bearer-only', 'linked-actor'].includes(s.name) && browser)
        assert.equal(
          expected.wire.status,
          route.method === 'get' ? 200 : 403,
          'Browser writes retain CSRF requirements even for a valid bearer'
        );
      if (!reduced && ['browser-session', 'AJAX-with-CSRF'].includes(s.name))
        assert.equal(
          expected.wire.status,
          ['createUser', 'updateUser'].includes(route.action) ? 201 : 200,
          'Session authentication retains the route CSRF requirements'
        );
      if (!reduced && s.name === 'distinct-browser-and-API-actors')
        assert.equal(expected.wire.status, 403, 'Explicit bearer identity must not inherit browser-session roles');
      if (!reduced && s.name === 'v1' && ['listSystemRoles', 'getBrandRoles'].includes(route.action)) {
        const roles = JSON.parse(expected.wire.text);
        assert.equal(
          (browser ? roles : roles.records).some((role: { name: string }) => role.name === 'Researcher'),
          !browser,
          'Configured hidden roles apply to the browser response'
        );
      }
      if (!reduced && s.name === 'unfiltered-users' && ['listUsers', 'getUsers'].includes(route.action)) {
        const users = JSON.parse(expected.wire.text);
        assert.equal(
          (browser ? users : users.records).some((user: { username: string }) => user.username === 'secondary'),
          !browser,
          'Configured hidden users apply to the browser response'
        );
      }
      if (
        !reduced &&
        ['v1', 'other-brand-success', 'linked-browser-actor'].includes(s.name) &&
        !(s.name === 'linked-browser-actor' && route.path.includes('/api/'))
      ) {
        assert.equal(
          expected.wire.status,
          ['createUser', 'updateUser'].includes(route.action) ? 201 : 200,
          'The success control must succeed'
        );
        const writes = route.method !== 'get' || route.action === 'refreshCachedResources';
        if (writes) {
          assert(expected.state.useraudit.length > 0, 'Success must persist an audit');
          assert(expected.state.securityevent.length > 0, 'Success must persist a security event');
        }
        if (route.action === 'linkAccounts') {
          const value = JSON.parse(expected.wire.text);
          assert.equal(
            (value.data ?? value).impact.recordsRewritten,
            s.brand === 'other' ? 0 : 1,
            'Account linking rewrites the persisted record ACL'
          );
          if (s.brand !== 'other')
            assert(expected.state.recordaudit.length > 0, 'The ACL rewrite must persist record audit history');
        }
      }
      for (const value of values as {
        state: Record<string, unknown[]>;
      }[]) {
        const events = JSON.stringify([value.state.useraudit, value.state.securityevent]);
        for (const secret of ['synthetic-password', 'synthetic-siem-secret', 'private-backend-password-token-marker'])
          assert(!events.includes(secret), 'Audit/security events must redact ' + secret);
      }
      if (s.fault === 'once' || s.fault === 'serialization')
        for (const value of values as {
          encodings: number;
        }[])
          assert.equal(value.encodings, 1, key + ': serialize once inside the shared guard');
      assert(!JSON.stringify(values[0]).includes('private-backend-password-token-marker'));
    });
  for (const flow of process.env.FM027_BODY_SWEEP ? [] : flowNames)
    it(flow, () => {
      const values = flows.get(flow)!;
      assert.equal(values.length, 1);
      if (flow === 'linked disabled-account lifecycle') {
        const effects = aliasDisableEffects.get(flow);
        assert(effects);
        assertNoObservedEffects(effects, 'Refusing a linked alias leaves no side effects');
        const steps = values[0] as { wire: { status: number } }[];
        assert.equal(steps[3].wire.status, 400);
      }
      assertProductionContract('identity-flow', flow, values[0]);
    });
});

goldenControls('identity');
goldenControls('identity-flow');
