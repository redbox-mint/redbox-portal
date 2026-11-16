import assert from 'node:assert/strict';
import { authenticationFailureEvent } from '../../src/authentication';

describe('authentication failure event public contract', () => {
  const context = { brandId: 'institution', portalId: 'rdmp' };
  it('retains the original event and bounded attempted username without credentials or extra body fields', () => {
    assert.deepEqual(
      authenticationFailureEvent(
        {
          method: 'POST',
          path: '/user/login_local',
          body: { loginName: 'attempted-user', loginSecret: 'secret', token: 'secret', extra: {} },
        },
        context,
        'loginName'
      ),
      {
        ...context,
        eventType: 'authentication.login.failure',
        category: 'authentication',
        source: 'Authentication',
        subject: { username: 'attempted-user' },
        requestContext: { method: 'POST', path: '/user/login_local' },
      }
    );
  });
  for (const [name, username] of Object.entries({
    missing: undefined,
    empty: '',
    object: { password: 'secret' },
    array: ['secret'],
    oversized: 'x'.repeat(4097),
  }))
    it(`omits the ${name} attempted username while retaining failure context`, () => {
      const event = authenticationFailureEvent(
        { method: 'POST', path: '/user/login_aaf', body: { username, assertion: 'secret' } },
        context
      );
      assert.equal(event.eventType, 'authentication.login.failure');
      assert.equal(event.subject, undefined);
      assert.deepEqual(event.requestContext, { method: 'POST', path: '/user/login_aaf' });
      assert(!JSON.stringify(event).includes('secret'));
    });
});
