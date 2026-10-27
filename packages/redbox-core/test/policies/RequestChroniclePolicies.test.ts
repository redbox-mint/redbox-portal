import assert from 'node:assert/strict';
import { inspect } from 'node:util';
import { httpRouteFixture } from '../helpers/httpRouteFixture';
import { httpRequestChronicle } from '../../src/http/express/middleware';
import { applyPageHeaders } from '../../src/http/express/pageHeaders';
import { pageCsp } from '../../src/pages/csp';

describe('Policy logging privacy through actual request observations', () => {
  for (const policy of ['checkauth', 'csp', 'nocache', 'page-cache']) {
    it(`${policy} retains a safe diagnostic path without changing a preview request`, async () => {
      const token = 'PRIVATE-PREVIEW-TOKEN';
      const path = `/default/portal/preview/${token}.css`;
      let observedPath: string | undefined;
      const f = await httpRouteFixture((router, input) => {
        router.use(httpRequestChronicle(input.log, { successSampleRate: 1, successSampleExcludePattern: '' }));
        router.get(
          '/:branding/:portal/preview/:token.css',
          input.policies.brandingandportal,
          ...(policy === 'checkauth' || policy === 'nocache' ? [input.policies[policy]] : []),
          (req, res) => {
            observedPath = req.path;
            if (policy === 'csp') {
              const csp = pageCsp({
                pathname: req.path,
                appUrl: 'https://portal.example.edu',
                environment: 'production',
              })!;
              res.set(csp.headerName, csp.headerValue);
            }
            if (policy === 'page-cache') applyPageHeaders(req, res, { sessionMaxAgeMs: 60000 });
            res.json({ ok: true });
          }
        );
      });
      try {
        const result = await f.request(path);
        assert.equal(result.status, 200);
        assert.equal(observedPath, path);
        if (policy === 'csp') assert(result.headers.get('content-security-policy'));
        if (policy === 'nocache') assert.match(result.headers.get('cache-control')!, /no-store/);
        if (policy === 'page-cache') assert.equal(result.headers.get('cache-control'), 'max-age=60, private');
        const output = inspect(
          ['error', 'warn', 'info', 'verbose'].flatMap(level => f.log[level].getCalls().map(call => call.args)),
          { depth: null }
        );
        assert(!output.includes(token));
        assert(output.includes('/default/portal/preview/REDACTED.css'));
      } finally {
        await f.close();
      }
    });
  }
});
