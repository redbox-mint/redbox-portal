import { strict as assert } from 'node:assert';
import { describe, it } from 'mocha';
import { Services as UsersServices } from '../../src/services/UsersService';
import { UserWLDef } from '../../src/waterline-models/User';

/**
 * AUTH-P5-002 production-mode loader coverage for the User lifecycle
 * dependency.
 *
 * The mocha export-everything flag (`sails_redbox__mochaTesting=true`) masks
 * missing production exports, so this suite flips to production mode
 * (flag unset) and proves:
 * - the request-facing export list does NOT contain the actor-less lifecycle
 *   helper (old or new name);
 * - the registered internal capability IS attached to the production export
 *   surface via the explicit `exports()` override;
 * - the User model lifecycle delegates to exactly that registered
 *   capability (and fails closed when it is absent).
 */
describe('UsersService lifecycle loader (production mode)', () => {
  const FLAG = 'sails_redbox__mochaTesting';
  const previous = process.env[FLAG];

  function productionExports(): Record<string, unknown> {
    delete process.env[FLAG];
    try {
      return new UsersServices.Users().exports() as Record<string, unknown>;
    } finally {
      if (previous === undefined) delete process.env[FLAG];
      else process.env[FLAG] = previous;
    }
  }

  it('keeps the actor-less lifecycle helper off the request-facing export list', () => {
    const exported = productionExports();
    assert.equal(Object.prototype.hasOwnProperty.call(exported, 'findAndAssignAccessToRecords'), false);
    assert.equal(
      (UsersServices.Users.prototype as unknown as Record<string, unknown>)._exportedMethods === undefined ||
        !(
          (new UsersServices.Users() as unknown as { _exportedMethods?: readonly string[] })._exportedMethods ?? []
        ).includes('assignAccessToPendingRecordsForLifecycle'),
      true
    );
  });

  it('attaches the registered internal capability to the production export surface', () => {
    const exported = productionExports();
    assert.equal(typeof exported['assignAccessToPendingRecordsForLifecycle'], 'function');
  });

  it('routes the User model lifecycle through the registered capability', async () => {
    const seen: { email?: unknown; username?: unknown }[] = [];
    const capability = async (email: string, username: string): Promise<number> => {
      seen.push({ email, username });
      return 2;
    };
    const previousService = (globalThis as Record<string, unknown>).UsersService;
    Reflect.set(globalThis, 'UsersService', { assignAccessToPendingRecordsForLifecycle: capability });
    try {
      const hook = (UserWLDef as unknown as { assignAccessToPendingRecords?: unknown }).assignAccessToPendingRecords;
      assert.equal(typeof hook, 'function');
      const result = await (hook as (user: Record<string, unknown>) => Promise<number>)({
        email: 'pending@test.com',
        username: 'user-1',
        name: 'Test User',
      });
      assert.equal(result, 2);
      assert.deepEqual(seen, [{ email: 'pending@test.com', username: 'user-1' }]);
    } finally {
      if (previousService === undefined) Reflect.deleteProperty(globalThis, 'UsersService');
      else Reflect.set(globalThis, 'UsersService', previousService);
    }
  });

  it('fails closed when the registered capability is absent', async () => {
    const previousService = (globalThis as Record<string, unknown>).UsersService;
    Reflect.set(globalThis, 'UsersService', {});
    try {
      const hook = (UserWLDef as unknown as { assignAccessToPendingRecords?: unknown }).assignAccessToPendingRecords;
      assert.equal(typeof hook, 'function');
      await assert.rejects(
        (hook as (user: Record<string, unknown>) => Promise<number>)({
          email: 'pending@test.com',
          username: 'user-1',
          name: 'Test User',
        }),
        /assignAccessToPendingRecordsForLifecycle is unavailable/
      );
    } finally {
      if (previousService === undefined) Reflect.deleteProperty(globalThis, 'UsersService');
      else Reflect.set(globalThis, 'UsersService', previousService);
    }
  });
});
