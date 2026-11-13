describe('The UsersService', function () {
  before(function (done) {
    done();
  });

  it('should retrieve user using ID, with valid roles, can update roles', async function () {
    const { firstValueFrom } = await import('rxjs');
    const brand = BrandingService.getDefault();
    const roles = await firstValueFrom(RolesService.getRolesWithBrand(brand));
    const adminRole = RolesService.getAdminFromRoles(roles);
    const username = `role-update-${Date.now()}`;
    const user = await firstValueFrom(UsersService.addLocalUser(username, 'Role update fixture', `${username}@example.test`, 'Testing123!'));
    try {
      await firstValueFrom(UsersService.updateUserRoles(user.id, [adminRole.id]));
      const retrieved = await firstValueFrom(UsersService.getUserWithId(user.id));
      expect(retrieved).to.have.property('id', user.id);
      expect(UsersService.hasRole(retrieved, adminRole)).to.have.property('id', adminRole.id);
      await firstValueFrom(UsersService.updateUserRoles(user.id, roles.filter(role => role.name !== 'Admin').map(role => role.id)));
      const updated = await firstValueFrom(UsersService.getUserWithId(user.id));
      expect(RolesService.getRoleWithName(updated.roles, 'Admin')).to.be.undefined;
    } finally {
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
          conf: {authType: 'blah'},
          email: 'test@more@example.com',
        },
        expected: false,
      },
      // Authorized email configuration is disabled.
      {
        args: {
          conf: {enabled: false},
          email: 'test@example.com',
        },
        expected: true,
      },
      // No authorized email configuration. (oidc)
      {
        args: {
          conf: {enabled: true, domainsOidc: [], emailsOidc: []},
          email: 'test@example.com',
        },
        expected: true,
      },
      // No authorized email configuration. (aaf)
      {
        args: {
          conf: {enabled: true, domainsAaf: [], emailsAaf: []},
          email: 'test@example.com',
          authType: 'aaf',
        },
        expected: true,
      },
      // Authorized email domain: example.com
      {
        args: {
          conf: {enabled: true, domainsOidc: ['example.com'], emailsOidc: []},
          email: 'test@example.com',
        },
        expected: true,
      },
      // Authorized email exception: test@example.com
      {
        args: {
          conf: {enabled: true, domainsAaf: ['sub.example.com'], emailsAaf: ['test@example.com']},
          email: 'test@example.com',
          authType: 'aaf'
        },
        expected: true,
      },
      // Email is not authorized to login: test@example.com
      {
        args: {
          conf: {enabled: true, domainsOidc: ['example.net'], emailsOidc: ['test@example.net']},
          email: 'test@example.com',
        },
        expected: false,
      },
    ];

    tests.forEach(({args, expected}) => {
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
