#!/usr/bin/env node

'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const ts = require('typescript');

const repositoryRoot = path.resolve(__dirname, '..');
const baselineRelativePath = 'support/security/explicit-type-node-baseline.json';
const documentationRelativePath = 'support/wiki/Legacy-Explicit-Type-Node-Baseline.md';
const declarationProjects = Object.freeze([
  Object.freeze({
    tsconfig: 'packages/redbox-core/tsconfig.json',
    outputRoot: 'packages/redbox-core/dist',
  }),
]);
const sourceExtensions = new Set(['.cts', '.mts', '.ts', '.tsx']);
const maximumSourceBytes = 4 * 1024 * 1024;
const maximumAstNodes = 300_000;
const maximumDiagnosticOutputBytes = 65_536;
const fingerprintPattern = /^sha256:[a-f0-9]{64}$/u;
const allowedRootKeys = new Set([
  'schemaVersion',
  'documentation',
  'owner',
  'rationale',
  'followUp',
  'declarationProjects',
  'entries',
]);
const allowedEntryKeys = new Set(['scope', 'path', 'anyCount', 'unknownCount', 'fingerprint']);

function normalizeRelativePath(relativePath) {
  if (typeof relativePath !== 'string' || relativePath.length === 0 || relativePath.includes('\\')) {
    throw new Error(`Repository path must be a non-empty POSIX path: ${String(relativePath)}`);
  }
  if (path.posix.isAbsolute(relativePath)) throw new Error(`Repository path must be relative: ${relativePath}`);
  const normalized = path.posix.normalize(relativePath);
  if (normalized !== relativePath || normalized === '..' || normalized.startsWith('../')) {
    throw new Error(`Repository path is not normalized: ${relativePath}`);
  }
  return normalized;
}

function isTestOnlyPath(relativePath) {
  const segments = relativePath.split('/');
  const basename = segments.at(-1) ?? '';
  return (
    segments.some(segment => segment === 'test' || segment === 'tests' || segment === '__tests__') ||
    /\.(?:spec|test)\.(?:cts|mts|ts|tsx)$/u.test(basename) ||
    basename === 'test.ts'
  );
}

function isAuthoredSourcePath(relativePath) {
  let normalized;
  try {
    normalized = normalizeRelativePath(relativePath);
  } catch {
    return false;
  }
  if (!sourceExtensions.has(path.posix.extname(normalized)) || isTestOnlyPath(normalized)) return false;
  return (
    /^(?:api|config|typescript)\//u.test(normalized) ||
    /^packages\/[^/]+\/src\//u.test(normalized) ||
    /^angular\/projects\/(?:[^/]+\/)+src\//u.test(normalized)
  );
}

function scriptKind(relativePath) {
  if (relativePath.endsWith('.tsx')) return ts.ScriptKind.TSX;
  return ts.ScriptKind.TS;
}

function normalizedNodeText(node, sourceFile) {
  return node.getText(sourceFile).replace(/\s+/gu, ' ').trim();
}

function findingContext(node) {
  let current = node;
  while (current.parent !== undefined && !ts.isSourceFile(current.parent)) {
    current = current.parent;
    if (
      ts.isTypeNode(current) ||
      ts.isTypeParameterDeclaration(current) ||
      ts.isParameter(current) ||
      ts.isPropertyDeclaration(current) ||
      ts.isPropertySignature(current) ||
      ts.isMethodDeclaration(current) ||
      ts.isMethodSignature(current) ||
      ts.isFunctionDeclaration(current) ||
      ts.isFunctionTypeNode(current) ||
      ts.isTypeAliasDeclaration(current) ||
      ts.isInterfaceDeclaration(current) ||
      ts.isVariableDeclaration(current) ||
      ts.isAsExpression(current) ||
      ts.isTypeAssertionExpression(current)
    ) {
      return current;
    }
  }
  return node;
}

