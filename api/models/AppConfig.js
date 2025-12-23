module.exports = {
  primaryKey: 'id',
  tableName: 'appconfig',
  attributes: {
    branding: {
      required: true,
      model: 'brandingconfig'
    },
    configData: {
      type: 'json'
    },
    configKey: {
      type: 'string',
      required: true
    },
  },
};
