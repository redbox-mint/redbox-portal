import type { SailsConfig } from "redbox-core-types";

const ormConfig: SailsConfig["orm"] = {
  _hookTimeout: 120000 // I used 60 seconds as my new timeout
};

module.exports.orm = ormConfig;
