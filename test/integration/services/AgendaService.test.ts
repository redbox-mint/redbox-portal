
describe('The Agenda Queue Service', function () {
  let processedTestData = null;

  before(function (done) {
    let testQueueConsumer = function (job) {
      let data = job.attrs.data;
      processedTestData = data;
      sails.log.debug(`Received ${data}`)
      return data;
    };
    AgendaQueueService.defineJob('testJob', null, testQueueConsumer)
    done();
  });

  it("Send a job and check it's executed", async function () {
    this.timeout(30000);
    processedTestData = null;

    AgendaQueueService.now('testJob', 'Test data');

    const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
    const maxAttempts = 40;

    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      if (processedTestData === 'Test data') {
        return;
      }

      await wait(500);
    }

    throw new Error('Timed out waiting for testJob to finish processing in Agenda queue.');
  });


});
