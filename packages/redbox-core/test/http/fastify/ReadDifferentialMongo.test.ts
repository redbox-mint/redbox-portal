import assert from 'node:assert/strict';
import { request } from 'node:http';
import { writeFile } from 'node:fs/promises';
import { Readable } from 'node:stream';
import { ObjectId } from 'mongodb';
import { stringify } from 'qs';
import { of, throwError } from 'rxjs';
import { recordQueryReadDeclarations, queryReadRoutes } from '../../../src/http/readRoutes';
import { portalHttpPolicies } from '../../../src/application/portal/httpPolicies';
import { persistenceStatus } from '../../../src/persistence/runtime';
import { referenceProductionFixture, referenceOrigin } from './referenceProductionFixture';
import { retainedReadExpress } from './retainedReadExpress';
import { getReferenceRepositories } from '../../../src/persistence/reference/runtime';
import { getHarvestRepositories } from '../../../src/persistence/harvest/runtime';
import { getSiemRepository } from '../../../src/persistence/siem/runtime';
import { BrandingModel } from '../../../src/model/storage/BrandingModel';
import { SiemReads } from '../../../src/queries/SiemReads';
import { AuditReadError } from '../../../src/queries/RecordAuditViews';
import { coreRouteName } from '../../../src/http/fastify/routes';
import { seedReadSearch } from '../seedReadSearch';
import {
  namedQueryDefaultDefinitions,
  namedQueryConversionCases,
  namedQueryLiteralCases,
  namedQueryDefaultInputs,
  defaultReport,
  defaultQueryTitle,
} from '../../helpers/namedQueryDefaults';

type Fixture = Awaited<ReturnType<typeof referenceProductionFixture>>;
type Route = (typeof recordQueryReadDeclarations)[number];
type Wire = { status: number; headers: Record<string, unknown>; text: string; aborted?: boolean };
type Scenario = {
  name: string;
  method?: string;
  headers?: Record<string, string>;
  query?: string;
  auth?: string | false;
  cookie?: boolean;
  csrf?: boolean;
  raw?: string;
  variant?:
    | 'missing'
    | 'private'
    | 'foreign-record'
    | 'foreign-brand'
    | 'unknown-brand'
    | 'portal'
    | 'case'
    | 'fault'
    | 'odd'
    | 'serialize-once'
    | 'serialize-failure'
    | 'csv'
    | 'bad-format'
    | 'invalid-schema'
    | 'unavailable-schema'
    | 'stream-failure';
  defaults?: { configuration: string; input: string };
  conversion?: { titles: readonly string[]; outcome?: 'refused' | 'mongo-error' };
  control?: string;
  security?: { operator: boolean; records?: number; retainedStatus?: number; retainedRecords?: number };
  refusal?: 403 | 404;
};
const modes = ['retained', 'express', 'fastify'] as const;
const snapshots = new Map<string, (Wire | undefined)[]>(),
  failures = new Map<string, string>(),
  calls = new Map<string, number[]>();
const state = new Map<string, unknown[]>();
const scenarios: Scenario[] = [
  { name: 'v1' },
  { name: 'v2', headers: { 'X-ReDBox-API-Version': '2.0' } },
  { name: 'query-v2', query: 'apiVersion=2.0' },
  { name: 'version-conflict', query: 'apiVersion=1.0', headers: { 'X-ReDBox-API-Version': '2.0' } },
  { name: 'anonymous', auth: false },
  { name: 'invalid-bearer', auth: 'invalid' },
  { name: 'reader', auth: 'reader-token' },
  { name: 'foreign-role', auth: 'foreign-token' },
  { name: 'foreign-brand', variant: 'foreign-brand' },
  { name: 'unknown-brand', variant: 'unknown-brand' },
  { name: 'unknown-portal', variant: 'portal' },
  { name: 'private-object', variant: 'private' },
  { name: 'foreign-object', variant: 'foreign-record' },
  { name: 'missing', variant: 'missing' },
  { name: 'case-trailing', variant: 'case' },
  { name: 'nested-pagination', query: 'rows[bad]=2&start[bad]=0&page[bad]=1&limit[bad]=1&offset[bad]=0' },
  { name: 'duplicate-pagination', query: 'rows=1&rows=2&start=0&start=1&page=1&page=2' },
  { name: 'nested-scalars', query: 'name[bad]=x&queryName[bad]=x&searchStr[bad]=x&sort[bad]=x&operation[bad]=x' },
  { name: 'negative-pagination', query: 'rows=-1&start=-1&page=-1&offset=-1' },
  { name: 'row-bounds', query: 'rows=101&limit=501' },
  {
    name: 'page-sort',
    query: 'rows=1&start=1&page=2&pageSize=1&limit=1&offset=1&sort=metadata.title&secondarySort=redboxOid',
  },
  { name: 'reverse-sort', query: 'rows=2&start=0&sort=metadata.title%20DESC' },
  { name: 'structured-sort', query: 'sort[$where]=bad&secondarySort[bad]=x' },
  { name: 'malicious-filter', query: 'filterFields=$where&filter=return%20true' },
  { name: 'foreign-brand-filter', query: 'filterFields=metaMetadata.brandId&filter=000000000000000000000012' },
  { name: 'search-or-injection', query: 'searchStr=' + encodeURIComponent('test OR *:*') },
  { name: 'exact-facet-fields', query: 'exact_full_text=test&facet_workflow_stage=draft' },
  { name: 'structured-search', query: 'exact_full_text[bad]=x&facet_workflow_stage[]=draft' },
  { name: 'malicious-search-field', query: 'exact_bad:field=x' },
  { name: 'dates-invalid', query: 'dateFrom=nope&dateTo=nope&startDate=nope&before=nope' },
  { name: 'dates-reversed', query: 'dateFrom=2030-01-01&dateTo=2000-01-01&startDate=2030-01-01&endDate=2000-01-01' },
  { name: 'relationships', query: 'include=relationships&includeRelationships=true&relationshipDepth=0' },
  { name: 'structured-relationships', query: 'relationshipDepth[bad]=x&relationshipIds[]=private-record' },
  { name: 'anonymous-invalid', auth: false, query: 'rows[bad]=2&queryName[bad]=x&operation[bad]=x' },
  { name: 'brand-invalid', variant: 'unknown-brand', query: 'rows[bad]=2&operation[bad]=x' },
  { name: 'parser-before-auth', auth: false, raw: '{', headers: { 'Content-Type': 'application/json' } },
  { name: 'session-csrf', auth: false, cookie: true, csrf: true, headers: { Origin: referenceOrigin } },
  { name: 'session', auth: false, cookie: true },
  { name: 'session-invalid-bearer', auth: 'invalid', cookie: true },
  { name: 'foreign-origin-session', auth: false, cookie: true, headers: { Origin: 'https://foreign.invalid' } },
  { name: 'domain-failure', variant: 'fault' },
  { name: 'domain-failure-v2', variant: 'fault', headers: { 'X-ReDBox-API-Version': '2.0' } },
];
const conditionals: Scenario[] = ['GET', 'HEAD'].flatMap(method =>
  [undefined, '2.0'].flatMap(version =>
    [
      ['none-wildcard', 'If-None-Match', '*'],
      ['none-match', 'If-None-Match', '<etag>'],
      ['none-weak', 'If-None-Match', 'W/<etag>'],
      ['none-miss', 'If-None-Match', '"fm024-miss"'],
      ['none-list', 'If-None-Match', '"fm024-miss", <etag>'],
      ['none-invalid', 'If-None-Match', 'invalid'],
      ['match-exact', 'If-Match', '<etag>'],
      ['match-weak', 'If-Match', 'W/<etag>'],
      ['match-miss', 'If-Match', '"fm024-miss"'],
      ['match-wildcard', 'If-Match', '*'],
      ['match-invalid', 'If-Match', 'invalid'],
      ['modified-future', 'If-Modified-Since', 'Wed, 01 Jan 2100 00:00:00 GMT'],
      ['modified-past', 'If-Modified-Since', 'Sat, 01 Jan 2000 00:00:00 GMT'],
    ].map(([name, header, value]) => ({
      name: `conditional-${method}-${version ?? '1.0'}-${name}`,
      method,
      headers: { [header]: value, ...(version ? { 'X-ReDBox-API-Version': version } : {}) },
    }))
  )
);
conditionals.push(
  ...['GET', 'HEAD'].map(method => ({
    name: `conditional-${method}-no-cache`,
    method,
    headers: { 'If-None-Match': '*', 'Cache-Control': 'no-cache' },
  }))
);
const versions: Scenario[] = [undefined, '2.0'].flatMap(version => {
  const headers = version ? { 'X-ReDBox-API-Version': version } : undefined;
  return [
    { name: `safe-version-${version ?? '1.0'}`, query: 'apiVersion[unknown]=invalid', headers },
    { name: `safe-alias-${version ?? '1.0'}`, query: 'apiversion[unknown]=invalid', headers },
    ...[
      ['object', 'apiVersion[bad]=2.0'],
      ['array', 'apiVersion[]=2.0'],
      ['mixed', 'apiVersion[0]=2.0&apiVersion[1][toString]=bad'],
      ['alias', 'apiversion[toString]=bad'],
      ...Object.getOwnPropertyNames(Object.prototype).map(key => [key, `apiVersion[${key}]=bad`]),
    ].map(([name, query]) => ({
      name: `version-${version ?? '1.0'}-${name}`,
      query,
      headers,
      control: `${name === 'alias' ? 'safe-alias' : 'safe-version'}-${version ?? '1.0'}`,
    })),
  ];
});

