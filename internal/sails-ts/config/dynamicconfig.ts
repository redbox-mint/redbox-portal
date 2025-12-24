import type { SailsConfig } from "redbox-core-types";

const dynamicconfigConfig: SailsConfig["dynamicconfig"] = {
  active: ['auth']
};

module.exports.dynamicconfig = dynamicconfigConfig;
