const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { createHash } = require('node:crypto');
const { test } = require('node:test');
const { normalizeSourcePath, parseLcov, compareReports } = require('./ci-coverage-compare.cjs');

const helper = path.join(__dirname, 'ci-coverage-compare.cjs');
const record = (source = 'src/service.ts', data = 'DA:1,1') => `TN:suite\nSF:${source}\n${data}\nend_of_record\n`;
const input = (text, overrides = {}) => ({ text, root: '/repo', revision: 'same-immutable-revision', sourceMaps: 'verified', ...overrides });
const compare = (before, after, baseline = {}, candidate = {}) => compareReports(input(before, baseline), input(after, candidate));

test('unchanged identities/counts are observations with provenance, never an equivalence claim', () => {
  const data = 'FN:2,4,work\nFNDA:3,work\nDA:2,3,checksum\nDA:4,0\nBRDA:2,0,0,3\nBRDA:2,0,1,-\nLF:2\nLH:1\nFNF:1\nFNH:1\nBRF:2\nBRH:1';
  const result = compare(record('/repo/src/service.ts', data), record('./src/service.ts', data).replace('TN:suite', 'TN:other'));
  assert.equal(result.exitCode, 0);
  assert.equal(result.status, 'no-observed-loss');
  assert.equal(result.equivalenceClaim, false);
  assert.notEqual(result.inputs.baseline.sha256, result.inputs.candidate.sha256);
  assert.equal(result.files[0].source, 'src/service.ts');
  assert.deepEqual(result.files[0].metrics.functions.entries[0].identity, { line: 2, endLine: 4, name: 'work' });
  assert.equal(result.files[0].metrics.branches.entries[1].candidate.count, null);
  assert.deepEqual(result.summary.lines.baseline, { total: 2, covered: 1, percent: 50 });
});

test('equal overall percentages cannot mask cross-file or same-file coverage loss', () => {
  for (const [before, after] of [
    [record('src/a.ts', 'DA:1,1') + record('src/b.ts', 'DA:1,0'), record('src/a.ts', 'DA:1,0') + record('src/b.ts', 'DA:1,1')],
    [record('src/a.ts', 'DA:1,1\nDA:2,0'), record('src/a.ts', 'DA:1,0\nDA:2,1')],
  ]) {
    const result = compare(before, after);
    assert.equal(result.exitCode, 1);
    assert.equal(result.status, 'coverage-loss');
    assert.equal(result.summary.lines.baseline.percent, result.summary.lines.candidate.percent);
    assert.equal(result.summary.lines.coverageRegressions, 1);
    assert.equal(result.summary.lines.countDecreases, 1);
    assert.equal(result.files[0].metrics.lines.entries[0].coverageLost, true);
  }
});

test('function names, start/end lines and full branch identities are not aggregate counts', () => {
  const result = compare(
    record('src/a.ts', 'FN:1,5,work\nFNDA:2,work\nBRDA:2,0,0,1\nBRDA:2,1,0,1'),
    record('src/a.ts', 'FN:1,6,renamed\nFNDA:2,renamed\nBRDA:2,0,0,1\nBRDA:2,1,1,1'),
  );
  assert.equal(result.exitCode, 1);
  assert.equal(result.summary.functions.removed, 1);
  assert.equal(result.summary.functions.added, 1);
  assert.equal(result.summary.branches.removed, 1);
  assert.equal(result.summary.branches.added, 1);
  assert.equal(result.summary.functions.baseline.percent, 100);
  assert.equal(result.summary.functions.candidate.percent, 100);
  const entries = result.files[0].metrics.functions.entries;
  assert.ok(entries.some(entry => entry.change === 'removed' && entry.identity.endLine === 5));
  assert.ok(entries.some(entry => entry.change === 'added' && entry.identity.name === 'renamed'));
  for (const next of ['FN:2,5,work', 'FN:1,6,work']) {
    const changed = compare(record('src/a.ts', 'FN:1,5,work\nFNDA:2,work'), record('src/a.ts', `${next}\nFNDA:2,work`));
    assert.equal(changed.summary.functions.removed, 1);
  }
});

test('individual function and branch coverage losses fail despite compensating gains', () => {
  const result = compare(
    record('src/a.ts', 'FN:1,a\nFN:2,b\nFNDA:1,a\nFNDA:0,b\nBRDA:1,0,0,1\nBRDA:1,0,1,0'),
    record('src/a.ts', 'FN:1,a\nFN:2,b\nFNDA:0,a\nFNDA:1,b\nBRDA:1,0,0,-\nBRDA:1,0,1,1'),
  );
  assert.equal(result.exitCode, 1);
  assert.equal(result.summary.functions.coverageRegressions, 1);
  assert.equal(result.summary.branches.coverageRegressions, 1);
  assert.equal(result.summary.functions.baseline.percent, result.summary.functions.candidate.percent);
  assert.equal(result.summary.branches.baseline.percent, result.summary.branches.candidate.percent);
});

