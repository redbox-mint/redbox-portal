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
const globalEvalObjects = new Set(['global', 'globalThis', 'self', 'window']);
const allowedExclusionRootKeys = new Set(['schemaVersion', 'documentation', 'entries']);
const allowedExclusionEntryKeys = new Set(['path', 'kind', 'source', 'rationale']);
const allowedExclusionKinds = new Set(['generated', 'vendored']);
const origins = Object.freeze({
  builtinEval: 'builtin-eval',
  evalBind: 'eval-bind',
  evalInvoker: 'eval-invoker',
  globalObject: 'global-object',
  lodashObject: 'lodash-object',
  lodashRunInContext: 'lodash-run-in-context',
  lodashRunInContextBind: 'lodash-run-in-context-bind',
  lodashRunInContextInvoker: 'lodash-run-in-context-invoker',
  lodashTemplate: 'lodash-template',
  lodashTemplateBind: 'lodash-template-bind',
  lodashTemplateInvoker: 'lodash-template-invoker',
  lodashTemplateNamespace: 'lodash-template-namespace',
  reflectApply: 'reflect-apply',
  reflectApplyApply: 'reflect-apply-apply',
  reflectApplyBind: 'reflect-apply-bind',
  reflectApplyCall: 'reflect-apply-call',
  reflectConstruct: 'reflect-construct',
  reflectConstructApply: 'reflect-construct-apply',
  reflectConstructBind: 'reflect-construct-bind',
  reflectConstructCall: 'reflect-construct-call',
  reflectObject: 'reflect-object',
});

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
  if (path.posix.isAbsolute(relativePath)) {
    throw new Error(`Repository path must be relative: ${relativePath}`);
  }
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
  if (!sourceExtensions.has(path.posix.extname(normalized))) return false;
  if (excludedPathPrefixes.some(prefix => normalized.startsWith(prefix))) return false;
  if (excludedSourcePaths.has(normalized)) return false;
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
    case '.jsx':
      return ts.ScriptKind.JSX;
    case '.cts':
    case '.mts':
    case '.ts':
      return ts.ScriptKind.TS;
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

function isLodashModule(moduleName) {
  return moduleName === 'lodash' || moduleName === 'lodash-es';
}

function isLodashTemplateModule(moduleName) {
  return /^(lodash|lodash-es)\/template(?:\.js)?$/.test(moduleName ?? '');
}

