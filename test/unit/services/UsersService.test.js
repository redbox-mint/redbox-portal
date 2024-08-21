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
      {
        args: {conf: {}, email: null},
        expected: {success: false, message: 'No email address provided.'}
      },
      {
        args: {conf: {}, email: 'testexample.com'},
        expected: {success: false, message: 'Unexpected email format: testexample.com'},
      },
      {
        args: {conf: {}, email: 'test@more@example.com'},
        expected: {success: false, message: 'Unexpected email format: test@more@example.com'},
      },
      {
        args: {conf: {}, email: 'test@example.com'},
        expected: {success: true, message: 'No authorized email configuration.'},
      },
      {
        args: {conf: {authorizedEmailDomains:['example.com']}, email: 'test@example.com'},
        expected: {success: true, message: 'Authorized email domain: example.com'},
      },
      {
        args: {conf: {authorizedEmailExceptions:['test@example.com']}, email: 'test@example.com'},
        expected: {success: true, message: 'Authorized email exception: test@example.com'},
      },
      {
        args: {conf: {authorizedEmailDomains:['example.net']}, email: 'test@example.com'},
        expected: {success: false, message: 'Email is not authorized to login: test@example.com'},
      },
    ];

    tests.forEach(({args, expected}) => {
      it(`should ${expected.success ? 'pass' : 'fail'} with args ${args}`, function () {
        const result = UsersService.checkAuthorizedEmail(args.conf, args.email);
        expect(result.success).to.equal(expected.success);
        expect(result.message).to.equal(expected.message);
      });
    });
  });
});
