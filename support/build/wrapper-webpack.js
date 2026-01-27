const redboxCore = require("@researchdatabox/redbox-core-types");

const ensureTsNode = () => {
  try {
    require('ts-node/register/transpile-only');
    return true;
  } catch (e) {
    return false;
  }
};

let defineWebpackHook = redboxCore.defineWebpackHook || (redboxCore.default && redboxCore.default.defineWebpackHook);
if (!defineWebpackHook) {
  try {
    defineWebpackHook = require("@researchdatabox/redbox-core-types/dist/hooks/webpack").defineWebpackHook;
  } catch (e) {}
}
if (!defineWebpackHook && ensureTsNode()) {
  try {
    defineWebpackHook = require("@researchdatabox/redbox-core-types/src/hooks/webpack.ts").defineWebpackHook;
  } catch (e) {}
}

// Resolve webpack config: prefer exported `Config.webpack.config`, fall back to repo `config/webpack.js`.
let webpackConfig = [];
try {
  // prefer repo config file
  const repoWebpack = require('../../config/webpack');
  webpackConfig = repoWebpack && repoWebpack.config ? repoWebpack.config : repoWebpack;
} catch (e) {
  // ignore
}
if (!webpackConfig || (Array.isArray(webpackConfig) && webpackConfig.length === 0)) {
  try {
    const Config = redboxCore.Config || (redboxCore.default && redboxCore.default.Config);
    if (Config && Config.webpack && Config.webpack.config) {
      webpackConfig = Config.webpack.config;
    }
  } catch (e) {
    // ignore
  }
}
if (!webpackConfig || (Array.isArray(webpackConfig) && webpackConfig.length === 0)) {
  try {
    const distWebpack = require('@researchdatabox/redbox-core-types/dist/config/webpack.config');
    webpackConfig = distWebpack && distWebpack.webpack ? distWebpack.webpack.config : distWebpack.config || distWebpack;
  } catch (e) {}
}
if (!webpackConfig || (Array.isArray(webpackConfig) && webpackConfig.length === 0)) {
  if (ensureTsNode()) {
    try {
      const srcWebpack = require('@researchdatabox/redbox-core-types/src/config/webpack.config.ts');
      webpackConfig = srcWebpack && srcWebpack.webpack ? srcWebpack.webpack.config : srcWebpack.config || srcWebpack;
    } catch (e) {}
  }
}

sails = {
  config: {
    webpack: {
      config: webpackConfig
    }
  },
  log: {
    info: function (msg, data = null) {
      console.info(msg, data)
    },
    warn: function (msg, data = null) {
      console.warn(msg, data)
    },
    error: function (msg, data = null) {
      console.error(msg, data)
    }
  }
};
async function main() {
  if (!defineWebpackHook) {
    console.warn('defineWebpackHook not available from @researchdatabox/redbox-core-types; running webpack directly');
    // Fallback: run webpack directly using resolved config
    const webpack = require('webpack');

    if (!sails.config.webpack) {
      sails.log.warn('sails-hook-webpack: No Webpack options have been defined.');
      return;
    }

    if (!sails.config.webpack.config || (Array.isArray(sails.config.webpack.config) && sails.config.webpack.config.length === 0)) {
      sails.log.warn('sails-hook-webpack: Configure your config/webpack.js file.');
      return;
    }

    if (process.env.NODE_ENV !== 'docker' || process.env.WEBPACK_SKIP === 'true') {
      sails.log.warn(`sails-hook-webpack: Configured to skip webpack.`);
      return;
    }

    if (process.env.WEBPACK_CSS_MINI === 'true') {
      try {
        sails.config.webpack.config[0].optimization.minimize = true;
        sails.log.info(`Webpack wrapper is configured for CSS minimization.`);
      } catch (e) {}
    }

    const compiler = webpack(sails.config.webpack.config);

    const logCompileInfo = (err, stats) => {
      if (err) {
        sails.log.error('sails-hook-webpack: Build error: \n\n', err);
      }
      try {
        sails.log[stats.hasErrors() ? 'error' : 'info'](
          `sails-hook-webpack:\n${stats.toString({ colors: true, chunks: true })}`
        );
      } catch (e) {}
    };

    let called = false;
    const compileCallback = (err, stats) => {
      logCompileInfo(err, stats);
      if (called) return;
      called = true;
      if (err || (stats && stats.hasErrors && stats.hasErrors())) {
        console.error(err || stats.toString());
        throw new Error('sails-hook-webpack failed');
      }
      console.log('Webpack wrapper done!');
    };

    compiler.run(compileCallback);
    return;
  }
  await defineWebpackHook(sails).initialize(() => { console.log("Webpack wrapper done!") });
}

main();
