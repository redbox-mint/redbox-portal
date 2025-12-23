module.exports = {
  primaryKey: 'id',
  tableName: 'form',
  attributes: {
    attachmentFields: {
      type: 'json'
    },
    customAngularApp: {
      type: 'json'
    },
    editCssClasses: {
      type: 'string'
    },
    fields: {
      type: 'json'
    },
    messages: {
      type: 'json'
    },
    name: {
      type: 'string',
      required: true,
      unique: true
    },
    requiredFieldIndicator: {
      type: 'string'
    },
    skipValidationOnSave: {
      type: 'boolean'
    },
    type: {
      type: 'string'
    },
    viewCssClasses: {
      type: 'string'
    },
    workflowStep: {
      model: 'workflowStep'
    },
  },
};
