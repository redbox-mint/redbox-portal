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

});
