import assert from 'node:assert/strict';
import { securityFixture } from './securityFixture';
import { FastifyHost } from '../../../src/http/fastify/FastifyHost';
import { ApplicationRuntime } from '../../../src/application';
import { nothingLogger } from '@researchdatabox/sails-ng-common';
import { rawRequest } from './securityFixture';

describe('FM-019 conditional refusal headers at the safe response boundary', function () {
  for (const failure of ['none', 'action', 'serializer'])
    it(`preserves representation headers only for an intentional refusal: ${failure}`, async () => {
      const tag = '"rb-record-v1.1.5T056hJYoSjPnPD7a22moMHouKRUesm6DULoAzsE3sk"';
      const link = '</default/rdmp/api/records/schemas/sha256:abc>; rel="describedby"';
      const f = await securityFixture(true, {
        action: (_request, reply) => {
          reply.header('ETag', tag).header('Link', link);
          if (failure === 'action') throw new Error('provider-credential-secret');
          if (failure === 'serializer')
            reply.serializer(() => {
              throw new Error('serializer-credential-secret');
            });
          return reply.code(412).send({ errors: [{ code: 'record-revision-stale' }] });
        },
      });
      try {
        const response = await fetch(f.url + '/default/rdmp/api/probe', {
          method: 'POST',
          headers: { Authorization: 'Bearer good' },
        });
        assert.equal(response.status, failure === 'none' ? 412 : 500);
        assert.equal(response.headers.get('etag'), failure === 'none' ? tag : null);
        assert.equal(response.headers.get('link'), failure === 'none' ? link : null);
        assert(!(await response.text()).includes('credential-secret'));
      } finally {
        await f.close();
      }
    });
});

describe('FM-019 empty denial framing through owned send hooks', function () {
  for (const callback of [false, true])
    for (const replacement of ['unchanged', 'text', 'producer'] as const)
      it(`${callback ? 'callback' : 'async'} hook sees an absent entity and ${replacement} stays guarded`, async () => {
        const seen: unknown[] = [];
        let consumed = 0;
        const producer = { pipe: () => consumed++, resume: () => consumed++ };
        const host = new FastifyHost(new ApplicationRuntime({ config: {}, log: nothingLogger }, []), {
          hostname: '127.0.0.1',
          port: 0,
          prepare: async app => {
            const value = () => (replacement === 'text' ? 'Denied' : replacement === 'producer' ? producer : undefined);
            if (callback)
              app.addHook('onSend', (_request, _reply, payload, done) => {
                seen.push(payload);
                done(null, value());
              });
            else
              app.addHook('onSend', async (_request, _reply, payload) => {
                seen.push(payload);
                return value();
              });
            app.get('/denial', async (_request, reply) => reply.code(403).send());
          },
        });
        try {
          await host.initialize();
          await host.activate();
          const result = await rawRequest('http://127.0.0.1:' + host.address()!.port + '/denial', 'GET');
          assert.equal(result.status, replacement === 'producer' ? 500 : 403);
          assert.equal(
            result.text,
            replacement === 'text'
              ? 'Denied'
              : replacement === 'unchanged'
                ? ''
                : '{"message":"Internal server error","details":""}'
          );
          assert.deepEqual(seen, [undefined]);
          assert.equal(consumed, 0);
          if (replacement === 'unchanged') {
            assert.equal(result.headers['content-length'], undefined);
            assert.equal(result.headers['transfer-encoding'], 'chunked');
          }
        } finally {
          await host.stop();
        }
      });
});
