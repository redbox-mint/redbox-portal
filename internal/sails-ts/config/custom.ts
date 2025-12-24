import type { SailsConfig } from "redbox-core-types";

const customConfig: SailsConfig["custom"] = {
  cacheControl: {
    noCache: [
      'csrfToken',
      'dynamic/apiClientConfig',
      'login',
      'begin_oidc',
      'login_oidc',
      'logout'
    ]
  },
};

module.exports.custom = customConfig;
