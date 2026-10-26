import assert from 'node:assert/strict';
import express from 'express';
import session from 'express-session';
import * as sinon from 'sinon';
import { nothingLogger } from '@researchdatabox/sails-ng-common';
import { prepareHttpMiddleware } from '../../src/http/express/middleware';
import type { HttpIdentity } from '../../src/http/express/identity';

describe('explicit socket credential resolution', () => {
  let authentication: Awaited<ReturnType<typeof prepareHttpMiddleware>>;
  let store: session.MemoryStore;
  let sessionActor: sinon.SinonStub;
  const actor = { id: 'user123', username: 'alice', roles: [] };
  beforeEach(async () => {
    store = new session.MemoryStore();
    sessionActor = sinon.stub().resolves(actor);
    authentication = await prepareHttpMiddleware(express.Router(), {
      owner: { config: {}, log: { warn() {} } },
      identity: { session: sessionActor, bearer: sinon.stub().resolves(false) } as unknown as HttpIdentity,
      session: { secret: 'qualification-only-secret', store, cookie: { secure: false } },
      log: nothingLogger,
    });
  });
  async function save(data: Record<string, unknown>) {
    await new Promise<void>((resolve, reject) =>
      store.set('session-1', { cookie: { maxAge: null }, ...data } as session.SessionData, error =>
        error ? reject(error) : resolve()
      )
    );
  }
  it('authenticates a current v6 socket session against the authoritative identity', async () => {
    await save({ authenticationVersion: 6, passport: { user: actor.id } });
    assert.deepEqual(await authentication.authenticateCredential({ sessionId: 'session-1' }), actor);
    assert(sessionActor.calledOnceWithExactly(actor.id));
  });
  it('returns false without a session credential', async () => {
    assert.equal(await authentication.authenticateCredential({}), false);
    assert(!sessionActor.called);
  });
  it('returns false for a null serialized user', async () => {
    await save({ authenticationVersion: 6, passport: { user: null } });
    assert.equal(await authentication.authenticateCredential({ sessionId: 'session-1' }), false);
    assert(!sessionActor.called);
  });
  it('reloads current actor facts instead of trusting a saved session.user snapshot', async () => {
    await save({
      authenticationVersion: 6,
      passport: { user: actor.id },
      user: { username: 'stale-admin', roles: ['Admin'] },
    });
    const current = { ...actor, username: 'current-user' };
    sessionActor.resolves(current);
    assert.deepEqual(await authentication.authenticateCredential({ sessionId: 'session-1' }), current);
  });
  it('does not create a second serialized user or patch authentication methods', async () => {
    await save({ authenticationVersion: 6, passport: { user: actor.id } });
    await authentication.authenticateCredential({ sessionId: 'session-1' });
    const saved = await new Promise<session.SessionData | null | undefined>((resolve, reject) =>
      store.get('session-1', (error, value) => (error ? reject(error) : resolve(value)))
    );
    assert.equal(Reflect.get(saved!, 'user'), undefined);
    assert.equal(Reflect.get(saved!, 'isAuthenticated'), undefined);
  });
  it('invalidates old serialized sessions rather than reusing their actor snapshot', async () => {
    await save({ passport: { user: actor.id }, user: actor });
    assert.equal(await authentication.authenticateCredential({ sessionId: 'session-1' }), false);
    assert(!sessionActor.called);
  });
});
