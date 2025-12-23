module.exports = {
  primaryKey: 'id',
  tableName: 'workspacetype',
  attributes: {
    branding: {
      required: true,
      model: 'brandingconfig'
    },
    description: {
      type: 'string'
    },
    externallyProvisioned: {
      type: 'boolean',
      defaultsTo: false
    },
    logo: {
      type: 'string'
    },
    name: {
      type: 'string',
      required: true
    },
    subtitle: {
      type: 'string'
    },
  },
};
