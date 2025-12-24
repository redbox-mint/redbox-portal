import type { SailsConfig } from "redbox-core-types";

const appmodeConfig: SailsConfig["appmode"] = {
  bootstrapAlways: true,
  hidePlaceholderPages: true
};

module.exports.appmode = appmodeConfig;
