#!/usr/bin/env node
'use strict';
// Initialize the selected application without activating workers or HTTP.
const path = require('node:path');
const { parseArgs } = require('node:util');
const root = path.resolve(__dirname, '../..');
process.chdir(root);
const { values, positionals } = parseArgs({ allowPositionals: true, options: {
  oid: { type: 'string' }, username: { type: 'string' }, 'article-id': { type: 'string' }, 'owner-id': { type: 'string' }, receipt: { type: 'string' }, 'file-id': { type: 'string' }, apply: { type: 'boolean', default: false }, help: { type: 'boolean' }
} });
const action = positionals[0];
if (values.help || !['inspect', 'reconcile', 'abandon-create', 'link', 'relink', 'resume', 'reset-publish', 'migrate', 'bind-file', 'resume-upload'].includes(action) || !values.username) {
  console.log('node support/figshare/admin.js <inspect|reconcile|abandon-create|link|relink|resume|reset-publish|migrate|bind-file|resume-upload> --username ADMIN [--oid OID] [--article-id ID --owner-id ACCOUNT_ID] [--receipt KEY --file-id ID] [--apply]');
  console.log('Changes default to dry-run. Pause Figshare workers before applying migration or repairs. No command publishes or transfers ownership.');
  process.exit(values.help ? 0 : 1);
}
const { createPortalApplication } = require('@researchdatabox/redbox-core/portal');
let portal;
(async () => {
  const { REDBOX_APPLICATION_CONFIG, REDBOX_ENVIRONMENT_CONFIG, REDBOX_LOCAL_CONFIG, ...env } = process.env;
  portal = await createPortalApplication({
    appPath: root, log: require('@researchdatabox/sails-ng-common').consoleLogger,
    environment: process.env.NODE_ENV || 'production', env,
    files: { application: REDBOX_APPLICATION_CONFIG, environment: REDBOX_ENVIRONMENT_CONFIG, local: REDBOX_LOCAL_CONFIG },
  });
  await portal.application.initialize();
  const result = await portal.providers.figshare.get().administration.figshareAdmin({
    action, oid: values.oid, username: values.username, articleId: values['article-id'],
    ownerId: values['owner-id'], apply: values.apply, receipt: values.receipt, fileId: values['file-id'],
  });
  console.log(JSON.stringify(result, null, 2));
})().catch(error => { console.error(error.message); process.exitCode = 1; })
  .finally(async () => { if (portal) await portal.application.stop(); });
