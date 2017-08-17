describe('The FormsService', function () {
  before(function (done) {
    done();
  });

  it('should return the default draft form', function (done) {
    var brand = BrandingService.getDefault();
    var formName = 'default-1.0-draft';
    FormsService.getForm(formName, brand.id, true).subscribe(function(form) {
      expect(form).to.have.property('name', formName);
      done();
    })
  });

});
