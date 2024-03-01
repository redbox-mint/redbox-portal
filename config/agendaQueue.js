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
        lockLimit: 10,
        concurrency: 10 
      }
    },
    {
      name: 'SolrSearchService-DeleteFromIndex',
      fnName: 'solrsearchservice.solrDelete',
      options: {
        lockLifetime: 3 * 1000, // 3 seconds max runtime
        lockLimit: 10,
        concurrency: 10 
      }
    },
    {
      name: 'RecordsService-StoreRecordAudit',
      fnName: 'recordsservice.storeRecordAudit',
    },
    {
      name: 'RaidMintRetryJob',
      fnName: 'raidservice.mintRetryJob'
    }
  ]
};
