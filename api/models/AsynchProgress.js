module.exports = {
  primaryKey: 'id',
  tableName: 'asynchprogress',
  attributes: {
    branding: {
      required: true,
      model: 'brandingconfig'
    },
    currentIdx: {
      type: 'number'
    },
    date_completed: {
      type: 'string',
      columnType: 'datetime'
    },
    date_started: {
      type: 'string',
      columnType: 'datetime'
    },
    message: {
      type: 'string'
    },
    metadata: {
      type: 'json'
    },
    name: {
      type: 'string',
      required: true
    },
    relatedRecordId: {
      type: 'string'
    },
    started_by: {
      type: 'string',
      required: true
    },
    status: {
      type: 'string'
    },
    targetIdx: {
      type: 'number'
    },
    taskType: {
      type: 'string'
    },
  },
};
