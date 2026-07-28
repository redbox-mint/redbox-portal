#!/usr/bin/env node

const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

function usage() {
  console.error('Usage: prepare-report.cjs <coverage-report> [source-root]');
  process.exit(2);
}

const [, , reportArgument, sourceRootArgument = '.'] = process.argv;
if (!reportArgument) usage();

const repositoryRoot = execFileSync('git', ['rev-parse', '--show-toplevel'], {
  encoding: 'utf8'
}).trim();
const trackedFiles = new Set(
  execFileSync('git', ['ls-files', '-z'], { cwd: repositoryRoot, encoding: 'utf8' })
    .split('\0')
    .filter(Boolean)
    .map(file => file.replaceAll('\\', '/'))
);
const reportPath = path.resolve(reportArgument);
const sourceRoot = sourceRootArgument.replaceAll('\\', '/').replace(/^\.?\//, '').replace(/\/$/, '');

function repositoryPath(sourcePath) {
  const normalized = sourcePath.replaceAll('\\', '/');
  const relativeToRepository = path.relative(repositoryRoot, normalized).replaceAll('\\', '/');

  const candidates = [];
  if (path.isAbsolute(normalized) && !relativeToRepository.startsWith('../')) {
    candidates.push(relativeToRepository);
  }
  if (!path.isAbsolute(normalized)) {
    candidates.push(normalized.replace(/^\.\//, ''));
  }
  if (sourceRoot && sourceRoot !== '.') {
    const marker = `/${sourceRoot}/`;
    const markerIndex = normalized.indexOf(marker);
    if (markerIndex >= 0) candidates.push(normalized.slice(markerIndex + 1));
    candidates.push(`${sourceRoot}/${normalized.replace(/^\.\//, '')}`);
  }

  const match = candidates.find(candidate =>
    candidate && !candidate.startsWith('../') && trackedFiles.has(path.posix.normalize(candidate))
  );
  return match ? path.posix.normalize(match) : null;
}

function prepareLcov(contents) {
  let sources = 0;
  const skipped = [];
  const prepared = contents
    .split(/(?=^TN:|^SF:)/m)
    .filter(record => {
      const match = record.match(/^SF:(.+)$/m);
      if (!match) return true;
      const canonicalPath = repositoryPath(match[1].trim());
      if (!canonicalPath) {
        skipped.push(match[1].trim());
        return false;
      }
      sources += 1;
      return true;
    })
    .map(record => {
      const match = record.match(/^SF:(.+)$/m);
      if (!match) return record;
      return record.replace(/^SF:.+$/m, `SF:${repositoryPath(match[1].trim())}`);
    })
    .join('');
  if (sources === 0) throw new Error(`No SF entries found in LCOV report ${reportPath}`);
  return { contents: prepared, sources, skipped };
}

function prepareIstanbulJson(contents) {
  const coverage = JSON.parse(contents);
  const prepared = {};
  let sources = 0;
  const skipped = [];
  for (const [sourcePath, fileCoverage] of Object.entries(coverage)) {
    const canonicalPath = repositoryPath(sourcePath);
    if (!canonicalPath) {
      skipped.push(sourcePath);
      continue;
    }
    prepared[canonicalPath] = { ...fileCoverage, path: canonicalPath };
    sources += 1;
  }
  if (sources === 0) throw new Error(`No source entries found in Istanbul report ${reportPath}`);
  return { contents: `${JSON.stringify(prepared)}\n`, sources, skipped };
}

if (!fs.existsSync(reportPath)) {
  throw new Error(`Coverage report does not exist: ${reportPath}`);
}

const contents = fs.readFileSync(reportPath, 'utf8');
const result = reportPath.endsWith('.json') ? prepareIstanbulJson(contents) : prepareLcov(contents);
fs.writeFileSync(reportPath, result.contents);
console.log(`Prepared ${result.sources} coverage source paths in ${path.relative(repositoryRoot, reportPath)}`);
if (result.skipped.length > 0) {
  console.warn(
    `Excluded ${result.skipped.length} generated or untracked coverage sources:\n` +
      result.skipped.map(source => `  - ${source}`).join('\n')
  );
}
