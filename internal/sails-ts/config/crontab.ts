import type { SailsConfig } from "redbox-core-types";

const crontabConfig: SailsConfig["crontab"] = {
  enabled: false, //enable this to register async checker at bootstrap
  crons: function() {
    return [
      { interval: '1 * * * * * ', service: 'workspaceasyncservice', method: 'loop' }
    ];
  }
}

module.exports.crontab = crontabConfig;
