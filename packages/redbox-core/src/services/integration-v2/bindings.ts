import Handlebars from 'handlebars';
import _ from 'lodash';
import jsonata from 'jsonata';
import { handlebarsCompile, jsonataCompileAndEvaluate } from '@researchdatabox/sails-ng-common';

export type PathBinding = { kind: 'path'; path: string; defaultValue?: unknown };
export type HandlebarsBinding = { kind: 'handlebars'; template: string; defaultValue?: unknown };
export type JsonataBinding = { kind: 'jsonata'; expression: string; defaultValue?: unknown };
export type SimpleValueBinding = PathBinding | HandlebarsBinding | JsonataBinding;

export function validateSimpleBinding(binding: SimpleValueBinding, integrationName: string): void {
  if (binding.kind === 'path') {
    if (
      !binding.path.trim() ||
      _.toPath(binding.path).some(part => ['__proto__', 'prototype', 'constructor'].includes(part))
    )
      throw new Error(`Invalid ${integrationName} binding path`);
  } else if (binding.kind === 'handlebars') validateSafeHandlebarsTemplate(binding.template, integrationName);
  else if (binding.kind === 'jsonata' && binding.expression.trim()) jsonata(binding.expression);
  else throw new Error(`Invalid ${integrationName} binding`);
}

export function evaluatePath(path: string, target: object, defaultValue?: unknown): unknown {
  return _.get(target, path, defaultValue);
}

export function evaluateHandlebars(
  template: string,
  target: object,
  integrationName: string,
  noEscape = false
): string {
  validateSafeHandlebarsTemplate(template, integrationName);
  return handlebarsCompile(template, { noEscape })(target);
}

export async function evaluateJsonata(expression: string, target: object): Promise<unknown> {
  return jsonataCompileAndEvaluate(expression, target);
}

export async function evaluateSimpleBinding(
  binding: SimpleValueBinding,
  target: object,
  integrationName: string
): Promise<unknown> {
  if (binding.kind === 'path') return evaluatePath(binding.path, target, binding.defaultValue) ?? binding.defaultValue;
  if (binding.kind === 'handlebars') {
    const value = evaluateHandlebars(binding.template, target, integrationName);
    return value === '' ? binding.defaultValue : value;
  }
  return (await evaluateJsonata(binding.expression, target)) ?? binding.defaultValue;
}

export const DEFAULT_ALLOWED_HANDLEBARS_HELPERS = new Set(['default', 'join', 'lower', 'upper', 'trim', 'formatDate']);

type HandlebarsProgram = ReturnType<typeof Handlebars.parse>;

type UnknownNode = {
  type?: unknown;
  path?: unknown;
  name?: unknown;
  params?: unknown;
  hash?: unknown;
  program?: unknown;
  inverse?: unknown;
};

type PathExpression = {
  type?: unknown;
  original?: unknown;
};

type HashExpression = {
  pairs?: unknown;
};

type HashPair = {
  value?: unknown;
};

function asNode(value: unknown): UnknownNode | undefined {
  return value != null && typeof value === 'object' ? (value as UnknownNode) : undefined;
}

function asPathExpression(value: unknown): PathExpression | undefined {
  const candidate = value != null && typeof value === 'object' ? (value as PathExpression) : undefined;
  return candidate?.type === 'PathExpression' ? candidate : undefined;
}

function getPathName(value: unknown): string {
  const original = asPathExpression(value)?.original;
  return typeof original === 'string' ? original : '';
}

function getParams(node: UnknownNode): unknown[] {
  return Array.isArray(node.params) ? node.params : [];
}

function getHashPairs(node: UnknownNode): HashPair[] {
  const hash = node.hash != null && typeof node.hash === 'object' ? (node.hash as HashExpression) : undefined;
  return Array.isArray(hash?.pairs) ? (hash.pairs as HashPair[]) : [];
}

function hasHelperArguments(node: UnknownNode): boolean {
  return getParams(node).length > 0 || getHashPairs(node).length > 0;
}

function validateExpression(expression: unknown, integrationName: string, allowedHelpers: ReadonlySet<string>): void {
  const node = asNode(expression);
  if (!node) {
    return;
  }

  if (node.type !== 'SubExpression') {
    return;
  }

  const helper = getPathName(node.path);
  if (!allowedHelpers.has(helper)) {
    throw new Error(`Unsupported Handlebars helper '${helper}' in ${integrationName} binding`);
  }

  for (const param of getParams(node)) {
    validateExpression(param, integrationName, allowedHelpers);
  }
  for (const pair of getHashPairs(node)) {
    validateExpression(pair.value, integrationName, allowedHelpers);
  }
}

function validateMustache(statement: UnknownNode, integrationName: string, allowedHelpers: ReadonlySet<string>): void {
  if (!hasHelperArguments(statement)) {
    return;
  }

  const helper = getPathName(statement.path);
  if (!allowedHelpers.has(helper)) {
    throw new Error(`Unsupported Handlebars helper '${helper}' in ${integrationName} binding`);
  }

  for (const param of getParams(statement)) {
    validateExpression(param, integrationName, allowedHelpers);
  }
  for (const pair of getHashPairs(statement)) {
    validateExpression(pair.value, integrationName, allowedHelpers);
  }
}

function validateProgram(
  program: HandlebarsProgram,
  integrationName: string,
  allowedHelpers: ReadonlySet<string>
): void {
  for (const statement of program.body) {
    const node = asNode(statement);
    switch (node?.type) {
      case 'ContentStatement':
      case 'CommentStatement':
        break;
      case 'MustacheStatement':
        validateMustache(node, integrationName, allowedHelpers);
        break;
      case 'BlockStatement':
        throw new Error(
          `Unsupported Handlebars block helper '${getPathName(node.path)}' in ${integrationName} binding`
        );
      case 'PartialStatement':
      case 'PartialBlockStatement':
        throw new Error(`Unsupported Handlebars partial '${getPathName(node.name)}' in ${integrationName} binding`);
      case 'Decorator':
      case 'DecoratorBlock':
        throw new Error(`Unsupported Handlebars decorator '${getPathName(node.path)}' in ${integrationName} binding`);
      default:
        throw new Error(
          `Unsupported Handlebars statement '${String(node?.type ?? 'unknown')}' in ${integrationName} binding`
        );
    }
  }
}

export function validateSafeHandlebarsTemplate(
  template: string,
  integrationName: string,
  allowedHelpers: ReadonlySet<string> = DEFAULT_ALLOWED_HANDLEBARS_HELPERS
): void {
  validateProgram(Handlebars.parse(template), integrationName, allowedHelpers);
}
