/**
* WorkspaceApp.js
*
* @description :: Captures the workspaceApps required for singin purposes
* @docs        :: http://sailsjs.org/documentation/concepts/models-and-orm/models
*/

module.exports = {
  attributes: {
    // A workspace app is related to a form and a user
    // Composite app and user 1 on 1 with app-name, user-model
    app: {
      type: 'string',
      required: true
    },
    user: {
      model: 'user',
      required: true
    },
    // A workspaceApp needs to have info in a free form
    info: {
      type: 'json'
    }
  },
  indexes: [
    //app & user composite index
    {
      attributes: {
        app: 1,
        user: 1
      },
      options: {
        unique: true
      }
    }
  ]
}
