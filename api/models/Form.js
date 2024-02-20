/**
 * Form.js
 *
 * @description :: Configuration for each Form
 * @docs        :: http://sailsjs.org/documentation/concepts/models-and-orm/models
 */

module.exports = {
  attributes: {
    name: {
      type: 'string',
      unique: true,
      required: true
    },
    customAngularApp: {
      type: 'json'
    },
    fields: {
      type: 'json'
    },
    workflowStep: {
      model: 'workflowStep'
    },
    type: {
      type: 'string'
    },
    messages: {
      type: 'json'
    },
    requiredFieldIndicator: {
      type: 'string'
    },
    viewCssClasses: {
      type: 'string'
    },
    editCssClasses: {
      type: 'string'
    },
    skipValidationOnSave: {
      type: 'boolean'
    },
    attachmentFields: {
      type: 'json'
    }
  }
};
