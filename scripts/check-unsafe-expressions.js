#!/usr/bin/env node

'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const ts = require('typescript');

const repositoryRoot = path.resolve(__dirname, '..');
const allowlistRelativePath = 'support/security/unsafe-expression-allowlist.json';
const documentationRelativePath = 'support/wiki/Legacy-Unsafe-Expression-Inventory.md';
const sourceExclusionsRelativePath = 'support/security/unsafe-expression-source-exclusions.json';
const sourceExtensions = new Set(['.cjs', '.cts', '.js', '.jsx', '.mjs', '.mts', '.ts', '.tsx']);
const excludedPathPrefixes = ['support/', 'test/'];
const excludedPathSegments = new Set(['coverage', 'dist', 'node_modules', 'test', 'tests']);
const managedPathPrefixes = [
  'packages/redbox-core/src/action-execution/',
  'packages/redbox-core/src/action-registry/',
  'packages/redbox-core/src/expression-runtime/',
  'packages/redbox-core/src/record-workflow-administration/',
  'packages/redbox-core/src/services/record-actions/',
  'packages/redbox-core/src/services/record-hooks/',
  'packages/redbox-core/src/workflow-transition/',
];
const removedActionPaths = new Set([
  'packages/redbox-core/src/config/action.config.ts',
  'packages/redbox-core/src/controllers/ActionController.ts',
]);
const allowedRootKeys = new Set(['schemaVersion', 'documentation', 'entries']);
const allowedEntryKeys = new Set(['id', 'kind', 'path', 'fingerprint', 'owner', 'rationale', 'followUp']);
const allowedKinds = new Set(['direct-eval', 'lodash-template']);
const allowedExclusionEntryKeys = new Set(['path', 'kind', 'source', 'rationale']);
const allowedExclusionKinds = new Set(['generated', 'vendored']);
const lodashModules = new Set(['lodash', 'lodash-es']);
const maximumSourceBytes = 4 * 1024 * 1024;
const maximumAstNodes = 250_000;
const maximumFindingsPerFile = 128;
const maximumRepositoryFindings = 512;
const maximumDiagnosticOutputBytes = 65_536;
const analysisLimitKind = 'analysis-limit';

const defaultSourceExclusionManifest = JSON.parse(
  fs.readFileSync(path.join(repositoryRoot, sourceExclusionsRelativePath), 'utf8')
);
const defaultSourceExclusionPaths = new Set(
  Array.isArray(defaultSourceExclusionManifest.entries)
    ? defaultSourceExclusionManifest.entries.map(entry => entry.path)
    : []
);

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

function isScannedSourcePath(relativePath, excludedSourcePaths = defaultSourceExclusionPaths) {
  let normalized;
  try {
    normalized = normalizeRelativePath(relativePath);
  } catch {
    return false;
  }
  return (
    sourceExtensions.has(path.posix.extname(normalized)) &&
    !excludedPathPrefixes.some(prefix => normalized.startsWith(prefix)) &&
    !excludedSourcePaths.has(normalized) &&
    !normalized.split('/').some(segment => excludedPathSegments.has(segment))
  );
}

function isManagedOrRemovedPath(relativePath) {
  return managedPathPrefixes.some(prefix => relativePath.startsWith(prefix)) || removedActionPaths.has(relativePath);
}

function scriptKind(relativePath) {
  const extension = path.posix.extname(relativePath);
  if (extension === '.js' || extension === '.cjs' || extension === '.mjs') return ts.ScriptKind.JS;
  if (extension === '.jsx') return ts.ScriptKind.JSX;
  if (extension === '.tsx') return ts.ScriptKind.TSX;
  return ts.ScriptKind.TS;
}

function unwrapExpression(node) {
  let current = node;
  while (
    ts.isParenthesizedExpression(current) ||
    ts.isAsExpression(current) ||
    ts.isTypeAssertionExpression(current) ||
    ts.isNonNullExpression(current) ||
    ts.isSatisfiesExpression(current) ||
    ts.isPartiallyEmittedExpression(current)
  ) {
    current = current.expression;
  }
  return current;
}

