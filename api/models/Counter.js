module.exports = {
  primaryKey: 'id',
  tableName: 'counter',
  attributes: {
    branding: {
      model: 'brandingconfig'
    },
    name: {
      type: 'string',
      required: true,
      unique: true
    },
    value: {
      type: 'number'
    },
  },
};