test('positive hit count decreases fail and preserve exact counts in every metric', () => {
  const result = compare(
    record('src/a.ts', 'DA:1,5\nFN:1,work\nFNDA:5,work\nBRDA:1,0,0,5'),
    record('src/a.ts', 'DA:1,2\nFN:1,work\nFNDA:2,work\nBRDA:1,0,0,2'),
  );
  assert.equal(result.exitCode, 1);
  for (const kind of ['lines', 'functions', 'branches']) {
    assert.equal(result.summary[kind].countDecreases, 1);
    assert.equal(result.summary[kind].coverageRegressions, 0);
    assert.equal(result.summary[kind].candidate.percent, 100);
    assert.deepEqual(result.files[0].metrics[kind].entries[0].baseline.count, 5);
    assert.deepEqual(result.files[0].metrics[kind].entries[0].candidate.count, 2);
  }
});

test('whole source additions/removals and uncovered inventory are explicit and cannot silently pass', () => {
  const result = compare(record('src/old.ts', 'DA:1,0'), record('src/new.ts', 'DA:1,1'));
  assert.equal(result.exitCode, 1);
  assert.equal(result.summary.lines.removed, 1);
  assert.equal(result.summary.lines.added, 1);
  assert.deepEqual(result.files.map(file => file.presence), ['added', 'removed']);
  assert.equal(result.files[1].metrics.lines.candidate.percent, null);
  assert.equal(result.files[1].metrics.lines.entries[0].candidate, null);
  const added = compare(record(), record() + record('src/uncovered.ts', 'DA:1,0'));
  assert.equal(added.exitCode, 1);
  assert.equal(added.summary.lines.addedUncovered, 1);
  const improved = compare(record(), record('src/service.ts', 'DA:1,2') + record('src/new.ts', 'DA:1,1'));
  assert.equal(improved.exitCode, 0);
  assert.equal(improved.status, 'changed-no-observed-loss');
  assert.equal(improved.equivalenceClaim, false);
});

test('BRDA dash stays distinct from zero while representing an uncovered branch', () => {
  const result = compare(record('a.ts', 'BRDA:1,0,0,-'), record('a.ts', 'BRDA:1,0,0,0'));
  assert.equal(result.exitCode, 0);
  assert.equal(result.status, 'changed-no-observed-loss');
  assert.equal(result.summary.branches.countChanges, 1);
  assert.deepEqual(result.files[0].metrics.branches.entries[0].baseline, { count: null });
  assert.deepEqual(result.files[0].metrics.branches.entries[0].candidate, { count: 0 });
  assert.equal(result.summary.branches.baseline.percent, 0);
});

test('path normalization confines absolute and relative sources without guessing prefixes', () => {
  for (const [source, root, expected] of [
    ['/opt/project/packages/core/src/a.ts', '/opt/project', 'packages/core/src/a.ts'],
    ['./src/../src/a.ts', '/repo', 'src/a.ts'],
    ['src\\folder\\a.ts', '/repo', 'src/folder/a.ts'],
    ['c:\\repo\\src\\a.ts', 'C:\\repo', 'src/a.ts'],
    ['src/a.ts', 'C:/repo', 'src/a.ts'],
    ['/repo with spaces/src/a.ts', '/repo with spaces/', 'src/a.ts'],
  ]) assert.equal(normalizeSourcePath(source, root), expected);
  for (const source of ['../escape.ts', 'src/../../escape.ts', '/repository/a.ts', '/repo-other/a.ts',
    '/etc/passwd', '/repo', '.', 'src/', 'file:///repo/a.ts', 'webpack:///src/a.ts',
    '//server/repo/a.ts', 'C:a.ts', 'D:/repo/a.ts', 'src/a.ts?query', 'src/a.ts#fragment', '\0bad']) {
    assert.throws(() => normalizeSourcePath(source, '/repo'), undefined, source);
  }
  assert.throws(() => normalizeSourcePath('a.ts', 'relative/root'), /root must be absolute/);
  assert.throws(() => normalizeSourcePath('D:/repo/a.ts', 'C:/repo'), /different filesystem root/);
  assert.throws(() => normalizeSourcePath('/repo/a.ts', 'C:/repo'), /different filesystem root/);
  assert.throws(() => normalizeSourcePath(`${process.cwd()}/C:/repo/a.ts`, 'C:/repo'), /different filesystem root/);
  assert.throws(() => normalizeSourcePath('C:/repo/a.ts', 'C:/Repo'), /escapes/);
  const result = compare(record('/first/src/a.ts'), record('/second/src/a.ts'), { root: '/first' }, { root: '/second' });
  assert.equal(result.exitCode, 0);
  assert.equal(result.files.length, 1);
});

