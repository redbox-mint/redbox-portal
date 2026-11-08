import assert from 'node:assert/strict';
import sinon from 'sinon';
import type { FastifyRequest } from 'fastify';
import { inventory, inventoryRegistration } from './inventory-fixture';
import { productionSecurityFixture } from './securityProductionFixture';
import { securityFixture, route, rawRequest } from './securityFixture';
import { requestString, requestStrings, requestText } from '../../../src/http/requestValues';
import { resolveLanguage } from '../../../src/http/language';
import { sendApiErrors, sendApiValidationErrors } from '../../../src/http/fastify/responses';

const keys = ['toString', 'valueOf', 'Symbol.toPrimitive'] as const;
const queryPath = '/:branding/:portal/api/named-query';
const queryItem = queryPath + '/:name';
interface Scenario {
  name: string;
  path: string;
  verb: string;
  target?: string;
  token?: string;
  status: number;
  detail?: string;
  open?: boolean;
  fault?: 'malformed' | 'oversized' | 'charset';
  headers?: Record<string, string>;
}
const scenarios: Scenario[] = [
  { name: 'parser 400', path: queryPath, verb: 'post', status: 400, fault: 'malformed' },
  { name: 'parser 413', path: queryPath, verb: 'post', status: 413, fault: 'oversized' },
  { name: 'parser 415', path: queryPath, verb: 'post', status: 415, fault: 'charset' },
  { name: 'capture 400', path: queryItem, target: '/default/rdmp/api/named-query/%ZZ', verb: 'put', status: 400 },
  { name: 'authentication 401', path: queryPath, verb: 'get', status: 401 },
  { name: 'brand 403', path: queryPath, verb: 'get', status: 403, token: 'foreign-token' },
  { name: 'path role 403', path: queryPath, verb: 'get', status: 403, token: 'wrong-role-token' },
  { name: 'action role 403', path: queryItem, verb: 'delete', status: 403, token: 'wrong-role-token', open: true },
  { name: 'CSRF token 403', path: '/:branding/:portal/user/logout', verb: 'post', status: 403, open: true },
  {
    name: 'CSRF origin 403',
    path: '/:branding/:portal/user/logout',
    verb: 'post',
    status: 403,
    open: true,
    headers: { Origin: 'https://foreign.invalid' },
  },
  {
    name: 'token origin 403',
    path: '/csrfToken',
    verb: 'get',
    status: 403,
    open: true,
    headers: { Origin: 'https://foreign.invalid' },
  },
  { name: 'browser redirect 302', path: '/:branding/:portal/researcher/home', verb: 'all', status: 302 },
  {
    name: 'schema authentication 401',
    path: '/:branding/:portal/api/records/schemas/create/:recordType',
    verb: 'get',
    status: 401,
  },
  {
    name: 'schema brand 403',
    path: '/:branding/:portal/api/records/schemas/create/:recordType',
    verb: 'get',
    status: 403,
    token: 'foreign-token',
  },
  { name: 'missing brand 404', path: queryPath, target: '/missing/rdmp/api/named-query', verb: 'get', status: 404 },
  {
    name: 'domain 500',
    path: queryItem,
    verb: 'delete',
    status: 500,
    detail: 'Definition mutation failed.',
    token: 'pilot-api-token',
    open: true,
  },
  {
    name: 'validation 400',
    path: '/:branding/:portal/api/report/namedQuery',
    verb: 'get',
    status: 400,
    token: 'pilot-api-token',
    open: true,
  },
];
interface Variant {
  name: string;
  query?: string;
  body?: Record<string, unknown>;
  form?: boolean;
  headers?: Record<string, string>;
  version?: boolean;
}
const variants: Variant[] = [{ name: 'baseline' }];
variants.push({ name: 'empty content encoding remains identity', headers: { 'Content-Encoding': '' } });
variants.push(
  { name: 'string array version', query: 'apiVersion[]=2.0' },
  { name: 'duplicate string versions', query: 'apiVersion[]=2.0&apiVersion[]=1.0' },
  { name: 'mixed nested version array', query: 'apiVersion[0]=2.0&apiVersion[1][toString]=constructor', version: true }
);
for (const key of keys) {
  variants.push({
    name: `nested version ${key} conflicts with v2 header`,
    query: `apiVersion[${key}]=constructor`,
    headers: { 'X-ReDBox-Api-Version': '2.0' },
    version: true,
  });
  for (const field of [
    'apiVersion',
    'apiversion',
    'lng',
    'branding',
    'portal',
    '_csrf',
    'access_token',
    'Accept',
    'X-Requested-With',
  ])
    variants.push({
      name: `query ${field}[${key}]`,
      query: `${field}[${key}]=constructor`,
      version: ['apiVersion', 'apiversion'].includes(field),
    });
  for (const form of [false, true]) {
    variants.push({
      name: `${form ? 'form' : 'JSON'} nested fields ${key}`,
      form,
      body: Object.fromEntries(
        ['apiVersion', 'lng', 'branding', 'portal', '_csrf', 'Accept', 'X-Requested-With'].map(field => [
          field,
          { [key]: 'constructor' },
        ])
      ),
    });
    variants.push({
      name: `${form ? 'form' : 'JSON'} nested credential ${key}`,
      form,
      body: { access_token: { [key]: 'constructor' } },
    });
  }
  // HTTP headers are strings, never qs objects. Probe actual JSON-encoded values
  // on the wire; direct object injection is tested below.
  for (const field of [
    'X-ReDBox-Api-Version',
    'Accept',
    'X-CSRF-Token',
    'X-Requested-With',
    'Origin',
    'Sec-Fetch-Site',
    'Authorization',
    'X-Forwarded-Proto',
  ])
    variants.push({
      name: `header ${field} JSON ${key}`,
      headers: { [field]: JSON.stringify({ [key]: 'constructor' }) },
    });
}

