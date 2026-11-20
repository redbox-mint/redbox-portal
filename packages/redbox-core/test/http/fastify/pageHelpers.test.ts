import assert from 'node:assert/strict';
import type { FastifyRequest, FastifyReply } from 'fastify';
import { HttpFailure, safeHttpErrorStatus } from '../../../src/http/fastify/errorBoundary';
import { pagePreparationFailure, nativePageRenderingFacts } from '../../../src/http/fastify/pages';
import { resolveRequestBrand } from '../../../src/http/context';
import type { PageRenderingInput } from '../../../src/pages/rendering';
import { applyPageHeaders } from '../../../src/pages/headers';

describe('FM-029 shared page boundaries', () => {
  for (const status of [400, 403, 404])
    it(`preserves typed ${status} guards before generic page mapping`, () => {
      const failure = new HttpFailure(status);
      assert.throws(
        () => pagePreparationFailure({} as FastifyRequest, {} as FastifyReply, failure),
        error => error === failure
      );
      assert.equal(safeHttpErrorStatus(failure), status);
    });
  it('reads replaced query, body and params when the page is invoked after hooks', () => {
    const request = {
      raw: { url: '/portal/default/rdmp/home?old=value' },
      url: '/portal/default/rdmp/home?old=value',
      params: {},
      query: {},
      body: undefined,
      headers: { accept: 'text/html' },
      session: {},
    } as unknown as FastifyRequest;
    resolveRequestBrand(request, { id: 'brand', name: 'default' }, 'rdmp');
    request.params = { branding: 'default', portal: 'rdmp', recordType: 'hook-type' };
    request.query = { lng: 'fr' };
    request.body = { oid: 'hook-oid' };
    const facts = nativePageRenderingFacts(request, { rootContext: '/portal' } as PageRenderingInput, () => 'csrf');
    assert.strictEqual(facts.routeParameters, request.params);
    assert.strictEqual(facts.queryValues, request.query);
    assert.strictEqual(facts.bodyValues, request.body);
    assert.equal(facts.relativeTarget, '/default/rdmp/home?old=value');
    assert.equal(facts.requestTarget, '/portal/default/rdmp/home?old=value');
    assert.equal(facts.context.brand.id, 'brand');
    assert(facts.acceptsHtml());
  });
  it('does not turn a missing hashed artifact into public cacheable content', () => {
    const headers: Record<string, string> = {};
    const response = {
      set(name: string | Record<string, string>, value?: string) {
        typeof name === 'string' ? (headers[name] = value!) : Object.assign(headers, name);
      },
      removeHeader(name: string) {
        delete headers[name];
      },
    };
    applyPageHeaders({ path: '/js/main-12345678.js' }, response, {
      publicUrl: 'http://canonical.invalid',
      sessionMaxAgeMs: 60000,
    });
    assert.equal(headers['Cache-Control'], 'max-age=60, private');
    assert.equal(headers['Cross-Origin-Opener-Policy'], undefined);
    applyPageHeaders({ path: '/js/main-12345678.js' }, response, { publicUrl: 'https://canonical.invalid' }, true);
    assert.equal(headers['Cache-Control'], 'public, max-age=31536000, immutable');
    assert.equal(headers['Cross-Origin-Opener-Policy'], 'same-origin-allow-popups');
    assert.equal(headers.Pragma, undefined);
  });
});
