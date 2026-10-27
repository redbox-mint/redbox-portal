const { portalFixture: fixture } = require("../../helpers/portalFixture.cjs");
describe('The PathRulesService', function () {
  before(function (done) {
    done();
  });

  it('should return valid rules for /default/rdmp/home', function (done) {
    var brand = fixture.services.BrandingService.getDefault();
    var rules = fixture.services.PathRulesService.getRulesFromPath('/default/rdmp/home', brand);
    expect(rules).to.have.lengthOf(1);
    fixture.services.RolesService.getRolesWithBrand(brand).subscribe(function(roles) {
      var guestRoles = [fixture.services.RolesService.getDefUnathenticatedRole(brand)];
      expect(fixture.services.PathRulesService.canRead(rules, guestRoles, brand.name)).to.be.true;
      expect(fixture.services.PathRulesService.canWrite(rules, guestRoles, brand.name)).to.be.false;
      done();
    });
  });

  it('should return no rules for /default/rdmp/norules', function (done) {
    var brand = fixture.services.BrandingService.getDefault();
    var rules = fixture.services.PathRulesService.getRulesFromPath('/default/rdmp/norules', brand);
    expect(rules).to.be.null;
    done();
  });

  it('should return valid rules for /default/rdmp/admin/test', function (done) {
    var brand = fixture.services.BrandingService.getDefault();
    var rules = fixture.services.PathRulesService.getRulesFromPath('/default/rdmp/admin/test', brand);
    var adminRoles = [fixture.services.RolesService.getAdmin(brand)];
    expect(fixture.services.PathRulesService.canRead(rules, adminRoles, brand.name)).to.be.true;
    expect(fixture.services.PathRulesService.canWrite(rules, adminRoles, brand.name)).to.be.true;
    done();
  });

});
