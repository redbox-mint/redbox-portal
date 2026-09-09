import { firstValueFrom } from 'rxjs';
import { adminMutationOptions } from '../helpers/authorization';
describe('The UsersService', function () {
  before(function (done) {
    done();
  });

  it('retrieves a user with valid roles and updates roles with an authoritative actor', async function () {
    const options = await adminMutationOptions();
    const suffix = Date.now();
    const user = await firstValueFrom(
      UsersService.addLocalUser(
        `roles-${suffix}`,
        'Role update fixture',
        `roles-${suffix}@example.test`,
        'RBTest123!',
        options
      )
    );
    try {
      const roles = await firstValueFrom(RolesService.getRolesWithBrand(BrandingService.getDefault()));
      const researcher = roles.find(role => role.name === 'Researcher');
      await firstValueFrom(
        UsersService.updateUserRoles(user.id, [researcher.id], {
          ...options,
          expectedVersion: user.loginDisabledVersion,
        })
      );
      const retrieved = await firstValueFrom(UsersService.getUserWithId(user.id));
      expect(retrieved.id).to.equal(user.id);
      expect(UsersService.hasRole(retrieved, researcher)).to.have.property('id', researcher.id);
      let emptyRoleSetError: { code?: string; status?: number } | undefined;
      try {
        await firstValueFrom(
          UsersService.updateUserRoles(user.id, [], {
            ...options,
            expectedVersion: retrieved.loginDisabledVersion,
          })
        );
      } catch (error) {
        emptyRoleSetError = error as { code?: string; status?: number };
      }
      expect(emptyRoleSetError).to.deep.include({ code: 'authorization.invalid-role', status: 422 });
      const unchanged = await firstValueFrom(UsersService.getUserWithId(user.id));
      expect(UsersService.hasRole(unchanged, researcher)).to.have.property('id', researcher.id);
    } finally {
      await User.replaceCollection(user.id, 'roles').members([]);
      await RoleAssignment.destroy({ principalId: user.id });
      await User.destroy({ id: user.id });
    }
  });

  describe('login restrictions using authorised email config', function () {
    const tests = [
      // No email address provided
      {
        args: {
          conf: {},
          email: null,
        },
        expected: false,
      },
      // Unexpected email format: testexample.com
      {
        args: {
          conf: {},
          email: 'testexample.com',
        },
        expected: false,
      },
      // Unexpected email format: test@more@example.com
      {
        args: {
          conf: {},
          email: 'test@more@example.com',
        },
        expected: false,
      },
      // Authorized domains and emails config problem: unknown auth type 'blah
      {
        args: {
          conf: { authType: 'blah' },
          email: 'test@more@example.com',
        },
        expected: false,
      },
      // Authorized email configuration is disabled.
      {
        args: {
          conf: { enabled: false },
          email: 'test@example.com',
        },
        expected: true,
      },
      // No authorized email configuration. (oidc)
      {
        args: {
          conf: { enabled: true, domainsOidc: [], emailsOidc: [] },
          email: 'test@example.com',
        },
        expected: true,
      },
      // No authorized email configuration. (aaf)
      {
        args: {
          conf: { enabled: true, domainsAaf: [], emailsAaf: [] },
          email: 'test@example.com',
          authType: 'aaf',
        },
        expected: true,
      },
      // Authorized email domain: example.com
      {
        args: {
          conf: { enabled: true, domainsOidc: ['example.com'], emailsOidc: [] },
          email: 'test@example.com',
        },
        expected: true,
      },
      // Authorized email exception: test@example.com
      {
        args: {
          conf: { enabled: true, domainsAaf: ['sub.example.com'], emailsAaf: ['test@example.com'] },
          email: 'test@example.com',
          authType: 'aaf',
        },
        expected: true,
      },
      // Email is not authorized to login: test@example.com
      {
        args: {
          conf: { enabled: true, domainsOidc: ['example.net'], emailsOidc: ['test@example.net'] },
          email: 'test@example.com',
        },
        expected: false,
      },
    ];

    tests.forEach(({ args, expected }) => {
      it(`should ${expected ? 'pass' : 'fail'} with args ${JSON.stringify(args)}`, async function () {
        const authType = _.get(args, 'authType', 'oidc');
        const brandName = 'default';
        const email = args.email;
        const brand = BrandingService.getBrand(brandName);
        await AppConfigService.createOrUpdateConfig(brand, 'authorizedDomainsEmails', args.conf);
        const result = UsersService.checkAuthorizedEmail(email, brandName, authType);
        expect(result).to.equal(expected);
      });
    });
  });
});