function literalText(node) {
  const current = node && unwrapExpression(node);
  return current && (ts.isStringLiteralLike(current) || ts.isNumericLiteral(current)) ? current.text : undefined;
}

function lodashModuleKind(moduleName) {
  if (lodashModules.has(moduleName)) return 'lodash';
  if (/^(lodash|lodash-es)\/template(?:\.js)?$/.test(moduleName ?? '')) return 'lodash-template-module';
  return undefined;
}

function createsScope(node) {
  return (
    ts.isSourceFile(node) ||
    ts.isFunctionLike(node) ||
    ts.isBlock(node) ||
    ts.isModuleBlock(node) ||
    ts.isCatchClause(node)
  );
}

function bindingNames(name, output = []) {
  if (ts.isIdentifier(name)) output.push(name.text);
  else for (const element of name.elements) if (!ts.isOmittedExpression(element)) bindingNames(element.name, output);
  return output;
}

function importOrigin(moduleKind, importedName) {
  if (moduleKind === 'lodash-template-module') {
    return importedName === '*' ? 'lodash-template-module' : 'lodash-template';
  }
  if (moduleKind === 'lodash' && importedName === 'template') return 'lodash-template';
  if (moduleKind === 'lodash') return 'lodash';
  return 'local';
}

function buildScopes(sourceFile) {
  const nodeScopes = new WeakMap();
  const root = { parent: undefined, bindings: new Map(), functionScope: true };

  function nearestFunctionScope(scope) {
    let current = scope;
    while (!current.functionScope) current = current.parent;
    return current;
  }

  function declare(scope, name, binding = { origin: 'local' }) {
    if (!scope.bindings.has(name)) scope.bindings.set(name, binding);
  }

  function visit(node, incomingScope) {
    const scope =
      node === sourceFile
        ? root
        : createsScope(node)
          ? {
              parent: incomingScope,
              bindings: new Map(),
              functionScope: ts.isFunctionLike(node) || ts.isModuleBlock(node),
            }
          : incomingScope;
    nodeScopes.set(node, scope);

    if (ts.isImportDeclaration(node) && ts.isStringLiteralLike(node.moduleSpecifier)) {
      const moduleKind = lodashModuleKind(node.moduleSpecifier.text);
      const clause = node.importClause;
      if (clause?.name) declare(scope, clause.name.text, { origin: importOrigin(moduleKind, 'default') });
      if (clause?.namedBindings && ts.isNamespaceImport(clause.namedBindings)) {
        declare(scope, clause.namedBindings.name.text, { origin: importOrigin(moduleKind, '*') });
      } else if (clause?.namedBindings && ts.isNamedImports(clause.namedBindings)) {
        for (const element of clause.namedBindings.elements) {
          declare(scope, element.name.text, {
            origin: importOrigin(moduleKind, element.propertyName?.text ?? element.name.text),
          });
        }
      }
    } else if (ts.isVariableDeclaration(node)) {
      const declarationScope =
        ts.isVariableDeclarationList(node.parent) && !(node.parent.flags & ts.NodeFlags.BlockScoped)
          ? nearestFunctionScope(scope)
          : scope;
      if (ts.isIdentifier(node.name))
        declare(declarationScope, node.name.text, { origin: undefined, initializer: node.initializer, scope });
      else {
        for (const name of bindingNames(node.name)) declare(declarationScope, name);
        if (ts.isObjectBindingPattern(node.name)) {
          for (const element of node.name.elements) {
            if (ts.isIdentifier(element.name)) {
              declarationScope.bindings.set(element.name.text, {
                origin: undefined,
                initializer: node.initializer,
                property: element.propertyName
                  ? (literalText(element.propertyName) ?? element.propertyName.text)
                  : element.name.text,
                scope,
              });
            }
          }
        }
      }
    } else if (ts.isParameter(node)) {
      for (const name of bindingNames(node.name)) declare(scope, name);
    } else if ((ts.isFunctionDeclaration(node) || ts.isClassDeclaration(node)) && node.name) {
      declare(incomingScope, node.name.text);
    } else if (ts.isCatchClause(node) && node.variableDeclaration) {
      for (const name of bindingNames(node.variableDeclaration.name)) declare(scope, name);
    }

    ts.forEachChild(node, child => visit(child, scope));
  }

  visit(sourceFile, root);
  return nodeScopes;
}

