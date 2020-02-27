/**
 * WorkflowStep.js
 *
 * @description :: Workflows with this brand...
 * @docs        :: http://sailsjs.org/documentation/concepts/models-and-orm/models
 */

module.exports = {
  attributes: {
    name: {
      type: 'string',
      required: true
    },
    // A Workflow step can have a form, 1 to 1
    form: {
      model: 'form'
    },
    config: {
      type: 'json',
      required: true
    },
    starting: {
      type: 'boolean',
      required: true
    },
    recordType: {
      model: 'recordType'
    },
    hidden: {
      type: 'boolean',
      defaultsTo: false
    }
  }
}
