const assert = require('node:assert/strict');
import { resolveExtensionExport } from '@researchdatabox/redbox-core/extensions';
import { hasRuntimeExtensionExport } from '../src/utils/v6-checks';
const runExportMatrix = require('./support/export-matrix.cjs');

describe('extension export declaration resolution', function () {
  it('agrees with Node and the application host across the export matrix', function () {
    const result = runExportMatrix(hasRuntimeExtensionExport, resolveExtensionExport);
    assert.ok(result.cases > 1000);
    assert.deepEqual(result.mismatches, []);
    // Resolution and execution are separate: a not-yet-built target is valid.
    assert.ok(result.rows.some((row: any) => row.preflight && row.node.import.exists === false));
    // The host imports CJS too; a require-only declaration cannot expose a hook.
    assert.ok(result.rows.some((row: any) => !row.preflight && row.node.require.runtime));
  }).timeout(30000);
});