function scanTypeNodes(source, relativePath) {
  const normalizedPath = normalizeRelativePath(relativePath);
  if (Buffer.byteLength(source) > maximumSourceBytes) {
    throw new Error(`${normalizedPath} exceeds the ${maximumSourceBytes}-byte AST scan limit.`);
  }
  const sourceFile = ts.createSourceFile(
    normalizedPath,
    source,
    ts.ScriptTarget.Latest,
    true,
    scriptKind(normalizedPath)
  );
  const findings = [];
  let nodeCount = 0;
  function visit(node) {
    nodeCount += 1;
    if (nodeCount > maximumAstNodes) {
      throw new Error(`${normalizedPath} exceeds the ${maximumAstNodes}-node AST scan limit.`);
    }
    const kind =
      node.kind === ts.SyntaxKind.AnyKeyword
        ? 'any'
        : node.kind === ts.SyntaxKind.UnknownKeyword
          ? 'unknown'
          : undefined;
    if (kind !== undefined) {
      const location = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile));
      const context = findingContext(node);
      const fingerprint = crypto
        .createHash('sha256')
        .update(`${kind}\0${ts.SyntaxKind[context.kind]}\0${normalizedNodeText(context, sourceFile)}`)
        .digest('hex');
      findings.push(
        Object.freeze({
          kind,
          path: normalizedPath,
          line: location.line + 1,
          column: location.character + 1,
          fingerprint,
        })
      );
    }
    ts.forEachChild(node, visit);
  }
  visit(sourceFile);
  return findings;
}

function summarizeFindings(scope, relativePath, findings) {
  if (findings.length === 0) return undefined;
  const signatures = findings.map(finding => `${finding.kind}\0${finding.fingerprint}`).sort();
  return Object.freeze({
    scope,
    path: normalizeRelativePath(relativePath),
    anyCount: findings.filter(finding => finding.kind === 'any').length,
    unknownCount: findings.filter(finding => finding.kind === 'unknown').length,
    fingerprint: `sha256:${crypto.createHash('sha256').update(signatures.join('\n')).digest('hex')}`,
    findings: Object.freeze(findings),
  });
}

function trackedFiles(root) {
  return execFileSync('git', ['ls-files', '-z'], {
    cwd: root,
    encoding: 'utf8',
    maxBuffer: 16 * 1024 * 1024,
  })
    .split('\0')
    .filter(Boolean);
}

function readSourceFile(root, relativePath) {
  const absolutePath = path.join(root, relativePath);
  const stat = fs.lstatSync(absolutePath);
  if (stat.isSymbolicLink()) throw new Error(`Refusing to scan source symlink: ${relativePath}`);
  if (!stat.isFile()) throw new Error(`Tracked source path is not a file: ${relativePath}`);
  return fs.readFileSync(absolutePath, 'utf8');
}

function scanAuthoredSources(root = repositoryRoot) {
  const summaries = [];
  for (const relativePath of trackedFiles(root).filter(isAuthoredSourcePath).sort()) {
    const findings = scanTypeNodes(readSourceFile(root, relativePath), relativePath);
    const summary = summarizeFindings('source', relativePath, findings);
    if (summary !== undefined) summaries.push(summary);
  }
  return summaries;
}

function localPackagePaths(root) {
  return {
    '@researchdatabox/agenda-sqs-backend': [path.join(root, 'packages/agenda-sqs-backend/src/index.ts')],
    '@researchdatabox/raido-openapi-generated-node': [path.join(root, 'packages/raido/src/index.ts')],
    '@researchdatabox/redbox-core': [path.join(root, 'packages/redbox-core/src/index.ts')],
    '@researchdatabox/redbox-core/*': [path.join(root, 'packages/redbox-core/src/*')],
    '@researchdatabox/redbox-dev-tools': [path.join(root, 'packages/redbox-dev-tools/src/index.ts')],
    '@researchdatabox/rva-registry-openapi-generated-node': [path.join(root, 'packages/rva-registry/src/index.ts')],
    '@researchdatabox/sails-hook-redbox-storage-mongo': [
      path.join(root, 'packages/sails-hook-redbox-storage-mongo/src/index.ts'),
    ],
    '@researchdatabox/sails-ng-common': [path.join(root, 'packages/sails-ng-common/src/index.ts')],
    '@researchdatabox/sails-ng-common/*': [path.join(root, 'packages/sails-ng-common/src/*')],
    '@researchdatabox/sails-ng-common/dist/src/*': [path.join(root, 'packages/sails-ng-common/src/*')],
    'redbox-hook-dev': [path.join(root, 'packages/redbox-hook-dev/src/index.ts')],
  };
}

