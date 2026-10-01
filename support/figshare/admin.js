#!/usr/bin/env node
'use strict';
// Use the normal ReDBox loader, configuration and services, with job consumers disabled.
process.env.REDBOX_FIGSHARE_ADMIN = 'true';
const path = require('node:path');
const { parseArgs } = require('node:util');
const root = path.resolve(__dirname, '../..');
process.chdir(root);
const { values, positionals } = parseArgs({ allowPositionals: true, options: {
  oid: { type: 'string' }, username: { type: 'string' }, 'article-id': { type: 'string' }, receipt: { type: 'string' }, 'file-id': { type: 'string' }, apply: { type: 'boolean', default: false }, help: { type: 'boolean' }
} });
const action = positionals[0];
if (values.help || !['inspect', 'reconcile', 'link', 'relink', 'resume', 'migrate', 'bind-file', 'resume-upload'].includes(action) || !values.username) {
  console.log('node support/figshare/admin.js <inspect|reconcile|link|relink|resume|migrate|bind-file|resume-upload> --username ADMIN [--oid OID] [--article-id ID] [--receipt KEY --file-id ID] [--apply]');
  console.log('Changes default to dry-run. Pause Figshare workers before applying migration or repairs. No command publishes or transfers ownership.');
  process.exit(values.help ? 0 : 1);
}
const { Sails } = require('sails');
const { generateAllShims } = require('@researchdatabox/redbox-core');
const app = new Sails();
(async () => {
  await generateAllShims(root);
  await new Promise((resolve, reject) => app.load({ appPath: root, hooks: { http: false, grunt: false } }, err => err ? reject(err) : resolve()));
  const { figshareAdmin } = require('@researchdatabox/redbox-core/dist/services/figshare-v2/admin');
  const result = await figshareAdmin({ action, oid: values.oid, username: values.username, articleId: values['article-id'], apply: values.apply, receipt: values.receipt, fileId: values['file-id'] });
  console.log(JSON.stringify(result, null, 2));
})().catch(error => { console.error(error.message); process.exitCode = 1; })
  .finally(() => app.lower(() => {}));
