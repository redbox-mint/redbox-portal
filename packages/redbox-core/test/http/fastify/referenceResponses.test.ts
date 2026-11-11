import assert from 'node:assert/strict';
import { nothingLogger } from '@researchdatabox/sails-ng-common';
import { ApplicationRuntime } from '../../../src/application';
import { FastifyHost } from '../../../src/http/fastify/FastifyHost';
import { sendSerializedJson } from '../../../src/http/fastify/responses';
import { safeApiVersion, safeValidationApiVersion } from '../../../src/http/apiResponses';
import { executeReferenceRead, jsonResult, type ReferenceRequest } from '../../../src/http/actions/reference';
import { rawRequest } from './securityFixture';

describe('FM-023 shared serialized JSON freshness', function () {
  const modified = 'Wed, 01 Jan 2025 00:00:00 GMT';
  const etag = '"fm023-response"';
  let host: FastifyHost;
  let url: string;
  before(async () => {
    host = new FastifyHost(new ApplicationRuntime({ config: {}, log: nothingLogger }, []), {
      hostname: '127.0.0.1',
      port: 0,
      prepare: async app => {
        app.route({
          method: ['GET', 'HEAD'],
          url: '/json',
          handler: async (request, reply) =>
            sendSerializedJson(request, reply, {
              status: request.headers['x-error'] ? 400 : 200,
              headers: {
                ETag: etag,
                'Last-Modified': modified,
                'Content-Length': '11',
                'Content-Type': 'application/json',
              },
              json: '{"ok":true}',
            }),
        });
      },
    });
    await host.initialize();
    await host.activate();
    url = 'http://127.0.0.1:' + host.address()!.port + '/json';
  });
  after(async () => {
    await host?.stop();
  });
  for (const method of ['GET', 'HEAD'])
    for (const [name, headers, status] of [
      ['etag wildcard match', { 'If-None-Match': '*' }, 304],
      ['etag exact match', { 'If-None-Match': etag }, 304],
      ['etag weak match', { 'If-None-Match': 'W/' + etag }, 304],
      ['etag mismatch', { 'If-None-Match': '"other"' }, 200],
      ['modified date match', { 'If-Modified-Since': modified }, 304],
      ['modified date newer', { 'If-Modified-Since': 'Wed, 01 Jan 2100 00:00:00 GMT' }, 304],
      ['modified date older', { 'If-Modified-Since': 'Sat, 01 Jan 2000 00:00:00 GMT' }, 200],
      ['invalid modified date', { 'If-Modified-Since': 'invalid' }, 200],
      ['both validators match', { 'If-None-Match': etag, 'If-Modified-Since': modified }, 304],
      ['etag mismatch with matching date', { 'If-None-Match': '"other"', 'If-Modified-Since': modified }, 200],
      [
        'matching etag takes date precedence',
        { 'If-None-Match': etag, 'If-Modified-Since': 'Sat, 01 Jan 2000 00:00:00 GMT' },
        304,
      ],
      ['no-cache forces response', { 'If-None-Match': '*', 'Cache-Control': 'no-cache' }, 200],
      ['error remains error', { 'If-None-Match': '*', 'x-error': 'true' }, 400],
    ] as const)
      it(`${method}: ${name}`, async () => {
        const value = await rawRequest(url, method, undefined, undefined, { ...headers });
        assert.equal(value.status, status);
        assert.equal(value.text, status === 304 || method === 'HEAD' ? '' : '{"ok":true}');
        assert.equal(value.headers.etag, etag);
        assert.equal(value.headers['last-modified'], status === 400 ? undefined : modified);
        if (status === 304)
          for (const header of ['content-type', 'content-length', 'transfer-encoding'])
            assert.equal(value.headers[header], undefined);
      });
});

describe('FM-023 version extraction and total reference fallback', () => {
  for (const key of Object.getOwnPropertyNames(Object.prototype))
    it(`does not coerce a version object with ${key}`, () => {
      let calls = 0;
      const value = {
        [key]: 'constructor',
        [Symbol.toPrimitive]: () => {
          calls++;
          throw new Error('coercion');
        },
      };
      const input = { headers: { 'x-redbox-api-version': '2.0' }, query: { apiVersion: value } };
      assert.equal(safeApiVersion(input), '1.0');
      assert.equal(safeValidationApiVersion(input), '2.0');
      assert.equal(calls, 0);
    });
  it('copies string arrays and preserves conflict and validation semantics', () => {
    const values = ['2.0'];
    values.toString = () => {
      throw new Error('request array conversion');
    };
    assert.equal(safeApiVersion({ query: { apiVersion: values } }), '2.0');
    assert.equal(safeValidationApiVersion({ query: { apiVersion: values } }), '1.0');
    assert.equal(safeApiVersion({ query: { apiVersion: ['2.0', '1.0'] } }), '1.0');
    assert.equal(safeApiVersion({ query: { apiVersion: ['2.0', { toString: 'constructor' }] } }), '1.0');
  });
  for (const location of ['query', 'headers'] as const)
    it(`keeps fallback construction safe when ${location} access throws`, async () => {
      const req: ReferenceRequest = {
        params: {},
        query: {},
        context: Object.freeze({ brand: { id: 'brand' }, portal: 'rdmp' }),
      };
      Object.defineProperty(req, location, {
        get() {
          throw new Error('secret request accessor');
        },
      });
      const result = await executeReferenceRead(req, {}, async () => {
        throw new URIError('secret action');
      });
      // Extraction fails before the action; fallback construction must stay total.
      assert.equal(result.status, 500);
      assert.equal(result.json, '{"message":"Internal server error","details":""}');
    });
  it('returns a sanitized fallback when both response encoding and version coercion would fail', async () => {
    let serializations = 0;
    const req: ReferenceRequest = {
      params: {},
      query: { apiVersion: { toString: 'constructor' } },
      context: Object.freeze({ brand: { id: 'brand' }, portal: 'rdmp' }),
    };
    const result = await executeReferenceRead(req, {}, async () =>
      jsonResult({
        toJSON() {
          serializations++;
          throw new Error('secret response accessor');
        },
      })
    );
    assert.equal(serializations, 1);
    assert.equal(result.status, 500);
    assert.equal(result.json, '{"message":"Internal server error","details":""}');
  });
});
