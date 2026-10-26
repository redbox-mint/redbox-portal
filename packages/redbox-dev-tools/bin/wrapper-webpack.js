#!/usr/bin/env node
'use strict';

async function runWebpack(webpack, options, env = process.env, log = console) {
  if (env.WEBPACK_SKIP === 'true') return;
  if (!options || !Array.isArray(options.config) || options.config.length === 0)
    throw new Error('Webpack requires an explicit nonempty config array');
  const configs = options.config.map(config => ({
    ...config,
    ...(env.WEBPACK_CSS_MINI === 'true' ? { optimization: { ...config.optimization, minimize: true } } : {}),
  }));
  const compiler = webpack(configs);
  try {
    await new Promise((resolve, reject) => compiler.run((error, stats) => {
      if (error) return reject(error);
      log.log(stats.toString({ colors: Boolean(process.stdout.isTTY), chunks: false }));
      if (stats.hasErrors()) reject(new Error('Webpack compilation failed'));
      else resolve();
    }));
  } finally {
    await new Promise((resolve, reject) => compiler.close(error => error ? reject(error) : resolve()));
  }
}
module.exports = { runWebpack };
if (require.main === module) {
  runWebpack(require('webpack'), require('@researchdatabox/redbox-core').Config.webpack)
    .catch(error => { console.error(error); process.exitCode = 1; });
}
