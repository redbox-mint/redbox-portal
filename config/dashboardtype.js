module.exports.dashboardtype = {
  "standard": {
    formatRules: {
        filterBy: [], //filterBase can only have two values user or record
        filterWorkflowStepsBy: [], //values: empty array (all) or a list with particular types i.e. [ 'draft', 'finalised' ]  
        sortBy: 'metaMetadata.lastSaveDate:-1',
        groupBy: '', //values: empty (not grouped any order), groupedByRecordType, groupedByRelationships 
        sortGroupBy: [], //values: as many levels as required?
      }
  },
  "workspace": {
    formatRules: {
      filterBy: [], //filterBase can only have two values user or record
      recordTypeFilterBy: 'existing-locations',
      filterWorkflowStepsBy: ['existing-locations-draft'], //values: empty array (all) or a list with particular types i.e. [ 'draft', 'finalised'] 
      sortBy: 'metaMetadata.lastSaveDate:-1',
      groupBy: '', //values: empty (not grouped any order), groupedByRecordType, groupedByRelationships 
      sortGroupBy: [] //values: as many levels as required? 
    }
  },
  "consolidated": {
    formatRules: {
        filterBy: [ {filterBase: 'user', filterBaseFieldOrValue: 'user.email', filterField: 'metadata.contributor_ci.email', filterMode: 'equal' } ], //filterBase can only have two values user or record
        filterWorkflowStepsBy: ['consolidated'], //values: empty array (all) or a list with particular types i.e. [ 'draft', 'finalised' ]   
        sortBy: '',
        groupBy: 'groupedByRelationships', //values: empty (not grouped any order), groupedByRecordType, groupedByRelationships 
        sortGroupBy: [{ rowLevel: 0, compareFieldValue: 'rdmp', compareField: 'metadata.metaMetadata.type', icon: 'none' }, 
                      { rowLevel: 1, compareFieldValue: 'dataRecord', compareField: 'metadata.metaMetadata.type', icon: 'tree-relationsip.png' }, 
                      { rowLevel: 2, compareFieldValue: 'dataPublication', compareField: 'metadata.metaMetadata.type', icon: 'tree-relationsip.png' }] //values: as many levels as required?
      }
  }
};
