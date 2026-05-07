
describe('The Agenda Queue Service', function () {
  let resolveProcessedTestData: ((data: string) => void) | null = null;

  before(function (done) {
    let testQueueConsumer = function (job: { attrs: { data: string } }) {
      let data = job.attrs.data;
      if (resolveProcessedTestData && data === 'Test data') {
        resolveProcessedTestData(data);
      }
      sails.log.debug(`Received ${data}`)
      return data;
    };
    AgendaQueueService.defineJob('testJob', null, testQueueConsumer)
    done();
  });

  it("Send a job and check it's executed", async function () {
    this.timeout(90000);

    const processed = new Promise<string>((resolve, reject) => {
      const timeout = setTimeout(() => {
        resolveProcessedTestData = null;
        reject(new Error('Timed out waiting for testJob to finish processing in Agenda queue.'));
      }, 60000);

      resolveProcessedTestData = (data) => {
        clearTimeout(timeout);
        resolveProcessedTestData = null;
        resolve(data);
      };
    });

    await AgendaQueueService.now('testJob', 'Test data');
    const processedData = await processed;
    if (processedData !== 'Test data') {
      throw new Error(`Expected testJob to process 'Test data', received '${processedData}'.`);
    }
  });


});
