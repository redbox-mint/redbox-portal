#!/usr/bin/env node
// Deployment boundary: typed operational config and offline extension declarations.
const path = require('node:path');
const usage =
  'Usage: npm run persistence:indexes -- [--inspect|--ensure] [--app <directory>] [--config <module>] [--environment <name>] [--environment-config <module>] [--local-config <module>]';
async function main() {
  const args = process.argv.slice(2);
  let mode = 'inspect';
  let appPath = process.cwd();
  let environment = process.env.NODE_ENV || 'development';
  const selected = new Set();
  const files = {};
  for (let index = 0; index < args.length; index++) {
    const argument = args[index];
    if (argument === '--help') {
      console.log(usage);
      return;
    }
    const key = argument === '--inspect' || argument === '--ensure' ? 'mode' : argument;
    if (selected.has(key)) throw Error('usage');
    selected.add(key);
    if (key === 'mode') {
      mode = argument.slice(2);
      continue;
    }
    if (
      !['--app', '--config', '--environment', '--environment-config', '--local-config'].includes(argument) ||
      !args[index + 1] ||
      args[index + 1].startsWith('--')
    )
      throw Error('usage');
    const value = args[++index];
    if (argument === '--app') appPath = path.resolve(value);
    else if (argument === '--environment') environment = value;
    else
      files[argument === '--config' ? 'application' : argument === '--environment-config' ? 'environment' : 'local'] =
        value;
  }
  for (const key of Object.keys(files)) files[key] = path.resolve(appPath, files[key]);
  const { runIndexMaintenance } = require('../dist/maintenance/indexes');
  const report = await runIndexMaintenance({ appPath, mode, environment, files });
  console.log(JSON.stringify(report));
  if (!report.ready) {
    console.error(
      'Indexes are not ready. Review duplicates, definitions and collation; stop writers before explicit --ensure. No data repair or index removal performed; owned connections closed.'
    );
    process.exitCode = 2;
  }
}
main().catch(error => {
  if (error.message === 'usage') {
    console.error(usage);
    process.exitCode = 2;
  } else {
    console.error(
      'Persistence index preparation failed. Check typed operational configuration, selected v6 extensions, MongoDB connectivity and permissions. Legacy Sails files are not loaded; see support/specs/sails-retirement/maintenance-v6.md.'
    );
    process.exitCode = 1;
  }
});