test('duplicate normalized source paths, tests, lines, function names and branches are rejected', () => {
  for (const report of [
    record('src/a.ts') + record('/repo/src/a.ts'),
    record('src/a.ts') + record('src/./a.ts'),
    record() + record().replace('TN:suite', 'TN:shard'),
    record('a.ts', 'DA:1,1\nDA:01,2'),
    record('a.ts', 'FN:1,work\nFN:2,work\nFNDA:1,work'),
    record('a.ts', 'FN:1,work\nFNDA:1,work\nFNDA:1,work'),
    record('a.ts', 'BRDA:1,0,0,1\nBRDA:1,00,0,1'),
    record('a.ts', 'DA:1,1\nLF:1\nLF:1'),
  ]) assert.throws(() => parseLcov(report, '/repo'), /duplicate/);
});

test('malformed or unsupported reports fail closed, with no partial comparison', () => {
  const malformed = [
    '', ' \n', 'TN:empty\n', 'SF:a.ts\nDA:1,1\n', 'DA:1,1\nend_of_record',
    'end_of_record', 'SF:a.ts\nSF:b.ts\nDA:1,1\nend_of_record',
    record('a.ts', ''), record('a.ts', 'DA:0,1'), record('a.ts', 'DA:1,-1'),
    record('a.ts', 'DA:1,1.5'), record('a.ts', 'DA:1,NaN'), record('a.ts', 'DA:1,Infinity'),
    record('a.ts', 'DA:1,9007199254740992'), record('a.ts', 'DA:1,1,'), record('a.ts', 'DA:1,1,x,y'),
    record('a.ts', 'FN:1,work'), record('a.ts', 'FNDA:1,work'),
    record('a.ts', 'FN:5,2,work\nFNDA:1,work'),
    record('a.ts', 'FN:1,work\nFNDA:-1,work'), record('a.ts', 'BRDA:1,0,0'),
    record('a.ts', 'BRDA:1,0,0,no'), record('a.ts', 'BRDA:1,name,0,1'),
    record('a.ts', 'DA:1,1\nLF:2'), record('a.ts', 'DA:1,1\nLH:0'),
    record('a.ts', 'FN:1,f\nFNDA:1,f\nFNH:0'), record('a.ts', 'BRDA:1,0,0,-\nBRH:1'),
    record('a.ts', 'DA:1,1\nFNL:0,1,2'), record('a.ts', 'DA:1,1\nVER:abc'),
    record('a.ts', 'DA:1,1\nTN:wrong-place'),
    record('a.ts', 'FN:1,bad\0name\nFNDA:1,bad\0name'),
    record('a.ts', 'DA:1,\r1'),
  ];
  for (const text of malformed) {
    const result = compare(record(), text);
    assert.equal(result.exitCode, 2, text);
    assert.equal(result.status, 'invalid-input', text);
    assert.equal(result.comparisonPerformed, false, text);
    assert.deepEqual(result.files, [], text);
    assert.ok(result.errors.length > 0, text);
    assert.equal(result.summary, undefined, text);
  }
});

test('record order, CRLF, FNDA before FN and commas in function names are supported', () => {
  const before = record('a.ts', 'FNDA:2,work,with,commas\nFN:1,work,with,commas\nDA:2,0\nDA:1,2');
  const after = record('a.ts', 'DA:1,2\nDA:2,0\nFN:1,work,with,commas\nFNDA:2,work,with,commas').replaceAll('\n', '\r\n');
  const result = compare(before, after);
  assert.equal(result.exitCode, 0);
  assert.equal(result.status, 'no-observed-loss');
  assert.equal(result.files[0].metrics.functions.entries[0].identity.name, 'work,with,commas');
});

test('missing or differing revision/source-map attestations cannot yield a successful acceptance', () => {
  for (const [baseline, candidate, reason] of [
    [{ revision: null }, { revision: null }, /revision missing/],
    [{ revision: 'before' }, { revision: 'after' }, /revisions differ/],
    [{ sourceMaps: 'unknown' }, {}, /source-map provenance is unknown/],
    [{}, { sourceMaps: 'invalid' }, /source-map provenance is invalid/],
    [{ sourceMaps: 'not-used' }, {}, /source-map provenance differs/],
  ]) {
    const result = compare(record(), record(), baseline, candidate);
    assert.equal(result.exitCode, 2);
    assert.equal(result.comparisonPerformed, true);
    assert.equal(result.status, 'inconclusive');
    assert.equal(result.equivalenceClaim, false);
    assert.ok(result.reasons.some(message => reason.test(message)));
  }
  assert.equal(compare(record(), record(), { sourceMaps: 'not-used' }, { sourceMaps: 'not-used' }).exitCode, 0);
  const loss = compare(record(), record('src/service.ts', 'DA:1,0'), { revision: 'old' }, { revision: 'new' });
  assert.equal(loss.exitCode, 1);
  assert.ok(loss.reasons.some(message => /revisions differ/.test(message)));
});

