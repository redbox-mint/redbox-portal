module.exports = {
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
  beforeCreate: (bundle, cb) => {
      try {
          const brandingPart = bundle.branding ? String(bundle.branding) : 'global';
          const locale = bundle.locale;
          const ns = bundle.namespace || 'translation';
          bundle.uid = `${brandingPart}:${locale}:${ns}`;
          cb();
      }
      catch (error) {
          cb(error);
      }
  },
  beforeUpdate: (values, cb) => {
      try {
          if (values.locale || values.namespace || values.branding) {
              const brandingPart = values.branding ? String(values.branding) : 'global';
              const locale = values.locale;
              const ns = values.namespace || 'translation';
          }
          cb();
      }
      catch (error) {
          cb(error);
      }
  },
};
