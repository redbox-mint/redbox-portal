import type { SailsConfig } from "redbox-core-types";

// [your-sails-app]/config/autoreload.js
const autoreloadConfig: SailsConfig["autoreload"] = {
  active: false,
  usePolling: false,
  dirs: [
    "api/models",
    "api/controllers",
    "api/services",
    "config/locales"
  ],
  ignored: [
    // Ignore all files with .ts extension
    "**.ts"
  ]
};

module.exports.autoreload = autoreloadConfig;
