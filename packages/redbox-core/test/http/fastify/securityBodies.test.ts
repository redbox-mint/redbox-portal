import assert from 'node:assert/strict';
import iconv from 'iconv-lite';
import MongoStore from 'connect-mongo';
import { NativeMongoSessionStore } from '../../../src/http/fastify/session';
import { nativeClientErrors, safeHttpErrorStatus } from '../../../src/http/fastify/responses';
import { inventory, inventoryRegistration } from './inventory-fixture';
import { securityFixture, route, rawRequest } from './securityFixture';
import { productionSecurityFixture } from './securityProductionFixture';

const variants = [
  ...['toString', 'valueOf', 'Symbol.toPrimitive'].flatMap(
    key =>
      [
        [
          'nested json ' + key,
          'application/json',
          JSON.stringify({ apiVersion: { [key]: 'constructor' }, _csrf: { [key]: 'constructor' } }),
        ],
        [
          'nested form ' + key,
          'application/x-www-form-urlencoded',
          `apiVersion[${key}]=constructor&_csrf[${key}]=constructor`,
        ],
      ] as const
  ),
  ['json token', 'application/json', '{"access_token":"pilot-api-token"}'],
  ['form token', 'application/x-www-form-urlencoded', 'access_token=pilot-api-token'],
  [
    'multipart',
    'multipart/form-data; boundary=fm016',
    '--fm016\r\nContent-Disposition: form-data; name="access_token"\r\n\r\npilot-api-token\r\n--fm016--\r\n',
  ],
  ['empty invalid type', '', '{}'],
  ['malformed form escape', 'application/x-www-form-urlencoded', 'access_token=%ZZ'],
  [
    'too many form fields',
    'application/x-www-form-urlencoded',
    Array.from({ length: 1001 }, (_, index) => 'k' + index + '=v').join('&'),
  ],
  ['oversized unparsed text', 'text/plain', 'x'.repeat(1024 * 1024 + 1)],
  ['text', 'text/plain', '{"access_token":"pilot-api-token"}'],
  ['invalid type', 'nonsense', '{"access_token":"pilot-api-token"}'],
  ['missing type', undefined, '{"access_token":"pilot-api-token"}'],
  ['malformed json', 'application/json', '{"password":"secret-body",'],
  ['oversized json', 'application/json', '{"secret":"' + 'x'.repeat(1024 * 1024) + '"}'],
  ['oversized form', 'application/x-www-form-urlencoded', 'secret=' + 'x'.repeat(1024 * 1024)],
  ['empty json', 'application/json', ''],
  ['utf8 json', 'application/json; charset=UTF-8', '{"access_token":"pilot-api-token"}'],
  ['utf16 json', 'application/json; charset=utf-16le', iconv.encode('{"access_token":"pilot-api-token"}', 'utf-16le')],
  ['latin1 json denied', 'application/json; charset=iso-8859-1', '{}'],
  ['latin1 form', 'application/x-www-form-urlencoded; charset=iso-8859-1', 'access_token=pilot-api-token'],
  ['unsupported form charset', 'application/x-www-form-urlencoded; charset=utf-16le', 'x=y'],
  ['unknown json charset', 'application/json; charset=utf-secret', '{}'],
  ['quoted charset', 'application/json; charset="utf-8"', '{"access_token":"pilot-api-token"}'],
  ['bad charset syntax', 'application/json; charset=', '{}'],
  ['json suffix unparsed', 'application/vnd.test+json', '{"access_token":"pilot-api-token"}'],
] as const;

