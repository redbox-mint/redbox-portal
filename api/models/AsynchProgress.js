/**
 * AsynchProgress.js
 *
 * @description :: Tracks Asynchrounous progress started by the portal.
 * @docs        :: http://sailsjs.org/documentation/concepts/models-and-orm/models
 */
// moment removed: not used; dates stored as plain strings.

module.exports = {
  attributes: {
    name: {
      type: 'string',
      required: true
    },
    branding: {
      model: 'brandingconfig',
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
    currentIdx: {
      type: 'number'
    },
    targetIdx: {
      type: 'number'
    },
    status: {
      type: 'string'
    },
    message: {
      type: 'string'
    },
    metadata: {
      type: 'json'
    },
    relatedRecordId: {
      type: 'string'
    },
    taskType: {
      type: 'string'
    }
  }
};
