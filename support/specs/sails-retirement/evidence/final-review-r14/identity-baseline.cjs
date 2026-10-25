'use strict';
// Actual pre-feature method execution with deterministic ports, not Sails HTTP.
const { execFileSync } = require('node:child_process');
const { createRequire } = require('node:module');
const vm = require('node:vm');
const path = require('node:path');
const assert = require('node:assert/strict');
const core = createRequire(path.resolve('packages/redbox-core/package.json'));
const ts = core('typescript');
const { of } = core('rxjs');
const baseline = 'a49366803164429f9d8bdd249dadcdf856c9d13e';
const cache = new Map();
function method(file, name, globals = {}, ref = baseline) {
  const key = ref + ':' + file;
  if (!cache.has(key))
    cache.set(
      key,
      ref === null
        ? require('node:fs').readFileSync(file, 'utf8')
        : execFileSync('git', ['show', ref + ':' + file], { encoding: 'utf8' })
    );
  const ast = ts.createSourceFile(file, cache.get(key), ts.ScriptTarget.Latest, true);
  let node;
  function visit(n) {
    if (ts.isMethodDeclaration(n) && n.name?.getText(ast) === name) node = n;
    ts.forEachChild(n, visit);
  }
  visit(ast);
  assert(node, file + ':' + name);
  const expression =
    '(' +
    (node.modifiers?.some(m => m.kind === ts.SyntaxKind.AsyncKeyword) ? 'async ' : '') +
    'function(' +
    node.parameters.map(p => p.getText(ast)).join(',') +
    ')' +
    node.body.getText(ast) +
    ')';
  return vm.runInNewContext(
    ts.transpileModule(expression, {
      compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
    }).outputText,
    globals
  );
}
module.exports = { method, core, baseline };
if (require.main === module)
  (async () => {
    const rows = [];
    const selected = '111111111111111111111111',
      other = '222222222222222222222222';
    for (const query of [{ id: other }, { userid: other }, { id: other, userid: other }, {}]) {
      let operation;
      const fn = method('packages/redbox-core/src/controllers/webservice/UserManagementController.ts', 'updateUser', {
        getValidatedApiRequest: req => ({ body: req.body, query: req.query }),
        BrandingService: { getBrand: () => ({ id: 'brand-1' }) },
        UsersService: {
          updateUserDetails: (...args) => {
            operation = args;
            return of([{ id: args[0] }]);
          },
        },
        CreateUserAPIResponse: class {},
        sails: { log: { error() {} } },
      });
      const response = [];
      await fn.call(
        {
          requireUserInBrand: async id => ({ id }),
          retainRequestCallback() {},
          apiRespond: (_req, _res, data, status) => response.push({ data, status }),
        },
        {
          body: { id: selected, userid: other, name: 'Updated', email: '', password: '' },
          query,
          session: { branding: 'default' },
        },
        {}
      );
      assert.equal(operation[0], selected);
      rows.push({ id: 'HTTP-144', query, operation, status: response[0].status, selected: response[0].data.id });
    }
    for (const id of ['HTTP-163', 'HTTP-164']) {
      let result;
      const user = { id: selected, username: 'disabled-user', name: 'Hidden', loginDisabled: true };
      const fn = method('packages/redbox-core/src/controllers/webservice/UserManagementController.ts', 'getUser', {
        getValidatedApiRequest: req => ({ query: req.query }),
        getIdentityRepositories: () => ({ one: async () => ({ ...user }) }),
        identityCallback: (promise, callback) => promise.then(value => callback(null, value)),
        sails: { log: { error() {} }, config: { auth: { hiddenUsers: ['Hidden'] } } },
      });
      fn.call(
        {
          apiRespond: (_req, _res, data) => {
            result = data;
          },
        },
        { query: { searchBy: 'username', query: 'disabled-user' } },
        {}
      );
      await new Promise(setImmediate);
      assert.equal(result.id, selected);
      rows.push({ id, status: 200, result });
    }
    {
      let result;
      const user = { id: selected, username: 'hidden', name: 'Hidden' };
      const fn = method('packages/redbox-core/src/controllers/webservice/UserManagementController.ts', 'listUsers', {
        getValidatedApiRequest: req => ({ query: req.query }),
        BrandingService: { getBrand: () => ({ id: 'brand-1' }) },
        _: core('lodash'),
        ListAPIResponse: class {
          constructor() {
            this.summary = {};
          }
        },
        sails: { log: { error() {} }, config: { auth: { hiddenUsers: ['Hidden'] } } },
      });
      await fn.call(
        {
          getFilteredUserRecords: async () => [user],
          apiRespond: (_req, _res, data) => {
            result = data;
          },
        },
        { query: {}, session: { branding: 'default' } },
        {}
      );
      assert.equal(result.records[0].id, selected);
      rows.push({ id: 'HTTP-162', status: 200, result });
    }
    const { firstValueFrom } = core('rxjs');
    for (const id of ['HTTP-249', 'HTTP-253']) {
      const headers = {},
        calls = [];
      let bytes;
      const generic = id === 'HTTP-253';
      const record = { metaMetadata: { brandId: 'brand-1' } };
      const req = {
        params: { oid: 'record-1', datastreamId: 'export.csv' },
        query: {},
        user: { username: 'alice' },
        session: { branding: 'default' },
        param(name) {
          return this.params[name] ?? this.query[name];
        },
      };
      const res = {
        set(key, value) {
          headers[key] = value;
          return this;
        },
        attachment(name) {
          headers.filename = name;
          return this;
        },
        end(value) {
          bytes = String(value);
        },
      };
      const service = {
        getDatastream: async (...args) => {
          calls.push(args);
          return { body: Buffer.from('bytes') };
        },
      };
      const fn = method(
        'packages/redbox-core/src/controllers/' + (generic ? '' : 'webservice/') + 'RecordController.ts',
        'getDataStream',
        {
          getValidatedApiRequest: req => req,
          BrandingService: { getBrand: () => ({ id: 'brand-1' }) },
          firstValueFrom,
          of,
          Buffer,
          _: core('lodash'),
          sails: { log: { verbose() {}, error() {} } },
        }
      );
      await fn.call(
        {
          getReqBrand: () => ({ id: 'brand-1' }),
          getRecord: () => of(record),
          requireRecordInBrand: async () => record,
          hasViewAccess: () => (generic ? of(true) : true),
          datastreamService: service,
          DatastreamService: service,
          RecordsService: {
            getAttachments: async () => [{ fileId: 'export.csv', name: 'metadata-name.txt', size: '5' }],
          },
        },
        req,
        res
      );
      assert.equal(bytes, 'bytes');
      assert.equal(headers.filename, generic ? 'export.csv' : 'metadata-name.txt');
      if (!generic) assert.equal(headers['Content-Length'], '5');
      rows.push({
        id,
        evidenceKind: 'actual-method-with-response-port',
        headers,
        calls,
        body: bytes,
        metadataRequired: !generic,
      });
    }
    for (const browser of [false, true])
      for (const action of ['import', 'sync']) {
        let args;
        const fn = method(
          'packages/redbox-core/src/controllers/' + (browser ? '' : 'webservice/') + 'VocabularyController.ts',
          action,
          {
            getValidatedApiRequest: req => req,
            BrandingService: { getBrandFromReq: () => ({ id: 'brand-1' }) },
            RvaImportService: {
              importRvaVocabulary: async (...values) => {
                args = values;
                return { id: 'vocab-1' };
              },
              syncRvaVocabulary: async (...values) => {
                args = values;
                return { updated: 1 };
              },
            },
          }
        );
        const response = await fn.call(
          { resolveBrandingId: () => 'brand-1', getNoCacheHeaders: () => ({}), sendResp: (_req, _res, value) => value },
          { params: { id: 'vocab-1' }, body: { rvaId: '1234', versionId: '' }, param: () => 'vocab-1' },
          {}
        );
        assert.equal(args[1], undefined);
        rows.push({
          id: 'HTTP-' + (browser ? (action === 'import' ? 176 : 177) : action === 'import' ? 174 : 175),
          inputVersion: '',
          selectedVersion: args[1] ?? null,
          status: response.status ?? 200,
        });
      }
    console.log(JSON.stringify({ baseline, evidenceKind: 'actual-baseline-method-execution', rows }, null, 2));
  })().catch(error => {
    console.error(error);
    process.exitCode = 1;
  });