function resolveBinding(scope, name) {
  for (let current = scope; current; current = current.parent) {
    const binding = current.bindings.get(name);
    if (binding) return binding;
  }
  return undefined;
}

function memberName(node) {
  return ts.isPropertyAccessExpression(node) ? node.name.text : literalText(node.argumentExpression);
}

function memberOrigin(objectOrigin, property) {
  if (objectOrigin === 'lodash' && property === 'template') return 'lodash-template';
  if (objectOrigin === 'lodash-template-module' && property === 'default') return 'lodash-template';
  if (objectOrigin === 'lodash' && property === 'default') return 'lodash';
  return undefined;
}

function expressionOrigin(node, scope, resolving = new Set()) {
  if (!node) return undefined;
  const current = unwrapExpression(node);
  if (ts.isIdentifier(current)) {
    const binding = resolveBinding(scope, current.text);
    if (!binding) return current.text === 'eval' ? 'eval' : current.text === '_' ? 'lodash' : undefined;
    if (binding.origin !== undefined) return binding.origin;
    if (resolving.has(binding)) return 'local';
    resolving.add(binding);
    let origin = expressionOrigin(binding.initializer, binding.scope, resolving) ?? 'local';
    if (binding.property) origin = memberOrigin(origin, binding.property);
    binding.origin = origin;
    resolving.delete(binding);
    return origin;
  }
  if (ts.isPropertyAccessExpression(current)) {
    const object = unwrapExpression(current.expression);
    if (
      ts.isIdentifier(object) &&
      ['global', 'globalThis', 'self', 'window'].includes(object.text) &&
      !resolveBinding(scope, object.text) &&
      current.name.text === 'eval'
    ) {
      return 'eval';
    }
    return memberOrigin(expressionOrigin(object, scope, resolving), current.name.text);
  }
  if (ts.isElementAccessExpression(current)) {
    return memberOrigin(
      expressionOrigin(current.expression, scope, resolving),
      literalText(current.argumentExpression)
    );
  }
  if (ts.isCallExpression(current)) {
    const called = unwrapExpression(current.expression);
    if (
      ts.isIdentifier(called) &&
      called.text === 'require' &&
      !resolveBinding(scope, 'require') &&
      current.arguments.length === 1
    ) {
      const moduleKind = lodashModuleKind(literalText(current.arguments[0]));
      return moduleKind === 'lodash-template-module' ? 'lodash-template' : moduleKind;
    }
    if (
      (ts.isPropertyAccessExpression(called) || ts.isElementAccessExpression(called)) &&
      memberName(called) === 'runInContext' &&
      expressionOrigin(called.expression, scope, resolving) === 'lodash'
    ) {
      return 'lodash';
    }
  }
  return undefined;
}

function findingFingerprint(kind, sourceText) {
  const normalizedSource = sourceText.replace(/\s+/g, ' ').trim();
  return `sha256:${crypto.createHash('sha256').update(`${kind}\0${normalizedSource}`).digest('hex')}`;
}

function sourceLocation(sourceFile, position) {
  const location = sourceFile.getLineAndCharacterOfPosition(position);
  return { line: location.line + 1, column: location.character + 1 };
}

function analysisLimitFinding(relativePath, sourceFile, reason, position = 0) {
  return {
    kind: analysisLimitKind,
    path: relativePath,
    ...sourceLocation(sourceFile, position),
    fingerprint: findingFingerprint(analysisLimitKind, reason),
    reason,
  };
}

