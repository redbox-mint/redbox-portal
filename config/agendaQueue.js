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
      fnName: 'solrsearchservice.solrAddOrUpdate'
    },
    {
      name: 'SolrSearchService-DeleteFromIndex',
      fnName: 'solrsearchservice.solrDelete'
    },
    {
      name: 'RecordsService-StoreRecordAudit',
      fnName: 'recordsservice.storeRecordAudit'
    },
  ]
};
