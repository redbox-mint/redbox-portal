/**
 * PathRules.js
 *
 * @description :: Captures the Path rules
 * @docs        :: http://sailsjs.org/documentation/concepts/models-and-orm/models
 */

module.exports = {
  attributes: {
    // URL path
    path: {
      type: 'string',
      required: true
    },
    // A Rule belongs to a Role, null for the unauthenticated public
    role: {
      model: 'role',
      required: true
    },
    // Adding a branding fk, this is NoSQL land, not normalising...
    // this will allow us to to query rules by brand, potentially allowing brand admins to set up rules
    branding: {
      model: 'brandingconfig',
      required: true
    },
    // can read the path
    can_read: {
      type: 'boolean'
    },
    // can write on the path
    can_write: {
      type: 'boolean'
    },
    // run a specific method in the rules service?
    custom: {
      type: 'string'
    }
  }
}
