/**
 * RecordType.js
 *
 * @description :: RecordType associated with this brand...
 * @docs        :: http://sailsjs.org/documentation/concepts/models-and-orm/models
 */

module.exports = {
  attributes: {
    key: {
      type: 'string',
      unique: true
    },
    name: {
      type: 'string',
      required: true
    },
    // A Record needs to belong to a Brand, 1 to 1
    branding: {
      model: 'brandingconfig',
      required: true
    },
    packageType: {
      type: 'string',
      required: false
    },
    searchCore: {
      type: 'string',
      required: false,
      defaultsTo: 'default'
    },
    // RecordType can have many workflow steps
    workflowSteps: {
      collection: 'workflowStep',
      via: 'recordType'
    },
    // RecordType can have specific search parameters
    searchFilters: {
      type: 'json',
      required: false
    },
    searchable: {
      type: 'boolean',
      required: false,
      defaultsTo: true
    },
    transferResponsibility: {
      type: 'json',
      required: false
    },
    relatedTo: {
      type: 'json',
      required: false
    },
    hooks: {
      type: 'json',
      required: false
    },
    // Dashboard-level configuration (separate from workflow-specific table config)
    dashboard: {
      type: 'json',
      required: false
    }
  },
    beforeCreate: function(recordType, cb) {
        recordType.key = recordType.branding+'_'+recordType.name;
        cb();
    }
}
