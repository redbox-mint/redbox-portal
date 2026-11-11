import assert from 'node:assert/strict';
import { request } from 'node:http';
import { writeFile } from 'node:fs/promises';
import sinon from 'sinon';
import { of, throwError } from 'rxjs';
import { referenceReadDeclarations } from '../../../src/http/referenceRoutes';
import { coreRouteName } from '../../../src/http/fastify/routes';
import { referenceProductionFixture, referenceOrigin } from './referenceProductionFixture';
import { retainedReferenceExpress } from './retainedReferenceExpress';
import { getConfigurationRepositories } from '../../../src/persistence/configuration/runtime';
import { Services as Dashboard } from '../../../src/dashboards/DashboardConfig';

type Fixture = Awaited<ReturnType<typeof referenceProductionFixture>>;
type Route = (typeof referenceReadDeclarations)[number];
type Wire = { status: number; headers: Record<string, unknown>; text: string };
type Scenario = {
  name: string;
  method?: string;
  query?: string;
  headers?: Record<string, string>;
  variant?:
    | 'missing'
    | 'brand'
    | 'portal'
    | 'unknown-brand'
    | 'fault'
    | 'dashboard-error'
    | 'foreign-record'
    | 'case-trailing'
    | 'serialize-once'
    | 'serialize-failure'
    | 'override'
    | 'uri-error'
    | 'parse-error'
    | 'size-error'
    | 'parameter-error';
  auth?: string | false;
  cookie?: boolean;
  raw?: string;
  /** Exact benign-version control for the inherited Express coercion-abort exception. */
  safeControl?: string;
};
const scenarios: Scenario[] = [
  { name: 'v1' },
  { name: 'v2', headers: { 'X-ReDBox-API-Version': '2.0' } },
  { name: 'query-v2', query: 'apiVersion=2.0' },
  { name: 'version-conflict', query: 'apiVersion=1.0', headers: { 'X-ReDBox-API-Version': '2.0' } },
  { name: 'HEAD-v2', method: 'HEAD', headers: { 'X-ReDBox-API-Version': '2.0' } },
  { name: 'anonymous', auth: false },
  { name: 'invalid-bearer', auth: 'invalid' },
  { name: 'reader', auth: 'reader-token' },
  { name: 'foreign-role', auth: 'foreign-token' },
  { name: 'foreign-brand', variant: 'brand' },
  { name: 'unknown-brand', variant: 'unknown-brand' },
  { name: 'unknown-portal', variant: 'portal' },
  {
    name: 'brand-validation-precedence',
    variant: 'unknown-brand',
    query: 'name[nested]=bad&locale[nested]=bad&edit[nested]=bad',
  },
  {
    name: 'portal-validation-precedence',
    variant: 'portal',
    query: 'name[nested]=bad&locale[nested]=bad&edit[nested]=bad',
  },
  { name: 'session-no-csrf', cookie: true, auth: false },
  { name: 'session-invalid-bearer', cookie: true, auth: 'invalid' },
  { name: 'foreign-origin-read', cookie: true, auth: false, headers: { Origin: 'https://foreign.invalid' } },
  { name: 'missing', variant: 'missing', headers: { 'X-ReDBox-API-Version': '2.0' } },
  {
    name: 'nested',
    query:
      'name[nested]=bad&locale[nested]=bad&edit[nested]=true&editable[nested]=false&formName[nested]=bad&targetStep[nested]=bad&keyPrefix[nested]=bad',
    headers: { 'X-ReDBox-API-Version': '2.0' },
  },
  {
    name: 'duplicate',
    query: 'name=a&name=b&locale=a&locale=b&edit=a&edit=b',
    headers: { 'X-ReDBox-API-Version': '2.0' },
  },
  { name: 'anonymous-invalid', auth: false, query: 'name[nested]=bad&locale[nested]=bad&edit[nested]=bad' },
  { name: 'reader-invalid', auth: 'reader-token', query: 'name[nested]=bad&locale[nested]=bad&edit[nested]=bad' },
  { name: 'malformed-json-before-auth', auth: false, raw: '{', headers: { 'Content-Type': 'application/json' } },
  { name: 'record-context', query: 'oid=reference-record&edit=true&editable=false&targetStep=draft' },
  { name: 'foreign-record-context', variant: 'foreign-record', query: 'oid=foreign-record&edit=true' },
  { name: 'case-and-trailing-slash', variant: 'case-trailing' },
  { name: 'domain-dashboard-error-v1', variant: 'dashboard-error' },
  { name: 'domain-dashboard-error-v2', variant: 'dashboard-error', headers: { 'X-ReDBox-API-Version': '2.0' } },
  { name: 'domain-uri-error-v1', variant: 'uri-error' },
  { name: 'domain-uri-error-v2', variant: 'uri-error', headers: { 'X-ReDBox-API-Version': '2.0' } },
  { name: 'domain-parse-error', variant: 'parse-error', headers: { 'X-ReDBox-API-Version': '2.0' } },
  { name: 'domain-size-error', variant: 'size-error', headers: { 'X-ReDBox-API-Version': '2.0' } },
  { name: 'domain-parameter-error', variant: 'parameter-error', headers: { 'X-ReDBox-API-Version': '2.0' } },
  { name: 'domain-failure-v1', variant: 'fault' },
  { name: 'domain-failure-v2', variant: 'fault', headers: { 'X-ReDBox-API-Version': '2.0' } },
];
// All routes receive the same conditional matrix, including retired/error controls.
// '*' matches an existing success; explicit tags miss the selected representations.
// No reference action emits Last-Modified: both dates must retain the full response.
const conditionalScenarios: Scenario[] = ['GET', 'HEAD'].flatMap(method =>
  [undefined, '2.0'].flatMap(version =>
    [
      ['etag-match', 'If-None-Match', '*'],
      ['etag-mismatch', 'If-None-Match', '"fm023-mismatch"'],
      ['modified-since-future', 'If-Modified-Since', 'Wed, 01 Jan 2100 00:00:00 GMT'],
      ['modified-since-past', 'If-Modified-Since', 'Sat, 01 Jan 2000 00:00:00 GMT'],
    ].map(([name, header, value]) => ({
      name: `conditional-${method}-${version ?? '1.0'}-${name}`,
      method,
      headers: { [header]: value, ...(version ? { 'X-ReDBox-API-Version': version } : {}) },
    }))
  )
);
const versionShapes = [
  ['structured', 'apiVersion[nested]=2.0'],
  ['string-array', 'apiVersion[]=2.0'],
  ['duplicate-array', 'apiVersion[]=2.0&apiVersion[]=1.0'],
  ['mixed-array', 'apiVersion[0]=2.0&apiVersion[1][toString]=constructor'],
  ['array-method', 'apiVersion[0]=2.0&apiVersion[toString]=constructor'],
  ['lowercase-alias', 'apiversion[toString]=constructor'],
  ...Object.getOwnPropertyNames(Object.prototype).map(name => [name, `apiVersion[${name}]=constructor`]),
];
const versionContexts: Scenario[] = [
  { name: 'success' },
  { name: 'missing', variant: 'missing' },
  { name: 'fault', variant: 'fault' },
];
const precedenceContexts: Scenario[] = [
  { name: 'validation', query: 'name[nested]=bad&locale[nested]=bad&edit[nested]=bad' },
  { name: 'auth', auth: false },
  { name: 'parser', raw: '{', auth: false, headers: { 'Content-Type': 'application/json' } },
  { name: 'brand', variant: 'unknown-brand' },
];
const versionScenarios: Scenario[] = [...versionContexts, ...precedenceContexts].flatMap(context =>
  [undefined, '2.0'].flatMap(version => {
    const control = `version-control-${context.name}-${version ?? '1.0'}`;
    const query = (value: string) => [context.query, value].filter(Boolean).join('&');
    const headers = { ...context.headers, ...(version ? { 'X-ReDBox-API-Version': version } : {}) };
    return [
      { ...context, name: control, query: query('apiVersion=invalid'), headers },
      ...(versionContexts.includes(context) ? versionShapes : [['toString', 'apiVersion[toString]=constructor']]).map(
        ([name, value]) => ({
          ...context,
          name: `version-${context.name}-${version ?? '1.0'}-${name}`,
          query: query(value),
          headers,
          safeControl: control,
        })
      ),
    ];
  })
);
const modes = ['retained', 'express', 'fastify'] as const;
const serializationCalls = new Map<string, number[]>();
const snapshots = new Map<string, (Wire | undefined)[]>();
const failures = new Map<string, string>();
function wire(url: string, method: string, headers: Record<string, string>, body = ''): Promise<Wire> {
  return new Promise((resolve, reject) => {
    const req = request(
      url,
      { method, headers: { ...headers, ...(body ? { 'Content-Length': String(Buffer.byteLength(body)) } : {}) } },
      res => {
        const chunks: Buffer[] = [];
        res.on('data', c => chunks.push(c));
        res.on('error', reject);
        res.on('end', () =>
          resolve({ status: res.statusCode!, headers: res.headers, text: Buffer.concat(chunks).toString() })
        );
      }
    );
    req.setTimeout(15000, () => req.destroy(new Error('HTTP timeout')));
    req.on('error', reject);
    req.end(body);
  });
}
const key = (route: Route, scenario: Scenario) => coreRouteName(route.method, route.path) + ':' + scenario.name;
function scenariosFor(route: Route): Scenario[] {
  return [
    ...(route.action === 'getAppConfig'
      ? [{ name: 'stored-override', variant: 'override' as const, headers: { 'X-ReDBox-API-Version': '2.0' } }]
      : []),
    ...scenarios,
    ...conditionalScenarios,
    ...versionScenarios,
    ...(['getAppConfig', 'getLanguages', 'getEntry', 'getBundle'].includes(route.action)
      ? [
          { name: 'serialization-once', variant: 'serialize-once' as const },
          {
            name: 'conditional-serialization-once',
            variant: 'serialize-once' as const,
            headers: { 'If-None-Match': '*' },
          },
          {
            name: 'conditional-serialization-failure',
            variant: 'serialize-failure' as const,
            headers: { 'If-None-Match': '*' },
          },
          {
            name: 'serialization-once-v2',
            variant: 'serialize-once' as const,
            headers: { 'X-ReDBox-API-Version': '2.0' },
          },
          { name: 'serialization-safe-failure-v1', variant: 'serialize-failure' as const },
          {
            name: 'serialization-safe-failure',
            variant: 'serialize-failure' as const,
            headers: { 'X-ReDBox-API-Version': '2.0' },
          },
        ]
      : []),
  ];
}
function target(route: Route, scenario: Scenario) {
  const missing = scenario.variant === 'missing';
  const params: Record<string, string> = {
    branding: scenario.variant === 'brand' ? 'other' : scenario.variant === 'unknown-brand' ? 'missing' : 'default',
    portal: scenario.variant === 'portal' ? 'missing' : 'rdmp',
    recordType: missing ? 'missing' : 'dataRecord',
    name: missing ? 'missing' : 'dataRecord',
    dashboardType: missing ? 'missing' : 'dataRecord',
    dashboardView: missing ? 'missing' : 'referenceView',
    view: missing ? 'missing' : 'referenceView',
    viewName: missing ? 'missing' : 'referenceView',
    step: missing ? 'missing' : 'draft',
    stepName: 'draft',
    stage: missing ? 'missing' : 'draft',
    workflowStage: 'draft',
    locale: missing ? 'zz' : 'en',
    lng: missing ? 'zz' : 'en',
    namespace: missing ? 'missing' : 'translation',
    ns: missing ? 'missing' : 'translation',
    key: missing ? 'missing' : 'greeting',
    appConfigId: missing ? 'missing' : 'systemMessage',
    oid: missing ? 'missing' : scenario.variant === 'foreign-record' ? 'foreign-record' : 'reference-record',
  };
  const template =
    scenario.variant === 'case-trailing'
      ? route.path
          .split('/')
          .map(segment => (segment.startsWith(':') ? segment : segment.toUpperCase()))
          .join('/') + '/'
      : route.path;
  let path = template
    .replace(/:([A-Za-z]+)/g, (_, n) => params[n] ?? n)
    .replace('*key', params.key)
    .replace('greeting*', 'greeting')
    .replace('missing*', 'missing');
  const query = new URLSearchParams();
  if (
    route.action === 'getRecordType' ||
    (route.controller === 'webservice/FormManagementController' && route.action === 'getForm')
  )
    query.set('name', missing ? 'missing' : 'dataRecord');
  if (route.action === 'listEntries') query.set('locale', 'en');
  if (scenario.query) {
    for (const name of new URLSearchParams(scenario.query).keys()) query.delete(name);
  }
  return path + '?' + query + (scenario.query ? '&' + scenario.query : '');
}
function replaceMethod(domain: object, method: string) {
  const descriptor = Object.getOwnPropertyDescriptor(domain, method);
  const stub = sinon.stub();
  Object.defineProperty(domain, method, { configurable: true, writable: true, value: stub });
  return {
    stub,
    restore: () => {
      if (descriptor) Object.defineProperty(domain, method, descriptor);
      else Reflect.deleteProperty(domain, method);
    },
  };
}
function fault(f: Fixture, route: Route, kind: Scenario['variant']) {
  const ref = f.data.reference;
  const action = route.action;
  const item: [object, string, boolean] | undefined = ['getRecordType', 'getType', 'getWorkflowSteps'].includes(action)
    ? [ref.types.get(), 'get', true]
    : ['listRecordTypes', 'getAllTypes'].includes(action)
      ? [ref.types.get(), 'getAll', true]
      : action === 'getAllDashboardTypes'
        ? [ref.dashboards.get(), 'getAll', true]
        : action === 'getDashboardType'
          ? [ref.dashboards.get(), 'get', true]
          : ['getDashboardView', 'getDashboardViewSettings'].includes(action)
            ? [ref.dashboards.get(), 'getDashboardView', false]
            : action === 'getDashboardWorkflowSettings'
              ? [ref.dashboardConfig.get(), 'getRuntimeSettings', false]
              : ['get', 'getOne'].includes(action)
                ? [ref.workspaceTypes.get(), action, true]
                : action === 'getAppConfig'
                  ? [ref.appConfigs.get(), 'getAppConfigByBrandAndKey', false]
                  : action === 'getAppConfigForm'
                    ? [ref.appConfigs.get(), 'getAppConfigForm', false]
                    : [
                          'getLanguages',
                          'getNamespace',
                          'listEntriesApp',
                          'getBundleApp',
                          'listEntries',
                          'getEntry',
                          'getBundle',
                        ].includes(action)
                      ? [
                          ref.entries.get(),
                          (
                            {
                              getLanguages: 'listLanguages',
                              listEntriesApp: 'listEntries',
                              getBundleApp: 'getBundle',
                            } as Record<string, string>
                          )[action] ?? action,
                          false,
                        ]
                      : action === 'listForms'
                        ? [ref.forms.get(), 'listForms', true]
                        : action === 'getForm'
                          ? [ref.forms.get(), 'getFormByName', true]
                          : action === 'listTargets'
                            ? [ref.dashboardConfig.get(), 'getTargetCatalogue', false]
                            : ['getWorkflowTarget', 'getViewTarget'].includes(action)
                              ? [ref.dashboardConfig.get(), 'getTargetSettings', false]
                              : ['getWorkflowFields', 'getViewFields'].includes(action)
                                ? [ref.dashboardConfig.get(), 'getFieldCatalogue', false]
                                : action === 'migrationPreflight'
                                  ? [ref.dashboardConfig.get(), 'preflightLegacyMigration', false]
                                  : undefined;
  if (!item) return () => {};
  const [domain, method, observable] = item;
  const error =
    kind === 'dashboard-error'
      ? new Dashboard.DashboardConfigError('target-not-found', 'Selected target unavailable', { target: 'fixture' })
      : kind === 'uri-error'
        ? new URIError('secret URI diagnostic')
        : Object.assign(new Error('secret datastore diagnostic'), {
            type: new Map([
              ['parse-error', 'entity.parse.failed'],
              ['size-error', 'entity.too.large'],
              ['parameter-error', 'parameters.too.many'],
            ]).get(kind ?? 'fault'),
          });
  const { stub, restore } = replaceMethod(domain, method);
  if (observable) stub.returns(throwError(() => error));
  else
    stub.callsFake(() => {
      throw error;
    });
  return restore;
}
const identityMaps = new WeakMap<Fixture, [string, string][]>();
async function normalized(f: Fixture, response: Wire): Promise<Wire> {
  const headers = { ...response.headers };
  for (const name of ['date', 'connection', 'keep-alive', 'x-request-id']) delete headers[name];
  if (headers['set-cookie'])
    headers['set-cookie'] = (headers['set-cookie'] as string[]).map(cookie =>
      cookie.replace(/^([^=]+)=[^;]*/, '$1=<session>').replace(/Expires=[^;]+/i, 'Expires=<time>')
    );
  let text = response.text;
  // Persisted identities and bootstrap timestamps vary across independent DBs.
  text = text.replace(/"(createdAt|updatedAt|lastSaveDate)":"[^"]*"/g, '"$1":"<time>"');
  let identities = identityMaps.get(f);
  if (!identities) {
    identities = [];
    for (const { name } of await f.client.db().listCollections().toArray()) {
      if (/session|audit|agenda|job/i.test(name)) continue;
      for (const row of await f.client.db().collection(name).find({}).toArray()) {
        const id = String(row._id);
        if (/^[a-f0-9]{24}$/.test(id))
          identities.push([id, name + ':' + String(row.name ?? row.key ?? row.username ?? 'row')]);
      }
    }
    identityMaps.set(f, identities);
  }
  for (const [id, label] of identities) text = text.replaceAll(id, label);
  // Length still compares the original payload bytes, IDs and timestamps have
  // equal-width encodings across the independent databases.
  return { status: response.status, headers, text };
}
async function session(f: Fixture) {
  let token = await wire(f.url + '/csrfToken', 'GET', {});
  const cookie = String((token.headers['set-cookie'] as string[])[0]).split(';')[0];
  const csrf = JSON.parse(token.text)._csrf;
  const login = await wire(
    f.url + '/user/login_local',
    'POST',
    { Cookie: cookie, Origin: referenceOrigin, 'Content-Type': 'application/x-www-form-urlencoded' },
    new URLSearchParams({ username: 'pilot-admin', password: 'pilot-password', _csrf: csrf }).toString()
  );
  assert.equal(login.status, 302, login.text);
  return String((login.headers['set-cookie'] as string[])[0]).split(';')[0];
}

