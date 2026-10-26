import assert from 'node:assert/strict';
import * as sinon from 'sinon';
import { httpRouteFixture } from '../helpers/httpRouteFixture';
import { mountConfiguredActionRoutes } from '../../src/http/express/configuredActions';

describe('Named configured actions through owned HTTP', () => {
  let f: Awaited<ReturnType<typeof httpRouteFixture>>;
  let execute: sinon.SinonStub;
  let authorize: sinon.SinonStub;
  let audit: sinon.SinonStub;
  beforeEach(async () => {
    execute = sinon.stub().resolves({ ok: true });
    authorize = sinon.stub().resolves(true);
    audit = sinon.stub().resolves();
    f = await httpRouteFixture((router, input) =>
      mountConfiguredActionRoutes(router, {
        ...input,
        actions: { testAction: { authorize, execute } },
        audit,
      })
    );
  });
  afterEach(async () => {
    await f.close();
  });
  it('invokes the selected operation once with explicit actor and request facts', async () => {
    const response = await f.request('/default/portal/action/testAction?oid=123', {
      method: 'POST',
      body: { value: 1 },
    });
    assert.equal(response.status, 200);
    assert.deepEqual(response.body, { ok: true });
    assert.equal(authorize.calledOnce, true);
    assert.equal(execute.calledOnce, true);
    const context = execute.firstCall.args[0];
    assert.deepEqual(context.actor, { id: f.actor.id, username: f.actor.username });
    assert.deepEqual(context.brand, f.brand);
    assert.equal(context.portal, 'portal');
    assert.deepEqual(context.query, { oid: '123' });
    assert.deepEqual(context.body, { value: 1 });
    assert.equal('req' in context, false);
    assert.equal('res' in context, false);
    assert.equal(audit.calledOnce, true);
  });
  it('awaits asynchronous operation data before responding and auditing', async () => {
    let finished = false;
    execute.callsFake(async () => {
      await new Promise<void>(resolve => setImmediate(resolve));
      finished = true;
      return { data: 'test' };
    });
    audit.callsFake(async () => {
      assert(finished);
    });
    const response = await f.request('/default/portal/action/testAction', { method: 'POST', body: {} });
    assert.equal(response.status, 200);
    assert.deepEqual(response.body, { data: 'test' });
    assert(finished);
    assert.equal(execute.calledOnce, true);
    assert.equal(audit.calledOnce, true);
  });
});
