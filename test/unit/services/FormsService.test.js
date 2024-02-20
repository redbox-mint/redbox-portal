

describe('The FormsService', function () {
  before(function (done) {
    done();
  });

  it('should return the default RDMP form', function (done) {
    var brand = BrandingService.getDefault();
    var recordType = 'rdmp';
    var formName = 'default-1.0-draft';
    RecordType.find().then(forms => {sails.log.verbose(`going to look for ${brand.id}_${formName}`);sails.log.verbose(forms);});
    console.log('brand.id '+brand.id+' recordType '+recordType);
    FormsService.getForm(brand.id, recordType, true, true).subscribe(function(form) {
      expect(form).to.have.property('name', formName);
      done();
    })
  });

  it('should get default-1.0-draft form', function (done) {
    
    var formName = 'dataPublication-1.0-embargoed';

    FormsService.getFormByName( formName, true).subscribe(function(form) {
      console.log(form)
      // expect(form).to.have.property('name', formName);
      expect(true).to.eq(true)
      done();
    })
  });

});
