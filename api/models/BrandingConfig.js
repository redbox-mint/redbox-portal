module.exports = {
  primaryKey: 'id',
  tableName: 'brandingconfig',
  attributes: {
    css: {
      type: 'string'
    },
    hash: {
      type: 'string',
      defaultsTo: ''
    },
    logo: {
      type: 'json'
    },
    name: {
      type: 'string'
    },
    roles: {
      collection: 'role',
      via: 'branding'
    },
    supportAgreementInformation: {
      type: 'json',
      defaultsTo: {}
    },
    variables: {
      type: 'json',
      custom:       (value) => {
                  if (value == null) {
                      return true;
                  }
                  if (typeof value !== 'object' || Array.isArray(value)) {
                      return false;
                  }
                  const allowList = (typeof sails !== 'undefined' &&
                      sails.config &&
                      sails.config.branding &&
                      sails.config.branding.variableAllowList) ||
                      [];
                  return Object.keys(value).every(key => {
                      const normalizedKey = key.startsWith('$') ? key.slice(1) : key;
                      return allowList.includes(normalizedKey);
                  });
              }
    },
    version: {
      type: 'number',
      defaultsTo: 0
    },
  },
  beforeCreate: (values, proceed) => {
      if (values.variables && typeof values.variables === 'object' && !Array.isArray(values.variables)) {
          const normalized = {};
          Object.keys(values.variables).forEach(key => {
              const normalizedKey = key.startsWith('$') ? key.slice(1) : key;
              normalized[normalizedKey] = values.variables[key];
          });
          values.variables = normalized;
      }
      if (!values.variables) {
          return proceed();
      }
      if (typeof values.variables !== 'object' || Array.isArray(values.variables)) {
          return proceed(new Error('Invalid variable key supplied (not in allowlist)'));
      }
      const allowList = (typeof sails !== 'undefined' &&
          sails.config &&
          sails.config.branding &&
          sails.config.branding.variableAllowList) ||
          [];
      const isValid = Object.keys(values.variables).every(key => {
          const normalizedKey = key.startsWith('$') ? key.slice(1) : key;
          return allowList.includes(normalizedKey);
      });
      if (!isValid) {
          return proceed(new Error('Invalid variable key supplied (not in allowlist)'));
      }
      return proceed();
  },
  beforeUpdate: (values, proceed) => {
      if (values.variables && typeof values.variables === 'object' && !Array.isArray(values.variables)) {
          const normalized = {};
          Object.keys(values.variables).forEach(key => {
              const normalizedKey = key.startsWith('$') ? key.slice(1) : key;
              normalized[normalizedKey] = values.variables[key];
          });
          values.variables = normalized;
      }
      if (!values.variables) {
          return proceed();
      }
      if (typeof values.variables !== 'object' || Array.isArray(values.variables)) {
          return proceed(new Error('Invalid variable key supplied (not in allowlist)'));
      }
      const allowList = (typeof sails !== 'undefined' &&
          sails.config &&
          sails.config.branding &&
          sails.config.branding.variableAllowList) ||
          [];
      const isValid = Object.keys(values.variables).every(key => {
          const normalizedKey = key.startsWith('$') ? key.slice(1) : key;
          return allowList.includes(normalizedKey);
      });
      if (!isValid) {
          return proceed(new Error('Invalid variable key supplied (not in allowlist)'));
      }
      return proceed();
  },
};