/** Genuine anonymous and stale-principal requests through the production policy
 * chain, including CSRF-valid POSTs. Never replace authentication or dispatch. */
describe('FM-024 retained query actor-refusal differential', function () {
  this.timeout(300000);
  const profiles = ['default', 'reduced-report', 'reduced-query'] as const;
  const subjects = ['anonymous', 'missing-actor'] as const;
  const versions = ['1.0', '2.0'];
  const observations = new Map<string, Wire[]>();
  const id = (profile: string, route: Route, subject: string, version: string) =>
    `${profile} ${route.method} ${route.path} ${subject} v${version}`;
  before(async () => {
    const retained = await retainedReadExpress();
    try {
      for (const profile of profiles)
        for (const mode of modes) {
          const policyConfiguration = portalHttpPolicies();
          if (profile !== 'default')
            for (const controller of new Set(queryReadRoutes.map(route => route.controller)))
              if (profile === 'reduced-query' || controller === 'ReportController')
                policyConfiguration[controller] = ['noCache', 'brandingAndPortal'];
          const f = await referenceProductionFixture(
            mode === 'fastify', policyConfiguration, mode === 'retained' ? retained.install : undefined,
            { declarations: recordQueryReadDeclarations }
          );
          try {
            const cookie = await session(f);
            const csrf = JSON.parse((await wire(f.url + '/csrfToken', 'GET', { Cookie: cookie })).text)._csrf;
            // A previously authenticated session whose persisted actor no longer
            // exists exercises fresh identity resolution, rather than a fake context.
            assert.equal((await f.client.db().collection('user').deleteOne({ username: 'pilot-admin' })).deletedCount, 1);
            for (const route of queryReadRoutes)
              for (const subject of subjects)
                for (const version of versions) {
                  const method = route.method.toUpperCase();
                  const headers: Record<string, string> = {
                    'X-ReDBox-API-Version': version,
                    ...(subject === 'missing-actor' ? { Cookie: cookie, 'x-csrf-token': csrf, Origin: referenceOrigin } : {}),
                    ...(method === 'POST' ? { 'Content-Type': 'application/json' } : {}),
                  };
                  const body = method === 'POST' ? JSON.stringify({
                    name: 'preview', title: 'Preview', reportSource: 'database',
                    databaseQuery: { queryName: 'records' }, filter: [], columns: [],
                  }) : '';
                  const response = await normalized(f, await wire(
                    f.url + target(route, { name: subject }, '000000000000000000000099', 'a'.repeat(64)),
                    method, headers, body
                  ));
                  const key = id(profile, route, subject, version), values = observations.get(key) ?? [];
                  values[modes.indexOf(mode)] = response;
                  observations.set(key, values);
                }
          } finally {
            await f.close();
            assert.equal(persistenceStatus(f.owner).pools, 0);
          }
        }
    } finally { await retained.close(); }
    if (process.env.FM024_HTTP_REPORT)
      await writeFile(process.env.FM024_HTTP_REPORT + '.actors.json', JSON.stringify(Object.fromEntries(observations), null, 2));
  });
  for (const profile of profiles)
    for (const route of queryReadRoutes)
      for (const subject of subjects)
        for (const version of versions)
          it(id(profile, route, subject, version), () => {
            const values = observations.get(id(profile, route, subject, version));
            assert(values && values.length === 3);
            assert.deepEqual(values[1], values[0], 'Current Express must retain the authorization refusal');
            assert.deepEqual(values[2], values[0], 'Fastify must delegate to the same actor guard and response');
            const actorGuardReached = profile === 'reduced-query' ||
              (profile === 'reduced-report' && route.controller === 'ReportController');
            if (actorGuardReached && (route.method === 'get' || subject === 'missing-actor')) {
              assert.equal(values[0].status, 403);
              assert.equal(values[0].text, version === '2.0'
                ? '{"errors":[{"detail":"view-error-no-permissions"}],"meta":{}}'
                : '{"message":"view-error-no-permissions","details":""}');
              assert.equal(values[0].headers['content-disposition'], undefined);
            }
          });
});
function forRoute(route: Route): Scenario[] {
  const read = route.method === 'get' || route.method === 'all';
  const extra: Scenario[] =
    route.action === 'downloadRecs'
      ? [
          { name: 'csv', variant: 'csv' },
          { name: 'unsupported-format', variant: 'bad-format' },
          { name: 'source-error-after-bytes', variant: 'stream-failure' },
        ]
      : [];
  if (queryReadRoutes.includes(route as (typeof queryReadRoutes)[number]))
    for (const refusal of [403, 404] as const)
      for (const version of ['1.0', '2.0'])
        extra.push({
          name: `domain-refusal-${refusal}-v${version}`, variant: 'fault', refusal,
          cookie: route.method === 'post', csrf: route.method === 'post',
          headers: { 'X-ReDBox-API-Version': version, ...(route.method === 'post' ? { Origin: referenceOrigin } : {}) },
        });
  if (route.controller === 'webservice/RecordSchemaController')
    extra.push(
      { name: 'invalid-schema', variant: 'invalid-schema' },
      { name: 'schema-unavailable', variant: 'unavailable-schema' },
      { name: 'invalid-operation', query: 'operation=unsupported' }
    );
  if (['listConfigs', 'getCollections', 'getQuery', 'getConfig', 'getRun'].includes(route.action))
    for (const version of [undefined, '2.0'])
      for (const variant of ['odd', 'serialize-once', 'serialize-failure'] as const)
        extra.push({
          name: `${variant}-${version ?? '1.0'}`,
          variant,
          headers: {
            ...(version ? { 'X-ReDBox-API-Version': version } : {}),
            ...(variant === 'serialize-failure' ? { 'If-None-Match': '*' } : {}),
          },
        });
  if (route.action === 'executeNamedQuery') {
    for (const version of ['1.0', '2.0']) {
      for (const [query, operator, records, retainedStatus, retainedRecords] of [
        ['queryName=typed-string&title=Référence%20🌏', false, 1],
        ['queryName=typed-string&title[$ne]=x', true, undefined, 200, 2],
        ['queryName=typed-string&title[$regex]=.*', true, undefined, 200, 2],
        ['queryName=typed-string&title[]=x', false],
        ['queryName=typed-string', false],
        ['queryName=typed-number&value[$ne]=0', true],
        ['queryName=typed-number&value=NaN', false],
        ['queryName=typed-number&value=1', false, 2],
        ['queryName=typed-boolean&value[$ne]=false', true],
        ['queryName=typed-boolean&value=yes', false],
        ['queryName=typed-boolean&value=true', false, 1],
        ['queryName=typed-date&value[$ne]=x', true],
        ['queryName=typed-date&value=invalid', false],
        ['queryName=typed-date&value=2026-01-01T00:00:00.000Z', false, 2],
        ['queryName=typed-array&value[$in]=x', true],
        ['queryName=typed-array&value[0]=x&value[1][$ne]=literal', true],
        ['queryName=typed-object&value[$ne]=literal', true, undefined, 200, 2],
        ['queryName=typed-object&value[$regex]=.*', true],
        ['queryName=typed-array&value=' + encodeURIComponent('["x",{"$ne":"literal"}]'), true],
        ['queryName=typed-object&value=' + encodeURIComponent('{"$ne":"literal"}'), true, undefined, 200, 2],
        ['queryName=typed-object&value=' + encodeURIComponent('{"$regex":".*"}'), true],
        ['queryName=typed-string&title[ordinary]=x', true],
        ['queryName=typed-string&title[a.b]=x', true],
        ['queryName=typed-string&title[0]=x&title[1][nested][$ne]=x', true],
        ['queryName=typed-array&value[0]=a&value[1]=b', false],
        ['queryName=typed-object&value=' + encodeURIComponent('{"label":"literal"}'), true],
      ] as const)
        extra.push({
          name: `security-${version}-${query}`,
          query,
          headers: { 'X-ReDBox-API-Version': version },
          security: { operator, records, retainedStatus, retainedRecords },
        });
    }
  }
  if (route.action === 'executeNamedQuery')
    for (const item of namedQueryLiteralCases)
      for (const version of ['1.0', '2.0'])
        extra.push({
          name: `raw-operand-${item.name}-${version}`,
          query: 'queryName=conversion-' + item.name + '&' + stringify({ term: JSON.parse(item.value) }),
          headers: { 'X-ReDBox-API-Version': version },
          conversion: { titles: item.titles, outcome: item.outcome },
        });
  if (route.action === 'executeNamedQuery' || ['getResults', 'downloadCSV', 'previewConfig'].includes(route.action)) {
    for (const item of [...namedQueryConversionCases, ...namedQueryLiteralCases])
      for (const version of ['1.0', '2.0'])
        extra.push({
          name: `conversion-${item.name}-${version}`,
          query:
            `${route.action === 'executeNamedQuery' ? 'queryName' : 'name'}=conversion-${item.name}` +
            (item.value !== undefined && route.action !== 'previewConfig'
              ? '&term=' + encodeURIComponent(item.value)
              : ''),
          headers: {
            'X-ReDBox-API-Version': version,
            ...(route.action === 'previewConfig' && route.controller === 'ReportController'
              ? { Origin: referenceOrigin }
              : {}),
          },
          ...(route.action === 'previewConfig' && route.controller === 'ReportController'
            ? { auth: false as const, cookie: true, csrf: true }
            : {}),
          ...(route.action === 'previewConfig'
            ? {
                raw: JSON.stringify({
                  ...defaultReport(item.name),
                  name: 'conversion-' + item.name,
                  databaseQuery: { queryName: 'conversion-' + item.name },
                  ...(item.value === undefined ? {} : { term: item.value }),
                }),
              }
            : {}),
          conversion: { titles: item.titles, outcome: item.outcome },
        });
    for (const definition of namedQueryDefaultDefinitions)
      for (const input of namedQueryDefaultInputs)
        for (const version of ['1.0', '2.0'])
          extra.push({
            name: `defaults-${definition.name}-${input.name}-${version}`,
            query:
              `${route.action === 'executeNamedQuery' ? 'queryName' : 'name'}=defaults-${definition.name}` +
              (input.query && route.action !== 'previewConfig' ? '&' + input.query : ''),
            headers: {
              'X-ReDBox-API-Version': version,
              ...(route.action === 'previewConfig' && route.controller === 'ReportController'
                ? { Origin: referenceOrigin }
                : {}),
            },
            ...(route.action === 'previewConfig' && route.controller === 'ReportController'
              ? { auth: false as const, cookie: true, csrf: true }
              : {}),
            ...(route.action === 'previewConfig'
              ? {
                  raw: JSON.stringify({
                    ...defaultReport(definition.name),
                    ...(input.name === 'omitted' ? {} : { term: input.value }),
                  }),
                }
              : {}),
            defaults: { configuration: definition.name, input: input.name },
          });
  }
  if (route.method === 'all')
    for (const method of ['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS', 'PROPFIND'])
      extra.push({ name: `workspace-${method}`, method });
  return [
    ...scenarios,
    ...(read
      ? [
          { name: 'HEAD-v1', method: 'HEAD' },
          { name: 'HEAD-v2', method: 'HEAD', headers: { 'X-ReDBox-API-Version': '2.0' } },
          ...conditionals,
        ]
      : []),
    ...versions,
    ...extra,
  ];
}
const key = (route: Route, s: Pick<Scenario, 'name'>) => coreRouteName(route.method, route.path) + ':' + s.name;
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
const auth = { Authorization: 'Bearer pilot-api-token' };
async function session(f: Fixture) {
  const token = await wire(f.url + '/csrfToken', 'GET');
  const cookie = String((token.headers['set-cookie'] as string[])[0]).split(';')[0];
  const login = await wire(
    f.url + '/user/login_local',
    'POST',
    { Cookie: cookie, Origin: referenceOrigin, 'Content-Type': 'application/x-www-form-urlencoded' },
    new URLSearchParams({
      username: 'pilot-admin',
      password: 'pilot-password',
      _csrf: JSON.parse(token.text)._csrf,
    }).toString()
  );
  assert.equal(login.status, 302, login.text);
  return String((login.headers['set-cookie'] as string[])[0]).split(';')[0];
}
function target(route: Route, s: Scenario, runId: string, digest: string) {
  const missing = s.variant === 'missing';
  const oid = missing
    ? 'missing'
    : s.variant === 'private'
      ? 'private-record'
      : s.variant === 'foreign-record'
        ? 'foreign-record'
        : route.action === 'getDeletedRecord'
          ? 'deleted-record'
          : 'reference-record';
  const params: Record<string, string> = {
    branding: s.variant === 'foreign-brand' ? 'other' : s.variant === 'unknown-brand' ? 'missing' : 'default',
    portal: s.variant === 'portal' ? 'missing' : 'rdmp',
    oid,
    name: missing ? 'missing' : route.action === 'getMetaDefault' ? 'dataRecord' : 'records',
    recordType: missing ? 'missing' : 'dataRecord',
    type: missing ? 'missing' : 'dataRecord',
    format: s.variant === 'csv' ? 'csv' : s.variant === 'bad-format' ? 'exe' : 'json',
    digest: missing ? 'a'.repeat(64) : s.variant === 'invalid-schema' ? 'bad' : digest,
    id: missing ? '000000000000000000000099' : runId,
  };
  let path = route.path.replace(/:([A-Za-z]+)/g, (_m, name) => params[name]);
  if (s.variant === 'case') path = path.toUpperCase() + '/';
  const base = new URLSearchParams();
  if (route.action === 'executeNamedQuery') base.set('queryName', missing ? 'missing' : 'records');
  if (['get', 'getResults', 'downloadCSV'].includes(route.action) && route.controller === 'ReportController')
    base.set('name', missing ? 'missing' : 'records');
  if (route.action === 'downloadRecs') base.set('recType', 'dataRecord');
  if (['listRecords', 'listDeletedRecords', 'getRecordList', 'getDeletedRecordList'].includes(route.action))
    base.set('rows', '2');
  if (route.action === 'search') {
    base.set('type', 'dataRecord');
    base.set('searchStr', 'test');
    base.set('rows', '2');
  }
  if (s.query) for (const name of new URLSearchParams(s.query).keys()) base.delete(name);
  return path + '?' + base + (s.query ? '&' + s.query : '');
}
function replace(domain: object, method: string, fn: (...args: unknown[]) => unknown) {
  const descriptor = Object.getOwnPropertyDescriptor(domain, method);
  Object.defineProperty(domain, method, { configurable: true, writable: true, value: fn });
  return () => {
    if (descriptor) Object.defineProperty(domain, method, descriptor);
    else Reflect.deleteProperty(domain, method);
  };
}
function faultTarget(f: Fixture, route: Route): [object, string, boolean] | undefined {
  const ref = f.data.reference,
    storage = f.data.storage();
  if (route.controller === 'webservice/RecordSchemaController')
    return [ref.schema.get(), 'resolve' + route.action[0].toUpperCase() + route.action.slice(1), false];
  if (route.controller.includes('Export')) return [storage, 'exportAllPlans', false];
  if (route.controller.includes('Siem'))
    return route.action === 'getConfig'
      ? [ref.appConfigs.get(), 'getAppConfigByBrandAndKey', false]
      : [SiemReads.prototype, route.action === 'getEvents' ? 'queryEvents' : 'getDeliveryStatus', false];
  if (route.controller.includes('NamedQuery') || route.action === 'executeNamedQuery')
    return [
      ref.queries.get(),
      (
        {
          listQueries: 'list',
          getCollections: 'getSupportedCollections',
          getQuery: 'getNamedQueryConfig',
          executeNamedQuery: 'getNamedQueryConfig',
        } as Record<string, string>
      )[route.action],
      false,
    ];
  if (route.controller.includes('Report'))
    return [
      ref.reports.get(),
      (
        {
          get: 'get',
          getResults: 'getResults',
          downloadCSV: 'getCSVResult',
          listConfigs: 'listConfigs',
          getConfig: 'getConfig',
          previewConfig: 'previewConfig',
        } as Record<string, string>
      )[route.action],
      false,
    ];
  if (route.controller.includes('Harvest')) return [f.data.harvest.get(), route.action, false];
  if (route.action === 'search') return [f.data.search.get(), 'searchFuzzy', false];
  if (route.action === 'getMetaDefault') return [ref.forms.get(), 'getFormByStartingWorkflowStep', true];
  if (route.action === 'listWorkspaces') return undefined;
  return [
    storage,
    ['listRecords', 'getRecordList', 'listDeletedRecords', 'getDeletedRecordList'].includes(route.action)
      ? 'getRecordSort'
      : route.action === 'getDeletedRecord'
        ? 'getDeletedRecordMeta'
        : 'getMeta',
    false,
  ];
}
const identityMaps = new WeakMap<Fixture, [string, string][]>();
async function normalized(f: Fixture, value: Wire) {
  const headers = { ...value.headers };
  for (const name of ['date', 'connection', 'keep-alive', 'x-request-id']) delete headers[name];
  if (headers['set-cookie'])
    headers['set-cookie'] = (headers['set-cookie'] as string[]).map(cookie =>
      cookie.replace(/^([^=]+)=[^;]*/, '$1=<session>').replace(/Expires=[^;]+/i, 'Expires=<time>')
    );
  let text = value.text.replace(
    /"(createdAt|updatedAt|lastSaveDate|dateCreated|dateModified|dateGenerated)":\s*"[^"]*"/g,
    '"$1":"<time>"'
  );
  let identities = identityMaps.get(f);
  if (!identities) {
    identities = [];
    for (const { name } of await f.client.db().listCollections().toArray()) {
      if (/session|agenda|job/i.test(name)) continue;
      for (const row of await f.client.db().collection(name).find({}).toArray()) {
        const label =
          name +
          ':' +
          String(row.redboxOid ?? row.eventId ?? row.name ?? row.sourceRunId ?? row.username ?? row.action ?? 'row');
        const id = String(row._id);
        if (/^[a-f0-9]{24}$/.test(id)) identities.push([id, label]);
        if (typeof row.incarnationId === 'string')
          identities.push([row.incarnationId, 'incarnation:' + String(row.redboxOid ?? 'row')]);
      }
    }
    identityMaps.set(f, identities);
  }
  for (const [id, label] of identities) text = text.replaceAll(id, label);
  return { status: value.status, headers, text, ...(value.aborted ? { aborted: true } : {}) };
}

