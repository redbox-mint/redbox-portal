module.exports = {
  identity: 'i18nbundle',
  primaryKey: 'id',
  tableName: 'i18nbundle',
  attributes: {
    branding: {
      model: 'brandingconfig'
    },
    data: {
      type: 'json',
      required: true
    },
    displayName: {
      type: 'string'
    },
    enabled: {
      type: 'boolean',
      defaultsTo: true
    },
    entries: {
      collection: 'i18ntranslation',
      via: 'bundle'
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
  },
  beforeCreate: [
    (bundle, cb) => {
        try {
            buildUid(bundle);
            cb();
        }
        catch (error) {
            cb(error);
        }
    },
  ],
  beforeUpdate: [
    (values, cb) => {
        try {
            if (values.locale || values.namespace || values.branding) {
                buildUid(values);
            }
            cb();
        }
        catch (error) {
            cb(error);
        }
    },
  ],
};