function target(pattern: string) {
  return pattern
    .replace(':branding', 'default')
    .replace(':portal', 'rdmp')
    .replace(/:[A-Za-z]+/g, 'value');
}
function body(scenario: Scenario, variant: Variant) {
  const data = variant.body ?? {};
  if (scenario.fault === 'malformed') return JSON.stringify({ ...data, secret: 'request-secret' }).slice(0, -1);
  if (scenario.fault === 'oversized') return JSON.stringify({ ...data, secret: 'x'.repeat(1024 * 1024) });
  if (variant.form)
    return Object.entries(data)
      .flatMap(([field, value]) => Object.entries(value as object).map(([key, item]) => `${field}[${key}]=${item}`))
      .join('&');
  return JSON.stringify(data);
}
async function observed(url: string, scenario: Scenario, variant: Variant) {
  try {
    const result = await rawRequest(
      url + (scenario.target ?? target(scenario.path)) + (variant.query ? '?' + variant.query : ''),
      scenario.verb === 'all' ? 'GET' : scenario.verb.toUpperCase(),
      scenario.fault === 'charset'
        ? 'application/json; charset=iso-8859-1'
        : variant.form && !scenario.fault
          ? 'application/x-www-form-urlencoded'
          : 'application/json',
      body(scenario, variant),
      {
        ...(scenario.token ? { Authorization: 'Bearer ' + scenario.token } : {}),
        ...scenario.headers,
        ...variant.headers,
      }
    );
    return {
      status: result.status,
      text: result.text,
      headers: Object.fromEntries(
        ['www-authenticate', 'location', 'allow', 'vary', 'content-type'].map(name => [
          name,
          result.headers[name] ?? null,
        ])
      ),
    };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ECONNRESET') return { reset: true } as const;
    throw error;
  }
}