function diagnosticText(diagnostic) {
  const message = ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n');
  if (diagnostic.file === undefined || diagnostic.start === undefined) return message;
  const location = diagnostic.file.getLineAndCharacterOfPosition(diagnostic.start);
  return `${diagnostic.file.fileName}:${location.line + 1}:${location.character + 1} ${message}`;
}

function emitDeclarationSummaries(root, project = declarationProjects[0]) {
  const configPath = path.join(root, normalizeRelativePath(project.tsconfig));
  const config = ts.readConfigFile(configPath, ts.sys.readFile);
  if (config.error !== undefined) throw new Error(diagnosticText(config.error));
  const parsed = ts.parseJsonConfigFileContent(config.config, ts.sys, path.dirname(configPath));
  if (parsed.errors.length > 0) throw new Error(parsed.errors.map(diagnosticText).join('\n'));
  const outputDirectory = path.join(root, '.tmp/explicit-type-node-declarations');
  const rootNames = new Set(parsed.fileNames.map(fileName => path.resolve(fileName)));
  const program = ts.createProgram({
    rootNames: parsed.fileNames,
    options: {
      ...parsed.options,
      baseUrl: root,
      paths: localPackagePaths(root),
      noEmit: false,
      emitDeclarationOnly: true,
      declaration: true,
      declarationMap: false,
      incremental: false,
      composite: false,
      outDir: outputDirectory,
    },
  });
  const summaries = [];
  const emittedPaths = new Set();
  const emission = program.emit(
    undefined,
    (fileName, source, _writeByteOrderMark, _onError, sourceFiles) => {
      if (!fileName.endsWith('.d.ts') || !(sourceFiles ?? []).some(sourceFile => rootNames.has(sourceFile.fileName))) {
        return;
      }
      const outputRelativePath = path.relative(outputDirectory, fileName).split(path.sep).join('/');
      const relativePath = normalizeRelativePath(`${project.outputRoot}/${outputRelativePath}`);
      if (emittedPaths.has(relativePath)) throw new Error(`Duplicate declaration output: ${relativePath}`);
      emittedPaths.add(relativePath);
      const findings = scanTypeNodes(source, relativePath);
      const summary = summarizeFindings('declaration', relativePath, findings);
      if (summary !== undefined) summaries.push(summary);
    },
    undefined,
    true
  );
  if (emission.emitSkipped || emission.diagnostics.length > 0) {
    throw new Error(`Declaration emission failed:\n${emission.diagnostics.map(diagnosticText).join('\n')}`);
  }
  if (emittedPaths.size === 0) throw new Error(`Declaration project emitted no files: ${project.tsconfig}`);
  return summaries.sort(compareSummaryOrder);
}

function compareSummaryOrder(left, right) {
  return left.scope.localeCompare(right.scope) || left.path.localeCompare(right.path);
}

function plainSummary(summary) {
  return {
    scope: summary.scope,
    path: summary.path,
    anyCount: summary.anyCount,
    unknownCount: summary.unknownCount,
    fingerprint: summary.fingerprint,
  };
}

function ownKeysAre(value, expected) {
  const keys = Object.keys(value);
  return keys.length === expected.size && keys.every(key => expected.has(key));
}

