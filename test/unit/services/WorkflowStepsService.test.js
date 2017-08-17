describe('The WorkflowStepsService', function () {
  before(function (done) {
    done();
  });

  it('should return the initial workflow step', function (done) {
    var brand = BrandingService.getDefault();
    WorkflowStepsService.getFirst(brand).subscribe(function(workflowStep){
      expect(workflowStep).to.have.property('name', 'draft');
      done();
    });
  });

  it('should return the workflow step by name', function (done) {
    var brand = BrandingService.getDefault();
    WorkflowStepsService.get(brand, 'active').subscribe(function(workflowStep){
      expect(workflowStep).to.have.property('name', 'active');
      done();
    });
  });

});
