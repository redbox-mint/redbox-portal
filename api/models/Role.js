/**
 * Roles.js
 *
 * @description :: Captures the roles
 * @docs        :: http://sailsjs.org/documentation/concepts/models-and-orm/models
 */

module.exports = {
  attributes: {
    name: {
      type: 'string',
      required: true
    },
    // A role needs to belong to a Brand, 1 to 1
    branding: {
      model: 'brandingconfig'
    },
    // Roles have many users
    users: {
      collection: 'user',
      via: 'roles',
      dominant: true
    }
  }
}
