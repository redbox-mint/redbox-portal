/**
 * WorkspaceAsync.js
 *
 * @description :: Tracks Asynchrounous workspace methods
 * @docs        :: http://sailsjs.org/documentation/concepts/models-and-orm/models
 */
// moment removed: not used; dates stored as plain strings.

module.exports = {
  attributes: {
    name: {
      type: 'string',
      required: true
    },
    recordType: {
      type: 'string',
      required: true
    },
    date_started: {
      type: 'string',
      columnType: 'datetime'
    },
    date_completed: {
      type: 'string',
      columnType: 'datetime'
    },
    started_by: {
      type: 'string',
      required: true
    },
    service:{
      type: 'string',
      required: true
    },
    method:{
      type: 'string',
      required: true
    },
    args:{
      type: 'json',
      required: true
    },
    status: {
      type: 'string'
    },
    message: {
      type: 'json'
    }
  }
};
