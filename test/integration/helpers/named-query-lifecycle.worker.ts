import assert from 'node:assert/strict';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import sails from 'sails';
import supertest from 'supertest';
import axios from 'axios';
import { generateAllShims, recordGraphql, SOLR_RECORD_GRID_FIELDS } from '@researchdatabox/redbox-core';
import type { NamedQueryAttributes } from '@researchdatabox/redbox-core/dist/waterline-models/NamedQuery';
import {
  lifecycleDefinitions,
  lifecycleOid as lifecycleOidPrefix,
  lifecycleTitle,
} from './named-query-lifecycle.fixtures';

async function main() {
  const [phase, root] = process.argv.slice(2);
  assert.ok(phase === 'cold' || phase === 'restart');
  const mongoUrl = process.env.NAMED_QUERY_LIFECYCLE_MONGO_URL;
  const storageUrl = process.env.NAMED_QUERY_LIFECYCLE_STORAGE_URL;
  const lifecycleOid = process.env.NAMED_QUERY_LIFECYCLE_OID;
  assert.ok(mongoUrl && new URL(mongoUrl).pathname.startsWith('/named_query_lifecycle_'));
  assert.equal(new URL(storageUrl).pathname, `${new URL(mongoUrl).pathname}_storage`);
  assert.equal(
    lifecycleOid,
    `${lifecycleOidPrefix}-${new URL(mongoUrl).pathname.slice('/named_query_lifecycle_'.length)}`
  );
  console.log(
    'NAMED_QUERY_LIFECYCLE_RUNTIME',
    JSON.stringify({ node: process.version, execArgv: process.execArgv, uid: process.getuid?.(), root, lifecycleOid })
  );
  const { recordContractContributorState } = await generateAllShims(process.cwd());
  // Run the generated bootstrap unchanged, including migrations and coreBootstrap.
  // Its data-path property is configuration, not a replacement bootstrap callback.
  const bootstrap = require(path.resolve('config/bootstrap.js')).bootstrap;
  bootstrap.bootstrapDataPath = root;
  await new Promise<void>((resolve, reject) =>
    sails.lift(
      {
        recordContractContributorState,
        hooks: { grunt: false },
        port: 1501,
        log: { level: 'warn' },
        models: { datastore: 'mongodb', migrate: 'safe' },
        datastores: {
          mongodb: { adapter: require('sails-mongo'), url: mongoUrl },
          redboxStorage: { adapter: require('sails-mongo'), url: storageUrl },
        },
        bootstrap,
        appmode: { bootstrapAlways: false },
        security: { csrf: true },
        recordGraphql: { ...recordGraphql, enabled: false, cursorSecret: 'isolated-named-query-lifecycle-secret' },
      },
      error => (error ? reject(error) : resolve())
    )
  );
  let failed = false;
  try {
    const brand = BrandingService.getDefault();
    const definitions = lifecycleDefinitions(lifecycleOid);
    const storedRows = () =>
      NamedQuery.find({ branding: brand.id, name: ['coldGraphql', 'coldLegacy', 'aInvalid'] }) as Promise<
        NamedQueryAttributes[]
      >;
    const rows = await storedRows();
    assert.deepEqual(rows.map(row => row.name).sort(), ['coldGraphql', 'coldLegacy']);
    await fs.access(path.join(root, 'namedqueries/aInvalid.json'));
    assert.equal(sails.config.recordGraphql.enabled, false);
    const imported = await NamedQueryService.getNamedQueryConfig(brand, 'coldGraphql');
    assert.deepEqual(imported.graphql, definitions.coldGraphql.graphql);
    const legacy = await NamedQueryService.getNamedQueryConfig(brand, 'coldLegacy');
    assert.equal(legacy.source, undefined);
    assert.deepEqual(legacy.mongoQuery, definitions.coldLegacy.mongoQuery);
    const session = supertest.agent(sails.hooks.http.app);
    const base = '/default/rdmp';
    const loginCsrf = (await session.get('/csrfToken?branding=default&portal=rdmp').expect(200)).body._csrf;
    assert.equal(typeof loginCsrf, 'string');
    await session
      .post('/user/login_local')
      .set('X-Source', 'jsclient')
      .set('X-CSRF-Token', loginCsrf)
      .send({ username: 'admin', password: 'rbadmin', branding: 'default', portal: 'rdmp' })
      .expect(200);
    const csrf = (await session.get('/csrfToken?branding=default&portal=rdmp').expect(200)).body._csrf;
    const headers = { 'X-CSRF-Token': csrf, 'X-ReDBox-Api-Version': '2.0' };
    const saved = () =>
      session
        .get(`${base}/api/report/namedQuery`)
        .set(headers)
        .query({ queryName: 'coldGraphql', search: lifecycleOid });
    // Import must neither need enabled execution nor grant it to a caller.
    await saved().expect(503);
    await assert.rejects(NamedQueryService.performNamedQueryFromConfig(imported, {}, brand, 0, 25), {
      code: 'GRAPHQL_CONTEXT_REQUIRED',
    });
    sails.config.recordGraphql = { ...sails.config.recordGraphql, enabled: true };

    const stateFile = path.join(root, 'persisted.json');
    if (phase === 'cold') {
      assert.equal(await Record.count(), 0, 'cold import must finish before any record fixture exists');
      const row = await Record.create({
        redboxOid: lifecycleOid,
        metadata: { title: lifecycleTitle },
        metaMetadata: {
          brandId: brand.id,
          type: 'dataPublication',
          form: 'dataPublication-1.0-draft',
          searchCore: 'default',
        },
        workflow: { stage: 'draft' },
        authorization: { view: ['admin'], edit: [], viewRoles: [], editRoles: [] },
      }).fetch();
      const options = sails.config.solr.cores.default.options;
      const url = `${options.https ? 'https' : 'http'}://${options.host}:${options.port}/solr/${options.core}`;
      const schema = (await axios.get(`${url}/schema`)).data.schema;
      const missing = SOLR_RECORD_GRID_FIELDS.filter(field => !schema.fields.some(found => found.name === field.name));
      if (missing.length) await axios.post(`${url}/schema`, { 'add-field': missing });
      await axios.post(`${url}/update`, [sails.services.solrsearchservice.preIndex({ ...row, storage_id: row.id })], {
        params: { commit: true },
      });
      for (const [name, definition] of Object.entries({ coldGraphql: imported, coldLegacy: legacy })) {
        await session
          .put(`${base}/api/named-query/${name}`)
          .set(headers)
          .send({ ...definition, description: 'Saved edit survives process restart' })
          .expect(200);
      }
      await fs.writeFile(stateFile, JSON.stringify({ pid: process.pid, rows: await storedRows() }));
    } else {
      const state = JSON.parse(await fs.readFile(stateFile, 'utf8'));
      assert.notEqual(process.pid, state.pid, 'restart must use a new application process');
      assert.deepEqual(
        [...rows].sort((a, b) => a.name.localeCompare(b.name)),
        state.rows.sort((a, b) => a.name.localeCompare(b.name)),
        'startup import must preserve persisted IDs, edits and source fields'
      );
      assert.equal((await Record.findOne({ redboxOid: lifecycleOid })).metadata.title, lifecycleTitle);
    }
    const result = (await saved().expect(200)).body.data;
    assert.equal(result.source, 'graphql');
    assert.deepEqual(result.records, [{ oid: lifecycleOid, title: lifecycleTitle }]);
    assert.equal(result.summary.numFound, null);
    assert.deepEqual(result.pagination, { mode: 'firstPage', hasNextPage: false });
    const direct = (
      await session
        .post(`${base}/api/named-query/editor/preview`)
        .set(headers)
        .send({ definition: imported, parameters: { search: lifecycleOid } })
        .expect(200)
    ).body.data;
    assert.deepEqual(direct.records, result.records);
    const db = (
      await session.get(`${base}/api/report/namedQuery`).set(headers).query({ queryName: 'coldLegacy' }).expect(200)
    ).body.data;
    assert.equal(db.summary.numFound, 1);
    assert.equal(db.records[0].oid, lifecycleOid);
    assert.equal(db.source, undefined);
    // No read/import should rewrite the saved edits.
    for (const row of await storedRows()) {
      assert.equal(row.description, 'Saved edit survives process restart');
    }
    console.log(`NAMED_QUERY_LIFECYCLE_${phase.toUpperCase()}_PASS`);
  } catch (error) {
    failed = true;
    throw error;
  } finally {
    try {
      await new Promise<void>((resolve, reject) => sails.lower(error => (error ? reject(error) : resolve())));
    } catch (error) {
      if (!failed) throw error;
      console.error('Lifecycle shutdown also failed; preserving the original failure:', error);
    }
  }
}

main().then(
  () => process.exit(0),
  error => {
    console.error(error);
    process.exit(1);
  }
);
