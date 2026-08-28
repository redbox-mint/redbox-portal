import Handlebars from 'handlebars';
import jsonata from 'jsonata';
import { normaliseVisual } from '@researchdatabox/sails-ng-common/dist/src/config/names/naming-helpers';
import {
  isRuntimeArray,
  isRuntimeRecord,
  readRuntimeProperty,
  type RuntimeRecord,
  type RuntimeValue,
} from '../runtimeValues';
import { isForbiddenExpressionContextKey } from './contexts';
import { ManagedExpressionError } from './errors';
import { EXPRESSION_ARTIFACT_SCHEMA_VERSION, EXPRESSION_RUNTIME_LIMITS } from './limits';
import type { ManagedTemplateDestination, PreparedHandlebarsTemplate, PreparedJsonataExpression } from './types';

const FORBIDDEN_JSONATA_BINDINGS = new Set([
  '__proto__',
  'constructor',
  'env',
  'environment',
  'eval',
  'filesystem',
  'fs',
  'global',
  'globalThis',
  'jsonata',
  'lookup',
  'process',
  'prototype',
  'request',
  'response',
  'sails',
  'secret',
  'services',
]);

export const MANAGED_JSONATA_CUSTOM_FUNCTION_NAMES: readonly string[] = Object.freeze([
  'guessNameParts',
  'luxonFormatDate',
]);

export const MANAGED_HANDLEBARS_HELPER_NAMES: readonly string[] = Object.freeze([
  'and',
  'concat',
  'default',
  'emailList',
  'eq',
  'formatDate',
  'gt',
  'gte',
  'isArray',
  'isDefined',
  'isEmpty',
  'isNull',
  'isObject',
  'isUndefined',
  'join',
  'lt',
  'lte',
  'ne',
  'not',
  'or',
  'parseDateString',
  'split',
  'substring',
  'toLower',
  'toUpper',
  'trim',
  'urlEncode',
]);

const MANAGED_HANDLEBARS_HELPERS = new Set(MANAGED_HANDLEBARS_HELPER_NAMES);
const MANAGED_HANDLEBARS_BLOCK_HELPERS = new Set(['each', 'if', 'unless', 'with']);
const FORBIDDEN_HANDLEBARS_HELPERS = new Set([
  'attachmentDownloadUrl',
  'blockHelperMissing',
  'get',
  'helperMissing',
  'json',
  'log',
  'lookup',
  'markdownToHtml',
  'plaintextToHtml',
  'pluck',
  'renderMetadataValue',
  't',
]);
const TEMPLATE_DESTINATIONS = new Set<ManagedTemplateDestination>([
  'plain-text',
  'html-text',
  'email-subject',
  'url-component',
]);

interface AstTask {
  readonly value: RuntimeValue;
  readonly depth: number;
}

function astChildren(node: RuntimeRecord): RuntimeValue[] {
  return Object.values(node);
}

function nodeString(node: RuntimeRecord, property: string): string | undefined {
  const value = readRuntimeProperty(node, property);
  return typeof value === 'string' ? value : undefined;
}

function jsonataBindingIsForbidden(value: string): boolean {
  return FORBIDDEN_JSONATA_BINDINGS.has(value.replace(/^\$/, ''));
}

function validateJsonataAst(ast: RuntimeValue): number {
  const pending: AstTask[] = [{ value: ast, depth: 0 }];
  let nodes = 0;
  while (pending.length > 0) {
    const task = pending.pop();
    if (task === undefined) {
      continue;
    }
    if (task.depth > EXPRESSION_RUNTIME_LIMITS.maxAstDepth) {
      throw new ManagedExpressionError('jsonata', 'limit', 'jsonata-ast-depth-exceeded');
    }
    if (isRuntimeArray(task.value)) {
      for (const child of task.value) {
        pending.push({ value: child, depth: task.depth + 1 });
      }
      continue;
    }
    if (!isRuntimeRecord(task.value)) {
      continue;
    }

    nodes += 1;
    if (nodes > EXPRESSION_RUNTIME_LIMITS.maxAstNodes) {
      throw new ManagedExpressionError('jsonata', 'limit', 'jsonata-ast-nodes-exceeded');
    }
    const type = nodeString(task.value, 'type');
    const value = nodeString(task.value, 'value');
    if (type === 'variable' && value !== undefined && jsonataBindingIsForbidden(value)) {
      throw new ManagedExpressionError('jsonata', 'validation', 'jsonata-binding-forbidden');
    }
    if (type === 'name' && value !== undefined && isForbiddenExpressionContextKey(value)) {
      throw new ManagedExpressionError('jsonata', 'validation', 'jsonata-property-forbidden');
    }
    for (const child of astChildren(task.value)) {
      pending.push({ value: child, depth: task.depth + 1 });
    }
  }
  return nodes;
}

