/**
 * UserAudit.js
 *
 * @description :: Captures the User Audit Events
 * @docs        :: http://sailsjs.org/documentation/concepts/models-and-orm/models
 */

 module.exports = {
    attributes: {
      // The user in question
      user: {
        type: 'json',
        required: true
      },
      // The type of action we are capturing. e.g. login/logout
      action: {
        type: 'string',
        required: true
      },
      additionalContext: {
        type: 'json'
      }
    }
  }