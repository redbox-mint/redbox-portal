import assert from 'node:assert/strict';
import express from 'express';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import sinon from 'sinon';
import { HttpIdentity } from '../../src/http/express/identity';
import {
  bindHttpPolicies,
  createPilotPolicies,
  pilotPolicyChain,
  requestContext,
  resolveEffectivePolicies,
} from '../../src/http/express/policies';

describe('standalone actor and policy context', () => {
  it('resolves boolean/action/controller/global overrides and ordered route policies offline', () => {
    const route = { controller: 'webservice/RecordTypeController', action: 'listRecordTypes', policy: 'RouteFirst' };
    assert.deepEqual(resolveEffectivePolicies(route, { '*': 'Global' }), ['routefirst', 'global']);
    assert.deepEqual(
      resolveEffectivePolicies(route, { '*': false, 'webservice/RecordTypeController': { '*': ['Context', 'Role'] } }),
      ['routefirst', 'context', 'role']
    );
    assert.deepEqual(resolveEffectivePolicies(route, { '*': false, 'webservice/recordtype/listrecordtypes': true }), [
      'routefirst',
    ]);
    assert.deepEqual(
      resolveEffectivePolicies(route, { '*': true, 'webservice/RecordTypeController': { listRecordTypes: false } }),
      ['routefirst', false]
    );
    assert.deepEqual(resolveEffectivePolicies({ ...route, policy: undefined }, {}), [false]);
    assert.throws(() => bindHttpPolicies(['missing'], {}), /unbound policy/);
    assert.throws(
      () =>
        resolveEffectivePolicies(route, {
          'webservice/RecordTypeController': { listRecordTypes: true },
          'webservice/recordtype/listrecordtypes': false,
        }),
      /Duplicate/
    );
  });

  it('resolves linked identities, disabled/orphan/cyclic accounts and credential errors without global services', async () => {
    const one = sinon.stub();
    const verifyPassword = sinon.stub().resolves(true);
    const findByApiTokenHash = sinon.stub();
    const identity = new HttpIdentity({ one, verifyPassword, findByApiTokenHash });
    const primary = { id: 'primary', username: 'owner', type: 'local', roles: [{ id: 'admin', branding: 'brand' }] };
    const alias = { id: 'alias', username: 'alias', type: 'local', linkedPrimaryUserId: 'primary' };
    one.callsFake(async (_entity: string, criteria: { id?: string; username?: string }) =>
      criteria.id === 'primary' ? primary : alias
    );
    findByApiTokenHash.resolves(alias);
    const actor = await identity.bearer('synthetic-token');
    assert(actor);
    assert.deepEqual(actor, { id: 'primary', username: 'owner', roles: [{ id: 'admin', brandId: 'brand' }] });
    assert.notEqual(findByApiTokenHash.firstCall.args[0], 'synthetic-token');
    // Local auth resolves the same primary, rather than accepting session.user authority.
    assert.deepEqual(await identity.local('alias', 'password'), actor);
    verifyPassword.resolves(false);
    assert.equal(await identity.local('alias', 'wrong'), false);
    one.resolves({ ...primary, loginDisabled: true });
    assert.equal(await identity.session('primary'), false);
    findByApiTokenHash.resolves({ ...alias, loginDisabled: true });
    assert.equal(await identity.bearer('disabled'), false);
    findByApiTokenHash.resolves(alias);
    one.resolves(null);
    assert.equal(await identity.bearer('orphan'), false);
    one.resolves(alias);
    assert.equal(await identity.session('cycle'), false);
    one.rejects(new Error('repository unavailable'));
    await assert.rejects(identity.session('primary'), /unavailable/);
  });

  it('executes brand then authentication then authorization on real HTTP, rejecting spoofed authority', async () => {
    const brand = { id: 'brand', name: 'default' };
    const getBrand = sinon.stub().resolves(brand);
    const list = sinon.stub().resolves([{ path: '/:branding/:portal/api(/*)', role: 'admin', can_update: true }]);
    const order: string[] = [];
    const policies = createPilotPolicies({
      branding: { getBrand },
      identity: { list },
      portals: ['rdmp'],
      authenticate: async req => {
        order.push('authenticate');
        const credential = req.headers.authorization;
        if (credential === 'Bearer fail') throw Error('secret database details');
        if (!credential) return false;
        return {
          id: 'u',
          username: 'u',
          roles: [
            {
              id: credential === 'Bearer wrong-role' ? 'reader' : 'admin',
              brandId: credential === 'Bearer wrong-brand' ? 'other' : 'brand',
            },
          ],
        };
      },
    });
    const app = express();
    app.get(
      '/:branding/:portal/api/recordtypes',
      ...bindHttpPolicies(
        pilotPolicyChain.map(name => name.toLowerCase()),
        policies
      ),
      (req, res) => {
        order.push('handler');
        res.json(requestContext(req).actor);
      }
    );
    app.use((_error: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
      res.status(500).json({ message: 'Internal server error' });
    });
    const server: Server = createServer(app);
    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
    try {
      const url = 'http://127.0.0.1:' + (server.address() as AddressInfo).port;
      for (const [credential, status] of [
        [undefined, 401],
        ['wrong-role', 403],
        ['wrong-brand', 403],
        ['fail', 500],
        ['admin', 200],
      ] as const) {
        const response = await fetch(url + '/default/rdmp/api/recordtypes?user=admin&branding=other', {
          headers: credential ? { Authorization: 'Bearer ' + credential } : {},
        });
        assert.equal(response.status, status);
        assert(!(await response.text().then(body => body.includes('secret'))));
      }
      assert.equal(order.filter(value => value === 'handler').length, 1);
      const calls = list.callCount;
      const response = await fetch(url + '/default/unknown/api/recordtypes', {
        headers: { Authorization: 'Bearer admin' },
      });
      assert.equal(response.status, 404);
      assert.equal(list.callCount, calls);
      getBrand.resolves(null);
      assert.equal((await fetch(url + '/absent/rdmp/api/recordtypes')).status, 404);
    } finally {
      await new Promise<void>((resolve, reject) => server.close(error => (error ? reject(error) : resolve())));
    }
  });
});
