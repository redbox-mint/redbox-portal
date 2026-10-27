module.exports = {
  require: ['ts-node/register'],
  'node-option': ['no-experimental-strip-types'],
  extension: ['ts'],
  recursive: true,
  timeout: '30s',
  ui: 'bdd',
  reporter: 'spec',
  exit: true
};
