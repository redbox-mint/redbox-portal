import assert from 'node:assert/strict';
import { httpPagesFixture } from '../helpers/httpPagesFixture';
import { preparePage } from '../../src/http/express/pages';
import { bindHttpPolicies } from '../../src/http/express/policies';
import { httpAction, recordHttpFailure } from '../../src/http/express/middleware';
import { sendApiData, sendApiErrors } from '../../src/http/express/responses';
import { RequestChronicleHelper } from '../../src/utilities/RequestChronicle';

describe('owned HTTP response contracts', function () {
  let f: Awaited<ReturnType<typeof httpPagesFixture>>;
  before(async () => {
    f = await httpPagesFixture((pages, router) => {
      pages.translate = (_brand, _language, key) => (key === 'default-title' ? 'Response Site' : key);
      router.get(
        '/:branding/:portal/__response/:status',
        ...bindHttpPolicies(['brandingandportal', 'browseractor', 'checkauth'], pages.policies),
        httpAction(async (req, res) => {
          const status = Number(req.params.status);
          if (req.query.page === 'true') {
            const page = await preparePage(req, res, pages);
            page.error(status as 403 | 404 | 500, { message: 'Safe response', detailedMessage: '' });
          } else if (status < 400) sendApiData(req, res, { id: 1 }, status);
          else sendApiErrors(req, res, status, [{ detail: 'Safe response' }]);
        })
      );
    });
  });
  after(async () => f?.close());
  const request = (status: number, query = '', headers: Record<string, string> = {}) =>
    f.request('/default/portal/__response/' + status + query, { headers });
  for (const status of [200, 201]) {
    it(`returns JSON data and explicit ${status} status`, async () => {
      const response = await request(status);
      assert.equal(response.status, status);
      assert.deepEqual(response.body, { id: 1 });
    });
  }
  for (const status of [400, 403, 404, 500]) {
    for (const version of ['1.0', '2.0']) {
      it(`retains ${status} JSON envelope for API version ${version}`, async () => {
        const response = await request(status, '', { 'X-ReDBox-Api-Version': version });
        assert.equal(response.status, status);
        assert.deepEqual(
          response.body,
          version === '1.0'
            ? { message: 'Safe response', details: '' }
            : { errors: [{ detail: 'Safe response' }], meta: {} }
        );
      });
    }
  }
  for (const status of [403, 404, 500]) {
    it(`renders the branded ${status} HTML view with the scoped site title`, async () => {
      const response = await request(status, '?page=true', { Accept: 'text/html' });
      assert.equal(response.status, status);
      assert.match(response.text, /<title>\s*Response Site\s*<\/title>/);
      assert.match(response.text, status === 404 ? /Page Not Found!/ : new RegExp('error-' + status + '-heading'));
      assert.match(response.headers.get('content-type')!, /text\/html/);
    });
    it(`retains the ${status} page status for a JSON accept header`, async () => {
      const response = await request(status, '?page=true', { Accept: 'application/json' });
      assert.equal(response.status, status);
      assert.doesNotMatch(response.text, /<!doctype|<html/i);
    });
  }
  it('sets no-cache headers on a successful API response', async () => {
    assert.match((await request(200)).headers.get('cache-control')!, /no-cache/);
  });
  it('sets no-cache headers on a failed API response', async () => {
    assert.match((await request(500)).headers.get('cache-control')!, /no-cache/);
  });
  it('keeps explicit route rendering independent of framework view guessing', async () => {
    const response = await f.request('/default/portal/admin/api-docs', { headers: { Accept: 'text/html' } });
    assert.equal(response.status, 200);
    assert.match(response.text, /<!doctype html>/i);
  });
  it('logs a safe operation failure immediately without a request chronicle', () => {
    f.log.error.resetHistory();
    recordHttpFailure({} as never, f.log, 'Safe operation failed');
    assert.equal(f.log.error.calledOnceWithExactly('Safe operation failed'), true);
  });
  it('records a safe operation failure in the request chronicle without a separate log', () => {
    f.log.error.resetHistory();
    const req = {} as never;
    const chronicle = RequestChronicleHelper.fromReq(f.log, req, { generateRequestId: () => 'response-test' });
    chronicle.start();
    recordHttpFailure(req, f.log, 'Safe operation failed', { responseHandler: 'owned-http' });
    assert.equal(f.log.error.called, false);
    assert.equal(chronicle.data.responseHandler, 'owned-http');
    assert.equal(chronicle.data.errors?.[0]?.message, 'Safe operation failed');
  });
});
