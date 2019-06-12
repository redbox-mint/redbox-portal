describe('The FormsService', function () {
  before(function (done) {
    done();
  });

  it('should return the default RDMP form', function (done) {
    var brand = BrandingService.getDefault();
    var recordType = 'rdmp';
    var formName = 'default-1.0-draft';
    RecordType.find().then(forms => {sails.log.verbose(`going to look for ${brand.id}_${formName}`);sails.log.verbose(forms);});

    FormsService.getForm( brand.id,recordType, true).subscribe(function(form) {
      expect(form).to.have.property('name', formName);
      done();
    })
  });

});
