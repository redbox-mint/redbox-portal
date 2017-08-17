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
    // A Workflow needs to belong to a Brand, 1 to 1
    branding: {
      model: 'brandingconfig',
      required: true
    },
    config: {
      type: 'json',
      required: true
    },
    starting: {
      type: 'boolean',
      required: true
    }
  }
}
