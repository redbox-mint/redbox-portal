module.exports = {
  primaryKey: 'id',
  tableName: 'report',
  attributes: {
    branding: {
      required: true,
      model: 'brandingconfig'
    },
    columns: {
      type: 'json',
      required: true
    },
    databaseQuery: {
      type: 'json'
    },
    filter: {
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
    reportSource: {
      type: 'string'
    },
    solrQuery: {
      type: 'json'
    },
    title: {
      type: 'string',
      required: true
    },
  },
  beforeCreate: (report, cb) => {
      report.key = `${report.branding}_${report.name}`;
      cb();
  },
};
