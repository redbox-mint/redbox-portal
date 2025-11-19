module.exports = {
  identity: 'brandingconfighistory',
  primaryKey: 'id',
  tableName: 'brandingconfighistory',
  datastore: 'redboxStorage',
  indexes: [
    {
      attributes: {
        branding: 1,
        version: 1
      },
      options: {
        unique: true
      }
    }
  ],
  attributes: {
    branding: {
      required: true,
      model: 'brandingconfig'
    },
    css: {
      type: 'string'
    },
    dateCreated: {
      type: 'string',
      autoCreatedAt: true
    },
    hash: {
      type: 'string',
      required: true
    },
    variables: {
      type: 'json'
    },
    version: {
      type: 'number',
      required: true
    },
  },
};
