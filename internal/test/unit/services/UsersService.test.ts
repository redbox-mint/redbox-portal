describe('The UsersService', function () {
  before(function (done) {
    done();
  });

  it('should retrieve user using ID, with valid roles, can update roles', function (done) {
    var brand = BrandingService.getDefault();
    RolesService.getRolesWithBrand(brand).subscribe(function(roles){
      var adminRole = RolesService.getAdminFromRoles(roles);
      var adminUser = adminRole.users[0];
      UsersService.getUserWithId(adminUser.id).subscribe(function(retrievedUser) {
        expect(retrievedUser).to.have.property('id', adminUser.id);
        expect(UsersService.hasRole(retrievedUser, adminRole)).to.have.property('id', adminRole.id);
        var newRolesIds =  _.map(roles, function(role) {
          if (role.name != 'Admin') {
            return role.id;
          }
        });
        UsersService.updateUserRoles(adminUser.id, newRolesIds).subscribe(function(updatedUser){
          expect(RolesService.getRoleWithName(updatedUser.roles, 'Admin')).to.be.undefined;
          done();
        });
      });
    });
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
