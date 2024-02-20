/**
 * DashboardType.js
 *
 * @description :: DashboardType associated with this brand...
 * @docs        :: http://sailsjs.org/documentation/concepts/models-and-orm/models
 */

module.exports = {
  attributes: {
    key: {
      type: 'string',
      unique: true
    },
    // Name of the dashboard type
    name: {
      type: 'string',
      required: true
    },
    // A Record needs to belong to a Brand, 1 to 1
    branding: {
      model: 'brandingconfig',
      required: true
    },
    // Format rules that define the dashboard type
    formatRules: {
      type: 'json',
      required: true
    },
    searchable: {
      type: 'boolean',
      required: false,
      defaultsTo: true
    }
  },
    beforeCreate: function(dashboardType, cb) {
        dashboardType.key = dashboardType.branding+'_'+dashboardType.name;
        cb();
    }
}