function validateBaseline(baseline, root = repositoryRoot) {
  const errors = [];
  if (!baseline || typeof baseline !== 'object' || Array.isArray(baseline)) return ['Baseline root must be an object.'];
  if (!ownKeysAre(baseline, allowedRootKeys)) errors.push('Baseline root contains unknown or missing fields.');
  if (baseline.schemaVersion !== 1) errors.push('Baseline schemaVersion must be 1.');
  if (baseline.documentation !== documentationRelativePath) {
    errors.push(`Baseline documentation must be ${documentationRelativePath}.`);
  }
  for (const field of ['owner', 'rationale', 'followUp']) {
    if (typeof baseline[field] !== 'string' || baseline[field].trim().length === 0 || baseline[field].length > 500) {
      errors.push(`Baseline ${field} must be a non-empty bounded string.`);
    }
  }
  if (JSON.stringify(baseline.declarationProjects) !== JSON.stringify(declarationProjects)) {
    errors.push('Baseline declarationProjects must match the enforced declaration projects.');
  }
  if (!Array.isArray(baseline.entries)) return [...errors, 'Baseline entries must be an array.'];
  const keys = new Set();
  let previousKey = '';
  for (const [index, entry] of baseline.entries.entries()) {
    const label = `Baseline entries[${index}]`;
    if (!entry || typeof entry !== 'object' || Array.isArray(entry) || !ownKeysAre(entry, allowedEntryKeys)) {
      errors.push(`${label} must contain exactly the supported fields.`);
      continue;
    }
    let normalizedPath;
    try {
      normalizedPath = normalizeRelativePath(entry.path);
    } catch (error) {
      errors.push(`${label}.path is invalid: ${error.message}`);
      continue;
    }
    if (entry.scope !== 'source' && entry.scope !== 'declaration') errors.push(`${label}.scope is invalid.`);
    if (entry.scope === 'source' && !isAuthoredSourcePath(normalizedPath)) {
      errors.push(`${label}.path is not authored runtime/source code.`);
    }
    if (
      entry.scope === 'declaration' &&
      !declarationProjects.some(
        project => normalizedPath.startsWith(`${project.outputRoot}/`) && normalizedPath.endsWith('.d.ts')
      )
    ) {
      errors.push(`${label}.path is outside the emitted public declaration roots.`);
    }
    if (!Number.isSafeInteger(entry.anyCount) || entry.anyCount < 0) errors.push(`${label}.anyCount is invalid.`);
    if (!Number.isSafeInteger(entry.unknownCount) || entry.unknownCount < 0) {
      errors.push(`${label}.unknownCount is invalid.`);
    }
    if (entry.anyCount + entry.unknownCount < 1) errors.push(`${label} must allow at least one type node.`);
    if (typeof entry.fingerprint !== 'string' || !fingerprintPattern.test(entry.fingerprint)) {
      errors.push(`${label}.fingerprint is invalid.`);
    }
    const key = `${entry.scope}\0${normalizedPath}`;
    if (keys.has(key)) errors.push(`${label} duplicates a baseline path.`);
    if (previousKey !== '' && key.localeCompare(previousKey) < 0) errors.push('Baseline entries must be sorted.');
    keys.add(key);
    previousKey = key;
  }
  if (!fs.existsSync(path.join(root, documentationRelativePath))) errors.push('Baseline documentation is missing.');
  return errors;
}

function compareSummaries(actual, expected) {
  const actualByKey = new Map(actual.map(entry => [`${entry.scope}\0${entry.path}`, entry]));
  const expectedByKey = new Map(expected.map(entry => [`${entry.scope}\0${entry.path}`, entry]));
  const unexpected = [];
  const stale = [];
  const changed = [];
  for (const [key, entry] of actualByKey) {
    const baseline = expectedByKey.get(key);
    if (baseline === undefined) unexpected.push(entry);
    else if (
      entry.anyCount !== baseline.anyCount ||
      entry.unknownCount !== baseline.unknownCount ||
      entry.fingerprint !== baseline.fingerprint
    ) {
      changed.push({ actual: entry, expected: baseline });
    }
  }
  for (const [key, entry] of expectedByKey) if (!actualByKey.has(key)) stale.push(entry);
  return { unexpected, stale, changed };
}

