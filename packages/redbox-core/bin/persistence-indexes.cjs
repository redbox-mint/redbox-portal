#!/usr/bin/env node
// Deployment command only: never imported by core startup or the public barrel.
const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');

async function main() {
  const args = process.argv.slice(2);
  let mode = 'inspect';
  let appPath = process.cwd();
  let selectedMode = false;
  for (let index = 0; index < args.length; index++) {
    const argument = args[index];
    if (argument === '--help') {
      console.log('Usage: npm run persistence:indexes -- [--inspect|--ensure] [--app <application directory>]');
      return;
    }
    if (argument === '--app' && args[index + 1]) {
      appPath = path.resolve(args[++index]);
      continue;
    }
    if ((argument === '--inspect' || argument === '--ensure') && !selectedMode) {
      mode = argument.slice(2);
      selectedMode = true;
      continue;
    }
    throw Error('usage');
  }
  process.chdir(appPath);
  const { Sails } = require('sails');
  const app = new Sails();
  // Sails loads controller files even with the HTTP/blueprint hooks disabled.
  // Maintenance loads application connection configuration without business action modules.
  const { generateAllShims } = require('../dist');
  const { prepareSelectedPersistenceIndexes } = require('../dist/persistence/maintenance');
  const { cleanupPersistence } = require('../dist/persistence/runtime');
  const controllers = fs.mkdtempSync(path.join(os.tmpdir(), 'redbox-index-actions-'));
  try {
    // Apply the same obsolete-registration checks as app.js.
    // This may create missing shim files, but never starts services or migrations.
    await generateAllShims(appPath, { forceRegenerate: false });
    const config = require('rc')('sails');
    await new Promise((resolve, reject) =>
      app.load(
        {
          ...config,
          appPath,
          loadHooks: ['moduleloader', 'userconfig'],
          hooks: { orm: false },
          beforeShutdown: callback => callback(),
          globals: false,
          paths: { ...config.paths, controllers },
          log: { level: 'silent' },
        },
        error => (error ? reject(error) : resolve())
      )
    );
    const report = await prepareSelectedPersistenceIndexes(app, mode);
    console.log(JSON.stringify(report));
    if (!report.ready) {
      console.error(
        'Selected persistence indexes are not ready. Review duplicates, index definitions and collation; stop writers before explicitly using --ensure. No cleanup was performed.'
      );
      process.exitCode = 2;
    }
  } finally {
    try {
      await cleanupPersistence(app);
    } finally {
      try {
        await new Promise((resolve, reject) => app.lower(error => (error ? reject(error) : resolve())));
      } finally {
        fs.rmSync(controllers, { recursive: true, force: true });
      }
    }
  }
}
main().catch(error => {
  if (error.message === 'usage') {
    console.error('Usage: npm run persistence:indexes -- [--inspect|--ensure] [--app <application directory>]');
    process.exitCode = 2;
  } else {
    // Even module/config/ORM errors may contain connection settings or payloads.
    console.error(
      'Persistence index preparation failed. Check application config, Prisma mappings, MongoDB connectivity and permissions. No cleanup was performed. See support/wiki/Persistence-Index-Preparation.md.'
    );
    process.exitCode = 1;
  }
});
