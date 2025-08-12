/**
 * I18nBundle.js
 *
 * @description :: Stores an entire i18next namespace for a given locale and branding.
 *                 Mirrors the structure of language-defaults/<lng>/<namespace>.json
 */

module.exports = {
  attributes: {
    // i18next locale, e.g. 'en', 'mri'
    locale: {
      type: 'string',
      required: true
    },

    // i18next namespace; default is 'translation'
    namespace: {
      type: 'string',
      defaultsTo: 'translation'
    },

    // Optional branding association to scope bundles per brand; when absent, global applies
    branding: {
      model: 'brandingconfig',
      required: false
    },

    // The full JSON payload of the namespace for this locale
    data: {
      type: 'json',
      required: true
    },

    // Translations contained in this bundle (optional, enables relational queries)
    entries: {
      collection: 'i18ntranslation',
      via: 'bundle'
    },

    // Composite unique identifier: `${branding||'global'}:${locale}:${namespace}`
    uid: {
      type: 'string',
      unique: true,
      allowNull: false
    }
  },

  beforeCreate: function (bundle, cb) {
    try {
      const brandingPart = bundle.branding ? String(bundle.branding) : 'global';
      bundle.uid = `${brandingPart}:${bundle.locale}:${bundle.namespace || 'translation'}`;
      return cb();
    } catch (e) {
      return cb(e);
    }
  },

  beforeUpdate: function (valuesToUpdate, cb) {
    try {
      const brandingPart = valuesToUpdate.branding ? String(valuesToUpdate.branding) : 'global';
      const locale = valuesToUpdate.locale;
      const ns = valuesToUpdate.namespace || 'translation';
      if (brandingPart && locale && ns) {
        valuesToUpdate.uid = `${brandingPart}:${locale}:${ns}`;
      }
      return cb();
    } catch (e) {
      return cb(e);
    }
  }
};
