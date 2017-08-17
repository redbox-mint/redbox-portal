describe('The BrandingService', function () {

  before(function (done) {
      done();
  });

  it('should have one brand', function (done) {
     var brands = BrandingService.getAvailable();
     brands.should.have.length(1);
     done();
  });

  it('should return the default brand', function (done) {
     var defBrand = BrandingService.getDefault();
     defBrand.should.have.property('name', 'default');
     defBrand = BrandingService.getBrand('default');
     defBrand.should.have.property('name', 'default');
     done();
  });

  it('should resolve the correct brand and portal', function (done) {
    var req = {'params': {'branding': sails.config.auth.defaultBrand, 'portal': sails.config.auth.defaultPortal}};
    var path = BrandingService.getBrandAndPortalPath(req);
    path.should.equal('/'+req.params.branding + '/' + req.params.portal);
    path = BrandingService.getBrandAndPortalPath({params:{}});
    path.should.equal('/'+req.params.branding + '/' + req.params.portal);
    done();
  });
});
