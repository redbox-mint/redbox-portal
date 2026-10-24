import type { Request, Response } from 'express';
import * as sinon from 'sinon';
import { createHttpPolicies, type HttpPolicyInput } from '../../src/http/express/policies';
import type { AuthenticatedActor } from '../../src/http/express/identity';

/** Local ports for exercising the actual Express policy chain, with observable HTTP output. */
export function httpPolicyFixture() {
  const brand = { id: 'brand-1', name: 'default' };
  const actor: AuthenticatedActor = {
    id: 'user-1',
    username: 'alice',
    roles: [{ id: 'role-1', brandId: brand.id, name: 'Researcher' }],
  };
  const getBrand = sinon.stub().resolves(brand);
  const authenticate = sinon.stub().resolves(actor);
  const getRulesFromPath = sinon.stub().returns(undefined);
  const canRead = sinon.stub().returns(true);
  const emitRequestFailure = sinon.stub().resolves();
  const defaultUnauthenticatedRole = sinon.stub().returns(undefined);
  const input: HttpPolicyInput = {
    branding: { getBrand },
    pathRules: { getRulesFromPath, canRead },
    portals: ['portal', 'other'],
    authenticate,
    defaultUnauthenticatedRole,
    emitRequestFailure,
  };
  const policies = createHttpPolicies(input);
  const headers: Record<string, string> = {};
  const req = {
    params: { branding: 'default', portal: 'portal' },
    headers: {},
    path: '/default/portal/page',
    originalUrl: '/default/portal/page',
    session: {},
    route: { path: '/:branding/:portal/page' },
    get(name: string) {
      return headersIn[name.toLowerCase()];
    },
  } as unknown as Request;
  const headersIn = req.headers as Record<string, string>;
  const response = {
    status: sinon.stub().returnsThis(),
    json: sinon.stub().returnsThis(),
    end: sinon.stub().returnsThis(),
    redirect: sinon.stub().returnsThis(),
    type: sinon.stub().returnsThis(),
    setHeader: sinon.spy((name: string, value: string) => {
      headers[name.toLowerCase()] = value;
    }),
    set: sinon.spy((name: string | Record<string, string>, value?: string) => {
      for (const [key, item] of Object.entries(typeof name === 'string' ? { [name]: value! } : name))
        headers[key.toLowerCase()] = item;
      return response;
    }),
  };
  const res = response as unknown as Response;
  const next = sinon.stub();
  async function run(...names: string[]) {
    for (const name of names) {
      next.resetHistory();
      await policies[name](req, res, next);
      if (!next.called) break;
      if (next.firstCall.args[0]) throw next.firstCall.args[0];
    }
  }
  return {
    brand,
    actor,
    input,
    req,
    res,
    response,
    headers,
    next,
    run,
    getBrand,
    authenticate,
    getRulesFromPath,
    canRead,
    emitRequestFailure,
    defaultUnauthenticatedRole,
  };
}
