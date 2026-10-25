'use strict';
// Actual pre-feature methods, evaluated with deterministic domain ports. No Sails HTTP claim.
const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const path = require('node:path');
const vm = require('node:vm');
const fs = require('node:fs');
const ts = require(path.resolve('node_modules/typescript'));
const _ = require(path.resolve('node_modules/lodash'));
const { of, from, firstValueFrom } = require(path.resolve('node_modules/rxjs'));
const save = require(path.resolve('packages/redbox-core/src/RecordSaveResponse.ts'));
const { formatRecordEntityTag } = require(path.resolve('packages/redbox-core/src/RecordEntityTag.ts'));
const concurrency = require(path.resolve('packages/redbox-core/src/RecordHttpConcurrency.ts'));
const file = 'packages/redbox-core/src/controllers/RecordController.ts';
const source = execFileSync('git', ['show', 'a49366803:' + file], { encoding: 'utf8' });
const ast = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true);
function receiver(globals, overrides, baselineFile = file) {
  const baselineSource = baselineFile === file ? source : execFileSync('git', ['show', 'a49366803:' + baselineFile], { encoding: 'utf8' });
  const baselineAst = ts.createSourceFile(baselineFile, baselineSource, ts.ScriptTarget.Latest, true);
  const target = {};
  function visit(node) {
    if (ts.isMethodDeclaration(node) && node.name && node.body) {
      const expression = '(' + (node.modifiers?.some(m => m.kind === ts.SyntaxKind.AsyncKeyword) ? 'async ' : '') +
        'function(' + node.parameters.map(p => p.getText(baselineAst)).join(',') + ')' + node.body.getText(baselineAst) + ')';
      target[node.name.getText(baselineAst)] = vm.runInNewContext(ts.transpileModule(expression, {
        compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
      }).outputText, { Error, Map, Set, String, Number, Promise, _, of, from, firstValueFrom, ...save, ...concurrency, ...globals });
    }
    ts.forEachChild(node, visit);
  }
  visit(baselineAst);
  return Object.assign(target, overrides);
}
const brand = { id: 'brand-1', name: 'default' };
const user = { id: 'user-1', username: 'alice', roles: [] };
const record = { redboxOid: 'oid-1', revision: 3, metaMetadata: { brandId: 'brand-1', type: 'dataset' }, metadata: { title: 'Current' }, authorization: { view: ['alice'], edit: ['alice'] } };
const graph = { rootOid: 'oid-1', edges: [], relatedObjects: { dataset: [record] }, omittedByAccess: {} };
const request = (query = {}, body = {}) => ({ query, body, headers: {}, params: { oid: 'oid-1', recordType: 'dataset' }, user, session: { branding: 'default' }, options: { locals: { portal: 'portal' } }, param(name) { return this.params[name] ?? this.body?.[name] ?? this.query[name]; } });
const noop = () => {};
const baseGlobals = {
  sails: { config: { record: {}, reusableFormDefinitions: {} }, log: { error: noop, verbose: noop } },
  TranslationService: { t: value => value }, RecordTypesService: { get: () => of({ name: 'dataset' }) },
};
const baseOverrides = { getReqBrand: () => brand, hasViewAccess: () => of(true), hasEditAccess: () => of(true),
  getNoCacheHeaders: () => ({}), getApiVersion: () => '2.0', sendResp: (_req, _res, build) => build,
};
(async () => {
  const observations = [];
  const r = receiver(baseGlobals, { ...baseOverrides, recordsService: { getMeta: async () => record, getRelatedRecords: async () => graph } });
  for (const version of ['1.0', '2.0']) {
    r.getApiVersion = () => version;
    const build = await r.getMeta(request({ include: 'relationships' }), {});
    assert.deepEqual(JSON.parse(JSON.stringify(build.data)), record.metadata);
    assert.deepEqual(JSON.parse(JSON.stringify(build.meta.relationships)), graph);
    assert.deepEqual(JSON.parse(JSON.stringify(build.v1)), { ...record.metadata, relationships: graph });
    observations.push({ id: 'HTTP-108', version, mode: 'baseline-method', file, action: 'getMeta', build });
  }
  let deletion;
  r.getRecord = () => of(record);
  r.recordsService.delete = async (...args) => { deletion = args; const result = new save.RecordSaveResponse(); result.confirmPrimaryPersistence('oid-1'); return result; };
  await r.delete(request({ permanent: 'true' }), {});
  assert.equal(deletion[1], false);
  assert.equal(deletion[5].operation, 'delete');
  observations.push({ id: 'HTTP-137', mode: 'baseline-method', file, action: 'delete', permanent: deletion[1], operation: deletion[5].operation });
  for (const action of ['createInternal', 'updateInternal']) {
    for (const failure of ['read', 'projection']) {
      const result = new save.RecordSaveResponse('00000000-0000-4000-8000-000000000001'); result.confirmPrimaryPersistence('oid-1');
      result.setConcurrencyMetadata({ revision: 4, entityTag: formatRecordEntityTag('oid-1', 4) });
      const rr = receiver(baseGlobals, { ...baseOverrides, getRecord: () => of(record),
        recordsService: { create: async () => result, updateMeta: async () => result, getMeta: async () => { if (failure === 'read') throw new Error('PRIVATE'); return record; } },
        getPostSaveMetadata: async () => { if (failure === 'projection') throw new Error('PRIVATE'); return {}; },
      });
      const build = await rr[action](request({}, { title: 'Saved' }), {});
      assert.equal(build.meta.outcome, 'saved-with-warnings');
      assert.equal(build.meta.problems[0].issues[0].code, 'response-projection-failed');
      assert.equal(build.headers.ETag, formatRecordEntityTag('oid-1', 4));
      observations.push({ id: action === 'createInternal' ? 'HTTP-135' : 'HTTP-136', mode: 'baseline-method', file, action, failure, build });
    }
  }
  for (const rootContext of ['', '/research']) {
    const publicUrl = 'https://public.example.edu' + rootContext;
    let completed;
    const completion = new Promise(resolve => { completed = resolve; });
    const result = new save.RecordSaveResponse(); result.confirmPrimaryPersistence('oid-1');
    const rr = receiver({ ...baseGlobals,
      sails: { ...baseGlobals.sails, config: { ...baseGlobals.sails.config, appUrl: publicUrl } },
      BrandingService: { getBrand: () => brand, getBrandAndPortalPath: () => '/default/portal' },
      getValidatedApiRequest: req => ({ params: req.params, query: req.query, body: req.body }),
      isRecordSchemaEnabled: () => false,
    }, { ...baseOverrides,
      RecordsService: { create: async () => result }, mutationSaveContext: () => ({ valid: true, context: {} }),
      recordSaveDiscoveryHeaders: () => ({}), sendResp: (_req, _res, build) => completed(build),
    }, 'packages/redbox-core/src/controllers/webservice/RecordController.ts');
    rr.create(request({}, { title: 'Saved' }), {});
    const build = await completion;
    assert.equal(build.status, 201);
    assert.equal(build.headers.Location, publicUrl + '/default/portal/api/records/metadata/oid-1');
    observations.push({ id: 'HTTP-120', mode: 'baseline-method', file: 'packages/redbox-core/src/controllers/webservice/RecordController.ts', action: 'create', publicUrl, rootContext, build });
  }
  for (const browser of [false, true]) {
    for (const queryOwner of [undefined, 'query-owner']) {
      const baselineFile = 'packages/redbox-core/src/controllers/' + (browser ? '' : 'webservice/') + 'ReportController.ts';
      const rr = receiver({ ...baseGlobals,
        BrandingService: { getBrand: () => brand },
        getValidatedApiRequest: req => ({ params: req.params, query: req.query, body: req.body }),
        ReportsService: { previewConfig: async (_brand, _config, parameters) => ({ owner: parameters.param('owner'), date: parameters.param('changed_fromDate') }) },
      }, baseOverrides, baselineFile);
      const build = await rr.previewConfig(request(queryOwner ? { owner: queryOwner } : {}, { owner: 'body-owner', changed_fromDate: '2026-01-02' }), {});
      assert.equal(build.data.owner, 'body-owner');
      assert.equal(build.data.date, '2026-01-02');
      observations.push({ id: browser ? 'HTTP-070' : 'HTTP-067', mode: 'baseline-method', file: baselineFile, action: 'previewConfig', queryOwner, build });
    }
  }
  const output = { baseline: 'a49366803164429f9d8bdd249dadcdf856c9d13e', node: process.version, qualification: 'actual baseline controller methods with deterministic domain ports; not baseline HTTP', observations };
  const destination = process.argv[2];
  if (destination) fs.writeFileSync(destination, JSON.stringify(output, null, 2) + '\n');
  else process.stdout.write(JSON.stringify(output, null, 2) + '\n');
})().catch(error => { console.error(error); process.exitCode = 1; });