function readJson(relativePath, root) {
  return JSON.parse(fs.readFileSync(path.join(root, relativePath), 'utf8'));
}

function collectSummaries(root = repositoryRoot) {
  return [
    ...declarationProjects.flatMap(project => emitDeclarationSummaries(root, project)),
    ...scanAuthoredSources(root),
  ].sort(compareSummaryOrder);
}

function runGuard(root = repositoryRoot) {
  const baseline = readJson(baselineRelativePath, root);
  const metadataErrors = validateBaseline(baseline, root);
  const summaries = collectSummaries(root);
  return {
    baseline,
    metadataErrors,
    summaries,
    ...compareSummaries(summaries, Array.isArray(baseline.entries) ? baseline.entries : []),
  };
}

function baselineDocument(entries) {
  return {
    schemaVersion: 1,
    documentation: documentationRelativePath,
    owner: 'ReDBox maintainers',
    rationale: 'Legacy explicit type nodes predate the AST gate and are frozen per file until safely migrated.',
    followUp: 'TYPE-SAFETY-LEGACY-BASELINE',
    declarationProjects,
    entries: entries.map(plainSummary),
  };
}

function boundedDiagnosticOutput(errors) {
  const output = `${errors.join('\n')}\n`;
  if (Buffer.byteLength(output) <= maximumDiagnosticOutputBytes) return output;
  const suffix = `Explicit-type-node diagnostics truncated at ${maximumDiagnosticOutputBytes} bytes.\n`;
  return `${Buffer.from(output)
    .subarray(0, maximumDiagnosticOutputBytes - Buffer.byteLength(suffix))
    .toString('utf8')}${suffix}`;
}

function summaryLabel(entry) {
  return `${entry.scope}:${entry.path} (any=${entry.anyCount}, unknown=${entry.unknownCount})`;
}

function main() {
  const rootArgumentIndex = process.argv.indexOf('--root');
  const root = rootArgumentIndex === -1 ? repositoryRoot : path.resolve(process.argv[rootArgumentIndex + 1] ?? '');
  try {
    if (process.argv.includes('--print-baseline')) {
      process.stdout.write(`${JSON.stringify(baselineDocument(collectSummaries(root)), null, 2)}\n`);
      return;
    }
    const result = runGuard(root);
    const errors = [
      ...result.metadataErrors,
      ...result.unexpected.map(entry => `Unexpected explicit type nodes: ${summaryLabel(entry)}`),
      ...result.changed.map(
        ({ actual, expected }) =>
          `Changed explicit type-node baseline: ${summaryLabel(actual)}; expected any=${expected.anyCount}, unknown=${expected.unknownCount}`
      ),
      ...result.stale.map(entry => `Stale explicit type-node baseline: ${summaryLabel(entry)}`),
    ];
    if (errors.length > 0) {
      process.stderr.write(boundedDiagnosticOutput(errors));
      process.exitCode = 1;
      return;
    }
    const sourceCount = result.summaries
      .filter(entry => entry.scope === 'source')
      .reduce((count, entry) => count + entry.anyCount + entry.unknownCount, 0);
    const declarationCount = result.summaries
      .filter(entry => entry.scope === 'declaration')
      .reduce((count, entry) => count + entry.anyCount + entry.unknownCount, 0);
    process.stdout.write(
      `Explicit-type-node gate passed: ${sourceCount} frozen source and ${declarationCount} frozen declaration nodes.\n`
    );
  } catch (error) {
    process.stderr.write(boundedDiagnosticOutput([`Explicit-type-node gate could not run: ${error.message}`]));
    process.exitCode = 1;
  }
}

if (require.main === module) main();

module.exports = {
  baselineDocument,
  baselineRelativePath,
  collectSummaries,
  compareSummaries,
  declarationProjects,
  documentationRelativePath,
  emitDeclarationSummaries,
  isAuthoredSourcePath,
  normalizeRelativePath,
  runGuard,
  scanAuthoredSources,
  scanTypeNodes,
  summarizeFindings,
  validateBaseline,
};
