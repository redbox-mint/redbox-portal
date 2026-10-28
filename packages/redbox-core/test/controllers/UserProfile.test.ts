import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import * as sinon from 'sinon';
import { of } from 'rxjs';
import type { Response } from 'express';
import type { BuildResponseType } from '../../src';
import { Controllers } from '../../src/controllers/UserController';

const root = path.resolve(__dirname, '../../../..');
const ejs = require(path.join(root, 'node_modules/ejs'));
const template = fs.readFileSync(path.join(root, 'views/default/default/user/profile.ejs'), 'utf8');
const script = fs.readFileSync(path.join(root, 'assets/default/default/js/user-profile.js'), 'utf8');

class ProfileController extends Controllers.User {
  public override sendResp(req: Sails.Req, res: Sails.Res, response?: BuildResponseType): Response {
    return super.sendResp(req, res, response);
  }
}

describe('Self-service user profile', () => {
  let saved: Record<string, unknown>;
  let controller: ProfileController;
  const currentUser = { id: 'self', username: '<script>bad()</script>', name: 'Profile <name>', email: 'self@example.org', type: 'local', roles: [], token: 'stored-token-hash', password: 'stored-password-hash' };
  const brand = { name: 'default' };

  beforeEach(() => {
    saved = Object.fromEntries(['BrandingService', 'PathRulesService', 'UsersService'].map(key => [key, Reflect.get(globalThis, key)]));
    Object.assign(globalThis, {
      BrandingService: {
        getBrand: () => brand, getBrandNameFromReq: () => 'default', getPortalFromReq: () => 'rdmp',
        getBrandAndPortalPath: () => '/context/default/rdmp', getRootContext: () => '/context'
      },
      PathRulesService: { getRulesFromPath: sinon.stub().returns([]), canWrite: sinon.stub().returns(true) },
      UsersService: { updateUserDetails: sinon.stub().returns(of({})), setUserKey: sinon.stub().returns(of({})) }
    });
    controller = new ProfileController();
  });
  afterEach(() => { sinon.restore(); Object.assign(globalThis, saved); });

  function render(user = currentUser, allowed = true) {
    const req = { user, isAuthenticated: () => true } as unknown as Sails.Req;
    (PathRulesService.canWrite as sinon.SinonStub).returns(allowed);
    let html = '';
    sinon.stub(controller, 'sendView').callsFake((_req, _res, view, locals) => {
      assert.equal(view, 'user/profile');
      html = ejs.render(template, { req, BrandingService, ...locals });
    });
    controller.profile(req, {} as Sails.Res);
    return html;
  }

  it('renders escaped details and permitted actions without missing Angular bundles or a loading state', () => {
    const html = render();
    assert.match(html, /Profile &lt;name&gt;/);
    assert.doesNotMatch(html, /<script>bad|stored-token-hash|stored-password-hash/);
    assert.match(html, /id="profile-details" method="post"/);
    assert.match(html, /id="profile-generate-key"/);
    assert.match(html, /id="profile-revoke-key"/);
    assert.doesNotMatch(html, /angular\/userProfile|id="loading"|<user-profile/);
    assert.match(html, /src="\/context\/default\/default\/js\/user-profile.js" defer/);
    assert.ok(fs.existsSync(path.join(root, 'assets/default/default/js/user-profile.js')));
    assert.equal((PathRulesService.getRulesFromPath as sinon.SinonStub).firstCall.args[0], '/default/rdmp/user/update');
  });

  it('renders read-only details when existing path rules deny actions', () => {
    const html = render(currentUser, false);
    assert.match(html, /self@example.org/);
    assert.doesNotMatch(html, /id="profile-details"|id="profile-generate-key"|id="profile-revoke-key"/);
  });

  it('does not offer local password or details editing for an identity-provider account', () => {
    assert.doesNotMatch(render({ ...currentUser, type: 'oidc' }), /id="profile-details"|type="password"/);
  });

  it('rejects anonymous profile access before rendering', () => {
    const send = sinon.stub();
    const res = { status: sinon.stub().returns({ send }) };
    const view = sinon.stub(controller, 'sendView');
    controller.profile({ isAuthenticated: () => false } as Sails.Req, res as unknown as Sails.Res);
    assert.equal(res.status.firstCall.args[0], 403);
    assert.equal(view.called, false);
  });

  for (const method of ['update', 'generateUserKey', 'revokeUserKey'] as const) {
    it(`${method} uses the session user and ignores a supplied target ID`, () => {
      const req = { user: currentUser, isAuthenticated: () => true, body: { id: 'victim', details: { id: 'victim', name: 'Changed', email: 'new@example.org', password: '' } } } as unknown as Sails.Req;
      sinon.stub(controller, 'sendResp');
      controller[method](req, {} as Sails.Res);
      const service = (method === 'update' ? UsersService.updateUserDetails : UsersService.setUserKey) as sinon.SinonStub;
      assert.equal(service.firstCall.args[0], 'self');
      if (method === 'revokeUserKey') assert.equal(service.firstCall.args[1], null);
      if (method === 'generateUserKey') assert.match(service.firstCall.args[1], /^[a-f0-9-]{36}$/);
    });
    it(`${method} rejects anonymous calls once without a database write`, () => {
      const response = sinon.stub(controller, 'sendResp');
      controller[method]({ isAuthenticated: () => false } as Sails.Req, {} as Sails.Res);
      assert.equal(response.callCount, 1);
      assert.equal((UsersService.setUserKey as sinon.SinonStub).called, false);
      assert.equal((UsersService.updateUserDetails as sinon.SinonStub).called, false);
    });
  }
});