async function seed(f: Fixture) {
  const refs = getReferenceRepositories(f.owner),
    brand = Object.assign(new BrandingModel(), f.brand);
  await refs.recordTypes.reviseDefinition('000000000000000000000021', { searchCore: 'default' });
  await f.data.reference.queries.get().create(brand, 'records', {
    collectionName: 'record',
    mongoQuery: {},
    sort: [{ 'metadata.title': 'ASC' }],
    queryParams: {},
    resultObjectMapping: { oid: 'redboxOid', title: 'metadata.title' },
  });
  await f.data.reference.reports.get().createConfig(brand, {
    name: 'records',
    title: 'Records',
    reportSource: 'database',
    databaseQuery: { queryName: 'records' },
    filter: [],
    columns: [{ label: 'Title', property: 'title' }],
    solrQuery: null,
    readOnly: false,
    canEdit: true,
    canDelete: true,
    canPreview: true,
  });
  for (const [name, type, path, format] of [
    ['typed-string', 'string', 'metadata.title'],
    ['typed-number', 'number', 'recordVersion'],
    ['typed-boolean', 'boolean', 'metadata.active'],
    ['typed-date', 'date', 'dateCreated', 'ISODate'],
    ['typed-array', 'array', 'metadata.literalArray'],
    ['typed-object', 'object', 'metadata.literalObject'],
  ] as const)
    await f.data.reference.queries.get().create(brand, name, {
      collectionName: 'record',
      mongoQuery: {},
      sort: [],
      resultObjectMapping: { oid: 'redboxOid' },
      queryParams: {
        [name === 'typed-string' ? 'title' : 'value']: { type, path, required: true, whenUndefined: 'ignore', format },
      },
    });
  for (const definition of namedQueryDefaultDefinitions) {
    await f.data.reference.queries.get().create(brand, 'defaults-' + definition.name, {
      collectionName: 'record',
      mongoQuery: {},
      sort: [{ 'metadata.title': 'ASC' }],
      resultObjectMapping: {},
      queryParams: { term: definition.parameter },
    });
    await f.data.reference.reports.get().createConfig(brand, defaultReport(definition.name));
  }
  for (const item of [...namedQueryConversionCases, ...namedQueryLiteralCases]) {
    await f.data.reference.queries.get().create(brand, 'conversion-' + item.name, {
      collectionName: 'record',
      mongoQuery: {},
      sort: [{ 'metadata.title': 'ASC' }],
      resultObjectMapping: {},
      queryParams: { term: item.parameter },
    });
    await f.data.reference.reports.get().createConfig(brand, {
      ...defaultReport(item.name),
      name: 'conversion-' + item.name,
      databaseQuery: { queryName: 'conversion-' + item.name },
    });
  }
  const storage = f.data.storage();
  await f.client
    .db()
    .collection('record')
    .updateOne(
      { redboxOid: 'reference-record' },
      {
        $set: {
          workflow: { stage: 'draft' },
          metadata: {
            title: 'Référence 🌏',
            active: true,
            defaultArray: ['a', 'b'],
            rank: 0,
            testDate: '2026-01-02T03:04:05.000Z',
            literalArray: ['x', { $ne: 'literal' }],
            literalObject: { $ne: 'literal' },
            literalschema: { $schema: 'https://example.org/schema' },
            literalschemaArray: [{ $schema: 'https://example.org/schema' }],
            memberschema: { kind: 'literal', $schema: 'https://example.org/schema' },
            literaldotted: { 'schema.org': 'Dataset' },
            literaldottedArray: [{ 'schema.org': 'Dataset' }],
            memberdotted: { kind: 'literal', 'schema.org': 'Dataset' },
            odd: {
              date: '2026-01-02T03:04:05.678Z',
              objectId: '0123456789abcdef01234567',
              unicode: '研究 🌏 café',
              nil: null,
            },
          },
        },
      }
    );
  await storage.create(
    brand,
    {
      redboxOid: 'private-record',
      metadata: { title: 'Private', active: false, defaultArray: [], rank: 10, testDate: '2025-01-02T03:04:05.000Z' },
      metaMetadata: { brandId: f.brand.id, type: 'dataRecord', form: 'dataRecord' },
      authorization: { view: ['somebody-else'], edit: [], viewRoles: [], editRoles: [] },
      workflow: { stage: 'draft' },
    },
    'dataRecord'
  );
  await f.client
    .db()
    .collection('record')
    .updateMany({}, { $set: { dateCreated: '2026-01-01T00:00:00.000Z', lastSaveDate: '2026-01-01T00:00:00.000Z' } });
  const snapshot = await storage.getMeta('reference-record');
  await f.client
    .db()
    .collection('deletedrecord')
    .insertOne({
      redboxOid: 'deleted-record',
      revision: 2,
      brandId: f.brand.id,
      lifecycleState: 'deleted',
      dateDeleted: '2026-01-03T00:00:00Z',
      deletedRecordMetadata: { ...snapshot, redboxOid: 'deleted-record', metadata: { title: 'Deleted title' } },
    });
  await storage.createRecordAudit!({
    redboxOid: 'reference-record',
    action: 'created' as never,
    user: { username: 'pilot-admin' },
    record: { metadata: { title: 'Référence 🌏' } },
    occurredAt: '2026-01-01T00:00:00Z',
  });
  const run = await getHarvestRepositories(f.owner).runs.createRun({
    brandId: f.brand.id,
    sourceRunId: 'source-1',
    recordType: 'dataRecord',
    sourceName: 'fixture',
    status: 'completed',
    startedAt: '2026-01-01T00:00:00Z',
  });
  await getSiemRepository(f.owner).capture({
    eventId: 'fm024-event',
    brandId: f.brand.id,
    eventType: 'fixture',
    category: 'test',
    severity: 'info',
    occurredAt: '2026-01-01T00:00:00Z',
    source: 'fixture',
    deliveryState: 'pending',
  });
  await seedReadSearch(f);
  const schema = await wire(f.url + '/default/rdmp/api/records/schemas/create/dataRecord', 'GET', auth);
  assert.equal(schema.status, 200, schema.text);
  assert.match(String(schema.headers.etag), /^"sha256:[a-f0-9]{64}"$/);
  return { runId: String(run.id), digest: String(schema.headers.etag).slice(8, -1) };
}

