const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync, spawnSync } = require('node:child_process');
const test = require('node:test');

const repositoryRoot = execFileSync('git', ['rev-parse', '--show-toplevel'], {
  encoding: 'utf8'
}).trim();
const script = path.join(__dirname, 'prepare-report.cjs');

function temporaryReport(extension, contents) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'redbox-codecov-'));
  const report = path.join(directory, `coverage.${extension}`);
  fs.writeFileSync(report, contents);
  return report;
}

test('prefixes package-relative LCOV source paths', () => {
  const report = temporaryReport('info', 'TN:\nSF:src/services/figshare-v2/http.ts\nDA:1,1\nend_of_record\n');
  execFileSync(process.execPath, [script, report, 'packages/redbox-core'], {
    cwd: path.join(repositoryRoot, 'packages/redbox-core')
  });
  assert.match(fs.readFileSync(report, 'utf8'), /^SF:packages\/redbox-core\/src\/services\/figshare-v2\/http\.ts$/m);
});

test('converts absolute Istanbul paths to repository-relative paths', () => {
  const source = path.join(
    repositoryRoot,
    'angular/projects/researchdatabox/form/src/app/form.service.ts'
  );
  const report = temporaryReport('json', JSON.stringify({ [source]: { path: source, statementMap: {} } }));
  execFileSync(process.execPath, [script, report, 'angular']);
  const prepared = JSON.parse(fs.readFileSync(report, 'utf8'));
  const canonical = 'angular/projects/researchdatabox/form/src/app/form.service.ts';
  assert.deepEqual(Object.keys(prepared), [canonical]);
  assert.equal(prepared[canonical].path, canonical);
});

test('excludes generated sources while retaining tracked LCOV records', () => {
  const report = temporaryReport(
    'info',
    'SF:src/does-not-exist.ts\nend_of_record\nSF:src/services/figshare-v2/http.ts\nend_of_record\n'
  );
  const result = spawnSync(process.execPath, [script, report, 'packages/redbox-core'], {
    encoding: 'utf8'
  });
  assert.equal(result.status, 0);
  assert.doesNotMatch(fs.readFileSync(report, 'utf8'), /does-not-exist/);
  assert.match(result.stderr, /Excluded 1 generated or untracked coverage sources/);
});
