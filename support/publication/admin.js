#!/usr/bin/env node
'use strict';
const path = require('node:path');
const { createRequire } = require('node:module');
const { parseArgs } = require('node:util');
const root = path.resolve(__dirname, '../..');
const usage =
  'node support/publication/admin.js <inspect|readiness|reconcile|pause|resume|revoke|repair|migrate|convert-vocabularies> --brand ID --username ADMIN [--oid OID --destination ID] [--approval ID] [--repair ID --parameters JSON] [--apply --reason TEXT]';

async function loadApplication() {
  // Set before loading the normal application: neither legacy nor shared job consumers may start.
  process.env.REDBOX_PUBLICATION_ADMIN = 'true';
  process.env.REDBOX_FIGSHARE_ADMIN = 'true';
  process.chdir(root);
  const { Sails } = require('sails');
  const { generateAllShims } = require('@researchdatabox/redbox-core');
  const app = new Sails();
  try {
    await generateAllShims(root);
    const config = createRequire(require.resolve('sails'))('rc')('sails');
    await new Promise((resolve, reject) =>
      app.load(
        {
          ...config,
          appPath: root,
          hooks: { ...config.hooks, http: false, views: false, sockets: false, grunt: false },
        },
        error => (error ? reject(error) : resolve())
      )
    );
    // load() does not run portal bootstrap or ready hooks. Prepare only the
    // dependencies needed by administration, without starting consumers/seeding.
    await require('rxjs').firstValueFrom(global.BrandingService.loadAvailableBrands(undefined));
    global.PublicationService.bootstrap();
    await global.AppConfigService.bootstrap();
    await global.RecordsService.preparePublicationAdministration();
    await global.StorageManagerService.bootstrap();
    return {
      service: global.PublicationService,
      vocabularyService: global.PublicationVocabularyService,
      close: () => new Promise(resolve => app.lower(resolve)),
    };
  } catch (error) {
    await new Promise(resolve => app.lower(resolve));
    throw error;
  }
}
async function main(argv = process.argv.slice(2), load = loadApplication, output = console.log) {
  const { values, positionals } = parseArgs({
    args: argv,
    allowPositionals: true,
    options: {
      brand: { type: 'string' },
      username: { type: 'string' },
      oid: { type: 'string' },
      destination: { type: 'string' },
      approval: { type: 'string' },
      repair: { type: 'string' },
      parameters: { type: 'string' },
      reason: { type: 'string' },
      apply: { type: 'boolean', default: false },
      help: { type: 'boolean' },
    },
  });
  if (values.help) {
    output(usage);
    return;
  }
  const action = positionals[0];
  if (
    positionals.length !== 1 ||
    ![
      'inspect',
      'readiness',
      'reconcile',
      'pause',
      'resume',
      'revoke',
      'repair',
      'migrate',
      'convert-vocabularies',
    ].includes(action) ||
    !values.brand ||
    !values.username
  )
    throw new Error(usage);
  if (values.apply && ['inspect', 'readiness', 'reconcile'].includes(action))
    throw new Error('Inspect, readiness and reconcile are read-only');
  if (values.apply && !values.reason?.trim()) throw new Error('--apply requires --reason');
  const parameters = values.parameters ? JSON.parse(values.parameters) : {};
  if (!parameters || typeof parameters !== 'object' || Array.isArray(parameters))
    throw new Error('--parameters must be a JSON object');
  const application = await load();
  try {
    const method = ['readiness', 'migrate'].includes(action)
      ? action
      : action === 'convert-vocabularies'
        ? 'convert'
        : 'administer';
    const service = action === 'convert-vocabularies' ? application.vocabularyService : application.service;
    if (typeof service?.[method] !== 'function')
      throw new Error('PublicationService administration is unavailable; compile the matching core package');
    const result = await service[method]({
      action,
      brandId: values.brand,
      username: values.username,
      oid: values.oid,
      destinationId: values.destination,
      approvalId: values.approval,
      repair: values.repair,
      parameters,
      apply: values.apply,
      reason: values.reason,
    });
    if (action === 'readiness')
      result.packages = {
        core: require('@researchdatabox/redbox-core/package.json').version,
        storageMongo: require('@researchdatabox/sails-hook-redbox-storage-mongo/package.json').version,
      };
    output(JSON.stringify(result, null, 2));
    return result;
  } finally {
    await application.close();
  }
}
module.exports = { main, loadApplication };
if (require.main === module)
  main()
    .then(result => {
      if (process.argv[2] === 'readiness' && result?.ready === false) process.exitCode = 2;
    })
    .catch(error => {
      console.error(error.message);
      process.exitCode = 1;
    });
