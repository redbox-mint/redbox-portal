const { portalFixture: fixture } = require("../../helpers/portalFixture.cjs");
import { fixtureRow } from '../../helpers/persistenceFixtures';
describe('The WorkflowStepsService', function () {
  before(function (done) {
    done();
  });

  it('should return the initial workflow step', function (done) {
    var brand = fixture.services.BrandingService.getDefault();
    fixtureRow("RecordType", {key: brand.id+"_"+"rdmp"}).then(recordType => {
    fixture.services.WorkflowStepsService.getFirst(recordType).subscribe(function(workflowStep){
      expect(workflowStep).to.have.property('name', 'draft');
      done();
    });
    }).catch(done);
  });

  it('should return the workflow step by name', function (done) {
    var brand = fixture.services.BrandingService.getDefault();
    fixtureRow("RecordType", {key: brand.id+"_"+"dataPublication"}).then(recordType => {
    fixture.services.WorkflowStepsService.get(recordType, 'published').subscribe(function(workflowStep){
      expect(workflowStep).to.have.property('name', 'published');
      done();
    });
  }).catch(done);
  });

});