describe('FM-016 nested-input axis against unchanged production Express actions', function () {
  this.timeout(45000);
  const oracles = new Map<boolean, Awaited<ReturnType<typeof productionSecurityFixture>>>();
  const natives = new Map<string, Awaited<ReturnType<typeof securityFixture>>>();
  before(async () => {
    for (const open of [false, true]) oracles.set(open, await productionSecurityFixture(undefined, open));
    for (const scenario of scenarios) {
      const row = inventory.routes.find(row => row.original.path === scenario.path && row.method === scenario.verb);
      assert(row, scenario.name);
      const oracle = oracles.get(!!scenario.open)!;
      natives.set(
        scenario.name,
        await securityFixture(true, {
          routes: [inventoryRegistration(row)],
          mongo: true,
          productionRules: true,
          openPaths: scenario.open,
          action: oracle.action(row),
        })
      );
    }
  });
  after(async () => {
    for (const native of natives.values()) await native.close();
    for (const oracle of oracles.values()) await oracle.close();
  });
  for (const scenario of scenarios)
    for (const variant of variants)
      it(`${scenario.name}: ${variant.name}`, async () => {
        const expected = await observed(oracles.get(!!scenario.open)!.url, scenario, variant);
        const native = natives.get(scenario.name)!;
        const actual = await observed(native.url, scenario, variant);
        assert(!('reset' in actual), 'Native denial/error must always publish a safe response');
        assert(
          !JSON.stringify([actual, native.logs]).match(
            /Cannot convert|request-secret|TypeError|stack|credential-secret/
          )
        );
        if ('reset' in expected) {
          // ACCEPTED-NESTED-INPUT-SAFE-RESPONSE: preserve the Express abort
          // observation and require the exact intended native status/body.
          assert(
            variant.version && variant.query!.includes('[toString]'),
            'Only the recorded Express defect may differ'
          );
          assert.equal(actual.status, scenario.status);
          assert.deepEqual(JSON.parse(actual.text), {
            message:
              scenario.detail ??
              (scenario.status === 500
                ? 'Internal server error'
                : scenario.name.includes('origin')
                  ? 'Cross-origin request denied'
                  : scenario.name === 'action role 403'
                    ? 'Access Denied'
                    : scenario.status === 403
                      ? 'Invalid CSRF token'
                      : 'Invalid request'),
            details: '',
          });
        } else {
          assert.deepEqual(actual, expected);
          if (variant.name === 'baseline') assert.equal(expected.status, scenario.status);
        }
      });
});

