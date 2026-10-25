'use strict';
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const dir = __dirname;
const read = name => JSON.parse(fs.readFileSync(path.join(dir, name), 'utf8'));
const inventory = JSON.parse(fs.readFileSync(path.join(dir, '../final-review-r13/http-acceptance.json'), 'utf8'));
const records = read('records-differential.json');
const identity = read('identity-differential.json');
const parent = read('parent-differential.json');
const entrypoints = read('entrypoints-differential.json');
const rows = [...records.routes, ...identity.routes, ...parent.rows];
const ids = rows.map(row => row.id);
assert.equal(rows.length, 335);
assert.equal(new Set(ids).size, 335);
assert.deepEqual([...ids].sort(), inventory.rows.map(row => row.id).sort());
for (const row of [...rows, ...entrypoints.entries]) {
  assert.equal(Object.keys(row.dimensions).length, 7, row.id);
  for (const value of Object.values(row.dimensions)) {
    assert(value.conclusion?.trim(), row.id);
    assert(value.provenance?.length, row.id);
  }
}
const fixedRoutes = [
  ...records.fixed_findings.flatMap(finding => finding.routes),
  ...identity.findings.flatMap(finding => finding.routes),
  ...parent.rows.filter(row => row.findings.length).map(row => row.id),
];
const p3 = [...records.record_only_p3, ...identity.observations.filter(item => item.priority === 'P3')];
const summary = {
  baseline: inventory.baseline,
  incomingHead: '9bb858218075dec4d77c1302063c134d8f3133f2',
  runtimeRevision: 'fb08b54473e21f61d8fd4fd431ca47a00e7a69b0',
  finalRuntimeAndTestRevision: 'c31ac286281dfa3bf8efa1bc2b122cdc430cf07b',
  http: {
    routes: rows.length,
    dimensionsPerRoute: 7,
    populatedDimensionCells: rows.length * 7,
    scopes: [
      { ledger: 'records-differential.json', routes: 142, cells: 994, classAFamilies: 5 },
      { ledger: 'identity-differential.json', routes: 119, cells: 833, classAFamilies: 5 },
      { ledger: 'parent-differential.json', routes: 74, cells: 518, classAFamilies: 2 },
    ],
    fixedRouteCount: new Set(fixedRoutes).size,
    fixedRoutes: [...new Set(fixedRoutes)].sort(),
    noAdditionalClassAP1P2Routes: rows.length - new Set(fixedRoutes).size,
    newNativeHttpCases: 72,
    newProductionBindingCases: 2,
    nativeExpectedIncomingFailures: 40,
    bindingExpectedIncomingFailures: 2,
    unchangedIncomingControls: 32,
    actualBaselineMethodObservations: 31,
    finalCombinedFocusedPassed: 138,
    caveat: 'Every row has static comparison. Focused baseline method probes do not run Sails HTTP; incoming-module loaders retain current shared dependencies. These are not 335 executed route comparisons.',
  },
  nonHttp: {
    entries: entrypoints.entries.length,
    populatedDimensionCells: entrypoints.entries.length * 7,
    categories: entrypoints.counts,
    focusedTests: 339,
    actualMethodAndCliProbes: 64,
    newClassAP1P2: 0,
  },
  findings: { classA: 12, P1: 2, P2: 10, fixed: 12, sourceOnlyP3Groups: p3.length, inheritedBacklogAdditions: ['B-08', 'B-09'], wrongR13Fixes: [] },
  p3: p3.map(item => ({ id: item.id, routes: item.routes, conclusion: item.conclusion })),
  totalPopulatedDimensionCells: (rows.length + entrypoints.entries.length) * 7,
};
assert.equal(summary.http.fixedRouteCount, 19);
assert.equal(summary.nonHttp.entries, 189);
assert.equal(summary.findings.sourceOnlyP3Groups, 10);
fs.writeFileSync(path.join(dir, 'differential-summary.json'), JSON.stringify(summary, null, 2) + '\n');
console.log(JSON.stringify({ http: summary.http.routes, httpCells: summary.http.populatedDimensionCells, nonHttp: summary.nonHttp.entries, nonHttpCells: summary.nonHttp.populatedDimensionCells, classA: summary.findings.classA, p3Groups: p3.length }));
