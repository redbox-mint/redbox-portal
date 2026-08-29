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
const sourceExtensions = new Set(['.cjs', '.js', '.mjs', '.ts', '.tsx']);
const excludedPathPrefixes = ['assets/', 'support/', 'test/'];
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
const globalEvalObjects = new Set(['global', 'globalThis', 'self', 'window']);

function normalizeRelativePath(relativePath) {
  if (typeof relativePath !== 'string' || relativePath.length === 0 || relativePath.includes('\\')) {
    throw new Error(`Repository path must be a non-empty POSIX path: ${String(relativePath)}`);
  }
  if (path.posix.isAbsolute(relativePath)) {
    throw new Error(`Repository path must be relative: ${relativePath}`);
  }
  const normalized = path.posix.normalize(relativePath);
  if (normalized !== relativePath || normalized === '..' || normalized.startsWith('../')) {
    throw new Error(`Repository path is not normalized: ${relativePath}`);
  }
  return normalized;
}

function isScannedSourcePath(relativePath) {
  let normalized;
  try {
    normalized = normalizeRelativePath(relativePath);
  } catch {
    return false;
  }
  if (!sourceExtensions.has(path.posix.extname(normalized))) return false;
  if (excludedPathPrefixes.some(prefix => normalized.startsWith(prefix))) return false;
  return !normalized.split('/').some(segment => excludedPathSegments.has(segment));
}

function isManagedOrRemovedPath(relativePath) {
  return managedPathPrefixes.some(prefix => relativePath.startsWith(prefix)) || removedActionPaths.has(relativePath);
}

