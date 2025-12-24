import type { SailsConfig } from "redbox-core-types";

const actionConfig: SailsConfig["action"] = {
  // Here you can configure your own custom actions, for hooks, etc.
  // Follow the sample convention below:
  // publishToCKAN: {service: "sails.services.ckanservice", method: "publishToCKAN" }
}

module.exports.action = actionConfig;
