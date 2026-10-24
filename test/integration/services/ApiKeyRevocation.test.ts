import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { firstValueFrom } from 'rxjs';
import { fixtureRemove, fixtureRow } from '../../helpers/persistenceFixtures';

describe('API key revocation', function () {
  this.timeout(30_000);
  let userId: string;
  before(async () => {
    const brand = BrandingService.getDefault();
    const user = await firstValueFrom(UsersService.addLocalUser(
      `revoke-${randomUUID()}`, 'Revocation test', 'revoke@example.invalid', 'RBTest123!'
    ));
    userId = String(user.id);
    await firstValueFrom(UsersService.updateUserRoles(userId, RolesService.getRoleIds(brand.roles, ['Admin'])));
  });
  after(async () => {
    if (userId) await fixtureRemove('User', { id: userId });
  });

  for (const input of ['', null]) {
    it(`clears ${JSON.stringify(input)} in Prisma and denies the revoked bearer key`, async () => {
      const token = randomUUID();
      const authenticate = () => fetch(`http://127.0.0.1:${sails.config.port}/default/rdmp/api/siem/config`, {
        headers: { Authorization: `Bearer ${token}`, 'X-ReDBox-Api-Version': '2.0', 'Content-Type': 'application/json' },
      });
      await firstValueFrom(UsersService.setUserKey(userId, token));
      const before = await authenticate();
      assert.equal(before.status, 200);
      await before.arrayBuffer();
      await firstValueFrom(UsersService.setUserKey(userId, input));
      assert.equal((await fixtureRow('User', { id: userId })).token, null);
      const after = await authenticate();
      // Revoked credentials are unauthenticated under the v6 HTTP contract.
      assert.equal(after.status, 401);
      await after.arrayBuffer();
    });
  }
});
