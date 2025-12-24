describe('The WorkflowStepsService', function () {
  before(function (done) {
    done();
  });

  it('should return the initial workflow step', function (done) {
    var brand = BrandingService.getDefault();
    RecordType.findOne({key: brand.id+"_"+"rdmp"}).then(recordType => {
    WorkflowStepsService.getFirst(recordType).subscribe(function(workflowStep){
      expect(workflowStep).to.have.property('name', 'draft');
      done();
    });
    });
  });

  it('should return the workflow step by name', function (done) {
    var brand = BrandingService.getDefault();
    RecordType.findOne({key: brand.id+"_"+"dataPublication"}).then(recordType => {
    WorkflowStepsService.get(recordType, 'published').subscribe(function(workflowStep){
      expect(workflowStep).to.have.property('name', 'published');
      done();
    });
  });
  });

});
