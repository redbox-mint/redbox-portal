'use strict';
// Execute actual baseline method bodies with deterministic domain ports. This is
// a controller-input probe, not a full Sails server or persistence qualification.
const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const { createRequire } = require('node:module');
const path = require('node:path');
const vm = require('node:vm');
const core = createRequire(path.resolve('packages/redbox-core/package.json'));
const ts = core('typescript');
const { of } = core('rxjs');
const baseline = 'a49366803164429f9d8bdd249dadcdf856c9d13e';
const cache = new Map();
function method(file, name, globals = {}) {
  if (!cache.has(file)) cache.set(file, execFileSync('git', ['show', baseline + ':' + file], { encoding: 'utf8' }));
  const ast = ts.createSourceFile(file, cache.get(file), ts.ScriptTarget.Latest, true);
  const matches = [];
  function visit(node) {
    if ((ts.isMethodDeclaration(node) || ts.isFunctionDeclaration(node)) && node.name?.getText(ast) === name)
      matches.push(node);
    ts.forEachChild(node, visit);
  }
  visit(ast);
  assert.equal(matches.length, 1, file + ':' + name);
  const node = matches[0];
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
const results = [];
const receiver = {
  updateChronicle() {},
  getNoCacheHeaders() {
    return {};
  },
  sendResp(_req, _res, value) {
    return value;
  },
  resolveBrandingId() {
    return 'brand-1';
  },
  asError(error) {
    return error;
  },
};
const baseRequest = query => ({
  query,
  params: { branding: 'default', vocabIdOrSlug: 'subjects', id: 'vocab-1' },
  body: undefined,
  session: { branding: 'default' },
  param(name) {
    return this.params[name] ?? this.body?.[name] ?? this.query[name];
  },
});
(async () => {
  const admin = 'packages/redbox-core/src/controllers/AdminController.ts';
  for (const action of ['generateUserKey', 'revokeUserKey', 'updateUserDetails', 'updateUserRoles']) {
    for (const present of [true, false]) {
      const selected = [];
      const UsersService = Object.fromEntries(
        ['setUserKey', 'updateUserDetails', 'updateUserRoles'].map(name => [
          name,
          (...args) => {
            selected.push({ operation: name, id: args[0] });
            return of({ id: args[0] });
          },
        ])
      );
      const fn = method(admin, action, {
        UsersService,
        uuidv4: () => 'test-token',
        BrandingService: { getBrand: () => ({ roles: [] }) },
        RolesService: { getRoleIds: () => [] },
        sails: { log: { error() {} } },
      });
      await fn.call(
        receiver,
        {
          body: {
            ...(present ? { userid: '111111111111111111111111' } : {}),
            id: '222222222222222222222222',
            details: { name: 'Updated', roles: [] },
            roles: [],
          },
          query: { id: '222222222222222222222222' },
          session: { branding: 'default' },
        },
        {}
      );
      assert.equal(selected.length > 0, present);
      assert(selected.every(call => call.id === '111111111111111111111111'));
      results.push({
        family: 'admin-body-userid',
        action,
        useridPresent: present,
        selected: selected.map(call => ({ ...call })),
      });
    }
  }
  const translation = 'packages/redbox-core/src/controllers/TranslationController.ts';
  for (const query of [{}, { locale: 'en' }, { locale: 'en', namespace: '' }, { locale: '', namespace: 'custom' }]) {
    let selected;
    const fn = method(translation, 'listEntriesApp', {
      toParamString: value => String(value ?? ''),
      BrandingService: { getBrand: () => ({ id: 'brand-1' }) },
      I18nEntriesService: {
        listEntries: async (...args) => {
          selected = args;
          return [];
        },
      },
    });
    const response = await fn.call(receiver, baseRequest(query), { json: value => value });
    assert.deepEqual(Array.from(response), []);
    assert.equal(selected[1], query.locale);
    assert.equal(selected[2], query.namespace || 'translation');
    results.push({
      family: 'translation-optional-filters',
      query,
      locale: selected[1] ?? null,
      namespace: selected[2],
    });
  }
  const form = 'packages/redbox-core/src/controllers/FormVocabularyController.ts';
  const parse = method(form, 'parseNotationList');
  for (const values of [['a,b', 'c'], [' a,b ', 'b,c', '', 'a'], [Array(101).fill('a').join(',')], ['a,b,c']]) {
    const actual = Array.from(parse.call(receiver, values));
    assert.deepEqual(actual, values[0].startsWith('a,a') ? ['a'] : ['a', 'b', 'c']);
    results.push({ family: 'notation', values, selected: actual });
  }
  const toBoolean = method('packages/sails-ng-common/src/config/helpers.ts', 'toBoolean');
  for (const raw of ['true', 'TRUE', ' t ', '1', 'yes', 'y', 'on', 'enable', 'enabled', 'false', '0', 'no', '']) {
    let selected;
    const fn = method(form, 'entries', {
      toBoolean,
      VocabularyService: {
        getEntries: async (...args) => {
          selected = args[2];
          return { entries: [], meta: {} };
        },
      },
    });
    await fn.call(receiver, baseRequest({ includeHistoricalValues: raw }), {});
    assert.equal(selected.includeHistoricalValues, !['false', '0', 'no', ''].includes(raw));
    results.push({ family: 'historical-boolean', raw, selected: selected.includeHistoricalValues });
  }
  let syncArgs;
  const sync = method('packages/redbox-core/src/controllers/VocabularyController.ts', 'sync', {
    RvaImportService: {
      syncRvaVocabulary: async (...args) => {
        syncArgs = args;
        return { updated: 1 };
      },
    },
  });
  await sync.call(receiver, baseRequest({}), {});
  assert.deepEqual(Array.from(syncArgs), ['vocab-1', undefined]);
  results.push({ family: 'bodyless-browser-sync', id: syncArgs[0], version: syncArgs[1] ?? null });
  const recordFile = 'packages/redbox-core/src/controllers/RecordController.ts';
  const recordSource = execFileSync('git', ['show', baseline + ':' + recordFile], { encoding: 'utf8' });
  assert.match(recordSource, /const oid = req\.param\('oid'\) \? req\.param\('oid'\) : ''/);
  assert.match(
    recordSource,
    /if \(hasExistingRecord\)\s*\{\s*try\s*\{\s*existingRecord = await this\.recordsService\.getMeta\(oid\)/
  );
  results.push({
    family: 'query-oid-editor',
    provenance: recordFile + ':851',
    verification:
      'actual baseline selector and guarded getMeta statement; native HTTP regression executes both edit URLs',
  });
  console.log(
    JSON.stringify(
      {
        baseline,
        probe: 'actual controller methods with deterministic ports; final editor row source assertion',
        count: results.length,
        rows: results,
      },
      null,
      2
    )
  );
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
