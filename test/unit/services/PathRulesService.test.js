describe('The PathRulesService', function () {
  before(function (done) {
    done();
  });

  it('should return valid rules for /default/rdmp/home', function (done) {
    var brand = BrandingService.getDefault();
    var rules = PathRulesService.getRulesFromPath('/default/rdmp/home', brand);
    expect(rules).to.have.lengthOf(1);
    RolesService.getRolesWithBrand(brand).subscribe(function(roles) {
      var guestRoles = [RolesService.getDefUnathenticatedRole(brand)];
      expect(PathRulesService.canRead(rules, guestRoles, brand.name)).to.be.true;
      expect(PathRulesService.canWrite(rules, guestRoles, brand.name)).to.be.false;
      done();
    });
  });

  it('should return no rules for /default/rdmp/norules', function (done) {
    var brand = BrandingService.getDefault();
    var rules = PathRulesService.getRulesFromPath('/default/rdmp/norules', brand);
    expect(rules).to.be.null;
    done();
  });

  it('should return valid rules for /default/rdmp/admin/test', function (done) {
    var brand = BrandingService.getDefault();
    var rules = PathRulesService.getRulesFromPath('/default/rdmp/admin/test', brand);
    var adminRoles = [RolesService.getAdmin(brand)];
    expect(PathRulesService.canRead(rules, adminRoles, brand.name)).to.be.true;
    expect(PathRulesService.canWrite(rules, adminRoles, brand.name)).to.be.true;
    done();
  });

});