describe('FM-016 raw HTTP method/body differential against production Express', function () {
  this.timeout(45000);
  let oracle: Awaited<ReturnType<typeof productionSecurityFixture>>;
  const natives = new Map<string, Awaited<ReturnType<typeof securityFixture>>>();
  function selection(method: string) {
    const path = ['PATCH', 'OPTIONS'].includes(method)
      ? '/:branding/:portal/home'
      : ['PUT', 'DELETE'].includes(method)
        ? '/:branding/:portal/api/named-query/:name'
        : '/:branding/:portal/api/named-query';
    const verb = ['PATCH', 'OPTIONS'].includes(method) ? 'all' : method === 'HEAD' ? 'get' : method.toLowerCase();
    const row = inventory.routes.find(row => row.original.path === path && row.method === verb)!;
    return { row, target: path.replace(':branding', 'default').replace(':portal', 'rdmp').replace(':name', 'value') };
  }
  before(async () => {
    oracle = await productionSecurityFixture();
    for (const method of ['GET', 'POST', 'PUT', 'DELETE', 'PATCH']) {
      const { row } = selection(method);
      natives.set(
        method,
        await securityFixture(true, {
          routes: [inventoryRegistration(row)],
          mongo: true,
          productionRules: true,
          action: oracle.action(row),
        })
      );
    }
    natives.set('HEAD', natives.get('GET')!);
    natives.set('OPTIONS', natives.get('PATCH')!);
  });
  after(async () => {
    for (const native of new Set(natives.values())) await native.close();
    await oracle?.close();
  });
  for (const method of ['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'])
    for (const [name, type, body] of variants)
      it(`${method} ${name}`, async () => {
        const { target } = selection(method);
        const expected = await rawRequest(oracle.url + target, method, type, body);
        const actual = await rawRequest(natives.get(method)!.url + target, method, type, body);
        assert.equal(actual.status, expected.status);
        assert.equal(actual.text, expected.text);
        assert.equal(actual.headers['www-authenticate'], expected.headers['www-authenticate']);
        assert(!actual.text.includes('secret-body'));
      });

  for (const method of ['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'])
    for (const type of ['application/json; charset=utf-secret', 'application/x-www-form-urlencoded; charset=utf-16le'])
      it(`${method} unframed empty ${type}`, async () => {
        const { target } = selection(method);
        const expected = await rawRequest(oracle.url + target, method, type, '', {}, false);
        const actual = await rawRequest(natives.get(method)!.url + target, method, type, '', {}, false);
        assert.equal(actual.status, expected.status);
        assert.equal(actual.text, expected.text);
      });

  for (const capture of ['%ZZ', '%E0%A4%A', '%FF'])
    for (const method of ['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'])
      for (const [name, type, body] of variants)
        it(`${method} path fault ${capture} with ${name}`, async () => {
          const target = '/default/rdmp/api/named-query/' + capture;
          const expected = await rawRequest(oracle.url + target, method, type, body);
          // A matching path's decode failure must survive method misses too.
          const actual = await rawRequest(natives.get('PUT')!.url + target, method, type, body);
          assert.equal(actual.status, expected.status);
          assert.equal(actual.text, expected.text);
          assert(!actual.text.includes('secret-body'));
          const parserStatus =
            (name.includes('oversized') && !name.includes('unparsed')) || name === 'too many form fields'
              ? 413
              : ['latin1 json denied', 'unsupported form charset', 'unknown json charset'].includes(name)
                ? 415
                : 400;
          assert.equal(expected.status, parserStatus);
        });

  for (const method of ['GET', 'HEAD', 'POST', 'DELETE', 'OPTIONS'])
    it(`${method} malformed JSON beats a valid cookie and failing session read`, async () => {
      for (const [f, prototype] of [
        [oracle, MongoStore.prototype],
        [natives.get(method)!, NativeMongoSessionStore.prototype],
      ] as const) {
        const response = await fetch(f.url + '/csrfToken');
        await response.text();
        const cookie = response.headers.get('set-cookie')!.split(';')[0];
        let reads = 0;
        const original = prototype.get;
        prototype.get = ((_id: string, callback: (error: Error) => void) => {
          reads++;
          callback(new Error('session-secret'));
        }) as never;
        try {
          const malformed = await rawRequest(
            f.url + selection(method).target,
            method,
            'application/json',
            '{"password":"secret-body",',
            { Cookie: cookie }
          );
          assert.equal(malformed.status, 400);
          assert.equal(reads, 0);
          assert(!malformed.text.includes('secret'));
          const valid = await rawRequest(f.url + selection(method).target, method, 'application/json', '{}', {
            Cookie: cookie,
          });
          assert.equal(valid.status, 500);
          assert.equal(reads, 1, 'Fault injection must prove the cookie reaches a store read');
          const badPath = f.url + '/default/rdmp/api/named-query/%ZZ';
          const pathAndSessionFault = await rawRequest(badPath, method, 'application/json', '{}', { Cookie: cookie });
          assert.equal(pathAndSessionFault.status, 500, 'Session failure must precede malformed captures too');
          assert.equal(reads, 2);
          const allFaults = await rawRequest(badPath, method, 'application/json; charset=iso-8859-1', '{}', {
            Cookie: cookie,
          });
          assert.equal(allFaults.status, 415, 'Parser failure must precede both session and capture failures');
          assert.equal(reads, 2, 'Rejected input must not perform another session read');
        } finally {
          prototype.get = original as never;
        }
      }
    });
});

