'use strict';
// Loader and provider-path checks only: no PDF activation, browser, network or persistence.
const assert = require('node:assert/strict');
const path = require('node:path');
const {createRequire} = require('node:module');
const root = path.resolve(__dirname, '../../../../..');
const core = createRequire(path.join(root, 'packages/redbox-core/package.json'));
const {loadPortalConfiguration} = core('./dist/configuration');
const {registerRedboxExtension, Services} = require(path.join(root, 'packages/sails-hook-redbox-pdfgen/dist/extension.js'));
(async () => {
  const rows = [];
  for (const value of [undefined, '', '/institution/research/record/view', '/institution/research/record/render?oid=']) {
    const declaration = registerRedboxExtension();
    declaration.config = {...declaration.config, pdfgen: {...declaration.config.pdfgen, ...(value === undefined ? {} : {sourceUrlBase: value})}};
    const config = await loadPortalConfiguration({extensions: {providers: [{name: 'pdf', declaration}]},
      env: {REDBOX_SESSION_SECRET: 'review-disposable-secret-more-than-32-characters'}, argv: []});
    assert.equal(config.pdfgen.sourceUrlBase, value);
    const pdf = new Services.PDF({optionsForBrand: () => config.pdfgen});
    const providerBase = pdf.getSourceUrlBase({name: 'institution'}, {});
    assert.equal(providerBase, value || '/institution/rdmp/record/view');
    rows.push({input: value === undefined ? '<omitted>' : value, accepted: true, providerBase});
  }
  for (const value of [123, null, false, {}]) {
    const declaration = registerRedboxExtension();
    declaration.config = {...declaration.config, pdfgen: {...declaration.config.pdfgen, sourceUrlBase: value}};
    await assert.rejects(loadPortalConfiguration({extensions: {providers: [{name: 'pdf', declaration}]},
      env: {REDBOX_SESSION_SECRET: 'review-disposable-secret-more-than-32-characters'}, argv: []}),
    error => error.name === 'ConfigurationError' && error.path === 'pdfgen.sourceUrlBase');
    rows.push({input: value, rejected: true});
  }
  console.log(JSON.stringify({node: process.version, rows}, null, 2));
})().catch(error => {console.error(error); process.exitCode = 1;});