describe('FM-024 production record/query/schema differential over raw HTTP', function () {
  this.timeout(900000);
  before(async () => {
    const retained = await retainedReadExpress();
    try {
      for (const mode of modes) {
        console.log('FM024 host ' + mode);
        const f = await referenceProductionFixture(
          mode === 'fastify',
          undefined,
          mode === 'retained' ? retained.install : undefined,
          {
            declarations: recordQueryReadDeclarations,
            configuration: {
              api: { max_requests: 3 },
              record: {
                search: { returnFields: ['id', 'full_text', 'date_object_modified'], maxRecordsPerPage: 4 },
                contextVariables: {},
              },
              auth: {
                roles: [{ name: 'Admin' }, { name: 'Researcher' }, { name: 'Guest' }],
                rules: [
                  { path: '/:branding/:portal(/*)', role: 'Admin', can_update: true },
                  { path: '/:branding/:portal/api(/*)', role: 'Researcher', can_update: true },
                ],
              },
            },
          }
        );
        try {
          const { runId, digest } = await seed(f),
            cookie = await session(f);
          const csrf = JSON.parse((await wire(f.url + '/csrfToken', 'GET', { Cookie: cookie })).text)._csrf;
          if (mode === 'fastify') {
            const installation = (
              f.portal as Awaited<
                ReturnType<typeof import('../../../src/application/portal').createPortalFastifyApplication>
              >
            ).installation;
            for (const route of recordQueryReadDeclarations) {
              const bound = installation.routePlan.routes.filter(
                item => item.declaration.name === coreRouteName(route.method, route.path)
              );
              assert.equal(bound.length, 1, route.path);
              assert.equal(bound[0].declaration.controller, route.controller);
              assert.equal(bound[0].declaration.action, route.action);
            }
          }
          for (const route of recordQueryReadDeclarations) {
            console.log('FM024 ' + mode + ' ' + route.controller + '.' + route.action);
            const positive = await wire(
              f.url + target(route, { name: 'positive' }, runId, digest),
              route.method === 'all' ? 'GET' : route.method.toUpperCase(),
              auth,
              route.method === 'post'
                ? JSON.stringify({
                    name: 'preview',
                    title: 'Preview',
                    reportSource: 'database',
                    databaseQuery: { queryName: 'records' },
                    filter: [],
                    columns: [],
                  })
                : ''
            );
            const etag = typeof positive.headers.etag === 'string' ? positive.headers.etag : '"fm024-no-etag"';
            for (const scenario of forRoute(route)) {
              let serializations = 0;
              const targetFault = faultTarget(f, route);
              const restoreParameters =
                mode === 'retained' && (scenario.security || scenario.defaults || scenario.conversion)
                  ? replace(f.data.reference.queries.get(), 'setParamsInQuery', retained.parameterSubstitution)
                  : () => {};
              let restore = () => {};
              if (scenario.variant === 'fault' && targetFault) {
                const [domain, method, observable] = targetFault;
                restore = replace(domain, method, () => {
                  const error = scenario.refusal
                    ? new AuditReadError(scenario.refusal, 'controlled domain refusal')
                    : new Error('secret FM024 backend diagnostic');
                  if (observable) return throwError(() => error);
                  throw error;
                });
              }
              if (['odd', 'serialize-once', 'serialize-failure'].includes(scenario.variant ?? '') && targetFault) {
                const [domain, method, observable] = targetFault;
                const odd = {
                  date: new Date('2026-01-02T03:04:05.678Z'),
                  objectId: new ObjectId('0123456789abcdef01234567'),
                  unicode: '研究 🌏 café\u2028',
                  nil: null,
                  large: 'α'.repeat(65537),
                  extra: { unfiltered: true },
                  integer: 9007199254740991,
                };
                const value =
                  scenario.variant === 'odd'
                    ? odd
                    : {
                        toJSON() {
                          serializations++;
                          if (scenario.variant === 'serialize-failure')
                            throw new Error('secret FM024 serializer diagnostic');
                          return odd;
                        },
                      };
                restore = replace(domain, method, () => (observable ? of(value) : value));
              }
              if (scenario.variant === 'stream-failure' && targetFault) {
                const [domain, method] = targetFault;
                restore = replace(domain, method, () =>
                  Readable.from(
                    (async function* () {
                      yield Buffer.from('[');
                      await new Promise(resolve => setTimeout(resolve, 10));
                      throw new Error('secret FM024 stream failure');
                    })()
                  )
                );
              }
              if (scenario.variant === 'unavailable-schema' && targetFault) {
                const [domain, method] = targetFault;
                restore = replace(domain, method, () => ({ kind: 'unavailable' }));
              }
              try {
                const headers: Record<string, string> = {
                  ...(scenario.auth === false
                    ? {}
                    : { Authorization: 'Bearer ' + (scenario.auth ?? 'pilot-api-token') }),
                  ...(scenario.cookie ? { Cookie: cookie } : {}),
                  ...(scenario.csrf ? { 'x-csrf-token': csrf } : {}),
                  ...scenario.headers,
                };
                for (const name of ['If-None-Match', 'If-Match'])
                  if (headers[name]) headers[name] = headers[name].replace('<etag>', etag);
                const method = scenario.method ?? (route.method === 'all' ? 'GET' : route.method.toUpperCase());
                const raw =
                  scenario.raw ??
                  (method === 'POST' && route.action === 'previewConfig'
                    ? JSON.stringify({
                        name: 'preview',
                        title: 'Preview',
                        reportSource: 'database',
                        databaseQuery: { queryName: 'records' },
                        filter: [],
                        columns: [],
                      })
                    : '');
                if (raw && !headers['Content-Type']) headers['Content-Type'] = 'application/json';
                const value = await normalized(
                  f,
                  await wire(f.url + target(route, scenario, runId, digest), method, headers, raw)
                );
                const id = key(route, scenario),
                  values = snapshots.get(id) ?? [];
                values[modes.indexOf(mode)] = value;
                snapshots.set(id, values);
                if (scenario.variant?.startsWith('serialize-'))
                  calls.set(id, [...(calls.get(id) ?? []), serializations]);
              } catch (error) {
                failures.set(mode + ':' + key(route, scenario), String(error));
              } finally {
                restoreParameters();
                restore();
              }
            }
          }
          state.set(mode, [
            await f.client.db().collection('record').countDocuments(),
            await f.client.db().collection('deletedrecord').countDocuments(),
            await f.client.db().collection('recordschemaartifact').countDocuments(),
            await f.client.db().collection('recordschemareference').countDocuments(),
            await f.client.db().collection('report').countDocuments(),
          ]);
        } finally {
          await f.close();
        }
      }
    } finally {
      await retained.close();
    }
  });
  after(async () => {
    if (process.env.FM024_HTTP_REPORT)
      await writeFile(
        process.env.FM024_HTTP_REPORT,
        JSON.stringify(
          {
            snapshots: Object.fromEntries(snapshots),
            failures: Object.fromEntries(failures),
            serializationCalls: Object.fromEntries(calls),
            state: Object.fromEntries(state),
          },
          null,
          2
        )
      );
  });
  for (const route of recordQueryReadDeclarations)
    for (const scenario of forRoute(route))
      it(`${route.controller}.${route.action} ${route.path} ${scenario.name}`, () => {
        const values = snapshots.get(key(route, scenario));
        assert(values?.[2], JSON.stringify(modes.map(mode => [mode, failures.get(mode + ':' + key(route, scenario))])));
        if (scenario.conversion) {
          assert(values[0] && values[1]);
          if (scenario.conversion.outcome === 'refused') {
            assert.deepEqual(values[2], values[1], 'Both current hosts must refuse interpreted structured inputs');
            assert.equal(values[2].status, 400, values[2].text);
            assert.match(values[2].text, /parameter/);
            assert.equal(values[2].headers['content-disposition'], undefined);
            return;
          }
          assert.deepEqual(values[1], values[0], 'Current Express conversion must match retained Express');
          assert.deepEqual(values[2], values[0], 'Fastify conversion must match retained Express');
          if (scenario.conversion.outcome === 'mongo-error') {
            // Retain each action's original safe error, including legacy browser
            // report/CSV 200 error envelopes. Never rewrite the $in predicate.
            assert.equal(values[2].status, ['getResults', 'downloadCSV'].includes(route.action) ? 200 : 500);
            assert.match(values[2].text, /Internal server error/);
            assert.doesNotMatch(values[2].text, /cannot nest|MongoServerError|\$schema/);
            assert.equal(values[2].headers['content-disposition'], undefined);
            return;
          }
          assert.equal(values[2].status, 200, values[2].text);
          const titles = scenario.conversion.titles;
          if (route.action === 'downloadCSV') {
            assert.match(String(values[2].headers['content-disposition']), /attachment/);
            assert.deepEqual(values[2].text.trimEnd().split(/\r?\n/), ['Title', ...titles]);
          } else {
            const body = JSON.parse(values[2].text),
              result = body.data ?? body;
            assert.equal(route.action === 'executeNamedQuery' ? result.summary.numFound : result.total, titles.length);
            assert.deepEqual(
              result.records.map((record: { title: string }) => record.title),
              titles
            );
          }
          return;
        }
        if (scenario.defaults) {
          assert(values[0] && values[1]);
          assert.deepEqual(values[2], values[1], 'Both transports must preserve configured report defaults');
          const { configuration, input } = scenario.defaults;
          if (input !== 'operator')
            assert.deepEqual(values[1], values[0], 'Non-operator report defaults retain original Express behavior');
          const report = route.action !== 'executeNamedQuery';
          // Report parameters historically normalize explicit empty filters to
          // undefined. Direct named-query requests preserve the empty string.
          const omitted = input === 'omitted' || (report && input === 'empty');
          const refused = input === 'operator' || (omitted && configuration === 'required');
          // Injection is the only changed contract. Ordinary required failures
          // retain each original report/API error envelope and status.
          const status =
            input === 'operator'
              ? 400
              : refused
                ? route.action === 'downloadCSV' || route.action === 'getResults'
                  ? 200
                  : 500
                : 200;
          assert.equal(values[2].status, status, values[2].text);
          if (refused) {
            assert.match(values[2].text, input === 'operator' ? /parameter/ : /Internal server error/);
            assert.equal(values[2].headers['content-disposition'], undefined);
            if (status === 200)
              assert.equal((JSON.parse(values[2].text).data ?? JSON.parse(values[2].text)).status, false);
          } else {
            const count = omitted
              ? configuration === 'no-default'
                ? 2
                : configuration === 'null-default'
                  ? 0
                  : 1
              : input === 'empty'
                ? 0
                : 1;
            if (route.action === 'downloadCSV') {
              assert.match(String(values[2].headers['content-disposition']), /attachment/);
              const expected = [
                'Title',
                ...(count === 2 ? ['Private', defaultQueryTitle] : count ? [defaultQueryTitle] : []),
              ];
              assert.deepEqual(values[2].text.trimEnd().split(/\r?\n/), expected);
            } else {
              const body = JSON.parse(values[2].text),
                result = body.data ?? body;
              assert.equal(route.action === 'executeNamedQuery' ? result.summary.numFound : result.total, count);
              assert.equal(result.records.length, count);
              if (count === 1) assert.equal(result.records[0].title, defaultQueryTitle);
            }
          }
          return;
        }
        if (scenario.security) {
          assert(values[0] && values[1]);
          assert.deepEqual(values[2], values[1], 'Both current transports must share the security fix');
          if (scenario.security.operator) {
            assert.equal(values[2].status, 400, values[2].text);
            assert.match(values[2].text, /parameter/);
            assert.equal(values[2].headers['content-disposition'], undefined);
          } else {
            assert.deepEqual(values[1], values[0], 'Non-operator values retain the original pipeline behavior');
            if (scenario.security.records !== undefined) {
              const body = JSON.parse(values[2].text);
              assert.equal((body.data ?? body).summary.numFound, scenario.security.records);
            }
          }
          if (scenario.security.retainedStatus)
            assert.equal(values[0].status, scenario.security.retainedStatus, values[0].text);
          if (scenario.security.retainedRecords !== undefined) {
            const retainedBody = JSON.parse(values[0].text);
            assert.equal(
              (retainedBody.data ?? retainedBody).summary.numFound,
              scenario.security.retainedRecords,
              'Retained Express must demonstrate the predicate injection'
            );
          }
          return;
        }
        if (!values[0]) {
          assert(scenario.control && scenario.query?.includes('[toString]'), 'Unexpected retained abort');
          assert.match(failures.get('retained:' + key(route, scenario)) ?? '', /ECONNRESET|socket hang up|aborted/);
          const control = snapshots.get(key(route, { name: scenario.control }));
          assert(control?.[0] && control[1] && control[2]);
          assert.deepEqual(control[1], control[0]);
          assert.deepEqual(control[2], control[0]);
          if (values[1]) assert.deepEqual(values[1], control[0]);
          else {
            assert.equal(route.controller, 'ReportController');
            assert.equal(route.action, 'previewConfig');
            assert.match(failures.get('express:' + key(route, scenario)) ?? '', /ECONNRESET|socket hang up|aborted/);
          }
          assert.deepEqual(values[2], control[0]);
        } else {
          assert(values[1], failures.get('express:' + key(route, scenario)));
          assert.deepEqual(values[1], values[0], 'shared Express differs from retained');
          if (route.action === 'downloadRecs' && scenario.method === 'HEAD' && values[2].status === 200) {
            const native = structuredClone(values[2]);
            assert.equal(native.headers['transfer-encoding'], 'chunked', 'Export HEAD now mirrors GET framing');
            delete native.headers['transfer-encoding'];
            assert.deepEqual(native, values[0]);
          } else assert.deepEqual(values[2], values[0], 'Fastify differs from retained');
        }
        if (scenario.variant === 'stream-failure') {
          assert.equal(values[2].aborted, true);
          assert.equal(values[2].text, '[');
        }
        if (
          scenario.name === 'private-object' &&
          [
            'getObjectMeta',
            'getMeta',
            'getDeletedRecord',
            'getPermissions',
            'getRelatedRecords',
            'getRecordAudit',
          ].includes(route.action) &&
          !route.path.includes('deletedrecords') &&
          route.action !== 'getDeletedRecord'
        )
          assert.equal(values[2].status, 403);
        if (
          scenario.name === 'foreign-object' &&
          ['getObjectMeta', 'getMeta', 'getPermissions', 'getRelatedRecords', 'getRecordAudit'].includes(route.action)
        )
          assert.equal(values[2].status, 404);
        if (
          scenario.name === 'private-object' &&
          route.controller === 'webservice/RecordSchemaController' &&
          route.action === 'update'
        )
          assert.equal(values[2].status, 404);
        if (scenario.name === 'page-sort' && route.action === 'listRecords') {
          const body = JSON.parse(values[2].text);
          assert.equal(body.summary.start, 1);
          assert.equal(body.records.length, 0);
        }
        if (
          scenario.name === 'row-bounds' &&
          ['listRecords', 'listDeletedRecords', 'getRecordList', 'getDeletedRecordList', 'search'].includes(
            route.action
          ) &&
          route.controller !== 'webservice/SearchController'
        )
          assert.equal(values[2].status, 400);
        if (scenario.name === 'search-or-injection' && route.action === 'search') {
          assert.equal(values[2].status, 200);
          const body = JSON.parse(values[2].text);
          assert.equal(body.totalItems, 1);
          assert.equal(body.records[0].id, 'visible');
        }
        if (scenario.method === 'HEAD') assert.equal(values[2].text, '');
        if (scenario.refusal) {
          assert.equal(values[2].status,
            route.controller === 'ReportController' && ['getResults', 'downloadCSV'].includes(route.action)
              ? 200 : scenario.refusal);
          assert.match(values[2].text, /controlled domain refusal/);
        }
        if (values[2].status === 304) {
          assert.equal(values[2].text, '');
          for (const name of ['content-type', 'content-length', 'transfer-encoding'])
            assert.equal(values[2].headers[name], undefined);
        }
        if (scenario.name === 'v1')
          assert.equal(
            values[2].status,
            route.action === 'listWorkspaces'
              ? 302
              : route.action === 'previewConfig' && route.controller === 'ReportController'
                ? 403
                : 200,
            values[2].text
          );
        if (scenario.variant === 'fault' || scenario.variant === 'serialize-failure')
          assert(!/secret FM024/.test(values[2].text));
        if (
          scenario.variant === 'odd' &&
          values[2].status === 200 &&
          route.controller !== 'webservice/SiemController'
        ) {
          assert(values[2].text.includes('研究 🌏 café'));
          assert(values[2].text.includes('0123456789abcdef01234567'));
          assert(values[2].text.includes('2026-01-02T03:04:05.678Z'));
          assert(values[2].text.includes('"nil":null'));
          assert(values[2].text.includes('α'.repeat(65537)));
          assert(values[2].text.includes('"unfiltered":true'));
        }
        if (scenario.variant === 'serialize-once' && route.controller !== 'webservice/SiemController')
          assert.deepEqual(calls.get(key(route, scenario)), [1, 1, 1]);
      });
  it('preserves persisted read/discovery state across the three independent production hosts', () => {
    assert.deepEqual(state.get('express'), state.get('retained'));
    assert.deepEqual(state.get('fastify'), state.get('retained'));
  });
});
