module.exports.agendaQueue = {
  // options: {
  //  see: https://github.com/agenda/agenda#configuring-an-agenda
  // }
  // e.g. :
  // jobs: [
  //   {
  //     name: 'sampleJob',
  //     fnName: 'agendaqueueservice.sampleFunctionToDemonstrateHowToDefineAJobFunction',
  //     schedule: {
  //       method: 'every',
  //       intervalOrSchedule: '1 minute',
  //       data: 'sample log string'
  //     }
  //   }
  // ]
  jobs: [
    {
      name: 'SolrSearchService-CreateOrUpdateIndex',
      fnName: 'solrsearchservice.solrAddOrUpdate',
      options: {
        lockLifetime: 3 * 1000, // 3 seconds max runtime
        lockLimit: 1,
        concurrency: 1
      }
    },
    {
      name: 'SolrSearchService-DeleteFromIndex',
      fnName: 'solrsearchservice.solrDelete',
      options: {
        lockLifetime: 3 * 1000, // 3 seconds max runtime
        lockLimit: 1,
        concurrency: 1
      }
    },
    {
      name: 'RecordsService-StoreRecordAudit',
      fnName: 'recordsservice.storeRecordAudit',
      options: {
        lockLifetime: 30 * 1000,
        lockLimit: 1,
        concurrency: 1
      }
    },
    {
      name: 'RaidMintRetryJob',
      fnName: 'raidservice.mintRetryJob'
    },
    {
      name: 'MoveCompletedJobsToHistory',
      fnName: 'agendaqueueservice.moveCompletedJobsToHistory',
      schedule: {
        method: 'every',
        intervalOrSchedule: '5 minutes'
      }
    },
    {
      name: 'Figshare-Upload-Service',
      fnName: 'rdmpservice.processQueuedFileUploadToFigshare',
      options: {
        lockLifetime: 20 * 60 * 1000, //20 mins because there can be big files uploaded that can take long
        lockLimit: 1,
        concurrency: 1
      }
    }
  ]
};
