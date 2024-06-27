module.exports.dashboardtype = {
  "standard": {
    formatRules: {
        filterBy: {}, //filterBase can only have two values user or record
        filterWorkflowStepsBy: [], //values: empty array (all) or a list with particular types i.e. [ 'draft', 'finalised' ]
        queryFilters: {
          party: [
            {
              filterType: 'text',
              filterFields:  [ 
                               { 
                                  name: 'Title',
                                  path: 'metadata.title' 
                               }, 
                               { 
                                  name: 'Contributor',
                                  path: 'metadata.contributor_ci.text_full_name'
                               }
                             ]
            }
          ],
          rdmp: [
            {
              filterType: 'text',
              filterFields:  [ 
                               { 
                                  name: 'Title',
                                  path: 'metadata.title' 
                               }, 
                               { 
                                  name: 'Contributor',
                                  path: 'metadata.contributor_ci.text_full_name'
                               }
                             ]
            }
          ],
          dataRecord: [
            {
              filterType: 'text',
              filterFields:  [ 
                               { 
                                  name: 'Title',
                                  path: 'metadata.title' 
                               }, 
                               { 
                                  name: 'Contributor',
                                  path: 'metadata.contributor_ci.text_full_name'
                               }
                             ]
            }
          ],
          dataPublication: [
            {
              filterType: 'text',
              filterFields:  [ 
                               { 
                                  name: 'Title',
                                  path: 'metadata.title' 
                               }, 
                               { 
                                  name: 'Contributor',
                                  path: 'metadata.contributor_ci.text_full_name'
                               }
                             ]
            }
          ]
        },
        sortBy: 'metaMetadata.lastSaveDate:-1',
        groupBy: '', //values: empty (not grouped any order), groupedByRecordType, groupedByRelationships
        sortGroupBy: [], //values: as many levels as required
        hideWorkflowStepTitleForRecordType: ['party']
      }
  },
  "workspace": {
    formatRules: {
      filterBy: {}, //filterBase can only have two values user or record
      recordTypeFilterBy: 'existing-locations',
      filterWorkflowStepsBy: ['existing-locations-draft'], //values: empty array (all) or a list with particular types i.e. [ 'draft', 'finalised'] 
      sortBy: 'metaMetadata.lastSaveDate:-1',
      groupBy: '', //values: empty (not grouped any order), groupedByRecordType, groupedByRelationships 
      sortGroupBy: [], //values: as many levels as required
      hideWorkflowStepTitleForRecordType: []
    }
  },
  "consolidated": {
    formatRules: {
        filterBy: {filterBase: 'record', filterBaseFieldOrValue: 'rdmp', filterField: 'metaMetadata.type', filterMode: 'equal' }, //filterBase can only have two values user or record
        filterWorkflowStepsBy: ['consolidated'], //values: empty array (all) or a list with particular types i.e. [ 'draft', 'finalised' ]   
        sortBy: '',
        groupBy: 'groupedByRelationships', //values: empty (not grouped any order), groupedByRecordType, groupedByRelationships 
        sortGroupBy: [{ rowLevel: 0, compareFieldValue: 'rdmp', compareField: 'metadata.metaMetadata.type', relatedTo: '' }, 
                      { rowLevel: 1, compareFieldValue: 'dataRecord', compareField: 'metadata.metaMetadata.type', relatedTo: 'metadata.metadata.rdmp.oid' }, 
                      { rowLevel: 2, compareFieldValue: 'dataPublication', compareField: 'metadata.metaMetadata.type', relatedTo: 'metadata.metadata.dataRecord.oid' }], //values: as many levels as required
        hideWorkflowStepTitleForRecordType: []
      }
  }
};
