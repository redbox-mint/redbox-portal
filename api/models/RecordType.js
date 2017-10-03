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
    // RecordType can have many workflow steps
    workflowSteps: {
      collection: 'workflowStep',
      via: 'recordType',
      dominant: true
    }
  },
    beforeCreate: function(recordType, cb) {
        recordType.key = recordType.branding+'_'+recordType.name;
        cb();
    }
}
