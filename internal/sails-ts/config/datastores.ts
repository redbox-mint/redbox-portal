import type { SailsConfig } from "redbox-core-types";

/**
 * THIS FILE WAS ADDED AUTOMATICALLY by the Sails 1.0 app migration tool.
 */

const datastoresConfig: SailsConfig["datastores"] = {

  // In previous versions, datastores (then called 'connections') would only be loaded
  // if a model was actually using them.  Starting with Sails 1.0, _all_ configured
  // datastores will be loaded, regardless of use.  So we'll only include datastores in
  // this file that were actually being used.  Your original `connections` config is
  // still available as `config/connections-old.js.txt`.

  mongodb: {
    adapter: require('sails-mongo'),
    url: 'mongodb://localhost:27017/redbox-portal'
  },
  redboxStorage: {
    adapter: require('sails-mongo'),
    url: 'mongodb://mongodb:27017/redbox-storage'
  }
};

module.exports.datastores = datastoresConfig;
