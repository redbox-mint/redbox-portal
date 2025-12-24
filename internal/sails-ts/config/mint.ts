import type { SailsConfig } from "redbox-core-types";

const mintConfig: SailsConfig["mint"] = {
  mintRootUri: 'mint',
  api: {
    search: {
      method: 'get',
      url: '/api/v1/search'
    }
  }
};

module.exports.mint = mintConfig;
