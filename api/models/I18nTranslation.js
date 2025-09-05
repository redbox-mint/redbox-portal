/**
 * I18nTranslation.js
 *
 * @description :: Stores i18next translation entries so text can be configured via UI/API.
 *                 Each record represents a single key for a given locale/namespace/branding.
 *                 Uniqueness is enforced via a computed `uid`.
 */

module.exports = {
  attributes: {
    // i18next key, e.g. "dashboard-heading" or "@dmpt-project-title"
    key: {
      type: 'string',
      required: true
    },

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

    // The value for the key; allow string or structured values (plurals, nested)
    value: {
      type: 'json',
      required: true
    },

    // Optional category to help organise keys in the editor (e.g. "dashboard", "forms")
    category: {
      type: 'string',
      required: false,
      allowNull: true
    },

    // Optional human-readable description of where/how this key is used
    description: {
      type: 'string',
      required: false,
      allowNull: true
    },

    // Optional branding association to scope translations per brand; when absent, global applies
    branding: {
      model: 'brandingconfig',
      required: false
    },

    // Optional link to the bundle this entry was derived from
    bundle: {
      model: 'i18nbundle',
      required: false
    },

    // Composite unique identifier: `${branding||'global'}:${locale}:${namespace}:${key}`
    uid: {
      type: 'string',
      unique: true,
      allowNull: false
    }
  },

  // Helpful secondary indexes for common lookup patterns (supported by sails-mongo)
  // Note: indexes are advisory; adapter may ignore in some envs.
  // (kept lightweight; actual index creation handled by the adapter)

  beforeCreate: function (translation, cb) {
    try {
      const brandingPart = translation.branding ? String(translation.branding) : 'global';
      translation.uid = `${brandingPart}:${translation.locale}:${translation.namespace || 'translation'}:${translation.key}`;
      return cb();
    } catch (e) {
      return cb(e);
    }
  },

  beforeUpdate: function (valuesToUpdate, cb) {
    try {
      // When any of the components change, recompute uid
      const brandingPart = valuesToUpdate.branding ? String(valuesToUpdate.branding) : 'global';
      const locale = valuesToUpdate.locale;
      const ns = valuesToUpdate.namespace || 'translation';
      const key = valuesToUpdate.key;
      if (brandingPart && locale && ns && key) {
        valuesToUpdate.uid = `${brandingPart}:${locale}:${ns}:${key}`;
      }
      return cb();
    } catch (e) {
      return cb(e);
    }
  }
};
