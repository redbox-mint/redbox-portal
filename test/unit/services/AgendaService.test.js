
describe('The Agenda Queue Service', function () {
  before(function (done) {
    let testQueueConsumer = function(job) {
      let data = job.attrs.data;
      sails.log.debug(`Received ${data}`)
      return data;
    };
    AgendaQueueService.defineJob('testJob', null, testQueueConsumer)
    done();
  });

  it("Send a job and check it's executed", function (done) {    
    this.timeout(5000);

    
    AgendaQueueService.now('testJob',  'Test data' )
      // TODO: This 2 second waiting to check is a bit of a hack. It's probably robust enough because the dummy job 
      // that doesn't do anything but there's a chance of random failures due to hardware blocking on the CI server 
      // This is mitigated a bit by the fact any other test that takes longer than 2 seconds will fail
     setTimeout(function(){
      AgendaQueueService.jobs().then(response =>{
        let job = response[0]
        //Check that the job has turned up in the queue and that it finished
        expect(job['attrs']).to.have.property("lastFinishedAt")
        done();
    });}, 2000)
    
  });


});
