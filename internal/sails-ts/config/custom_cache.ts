import type { SailsConfig } from "redbox-core-types";

const custom_cacheConfig: SailsConfig["custom_cache"] = {
  cacheExpiry: 31536000 // one year in seconds
};

module.exports.custom_cache = custom_cacheConfig;