function pathIsForbidden(path: string): boolean {
  if (path.startsWith('@') || path.startsWith('../')) {
    return true;
  }
  return path
    .replace(/^\.\//, '')
    .split(/[.[\]/]+/)
    .filter(Boolean)
    .some(isForbiddenExpressionContextKey);
}

function helperPath(node: RuntimeRecord): string | undefined {
  const path = readRuntimeProperty(node, 'path');
  return isRuntimeRecord(path) ? nodeString(path, 'original') : undefined;
}

function hasHelperArguments(node: RuntimeRecord): boolean {
  const parameters = readRuntimeProperty(node, 'params');
  if (isRuntimeArray(parameters) && parameters.length > 0) {
    return true;
  }
  const hash = readRuntimeProperty(node, 'hash');
  if (!isRuntimeRecord(hash)) {
    return false;
  }
  const pairs = readRuntimeProperty(hash, 'pairs');
  return isRuntimeArray(pairs) && pairs.length > 0;
}

function validateHandlebarsNode(node: RuntimeRecord): boolean {
  const type = nodeString(node, 'type');
  if (
    type === 'PartialStatement' ||
    type === 'PartialBlockStatement' ||
    type === 'Decorator' ||
    type === 'DecoratorBlock'
  ) {
    throw new ManagedExpressionError('handlebars', 'validation', 'handlebars-extension-forbidden');
  }
  if (type === 'MustacheStatement' && readRuntimeProperty(node, 'escaped') === false) {
    throw new ManagedExpressionError('handlebars', 'validation', 'handlebars-unescaped-output-forbidden');
  }
  if (type === 'PathExpression') {
    const original = nodeString(node, 'original');
    if (original !== undefined && pathIsForbidden(original)) {
      throw new ManagedExpressionError('handlebars', 'validation', 'handlebars-property-forbidden');
    }
  }

  if (type !== 'MustacheStatement' && type !== 'SubExpression' && type !== 'BlockStatement') {
    return false;
  }
  const path = helperPath(node);
  if (path === undefined) {
    throw new ManagedExpressionError('handlebars', 'validation', 'handlebars-helper-invalid');
  }
  if (FORBIDDEN_HANDLEBARS_HELPERS.has(path)) {
    throw new ManagedExpressionError('handlebars', 'validation', 'handlebars-helper-forbidden');
  }
  if (type === 'BlockStatement') {
    if (!MANAGED_HANDLEBARS_BLOCK_HELPERS.has(path)) {
      throw new ManagedExpressionError('handlebars', 'validation', 'handlebars-block-helper-forbidden');
    }
    return path === 'each';
  }
  if (type === 'SubExpression' || hasHelperArguments(node) || MANAGED_HANDLEBARS_HELPERS.has(path)) {
    if (!MANAGED_HANDLEBARS_HELPERS.has(path)) {
      throw new ManagedExpressionError('handlebars', 'validation', 'handlebars-helper-forbidden');
    }
  }
  return false;
}

function validateHandlebarsAst(ast: RuntimeValue): number {
  const pending: AstTask[] = [{ value: ast, depth: 0 }];
  let nodes = 0;
  let eachBlocks = 0;
  while (pending.length > 0) {
    const task = pending.pop();
    if (task === undefined) {
      continue;
    }
    if (task.depth > EXPRESSION_RUNTIME_LIMITS.maxAstDepth) {
      throw new ManagedExpressionError('handlebars', 'limit', 'handlebars-ast-depth-exceeded');
    }
    if (isRuntimeArray(task.value)) {
      for (const child of task.value) {
        pending.push({ value: child, depth: task.depth + 1 });
      }
      continue;
    }
    if (!isRuntimeRecord(task.value)) {
      continue;
    }

    nodes += 1;
    if (nodes > EXPRESSION_RUNTIME_LIMITS.maxAstNodes) {
      throw new ManagedExpressionError('handlebars', 'limit', 'handlebars-ast-nodes-exceeded');
    }
    if (validateHandlebarsNode(task.value)) {
      eachBlocks += 1;
      if (eachBlocks > EXPRESSION_RUNTIME_LIMITS.maxTemplateEachBlocks) {
        throw new ManagedExpressionError('handlebars', 'limit', 'handlebars-iteration-limit-exceeded');
      }
    }
    for (const child of astChildren(task.value)) {
      pending.push({ value: child, depth: task.depth + 1 });
    }
  }
  return nodes;
}

export function compileManagedJsonataExpression(source: string): PreparedJsonataExpression {
  const normalized = normaliseVisual(source);
  if (normalized.length === 0 || normalized.length > EXPRESSION_RUNTIME_LIMITS.maxExpressionLength) {
    throw new ManagedExpressionError('jsonata', 'limit', 'jsonata-source-size-invalid');
  }
  try {
    const expression = jsonata(normalized);
    const astNodes = validateJsonataAst(expression.ast());
    return Object.freeze({
      schemaVersion: EXPRESSION_ARTIFACT_SCHEMA_VERSION,
      engine: 'jsonata',
      source: normalized,
      astNodes,
    });
  } catch (error) {
    if (error instanceof ManagedExpressionError) {
      throw error;
    }
    throw new ManagedExpressionError('jsonata', 'validation', 'jsonata-syntax-invalid');
  }
}

export function compileManagedHandlebarsTemplate(
  source: string,
  destination: ManagedTemplateDestination
): PreparedHandlebarsTemplate {
  const normalized = normaliseVisual(source);
  if (!TEMPLATE_DESTINATIONS.has(destination)) {
    throw new ManagedExpressionError('handlebars', 'validation', 'handlebars-destination-invalid');
  }
  if (normalized.length === 0 || normalized.length > EXPRESSION_RUNTIME_LIMITS.maxTemplateLength) {
    throw new ManagedExpressionError('handlebars', 'limit', 'handlebars-source-size-invalid');
  }
  try {
    const astNodes = validateHandlebarsAst(Handlebars.parse(normalized));
    return Object.freeze({
      schemaVersion: EXPRESSION_ARTIFACT_SCHEMA_VERSION,
      engine: 'handlebars',
      source: normalized,
      destination,
      astNodes,
    });
  } catch (error) {
    if (error instanceof ManagedExpressionError) {
      throw error;
    }
    throw new ManagedExpressionError('handlebars', 'validation', 'handlebars-syntax-invalid');
  }
}
