module.exports = {
  identity: 'workspaceapp',
  primaryKey: 'id',
  tableName: 'workspaceapp',
  indexes: [
    {
      attributes: {
        app: 1,
        user: 1
      },
      options: {
        unique: true
      }
    }
  ],
  attributes: {
    app: {
      type: 'string',
      required: true
    },
    info: {
      type: 'json'
    },
    user: {
      required: true,
      model: 'user'
    },
  },
};
