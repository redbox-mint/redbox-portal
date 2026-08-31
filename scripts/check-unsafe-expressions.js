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
const maximumInvocationEffectWork = 8192;
const maximumPropagationSubscribersPerValue = 512;
const maximumReturnProvenanceWork = 8192;
const maximumAnalysisWork = 786432;
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
const nonCallableArrayMethodResults = new Set([
  'concat',
  'copyWithin',
  'entries',
  'every',
  'fill',
  'filter',
  'forEach',
  'includes',
  'indexOf',
  'join',
  'keys',
  'lastIndexOf',
  'map',
  'push',
  'reverse',
  'slice',
  'some',
  'sort',
  'splice',
  'unshift',
  'values',
]);
const nonCallableCollectionMethodResults = new Set([
  'add',
  'clear',
  'delete',
  'entries',
  'has',
  'keys',
  'set',
  'values',
]);
const origins = Object.freeze({
  arrayFrom: 'array-from',
  arrayIterator: 'array-iterator',
  arrayMap: 'array-map',
  arrayObject: 'array-object',
  arrayOf: 'array-of',
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
  mapEntries: 'map-entries',
  mapClear: 'map-clear',
  mapGet: 'map-get',
  mapKeys: 'map-keys',
  mapObject: 'map-object',
  mapPrototype: 'map-prototype',
  mapSet: 'map-set',
  mapValues: 'map-values',
  objectAssign: 'object-assign',
  objectCreate: 'object-create',
  objectDefineProperties: 'object-define-properties',
  objectDefineProperty: 'object-define-property',
  objectEntries: 'object-entries',
  objectFreeze: 'object-freeze',
  objectGetOwnPropertyDescriptor: 'object-get-own-property-descriptor',
  objectGetOwnPropertyDescriptors: 'object-get-own-property-descriptors',
  objectGetPrototypeOf: 'object-get-prototype-of',
  objectObject: 'object-object',
  objectPreventExtensions: 'object-prevent-extensions',
  objectPrototype: 'object-prototype',
  objectPrototypeDefineGetter: 'object-prototype-define-getter',
  objectPrototypeDefineSetter: 'object-prototype-define-setter',
  objectPrototypeSetPrototype: 'object-prototype-set-prototype',
  objectSeal: 'object-seal',
  objectSetPrototypeOf: 'object-set-prototype-of',
  objectValues: 'object-values',
  reflectApply: 'reflect-apply',
  reflectConstruct: 'reflect-construct',
  reflectDeleteProperty: 'reflect-delete-property',
  reflectDefineProperty: 'reflect-define-property',
  reflectGet: 'reflect-get',
  reflectGetOwnPropertyDescriptor: 'reflect-get-own-property-descriptor',
  reflectGetPrototypeOf: 'reflect-get-prototype-of',
  reflectObject: 'reflect-object',
  reflectPreventExtensions: 'reflect-prevent-extensions',
  reflectSet: 'reflect-set',
  reflectSetPrototypeOf: 'reflect-set-prototype-of',
  setAdd: 'set-add',
  setClear: 'set-clear',
  setEntries: 'set-entries',
  setObject: 'set-object',
  setPrototype: 'set-prototype',
  setValues: 'set-values',
  symbolObject: 'symbol-object',
});