function scanSource(source, relativePath) {
  const normalizedPath = normalizeRelativePath(relativePath);
  if (Buffer.byteLength(source, 'utf8') > maximumSourceBytes) {
    const emptySourceFile = ts.createSourceFile(
      normalizedPath,
      '',
      ts.ScriptTarget.Latest,
      true,
      scriptKind(normalizedPath)
    );
    return [analysisLimitFinding(normalizedPath, emptySourceFile, 'source-byte-limit')];
  }
  const sourceFile = ts.createSourceFile(
    normalizedPath,
    source,
    ts.ScriptTarget.Latest,
    true,
    scriptKind(normalizedPath)
  );
  const nodeScopes = buildScopes(sourceFile);
  const findings = [];
  const pending = [sourceFile];
  let visited = 0;
  while (pending.length > 0) {
    const node = pending.pop();
    visited += 1;
    if (visited > maximumAstNodes)
      return [analysisLimitFinding(normalizedPath, sourceFile, 'ast-node-limit', node.pos)];
    if (ts.isCallExpression(node) || ts.isNewExpression(node) || ts.isTaggedTemplateExpression(node)) {
      const target = ts.isTaggedTemplateExpression(node) ? node.tag : node.expression;
      const origin = expressionOrigin(target, nodeScopes.get(node));
      const kind = origin === 'eval' ? 'direct-eval' : origin === 'lodash-template' ? 'lodash-template' : undefined;
      if (kind) {
        const start = node.getStart(sourceFile);
        findings.push({
          kind,
          path: normalizedPath,
          ...sourceLocation(sourceFile, start),
          fingerprint: findingFingerprint(kind, source.slice(start, node.end)),
        });
        if (findings.length >= maximumFindingsPerFile) break;
      }
    }
    const children = [];
    ts.forEachChild(node, child => {
      children.push(child);
    });
    for (let index = children.length - 1; index >= 0; index -= 1) pending.push(children[index]);
  }
  return findings;
}

function trackedSourcePaths(root = repositoryRoot, excludedSourcePaths = defaultSourceExclusionPaths) {
  const output = execFileSync('git', ['ls-files', '-z'], { cwd: root, encoding: 'utf8' });
  return output
    .split('\0')
    .filter(Boolean)
    .map(normalizeRelativePath)
    .filter(relativePath => isScannedSourcePath(relativePath, excludedSourcePaths))
    .sort();
}

function scanRepository(root = repositoryRoot, excludedSourcePaths = defaultSourceExclusionPaths) {
  const findings = [];
  for (const relativePath of trackedSourcePaths(root, excludedSourcePaths)) {
    const absolutePath = path.join(root, ...relativePath.split('/'));
    const stats = fs.lstatSync(absolutePath);
    if (stats.isSymbolicLink()) throw new Error(`Refusing to scan source symlink: ${relativePath}`);
    if (!stats.isFile()) continue;
    findings.push(...scanSource(fs.readFileSync(absolutePath, 'utf8'), relativePath));
    if (findings.length > maximumRepositoryFindings) {
      throw new Error(`Unsafe-expression scan exceeded ${maximumRepositoryFindings} findings.`);
    }
  }
  return findings.sort(
    (left, right) => left.path.localeCompare(right.path) || left.line - right.line || left.column - right.column
  );
}

function readJson(relativePath, root = repositoryRoot) {
  return JSON.parse(fs.readFileSync(path.join(root, ...relativePath.split('/')), 'utf8'));
}

function ownKeysAre(value, allowedKeys) {
  return Object.keys(value).every(key => allowedKeys.has(key));
}

