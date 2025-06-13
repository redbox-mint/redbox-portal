const webpack = require('webpack');
const { once } = require('lodash');
const ExtractFunctionsPlugin = require("../../../support/build/extract-functions-webpack-plugin");

/**
 * webpack hook
 *
 * If production, build once, then trigger `done`.
 * If dev, build once, trigger `done`, then watch for changes to trigger rebuild.
 *
 * @description :: A hook definition.  Extends Sails by adding shadow routes, implicit actions, and/or initialization logic.
 * @docs        :: https://sailsjs.com/docs/concepts/extending-sails/hooks
 */

module.exports = function defineWebpackHook(sails) {

  if (!sails.config.webpack) {
    sails.log.warn('sails-hook-webpack: No Webpack options have been defined.');
    return {};
  }

  if (!sails.config.webpack.config) {
    sails.log.warn('sails-hook-webpack: Configure your config/webpack.js file.');
    return {};
  }

  if (process.env.NODE_ENV != 'docker' || process.env.WEBPACK_SKIP === 'true') {
    sails.log.warn(`sails-hook-webpack: Configured to skip webpack.`);
    return {};
  }

  return {

    /**
     * Runs when this Sails app loads/lifts.
     */
    initialize: async function(done) {

      sails.log.info('Initializing custom hook (`webpack`)');
      const isSailsScriptEnv = () => global.isSailsScriptEnv;
      if (isSailsScriptEnv()) void done();

      // enable minimization of CSS when explicitly told so
      if (process.env.WEBPACK_CSS_MINI === 'true') {
        sails.config.webpack.config[0].optimization.minimize = true;
        sails.log.info(`Webpack hook is configured for CSS minimization.`);
      }

      // Provide the sails config to the webpack plugin,
      // so the plugin can extract the functions and add them to the compiled bundle.
      const extractFunctionsPluginInstance = sails.config.webpack.config[0].plugins.find(i => i instanceof ExtractFunctionsPlugin);
      if (extractFunctionsPluginInstance) {
        extractFunctionsPluginInstance.validatorDefinitions = sails.config.validators;
        // TODO: how to specify the expressions to process?
        // extractFunctionsPluginInstance.expressionDefinitions = sails.config.form.forms["default-1.0-draft"];
      }

      // Create the webpack instance.
      const compiler = webpack(sails.config.webpack.config);

      // on first compilation (due to either run or watch) if it fails,
      // it should throw, else it should call `done`
      const triggerDoneOnce = once((err, stats) => {
        if (err || stats.hasErrors()) {
          sails.log.error(err);
          sails.log.error(stats);
          throw new Error(`sails-hook-webpack failed`);
        } else {
          done();
        }
      });

      const compileCallback = (...args) => {
        logCompileInfo(...args);
        triggerDoneOnce(...args);
      };
      
      compiler.run(compileCallback);
    }

  };

};

function logCompileInfo(err, stats) {
  if (err) {
    sails.log.error('sails-hook-webpack: Build error: \n\n', err);
  }
  sails.log[stats.hasErrors() ? 'error' : 'info'](`sails-hook-webpack:\n${stats.toString({ colors: true, chunks: true })}`);
}