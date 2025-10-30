/**
 * BrandingConfig.js
 *
 * @description :: Configuration for each Brand
 * @docs        :: http://sailsjs.org/documentation/concepts/models-and-orm/models
 */

module.exports = {
  attributes: {
    name: {
      type: 'string'
    },
    css: {
      type: 'string'
    },
    // Brand has many roles
    roles: {
      collection: 'role',
      via: 'branding'
    },
    // Support agreement properties - year-on-year information stored as JSON
    supportAgreementInformation: {
      type: 'json',
      defaultsTo: {}
    }
  }
};
