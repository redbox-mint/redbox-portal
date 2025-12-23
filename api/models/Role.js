module.exports = {
  primaryKey: 'id',
  tableName: 'role',
  attributes: {
    branding: {
      model: 'brandingconfig'
    },
    name: {
      type: 'string',
      required: true
    },
    users: {
      dominant: true,
      collection: 'user',
      via: 'roles'
    },
  },
};
