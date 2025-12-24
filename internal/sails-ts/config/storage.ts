import type { SailsConfig } from "redbox-core-types";

const storageConfig: SailsConfig["storage"] = {
  serviceName: "mongostorageservice"
};

module.exports.storage = storageConfig;
