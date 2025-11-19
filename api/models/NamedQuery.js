module.exports = {
  identity: 'namedquery',
  primaryKey: 'id',
  tableName: 'namedquery',
  attributes: {
    brandIdFieldPath: {
      type: 'string'
    },
    branding: {
      required: true,
      model: 'brandingconfig'
    },
    collectionName: {
      type: 'string',
      required: true
    },
    key: {
      type: 'string',
      unique: true
    },
    mongoQuery: {
      type: 'string',
      required: true
    },
    name: {
      type: 'string',
      required: true
    },
    queryParams: {
      type: 'string',
      required: true
    },
    resultObjectMapping: {
      type: 'string',
      required: true
    },
  },
  beforeCreate: [
    (namedQuery, cb) => {
        namedQuery.key = `${namedQuery.branding}_${namedQuery.name}`;
        cb();
    },
  ],
};