function scriptKind(relativePath) {
  switch (path.posix.extname(relativePath)) {
    case '.js':
      return ts.ScriptKind.JS;
    case '.cjs':
      return ts.ScriptKind.JS;
    case '.mjs':
      return ts.ScriptKind.JS;
    case '.tsx':
      return ts.ScriptKind.TSX;
    default:
      return ts.ScriptKind.TS;
  }
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

function literalPropertyName(node) {
  const current = unwrapExpression(node);
  if (ts.isStringLiteralLike(current) || ts.isNumericLiteral(current)) return current.text;
  return undefined;
}

function memberParts(node) {
  const current = unwrapExpression(node);
  if (ts.isPropertyAccessExpression(current)) {
    return { object: current.expression, property: current.name.text };
  }
  if (ts.isElementAccessExpression(current) && current.argumentExpression) {
    return { object: current.expression, property: literalPropertyName(current.argumentExpression) };
  }
  return undefined;
}

function requiredModuleName(node) {
  const current = unwrapExpression(node);
  if (
    !ts.isCallExpression(current) ||
    !ts.isIdentifier(unwrapExpression(current.expression)) ||
    unwrapExpression(current.expression).text !== 'require' ||
    current.arguments.length !== 1
  ) {
    return undefined;
  }
  return literalPropertyName(current.arguments[0]);
}

function isLodashModule(moduleName) {
  return moduleName === 'lodash' || moduleName === 'lodash-es';
}

function isLodashTemplateModule(moduleName) {
  return moduleName === 'lodash/template' || moduleName === 'lodash-es/template';
}

function collectBindings(sourceFile) {
  const lodashObjects = new Set(['_']);
  const lodashTemplates = new Set();
  const evalAliases = new Set(['eval']);

  function isGlobalEvalMember(node) {
    const parts = memberParts(node);
    if (!parts || parts.property !== 'eval') return false;
    const object = unwrapExpression(parts.object);
    return ts.isIdentifier(object) && globalEvalObjects.has(object.text);
  }

  function isEvalReference(node) {
    const current = unwrapExpression(node);
    if (ts.isIdentifier(current)) return evalAliases.has(current.text);
    if (isGlobalEvalMember(current)) return true;
    return (
      ts.isBinaryExpression(current) &&
      current.operatorToken.kind === ts.SyntaxKind.CommaToken &&
      isEvalReference(current.right)
    );
  }

  function isLodashObjectReference(node) {
    const current = unwrapExpression(node);
    if (ts.isIdentifier(current)) return lodashObjects.has(current.text);
    return isLodashModule(requiredModuleName(current));
  }

  function isLodashTemplateReference(node) {
    const current = unwrapExpression(node);
    if (ts.isIdentifier(current)) return lodashTemplates.has(current.text);
    if (isLodashTemplateModule(requiredModuleName(current))) return true;
    const parts = memberParts(current);
    return !!parts && parts.property === 'template' && isLodashObjectReference(parts.object);
  }

  function isCallableReference(node, referenceCheck) {
    if (referenceCheck(node)) return true;
    const parts = memberParts(node);
    return !!parts && ['apply', 'bind', 'call'].includes(parts.property) && referenceCheck(parts.object);
  }

  function bindName(name, initializer) {
    if (!initializer) return false;
    let changed = false;
    if (ts.isIdentifier(name)) {
      if (isLodashObjectReference(initializer) && !lodashObjects.has(name.text)) {
        lodashObjects.add(name.text);
        changed = true;
      }
      if (isLodashTemplateModule(requiredModuleName(initializer)) && !lodashTemplates.has(name.text)) {
        lodashTemplates.add(name.text);
        changed = true;
      }
      if (isLodashTemplateReference(initializer) && !lodashTemplates.has(name.text)) {
        lodashTemplates.add(name.text);
        changed = true;
      }
      if (isEvalReference(initializer) && !evalAliases.has(name.text)) {
        evalAliases.add(name.text);
        changed = true;
      }
      const currentInitializer = unwrapExpression(initializer);
      if (ts.isCallExpression(currentInitializer)) {
        const calledMember = memberParts(currentInitializer.expression);
        if (
          calledMember?.property === 'bind' &&
          isLodashTemplateReference(calledMember.object) &&
          !lodashTemplates.has(name.text)
        ) {
          lodashTemplates.add(name.text);
          changed = true;
        }
        if (calledMember?.property === 'bind' && isEvalReference(calledMember.object) && !evalAliases.has(name.text)) {
          evalAliases.add(name.text);
          changed = true;
        }
      }
      return changed;
    }
    if (!ts.isObjectBindingPattern(name)) return changed;
    const lodashSource = isLodashObjectReference(initializer);
    const currentInitializer = unwrapExpression(initializer);
    const globalEvalSource = ts.isIdentifier(currentInitializer) && globalEvalObjects.has(currentInitializer.text);
    for (const element of name.elements) {
      if (!ts.isIdentifier(element.name)) continue;
      const propertyName = element.propertyName
        ? ts.isIdentifier(element.propertyName)
          ? element.propertyName.text
          : literalPropertyName(element.propertyName)
        : element.name.text;
      if (lodashSource && propertyName === 'template' && !lodashTemplates.has(element.name.text)) {
        lodashTemplates.add(element.name.text);
        changed = true;
      }
      if (globalEvalSource && propertyName === 'eval' && !evalAliases.has(element.name.text)) {
        evalAliases.add(element.name.text);
        changed = true;
      }
    }
    return changed;
  }

  for (const statement of sourceFile.statements) {
    if (ts.isImportEqualsDeclaration(statement) && ts.isExternalModuleReference(statement.moduleReference)) {
      const moduleName = statement.moduleReference.expression
        ? literalPropertyName(statement.moduleReference.expression)
        : undefined;
      if (isLodashModule(moduleName)) lodashObjects.add(statement.name.text);
      if (isLodashTemplateModule(moduleName)) lodashTemplates.add(statement.name.text);
      continue;
    }
    if (!ts.isImportDeclaration(statement)) continue;
    const moduleName = literalPropertyName(statement.moduleSpecifier);
    if (!isLodashModule(moduleName) && !isLodashTemplateModule(moduleName)) continue;
    const clause = statement.importClause;
    if (!clause) continue;
    if (isLodashTemplateModule(moduleName)) {
      if (clause.name) lodashTemplates.add(clause.name.text);
      if (clause.namedBindings && ts.isNamespaceImport(clause.namedBindings)) {
        lodashTemplates.add(clause.namedBindings.name.text);
      }
      continue;
    }
    if (clause.name) lodashObjects.add(clause.name.text);
    if (clause.namedBindings && ts.isNamespaceImport(clause.namedBindings)) {
      lodashObjects.add(clause.namedBindings.name.text);
    }
    if (clause.namedBindings && ts.isNamedImports(clause.namedBindings)) {
      for (const element of clause.namedBindings.elements) {
        if ((element.propertyName ?? element.name).text === 'template') lodashTemplates.add(element.name.text);
      }
    }
  }

  let changed = true;
  while (changed) {
    changed = false;
    function visitAliases(node) {
      if (ts.isVariableDeclaration(node)) {
        changed = bindName(node.name, node.initializer) || changed;
      } else if (
        ts.isBinaryExpression(node) &&
        node.operatorToken.kind === ts.SyntaxKind.EqualsToken &&
        ts.isIdentifier(unwrapExpression(node.left))
      ) {
        changed = bindName(unwrapExpression(node.left), node.right) || changed;
      }
      ts.forEachChild(node, visitAliases);
    }
    visitAliases(sourceFile);
  }

  return {
    isEvalCallable: node => isCallableReference(node, isEvalReference),
    isLodashTemplateCallable: node => isCallableReference(node, isLodashTemplateReference),
  };
}

function findingFingerprint(kind, sourceText) {
  const normalizedSource = sourceText.replace(/\s+/g, ' ').trim();
  return `sha256:${crypto.createHash('sha256').update(`${kind}\0${normalizedSource}`).digest('hex')}`;
}

function scanSource(source, relativePath) {
  const normalizedPath = normalizeRelativePath(relativePath);
  const sourceFile = ts.createSourceFile(
    normalizedPath,
    source,
    ts.ScriptTarget.Latest,
    true,
    scriptKind(normalizedPath)
  );
  const bindings = collectBindings(sourceFile);
  const findings = [];

  function visit(node) {
    if (ts.isCallExpression(node)) {
      let kind;
      if (bindings.isEvalCallable(node.expression)) kind = 'direct-eval';
      else if (bindings.isLodashTemplateCallable(node.expression)) kind = 'lodash-template';
      if (kind) {
        const start = node.getStart(sourceFile);
        const location = sourceFile.getLineAndCharacterOfPosition(start);
        const sourceText = source.slice(start, node.end);
        findings.push({
          kind,
          path: normalizedPath,
          line: location.line + 1,
          column: location.character + 1,
          fingerprint: findingFingerprint(kind, sourceText),
        });
      }
    }
    ts.forEachChild(node, visit);
  }
  visit(sourceFile);
  return findings;
}

function trackedSourcePaths(root = repositoryRoot) {
  const output = execFileSync('git', ['ls-files', '-z'], { cwd: root, encoding: 'utf8' });
  return output.split('\0').filter(Boolean).map(normalizeRelativePath).filter(isScannedSourcePath).sort();
}

function scanRepository(root = repositoryRoot) {
  const findings = [];
  for (const relativePath of trackedSourcePaths(root)) {
    const absolutePath = path.join(root, ...relativePath.split('/'));
    const stats = fs.lstatSync(absolutePath);
    if (stats.isSymbolicLink()) throw new Error(`Refusing to scan source symlink: ${relativePath}`);
    if (!stats.isFile()) continue;
    findings.push(...scanSource(fs.readFileSync(absolutePath, 'utf8'), relativePath));
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

function markdownCell(value) {
  return String(value).replaceAll('|', '\\|').replaceAll('\n', ' ');
}

function documentationRow(entry) {
  return `| ${[
    `\`${entry.id}\``,
    `\`${entry.kind}\``,
    `\`${entry.path}\``,
    `\`${entry.owner}\``,
    `\`${entry.followUp}\``,
    entry.rationale,
  ]
    .map(markdownCell)
    .join(' | ')} |`;
}

function validateAllowlist(allowlist, documentation) {
  const errors = [];
  if (!allowlist || typeof allowlist !== 'object' || Array.isArray(allowlist)) {
    return ['Allowlist root must be an object.'];
  }
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
    if (typeof entry.id !== 'string' || !/^legacy-[a-z0-9-]+$/.test(entry.id)) {
      errors.push(`${label}.id must be a stable legacy identifier.`);
    } else if (ids.has(entry.id)) {
      errors.push(`${label}.id duplicates ${entry.id}.`);
    } else {
      ids.add(entry.id);
    }
    if (!allowedKinds.has(entry.kind)) errors.push(`${label}.kind is unsupported.`);
    try {
      normalizeRelativePath(entry.path);
      if (!isScannedSourcePath(entry.path)) errors.push(`${label}.path is outside the first-party source scan.`);
      if (isManagedOrRemovedPath(entry.path))
        errors.push(`${label}.path cannot allowlist managed or removed action code.`);
    } catch (error) {
      errors.push(`${label}.path is invalid: ${error.message}`);
    }
    if (typeof entry.fingerprint !== 'string' || !/^sha256:[a-f0-9]{64}$/.test(entry.fingerprint)) {
      errors.push(`${label}.fingerprint must be a sha256 fingerprint.`);
    }
    if (typeof entry.owner !== 'string' || entry.owner.trim().length < 3) {
      errors.push(`${label}.owner is required.`);
    }
    if (typeof entry.rationale !== 'string' || entry.rationale.trim().length < 20) {
      errors.push(`${label}.rationale must explain the legacy boundary.`);
    }
    if (typeof entry.followUp !== 'string' || !/^SEC-LEGACY-[A-Z0-9-]+$/.test(entry.followUp)) {
      errors.push(`${label}.followUp must be a SEC-LEGACY-* identifier.`);
    }
    const matchKey = `${entry.kind}\0${entry.path}\0${entry.fingerprint}`;
    if (matchKeys.has(matchKey)) errors.push(`${label} duplicates an allowlist call-site fingerprint.`);
    matchKeys.add(matchKey);
    if (documentation && !documentation.includes(documentationRow(entry))) {
      errors.push(`${label} is not explicitly mirrored in ${documentationRelativePath}.`);
    }
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
    if (!matches || matches.length === 0) unexpected.push(finding);
    else matches.pop();
  }
  const stale = [...pending.values()].flat();
  return { unexpected, stale };
}

function runGuard(root = repositoryRoot) {
  const allowlist = readJson(allowlistRelativePath, root);
  const documentation = fs.readFileSync(path.join(root, ...documentationRelativePath.split('/')), 'utf8');
  const metadataErrors = validateAllowlist(allowlist, documentation);
  const findings = scanRepository(root);
  const comparison = compareFindingsToAllowlist(findings, Array.isArray(allowlist.entries) ? allowlist.entries : []);
  return { allowlist, findings, metadataErrors, ...comparison };
}

function formatFinding(finding) {
  return `${finding.path}:${finding.line}:${finding.column} ${finding.kind} ${finding.fingerprint}`;
}

function main() {
  if (process.argv.includes('--list')) {
    process.stdout.write(`${JSON.stringify(scanRepository(), null, 2)}\n`);
    return;
  }
  let result;
  try {
    result = runGuard();
  } catch (error) {
    process.stderr.write(`Unsafe-expression guard could not run: ${error.message}\n`);
    process.exitCode = 1;
    return;
  }
  const errors = [...result.metadataErrors];
  errors.push(...result.unexpected.map(finding => `Unexpected unsafe execution: ${formatFinding(finding)}`));
  errors.push(...result.stale.map(entry => `Stale allowlist entry: ${entry.id} (${entry.path})`));
  if (errors.length > 0) {
    process.stderr.write(`${errors.join('\n')}\n`);
    process.exitCode = 1;
    return;
  }
  process.stdout.write(`Unsafe-expression guard passed: ${result.findings.length} documented legacy sites.\n`);
}

if (require.main === module) main();

module.exports = {
  allowlistRelativePath,
  compareFindingsToAllowlist,
  documentationRelativePath,
  documentationRow,
  isManagedOrRemovedPath,
  isScannedSourcePath,
  normalizeRelativePath,
  runGuard,
  scanRepository,
  scanSource,
  validateAllowlist,
};
