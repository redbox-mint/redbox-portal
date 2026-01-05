/**
 * Record.js
 *
 * @description :: The Deleted Record Model for ReDBox
 * @docs        :: http://sailsjs.org/documentation/concepts/models-and-orm/models
 */

module.exports = {
    attributes: {
      redboxOid: {
        type: 'string',
        unique: true
      },
      deletedRecordMetadata: {
        type: 'json'
      },
      dateDeleted: {
        type: 'string',
        autoCreatedAt: true
      }
    },
    datastore: 'redboxStorage'
  };
  