#!/usr/bin/env node
'use strict';
const webpack = require('webpack');
const { Config } = require('@researchdatabox/redbox-core');
const options = Config.webpack;
async function main() {
  if (process.env.WEBPACK_SKIP === 'true') return;
  if (process.env.WEBPACK_CSS_MINI === 'true') {
    for (const config of options.config) config.optimization = { ...config.optimization, minimize: true };
  }
  const compiler = webpack(options.config);
  try {
    await new Promise((resolve, reject) => compiler.run((error, stats) => {
      if (error) return reject(error);
      console.log(stats.toString({ colors: Boolean(process.stdout.isTTY), chunks: false }));
      if (stats.hasErrors()) reject(new Error('Webpack compilation failed'));
      else resolve();
    }));
  } finally {
    await new Promise((resolve, reject) => compiler.close(error => error ? reject(error) : resolve()));
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
