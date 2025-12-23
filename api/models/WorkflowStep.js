module.exports = {
  primaryKey: 'id',
  tableName: 'workflowstep',
  attributes: {
    config: {
      type: 'json',
      required: true
    },
    form: {
      model: 'form'
    },
    hidden: {
      type: 'boolean',
      defaultsTo: false
    },
    name: {
      type: 'string',
      required: true
    },
    recordType: {
      model: 'recordType'
    },
    starting: {
      type: 'boolean',
      required: true
    },
  },
};