function collectBindings(sourceFile) {
  const nodeScopes = new WeakMap();
  const declarationBindings = new WeakMap();
  const boundReflectAtoms = new WeakMap();
  const carrierAtoms = new WeakMap();
  const literalAtoms = new Map();
  let propagationChanged = false;

  function createScope(parent, kind) {
    return { parent, kind, bindings: new Map() };
  }

  const rootScope = createScope(undefined, 'source');

  function mergeValue(target, source) {
    let changed = false;
    for (const atom of source) {
      if (!target.has(atom)) {
        target.add(atom);
        changed = true;
      }
    }
    return changed;
  }

  function mergeTracked(target, source) {
    if (mergeValue(target, source)) propagationChanged = true;
  }

  function originValue(...values) {
    return new Set(values);
  }

  function literalValue(value) {
    const key = `${typeof value}\0${String(value)}`;
    let atom = literalAtoms.get(key);
    if (!atom) {
      atom = { kind: 'literal', value };
      literalAtoms.set(key, atom);
    }
    return new Set([atom]);
  }

  function carrierFor(node) {
    let atom = carrierAtoms.get(node);
    if (!atom) {
      atom = { kind: 'carrier', properties: new Map(), unknownProperty: new Set() };
      carrierAtoms.set(node, atom);
    }
    return atom;
  }

  function declareIdentifier(identifier, scope) {
    let binding = scope.bindings.get(identifier.text);
    if (!binding) {
      binding = { name: identifier.text, value: new Set() };
      scope.bindings.set(identifier.text, binding);
    }
    declarationBindings.set(identifier, binding);
    return binding;
  }

  function declareBindingName(name, scope) {
    if (ts.isIdentifier(name)) {
      declareIdentifier(name, scope);
      return;
    }
    for (const element of name.elements) {
      if (ts.isBindingElement(element)) declareBindingName(element.name, scope);
    }
  }

  function nearestVariableScope(scope) {
    let current = scope;
    while (current.kind !== 'function' && current.kind !== 'source') current = current.parent;
    return current;
  }

  function variableDeclarationScope(node, scope) {
    const declarationList = node.parent;
    if (ts.isVariableDeclarationList(declarationList) && (declarationList.flags & ts.NodeFlags.BlockScoped) === 0) {
      return nearestVariableScope(scope);
    }
    return scope;
  }

  function lookupBinding(identifier) {
    let scope = nodeScopes.get(identifier);
    while (scope) {
      const binding = scope.bindings.get(identifier.text);
      if (binding) return binding;
      scope = scope.parent;
    }
    return undefined;
  }

  function moduleValue(moduleName, namespaceImport = false) {
    if (isLodashModule(moduleName)) return originValue(origins.lodashObject);
    if (isLodashTemplateModule(moduleName)) {
      return originValue(namespaceImport ? origins.lodashTemplateNamespace : origins.lodashTemplate);
    }
    return new Set();
  }

  function seedImportBinding(identifier, value) {
    const binding = declarationBindings.get(identifier);
    if (binding) mergeValue(binding.value, value);
  }

  function seedImportDeclaration(node) {
    const moduleName = literalPropertyName(node.moduleSpecifier);
    if (!isLodashModule(moduleName) && !isLodashTemplateModule(moduleName)) return;
    const clause = node.importClause;
    if (!clause) return;

    if (clause.name) seedImportBinding(clause.name, moduleValue(moduleName));
    if (clause.namedBindings && ts.isNamespaceImport(clause.namedBindings)) {
      seedImportBinding(clause.namedBindings.name, moduleValue(moduleName, isLodashTemplateModule(moduleName)));
    }
    if (!clause.namedBindings || !ts.isNamedImports(clause.namedBindings)) return;
    for (const element of clause.namedBindings.elements) {
      const importedName = (element.propertyName ?? element.name).text;
      if (isLodashTemplateModule(moduleName)) {
        if (importedName === 'default' || importedName === 'template') {
          seedImportBinding(element.name, originValue(origins.lodashTemplate));
        }
      } else if (importedName === 'default') {
        seedImportBinding(element.name, originValue(origins.lodashObject));
      } else if (importedName === 'template') {
        seedImportBinding(element.name, originValue(origins.lodashTemplate));
      } else if (importedName === 'runInContext') {
        seedImportBinding(element.name, originValue(origins.lodashRunInContext));
      }
    }
  }

  function visitDecorators(node, scope) {
    if (!ts.canHaveDecorators(node)) return;
    for (const decorator of ts.getDecorators(node) ?? []) visitScopes(decorator, scope);
  }

  function visitScopes(node, scope) {
    nodeScopes.set(node, scope);

    if (ts.isImportDeclaration(node)) {
      const clause = node.importClause;
      if (clause?.name) declareIdentifier(clause.name, scope);
      if (clause?.namedBindings && ts.isNamespaceImport(clause.namedBindings)) {
        declareIdentifier(clause.namedBindings.name, scope);
      }
      if (clause?.namedBindings && ts.isNamedImports(clause.namedBindings)) {
        for (const element of clause.namedBindings.elements) declareIdentifier(element.name, scope);
      }
      seedImportDeclaration(node);
      ts.forEachChild(node, child => visitScopes(child, scope));
      return;
    }

    if (ts.isImportEqualsDeclaration(node)) {
      const binding = declareIdentifier(node.name, scope);
      if (ts.isExternalModuleReference(node.moduleReference) && node.moduleReference.expression) {
        mergeValue(binding.value, moduleValue(literalPropertyName(node.moduleReference.expression)));
      }
      ts.forEachChild(node, child => visitScopes(child, scope));
      return;
    }

    if (ts.isVariableDeclaration(node)) {
      declareBindingName(node.name, variableDeclarationScope(node, scope));
      ts.forEachChild(node, child => visitScopes(child, scope));
      return;
    }

    if (ts.isFunctionDeclaration(node) && node.name) declareIdentifier(node.name, scope);
    if (ts.isClassDeclaration(node) && node.name) declareIdentifier(node.name, scope);
    if (ts.isEnumDeclaration(node) || ts.isModuleDeclaration(node)) declareIdentifier(node.name, scope);

    if (ts.isFunctionLike(node)) {
      visitDecorators(node, scope);
      if (node.name && ts.isComputedPropertyName(node.name)) visitScopes(node.name, scope);
      const functionScope = createScope(scope, 'function');
      nodeScopes.set(node, functionScope);
      if (ts.isFunctionExpression(node) && node.name) declareIdentifier(node.name, functionScope);
      for (const parameter of node.parameters) declareBindingName(parameter.name, functionScope);
      for (const parameter of node.parameters) visitScopes(parameter, functionScope);
      if (node.body) visitScopes(node.body, functionScope);
      return;
    }

    if (ts.isClassDeclaration(node) || ts.isClassExpression(node)) {
      const classScope = createScope(scope, 'block');
      nodeScopes.set(node, classScope);
      if (node.name) declareIdentifier(node.name, classScope);
      ts.forEachChild(node, child => visitScopes(child, classScope));
      return;
    }

    if (ts.isCatchClause(node)) {
      const catchScope = createScope(scope, 'block');
      nodeScopes.set(node, catchScope);
      if (node.variableDeclaration) declareBindingName(node.variableDeclaration.name, catchScope);
      if (node.variableDeclaration) visitScopes(node.variableDeclaration, catchScope);
      visitScopes(node.block, catchScope);
      return;
    }

    if (ts.isForStatement(node) || ts.isForInStatement(node) || ts.isForOfStatement(node)) {
      const loopScope = createScope(scope, 'block');
      nodeScopes.set(node, loopScope);
      ts.forEachChild(node, child => visitScopes(child, loopScope));
      return;
    }

    if (ts.isBlock(node) || ts.isCaseBlock(node) || ts.isModuleBlock(node)) {
      const blockScope = createScope(scope, 'block');
      nodeScopes.set(node, blockScope);
      ts.forEachChild(node, child => visitScopes(child, blockScope));
      return;
    }

    ts.forEachChild(node, child => visitScopes(child, scope));
  }

  visitScopes(sourceFile, rootScope);

  function identifierValue(identifier) {
    const binding = lookupBinding(identifier);
    if (binding) return new Set(binding.value);
    if (identifier.text === 'eval') return originValue(origins.builtinEval);
    if (identifier.text === '_') return originValue(origins.lodashObject);
    if (globalEvalObjects.has(identifier.text)) return originValue(origins.globalObject);
    if (identifier.text === 'Reflect') return originValue(origins.reflectObject);
    return new Set();
  }

  function specialProperty(origin, propertyName) {
    const result = new Set();
    const unknown = propertyName === undefined;
    const matches = name => unknown || propertyName === name;

    if (origin === origins.builtinEval) {
      if (matches('call') || matches('apply')) result.add(origins.evalInvoker);
      if (matches('bind')) result.add(origins.evalBind);
    } else if (origin === origins.evalInvoker) {
      if (matches('bind')) result.add(origins.evalBind);
    } else if (origin === origins.globalObject) {
      if (matches('eval')) result.add(origins.builtinEval);
      if (matches('Reflect')) result.add(origins.reflectObject);
      if ([...globalEvalObjects].some(matches)) result.add(origins.globalObject);
    } else if (origin === origins.reflectObject) {
      if (matches('apply')) result.add(origins.reflectApply);
      if (matches('construct')) result.add(origins.reflectConstruct);
    } else if (origin === origins.reflectApply) {
      if (matches('bind')) result.add(origins.reflectApplyBind);
      if (matches('call')) result.add(origins.reflectApplyCall);
      if (matches('apply')) result.add(origins.reflectApplyApply);
    } else if (origin === origins.reflectConstruct) {
      if (matches('bind')) result.add(origins.reflectConstructBind);
      if (matches('call')) result.add(origins.reflectConstructCall);
      if (matches('apply')) result.add(origins.reflectConstructApply);
    } else if (origin === origins.lodashObject) {
      if (matches('template')) result.add(origins.lodashTemplate);
      if (matches('runInContext')) result.add(origins.lodashRunInContext);
      if (matches('default')) result.add(origins.lodashObject);
    } else if (origin === origins.lodashTemplateNamespace) {
      if (matches('default') || matches('template')) result.add(origins.lodashTemplate);
    } else if (origin === origins.lodashTemplate) {
      if (matches('call') || matches('apply')) result.add(origins.lodashTemplateInvoker);
      if (matches('bind')) result.add(origins.lodashTemplateBind);
      if (matches('default')) result.add(origins.lodashTemplate);
    } else if (origin === origins.lodashTemplateInvoker) {
      if (matches('bind')) result.add(origins.lodashTemplateBind);
    } else if (origin === origins.lodashRunInContext) {
      if (matches('bind')) result.add(origins.lodashRunInContextBind);
      if (matches('call') || matches('apply')) result.add(origins.lodashRunInContextInvoker);
    }
    return result;
  }

  function staticPropertyNames(node) {
    const current = unwrapExpression(node);
    if (ts.isComputedPropertyName(current)) return staticPropertyNames(current.expression);
    if (ts.isStringLiteralLike(current) || ts.isNumericLiteral(current)) return [String(current.text)];
    const names = [];
    for (const atom of evaluateExpression(current)) {
      if (typeof atom !== 'string' && atom.kind === 'literal') names.push(String(atom.value));
    }
    return [...new Set(names)];
  }

  function declaredPropertyNames(node) {
    if (ts.isComputedPropertyName(node)) {
      const names = staticPropertyNames(node.expression);
      return names.length > 0 ? names : undefined;
    }
    if (ts.isIdentifier(node) || ts.isPrivateIdentifier(node)) return [node.text];
    const name = literalPropertyName(node);
    return name === undefined ? undefined : [String(name)];
  }

  function memberPropertyNames(node) {
    const current = unwrapExpression(node);
    if (ts.isPropertyAccessExpression(current)) return [current.name.text];
    if (!ts.isElementAccessExpression(current) || !current.argumentExpression) return undefined;
    const names = staticPropertyNames(current.argumentExpression);
    return names.length > 0 ? names : undefined;
  }

  function getProperty(value, propertyNames) {
    const result = new Set();
    for (const atom of value) {
      if (typeof atom === 'string') {
        if (propertyNames === undefined) mergeValue(result, specialProperty(atom, undefined));
        else for (const propertyName of propertyNames) mergeValue(result, specialProperty(atom, propertyName));
        continue;
      }
      if (atom.kind !== 'carrier') continue;
      if (propertyNames === undefined) {
        for (const propertyValue of atom.properties.values()) mergeValue(result, propertyValue);
      } else {
        for (const propertyName of propertyNames) {
          const propertyValue = atom.properties.get(propertyName);
          if (propertyValue) mergeValue(result, propertyValue);
        }
      }
      mergeValue(result, atom.unknownProperty);
    }
    return result;
  }

  function putCarrierProperty(carrier, propertyNames, value) {
    if (propertyNames === undefined) {
      mergeTracked(carrier.unknownProperty, value);
      return;
    }
    for (const propertyName of propertyNames) {
      let target = carrier.properties.get(propertyName);
      if (!target) {
        target = new Set();
        carrier.properties.set(propertyName, target);
      }
      mergeTracked(target, value);
    }
  }

  function spreadProperties(carrier, value) {
    for (const atom of value) {
      if (typeof atom === 'string') {
        for (const propertyName of ['default', 'runInContext', 'template']) {
          const propertyValue = specialProperty(atom, propertyName);
          if (propertyValue.size > 0) putCarrierProperty(carrier, [propertyName], propertyValue);
        }
      } else if (atom.kind === 'carrier') {
        for (const [propertyName, propertyValue] of atom.properties) {
          putCarrierProperty(carrier, [propertyName], propertyValue);
        }
        putCarrierProperty(carrier, undefined, atom.unknownProperty);
      }
    }
  }

  function arrayRestValue(value, startIndex, node) {
    const restCarrier = carrierFor(node);
    for (const atom of value) {
      if (typeof atom === 'string' || atom.kind !== 'carrier') continue;
      for (const [propertyName, propertyValue] of atom.properties) {
        if (!/^(0|[1-9]\d*)$/.test(propertyName)) continue;
        const sourceIndex = Number(propertyName);
        if (!Number.isSafeInteger(sourceIndex) || sourceIndex < startIndex) continue;
        putCarrierProperty(restCarrier, [String(sourceIndex - startIndex)], propertyValue);
      }
      putCarrierProperty(restCarrier, undefined, atom.unknownProperty);
    }
    return new Set([restCarrier]);
  }

  function isUnboundRequireCall(node) {
    const current = unwrapExpression(node);
    if (!ts.isCallExpression(current) || current.arguments.length !== 1) return false;
    const callee = unwrapExpression(current.expression);
    return ts.isIdentifier(callee) && callee.text === 'require' && !lookupBinding(callee);
  }

  function boundReflectInvoker(node, operation) {
    let atom = boundReflectAtoms.get(node);
    if (!atom) {
      atom = { kind: 'bound-reflect-invoker', operation, boundArguments: [] };
      boundReflectAtoms.set(node, atom);
    }
    for (const [index, argument] of node.arguments.slice(1).entries()) {
      let argumentValue = atom.boundArguments[index];
      if (!argumentValue) {
        argumentValue = new Set();
        atom.boundArguments[index] = argumentValue;
      }
      mergeTracked(argumentValue, evaluateExpression(argument));
    }
    return atom;
  }

  function reflectInvocationTargets(callee, node) {
    const targets = new Set();
    for (const atom of callee) {
      if (atom === origins.reflectApply || atom === origins.reflectConstruct) {
        if (node.arguments[0]) mergeValue(targets, evaluateExpression(node.arguments[0]));
      } else if (atom === origins.reflectApplyCall || atom === origins.reflectConstructCall) {
        if (node.arguments[1]) mergeValue(targets, evaluateExpression(node.arguments[1]));
      } else if (atom === origins.reflectApplyApply || atom === origins.reflectConstructApply) {
        if (node.arguments[1]) {
          mergeValue(targets, getProperty(evaluateExpression(node.arguments[1]), ['0']));
        }
      } else if (typeof atom !== 'string' && atom.kind === 'bound-reflect-invoker') {
        if (atom.boundArguments[0]) mergeValue(targets, atom.boundArguments[0]);
        else if (node.arguments[0]) mergeValue(targets, evaluateExpression(node.arguments[0]));
      }
    }
    return targets;
  }

  function mergeKnownCallResult(result, callable) {
    for (const atom of callable) {
      if (atom === origins.evalBind) result.add(origins.builtinEval);
      else if (atom === origins.lodashTemplateBind) result.add(origins.lodashTemplate);
      else if (atom === origins.lodashRunInContextBind) result.add(origins.lodashRunInContext);
      else if (atom === origins.lodashRunInContext || atom === origins.lodashRunInContextInvoker) {
        result.add(origins.lodashObject);
      }
    }
  }

  function evaluateCallResult(callee, node) {
    const result = new Set();
    for (const atom of callee) {
      if (atom === origins.reflectApplyBind) result.add(boundReflectInvoker(node, 'apply'));
      else if (atom === origins.reflectConstructBind) result.add(boundReflectInvoker(node, 'construct'));
    }
    mergeKnownCallResult(result, callee);
    mergeKnownCallResult(result, reflectInvocationTargets(callee, node));
    return result;
  }

  function evaluateExpression(node) {
    if (!node) return new Set();
    const current = unwrapExpression(node);
    if (ts.isIdentifier(current)) return identifierValue(current);
    if (ts.isStringLiteralLike(current) || ts.isNumericLiteral(current)) return literalValue(current.text);
    if (current.kind === ts.SyntaxKind.TrueKeyword) return literalValue(true);
    if (current.kind === ts.SyntaxKind.FalseKeyword) return literalValue(false);
    if (ts.isNoSubstitutionTemplateLiteral(current)) return literalValue(current.text);

    if (ts.isPropertyAccessExpression(current) || ts.isElementAccessExpression(current)) {
      return getProperty(evaluateExpression(current.expression), memberPropertyNames(current));
    }

    if (ts.isObjectLiteralExpression(current)) {
      const carrier = carrierFor(current);
      for (const property of current.properties) {
        if (ts.isPropertyAssignment(property)) {
          putCarrierProperty(carrier, declaredPropertyNames(property.name), evaluateExpression(property.initializer));
        } else if (ts.isShorthandPropertyAssignment(property)) {
          putCarrierProperty(carrier, [property.name.text], evaluateExpression(property.name));
        } else if (ts.isSpreadAssignment(property)) {
          spreadProperties(carrier, evaluateExpression(property.expression));
        }
      }
      return new Set([carrier]);
    }

    if (ts.isArrayLiteralExpression(current)) {
      const carrier = carrierFor(current);
      for (const [index, element] of current.elements.entries()) {
        if (ts.isOmittedExpression(element)) continue;
        if (ts.isSpreadElement(element)) {
          putCarrierProperty(carrier, undefined, getProperty(evaluateExpression(element.expression), undefined));
        } else {
          putCarrierProperty(carrier, [String(index)], evaluateExpression(element));
        }
      }
      return new Set([carrier]);
    }

    if (ts.isCallExpression(current)) {
      if (isUnboundRequireCall(current)) return moduleValue(literalPropertyName(current.arguments[0]));
      return evaluateCallResult(evaluateExpression(current.expression), current);
    }

    if (ts.isConditionalExpression(current)) {
      const result = evaluateExpression(current.whenTrue);
      mergeValue(result, evaluateExpression(current.whenFalse));
      return result;
    }

    if (ts.isBinaryExpression(current)) {
      if (current.operatorToken.kind === ts.SyntaxKind.CommaToken) return evaluateExpression(current.right);
      if (
        current.operatorToken.kind === ts.SyntaxKind.BarBarToken ||
        current.operatorToken.kind === ts.SyntaxKind.AmpersandAmpersandToken ||
        current.operatorToken.kind === ts.SyntaxKind.QuestionQuestionToken
      ) {
        const result = evaluateExpression(current.left);
        mergeValue(result, evaluateExpression(current.right));
        return result;
      }
      if (current.operatorToken.kind === ts.SyntaxKind.EqualsToken) return evaluateExpression(current.right);
    }

    if (ts.isAwaitExpression(current) || ts.isYieldExpression(current) || ts.isSpreadElement(current)) {
      return evaluateExpression(current.expression);
    }
    return new Set();
  }

  function bindingForDeclarationName(identifier) {
    return declarationBindings.get(identifier) ?? lookupBinding(identifier);
  }

  function bindingElementPropertyNames(element) {
    if (element.propertyName) return declaredPropertyNames(element.propertyName);
    return ts.isIdentifier(element.name) ? [element.name.text] : undefined;
  }

  function bindPattern(name, value) {
    if (ts.isIdentifier(name)) {
      const binding = bindingForDeclarationName(name);
      if (binding) mergeTracked(binding.value, value);
      return;
    }
    if (ts.isObjectBindingPattern(name)) {
      for (const element of name.elements) {
        let elementValue = element.dotDotDotToken ? value : getProperty(value, bindingElementPropertyNames(element));
        if (element.initializer) {
          elementValue = new Set(elementValue);
          mergeValue(elementValue, evaluateExpression(element.initializer));
        }
        bindPattern(element.name, elementValue);
      }
      return;
    }
    for (const [index, element] of name.elements.entries()) {
      if (!ts.isBindingElement(element)) continue;
      let elementValue = element.dotDotDotToken
        ? arrayRestValue(value, index, element)
        : getProperty(value, [String(index)]);
      if (element.initializer) {
        elementValue = new Set(elementValue);
        mergeValue(elementValue, evaluateExpression(element.initializer));
      }
      bindPattern(element.name, elementValue);
    }
  }

  function assignToTarget(node, value) {
    const current = unwrapExpression(node);
    if (ts.isIdentifier(current)) {
      const binding = lookupBinding(current);
      if (binding) mergeTracked(binding.value, value);
      return;
    }
    if (ts.isPropertyAccessExpression(current) || ts.isElementAccessExpression(current)) {
      for (const atom of evaluateExpression(current.expression)) {
        if (typeof atom !== 'string' && atom.kind === 'carrier') {
          putCarrierProperty(atom, memberPropertyNames(current), value);
        }
      }
      return;
    }
    if (ts.isArrayLiteralExpression(current)) {
      for (const [index, element] of current.elements.entries()) {
        if (ts.isOmittedExpression(element)) continue;
        if (ts.isSpreadElement(element)) assignToTarget(element.expression, arrayRestValue(value, index, element));
        else assignToTarget(element, getProperty(value, [String(index)]));
      }
      return;
    }
    if (ts.isObjectLiteralExpression(current)) {
      for (const property of current.properties) {
        if (ts.isShorthandPropertyAssignment(property)) {
          assignToTarget(property.name, getProperty(value, [property.name.text]));
        } else if (ts.isPropertyAssignment(property)) {
          assignToTarget(property.initializer, getProperty(value, declaredPropertyNames(property.name)));
        } else if (ts.isSpreadAssignment(property)) {
          assignToTarget(property.expression, value);
        }
      }
    }
  }

  function ambientGlobalValue(name) {
    if (!ts.isIdentifier(name)) return new Set();
    if (name.text === 'eval') return originValue(origins.builtinEval);
    if (name.text === '_') return originValue(origins.lodashObject);
    if (globalEvalObjects.has(name.text)) return originValue(origins.globalObject);
    if (name.text === 'Reflect') return originValue(origins.reflectObject);
    return new Set();
  }

  function isAmbientVariableDeclaration(node) {
    const statement = node.parent?.parent;
    return (
      ts.isVariableStatement(statement) &&
      statement.modifiers?.some(modifier => modifier.kind === ts.SyntaxKind.DeclareKeyword)
    );
  }

  function visitPropagation(node) {
    if (ts.isVariableDeclaration(node)) {
      if (node.initializer) bindPattern(node.name, evaluateExpression(node.initializer));
      else if (isAmbientVariableDeclaration(node)) bindPattern(node.name, ambientGlobalValue(node.name));
    } else if (
      ts.isBinaryExpression(node) &&
      [
        ts.SyntaxKind.EqualsToken,
        ts.SyntaxKind.AmpersandAmpersandEqualsToken,
        ts.SyntaxKind.BarBarEqualsToken,
        ts.SyntaxKind.QuestionQuestionEqualsToken,
      ].includes(node.operatorToken.kind)
    ) {
      assignToTarget(node.left, evaluateExpression(node.right));
    } else if (ts.isObjectLiteralExpression(node) || ts.isArrayLiteralExpression(node)) {
      evaluateExpression(node);
    }
    ts.forEachChild(node, visitPropagation);
  }

  do {
    propagationChanged = false;
    visitPropagation(sourceFile);
  } while (propagationChanged);

  function dangerousKinds(value) {
    const kinds = new Set();
    if (value.has(origins.builtinEval) || value.has(origins.evalInvoker)) kinds.add('direct-eval');
    if (value.has(origins.lodashTemplate) || value.has(origins.lodashTemplateInvoker)) {
      kinds.add('lodash-template');
    }
    return kinds;
  }

  function unsafeKindsForCall(node) {
    const callee = evaluateExpression(node.expression);
    const kinds = dangerousKinds(callee);
    for (const kind of dangerousKinds(reflectInvocationTargets(callee, node))) kinds.add(kind);
    return kinds;
  }

  function unsafeKindsForExpression(node) {
    return dangerousKinds(evaluateExpression(node));
  }

  return { unsafeKindsForCall, unsafeKindsForExpression };
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

  function addFindings(node, kinds) {
    for (const kind of kinds) {
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

  function visit(node) {
    if (ts.isCallExpression(node)) {
      addFindings(node, bindings.unsafeKindsForCall(node));
    } else if (ts.isNewExpression(node)) {
      addFindings(node, bindings.unsafeKindsForExpression(node.expression));
    } else if (ts.isTaggedTemplateExpression(node)) {
      addFindings(node, bindings.unsafeKindsForExpression(node.tag));
    }
    ts.forEachChild(node, visit);
  }
  visit(sourceFile);
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

function sourceExclusionDocumentationRow(entry) {
  return `| ${[`\`${entry.path}\``, `\`${entry.kind}\``, entry.source, entry.rationale]
    .map(markdownCell)
    .join(' | ')} |`;
}

function validateSourceExclusions(manifest, documentation, root = repositoryRoot) {
  const errors = [];
  if (!manifest || typeof manifest !== 'object' || Array.isArray(manifest)) {
    return ['Source-exclusion manifest root must be an object.'];
  }
  if (!ownKeysAre(manifest, allowedExclusionRootKeys)) {
    errors.push('Source-exclusion manifest root contains unknown fields.');
  }
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
    let normalizedPath;
    try {
      normalizedPath = normalizeRelativePath(entry.path);
      if (!normalizedPath.startsWith('assets/')) errors.push(`${label}.path must name an assets file.`);
      if (!sourceExtensions.has(path.posix.extname(normalizedPath))) {
        errors.push(`${label}.path must name a JavaScript or TypeScript source file.`);
      }
      if (paths.has(normalizedPath)) errors.push(`${label}.path duplicates ${normalizedPath}.`);
      paths.add(normalizedPath);
      const absolutePath = path.join(root, ...normalizedPath.split('/'));
      if (!fs.existsSync(absolutePath) || !fs.lstatSync(absolutePath).isFile()) {
        errors.push(`${label}.path does not name a regular repository file.`);
      } else {
        try {
          execFileSync('git', ['ls-files', '--error-unmatch', '--', normalizedPath], {
            cwd: root,
            stdio: 'ignore',
          });
        } catch {
          errors.push(`${label}.path must name a Git-tracked file.`);
        }
      }
    } catch (error) {
      errors.push(`${label}.path is invalid: ${error.message}`);
    }
    if (!allowedExclusionKinds.has(entry.kind)) errors.push(`${label}.kind must be generated or vendored.`);
    if (typeof entry.source !== 'string' || entry.source.trim().length < 10) {
      errors.push(`${label}.source must identify the upstream or generator.`);
    }
    if (typeof entry.rationale !== 'string' || entry.rationale.trim().length < 20) {
      errors.push(`${label}.rationale must explain why first-party review does not apply.`);
    }
    if (documentation && !documentation.includes(sourceExclusionDocumentationRow(entry))) {
      errors.push(`${label} is not explicitly mirrored in ${documentationRelativePath}.`);
    }
  }
  return errors;
}

function validateAllowlist(allowlist, documentation, excludedSourcePaths = defaultSourceExclusionPaths) {
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
      if (!isScannedSourcePath(entry.path, excludedSourcePaths)) {
        errors.push(`${label}.path is outside the first-party source scan.`);
      }
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
  const sourceExclusions = readJson(sourceExclusionsRelativePath, root);
  const documentation = fs.readFileSync(path.join(root, ...documentationRelativePath.split('/')), 'utf8');
  const excludedSourcePaths = new Set(
    Array.isArray(sourceExclusions.entries) ? sourceExclusions.entries.map(entry => entry.path) : []
  );
  const metadataErrors = [
    ...validateSourceExclusions(sourceExclusions, documentation, root),
    ...validateAllowlist(allowlist, documentation, excludedSourcePaths),
  ];
  const findings = scanRepository(root, excludedSourcePaths);
  const comparison = compareFindingsToAllowlist(findings, Array.isArray(allowlist.entries) ? allowlist.entries : []);
  return { allowlist, findings, metadataErrors, sourceExclusions, ...comparison };
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
  sourceExclusionDocumentationRow,
  sourceExclusionsRelativePath,
  validateAllowlist,
  validateSourceExclusions,
};
