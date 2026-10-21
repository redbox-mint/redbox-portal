#!/usr/bin/env node
'use strict';
// Operates only on an explicitly acknowledged disposable copy. Never seeds or enables a deployment.
const assert = require('node:assert/strict');
const { createHash } = require('node:crypto');
const { mkdir, readFile, writeFile } = require('node:fs/promises');
const { resolve, join } = require('node:path');
const { parseArgs } = require('node:util');
const { main: admin, loadApplication } = require('./admin');

const legacyCollections = [
  'record',
  'figsharesync',
  'integrationaudit',
  'figsharevocabularysource',
  'figsharevocabularycategory',
  'figsharevocabularycrosswalk',
  'figsharevocabularycrosswalkmapping',
  'figsharevocabularysyncrun',
  'vocabulary',
  'vocabularyentry',
];
const convertedCollections = [
  'publicationmigration',
  'publicationmigrationitem',
  'publicationmigrationinventory',
  'publicationsync',
  'publicationdestination',
  'publicationvocabularysource',
  'publicationvocabularycrosswalk',
  'publicationvocabularyconversion',
];
function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object')
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map(key => [key, canonical(value[key])])
    );
  return value;
}
function digest(value) {
  return createHash('sha256')
    .update(JSON.stringify(canonical(JSON.parse(JSON.stringify(value)))))
    .digest('hex');
}
async function inventory(db, names) {
  const result = {};
  for (const name of names) {
    const hashes = [];
    // Whole-copy hashes also detect accidental changes to another brand. No private rows are exported.
    for await (const row of db.collection(name).find({})) hashes.push(digest(row));
    hashes.sort();
    result[name] = { count: hashes.length, digest: digest(hashes) };
  }
  return result;
}
async function verifyVocabulary(db, brandId) {
  const { publicationDigest } = require('@researchdatabox/redbox-core');
  const {
    PublicationVocabularyStore,
  } = require('@researchdatabox/redbox-core/dist/services/publication-vocabulary/store');
  const store = new PublicationVocabularyStore(db);
  let approvals = 0;
  let mappings = 0;
  let imports = 0;
  const proofs = [];
  for await (const source of store.sources.find({ brandId })) {
    if (!source.legacy) continue;
    const original = await db
      .collection('figsharevocabularysource')
      .findOne({ $expr: { $eq: [{ $toString: '$_id' }, source.id] } });
    assert.equal(digest(source.legacy), digest(original), 'Source provenance changed');
    for (const run of source.imports) {
      assert.equal(run.digest, publicationDigest(run.evidence), 'Import audit evidence changed');
      imports++;
    }
  }
  for await (const crosswalk of store.crosswalks.find({ brandId })) {
    if (!crosswalk.legacy) continue;
    const original = await db
      .collection('figsharevocabularycrosswalk')
      .findOne({ $expr: { $eq: [{ $toString: '$_id' }, crosswalk.id] } });
    assert.equal(digest(crosswalk.legacy), digest(original), 'Crosswalk provenance changed');
    assert.equal(crosswalk.approvedRevision, original.approvedRevision);
    for (const revision of crosswalk.revisions) {
      for (const mapping of revision.mappings) {
        assert.equal(mapping.id, mapping.evidence._id, 'Mapping ID changed');
        assert.equal(mapping.approvedBy, mapping.evidence.approvedBy);
        assert.equal(mapping.approvedAt, mapping.evidence.approvedAt);
        mappings++;
      }
      if (!revision.approvedAt) continue;
      approvals++;
      const codes = revision.entries.flatMap(entry => entry.codes);
      const result = await store.resolve({
        brandId,
        crosswalkId: crosswalk.id,
        sourceVocabularyId: crosswalk.localVocabularyId,
        revision: revision.revision,
        codes,
      });
      assert.equal(result.revisionDigest, revision.digest);
      assert.ok(revision.auditReferences.length > 0, 'Approval audit references missing');
      proofs.push({ revision: revision.revision, digest: revision.digest, resolution: digest(result) });
    }
  }
  return { approvals, mappings, imports, proofs };
}
async function main(argv = process.argv.slice(2), load = loadApplication) {
  const { values } = parseArgs({
    args: argv,
    options: {
      brand: { type: 'string' },
      username: { type: 'string' },
      stage: { type: 'string', default: '1' },
      parameters: { type: 'string' },
      evidence: { type: 'string' },
      baseline: { type: 'string' },
      apply: { type: 'boolean', default: false },
      reason: { type: 'string' },
      'disposable-copy': { type: 'boolean', default: false },
    },
  });
  if (
    !values['disposable-copy'] ||
    !values.brand ||
    !values.username ||
    !values.evidence ||
    !['1', '2'].includes(values.stage)
  )
    throw new Error(
      'Rehearsal requires --disposable-copy --brand ID --username ADMIN --stage 1|2 --evidence NEW_DIRECTORY [--parameters JSON_FILE] [--baseline FILE] [--apply --reason TEXT]'
    );
  if (values.apply && !values.reason?.trim()) throw new Error('Applied rehearsal requires a reason');
  const parameters = values.parameters ? JSON.parse(await readFile(values.parameters, 'utf8')) : {};
  assert.ok(parameters && typeof parameters === 'object' && !Array.isArray(parameters));
  const directory = resolve(values.evidence);
  // Refuse to overwrite prior receipts, including after interruption. Resume into a new directory.
  await mkdir(directory, { mode: 0o700 });
  const save = (name, value) =>
    writeFile(join(directory, `${name}.json`), JSON.stringify(value, null, 2) + '\n', { flag: 'wx', mode: 0o600 });
  const app = await load();
  try {
    const db = global.PublicationSync.getDatastore().manager;
    const sourceCollections = legacyCollections.map(name => (name === 'record' ? global.Record.tableName : name));
    const before = values.baseline
      ? JSON.parse(await readFile(values.baseline, 'utf8'))
      : await inventory(db, sourceCollections);
    await save('before', before);
    const command = values.stage === '1' ? 'migrate' : 'convert-vocabularies';
    const call = async apply =>
      admin(
        [
          command,
          '--brand',
          values.brand,
          '--username',
          values.username,
          '--parameters',
          JSON.stringify(parameters),
          ...(apply ? ['--apply', '--reason', values.reason] : []),
        ],
        async () => ({ ...app, close: async () => {} }),
        () => {}
      );
    const preview = await call(false);
    await save('preview', preview);
    assert.deepEqual(await call(false), preview, 'Dry-run changed without a source write');
    if (!values.apply) return { dryRun: true, evidence: directory };
    const applied = await call(true);
    await save('applied', applied);
    if (values.stage === '1') {
      assert.equal(applied.authority, 'shared');
      const authority = await db.collection('publicationmigration').findOne({ brandId: values.brand });
      assert.equal(authority?.phase, 'committed');
      assert.deepEqual(authority.globalFailures, []);
      const configured = await global.AppConfigService.getAppConfigurationForBrand(
        global.BrandingService.getBrandById(values.brand).name
      );
      assert.equal(configured.publicationPublishing.processing.enabled, false);
      assert.ok(Object.values(configured.publicationPublishing.destinations).every(item => !item.enabled));
    } else assert.equal(applied.state, 'committed');
    const after = await inventory(db, sourceCollections);
    await save('after', after);
    assert.deepEqual(after, before, 'Legacy/source/audit evidence changed during rehearsal');
    const converted = await inventory(db, convertedCollections);
    await save('converted', converted);
    const vocabulary = values.stage === '2' ? await verifyVocabulary(db, values.brand) : undefined;
    if (vocabulary) await save('vocabulary', vocabulary);
    const replay = await call(true);
    await save('replay', replay);
    assert.deepEqual(await inventory(db, convertedCollections), converted, 'Replay rewrote converted evidence');
    assert.deepEqual(await inventory(db, sourceCollections), before, 'Replay changed legacy evidence');
    const authority =
      values.stage === '1' ? await db.collection('publicationmigration').findOne({ brandId: values.brand }) : undefined;
    const summary = {
      stage: Number(values.stage),
      applied: true,
      legacyUnchanged: true,
      replayUnchanged: true,
      fingerprint: applied.inventoryFingerprint ?? applied.fingerprint ?? authority?.inventoryFingerprint,
      vocabulary,
      evidence: directory,
    };
    await save('summary', summary);
    return summary;
  } finally {
    await app.close();
  }
}
module.exports = { main, inventory, digest, legacyCollections, convertedCollections, verifyVocabulary };
if (require.main === module)
  main()
    .then(result => console.log(JSON.stringify(result, null, 2)))
    .catch(error => {
      console.error(error.message);
      process.exitCode = 1;
    });
