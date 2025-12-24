import type { SailsConfig } from "redbox-core-types";

const queueConfig: SailsConfig["queue"] = {
  serviceName: 'agendaqueueservice'
}

module.exports.queue = queueConfig;
