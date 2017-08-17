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
    branding: {
      model: 'brandingconfig',
      required: true
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
