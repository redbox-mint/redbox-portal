import { expect } from 'chai';
import express from 'express';
import supertest from 'supertest';
import { createHttpPolicies } from '../../src/http/express/policies';
import { mountCompanionRoutes } from '../../src/http/express/companion';
import type { CompanionUploads } from '../../src/http/express/companion';
import type { AuthenticatedActor } from '../../src/http/express/identity';

// Exercise the real provider mount and selected HTTP policies. Only remote
// transfer delivery is stubbed; authentication, brand membership and path rules run.
describe('owned Companion authorization', () => {
  let authenticated: boolean;
  let branding: string | undefined;
  let matchingRule: boolean;
  let allowed: boolean;
  let roles: AuthenticatedActor['roles'];
  const brand = { id: 'brand-default', name: 'default' };
  beforeEach(() => {
    authenticated = false;
    branding = 'default';
    matchingRule = false;
    allowed = true;
    roles = [{ id: 'researcher', brandId: brand.id, name: 'Researcher' }];
  });
  function request() {
    const app = express();
    const policies = createHttpPolicies({
      branding: { getBrand: async () => brand },
      portals: ['rdmp'],
      pathRules: {
        getRulesFromPath: () => (matchingRule ? ([{}] as never) : null),
        canRead: () => allowed,
      },
      defaultUnauthenticatedRole: () => undefined,
      emitRequestFailure: async () => {},
      authenticate: async () => (authenticated ? { id: 'user', username: 'researcher', roles } : false),
    });
    mountCompanionRoutes(app, {
      path: '/companion',
      appUrl: 'https://portal.example.edu/default/rdmp',
      context: () => (branding ? { branding, portal: 'rdmp' } : undefined),
      uploads: { handle: (_req, res) => res.json({ delivered: true }) } as CompanionUploads,
      policies,
      policyConfiguration: { '*': true },
      csrf: { apiProtect: (_req, _res, next) => next() },
      audit: async () => {},
    });
    app.get('/record/view/123', (_req, res) => res.json({ publicPage: true }));
    return supertest(app);
  }
  it('allows non-companion requests without applying provider authentication', async () => {
    expect((await request().get('/record/view/123').expect(200)).body).to.deep.equal({ publicPage: true });
  });
  it('rejects unauthenticated companion requests with 401', async () => {
    const response = await request().get('/companion/drive/list/root').expect(401);
    expect(response.body).to.deep.equal({ message: 'Authentication required', details: '' });
    expect(response.headers['www-authenticate']).to.equal('Bearer');
  });
  it('rejects authenticated companion requests with missing branding context', async () => {
    authenticated = true;
    branding = undefined;
    await request().get('/companion/drive/list/root').expect(403);
  });
  it('allows authenticated brand members when no companion path rule matches', async () => {
    authenticated = true;
    expect((await request().get('/companion/drive/list/root').expect(200)).body).to.deep.equal({ delivered: true });
  });
  it('rejects authenticated companion requests when the matching rule denies access', async () => {
    authenticated = true;
    matchingRule = true;
    allowed = false;
    await request().get('/companion/drive/list/root').expect(403);
  });
  it('allows authenticated companion requests when the matching rule grants access', async () => {
    authenticated = true;
    matchingRule = true;
    expect((await request().get('/companion/drive/list/root').expect(200)).body).to.deep.equal({ delivered: true });
  });
  it('delivers the popup callback only after actor and brand authorization', async () => {
    await request().get('/companion/drive/send-token').expect(401);
    authenticated = true;
    const response = await request().get('/companion/drive/send-token').expect(200);
    expect(response.headers['content-type']).to.include('text/html');
    expect(response.headers['cache-control']).to.equal('no-cache, no-store, must-revalidate');
    expect(response.headers['content-security-policy']).to.include("default-src 'none'");
    expect(response.text).to.include('companion-send-token-config').and.include('https://portal.example.edu');
    expect(response.text).to.include("config.secureCookie?'; Secure':''");
    roles = [];
    await request().get('/companion/drive/send-token').expect(403);
  });
  it('requires brand membership even when path rules allow access', async () => {
    authenticated = true;
    roles = [{ id: 'other-brand', brandId: 'other-brand', name: 'Admin' }];
    await request().get('/companion/drive/list/root').expect(403);
  });
});
