module.exports = {
  identity: 'dashboardtype',
  primaryKey: 'id',
  tableName: 'dashboardtype',
  attributes: {
    branding: {
      required: true,
      model: 'brandingconfig'
    },
    formatRules: {
      type: 'json',
      required: true
    },
    key: {
      type: 'string',
      unique: true
    },
    name: {
      type: 'string',
      required: true
    },
    searchable: {
      type: 'boolean',
      defaultsTo: true
    },
  },
  beforeCreate: [
    (dashboardType, cb) => {
        dashboardType.key = `${dashboardType.branding}_${dashboardType.name}`;
        cb();
    },
  ],
};
