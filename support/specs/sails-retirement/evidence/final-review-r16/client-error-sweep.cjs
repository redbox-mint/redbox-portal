'use strict';
// Reconciles the source-reviewed error paths with R15's exhaustive initiator
// inventory. It does not turn source review into per-endpoint HTTP execution.
const fs = require('node:fs');
const cp = require('node:child_process');
const crypto = require('node:crypto');
const assert = require('node:assert/strict');
const path = require('node:path');
const previous = path.resolve(__dirname, '../final-review-r15');
const read = name => JSON.parse(fs.readFileSync(path.join(previous, name), 'utf8'));
const sha = file => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const contracts = read('angular-contracts.json');
const source = read('angular-source.json');
const network = read('angular-network.json');
const legacy = read('legacy-client-contracts.json');
const probes = JSON.parse(fs.readFileSync(path.join(__dirname, 'client-error-results.json'), 'utf8'));
const verified = new Map();
const reviewedChanges = [];
for (const input of [...source.inputs, ...contracts.sharedSources, ...legacy.sourceFiles]) {
  if (!input.sha256) continue;
  const actual = sha(input.file);
  if (input.file === 'angular/projects/researchdatabox/local-auth/src/app/local-auth.component.ts') {
    assert.notEqual(actual, input.sha256);
    reviewedChanges.push({ file: input.file, incomingSha256: input.sha256, currentSha256: actual, reason: 'R16-01 login HTTP rejection recovery, verified by browser and native-session probes.' });
  } else assert.equal(actual, input.sha256, input.file);
  verified.set(input.file, actual);
}
for (const row of contracts.rows) for (const server of row.server) {
  assert.equal(sha(server.file), server.sha256, server.file);
  verified.set(server.file, server.sha256);
}
const groups = [
  [1, 18, 'Figshare administration catches read/mutation failures, retains wizard drafts and finalizes busy state.'],
  [19, 25, 'Vocabulary administration catches list/detail/write/import/sync failure; retains drafts and completes import state.'],
  [26, 27, 'App-config crosswalk binding field catches catalogue rejection and displays loadError, clearing loading.'],
  [28, 34, 'Branding load catches failure; runMutation catches all statuses and clears inFlight in finally; 409/413 have specific guidance.'],
  [35, 41, 'Dashboard editor converts v2 errors into DashboardConfigApiError; load/save/copy catches retain drafts and finalize flags.'],
  [42, 43, 'Form initial load catches rejection and dispatches loadInitialDataFailure; form/metadata 404 is missing-record.'],
  [44, 49, 'Typeahead/tree consumers catch failure, show a search error and clear loading; rejected tree-cache entries are evicted.'],
  [50, 52, 'Harvest list/detail/events catch failure, populate visible error and clear loading in finally.'],
  [53, 58, 'Named-query list/detail/mutations catch failure, retain draft/modal and clear pending state.'],
  [59, 60, 'App-config save catches rejection and sets unsuccessful; finally clears formSaving. Initial read exception is listed separately.'],
  [61, 62, 'Shared bootstrap has inherited missing error callback; it is not a passing recovery path.'],
  [63, 79, 'Record read consumers vary: audit/selector/integration/graph/workspace use catches/finalization or fallback; dashboard/deleted/export initialization exceptions and quiet fallbacks are listed separately.'],
  [80, 84, 'Record mutations/preflight normalize HTTP failures into RecordActionResult; form save/delete UI preserves failed/unknown outcomes. Deleted-record list ignores failed typed results (inherited note).'],
  [85, 86, 'Report initial/result loads propagate rejection without recovery (inherited); template-import failure is caught separately.'],
  [87, 93, 'Translation edits/language changes catch failure and clear saving; read failures use inherited empty/default fallbacks and console diagnostics.'],
  [94, 108, 'R15 users/roles catches cover typed mutation errors, preserve edits and complete pending text. Candidate/link/audit/enable/disable siblings catch and finalize. Initial identity/list exceptions are listed separately.'],
  [109, 110, 'Workspace field catches catalogue failure, clears loading and uses configured defaults with a loadError.'],
  [111, 112, 'Search catches rejection, clears isSearching and displays danger message; type list load has its own catch.'],
  [113, 118, 'Report editor catches list/definition/write/preview failures; finally clears saving/previewing.'],
  [119, 123, 'SIEM config/test/events/delivery catch failure, retain draft and clear their respective pending flags.'],
];
const inheritedPending = {
  59: 'AppConfigComponent.initComponent has no catch.',
  61: 'ConfigService.initConfig has no RxJS error callback; dependent initialization stays pending.',
  62: 'Same chained bootstrap subscription as ANG-061.',
  63: 'Dashboard initWorkflowSteps propagates rejection to uncaught initialization.',
  72: 'RecordSelector catches; Dashboard initStep/grouped loads propagate. Paging finally clears its pending flag but does not show the error.',
  73: 'DeletedRecordsComponent.gotoPage leaves resultsReturned false.',
  74: 'Export and deleted-record initialization propagate failed type-list reads.',
  76: 'Dashboard initView propagates failed dashboard-type read.',
  77: 'Dashboard initDashboardView propagates failed view read.',
  85: 'ReportComponent.initComponent propagates failed definition load.',
  86: 'ReportComponent.gotoPage leaves resultsReturned false.',
  94: 'Dashboard initialization propagates getInfo rejection; IntegrationStatus catches the same operation.',
  96: 'ManageUsersComponent.refreshUsers propagates failure and leaves old list.',
  101: 'ManageUsers/ManageRoles initial role read propagates failure.',
};
const quietFallback = {
  64: 'Metadata retriever logs failure without publishing a field event; behavior runner returns a failed behavior result.',
  66: 'PDF list logs failure and displays an empty attachment list.',
  87: 'Translation entry load logs failure and resets entries/view/categories to empty.',
  89: 'Translation language load logs failure and resets languages to empty.',
  90: 'Translation bundle reads use logged/default fallbacks; write callers retain their own catches.',
};
const ignoredTypedResult = new Set([82, 83, 84]);
const unselected = new Set([12, 32, 43, 65, 79, 110]);
const rows = contracts.rows.map(row => {
  const number = Number(row.id.slice(4));
  const group = groups.find(([from, to]) => number >= from && number <= to);
  assert(group, row.id);
  const direct = row.consumers.filter(edge => edge.callee === row.owner);
  assert.equal(direct.length === 0, unselected.has(number), row.id + ' selection changed');
  return {
    id: row.id, file: row.file, line: row.line, method: row.method,
    consumerMethods: [...new Map(direct.map(edge => [edge.caller, { file: edge.file, line: edge.line, method: edge.caller.split('#')[1] }])).values()],
    nativeRoutes: row.server.map(server => server.id),
    sourceConclusion: number === 95 ? 'R16-01: LocalAuth catches typed/empty rejected responses, re-enables login and shows safe detail plus refresh guidance for a potentially destroyed session. Normal credential denial and successful redirect are preserved.' : group[2],
    disposition: unselected.has(number) ? 'public unselected helper: rejection propagates to extension caller'
      : inheritedPending[number] ? 'B-11: unchanged incomplete rejection recovery'
      : quietFallback[number] ? 'B-12: unchanged quiet read fallback'
      : ignoredTypedResult.has(number) ? 'B-13: unchanged deleted-record consumer ignores failed typed result'
      : 'recovery/typed completion in selected consumer',
    exception: inheritedPending[number] || quietFallback[number] || (ignoredTypedResult.has(number)
      ? 'Form delete handles typed result; deleted-record restore/destroy only log it and refresh.' : null),
    execution: 'Source review; only methods in client-error-results.json are newly executed by the parent probe.',
  };
});
const dispositions = {};
for (const row of rows) dispositions[row.disposition] = (dispositions[row.disposition] || 0) + 1;
// Retain actual baseline/current equality evidence for every unchanged fallback
// consumer discussed in the backlog; the R15-edited users/roles files are checked
// method-by-method in client-error-probes.cjs rather than by whole-file equality.
const unchangedFiles = [
  'report/src/app/report.component.ts',
  'deleted-records/src/app/deleted-records.component.ts', 'dashboard/src/app/dashboard.component.ts',
  'export/src/app/export.component.ts', 'app-config/src/app/app-config.component.ts',
  'portal-ng-common/src/lib/config.service.ts', 'portal-ng-common/src/lib/base.component.ts',
  'portal-ng-common/src/lib/record.service.ts', 'form/src/app/component/record-metadata-retriever.component.ts',
  'form/src/app/component/pdf-list.component.ts', 'translation/src/app/translation.component.ts',
].map(relative => {
  const file = 'angular/projects/researchdatabox/' + relative;
  const baseline = cp.execFileSync('git', ['show', 'a49366803:' + file]);
  assert.equal(crypto.createHash('sha256').update(baseline).digest('hex'), sha(file), file);
  return { file, baselineAndCurrentSha256: sha(file) };
});
const result = {
  featureBase: 'a49366803164429f9d8bdd249dadcdf856c9d13e',
  reviewedHead: cp.execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(),
  scope: 'All shipped built-in browser initiators; finite source review plus explicitly bounded rejected-port probes. No arbitrary institution-hook coverage or new deployed/browser qualification claimed.',
  compatibilitySource: 'support/wiki/V6-Client-Compatibility.md',
  statusReview: [
    { statuses: [401, 403], change: 'Authentication, brand membership, ACL/admin and CSRF denial.', conclusion: 'Modern catches/typed results handle either code. No shipped catch requires only 403. Older uncaught readers also rejected baseline auth/transport failures; B-11 is retained explicitly. Fresh same-origin config/CSRF bootstrap remains public.' },
    { statuses: [404], change: 'Missing form/record targets and unregistered actions.', conclusion: 'Form load dispatches missing-record; editor/selector catches finish with error. Existing report definition failure was already rejected (previously 500), so its missing catch remains B-11.' },
    { statuses: [400, 409, 413, 415, 422], change: 'Strict scalar validation, identity input, revision conflicts and upload/parser limits.', conclusion: 'Selected editors catch all rejection shapes or normalize typed outcomes. Shipped normal pagination/date/identity builders send declared scalar values. No new realistic ordinary input rejection with stranded state was verified.' },
    { statuses: [405, 410], change: 'POST logout/unsafe HEAD; retired virtual socket HTTP.', conclusion: 'All three shipped logout forms use POST+CSRF. Shipped progress uses grants/direct Socket.IO, never retired subscribe/unsubscribe HTTP; 401/403 disconnect and other grant failures retry with fresh authorization.' },
    { statuses: [0, 500, 503], change: 'Network/backend/sanitized failures; provider failures may become typed errors.', conclusion: 'Envelope-independent catches finalize without claiming rollback; R15 users/roles fixes cover newly typed mutation rejection. R16 fixes local-login recovery after the now-awaited audit can reject500. Existing legacy unhandled paths/fallbacks are separately retained.' },
    { envelopes: ['v1 message', 'v2 errors[].detail/title/code and meta', 'empty/non-JSON'], change: 'Sanitized messages and versioned errors.', conclusion: 'No selected error consumer depends on removed redundant errors[].status. Generic fallback detail may be less specific (existing R14 P3); pending flags still settle where recovery is implemented.' },
  ],
  counts: { projects: source.projects.length, productionTypeScript: contracts.counts.productionTypeScript,
    productionTemplates: contracts.counts.productionTemplates, sharedPackageTypeScript: network.counts.sharedPackageTypeScript,
    httpCallSites: rows.length, serviceOwners: new Set(contracts.rows.map(row => row.file)).size,
    unmatched: contracts.rows.filter(row => !row.server.length).length, sourceHashInputsReverified: verified.size,
    supplementalResourceProtocolSites: network.rows.length, explicitNoHttpSites: 54,
    legacyEntrypointFiles: legacy.sourceFiles.length, legacyRequestInitiators: legacy.rows.length,
    recoveryMethodsProbed: new Set(probes.results.map(row => row.file + '#' + row.method)).size,
    recoveryObservations: probes.recoveryObservations, inheritedObservations: probes.inheritedObservations,
    inheritedIgnoredResultObservations: probes.ignoredResultObservations,
    dispositions },
  rows,
  supplemental: network.rows.map(row => ({ id: row.id, file: row.file, line: row.line, kind: row.kind,
    recovery: /no-http$/.test(row.kind) ? 'No HTTP; no status/envelope consumer.'
      : ['tus-installation', 'companion-installation'].includes(row.kind) ? 'Installed Uppy owns transfer/provider errors and retry UI; widgets append attachments only on upload-success; both Tus and outer Companion CSRF are wired.'
      : row.kind.includes('dynamic-native') ? 'Import rejection reaches form failure, dashboard settings-unavailable or report template catch; failed import cache is evicted.'
      : row.kind === 'i18next-backend' ? 'Installed backend uses failedLoading/fallback/retry; no portal JSON mutation response.'
      : 'Browser/vendor resource, import or navigation error; no JSON success-envelope dependency. Static paths retain baseline status behavior.' })),
  legacy: legacy.rows.map(row => ({ id: row.id, source: row.source, statusHandling: row.statusHandling, disposition: row.disposition })),
  unchangedFiles, reviewedChanges,
  limitations: ['All statuses in the pure probes are injected; not every endpoint can emit all statuses.',
    'Recovered means the specifically asserted method state completed. It does not mean all legacy clients now show errors or redirect to login.',
    'R16 changes local-login runtime code; full final-tree qualification is recorded separately in qualification.json.'],
};
fs.writeFileSync(path.join(__dirname, 'client-error-sweep.json'), JSON.stringify(result, null, 2) + '\n');
console.log(JSON.stringify(result.counts, null, 2));
