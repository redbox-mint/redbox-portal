/**
 * BrandingConfig.js
 *
 * @description :: Configuration for each Brand
 * @docs        :: http://sailsjs.org/documentation/concepts/models-and-orm/models
 */

// Guard access to global `sails` during model load (it is undefined pre-lift)
const allowList = (typeof sails !== 'undefined' && sails.config && sails.config.branding && sails.config.branding.variableAllowList) || [];

function validateVariablesMap(val) {
  if (val == null) return true;
  if (typeof val !== 'object' || Array.isArray(val)) return false;
  return Object.keys(val).every(k => {
    const norm = k.startsWith('$') ? k.slice(1) : k;
    return allowList.includes(norm);
  });
}

module.exports = {
  /**
   * Attributes for per-branding theme configuration.
   * Added fields for new branding feature (Tasks 1+):
   *  - variables: JSON map of semantic SCSS variable names -> values (Req 1,3)
   *  - version: incremental publish version (Req 7 foundation)
   *  - hash: content hash of active CSS for cache busting (Req 7)
   *  - logo: metadata for uploaded logo (Req 2)
   */
  attributes: {
    name: { type: 'string' },
    css: { type: 'string' },
    variables: { type: 'json', custom: validateVariablesMap },
    version: { type: 'number', defaultsTo: 0 },
    hash: { type: 'string', defaultsTo: '' },
    // Logo metadata (nullable by omission; Waterline JSON attrs cannot use allowNull)
    logo: { type: 'json' },
    // Brand has many roles
    roles: { collection: 'role', via: 'branding' },
    // Support agreement properties - year-on-year information stored as JSON
    supportAgreementInformation: {
      type: 'json',
      defaultsTo: {}
    },
  },
  beforeCreate(values, proceed) {
    if (values.variables && _.isPlainObject(values.variables)) {
      const normalized = {};
      Object.keys(values.variables).forEach(k => {
        const norm = k.startsWith('$') ? k.slice(1) : k;
        normalized[norm] = values.variables[k];
      });
      values.variables = normalized;
    }
    return module.exports.beforeValidate(values, proceed);
  },
  beforeUpdate(values, proceed) {
    if (values.variables && _.isPlainObject(values.variables)) {
      const normalized = {};
      Object.keys(values.variables).forEach(k => {
        const norm = k.startsWith('$') ? k.slice(1) : k;
        normalized[norm] = values.variables[k];
      });
      values.variables = normalized;
    }
    return module.exports.beforeValidate(values, proceed);
  },
  beforeValidate(values, proceed) {
    if (values.variables && !validateVariablesMap(values.variables)) {
      return proceed(new Error('Invalid variable key supplied (not in allowlist)'));
    }
    return proceed();
  }
};

