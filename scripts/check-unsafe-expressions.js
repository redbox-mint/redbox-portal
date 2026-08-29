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
const maximumTrackedInvocationArguments = 64;
const maximumTrackedPositionalAlternatives = 64;
const maximumCallableRecursionDepth = 128;
const maximumDependencyCompositionWork = 4096;
const maximumReturnProvenanceWork = 8192;
const maximumAnalysisWork = 262144;
const maximumSyntacticNesting = 256;
const maximumFindingsPerFile = 128;
const maximumRepositoryFindings = 512;
const maximumDiagnosticOutputBytes = 65536;
const analysisLimitKind = 'analysis-limit';
const unknownReflectTargetLimitKind = `${analysisLimitKind}:unknown-reflect-target`;
const iteratorPropertyName = '\0Symbol.iterator';
const positionalMutationMethods = new Set([
  'copyWithin',
  'fill',
  'pop',
  'push',
  'reverse',
  'shift',
  'sort',
  'splice',
  'unshift',
]);
const origins = Object.freeze({
  arrayFrom: 'array-from',
  arrayObject: 'array-object',
  arrayPrototype: 'array-prototype',
  builtinEval: 'builtin-eval',
  dateObject: 'date-object',
  functionObject: 'function-object',
  functionPrototype: 'function-prototype',
  functionPrototypeApply: 'function-prototype-apply',
  functionPrototypeBind: 'function-prototype-bind',
  functionPrototypeCall: 'function-prototype-call',
  globalObject: 'global-object',
  jsonObject: 'json-object',
  knownSafeCallable: 'known-safe-callable',
  lodashObject: 'lodash-object',
  lodashRunInContext: 'lodash-run-in-context',
  lodashTemplate: 'lodash-template',
  lodashTemplateNamespace: 'lodash-template-namespace',
  objectAssign: 'object-assign',
  objectCreate: 'object-create',
  objectDefineProperties: 'object-define-properties',
  objectDefineProperty: 'object-define-property',
  objectGetOwnPropertyDescriptor: 'object-get-own-property-descriptor',
  objectGetOwnPropertyDescriptors: 'object-get-own-property-descriptors',
  objectGetPrototypeOf: 'object-get-prototype-of',
  objectObject: 'object-object',
  objectPrototype: 'object-prototype',
  objectPrototypeDefineGetter: 'object-prototype-define-getter',
  objectPrototypeDefineSetter: 'object-prototype-define-setter',
  objectPrototypeSetPrototype: 'object-prototype-set-prototype',
  objectSetPrototypeOf: 'object-set-prototype-of',
  reflectApply: 'reflect-apply',
  reflectConstruct: 'reflect-construct',
  reflectDeleteProperty: 'reflect-delete-property',
  reflectDefineProperty: 'reflect-define-property',
  reflectGet: 'reflect-get',
  reflectGetOwnPropertyDescriptor: 'reflect-get-own-property-descriptor',
  reflectGetPrototypeOf: 'reflect-get-prototype-of',
  reflectObject: 'reflect-object',
  reflectSet: 'reflect-set',
  reflectSetPrototypeOf: 'reflect-set-prototype-of',
  symbolObject: 'symbol-object',
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
  const boundCallableAtoms = new WeakMap();
  const carrierAtoms = new WeakMap();
  const functionAtoms = new WeakMap();
  const functionReturnProvenance = new WeakMap();
  const invocationMethodAtoms = new WeakMap();
  const iteratorInvocationAtoms = new WeakMap();
  const literalAtoms = new Map();
  const positionalMutationAtoms = new Map();
  const syntheticCarrierAtoms = new WeakMap();
  const propagationSubscribers = new WeakMap();
  const propagationQueue = [];
  const queuedPropagationOperations = new Set();
  const unknownValueAtom = Object.freeze({ kind: 'unknown-value' });
  const unknownReflectiveCallableAtom = Object.freeze({
    kind: 'unknown-value',
    callableReason: 'unknown-reflective-callable',
  });
  const unknownReflectiveContainerAtom = Object.freeze({
    kind: 'unknown-value',
    callableReason: 'unknown-reflective-callable',
    reflectiveContainer: true,
  });
  const returnProvenanceLimitAtom = Object.freeze({
    kind: 'unknown-value',
    callableReason: 'return-provenance-limit',
  });
  const opaqueThisValueAtom = Object.freeze({ kind: 'unknown-value', opaqueThis: true });
  const builtinPrototypeStates = new Map();
  const activeIteratorFunctions = new Set();
  const activeReturnedFunctions = new Set();
  let activeCallableRecursionDepth = 0;
  let activeMutationRecursionDepth = 0;
  let remainingAnalysisWork = maximumAnalysisWork;
  let remainingDependencyCompositionWork = maximumDependencyCompositionWork;
  let analysisWorkLimit;
  let dependencyCompositionLimit;
  let activePropagationOperation;
  let activeAnalysisNode = sourceFile;
  let activeFunctionReceiver;
  const activeFunctionBindingFrames = [];

  function analysisStopped() {
    return analysisWorkLimit !== undefined || dependencyCompositionLimit !== undefined;
  }

  function consumeAnalysisWork(node = activeAnalysisNode) {
    if (analysisWorkLimit) return false;
    if (remainingAnalysisWork > 0) {
      remainingAnalysisWork -= 1;
      return true;
    }
    analysisWorkLimit = {
      reason: 'analysis-work-limit',
      position: node.getStart(sourceFile),
    };
    return false;
  }

  function consumeDependencyCompositionWork(node) {
    if (!consumeAnalysisWork(node)) return false;
    if (remainingDependencyCompositionWork > 0) {
      remainingDependencyCompositionWork -= 1;
      return true;
    }
    if (!dependencyCompositionLimit) {
      dependencyCompositionLimit = {
        reason: 'dependency-composition-limit',
        position: node.getStart(sourceFile),
      };
    }
    return false;
  }

  function createScope(parent, kind) {
    return { parent, kind, bindings: new Map() };
  }

  const rootScope = createScope(undefined, 'source');

  function mergeValue(target, source) {
    let changed = false;
    for (const atom of source) {
      if (!consumeAnalysisWork()) return changed;
      if (!target.has(atom)) {
        target.add(atom);
        changed = true;
      }
    }
    return changed;
  }

  function trackPropagationDependency(value) {
    if (!activePropagationOperation || analysisStopped()) return;
    let subscribers = propagationSubscribers.get(value);
    if (!subscribers) {
      subscribers = new Set();
      propagationSubscribers.set(value, subscribers);
    }
    if (subscribers.has(activePropagationOperation) || !consumeAnalysisWork()) return;
    subscribers.add(activePropagationOperation);
  }

  function enqueuePropagationOperation(operation) {
    if (analysisStopped() || queuedPropagationOperations.has(operation) || !consumeAnalysisWork(operation.node)) return;
    queuedPropagationOperations.add(operation);
    propagationQueue.push(operation);
  }

  function notifyPropagationSubscribers(value) {
    if (analysisStopped()) return;
    for (const operation of propagationSubscribers.get(value) ?? []) {
      if (!consumeAnalysisWork(operation.node)) return;
      enqueuePropagationOperation(operation);
    }
  }

  function mergeTracked(target, source) {
    if (mergeValue(target, source)) notifyPropagationSubscribers(target);
  }

  function mergeCarrierProperty(carrier, target, source) {
    if (!mergeValue(target, source)) return;
    notifyPropagationSubscribers(target);
    notifyPropagationSubscribers(carrier);
  }

  function mergeCallableValue(callable, target, source) {
    if (!mergeValue(target, source)) return;
    notifyPropagationSubscribers(target);
    notifyPropagationSubscribers(callable);
  }

  function originValue(...values) {
    return new Set(values);
  }

  function unknownValue() {
    return new Set([unknownValueAtom]);
  }

  function unknownReflectiveCallableValue() {
    return new Set([unknownReflectiveCallableAtom]);
  }

  function retainReflectiveCallableProvenance(value) {
    const result = new Set();
    for (const atom of value) {
      result.add(atom === unknownValueAtom ? unknownReflectiveCallableAtom : atom);
    }
    return result;
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

  function createCarrier(positional = false) {
    return {
      accessors: new Map(),
      deletedProperties: new Set(),
      kind: 'carrier',
      unknownAccessors: { get: new Set(), set: new Set() },
      unknownPropertyDeletion: false,
      unknownSpreadSource: false,
      properties: new Map(),
      prototypes: new Set(positional ? [origins.arrayPrototype] : []),
      unknownProperty: new Set(),
      positional,
      positionalLengths: new Set(),
      positionalUncertain: false,
      uncertainPositionalValues: new Set(),
    };
  }

  function carrierFor(node, positional = false) {
    let atom = carrierAtoms.get(node);
    if (!atom) {
      atom = createCarrier(positional);
      carrierAtoms.set(node, atom);
    } else if (positional && !atom.positional) {
      atom.positional = true;
      atom.prototypes.add(origins.arrayPrototype);
    }
    return atom;
  }

  function syntheticCarrierFor(node, key, positional = false) {
    let carriers = syntheticCarrierAtoms.get(node);
    if (!carriers) {
      carriers = new Map();
      syntheticCarrierAtoms.set(node, carriers);
    }
    let carrier = carriers.get(key);
    if (!carrier) {
      carrier = createCarrier(positional);
      carriers.set(key, carrier);
    }
    return carrier;
  }

  function declareIdentifier(identifier, scope) {
    let binding = scope.bindings.get(identifier.text);
    if (!binding) {
      binding = { name: identifier.text, scope, value: new Set() };
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
    if (binding) {
      for (let index = activeFunctionBindingFrames.length - 1; index >= 0; index -= 1) {
        const invocationValue = activeFunctionBindingFrames[index].get(binding);
        if (invocationValue) {
          trackPropagationDependency(invocationValue);
          return new Set(invocationValue);
        }
      }
      trackPropagationDependency(binding.value);
      return binding.value.size > 0 ? new Set(binding.value) : unknownValue();
    }
    if (identifier.text === 'undefined') return literalValue(undefined);
    if (identifier.text === 'eval') return originValue(origins.builtinEval);
    if (identifier.text === '_') return originValue(origins.lodashObject);
    if (identifier.text === 'Array') return originValue(origins.arrayObject);
    if (identifier.text === 'Date') return originValue(origins.dateObject);
    if (identifier.text === 'Function') return originValue(origins.functionObject);
    if (identifier.text === 'JSON') return originValue(origins.jsonObject);
    if (identifier.text === 'Object') return originValue(origins.objectObject);
    if (globalEvalObjects.has(identifier.text)) return originValue(origins.globalObject);
    if (identifier.text === 'Reflect') return originValue(origins.reflectObject);
    if (identifier.text === 'Symbol') return originValue(origins.symbolObject);
    return unknownValue();
  }

  function activeInvocationBindingValue(binding) {
    for (let index = activeFunctionBindingFrames.length - 1; index >= 0; index -= 1) {
      const invocationValue = activeFunctionBindingFrames[index].get(binding);
      if (invocationValue) return invocationValue;
    }
    return undefined;
  }

  function specialProperty(origin, propertyName) {
    const result = new Set();
    const unknown = propertyName === undefined;
    const matches = name => unknown || propertyName === name;

    if (origin === origins.arrayObject) {
      if (matches('from')) result.add(origins.arrayFrom);
      if (matches('prototype')) result.add(origins.arrayPrototype);
      if (matches('of')) result.add(origins.knownSafeCallable);
    } else if (origin === origins.arrayPrototype) {
      mergeValue(result, positionalMutationValue(propertyName === undefined ? undefined : [propertyName]));
    } else if (origin === origins.functionObject) {
      if (matches('prototype')) result.add(origins.functionPrototype);
    } else if (origin === origins.functionPrototype) {
      if (matches('apply')) result.add(origins.functionPrototypeApply);
      if (matches('bind')) result.add(origins.functionPrototypeBind);
      if (matches('call')) result.add(origins.functionPrototypeCall);
    } else if (origin === origins.globalObject) {
      if (matches('Array')) result.add(origins.arrayObject);
      if (matches('Date')) result.add(origins.dateObject);
      if (matches('eval')) result.add(origins.builtinEval);
      if (matches('Function')) result.add(origins.functionObject);
      if (matches('JSON')) result.add(origins.jsonObject);
      if (matches('Object')) result.add(origins.objectObject);
      if (matches('Reflect')) result.add(origins.reflectObject);
      if (matches('Symbol')) result.add(origins.symbolObject);
      if (matches('_')) result.add(origins.lodashObject);
      if ([...globalEvalObjects].some(matches)) result.add(origins.globalObject);
    } else if (origin === origins.jsonObject) {
      if (matches('parse') || matches('stringify')) result.add(origins.knownSafeCallable);
    } else if (origin === origins.objectObject) {
      if (matches('assign')) result.add(origins.objectAssign);
      if (matches('create')) result.add(origins.objectCreate);
      if (matches('defineProperties')) result.add(origins.objectDefineProperties);
      if (matches('defineProperty')) result.add(origins.objectDefineProperty);
      if (matches('getOwnPropertyDescriptor')) result.add(origins.objectGetOwnPropertyDescriptor);
      if (matches('getOwnPropertyDescriptors')) result.add(origins.objectGetOwnPropertyDescriptors);
      if (matches('getPrototypeOf')) result.add(origins.objectGetPrototypeOf);
      if (matches('prototype')) result.add(origins.objectPrototype);
      if (matches('setPrototypeOf')) result.add(origins.objectSetPrototypeOf);
    } else if (origin === origins.objectPrototype) {
      if (matches('__defineGetter__')) result.add(origins.objectPrototypeDefineGetter);
      if (matches('__defineSetter__')) result.add(origins.objectPrototypeDefineSetter);
    } else if (origin === origins.reflectObject) {
      if (matches('apply')) result.add(origins.reflectApply);
      if (matches('construct')) result.add(origins.reflectConstruct);
      if (matches('deleteProperty')) result.add(origins.reflectDeleteProperty);
      if (matches('defineProperty')) result.add(origins.reflectDefineProperty);
      if (matches('get')) result.add(origins.reflectGet);
      if (matches('getOwnPropertyDescriptor')) result.add(origins.reflectGetOwnPropertyDescriptor);
      if (matches('getPrototypeOf')) result.add(origins.reflectGetPrototypeOf);
      if (matches('set')) result.add(origins.reflectSet);
      if (matches('setPrototypeOf')) result.add(origins.reflectSetPrototypeOf);
    } else if (origin === origins.symbolObject) {
      if (matches('iterator')) mergeValue(result, literalValue(iteratorPropertyName));
    } else if (origin === origins.lodashObject) {
      if (matches('template')) result.add(origins.lodashTemplate);
      if (matches('runInContext')) result.add(origins.lodashRunInContext);
      if (matches('default')) result.add(origins.lodashObject);
    } else if (origin === origins.lodashTemplateNamespace) {
      if (matches('default') || matches('template')) result.add(origins.lodashTemplate);
    } else if (origin === origins.lodashTemplate) {
      if (matches('default')) result.add(origins.lodashTemplate);
    }
    return result;
  }

  function isTrackedCallable(atom) {
    if (typeof atom !== 'string') {
      return (
        atom.kind === 'bound-callable' ||
        atom.kind === 'invocation-method' ||
        atom.kind === 'iterator-next' ||
        atom.kind === 'positional-mutator' ||
        (atom.kind === 'function-value' &&
          (atom.iteratorNode.asteriskToken ||
            atom.outerReturnBindings.size > 0 ||
            atom.parameterDependentReturn ||
            atom.receiverDependentReturn ||
            atom.returnProvenanceUncertain ||
            atom.trackCallResult === true ||
            atom.mayTrackCallResult)) ||
        (atom.kind === 'unknown-value' && atom.callableReason !== undefined)
      );
    }
    return (
      atom === origins.builtinEval ||
      atom === origins.arrayFrom ||
      atom === origins.functionPrototypeApply ||
      atom === origins.functionPrototypeBind ||
      atom === origins.functionPrototypeCall ||
      atom === origins.lodashRunInContext ||
      atom === origins.lodashTemplate ||
      atom === origins.objectAssign ||
      atom === origins.objectCreate ||
      atom === origins.objectDefineProperties ||
      atom === origins.objectDefineProperty ||
      atom === origins.objectGetOwnPropertyDescriptor ||
      atom === origins.objectGetOwnPropertyDescriptors ||
      atom === origins.objectGetPrototypeOf ||
      atom === origins.objectPrototypeDefineGetter ||
      atom === origins.objectPrototypeDefineSetter ||
      atom === origins.objectPrototypeSetPrototype ||
      atom === origins.objectSetPrototypeOf ||
      atom === origins.reflectApply ||
      atom === origins.reflectConstruct ||
      atom === origins.reflectDeleteProperty ||
      atom === origins.reflectDefineProperty ||
      atom === origins.reflectGet ||
      atom === origins.reflectGetOwnPropertyDescriptor ||
      atom === origins.reflectGetPrototypeOf ||
      atom === origins.reflectSet ||
      atom === origins.reflectSetPrototypeOf
    );
  }

  function positionalMutationValue(propertyNames) {
    const result = new Set();
    for (const method of positionalMutationMethods) {
      if (propertyNames !== undefined && !propertyNames.includes(method)) continue;
      let atom = positionalMutationAtoms.get(method);
      if (!atom) {
        atom = Object.freeze({ kind: 'positional-mutator', method });
        positionalMutationAtoms.set(method, atom);
      }
      result.add(atom);
    }
    return result;
  }

  function functionHasPotentialTrackedReturn(node) {
    const cached = functionReturnProvenance.get(node);
    if (cached) return cached;
    const provenance = {
      mayTrackCallResult: false,
      localAliasDependentReturn: false,
      outerReturnBindings: new Set(),
      localReturnBindings: new Set(),
      localReturnBindingWrites: new Map(),
      localReturnDependents: new Map(),
      parameterDependentReturn: false,
      receiverDependentReturn: false,
      returnProvenanceUncertain: false,
    };
    functionReturnProvenance.set(node, provenance);
    const directReturnNames = new Set([
      'Array',
      'Date',
      'Function',
      'JSON',
      'Object',
      'Reflect',
      'Symbol',
      '_',
      'eval',
      'global',
      'globalThis',
      'self',
      'window',
    ]);
    const provenanceReturnNames = new Set(['Reflect', '_', 'eval', 'global', 'globalThis', 'self', 'window']);
    const outerReturnBindings = new Set();
    const parameterBindings = new Set();
    const bindingWrites = new Map();
    const returnExpressions = [];
    let found = false;
    let localAliasDependentReturn = false;
    let parameterDependentReturn = false;
    let receiverDependentReturn = false;
    let returnProvenanceUncertain = false;
    let remainingReturnProvenanceWork = maximumReturnProvenanceWork;
    const functionScope = nodeScopes.get(node);

    function bindingIsLocal(binding) {
      let scope = binding.scope;
      while (scope) {
        if (scope === functionScope) return true;
        scope = scope.parent;
      }
      return false;
    }

    function collectParameterBindings(name) {
      if (ts.isIdentifier(name)) {
        const binding = declarationBindings.get(name);
        if (binding) parameterBindings.add(binding);
        return;
      }
      for (const element of name.elements) {
        if (ts.isBindingElement(element)) collectParameterBindings(element.name);
      }
    }

    for (const parameter of node.parameters) collectParameterBindings(parameter.name);

    function addBindingWrite(binding, expression) {
      if (!binding || !expression) return;
      let writes = bindingWrites.get(binding);
      if (!writes) {
        writes = new Set();
        bindingWrites.set(binding, writes);
      }
      writes.add(expression);
    }

    function recordPatternWrites(name, expression) {
      if (ts.isIdentifier(name)) {
        addBindingWrite(declarationBindings.get(name) ?? lookupBinding(name), expression);
        return;
      }
      for (const element of name.elements) {
        if (ts.isBindingElement(element)) recordPatternWrites(element.name, expression);
      }
    }

    function assignmentRootBinding(expression) {
      let current = unwrapExpression(expression);
      while (ts.isPropertyAccessExpression(current) || ts.isElementAccessExpression(current)) {
        current = unwrapExpression(current.expression);
      }
      return ts.isIdentifier(current) ? lookupBinding(current) : undefined;
    }

    function collectReturnWrites(current) {
      if (current !== node.body && ts.isFunctionLike(current)) {
        if (ts.isFunctionDeclaration(current) && current.name) {
          addBindingWrite(declarationBindings.get(current.name), current);
        }
        return;
      }
      if (ts.isReturnStatement(current) && current.expression) {
        returnExpressions.push(current.expression);
        return;
      }
      if (ts.isVariableDeclaration(current) && current.initializer) {
        recordPatternWrites(current.name, current.initializer);
      } else if (ts.isBinaryExpression(current) && ts.isAssignmentOperator(current.operatorToken.kind)) {
        if (ts.isIdentifier(unwrapExpression(current.left))) {
          addBindingWrite(lookupBinding(unwrapExpression(current.left)), current.right);
        } else {
          const rootBinding = assignmentRootBinding(current.left);
          if (rootBinding && bindingIsLocal(rootBinding)) addBindingWrite(rootBinding, current.right);
          if (ts.isArrayLiteralExpression(current.left) || ts.isObjectLiteralExpression(current.left)) {
            for (const child of current.left.elements ?? current.left.properties) {
              if (ts.isIdentifier(child)) addBindingWrite(lookupBinding(child), current.right);
            }
          }
        }
      }
      ts.forEachChild(current, collectReturnWrites);
    }

    if (ts.isArrowFunction(node) && !ts.isBlock(node.body)) returnExpressions.push(node.body);
    else if (node.body) collectReturnWrites(node.body);

    function visitDirectReturnDependencies(current) {
      if (ts.isIdentifier(current) && !lookupBinding(current) && directReturnNames.has(current.text)) {
        found = true;
      }
      ts.forEachChild(current, visitDirectReturnDependencies);
    }

    for (const expression of returnExpressions) visitDirectReturnDependencies(expression);

    const pending = returnExpressions.map(expression => ({ expression, directCallable: true }));
    const seenBindings = new Set();
    while (pending.length > 0) {
      if (remainingReturnProvenanceWork <= 0) {
        returnProvenanceUncertain = true;
        break;
      }
      remainingReturnProvenanceWork -= 1;
      const { expression: current, directCallable } = pending.pop();
      if (current.kind === ts.SyntaxKind.ThisKeyword) receiverDependentReturn = true;
      if (ts.isFunctionLike(current)) {
        const nested = functionHasPotentialTrackedReturn(current);
        if (
          nested.mayTrackCallResult ||
          (directCallable && (nested.localAliasDependentReturn || nested.parameterDependentReturn)) ||
          nested.receiverDependentReturn ||
          nested.returnProvenanceUncertain
        ) {
          found = true;
        }
        for (const binding of nested.outerReturnBindings) {
          if (parameterBindings.has(binding)) parameterDependentReturn = true;
          else if (bindingIsLocal(binding)) {
            localAliasDependentReturn = true;
            if (!seenBindings.has(binding)) {
              seenBindings.add(binding);
              for (const write of bindingWrites.get(binding) ?? []) {
                pending.push({ expression: write, directCallable: true });
              }
            }
          } else outerReturnBindings.add(binding);
        }
        if (bindingWrites.size > 0 && nested.outerReturnBindings.size > 0) {
          localAliasDependentReturn = true;
        }
        if (nested.returnProvenanceUncertain) returnProvenanceUncertain = true;
        continue;
      }
      if (ts.isIdentifier(current)) {
        const binding = lookupBinding(current);
        if (!binding && provenanceReturnNames.has(current.text)) {
          found = true;
        } else if (binding && parameterBindings.has(binding)) {
          parameterDependentReturn = true;
          const parameter = node.parameters.find(candidate => {
            const bindings = new Set();
            function collect(name) {
              if (ts.isIdentifier(name)) {
                const candidateBinding = declarationBindings.get(name);
                if (candidateBinding) bindings.add(candidateBinding);
                return;
              }
              for (const element of name.elements) {
                if (ts.isBindingElement(element)) collect(element.name);
              }
            }
            collect(candidate.name);
            return bindings.has(binding);
          });
          if (parameter?.initializer) pending.push({ expression: parameter.initializer, directCallable: true });
        } else if (binding && !bindingIsLocal(binding)) {
          outerReturnBindings.add(binding);
        } else if (binding && !seenBindings.has(binding)) {
          localAliasDependentReturn = true;
          seenBindings.add(binding);
          for (const write of bindingWrites.get(binding) ?? []) {
            pending.push({ expression: write, directCallable: true });
          }
        }
        continue;
      }
      ts.forEachChild(current, child => {
        pending.push({
          expression: child,
          directCallable:
            directCallable && !ts.isObjectLiteralExpression(current) && !ts.isArrayLiteralExpression(current),
        });
      });
    }
    const localReturnDependents = new Map([...seenBindings].map(binding => [binding, new Set()]));
    for (const binding of seenBindings) {
      for (const write of bindingWrites.get(binding) ?? []) {
        if (ts.isFunctionLike(write)) continue;
        const pendingDependencies = [write];
        while (pendingDependencies.length > 0) {
          const dependencyNode = pendingDependencies.pop();
          if (ts.isIdentifier(dependencyNode)) {
            const dependency = lookupBinding(dependencyNode);
            if (dependency && dependency !== binding && seenBindings.has(dependency)) {
              localReturnDependents.get(dependency).add(binding);
            }
            continue;
          }
          ts.forEachChild(dependencyNode, child => {
            pendingDependencies.push(child);
          });
        }
      }
    }

    Object.assign(provenance, {
      mayTrackCallResult: found,
      localAliasDependentReturn,
      localReturnBindings: seenBindings,
      localReturnBindingWrites: new Map(
        [...seenBindings].map(binding => [binding, new Set(bindingWrites.get(binding) ?? [])])
      ),
      localReturnDependents,
      outerReturnBindings,
      parameterDependentReturn,
      receiverDependentReturn,
      returnProvenanceUncertain,
    });
    return provenance;
  }

  function functionValue(node) {
    let atom = functionAtoms.get(node);
    if (!atom) {
      const returnProvenance = functionHasPotentialTrackedReturn(node);
      atom = {
        kind: 'function-value',
        iteratorNode: node,
        iteratorScanned: false,
        iteratorUnknown: !node.asteriskToken,
        iteratorValues: new Set(),
        mayTrackCallResult: returnProvenance.mayTrackCallResult,
        localAliasDependentReturn: returnProvenance.localAliasDependentReturn,
        localReturnBindings: returnProvenance.localReturnBindings,
        localReturnBindingWrites: returnProvenance.localReturnBindingWrites,
        localReturnDependents: returnProvenance.localReturnDependents,
        outerReturnBindings: returnProvenance.outerReturnBindings,
        parameterDependentReturn: returnProvenance.parameterDependentReturn,
        receiverDependentReturn: returnProvenance.receiverDependentReturn,
        returnProvenanceUncertain: returnProvenance.returnProvenanceUncertain,
        trackCallResult: false,
        capturedBindings: new Map(),
      };
      functionAtoms.set(node, atom);
    }
    for (const frame of activeFunctionBindingFrames) {
      for (const [binding, value] of frame) {
        let captured = atom.capturedBindings.get(binding);
        if (!captured) {
          captured = new Set();
          atom.capturedBindings.set(binding, captured);
        }
        mergeCallableValue(atom, captured, value);
      }
    }
    return new Set([atom]);
  }

  function iteratorInvocationFor(node, iterator, receiverValue) {
    let atom = iteratorInvocationAtoms.get(node);
    if (!atom) {
      atom = {
        kind: 'iterator-instance',
        iterators: new Set(),
        next: undefined,
        receivers: new Set(),
      };
      atom.next = { kind: 'iterator-next', iteratorInstance: atom };
      iteratorInvocationAtoms.set(node, atom);
    }
    mergeCallableValue(atom, atom.iterators, new Set([iterator]));
    mergeCallableValue(atom, atom.receivers, receiverValue);
    return atom;
  }

  function bindInvocationPattern(frame, name, value, invocationNode) {
    if (ts.isIdentifier(name)) {
      const binding = declarationBindings.get(name);
      if (binding) {
        let invocationValue = frame.get(binding);
        if (!invocationValue) {
          invocationValue = new Set();
          frame.set(binding, invocationValue);
        }
        mergeValue(invocationValue, value);
      }
      return;
    }
    if (ts.isObjectBindingPattern(name)) {
      for (const element of name.elements) {
        let elementValue = element.dotDotDotToken
          ? value
          : observedPropertyValue(value, bindingElementPropertyNames(element));
        if (element.initializer) elementValue = applyDefaultInitializer(elementValue, element.initializer);
        bindInvocationPattern(frame, element.name, elementValue, invocationNode);
      }
      return;
    }
    const expansion = positionalLayouts(value);
    for (const [index, element] of name.elements.entries()) {
      if (!ts.isBindingElement(element)) continue;
      let elementValue = element.dotDotDotToken
        ? arrayRestValue(value, index, invocationNode, expansion)
        : positionalValueAt(expansion, index);
      if (element.initializer) elementValue = applyDefaultInitializer(elementValue, element.initializer);
      bindInvocationPattern(frame, element.name, elementValue, invocationNode);
    }
  }

  function applyDefaultInitializer(value, initializer) {
    const result = new Set();
    let mayUseDefault = value.size === 0;
    for (const atom of value) {
      if (
        (typeof atom !== 'string' && atom.kind === 'literal' && atom.value === undefined) ||
        (typeof atom !== 'string' && atom.kind === 'unknown-value')
      ) {
        mayUseDefault = true;
      }
      if (!(typeof atom !== 'string' && atom.kind === 'literal' && atom.value === undefined)) result.add(atom);
    }
    if (mayUseDefault) mergeValue(result, evaluateExpression(initializer));
    return result;
  }

  function functionInvocationFrame(atom, argumentValues, invocationNode) {
    const frame = new Map();
    for (const [binding, value] of atom.capturedBindings) frame.set(binding, new Set(value));
    activeFunctionBindingFrames.push(frame);
    try {
      for (const [index, parameter] of atom.iteratorNode.parameters.entries()) {
        let parameterValue;
        if (parameter.dotDotDotToken) {
          const restCarrier = syntheticCarrierFor(invocationNode, `function-rest:${index}`, true);
          const restArguments = argumentValues.slice(index);
          for (const [restIndex, value] of restArguments.entries()) {
            putCarrierProperty(restCarrier, [String(restIndex)], value);
          }
          mergeCarrierPositionalState(restCarrier, new Set([restArguments.length]), false, new Set());
          parameterValue = new Set([restCarrier]);
        } else {
          parameterValue = argumentValues[index] ?? literalValue(undefined);
        }
        if (parameter.initializer) parameterValue = applyDefaultInitializer(parameterValue, parameter.initializer);
        bindInvocationPattern(frame, parameter.name, parameterValue, invocationNode);
      }
    } finally {
      activeFunctionBindingFrames.pop();
    }
    return frame;
  }

  function functionReturnedValues(atom, receiverValue, argumentValues = [], invocationNode = atom.iteratorNode) {
    const result = new Set();
    if (activeReturnedFunctions.has(atom)) {
      result.add(unknownValueAtom);
      return result;
    }
    activeReturnedFunctions.add(atom);
    const root = atom.iteratorNode;
    const previousReceiver = activeFunctionReceiver;
    activeFunctionReceiver = receiverValue;
    const frame = functionInvocationFrame(atom, argumentValues, invocationNode);
    activeFunctionBindingFrames.push(frame);
    for (const binding of atom.localReturnBindings) {
      if (!frame.has(binding)) frame.set(binding, new Set());
    }

    function visit(node) {
      if (!consumeAnalysisWork(node)) {
        mergeValue(result, unknownReflectiveCallableValue());
        return;
      }
      if (node !== root && ts.isFunctionLike(node)) return;
      if (ts.isReturnStatement(node)) {
        if (node.expression) mergeValue(result, evaluateExpression(node.expression));
        return;
      }
      ts.forEachChild(node, visit);
    }

    try {
      const pendingBindings = [...atom.localReturnBindings].reverse();
      const queuedBindings = new Set(pendingBindings);
      let returnProvenanceWork = 0;
      for (let queueIndex = 0; queueIndex < pendingBindings.length; queueIndex += 1) {
        if (returnProvenanceWork >= maximumReturnProvenanceWork) {
          result.add(returnProvenanceLimitAtom);
          break;
        }
        returnProvenanceWork += 1;
        const binding = pendingBindings[queueIndex];
        queuedBindings.delete(binding);
        const bindingValue = frame.get(binding);
        const previousSize = bindingValue.size;
        for (const write of atom.localReturnBindingWrites.get(binding) ?? []) {
          const value = ts.isFunctionLike(write) ? functionValue(write) : evaluateExpression(write);
          mergeValue(bindingValue, value);
        }
        if (bindingValue.size === previousSize) continue;
        for (const dependent of atom.localReturnDependents.get(binding) ?? []) {
          if (queuedBindings.has(dependent)) continue;
          queuedBindings.add(dependent);
          pendingBindings.push(dependent);
        }
      }
      for (const writes of atom.localReturnBindingWrites.values()) {
        for (const write of writes) {
          if (ts.isFunctionLike(write)) functionValue(write);
        }
      }
      if (ts.isArrowFunction(root) && !ts.isBlock(root.body)) {
        mergeValue(result, evaluateExpression(root.body));
      } else if (root.body) {
        visit(root.body);
      }
    } finally {
      activeFunctionBindingFrames.pop();
      activeFunctionReceiver = previousReceiver;
      activeReturnedFunctions.delete(atom);
    }
    return hasUnsafeCallable(result) ? retainReflectiveCallableProvenance(result) : result;
  }

  function accessorReturnedValues(accessorValue, receiverValue) {
    const result = new Set();
    for (const accessor of accessorValue) {
      if (typeof accessor !== 'string' && accessor.kind === 'function-value') {
        mergeValue(result, functionReturnedValues(accessor, receiverValue));
      } else if (typeof accessor !== 'string' && accessor.kind === 'unknown-value') {
        result.add(accessor);
      }
    }
    return result;
  }

  function scanIteratorFunction(atom) {
    if (atom.iteratorScanned || atom.iteratorUnknown) return;
    atom.iteratorScanned = true;
    const root = atom.iteratorNode;

    function visit(node) {
      if (!consumeAnalysisWork(node)) {
        atom.iteratorUnknown = true;
        return;
      }
      if (node !== root && ts.isFunctionLike(node)) return;
      if (ts.isYieldExpression(node)) {
        if (!node.expression) {
          mergeTracked(atom.iteratorValues, literalValue(undefined));
        } else if (node.asteriskToken) {
          const expansion = positionalLayouts(evaluateExpression(node.expression));
          for (const layout of expansion.layouts) {
            for (const value of layout) mergeTracked(atom.iteratorValues, value);
          }
          mergeTracked(atom.iteratorValues, expansion.uncertainValues);
          if (expansion.uncertainPositioning) atom.iteratorUnknown = true;
        } else {
          mergeTracked(atom.iteratorValues, evaluateExpression(node.expression));
        }
        return;
      }
      ts.forEachChild(node, visit);
    }

    if (root.body) visit(root.body);
  }

  function containsReceiverReference(node) {
    const pending = [node];
    while (pending.length > 0) {
      const current = pending.pop();
      if (current.kind === ts.SyntaxKind.ThisKeyword) return true;
      if (current !== node && ts.isFunctionLike(current)) continue;
      ts.forEachChild(current, child => pending.push(child));
    }
    return false;
  }

  function executeIteratorReceiverEffects(atom, receiverValue) {
    if (activeIteratorFunctions.has(atom)) {
      invalidatePositionalTargets(receiverValue, undefined, unknownReflectiveCallableValue());
      return;
    }
    activeIteratorFunctions.add(atom);
    const root = atom.iteratorNode;
    const previousReceiver = activeFunctionReceiver;
    activeFunctionReceiver = receiverValue;

    function visit(node) {
      if (!consumeAnalysisWork(node)) {
        invalidatePositionalTargets(receiverValue, undefined, unknownReflectiveCallableValue());
        return;
      }
      if (node !== root && ts.isFunctionLike(node)) return;
      if (ts.isVariableDeclaration(node) && node.initializer) {
        bindPattern(node.name, evaluateExpression(node.initializer));
      } else if (ts.isBinaryExpression(node) && ts.isAssignmentOperator(node.operatorToken.kind)) {
        if (node.operatorToken.kind === ts.SyntaxKind.EqualsToken) {
          assignToTarget(node.left, evaluateExpression(node.right));
        } else {
          invalidatePositionalWrite(node.left);
        }
      } else if (
        (ts.isPrefixUnaryExpression(node) || ts.isPostfixUnaryExpression(node)) &&
        (node.operator === ts.SyntaxKind.PlusPlusToken || node.operator === ts.SyntaxKind.MinusMinusToken)
      ) {
        invalidatePositionalWrite(node.operand);
      } else if (ts.isDeleteExpression(node)) {
        recordDeletion(node.expression);
      } else if (ts.isCallExpression(node)) {
        invalidatePositionalMutationCall(node);
        invalidateIndirectPositionalMutationCall(node);
        if (containsReceiverReference(node)) {
          invalidatePositionalTargets(receiverValue, undefined, unknownReflectiveCallableValue());
        }
      } else if (
        (ts.isPropertyAccessExpression(node) || ts.isElementAccessExpression(node)) &&
        !isWriteOnlyPropertyAccess(node)
      ) {
        evaluateExpression(node);
      }
      ts.forEachChild(node, visit);
    }

    try {
      if (root.body) visit(root.body);
    } finally {
      activeFunctionReceiver = previousReceiver;
      activeIteratorFunctions.delete(atom);
    }
  }

  function iteratorProducedValues(iteratorValue) {
    const result = new Set();
    for (const iterator of iteratorValue) {
      if (typeof iterator !== 'string' && iterator.kind === 'function-value') {
        scanIteratorFunction(iterator);
        mergeValue(result, iterator.iteratorValues);
        if (iterator.iteratorUnknown) mergeValue(result, unknownReflectiveCallableValue());
      } else if (typeof iterator !== 'string' && iterator.kind === 'unknown-value') {
        result.add(iterator.callableReason ? iterator : unknownReflectiveCallableAtom);
      } else if (isTrackedCallable(iterator)) {
        result.add(iterator);
      }
    }
    return result;
  }

  function observeIteratorExecution(value, iteratorValue) {
    for (const iterator of iteratorValue) {
      if (typeof iterator !== 'string' && iterator.kind === 'function-value') {
        executeIteratorReceiverEffects(iterator, value);
      } else if (typeof iterator !== 'string' && iterator.kind === 'unknown-value') {
        invalidatePositionalTargets(value, undefined, unknownReflectiveCallableValue());
      }
    }
    return iteratorProducedValues(iteratorValue);
  }

  function hasUnsafeCallable(value, seen = new Set()) {
    for (const atom of value) {
      if (typeof atom === 'string') {
        if (
          atom === origins.builtinEval ||
          atom === origins.lodashRunInContext ||
          atom === origins.lodashTemplate ||
          atom === origins.reflectApply ||
          atom === origins.reflectConstruct
        ) {
          return true;
        }
      } else if ((atom.kind === 'bound-callable' || atom.kind === 'invocation-method') && !seen.has(atom)) {
        trackPropagationDependency(atom.target);
        const nextSeen = new Set(seen);
        nextSeen.add(atom);
        if (hasUnsafeCallable(atom.target, nextSeen)) return true;
      }
    }
    return false;
  }

  function hasUnknownValue(value, seen = new Set()) {
    if (value.size === 0) return true;
    for (const atom of value) {
      if (typeof atom === 'string') continue;
      if (atom.kind === 'unknown-value' || (atom.kind === 'function-value' && atom.trackCallResult !== true)) {
        return true;
      }
      if ((atom.kind === 'bound-callable' || atom.kind === 'invocation-method') && !seen.has(atom)) {
        const nextSeen = new Set(seen);
        nextSeen.add(atom);
        if (hasUnknownValue(atom.target, nextSeen)) return true;
      }
    }
    return false;
  }

  function hasUnsafePositionalValue(value, seen = new Set()) {
    if (hasUnsafeCallable(value)) return true;
    for (const atom of value) {
      if (typeof atom === 'string') continue;
      if (atom.kind === 'unknown-value') return true;
      if (atom.kind !== 'function-value' || seen.has(atom)) continue;
      scanIteratorFunction(atom);
      if (atom.iteratorUnknown) return true;
      const nextSeen = new Set(seen);
      nextSeen.add(atom);
      trackPropagationDependency(atom.iteratorValues);
      if (hasUnsafePositionalValue(atom.iteratorValues, nextSeen)) return true;
    }
    return false;
  }

  function invocationMethodFor(node, method, target) {
    let methods = invocationMethodAtoms.get(node);
    if (!methods) {
      methods = new Map();
      invocationMethodAtoms.set(node, methods);
    }
    let atom = methods.get(method);
    if (!atom) {
      atom = { kind: 'invocation-method', method, target: new Set() };
      methods.set(method, atom);
    }
    mergeTracked(atom.target, target);
    return atom;
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

  function getProperty(value, propertyNames, node) {
    const result = new Set();
    for (const atom of value) {
      if (typeof atom === 'string') {
        const state = builtinPrototypeState(atom);
        if (state) {
          trackPropagationDependency(state);
          if (propertyNames === undefined) {
            for (const propertyValue of state.properties.values()) mergeValue(result, propertyValue);
            if ([...state.accessors.values()].some(accessor => accessor.get.size > 0)) {
              for (const accessor of state.accessors.values()) {
                mergeValue(result, accessorReturnedValues(accessor.get, value));
              }
            }
            mergeValue(result, specialProperty(atom, undefined));
            mergeValue(result, state.unknownProperty);
            mergeValue(result, accessorReturnedValues(state.unknownAccessors.get, value));
            mergeValue(result, prototypePropertyValues(effectivePrototypes(atom), undefined, value));
          } else {
            for (const propertyName of propertyNames) {
              const propertyValue = state.properties.get(propertyName);
              const accessor = state.accessors.get(propertyName);
              const specialValue = specialProperty(atom, propertyName);
              const hasOwnProperty = propertyValue !== undefined || accessor !== undefined || specialValue.size > 0;
              if (propertyValue) mergeValue(result, propertyValue);
              if (accessor) mergeValue(result, accessorReturnedValues(accessor.get, value));
              mergeValue(result, specialValue);
              mergeValue(result, state.unknownProperty);
              mergeValue(result, accessorReturnedValues(state.unknownAccessors.get, value));
              if (
                !hasOwnProperty ||
                state.deletedProperties.has(propertyName) ||
                state.unknownPropertyDeletion ||
                state.unknownProperty.size > 0 ||
                state.unknownAccessors.get.size > 0
              ) {
                mergeValue(result, prototypePropertyValues(effectivePrototypes(atom), [propertyName], value));
              }
            }
          }
        } else if (propertyNames === undefined) {
          mergeValue(result, specialProperty(atom, undefined));
        } else {
          for (const propertyName of propertyNames) mergeValue(result, specialProperty(atom, propertyName));
        }
        continue;
      }
      if (typeof atom !== 'string' && atom.kind === 'unknown-value') {
        result.add(
          atom.reflectiveContainer ? unknownReflectiveCallableAtom : atom.callableReason ? unknownValueAtom : atom
        );
        continue;
      }
      if (atom.kind === 'iterator-instance') {
        if (propertyNames === undefined || propertyNames.includes('next')) result.add(atom.next);
        continue;
      }
      if (atom.kind !== 'carrier') continue;
      trackPropagationDependency(atom);
      if (atom.positional) mergeValue(result, positionalMutationValue(propertyNames));
      const inheritedPropertyNames = [];
      if (propertyNames === undefined) {
        for (const propertyValue of atom.properties.values()) mergeValue(result, propertyValue);
        for (const accessor of atom.accessors.values()) {
          mergeValue(result, accessorReturnedValues(accessor.get, value));
        }
      } else {
        for (const propertyName of propertyNames) {
          const propertyValue = atom.properties.get(propertyName);
          if (propertyValue) mergeValue(result, propertyValue);
          const accessor = atom.accessors.get(propertyName);
          if (accessor) mergeValue(result, accessorReturnedValues(accessor.get, value));
          if (
            (!propertyValue && !accessor) ||
            atom.deletedProperties.has(propertyName) ||
            atom.unknownPropertyDeletion
          ) {
            inheritedPropertyNames.push(propertyName);
          }
        }
      }
      mergeValue(result, atom.unknownProperty);
      mergeValue(result, accessorReturnedValues(atom.unknownAccessors.get, value));
      mergeValue(
        result,
        prototypePropertyValues(
          effectivePrototypes(atom),
          propertyNames === undefined ? undefined : inheritedPropertyNames,
          value
        )
      );
    }
    if (node) {
      for (const method of ['apply', 'bind', 'call']) {
        if (propertyNames !== undefined && !propertyNames.includes(method)) continue;
        const callable = new Set([...value].filter(isTrackedCallable));
        if (callable.size > 0) result.add(invocationMethodFor(node, method, callable));
      }
    }
    return result;
  }

  function putCarrierProperty(carrier, propertyNames, value) {
    if (propertyNames === undefined) {
      mergeCarrierProperty(carrier, carrier.unknownProperty, value);
      if (carrier.positional) {
        if (!carrier.positionalUncertain) {
          carrier.positionalUncertain = true;
          notifyPropagationSubscribers(carrier);
        }
        mergeCarrierProperty(carrier, carrier.uncertainPositionalValues, value);
      }
      return;
    }
    for (const propertyName of propertyNames) {
      let target = carrier.properties.get(propertyName);
      if (!target) {
        target = new Set();
        carrier.properties.set(propertyName, target);
      }
      mergeCarrierProperty(carrier, target, value);
      if (carrier.positional && /^(0|[1-9]\d*)$/.test(propertyName)) {
        const index = Number(propertyName);
        if (Number.isSafeInteger(index) && [...carrier.positionalLengths].some(length => index >= length)) {
          const boundedLength = Math.min(index + 1, maximumTrackedInvocationArguments);
          if (!carrier.positionalLengths.has(boundedLength)) {
            carrier.positionalLengths.add(boundedLength);
            notifyPropagationSubscribers(carrier);
          }
        }
      }
    }
  }

  function mergeCarrierPositionalState(carrier, lengths, positionalUncertain, uncertainValues) {
    let changed = false;
    for (const length of lengths) {
      const boundedLength = Math.min(length, maximumTrackedInvocationArguments);
      if (!carrier.positionalLengths.has(boundedLength)) {
        carrier.positionalLengths.add(boundedLength);
        changed = true;
      }
    }
    if (positionalUncertain && !carrier.positionalUncertain) {
      carrier.positionalUncertain = true;
      changed = true;
    }
    if (mergeValue(carrier.uncertainPositionalValues, uncertainValues)) changed = true;
    if (changed) notifyPropagationSubscribers(carrier);
  }

  function mergeCarrierPrototypes(carrier, prototypes) {
    let changed = false;
    for (const prototype of prototypes) {
      if (carrier.prototypes.has(prototype)) continue;
      if (!consumeAnalysisWork()) break;
      carrier.prototypes.add(prototype);
      changed = true;
    }
    if (changed) notifyPropagationSubscribers(carrier);
  }

  function invalidateCarrierPositionalLayout(carrier, additionalValues = new Set()) {
    if (!carrier.positional) return;
    const uncertainValues = new Set();
    for (const [propertyName, propertyValue] of carrier.properties) {
      if (/^(0|[1-9]\d*)$/.test(propertyName)) mergeValue(uncertainValues, propertyValue);
    }
    mergeValue(uncertainValues, additionalValues);
    mergeCarrierPositionalState(carrier, new Set(), true, uncertainValues);
  }

  function propertyNamesFromValue(value) {
    const names = [];
    let uncertain = value.size === 0;
    for (const atom of value) {
      if (typeof atom !== 'string' && atom.kind === 'literal') names.push(String(atom.value));
      else uncertain = true;
    }
    return uncertain ? undefined : [...new Set(names)];
  }

  function propertyNamesAffectPositionalLayout(propertyNames) {
    return (
      propertyNames === undefined ||
      propertyNames.some(
        propertyName =>
          propertyName === 'length' || propertyName === iteratorPropertyName || /^(0|[1-9]\d*)$/.test(propertyName)
      )
    );
  }

  function propertyNameAffectsInheritedPositions(propertyName) {
    return propertyName === 'length' || /^(0|[1-9]\d*)$/.test(propertyName);
  }

  function builtinPrototypeState(origin) {
    if (
      origin !== origins.arrayObject &&
      origin !== origins.arrayPrototype &&
      origin !== origins.dateObject &&
      origin !== origins.functionObject &&
      origin !== origins.functionPrototype &&
      origin !== origins.globalObject &&
      origin !== origins.jsonObject &&
      origin !== origins.knownSafeCallable &&
      origin !== origins.objectObject &&
      origin !== origins.objectPrototype &&
      origin !== origins.reflectObject &&
      origin !== origins.symbolObject
    ) {
      return undefined;
    }
    let state = builtinPrototypeStates.get(origin);
    if (!state) {
      const functionObjects = new Set([
        origins.arrayObject,
        origins.dateObject,
        origins.functionObject,
        origins.knownSafeCallable,
        origins.objectObject,
        origins.symbolObject,
      ]);
      const objectInstances = new Set([
        origins.arrayPrototype,
        origins.functionPrototype,
        origins.globalObject,
        origins.jsonObject,
        origins.reflectObject,
      ]);
      state = {
        accessors: new Map(),
        deletedProperties: new Set(),
        properties: new Map(),
        prototypes: new Set(
          functionObjects.has(origin)
            ? [origins.functionPrototype]
            : objectInstances.has(origin)
              ? [origins.objectPrototype]
              : []
        ),
        unknownAccessors: { get: new Set(), set: new Set() },
        unknownPropertyDeletion: false,
        unknownProperty: new Set(),
      };
      builtinPrototypeStates.set(origin, state);
    }
    return state;
  }

  function effectivePrototypes(atom) {
    if (typeof atom === 'string') return builtinPrototypeState(atom)?.prototypes ?? new Set();
    if (atom.kind !== 'carrier') return new Set();
    return atom.prototypes.size > 0 ? atom.prototypes : originValue(origins.objectPrototype);
  }

  function putAbstractProperty(target, propertyNames, value) {
    if (propertyNames === undefined) {
      mergeCarrierProperty(target, target.unknownProperty, value.size > 0 ? value : unknownValue());
      return;
    }
    for (const propertyName of propertyNames) {
      let stored = target.properties.get(propertyName);
      if (!stored) {
        stored = new Set();
        target.properties.set(propertyName, stored);
      }
      mergeCarrierProperty(target, stored, value.size > 0 ? value : unknownValue());
    }
  }

  function possibleAccessorValues(value) {
    const result = new Set();
    for (const atom of value) {
      if (typeof atom !== 'string' && atom.kind === 'literal' && atom.value === undefined) continue;
      result.add(atom);
    }
    return result;
  }

  function putAbstractAccessor(target, propertyNames, kind, value) {
    const possibleValues = possibleAccessorValues(value);
    if (possibleValues.size === 0) return;
    if (propertyNames === undefined) {
      mergeCarrierProperty(target, target.unknownAccessors[kind], possibleValues);
      return;
    }
    for (const propertyName of propertyNames) {
      let accessor = target.accessors.get(propertyName);
      if (!accessor) {
        accessor = { get: new Set(), set: new Set() };
        target.accessors.set(propertyName, accessor);
      }
      mergeCarrierProperty(target, accessor[kind], possibleValues);
    }
  }

  function recordTargetProperty(targetValue, propertyNames, value) {
    for (const atom of targetValue) {
      if (typeof atom !== 'string' && atom.kind === 'carrier') {
        putCarrierProperty(atom, propertyNames, value);
      } else if (typeof atom === 'string') {
        const state = builtinPrototypeState(atom);
        if (state) putAbstractProperty(state, propertyNames, value);
      }
    }
  }

  function recordTargetAccessor(targetValue, propertyNames, kind, value) {
    for (const atom of targetValue) {
      if (typeof atom !== 'string' && atom.kind === 'carrier') {
        putAbstractAccessor(atom, propertyNames, kind, value);
      } else if (typeof atom === 'string') {
        const state = builtinPrototypeState(atom);
        if (state) putAbstractAccessor(state, propertyNames, kind, value);
      }
    }
  }

  function recordTargetDeletion(targetValue, propertyNames) {
    for (const atom of targetValue) {
      const target = abstractTarget(atom);
      if (!target) continue;
      let changed = false;
      if (propertyNames === undefined) {
        if (!target.unknownPropertyDeletion) {
          target.unknownPropertyDeletion = true;
          changed = true;
        }
      } else {
        for (const propertyName of propertyNames) {
          if (target.deletedProperties.has(propertyName) || !consumeAnalysisWork()) continue;
          target.deletedProperties.add(propertyName);
          changed = true;
        }
      }
      if (changed) notifyPropagationSubscribers(target);
    }
  }

  function descriptorFieldValues(descriptorValue, field) {
    const result = new Set();
    invalidateAccessorReceiver(descriptorValue, [field], 'get', descriptorValue);
    for (const atom of descriptorValue) {
      if (typeof atom === 'string' || atom.kind === 'unknown-value') {
        result.add(unknownReflectiveCallableAtom);
        continue;
      }
      if (atom.kind !== 'carrier') continue;
      trackPropagationDependency(atom);
      const propertyValue = atom.properties.get(field);
      const accessor = atom.accessors.get(field);
      const hasOwnField = propertyValue !== undefined || accessor !== undefined;
      if (propertyValue) mergeValue(result, propertyValue);
      if (accessor) mergeValue(result, accessorReturnedValues(accessor.get, descriptorValue));
      if (atom.unknownProperty.size > 0) {
        mergeValue(result, retainReflectiveCallableProvenance(atom.unknownProperty));
      }
      if (atom.unknownAccessors.get.size > 0) {
        mergeValue(result, accessorReturnedValues(atom.unknownAccessors.get, descriptorValue));
      }
      if (!hasOwnField || atom.unknownProperty.size > 0 || atom.unknownAccessors.get.size > 0) {
        mergeValue(result, prototypePropertyValues(effectivePrototypes(atom), [field], descriptorValue));
      }
    }
    return result;
  }

  function descriptorAccessorValues(descriptorValue, kind) {
    return possibleAccessorValues(descriptorFieldValues(descriptorValue, kind));
  }

  function recordDescriptorAccessors(targetValue, propertyNames, descriptorValue) {
    recordTargetAccessor(targetValue, propertyNames, 'get', descriptorAccessorValues(descriptorValue, 'get'));
    recordTargetAccessor(targetValue, propertyNames, 'set', descriptorAccessorValues(descriptorValue, 'set'));
  }

  function abstractTarget(atom) {
    if (typeof atom === 'string') return builtinPrototypeState(atom);
    return atom.kind === 'carrier' ? atom : undefined;
  }

  function prototypePropertyValues(prototypeValue, propertyNames, receiverValue = prototypeValue) {
    const result = new Set();
    const names = propertyNames ?? [undefined];
    for (const propertyName of names) {
      const pending = [...prototypeValue];
      const seen = new Set();
      for (let queueIndex = 0; queueIndex < pending.length; queueIndex += 1) {
        const atom = pending[queueIndex];
        if (seen.has(atom)) continue;
        seen.add(atom);
        if (!consumeAnalysisWork()) break;
        if (typeof atom !== 'string' && atom.kind === 'unknown-value') {
          result.add(atom);
          continue;
        }
        const target = abstractTarget(atom);
        if (!target) continue;
        trackPropagationDependency(target);
        let hasOwnProperty = false;
        if (propertyName === undefined) {
          for (const propertyValue of target.properties.values()) mergeValue(result, propertyValue);
          for (const accessor of target.accessors.values()) {
            mergeValue(result, accessorReturnedValues(accessor.get, receiverValue));
          }
          if (typeof atom === 'string') mergeValue(result, specialProperty(atom, undefined));
        } else {
          const propertyValue = target.properties.get(propertyName);
          const accessor = target.accessors.get(propertyName);
          hasOwnProperty = propertyValue !== undefined || accessor !== undefined;
          if (propertyValue) mergeValue(result, propertyValue);
          if (accessor) mergeValue(result, accessorReturnedValues(accessor.get, receiverValue));
          if (!hasOwnProperty && typeof atom === 'string') {
            const specialValue = specialProperty(atom, propertyName);
            if (specialValue.size > 0) {
              mergeValue(result, specialValue);
              hasOwnProperty = true;
            }
          }
        }
        mergeValue(result, retainReflectiveCallableProvenance(target.unknownProperty));
        mergeValue(result, accessorReturnedValues(target.unknownAccessors.get, receiverValue));
        if (
          !hasOwnProperty ||
          (propertyName !== undefined && target.deletedProperties.has(propertyName)) ||
          target.unknownPropertyDeletion ||
          target.unknownProperty.size > 0 ||
          target.unknownAccessors.get.size > 0
        ) {
          for (const prototype of effectivePrototypes(atom)) pending.push(prototype);
        }
      }
    }
    return result;
  }

  function accessorMayRun(targetValue, propertyNames, kind) {
    const names = propertyNames ?? [undefined];
    for (const propertyName of names) {
      const pending = [...targetValue];
      const seen = new Set();
      for (let queueIndex = 0; queueIndex < pending.length; queueIndex += 1) {
        const atom = pending[queueIndex];
        if (seen.has(atom)) continue;
        seen.add(atom);
        if (!consumeAnalysisWork()) return true;
        if (typeof atom !== 'string' && atom.kind === 'unknown-value') return true;
        const target = abstractTarget(atom);
        if (!target) continue;
        trackPropagationDependency(target);
        if (propertyName === undefined) {
          if (
            target.unknownAccessors[kind].size > 0 ||
            [...target.accessors.values()].some(accessor => accessor[kind].size > 0) ||
            (atom === origins.objectPrototype && kind === 'set')
          ) {
            return true;
          }
        } else {
          const accessor = target.accessors.get(propertyName);
          if (accessor?.[kind].size > 0) return true;
          if (atom === origins.objectPrototype && propertyName === '__proto__') return kind === 'set';
          const propertyMayBeDeleted = target.deletedProperties.has(propertyName) || target.unknownPropertyDeletion;
          if (accessor && (accessor.get.size > 0 || accessor.set.size > 0) && !propertyMayBeDeleted) continue;
          if (target.properties.has(propertyName) && !propertyMayBeDeleted) continue;
          if (typeof atom === 'string' && specialProperty(atom, propertyName).size > 0 && !propertyMayBeDeleted) {
            continue;
          }
          if (target.unknownAccessors[kind].size > 0) return true;
        }
        for (const prototype of effectivePrototypes(atom)) pending.push(prototype);
      }
    }
    return false;
  }

  function invalidateAccessorReceiver(targetValue, propertyNames, kind, receiverValue) {
    if (accessorMayRun(targetValue, propertyNames, kind)) {
      invalidatePositionalTargets(receiverValue, undefined, unknownValue());
    }
  }

  function observedPropertyValue(value, propertyNames, node) {
    invalidateAccessorReceiver(value, propertyNames, 'get', value);
    return getProperty(value, propertyNames, node);
  }

  function observeOwnAccessorReads(value) {
    for (const atom of value) {
      const target = abstractTarget(atom);
      if (!target) continue;
      trackPropagationDependency(target);
      if (
        target.unknownAccessors.get.size > 0 ||
        [...target.accessors.values()].some(accessor => accessor.get.size > 0)
      ) {
        invalidatePositionalTargets(value, undefined, unknownValue());
        return;
      }
    }
  }

  function invalidateBuiltinPrototypeLayout(origin, propertyNames, additionalValues) {
    const state = builtinPrototypeState(origin);
    if (!state) return;
    putAbstractProperty(state, propertyNames, additionalValues);
  }

  function invalidatePositionalTargets(targetValue, propertyNames, additionalValues = new Set()) {
    if (!propertyNamesAffectPositionalLayout(propertyNames)) return;
    for (const atom of targetValue) {
      if (typeof atom !== 'string' && atom.kind === 'carrier') {
        invalidateCarrierPositionalLayout(atom, additionalValues);
      } else if (typeof atom === 'string') {
        invalidateBuiltinPrototypeLayout(atom, propertyNames, additionalValues);
      }
    }
  }

  function prototypePositionalValues(value) {
    const result = new Set();
    const pending = [...value];
    const seen = new Set();
    for (let queueIndex = 0; queueIndex < pending.length; queueIndex += 1) {
      const atom = pending[queueIndex];
      if (seen.has(atom)) continue;
      seen.add(atom);
      if (!consumeAnalysisWork()) break;
      if (typeof atom !== 'string' && atom.kind === 'unknown-value') {
        result.add(atom.callableReason ? atom : unknownReflectiveCallableAtom);
        continue;
      }
      const target = abstractTarget(atom);
      if (!target) continue;
      trackPropagationDependency(target);
      for (const [propertyName, propertyValue] of target.properties) {
        if (propertyNameAffectsInheritedPositions(propertyName)) mergeValue(result, propertyValue);
      }
      mergeValue(result, target.unknownProperty);
      if (
        target.unknownAccessors.get.size > 0 ||
        target.unknownAccessors.set.size > 0 ||
        [...target.accessors].some(([propertyName]) => propertyNameAffectsInheritedPositions(propertyName))
      ) {
        result.add(unknownValueAtom);
      }
      for (const prototype of effectivePrototypes(atom)) pending.push(prototype);
    }
    return result;
  }

  function replacementIteratorValues(value) {
    const result = new Set();
    const pending = [...value];
    const seen = new Set();
    for (let queueIndex = 0; queueIndex < pending.length; queueIndex += 1) {
      const atom = pending[queueIndex];
      if (seen.has(atom)) continue;
      seen.add(atom);
      if (!consumeAnalysisWork()) break;
      if (typeof atom !== 'string' && atom.kind === 'unknown-value') {
        result.add(atom.callableReason ? atom : unknownReflectiveCallableAtom);
        continue;
      }
      const target = abstractTarget(atom);
      if (!target) continue;
      trackPropagationDependency(target);
      const iterator = target.properties.get(iteratorPropertyName);
      const accessor = target.accessors.get(iteratorPropertyName);
      const hasDefiniteIterator = iterator !== undefined || accessor !== undefined;
      if (iterator) mergeValue(result, iterator);
      if (accessor) mergeValue(result, accessorReturnedValues(accessor.get, value));
      if (accessor?.set.size > 0) result.add(unknownReflectiveCallableAtom);
      if (target.unknownProperty.size > 0) {
        mergeValue(result, retainReflectiveCallableProvenance(target.unknownProperty));
      }
      if (target.unknownAccessors.get.size > 0 || target.unknownAccessors.set.size > 0) {
        mergeValue(result, accessorReturnedValues(target.unknownAccessors.get, value));
        if (target.unknownAccessors.set.size > 0) result.add(unknownReflectiveCallableAtom);
      }
      if (atom === origins.arrayPrototype && !hasDefiniteIterator) continue;
      if (!hasDefiniteIterator || target.unknownProperty.size > 0 || target.unknownAccessors.get.size > 0) {
        for (const prototype of effectivePrototypes(atom)) pending.push(prototype);
      }
    }
    return result;
  }

  function setCarrierPrototypes(targetValue, prototypeValue, failClosedUnknown = false) {
    const trackedPrototypeValue = failClosedUnknown
      ? retainReflectiveCallableProvenance(prototypeValue)
      : prototypeValue;
    const positionalValues = prototypePositionalValues(trackedPrototypeValue);
    for (const atom of targetValue) {
      if (typeof atom !== 'string' && atom.kind === 'carrier') {
        mergeCarrierPrototypes(atom, trackedPrototypeValue);
        invalidateCarrierPositionalLayout(atom, positionalValues);
      } else if (typeof atom === 'string') {
        const state = builtinPrototypeState(atom);
        if (!state) continue;
        mergeCarrierPrototypes(state, trackedPrototypeValue);
      }
    }
  }

  function positionalWritesFromCarriers(values, descriptors = false) {
    const writtenValues = new Set();
    let mayAffectLayout = values.length === 0;
    for (const value of values) {
      if (value.size === 0) mayAffectLayout = true;
      for (const atom of value) {
        if (typeof atom === 'string' || atom.kind === 'unknown-value') {
          mayAffectLayout = true;
          if (typeof atom !== 'string') writtenValues.add(atom);
          continue;
        }
        if (atom.kind !== 'carrier') continue;
        trackPropagationDependency(atom);
        if (atom.unknownProperty.size > 0) {
          mayAffectLayout = true;
          mergeValue(writtenValues, atom.unknownProperty);
        }
        for (const [propertyName, propertyValue] of atom.properties) {
          if (!propertyNamesAffectPositionalLayout([propertyName])) continue;
          mayAffectLayout = true;
          mergeValue(writtenValues, propertyValue);
          if (descriptors) mergeValue(writtenValues, getProperty(propertyValue, ['get', 'set', 'value']));
        }
      }
    }
    return { mayAffectLayout, writtenValues };
  }

  function applyObjectAssign(targetValue, sourceValues) {
    for (const sourceValue of sourceValues) {
      for (const source of sourceValue) {
        if (typeof source !== 'string' && source.kind === 'unknown-value') {
          invalidatePositionalTargets(targetValue, undefined, unknownValue());
          setCarrierPrototypes(targetValue, unknownValue(), true);
          recordTargetProperty(targetValue, undefined, unknownReflectiveCallableValue());
          continue;
        }
        if (typeof source === 'string' || source.kind !== 'carrier') continue;
        trackPropagationDependency(source);
        for (const propertyName of new Set([...source.properties.keys(), ...source.accessors.keys()])) {
          const propertyNames = [propertyName];
          const propertyValue = observedPropertyValue(new Set([source]), propertyNames);
          const invokesTargetSetter = accessorMayRun(targetValue, propertyNames, 'set');
          if (invokesTargetSetter) invalidatePositionalTargets(targetValue, undefined, unknownValue());
          invalidatePositionalTargets(targetValue, propertyNames, propertyValue);
          if (propertyName === '__proto__' && invokesTargetSetter) {
            setCarrierPrototypes(targetValue, propertyValue, true);
          } else {
            recordTargetProperty(targetValue, propertyNames, propertyValue);
          }
        }
        if (source.unknownProperty.size > 0 || source.unknownAccessors.get.size > 0) {
          const unknownAssignedValue = new Set(source.unknownProperty);
          if (unknownAssignedValue.size === 0) unknownAssignedValue.add(unknownValueAtom);
          invalidateAccessorReceiver(new Set([source]), undefined, 'get', new Set([source]));
          invalidateAccessorReceiver(targetValue, undefined, 'set', targetValue);
          invalidatePositionalTargets(targetValue, undefined, unknownAssignedValue);
          setCarrierPrototypes(targetValue, unknownValue(), true);
          recordTargetProperty(targetValue, undefined, unknownAssignedValue);
        }
      }
    }
  }

  function definePropertiesOnTarget(targetValue, descriptorsValue) {
    for (const descriptors of descriptorsValue) {
      if (typeof descriptors === 'string' || descriptors.kind === 'unknown-value') {
        recordTargetProperty(targetValue, undefined, unknownReflectiveCallableValue());
        recordTargetAccessor(targetValue, undefined, 'get', unknownReflectiveCallableValue());
        recordTargetAccessor(targetValue, undefined, 'set', unknownReflectiveCallableValue());
        continue;
      }
      if (descriptors.kind !== 'carrier') continue;
      trackPropagationDependency(descriptors);
      for (const propertyName of new Set([...descriptors.properties.keys(), ...descriptors.accessors.keys()])) {
        const descriptorValue = observedPropertyValue(new Set([descriptors]), [propertyName]);
        recordDescriptorAccessors(targetValue, [propertyName], descriptorValue);
        const dataValue = descriptorFieldValues(descriptorValue, 'value');
        if (dataValue.size > 0) recordTargetProperty(targetValue, [propertyName], dataValue);
      }
      if (
        descriptors.unknownProperty.size > 0 ||
        descriptors.unknownAccessors.get.size > 0 ||
        descriptors.unknownAccessors.set.size > 0 ||
        descriptors.unknownSpreadSource
      ) {
        invalidateAccessorReceiver(new Set([descriptors]), undefined, 'get', new Set([descriptors]));
        recordTargetProperty(targetValue, undefined, unknownReflectiveCallableValue());
        recordTargetAccessor(targetValue, undefined, 'get', unknownReflectiveCallableValue());
        recordTargetAccessor(targetValue, undefined, 'set', unknownReflectiveCallableValue());
      }
    }
  }

  function applyPositionalMutationIntrinsic(atom, argumentValues, thisValue) {
    if (atom === origins.objectAssign) {
      const writes = positionalWritesFromCarriers(argumentValues.slice(1));
      if (writes.mayAffectLayout)
        invalidatePositionalTargets(argumentValues[0] ?? new Set(), undefined, writes.writtenValues);
      applyObjectAssign(argumentValues[0] ?? new Set(), argumentValues.slice(1));
      return true;
    }
    if (atom === origins.reflectDeleteProperty) {
      const propertyNames = propertyNamesFromValue(argumentValues[1] ?? new Set());
      invalidatePositionalTargets(argumentValues[0] ?? new Set(), propertyNames, unknownValue());
      recordTargetDeletion(argumentValues[0] ?? new Set(), propertyNames);
      return true;
    }
    if (
      atom === origins.objectDefineProperty ||
      atom === origins.reflectDefineProperty ||
      atom === origins.reflectSet
    ) {
      const propertyNames = propertyNamesFromValue(argumentValues[1] ?? new Set());
      const assignedValue =
        atom === origins.objectDefineProperty || atom === origins.reflectDefineProperty
          ? new Set(
              ['get', 'set', 'value'].flatMap(field => [
                ...descriptorFieldValues(argumentValues[2] ?? new Set(), field),
              ])
            )
          : (argumentValues[2] ?? new Set());
      invalidatePositionalTargets(argumentValues[0] ?? new Set(), propertyNames, assignedValue);
      if (atom === origins.objectDefineProperty || atom === origins.reflectDefineProperty) {
        const descriptorValue = argumentValues[2] ?? new Set();
        recordDescriptorAccessors(argumentValues[0] ?? new Set(), propertyNames, descriptorValue);
        const dataValue = descriptorFieldValues(descriptorValue, 'value');
        if (dataValue.size > 0) recordTargetProperty(argumentValues[0] ?? new Set(), propertyNames, dataValue);
      } else {
        const receiver = argumentValues.length > 3 ? argumentValues[3] : argumentValues[0];
        invalidatePositionalTargets(receiver ?? new Set(), propertyNames, assignedValue);
        const invokesSetter = accessorMayRun(argumentValues[0] ?? new Set(), propertyNames, 'set');
        if (invokesSetter) invalidatePositionalTargets(receiver ?? new Set(), undefined, unknownValue());
        if ((propertyNames === undefined || propertyNames.includes('__proto__')) && invokesSetter) {
          setCarrierPrototypes(receiver ?? new Set(), argumentValues[2] ?? new Set(), true);
        } else {
          recordTargetProperty(receiver ?? new Set(), propertyNames, assignedValue);
        }
      }
      return true;
    }
    if (atom === origins.objectDefineProperties) {
      const writes = positionalWritesFromCarriers([argumentValues[1] ?? new Set()], true);
      if (writes.mayAffectLayout)
        invalidatePositionalTargets(argumentValues[0] ?? new Set(), undefined, writes.writtenValues);
      definePropertiesOnTarget(argumentValues[0] ?? new Set(), argumentValues[1] ?? new Set());
      return true;
    }
    if (atom === origins.objectSetPrototypeOf || atom === origins.reflectSetPrototypeOf) {
      setCarrierPrototypes(argumentValues[0] ?? new Set(), argumentValues[1] ?? new Set(), true);
      return true;
    }
    if (atom === origins.objectPrototypeSetPrototype) {
      setCarrierPrototypes(thisValue ?? new Set(), argumentValues[0] ?? new Set(), true);
      return true;
    }
    if (atom === origins.objectPrototypeDefineGetter || atom === origins.objectPrototypeDefineSetter) {
      const propertyNames = propertyNamesFromValue(argumentValues[0] ?? new Set());
      const accessorValue = argumentValues[1] ?? unknownValue();
      const kind = atom === origins.objectPrototypeDefineGetter ? 'get' : 'set';
      recordTargetAccessor(thisValue ?? new Set(), propertyNames, kind, accessorValue);
      invalidatePositionalTargets(thisValue ?? new Set(), propertyNames, accessorValue);
      return true;
    }
    if (typeof atom !== 'string' && atom.kind === 'positional-mutator') {
      const insertedValues = new Set();
      const insertedArguments =
        atom.method === 'push' || atom.method === 'unshift'
          ? argumentValues
          : atom.method === 'splice'
            ? argumentValues.slice(2)
            : atom.method === 'fill'
              ? argumentValues.slice(0, 1)
              : [];
      for (const argumentValue of insertedArguments) mergeValue(insertedValues, argumentValue);
      invalidatePositionalThisValue(thisValue, insertedValues);
      return true;
    }
    return false;
  }

  function invalidatePositionalWrite(node) {
    const current = unwrapExpression(node);
    if (!ts.isPropertyAccessExpression(current) && !ts.isElementAccessExpression(current)) return;
    const propertyNames = memberPropertyNames(current);
    const targetValue = evaluateExpression(current.expression);
    invalidateAccessorReceiver(targetValue, propertyNames, 'get', targetValue);
    invalidateAccessorReceiver(targetValue, propertyNames, 'set', targetValue);
    if (!propertyNamesAffectPositionalLayout(propertyNames)) return;
    invalidatePositionalTargets(targetValue, propertyNames, unknownValue());
  }

  function recordDeletion(node) {
    const current = unwrapExpression(node);
    if (!ts.isPropertyAccessExpression(current) && !ts.isElementAccessExpression(current)) return;
    const propertyNames = memberPropertyNames(current);
    const targetValue = evaluateExpression(current.expression);
    invalidatePositionalTargets(targetValue, propertyNames, unknownValue());
    recordTargetDeletion(targetValue, propertyNames);
  }

  function invalidatePositionalMutationCall(node) {
    const callee = unwrapExpression(node.expression);
    if (!ts.isPropertyAccessExpression(callee) && !ts.isElementAccessExpression(callee)) return;
    const propertyNames = memberPropertyNames(callee);
    if (propertyNames !== undefined && !propertyNames.some(name => positionalMutationMethods.has(name))) return;
    for (const atom of evaluateExpression(callee.expression)) {
      if (typeof atom !== 'string' && atom.kind === 'carrier') invalidateCarrierPositionalLayout(atom);
    }
  }

  function spreadProperties(carrier, value) {
    for (const atom of value) {
      if (typeof atom === 'string') {
        for (const propertyName of ['default', 'runInContext', 'template']) {
          const propertyValue = specialProperty(atom, propertyName);
          if (propertyValue.size > 0) putCarrierProperty(carrier, [propertyName], propertyValue);
        }
      } else if (atom.kind === 'unknown-value') {
        if (!carrier.unknownSpreadSource) {
          carrier.unknownSpreadSource = true;
          notifyPropagationSubscribers(carrier);
        }
      } else if (atom.kind === 'carrier') {
        trackPropagationDependency(atom);
        if (atom.unknownSpreadSource && !carrier.unknownSpreadSource) {
          carrier.unknownSpreadSource = true;
          notifyPropagationSubscribers(carrier);
        }
        for (const propertyName of new Set([...atom.properties.keys(), ...atom.accessors.keys()])) {
          const propertyValue = observedPropertyValue(new Set([atom]), [propertyName]);
          putCarrierProperty(carrier, [propertyName], propertyValue);
        }
        if (atom.unknownProperty.size > 0 || atom.unknownAccessors.get.size > 0) {
          invalidateAccessorReceiver(new Set([atom]), undefined, 'get', new Set([atom]));
        }
        putCarrierProperty(carrier, undefined, atom.unknownProperty);
      }
    }
  }

  function arrayRestValue(value, startIndex, node, existingExpansion) {
    const restCarrier = carrierFor(node, true);
    const restLengths = new Set();
    const uncertainValues = new Set();
    const expansion = existingExpansion ?? positionalLayouts(value);
    for (const atom of value) {
      if (typeof atom === 'string' || atom.kind !== 'carrier') continue;
      trackPropagationDependency(atom);
      for (const [propertyName, propertyValue] of atom.properties) {
        if (!/^(0|[1-9]\d*)$/.test(propertyName)) continue;
        const sourceIndex = Number(propertyName);
        if (!Number.isSafeInteger(sourceIndex) || sourceIndex < startIndex) continue;
        putCarrierProperty(restCarrier, [String(sourceIndex - startIndex)], propertyValue);
      }
      putCarrierProperty(restCarrier, undefined, atom.unknownProperty);
      for (const length of atom.positionalLengths) restLengths.add(Math.max(0, length - startIndex));
      mergeValue(uncertainValues, atom.uncertainPositionalValues);
    }
    for (const layout of expansion.layouts) {
      for (let index = startIndex; index < layout.length; index += 1) {
        putCarrierProperty(restCarrier, [String(index - startIndex)], layout[index]);
      }
      restLengths.add(Math.max(0, layout.length - startIndex));
    }
    mergeValue(uncertainValues, expansion.uncertainValues);
    mergeCarrierPositionalState(
      restCarrier,
      restLengths,
      value.size === 0 ||
        [...value].some(atom => typeof atom === 'string' || atom.kind !== 'carrier' || atom.positionalUncertain) ||
        expansion.uncertainPositioning,
      uncertainValues
    );
    return new Set([restCarrier]);
  }

  function isUnboundRequireCall(node) {
    const current = unwrapExpression(node);
    if (!ts.isCallExpression(current) || current.arguments.length !== 1) return false;
    const callee = unwrapExpression(current.expression);
    return ts.isIdentifier(callee) && callee.text === 'require' && !lookupBinding(callee);
  }

  function boundCallableFor(node, target, boundThis, boundArguments) {
    let atom = boundCallableAtoms.get(node);
    if (!atom) {
      atom = { kind: 'bound-callable', target: new Set(), boundThis: new Set(), boundArguments: [] };
      boundCallableAtoms.set(node, atom);
    }
    mergeCallableValue(atom, atom.target, target);
    mergeCallableValue(atom, atom.boundThis, boundThis);
    for (const [index, boundValue] of boundArguments.entries()) {
      let storedValue = atom.boundArguments[index];
      if (!storedValue) {
        storedValue = new Set();
        atom.boundArguments[index] = storedValue;
      }
      mergeCallableValue(atom, storedValue, boundValue);
    }
    return atom;
  }

  function carrierPositionValue(carrier, index) {
    return observedPropertyValue(new Set([carrier]), [String(index)]);
  }

  function positionalLayouts(value) {
    const layouts = [];
    const uncertainValues = new Set();
    let uncertainPositioning = value.size === 0;

    for (const atom of value) {
      if (typeof atom === 'string' || atom.kind !== 'carrier') {
        uncertainPositioning = true;
        if (isTrackedCallable(atom) || (typeof atom !== 'string' && atom.kind === 'unknown-value')) {
          uncertainValues.add(atom);
        }
        continue;
      }
      trackPropagationDependency(atom);
      const replacementIterator = replacementIteratorValues(new Set([atom]));
      if (replacementIterator.size > 0) {
        uncertainPositioning = true;
        mergeValue(uncertainValues, observeIteratorExecution(new Set([atom]), replacementIterator));
      }
      const inheritedPositionalValues = prototypePositionalValues(effectivePrototypes(atom));
      if (inheritedPositionalValues.size > 0) {
        uncertainPositioning = true;
        mergeValue(uncertainValues, inheritedPositionalValues);
      }
      const numericIndices = [...atom.properties.keys()]
        .filter(propertyName => /^(0|[1-9]\d*)$/.test(propertyName))
        .map(Number)
        .filter(Number.isSafeInteger);
      let lengths = [...atom.positionalLengths];
      if (lengths.length === 0 && numericIndices.length > 0) {
        lengths = [Math.min(Math.max(...numericIndices) + 1, maximumTrackedInvocationArguments)];
        uncertainPositioning = true;
      } else if (lengths.length === 0) {
        uncertainPositioning = true;
      }
      mergeValue(uncertainValues, atom.uncertainPositionalValues);
      if (atom.positionalUncertain || atom.unknownProperty.size > 0) {
        uncertainPositioning = true;
        mergeValue(uncertainValues, atom.unknownProperty);
      }
      for (const length of lengths) {
        const layout = Array.from({ length }, (_, index) => carrierPositionValue(atom, index));
        if (layouts.length < maximumTrackedPositionalAlternatives) {
          layouts.push(layout);
        } else {
          uncertainPositioning = true;
          for (const positionalValue of layout) mergeValue(uncertainValues, positionalValue);
        }
      }
    }

    return { layouts, uncertainPositioning, uncertainValues };
  }

  function positionalValueAt(expansion, index) {
    const result = new Set();
    for (const layout of expansion.layouts) mergeValue(result, layout[index] ?? new Set());
    if (expansion.uncertainPositioning) mergeValue(result, expansion.uncertainValues);
    return result;
  }

  function allPositionalValues(expansion) {
    const result = new Set(expansion.uncertainValues);
    for (const layout of expansion.layouts) {
      for (const value of layout) mergeValue(result, value);
    }
    return result;
  }

  function mergeInvocation(target, source) {
    mergeValue(target.result, source.result);
    mergeValue(target.kinds, source.kinds);
  }

  function mergePositionalLimit(invocation, expansion) {
    if (hasUnsafePositionalValue(expansion.uncertainValues)) {
      invocation.kinds.add(analysisLimitKind);
    }
  }

  function invalidatePositionalThisValue(thisValue, additionalValues = new Set()) {
    for (const atom of thisValue ?? []) {
      if (typeof atom !== 'string' && atom.kind === 'carrier') {
        invalidateCarrierPositionalLayout(atom, additionalValues);
      }
    }
  }

  function reflectedPropertyValue(argumentValues) {
    return retainReflectiveCallableProvenance(
      getProperty(argumentValues[0] ?? new Set(), propertyNamesFromValue(argumentValues[1] ?? new Set()))
    );
  }

  function createObjectValue(argumentValues, invocationNode) {
    const object = syntheticCarrierFor(invocationNode, 'created-object');
    setCarrierPrototypes(new Set([object]), argumentValues[0] ?? unknownValue(), true);
    if (argumentValues.length > 1) {
      definePropertiesOnTarget(new Set([object]), argumentValues[1] ?? new Set());
    }
    return new Set([object]);
  }

  function arrayFromValue(argumentValues, invocationNode) {
    const array = syntheticCarrierFor(invocationNode, 'array-from-result', true);
    const expansion = positionalLayouts(argumentValues[0] ?? new Set());
    const lengths = new Set();
    for (const layout of expansion.layouts) {
      lengths.add(layout.length);
      for (const [index, value] of layout.entries()) putCarrierProperty(array, [String(index)], value);
    }
    mergeCarrierPositionalState(array, lengths, expansion.uncertainPositioning, expansion.uncertainValues);
    return new Set([array]);
  }

  function putPropertyDescriptorFields(descriptor, targetValue, propertyNames, failClosedValue = false) {
    const dataValue = getProperty(targetValue, propertyNames);
    putCarrierProperty(
      descriptor,
      ['value'],
      failClosedValue ? retainReflectiveCallableProvenance(dataValue) : dataValue
    );
    for (const atom of targetValue) {
      const target = abstractTarget(atom);
      if (target) {
        const names = propertyNames ?? [...target.accessors.keys()];
        for (const propertyName of names) {
          const accessor = target.accessors.get(propertyName);
          if (accessor?.get.size > 0) {
            for (const callable of accessor.get) {
              if (typeof callable !== 'string' && callable.kind === 'function-value') {
                callable.trackCallResult = true;
              }
            }
            putCarrierProperty(descriptor, ['get'], accessor.get);
          }
          if (accessor?.set.size > 0) {
            for (const callable of accessor.set) {
              if (typeof callable !== 'string' && callable.kind === 'function-value') {
                callable.trackCallResult = true;
              }
            }
            putCarrierProperty(descriptor, ['set'], accessor.set);
          }
        }
        if (propertyNames === undefined) {
          putCarrierProperty(descriptor, ['get'], target.unknownAccessors.get);
          putCarrierProperty(descriptor, ['set'], target.unknownAccessors.set);
        }
      }
      if (atom === origins.objectPrototype && (propertyNames === undefined || propertyNames.includes('__proto__'))) {
        putCarrierProperty(descriptor, ['get'], originValue(origins.knownSafeCallable));
        putCarrierProperty(descriptor, ['set'], originValue(origins.objectPrototypeSetPrototype));
      }
    }
  }

  function propertyDescriptorValue(argumentValues, invocationNode) {
    const descriptor = syntheticCarrierFor(invocationNode, 'property-descriptor');
    putPropertyDescriptorFields(
      descriptor,
      argumentValues[0] ?? new Set(),
      propertyNamesFromValue(argumentValues[1] ?? new Set()),
      true
    );
    return new Set([descriptor]);
  }

  function ownPropertyNames(atom) {
    if (atom === origins.arrayObject) return ['from', 'of'];
    if (atom === origins.arrayPrototype) return [...positionalMutationMethods];
    if (atom === origins.functionPrototype) return ['apply', 'bind', 'call'];
    if (atom === origins.jsonObject) return ['parse', 'stringify'];
    if (atom === origins.objectObject) {
      return [
        'assign',
        'create',
        'defineProperties',
        'defineProperty',
        'getOwnPropertyDescriptor',
        'getOwnPropertyDescriptors',
        'getPrototypeOf',
        'prototype',
        'setPrototypeOf',
      ];
    }
    if (atom === origins.objectPrototype) return ['__defineGetter__', '__defineSetter__', '__proto__'];
    if (atom === origins.reflectObject) {
      return [
        'apply',
        'construct',
        'deleteProperty',
        'defineProperty',
        'get',
        'getOwnPropertyDescriptor',
        'getPrototypeOf',
        'set',
        'setPrototypeOf',
      ];
    }
    if (atom === origins.globalObject) {
      return ['Array', 'Date', 'eval', 'Function', 'JSON', 'Object', 'Reflect', 'Symbol', '_'];
    }
    return [];
  }

  function propertyDescriptorsValue(argumentValues, invocationNode) {
    const targetValue = argumentValues[0] ?? new Set();
    const descriptors = syntheticCarrierFor(invocationNode, 'property-descriptors');
    for (const atom of targetValue) {
      if (typeof atom === 'string') {
        const state = builtinPrototypeState(atom);
        const propertyNames = new Set([
          ...ownPropertyNames(atom),
          ...(state?.properties.keys() ?? []),
          ...(state?.accessors.keys() ?? []),
        ]);
        for (const propertyName of propertyNames) {
          const descriptor = syntheticCarrierFor(invocationNode, `property-descriptor:${propertyName}`);
          putPropertyDescriptorFields(descriptor, originValue(atom), [propertyName], true);
          putCarrierProperty(descriptors, [propertyName], new Set([descriptor]));
        }
        continue;
      }
      if (atom.kind === 'unknown-value') {
        const descriptor = syntheticCarrierFor(invocationNode, 'property-descriptor:unknown-target');
        putCarrierProperty(descriptor, ['get', 'set', 'value'], unknownReflectiveCallableValue());
        putCarrierProperty(descriptors, undefined, new Set([descriptor]));
        continue;
      }
      if (atom.kind !== 'carrier') continue;
      trackPropagationDependency(atom);
      for (const propertyName of new Set([...atom.properties.keys(), ...atom.accessors.keys()])) {
        const descriptor = syntheticCarrierFor(invocationNode, `property-descriptor:${propertyName}`);
        putPropertyDescriptorFields(descriptor, new Set([atom]), [propertyName], true);
        putCarrierProperty(descriptors, [propertyName], new Set([descriptor]));
      }
      if (atom.unknownProperty.size > 0 || atom.unknownAccessors.get.size > 0 || atom.unknownAccessors.set.size > 0) {
        const descriptor = syntheticCarrierFor(invocationNode, 'property-descriptor:unknown');
        putPropertyDescriptorFields(descriptor, new Set([atom]), undefined, true);
        putCarrierProperty(descriptors, undefined, new Set([descriptor]));
      }
    }
    return new Set([descriptors]);
  }

  function prototypeValue(argumentValues) {
    const result = new Set();
    for (const atom of argumentValues[0] ?? []) {
      if (typeof atom === 'string') {
        const state = builtinPrototypeState(atom);
        if (!state) result.add(unknownValueAtom);
        else if (state.prototypes.size > 0) mergeValue(result, state.prototypes);
        else mergeValue(result, literalValue(null));
      } else if (atom.kind === 'unknown-value') {
        result.add(atom);
      } else if (atom.kind === 'carrier') {
        trackPropagationDependency(atom);
        mergeValue(result, effectivePrototypes(atom));
      }
    }
    const trackedResult = new Set();
    for (const atom of result) {
      trackedResult.add(atom === unknownValueAtom ? unknownReflectiveContainerAtom : atom);
    }
    return trackedResult;
  }

  function invocationCarriesTrackedProvenance(argumentValues) {
    return argumentValues.some(value => returnBindingCarriesTrackedProvenance(value, new Set(), { count: 256 }, false));
  }

  function outerReturnCarriesTrackedProvenance(atom) {
    for (const binding of atom.outerReturnBindings) {
      const value = activeInvocationBindingValue(binding) ?? atom.capturedBindings.get(binding) ?? binding.value;
      if (returnBindingCarriesTrackedProvenance(value)) return true;
    }
    return false;
  }

  function returnBindingCarriesTrackedProvenance(
    value,
    seen = new Set(),
    remaining = { count: 256 },
    includeUnknown = true
  ) {
    for (const atom of value) {
      if (typeof atom === 'string') return true;
      if (atom.kind === 'unknown-value') {
        if (includeUnknown && atom.callableReason !== undefined) return true;
        continue;
      }
      if (atom.kind === 'function-value') {
        if (seen.has(atom)) continue;
        seen.add(atom);
        if (atom.trackCallResult === true || atom.mayTrackCallResult) return true;
        for (const binding of atom.outerReturnBindings) {
          const bindingValue =
            activeInvocationBindingValue(binding) ?? atom.capturedBindings.get(binding) ?? binding.value;
          if (returnBindingCarriesTrackedProvenance(bindingValue, seen, remaining, includeUnknown)) return true;
        }
        continue;
      }
      if (
        atom.kind === 'bound-callable' ||
        atom.kind === 'invocation-method' ||
        atom.kind === 'iterator-next' ||
        atom.kind === 'positional-mutator'
      ) {
        return true;
      }
      if (atom.kind !== 'carrier' || seen.has(atom)) continue;
      if (remaining.count <= 0) return true;
      remaining.count -= 1;
      seen.add(atom);
      const nestedValues = [
        ...atom.properties.values(),
        ...[...atom.accessors.values()].flatMap(accessor => [accessor.get, accessor.set]),
        atom.unknownProperty,
        atom.unknownAccessors.get,
        atom.unknownAccessors.set,
      ];
      if (nestedValues.some(nested => returnBindingCarriesTrackedProvenance(nested, seen, remaining, includeUnknown))) {
        return true;
      }
    }
    return false;
  }

  function invokeTracked(
    callable,
    argumentValues,
    invocationNode,
    seen = new Set(),
    thisValue,
    suppressUnknownCallableLimit = false
  ) {
    const invocation = { result: new Set(), kinds: new Set() };
    if (activeCallableRecursionDepth >= maximumCallableRecursionDepth) {
      invocation.kinds.add(`${analysisLimitKind}:callable-recursion-limit`);
      return invocation;
    }
    activeCallableRecursionDepth += 1;
    try {
      for (const atom of callable) {
        if (typeof atom !== 'string' && atom.kind === 'unknown-value') {
          invocation.result.add(atom);
          if (atom.callableReason && !suppressUnknownCallableLimit) {
            invocation.kinds.add(`${analysisLimitKind}:${atom.callableReason}`);
          }
          continue;
        }
        if (!isTrackedCallable(atom)) continue;
        if (typeof atom !== 'string' && atom.kind === 'function-value' && atom.returnProvenanceUncertain) {
          invocation.kinds.add(`${analysisLimitKind}:return-provenance-limit`);
          continue;
        }
        if (
          typeof atom !== 'string' &&
          atom.kind === 'function-value' &&
          atom.trackCallResult !== true &&
          !atom.mayTrackCallResult &&
          !(atom.parameterDependentReturn && invocationCarriesTrackedProvenance(argumentValues)) &&
          !(atom.receiverDependentReturn && returnBindingCarriesTrackedProvenance(thisValue ?? new Set())) &&
          !outerReturnCarriesTrackedProvenance(atom)
        ) {
          continue;
        }
        if (!consumeDependencyCompositionWork(invocationNode)) {
          invocation.kinds.add(analysisLimitKind);
          break;
        }
        if (atom === origins.builtinEval) {
          invocation.kinds.add('direct-eval');
        } else if (atom === origins.lodashTemplate) {
          invocation.kinds.add('lodash-template');
        } else if (atom === origins.lodashRunInContext) {
          invocation.result.add(origins.lodashObject);
        } else if (atom === origins.arrayFrom) {
          mergeValue(invocation.result, arrayFromValue(argumentValues, invocationNode));
        } else if (
          typeof atom !== 'string' &&
          atom.kind === 'function-value' &&
          (atom.outerReturnBindings.size > 0 ||
            atom.parameterDependentReturn ||
            atom.receiverDependentReturn ||
            atom.returnProvenanceUncertain ||
            atom.trackCallResult === true ||
            atom.mayTrackCallResult ||
            atom.iteratorNode.asteriskToken)
        ) {
          if (atom.iteratorNode.asteriskToken) {
            invocation.result.add(iteratorInvocationFor(invocationNode, atom, thisValue ?? new Set()));
          } else {
            mergeValue(
              invocation.result,
              functionReturnedValues(atom, thisValue ?? new Set(), argumentValues, invocationNode)
            );
          }
        } else if (typeof atom !== 'string' && atom.kind === 'iterator-next') {
          trackPropagationDependency(atom.iteratorInstance);
          trackPropagationDependency(atom.iteratorInstance.iterators);
          trackPropagationDependency(atom.iteratorInstance.receivers);
          for (const iterator of atom.iteratorInstance.iterators) {
            if (typeof iterator !== 'string' && iterator.kind === 'function-value') {
              executeIteratorReceiverEffects(iterator, atom.iteratorInstance.receivers);
            }
          }
        } else if (atom === origins.objectCreate) {
          mergeValue(invocation.result, createObjectValue(argumentValues, invocationNode));
        } else if (atom === origins.reflectApply || atom === origins.reflectConstruct) {
          const target = argumentValues[0] ?? new Set();
          if (hasUnknownValue(target)) invocation.kinds.add(unknownReflectTargetLimitKind);
          const argumentCarrier = argumentValues[atom === origins.reflectApply ? 2 : 1] ?? new Set();
          const targetThisValue = atom === origins.reflectApply ? argumentValues[1] : undefined;
          const expansion = positionalLayouts(argumentCarrier);
          const layouts = expansion.layouts.length > 0 ? expansion.layouts : [[]];
          for (const layout of layouts) {
            mergeInvocation(invocation, invokeTracked(target, layout, invocationNode, seen, targetThisValue, true));
          }
          if (hasUnsafeCallable(target)) mergePositionalLimit(invocation, expansion);
        } else if (atom === origins.reflectGet) {
          const target = argumentValues[0] ?? new Set();
          const propertyNames = propertyNamesFromValue(argumentValues[1] ?? new Set());
          const receiver = argumentValues.length > 2 ? argumentValues[2] : target;
          const invokesGetter = accessorMayRun(target, propertyNames, 'get');
          if (invokesGetter) {
            invalidatePositionalTargets(receiver, undefined, unknownValue());
            invocation.result.add(unknownValueAtom);
          }
          mergeValue(invocation.result, reflectedPropertyValue(argumentValues));
        } else if (
          atom === origins.objectGetOwnPropertyDescriptor ||
          atom === origins.reflectGetOwnPropertyDescriptor
        ) {
          mergeValue(invocation.result, propertyDescriptorValue(argumentValues, invocationNode));
        } else if (atom === origins.objectGetOwnPropertyDescriptors) {
          mergeValue(invocation.result, propertyDescriptorsValue(argumentValues, invocationNode));
        } else if (atom === origins.objectGetPrototypeOf || atom === origins.reflectGetPrototypeOf) {
          mergeValue(invocation.result, prototypeValue(argumentValues));
        } else if (atom === origins.functionPrototypeCall) {
          mergeInvocation(
            invocation,
            invokeTracked(
              thisValue ?? new Set(),
              argumentValues.slice(1),
              invocationNode,
              seen,
              argumentValues[0],
              suppressUnknownCallableLimit
            )
          );
        } else if (atom === origins.functionPrototypeApply) {
          const expansion = positionalLayouts(argumentValues[1] ?? new Set());
          const layouts = expansion.layouts.length > 0 ? expansion.layouts : [[]];
          for (const layout of layouts) {
            mergeInvocation(
              invocation,
              invokeTracked(
                thisValue ?? new Set(),
                layout,
                invocationNode,
                seen,
                argumentValues[0],
                suppressUnknownCallableLimit
              )
            );
          }
          if (hasUnsafeCallable(thisValue ?? new Set())) mergePositionalLimit(invocation, expansion);
        } else if (atom === origins.functionPrototypeBind) {
          invocation.result.add(
            boundCallableFor(
              invocationNode,
              thisValue ?? new Set(),
              argumentValues[0] ?? new Set(),
              argumentValues.slice(1)
            )
          );
        } else if (applyPositionalMutationIntrinsic(atom, argumentValues, thisValue)) {
          if (
            atom === origins.objectAssign ||
            atom === origins.objectDefineProperties ||
            atom === origins.objectDefineProperty ||
            atom === origins.objectSetPrototypeOf
          ) {
            mergeValue(invocation.result, argumentValues[0] ?? new Set());
          } else if (
            atom === origins.reflectDefineProperty ||
            atom === origins.reflectDeleteProperty ||
            atom === origins.reflectSet ||
            atom === origins.reflectSetPrototypeOf
          ) {
            mergeValue(invocation.result, literalValue(true));
          }
        } else if (typeof atom !== 'string' && !seen.has(atom)) {
          const nextSeen = new Set(seen);
          nextSeen.add(atom);
          if (atom.kind === 'bound-callable') {
            trackPropagationDependency(atom);
            trackPropagationDependency(atom.target);
            trackPropagationDependency(atom.boundThis);
            for (const boundArgument of atom.boundArguments) trackPropagationDependency(boundArgument);
            mergeInvocation(
              invocation,
              invokeTracked(
                atom.target,
                [...atom.boundArguments, ...argumentValues],
                invocationNode,
                nextSeen,
                atom.boundThis,
                suppressUnknownCallableLimit
              )
            );
          } else if (atom.kind === 'invocation-method' && atom.method === 'call') {
            trackPropagationDependency(atom.target);
            mergeInvocation(
              invocation,
              invokeTracked(
                atom.target,
                argumentValues.slice(1),
                invocationNode,
                nextSeen,
                argumentValues[0],
                suppressUnknownCallableLimit
              )
            );
          } else if (atom.kind === 'invocation-method' && atom.method === 'apply') {
            trackPropagationDependency(atom.target);
            const expansion = positionalLayouts(argumentValues[1] ?? new Set());
            const layouts = expansion.layouts.length > 0 ? expansion.layouts : [[]];
            for (const layout of layouts) {
              mergeInvocation(
                invocation,
                invokeTracked(
                  atom.target,
                  layout,
                  invocationNode,
                  nextSeen,
                  argumentValues[0],
                  suppressUnknownCallableLimit
                )
              );
            }
            if (hasUnsafeCallable(atom.target)) mergePositionalLimit(invocation, expansion);
          } else if (atom.kind === 'invocation-method' && atom.method === 'bind') {
            trackPropagationDependency(atom.target);
            invocation.result.add(
              boundCallableFor(invocationNode, atom.target, argumentValues[0] ?? new Set(), argumentValues.slice(1))
            );
          }
        }
      }
    } finally {
      activeCallableRecursionDepth -= 1;
    }
    return invocation;
  }

  function invokePositionalMutators(callable, argumentValues, invocationNode, seen = new Set(), thisValue) {
    if (activeMutationRecursionDepth >= maximumCallableRecursionDepth) {
      if (!analysisWorkLimit) {
        analysisWorkLimit = {
          reason: 'callable-recursion-limit',
          position: invocationNode.getStart(sourceFile),
        };
      }
      return;
    }
    activeMutationRecursionDepth += 1;
    try {
      for (const atom of callable) {
        if (atom === origins.reflectApply) {
          if (!consumeDependencyCompositionWork(invocationNode)) return;
          const expansion = positionalLayouts(argumentValues[2] ?? new Set());
          const layouts = expansion.layouts.length > 0 ? expansion.layouts : [[]];
          for (const layout of layouts) {
            invokePositionalMutators(argumentValues[0] ?? new Set(), layout, invocationNode, seen, argumentValues[1]);
            if (analysisStopped()) return;
          }
        } else if (atom === origins.functionPrototypeCall) {
          if (!consumeDependencyCompositionWork(invocationNode)) return;
          invokePositionalMutators(
            thisValue ?? new Set(),
            argumentValues.slice(1),
            invocationNode,
            seen,
            argumentValues[0]
          );
        } else if (atom === origins.functionPrototypeApply) {
          if (!consumeDependencyCompositionWork(invocationNode)) return;
          const expansion = positionalLayouts(argumentValues[1] ?? new Set());
          const layouts = expansion.layouts.length > 0 ? expansion.layouts : [[]];
          for (const layout of layouts) {
            invokePositionalMutators(thisValue ?? new Set(), layout, invocationNode, seen, argumentValues[0]);
            if (analysisStopped()) return;
          }
        } else if (applyPositionalMutationIntrinsic(atom, argumentValues, thisValue)) {
          if (!consumeDependencyCompositionWork(invocationNode)) return;
        } else if (
          typeof atom !== 'string' &&
          (atom.kind === 'bound-callable' || atom.kind === 'invocation-method') &&
          !seen.has(atom)
        ) {
          if (!consumeDependencyCompositionWork(invocationNode)) return;
          const nextSeen = new Set(seen);
          nextSeen.add(atom);
          trackPropagationDependency(atom.target);
          if (atom.kind === 'bound-callable') {
            trackPropagationDependency(atom.boundThis);
            for (const boundArgument of atom.boundArguments) trackPropagationDependency(boundArgument);
            invokePositionalMutators(
              atom.target,
              [...atom.boundArguments, ...argumentValues],
              invocationNode,
              nextSeen,
              atom.boundThis
            );
          } else if (atom.method === 'call') {
            invokePositionalMutators(atom.target, argumentValues.slice(1), invocationNode, nextSeen, argumentValues[0]);
          } else if (atom.method === 'apply') {
            const expansion = positionalLayouts(argumentValues[1] ?? new Set());
            const layouts = expansion.layouts.length > 0 ? expansion.layouts : [[]];
            for (const layout of layouts) {
              invokePositionalMutators(atom.target, layout, invocationNode, nextSeen, argumentValues[0]);
              if (analysisStopped()) return;
            }
          }
        }
      }
    } finally {
      activeMutationRecursionDepth -= 1;
    }
  }

  function appendPositionalValue(layout, value, uncertainValues) {
    const result = [...layout];
    if (result.length < maximumTrackedInvocationArguments) {
      result.push(value);
    } else {
      mergeValue(result[maximumTrackedInvocationArguments - 1], value);
      mergeValue(uncertainValues, value);
    }
    return result;
  }

  function mergeLayoutValues(target, layouts) {
    for (const layout of layouts) {
      for (const value of layout) mergeValue(target, value);
    }
  }

  function appendExpansionValue(expansion, value) {
    if (expansion.uncertainPositioning) mergeValue(expansion.uncertainValues, value);
    expansion.layouts = expansion.layouts.map(layout =>
      appendPositionalValue(layout, value, expansion.uncertainValues)
    );
  }

  function appendSpreadExpansion(expansion, spreadExpansion) {
    if (expansion.uncertainPositioning) mergeLayoutValues(expansion.uncertainValues, spreadExpansion.layouts);
    mergeValue(expansion.uncertainValues, spreadExpansion.uncertainValues);
    if (spreadExpansion.uncertainPositioning) {
      expansion.uncertainPositioning = true;
      mergeLayoutValues(expansion.uncertainValues, spreadExpansion.layouts);
    }
    const suffixes = spreadExpansion.layouts.length > 0 ? spreadExpansion.layouts : [[]];
    const combined = [];
    for (const prefix of expansion.layouts) {
      for (const suffix of suffixes) {
        let layout = prefix;
        for (const value of suffix) {
          layout = appendPositionalValue(layout, value, expansion.uncertainValues);
        }
        if (combined.length < maximumTrackedPositionalAlternatives) {
          combined.push(layout);
        } else {
          expansion.uncertainPositioning = true;
          mergeLayoutValues(expansion.uncertainValues, [layout]);
        }
      }
    }
    expansion.layouts = combined;
  }

  function positionalExpansionForNodes(nodes) {
    const expansion = { layouts: [[]], uncertainPositioning: false, uncertainValues: new Set() };
    for (const node of nodes) {
      if (ts.isOmittedExpression(node)) {
        appendExpansionValue(expansion, new Set());
      } else if (ts.isSpreadElement(node)) {
        appendSpreadExpansion(expansion, positionalLayouts(evaluateExpression(node.expression)));
      } else {
        appendExpansionValue(expansion, evaluateExpression(node));
      }
    }
    return expansion;
  }

  function evaluateInvocation(calleeNode, argumentNodes, invocationNode) {
    const callee = evaluateExpression(calleeNode);
    const unwrappedCallee = unwrapExpression(calleeNode);
    const thisValue =
      ts.isPropertyAccessExpression(unwrappedCallee) || ts.isElementAccessExpression(unwrappedCallee)
        ? evaluateExpression(unwrappedCallee.expression)
        : undefined;
    const expansion = positionalExpansionForNodes(argumentNodes);
    const invocation = { result: new Set(), kinds: new Set() };
    for (const layout of expansion.layouts) {
      mergeInvocation(invocation, invokeTracked(callee, layout, invocationNode, new Set(), thisValue));
    }
    if (hasUnsafeCallable(callee)) mergePositionalLimit(invocation, expansion);
    return invocation;
  }

  function invalidateIndirectPositionalMutationCall(node) {
    const callee = evaluateExpression(node.expression);
    const unwrappedCallee = unwrapExpression(node.expression);
    const thisValue =
      ts.isPropertyAccessExpression(unwrappedCallee) || ts.isElementAccessExpression(unwrappedCallee)
        ? evaluateExpression(unwrappedCallee.expression)
        : undefined;
    const expansion = positionalExpansionForNodes([...node.arguments]);
    for (const layout of expansion.layouts) {
      invokePositionalMutators(callee, layout, node, new Set(), thisValue);
      if (analysisStopped()) return;
    }
  }

  function evaluateExpression(node) {
    if (!node) return new Set();
    const current = unwrapExpression(node);
    if (current.kind === ts.SyntaxKind.ThisKeyword) {
      return activeFunctionReceiver ?? new Set([opaqueThisValueAtom]);
    }
    if (ts.isIdentifier(current)) return identifierValue(current);
    if (ts.isStringLiteralLike(current) || ts.isNumericLiteral(current)) return literalValue(current.text);
    if (current.kind === ts.SyntaxKind.NullKeyword) return literalValue(null);
    if (current.kind === ts.SyntaxKind.TrueKeyword) return literalValue(true);
    if (current.kind === ts.SyntaxKind.FalseKeyword) return literalValue(false);
    if (ts.isNoSubstitutionTemplateLiteral(current)) return literalValue(current.text);

    if (ts.isPropertyAccessExpression(current) || ts.isElementAccessExpression(current)) {
      const targetValue = evaluateExpression(current.expression);
      const propertyNames = memberPropertyNames(current);
      invalidateAccessorReceiver(targetValue, propertyNames, 'get', targetValue);
      return getProperty(targetValue, propertyNames, current);
    }

    if (ts.isObjectLiteralExpression(current)) {
      const carrier = carrierFor(current);
      for (const property of current.properties) {
        if (ts.isPropertyAssignment(property)) {
          const propertyNames = declaredPropertyNames(property.name);
          const propertyValue = evaluateExpression(property.initializer);
          if (!ts.isComputedPropertyName(property.name) && propertyNames?.includes('__proto__')) {
            setCarrierPrototypes(new Set([carrier]), propertyValue, true);
          } else {
            putCarrierProperty(carrier, propertyNames, propertyValue);
          }
        } else if (ts.isShorthandPropertyAssignment(property)) {
          putCarrierProperty(carrier, [property.name.text], evaluateExpression(property.name));
        } else if (ts.isSpreadAssignment(property)) {
          spreadProperties(carrier, evaluateExpression(property.expression));
        } else if (ts.isMethodDeclaration(property)) {
          putCarrierProperty(carrier, declaredPropertyNames(property.name), functionValue(property));
        } else if (ts.isGetAccessorDeclaration(property)) {
          const propertyNames = declaredPropertyNames(property.name);
          recordTargetAccessor(new Set([carrier]), propertyNames, 'get', functionValue(property));
        } else if (ts.isSetAccessorDeclaration(property)) {
          recordTargetAccessor(
            new Set([carrier]),
            declaredPropertyNames(property.name),
            'set',
            functionValue(property)
          );
        }
      }
      return new Set([carrier]);
    }

    if (ts.isArrayLiteralExpression(current)) {
      const carrier = carrierFor(current, true);
      const expansion = positionalExpansionForNodes([...current.elements]);
      const lengths = new Set();
      for (const layout of expansion.layouts) {
        lengths.add(layout.length);
        for (const [index, value] of layout.entries()) {
          putCarrierProperty(carrier, [String(index)], value);
        }
      }
      mergeCarrierPositionalState(carrier, lengths, expansion.uncertainPositioning, expansion.uncertainValues);
      return new Set([carrier]);
    }

    if (ts.isCallExpression(current)) {
      if (isUnboundRequireCall(current)) return moduleValue(literalPropertyName(current.arguments[0]));
      const result = evaluateInvocation(current.expression, [...current.arguments], current).result;
      return result.size > 0 ? result : unknownValue();
    }

    if (ts.isNewExpression(current)) {
      const result = evaluateInvocation(current.expression, [...(current.arguments ?? [])], current).result;
      return result.size > 0 ? result : unknownValue();
    }

    if (ts.isFunctionExpression(current) || ts.isArrowFunction(current)) return functionValue(current);

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
    return unknownValue();
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
        if (element.dotDotDotToken) observeOwnAccessorReads(value);
        let elementValue = element.dotDotDotToken
          ? value
          : observedPropertyValue(value, bindingElementPropertyNames(element));
        if (element.initializer) {
          elementValue = new Set(elementValue);
          mergeValue(elementValue, evaluateExpression(element.initializer));
        }
        bindPattern(element.name, elementValue);
      }
      return;
    }
    const expansion = positionalLayouts(value);
    for (const [index, element] of name.elements.entries()) {
      if (!ts.isBindingElement(element)) continue;
      let elementValue = element.dotDotDotToken
        ? arrayRestValue(value, index, element, expansion)
        : positionalValueAt(expansion, index);
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
      if (binding) {
        const invocationValue = activeInvocationBindingValue(binding);
        if (invocationValue) mergeValue(invocationValue, value);
        else mergeTracked(binding.value, value);
      }
      return;
    }
    if (ts.isPropertyAccessExpression(current) || ts.isElementAccessExpression(current)) {
      const propertyNames = memberPropertyNames(current);
      const targetValue = evaluateExpression(current.expression);
      const invokesSetter = accessorMayRun(targetValue, propertyNames, 'set');
      if (invokesSetter) invalidatePositionalTargets(targetValue, undefined, unknownValue());
      invalidatePositionalTargets(targetValue, propertyNames, value);
      if ((propertyNames === undefined || propertyNames.includes('__proto__')) && invokesSetter) {
        setCarrierPrototypes(targetValue, value, propertyNames?.includes('__proto__') === true);
      } else {
        recordTargetProperty(targetValue, propertyNames, value);
      }
      return;
    }
    if (ts.isArrayLiteralExpression(current)) {
      const expansion = positionalLayouts(value);
      for (const [index, element] of current.elements.entries()) {
        if (ts.isOmittedExpression(element)) continue;
        if (ts.isSpreadElement(element)) {
          assignToTarget(element.expression, arrayRestValue(value, index, element, expansion));
        } else {
          assignToTarget(element, positionalValueAt(expansion, index));
        }
      }
      return;
    }
    if (ts.isObjectLiteralExpression(current)) {
      for (const property of current.properties) {
        if (ts.isShorthandPropertyAssignment(property)) {
          assignToTarget(property.name, observedPropertyValue(value, [property.name.text]));
        } else if (ts.isPropertyAssignment(property)) {
          assignToTarget(property.initializer, observedPropertyValue(value, declaredPropertyNames(property.name)));
        } else if (ts.isSpreadAssignment(property)) {
          observeOwnAccessorReads(value);
          assignToTarget(property.expression, value);
        }
      }
    }
  }

  function isWriteOnlyPropertyAccess(node) {
    let current = node;
    while (current.parent) {
      const parent = current.parent;
      if (
        ((ts.isParenthesizedExpression(parent) ||
          ts.isAsExpression(parent) ||
          ts.isTypeAssertionExpression(parent) ||
          ts.isNonNullExpression(parent) ||
          ts.isSatisfiesExpression(parent) ||
          ts.isPartiallyEmittedExpression(parent)) &&
          parent.expression === current) ||
        (ts.isPropertyAssignment(parent) && parent.initializer === current) ||
        ((ts.isSpreadAssignment(parent) || ts.isSpreadElement(parent)) && parent.expression === current) ||
        (ts.isObjectLiteralExpression(parent) && parent.properties.includes(current)) ||
        (ts.isArrayLiteralExpression(parent) && parent.elements.includes(current))
      ) {
        current = parent;
        continue;
      }
      break;
    }
    const parent = current.parent;
    if (!parent) return false;
    if (ts.isDeleteExpression(parent) && parent.expression === current) return true;
    if (
      ts.isBinaryExpression(parent) &&
      parent.left === current &&
      parent.operatorToken.kind === ts.SyntaxKind.EqualsToken
    ) {
      return true;
    }
    return (ts.isForInStatement(parent) || ts.isForOfStatement(parent)) && parent.initializer === current;
  }

  function ambientGlobalValue(name) {
    if (!ts.isIdentifier(name)) return new Set();
    if (name.text === 'eval') return originValue(origins.builtinEval);
    if (name.text === '_') return originValue(origins.lodashObject);
    if (name.text === 'Array') return originValue(origins.arrayObject);
    if (name.text === 'Date') return originValue(origins.dateObject);
    if (name.text === 'Function') return originValue(origins.functionObject);
    if (name.text === 'JSON') return originValue(origins.jsonObject);
    if (name.text === 'Object') return originValue(origins.objectObject);
    if (globalEvalObjects.has(name.text)) return originValue(origins.globalObject);
    if (name.text === 'Reflect') return originValue(origins.reflectObject);
    if (name.text === 'Symbol') return originValue(origins.symbolObject);
    return new Set();
  }

  function isAmbientVariableDeclaration(node) {
    const statement = node.parent?.parent;
    return (
      ts.isVariableStatement(statement) &&
      statement.modifiers?.some(modifier => modifier.kind === ts.SyntaxKind.DeclareKeyword)
    );
  }

  function collectPropagationOperations(node) {
    if (analysisStopped()) return;
    let run;
    if (ts.isVariableDeclaration(node)) {
      run = () => {
        if (node.initializer) bindPattern(node.name, evaluateExpression(node.initializer));
        else if (isAmbientVariableDeclaration(node)) bindPattern(node.name, ambientGlobalValue(node.name));
      };
    } else if (ts.isFunctionDeclaration(node) && node.name) {
      run = () => bindPattern(node.name, functionValue(node));
    } else if (ts.isParameter(node)) {
      run = () => bindPattern(node.name, node.initializer ? evaluateExpression(node.initializer) : new Set());
    } else if (ts.isForInStatement(node) || ts.isForOfStatement(node)) {
      run = () => {
        const elementValue = ts.isForOfStatement(node)
          ? allPositionalValues(positionalLayouts(evaluateExpression(node.expression)))
          : unknownValue();
        if (ts.isVariableDeclarationList(node.initializer)) {
          for (const declaration of node.initializer.declarations) bindPattern(declaration.name, elementValue);
        } else {
          assignToTarget(node.initializer, elementValue);
        }
      };
    } else if (ts.isYieldExpression(node) && node.asteriskToken && node.expression) {
      run = () => positionalLayouts(evaluateExpression(node.expression));
    } else if (
      ts.isBinaryExpression(node) &&
      [
        ts.SyntaxKind.EqualsToken,
        ts.SyntaxKind.AmpersandAmpersandEqualsToken,
        ts.SyntaxKind.BarBarEqualsToken,
        ts.SyntaxKind.QuestionQuestionEqualsToken,
      ].includes(node.operatorToken.kind)
    ) {
      run = () => assignToTarget(node.left, evaluateExpression(node.right));
    } else if (ts.isBinaryExpression(node) && ts.isAssignmentOperator(node.operatorToken.kind)) {
      run = () => invalidatePositionalWrite(node.left);
    } else if (
      (ts.isPrefixUnaryExpression(node) || ts.isPostfixUnaryExpression(node)) &&
      (node.operator === ts.SyntaxKind.PlusPlusToken || node.operator === ts.SyntaxKind.MinusMinusToken)
    ) {
      run = () => invalidatePositionalWrite(node.operand);
    } else if (ts.isDeleteExpression(node)) {
      run = () => recordDeletion(node.expression);
    } else if (ts.isCallExpression(node)) {
      run = () => {
        invalidatePositionalMutationCall(node);
        invalidateIndirectPositionalMutationCall(node);
      };
    } else if (
      (ts.isPropertyAccessExpression(node) || ts.isElementAccessExpression(node)) &&
      !isWriteOnlyPropertyAccess(node)
    ) {
      run = () => evaluateExpression(node);
    } else if (ts.isObjectLiteralExpression(node) || ts.isArrayLiteralExpression(node)) {
      run = () => evaluateExpression(node);
    }
    if (run) enqueuePropagationOperation({ node, run });
    ts.forEachChild(node, collectPropagationOperations);
  }

  collectPropagationOperations(sourceFile);
  for (let queueIndex = 0; queueIndex < propagationQueue.length && !analysisStopped(); queueIndex += 1) {
    const operation = propagationQueue[queueIndex];
    queuedPropagationOperations.delete(operation);
    activePropagationOperation = operation;
    activeAnalysisNode = operation.node;
    try {
      if (!consumeAnalysisWork(operation.node)) break;
      operation.run();
    } finally {
      activePropagationOperation = undefined;
      activeAnalysisNode = sourceFile;
    }
  }

  function unsafeKindsForCall(node) {
    return evaluateInvocation(node.expression, [...node.arguments], node).kinds;
  }

  function unsafeKindsForNew(node) {
    return evaluateInvocation(node.expression, [...(node.arguments ?? [])], node).kinds;
  }

  function unsafeKindsForTag(node) {
    return evaluateInvocation(node.tag, [], node).kinds;
  }

  function analysisLimit() {
    return dependencyCompositionLimit ?? analysisWorkLimit;
  }

  return { analysisLimit, unsafeKindsForCall, unsafeKindsForNew, unsafeKindsForTag };
}

function findingFingerprint(kind, sourceText) {
  const normalizedSource = sourceText.replace(/\s+/g, ' ').trim();
  return `sha256:${crypto.createHash('sha256').update(`${kind}\0${normalizedSource}`).digest('hex')}`;
}

function sourceLocation(source, position) {
  const prefix = source.slice(0, position);
  const lines = prefix.split(/\r?\n/);
  return { line: lines.length, column: lines.at(-1).length + 1 };
}

function analysisLimitFinding(relativePath, source, reason, position = 0) {
  return {
    kind: analysisLimitKind,
    path: relativePath,
    ...sourceLocation(source, position),
    fingerprint: findingFingerprint(analysisLimitKind, reason),
    reason,
  };
}

function syntacticNestingLimitPosition(source) {
  const scanner = ts.createScanner(ts.ScriptTarget.Latest, false, ts.LanguageVariant.Standard, source);
  const openingTokens = new Set([
    ts.SyntaxKind.OpenBraceToken,
    ts.SyntaxKind.OpenBracketToken,
    ts.SyntaxKind.OpenParenToken,
  ]);
  const closingTokens = new Set([
    ts.SyntaxKind.CloseBraceToken,
    ts.SyntaxKind.CloseBracketToken,
    ts.SyntaxKind.CloseParenToken,
  ]);
  let depth = 0;
  for (let token = scanner.scan(); token !== ts.SyntaxKind.EndOfFileToken; token = scanner.scan()) {
    if (openingTokens.has(token)) {
      depth += 1;
      if (depth > maximumSyntacticNesting) return scanner.getTokenPos();
    } else if (closingTokens.has(token)) {
      depth = Math.max(0, depth - 1);
    }
  }
  return undefined;
}

function scanSource(source, relativePath) {
  const normalizedPath = normalizeRelativePath(relativePath);
  const nestingLimitPosition = syntacticNestingLimitPosition(source);
  if (nestingLimitPosition !== undefined) {
    return [analysisLimitFinding(normalizedPath, source, 'syntactic-nesting-limit', nestingLimitPosition)];
  }

  let sourceFile;
  try {
    sourceFile = ts.createSourceFile(normalizedPath, source, ts.ScriptTarget.Latest, true, scriptKind(normalizedPath));
  } catch (error) {
    if (error instanceof RangeError) {
      return [analysisLimitFinding(normalizedPath, source, 'parser-resource-limit')];
    }
    throw error;
  }

  try {
    const bindings = collectBindings(sourceFile);
    const initialAnalysisLimit = bindings.analysisLimit();
    if (initialAnalysisLimit) {
      return [analysisLimitFinding(normalizedPath, source, initialAnalysisLimit.reason, initialAnalysisLimit.position)];
    }
    const findings = [];
    const pending = [sourceFile];

    function addFindings(node, kinds) {
      for (const reportedKind of kinds) {
        if (findings.length >= maximumFindingsPerFile) return;
        const analysisReason = reportedKind.startsWith(`${analysisLimitKind}:`)
          ? reportedKind.slice(analysisLimitKind.length + 1)
          : undefined;
        const kind = analysisReason ? analysisLimitKind : reportedKind;
        const start = node.getStart(sourceFile);
        const location = sourceFile.getLineAndCharacterOfPosition(start);
        const sourceText = source.slice(start, node.end);
        const finding = {
          kind,
          path: normalizedPath,
          line: location.line + 1,
          column: location.character + 1,
          fingerprint: findingFingerprint(kind, sourceText),
        };
        if (kind === analysisLimitKind) finding.reason = analysisReason ?? 'positional-layout-limit';
        findings.push(finding);
      }
    }

    while (pending.length > 0 && findings.length < maximumFindingsPerFile) {
      const node = pending.pop();
      if (ts.isCallExpression(node)) {
        addFindings(node, bindings.unsafeKindsForCall(node));
      } else if (ts.isNewExpression(node)) {
        addFindings(node, bindings.unsafeKindsForNew(node));
      } else if (ts.isTaggedTemplateExpression(node)) {
        addFindings(node, bindings.unsafeKindsForTag(node));
      }
      const invocationAnalysisLimit = bindings.analysisLimit();
      if (invocationAnalysisLimit) {
        return [
          analysisLimitFinding(
            normalizedPath,
            source,
            invocationAnalysisLimit.reason,
            invocationAnalysisLimit.position
          ),
        ];
      }
      const children = [];
      ts.forEachChild(node, child => {
        children.push(child);
      });
      for (let index = children.length - 1; index >= 0; index -= 1) pending.push(children[index]);
    }
    if (pending.length > 0) {
      const position = Math.min(pending.at(-1).getStart(sourceFile), source.length);
      findings.push(analysisLimitFinding(normalizedPath, source, 'per-file-finding-limit', position));
    }
    return findings;
  } catch (error) {
    if (error instanceof RangeError) {
      return [analysisLimitFinding(normalizedPath, source, 'analysis-resource-limit')];
    }
    throw error;
  }
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
  let limitFinding;
  for (const relativePath of trackedSourcePaths(root, excludedSourcePaths)) {
    const absolutePath = path.join(root, ...relativePath.split('/'));
    const stats = fs.lstatSync(absolutePath);
    if (stats.isSymbolicLink()) throw new Error(`Refusing to scan source symlink: ${relativePath}`);
    if (!stats.isFile()) continue;
    if (limitFinding) continue;
    const source = fs.readFileSync(absolutePath, 'utf8');
    for (const finding of scanSource(source, relativePath)) {
      if (findings.length < maximumRepositoryFindings) {
        findings.push(finding);
      } else {
        limitFinding = analysisLimitFinding(relativePath, source, 'repository-finding-limit');
        break;
      }
    }
  }
  if (limitFinding) findings.push(limitFinding);
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
  const reason = finding.reason ? ` (${finding.reason})` : '';
  return `${finding.path}:${finding.line}:${finding.column} ${finding.kind} ${finding.fingerprint}${reason}`;
}

function boundedDiagnosticOutput(errors) {
  const output = `${errors.join('\n')}\n`;
  if (Buffer.byteLength(output) <= maximumDiagnosticOutputBytes) return output;
  const suffix = `Unsafe-expression diagnostics truncated at ${maximumDiagnosticOutputBytes} bytes.\n`;
  const prefixBudget = maximumDiagnosticOutputBytes - Buffer.byteLength(suffix);
  let prefix = Buffer.from(output).subarray(0, prefixBudget).toString('utf8');
  while (Buffer.byteLength(prefix) > prefixBudget) prefix = prefix.slice(0, -1);
  const lastNewline = prefix.lastIndexOf('\n');
  if (lastNewline >= 0) prefix = prefix.slice(0, lastNewline + 1);
  return `${prefix}${suffix}`;
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
    process.stderr.write(boundedDiagnosticOutput([`Unsafe-expression guard could not run: ${error.message}`]));
    process.exitCode = 1;
    return;
  }
  const errors = [...result.metadataErrors];
  errors.push(...result.unexpected.map(finding => `Unexpected unsafe execution: ${formatFinding(finding)}`));
  errors.push(...result.stale.map(entry => `Stale allowlist entry: ${entry.id} (${entry.path})`));
  if (errors.length > 0) {
    process.stderr.write(boundedDiagnosticOutput(errors));
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
  maximumDiagnosticOutputBytes,
  maximumFindingsPerFile,
  maximumRepositoryFindings,
  normalizeRelativePath,
  runGuard,
  scanRepository,
  scanSource,
  sourceExclusionDocumentationRow,
  sourceExclusionsRelativePath,
  validateAllowlist,
  validateSourceExclusions,
};
