import type { SailsConfig } from "redbox-core-types";

const searchConfig: SailsConfig["search"] = {
  serviceName: 'solrsearchservice'
};

module.exports.search = searchConfig;
