const config = require("../../config/webpack");
const validators = require("../../config/validators");
const apiHook = require("../../api/hooks/webpack/index");
sails = {
  config: {
    webpack: {
      config: config.webpack.config
    } ,
    validators: validators.validators,
  },
  log: {
    info: function(msg, data = null) {
      console.info(msg, data)
    },
    warn: function(msg, data = null) {
      console.warn(msg, data)
    },
    error: function(msg, data = null) {
      console.error(msg, data)
    }
  }
};
async function main() {
  await apiHook(sails).initialize(()=> { console.log("Webpack wrapper done!") });
}

main();