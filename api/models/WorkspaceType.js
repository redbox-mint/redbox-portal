/**
* WorkspaceType.js
*
* @description :: Captures the workspaces types available for redbox-portal
* @docs        :: http://sailsjs.org/documentation/concepts/models-and-orm/models
*/

module.exports = {
  attributes: {
    name: {
      type: 'string',
      required: true
    },
    //TODO: Is this needed?
    // A Workspace needs to belong to a Brand, 1 to 1
    branding: {
      model: 'brandingconfig',
      required: true
    },
    //TODO: It should be added to the GridFS
    //https://sailsjs.com/documentation/concepts/file-uploads/uploading-to-grid-fs
    //It cannot be added with skipper-gridfs because that uses `req` so it just
    //extends the body parser, needs to be done manually if it is at bootstrap.
    logo: {
      type: 'string'
    },
    subtitle: {
      type: 'string'
    },
    description: {
      type: 'string'
    }
  }
}