function validateSourceExclusions(manifest, _documentation, root = repositoryRoot) {
  const errors = [];
  if (!manifest || typeof manifest !== 'object' || Array.isArray(manifest)) {
    return ['Source-exclusion manifest root must be an object.'];
  }
  if (!ownKeysAre(manifest, allowedRootKeys)) errors.push('Source-exclusion manifest root contains unknown fields.');
  if (manifest.schemaVersion !== 1) errors.push('Source-exclusion manifest schemaVersion must be 1.');
  if (manifest.documentation !== documentationRelativePath) {
    errors.push(`Source-exclusion manifest documentation must be ${documentationRelativePath}.`);
  }
  if (!Array.isArray(manifest.entries)) return [...errors, 'Source-exclusion manifest entries must be an array.'];
  const paths = new Set();
  for (const [index, entry] of manifest.entries.entries()) {
    const label = `source exclusions[${index}]`;
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
      errors.push(`${label} must be an object.`);
      continue;
    }
    if (!ownKeysAre(entry, allowedExclusionEntryKeys) || Object.keys(entry).length !== allowedExclusionEntryKeys.size) {
      errors.push(`${label} must contain exactly path, kind, source, and rationale.`);
      continue;
    }
    try {
      const normalized = normalizeRelativePath(entry.path);
      if (!normalized.startsWith('assets/') || !sourceExtensions.has(path.posix.extname(normalized))) {
        errors.push(`${label}.path must name an assets JavaScript or TypeScript source file.`);
      }
      if (paths.has(normalized)) errors.push(`${label}.path duplicates ${normalized}.`);
      paths.add(normalized);
      const absolutePath = path.join(root, ...normalized.split('/'));
      if (!fs.existsSync(absolutePath) || !fs.lstatSync(absolutePath).isFile()) {
        errors.push(`${label}.path does not name a regular repository file.`);
      }
    } catch (error) {
      errors.push(`${label}.path is invalid: ${error.message}`);
    }
    if (!allowedExclusionKinds.has(entry.kind)) errors.push(`${label}.kind must be generated or vendored.`);
    if (typeof entry.source !== 'string' || entry.source.trim().length < 10)
      errors.push(`${label}.source is required.`);
    if (typeof entry.rationale !== 'string' || entry.rationale.trim().length < 20) {
      errors.push(`${label}.rationale must explain the exclusion.`);
    }
  }
  return errors;
}

function validateAllowlist(allowlist, _documentation, excludedSourcePaths = defaultSourceExclusionPaths) {
  const errors = [];
  if (!allowlist || typeof allowlist !== 'object' || Array.isArray(allowlist))
    return ['Allowlist root must be an object.'];
  if (!ownKeysAre(allowlist, allowedRootKeys)) errors.push('Allowlist root contains unknown fields.');
  if (allowlist.schemaVersion !== 1) errors.push('Allowlist schemaVersion must be 1.');
  if (allowlist.documentation !== documentationRelativePath) {
    errors.push(`Allowlist documentation must be ${documentationRelativePath}.`);
  }
  if (!Array.isArray(allowlist.entries)) return [...errors, 'Allowlist entries must be an array.'];
  const ids = new Set();
  const matchKeys = new Set();
  for (const [index, entry] of allowlist.entries.entries()) {
    const label = `entries[${index}]`;
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
      errors.push(`${label} must be an object.`);
      continue;
    }
    if (!ownKeysAre(entry, allowedEntryKeys) || Object.keys(entry).length !== allowedEntryKeys.size) {
      errors.push(`${label} must contain exactly id, kind, path, fingerprint, owner, rationale, and followUp.`);
      continue;
    }
    if (typeof entry.id !== 'string' || !/^legacy-[a-z0-9-]+$/.test(entry.id) || ids.has(entry.id)) {
      errors.push(`${label}.id must be a unique stable legacy identifier.`);
    }
    ids.add(entry.id);
    if (!allowedKinds.has(entry.kind)) errors.push(`${label}.kind is unsupported.`);
    try {
      normalizeRelativePath(entry.path);
      if (!isScannedSourcePath(entry.path, excludedSourcePaths))
        errors.push(`${label}.path is outside the source scan.`);
      if (isManagedOrRemovedPath(entry.path))
        errors.push(`${label}.path cannot allowlist managed or removed action code.`);
    } catch (error) {
      errors.push(`${label}.path is invalid: ${error.message}`);
    }
    if (typeof entry.fingerprint !== 'string' || !/^sha256:[a-f0-9]{64}$/.test(entry.fingerprint)) {
      errors.push(`${label}.fingerprint must be a sha256 fingerprint.`);
    }
    if (typeof entry.owner !== 'string' || entry.owner.trim().length < 3) errors.push(`${label}.owner is required.`);
    if (typeof entry.rationale !== 'string' || entry.rationale.trim().length < 20)
      errors.push(`${label}.rationale is required.`);
    if (typeof entry.followUp !== 'string' || !/^SEC-LEGACY-[A-Z0-9-]+$/.test(entry.followUp)) {
      errors.push(`${label}.followUp must be a SEC-LEGACY-* identifier.`);
    }
    const matchKey = `${entry.kind}\0${entry.path}\0${entry.fingerprint}`;
    if (matchKeys.has(matchKey)) errors.push(`${label} duplicates an allowlist call site.`);
    matchKeys.add(matchKey);
  }
  return errors;
}

