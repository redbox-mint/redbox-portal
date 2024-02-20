/**
 * NamedQuery.js
 *
 * @description :: Named QUery associated with this brand...
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
    branding: {
      model: 'brandingconfig',
      required: true
    },
    mongoQuery: {
      type: 'string',
      required: true
    },
    queryParams: {
      type: 'string',
      required: true
    }
    
  },
    beforeCreate: function(namedQuery, cb) {
        namedQuery.key = namedQuery.branding+'_'+namedQuery.name;
        cb();
    }
}