describe('FM-023 production reference reads, retained Express / shared Express / Fastify raw HTTP', function () {
  this.timeout(900000);
  before(async () => {
    const retained = await retainedReferenceExpress();
    try {
      for (const mode of modes) {
        const f = await referenceProductionFixture(
          mode === 'fastify',
          undefined,
          mode === 'retained' ? retained.install : undefined
        );
        try {
          const cookie = await session(f);
          if (mode === 'fastify') {
            const installation = (
              f.portal as Awaited<
                ReturnType<typeof import('../../../src/application/portal').createPortalFastifyApplication>
              >
            ).installation;
            for (const route of referenceReadDeclarations) {
              const bindings = installation.routePlan.routes.filter(
                item => item.declaration.name === coreRouteName(route.method, route.path)
              );
              assert.equal(bindings.length, 1);
              assert.equal(bindings[0].declaration.controller, route.controller);
              assert.equal(bindings[0].declaration.action, route.action);
            }
          }
          for (const route of referenceReadDeclarations)
            for (const scenario of scenariosFor(route)) {
              const configurations = getConfigurationRepositories(f.owner).appConfigs;
              if (scenario.variant === 'override')
                await configurations.createConfiguration({
                  branding: f.brand.id,
                  configKey: 'systemMessage',
                  configData: { title: 'Persisted override', content: 'Reference read' },
                });
              let serializations = 0;
              let restore = [
                'fault',
                'dashboard-error',
                'uri-error',
                'parse-error',
                'size-error',
                'parameter-error',
              ].includes(scenario.variant ?? '')
                ? fault(f, route, scenario.variant)
                : () => {};
              if (scenario.variant?.startsWith('serialize-')) {
                const domain =
                  route.action === 'getAppConfig' ? f.data.reference.appConfigs.get() : f.data.reference.entries.get();
                const method =
                  route.action === 'getAppConfig'
                    ? 'getAppConfigByBrandAndKey'
                    : route.action === 'getLanguages'
                      ? 'listLanguages'
                      : route.action;
                const replacement = replaceMethod(domain, method);
                replacement.stub.returns({
                  toJSON() {
                    serializations++;
                    if (scenario.variant === 'serialize-failure') throw new Error('secret serializer diagnostic');
                    return { serialized: 'once', extraField: true };
                  },
                });
                restore = replacement.restore;
              }
              try {
                const headers = {
                  ...(scenario.auth !== false
                    ? { Authorization: 'Bearer ' + (scenario.auth ?? 'pilot-api-token') }
                    : {}),
                  ...(scenario.cookie ? { Cookie: cookie } : {}),
                  ...scenario.headers,
                };
                const value = await normalized(
                  f,
                  await wire(f.url + target(route, scenario), scenario.method ?? 'GET', headers, scenario.raw)
                );
                const id = key(route, scenario);
                if (scenario.variant?.startsWith('serialize-'))
                  serializationCalls.set(id, [...(serializationCalls.get(id) ?? []), serializations]);
                const values = snapshots.get(id) ?? [];
                values[modes.indexOf(mode)] = value;
                snapshots.set(id, values);
              } catch (error) {
                failures.set(mode + ':' + key(route, scenario), String(error));
              } finally {
                restore();
                if (scenario.variant === 'override')
                  await configurations.removeForBrandAndKey(f.brand.id, 'systemMessage');
              }
            }
        } finally {
          await f.close();
        }
      }
    } finally {
      await retained.close();
    }
  });
  after(async () => {
    if (process.env.FM023_HTTP_REPORT)
      await writeFile(
        process.env.FM023_HTTP_REPORT,
        JSON.stringify(
          {
            modes,
            snapshots: Object.fromEntries(snapshots),
            failures: Object.fromEntries(failures),
            serializationCalls: Object.fromEntries(serializationCalls),
          },
          null,
          2
        )
      );
  });
  for (const route of referenceReadDeclarations)
    for (const scenario of scenariosFor(route))
      it(`${route.controller}.${route.action} ${route.path} ${scenario.name}`, () => {
        const values = snapshots.get(key(route, scenario));
        assert(values?.[2], JSON.stringify(modes.map(mode => [mode, failures.get(mode + ':' + key(route, scenario))])));
        if (!values[0]) {
          // ACCEPTED-NESTED-INPUT-SAFE-RESPONSE: retain the raw abort, then require
          // the entire intended safe response from an otherwise identical request.
          assert(scenario.safeControl && scenario.query?.includes('[toString]'));
          assert.match(failures.get('retained:' + key(route, scenario)) ?? '', /ECONNRESET|socket hang up|aborted/);
          const control = snapshots.get(key(route, { name: scenario.safeControl }));
          assert(control?.[0] && control[1] && control[2]);
          assert.deepEqual(control[1], control[0]);
          assert.deepEqual(control[2], control[0]);
          if (values[1])
            assert.deepEqual(values[1], control[0], 'shared Express must preserve the intended safe response');
          else {
            // The preceding Express parser still aborts before any extracted action.
            assert.equal(scenario.raw, '{');
            assert.match(failures.get('express:' + key(route, scenario)) ?? '', /ECONNRESET|socket hang up|aborted/);
          }
          assert.deepEqual(values[2], control[0], 'Fastify must preserve the intended safe response');
        } else {
          assert(values[1]);
          assert.deepEqual(values[1], values[0], 'shared Express differs from retained production');
          assert.deepEqual(values[2], values[0], 'Fastify differs from retained production');
        }
        if (scenario.name.startsWith('conditional-GET-') || scenario.name.startsWith('conditional-HEAD-')) {
          const success = route.action !== 'retiredOperation';
          assert.equal(values[2].status, success && scenario.name.endsWith('etag-match') ? 304 : success ? 200 : 410);
          if (values[2].status === 304) {
            assert.equal(values[2].text, '');
            for (const header of ['content-type', 'content-length', 'transfer-encoding'])
              assert.equal(values[2].headers[header], undefined);
          }
          if (scenario.method === 'HEAD') assert.equal(values[2].text, '');
        }
        if (scenario.safeControl) assert(!/Cannot convert|TypeError|secret|stack/.test(values[2].text));
        if (scenario.name === 'v1')
          assert.equal(values[2].status, route.action === 'retiredOperation' ? 410 : 200, values[2].text);
        if (scenario.name.startsWith('domain-failure')) assert(!values[2].text.includes('secret datastore diagnostic'));
        if (scenario.variant?.startsWith('serialize-'))
          assert.deepEqual(serializationCalls.get(key(route, scenario)), [1, 1, 1]);
        if (scenario.variant === 'serialize-failure') {
          assert.equal(values[2].status, 500);
          assert(!values[2].text.includes('secret serializer diagnostic'));
        }
        if (scenario.variant === 'override') {
          assert.equal(values[2].headers['x-redbox-config-source'], 'override');
          assert(values[2].text.includes('Persisted override'));
        }
        if (scenario.name === 'malformed-json-before-auth') assert.equal(values[2].status, 400);
      });
});
