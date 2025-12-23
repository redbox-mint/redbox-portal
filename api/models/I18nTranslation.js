module.exports = {
  primaryKey: 'id',
  tableName: 'i18ntranslation',
  attributes: {
    branding: {
      model: 'brandingconfig'
    },
    bundle: {
      model: 'i18nbundle'
    },
    category: {
      type: 'string',
      allowNull: true
    },
    description: {
      type: 'string',
      allowNull: true
    },
    key: {
      type: 'string',
      required: true
    },
    locale: {
      type: 'string',
      required: true
    },
    namespace: {
      type: 'string',
      defaultsTo: 'translation'
    },
    uid: {
      type: 'string',
      unique: true
    },
    value: {
      type: 'json',
      required: true
    },
  },
  beforeCreate: (translation, cb) => {
      try {
          assignUid(translation);
          cb();
      }
      catch (error) {
          cb(error);
      }
  },
  beforeUpdate: (values, cb) => {
      try {
          assignUid(values);
          cb();
      }
      catch (error) {
          cb(error);
      }
  },
};
