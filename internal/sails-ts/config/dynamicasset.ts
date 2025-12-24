import type { SailsConfig } from "redbox-core-types";

const dynamicassetConfig: SailsConfig["dynamicasset"] = {
  // Dynamic asset configuration
  // Maps a asset URL to a view, sets the mimetype accordingly
  "apiClientConfig": {
    view: "apiClientConfig",
    type: "application/json"
  },
  "dynamicScriptAsset": {
    view: "dynamicScriptAsset",
    type: "text/javascript",
  },
};

module.exports.dynamicasset = dynamicassetConfig;
