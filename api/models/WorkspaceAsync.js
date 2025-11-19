module.exports = {
  identity: 'workspaceasync',
  primaryKey: 'id',
  tableName: 'workspaceasync',
  attributes: {
    args: {
      type: 'json',
      required: true
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
      type: 'json'
    },
    method: {
      type: 'string',
      required: true
    },
    name: {
      type: 'string',
      required: true
    },
    recordType: {
      type: 'string',
      required: true
    },
    service: {
      type: 'string',
      required: true
    },
    started_by: {
      type: 'string',
      required: true
    },
    status: {
      type: 'string'
    },
  },
};
