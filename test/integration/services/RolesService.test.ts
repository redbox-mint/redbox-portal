describe('The RolesService', function () {
  before(function (done) {
    done();
  });

  it('should return an admin role', function (done) {
    var brand = BrandingService.getDefault();
    expect(RolesService.getAdmin(brand)).to.have.property('name', 'Admin');
    done();
  });

  it('should return roles for a brand, have default unauthenticated roles', function (done) {
    var brand = BrandingService.getDefault();
    RolesService.getRolesWithBrand(brand).subscribe(function(roles) {
      expect(RolesService.getDefUnathenticatedRole(brand)).to.have.property('name', 'Guest');
      done();
    });
  });

});
