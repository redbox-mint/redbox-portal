#!/usr/bin/env node
'use strict';
const { parseArgs } = require('node:util');
const { loadApplication } = require('../publication/admin');
const usage =
  'node support/figshare/admin.js <inspect|reconcile|abandon-create|link|relink|resume|reset-publish|migrate|bind-file|resume-upload> --username ADMIN [--brand ID --destination ID] [--oid OID] [--article-id ID --owner-id ID] [--receipt KEY --file-id ID] [--parameters JSON] [--apply --reason TEXT]';
async function main(argv = process.argv.slice(2), load = loadApplication, output = console.log) {
  const { values, positionals } = parseArgs({
    args: argv,
    allowPositionals: true,
    options: {
      oid: { type: 'string' },
      username: { type: 'string' },
      brand: { type: 'string' },
      destination: { type: 'string' },
      reason: { type: 'string' },
      parameters: { type: 'string' },
      'article-id': { type: 'string' },
      'owner-id': { type: 'string' },
      receipt: { type: 'string' },
      'file-id': { type: 'string' },
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
      'reconcile',
      'abandon-create',
      'link',
      'relink',
      'resume',
      'reset-publish',
      'migrate',
      'bind-file',
      'resume-upload',
    ].includes(action) ||
    !values.username
  )
    throw new Error(usage);
  if (values.apply && !values.reason?.trim()) throw new Error('--apply requires --reason');
  if (values.apply && ['inspect', 'reconcile'].includes(action)) throw new Error('Inspect and reconcile are read-only');
  const parameters = values.parameters ? JSON.parse(values.parameters) : {};
  if (!parameters || typeof parameters !== 'object' || Array.isArray(parameters))
    throw new Error('--parameters must be a JSON object');
  const application = await load();
  try {
    let result;
    if (values.brand) {
      if (action === 'migrate')
        throw new Error('Shared one-way migration is delivered by PUB-16; legacy migration cannot change shared state');
      if (!values.oid || !values.destination)
        throw new Error('Shared Figshare commands require --oid and --destination');
      const sharedAction = ['inspect', 'reconcile', 'resume'].includes(action) ? action : 'repair';
      result = await application.service.administer({
        action: sharedAction,
        brandId: values.brand,
        username: values.username,
        oid: values.oid,
        destinationId: values.destination,
        repair: sharedAction === 'repair' ? action : undefined,
        apply: values.apply,
        reason: values.reason,
        parameters: {
          ...parameters,
          ...(values['article-id'] ? { articleId: values['article-id'] } : {}),
          ...(values['owner-id'] ? { ownerId: values['owner-id'] } : {}),
          ...(values.receipt ? { receipt: values.receipt } : {}),
          ...(values['file-id'] ? { fileId: values['file-id'] } : {}),
        },
      });
    } else {
      const { figshareAdmin } = require('@researchdatabox/redbox-core/dist/services/figshare-v2/admin');
      result = await figshareAdmin({
        action,
        oid: values.oid,
        username: values.username,
        articleId: values['article-id'],
        ownerId: values['owner-id'],
        apply: values.apply,
        receipt: values.receipt,
        fileId: values['file-id'],
        reason: values.reason,
        parameters,
      });
    }
    output(JSON.stringify(result, null, 2));
    return result;
  } finally {
    await application.close();
  }
}
module.exports = { main };
if (require.main === module)
  main().catch(error => {
    console.error(error.message);
    process.exitCode = 1;
  });
