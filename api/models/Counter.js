/**
 * Counter.js
 *
 * @description :: Model for tracking counters
 * @docs        :: http://sailsjs.org/documentation/concepts/models-and-orm/models
 */

module.exports = {
  attributes: {
    name: {
      type: 'string',
      unique: true,
      required: true
    },
    branding: {
      model: 'brandingconfig'
    },
    value: {
      type: 'number'
    }
  }
};
