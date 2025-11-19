module.exports = {
  identity: 'cacheentry',
  primaryKey: 'id',
  tableName: 'cacheentry',
  attributes: {
    data: {
      type: 'json'
    },
    name: {
      type: 'string',
      required: true,
      unique: true
    },
    ts_added: {
      type: 'number',
      required: true
    },
  },
};