function compareFindingsToAllowlist(findings, entries) {
  const pending = new Map();
  for (const entry of entries) {
    const key = `${entry.kind}\0${entry.path}\0${entry.fingerprint}`;
    pending.set(key, [...(pending.get(key) ?? []), entry]);
  }
  const unexpected = [];
  for (const finding of findings) {
    const key = `${finding.kind}\0${finding.path}\0${finding.fingerprint}`;
    const matches = pending.get(key);
    if (matches?.length) matches.pop();
    else unexpected.push(finding);
  }
  return { unexpected, stale: [...pending.values()].flat() };
}

function runGuard(root = repositoryRoot) {
  const allowlist = readJson(allowlistRelativePath, root);
  const sourceExclusions = readJson(sourceExclusionsRelativePath, root);
  const excludedSourcePaths = new Set(
    Array.isArray(sourceExclusions.entries) ? sourceExclusions.entries.map(entry => entry.path) : []
  );
  const metadataErrors = [
    ...validateSourceExclusions(sourceExclusions, '', root),
    ...validateAllowlist(allowlist, '', excludedSourcePaths),
  ];
  const findings = scanRepository(root, new Set([...excludedSourcePaths, 'scripts/check-unsafe-expressions.js']));
  return {
    allowlist,
    findings,
    metadataErrors,
    sourceExclusions,
    ...compareFindingsToAllowlist(findings, Array.isArray(allowlist.entries) ? allowlist.entries : []),
  };
}

function formatFinding(finding) {
  const reason = finding.reason ? ` (${finding.reason})` : '';
  return `${finding.path}:${finding.line}:${finding.column} ${finding.kind} ${finding.fingerprint}${reason}`;
}

function boundedDiagnosticOutput(errors) {
  const output = `${errors.join('\n')}\n`;
  if (Buffer.byteLength(output) <= maximumDiagnosticOutputBytes) return output;
  const suffix = `Unsafe-expression diagnostics truncated at ${maximumDiagnosticOutputBytes} bytes.\n`;
  return `${Buffer.from(output)
    .subarray(0, maximumDiagnosticOutputBytes - Buffer.byteLength(suffix))
    .toString('utf8')}${suffix}`;
}

function main() {
  if (process.argv.includes('--list')) {
    process.stdout.write(`${JSON.stringify(scanRepository(), null, 2)}\n`);
    return;
  }
  try {
    const result = runGuard();
    const errors = [
      ...result.metadataErrors,
      ...result.unexpected.map(finding => `Unexpected unsafe execution: ${formatFinding(finding)}`),
      ...result.stale.map(entry => `Stale allowlist entry: ${entry.id} (${entry.path})`),
    ];
    if (errors.length > 0) {
      process.stderr.write(boundedDiagnosticOutput(errors));
      process.exitCode = 1;
    } else {
      process.stdout.write(`Unsafe-expression guard passed: ${result.findings.length} documented legacy sites.\n`);
    }
  } catch (error) {
    process.stderr.write(boundedDiagnosticOutput([`Unsafe-expression guard could not run: ${error.message}`]));
    process.exitCode = 1;
  }
}

if (require.main === module) main();

module.exports = {
  allowlistRelativePath,
  compareFindingsToAllowlist,
  documentationRelativePath,
  isManagedOrRemovedPath,
  isScannedSourcePath,
  maximumDiagnosticOutputBytes,
  maximumFindingsPerFile,
  maximumRepositoryFindings,
  normalizeRelativePath,
  runGuard,
  scanRepository,
  scanSource,
  sourceExclusionsRelativePath,
  validateAllowlist,
  validateSourceExclusions,
};
