'use strict';
module.exports = {
  ...require('./.mocharc.js'),
  spec: [...require('./test/legacy-express-files.cjs'), 'test/**/*.legacy.ts'],
  ignore: [],
};
