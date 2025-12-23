module.exports = {
  primaryKey: 'id',
  tableName: 'useraudit',
  attributes: {
    action: {
      type: 'string',
      required: true
    },
    additionalContext: {
      type: 'json'
    },
    user: {
      type: 'json',
      required: true
    },
  },
};
