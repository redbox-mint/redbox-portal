module.exports = {
  primaryKey: 'id',
  tableName: 'recordtype',
  attributes: {
    branding: {
      required: true,
      model: 'brandingconfig'
    },
    dashboard: {
      type: 'json'
    },
    hooks: {
      type: 'json'
    },
    key: {
      type: 'string',
      unique: true
    },
    name: {
      type: 'string',
      required: true
    },
    packageType: {
      type: 'string'
    },
    relatedTo: {
      type: 'json'
    },
    searchable: {
      type: 'boolean',
      defaultsTo: true
    },
    searchCore: {
      type: 'string',
      defaultsTo: 'default'
    },
    searchFilters: {
      type: 'json'
    },
    transferResponsibility: {
      type: 'json'
    },
    workflowSteps: {
      collection: 'workflowStep',
      via: 'recordType'
    },
  },
  beforeCreate: (recordType, cb) => {
      recordType.key = `${recordType.branding}_${recordType.name}`;
      cb();
  },
};
