/**
 * Report.js
 *
 * @description :: Report associated with this brand...
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
    title: {
      type: 'string',
      required: true
    },
    // A Record needs to belong to a Brand, 1 to 1
    branding: {
      model: 'brandingconfig',
      required: true
    },
    reportSource:{
      type: 'string',
    },
    solrQuery: {
      type: 'json'
    },
    databaseQuery: {
      type: 'json'
    },
    filter: {
      type: 'json',
      required: true
    },
    columns: {
      type: 'json',
      required: true
    }
  },
    beforeCreate: function(report, cb) {
        report.key = report.branding+'_'+report.name;
        cb();
    }
}
