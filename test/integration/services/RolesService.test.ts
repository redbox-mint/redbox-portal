const { portalFixture: fixture } = require("../../helpers/portalFixture.cjs");
describe('The RolesService', function () {
  before(function (done) {
    done();
  });

  it('should return an admin role', function (done) {
    var brand = fixture.services.BrandingService.getDefault();
    expect(fixture.services.RolesService.getAdmin(brand)).to.have.property('name', 'Admin');
    done();
  });

  it('should return roles for a brand, have default unauthenticated roles', function (done) {
    var brand = fixture.services.BrandingService.getDefault();
    fixture.services.RolesService.getRolesWithBrand(brand).subscribe(function(roles) {
      expect(fixture.services.RolesService.getDefUnathenticatedRole(brand)).to.have.property('name', 'Guest');
      done();
    });
  });

});