function isNonComposingIntrinsic(atom) {
  return (
    atom === origins.arrayObject ||
    atom === origins.arrayOf ||
    atom === origins.knownSafeCallable ||
    atom === origins.mapClear ||
    atom === origins.mapEntries ||
    atom === origins.mapGet ||
    atom === origins.mapKeys ||
    atom === origins.mapObject ||
    atom === origins.mapSet ||
    atom === origins.mapValues ||
    atom === origins.objectEntries ||
    atom === origins.objectFreeze ||
    atom === origins.objectPreventExtensions ||
    atom === origins.objectSeal ||
    atom === origins.objectValues ||
    atom === origins.reflectPreventExtensions ||
    atom === origins.setAdd ||
    atom === origins.setClear ||
    atom === origins.setEntries ||
    atom === origins.setObject ||
    atom === origins.setValues
  );
}

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
  const functionInvocationStates = new WeakMap();
  const dormantInvocationResults = new WeakMap();
  const functionReturnProvenance = new WeakMap();
  const invocationMethodAtoms = new WeakMap();
  const iteratorInvocationAtoms = new WeakMap();
  const earliestTemporalBoundaryPositions = new WeakMap();
  const literalAtoms = new Map();
  const positionalMutationAtoms = new Map();
  const positionalLengthApplications = new WeakMap();
  const positionalMutationApplications = new WeakMap();
  const syntheticCarrierAtoms = new WeakMap();
  const invocationEvidence = new WeakMap();
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
  const knownDataAtom = Object.freeze({ kind: 'known-data' });
  const opaqueThisValueAtom = Object.freeze({ kind: 'unknown-value', opaqueThis: true });
  const builtinPrototypeStates = new Map();
  const activeIteratorFunctions = new Set();
  const activeReturnedFunctions = new Set();
  let activeCallableRecursionDepth = 0;
  let activeMutationRecursionDepth = 0;
  let activeDormantInvocationDepth = 0;
  let activeDormantPropagationDepth = 0;
  let activeAlternativeMutationDepth = 0;
  let remainingAnalysisWork = maximumAnalysisWork;
  let remainingDependencyCompositionWork = maximumDependencyCompositionWork;
  let analysisWorkLimit;
  let dependencyCompositionLimit;
  let activePropagationOperation;
  let activeAnalysisNode = sourceFile;
  let activeFunctionReceiver;
  let suppressCarrierPropertyDependency = false;
  const activeFunctionBindingFrames = [];
  const activeFunctionInvocationStates = [];
  const activeFunctionInvocationNodes = [];

  function activeFunctionInvocationState() {
    return activeFunctionInvocationStates.at(-1);
  }

  function invocationScopedValue(globalValues, stateKey, node, create) {
    const state = activeFunctionInvocationState();
    const values = state ? (state[stateKey] ??= new WeakMap()) : globalValues;
    let value = values.get(node);
    if (!value) {
      value = create();
      values.set(node, value);
    }
    return value;
  }

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
      if (target.has(atom)) continue;
      if (!consumeAnalysisWork()) return changed;
      target.add(atom);
      changed = true;
    }
    return changed;
  }

  function trackPropagationDependency(value) {
    if (!activePropagationOperation || analysisStopped()) return;
    if (enclosingFunctionNode(activePropagationOperation.node)) return;
    let subscribers = propagationSubscribers.get(value);
    if (!subscribers) {
      subscribers = new Set();
      propagationSubscribers.set(value, subscribers);
    }
    if (subscribers.has(activePropagationOperation) || !consumeAnalysisWork()) return;
    const carriesCarrier =
      value.kind === 'carrier' ||
      (value instanceof Set && [...value].some(atom => typeof atom !== 'string' && atom.kind === 'carrier'));
    if (carriesCarrier && subscribers.size >= maximumPropagationSubscribersPerValue) {
      analysisWorkLimit = {
        reason: 'analysis-work-limit',
        position: activePropagationOperation.node.getStart(sourceFile),
      };
      return;
    }
    subscribers.add(activePropagationOperation);
  }

  function enqueuePropagationOperation(operation) {
    if (analysisStopped() || queuedPropagationOperations.has(operation) || !consumeAnalysisWork(operation.node)) return;
    queuedPropagationOperations.add(operation);
    propagationQueue.push(operation);
  }

  function notifyPropagationSubscribers(value) {
    if (analysisStopped()) return;
    if (value?.kind === 'carrier' || value?.kind === 'function-value') value.revision += 1;
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

  function replaceTracked(target, source, owner) {
    let changed = target.size !== source.size;
    if (!changed) {
      for (const atom of target) {
        if (!source.has(atom)) {
          changed = true;
          break;
        }
      }
    }
    if (!changed) return;
    target.clear();
    mergeValue(target, source);
    notifyPropagationSubscribers(target);
    notifyPropagationSubscribers(owner);
  }

  function rankPrecedes(left, right) {
    const length = Math.max(left.length, right.length);
    for (let index = 0; index < length; index += 1) {
      const leftPart = left[index] ?? -1;
      const rightPart = right[index] ?? -1;
      if (leftPart !== rightPart) return leftPart < rightPart;
    }
    return false;
  }

  function rankEquals(left, right) {
    return left.length === right.length && left.every((part, index) => part === right[index]);
  }

  function hasConditionalExecution(node) {
    let current = node;
    while (current.parent && !ts.isSourceFile(current.parent) && !ts.isFunctionLike(current.parent)) {
      const parent = current.parent;
      if (
        ts.isIfStatement(parent) ||
        ts.isConditionalExpression(parent) ||
        ts.isSwitchStatement(parent) ||
        ts.isCaseClause(parent) ||
        ts.isDefaultClause(parent) ||
        ts.isForStatement(parent) ||
        ts.isForInStatement(parent) ||
        ts.isForOfStatement(parent) ||
        ts.isWhileStatement(parent) ||
        ts.isDoStatement(parent) ||
        ts.isTryStatement(parent) ||
        ts.isCatchClause(parent) ||
        (ts.isBinaryExpression(parent) &&
          ((parent.right === current &&
            [
              ts.SyntaxKind.BarBarToken,
              ts.SyntaxKind.AmpersandAmpersandToken,
              ts.SyntaxKind.QuestionQuestionToken,
            ].includes(parent.operatorToken.kind)) ||
            [
              ts.SyntaxKind.AmpersandAmpersandEqualsToken,
              ts.SyntaxKind.BarBarEqualsToken,
              ts.SyntaxKind.QuestionQuestionEqualsToken,
            ].includes(parent.operatorToken.kind))) ||
        ((ts.isCallExpression(parent) ||
          ts.isPropertyAccessExpression(parent) ||
          ts.isElementAccessExpression(parent)) &&
          parent.questionDotToken)
      ) {
        return true;
      }
      current = parent;
    }
    return false;
  }

  function orderedWriteRank(node, allowConditionalExecution = false) {
    if (
      !node ||
      (!allowConditionalExecution && hasConditionalExecution(node)) ||
      (followsTemporalBoundary(node) && !isOperationInFirstReturnExpression(node))
    ) {
      return undefined;
    }
    if (enclosingFunctionNode(node) && activeFunctionInvocationNodes.length === 0) return undefined;
    const rank = [];
    for (const invocationNode of activeFunctionInvocationNodes) {
      if (
        ts.isFunctionLike(invocationNode) ||
        (!allowConditionalExecution && hasConditionalExecution(invocationNode))
      ) {
        return undefined;
      }
      rank.push(invocationNode.getStart(sourceFile));
    }
    rank.push(node.getStart(sourceFile));
    return rank;
  }

  function deterministicWriteRank(node) {
    return orderedWriteRank(node);
  }

  function uncertainWriteRank(node) {
    return orderedWriteRank(node, true);
  }

  function isOperationInFirstReturnExpression(node) {
    const functionNode = enclosingFunctionNode(node);
    if (!functionNode) return false;
    let current = node.parent;
    while (current && current !== functionNode) {
      if (ts.isReturnStatement(current)) {
        return earliestTemporalBoundaryPositions.get(functionNode) === current.getStart(sourceFile);
      }
      current = current.parent;
    }
    return false;
  }

  function followsTemporalBoundary(node) {
    const functionNode = enclosingFunctionNode(node);
    if (!functionNode?.body) return false;
    let earliestPosition = earliestTemporalBoundaryPositions.get(functionNode);
    if (earliestPosition === undefined) {
      earliestPosition = Number.POSITIVE_INFINITY;
      function visit(current) {
        if (current !== functionNode.body && ts.isFunctionLike(current)) return;
        if (
          ts.isAwaitExpression(current) ||
          ts.isYieldExpression(current) ||
          ts.isReturnStatement(current) ||
          ts.isThrowStatement(current) ||
          ts.isBreakStatement(current) ||
          ts.isContinueStatement(current)
        ) {
          earliestPosition = Math.min(earliestPosition, current.getStart(sourceFile));
        }
        ts.forEachChild(current, visit);
      }
      visit(functionNode.body);
      earliestTemporalBoundaryPositions.set(functionNode, earliestPosition);
    }
    return earliestPosition < node.getStart(sourceFile);
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
    const serializedValue = typeof value === 'number' && Object.is(value, -0) ? '-0' : String(value);
    const key = `${typeof value}\0${serializedValue}`;
    let atom = literalAtoms.get(key);
    if (!atom) {
      atom = { kind: 'literal', value, valueType: typeof value };
      literalAtoms.set(key, atom);
    }
    return new Set([atom]);
  }

  function createCarrier(positional = false) {
    const carrier = {
      accessors: new Map(),
      definiteAccessorProperties: new Set(),
      collectionEntries: new Map(),
      collectionKeys: new Set(),
      collectionUnkeyedKeys: new Set(),
      collectionKind: undefined,
      collectionClearRank: undefined,
      collectionUnknown: false,
      collectionValues: new Set(),
      iteratorUnknownEntry: false,
      deletedProperties: new Set(),
      invocationSensitive: false,
      invocationTargetObserved: false,
      integrityConfigurability: true,
      integrityWritability: true,
      kind: 'carrier',
      extensible: true,
      unknownAccessors: { get: new Set(), set: new Set() },
      unknownPropertyDeletion: false,
      unknownSpreadSource: false,
      ownPropertyNames: new Set(),
      properties: new Map(),
      propertyConfigurabilities: new Map(),
      propertyEnumerabilities: new Map(),
      propertyWritabilities: new Map(),
      propertyWriteRanks: new Map(),
      strongPropertyWriteRanks: new Map(),
      prototypes: new Set(positional ? [origins.arrayPrototype] : []),
      revision: 0,
      unknownProperty: new Set(),
      positional,
      exactPositionalLengths: new Set(),
      positionalLengthWriteRank: undefined,
      positionalLengths: new Set(),
      positionalOverflowStart: undefined,
      overflowPositionalProperties: new Map(),
      overflowPositionalPropertiesUncertain: false,
      overflowPositionalPropertiesUncertaintyUnranked: false,
      overflowPositionalPropertiesUncertaintyWriteRank: undefined,
      overflowPositionalOwnProperties: new Set(),
      overflowPositionalValues: new Set(),
      positionalUncertain: false,
      positionalUncertaintyUnranked: false,
      positionalUncertaintyWriteRank: undefined,
      uncertainPositionalValues: new Set(),
      collectionEntryWriteRanks: new Map(),
    };
    if (positional) {
      carrier.propertyConfigurabilities.set('length', new Set([false]));
      carrier.propertyEnumerabilities.set('length', new Set([false]));
      carrier.propertyWritabilities.set('length', new Set([true]));
    }
    return carrier;
  }

  function carrierFor(node, positional = false) {
    const atom = invocationScopedValue(carrierAtoms, 'carrierAtoms', node, () => createCarrier(positional));
    if (positional && !atom.positional) {
      atom.positional = true;
      atom.prototypes.add(origins.arrayPrototype);
    }
    return atom;
  }

  function syntheticCarrierFor(node, key, positional = false) {
    const state = activeFunctionInvocationState();
    const values = state ? (state.syntheticCarrierAtoms ??= new WeakMap()) : syntheticCarrierAtoms;
    let carriers = values.get(node);
    if (!carriers) {
      carriers = new Map();
      values.set(node, carriers);
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
      const invocationValue = activeInvocationBindingValue(binding, true);
      if (invocationValue) {
        trackPropagationDependency(invocationValue);
        return invocationValue.size > 0 ? new Set(invocationValue) : unknownValue();
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
    if (identifier.text === 'Map') return originValue(origins.mapObject);
    if (identifier.text === 'Object') return originValue(origins.objectObject);
    if (globalEvalObjects.has(identifier.text)) return originValue(origins.globalObject);
    if (identifier.text === 'Reflect') return originValue(origins.reflectObject);
    if (identifier.text === 'Set') return originValue(origins.setObject);
    if (identifier.text === 'Symbol') return originValue(origins.symbolObject);
    return unknownValue();
  }

  function bindingBelongsToFrame(binding, frame) {
    let scope = binding.scope;
    while (scope) {
      if (scope === frame.functionScope) return true;
      scope = scope.parent;
    }
    return false;
  }

  function activeInvocationBindingValue(binding, create = false) {
    for (let index = activeFunctionBindingFrames.length - 1; index >= 0; index -= 1) {
      const frame = activeFunctionBindingFrames[index];
      let invocationValue = frame.get(binding);
      if (invocationValue) return invocationValue;
      if (create && bindingBelongsToFrame(binding, frame)) {
        invocationValue = new Set();
        frame.set(binding, invocationValue);
        return invocationValue;
      }
    }
    return undefined;
  }

  function enclosingFunctionNode(node) {
    let current = node.parent;
    while (current) {
      if (ts.isFunctionLike(current)) return current;
      current = current.parent;
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
      if (matches('of')) result.add(origins.arrayOf);
    } else if (origin === origins.arrayPrototype) {
      if (propertyName === iteratorPropertyName || propertyName === 'values') result.add(origins.arrayIterator);
      if (propertyName === 'map') result.add(origins.arrayMap);
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
      if (matches('Map')) result.add(origins.mapObject);
      if (matches('Object')) result.add(origins.objectObject);
      if (matches('Reflect')) result.add(origins.reflectObject);
      if (matches('Set')) result.add(origins.setObject);
      if (matches('Symbol')) result.add(origins.symbolObject);
      if (matches('_')) result.add(origins.lodashObject);
      if ([...globalEvalObjects].some(matches)) result.add(origins.globalObject);
    } else if (origin === origins.jsonObject) {
      if (matches('parse') || matches('stringify')) result.add(origins.knownSafeCallable);
    } else if (origin === origins.mapObject) {
      if (matches('prototype')) result.add(origins.mapPrototype);
    } else if (origin === origins.mapPrototype) {
      if (matches('entries') || matches(iteratorPropertyName)) result.add(origins.mapEntries);
      if (matches('clear')) result.add(origins.mapClear);
      if (matches('delete') || matches('has')) result.add(origins.knownSafeCallable);
      if (matches('get')) result.add(origins.mapGet);
      if (matches('keys')) result.add(origins.mapKeys);
      if (matches('set')) result.add(origins.mapSet);
      if (matches('values')) result.add(origins.mapValues);
    } else if (origin === origins.objectObject) {
      if (unknown || propertyName === 'assign') result.add(origins.objectAssign);
      if (unknown || propertyName === 'create') result.add(origins.objectCreate);
      if (unknown || propertyName === 'defineProperties') result.add(origins.objectDefineProperties);
      if (unknown || propertyName === 'defineProperty') result.add(origins.objectDefineProperty);
      if (unknown || propertyName === 'entries') result.add(origins.objectEntries);
      if (unknown || propertyName === 'freeze') result.add(origins.objectFreeze);
      if (unknown || propertyName === 'getOwnPropertyDescriptor') {
        result.add(origins.objectGetOwnPropertyDescriptor);
      }
      if (unknown || propertyName === 'getOwnPropertyDescriptors') {
        result.add(origins.objectGetOwnPropertyDescriptors);
      }
      if (unknown || propertyName === 'getPrototypeOf') result.add(origins.objectGetPrototypeOf);
      if (unknown || propertyName === 'preventExtensions') result.add(origins.objectPreventExtensions);
      if (unknown || propertyName === 'prototype') result.add(origins.objectPrototype);
      if (unknown || propertyName === 'seal') result.add(origins.objectSeal);
      if (unknown || propertyName === 'setPrototypeOf') result.add(origins.objectSetPrototypeOf);
      if (unknown || propertyName === 'values') result.add(origins.objectValues);
    } else if (origin === origins.objectPrototype) {
      if (matches('__defineGetter__')) result.add(origins.objectPrototypeDefineGetter);
      if (matches('__defineSetter__')) result.add(origins.objectPrototypeDefineSetter);
    } else if (origin === origins.reflectObject) {
      if (unknown || propertyName === 'apply') result.add(origins.reflectApply);
      if (unknown || propertyName === 'construct') result.add(origins.reflectConstruct);
      if (unknown || propertyName === 'deleteProperty') result.add(origins.reflectDeleteProperty);
      if (unknown || propertyName === 'defineProperty') result.add(origins.reflectDefineProperty);
      if (unknown || propertyName === 'get') result.add(origins.reflectGet);
      if (unknown || propertyName === 'getOwnPropertyDescriptor') {
        result.add(origins.reflectGetOwnPropertyDescriptor);
      }
      if (unknown || propertyName === 'getPrototypeOf') result.add(origins.reflectGetPrototypeOf);
      if (unknown || propertyName === 'preventExtensions') result.add(origins.reflectPreventExtensions);
      if (unknown || propertyName === 'set') result.add(origins.reflectSet);
      if (unknown || propertyName === 'setPrototypeOf') result.add(origins.reflectSetPrototypeOf);
    } else if (origin === origins.setObject) {
      if (matches('prototype')) result.add(origins.setPrototype);
    } else if (origin === origins.setPrototype) {
      if (matches('add')) result.add(origins.setAdd);
      if (matches('clear')) result.add(origins.setClear);
      if (matches('delete') || matches('has')) result.add(origins.knownSafeCallable);
      if (matches('entries')) result.add(origins.setEntries);
      if (matches('keys') || matches('values') || matches(iteratorPropertyName)) {
        result.add(origins.setValues);
      }
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
            atom.hasInvocationEffects ||
            atom.effectProvenanceUncertain ||
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
      atom === origins.arrayObject ||
      atom === origins.arrayFrom ||
      atom === origins.arrayIterator ||
      atom === origins.arrayMap ||
      atom === origins.arrayOf ||
      atom === origins.functionPrototypeApply ||
      atom === origins.functionPrototypeBind ||
      atom === origins.functionPrototypeCall ||
      atom === origins.lodashRunInContext ||
      atom === origins.lodashTemplate ||
      atom === origins.knownSafeCallable ||
      atom === origins.mapEntries ||
      atom === origins.mapClear ||
      atom === origins.mapGet ||
      atom === origins.mapKeys ||
      atom === origins.mapObject ||
      atom === origins.mapSet ||
      atom === origins.mapValues ||
      atom === origins.objectAssign ||
      atom === origins.objectCreate ||
      atom === origins.objectDefineProperties ||
      atom === origins.objectDefineProperty ||
      atom === origins.objectEntries ||
      atom === origins.objectGetOwnPropertyDescriptor ||
      atom === origins.objectGetOwnPropertyDescriptors ||
      atom === origins.objectGetPrototypeOf ||
      atom === origins.objectPreventExtensions ||
      atom === origins.objectPrototypeDefineGetter ||
      atom === origins.objectPrototypeDefineSetter ||
      atom === origins.objectPrototypeSetPrototype ||
      atom === origins.objectSetPrototypeOf ||
      atom === origins.objectValues ||
      atom === origins.reflectApply ||
      atom === origins.reflectConstruct ||
      atom === origins.reflectDeleteProperty ||
      atom === origins.reflectDefineProperty ||
      atom === origins.reflectGet ||
      atom === origins.reflectGetOwnPropertyDescriptor ||
      atom === origins.reflectGetPrototypeOf ||
      atom === origins.reflectPreventExtensions ||
      atom === origins.reflectSet ||
      atom === origins.reflectSetPrototypeOf ||
      atom === origins.setAdd ||
      atom === origins.setClear ||
      atom === origins.setEntries ||
      atom === origins.setObject ||
      atom === origins.setValues
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
      localReturnMutationWrites: new Map(),
      localReturnDependents: new Map(),
      hasInvocationEffects: false,
      effectParameterIndices: new Set(),
      getterReadParameterIndices: new Set(),
      getterReadOuterBindings: new Set(),
      getterReceiverRead: false,
      hasGetterReads: false,
      effectMayInstallTrackedCallable: false,
      receiverInvocationEffect: false,
      outerEffectBindings: new Set(),
      effectProvenanceUncertain: false,
      parameterDependentReturn: false,
      mutationDependentReturn: false,
      receiverDependentReturn: false,
      requiresInvocationEffects: false,
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
    const parameterBindingIndices = new Map();
    const bindingWrites = new Map();
    const bindingMutationWrites = new Map();
    const effectCalls = [];
    const returnExpressions = [];
    let found = false;
    let localAliasDependentReturn = false;
    let parameterDependentReturn = false;
    let mutationDependentReturn = false;
    let receiverDependentReturn = false;
    let requiresInvocationEffects = false;
    let returnProvenanceUncertain = false;
    let hasInvocationEffects = false;
    let hasGetterReads = false;
    let effectProvenanceUncertain = false;
    let effectMayInstallTrackedCallable = false;
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

    function collectParameterBindings(name, parameterIndex) {
      if (ts.isIdentifier(name)) {
        const binding = declarationBindings.get(name);
        if (binding) {
          parameterBindings.add(binding);
          parameterBindingIndices.set(binding, parameterIndex);
        }
        return;
      }
      for (const element of name.elements) {
        if (ts.isBindingElement(element)) collectParameterBindings(element.name, parameterIndex);
      }
    }

    for (const [parameterIndex, parameter] of node.parameters.entries()) {
      collectParameterBindings(parameter.name, parameterIndex);
    }

    function addBindingWrite(binding, expression) {
      if (!binding || !expression) return;
      let writes = bindingWrites.get(binding);
      if (!writes) {
        writes = new Set();
        bindingWrites.set(binding, writes);
      }
      writes.add(expression);
    }

    function addBindingMutationWrite(binding, expression) {
      if (!binding || !expression) return;
      let writes = bindingMutationWrites.get(binding);
      if (!writes) {
        writes = new Set();
        bindingMutationWrites.set(binding, writes);
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

    function recordAssignmentPatternWrites(pattern, expression) {
      const current = unwrapExpression(pattern);
      if (ts.isIdentifier(current)) {
        addBindingWrite(lookupBinding(current), expression);
      } else if (ts.isArrayLiteralExpression(current)) {
        for (const element of current.elements) {
          if (ts.isOmittedExpression(element)) continue;
          recordAssignmentPatternWrites(ts.isSpreadElement(element) ? element.expression : element, expression);
        }
      } else if (ts.isObjectLiteralExpression(current)) {
        for (const property of current.properties) {
          if (ts.isShorthandPropertyAssignment(property)) {
            recordAssignmentPatternWrites(property.name, expression);
          } else if (ts.isPropertyAssignment(property)) {
            recordAssignmentPatternWrites(property.initializer, expression);
          } else if (ts.isSpreadAssignment(property)) {
            recordAssignmentPatternWrites(property.expression, expression);
          }
        }
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
      if (ts.isCallExpression(current)) effectCalls.push(current);
      if (ts.isForInStatement(current) || ts.isForOfStatement(current)) {
        requiresInvocationEffects = true;
        if (ts.isVariableDeclarationList(current.initializer)) {
          for (const declaration of current.initializer.declarations) {
            recordPatternWrites(declaration.name, current.expression);
          }
        } else {
          recordAssignmentPatternWrites(current.initializer, current.expression);
        }
      }
      if (ts.isVariableDeclaration(current) && current.initializer) {
        recordPatternWrites(current.name, current.initializer);
      } else if (ts.isBinaryExpression(current) && ts.isAssignmentOperator(current.operatorToken.kind)) {
        if (ts.isIdentifier(unwrapExpression(current.left))) {
          addBindingWrite(lookupBinding(unwrapExpression(current.left)), current.right);
        } else {
          requiresInvocationEffects = true;
          const rootBinding = assignmentRootBinding(current.left);
          if (rootBinding && bindingIsLocal(rootBinding)) addBindingMutationWrite(rootBinding, current.right);
          if (ts.isArrayLiteralExpression(current.left) || ts.isObjectLiteralExpression(current.left)) {
            recordAssignmentPatternWrites(current.left, current.right);
          }
        }
      }
      ts.forEachChild(current, collectReturnWrites);
    }

    if (ts.isArrowFunction(node) && !ts.isBlock(node.body)) returnExpressions.push(node.body);
    else if (node.body) collectReturnWrites(node.body);

    const outerEffectBindings = new Set();
    const referencedOuterBindings = new Set();
    const referencedEffectParameters = new Set();
    let receiverInvocationEffect = false;
    let remainingInvocationEffectWork = maximumInvocationEffectWork;

    function callRootBinding(expression) {
      const current = unwrapExpression(expression);
      if (ts.isIdentifier(current)) return lookupBinding(current);
      if (
        ts.isCallExpression(current) ||
        ts.isPropertyAccessExpression(current) ||
        ts.isElementAccessExpression(current)
      ) {
        return callRootBinding(current.expression);
      }
      return undefined;
    }

    function nestedFunctionMayBeInvoked(current) {
      const bindings = new Set();
      if (ts.isFunctionDeclaration(current) && current.name) {
        const binding = declarationBindings.get(current.name);
        if (binding) bindings.add(binding);
      }
      const parent = current.parent;
      if (ts.isVariableDeclaration(parent) && parent.initializer === current && ts.isIdentifier(parent.name)) {
        const binding = declarationBindings.get(parent.name);
        if (binding) bindings.add(binding);
      }
      if (
        ts.isBinaryExpression(parent) &&
        parent.right === current &&
        parent.operatorToken.kind === ts.SyntaxKind.EqualsToken &&
        ts.isIdentifier(unwrapExpression(parent.left))
      ) {
        const binding = lookupBinding(unwrapExpression(parent.left));
        if (binding) bindings.add(binding);
      }
      if (bindings.size > 0 && effectCalls.some(call => bindings.has(callRootBinding(call.expression)))) {
        return true;
      }
      let wrapped = current;
      while (wrapped.parent && ts.isParenthesizedExpression(wrapped.parent)) wrapped = wrapped.parent;
      return ts.isCallExpression(wrapped.parent) && wrapped.parent.expression === wrapped;
    }

    function nestedFunctionResultMayBeInvoked(current) {
      const bindings = new Set();
      if (ts.isFunctionDeclaration(current) && current.name) {
        const binding = declarationBindings.get(current.name);
        if (binding) bindings.add(binding);
      }
      const parent = current.parent;
      if (ts.isVariableDeclaration(parent) && parent.initializer === current && ts.isIdentifier(parent.name)) {
        const binding = declarationBindings.get(parent.name);
        if (binding) bindings.add(binding);
      }
      if (
        ts.isBinaryExpression(parent) &&
        parent.right === current &&
        parent.operatorToken.kind === ts.SyntaxKind.EqualsToken &&
        ts.isIdentifier(unwrapExpression(parent.left))
      ) {
        const binding = lookupBinding(unwrapExpression(parent.left));
        if (binding) bindings.add(binding);
      }
      return effectCalls.some(call => {
        const expression = unwrapExpression(call.expression);
        return ts.isCallExpression(expression) && bindings.has(callRootBinding(expression));
      });
    }

    function collectInvocationEffects(current) {
      if (remainingInvocationEffectWork <= 0) {
        effectProvenanceUncertain = true;
        hasInvocationEffects = true;
        return;
      }
      remainingInvocationEffectWork -= 1;
      if (current !== node.body && ts.isFunctionLike(current)) {
        if (!nestedFunctionMayBeInvoked(current)) return;
        const nested = functionHasPotentialTrackedReturn(current);
        const invokesReturnedCallable = nested.mayTrackCallResult && nestedFunctionResultMayBeInvoked(current);
        if (
          nested.hasInvocationEffects ||
          nested.hasGetterReads ||
          nested.effectProvenanceUncertain ||
          invokesReturnedCallable
        ) {
          if (nested.hasInvocationEffects || invokesReturnedCallable) hasInvocationEffects = true;
          if (nested.hasGetterReads) hasGetterReads = true;
          if (nested.effectProvenanceUncertain) effectProvenanceUncertain = true;
          if (nested.effectMayInstallTrackedCallable) effectMayInstallTrackedCallable = true;
          const composedBindings = invokesReturnedCallable
            ? new Set([...nested.outerEffectBindings, ...nested.getterReadOuterBindings, ...nested.outerReturnBindings])
            : new Set([...nested.outerEffectBindings, ...nested.getterReadOuterBindings]);
          for (const binding of composedBindings) {
            if (parameterBindings.has(binding)) referencedEffectParameters.add(binding);
            else if (!bindingIsLocal(binding)) referencedOuterBindings.add(binding);
            else effectProvenanceUncertain = true;
          }
          if (
            invokesReturnedCallable &&
            (nested.parameterDependentReturn || nested.receiverDependentReturn || nested.returnProvenanceUncertain)
          ) {
            effectProvenanceUncertain = true;
          }
          if (ts.isArrowFunction(current) && nested.receiverInvocationEffect) {
            receiverInvocationEffect = true;
          }
        }
        return;
      }
      if (current.kind === ts.SyntaxKind.ThisKeyword) receiverInvocationEffect = true;
      if (ts.isIdentifier(current)) {
        const binding = lookupBinding(current);
        if (!binding && (current.text === 'eval' || current.text === '_')) {
          effectMayInstallTrackedCallable = true;
        }
        if (binding && !bindingIsLocal(binding)) referencedOuterBindings.add(binding);
        if (binding && parameterBindings.has(binding)) referencedEffectParameters.add(binding);
      }
      if (
        ts.isCallExpression(current) ||
        ts.isDeleteExpression(current) ||
        ((ts.isPrefixUnaryExpression(current) || ts.isPostfixUnaryExpression(current)) &&
          (current.operator === ts.SyntaxKind.PlusPlusToken || current.operator === ts.SyntaxKind.MinusMinusToken)) ||
        (ts.isBinaryExpression(current) &&
          ts.isAssignmentOperator(current.operatorToken.kind) &&
          !ts.isIdentifier(unwrapExpression(current.left)))
      ) {
        hasInvocationEffects = true;
      }
      if (ts.isPropertyAccessExpression(current) || ts.isElementAccessExpression(current)) {
        hasGetterReads = true;
      }
      ts.forEachChild(current, collectInvocationEffects);
    }

    for (const parameter of node.parameters) {
      if (parameter.initializer) collectInvocationEffects(parameter.initializer);
    }
    if (node.body) collectInvocationEffects(node.body);
    if (hasInvocationEffects) {
      for (const binding of referencedOuterBindings) outerEffectBindings.add(binding);
    }

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
          nested.hasInvocationEffects ||
          (directCallable && nested.hasGetterReads) ||
          (directCallable && (nested.localAliasDependentReturn || nested.parameterDependentReturn)) ||
          nested.receiverDependentReturn ||
          nested.effectProvenanceUncertain ||
          nested.returnProvenanceUncertain
        ) {
          found = true;
        }
        for (const binding of new Set([...nested.outerReturnBindings, ...nested.outerEffectBindings])) {
          if (parameterBindings.has(binding)) parameterDependentReturn = true;
          else if (bindingIsLocal(binding)) {
            localAliasDependentReturn = true;
            if (!seenBindings.has(binding)) {
              seenBindings.add(binding);
              for (const write of bindingWrites.get(binding) ?? []) {
                pending.push({ expression: write, directCallable: true });
              }
              for (const write of bindingMutationWrites.get(binding) ?? []) {
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
          for (const write of bindingMutationWrites.get(binding) ?? []) {
            pending.push({ expression: write, directCallable: true });
          }
        }
        continue;
      }
      ts.forEachChild(current, child => {
        pending.push({
          expression: child,
          directCallable:
            directCallable &&
            !ts.isObjectLiteralExpression(current) &&
            !ts.isArrayLiteralExpression(current) &&
            !ts.isCallExpression(current) &&
            !ts.isNewExpression(current),
        });
      });
    }

    if (localAliasDependentReturn || receiverDependentReturn) {
      function callReferences(call, bindings, includeThis = false) {
        const pendingNodes = [call];
        while (pendingNodes.length > 0 && remainingReturnProvenanceWork > 0) {
          remainingReturnProvenanceWork -= 1;
          const current = pendingNodes.pop();
          if (includeThis && current.kind === ts.SyntaxKind.ThisKeyword) return true;
          if (ts.isIdentifier(current) && bindings.has(lookupBinding(current))) return true;
          ts.forEachChild(current, child => {
            pendingNodes.push(child);
          });
        }
        if (pendingNodes.length > 0) returnProvenanceUncertain = true;
        return false;
      }

      const carrierEffectCalls = effectCalls.filter(call =>
        callReferences(call, seenBindings, receiverDependentReturn)
      );
      if (carrierEffectCalls.length > 0) requiresInvocationEffects = true;
      mutationDependentReturn =
        !parameterDependentReturn && carrierEffectCalls.some(call => callReferences(call, parameterBindings));
      if (mutationDependentReturn) requiresInvocationEffects = true;
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
      localReturnMutationWrites: new Map(
        [...seenBindings].map(binding => [binding, new Set(bindingMutationWrites.get(binding) ?? [])])
      ),
      localReturnDependents,
      outerReturnBindings,
      hasInvocationEffects,
      effectParameterIndices: new Set(
        [...referencedEffectParameters].map(binding => parameterBindingIndices.get(binding))
      ),
      getterReadParameterIndices: new Set(
        [...referencedEffectParameters].map(binding => parameterBindingIndices.get(binding))
      ),
      getterReadOuterBindings: new Set(referencedOuterBindings),
      getterReceiverRead: receiverInvocationEffect,
      hasGetterReads,
      receiverInvocationEffect,
      outerEffectBindings,
      effectProvenanceUncertain,
      effectMayInstallTrackedCallable,
      mutationDependentReturn,
      parameterDependentReturn,
      receiverDependentReturn,
      requiresInvocationEffects: requiresInvocationEffects && (localAliasDependentReturn || receiverDependentReturn),
      returnProvenanceUncertain,
    });
    return provenance;
  }

  function functionValue(node) {
    const atom = invocationScopedValue(functionAtoms, 'functionAtoms', node, () => {
      const returnProvenance = functionHasPotentialTrackedReturn(node);
      return {
        kind: 'function-value',
        iteratorNode: node,
        iteratorScanned: false,
        iteratorUnknown: !node.asteriskToken,
        iteratorValues: new Set(),
        revision: 0,
        mayTrackCallResult: returnProvenance.mayTrackCallResult,
        localAliasDependentReturn: returnProvenance.localAliasDependentReturn,
        localReturnBindings: returnProvenance.localReturnBindings,
        localReturnBindingWrites: returnProvenance.localReturnBindingWrites,
        localReturnMutationWrites: returnProvenance.localReturnMutationWrites,
        localReturnDependents: returnProvenance.localReturnDependents,
        hasInvocationEffects: returnProvenance.hasInvocationEffects,
        effectParameterIndices: returnProvenance.effectParameterIndices,
        getterReadParameterIndices: returnProvenance.getterReadParameterIndices,
        getterReadOuterBindings: returnProvenance.getterReadOuterBindings,
        getterReceiverRead: returnProvenance.getterReceiverRead,
        hasGetterReads: returnProvenance.hasGetterReads,
        receiverInvocationEffect: returnProvenance.receiverInvocationEffect,
        outerEffectBindings: returnProvenance.outerEffectBindings,
        effectProvenanceUncertain: returnProvenance.effectProvenanceUncertain,
        effectMayInstallTrackedCallable: returnProvenance.effectMayInstallTrackedCallable,
        outerReturnBindings: returnProvenance.outerReturnBindings,
        mutationDependentReturn: returnProvenance.mutationDependentReturn,
        parameterDependentReturn: returnProvenance.parameterDependentReturn,
        receiverDependentReturn: returnProvenance.receiverDependentReturn,
        requiresInvocationEffects: returnProvenance.requiresInvocationEffects,
        returnProvenanceUncertain: returnProvenance.returnProvenanceUncertain,
        trackCallResult: false,
        capturedBindings: new Map(),
      };
    });
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

  function iteratorInstanceFor(node) {
    return invocationScopedValue(iteratorInvocationAtoms, 'iteratorInvocationAtoms', node, () => {
      const created = {
        kind: 'iterator-instance',
        iterators: new Set(),
        next: undefined,
        producedValues: new Set(),
        receivers: new Set(),
        unknown: false,
      };
      created.next = { kind: 'iterator-next', iteratorInstance: created };
      return created;
    });
  }

  function iteratorInvocationFor(node, iterator, receiverValue) {
    const atom = iteratorInstanceFor(node);
    mergeCallableValue(atom, atom.iterators, new Set([iterator]));
    const boundedReceivers = new Set();
    let overflow = false;
    for (const receiver of receiverValue) {
      if (atom.receivers.has(receiver)) continue;
      if (atom.receivers.size + boundedReceivers.size >= maximumTrackedInvocationArguments) {
        overflow = true;
        break;
      }
      boundedReceivers.add(receiver);
    }
    mergeCallableValue(atom, atom.receivers, boundedReceivers);
    if (overflow && !atom.unknown) {
      atom.unknown = true;
      notifyPropagationSubscribers(atom);
    }
    return atom;
  }

  function valueIteratorInvocationFor(node, producedValues, receiverValue, unknown = false) {
    const atom = iteratorInstanceFor(node);
    const boundedValues = new Set();
    let overflow = false;
    for (const producedValue of producedValues) {
      if (atom.producedValues.has(producedValue)) continue;
      if (atom.producedValues.size + boundedValues.size >= maximumTrackedInvocationArguments) {
        overflow = true;
        break;
      }
      boundedValues.add(producedValue);
    }
    const boundedReceivers = new Set();
    for (const receiver of receiverValue) {
      if (atom.receivers.has(receiver)) continue;
      if (atom.receivers.size + boundedReceivers.size >= maximumTrackedInvocationArguments) {
        overflow = true;
        break;
      }
      boundedReceivers.add(receiver);
    }
    mergeCallableValue(atom, atom.producedValues, boundedValues);
    mergeCallableValue(atom, atom.receivers, boundedReceivers);
    if ((unknown || overflow) && !atom.unknown) {
      atom.unknown = true;
      notifyPropagationSubscribers(atom);
    }
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

  function functionInvocationState(atom, invocationNode) {
    const parentState = activeFunctionInvocationState();
    const states = parentState
      ? (parentState.childFunctionInvocationStates ??= new WeakMap())
      : functionInvocationStates;
    let functions = states.get(invocationNode);
    if (!functions) {
      functions = new WeakMap();
      states.set(invocationNode, functions);
    }
    let state = functions.get(atom);
    if (!state) {
      const bindingFrame = new Map();
      bindingFrame.functionScope = nodeScopes.get(atom.iteratorNode);
      state = { bindingFrame };
      functions.set(atom, state);
    }
    return state;
  }

  function functionInvocationFrame(atom, argumentValues, invocationNode, state) {
    const frame = state.bindingFrame;
    for (const [binding, value] of atom.capturedBindings) {
      let captured = frame.get(binding);
      if (!captured) {
        captured = new Set();
        frame.set(binding, captured);
      }
      mergeValue(captured, value);
    }
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

  function materializedInvocationArguments(atom, argumentValues, frame) {
    return atom.iteratorNode.parameters.map((parameter, index) => {
      const value = new Set(argumentValues[index] ?? literalValue(undefined));
      function mergeParameterBindings(name) {
        if (ts.isIdentifier(name)) {
          const binding = declarationBindings.get(name);
          const bindingValue = binding ? frame.get(binding) : undefined;
          if (bindingValue) mergeValue(value, bindingValue);
          return;
        }
        for (const element of name.elements) {
          if (ts.isBindingElement(element)) mergeParameterBindings(element.name);
        }
      }
      mergeParameterBindings(parameter.name);
      return value;
    });
  }

  function invocationArgumentsForEffectGating(atom, argumentValues, invocationNode, receiverValue) {
    if (!atom.iteratorNode.parameters.some(parameter => parameter.initializer)) return argumentValues;
    const previousReceiver = activeFunctionReceiver;
    activeFunctionReceiver = receiverValue;
    const state = functionInvocationState(atom, invocationNode);
    activeFunctionInvocationStates.push(state);
    try {
      const frame = functionInvocationFrame(atom, argumentValues, invocationNode, state);
      return materializedInvocationArguments(atom, argumentValues, frame);
    } finally {
      activeFunctionInvocationStates.pop();
      activeFunctionReceiver = previousReceiver;
    }
  }

  function executeFunctionInvocationEffects(root) {
    function visit(node) {
      if (!consumeAnalysisWork(node)) return;
      if (node !== root && ts.isFunctionLike(node)) {
        if (ts.isFunctionDeclaration(node) && node.name) bindPattern(node.name, functionValue(node));
        return;
      }
      if (ts.isVariableDeclaration(node) && node.initializer) {
        bindPattern(node.name, evaluateExpression(node.initializer));
      } else if (ts.isForInStatement(node) || ts.isForOfStatement(node)) {
        const elementValue = ts.isForOfStatement(node)
          ? allPositionalValues(positionalLayouts(evaluateExpression(node.expression)))
          : unknownValue();
        if (ts.isVariableDeclarationList(node.initializer)) {
          for (const declaration of node.initializer.declarations) bindPattern(declaration.name, elementValue);
        } else {
          assignToTarget(node.initializer, elementValue);
        }
      } else if (ts.isBinaryExpression(node) && ts.isAssignmentOperator(node.operatorToken.kind)) {
        if (
          [
            ts.SyntaxKind.EqualsToken,
            ts.SyntaxKind.AmpersandAmpersandEqualsToken,
            ts.SyntaxKind.BarBarEqualsToken,
            ts.SyntaxKind.QuestionQuestionEqualsToken,
          ].includes(node.operatorToken.kind)
        ) {
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
        invalidateUnknownInvocationCarrierEffects(node);
        evaluateInvocation(node.expression, [...node.arguments], node);
      } else if (
        (ts.isPropertyAccessExpression(node) || ts.isElementAccessExpression(node)) &&
        !isWriteOnlyPropertyAccess(node)
      ) {
        evaluateExpression(node);
      } else if (ts.isObjectLiteralExpression(node) || ts.isArrayLiteralExpression(node)) {
        evaluateExpression(node);
      }
      ts.forEachChild(node, visit);
    }

    if (root.body) visit(root.body);
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
    const state = functionInvocationState(atom, invocationNode);
    activeFunctionInvocationStates.push(state);
    activeFunctionInvocationNodes.push(invocationNode);
    const frame = functionInvocationFrame(atom, argumentValues, invocationNode, state);
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
      const materializedArguments = materializedInvocationArguments(atom, argumentValues, frame);
      const carrierEffectInvocation =
        (atom.hasInvocationEffects || atom.hasGetterReads) &&
        functionInvocationMayAffectCarrier(atom, materializedArguments, receiverValue);
      const trackedCallableInvocation =
        atom.hasInvocationEffects &&
        functionInvocationMayExecuteTrackedCallable(atom, materializedArguments, receiverValue);
      if (
        carrierEffectInvocation ||
        trackedCallableInvocation ||
        (atom.requiresInvocationEffects &&
          (invocationCarriesMutationProvenance(materializedArguments) ||
            invocationCarriesMutationProvenance([receiverValue]) ||
            (argumentValues.length === 0 && atom.mayTrackCallResult)))
      ) {
        const previousUnknownCarrierInvalidation = state.allowUnknownCarrierInvalidation;
        state.allowUnknownCarrierInvalidation = carrierEffectInvocation || atom.mutationDependentReturn;
        try {
          executeFunctionInvocationEffects(root);
        } finally {
          state.allowUnknownCarrierInvalidation = previousUnknownCarrierInvalidation;
        }
      }
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
      activeFunctionInvocationNodes.pop();
      activeFunctionInvocationStates.pop();
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
        if (iterator.iteratorUnknown && iterator.iteratorValues.size === 0) {
          mergeValue(result, unknownReflectiveCallableValue());
        }
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

  function directlyInvokedUnsafeKinds(value) {
    const kinds = new Set();
    const pending = [...value];
    const seen = new Set();
    for (
      let queueIndex = 0;
      queueIndex < pending.length && queueIndex < maximumCallableRecursionDepth;
      queueIndex += 1
    ) {
      const atom = pending[queueIndex];
      if (atom === origins.builtinEval) {
        kinds.add('direct-eval');
      } else if (atom === origins.lodashTemplate) {
        kinds.add('lodash-template');
      } else if (typeof atom !== 'string' && !seen.has(atom)) {
        seen.add(atom);
        if (atom.kind === 'bound-callable') {
          for (const target of atom.target) pending.push(target);
        } else if (atom.kind === 'invocation-method' && ['apply', 'call'].includes(atom.method)) {
          for (const target of atom.target) pending.push(target);
        }
      }
    }
    return kinds;
  }

  function hasUnknownValue(value, seen = new Set()) {
    if (value.size === 0) return true;
    for (const atom of value) {
      if (typeof atom === 'string') continue;
      if (atom.kind === 'unknown-value') {
        return true;
      }
      if (atom.kind === 'function-value' && atom.trackCallResult !== true) {
        if (atom.iteratorNode.asteriskToken) {
          scanIteratorFunction(atom);
        }
        continue;
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
    const state = activeFunctionInvocationState();
    const values = state ? (state.invocationMethodAtoms ??= new WeakMap()) : invocationMethodAtoms;
    let methods = values.get(node);
    if (!methods) {
      methods = new Map();
      values.set(node, methods);
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

  function positionalOverflowPropertyIsDefinitelyPresent(carrier, propertyName) {
    if (!carrier.positional || carrier.positionalOverflowStart === undefined || !/^(0|[1-9]\d*)$/.test(propertyName)) {
      return false;
    }
    const index = Number(propertyName);
    return (
      Number.isSafeInteger(index) &&
      index >= carrier.positionalOverflowStart &&
      carrier.overflowPositionalOwnProperties.has(index) &&
      (!carrier.positionalUncertain || strongPropertyWriteSupersedesPositionalUncertainty(carrier, propertyName))
    );
  }

  function boundedOverflowPropertyValue(carrier, propertyName) {
    if (!carrier.positional || !/^(0|[1-9]\d*)$/.test(propertyName)) return undefined;
    const index = Number(propertyName);
    if (
      !Number.isSafeInteger(index) ||
      index < maximumTrackedInvocationArguments ||
      index >= maximumTrackedInvocationArguments * 2
    ) {
      return undefined;
    }
    return carrier.overflowPositionalProperties.get(index);
  }

  function overflowPropertyIsPreciselyModeled(carrier, propertyName) {
    return (
      (boundedOverflowPropertyValue(carrier, propertyName) !== undefined &&
        (!carrier.positionalUncertain || strongPropertyWriteSupersedesPositionalUncertainty(carrier, propertyName)) &&
        (!carrier.overflowPositionalPropertiesUncertain ||
          strongPropertyWriteSupersedesOverflowUncertainty(carrier, propertyName))) ||
      carrier.deletedProperties.has(propertyName)
    );
  }

  function strongPropertyWriteSupersedesPositionalUncertainty(carrier, propertyName) {
    const strongWriteRank = carrier.strongPropertyWriteRanks?.get(propertyName);
    return (
      !carrier.positionalUncertaintyUnranked &&
      strongWriteRank !== undefined &&
      carrier.positionalUncertaintyWriteRank !== undefined &&
      rankPrecedes(carrier.positionalUncertaintyWriteRank, strongWriteRank)
    );
  }

  function strongPropertyWriteSupersedesOverflowUncertainty(carrier, propertyName) {
    const strongWriteRank = carrier.strongPropertyWriteRanks?.get(propertyName);
    return (
      !carrier.overflowPositionalPropertiesUncertaintyUnranked &&
      strongWriteRank !== undefined &&
      carrier.overflowPositionalPropertiesUncertaintyWriteRank !== undefined &&
      rankPrecedes(carrier.overflowPositionalPropertiesUncertaintyWriteRank, strongWriteRank)
    );
  }

  function getProperty(value, propertyNames, node, includeUncertainPositionalValues = true) {
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
        if (propertyNames?.includes('next')) {
          const iterator = valueIteratorInvocationFor(node ?? sourceFile, new Set(), value, true);
          result.add(iterator.next);
        } else {
          result.add(
            atom.reflectiveContainer ? unknownReflectiveCallableAtom : atom.callableReason ? unknownValueAtom : atom
          );
        }
        continue;
      }
      if (atom.kind === 'iterator-instance') {
        if (propertyNames === undefined || propertyNames.includes('next')) result.add(atom.next);
        continue;
      }
      if (atom.kind !== 'carrier') continue;
      if (!suppressCarrierPropertyDependency) trackPropagationDependency(atom);
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
          const boundedOverflowValue = boundedOverflowPropertyValue(atom, propertyName);
          if (boundedOverflowValue) {
            mergeValue(result, boundedOverflowValue);
            if (hasUnsafePositionalValue(boundedOverflowValue)) {
              mergeValue(result, unknownReflectiveCallableValue());
            }
          }
          const accessor = atom.accessors.get(propertyName);
          if (accessor) mergeValue(result, accessorReturnedValues(accessor.get, value));
          const hasOwnProperty =
            accessor !== undefined ||
            (propertyValue !== undefined &&
              (!atom.positional || !/^(0|[1-9]\d*)$/.test(propertyName) || propertyValue.size > 0)) ||
            positionalOverflowPropertyIsDefinitelyPresent(atom, propertyName);
          if (!hasOwnProperty || atom.deletedProperties.has(propertyName) || atom.unknownPropertyDeletion) {
            inheritedPropertyNames.push(propertyName);
          }
        }
      }
      mergeValue(result, atom.unknownProperty);
      if (
        includeUncertainPositionalValues &&
        atom.positionalUncertain &&
        (propertyNames === undefined ||
          propertyNames.some(
            propertyName =>
              /^(0|[1-9]\d*)$/.test(propertyName) &&
              !strongPropertyWriteSupersedesPositionalUncertainty(atom, propertyName)
          ))
      ) {
        mergeValue(result, atom.uncertainPositionalValues);
      }
      if (
        includeUncertainPositionalValues &&
        atom.positionalOverflowStart !== undefined &&
        (propertyNames === undefined ||
          propertyNames.some(
            propertyName =>
              /^(0|[1-9]\d*)$/.test(propertyName) &&
              Number(propertyName) >= atom.positionalOverflowStart &&
              !overflowPropertyIsPreciselyModeled(atom, propertyName)
          ))
      ) {
        mergeValue(result, atom.overflowPositionalValues);
        if (hasUnsafePositionalValue(atom.overflowPositionalValues)) {
          mergeValue(result, unknownReflectiveCallableValue());
        }
      }
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
        const callable = new Set(
          [...value].filter(
            atom =>
              isTrackedCallable(atom) ||
              atom === origins.objectFreeze ||
              atom === origins.objectSeal ||
              (typeof atom !== 'string' &&
                atom.kind === 'function-value' &&
                (atom.mutationDependentReturn || atom.hasGetterReads))
          )
        );
        if (callable.size > 0) result.add(invocationMethodFor(node, method, callable));
      }
    }
    return result;
  }

  function putCarrierProperty(
    carrier,
    propertyNames,
    value,
    writeRank,
    strong = false,
    descriptorAttributes = undefined
  ) {
    if (propertyNames === undefined) {
      if (value.size === 0) return;
      mergeCarrierProperty(carrier, carrier.unknownProperty, value);
      if (carrier.positional) {
        if (!carrier.positionalUncertain) {
          carrier.positionalUncertain = true;
          notifyPropagationSubscribers(carrier);
        }
        mergeCarrierProperty(carrier, carrier.uncertainPositionalValues, retainReflectiveCallableProvenance(value));
        mergeCarrierProperty(carrier, carrier.uncertainPositionalValues, unknownReflectiveCallableValue());
      }
      return;
    }
    for (const propertyName of propertyNames) {
      const previousWriteRank = carrier.propertyWriteRanks.get(propertyName);
      if (writeRank && previousWriteRank && rankPrecedes(writeRank, previousWriteRank)) continue;
      if (strong && carrier.deletedProperties.delete(propertyName)) notifyPropagationSubscribers(carrier);
      if (carrier.positional && /^(0|[1-9]\d*)$/.test(propertyName)) {
        const index = Number(propertyName);
        if (Number.isSafeInteger(index) && index >= maximumTrackedInvocationArguments) {
          if (index < maximumTrackedInvocationArguments * 2) {
            const boundedValue = new Set(value);
            if (
              boundedValue.has(origins.builtinEval) ||
              boundedValue.has(origins.lodashTemplate) ||
              hasUnsafePositionalValue(boundedValue)
            ) {
              mergeValue(boundedValue, unknownReflectiveCallableValue());
            }
            let target = carrier.overflowPositionalProperties.get(index);
            if (!target) {
              target = new Set();
              carrier.overflowPositionalProperties.set(index, target);
            }
            const newerStrongWrite =
              strong && writeRank && (!previousWriteRank || rankPrecedes(previousWriteRank, writeRank));
            if (newerStrongWrite) recordStrongPropertyWriteRank(carrier, propertyName, writeRank);
            if (newerStrongWrite) replaceTracked(target, boundedValue, carrier);
            else mergeCarrierProperty(carrier, target, boundedValue);
            recordCarrierPropertyAttributes(carrier, propertyName, descriptorAttributes, newerStrongWrite);
            if (writeRank && (!previousWriteRank || !rankEquals(writeRank, previousWriteRank))) {
              carrier.propertyWriteRanks.set(propertyName, writeRank);
            }
            if (strong && value.size === 0) {
              carrier.overflowPositionalProperties.delete(index);
              if (carrier.overflowPositionalOwnProperties.delete(index)) notifyPropagationSubscribers(carrier);
            }
          }
          mergeCarrierPositionalOverflow(carrier, maximumTrackedInvocationArguments, value);
          if (strong && value.size > 0) mergeCarrierOverflowOwnProperties(carrier, new Set([index]));
          continue;
        }
      }
      let target = carrier.properties.get(propertyName);
      if (!target) {
        rememberOwnPropertyName(carrier, propertyName);
        target = new Set();
        carrier.properties.set(propertyName, target);
      }
      const newerStrongWrite =
        strong && writeRank && (!previousWriteRank || rankPrecedes(previousWriteRank, writeRank));
      if (newerStrongWrite) recordStrongPropertyWriteRank(carrier, propertyName, writeRank);
      if (newerStrongWrite) replaceTracked(target, value, carrier);
      else mergeCarrierProperty(carrier, target, value);
      recordCarrierPropertyAttributes(carrier, propertyName, descriptorAttributes, newerStrongWrite);
      if (writeRank && (!previousWriteRank || !rankEquals(writeRank, previousWriteRank))) {
        carrier.propertyWriteRanks.set(propertyName, writeRank);
      }
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

  function recordCarrierPropertyAttributes(carrier, propertyName, attributes, replace) {
    let changed = false;
    for (const [field, map] of [
      ['configurable', carrier.propertyConfigurabilities],
      ['enumerable', carrier.propertyEnumerabilities],
      ['writable', carrier.propertyWritabilities],
    ]) {
      const values = attributes?.[field] ?? (map.has(propertyName) ? undefined : new Set([true]));
      if (!values || values.size === 0) continue;
      let stored = map.get(propertyName);
      if (!stored) {
        stored = new Set();
        map.set(propertyName, stored);
      }
      if (replace) {
        if (stored.size === values.size && [...stored].every(value => values.has(value))) continue;
        stored.clear();
        for (const value of values) stored.add(value);
        changed = true;
      } else if (mergeValue(stored, values)) {
        changed = true;
      }
    }
    if (changed) notifyPropagationSubscribers(carrier);
  }

  function recordStrongPropertyWriteRank(carrier, propertyName, writeRank) {
    const previousStrongWriteRank = carrier.strongPropertyWriteRanks.get(propertyName);
    if (previousStrongWriteRank && rankEquals(previousStrongWriteRank, writeRank)) return;
    carrier.strongPropertyWriteRanks.set(propertyName, writeRank);
    notifyPropagationSubscribers(carrier);
  }

  function rememberOwnPropertyName(target, propertyName) {
    target.ownPropertyNames ??= new Set();
    target.ownPropertyNames.add(propertyName);
  }

  function arrayIndexPropertyValue(propertyName) {
    if (!/^(0|[1-9]\d*)$/.test(propertyName)) return undefined;
    const index = Number(propertyName);
    return Number.isSafeInteger(index) && index >= 0 && index < 2 ** 32 - 1 ? index : undefined;
  }

  function ownPropertyNamesInRuntimeOrder(target) {
    const knownPropertyNames = new Set([...target.properties.keys(), ...target.accessors.keys()]);
    const insertionOrderedNames = [...(target.ownPropertyNames ?? [])].filter(propertyName =>
      knownPropertyNames.delete(propertyName)
    );
    insertionOrderedNames.push(...knownPropertyNames);
    const indexedNames = insertionOrderedNames
      .filter(propertyName => arrayIndexPropertyValue(propertyName) !== undefined)
      .sort((left, right) => arrayIndexPropertyValue(left) - arrayIndexPropertyValue(right));
    const stringNames = insertionOrderedNames.filter(
      propertyName => arrayIndexPropertyValue(propertyName) === undefined && propertyName !== iteratorPropertyName
    );
    const symbolNames = insertionOrderedNames.filter(propertyName => propertyName === iteratorPropertyName);
    return [...indexedNames, ...stringNames, ...symbolNames];
  }

  function mergeCarrierPositionalOverflow(carrier, overflowStart, overflowValues) {
    if (overflowStart === undefined) return;
    const writeRank = deterministicWriteRank(activePropagationOperation?.node ?? activeAnalysisNode);
    if (writeRank && carrier.positionalLengthWriteRank && rankPrecedes(writeRank, carrier.positionalLengthWriteRank)) {
      return;
    }
    let changed = false;
    const boundedStart = Math.max(0, Math.min(overflowStart, maximumTrackedInvocationArguments));
    if (carrier.positionalOverflowStart === undefined || boundedStart < carrier.positionalOverflowStart) {
      carrier.positionalOverflowStart = boundedStart;
      changed = true;
    }
    if (mergeValue(carrier.overflowPositionalValues, overflowValues)) changed = true;
    if (changed) notifyPropagationSubscribers(carrier);
  }

  function mergeCarrierOverflowOwnProperties(carrier, propertyIndices) {
    const writeRank = deterministicWriteRank(activePropagationOperation?.node ?? activeAnalysisNode);
    if (writeRank && carrier.positionalLengthWriteRank && rankPrecedes(writeRank, carrier.positionalLengthWriteRank)) {
      return;
    }
    let changed = false;
    const maximumIndex = maximumTrackedInvocationArguments * 2;
    for (const index of propertyIndices) {
      if (
        !Number.isSafeInteger(index) ||
        index < maximumTrackedInvocationArguments ||
        index >= maximumIndex ||
        carrier.overflowPositionalOwnProperties.has(index)
      ) {
        continue;
      }
      carrier.overflowPositionalOwnProperties.add(index);
      changed = true;
    }
    if (changed) notifyPropagationSubscribers(carrier);
  }

  function replaceCarrierOverflowOwnProperties(carrier, propertyIndices) {
    replaceTracked(
      carrier.overflowPositionalOwnProperties,
      new Set(
        [...propertyIndices].filter(
          index =>
            Number.isSafeInteger(index) &&
            index >= maximumTrackedInvocationArguments &&
            index < maximumTrackedInvocationArguments * 2
        )
      ),
      carrier
    );
  }

  function replaceCarrierOverflowProperties(carrier, properties) {
    let changed = false;
    for (const index of [...carrier.overflowPositionalProperties.keys()]) {
      if (properties.has(index)) continue;
      carrier.overflowPositionalProperties.delete(index);
      changed = true;
    }
    for (const [index, value] of properties) {
      let stored = carrier.overflowPositionalProperties.get(index);
      if (!stored) {
        stored = new Set();
        carrier.overflowPositionalProperties.set(index, stored);
        changed = true;
      }
      replaceTracked(stored, value, carrier);
    }
    replaceCarrierOverflowOwnProperties(carrier, new Set(properties.keys()));
    if (carrier.overflowPositionalPropertiesUncertain) {
      carrier.overflowPositionalPropertiesUncertain = false;
      changed = true;
    }
    if (carrier.overflowPositionalPropertiesUncertaintyUnranked) {
      carrier.overflowPositionalPropertiesUncertaintyUnranked = false;
      changed = true;
    }
    if (carrier.overflowPositionalPropertiesUncertaintyWriteRank !== undefined) {
      carrier.overflowPositionalPropertiesUncertaintyWriteRank = undefined;
      changed = true;
    }
    if (changed) notifyPropagationSubscribers(carrier);
  }

  function finalizeOverflowPropertyMutation(carrier, properties) {
    if (properties) {
      replaceCarrierOverflowProperties(carrier, properties);
      return;
    }
    let changed = false;
    if (!carrier.overflowPositionalPropertiesUncertain) {
      carrier.overflowPositionalPropertiesUncertain = true;
      changed = true;
    }
    const writeRank = uncertainWriteRank(activePropagationOperation?.node ?? activeAnalysisNode);
    if (!writeRank) {
      if (!carrier.overflowPositionalPropertiesUncertaintyUnranked) {
        carrier.overflowPositionalPropertiesUncertaintyUnranked = true;
        changed = true;
      }
    } else if (
      !carrier.overflowPositionalPropertiesUncertaintyWriteRank ||
      rankPrecedes(carrier.overflowPositionalPropertiesUncertaintyWriteRank, writeRank)
    ) {
      carrier.overflowPositionalPropertiesUncertaintyWriteRank = writeRank;
      changed = true;
    }
    if (changed) notifyPropagationSubscribers(carrier);
  }

  function mergeCarrierExactPositionalLengths(carrier, lengths) {
    const writeRank = deterministicWriteRank(activePropagationOperation?.node ?? activeAnalysisNode);
    if (writeRank && carrier.positionalLengthWriteRank && rankPrecedes(writeRank, carrier.positionalLengthWriteRank)) {
      return;
    }
    let changed = false;
    for (const length of lengths) {
      if (!Number.isSafeInteger(length) || length < 0 || carrier.exactPositionalLengths.has(length)) continue;
      if (carrier.exactPositionalLengths.size >= maximumTrackedPositionalAlternatives) {
        if (!carrier.positionalUncertain) {
          carrier.positionalUncertain = true;
          changed = true;
        }
        break;
      }
      carrier.exactPositionalLengths.add(length);
      changed = true;
    }
    if (changed) notifyPropagationSubscribers(carrier);
  }

  function replaceCarrierExactPositionalLengths(carrier, lengths) {
    replaceTracked(carrier.exactPositionalLengths, lengths, carrier);
  }

  function replaceCarrierPositionalLengths(carrier, lengths) {
    const boundedLengths = new Set([...lengths].map(length => Math.min(length, maximumTrackedInvocationArguments)));
    replaceTracked(carrier.positionalLengths, boundedLengths, carrier);
  }

  function replaceCarrierPositionalOverflow(carrier, overflowStart, overflowValues) {
    const boundedStart =
      overflowStart === undefined ? undefined : Math.max(0, Math.min(overflowStart, maximumTrackedInvocationArguments));
    if (carrier.positionalOverflowStart !== boundedStart) {
      carrier.positionalOverflowStart = boundedStart;
      notifyPropagationSubscribers(carrier);
    }
    replaceTracked(carrier.overflowPositionalValues, overflowValues, carrier);
    if (boundedStart === undefined) replaceCarrierOverflowOwnProperties(carrier, new Set());
  }

  function mergeCarrierPositionalState(carrier, lengths, positionalUncertain, uncertainValues) {
    const writeNode = activePropagationOperation?.node ?? activeAnalysisNode;
    const writeRank = deterministicWriteRank(writeNode);
    if (writeRank && carrier.positionalLengthWriteRank && rankPrecedes(writeRank, carrier.positionalLengthWriteRank)) {
      return;
    }
    let changed = false;
    if (positionalUncertain) {
      const uncertaintyWriteRank = uncertainWriteRank(writeNode);
      if (!uncertaintyWriteRank) {
        if (!carrier.positionalUncertaintyUnranked) {
          carrier.positionalUncertaintyUnranked = true;
          changed = true;
        }
      } else if (
        !carrier.positionalUncertaintyWriteRank ||
        rankPrecedes(carrier.positionalUncertaintyWriteRank, uncertaintyWriteRank)
      ) {
        carrier.positionalUncertaintyWriteRank = uncertaintyWriteRank;
        changed = true;
      }
    }
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
    mergeValue(uncertainValues, carrier.overflowPositionalValues);
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
      origin !== origins.mapObject &&
      origin !== origins.mapPrototype &&
      origin !== origins.objectObject &&
      origin !== origins.objectPrototype &&
      origin !== origins.reflectObject &&
      origin !== origins.setObject &&
      origin !== origins.setPrototype &&
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
        origins.mapObject,
        origins.objectObject,
        origins.setObject,
        origins.symbolObject,
      ]);
      const objectInstances = new Set([
        origins.arrayPrototype,
        origins.functionPrototype,
        origins.globalObject,
        origins.jsonObject,
        origins.mapPrototype,
        origins.reflectObject,
        origins.setPrototype,
      ]);
      state = {
        accessors: new Map(),
        definiteAccessorProperties: new Set(),
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
        rememberOwnPropertyName(target, propertyName);
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

  function putAbstractAccessor(target, propertyNames, kind, value, definite = false) {
    const possibleValues = possibleAccessorValues(value);
    if (possibleValues.size === 0) return;
    if (propertyNames === undefined) {
      mergeCarrierProperty(target, target.unknownAccessors[kind], possibleValues);
      return;
    }
    for (const propertyName of propertyNames) {
      if (definite && !target.definiteAccessorProperties.has(propertyName)) {
        target.definiteAccessorProperties.add(propertyName);
        notifyPropagationSubscribers(target);
      }
      let accessor = target.accessors.get(propertyName);
      if (!accessor) {
        rememberOwnPropertyName(target, propertyName);
        accessor = { get: new Set(), set: new Set() };
        target.accessors.set(propertyName, accessor);
      }
      mergeCarrierProperty(target, accessor[kind], possibleValues);
    }
  }

  function recordTargetProperty(
    targetValue,
    propertyNames,
    value,
    writeNode,
    strong = false,
    descriptorAttributes = undefined
  ) {
    const writeRank = deterministicWriteRank(writeNode);
    const strongCarrierWrite =
      strong &&
      activeAlternativeMutationDepth === 0 &&
      writeRank !== undefined &&
      propertyNames?.length === 1 &&
      targetValue.size === 1 &&
      [...targetValue].every(atom => typeof atom !== 'string' && atom.kind === 'carrier');
    for (const atom of targetValue) {
      if (typeof atom !== 'string' && atom.kind === 'carrier') {
        const recordedValue =
          atom.positional &&
          propertyNames?.length === 1 &&
          propertyNames[0] === 'length' &&
          positionalLengthValues(value) &&
          atom.exactPositionalLengths.size === 1
            ? literalValue([...atom.exactPositionalLengths][0])
            : value;
        putCarrierProperty(atom, propertyNames, recordedValue, writeRank, strongCarrierWrite, descriptorAttributes);
      } else if (typeof atom === 'string') {
        const state = builtinPrototypeState(atom);
        if (state) putAbstractProperty(state, propertyNames, value);
      }
    }
  }

  function arrayLengthDescriptorAttributes(carrier, descriptorValue) {
    const attributes = {};
    for (const field of ['configurable', 'enumerable', 'writable']) {
      const fieldState = descriptorBooleanValues(descriptorFieldState(descriptorValue, field));
      const values = new Set(fieldState.values);
      if (fieldState.mayBeAbsent) {
        mergeValue(values, dataPropertyAttributeValues(carrier, 'length', field));
      }
      attributes[field] = values;
    }
    return attributes;
  }

  function recordCarrierDescriptorAttributes(carrier, propertyName, attributes, writeRank, strong) {
    const previousWriteRank = carrier.propertyWriteRanks.get(propertyName);
    if (writeRank && previousWriteRank && rankPrecedes(writeRank, previousWriteRank)) return;
    const replace =
      strong && writeRank !== undefined && (!previousWriteRank || rankPrecedes(previousWriteRank, writeRank));
    recordCarrierPropertyAttributes(carrier, propertyName, attributes, replace);
    if (writeRank && (!previousWriteRank || !rankEquals(writeRank, previousWriteRank))) {
      carrier.propertyWriteRanks.set(propertyName, writeRank);
    }
  }

  function recordTargetDataDescriptor(targetValue, propertyNames, descriptorValue, writeNode, strong) {
    if (propertyNames === undefined) {
      recordTargetProperty(targetValue, undefined, unknownReflectiveCallableValue(), writeNode);
      return;
    }
    const writeRank = deterministicWriteRank(writeNode);
    const strongCarrierWrite =
      strong &&
      activeAlternativeMutationDepth === 0 &&
      writeRank !== undefined &&
      propertyNames.length === 1 &&
      targetValue.size === 1 &&
      [...targetValue].every(atom => typeof atom !== 'string' && atom.kind === 'carrier');
    for (const atom of targetValue) {
      if (typeof atom === 'string' || atom.kind !== 'carrier') continue;
      for (const propertyName of propertyNames) {
        if (atom.definiteAccessorProperties.delete(propertyName)) notifyPropagationSubscribers(atom);
        if (atom.positional && propertyName === 'length') {
          const attributes = arrayLengthDescriptorAttributes(atom, descriptorValue);
          const value = descriptorFieldState(descriptorValue, 'value').values;
          if (value.size > 0) {
            putCarrierProperty(atom, [propertyName], value, writeRank, strongCarrierWrite, attributes);
          } else {
            recordCarrierDescriptorAttributes(atom, propertyName, attributes, writeRank, strongCarrierWrite);
          }
          continue;
        }
        const application = descriptorAppliedDataPropertyState(atom, propertyName, descriptorValue);
        putCarrierProperty(
          atom,
          [propertyName],
          application.value,
          writeRank,
          strongCarrierWrite,
          application.attributes
        );
      }
    }
  }

  function recordTargetAccessor(targetValue, propertyNames, kind, value, writeNode, strong = false) {
    const definiteCarrierAccessor =
      strong &&
      activeAlternativeMutationDepth === 0 &&
      deterministicWriteRank(writeNode) !== undefined &&
      propertyNames?.length === 1 &&
      targetValue.size === 1 &&
      [...targetValue].every(atom => typeof atom !== 'string' && atom.kind === 'carrier');
    for (const atom of targetValue) {
      if (typeof atom !== 'string' && atom.kind === 'carrier') {
        putAbstractAccessor(atom, propertyNames, kind, value, definiteCarrierAccessor);
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

  function descriptorFieldState(descriptorValue, field) {
    const values = descriptorFieldValues(descriptorValue, field);
    let mayBeAbsent = descriptorValue.size === 0;
    for (const atom of descriptorValue) {
      if (typeof atom === 'string' || atom.kind !== 'carrier') {
        mayBeAbsent = true;
        continue;
      }
      const hasOwnField = atom.properties.has(field) || atom.accessors.has(field);
      if (
        !hasOwnField ||
        atom.deletedProperties.has(field) ||
        atom.unknownPropertyDeletion ||
        atom.unknownProperty.size > 0 ||
        atom.unknownAccessors.get.size > 0
      ) {
        mayBeAbsent = true;
      }
    }
    return { mayBeAbsent, values };
  }

  function descriptorBooleanValues(fieldState) {
    const values = new Set();
    for (const atom of fieldState.values) {
      if (typeof atom !== 'string' && atom.kind === 'literal') {
        values.add(Boolean(atom.value));
      } else if (typeof atom === 'string' || (atom.kind !== 'unknown-value' && atom.kind !== 'known-data')) {
        values.add(true);
      } else {
        values.add(true);
        values.add(false);
      }
    }
    return { mayBeAbsent: fieldState.mayBeAbsent, values };
  }

  function dataPropertyAttributeValues(carrier, propertyName, field) {
    const map =
      field === 'configurable'
        ? carrier.propertyConfigurabilities
        : field === 'enumerable'
          ? carrier.propertyEnumerabilities
          : carrier.propertyWritabilities;
    const values = new Set(map.get(propertyName) ?? [true]);
    const integrityState =
      field === 'configurable'
        ? carrier.integrityConfigurability
        : field === 'writable'
          ? carrier.integrityWritability
          : true;
    if (integrityState === false) return new Set([false]);
    if (integrityState === undefined) values.add(false);
    return values;
  }

  function ownDataPropertyValues(carrier, propertyName) {
    const values = new Set(carrier.properties.get(propertyName) ?? []);
    const overflowValue = boundedOverflowPropertyValue(carrier, propertyName);
    if (overflowValue) mergeValue(values, overflowValue);
    return values;
  }

  function indexedOwnDataPropertyState(carrier, propertyName) {
    const propertyValue = carrier.properties.get(propertyName);
    const index = Number(propertyName);
    const overflowOwnProperty = Number.isSafeInteger(index) && carrier.overflowPositionalOwnProperties.has(index);
    const hasModeledDataProperty = (propertyValue !== undefined && propertyValue.size > 0) || overflowOwnProperty;
    const positionalPresenceUncertain =
      carrier.positionalUncertain && !strongPropertyWriteSupersedesPositionalUncertainty(carrier, propertyName);
    const overflowPresenceUncertain =
      index >= maximumTrackedInvocationArguments &&
      carrier.overflowPositionalPropertiesUncertain &&
      !strongPropertyWriteSupersedesOverflowUncertainty(carrier, propertyName);
    const mayBeMissing =
      !hasModeledDataProperty ||
      carrier.deletedProperties.has(propertyName) ||
      carrier.unknownPropertyDeletion ||
      positionalPresenceUncertain ||
      overflowPresenceUncertain;
    return {
      hasModeledDataProperty,
      mayBeMissing,
      configurabilities: dataPropertyAttributeValues(carrier, propertyName, 'configurable'),
      enumerabilities: dataPropertyAttributeValues(carrier, propertyName, 'enumerable'),
      writabilities: dataPropertyAttributeValues(carrier, propertyName, 'writable'),
    };
  }

  function missingIndexedPropertyCreationIsProven(carrier, propertyName) {
    const index = arrayIndexPropertyValue(propertyName);
    const doesNotExtendArray =
      !carrier.positional ||
      index === undefined ||
      (!carrier.positionalUncertain &&
        carrier.exactPositionalLengths.size > 0 &&
        [...carrier.exactPositionalLengths].every(length => index < length));
    return (
      carrier.extensible === true &&
      (doesNotExtendArray || [...dataPropertyAttributeValues(carrier, 'length', 'writable')].every(Boolean))
    );
  }

  function inheritedIndexedSetAllowsCreation(
    prototypeValue,
    propertyName,
    seen = new Set(),
    outcome = { requiresReceiverCreation: false }
  ) {
    if (prototypeValue.size === 0) {
      outcome.requiresReceiverCreation = true;
      return true;
    }
    for (const atom of prototypeValue) {
      if (seen.has(atom) || (typeof atom !== 'string' && atom.kind === 'unknown-value')) return false;
      const target = abstractTarget(atom);
      if (!target) return false;
      trackPropagationDependency(target);
      if (
        target.unknownProperty.size > 0 ||
        target.unknownPropertyDeletion ||
        target.unknownAccessors.get.size > 0 ||
        target.unknownAccessors.set.size > 0
      ) {
        return false;
      }
      const propertyDeleted = target.deletedProperties.has(propertyName);
      const accessor = target.accessors.get(propertyName);
      if (accessor && !propertyDeleted) {
        const propertyValue = target.properties.get(propertyName);
        const boundedOverflowValue = boundedOverflowPropertyValue(target, propertyName);
        if (
          !target.definiteAccessorProperties.has(propertyName) ||
          (propertyValue && propertyValue.size > 0) ||
          boundedOverflowValue ||
          accessor.set.size === 0
        ) {
          return false;
        }
        continue;
      }
      const propertyValue = target.properties.get(propertyName);
      const boundedOverflowValue = boundedOverflowPropertyValue(target, propertyName);
      if (((propertyValue && propertyValue.size > 0) || boundedOverflowValue) && !propertyDeleted) {
        if (typeof atom === 'string') return false;
        const writabilities = dataPropertyAttributeValues(target, propertyName, 'writable');
        if (writabilities.size === 0 || [...writabilities].some(writable => !writable)) return false;
        outcome.requiresReceiverCreation = true;
        continue;
      }
      const nextSeen = new Set(seen);
      nextSeen.add(atom);
      if (!inheritedIndexedSetAllowsCreation(effectivePrototypes(atom), propertyName, nextSeen, outcome)) return false;
    }
    return true;
  }

  function abstractSameValueIsProven(currentValues, requestedValues) {
    if (currentValues.size !== 1 || requestedValues.size !== 1) return false;
    const current = [...currentValues][0];
    const requested = [...requestedValues][0];
    if (
      (typeof current !== 'string' && ['known-data', 'unknown-value'].includes(current.kind)) ||
      (typeof requested !== 'string' && ['known-data', 'unknown-value'].includes(requested.kind))
    ) {
      return false;
    }
    if (
      typeof current !== 'string' &&
      current.kind === 'literal' &&
      typeof requested !== 'string' &&
      requested.kind === 'literal'
    ) {
      return current.valueType === requested.valueType && Object.is(current.value, requested.value);
    }
    return current === requested;
  }

  function abstractSameValueIsDisproven(currentValues, requestedValues) {
    if (currentValues.size !== 1 || requestedValues.size !== 1) return false;
    const current = [...currentValues][0];
    const requested = [...requestedValues][0];
    if (
      (typeof current !== 'string' && ['known-data', 'unknown-value'].includes(current.kind)) ||
      (typeof requested !== 'string' && ['known-data', 'unknown-value'].includes(requested.kind))
    ) {
      return false;
    }
    return !abstractSameValueIsProven(currentValues, requestedValues);
  }

  function descriptorIsCompatibleWithDataProperty(carrier, propertyName, descriptorValue, ownState) {
    const currentConfigurabilities = ownState.configurabilities;
    const currentEnumerabilities = ownState.enumerabilities;
    const currentWritabilities = ownState.writabilities;
    if (currentConfigurabilities.size === 0 || currentEnumerabilities.size === 0 || currentWritabilities.size === 0) {
      return false;
    }
    if (![...currentConfigurabilities].some(configurable => !configurable)) return true;

    if (['get', 'set'].some(field => descriptorFieldState(descriptorValue, field).values.size > 0)) return false;

    const requestedConfigurabilities = descriptorBooleanValues(
      descriptorFieldState(descriptorValue, 'configurable')
    ).values;
    if ([...requestedConfigurabilities].some(Boolean)) return false;

    const requestedEnumerabilities = descriptorBooleanValues(
      descriptorFieldState(descriptorValue, 'enumerable')
    ).values;
    if (
      requestedEnumerabilities.size > 0 &&
      (currentEnumerabilities.size !== 1 ||
        [...requestedEnumerabilities].some(value => value !== [...currentEnumerabilities][0]))
    ) {
      return false;
    }

    if (![...currentWritabilities].some(writable => !writable)) return true;
    const requestedWritabilities = descriptorBooleanValues(descriptorFieldState(descriptorValue, 'writable')).values;
    if ([...requestedWritabilities].some(Boolean)) return false;
    const requestedValue = descriptorFieldState(descriptorValue, 'value').values;
    return (
      requestedValue.size === 0 ||
      abstractSameValueIsProven(ownDataPropertyValues(carrier, propertyName), requestedValue)
    );
  }

  function descriptorIsDefinitelyIncompatibleWithDataProperty(carrier, propertyName, descriptorValue, ownState) {
    const currentConfigurabilities = ownState.configurabilities;
    if (currentConfigurabilities.size === 0 || ![...currentConfigurabilities].every(configurable => !configurable)) {
      return false;
    }

    if (
      ['get', 'set'].some(field => {
        const fieldState = descriptorFieldState(descriptorValue, field);
        return !fieldState.mayBeAbsent && fieldState.values.size > 0;
      })
    ) {
      return true;
    }

    const configurableState = descriptorBooleanValues(descriptorFieldState(descriptorValue, 'configurable'));
    if (
      !configurableState.mayBeAbsent &&
      configurableState.values.size > 0 &&
      [...configurableState.values].every(Boolean)
    ) {
      return true;
    }

    const currentEnumerabilities = ownState.enumerabilities;
    const enumerableState = descriptorBooleanValues(descriptorFieldState(descriptorValue, 'enumerable'));
    if (
      currentEnumerabilities.size === 1 &&
      !enumerableState.mayBeAbsent &&
      enumerableState.values.size > 0 &&
      [...enumerableState.values].every(value => value !== [...currentEnumerabilities][0])
    ) {
      return true;
    }

    const currentWritabilities = ownState.writabilities;
    if (currentWritabilities.size === 0 || ![...currentWritabilities].every(writable => !writable)) return false;
    const writableState = descriptorBooleanValues(descriptorFieldState(descriptorValue, 'writable'));
    if (!writableState.mayBeAbsent && writableState.values.size > 0 && [...writableState.values].every(Boolean)) {
      return true;
    }
    const requestedValue = descriptorFieldState(descriptorValue, 'value');
    return (
      !requestedValue.mayBeAbsent &&
      requestedValue.values.size > 0 &&
      [...requestedValue.values].every(value =>
        abstractSameValueIsDisproven(ownDataPropertyValues(carrier, propertyName), new Set([value]))
      )
    );
  }

  function descriptorAppliedDataPropertyState(carrier, propertyName, descriptorValue) {
    const ownState = indexedOwnDataPropertyState(carrier, propertyName);
    const valueField = descriptorFieldState(descriptorValue, 'value');
    const value = new Set(valueField.values);
    if (valueField.mayBeAbsent) {
      if (ownState.hasModeledDataProperty) mergeValue(value, ownDataPropertyValues(carrier, propertyName));
      if (ownState.mayBeMissing) mergeValue(value, literalValue(undefined));
    }
    const attributes = {};
    for (const field of ['configurable', 'enumerable', 'writable']) {
      const fieldState = descriptorBooleanValues(descriptorFieldState(descriptorValue, field));
      const values = new Set(fieldState.values);
      if (fieldState.mayBeAbsent) {
        if (ownState.hasModeledDataProperty) {
          mergeValue(values, dataPropertyAttributeValues(carrier, propertyName, field));
        }
        if (ownState.mayBeMissing) values.add(false);
      }
      attributes[field] = values;
    }
    return { attributes, value };
  }

  function successfulIndexedSetAttributes(carrier, propertyName) {
    const ownState = indexedOwnDataPropertyState(carrier, propertyName);
    const configurable = new Set(ownState.hasModeledDataProperty ? ownState.configurabilities : []);
    const enumerable = new Set(ownState.hasModeledDataProperty ? ownState.enumerabilities : []);
    if (ownState.mayBeMissing) {
      configurable.add(true);
      enumerable.add(true);
    }
    return { configurable, enumerable, writable: new Set([true]) };
  }

  function reflectivePropertyWriteSuccessIsProven(
    targetValue,
    propertyNames,
    receiverValue,
    defineProperty,
    descriptorValue = new Set()
  ) {
    if (propertyNames?.length !== 1) {
      return undefined;
    }
    if (targetValue.size !== 1 || receiverValue.size !== 1) return false;
    const target = [...targetValue][0];
    const receiver = [...receiverValue][0];
    if (
      typeof target === 'string' ||
      target.kind !== 'carrier' ||
      typeof receiver === 'string' ||
      receiver.kind !== 'carrier' ||
      (!defineProperty && target !== receiver)
    ) {
      return false;
    }
    const propertyName = propertyNames[0];
    if (propertyName === 'length' && target.positional) return undefined;
    if (
      target.unknownProperty.size > 0 ||
      target.unknownPropertyDeletion ||
      target.unknownAccessors.get.size > 0 ||
      target.unknownAccessors.set.size > 0
    ) {
      return false;
    }
    if (
      !defineProperty &&
      target.accessors.has(propertyName) &&
      !target.deletedProperties.has(propertyName) &&
      target.definiteAccessorProperties.has(propertyName)
    ) {
      return target.accessors.get(propertyName).set.size > 0;
    }
    const ownState = indexedOwnDataPropertyState(target, propertyName);
    if (defineProperty && target.accessors.has(propertyName)) {
      if (
        target.deletedProperties.has(propertyName) ||
        !target.definiteAccessorProperties.has(propertyName) ||
        ownState.hasModeledDataProperty ||
        ['value', 'writable'].some(field => descriptorFieldState(descriptorValue, field).values.size > 0) ||
        [...descriptorBooleanValues(descriptorFieldState(descriptorValue, 'configurable')).values].some(Boolean) ||
        descriptorFieldState(descriptorValue, 'enumerable').values.size > 0
      ) {
        return false;
      }
      const accessor = target.accessors.get(propertyName);
      for (const field of ['get', 'set']) {
        const requestedState = descriptorFieldState(descriptorValue, field);
        if (requestedState.mayBeAbsent && requestedState.values.size === 0) continue;
        if (requestedState.mayBeAbsent || requestedState.values.size !== 1) return false;
        const requested = [...requestedState.values][0];
        if (typeof requested !== 'string' && requested.kind === 'literal' && requested.value === undefined) {
          if (accessor[field].size > 0) return false;
        } else if (!abstractSameValueIsProven(accessor[field], requestedState.values)) {
          return false;
        }
      }
      return true;
    }
    if (!defineProperty && target.accessors.has(propertyName)) return false;
    const hasNonWritableOwnAlternative =
      ownState.hasModeledDataProperty &&
      (ownState.writabilities.size === 0 || [...ownState.writabilities].some(writable => !writable));
    if (!defineProperty && hasNonWritableOwnAlternative) return false;
    if (defineProperty) {
      if (
        ownState.hasModeledDataProperty &&
        !descriptorIsCompatibleWithDataProperty(target, propertyName, descriptorValue, ownState)
      ) {
        return false;
      }
      return !ownState.mayBeMissing || missingIndexedPropertyCreationIsProven(target, propertyName);
    }
    if (!ownState.mayBeMissing) return true;
    const inheritedOutcome = { requiresReceiverCreation: false };
    if (!inheritedIndexedSetAllowsCreation(effectivePrototypes(target), propertyName, new Set(), inheritedOutcome)) {
      return false;
    }
    return !inheritedOutcome.requiresReceiverCreation || missingIndexedPropertyCreationIsProven(receiver, propertyName);
  }

  function reflectivePropertyWriteFailureIsProven(
    targetValue,
    propertyNames,
    receiverValue,
    defineProperty,
    descriptorValue = new Set()
  ) {
    if (propertyNames?.length !== 1 || targetValue.size !== 1 || receiverValue.size !== 1) {
      return false;
    }
    const target = [...targetValue][0];
    const receiver = [...receiverValue][0];
    if (
      typeof target === 'string' ||
      target.kind !== 'carrier' ||
      typeof receiver === 'string' ||
      receiver.kind !== 'carrier' ||
      (!defineProperty && target !== receiver) ||
      target.unknownProperty.size > 0 ||
      target.unknownPropertyDeletion ||
      target.unknownAccessors.get.size > 0 ||
      target.unknownAccessors.set.size > 0
    ) {
      return false;
    }
    const propertyName = propertyNames[0];
    if (propertyName === 'length' && target.positional) return false;
    if (
      !defineProperty &&
      target.accessors.has(propertyName) &&
      !target.deletedProperties.has(propertyName) &&
      target.definiteAccessorProperties.has(propertyName)
    ) {
      return target.accessors.get(propertyName).set.size === 0;
    }
    if (defineProperty && target.accessors.has(propertyName)) return false;
    const ownState = indexedOwnDataPropertyState(target, propertyName);
    if (!defineProperty && target.accessors.has(propertyName)) return false;
    const presentFailure =
      ownState.hasModeledDataProperty &&
      (defineProperty
        ? descriptorIsDefinitelyIncompatibleWithDataProperty(target, propertyName, descriptorValue, ownState)
        : ownState.writabilities.size > 0 && [...ownState.writabilities].every(writable => !writable));
    if (!ownState.mayBeMissing) return presentFailure;
    const lengthWritabilities = dataPropertyAttributeValues(target, 'length', 'writable');
    const index = arrayIndexPropertyValue(propertyName);
    const extendsArray =
      target.positional &&
      index !== undefined &&
      !target.positionalUncertain &&
      target.exactPositionalLengths.size > 0 &&
      [...target.exactPositionalLengths].every(length => index >= length);
    const missingFailure =
      target.extensible === false ||
      (extendsArray && lengthWritabilities.size > 0 && [...lengthWritabilities].every(writable => !writable));
    return ownState.hasModeledDataProperty ? presentFailure && missingFailure : missingFailure;
  }

  function reflectiveArrayLengthWriteOutcome(
    targetValue,
    propertyNames,
    receiverValue,
    assignedValue,
    descriptorValue
  ) {
    if (
      propertyNames?.length !== 1 ||
      propertyNames[0] !== 'length' ||
      targetValue.size !== 1 ||
      receiverValue.size !== 1
    ) {
      return undefined;
    }
    const target = [...targetValue][0];
    if (
      target !== [...receiverValue][0] ||
      typeof target === 'string' ||
      target.kind !== 'carrier' ||
      !target.positional
    ) {
      return undefined;
    }
    if (descriptorValue) {
      for (const field of ['get', 'set']) {
        const state = descriptorFieldState(descriptorValue, field);
        if (!state.mayBeAbsent && state.values.size > 0) return false;
        if (state.values.size > 0) return undefined;
      }
      for (const field of ['configurable', 'enumerable']) {
        const state = descriptorBooleanValues(descriptorFieldState(descriptorValue, field));
        if (!state.mayBeAbsent && state.values.size > 0 && [...state.values].every(Boolean)) return false;
        if ([...state.values].some(Boolean)) return undefined;
      }
      const requestedWritability = descriptorBooleanValues(descriptorFieldState(descriptorValue, 'writable'));
      const currentWritabilities = dataPropertyAttributeValues(target, 'length', 'writable');
      if (
        [...currentWritabilities].every(writable => !writable) &&
        !requestedWritability.mayBeAbsent &&
        requestedWritability.values.size > 0 &&
        [...requestedWritability.values].every(Boolean)
      ) {
        return false;
      }

      const lengths = positionalLengthValues(assignedValue);
      if (lengths && [...currentWritabilities].every(writable => !writable)) {
        if (target.exactPositionalLengths.size !== 1) return undefined;
        const currentLength = [...target.exactPositionalLengths][0];
        const valueCanSucceed = [...lengths].some(length => Object.is(length, currentLength));
        const valueCanFail = [...lengths].some(length => !Object.is(length, currentLength));
        const writabilityCanSucceed =
          requestedWritability.mayBeAbsent || [...requestedWritability.values].some(writable => !writable);
        const writabilityCanFail = [...requestedWritability.values].some(Boolean);
        const canSucceed = valueCanSucceed && writabilityCanSucceed;
        const canFail = valueCanFail || writabilityCanFail;
        return canSucceed && !canFail ? true : canFail && !canSucceed ? false : undefined;
      }
    }
    const lengths = positionalLengthValues(assignedValue);
    if (!lengths && descriptorValue && descriptorFieldState(descriptorValue, 'value').mayBeAbsent) return true;
    if (!lengths) return undefined;
    const outcomes = [...lengths].map(length => positionalLengthWriteOutcome(target, length).success);
    return outcomes.every(Boolean) ? true : outcomes.every(outcome => outcome === false) ? false : undefined;
  }

  function descriptorAccessorValues(descriptorValue, kind) {
    return possibleAccessorValues(descriptorFieldValues(descriptorValue, kind));
  }

  function recordDescriptorAccessors(targetValue, propertyNames, descriptorValue, writeNode, strong = false) {
    recordTargetAccessor(
      targetValue,
      propertyNames,
      'get',
      descriptorAccessorValues(descriptorValue, 'get'),
      writeNode,
      strong
    );
    recordTargetAccessor(
      targetValue,
      propertyNames,
      'set',
      descriptorAccessorValues(descriptorValue, 'set'),
      writeNode,
      strong
    );
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
          const boundedOverflowValue = boundedOverflowPropertyValue(target, propertyName);
          const accessor = target.accessors.get(propertyName);
          hasOwnProperty =
            accessor !== undefined ||
            (propertyValue !== undefined &&
              (!target.positional || !/^(0|[1-9]\d*)$/.test(propertyName) || propertyValue.size > 0)) ||
            positionalOverflowPropertyIsDefinitelyPresent(target, propertyName);
          if (propertyValue) mergeValue(result, propertyValue);
          if (boundedOverflowValue) mergeValue(result, boundedOverflowValue);
          if (accessor) mergeValue(result, accessorReturnedValues(accessor.get, receiverValue));
          if (target.positional && /^(0|[1-9]\d*)$/.test(propertyName)) {
            const index = Number(propertyName);
            if (target.positionalUncertain) {
              if (!strongPropertyWriteSupersedesPositionalUncertainty(target, propertyName)) {
                mergeValue(result, retainReflectiveCallableProvenance(target.uncertainPositionalValues));
              }
            }
            if (
              target.positionalOverflowStart !== undefined &&
              Number.isSafeInteger(index) &&
              index >= target.positionalOverflowStart &&
              !overflowPropertyIsPreciselyModeled(target, propertyName)
            ) {
              mergeValue(result, retainReflectiveCallableProvenance(target.overflowPositionalValues));
            }
          }
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

  function observedPropertyValue(value, propertyNames, node, includeUncertainPositionalValues = true) {
    invalidateAccessorReceiver(value, propertyNames, 'get', value);
    return getProperty(value, propertyNames, node, includeUncertainPositionalValues);
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

  function positionalLengthValues(value) {
    const lengths = new Set();
    for (const atom of value) {
      if (
        typeof atom === 'string' ||
        atom.kind !== 'literal' ||
        atom.valueType !== 'number' ||
        !Number.isSafeInteger(atom.value) ||
        atom.value < 0
      ) {
        return undefined;
      }
      lengths.add(atom.value);
    }
    return lengths.size > 0 ? lengths : undefined;
  }

  function positionalLengthWriteOutcome(carrier, length) {
    const writabilities = dataPropertyAttributeValues(carrier, 'length', 'writable');
    if (writabilities.size === 0) return { success: undefined };
    if ([...writabilities].every(writable => !writable)) return { success: false };
    if (![...writabilities].every(Boolean)) return { success: undefined };
    if (carrier.exactPositionalLengths.size !== 1) return { success: undefined };
    const currentLength = [...carrier.exactPositionalLengths][0];
    if (length >= currentLength) return { finalLength: length, success: true };
    const indexedPropertyNames = new Set([...carrier.properties.keys(), ...carrier.accessors.keys()]);
    for (const index of carrier.overflowPositionalOwnProperties) indexedPropertyNames.add(String(index));
    let finalLength = length;
    let definiteFailure = false;
    let uncertain =
      carrier.positionalUncertain ||
      carrier.unknownPropertyDeletion ||
      carrier.unknownProperty.size > 0 ||
      carrier.unknownAccessors.get.size > 0 ||
      carrier.unknownAccessors.set.size > 0 ||
      carrier.overflowPositionalPropertiesUncertain ||
      (currentLength > maximumTrackedInvocationArguments * 2 && carrier.overflowPositionalValues.size > 0);
    for (const propertyName of indexedPropertyNames) {
      const index = arrayIndexPropertyValue(propertyName);
      if (index === undefined || index < length || index >= currentLength) continue;
      const ownState = indexedOwnDataPropertyState(carrier, propertyName);
      const accessor = carrier.accessors.get(propertyName);
      const presentAccessor =
        accessor && (accessor.get.size > 0 || accessor.set.size > 0) && !carrier.deletedProperties.has(propertyName);
      if (!ownState.hasModeledDataProperty && !presentAccessor) continue;
      if (ownState.mayBeMissing) uncertain = true;
      const configurabilities = dataPropertyAttributeValues(carrier, propertyName, 'configurable');
      if (![...configurabilities].some(configurable => !configurable)) continue;
      finalLength = Math.max(finalLength, index + 1);
      if ([...configurabilities].every(configurable => !configurable) && !ownState.mayBeMissing) {
        definiteFailure = true;
      } else {
        uncertain = true;
      }
    }
    if (uncertain) return { finalLength: definiteFailure ? undefined : finalLength, success: undefined };
    return { finalLength, success: definiteFailure ? false : true };
  }

  function commitDeterministicPositionalLength(carrier, length, writeRank) {
    const previousLengthWriteRank = carrier.propertyWriteRanks.get('length');
    if (writeRank && previousLengthWriteRank && rankPrecedes(writeRank, previousLengthWriteRank)) return;
    if (writeRank) carrier.positionalLengthWriteRank = writeRank;
    let changed = false;
    for (const [propertyName, propertyValue] of carrier.properties) {
      if (!/^(0|[1-9]\d*)$/.test(propertyName) || Number(propertyName) < length) continue;
      replaceTracked(propertyValue, new Set(), carrier);
      if (writeRank) carrier.propertyWriteRanks.set(propertyName, writeRank);
      if (!carrier.deletedProperties.has(propertyName)) {
        carrier.deletedProperties.add(propertyName);
        changed = true;
      }
    }
    for (const [propertyName, accessor] of carrier.accessors) {
      if (!/^(0|[1-9]\d*)$/.test(propertyName) || Number(propertyName) < length) continue;
      if (accessor.get.size > 0 || accessor.set.size > 0) {
        replaceTracked(accessor.get, new Set(), carrier);
        replaceTracked(accessor.set, new Set(), carrier);
        changed = true;
      }
      if (writeRank) carrier.propertyWriteRanks.set(propertyName, writeRank);
      if (!carrier.deletedProperties.has(propertyName)) {
        carrier.deletedProperties.add(propertyName);
        changed = true;
      }
    }
    const boundedEnd = maximumTrackedInvocationArguments * 2;
    for (let index = Math.max(length, maximumTrackedInvocationArguments); index < boundedEnd; index += 1) {
      if (carrier.overflowPositionalProperties.delete(index)) changed = true;
      if (carrier.overflowPositionalOwnProperties.delete(index)) changed = true;
      const propertyName = String(index);
      if (writeRank) carrier.propertyWriteRanks.set(propertyName, writeRank);
      if (!carrier.deletedProperties.has(propertyName)) {
        carrier.deletedProperties.add(propertyName);
        changed = true;
      }
    }
    replaceCarrierExactPositionalLengths(carrier, new Set([length]));
    replaceCarrierPositionalLengths(carrier, new Set([length]));
    if (length <= maximumTrackedInvocationArguments) {
      replaceCarrierPositionalOverflow(carrier, undefined, new Set());
    } else if (carrier.positionalOverflowStart === undefined) {
      mergeCarrierPositionalOverflow(carrier, maximumTrackedInvocationArguments, new Set());
    }
    if (changed) notifyPropagationSubscribers(carrier);
  }

  function applyDeterministicPositionalLength(carrier, length, writeRank) {
    const outcome = positionalLengthWriteOutcome(carrier, length);
    if (outcome.success === true) {
      commitDeterministicPositionalLength(carrier, length, writeRank);
    } else if (outcome.success === false && outcome.finalLength !== undefined) {
      commitDeterministicPositionalLength(carrier, outcome.finalLength, writeRank);
    } else if (outcome.success === undefined) {
      recordPossiblePositionalLengthTruncation(carrier, length, writeRank);
      mergeCarrierPositionalState(
        carrier,
        new Set([Math.min(length, maximumTrackedInvocationArguments)]),
        length > maximumTrackedInvocationArguments,
        new Set()
      );
    }
    return outcome.success;
  }

  function deterministicPositionalLengthAlreadyApplied(carrier, length) {
    const node = activePropagationOperation?.node ?? activeAnalysisNode;
    const state = activeFunctionInvocationState();
    const applications = state ? (state.positionalLengthApplications ??= new WeakMap()) : positionalLengthApplications;
    let carriers = applications.get(node);
    if (!carriers) {
      carriers = new WeakMap();
      applications.set(node, carriers);
    }
    let lengths = carriers.get(carrier);
    if (!lengths) {
      lengths = new Set();
      carriers.set(carrier, lengths);
    }
    if (lengths.has(length)) return true;
    lengths.add(length);
    return false;
  }

  function recordPossiblePositionalLengthTruncation(carrier, minimumLength, writeRank) {
    if (writeRank && carrier.positionalLengthWriteRank && rankPrecedes(writeRank, carrier.positionalLengthWriteRank)) {
      return;
    }
    if (writeRank) carrier.positionalLengthWriteRank = writeRank;
    const propertyNames = new Set([...carrier.properties.keys(), ...carrier.accessors.keys()]);
    for (const index of carrier.overflowPositionalOwnProperties) propertyNames.add(String(index));
    let changed = false;
    for (const propertyName of propertyNames) {
      if (!/^(0|[1-9]\d*)$/.test(propertyName) || Number(propertyName) < minimumLength) continue;
      const previousWriteRank = carrier.propertyWriteRanks.get(propertyName);
      if (writeRank && previousWriteRank && rankPrecedes(writeRank, previousWriteRank)) continue;
      if (writeRank) carrier.propertyWriteRanks.set(propertyName, writeRank);
      if (!carrier.deletedProperties.has(propertyName)) {
        carrier.deletedProperties.add(propertyName);
        changed = true;
      }
    }
    if (changed) notifyPropagationSubscribers(carrier);
  }

  function invalidatePositionalTargets(
    targetValue,
    propertyNames,
    additionalValues = new Set(),
    forceKnownIndices = false,
    strong = false
  ) {
    if (!propertyNamesAffectPositionalLayout(propertyNames)) return;
    for (const atom of targetValue) {
      if (typeof atom !== 'string' && atom.kind === 'carrier') {
        const knownIndices =
          propertyNames !== undefined && propertyNames.every(propertyName => /^(0|[1-9]\d*)$/.test(propertyName));
        if (knownIndices && !forceKnownIndices) continue;
        if (propertyNames?.length === 1 && propertyNames[0] === 'length') {
          const lengths = positionalLengthValues(additionalValues);
          if (lengths) {
            if (strong && lengths.size === 1 && targetValue.size === 1 && activeAlternativeMutationDepth === 0) {
              const length = [...lengths][0];
              if (deterministicPositionalLengthAlreadyApplied(atom, length)) continue;
              applyDeterministicPositionalLength(
                atom,
                length,
                deterministicWriteRank(activePropagationOperation?.node ?? activeAnalysisNode)
              );
              continue;
            }
            recordPossiblePositionalLengthTruncation(
              atom,
              Math.min(...lengths),
              uncertainWriteRank(activePropagationOperation?.node ?? activeAnalysisNode)
            );
            mergeCarrierExactPositionalLengths(atom, lengths);
            mergeCarrierPositionalState(
              atom,
              new Set([...lengths].map(length => Math.min(length, maximumTrackedInvocationArguments))),
              [...lengths].some(length => length > maximumTrackedInvocationArguments),
              new Set()
            );
            continue;
          }
          recordPossiblePositionalLengthTruncation(
            atom,
            0,
            uncertainWriteRank(activePropagationOperation?.node ?? activeAnalysisNode)
          );
        }
        invalidateCarrierPositionalLayout(atom, retainReflectiveCallableProvenance(additionalValues));
      } else if (typeof atom === 'string') {
        invalidateBuiltinPrototypeLayout(atom, propertyNames, additionalValues);
      }
    }
  }

  function prototypeOverflowPositionalValues(value) {
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
        if (/^(0|[1-9]\d*)$/.test(propertyName) && Number(propertyName) >= maximumTrackedInvocationArguments) {
          mergeValue(result, propertyValue);
        }
      }
      if (target.positional) {
        mergeValue(result, target.uncertainPositionalValues);
        mergeValue(result, target.overflowPositionalValues);
      }
      mergeValue(result, target.unknownProperty);
      if (
        target.unknownAccessors.get.size > 0 ||
        target.unknownAccessors.set.size > 0 ||
        [...target.accessors].some(
          ([propertyName]) =>
            /^(0|[1-9]\d*)$/.test(propertyName) && Number(propertyName) >= maximumTrackedInvocationArguments
        )
      ) {
        result.add(unknownReflectiveCallableAtom);
      }
      for (const prototype of effectivePrototypes(atom)) pending.push(prototype);
    }
    return result;
  }

  function carrierOverflowMayHaveHoles(carrier) {
    if (carrier.positionalOverflowStart === undefined) return false;
    if (carrier.positionalUncertain || carrier.unknownPropertyDeletion) return true;
    if (carrier.exactPositionalLengths.size === 0) return true;
    for (const length of carrier.exactPositionalLengths) {
      const trackedEnd = Math.min(length, maximumTrackedInvocationArguments * 2);
      for (let index = carrier.positionalOverflowStart; index < trackedEnd; index += 1) {
        if (!carrier.overflowPositionalOwnProperties.has(index) || carrier.deletedProperties.has(String(index))) {
          return true;
        }
      }
      if (length > trackedEnd) return true;
    }
    return false;
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
    for (const atom of targetValue) {
      if (typeof atom !== 'string' && atom.kind === 'carrier') {
        mergeCarrierPrototypes(atom, trackedPrototypeValue);
      } else if (typeof atom === 'string') {
        const state = builtinPrototypeState(atom);
        if (!state) continue;
        mergeCarrierPrototypes(state, trackedPrototypeValue);
      }
    }
  }

  function preventCarrierExtensions(targetValue, invocationNode) {
    for (const atom of targetValue) {
      if (typeof atom === 'string' || atom.kind !== 'carrier') continue;
      const extensible =
        activeAlternativeMutationDepth === 0 && deterministicWriteRank(invocationNode) !== undefined
          ? false
          : undefined;
      if (atom.extensible === false || atom.extensible === extensible) continue;
      atom.extensible = extensible;
      notifyPropagationSubscribers(atom);
    }
  }

  function applyCarrierIntegrityLevel(targetValue, invocationNode, frozen) {
    const deterministic = activeAlternativeMutationDepth === 0 && deterministicWriteRank(invocationNode) !== undefined;
    for (const atom of targetValue) {
      if (typeof atom === 'string' || atom.kind !== 'carrier') continue;
      let changed = false;
      const extensible = deterministic ? false : undefined;
      if (atom.extensible !== false && atom.extensible !== extensible) {
        atom.extensible = extensible;
        changed = true;
      }
      const configurability = deterministic ? false : undefined;
      if (atom.integrityConfigurability !== false && atom.integrityConfigurability !== configurability) {
        atom.integrityConfigurability = configurability;
        changed = true;
      }
      if (frozen) {
        const writability = deterministic ? false : undefined;
        if (atom.integrityWritability !== false && atom.integrityWritability !== writability) {
          atom.integrityWritability = writability;
          changed = true;
        }
      }
      if (
        changed &&
        (atom.unknownProperty.size > 0 ||
          atom.unknownAccessors.get.size > 0 ||
          atom.unknownAccessors.set.size > 0 ||
          [...atom.prototypes].some(prototype => typeof prototype !== 'string') ||
          [...atom.properties].some(
            ([propertyName, value]) => /^(0|[1-9]\d*)$/.test(propertyName) && hasUnsafePositionalValue(value)
          ) ||
          hasUnsafePositionalValue(atom.uncertainPositionalValues) ||
          hasUnsafePositionalValue(atom.overflowPositionalValues))
      ) {
        notifyPropagationSubscribers(atom);
      }
    }
  }

  function applyObjectAssign(targetValue, sourceValues, writeNode) {
    let earlierSourceMayAbort = false;
    for (const sourceValue of sourceValues) {
      const alternativeSource = sourceValue.size !== 1;
      let everySourceAborts = sourceValue.size > 0;
      for (const source of sourceValue) {
        const conditionalSource = earlierSourceMayAbort || alternativeSource;
        if (conditionalSource) activeAlternativeMutationDepth += 1;
        if (typeof source !== 'string' && source.kind === 'unknown-value') {
          invalidatePositionalTargets(targetValue, undefined, unknownValue());
          setCarrierPrototypes(targetValue, unknownValue(), true);
          recordTargetProperty(targetValue, undefined, unknownReflectiveCallableValue());
          if (conditionalSource) activeAlternativeMutationDepth -= 1;
          everySourceAborts = false;
          earlierSourceMayAbort = true;
          continue;
        }
        if (typeof source === 'string' || source.kind !== 'carrier') {
          if (conditionalSource) activeAlternativeMutationDepth -= 1;
          everySourceAborts = false;
          continue;
        }
        trackPropagationDependency(source);
        let sourceAborted = false;
        let sourceMayAbort =
          source.unknownSpreadSource || source.unknownProperty.size > 0 || source.unknownAccessors.get.size > 0;
        for (const propertyName of ownPropertyNamesInRuntimeOrder(source)) {
          const propertyNames = [propertyName];
          const invokesSourceGetter = accessorMayRun(new Set([source]), propertyNames, 'get');
          const propertyValue = observedPropertyValue(new Set([source]), propertyNames);
          let propertyFailure = reflectivePropertyWriteFailureIsProven(targetValue, propertyNames, targetValue, false);
          let propertySuccess = reflectivePropertyWriteSuccessIsProven(targetValue, propertyNames, targetValue, false);
          let propertyOwnState;
          if (targetValue.size === 1) {
            const target = [...targetValue][0];
            if (typeof target !== 'string' && target.kind === 'carrier') {
              propertyOwnState = indexedOwnDataPropertyState(target, propertyName);
              if (propertyName === 'length' && target.positional) {
                const lengths = positionalLengthValues(propertyValue);
                propertyFailure =
                  lengths !== undefined &&
                  [...lengths].every(length => positionalLengthWriteOutcome(target, length).success === false);
                propertySuccess = reflectiveArrayLengthWriteOutcome(
                  targetValue,
                  propertyNames,
                  targetValue,
                  propertyValue
                );
              }
            }
          }
          if (propertyFailure) {
            if (propertyName === 'length') {
              invalidatePositionalTargets(targetValue, propertyNames, propertyValue, false, true);
            }
            sourceAborted = true;
            break;
          }
          const invokesTargetSetter = accessorMayRun(targetValue, propertyNames, 'set');
          const propertyMayAbort = propertySuccess !== true || invokesSourceGetter || invokesTargetSetter;
          const conditionalProperty = sourceMayAbort || propertyMayAbort;
          if (conditionalProperty) activeAlternativeMutationDepth += 1;
          if (invokesTargetSetter) invalidatePositionalTargets(targetValue, undefined, unknownValue());
          invalidatePositionalTargets(targetValue, propertyNames, propertyValue, false, !invokesTargetSetter);
          if (propertyName === '__proto__' && invokesTargetSetter) {
            setCarrierPrototypes(targetValue, propertyValue, true);
          } else {
            recordTargetProperty(targetValue, propertyNames, propertyValue, writeNode, !invokesTargetSetter);
          }
          if ((conditionalSource || sourceMayAbort || propertyMayAbort) && propertyOwnState?.mayBeMissing) {
            recordTargetDeletion(targetValue, propertyNames);
          }
          if (conditionalProperty) activeAlternativeMutationDepth -= 1;
          if (propertyMayAbort) sourceMayAbort = true;
        }
        if (source.unknownProperty.size > 0 || source.unknownAccessors.get.size > 0) {
          if (sourceAborted) activeAlternativeMutationDepth += 1;
          const unknownAssignedValue = new Set(source.unknownProperty);
          if (unknownAssignedValue.size === 0) unknownAssignedValue.add(unknownValueAtom);
          invalidateAccessorReceiver(new Set([source]), undefined, 'get', new Set([source]));
          invalidateAccessorReceiver(targetValue, undefined, 'set', targetValue);
          invalidatePositionalTargets(targetValue, undefined, unknownAssignedValue);
          setCarrierPrototypes(targetValue, unknownValue(), true);
          recordTargetProperty(targetValue, undefined, unknownAssignedValue);
          if (sourceAborted) activeAlternativeMutationDepth -= 1;
          sourceMayAbort = true;
        }
        if (conditionalSource) activeAlternativeMutationDepth -= 1;
        if (!sourceAborted) everySourceAborts = false;
        if (sourceAborted || sourceMayAbort) earlierSourceMayAbort = true;
      }
      if (everySourceAborts) return;
    }
  }

  function descriptorConversionMayAbort(descriptorValue) {
    if (descriptorValue.size !== 1) return true;
    for (const atom of descriptorValue) {
      if (typeof atom === 'string' || atom.kind !== 'carrier') return true;
      if (
        atom.unknownSpreadSource ||
        atom.unknownProperty.size > 0 ||
        atom.unknownPropertyDeletion ||
        atom.unknownAccessors.get.size > 0
      ) {
        return true;
      }
    }
    const descriptorFields = ['configurable', 'enumerable', 'get', 'set', 'value', 'writable'];
    if (descriptorFields.some(field => accessorMayRun(descriptorValue, [field], 'get'))) return true;
    const hasAccessorField = ['get', 'set'].some(field => descriptorFieldState(descriptorValue, field).values.size > 0);
    const hasDataField = ['value', 'writable'].some(
      field => descriptorFieldState(descriptorValue, field).values.size > 0
    );
    return hasAccessorField && hasDataField;
  }

  function definePropertiesOnTarget(targetValue, descriptorsValue, writeNode) {
    const descriptorAlternatives = [...descriptorsValue];
    const alternativeDescriptors = descriptorAlternatives.length !== 1;
    for (const descriptors of descriptorAlternatives) {
      if (alternativeDescriptors) activeAlternativeMutationDepth += 1;
      if (typeof descriptors === 'string' || descriptors.kind === 'unknown-value') {
        invalidatePositionalTargets(targetValue, undefined, unknownReflectiveCallableValue());
        recordTargetProperty(targetValue, undefined, unknownReflectiveCallableValue());
        recordTargetAccessor(targetValue, undefined, 'get', unknownReflectiveCallableValue());
        recordTargetAccessor(targetValue, undefined, 'set', unknownReflectiveCallableValue());
        if (alternativeDescriptors) activeAlternativeMutationDepth -= 1;
        continue;
      }
      if (descriptors.kind !== 'carrier') {
        if (alternativeDescriptors) activeAlternativeMutationDepth -= 1;
        continue;
      }
      trackPropagationDependency(descriptors);
      const descriptorsInOrder = ownPropertyNamesInRuntimeOrder(descriptors).map(propertyName => {
        const propertyNames = [propertyName];
        const invokesDescriptorMapGetter = accessorMayRun(new Set([descriptors]), propertyNames, 'get');
        const descriptorValue = observedPropertyValue(new Set([descriptors]), propertyNames);
        return [propertyName, descriptorValue, invokesDescriptorMapGetter];
      });
      let descriptorAborted = false;
      let descriptorMayAbort =
        descriptors.unknownSpreadSource ||
        descriptors.unknownProperty.size > 0 ||
        descriptors.unknownAccessors.get.size > 0 ||
        descriptorsInOrder.some(
          ([, descriptorValue, invokesDescriptorMapGetter]) =>
            invokesDescriptorMapGetter || descriptorConversionMayAbort(descriptorValue)
        );
      for (const [propertyName, descriptorValue] of descriptorsInOrder) {
        const propertyNames = [propertyName];
        const dataValue = descriptorFieldValues(descriptorValue, 'value');
        const assignedValue = new Set(
          ['get', 'set', 'value'].flatMap(field => [...descriptorFieldValues(descriptorValue, field)])
        );
        const accessorDescriptor = ['get', 'set'].some(
          field => descriptorFieldState(descriptorValue, field).values.size > 0
        );
        const accessorDescriptorIsDefinite = ['get', 'set'].some(field => {
          const state = descriptorFieldState(descriptorValue, field);
          return !state.mayBeAbsent && state.values.size > 0;
        });
        let propertyFailure = reflectivePropertyWriteFailureIsProven(
          targetValue,
          propertyNames,
          targetValue,
          true,
          descriptorValue
        );
        let propertySuccess = reflectivePropertyWriteSuccessIsProven(
          targetValue,
          propertyNames,
          targetValue,
          true,
          descriptorValue
        );
        let propertyOwnState;
        if (targetValue.size === 1) {
          const target = [...targetValue][0];
          if (typeof target !== 'string' && target.kind === 'carrier') {
            propertyOwnState = indexedOwnDataPropertyState(target, propertyName);
            if (propertyName === 'length' && target.positional) {
              const lengths = positionalLengthValues(dataValue);
              propertyFailure =
                accessorDescriptorIsDefinite ||
                (lengths !== undefined &&
                  [...lengths].every(length => positionalLengthWriteOutcome(target, length).success === false));
              propertySuccess = reflectiveArrayLengthWriteOutcome(
                targetValue,
                propertyNames,
                targetValue,
                dataValue,
                descriptorValue
              );
            }
          }
        }
        if (propertyFailure) {
          if (propertyName === 'length') {
            invalidatePositionalTargets(targetValue, propertyNames, dataValue, false, true);
            recordTargetDataDescriptor(targetValue, propertyNames, descriptorValue, writeNode, true);
          }
          descriptorAborted = true;
          break;
        }
        const propertyMayAbort = propertySuccess !== true;
        const conditionalProperty = descriptorMayAbort || propertyMayAbort;
        if (conditionalProperty) activeAlternativeMutationDepth += 1;
        if (accessorDescriptor) {
          invalidatePositionalTargets(targetValue, propertyNames, assignedValue, true, true);
          recordDescriptorAccessors(targetValue, propertyNames, descriptorValue, writeNode, propertySuccess === true);
        } else {
          if (dataValue.size > 0) {
            invalidatePositionalTargets(targetValue, propertyNames, dataValue, false, true);
          }
          recordTargetDataDescriptor(targetValue, propertyNames, descriptorValue, writeNode, true);
        }
        if ((alternativeDescriptors || descriptorMayAbort || propertyMayAbort) && propertyOwnState?.mayBeMissing) {
          recordTargetDeletion(targetValue, propertyNames);
        }
        if (conditionalProperty) activeAlternativeMutationDepth -= 1;
        if (propertyMayAbort) descriptorMayAbort = true;
      }
      if (
        descriptors.unknownProperty.size > 0 ||
        descriptors.unknownAccessors.get.size > 0 ||
        descriptors.unknownAccessors.set.size > 0 ||
        descriptors.unknownSpreadSource
      ) {
        if (descriptorAborted) activeAlternativeMutationDepth += 1;
        invalidateAccessorReceiver(new Set([descriptors]), undefined, 'get', new Set([descriptors]));
        invalidatePositionalTargets(targetValue, undefined, unknownReflectiveCallableValue());
        recordTargetProperty(targetValue, undefined, unknownReflectiveCallableValue());
        recordTargetAccessor(targetValue, undefined, 'get', unknownReflectiveCallableValue());
        recordTargetAccessor(targetValue, undefined, 'set', unknownReflectiveCallableValue());
        if (descriptorAborted) activeAlternativeMutationDepth -= 1;
      }
      if (alternativeDescriptors) activeAlternativeMutationDepth -= 1;
    }
  }

  function singleIntegerArgument(value, fallback) {
    if (!value) return fallback;
    if (value.size !== 1) return undefined;
    const atom = [...value][0];
    if (
      typeof atom === 'string' ||
      atom.kind !== 'literal' ||
      atom.valueType !== 'number' ||
      !Number.isFinite(atom.value)
    ) {
      return undefined;
    }
    return Math.trunc(atom.value);
  }

  function normalizedPositionalIndex(index, length) {
    return Math.min(index < 0 ? Math.max(length + index, 0) : index, length);
  }

  function singleNormalizedPositionalIndexArgument(value, fallback, length) {
    if (!value) return normalizedPositionalIndex(fallback, length);
    let normalizedIndex;
    for (const atom of value) {
      if (
        typeof atom === 'string' ||
        atom.kind !== 'literal' ||
        atom.valueType !== 'number' ||
        !Number.isFinite(atom.value)
      ) {
        return undefined;
      }
      const candidate = normalizedPositionalIndex(Math.trunc(atom.value), length);
      if (normalizedIndex !== undefined && candidate !== normalizedIndex) return undefined;
      normalizedIndex = candidate;
    }
    return normalizedIndex;
  }

  function hasExactMutationArguments(invocationNode, method) {
    const callee = unwrapExpression(invocationNode.expression);
    if (!ts.isPropertyAccessExpression(callee) && !ts.isElementAccessExpression(callee)) {
      return activeAlternativeMutationDepth === 0;
    }
    const propertyNames = memberPropertyNames(callee);
    const directExactArguments =
      propertyNames?.length === 1 &&
      propertyNames[0] === method &&
      ![...invocationNode.arguments].some(ts.isSpreadElement);
    return directExactArguments || activeAlternativeMutationDepth === 0;
  }

  function transformedExactPositionalLengths(method, argumentValues, invocationNode, exactLengths) {
    if (exactLengths.size === 0 || method === 'sort') return undefined;
    if (
      ['copyWithin', 'fill', 'pop', 'reverse', 'shift'].includes(method) ||
      hasExactMutationArguments(invocationNode, method)
    ) {
      const transformedLengths = new Set();
      for (const length of exactLengths) {
        if (method === 'push' || method === 'unshift') {
          transformedLengths.add(length + argumentValues.length);
          continue;
        }
        if (method === 'pop' || method === 'shift') {
          transformedLengths.add(Math.max(0, length - 1));
          continue;
        }
        if (method === 'splice') {
          const start = singleNormalizedPositionalIndexArgument(argumentValues[0], 0, length);
          if (start === undefined) return undefined;
          const requestedDeleteCount = singleIntegerArgument(
            argumentValues[1],
            argumentValues.length < 2 ? length - start : undefined
          );
          if (requestedDeleteCount === undefined) return undefined;
          const deleteCount = Math.min(Math.max(0, requestedDeleteCount), length - start);
          transformedLengths.add(length - deleteCount + argumentValues.slice(2).length);
          continue;
        }
        transformedLengths.add(length);
      }
      return transformedLengths;
    }
    return undefined;
  }

  function transformPositionalLayout(method, layout, argumentValues) {
    const transformed = [...layout];
    if (method === 'push') return [...transformed, ...argumentValues];
    if (method === 'unshift') return [...argumentValues, ...transformed];
    if (method === 'pop') return transformed.slice(0, -1);
    if (method === 'shift') return transformed.slice(1);
    if (method === 'reverse') return transformed.reverse();
    if (method === 'sort') return undefined;
    if (method === 'fill') {
      const start = singleNormalizedPositionalIndexArgument(argumentValues[1], 0, transformed.length);
      const end = singleNormalizedPositionalIndexArgument(argumentValues[2], transformed.length, transformed.length);
      if (start === undefined || end === undefined) return undefined;
      transformed.fill(argumentValues[0] ?? literalValue(undefined), start, end);
      return transformed;
    }
    if (method === 'copyWithin') {
      const target = singleNormalizedPositionalIndexArgument(argumentValues[0], 0, transformed.length);
      const start = singleNormalizedPositionalIndexArgument(argumentValues[1], 0, transformed.length);
      const end = singleNormalizedPositionalIndexArgument(argumentValues[2], transformed.length, transformed.length);
      if (target === undefined || start === undefined || end === undefined) return undefined;
      transformed.copyWithin(target, start, end);
      return transformed;
    }
    if (method === 'splice') {
      const start = singleNormalizedPositionalIndexArgument(argumentValues[0], 0, transformed.length);
      if (start === undefined) return undefined;
      const deleteCount = singleIntegerArgument(
        argumentValues[1],
        argumentValues.length < 2 ? transformed.length - start : undefined
      );
      if (deleteCount === undefined) return undefined;
      transformed.splice(start, Math.max(0, deleteCount), ...argumentValues.slice(2));
      return transformed;
    }
    return undefined;
  }

  function overflowPositionValue(expansion, includeExistingValue) {
    const result = new Set(expansion.overflowPositionalValues);
    if (includeExistingValue) mergeValue(result, includeExistingValue);
    if (result.size === 0 || hasUnsafePositionalValue(result)) {
      mergeValue(result, unknownReflectiveCallableValue());
    }
    return result;
  }

  function positionalRangeValues(expansion, layout, start, end) {
    const result = new Set();
    const trackedEnd = Math.min(expansion.positionalOverflowStart, layout.length);
    for (let index = Math.max(0, start); index < Math.min(end, trackedEnd); index += 1) {
      mergeValue(result, layout[index]);
    }
    if (end > trackedEnd && start < Math.max(...expansion.exactPositionalLengths)) {
      mergeValue(result, expansion.overflowPositionalValues);
    }
    return result;
  }

  function indexedPropertyValueForMutation(receiver, index) {
    const propertyName = String(index);
    if (!receiver.deletedProperties.has(propertyName)) {
      const ownValue =
        index < maximumTrackedInvocationArguments
          ? receiver.properties.get(propertyName)
          : receiver.overflowPositionalProperties.get(index);
      if (ownValue && ownValue.size > 0) {
        const result = new Set(ownValue);
        if (index >= maximumTrackedInvocationArguments && receiver.overflowPositionalPropertiesUncertain) {
          mergeValue(result, receiver.overflowPositionalValues);
        }
        if (
          index >= maximumTrackedInvocationArguments &&
          (result.has(origins.builtinEval) || result.has(origins.lodashTemplate) || hasUnsafePositionalValue(result))
        ) {
          mergeValue(result, unknownReflectiveCallableValue());
        }
        return result;
      }
      if (index >= maximumTrackedInvocationArguments && receiver.overflowPositionalOwnProperties.has(index)) {
        return new Set(receiver.overflowPositionalValues);
      }
    }
    return prototypePropertyValues(effectivePrototypes(receiver), [propertyName], new Set([receiver]));
  }

  function transformedOverflowProperties(method, argumentValues, invocationNode, receiver, exactLength) {
    let newLength = exactLength;
    let positionalSource;

    if (method === 'fill') {
      const start = singleNormalizedPositionalIndexArgument(argumentValues[1], 0, exactLength);
      const end = singleNormalizedPositionalIndexArgument(argumentValues[2], exactLength, exactLength);
      if (start === undefined || end === undefined) return undefined;
      positionalSource = index =>
        index >= start && index < end ? (argumentValues[0] ?? literalValue(undefined)) : index;
    } else if (method === 'copyWithin') {
      const target = singleNormalizedPositionalIndexArgument(argumentValues[0], 0, exactLength);
      const start = singleNormalizedPositionalIndexArgument(argumentValues[1], 0, exactLength);
      const end = singleNormalizedPositionalIndexArgument(argumentValues[2], exactLength, exactLength);
      if (target === undefined || start === undefined || end === undefined) return undefined;
      const requestedCount = Math.min(Math.max(0, end - start), exactLength - target);
      positionalSource = index => (index >= target && index < target + requestedCount ? start + index - target : index);
    } else if (method === 'reverse') {
      positionalSource = index => exactLength - index - 1;
    } else if (['pop', 'push', 'shift', 'splice', 'unshift'].includes(method)) {
      if (['push', 'splice', 'unshift'].includes(method) && !hasExactMutationArguments(invocationNode, method)) {
        return undefined;
      }
      const spliceArguments =
        method === 'push'
          ? [literalValue(exactLength), literalValue(0), ...argumentValues]
          : method === 'unshift'
            ? [literalValue(0), literalValue(0), ...argumentValues]
            : method === 'pop'
              ? [literalValue(-1), literalValue(1)]
              : method === 'shift'
                ? [literalValue(0), literalValue(1)]
                : argumentValues;
      const start = singleNormalizedPositionalIndexArgument(spliceArguments[0], 0, exactLength);
      if (start === undefined) return undefined;
      const requestedDeleteCount = singleIntegerArgument(
        spliceArguments[1],
        spliceArguments.length < 2 ? exactLength - start : undefined
      );
      if (requestedDeleteCount === undefined) return undefined;
      const deleteCount = Math.min(Math.max(0, requestedDeleteCount), exactLength - start);
      const insertedLength = spliceArguments.slice(2).length;
      newLength = exactLength - deleteCount + insertedLength;
      positionalSource = index => {
        if (index < start) return index;
        if (index < start + insertedLength) return spliceArguments[index - start + 2];
        return index - insertedLength + deleteCount;
      };
    } else {
      return undefined;
    }

    const result = new Map();
    const trackedEnd = Math.min(newLength, maximumTrackedInvocationArguments * 2);
    for (let index = maximumTrackedInvocationArguments; index < trackedEnd; index += 1) {
      const source = positionalSource(index);
      const value = typeof source === 'number' ? indexedPropertyValueForMutation(receiver, source) : new Set(source);
      if (value.size > 0) result.set(index, value);
    }
    return result;
  }

  function applyKnownOverflowPositionalMutation(method, argumentValues, receiver, invocationNode, expansion, strong) {
    if (
      expansion.positionalOverflowStart === undefined ||
      expansion.uncertainPositioning ||
      expansion.layouts.length !== 1 ||
      expansion.exactPositionalLengths.size !== 1
    ) {
      return false;
    }
    const layout = expansion.layouts[0];
    const exactLength = [...expansion.exactPositionalLengths][0];
    const overflowProperties = strong
      ? transformedOverflowProperties(method, argumentValues, invocationNode, receiver, exactLength)
      : undefined;
    const trackedEnd = Math.min(expansion.positionalOverflowStart, layout.length);
    const writeRank = deterministicWriteRank(invocationNode);
    const replacePosition = (index, value) => {
      putCarrierProperty(receiver, [String(index)], value, writeRank, strong);
    };
    const mergeOverflowWrites = values => {
      mergeCarrierPositionalOverflow(receiver, expansion.positionalOverflowStart, values);
    };
    const updateOverflow = (values, replacesEveryOverflowPosition) => {
      if (strong && replacesEveryOverflowPosition) {
        replaceCarrierPositionalOverflow(receiver, expansion.positionalOverflowStart, values);
      } else {
        mergeOverflowWrites(values);
      }
    };

    if (method === 'fill') {
      const start = singleNormalizedPositionalIndexArgument(argumentValues[1], 0, exactLength);
      const end = singleNormalizedPositionalIndexArgument(argumentValues[2], exactLength, exactLength);
      if (start === undefined || end === undefined) return false;
      const boundedStart = Math.min(start, trackedEnd);
      const boundedEnd = Math.min(Math.max(end, boundedStart), trackedEnd);
      for (let index = boundedStart; index < boundedEnd; index += 1) {
        replacePosition(index, argumentValues[0] ?? literalValue(undefined));
      }
      if (end > start && end > expansion.positionalOverflowStart) {
        updateOverflow(
          argumentValues[0] ?? literalValue(undefined),
          start <= expansion.positionalOverflowStart && end >= exactLength
        );
      }
      finalizeOverflowPropertyMutation(receiver, overflowProperties);
      return true;
    }

    if (method === 'copyWithin') {
      const target = singleNormalizedPositionalIndexArgument(argumentValues[0], 0, exactLength);
      const start = singleNormalizedPositionalIndexArgument(argumentValues[1], 0, exactLength);
      const end = singleNormalizedPositionalIndexArgument(argumentValues[2], exactLength, exactLength);
      if (target === undefined || start === undefined || end === undefined) return false;
      const requestedCount = Math.min(Math.max(0, end - start), exactLength - target);
      const destinationEnd = target + requestedCount;
      const trackedDestinationEnd = Math.min(trackedEnd, destinationEnd);
      for (let index = Math.min(target, trackedEnd); index < trackedDestinationEnd; index += 1) {
        const sourceIndex = start + index - target;
        const copiedValue =
          sourceIndex < trackedEnd ? layout[sourceIndex] : indexedPropertyValueForMutation(receiver, sourceIndex);
        replacePosition(index, copiedValue);
      }
      if (destinationEnd > expansion.positionalOverflowStart) {
        const overflowDestinationStart = Math.max(target, expansion.positionalOverflowStart);
        const overflowSourceStart = start + overflowDestinationStart - target;
        const overflowSourceEnd = start + destinationEnd - target;
        const overflowWrites = positionalRangeValues(expansion, layout, overflowSourceStart, overflowSourceEnd);
        updateOverflow(overflowWrites, target <= expansion.positionalOverflowStart && destinationEnd >= exactLength);
      }
      finalizeOverflowPropertyMutation(receiver, overflowProperties);
      return true;
    }

    if (method === 'reverse') {
      for (let index = 0; index < trackedEnd; index += 1) {
        const sourceIndex = exactLength - index - 1;
        replacePosition(
          index,
          sourceIndex < trackedEnd ? layout[sourceIndex] : indexedPropertyValueForMutation(receiver, sourceIndex)
        );
      }
      updateOverflow(
        positionalRangeValues(expansion, layout, 0, exactLength - expansion.positionalOverflowStart),
        true
      );
      finalizeOverflowPropertyMutation(receiver, overflowProperties);
      return true;
    }

    if (['pop', 'push', 'shift', 'splice', 'unshift'].includes(method)) {
      if (['push', 'splice', 'unshift'].includes(method) && !hasExactMutationArguments(invocationNode, method)) {
        return false;
      }
      const spliceArguments =
        method === 'push'
          ? [literalValue(exactLength), literalValue(0), ...argumentValues]
          : method === 'unshift'
            ? [literalValue(0), literalValue(0), ...argumentValues]
            : method === 'pop'
              ? [literalValue(-1), literalValue(1)]
              : method === 'shift'
                ? [literalValue(0), literalValue(1)]
                : argumentValues;
      const start = singleNormalizedPositionalIndexArgument(spliceArguments[0], 0, exactLength);
      if (start === undefined) return false;
      const requestedDeleteCount = singleIntegerArgument(
        spliceArguments[1],
        spliceArguments.length < 2 ? exactLength - start : undefined
      );
      if (requestedDeleteCount === undefined) return false;
      const deleteCount = Math.min(Math.max(0, requestedDeleteCount), exactLength - start);
      const boundedStart = Math.min(start, trackedEnd);
      const insertedValues = spliceArguments.slice(2);
      const newLength = exactLength - deleteCount + insertedValues.length;
      for (let index = boundedStart; index < trackedEnd; index += 1) {
        if (index >= newLength) {
          replacePosition(index, new Set());
          continue;
        }
        const insertedIndex = index - start;
        if (insertedIndex >= 0 && insertedIndex < insertedValues.length) {
          replacePosition(index, insertedValues[insertedIndex]);
          continue;
        }
        const sourceIndex = index - insertedValues.length + deleteCount;
        const shiftedValue =
          sourceIndex >= exactLength
            ? new Set()
            : sourceIndex < trackedEnd
              ? layout[sourceIndex]
              : indexedPropertyValueForMutation(receiver, sourceIndex);
        replacePosition(index, shiftedValue);
      }
      const overflowWrites = new Set();
      if (newLength > expansion.positionalOverflowStart) {
        for (const [index, value] of insertedValues.entries()) {
          if (start + index >= expansion.positionalOverflowStart) mergeValue(overflowWrites, value);
        }
        if (start > expansion.positionalOverflowStart) {
          mergeValue(
            overflowWrites,
            positionalRangeValues(expansion, layout, expansion.positionalOverflowStart, start)
          );
        }
        const suffixStart = start + deleteCount;
        const overflowSuffixStart = Math.max(
          suffixStart,
          expansion.positionalOverflowStart + deleteCount - insertedValues.length
        );
        if (overflowSuffixStart < exactLength) {
          mergeValue(overflowWrites, positionalRangeValues(expansion, layout, overflowSuffixStart, exactLength));
        }
      }
      const lengths = new Set([newLength]);
      if (strong) {
        replaceCarrierExactPositionalLengths(receiver, lengths);
        replaceCarrierPositionalLengths(receiver, lengths);
        replaceCarrierPositionalOverflow(
          receiver,
          newLength > expansion.positionalOverflowStart ? expansion.positionalOverflowStart : undefined,
          overflowWrites
        );
      } else {
        mergeCarrierExactPositionalLengths(receiver, lengths);
        mergeCarrierPositionalState(receiver, lengths, false, new Set());
        mergeOverflowWrites(overflowWrites);
      }
      finalizeOverflowPropertyMutation(receiver, overflowProperties);
      return true;
    }

    return false;
  }

  function positionalMutationApplicationMap(invocationNode, method) {
    const state = activeFunctionInvocationState();
    const applications = state
      ? (state.positionalMutationApplications ??= new WeakMap())
      : positionalMutationApplications;
    let methods = applications.get(invocationNode);
    if (!methods) {
      methods = new Map();
      applications.set(invocationNode, methods);
    }
    let receiverApplications = methods.get(method);
    if (!receiverApplications) {
      receiverApplications = new WeakMap();
      methods.set(method, receiverApplications);
    }
    return receiverApplications;
  }

  function mutationArgumentsCovered(previousArguments, argumentValues) {
    return (
      previousArguments.length === argumentValues.length &&
      argumentValues.every((value, index) => [...value].every(atom => previousArguments[index].has(atom)))
    );
  }

  function positionalMutationAlreadyApplied(
    receiverApplications,
    receiver,
    argumentValues,
    expansion,
    mutationValues,
    strong
  ) {
    let application = receiverApplications.get(receiver);
    if (!application) {
      application = {
        arguments: [],
        preMutationValues: allPositionalValues(expansion),
        restoredPreMutationValues: false,
        saturated: false,
        strongApplied: false,
      };
      receiverApplications.set(receiver, application);
    }

    if (!strong && application.strongApplied && !application.restoredPreMutationValues) {
      invalidateCarrierPositionalLayout(receiver, retainReflectiveCallableProvenance(application.preMutationValues));
      application.restoredPreMutationValues = true;
    }
    if (application.saturated) return true;
    if (application.arguments.some(previous => mutationArgumentsCovered(previous, argumentValues))) {
      return true;
    }
    if (application.arguments.length >= maximumTrackedPositionalAlternatives) {
      const failClosedValues = new Set(application.preMutationValues);
      mergeValue(failClosedValues, mutationValues);
      mergeValue(failClosedValues, unknownReflectiveCallableValue());
      invalidateCarrierPositionalLayout(receiver, retainReflectiveCallableProvenance(failClosedValues));
      application.saturated = true;
      return true;
    }
    application.arguments.push(argumentValues.map(value => new Set(value)));
    if (strong) application.strongApplied = true;
    return false;
  }

  function applyKnownPositionalMutation(method, argumentValues, thisValue, invocationNode) {
    if (
      activeDormantInvocationDepth > 0 ||
      (!activeFunctionInvocationState() && enclosingFunctionNode(invocationNode))
    ) {
      return;
    }
    const mutationValues = new Set();
    for (const argumentValue of argumentValues) mergeValue(mutationValues, argumentValue);
    const writeRank = deterministicWriteRank(invocationNode);
    const strong = writeRank !== undefined && (thisValue?.size ?? 0) === 1 && activeAlternativeMutationDepth === 0;
    const receiverApplications = positionalMutationApplicationMap(invocationNode, method);
    for (const receiver of thisValue ?? []) {
      if (typeof receiver === 'string' || receiver.kind !== 'carrier' || !receiver.positional) continue;
      const expansion = positionalLayouts(new Set([receiver]));
      if (
        positionalMutationAlreadyApplied(
          receiverApplications,
          receiver,
          argumentValues,
          expansion,
          mutationValues,
          strong
        )
      ) {
        continue;
      }
      if (expansion.positionalOverflowStart !== undefined) {
        if (applyKnownOverflowPositionalMutation(method, argumentValues, receiver, invocationNode, expansion, strong)) {
          continue;
        }
        const overflowValues = allPositionalValues(expansion);
        for (const argumentValue of argumentValues) mergeValue(overflowValues, argumentValue);
        mergeValue(overflowValues, unknownReflectiveCallableValue());
        invalidateCarrierPositionalLayout(receiver, retainReflectiveCallableProvenance(overflowValues));
        mergeCarrierPositionalOverflow(receiver, expansion.positionalOverflowStart, overflowValues);
        continue;
      }
      if (expansion.uncertainPositioning || expansion.layouts.length === 0) {
        invalidateCarrierPositionalLayout(receiver, retainReflectiveCallableProvenance(mutationValues));
        continue;
      }
      const lengths = new Set();
      const exactLengths = transformedExactPositionalLengths(
        method,
        argumentValues,
        invocationNode,
        expansion.exactPositionalLengths
      );
      const overflowValues = new Set();
      const overflowOwnProperties = new Set();
      let overflowStart;
      let uncertain = false;
      for (const layout of expansion.layouts) {
        const transformed = transformPositionalLayout(method, layout, argumentValues);
        if (!transformed) {
          uncertain = true;
          for (const positionalValue of layout) mergeValue(overflowValues, positionalValue);
          mergeValue(overflowValues, unknownReflectiveCallableValue());
          continue;
        }
        const boundedLength = Math.min(transformed.length, maximumTrackedInvocationArguments);
        lengths.add(boundedLength);
        for (let index = 0; index < boundedLength; index += 1) {
          putCarrierProperty(receiver, [String(index)], transformed[index], writeRank, strong);
        }
        if (transformed.length > maximumTrackedInvocationArguments) {
          overflowStart = maximumTrackedInvocationArguments;
          for (const [offset, positionalValue] of transformed
            .slice(maximumTrackedInvocationArguments, maximumTrackedInvocationArguments * 2)
            .entries()) {
            mergeValue(overflowValues, positionalValue);
            if (positionalValue.size > 0) {
              overflowOwnProperties.add(maximumTrackedInvocationArguments + offset);
            }
          }
        }
      }
      if (strong) {
        replaceCarrierPositionalLengths(receiver, lengths);
        replaceCarrierExactPositionalLengths(receiver, exactLengths ?? new Set());
      } else {
        mergeCarrierPositionalState(receiver, lengths, uncertain, overflowValues);
        if (exactLengths) mergeCarrierExactPositionalLengths(receiver, exactLengths);
      }
      if (uncertain) invalidateCarrierPositionalLayout(receiver, overflowValues);
      mergeCarrierPositionalOverflow(receiver, overflowStart, overflowValues);
      if (strong) replaceCarrierOverflowOwnProperties(receiver, overflowOwnProperties);
    }
  }

  function applyPositionalMutationIntrinsic(atom, argumentValues, thisValue, invocationNode, intrinsicResult) {
    if (atom === origins.mapSet) {
      if (
        activeDormantInvocationDepth > 0 ||
        (!activeFunctionInvocationState() && enclosingFunctionNode(invocationNode))
      ) {
        return true;
      }
      const writeRank = deterministicWriteRank(invocationNode);
      const strong =
        activeAlternativeMutationDepth === 0 &&
        writeRank !== undefined &&
        (thisValue?.size ?? 0) === 1 &&
        propertyNamesFromValue(argumentValues[0] ?? new Set())?.length === 1;
      for (const receiver of thisValue ?? []) {
        if (typeof receiver !== 'string' && receiver.kind === 'carrier' && receiver.collectionKind === 'map') {
          putMapEntry(
            receiver,
            argumentValues[0] ?? unknownValue(),
            argumentValues[1] ?? unknownValue(),
            writeRank,
            strong
          );
        }
      }
      return true;
    }
    if (atom === origins.mapClear) {
      clearCollection(thisValue ?? new Set(), invocationNode, 'map');
      return true;
    }
    if (atom === origins.setAdd) {
      if (
        activeDormantInvocationDepth > 0 ||
        (!activeFunctionInvocationState() && enclosingFunctionNode(invocationNode))
      ) {
        return true;
      }
      for (const receiver of thisValue ?? []) {
        if (typeof receiver !== 'string' && receiver.kind === 'carrier' && receiver.collectionKind === 'set') {
          mergeCollectionValue(receiver, argumentValues[0] ?? unknownValue(), deterministicWriteRank(invocationNode));
        }
      }
      return true;
    }
    if (atom === origins.setClear) {
      clearCollection(thisValue ?? new Set(), invocationNode, 'set');
      return true;
    }
    if (atom === origins.objectAssign) {
      applyObjectAssign(argumentValues[0] ?? new Set(), argumentValues.slice(1), invocationNode);
      return true;
    }
    if (atom === origins.objectPreventExtensions || atom === origins.reflectPreventExtensions) {
      preventCarrierExtensions(argumentValues[0] ?? new Set(), invocationNode);
      if (atom === origins.reflectPreventExtensions && intrinsicResult) {
        mergeValue(intrinsicResult, literalValue(true));
      }
      return true;
    }
    if (atom === origins.objectSeal || atom === origins.objectFreeze) {
      applyCarrierIntegrityLevel(argumentValues[0] ?? new Set(), invocationNode, atom === origins.objectFreeze);
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
      const targetValue = argumentValues[0] ?? new Set();
      const propertyNames = propertyNamesFromValue(argumentValues[1] ?? new Set());
      const receiverValue = atom === origins.reflectSet && argumentValues.length > 3 ? argumentValues[3] : targetValue;
      const assignedValue =
        atom === origins.objectDefineProperty || atom === origins.reflectDefineProperty
          ? new Set(
              ['get', 'set', 'value'].flatMap(field => [
                ...descriptorFieldValues(argumentValues[2] ?? new Set(), field),
              ])
            )
          : (argumentValues[2] ?? new Set());
      const accessorDescriptor =
        atom === origins.objectDefineProperty || atom === origins.reflectDefineProperty
          ? ['get', 'set'].some(field => descriptorFieldValues(argumentValues[2] ?? new Set(), field).size > 0)
          : false;
      let reflectiveIndexedSuccess =
        atom === origins.objectDefineProperty || atom === origins.reflectDefineProperty || atom === origins.reflectSet
          ? reflectivePropertyWriteSuccessIsProven(
              targetValue,
              propertyNames,
              receiverValue ?? new Set(),
              atom === origins.objectDefineProperty || atom === origins.reflectDefineProperty,
              argumentValues[2] ?? new Set()
            )
          : undefined;
      if (
        (atom === origins.objectDefineProperty || atom === origins.reflectDefineProperty) &&
        reflectiveIndexedSuccess === undefined
      ) {
        reflectiveIndexedSuccess = reflectiveArrayLengthWriteOutcome(
          targetValue,
          propertyNames,
          targetValue,
          descriptorFieldValues(argumentValues[2] ?? new Set(), 'value'),
          argumentValues[2] ?? new Set()
        );
      }
      if (atom === origins.reflectSet && reflectiveIndexedSuccess === undefined) {
        reflectiveIndexedSuccess = reflectiveArrayLengthWriteOutcome(
          targetValue,
          propertyNames,
          receiverValue ?? new Set(),
          argumentValues[2] ?? new Set(),
          undefined
        );
      }
      const reflectiveIndexedFailure =
        atom === origins.objectDefineProperty || atom === origins.reflectDefineProperty || atom === origins.reflectSet
          ? reflectivePropertyWriteFailureIsProven(
              targetValue,
              propertyNames,
              receiverValue ?? new Set(),
              atom === origins.objectDefineProperty || atom === origins.reflectDefineProperty,
              argumentValues[2] ?? new Set()
            ) ||
            (propertyNames?.length === 1 && propertyNames[0] === 'length' && reflectiveIndexedSuccess === false)
          : false;
      if (reflectiveIndexedSuccess !== true && !reflectiveIndexedFailure) reflectiveIndexedSuccess = undefined;
      if (
        (atom === origins.reflectDefineProperty || atom === origins.reflectSet) &&
        intrinsicResult &&
        activeDormantInvocationDepth === 0 &&
        activeDormantPropagationDepth === 0
      ) {
        if (reflectiveIndexedSuccess === true) {
          mergeValue(intrinsicResult, literalValue(true));
        } else if (reflectiveIndexedFailure) {
          mergeValue(intrinsicResult, literalValue(false));
        } else {
          mergeValue(intrinsicResult, literalValue(true));
          mergeValue(intrinsicResult, literalValue(false));
        }
      }
      if (
        reflectiveIndexedFailure ||
        (accessorDescriptor &&
          reflectiveIndexedSuccess !== true &&
          propertyNames?.length === 1 &&
          arrayIndexPropertyValue(propertyNames[0]) !== undefined)
      ) {
        if (propertyNames?.length === 1 && propertyNames[0] === 'length') {
          invalidatePositionalTargets(receiverValue ?? new Set(), propertyNames, assignedValue, false, true);
          if (atom === origins.objectDefineProperty || atom === origins.reflectDefineProperty) {
            recordTargetDataDescriptor(
              targetValue,
              propertyNames,
              argumentValues[2] ?? new Set(),
              invocationNode,
              true
            );
          }
        } else {
          invalidatePositionalTargets(
            receiverValue ?? new Set(),
            propertyNames,
            unknownReflectiveCallableValue(),
            true
          );
        }
        return true;
      }
      const strongDataWrite =
        !accessorDescriptor && (atom === origins.objectDefineProperty || reflectiveIndexedSuccess === true);
      if (
        reflectiveIndexedSuccess === undefined &&
        propertyNames?.length === 1 &&
        arrayIndexPropertyValue(propertyNames[0]) !== undefined
      ) {
        invalidatePositionalTargets(receiverValue ?? new Set(), propertyNames, unknownReflectiveCallableValue(), true);
        for (const receiver of receiverValue ?? []) {
          if (typeof receiver === 'string' || receiver.kind !== 'carrier') continue;
          const ownState = indexedOwnDataPropertyState(receiver, propertyNames[0]);
          if (!ownState.mayBeMissing || receiver.deletedProperties.has(propertyNames[0])) continue;
          receiver.deletedProperties.add(propertyNames[0]);
          notifyPropagationSubscribers(receiver);
        }
      }
      const descriptorOnlyArrayLengthUpdate =
        (atom === origins.objectDefineProperty || atom === origins.reflectDefineProperty) &&
        propertyNames?.length === 1 &&
        propertyNames[0] === 'length' &&
        descriptorFieldState(argumentValues[2] ?? new Set(), 'value').mayBeAbsent &&
        descriptorFieldValues(argumentValues[2] ?? new Set(), 'value').size === 0;
      if (!descriptorOnlyArrayLengthUpdate) {
        invalidatePositionalTargets(targetValue, propertyNames, assignedValue, accessorDescriptor, strongDataWrite);
      }
      if (atom === origins.objectDefineProperty || atom === origins.reflectDefineProperty) {
        const descriptorValue = argumentValues[2] ?? new Set();
        recordDescriptorAccessors(
          targetValue,
          propertyNames,
          descriptorValue,
          invocationNode,
          reflectiveIndexedSuccess === true
        );
        if (!accessorDescriptor) {
          recordTargetDataDescriptor(targetValue, propertyNames, descriptorValue, invocationNode, strongDataWrite);
        }
      } else {
        const invokesSetter = accessorMayRun(targetValue, propertyNames, 'set');
        invalidatePositionalTargets(
          receiverValue ?? new Set(),
          propertyNames,
          assignedValue,
          false,
          strongDataWrite && !invokesSetter
        );
        if (invokesSetter) invalidatePositionalTargets(receiverValue ?? new Set(), undefined, unknownValue());
        if ((propertyNames === undefined || propertyNames.includes('__proto__')) && invokesSetter) {
          setCarrierPrototypes(receiverValue ?? new Set(), argumentValues[2] ?? new Set(), true);
        } else {
          let descriptorAttributes;
          if (strongDataWrite && receiverValue?.size === 1) {
            const receiver = [...receiverValue][0];
            if (typeof receiver !== 'string' && receiver.kind === 'carrier' && propertyNames?.length === 1) {
              descriptorAttributes = successfulIndexedSetAttributes(receiver, propertyNames[0]);
            }
          }
          recordTargetProperty(
            receiverValue ?? new Set(),
            propertyNames,
            assignedValue,
            invocationNode,
            strongDataWrite && !invokesSetter,
            descriptorAttributes
          );
        }
      }
      return true;
    }
    if (atom === origins.objectDefineProperties) {
      definePropertiesOnTarget(argumentValues[0] ?? new Set(), argumentValues[1] ?? new Set(), invocationNode);
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
      invalidatePositionalTargets(thisValue ?? new Set(), propertyNames, accessorValue, true);
      return true;
    }
    if (typeof atom !== 'string' && atom.kind === 'positional-mutator') {
      applyKnownPositionalMutation(atom.method, argumentValues, thisValue, invocationNode);
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
    if (propertyNames !== undefined) return;
    for (const atom of evaluateExpression(callee.expression)) {
      if (typeof atom !== 'string' && atom.kind === 'carrier') {
        invalidateCarrierPositionalLayout(atom, unknownReflectiveCallableValue());
      }
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
        for (const propertyName of ownPropertyNamesInRuntimeOrder(atom)) {
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
    const exactRestLengths = new Set();
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
      for (const length of atom.exactPositionalLengths) exactRestLengths.add(Math.max(0, length - startIndex));
      mergeValue(uncertainValues, atom.uncertainPositionalValues);
      if (atom.positionalOverflowStart !== undefined) {
        mergeCarrierPositionalOverflow(
          restCarrier,
          Math.max(0, atom.positionalOverflowStart - startIndex),
          atom.overflowPositionalValues
        );
      }
    }
    for (const layout of expansion.layouts) {
      for (let index = startIndex; index < layout.length; index += 1) {
        putCarrierProperty(restCarrier, [String(index - startIndex)], layout[index]);
      }
      restLengths.add(Math.max(0, layout.length - startIndex));
    }
    mergeValue(uncertainValues, expansion.uncertainValues);
    for (const length of expansion.exactPositionalLengths) {
      exactRestLengths.add(Math.max(0, length - startIndex));
    }
    if (expansion.positionalOverflowStart !== undefined) {
      mergeCarrierPositionalOverflow(
        restCarrier,
        Math.max(0, expansion.positionalOverflowStart - startIndex),
        expansion.overflowPositionalValues
      );
    }
    mergeCarrierPositionalState(
      restCarrier,
      restLengths,
      value.size === 0 ||
        [...value].some(atom => typeof atom === 'string' || atom.kind !== 'carrier' || atom.positionalUncertain) ||
        expansion.uncertainPositioning,
      uncertainValues
    );
    mergeCarrierExactPositionalLengths(restCarrier, exactRestLengths);
    return new Set([restCarrier]);
  }

  function isUnboundRequireCall(node) {
    const current = unwrapExpression(node);
    if (!ts.isCallExpression(current) || current.arguments.length !== 1) return false;
    const callee = unwrapExpression(current.expression);
    return ts.isIdentifier(callee) && callee.text === 'require' && !lookupBinding(callee);
  }

  function boundCallableFor(node, target, boundThis, boundArguments, boundArgumentExpansion) {
    const atom = invocationScopedValue(boundCallableAtoms, 'boundCallableAtoms', node, () => ({
      kind: 'bound-callable',
      target: new Set(),
      boundThis: new Set(),
      boundArguments: [],
      boundArgumentOverflowStart: undefined,
      boundOverflowValues: new Set(),
    }));
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
    if (boundArgumentExpansion?.positionalOverflowStart !== undefined) {
      if (
        atom.boundArgumentOverflowStart === undefined ||
        boundArgumentExpansion.positionalOverflowStart < atom.boundArgumentOverflowStart
      ) {
        atom.boundArgumentOverflowStart = boundArgumentExpansion.positionalOverflowStart;
      }
      mergeCallableValue(atom, atom.boundOverflowValues, boundArgumentExpansion.overflowPositionalValues);
    }
    return atom;
  }

  function boundInvocationOverflow(atom, argumentExpansion, argumentValues) {
    if (atom.boundArgumentOverflowStart !== undefined) {
      const overflowValues = new Set(atom.boundOverflowValues);
      for (const argumentValue of argumentValues) mergeValue(overflowValues, argumentValue);
      if (argumentExpansion) mergeValue(overflowValues, argumentExpansion.overflowPositionalValues);
      return {
        positionalOverflowStart: atom.boundArgumentOverflowStart,
        overflowPositionalValues: overflowValues,
      };
    }
    return shiftedPositionalOverflow(argumentExpansion, atom.boundArguments.length);
  }

  function carrierPositionValue(carrier, index) {
    return observedPropertyValue(new Set([carrier]), [String(index)], undefined, false);
  }

  function mergeLayoutSummary(summaries, layout) {
    let summary = summaries.get(layout.length);
    if (!summary) {
      summary = Array.from({ length: layout.length }, () => new Set());
      summaries.set(layout.length, summary);
    }
    for (const [index, value] of layout.entries()) {
      mergeValue(summary[index], value);
    }
  }

  function appendIterableLayout(layouts, saturatedLayouts, uncertainValues, value, unknown, node) {
    const yielded = iteratorYieldValue(value, node);
    const layout = [];
    let positionalOverflow = false;
    for (const atom of yielded) {
      if (layout.length >= maximumTrackedInvocationArguments) {
        positionalOverflow = true;
        uncertainValues.add(atom);
        continue;
      }
      layout.push(new Set([atom]));
    }
    let layoutSaturated = false;
    if (layouts.length < maximumTrackedPositionalAlternatives) layouts.push(layout);
    else {
      mergeLayoutSummary(saturatedLayouts, layout);
      layoutSaturated = true;
    }
    if (unknown || positionalOverflow || layoutSaturated) {
      mergeValue(uncertainValues, yielded);
      mergeValue(uncertainValues, unknownReflectiveCallableValue());
    }
    return {
      uncertainPositioning: unknown || positionalOverflow || layoutSaturated,
      unmodeledPositioning: unknown || positionalOverflow,
    };
  }

  function positionalLayouts(value) {
    const layouts = [];
    const saturatedLayouts = new Map();
    const exactPositionalLengths = new Set();
    const uncertainValues = new Set();
    const overflowPositionalValues = new Set();
    let uncertainPositioning = value.size === 0;
    let unmodeledPositioning = value.size === 0;
    let positionalOverflowStart;

    for (const atom of value) {
      if (typeof atom !== 'string' && atom.kind === 'iterator-instance') {
        const producedValues = new Set(atom.producedValues);
        mergeValue(producedValues, iteratorProducedValues(atom.iterators));
        const appended = appendIterableLayout(
          layouts,
          saturatedLayouts,
          uncertainValues,
          producedValues,
          atom.unknown,
          activeAnalysisNode
        );
        uncertainPositioning = appended.uncertainPositioning || uncertainPositioning;
        unmodeledPositioning = appended.unmodeledPositioning || unmodeledPositioning;
        continue;
      }
      if (typeof atom === 'string' || atom.kind !== 'carrier') {
        uncertainPositioning = true;
        unmodeledPositioning = true;
        if (isTrackedCallable(atom) || (typeof atom !== 'string' && atom.kind === 'unknown-value')) {
          uncertainValues.add(atom);
        }
        continue;
      }
      trackPropagationDependency(atom);
      const replacementIterator = replacementIteratorValues(new Set([atom]));
      if (replacementIterator.size > 0) {
        const produced = observeIteratorExecution(new Set([atom]), replacementIterator);
        if (atom.collectionKind) {
          const appended = appendIterableLayout(
            layouts,
            saturatedLayouts,
            uncertainValues,
            produced,
            hasUnknownValue(replacementIterator),
            activeAnalysisNode
          );
          uncertainPositioning = appended.uncertainPositioning || uncertainPositioning;
          unmodeledPositioning = appended.unmodeledPositioning || unmodeledPositioning;
          continue;
        }
        uncertainPositioning = true;
        unmodeledPositioning = true;
        mergeValue(uncertainValues, produced);
      } else if (atom.collectionKind === 'map') {
        const entries = collectionEntryValues(new Set([atom]), activeAnalysisNode);
        const appended = appendIterableLayout(
          layouts,
          saturatedLayouts,
          uncertainValues,
          entries.result,
          entries.unknown,
          activeAnalysisNode
        );
        uncertainPositioning = appended.uncertainPositioning || uncertainPositioning;
        unmodeledPositioning = appended.unmodeledPositioning || unmodeledPositioning;
        continue;
      } else if (atom.collectionKind === 'set') {
        const values = collectionValues(new Set([atom]), 'set');
        const appended = appendIterableLayout(
          layouts,
          saturatedLayouts,
          uncertainValues,
          values.result,
          values.unknown,
          activeAnalysisNode
        );
        uncertainPositioning = appended.uncertainPositioning || uncertainPositioning;
        unmodeledPositioning = appended.unmodeledPositioning || unmodeledPositioning;
        continue;
      }
      const numericIndices = [...atom.properties.keys()]
        .filter(propertyName => /^(0|[1-9]\d*)$/.test(propertyName))
        .map(Number)
        .filter(Number.isSafeInteger);
      let lengths = [...atom.positionalLengths];
      if (lengths.length === 0 && numericIndices.length > 0) {
        lengths = [Math.min(Math.max(...numericIndices) + 1, maximumTrackedInvocationArguments)];
        uncertainPositioning = true;
        unmodeledPositioning = true;
      } else if (lengths.length === 0) {
        uncertainPositioning = true;
        unmodeledPositioning = true;
      }
      mergeValue(uncertainValues, atom.uncertainPositionalValues);
      if (
        atom.positionalOverflowStart !== undefined &&
        (positionalOverflowStart === undefined || atom.positionalOverflowStart < positionalOverflowStart)
      ) {
        positionalOverflowStart = atom.positionalOverflowStart;
      }
      mergeValue(overflowPositionalValues, atom.overflowPositionalValues);
      if (carrierOverflowMayHaveHoles(atom)) {
        mergeValue(overflowPositionalValues, prototypeOverflowPositionalValues(effectivePrototypes(atom)));
      }
      for (const length of atom.exactPositionalLengths) exactPositionalLengths.add(length);
      if (atom.positionalUncertain || atom.unknownProperty.size > 0) {
        uncertainPositioning = true;
        unmodeledPositioning = true;
        mergeValue(uncertainValues, atom.unknownProperty);
      }
      for (const length of lengths) {
        const layout = Array.from({ length }, (_, index) => carrierPositionValue(atom, index));
        if (layouts.length < maximumTrackedPositionalAlternatives) {
          layouts.push(layout);
        } else {
          uncertainPositioning = true;
          mergeLayoutSummary(saturatedLayouts, layout);
          for (const positionalValue of layout) mergeValue(uncertainValues, positionalValue);
          mergeValue(uncertainValues, unknownReflectiveCallableValue());
        }
      }
    }

    return {
      layouts,
      saturatedLayouts,
      exactPositionalLengths,
      uncertainPositioning,
      unmodeledPositioning,
      uncertainValues,
      positionalOverflowStart,
      overflowPositionalValues,
    };
  }

  function positionalValueAt(expansion, index) {
    const result = new Set();
    for (const layout of expansion.layouts) mergeValue(result, layout[index] ?? new Set());
    for (const layout of expansion.saturatedLayouts.values()) mergeValue(result, layout[index] ?? new Set());
    if (expansion.uncertainPositioning) mergeValue(result, expansion.uncertainValues);
    if (expansion.positionalOverflowStart !== undefined && index >= expansion.positionalOverflowStart) {
      mergeValue(result, expansion.overflowPositionalValues);
      if (hasUnsafePositionalValue(expansion.overflowPositionalValues)) {
        mergeValue(result, unknownReflectiveCallableValue());
      }
    }
    return result;
  }

  function allPositionalValues(expansion) {
    const result = new Set(expansion.uncertainValues);
    mergeValue(result, expansion.overflowPositionalValues ?? new Set());
    if (hasUnsafePositionalValue(expansion.overflowPositionalValues ?? new Set())) {
      mergeValue(result, unknownReflectiveCallableValue());
    }
    for (const layout of expansion.layouts) {
      for (const value of layout) mergeValue(result, value);
    }
    for (const layout of expansion.saturatedLayouts.values()) {
      for (const value of layout) mergeValue(result, value);
    }
    return result;
  }

  function shiftedPositionalOverflow(expansion, offset) {
    if (!expansion || expansion.positionalOverflowStart === undefined) return undefined;
    return {
      positionalOverflowStart: Math.max(0, expansion.positionalOverflowStart + offset),
      overflowPositionalValues: expansion.overflowPositionalValues,
    };
  }

  function mergeInvocation(target, source) {
    mergeValue(target.result, source.result);
    mergeValue(target.kinds, source.kinds);
  }

  function mergePositionalLimit(invocation, expansion) {
    if (expansion.uncertainPositioning && hasUnsafePositionalValue(expansion.uncertainValues)) {
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

  function mapperInvocationValue(callback, argumentValues, thisValue, invocationNode) {
    const invocation = invokeTracked(callback, argumentValues, invocationNode, new Set(), thisValue, false, true);
    const result = new Set();
    let ambiguous = callback.size === 0;
    for (const atom of callback) {
      if (typeof atom !== 'string' && atom.kind === 'unknown-value') ambiguous = true;
    }
    for (const atom of invocation.result) {
      if (typeof atom !== 'string' && atom.kind === 'unknown-value' && atom.callableReason === undefined) {
        result.add(unknownReflectiveCallableAtom);
      } else {
        result.add(atom);
      }
    }
    if (result.size === 0) {
      mergeValue(result, ambiguous ? unknownReflectiveCallableValue() : literalValue(undefined));
    }
    return { result, kinds: invocation.kinds };
  }

  function resetMapperInvocationState(callback, invocationNode, seen = new Set()) {
    const parentState = activeFunctionInvocationState();
    const states = parentState?.childFunctionInvocationStates ?? functionInvocationStates;
    const functions = states.get(invocationNode);
    if (!functions) return;
    for (const atom of callback) {
      if (typeof atom === 'string' || seen.has(atom)) continue;
      seen.add(atom);
      if (atom.kind === 'function-value') functions.delete(atom);
      else if (atom.kind === 'bound-callable' || atom.kind === 'invocation-method') {
        resetMapperInvocationState(atom.target, invocationNode, seen);
      }
    }
  }

  function arrayFromValue(argumentValues, invocationNode) {
    const array = syntheticCarrierFor(invocationNode, 'array-from-result', true);
    const expansion = positionalLayouts(argumentValues[0] ?? new Set());
    const mapper = argumentValues[1] ?? new Set();
    const callableMapper = new Set();
    let includesUnmapped = argumentValues.length < 2 || mapper.size === 0;
    for (const atom of mapper) {
      if (typeof atom !== 'string' && atom.kind === 'literal' && atom.value === undefined) {
        includesUnmapped = true;
      } else {
        callableMapper.add(atom);
      }
    }
    const kinds = new Set();
    const lengths = new Set();
    for (const layout of expansion.layouts) {
      lengths.add(layout.length);
      for (const [index, value] of layout.entries()) {
        const mappedValue = new Set(includesUnmapped ? value : []);
        if (callableMapper.size > 0) {
          resetMapperInvocationState(callableMapper, invocationNode);
          const callbackInvocation = mapperInvocationValue(
            callableMapper,
            [value, literalValue(index)],
            argumentValues[2] ?? new Set(),
            invocationNode
          );
          mergeValue(mappedValue, callbackInvocation.result);
          mergeValue(kinds, callbackInvocation.kinds);
        } else if (!includesUnmapped) {
          mergeValue(mappedValue, unknownReflectiveCallableValue());
        }
        putCarrierProperty(array, [String(index)], mappedValue, deterministicWriteRank(invocationNode));
      }
    }
    const uncertainValues = new Set(expansion.uncertainValues);
    if (expansion.uncertainPositioning && hasUnknownValue(expansion.uncertainValues)) {
      mergeValue(uncertainValues, unknownReflectiveCallableValue());
    }
    mergeCarrierPositionalState(array, lengths, expansion.uncertainPositioning, uncertainValues);
    mergeCarrierExactPositionalLengths(array, expansion.exactPositionalLengths);
    const overflowValues = new Set(includesUnmapped ? expansion.overflowPositionalValues : []);
    if (callableMapper.size > 0 && expansion.positionalOverflowStart !== undefined) {
      resetMapperInvocationState(callableMapper, invocationNode);
      const callbackInvocation = mapperInvocationValue(
        callableMapper,
        [expansion.overflowPositionalValues, unknownValue()],
        argumentValues[2] ?? new Set(),
        invocationNode
      );
      mergeValue(overflowValues, callbackInvocation.result);
      mergeValue(kinds, callbackInvocation.kinds);
    }
    mergeCarrierPositionalOverflow(array, expansion.positionalOverflowStart, overflowValues);
    return { result: new Set([array]), kinds };
  }

  function arrayOfValue(argumentValues, invocationNode, argumentExpansion) {
    const array = syntheticCarrierFor(invocationNode, 'array-of-result', true);
    for (const [index, value] of argumentValues.entries()) {
      putCarrierProperty(array, [String(index)], value, deterministicWriteRank(invocationNode));
    }
    mergeCarrierPositionalState(array, new Set([argumentValues.length]), false, new Set());
    if (![...(invocationNode.arguments ?? [])].some(ts.isSpreadElement)) {
      mergeCarrierExactPositionalLengths(array, new Set([invocationNode.arguments?.length ?? argumentValues.length]));
    }
    mergeCarrierPositionalOverflow(
      array,
      argumentExpansion?.positionalOverflowStart,
      argumentExpansion?.overflowPositionalValues ?? new Set()
    );
    return new Set([array]);
  }

  function arrayConstructorValue(argumentValues, invocationNode, argumentExpansion) {
    const array = syntheticCarrierFor(invocationNode, 'array-constructor-result', true);
    const numericLength = argumentValues.length === 1 ? singleIntegerArgument(argumentValues[0]) : undefined;
    if (numericLength !== undefined && numericLength >= 0 && numericLength <= 0xffffffff) {
      const boundedLength = Math.min(numericLength, maximumTrackedInvocationArguments);
      mergeCarrierPositionalState(array, new Set([boundedLength]), false, new Set());
      mergeCarrierExactPositionalLengths(array, new Set([numericLength]));
      if (numericLength > maximumTrackedInvocationArguments) {
        mergeCarrierPositionalOverflow(array, maximumTrackedInvocationArguments, new Set());
      }
      return new Set([array]);
    }
    for (const [index, value] of argumentValues.entries()) {
      putCarrierProperty(array, [String(index)], value, deterministicWriteRank(invocationNode));
    }
    mergeCarrierPositionalState(array, new Set([argumentValues.length]), false, new Set());
    if (![...(invocationNode.arguments ?? [])].some(ts.isSpreadElement)) {
      mergeCarrierExactPositionalLengths(array, new Set([invocationNode.arguments?.length ?? argumentValues.length]));
    }
    mergeCarrierPositionalOverflow(
      array,
      argumentExpansion?.positionalOverflowStart,
      argumentExpansion?.overflowPositionalValues ?? new Set()
    );
    return new Set([array]);
  }

  function markCollectionUnknown(carrier) {
    if (carrier.collectionUnknown) return;
    carrier.collectionUnknown = true;
    notifyPropagationSubscribers(carrier);
  }

  function mergeCollectionValue(carrier, value, writeRank) {
    if (
      writeRank &&
      carrier.collectionClearRank &&
      (rankPrecedes(writeRank, carrier.collectionClearRank) || rankEquals(writeRank, carrier.collectionClearRank))
    ) {
      return;
    }
    const boundedValue = new Set();
    let overflow = false;
    for (const atom of value) {
      if (carrier.collectionValues.has(atom)) continue;
      if (carrier.collectionValues.size + boundedValue.size >= maximumTrackedInvocationArguments) {
        overflow = true;
        break;
      }
      boundedValue.add(atom);
    }
    if (mergeValue(carrier.collectionValues, boundedValue)) notifyPropagationSubscribers(carrier);
    if (overflow) markCollectionUnknown(carrier);
  }

  function mergeCollectionKey(carrier, value, unkeyed = false) {
    const boundedValue = new Set();
    let overflow = false;
    for (const atom of value) {
      if (carrier.collectionKeys.has(atom)) {
        if (unkeyed) mergeCarrierProperty(carrier, carrier.collectionUnkeyedKeys, new Set([atom]));
        continue;
      }
      if (carrier.collectionKeys.size + boundedValue.size >= maximumTrackedInvocationArguments) {
        overflow = true;
        break;
      }
      boundedValue.add(atom);
    }
    if (mergeValue(carrier.collectionKeys, boundedValue)) notifyPropagationSubscribers(carrier);
    if (unkeyed) mergeCarrierProperty(carrier, carrier.collectionUnkeyedKeys, boundedValue);
    if (overflow) markCollectionUnknown(carrier);
  }

  function putMapEntry(carrier, keyValue, entryValue, writeRank, strong = false) {
    if (
      writeRank &&
      carrier.collectionClearRank &&
      (rankPrecedes(writeRank, carrier.collectionClearRank) || rankEquals(writeRank, carrier.collectionClearRank))
    ) {
      return;
    }
    const propertyNames = propertyNamesFromValue(keyValue);
    if (propertyNames === undefined) {
      mergeCollectionKey(carrier, keyValue, true);
      mergeCollectionValue(carrier, entryValue, writeRank);
      return;
    }
    mergeCollectionKey(carrier, keyValue);
    for (const propertyName of propertyNames) {
      const previousWriteRank = carrier.collectionEntryWriteRanks.get(propertyName);
      if (writeRank && previousWriteRank && rankPrecedes(writeRank, previousWriteRank)) continue;
      let stored = carrier.collectionEntries.get(propertyName);
      if (!stored) {
        if (carrier.collectionEntries.size >= maximumTrackedInvocationArguments) {
          mergeCollectionKey(carrier, keyValue, true);
          mergeCollectionValue(carrier, entryValue, writeRank);
          markCollectionUnknown(carrier);
          continue;
        }
        stored = new Set();
        carrier.collectionEntries.set(propertyName, stored);
      }
      const newerStrongWrite =
        strong && writeRank && (!previousWriteRank || rankPrecedes(previousWriteRank, writeRank));
      if (newerStrongWrite) replaceTracked(stored, entryValue, carrier);
      else if (mergeValue(stored, entryValue)) notifyPropagationSubscribers(carrier);
      if (writeRank && (!previousWriteRank || !rankEquals(writeRank, previousWriteRank))) {
        carrier.collectionEntryWriteRanks.set(propertyName, writeRank);
      }
    }
  }

  function clearCollection(receiverValue, invocationNode, kind) {
    const writeRank = deterministicWriteRank(invocationNode);
    if (activeAlternativeMutationDepth > 0 || !writeRank || receiverValue.size !== 1) return;
    const receiver = [...receiverValue][0];
    if (
      typeof receiver === 'string' ||
      receiver.kind !== 'carrier' ||
      receiver.collectionKind !== kind ||
      (receiver.collectionClearRank &&
        (rankPrecedes(writeRank, receiver.collectionClearRank) || rankEquals(writeRank, receiver.collectionClearRank)))
    ) {
      return;
    }
    receiver.collectionClearRank = writeRank;
    receiver.collectionEntries.clear();
    receiver.collectionKeys.clear();
    receiver.collectionUnkeyedKeys.clear();
    receiver.collectionValues.clear();
    receiver.collectionUnknown = false;
    notifyPropagationSubscribers(receiver);
  }

  function mapObjectValue(argumentValues, invocationNode) {
    const carrier = syntheticCarrierFor(invocationNode, 'map-object');
    carrier.collectionKind = 'map';
    mergeCarrierPrototypes(carrier, originValue(origins.mapPrototype));
    if (argumentValues.length === 0) return new Set([carrier]);
    const entries = positionalLayouts(argumentValues[0] ?? new Set());
    if (entries.uncertainPositioning || entries.positionalOverflowStart !== undefined) {
      markCollectionUnknown(carrier);
    }
    let entryCount = 0;
    for (const layout of entries.layouts) {
      for (const entry of layout) {
        if (entryCount >= maximumTrackedInvocationArguments || !consumeAnalysisWork(invocationNode)) {
          markCollectionUnknown(carrier);
          return new Set([carrier]);
        }
        entryCount += 1;
        const pair = positionalLayouts(entry);
        if (pair.uncertainPositioning || pair.layouts.length === 0) markCollectionUnknown(carrier);
        for (const pairLayout of pair.layouts) {
          putMapEntry(
            carrier,
            pairLayout[0] ?? unknownValue(),
            pairLayout[1] ?? unknownReflectiveCallableValue(),
            deterministicWriteRank(invocationNode)
          );
        }
      }
    }
    return new Set([carrier]);
  }

  function setObjectValue(argumentValues, invocationNode) {
    const carrier = syntheticCarrierFor(invocationNode, 'set-object');
    carrier.collectionKind = 'set';
    mergeCarrierPrototypes(carrier, originValue(origins.setPrototype));
    if (argumentValues.length === 0) return new Set([carrier]);
    const expansion = positionalLayouts(argumentValues[0] ?? new Set());
    mergeCollectionValue(carrier, allPositionalValues(expansion), deterministicWriteRank(invocationNode));
    if (expansion.uncertainPositioning || expansion.positionalOverflowStart !== undefined) {
      markCollectionUnknown(carrier);
    }
    return new Set([carrier]);
  }

  function collectionValues(receiverValue, kind, keys = false) {
    const result = new Set();
    let unknown = receiverValue.size === 0;
    for (const atom of receiverValue) {
      if (typeof atom === 'string' || atom.kind === 'unknown-value') {
        unknown = true;
        continue;
      }
      if (atom.kind !== 'carrier' || atom.collectionKind !== kind) continue;
      trackPropagationDependency(atom);
      if (kind === 'map' && keys) {
        mergeValue(result, atom.collectionKeys);
      } else {
        for (const value of atom.collectionEntries.values()) mergeValue(result, value);
        mergeValue(result, atom.collectionValues);
      }
      if (atom.collectionUnknown) unknown = true;
    }
    if (unknown) mergeValue(result, unknownValue());
    return { result, unknown };
  }

  function mapLookupValue(receiverValue, keyValue) {
    const result = new Set();
    const propertyNames = propertyNamesFromValue(keyValue);
    let unknown = receiverValue.size === 0;
    for (const atom of receiverValue) {
      if (typeof atom === 'string' || atom.kind === 'unknown-value') {
        unknown = true;
        continue;
      }
      if (atom.kind !== 'carrier' || atom.collectionKind !== 'map') continue;
      trackPropagationDependency(atom);
      if (propertyNames === undefined) {
        for (const value of atom.collectionEntries.values()) mergeValue(result, value);
      } else {
        for (const propertyName of propertyNames) {
          const value = atom.collectionEntries.get(propertyName);
          if (value) mergeValue(result, value);
        }
      }
      mergeValue(result, atom.collectionValues);
      if (atom.collectionUnknown) unknown = true;
    }
    if (unknown) mergeValue(result, unknownReflectiveCallableValue());
    return result;
  }

  function collectionEntryValues(receiverValue, invocationNode) {
    const result = new Set();
    let entryIndex = 0;
    let unknown = receiverValue.size === 0;
    for (const atom of receiverValue) {
      if (typeof atom === 'string' || atom.kind === 'unknown-value') {
        unknown = true;
        continue;
      }
      if (atom.kind !== 'carrier' || atom.collectionKind !== 'map') continue;
      trackPropagationDependency(atom);
      for (const [propertyName, value] of atom.collectionEntries) {
        if (entryIndex >= maximumTrackedInvocationArguments || !consumeAnalysisWork(invocationNode)) {
          unknown = true;
          break;
        }
        const entry = syntheticCarrierFor(invocationNode, `map-entry-${entryIndex}`, true);
        putCarrierProperty(entry, ['0'], literalValue(propertyName));
        putCarrierProperty(entry, ['1'], value);
        mergeCarrierPositionalState(entry, new Set([2]), false, new Set());
        result.add(entry);
        entryIndex += 1;
      }
      if (atom.collectionValues.size > 0 || atom.collectionUnkeyedKeys.size > 0) {
        const entry = syntheticCarrierFor(invocationNode, `map-entry-${entryIndex}`, true);
        putCarrierProperty(
          entry,
          ['0'],
          atom.collectionUnkeyedKeys.size > 0 ? atom.collectionUnkeyedKeys : unknownValue()
        );
        putCarrierProperty(
          entry,
          ['1'],
          atom.collectionValues.size > 0 ? atom.collectionValues : unknownReflectiveCallableValue()
        );
        mergeCarrierPositionalState(entry, new Set([2]), false, new Set());
        result.add(entry);
        entryIndex += 1;
      }
      if (atom.collectionUnknown) unknown = true;
    }
    if (unknown) {
      const entry = syntheticCarrierFor(invocationNode, 'map-entry-unknown', true);
      entry.iteratorUnknownEntry = true;
      putCarrierProperty(entry, ['0'], unknownValue());
      putCarrierProperty(entry, ['1'], unknownValue());
      mergeCarrierPositionalState(entry, new Set([2]), false, new Set());
      result.add(entry);
    }
    return { result, unknown };
  }

  function setEntryValues(receiverValue, invocationNode) {
    const values = collectionValues(receiverValue, 'set');
    const result = new Set();
    let entryIndex = 0;
    for (const value of values.result) {
      if (entryIndex >= maximumTrackedInvocationArguments || !consumeAnalysisWork(invocationNode)) {
        values.unknown = true;
        break;
      }
      const entry = syntheticCarrierFor(invocationNode, `set-entry-${entryIndex}`, true);
      const entryValue = new Set([value]);
      putCarrierProperty(entry, ['0'], entryValue);
      putCarrierProperty(entry, ['1'], entryValue);
      mergeCarrierPositionalState(entry, new Set([2]), false, new Set());
      result.add(entry);
      entryIndex += 1;
    }
    if (values.unknown) {
      const entry = syntheticCarrierFor(invocationNode, 'set-entry-unknown', true);
      entry.iteratorUnknownEntry = true;
      putCarrierProperty(entry, ['0'], unknownValue());
      putCarrierProperty(entry, ['1'], unknownValue());
      mergeCarrierPositionalState(entry, new Set([2]), false, new Set());
      result.add(entry);
    }
    return { result, unknown: values.unknown };
  }

  function objectProjectionValue(argumentValues, invocationNode, entries) {
    const array = syntheticCarrierFor(invocationNode, entries ? 'object-entries' : 'object-values', true);
    const targetValue = argumentValues[0] ?? new Set();
    let index = 0;
    let unknown = targetValue.size === 0;
    for (const atom of targetValue) {
      if (typeof atom === 'string' || atom.kind === 'unknown-value') {
        unknown = true;
        continue;
      }
      if (atom.kind !== 'carrier') continue;
      trackPropagationDependency(atom);
      for (const propertyName of new Set([...atom.properties.keys(), ...atom.accessors.keys()])) {
        if (index >= maximumTrackedInvocationArguments || !consumeAnalysisWork(invocationNode)) {
          unknown = true;
          break;
        }
        const propertyValue = observedPropertyValue(new Set([atom]), [propertyName]);
        if (entries) {
          const entry = syntheticCarrierFor(invocationNode, `object-entry-${index}`, true);
          putCarrierProperty(entry, ['0'], literalValue(propertyName));
          putCarrierProperty(entry, ['1'], propertyValue);
          mergeCarrierPositionalState(entry, new Set([2]), false, new Set());
          putCarrierProperty(array, [String(index)], new Set([entry]));
        } else {
          putCarrierProperty(array, [String(index)], propertyValue);
        }
        index += 1;
      }
      if (atom.unknownProperty.size > 0 || atom.unknownAccessors.get.size > 0 || atom.unknownSpreadSource) {
        unknown = true;
      }
    }
    let uncertainValues = new Set();
    if (unknown && entries) {
      const entry = syntheticCarrierFor(invocationNode, 'object-entry-unknown', true);
      entry.iteratorUnknownEntry = true;
      putCarrierProperty(entry, ['0'], unknownValue());
      putCarrierProperty(entry, ['1'], unknownValue());
      mergeCarrierPositionalState(entry, new Set([2]), false, new Set());
      uncertainValues = new Set([entry]);
    } else if (unknown) {
      uncertainValues = unknownValue();
    }
    mergeCarrierPositionalState(array, new Set([index]), unknown, uncertainValues);
    return new Set([array]);
  }

  function arrayMapValue(argumentValues, receiverValue, invocationNode) {
    const mapped = syntheticCarrierFor(invocationNode, 'array-map-result', true);
    const callback = argumentValues[0] ?? new Set();
    let inputSignature = `${receiverValue.size}:${callback.size}`;
    for (const atom of new Set([...receiverValue, ...callback])) {
      inputSignature +=
        typeof atom === 'string'
          ? `:${atom}`
          : `:${atom.kind}:${atom.revision ?? 0}:${atom.kind === 'literal' ? String(atom.value) : ''}`;
    }
    if (mapped.mapperInputSignature === inputSignature) {
      return { result: new Set([mapped]), kinds: new Set(mapped.mapperKinds ?? []) };
    }
    markInvocationSensitive(receiverValue);
    const expansion = positionalLayouts(receiverValue);
    const kinds = new Set();
    const lengths = new Set();
    for (const layout of expansion.layouts) {
      lengths.add(layout.length);
      for (const [index] of layout.entries()) {
        resetMapperInvocationState(callback, invocationNode);
        const sourceValue = observedPropertyValue(receiverValue, [String(index)], invocationNode);
        const callbackInvocation = mapperInvocationValue(
          callback,
          [sourceValue, literalValue(index), receiverValue],
          argumentValues[1] ?? new Set(),
          invocationNode
        );
        for (const kind of callbackInvocation.kinds) kinds.add(kind);
        putCarrierProperty(mapped, [String(index)], callbackInvocation.result, deterministicWriteRank(invocationNode));
      }
    }
    const uncertainValues = new Set(expansion.uncertainValues);
    if (expansion.uncertainPositioning && hasUnknownValue(expansion.uncertainValues)) {
      mergeValue(uncertainValues, unknownReflectiveCallableValue());
    }
    mergeCarrierPositionalState(mapped, lengths, expansion.uncertainPositioning, uncertainValues);
    mergeCarrierExactPositionalLengths(mapped, expansion.exactPositionalLengths);
    let finalExpansion = positionalLayouts(receiverValue);
    const overflowValues = new Set();
    if (finalExpansion.positionalOverflowStart !== undefined) {
      resetMapperInvocationState(callback, invocationNode);
      const callbackInvocation = mapperInvocationValue(
        callback,
        [finalExpansion.overflowPositionalValues, unknownValue(), receiverValue],
        argumentValues[1] ?? new Set(),
        invocationNode
      );
      mergeValue(overflowValues, callbackInvocation.result);
      mergeValue(kinds, callbackInvocation.kinds);
      finalExpansion = positionalLayouts(receiverValue);
    }
    mergeCarrierPositionalOverflow(mapped, finalExpansion.positionalOverflowStart, overflowValues);
    inputSignature = `${receiverValue.size}:${callback.size}`;
    for (const atom of new Set([...receiverValue, ...callback])) {
      inputSignature +=
        typeof atom === 'string'
          ? `:${atom}`
          : `:${atom.kind}:${atom.revision ?? 0}:${atom.kind === 'literal' ? String(atom.value) : ''}`;
    }
    mapped.mapperInputSignature = inputSignature;
    mapped.mapperKinds ??= new Set();
    mergeValue(mapped.mapperKinds, kinds);
    return { result: new Set([mapped]), kinds };
  }

  function iteratorYieldValue(value, invocationNode) {
    const result = new Set();
    let entryIndex = 0;
    for (const atom of value) {
      if (!consumeAnalysisWork(invocationNode)) {
        result.add(unknownReflectiveCallableAtom);
        break;
      }
      if (typeof atom !== 'string' && atom.kind === 'unknown-value') {
        result.add(atom.callableReason ? atom : unknownReflectiveCallableAtom);
      } else if (typeof atom !== 'string' && atom.kind === 'carrier' && atom.iteratorUnknownEntry) {
        const entry = syntheticCarrierFor(invocationNode, `iterator-entry-${entryIndex}`, true);
        for (const [propertyName, propertyValue] of atom.properties) {
          putCarrierProperty(
            entry,
            [propertyName],
            propertyName === '1' ? retainReflectiveCallableProvenance(propertyValue) : propertyValue
          );
        }
        mergeCarrierPositionalState(
          entry,
          atom.positionalLengths,
          atom.positionalUncertain,
          retainReflectiveCallableProvenance(atom.uncertainPositionalValues)
        );
        result.add(entry);
        entryIndex += 1;
      } else {
        result.add(atom);
      }
    }
    return result;
  }

  function iteratorNextResultValue(instance, invocationNode) {
    const producedValues = new Set(instance.producedValues);
    trackPropagationDependency(instance);
    trackPropagationDependency(instance.iterators);
    trackPropagationDependency(instance.producedValues);
    trackPropagationDependency(instance.receivers);
    for (const iterator of instance.iterators) {
      if (typeof iterator !== 'string' && iterator.kind === 'function-value') {
        executeIteratorReceiverEffects(iterator, instance.receivers);
      }
    }
    mergeValue(producedValues, iteratorProducedValues(instance.iterators));
    if (instance.unknown) mergeValue(producedValues, unknownValue());
    const resultCarrier = syntheticCarrierFor(invocationNode, 'iterator-next-result');
    putCarrierProperty(resultCarrier, ['value'], iteratorYieldValue(producedValues, invocationNode));
    putCarrierProperty(resultCarrier, ['done'], literalValue(false));
    return new Set([resultCarrier]);
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
    if (atom === origins.arrayPrototype) return [...positionalMutationMethods, 'map', 'values'];
    if (atom === origins.functionPrototype) return ['apply', 'bind', 'call'];
    if (atom === origins.jsonObject) return ['parse', 'stringify'];
    if (atom === origins.mapObject || atom === origins.setObject) return ['prototype'];
    if (atom === origins.mapPrototype) return ['entries', 'get', 'set', 'values'];
    if (atom === origins.objectObject) {
      return [
        'assign',
        'create',
        'defineProperties',
        'defineProperty',
        'entries',
        'freeze',
        'getOwnPropertyDescriptor',
        'getOwnPropertyDescriptors',
        'getPrototypeOf',
        'preventExtensions',
        'prototype',
        'seal',
        'setPrototypeOf',
        'values',
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
        'preventExtensions',
        'set',
        'setPrototypeOf',
      ];
    }
    if (atom === origins.setPrototype) return ['add', 'entries', 'keys', 'values'];
    if (atom === origins.globalObject) {
      return ['Array', 'Date', 'eval', 'Function', 'JSON', 'Map', 'Object', 'Reflect', 'Set', 'Symbol', '_'];
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

  function valueCarriesCarrier(value, seen = new Set(), remaining = { count: 256 }) {
    for (const atom of value) {
      if (typeof atom === 'string' || atom.kind === 'literal' || atom.kind === 'known-data') continue;
      if (seen.has(atom)) continue;
      if (remaining.count <= 0) return true;
      remaining.count -= 1;
      seen.add(atom);
      if (atom.kind === 'carrier') {
        trackPropagationDependency(atom);
        if (atom.invocationSensitive) return true;
        const nestedValues = [
          ...atom.collectionEntries.values(),
          atom.collectionKeys,
          atom.collectionUnkeyedKeys,
          atom.collectionValues,
          ...atom.properties.values(),
          ...[...atom.accessors.values()].flatMap(accessor => [accessor.get, accessor.set]),
          atom.unknownProperty,
          atom.unknownAccessors.get,
          atom.unknownAccessors.set,
          atom.uncertainPositionalValues,
          atom.overflowPositionalValues,
        ];
        if (nestedValues.some(nested => valueCarriesCarrier(nested, seen, remaining))) return true;
      } else if (atom.kind === 'bound-callable') {
        if (
          valueCarriesCarrier(atom.boundThis, seen, remaining) ||
          atom.boundArguments.some(argument => valueCarriesCarrier(argument, seen, remaining)) ||
          valueCarriesCarrier(atom.boundOverflowValues, seen, remaining)
        ) {
          return true;
        }
      } else if (atom.kind === 'function-value') {
        for (const captured of atom.capturedBindings.values()) {
          if (valueCarriesCarrier(captured, seen, remaining)) return true;
        }
        for (const binding of atom.outerEffectBindings) {
          const bindingValue =
            activeInvocationBindingValue(binding) ?? atom.capturedBindings.get(binding) ?? binding.value;
          if (valueCarriesCarrier(bindingValue, seen, remaining)) return true;
        }
      }
    }
    return false;
  }

  function valueContainsCarrier(value, seen = new Set(), remaining = { count: 256 }) {
    for (const atom of value) {
      if (typeof atom === 'string') {
        const target = abstractTarget(atom);
        if (target) {
          trackPropagationDependency(target);
          return true;
        }
        continue;
      }
      if (atom.kind === 'literal' || atom.kind === 'known-data') continue;
      if (seen.has(atom)) continue;
      if (remaining.count <= 0) return true;
      remaining.count -= 1;
      seen.add(atom);
      if (atom.kind === 'carrier') return true;
      if (atom.kind === 'bound-callable') {
        if (
          valueContainsCarrier(atom.boundThis, seen, remaining) ||
          atom.boundArguments.some(argument => valueContainsCarrier(argument, seen, remaining)) ||
          valueContainsCarrier(atom.boundOverflowValues, seen, remaining)
        ) {
          return true;
        }
      } else if (atom.kind === 'function-value') {
        for (const captured of atom.capturedBindings.values()) {
          if (valueContainsCarrier(captured, seen, remaining)) return true;
        }
      }
    }
    return false;
  }

  function markInvocationSensitive(value, seen = new Set(), remaining = { count: 256 }) {
    for (const atom of value) {
      if (typeof atom === 'string' || seen.has(atom)) continue;
      if (remaining.count <= 0) return;
      remaining.count -= 1;
      seen.add(atom);
      if (atom.kind === 'carrier') {
        if ((propagationSubscribers.get(atom)?.size ?? 0) >= maximumPropagationSubscribersPerValue) {
          analysisWorkLimit = {
            reason: 'analysis-work-limit',
            position: activeAnalysisNode.getStart(sourceFile),
          };
          return;
        }
        if (!atom.invocationSensitive) {
          atom.invocationSensitive = true;
          notifyPropagationSubscribers(atom);
        }
        continue;
      }
      if (atom.kind === 'bound-callable') {
        markInvocationSensitive(atom.boundThis, seen, remaining);
        for (const argument of atom.boundArguments) markInvocationSensitive(argument, seen, remaining);
        markInvocationSensitive(atom.boundOverflowValues, seen, remaining);
      }
    }
  }

  function markInvocationTargetSensitive(value, seen = new Set(), remaining = { count: 256 }) {
    for (const atom of value) {
      if (typeof atom === 'string' || seen.has(atom)) continue;
      if (remaining.count <= 0) return;
      remaining.count -= 1;
      seen.add(atom);
      if (atom.kind === 'carrier') {
        atom.invocationTargetObserved = true;
        if ([...(propagationSubscribers.get(atom) ?? [])].some(operation => operation.carrierEffectCandidate)) {
          markInvocationSensitive(new Set([atom]));
        }
      } else if (atom.kind === 'bound-callable') {
        markInvocationTargetSensitive(atom.boundThis, seen, remaining);
        for (const argument of atom.boundArguments) markInvocationTargetSensitive(argument, seen, remaining);
        markInvocationTargetSensitive(atom.boundOverflowValues, seen, remaining);
      }
    }
  }

  function valueMayInvokeGetter(value) {
    const knownTargets = new Set([...value].filter(atom => typeof atom === 'string' || atom.kind === 'carrier'));
    return knownTargets.size > 0 && accessorMayRun(knownTargets, undefined, 'get');
  }

  function callableMayInstallTrackedEffects(value, seen = new Set()) {
    for (const atom of value) {
      if (typeof atom === 'string' || seen.has(atom)) continue;
      seen.add(atom);
      if (atom.kind === 'function-value') {
        if (atom.effectMayInstallTrackedCallable) return true;
        for (const binding of atom.outerEffectBindings) {
          const bindingValue =
            activeInvocationBindingValue(binding) ?? atom.capturedBindings.get(binding) ?? binding.value;
          if (hasUnsafeCallable(bindingValue) || callableMayInstallTrackedEffects(bindingValue, seen)) return true;
        }
      } else if (
        (atom.kind === 'bound-callable' || atom.kind === 'invocation-method') &&
        callableMayInstallTrackedEffects(atom.target, seen)
      ) {
        return true;
      }
    }
    return false;
  }

  function valueMayCarryTrackedCallable(value) {
    return hasUnsafeCallable(value) || callableMayInstallTrackedEffects(value);
  }

  function functionInvocationMayExecuteTrackedCallable(atom, argumentValues, thisValue) {
    for (const parameterIndex of atom.effectParameterIndices) {
      if (valueMayCarryTrackedCallable(argumentValues[parameterIndex] ?? new Set())) return true;
    }
    if (atom.receiverInvocationEffect && valueMayCarryTrackedCallable(thisValue ?? new Set())) return true;
    for (const binding of atom.outerEffectBindings) {
      const value = activeInvocationBindingValue(binding) ?? atom.capturedBindings.get(binding) ?? binding.value;
      if (valueMayCarryTrackedCallable(value)) return true;
    }
    return false;
  }

  function functionInvocationMayAffectCarrier(atom, argumentValues, thisValue) {
    if (
      activePropagationOperation &&
      (atom.effectMayInstallTrackedCallable ||
        invocationCarriesMutationProvenance(argumentValues) ||
        [...atom.outerEffectBindings].some(binding => {
          const value = activeInvocationBindingValue(binding) ?? atom.capturedBindings.get(binding) ?? binding.value;
          return hasUnsafeCallable(value) || callableMayInstallTrackedEffects(value);
        }))
    ) {
      activePropagationOperation.carrierEffectCandidate = true;
    }
    if (atom.effectMayInstallTrackedCallable || invocationCarriesMutationProvenance(argumentValues)) {
      for (const parameterIndex of atom.effectParameterIndices) {
        if (valueContainsCarrier(argumentValues[parameterIndex] ?? new Set())) return true;
      }
      if (atom.receiverInvocationEffect && valueContainsCarrier(thisValue ?? new Set())) return true;
      for (const binding of atom.outerEffectBindings) {
        const value = activeInvocationBindingValue(binding) ?? atom.capturedBindings.get(binding) ?? binding.value;
        if (valueContainsCarrier(value)) return true;
      }
    }
    if (
      atom.effectProvenanceUncertain &&
      [...argumentValues, thisValue ?? new Set()].some(value => valueCarriesCarrier(value))
    ) {
      return true;
    }
    for (const parameterIndex of atom.effectParameterIndices) {
      if (valueCarriesCarrier(argumentValues[parameterIndex] ?? new Set())) return true;
    }
    if (atom.receiverInvocationEffect && valueCarriesCarrier(thisValue ?? new Set())) return true;
    for (const binding of atom.outerEffectBindings) {
      const value = activeInvocationBindingValue(binding) ?? atom.capturedBindings.get(binding) ?? binding.value;
      if (valueCarriesCarrier(value)) return true;
    }
    if (atom.hasGetterReads) {
      for (const parameterIndex of atom.getterReadParameterIndices) {
        if (valueMayInvokeGetter(argumentValues[parameterIndex] ?? new Set())) return true;
      }
      if (atom.getterReceiverRead && valueMayInvokeGetter(thisValue ?? new Set())) return true;
      for (const binding of atom.getterReadOuterBindings) {
        const value = activeInvocationBindingValue(binding) ?? atom.capturedBindings.get(binding) ?? binding.value;
        if (valueMayInvokeGetter(value)) return true;
      }
    }
    return false;
  }

  function invocationCarriesMutationProvenance(argumentValues) {
    function carries(value, seen, remaining) {
      if (remaining.count <= 0) return true;
      remaining.count -= 1;
      if (hasUnsafeCallable(value)) return true;
      for (const atom of value) {
        if (typeof atom === 'string') continue;
        if (atom.kind === 'unknown-value') return atom.callableReason !== undefined;
        if (seen.has(atom)) continue;
        seen.add(atom);
        if (atom.kind === 'carrier') {
          const nestedValues = [
            ...atom.collectionEntries.values(),
            atom.collectionKeys,
            atom.collectionUnkeyedKeys,
            atom.collectionValues,
            atom.prototypes,
            ...atom.properties.values(),
            ...[...atom.accessors.values()].flatMap(accessor => [accessor.get, accessor.set]),
            atom.unknownProperty,
            atom.unknownAccessors.get,
            atom.unknownAccessors.set,
            atom.uncertainPositionalValues,
            atom.overflowPositionalValues,
          ];
          if (nestedValues.some(nested => carries(nested, seen, remaining))) return true;
        } else if (
          atom.kind === 'bound-callable' ||
          atom.kind === 'invocation-method' ||
          atom.kind === 'iterator-next'
        ) {
          return true;
        }
      }
      return false;
    }

    return argumentValues.some(value => carries(value, new Set(), { count: 256 }));
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
        ...atom.collectionEntries.values(),
        atom.collectionKeys,
        atom.collectionUnkeyedKeys,
        atom.collectionValues,
        ...atom.properties.values(),
        ...[...atom.accessors.values()].flatMap(accessor => [accessor.get, accessor.set]),
        atom.unknownProperty,
        atom.unknownAccessors.get,
        atom.unknownAccessors.set,
        atom.overflowPositionalValues,
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
    suppressUnknownCallableLimit = false,
    forceFunctionInvocation = false,
    argumentExpansion
  ) {
    const invocation = { result: new Set(), kinds: new Set() };
    if (activeCallableRecursionDepth >= maximumCallableRecursionDepth) {
      invocation.kinds.add(`${analysisLimitKind}:callable-recursion-limit`);
      return invocation;
    }
    const alternativeCallable = callable.size !== 1;
    activeCallableRecursionDepth += 1;
    if (alternativeCallable) activeAlternativeMutationDepth += 1;
    try {
      for (const atom of callable) {
        if (typeof atom !== 'string' && atom.kind === 'unknown-value') {
          invocation.result.add(atom);
          if (atom.callableReason && !suppressUnknownCallableLimit) {
            invocation.kinds.add(`${analysisLimitKind}:${atom.callableReason}`);
          }
          continue;
        }
        const effectArgumentValues =
          typeof atom !== 'string' && atom.kind === 'function-value'
            ? invocationArgumentsForEffectGating(atom, argumentValues, invocationNode, thisValue ?? new Set())
            : argumentValues;
        if (activeDormantPropagationDepth > 0 && typeof atom !== 'string' && atom.kind === 'function-value') {
          continue;
        }
        const mutationInvocation =
          typeof atom !== 'string' &&
          atom.kind === 'function-value' &&
          atom.mutationDependentReturn &&
          invocationCarriesMutationProvenance(effectArgumentValues);
        const carrierEffectInvocation =
          typeof atom !== 'string' &&
          atom.kind === 'function-value' &&
          (atom.hasInvocationEffects || atom.hasGetterReads) &&
          functionInvocationMayAffectCarrier(atom, effectArgumentValues, thisValue);
        const trackedCallableInvocation =
          typeof atom !== 'string' &&
          atom.kind === 'function-value' &&
          atom.hasInvocationEffects &&
          functionInvocationMayExecuteTrackedCallable(atom, effectArgumentValues, thisValue);
        const forcedLocalFunctionInvocation =
          forceFunctionInvocation && typeof atom !== 'string' && atom.kind === 'function-value';
        if (
          typeof atom !== 'string' &&
          atom.kind === 'function-value' &&
          !activeFunctionInvocationState() &&
          enclosingFunctionNode(invocationNode) === atom.iteratorNode
        ) {
          continue;
        }
        if (
          !isTrackedCallable(atom) &&
          !mutationInvocation &&
          !carrierEffectInvocation &&
          !trackedCallableInvocation &&
          !forcedLocalFunctionInvocation
        ) {
          continue;
        }
        if (
          typeof atom !== 'string' &&
          atom.kind === 'function-value' &&
          atom.effectProvenanceUncertain &&
          carrierEffectInvocation
        ) {
          invocation.kinds.add(`${analysisLimitKind}:invocation-effect-limit`);
          continue;
        }
        if (typeof atom !== 'string' && atom.kind === 'function-value' && atom.returnProvenanceUncertain) {
          invocation.kinds.add(`${analysisLimitKind}:return-provenance-limit`);
          continue;
        }
        if (
          typeof atom !== 'string' &&
          atom.kind === 'function-value' &&
          !atom.iteratorNode.asteriskToken &&
          atom.trackCallResult !== true &&
          !atom.mayTrackCallResult &&
          !mutationInvocation &&
          !carrierEffectInvocation &&
          !trackedCallableInvocation &&
          !forcedLocalFunctionInvocation &&
          !(atom.parameterDependentReturn && invocationCarriesTrackedProvenance(effectArgumentValues)) &&
          !(
            atom.receiverDependentReturn &&
            (returnBindingCarriesTrackedProvenance(thisValue ?? new Set()) ||
              (atom.requiresInvocationEffects && invocationCarriesTrackedProvenance(effectArgumentValues)))
          ) &&
          !outerReturnCarriesTrackedProvenance(atom)
        ) {
          continue;
        }
        const hasWork = isNonComposingIntrinsic(atom)
          ? consumeAnalysisWork(invocationNode)
          : consumeDependencyCompositionWork(invocationNode);
        if (!hasWork) {
          invocation.kinds.add(analysisLimitKind);
          break;
        }
        if (atom === origins.builtinEval) {
          invocation.kinds.add('direct-eval');
        } else if (atom === origins.lodashTemplate) {
          invocation.kinds.add('lodash-template');
        } else if (atom === origins.lodashRunInContext) {
          invocation.result.add(origins.lodashObject);
        } else if (atom === origins.knownSafeCallable) {
          invocation.result.add(knownDataAtom);
        } else if (atom === origins.arrayObject) {
          mergeValue(invocation.result, arrayConstructorValue(argumentValues, invocationNode, argumentExpansion));
        } else if (atom === origins.arrayFrom) {
          mergeInvocation(invocation, arrayFromValue(argumentValues, invocationNode));
        } else if (atom === origins.arrayMap) {
          mergeInvocation(invocation, arrayMapValue(argumentValues, thisValue ?? new Set(), invocationNode));
        } else if (atom === origins.arrayOf) {
          mergeValue(invocation.result, arrayOfValue(argumentValues, invocationNode, argumentExpansion));
        } else if (atom === origins.arrayIterator) {
          const receiver = thisValue ?? new Set();
          const expansion = positionalLayouts(receiver);
          invocation.result.add(
            valueIteratorInvocationFor(
              invocationNode,
              allPositionalValues(expansion),
              receiver,
              expansion.uncertainPositioning
            )
          );
        } else if (atom === origins.mapObject) {
          mergeValue(invocation.result, mapObjectValue(argumentValues, invocationNode));
        } else if (atom === origins.setObject) {
          mergeValue(invocation.result, setObjectValue(argumentValues, invocationNode));
        } else if (atom === origins.mapGet) {
          mergeValue(invocation.result, mapLookupValue(thisValue ?? new Set(), argumentValues[0] ?? new Set()));
        } else if (atom === origins.mapSet) {
          if (
            activeDormantInvocationDepth === 0 &&
            (activeFunctionInvocationState() || !enclosingFunctionNode(invocationNode))
          ) {
            const writeRank = deterministicWriteRank(invocationNode);
            const strong =
              activeAlternativeMutationDepth === 0 &&
              writeRank !== undefined &&
              (thisValue?.size ?? 0) === 1 &&
              propertyNamesFromValue(argumentValues[0] ?? new Set())?.length === 1;
            for (const receiver of thisValue ?? []) {
              if (typeof receiver !== 'string' && receiver.kind === 'carrier' && receiver.collectionKind === 'map') {
                putMapEntry(
                  receiver,
                  argumentValues[0] ?? unknownValue(),
                  argumentValues[1] ?? unknownValue(),
                  writeRank,
                  strong
                );
              }
            }
          }
          mergeValue(invocation.result, thisValue ?? new Set());
        } else if (atom === origins.mapClear) {
          clearCollection(thisValue ?? new Set(), invocationNode, 'map');
          mergeValue(invocation.result, literalValue(undefined));
        } else if (atom === origins.setAdd) {
          if (
            activeDormantInvocationDepth === 0 &&
            (activeFunctionInvocationState() || !enclosingFunctionNode(invocationNode))
          ) {
            for (const receiver of thisValue ?? []) {
              if (typeof receiver !== 'string' && receiver.kind === 'carrier' && receiver.collectionKind === 'set') {
                mergeCollectionValue(
                  receiver,
                  argumentValues[0] ?? unknownValue(),
                  deterministicWriteRank(invocationNode)
                );
              }
            }
          }
          mergeValue(invocation.result, thisValue ?? new Set());
        } else if (atom === origins.setClear) {
          clearCollection(thisValue ?? new Set(), invocationNode, 'set');
          mergeValue(invocation.result, literalValue(undefined));
        } else if (atom === origins.mapKeys || atom === origins.mapValues || atom === origins.setValues) {
          const values = collectionValues(
            thisValue ?? new Set(),
            atom === origins.setValues ? 'set' : 'map',
            atom === origins.mapKeys
          );
          invocation.result.add(
            valueIteratorInvocationFor(invocationNode, values.result, thisValue ?? new Set(), values.unknown)
          );
        } else if (atom === origins.mapEntries) {
          const entries = collectionEntryValues(thisValue ?? new Set(), invocationNode);
          invocation.result.add(
            valueIteratorInvocationFor(invocationNode, entries.result, thisValue ?? new Set(), entries.unknown)
          );
        } else if (atom === origins.setEntries) {
          const entries = setEntryValues(thisValue ?? new Set(), invocationNode);
          invocation.result.add(
            valueIteratorInvocationFor(invocationNode, entries.result, thisValue ?? new Set(), entries.unknown)
          );
        } else if (atom === origins.objectEntries || atom === origins.objectValues) {
          mergeValue(
            invocation.result,
            objectProjectionValue(argumentValues, invocationNode, atom === origins.objectEntries)
          );
        } else if (
          typeof atom !== 'string' &&
          atom.kind === 'function-value' &&
          (atom.outerReturnBindings.size > 0 ||
            atom.hasInvocationEffects ||
            atom.hasGetterReads ||
            atom.mutationDependentReturn ||
            atom.parameterDependentReturn ||
            atom.receiverDependentReturn ||
            atom.returnProvenanceUncertain ||
            atom.trackCallResult === true ||
            atom.mayTrackCallResult ||
            forcedLocalFunctionInvocation ||
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
          mergeValue(invocation.result, iteratorNextResultValue(atom.iteratorInstance, invocationNode));
        } else if (atom === origins.objectCreate) {
          mergeValue(invocation.result, createObjectValue(argumentValues, invocationNode));
        } else if (atom === origins.reflectApply || atom === origins.reflectConstruct) {
          const target = argumentValues[0] ?? new Set();
          if (hasUnknownValue(target)) invocation.kinds.add(unknownReflectTargetLimitKind);
          const argumentCarrier = argumentValues[atom === origins.reflectApply ? 2 : 1] ?? new Set();
          const targetThisValue = atom === origins.reflectApply ? argumentValues[1] : undefined;
          const expansion = positionalLayouts(argumentCarrier);
          forEachMutationLayout(expansion, true, layout => {
            mergeInvocation(
              invocation,
              invokeTracked(
                target,
                layout,
                invocationNode,
                seen,
                targetThisValue,
                true,
                forceFunctionInvocation,
                expansion
              )
            );
          });
          if (hasUnsafeCallable(target)) mergePositionalLimit(invocation, expansion);
          if (
            invocation.kinds.has(unknownReflectTargetLimitKind) &&
            invocation.kinds.has(analysisLimitKind) &&
            (invocation.kinds.has('direct-eval') || invocation.kinds.has('lodash-template'))
          ) {
            invocation.kinds.delete(unknownReflectTargetLimitKind);
          }
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
              suppressUnknownCallableLimit,
              forceFunctionInvocation,
              shiftedPositionalOverflow(argumentExpansion, -1)
            )
          );
        } else if (atom === origins.functionPrototypeApply) {
          const expansion = positionalLayouts(argumentValues[1] ?? new Set());
          forEachMutationLayout(expansion, true, layout => {
            mergeInvocation(
              invocation,
              invokeTracked(
                thisValue ?? new Set(),
                layout,
                invocationNode,
                seen,
                argumentValues[0],
                suppressUnknownCallableLimit,
                forceFunctionInvocation,
                expansion
              )
            );
          });
          if (hasUnsafeCallable(thisValue ?? new Set())) mergePositionalLimit(invocation, expansion);
        } else if (atom === origins.functionPrototypeBind) {
          invocation.result.add(
            boundCallableFor(
              invocationNode,
              thisValue ?? new Set(),
              argumentValues[0] ?? new Set(),
              argumentValues.slice(1),
              shiftedPositionalOverflow(argumentExpansion, -1)
            )
          );
        } else if (
          applyPositionalMutationIntrinsic(atom, argumentValues, thisValue, invocationNode, invocation.result)
        ) {
          if (typeof atom !== 'string' && atom.kind === 'positional-mutator') {
            const source = thisValue ?? new Set();
            const expansion = positionalLayouts(source);
            if (atom.method === 'pop' || atom.method === 'shift') {
              mergeValue(invocation.result, allPositionalValues(expansion));
            } else if (atom.method === 'splice') {
              const removed = syntheticCarrierFor(invocationNode, 'splice-result', true);
              const removedValues = allPositionalValues(expansion);
              putCarrierProperty(removed, undefined, removedValues);
              mergeCarrierPositionalState(removed, new Set(), true, removedValues);
              invocation.result.add(removed);
            } else if (['copyWithin', 'fill', 'reverse', 'sort'].includes(atom.method)) {
              mergeValue(invocation.result, source);
            }
          } else if (
            atom === origins.objectAssign ||
            atom === origins.objectDefineProperties ||
            atom === origins.objectDefineProperty ||
            atom === origins.objectFreeze ||
            atom === origins.objectPreventExtensions ||
            atom === origins.objectSeal ||
            atom === origins.objectSetPrototypeOf
          ) {
            mergeValue(invocation.result, argumentValues[0] ?? new Set());
          } else if (atom === origins.reflectDeleteProperty || atom === origins.reflectSetPrototypeOf) {
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
            trackPropagationDependency(atom.boundOverflowValues);
            mergeInvocation(
              invocation,
              invokeTracked(
                atom.target,
                [...atom.boundArguments, ...argumentValues],
                invocationNode,
                nextSeen,
                atom.boundThis,
                suppressUnknownCallableLimit,
                forceFunctionInvocation,
                boundInvocationOverflow(atom, argumentExpansion, argumentValues)
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
                suppressUnknownCallableLimit,
                forceFunctionInvocation
              )
            );
          } else if (atom.kind === 'invocation-method' && atom.method === 'apply') {
            trackPropagationDependency(atom.target);
            const expansion = positionalLayouts(argumentValues[1] ?? new Set());
            forEachMutationLayout(expansion, true, layout => {
              mergeInvocation(
                invocation,
                invokeTracked(
                  atom.target,
                  layout,
                  invocationNode,
                  nextSeen,
                  argumentValues[0],
                  suppressUnknownCallableLimit,
                  forceFunctionInvocation,
                  expansion
                )
              );
            });
            if (hasUnsafeCallable(atom.target)) mergePositionalLimit(invocation, expansion);
          } else if (atom.kind === 'invocation-method' && atom.method === 'bind') {
            trackPropagationDependency(atom.target);
            invocation.result.add(
              boundCallableFor(
                invocationNode,
                atom.target,
                argumentValues[0] ?? new Set(),
                argumentValues.slice(1),
                shiftedPositionalOverflow(argumentExpansion, -1)
              )
            );
          }
        }
      }
    } finally {
      if (alternativeCallable) activeAlternativeMutationDepth -= 1;
      activeCallableRecursionDepth -= 1;
    }
    return invocation;
  }

  function recordInvocationEvidence(invocationNode, kinds) {
    const unsafeKinds = [...kinds].filter(kind => kind === 'direct-eval' || kind === 'lodash-template');
    if (unsafeKinds.length === 0) return;
    let evidence = invocationEvidence.get(invocationNode);
    if (!evidence) {
      evidence = new Set();
      invocationEvidence.set(invocationNode, evidence);
    }
    for (const kind of unsafeKinds) evidence.add(kind);
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
    const alternativeCallable = callable.size !== 1;
    activeMutationRecursionDepth += 1;
    if (alternativeCallable) activeAlternativeMutationDepth += 1;
    try {
      for (const atom of callable) {
        if (atom === origins.reflectApply) {
          if (!consumeDependencyCompositionWork(invocationNode)) return;
          const expansion = positionalLayouts(argumentValues[2] ?? new Set());
          const completed = forEachMutationLayout(expansion, true, layout => {
            invokePositionalMutators(argumentValues[0] ?? new Set(), layout, invocationNode, seen, argumentValues[1]);
            return !analysisStopped();
          });
          if (!completed) return;
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
          const completed = forEachMutationLayout(expansion, true, layout => {
            invokePositionalMutators(thisValue ?? new Set(), layout, invocationNode, seen, argumentValues[0]);
            return !analysisStopped();
          });
          if (!completed) return;
        } else if (applyPositionalMutationIntrinsic(atom, argumentValues, thisValue, invocationNode)) {
          const hasWork = isNonComposingIntrinsic(atom)
            ? consumeAnalysisWork(invocationNode)
            : consumeDependencyCompositionWork(invocationNode);
          if (!hasWork) return;
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
            const completed = forEachMutationLayout(expansion, true, layout => {
              invokePositionalMutators(atom.target, layout, invocationNode, nextSeen, argumentValues[0]);
              return !analysisStopped();
            });
            if (!completed) return;
          }
        }
      }
    } finally {
      if (alternativeCallable) activeAlternativeMutationDepth -= 1;
      activeMutationRecursionDepth -= 1;
    }
  }

  function mergeExpansionOverflow(expansion, overflowStart, overflowValues) {
    if (overflowStart === undefined) return;
    const boundedStart = Math.max(0, Math.min(overflowStart, maximumTrackedInvocationArguments));
    if (expansion.positionalOverflowStart === undefined || boundedStart < expansion.positionalOverflowStart) {
      expansion.positionalOverflowStart = boundedStart;
    }
    mergeValue(expansion.overflowPositionalValues, overflowValues);
  }

  function appendPositionalValue(expansion, layout, value) {
    const result = [...layout];
    if (expansion.positionalOverflowStart !== undefined) {
      mergeValue(expansion.overflowPositionalValues, value);
    } else if (result.length < maximumTrackedInvocationArguments) {
      result.push(value);
    } else {
      mergeExpansionOverflow(expansion, maximumTrackedInvocationArguments, value);
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
    expansion.layouts = expansion.layouts.map(layout => appendPositionalValue(expansion, layout, value));
    if (expansion.saturatedLayouts.size > 0) {
      const appendedSummaries = new Map();
      for (const layout of expansion.saturatedLayouts.values()) {
        mergeLayoutSummary(appendedSummaries, appendPositionalValue(expansion, layout, value));
      }
      expansion.saturatedLayouts = appendedSummaries;
    }
  }

  function combinedPositionalLayout(expansion, prefix, suffix) {
    let layout = [...prefix];
    for (const value of suffix) layout = appendPositionalValue(expansion, layout, value);
    return layout;
  }

  function appendSpreadExpansion(expansion, spreadExpansion) {
    const prefixLayouts = expansion.layouts;
    const prefixSaturatedLayouts = expansion.saturatedLayouts;
    if (expansion.uncertainPositioning) mergeLayoutValues(expansion.uncertainValues, spreadExpansion.layouts);
    mergeValue(expansion.uncertainValues, spreadExpansion.uncertainValues);
    if (spreadExpansion.uncertainPositioning) {
      expansion.uncertainPositioning = true;
      mergeLayoutValues(expansion.uncertainValues, spreadExpansion.layouts);
    }
    expansion.unmodeledPositioning = expansion.unmodeledPositioning || spreadExpansion.unmodeledPositioning;
    const suffixes = spreadExpansion.layouts.length > 0 ? spreadExpansion.layouts : [[]];
    const combined = [];
    const saturatedLayouts = new Map();
    for (const prefix of prefixLayouts) {
      for (const suffix of suffixes) {
        const layout = combinedPositionalLayout(expansion, prefix, suffix);
        if (combined.length < maximumTrackedPositionalAlternatives) {
          combined.push(layout);
        } else {
          expansion.uncertainPositioning = true;
          mergeLayoutSummary(saturatedLayouts, layout);
          mergeLayoutValues(expansion.uncertainValues, [layout]);
        }
      }
    }
    for (const prefixSummary of prefixSaturatedLayouts.values()) {
      for (const suffix of suffixes) {
        mergeLayoutSummary(saturatedLayouts, combinedPositionalLayout(expansion, prefixSummary, suffix));
      }
    }
    for (const suffixSummary of spreadExpansion.saturatedLayouts.values()) {
      for (const prefix of prefixLayouts) {
        mergeLayoutSummary(saturatedLayouts, combinedPositionalLayout(expansion, prefix, suffixSummary));
      }
      for (const prefixSummary of prefixSaturatedLayouts.values()) {
        mergeLayoutSummary(saturatedLayouts, combinedPositionalLayout(expansion, prefixSummary, suffixSummary));
      }
    }
    expansion.layouts = combined;
    expansion.saturatedLayouts = saturatedLayouts;
    if (spreadExpansion.positionalOverflowStart !== undefined) {
      const shiftedOverflowStart = Math.min(
        ...prefixLayouts.map(prefix => prefix.length + spreadExpansion.positionalOverflowStart)
      );
      mergeExpansionOverflow(expansion, shiftedOverflowStart, spreadExpansion.overflowPositionalValues);
    }
  }

  function positionalExpansionForNodes(nodes) {
    const expansion = {
      layouts: [[]],
      saturatedLayouts: new Map(),
      uncertainPositioning: false,
      unmodeledPositioning: false,
      uncertainValues: new Set(),
      positionalOverflowStart: undefined,
      overflowPositionalValues: new Set(),
    };
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

  function forEachMutationLayout(expansion, useEmptyFallback, visit) {
    let candidateLayouts = [...expansion.layouts];
    for (const layout of expansion.saturatedLayouts.values()) {
      candidateLayouts.push(layout.map(value => new Set(value)));
    }
    if (useEmptyFallback && candidateLayouts.length === 0) candidateLayouts = [[]];
    let layouts = candidateLayouts;
    if (candidateLayouts.length > 1 && candidateLayouts.every(layout => layout.length === candidateLayouts[0].length)) {
      const mergedLayout = Array.from({ length: candidateLayouts[0].length }, () => new Set());
      for (const layout of candidateLayouts) {
        for (const [index, value] of layout.entries()) mergeValue(mergedLayout[index], value);
      }
      layouts = [mergedLayout];
    }
    const alternativeLayout =
      expansion.unmodeledPositioning || expansion.positionalOverflowStart !== undefined || layouts.length !== 1;
    if (alternativeLayout) activeAlternativeMutationDepth += 1;
    try {
      for (const layout of layouts) {
        if (visit(layout) === false) return false;
      }
      return true;
    } finally {
      if (alternativeLayout) activeAlternativeMutationDepth -= 1;
    }
  }

  function evaluateInvocation(calleeNode, argumentNodes, invocationNode) {
    const dormant = !activeFunctionInvocationState() && Boolean(enclosingFunctionNode(invocationNode));
    const cached = dormant ? dormantInvocationResults.get(invocationNode) : undefined;
    if (cached) return cached;
    if (dormant) activeDormantInvocationDepth += 1;
    try {
      const callee = evaluateExpression(calleeNode);
      const unwrappedCallee = unwrapExpression(calleeNode);
      const thisValue =
        ts.isPropertyAccessExpression(unwrappedCallee) || ts.isElementAccessExpression(unwrappedCallee)
          ? evaluateExpression(unwrappedCallee.expression)
          : undefined;
      const expansion = positionalExpansionForNodes(argumentNodes);
      const invocation = { result: new Set(), kinds: new Set() };
      forEachMutationLayout(expansion, false, layout => {
        mergeInvocation(
          invocation,
          invokeTracked(callee, layout, invocationNode, new Set(), thisValue, false, false, expansion)
        );
      });
      if (hasUnsafeCallable(callee)) mergePositionalLimit(invocation, expansion);
      if (
        invocation.kinds.has(unknownReflectTargetLimitKind) &&
        invocation.kinds.has(analysisLimitKind) &&
        (invocation.kinds.has('direct-eval') || invocation.kinds.has('lodash-template'))
      ) {
        invocation.kinds.delete(unknownReflectTargetLimitKind);
      }
      recordInvocationEvidence(invocationNode, invocation.kinds);
      if (dormant) dormantInvocationResults.set(invocationNode, invocation);
      return invocation;
    } finally {
      if (dormant) activeDormantInvocationDepth -= 1;
    }
  }

  function invalidateIndirectPositionalMutationCall(node) {
    const callee = evaluateExpression(node.expression);
    const unwrappedCallee = unwrapExpression(node.expression);
    const thisValue =
      ts.isPropertyAccessExpression(unwrappedCallee) || ts.isElementAccessExpression(unwrappedCallee)
        ? evaluateExpression(unwrappedCallee.expression)
        : undefined;
    const expansion = positionalExpansionForNodes([...node.arguments]);
    forEachMutationLayout(expansion, false, layout => {
      invokePositionalMutators(callee, layout, node, new Set(), thisValue);
      return !analysisStopped();
    });
  }

  function invalidateUnknownInvocationCarrierEffects(node) {
    const callee = evaluateExpression(node.expression);
    const unknownCallees = [...callee].filter(atom => typeof atom !== 'string' && atom.kind === 'unknown-value');
    if (unknownCallees.length === 0) return;
    if (
      !activeFunctionInvocationState()?.allowUnknownCarrierInvalidation &&
      unknownCallees.every(atom => atom.callableReason === undefined)
    ) {
      return;
    }
    const unwrappedCallee = unwrapExpression(node.expression);
    const possibleTargets = positionalExpansionForNodes([...node.arguments]).layouts.flat();
    if (ts.isPropertyAccessExpression(unwrappedCallee) || ts.isElementAccessExpression(unwrappedCallee)) {
      possibleTargets.push(evaluateExpression(unwrappedCallee.expression));
    }
    for (const targetValue of possibleTargets) {
      const carriers = new Set([...targetValue].filter(atom => typeof atom !== 'string' && atom.kind === 'carrier'));
      if (carriers.size === 0) continue;
      for (const carrier of carriers) {
        if (carrier.collectionKind) markCollectionUnknown(carrier);
      }
      invalidatePositionalTargets(carriers, undefined, unknownReflectiveCallableValue());
      recordTargetProperty(carriers, undefined, unknownReflectiveCallableValue());
      setCarrierPrototypes(carriers, unknownReflectiveCallableValue(), true);
    }
  }

  function callableHasLocalCarrierEffects(value, seen = new Set()) {
    for (const atom of value) {
      if (typeof atom === 'string' || seen.has(atom)) continue;
      seen.add(atom);
      if (atom.kind === 'function-value' && (atom.hasInvocationEffects || atom.effectProvenanceUncertain)) {
        return true;
      }
      if (
        (atom.kind === 'bound-callable' || atom.kind === 'invocation-method') &&
        callableHasLocalCarrierEffects(atom.target, seen)
      ) {
        return true;
      }
    }
    return false;
  }

  function callableContainsOrigin(value, origin, seen = new Set()) {
    for (const atom of value) {
      if (atom === origin) return true;
      if (typeof atom === 'string' || seen.has(atom)) continue;
      seen.add(atom);
      if (
        (atom.kind === 'bound-callable' || atom.kind === 'invocation-method') &&
        callableContainsOrigin(atom.target, origin, seen)
      ) {
        return true;
      }
    }
    return false;
  }

  function callableHasGetterCarrierEffects(value, argumentValues, thisValue, seen = new Set()) {
    for (const atom of value) {
      if (typeof atom === 'string' || seen.has(atom)) continue;
      seen.add(atom);
      if (
        atom.kind === 'function-value' &&
        atom.hasGetterReads &&
        functionInvocationMayAffectCarrier(atom, argumentValues, thisValue)
      ) {
        return true;
      }
      if (atom.kind === 'bound-callable') {
        if (
          callableHasGetterCarrierEffects(
            atom.target,
            [...atom.boundArguments, ...argumentValues],
            atom.boundThis,
            seen
          )
        ) {
          return true;
        }
      } else if (atom.kind === 'invocation-method') {
        if (
          callableHasGetterCarrierEffects(
            atom.target,
            atom.method === 'call' ? argumentValues.slice(1) : argumentValues,
            atom.method === 'call' ? argumentValues[0] : thisValue,
            seen
          )
        ) {
          return true;
        }
      }
    }
    return false;
  }

  function callableHasGetterReads(value, seen = new Set()) {
    for (const atom of value) {
      if (typeof atom === 'string' || seen.has(atom)) continue;
      seen.add(atom);
      if (atom.kind === 'function-value' && atom.hasGetterReads) return true;
      if (
        (atom.kind === 'bound-callable' || atom.kind === 'invocation-method') &&
        callableHasGetterReads(atom.target, seen)
      ) {
        return true;
      }
    }
    return false;
  }

  function markInvocationTargetCarriers(node, seen = new Set()) {
    const current = unwrapExpression(node);
    if (seen.has(current)) return;
    seen.add(current);
    markInvocationTargetSensitive(evaluateExpression(current));
    if (ts.isPropertyAccessExpression(current) || ts.isElementAccessExpression(current)) {
      markInvocationTargetCarriers(current.expression, seen);
      return;
    }
    if (ts.isCallExpression(current) || ts.isNewExpression(current)) {
      markInvocationTargetCarriers(current.expression, seen);
      for (const argument of current.arguments ?? []) {
        markInvocationTargetCarriers(ts.isSpreadElement(argument) ? argument.expression : argument, seen);
      }
      return;
    }
    if (ts.isConditionalExpression(current)) {
      markInvocationTargetCarriers(current.whenTrue, seen);
      markInvocationTargetCarriers(current.whenFalse, seen);
      return;
    }
    if (
      ts.isBinaryExpression(current) &&
      [
        ts.SyntaxKind.BarBarToken,
        ts.SyntaxKind.AmpersandAmpersandToken,
        ts.SyntaxKind.QuestionQuestionToken,
        ts.SyntaxKind.CommaToken,
      ].includes(current.operatorToken.kind)
    ) {
      markInvocationTargetCarriers(current.left, seen);
      markInvocationTargetCarriers(current.right, seen);
    }
  }

  function invocationTargetIsKnownNonCallable(node) {
    const current = unwrapExpression(node);
    if (!ts.isPropertyAccessExpression(current) && !ts.isElementAccessExpression(current)) return false;
    const propertyNames = memberPropertyNames(current);
    if (propertyNames?.length !== 1) return false;
    const propertyName = propertyNames[0];
    const receiverValue = evaluateExpression(current.expression);
    if (receiverValue.size === 0) return false;
    for (const atom of receiverValue) {
      if (typeof atom === 'string' || atom.kind !== 'carrier') return false;
      if (atom.positional) {
        if (!nonCallableArrayMethodResults.has(propertyName)) return false;
      } else if (atom.collectionKind) {
        if (!nonCallableCollectionMethodResults.has(propertyName)) return false;
      } else {
        return false;
      }
    }
    return true;
  }

  function markUnsafeInvocationCarriers(node) {
    const callee = evaluateExpression(node.expression);
    if (!invocationTargetIsKnownNonCallable(node.expression)) {
      markInvocationTargetCarriers(node.expression);
    }
    if (!hasUnsafeCallable(callee)) return callee;
    const unwrappedCallee = unwrapExpression(node.expression);
    if (ts.isPropertyAccessExpression(unwrappedCallee) || ts.isElementAccessExpression(unwrappedCallee)) {
      markInvocationSensitive(evaluateExpression(unwrappedCallee.expression));
    }
    for (const argument of node.arguments) {
      markInvocationSensitive(evaluateExpression(ts.isSpreadElement(argument) ? argument.expression : argument));
    }
    return callee;
  }

  function evaluateExpression(node) {
    if (!node) return new Set();
    const current = unwrapExpression(node);
    if (current.kind === ts.SyntaxKind.ThisKeyword) {
      return activeFunctionReceiver ?? new Set([opaqueThisValueAtom]);
    }
    if (ts.isIdentifier(current)) return identifierValue(current);
    if (ts.isStringLiteralLike(current)) return literalValue(current.text);
    if (ts.isNumericLiteral(current)) return literalValue(Number(current.text));
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
            putCarrierProperty(carrier, propertyNames, propertyValue, deterministicWriteRank(property.initializer));
          }
        } else if (ts.isShorthandPropertyAssignment(property)) {
          putCarrierProperty(
            carrier,
            [property.name.text],
            evaluateExpression(property.name),
            deterministicWriteRank(property.name)
          );
        } else if (ts.isSpreadAssignment(property)) {
          spreadProperties(carrier, evaluateExpression(property.expression));
        } else if (ts.isMethodDeclaration(property)) {
          putCarrierProperty(
            carrier,
            declaredPropertyNames(property.name),
            functionValue(property),
            deterministicWriteRank(property)
          );
        } else if (ts.isGetAccessorDeclaration(property)) {
          const propertyNames = declaredPropertyNames(property.name);
          recordTargetAccessor(new Set([carrier]), propertyNames, 'get', functionValue(property), property, true);
        } else if (ts.isSetAccessorDeclaration(property)) {
          recordTargetAccessor(
            new Set([carrier]),
            declaredPropertyNames(property.name),
            'set',
            functionValue(property),
            property,
            true
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
          putCarrierProperty(
            carrier,
            [String(index)],
            value,
            deterministicWriteRank(current.elements[index] ?? current)
          );
        }
      }
      mergeCarrierPositionalState(carrier, lengths, expansion.uncertainPositioning, expansion.uncertainValues);
      if (![...current.elements].some(ts.isSpreadElement)) {
        mergeCarrierExactPositionalLengths(carrier, new Set([current.elements.length]));
        for (const [offset, element] of current.elements
          .slice(maximumTrackedInvocationArguments, maximumTrackedInvocationArguments * 2)
          .entries()) {
          if (ts.isOmittedExpression(element)) continue;
          putCarrierProperty(
            carrier,
            [String(maximumTrackedInvocationArguments + offset)],
            evaluateExpression(element),
            deterministicWriteRank(element)
          );
        }
        mergeCarrierOverflowOwnProperties(
          carrier,
          new Set(
            current.elements
              .slice(maximumTrackedInvocationArguments, maximumTrackedInvocationArguments * 2)
              .flatMap((element, index) =>
                ts.isOmittedExpression(element) ? [] : [maximumTrackedInvocationArguments + index]
              )
          )
        );
      }
      mergeCarrierPositionalOverflow(carrier, expansion.positionalOverflowStart, expansion.overflowPositionalValues);
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
      if (current.operatorToken.kind === ts.SyntaxKind.CommaToken) {
        evaluateExpression(current.left);
        return evaluateExpression(current.right);
      }
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
      return new Set([knownDataAtom]);
    }

    if (
      ts.isPrefixUnaryExpression(current) &&
      [ts.SyntaxKind.PlusToken, ts.SyntaxKind.MinusToken].includes(current.operator)
    ) {
      const operand = evaluateExpression(current.operand);
      if (operand.size === 1) {
        const atom = [...operand][0];
        if (typeof atom !== 'string' && atom.kind === 'literal' && atom.valueType === 'number') {
          return literalValue(current.operator === ts.SyntaxKind.MinusToken ? -atom.value : atom.value);
        }
      }
      return new Set([knownDataAtom]);
    }

    if (ts.isAwaitExpression(current) || ts.isYieldExpression(current) || ts.isSpreadElement(current)) {
      return evaluateExpression(current.expression);
    }
    if (
      ts.isPrefixUnaryExpression(current) ||
      ts.isPostfixUnaryExpression(current) ||
      ts.isTemplateExpression(current)
    ) {
      return new Set([knownDataAtom]);
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
      if (binding) {
        const invocationValue = activeInvocationBindingValue(binding, true);
        if (invocationValue) mergeValue(invocationValue, value);
        else mergeTracked(binding.value, value);
      }
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
        const invocationValue = activeInvocationBindingValue(binding, true);
        if (invocationValue) mergeValue(invocationValue, value);
        else mergeTracked(binding.value, value);
      }
      return;
    }
    if (ts.isPropertyAccessExpression(current) || ts.isElementAccessExpression(current)) {
      const propertyNames = memberPropertyNames(current);
      const targetValue = evaluateExpression(current.expression);
      const indexedWrite = propertyNames?.length === 1 && /^(0|[1-9]\d*)$/.test(propertyNames[0]);
      if (indexedWrite && hasUnsafeCallable(value)) {
        recordTargetProperty(targetValue, propertyNames, retainReflectiveCallableProvenance(value), current);
        return;
      }
      const indexedWriteSuccess = indexedWrite
        ? reflectivePropertyWriteSuccessIsProven(targetValue, propertyNames, targetValue, false)
        : undefined;
      if (indexedWrite && indexedWriteSuccess !== true) {
        invalidatePositionalTargets(targetValue, propertyNames, retainReflectiveCallableProvenance(value), true);
        return;
      }
      const invokesSetter = accessorMayRun(targetValue, propertyNames, 'set');
      if (invokesSetter) invalidatePositionalTargets(targetValue, undefined, unknownValue());
      invalidatePositionalTargets(targetValue, propertyNames, value, false, !invokesSetter);
      if ((propertyNames === undefined || propertyNames.includes('__proto__')) && invokesSetter) {
        setCarrierPrototypes(targetValue, value, propertyNames?.includes('__proto__') === true);
      } else {
        let descriptorAttributes;
        if (indexedWriteSuccess === true && targetValue.size === 1) {
          const target = [...targetValue][0];
          if (typeof target !== 'string' && target.kind === 'carrier') {
            descriptorAttributes = successfulIndexedSetAttributes(target, propertyNames[0]);
          }
        }
        recordTargetProperty(targetValue, propertyNames, value, current, !invokesSetter, descriptorAttributes);
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
    if (name.text === 'Map') return originValue(origins.mapObject);
    if (name.text === 'Object') return originValue(origins.objectObject);
    if (globalEvalObjects.has(name.text)) return originValue(origins.globalObject);
    if (name.text === 'Reflect') return originValue(origins.reflectObject);
    if (name.text === 'Set') return originValue(origins.setObject);
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
      run = () => {
        const value = node.initializer ? evaluateExpression(node.initializer) : new Set();
        value.delete(unknownValueAtom);
        bindPattern(node.name, value);
      };
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
        const unwrappedCallee = unwrapExpression(node.expression);
        const directPropertyNames =
          ts.isPropertyAccessExpression(unwrappedCallee) || ts.isElementAccessExpression(unwrappedCallee)
            ? memberPropertyNames(unwrappedCallee)
            : undefined;
        const suppressReceiverDependency =
          directPropertyNames?.length === 1 && ['add', 'set'].includes(directPropertyNames[0]);
        const previousSuppression = suppressCarrierPropertyDependency;
        suppressCarrierPropertyDependency = suppressReceiverDependency;
        let callee;
        try {
          invalidatePositionalMutationCall(node);
          invalidateIndirectPositionalMutationCall(node);
          callee = markUnsafeInvocationCarriers(node);
        } finally {
          suppressCarrierPropertyDependency = previousSuppression;
        }
        const thisValue =
          ts.isPropertyAccessExpression(unwrappedCallee) || ts.isElementAccessExpression(unwrappedCallee)
            ? evaluateExpression(unwrappedCallee.expression)
            : undefined;
        const hasGetterReads = callableHasGetterReads(callee);
        const getterEffectInvocation =
          hasGetterReads &&
          positionalExpansionForNodes([...node.arguments]).layouts.some(layout =>
            callableHasGetterCarrierEffects(callee, layout, thisValue)
          );
        const reflectiveLocalEffectInvocation =
          (callableContainsOrigin(callee, origins.reflectApply) ||
            callableContainsOrigin(callee, origins.reflectConstruct)) &&
          node.arguments.length > 0 &&
          callableHasLocalCarrierEffects(evaluateExpression(node.arguments[0]));
        const directKinds = directlyInvokedUnsafeKinds(callee);
        recordInvocationEvidence(node, directKinds);
        const composedReflectiveInvocation =
          directKinds.size === 0 &&
          directPropertyNames?.includes('bind') !== true &&
          (callableContainsOrigin(callee, origins.reflectApply) ||
            callableContainsOrigin(callee, origins.reflectConstruct));
        if (
          (composedReflectiveInvocation && directKinds.size === 0) ||
          callableHasLocalCarrierEffects(callee) ||
          getterEffectInvocation ||
          reflectiveLocalEffectInvocation
        ) {
          evaluateInvocation(node.expression, [...node.arguments], node);
        }
      };
    } else if (ts.isNewExpression(node)) {
      run = () => {
        const callee = evaluateExpression(node.expression);
        const directKinds = directlyInvokedUnsafeKinds(callee);
        recordInvocationEvidence(node, directKinds);
        const composedReflectiveInvocation =
          directKinds.size === 0 &&
          (callableContainsOrigin(callee, origins.reflectApply) ||
            callableContainsOrigin(callee, origins.reflectConstruct));
        if ((composedReflectiveInvocation && directKinds.size === 0) || callableHasLocalCarrierEffects(callee)) {
          evaluateInvocation(node.expression, [...(node.arguments ?? [])], node);
        }
      };
    } else if (ts.isTaggedTemplateExpression(node)) {
      run = () => {
        const callee = evaluateExpression(node.tag);
        const directKinds = directlyInvokedUnsafeKinds(callee);
        recordInvocationEvidence(node, directKinds);
        if (hasUnsafeCallable(callee) && directKinds.size === 0) {
          evaluateInvocation(node.tag, [], node);
        }
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
    const dormantPropagation = Boolean(enclosingFunctionNode(operation.node));
    if (dormantPropagation) activeDormantPropagationDepth += 1;
    try {
      if (!consumeAnalysisWork(operation.node)) break;
      operation.run();
    } finally {
      if (dormantPropagation) activeDormantPropagationDepth -= 1;
      activePropagationOperation = undefined;
      activeAnalysisNode = sourceFile;
    }
  }

  function unsafeKindsForCall(node) {
    const kinds = new Set(invocationEvidence.get(node) ?? []);
    for (const kind of evaluateInvocation(node.expression, [...node.arguments], node).kinds) kinds.add(kind);
    return kinds;
  }

  function unsafeKindsForNew(node) {
    const kinds = new Set(invocationEvidence.get(node) ?? []);
    for (const kind of evaluateInvocation(node.expression, [...(node.arguments ?? [])], node).kinds) kinds.add(kind);
    return kinds;
  }

  function unsafeKindsForTag(node) {
    const kinds = new Set(invocationEvidence.get(node) ?? []);
    for (const kind of evaluateInvocation(node.tag, [], node).kinds) kinds.add(kind);
    return kinds;
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
