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
    viewCssClasses: {
      type: 'string'
    },
    editCssClasses: {
      type: 'string'
    },
    skipValidationOnSave: {
      type: 'boolean'
    }
  }
};
