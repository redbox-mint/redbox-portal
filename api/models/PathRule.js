module.exports = {
  primaryKey: 'id',
  tableName: 'pathrule',
  attributes: {
    branding: {
      required: true,
      model: 'brandingconfig'
    },
    can_read: {
      type: 'boolean'
    },
    can_write: {
      type: 'boolean'
    },
    custom: {
      type: 'string'
    },
    path: {
      type: 'string',
      required: true
    },
    role: {
      required: true,
      model: 'role'
    },
  },
};
