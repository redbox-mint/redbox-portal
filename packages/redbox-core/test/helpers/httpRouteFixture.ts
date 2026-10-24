import express, { type Router, type RequestHandler } from 'express';
import { once } from 'node:events';
import { createHttpPolicies } from '../../src/http/express/policies';
import { httpBodyParser, httpErrorHandler } from '../../src/http/express/middleware';
import { httpPolicyFixture } from './httpPolicyFixture';
import { createSinonStubLogger } from '../logger.test';
import * as sinon from 'sinon';

/** Real local HTTP dispatch through the actual route mount and actor/context policies. */
export async function httpRouteFixture(
  mount: (
    router: Router,
    input: {
      policies: ReturnType<typeof createHttpPolicies>;
      policyConfiguration: { '*': string[] };
      csrf: { protect: RequestHandler; apiProtect: RequestHandler };
      log: ReturnType<typeof createSinonStubLogger>;
    }
  ) => void
) {
  const context = httpPolicyFixture();
  context.authenticate.resolves({
    ...context.actor,
    roles: [{ id: 'admin-role', brandId: context.brand.id, name: 'Admin' }],
  });
  const log = createSinonStubLogger(sinon);
  const permit: RequestHandler = (_req, _res, next) => next();
  const app = express();
  app.set('query parser', 'extended');
  app.use(httpBodyParser());
  const router = express.Router();
  const input = {
    policies: createHttpPolicies(context.input),
    policyConfiguration: { '*': ['brandingAndPortal', 'isWebServiceAuthenticated', 'brandActor', 'checkAuth'] },
    csrf: { protect: permit, apiProtect: permit },
    log,
  };
  mount(router, input);
  app.use(router);
  app.use(httpErrorHandler(log));
  const server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Missing test listener');
  const url = `http://127.0.0.1:${address.port}`;
  return {
    ...context,
    log,
    url,
    async request(path: string, options: { method?: string; body?: unknown; headers?: Record<string, string> } = {}) {
      const response = await fetch(url + path, {
        method: options.method ?? 'GET',
        headers: { ...(options.body === undefined ? {} : { 'Content-Type': 'application/json' }), ...options.headers },
        ...(options.body === undefined ? {} : { body: JSON.stringify(options.body) }),
      });
      const text = await response.text();
      return {
        status: response.status,
        headers: response.headers,
        text,
        body: text && response.headers.get('content-type')?.includes('json') ? JSON.parse(text) : text || undefined,
      };
    },
    close: () => new Promise<void>((resolve, reject) => server.close(error => (error ? reject(error) : resolve()))),
  };
}
