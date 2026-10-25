'use strict';
// Pure contract probes: execute selected production methods with rejected request
// ports. This is neither Angular rendering nor deployed/native HTTP qualification.
const fs = require('node:fs');
const cp = require('node:child_process');
const path = require('node:path');
const assert = require('node:assert/strict');
const ts = require(process.cwd() + '/node_modules/typescript');
const _ = require(process.cwd() + '/node_modules/lodash');
const { of, throwError, Subject, firstValueFrom } = require(process.cwd() + '/node_modules/rxjs');
const { mergeMap } = require(process.cwd() + '/node_modules/rxjs/operators');
const root = 'angular/projects/researchdatabox/';
const out = path.join(__dirname, 'client-error-results.json');
const results = [], inherited = [], ignoredResults = [];
const statuses = [0, 400, 401, 403, 404, 409, 410, 413, 415, 422, 500, 503];
const inputs = new Map();
global.window = { confirm: () => true };
function extract(relative, selected, baseline = false) {
  const file = root + relative;
  const code = baseline ? cp.execFileSync('git', ['show', 'a49366803:' + file], { encoding: 'utf8' }) : fs.readFileSync(file, 'utf8');
  const tree = ts.createSourceFile(file, code, ts.ScriptTarget.Latest, true);
  const methods = [];
  const add = node => {
    if (ts.isMethodDeclaration(node) && (!selected || selected.includes(node.name.getText(tree)))) methods.push(node.getText(tree));
    ts.forEachChild(node, add);
  };
  add(tree);
  if (selected) assert.equal(methods.length, selected.length, file);
  if (!baseline) inputs.set(file, require('node:crypto').createHash('sha256').update(code).digest('hex'));
  const js = ts.transpileModule(`class Consumer {${methods.join('\n')}}`, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
  return new Function('_', '_get', '_isEmpty', '_isUndefined', 'firstValueFrom', 'mergeMap', js + ';return Consumer;')(_, _.get, _.isEmpty, _.isUndefined, firstValueFrom, mergeMap);
}
const logger = { error() {}, debug() {}, warn() {}, info() {} };
const translator = { t: (key, fallback) => fallback || key };
function fresh(Constructor, error) {
  const app = new Constructor();
  const rejects = new Proxy({}, { get: () => () => Promise.reject(error) });
  Object.assign(app, { api: rejects, userService: rejects, appConfigService: rejects,
    recordService: rejects, vocabularyApi: rejects, reportConfigService: rejects,
    harvestRunApiService: rejects, siemApiService: rejects, logger, loggerService: logger,
    translationService: translator, i18n: translator, requestRender() {},
    getErrorMessage: () => 'Visible request failure', asErrorMessage: () => 'Visible request failure',
    errorText: () => 'Visible request failure', t: (key, fallback) => fallback || key,
    clearAlerts() {}, clearMessage() {}, clearFindings() {}, rememberEditModalTrigger() {},
    emptyListResponse: () => ({ records: [], summary: {} }),
  });
  return app;
}
function errorFor(status, envelope) {
  return Object.assign(new Error('HTTP request failed'), { status, error: envelope === 'v1' ? { message: 'Safe v1 failure' }
    : envelope === 'v2' ? { errors: [{ detail: 'Safe v2 failure' }] } : null });
}
async function run(relative, names, cases) {
  const Constructor = extract(relative, names);
  for (const status of statuses) for (const envelope of ['v1', 'v2', 'empty']) for (const item of cases) {
    const error = errorFor(status, envelope), app = fresh(Constructor, error);
    item.setup?.(app, error);
    await app[item.method](...(item.args || []));
    item.check(app);
    results.push({ file: root + relative, method: item.method, status, envelope, result: 'recovered' });
  }
}
async function main() {
  await run('local-auth/src/app/local-auth.component.ts', ['onLogin'], [{ method: 'onLogin', args: [{ preventDefault() {} }],
    setup(app) { app.form = { status: 'VALID', value: { username: 'person', password: 'synthetic' } }; app.isLoginDisabled = false; app.window = { location: { href: '' } }; },
    check(app) { assert.equal(app.isLoginDisabled, false); assert.match(app.loginMessage, /Refresh this page before trying again/); assert.equal(app.window.location.href, ''); },
  }]);
  await run('manage-users/src/app/manage-users.component.ts',
    ['genKey', 'revokeKey', 'updateUserSubmit', 'newUserSubmit', 'setUpdateMessage', 'setNewUserMessage', 'requestFailureMessage'],
    ['genKey', 'revokeKey', 'updateUserSubmit', 'newUserSubmit'].map(method => ({ method,
      args: method.endsWith('Key') ? ['target'] : [{ userid: 'target', username: 'new', name: 'Draft', email: '', passwords: { password: '' }, roles: [{ name: 'Researcher' }] }, true],
      setup(app) { app.currentUser = { id: 'target', token: 'unchanged' }; app.hideDetailsModal = app.hideNewUserModal = app.refreshUsers = () => assert.fail('must retain draft'); },
      check(app) { const value = method === 'newUserSubmit' ? app.newUserMsg : app.updateDetailsMsg; assert(value); assert.doesNotMatch(value, /^(Saving|Generating|Revoking)/); assert.equal(app.currentUser.token, 'unchanged'); },
    })));
  await run('manage-roles/src/app/manage-roles.component.ts', ['saveCurrentUser', 'setSaveMessage'], [{ method: 'saveCurrentUser',
    setup(app) { app.currentUser = { id: 'target', newRoles: [{ name: 'Admin', hasRole: true }], roles: ['Researcher'] }; app.hideDetailsModal = () => assert.fail('must retain modal'); },
    check(app) { assert(app.saveMsg); assert.doesNotMatch(app.saveMsg, /^Saving/); assert.deepEqual(app.currentUser.roles, ['Researcher']); },
  }]);
  await run('app-config/src/app/app-config.component.ts', ['onSubmit'], [{ method: 'onSubmit', args: [{ draft: true }],
    check(app) { assert.equal(app.formSaving, false); assert.equal(app.formSaveSuccessful, false); assert.equal(app.formSaveUnsuccessful, true); },
  }]);
  await run('report-config/src/app/report-config.component.ts', ['saveReport', 'previewReport', 'deleteReport', 'getErrorMessage'],
    ['saveReport', 'previewReport', 'deleteReport'].map(method => ({ method, args: method === 'deleteReport' ? [{ name: 'draft' }] : [],
      setup(app) { app.selectedReport = { name: 'draft' }; app.isNewReport = true; app.getErrorMessage = ConstructorErrorMessage; },
      check(app) { assert(app.errorMessage); if (method !== 'deleteReport') assert.equal(app[method === 'saveReport' ? 'isSaving' : 'isPreviewing'], false); },
    })));
  await run('named-query-editor/src/app/named-query-editor.component.ts', ['openQuery', 'save', 'asErrorMessage', 't'],
    ['openQuery', 'save'].map(method => ({ method, args: method === 'openQuery' ? ['missing'] : [],
      setup(app) { app.cloneQuery = x => x; app.validate = () => ({ valid: true }); app.canSave = true; app.sanitizeQuery = x => x; app.isNew = true; app.draft = { name: 'draft' }; app.isEditModalOpen = true; },
      check(app) { assert(app.error); assert.equal(app.isEditModalOpen, true); },
    })));
  await run('branding/src/app/branding-admin.component.ts', ['runMutation', 'handleMutationError', 'errorDetail'], [{ method: 'runMutation',
    args: ['save', 'branding-failed', null],
    setup(app, error) { app.inFlight = new Set(); app.isUnavailable = () => false; app.runMutationOriginal = app.runMutation; app.runMutation = () => app.runMutationOriginal('save', 'branding-failed', () => Promise.reject(error)); },
    check(app) { assert.equal(app.inFlight.size, 0); assert(app.error); },
  }]);
  await run('harvest-runs/src/app/harvest-runs.component.ts', ['loadRuns', 'selectRun', 'onEventPageChanged'], [
    { method: 'loadRuns', args: [1], setup(app) { app.filters = {}; }, check(app) { assert.equal(app.loadingRuns, false); assert(app.listError); } },
    { method: 'selectRun', args: ['run'], check(app) { assert.equal(app.loadingDetail, false); assert(app.detailError); assert.equal(app.selectedRun, null); } },
    { method: 'onEventPageChanged', args: [{ page: 2 }], setup(app) { app.selectedRunId = 'run'; }, check(app) { assert.equal(app.loadingDetail, false); assert(app.detailError); } },
  ]);
  await run('siem-admin/src/app/siem-admin.component.ts', ['loadConfig', 'save', 'testDestination', 'loadEvents', 'loadDelivery'], [
    { method: 'loadConfig', check(app) { assert.equal(app.loading, false); assert(app.loadError); } },
    { method: 'save', setup(app) { app.canSave = () => true; app.buildConfig = () => ({ draft: true }); }, check(app) { assert.equal(app.saving, false); assert(app.saveError); } },
    { method: 'testDestination', args: ['test'], setup(app) { app.draft = { destinations: [{ id: 'test' }] }; app.testingById = {}; app.testErrorById = {}; app.testStateById = {}; app.buildDestination = x => x; }, check(app) { assert.equal(app.testingById.test, false); assert(app.testErrorById.test); } },
    { method: 'loadEvents', args: [0], setup(app) { app.eventRequestId = 0; app.eventFilters = {}; }, check(app) { assert.equal(app.loadingEvents, false); assert(app.eventsError); } },
    { method: 'loadDelivery', args: [0], setup(app) { app.deliveryRequestId = 0; app.deliveryFilters = {}; }, check(app) { assert.equal(app.loadingDelivery, false); assert(app.deliveryError); } },
  ]);
  await run('record-audit/src/app/record-audit.component.ts', ['loadAuditTab', 'loadPermissionsTab', 'loadIntegrationTab'], [
    { method: 'loadAuditTab', setup(app) { app.auditTab = { filters: {} }; app.normalizedAuditWorkflowStateFilter = () => ''; }, check(app) { assert.equal(app.auditTab.loading, false); assert(app.auditTab.error); } },
    { method: 'loadPermissionsTab', setup(app) { app.permissionsTab = {}; }, check(app) { assert.equal(app.permissionsTab.loading, false); assert(app.permissionsTab.error); } },
    { method: 'loadIntegrationTab', setup(app) { app.integrationTab = { data: { summary: {} }, filters: {} }; app.normalizedIntegrationNameFilter = () => ''; }, check(app) { assert.equal(app.integrationTab.loading, false); assert(app.integrationTab.error); } },
  ]);
  await run('admin-vocabulary/src/app/admin-vocabulary.component.ts', ['loadVocabularyPage', 'openVocabulary', 'save', 'importRva'], [
    { method: 'loadVocabularyPage', setup(app) { app.listQuery = { searchTerm: '', sourceFilter: 'all', typeFilter: 'all' }; }, check(app) { assert(app.error); } },
    { method: 'openVocabulary', args: ['id'], check(app) { assert(app.error); } },
    { method: 'save', setup(app) { app.canSave = true; app.draft = { name: 'draft' }; }, check(app) { assert(app.error); assert.deepEqual(app.draft, { name: 'draft' }); } },
    { method: 'importRva', args: ['rva'], check(app) { assert.equal(app.isImportInProgress, false); assert(app.importStatusMessage); } },
  ]);
  await run('admin-figshare-vocabulary/src/app/admin-figshare-vocabulary.component.ts', ['loadSources', 'resyncSource', 'startImport'], [
    { method: 'loadSources', check(app) { assert.equal(app.sourcesLoading, false); assert(app.error); } },
    { method: 'resyncSource', args: [{ id: 'source' }], check(app) { assert.equal(app.busySourceId, ''); assert(app.error); } },
    { method: 'startImport', check(app) { assert(app.wizardError); } },
  ]);
  await run('record-search/src/app/record-search.component.ts', ['doSearch'], [{ method: 'doSearch', args: [null, false],
    setup(app) { app.params = { basicSearch: 'query' }; app.focusSearchMessage = () => {}; },
    check(app) { assert.equal(app.isSearching, false); assert(app.searchMsg); assert.equal(app.searchMsgType, 'danger'); },
  }]);

  // Confirm unchanged missing catches with the same rejected transport at both
  // revisions. They are explicit inherited counterexamples, not passing recovery.
  const inheritedCases = [
    { file: 'report/src/app/report.component.ts', names: ['gotoPage'], method: 'gotoPage', args: [2],
      setup(app) { app.initTracker = {}; app.reportService = app.recordService; app.getParams = () => ({}); }, check(app) { assert.equal(app.initTracker.resultsReturned, false); } },
    { file: 'deleted-records/src/app/deleted-records.component.ts', names: ['gotoPage'], method: 'gotoPage', args: [2],
      setup(app, error) { app.initTracker = {}; app.getDeletedRecords = () => Promise.reject(error); }, check(app) { assert.equal(app.initTracker.resultsReturned, false); } },
    { file: 'manage-users/src/app/manage-users.component.ts', names: ['refreshUsers'], method: 'refreshUsers',
      setup(app) { app.allUsers = ['old']; }, check(app) { assert.deepEqual(app.allUsers, ['old']); } },
    { file: 'manage-roles/src/app/manage-roles.component.ts', names: ['initComponent'], method: 'initComponent',
      check(app) { assert.equal(app.roles, undefined); } },
    { file: 'app-config/src/app/app-config.component.ts', names: ['initComponent'], method: 'initComponent',
      check(app) { assert.equal(app.fields, undefined); } },
  ];
  for (const item of inheritedCases) {
    const old = extract(item.file, item.names, true), current = extract(item.file, item.names);
    assert.equal(String(old.prototype[item.method]), String(current.prototype[item.method]), item.file + ' method changed');
    for (const status of [0, 403, 500]) for (const [version, Constructor] of [['baseline', old], ['current', current]]) {
      const error = errorFor(status, 'v1'), app = fresh(Constructor, error);
      item.setup?.(app, error);
      await assert.rejects(() => app[item.method](...(item.args || [])), e => e === error);
      item.check(app);
      inherited.push({ file: root + item.file, method: item.method, version, status, result: 'inherited missing recovery' });
    }
  }
  // The shared bootstrap never forwards request failure to initSubject. Observe
  // actual RxJS error delivery without provoking an unhandled-error process crash.
  const { config: rxConfig } = require(process.cwd() + '/node_modules/rxjs');
  const savedUnhandled = rxConfig.onUnhandledError;
  try {
    for (const version of ['baseline', 'current']) {
      const Config = extract('portal-ng-common/src/lib/config.service.ts', ['initConfig'], version === 'baseline');
      const app = new Config(), error = errorFor(403, 'v1');
      let emitted = false, reported;
      const initSubject = new Subject(); initSubject.subscribe(() => { emitted = true; });
      Object.assign(app, { http: { get: () => throwError(() => error) }, configUrl: '/config', csrfTokenUrl: '/csrf', emitConfig() { initSubject.next(true); } });
      rxConfig.onUnhandledError = e => { reported = e; };
      app.initConfig(); await new Promise(resolve => setTimeout(resolve, 10));
      assert.equal(reported, error); assert.equal(emitted, false);
      inherited.push({ file: root + 'portal-ng-common/src/lib/config.service.ts', method: 'initConfig', version, status: 403, result: 'unhandled RxJS error; init observers stay pending' });
    }
  } finally { rxConfig.onUnhandledError = savedUnhandled; }
  for (const baseline of [true, false]) {
    const Deleted = extract('deleted-records/src/app/deleted-records.component.ts', ['recordTableAction', 'confirmDestroyRecordModal'], baseline);
    for (const method of ['recordTableAction', 'confirmDestroyRecordModal']) {
      const app = new Deleted(); let refreshed = 0, hidden = 0;
      Object.assign(app, { recordService: { restoreDeletedRecord: async () => ({ status: false, message: 'Refused' }), destroyDeletedRecord: async () => ({ status: false, message: 'Refused' }) }, loggerService: logger,
        currentDestroyRecordModalOid: 'oid', currentDestroyRecordModalRevision: 1, currentPageNumber: 2,
        destroyRecordModal: { hide() { hidden++; } }, gotoPage: async () => { refreshed++; } });
      await app[method](...(method === 'recordTableAction' ? [null, { oid: 'oid', revision: 1 }, 'restore'] : [null]));
      assert.equal(refreshed, 1); assert.equal(hidden, method === 'confirmDestroyRecordModal' ? 1 : 0);
      assert.equal(app.error, undefined);
      ignoredResults.push({ version: baseline ? 'baseline' : 'current', method, result: 'Failed result logged then list refreshed; no failure message', refreshed, hidden });
    }
  }
  fs.writeFileSync(out, JSON.stringify({ node: process.version, proof: 'Pure extracted production-method probes with rejected request ports. HTTP status values are supplied; not every endpoint can emit every value. No new HTTP/browser/Mongo run claimed.', statuses, envelopes: ['v1', 'v2', 'empty'], recoveryObservations: results.length, inheritedObservations: inherited.length, ignoredResultObservations: ignoredResults.length, inputs: Object.fromEntries(inputs), results, inherited, ignoredResults }, null, 2) + '\n');
  console.log(`${results.length} recovered consumer observations; ${inherited.length} baseline/current inherited-error observations; ${ignoredResults.length} inherited ignored-result observations`);
}
function ConstructorErrorMessage(error) { return error.error?.message || error.error?.errors?.[0]?.detail || error.message; }
main().catch(error => { console.error(error); process.exitCode = 1; });