test('changed/missing line checksums are reported as source uncertainty, not inferred remapping', () => {
  for (const next of ['DA:1,1,new', 'DA:1,1']) {
    const result = compare(record('a.ts', 'DA:1,1,old'), record('a.ts', next));
    assert.equal(result.exitCode, 2);
    assert.equal(result.files[0].metrics.lines.entries[0].checksumChanged, true);
    assert.ok(result.reasons.some(message => /checksum/.test(message)));
  }
  const unmapped = compare(record('src/a.ts'), record('dist/a.js'));
  assert.equal(unmapped.exitCode, 1);
  assert.deepEqual(unmapped.files.map(file => file.source), ['dist/a.js', 'src/a.ts']);
});

function fixture(t) {
  // Tests write only disposable local fixtures. The helper itself writes stdout only.
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'redbox-coverage-compare-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const baseline = path.join(directory, 'baseline.lcov');
  const candidate = path.join(directory, 'candidate.lcov');
  fs.writeFileSync(baseline, record());
  fs.writeFileSync(candidate, record());
  const args = ['--baseline', baseline, '--candidate', candidate];
  const provenance = ['--baseline-revision', 'revision', '--candidate-revision', 'revision',
    '--baseline-source-maps', 'verified', '--candidate-source-maps', 'verified'];
  const run = (extra = provenance) => spawnSync(process.execPath, [helper, ...args, ...extra], { cwd: directory, encoding: 'utf8' });
  return { directory, baseline, candidate, run, args, provenance };
}

test('CLI emits complete JSON, preserves reports, creates no files, and uses exit codes 0/1/2', t => {
  const f = fixture(t);
  const before = fs.readFileSync(f.baseline);
  let result = f.run();
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stderr, '');
  assert.equal(JSON.parse(result.stdout).status, 'no-observed-loss');
  fs.writeFileSync(f.candidate, `\uFEFF${record()}`);
  result = f.run();
  assert.equal(result.status, 0, result.stderr);
  const bomReport = JSON.parse(result.stdout);
  assert.equal(bomReport.inputs.candidate.sha256, createHash('sha256').update(fs.readFileSync(f.candidate)).digest('hex'));
  assert.notEqual(bomReport.inputs.baseline.sha256, bomReport.inputs.candidate.sha256);
  assert.equal(bomReport.equivalenceClaim, false);
  result = f.run([]);
  assert.equal(result.status, 2);
  assert.equal(JSON.parse(result.stdout).status, 'inconclusive');
  fs.writeFileSync(f.candidate, record('src/service.ts', 'DA:1,0'));
  result = f.run();
  assert.equal(result.status, 1);
  assert.equal(JSON.parse(result.stdout).status, 'coverage-loss');
  fs.writeFileSync(f.candidate, 'SF:unfinished.ts');
  result = f.run();
  assert.equal(result.status, 2);
  assert.equal(JSON.parse(result.stdout).status, 'invalid-input');
  assert.deepEqual(fs.readFileSync(f.baseline), before);
  assert.deepEqual(fs.readdirSync(f.directory).sort(), ['baseline.lcov', 'candidate.lcov']);
});

test('CLI rejects missing, unreadable and invalid UTF-8 reports without fabricating zero coverage', t => {
  const f = fixture(t);
  for (const prepare of [
    () => fs.unlinkSync(f.candidate),
    () => fs.mkdirSync(f.candidate),
    () => { fs.rmdirSync(f.candidate); fs.writeFileSync(f.candidate, Buffer.from([0xff])); },
  ]) {
    prepare();
    const result = f.run();
    assert.equal(result.status, 2);
    const report = JSON.parse(result.stdout);
    assert.equal(report.comparisonPerformed, false);
    assert.ok(report.errors.some(error => /cannot read UTF-8 report/.test(error.message)));
    assert.equal(report.summary, undefined);
  }
});

test('CLI fails safely on missing/unknown/duplicate arguments and documents help', t => {
  const f = fixture(t);
  for (const args of [[], ['--baseline'], ['--unknown', 'x'], [...f.args, '--baseline', 'other'],
    [...f.args, '--candidate-source-maps', 'trust-me'], [...f.args, '--candidate-root']]) {
    const result = spawnSync(process.execPath, [helper, ...args], { encoding: 'utf8' });
    assert.equal(result.status, 2);
    assert.match(result.stderr, /Usage:/);
    assert.equal(result.stdout, '');
  }
  const help = spawnSync(process.execPath, [helper, '--help'], { encoding: 'utf8' });
  assert.equal(help.status, 0);
  assert.match(help.stdout, /never proves equivalence/);
});