describe('FM-016 total error boundary and typed request extraction', function () {
  this.timeout(10000);
  for (const key of [...keys, Symbol.toPrimitive])
    it(`never coerces request object ${String(key)}`, async () => {
      let coerced = 0;
      const value = {
        [key]: () => {
          coerced++;
          throw new Error('coercion-secret');
        },
      };
      assert.equal(requestString(value), undefined);
      assert.equal(requestStrings(value), undefined);
      assert.equal(requestText(value), undefined);
      assert.equal(requestText(['2.0', value]), undefined);
      const language = await resolveLanguage({
        query: value,
        session: value,
        languages: async () => [{ code: 'en', displayName: 'English' }],
      });
      assert.equal(language.language, 'en');
      assert.equal(coerced, 0);
    });
  it('copies string arrays and retains negotiation semantics without their own coercion hooks', () => {
    const strings = ['2.0'];
    strings.toString = () => {
      throw new Error('array-secret');
    };
    assert.deepEqual(requestStrings(strings), ['2.0']);
    assert.equal(requestText(strings), '2.0');
    for (const value of [null, 2, true, [['2.0']], ['2.0', {}]]) assert.equal(requestStrings(value), undefined);
  });
  for (const validation of [false, true])
    it(`preserves typed version-header precedence, validation=${validation}`, async () => {
      const r = route('/versions');
      const f = await securityFixture(true, {
        routes: [{ ...r, declaration: { ...r.declaration, access: { kind: 'public' } } }],
        beforeSecurity(req) {
          (req.headers as any)['x-redbox-api-version'] = { toString: 'constructor' };
        },
        action: (req, reply) =>
          validation
            ? sendApiValidationErrors(req, reply, [{ path: 'value', message: 'Invalid input' }])
            : sendApiErrors(req, reply, 400, [{ detail: 'Invalid input' }]),
      });
      try {
        const response = await rawRequest(f.url + '/versions?apiVersion=2.0', 'POST', 'application/json', '{}');
        assert.equal(response.status, 400);
        assert.deepEqual(
          JSON.parse(response.text),
          validation
            ? { errors: [{ title: 'value', detail: 'Invalid input' }], meta: {} }
            : { message: 'Invalid input', details: '' }
        );
      } finally {
        await f.close();
      }
    });
  for (const method of ['POST', 'HEAD'])
    for (const throwingLog of [false, true])
      it(`publishes an unconditional fallback for a throwing negotiation dependency, ${method}, log throws=${throwingLog}`, async () => {
        const dependency = require('../../../src/http/apiResponses') as typeof import('../../../src/http/apiResponses');
        const stub = sinon
          .stub(dependency, 'apiVersion')
          .throws(new Error('dependency-secret password=credential-secret'));
        const messages: string[] = [];
        const r = route('/fallback');
        const f = await securityFixture(true, {
          routes: [{ ...r, declaration: { ...r.declaration, method: 'all', access: { kind: 'public' } } }],
          observers: {
            log: message => {
              messages.push(message);
              if (throwingLog) throw new Error('log-secret');
            },
          },
          action: () => {
            throw new Error('domain-secret');
          },
        });
        try {
          const response = await rawRequest(
            f.url + '/fallback?apiVersion[toString]=constructor',
            method,
            'application/json',
            '{}'
          );
          assert.equal(response.status, 500);
          assert.equal(response.text, method === 'HEAD' ? '' : '{"error":"internal-server-error"}');
          assert.equal(
            response.headers['content-length'],
            String(Buffer.byteLength('{"error":"internal-server-error"}'))
          );
          assert.equal(response.headers['cache-control'], 'no-cache, private');
          assert(messages.length && messages.every(message => message === 'HTTP request failed'));
          assert(!JSON.stringify([response, messages, f.logs]).includes('secret'));
        } finally {
          await f.close();
          stub.restore();
        }
      });
  for (const key of [...keys, Symbol.toPrimitive])
    for (const field of [
      'apiVersion',
      'accept',
      '_csrf',
      'origin',
      'authorization',
      'branding',
      'portal',
      'x-requested-with',
      'x-redbox-api-version',
      'sec-fetch-site',
    ])
      it(`rejects/ignores collaborator-injected ${field} object ${String(key)} without coercion`, async () => {
        let coerced = 0;
        const value = {
          [key]: () => {
            coerced++;
            throw new Error('injected-secret');
          },
        };
        const r = route();
        const browser = field === 'accept';
        const f = await securityFixture(true, {
          routes: [
            {
              ...r,
              declaration: {
                ...r.declaration,
                access: browser
                  ? { kind: 'policies', names: ['brandingandportal', 'browseractor', 'browserauthenticated'] }
                  : r.declaration.access,
                csrf: true,
              },
            },
          ],
          beforeSecurity(req: FastifyRequest) {
            if (field === 'apiVersion') (req.query as any).apiVersion = value;
            else if (field === '_csrf') (req.body as any)._csrf = value;
            else if (field === 'branding' || field === 'portal') (req.params as any)[field] = value;
            else (req.headers as any)[field] = value;
          },
        });
        try {
          const response = await rawRequest(
            f.url + '/default/rdmp/api/probe',
            'POST',
            'application/json',
            '{}',
            browser || field === 'authorization' ? {} : { Authorization: 'Bearer good' }
          );
          assert.equal(
            response.status,
            browser ? 302 : ['branding', 'portal'].includes(field) ? 404 : field === 'authorization' ? 401 : 403
          );
          assert.equal(coerced, 0);
          assert(!JSON.stringify([response, f.logs]).includes('secret'));
        } finally {
          await f.close();
        }
      });
});
