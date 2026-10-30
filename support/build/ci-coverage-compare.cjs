#!/usr/bin/env node
// Read-only, dependency-free LCOV observations; never a claim of suite equivalence.
const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');

const KINDS = ['lines', 'functions', 'branches'];
const MAP_STATES = ['verified', 'not-used', 'unknown', 'invalid'];

function portablePath(value) {
  if (typeof value !== 'string' || !value || /[\x00-\x1f\x7f]/.test(value)) {
    throw new Error('empty path or control character in path');
  }
  const normalized = value.replaceAll('\\', '/').replace(/^([a-z]):\//, (_, drive) => `${drive.toUpperCase()}:/`);
  if (normalized.startsWith('//') || /[?#]/.test(normalized) ||
      (/^[^/]*:/.test(normalized) && !/^[A-Z]:\//.test(normalized))) {
    throw new Error(`unsupported URL, UNC, or drive-relative path: ${value}`);
  }
  return normalized;
}

function normalizeSourcePath(source, root) {
  const base = portablePath(root);
  if (!base.startsWith('/') && !/^[A-Z]:\//.test(base)) throw new Error('repository root must be absolute');
  const input = portablePath(source);
  if (input.endsWith('/')) throw new Error(`source path is a directory: ${source}`);
  const absolute = input.startsWith('/') || /^[A-Z]:\//.test(input);
  const windowsRoot = /^[A-Z]:\//.test(base);
  const windowsSource = /^[A-Z]:\//.test(input);
  if (absolute && (windowsRoot !== windowsSource || (windowsRoot && base.slice(0, 2) !== input.slice(0, 2)))) {
    throw new Error(`source path uses a different filesystem root: ${source}`);
  }
  // Strip matching Windows drives before POSIX operations so neither path is
  // accidentally resolved relative to this machine's current working directory.
  const relative = absolute
    ? path.posix.relative(windowsRoot ? base.slice(2) : base, windowsSource ? input.slice(2) : input)
    : path.posix.normalize(input);
  if (!relative || relative === '.' || relative === '..' || relative.startsWith('../') ||
      relative.startsWith('/') || relative.includes(':')) {
    throw new Error(`source path escapes or equals repository root: ${source}`);
  }
  return relative;
}

function integer(value, label, minimum = 0) {
  if (!/^\d+$/.test(value) || !Number.isSafeInteger(Number(value)) || Number(value) < minimum) {
    throw new Error(`invalid ${label}: ${value}`);
  }
  return Number(value);
}

function unique(map, key, value, label) {
  if (map.has(key)) throw new Error(`duplicate ${label}: ${key}`);
  map.set(key, value);
}

function parseLcov(text, root = process.cwd()) {
  if (typeof text !== 'string' || !text.trim()) throw new Error('empty LCOV report');
  const files = new Map();
  let record = null;
  const lines = text.replace(/^\uFEFF/, '').split(/\r?\n/);
  for (const [index, raw] of lines.entries()) {
    if (!raw) continue;
    try {
      if (/[\x00-\x1f\x7f]/.test(raw)) throw new Error('control character in LCOV record');
      if (raw === 'end_of_record') {
        if (!record) throw new Error('end_of_record without SF');
        for (const [name, fn] of record.definitions) {
          if (!record.functionCounts.has(name)) throw new Error(`FN has no FNDA: ${name}`);
          const identity = { line: fn.line, endLine: fn.endLine, name };
          record.functions.set(JSON.stringify(identity), { identity, count: record.functionCounts.get(name) });
        }
        for (const name of record.functionCounts.keys()) {
          if (!record.definitions.has(name)) throw new Error(`FNDA has no FN: ${name}`);
        }
        if (!KINDS.some(kind => record[kind].size)) throw new Error('source record has no coverage identities');
        const expected = {
          LF: record.lines.size, LH: covered(record.lines),
          FNF: record.functions.size, FNH: covered(record.functions),
          BRF: record.branches.size, BRH: covered(record.branches),
        };
        for (const [key, value] of record.summaries) {
          if (value !== expected[key]) throw new Error(`${key} disagrees with identity records (${value} != ${expected[key]})`);
        }
        files.set(record.source, { rawSource: record.rawSource, ...Object.fromEntries(KINDS.map(kind => [kind, record[kind]])) });
        record = null;
        continue;
      }
      const separator = raw.indexOf(':');
      if (separator < 0) throw new Error('expected LCOV tag:value');
      const tag = raw.slice(0, separator);
      const value = raw.slice(separator + 1);
      if (tag === 'TN') {
        if (record) throw new Error('TN inside source record');
        continue; // Test labels do not establish source or suite equivalence.
      }
      if (tag === 'SF') {
        if (record) throw new Error('SF before end_of_record');
        const source = normalizeSourcePath(value, root);
        if (files.has(source)) throw new Error(`duplicate normalized SF (merge shards first): ${source}`);
        record = {
          source, rawSource: value, lines: new Map(), functions: new Map(), branches: new Map(),
          definitions: new Map(), functionCounts: new Map(), summaries: new Map(),
        };
        continue;
      }
      if (!record) throw new Error(`${tag} outside source record`);
      if (tag === 'DA') {
        const parts = value.split(',');
        if (parts.length < 2 || parts.length > 3 || (parts.length === 3 && !parts[2])) throw new Error('invalid DA fields');
        const line = integer(parts[0], 'line', 1);
        unique(record.lines, String(line), {
          identity: { line }, count: integer(parts[1], 'line count'), checksum: parts[2] ?? null,
        }, 'DA line');
      } else if (tag === 'FN') {
        const match = /^(\d+),(?:(\d+),)?(.+)$/.exec(value);
        if (!match) throw new Error('invalid FN fields');
        const line = integer(match[1], 'function line', 1);
        const endLine = match[2] === undefined ? null : integer(match[2], 'function end line', line);
        unique(record.definitions, match[3], { line, endLine }, 'FN name');
      } else if (tag === 'FNDA') {
        const match = /^(\d+),(.+)$/.exec(value);
        if (!match) throw new Error('invalid FNDA fields');
        unique(record.functionCounts, match[2], integer(match[1], 'function count'), 'FNDA name');
      } else if (tag === 'BRDA') {
        const parts = value.split(',');
        if (parts.length !== 4) throw new Error('invalid BRDA fields');
        const identity = {
          line: integer(parts[0], 'branch line', 1),
          block: integer(parts[1], 'branch block'), branch: integer(parts[2], 'branch id'),
        };
        unique(record.branches, JSON.stringify(identity), {
          identity, count: parts[3] === '-' ? null : integer(parts[3], 'branch count'),
        }, 'BRDA identity');
      } else if (['LF', 'LH', 'FNF', 'FNH', 'BRF', 'BRH'].includes(tag)) {
        unique(record.summaries, tag, integer(value, tag), 'summary');
      } else {
        throw new Error(`unsupported LCOV tag: ${tag}`);
      }
    } catch (error) {
      throw new Error(`LCOV row ${index + 1}: ${error.message}`);
    }
  }
  if (record) throw new Error('unterminated source record (missing end_of_record)');
  if (!files.size) throw new Error('LCOV report contains no source records');
  return files;
}

function covered(entries) {
  return [...entries.values()].filter(entry => entry.count > 0).length;
}

function totals(entries) {
  const hit = covered(entries);
  return { total: entries.size, covered: hit, percent: entries.size ? 100 * hit / entries.size : null };
}

function compareReports(baseline, candidate) {
  const reasons = [];
  const inputs = {};
  const parsed = {};
  const errors = [];
  for (const [label, input] of Object.entries({ baseline, candidate })) {
    inputs[label] = {
      root: input.root ?? process.cwd(), revision: input.revision ?? null, sourceMaps: input.sourceMaps ?? 'unknown',
      sha256: typeof input.text === 'string' ? createHash('sha256').update(input.text).digest('hex') : null,
    };
    try { parsed[label] = parseLcov(input.text, inputs[label].root); }
    catch (error) { errors.push({ input: label, message: error.message }); }
    const { revision, sourceMaps } = inputs[label];
    if (typeof revision !== 'string' || !revision.trim() || /[\x00-\x1f\x7f]/.test(revision)) reasons.push(`${label}: source revision missing or invalid`);
    if (!['verified', 'not-used'].includes(sourceMaps)) reasons.push(`${label}: source-map provenance is ${sourceMaps}`);
  }
  const report = {
    schemaVersion: 1, status: 'invalid-input', exitCode: 2, comparisonPerformed: false,
    equivalenceClaim: false,
    scope: 'LCOV identity/count observations only; not proof of source, instrumentation, test, or runtime equivalence.',
    inputs, reasons, errors, files: [],
  };
  if (errors.length) return report; // Never compare a partially parsed or missing report.
  if (inputs.baseline.revision !== inputs.candidate.revision) reasons.push('source revisions differ; identities may refer to different code');
  if (inputs.baseline.sourceMaps !== inputs.candidate.sourceMaps) reasons.push('source-map provenance differs');
  const summary = Object.fromEntries(KINDS.map(kind => [kind, {
    baseline: { total: 0, covered: 0 }, candidate: { total: 0, covered: 0 },
    added: 0, removed: 0, coverageRegressions: 0, countDecreases: 0, countChanges: 0, addedUncovered: 0,
  }]));
  let hasLoss = false;
  let hasChanges = false;
  const sources = [...new Set([...parsed.baseline.keys(), ...parsed.candidate.keys()])].sort();
  for (const source of sources) {
    const before = parsed.baseline.get(source);
    const after = parsed.candidate.get(source);
    const file = { source, presence: !before ? 'added' : !after ? 'removed' : 'both',
      rawSources: { baseline: before?.rawSource ?? null, candidate: after?.rawSource ?? null }, metrics: {} };
    for (const kind of KINDS) {
      const left = before?.[kind] ?? new Map();
      const right = after?.[kind] ?? new Map();
      const entries = [];
      for (const key of [...new Set([...left.keys(), ...right.keys()])].sort()) {
        const b = left.get(key);
        const c = right.get(key);
        const change = !b ? 'added' : !c ? 'removed' : b.count !== c.count || b.checksum !== c.checksum ? 'changed' : 'unchanged';
        const coverageLost = Boolean(b?.count > 0 && !(c?.count > 0));
        const countDecreased = Boolean(b && c && b.count !== null && c.count !== null && c.count < b.count);
        const addedUncovered = !b && !(c.count > 0);
        const checksumChanged = Boolean(b && c && b.checksum !== c.checksum);
        if (checksumChanged) reasons.push(`${source}:${b.identity.line}: line checksum differs or is missing on one side`);
        const entry = {
          identity: (b ?? c).identity,
          baseline: b ? { count: b.count, ...(kind === 'lines' ? { checksum: b.checksum } : {}) } : null,
          candidate: c ? { count: c.count, ...(kind === 'lines' ? { checksum: c.checksum } : {}) } : null,
          change, coverageLost, countDecreased, addedUncovered, checksumChanged,
        };
        entries.push(entry);
        const counts = summary[kind];
        if (change === 'added') counts.added++;
        if (change === 'removed') counts.removed++;
        if (coverageLost) counts.coverageRegressions++;
        if (countDecreased) counts.countDecreases++;
        if (b && c && b.count !== c.count) counts.countChanges++;
        if (addedUncovered) counts.addedUncovered++;
        hasLoss ||= change === 'removed' || coverageLost || countDecreased || addedUncovered;
        hasChanges ||= change !== 'unchanged';
      }
      file.metrics[kind] = { baseline: totals(left), candidate: totals(right), entries };
      for (const side of ['baseline', 'candidate']) {
        summary[kind][side].total += file.metrics[kind][side].total;
        summary[kind][side].covered += file.metrics[kind][side].covered;
      }
    }
    report.files.push(file);
  }
  for (const metric of Object.values(summary)) {
    for (const side of ['baseline', 'candidate']) {
      const value = metric[side];
      value.percent = value.total ? 100 * value.covered / value.total : null;
    }
  }
  return Object.assign(report, {
    comparisonPerformed: true, summary, hasLoss,
    status: hasLoss ? 'coverage-loss' : reasons.length ? 'inconclusive' : hasChanges ? 'changed-no-observed-loss' : 'no-observed-loss',
    exitCode: hasLoss ? 1 : reasons.length ? 2 : 0,
  });
}

const USAGE = `Usage: node support/build/ci-coverage-compare.cjs --baseline BASE.lcov --candidate CANDIDATE.lcov
  [--baseline-root ABS_PATH] [--candidate-root ABS_PATH] (default: current directory)
  [--baseline-revision REV] [--candidate-revision REV]
  [--baseline-source-maps verified|not-used|unknown|invalid]
  [--candidate-source-maps verified|not-used|unknown|invalid]

JSON to stdout; no writes. Revisions and source-map states are caller attestations.
Exit 0: no observed loss with matching, supplied provenance; never proves equivalence.
Exit 1: removed identity, new uncovered identity, lost coverage, or decreased hit count.
Exit 2: invalid input/arguments, or inconclusive provenance without observed loss.
See support/build/ci-coverage-compare.md for strict LCOV support and limitations.`;

function main(args) {
  if (args.length === 1 && args[0] === '--help') {
    process.stdout.write(`${USAGE}\n`);
    return 0;
  }
  const options = {};
  const allowed = ['baseline', 'candidate', ...['baseline', 'candidate'].flatMap(side => [`${side}-root`, `${side}-revision`, `${side}-source-maps`])];
  try {
    for (let i = 0; i < args.length; i += 2) {
      const key = args[i].slice(2);
      if (!args[i].startsWith('--') || !allowed.includes(key) || Object.hasOwn(options, key) ||
          !args[i + 1] || args[i + 1].startsWith('--')) throw new Error(`invalid or duplicate argument: ${args[i]}`);
      options[key] = args[i + 1];
    }
    for (const side of ['baseline', 'candidate']) {
      if (!options[side]) throw new Error(`--${side} is required`);
      if (options[`${side}-source-maps`] && !MAP_STATES.includes(options[`${side}-source-maps`])) throw new Error(`invalid --${side}-source-maps state`);
    }
  } catch (error) {
    process.stderr.write(`${error.message}\n${USAGE}\n`);
    return 2;
  }
  const inputs = {};
  const readErrors = [];
  for (const side of ['baseline', 'candidate']) {
    let text;
    try {
      // Fatal decoding prevents corrupted path/name bytes becoming replacement characters.
      text = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(fs.readFileSync(options[side]));
    } catch (error) { readErrors.push({ input: side, message: `cannot read UTF-8 report (${error.code ?? error.name})` }); }
    inputs[side] = {
      text, root: options[`${side}-root`] ?? process.cwd(),
      revision: options[`${side}-revision`], sourceMaps: options[`${side}-source-maps`],
    };
  }
  const report = compareReports(inputs.baseline, inputs.candidate);
  report.errors = [...report.errors.filter(error => !readErrors.some(readError => readError.input === error.input)), ...readErrors];
  for (const side of ['baseline', 'candidate']) report.inputs[side].report = options[side];
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  return report.exitCode;
}

if (require.main === module) process.exitCode = main(process.argv.slice(2));
module.exports = { normalizeSourcePath, parseLcov, compareReports };
