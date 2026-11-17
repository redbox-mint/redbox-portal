import { expect } from 'chai';
import { readFileSync } from 'node:fs';
import { resolve as resolvePath } from 'node:path';
import * as sinon from 'sinon';
import { Controllers } from '../../src/controllers/AppConfigController';
import { Services as Branding } from '../../src/services/BrandingService';
import { authorizedEmailTestBody, testAuthorizedEmailRoute } from '../../src/api-routes/groups/appconfig';
import { buildCoreApiRouteConfig, validateApiRouteRequest } from '../../src/api-routes';
import { policies } from '../../src/config/policies.config';
import { checkAuth } from '../../src/policies/checkAuth';
import { Services as PathRules } from '../../src/services/PathRulesService';
import { auth } from '../../src/config/auth.config';
import { createMockSails } from '../services/testHelper';

const path = '/default/rdmp/admin/appconfig/authorizedDomainsEmails/test';
describe('Authorized email admin tester', () => {
  let previous: any;
  let controller: Controllers.AppConfig;
  let saved: any;
  let response: any;
  let resolve: sinon.SinonStub;
  beforeEach(() => {
    previous = (global as any).sails;
    saved = { enabled: true, domainsAaf: [' Uni.EDU.au. '], emailsOidc: [' Guest@Other.org '] };
    (global as any).sails = createMockSails();
    resolve = (global as any).sails.config.brandingAware = sinon.stub().callsFake((brand: string) => ({
      authorizedDomainsEmails: brand === 'default' ? saved : { enabled: true, domainsAaf: ['other.org'] },
    }));
    (global as any).sails.services.brandingservice = new Branding.Branding().exports();
    (global as any).sails.services.appconfigservice = { createOrUpdateConfig: sinon.stub() };
    controller = new Controllers.AppConfig();
    response = { json: sinon.stub(), badRequest: sinon.stub() };
  });
  afterEach(() => {
    sinon.restore();
    (global as any).sails = previous;
  });
  function check(body: any, branding = 'default') {
    controller.testAuthorizedEmail({ body, params: { branding }, session: { branding: 'other' } } as any, response);
    return response.json.firstCall?.args[0];
  }
  it('explains account-creation matching in the UI and preserves the detailed tester help', () => {
    const translations = JSON.parse(readFileSync(resolvePath(__dirname, '../../../../language-defaults/en/translation.json'), 'utf8'));
    const template = readFileSync(resolvePath(__dirname, '../../../../angular/projects/researchdatabox/app-config/src/app/app-config.component.html'), 'utf8');
    expect(template).to.include("'admin-config-account-creation-matching' | i18next");
    const help = translations['admin-config-account-creation-matching'];
    expect(help).to.include('A new account');
    expect(help).to.include('email domain OR full email address');
    expect(help).to.include('identity provider');
    const testerHelp = translations['admin-config-address-matching-help'];
    expect(testerHelp).to.include('Matching ignores letter case');
    expect(testerHelp).to.include('when creating AAF and OIDC accounts');
    expect(testerHelp).to.include('Domains match exactly, without subdomains');
    expect(testerHelp).to.include('Empty lists for a provider allow everyone');
    expect(testerHelp).not.to.include('case-sensitive');
  });
  it('registers an Admin-only, CSRF-protected POST with the auth and validation policies', () => {
    const config: any = buildCoreApiRouteConfig();
    expect(config['post ' + testAuthorizedEmailRoute.path]).to.include({ controller: 'AppConfigController', action: 'testAuthorizedEmail', csrf: true });
    expect((policies.AppConfigController as any).testAuthorizedEmail).to.include.members(['brandingAndPortal', 'checkBrandingValid', 'isWebServiceAuthenticated', 'checkAuth', 'validateApiContractRequest']);
    expect(auth.rules).to.deep.include({ path: testAuthorizedEmailRoute.path, role: 'Admin', can_update: true });
    expect(testAuthorizedEmailRoute.extensions['x-redbox-roles']).to.deep.equal(['Admin']);
  });
  for (const [name, authenticated, roleId, expected] of [
    ['anonymous', false, '', false],
    ['Researcher', true, 'researcher', false],
    ['Admin of another brand', true, 'admin-other', false],
    ['Admin of this brand', true, 'admin-default', true],
  ] as const) {
    it(`authorization policy ${expected ? 'allows' : 'denies'} ${name}`, () => {
      const names = ['BrandingService', 'RolesService', 'PathRulesService'];
      const originals = names.map(key => (global as any)[key]);
      try {
        const brand = { id: 'brand-default', name: 'default' };
        const rule = auth.rules.find(rule => rule.path === testAuthorizedEmailRoute.path)!;
        (global as any).BrandingService = { getBrand: () => brand };
        (global as any).RolesService = { getDefUnathenticatedRole: () => ({ id: 'guest' }) };
        const pathRules = new PathRules.PathRules();
        sinon.stub(pathRules, 'getRulesFromPath').returns([{ ...rule, role: { id: 'admin-default' }, branding: brand }] as any);
        (global as any).PathRulesService = pathRules;
        const next = sinon.stub();
        const res: any = { status: sinon.stub().returnsThis(), send: sinon.stub(), json: sinon.stub() };
        checkAuth({ path, headers: { 'content-type': 'application/json' }, session: { branding: 'default' }, isAuthenticated: () => authenticated, user: { roles: [{ id: roleId }] } } as any, res, next);
        expect(next.calledOnce).to.equal(expected);
        if (!expected) expect(res.status.calledWith(403)).to.equal(true);
      } finally {
        names.forEach((key, index) => { (global as any)[key] = originals[index]; });
      }
    });
  }
  it('uses the route brand, not session brand or a supplied tenant id', () => {
    expect(check({ email: 'person@uni.edu.au', provider: 'aaf' })).to.deep.equal({ allowed: true, reason: 'allowed-domain', matchedRule: 'uni.edu.au' });
    expect(resolve.calledOnceWithExactly('default')).to.equal(true);
    response.json.resetHistory();
    expect(check({ email: 'person@uni.edu.au', provider: 'aaf' }, 'other')).to.deep.equal({ allowed: false, reason: 'denied' });
  });
  it('matches incoming claim normalization for both providers and reports exact email rules', () => {
    expect(check({ email: 'Person@UNI.edu.au', provider: 'aaf' }).allowed).to.equal(true);
    response.json.resetHistory();
    expect(check({ email: 'Guest@OTHER.org', provider: 'oidc' })).to.deep.equal({ allowed: true, reason: 'allowed-exception', matchedRule: 'guest@other.org' });
  });
  it('replaces saved settings with the unsaved draft without merging, mutation or persistence', () => {
    const before = JSON.stringify(saved);
    const draft = Object.freeze({ enabled: true, domainsAaf: Object.freeze([' Draft.ORG. ']) });
    expect(check({ email: 'person@draft.org', provider: 'aaf', draft })).to.deep.equal({ allowed: true, reason: 'allowed-domain', matchedRule: 'draft.org' });
    expect(resolve.called).to.equal(false);
    response.json.resetHistory();
    expect(check({ email: 'person@uni.edu.au', provider: 'aaf', draft }).allowed).to.equal(false);
    response.json.resetHistory();
    expect(check({ email: 'person@uni.edu.au', provider: 'aaf', draft: {} })).to.deep.equal({ allowed: true, reason: 'disabled' });
    response.json.resetHistory();
    expect(check({ email: 'person@uni.edu.au', provider: 'aaf' }).allowed).to.equal(true);
    expect(JSON.stringify(saved)).to.equal(before);
    expect((global as any).sails.services.appconfigservice.createOrUpdateConfig.called).to.equal(false);
  });
  it('reports empty provider lists separately from restriction off and denial', () => {
    expect(check({ email: 'person@other.org', provider: 'aaf', draft: { enabled: true } })).to.deep.equal({ allowed: true, reason: 'unrestricted' });
    response.json.resetHistory();
    expect(check({ email: 'person@other.org', provider: 'aaf', draft: { enabled: false } })).to.deep.equal({ allowed: true, reason: 'disabled' });
    response.json.resetHistory();
    expect(check({ email: 'person@staff.uni.edu.au', provider: 'aaf' })).to.deep.equal({ allowed: false, reason: 'denied' });
  });
  for (const body of [
    {}, { email: 'bad', provider: 'aaf' }, { email: '@', provider: 'aaf' },
    { email: 'person@uni.edu.au', provider: 'local' },
    { email: 'person@uni.edu.au', provider: 'AAF' },
    { email: 'a'.repeat(255) + '@uni.edu.au', provider: 'aaf' },
    { email: 'person@uni.edu.au', provider: 'aaf', draft: null },
    { email: 'person@uni.edu.au', provider: 'aaf', branding: 'other' },
    { email: 'person@uni.edu.au', provider: 'aaf', draft: { enabled: 1 } },
    { email: 'person@uni.edu.au', provider: 'aaf', draft: { domainsAaf: 'uni.edu.au' } },
    { email: 'person@uni.edu.au', provider: 'aaf', draft: { domainsAaf: [42] } },
    { email: 'person@uni.edu.au', provider: 'aaf', draft: { domainsAaf: Array(501).fill('uni.edu.au') } },
    { email: 'person@uni.edu.au', provider: 'aaf', draft: { domainsAaf: ['x'.repeat(255)] } },
    { email: 'person@uni.edu.au', provider: 'aaf', draft: { secret: 'ignored?' } },
  ]) {
    it('rejects malformed or oversized input before evaluating', () => {
      expect(authorizedEmailTestBody.safeParse(body).success).to.equal(false);
      check(body);
      expect(response.badRequest.calledOnce).to.equal(true);
      expect(response.json.called).to.equal(false);
      expect(resolve.called).to.equal(false);
    });
  }
  it('contract validation rejects bad syntax, provider and oversized drafts', () => {
    for (const body of [
      { email: 'invalid', provider: 'aaf' },
      { email: 'person@uni.edu.au', provider: 'local' },
      { email: 'person@uni.edu.au', provider: 'aaf', draft: { emailsAaf: Array(501).fill('x@y.org') } },
    ]) {
      expect(validateApiRouteRequest({ method: 'POST', path, headers: {}, params: {}, query: {}, body } as any, testAuthorizedEmailRoute).valid).to.equal(false);
    }
  });
  it('does not log the tested address, matched rule or draft', () => {
    check({ email: 'person@uni.edu.au', provider: 'aaf' });
    for (const logger of Object.values((global as any).sails.log)) {
      if (typeof logger === 'function' && 'called' in logger) expect((logger as any).called).to.equal(false);
    }
  });
});