const registrationErrors = [
  'FST_ERR_CTP_ALREADY_PRESENT',
  'FST_ERR_CTP_INVALID_TYPE',
  'FST_ERR_CTP_EMPTY_TYPE',
  'FST_ERR_CTP_INVALID_HANDLER',
  'FST_ERR_CTP_INVALID_PARSE_TYPE',
  'FST_ERR_CTP_INSTANCE_ALREADY_STARTED',
  'FST_ERR_INVALID_URL',
];
describe('FM-016 pinned Fastify 5.12.8 input-error classification', function () {
  const codes = require('fastify').errorCodes;
  for (const [code, status] of Object.entries(nativeClientErrors))
    it(`${code} safely maps to ${status}`, async () => {
      assert(codes[code]);
      const error = Object.assign(new codes[code]('credential-secret'), { body: 'body-secret' });
      assert.equal(safeHttpErrorStatus(error), status);
      const registration = route('/error', 'post');
      const f = await securityFixture(true, {
        routes: [{ ...registration, declaration: { ...registration.declaration, access: { kind: 'public' } } }],
        action: () => {
          throw error;
        },
      });
      try {
        const result = await rawRequest(f.url + '/error', 'POST', 'application/json', '{"password":"request-secret"}');
        assert.equal(result.status, status);
        assert.deepEqual(
          JSON.parse(result.text),
          status === 404 ? { error: 'not-found' } : { message: 'Invalid request', details: '' }
        );
        assert(!JSON.stringify(f.logs).includes('secret'));
      } finally {
        await f.close();
      }
    });
  for (const code of registrationErrors)
    it(`${code} is a programmer error, safely maps to 500`, () => {
      assert.equal(safeHttpErrorStatus(new codes[code]('credential-secret')), 500);
    });
  it('exhaustively classifies the pinned content-type parser error namespace', () => {
    assert.equal(require('fastify/package.json').version, '5.12.8');
    assert.deepEqual(
      Object.keys(codes)
        .filter(code => code.startsWith('FST_ERR_CTP_'))
        .sort(),
      [...Object.keys(nativeClientErrors), ...registrationErrors].filter(code => code.startsWith('FST_ERR_CTP_')).sort()
    );
  });
  it('audits every exported native 4xx code, including misleading registration statuses', () => {
    const exported = Object.entries(codes)
      .filter(([, Constructor]) => {
        const error = new (Constructor as any)();
        return error.statusCode >= 400 && error.statusCode < 500;
      })
      .map(([code]) => code)
      .sort();
    assert.deepEqual(
      exported,
      [...Object.keys(nativeClientErrors), 'FST_ERR_CTP_INSTANCE_ALREADY_STARTED', 'FST_ERR_INVALID_URL'].sort()
    );
  });
  it('ignores untrusted domain status codes', () => {
    assert.equal(safeHttpErrorStatus(Object.assign(new Error('secret'), { statusCode: 400 })), 500);
  });
});
