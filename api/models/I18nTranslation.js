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
      required: false
    },
  },
  beforeCreate: (translation, cb) => {
      // Manual validation for 'value' because required:true disallows empty strings
      if (translation.value === undefined || translation.value === null) {
          const err = new Error('Value is required');
          err.code = 'E_INVALID_NEW_RECORD';
          return cb(err);
      }
      try {
          const brandingPart = translation.branding ? String(translation.branding) : 'global';
          const locale = translation.locale;
          const ns = translation.namespace || 'translation';
          const key = translation.key;
          if (brandingPart && locale && ns && key) {
              translation.uid = `${brandingPart}:${locale}:${ns}:${key}`;
          }
          cb();
      }
      catch (error) {
          cb(error);
      }
  },
  beforeUpdate: (values, cb) => {
      // Manual validation for 'value'
      if (Object.hasOwn(values, 'value') && values.value === null) {
          const err = new Error('Value cannot be null');
          err.code = 'E_INVALID_NEW_RECORD';
          return cb(err);
      }
      try {
          const brandingPart = values.branding ? String(values.branding) : 'global';
          const locale = values.locale;
          const ns = values.namespace || 'translation';
          const key = values.key;
          if (brandingPart && locale && ns && key) {
              values.uid = `${brandingPart}:${locale}:${ns}:${key}`;
          }
          cb();
      }
      catch (error) {
          cb(error);
      }
  },
};