describe('Profile browser action script', () => {
  function setup(responses: unknown[]) {
    const elements: Record<string, any> = {};
    for (const id of ['user-profile', 'profile-status', 'profile-details', 'profile-token', 'profile-token-result', 'profile-generate-key', 'profile-revoke-key', 'profile-hide-token']) {
      elements[id] = { value: '', hidden: true, disabled: false, textContent: '', addEventListener: (event: string, callback: Function) => { elements[id][event] = callback; } };
    }
    const buttons = ['profile-generate-key', 'profile-revoke-key', 'profile-hide-token'].map(id => elements[id]);
    elements['user-profile'].dataset = { basePath: '/context/default/rdmp', csrfUrl: '/context/csrfToken' };
    elements['user-profile'].querySelectorAll = () => buttons;
    elements['profile-details'].elements = Object.fromEntries(['name', 'email', 'password', 'confirmPassword'].map(name => [name, { value: name === 'name' ? 'Test User' : '' }]));
    const fetch = sinon.stub();
    responses.forEach((body, i) => fetch.onCall(i).resolves({ ok: true, json: async () => body }));
    const window = { confirm: () => true, addEventListener: sinon.stub() };
    vm.runInNewContext(script, { document: { getElementById: (id: string) => elements[id] }, window, fetch, AbortController, setTimeout, clearTimeout });
    return { elements, fetch, window, settle: () => new Promise(resolve => setImmediate(resolve)) };
  }

  it('saves details with CSRF, no target ID, and clears passwords', async () => {
    const { elements, fetch, settle } = setup([{ _csrf: 'csrf' }, { status: true, message: 'Updated' }]);
    elements['profile-details'].elements.password.value = 'secret';
    elements['profile-details'].elements.confirmPassword.value = 'secret';
    elements['profile-details'].submit({ preventDefault() {} });
    await settle();
    assert.equal(fetch.firstCall.args[0], '/context/csrfToken');
    assert.equal(fetch.secondCall.args[0], '/context/default/rdmp/user/update');
    const options = fetch.secondCall.args[1];
    assert.equal(options.headers['X-CSRF-Token'], 'csrf');
    assert.deepEqual(JSON.parse(options.body), { details: { name: 'Test User', email: '', password: 'secret' } });
    assert.equal(elements['profile-details'].elements.password.value, '');
    assert.equal(elements['profile-status'].textContent, 'Updated');
  });

  it('generates, hides and revokes tokens without persistence', async () => {
    const { elements, fetch, settle, window } = setup([{ _csrf: 'csrf' }, { status: true, message: 'new-secret' }, { _csrf: 'csrf' }, { status: true, message: 'Revoked' }]);
    elements['profile-generate-key'].click();
    await settle();
    assert.equal(fetch.secondCall.args[0], '/context/default/rdmp/user/genKey');
    assert.equal(elements['profile-token'].value, 'new-secret');
    assert.equal(elements['profile-token-result'].hidden, false);
    elements['profile-hide-token'].click();
    assert.equal(elements['profile-token'].value, '');
    elements['profile-revoke-key'].click();
    await settle();
    assert.equal(fetch.getCall(3).args[0], '/context/default/rdmp/user/revokeKey');
    assert.equal(elements['profile-status'].textContent, 'Revoked');
    assert.equal(window.addEventListener.firstCall.args[0], 'pagehide');
  });

  it('shows failures and restores controls instead of hanging', async () => {
    const { elements, fetch, settle } = setup([]);
    fetch.rejects(new Error('Network failed'));
    elements['profile-generate-key'].click();
    await settle();
    assert.equal(elements['profile-status'].textContent, 'Network failed');
    assert.equal(elements['profile-generate-key'].disabled, false);
  });

  it('does not post without a CSRF token or with mismatched passwords', async () => {
    const { elements, fetch, settle } = setup([{}]);
    elements['profile-details'].elements.password.value = 'mismatch';
    elements['profile-details'].submit({ preventDefault() {} });
    assert.equal(fetch.called, false);
    elements['profile-generate-key'].click();
    await settle();
    assert.equal(fetch.callCount, 1);
    assert.match(elements['profile-status'].textContent, /security token/);
    assert.equal(elements['profile-generate-key'].disabled, false);
  });
});
