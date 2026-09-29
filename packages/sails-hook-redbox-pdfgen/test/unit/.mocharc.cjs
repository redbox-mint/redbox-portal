module.exports = {
  require: ['ts-node/register'],
  extension: ['ts'],
  recursive: true,
  timeout: '30s',
  ui: 'bdd',
  reporter: 'spec',
  exit: true
};
