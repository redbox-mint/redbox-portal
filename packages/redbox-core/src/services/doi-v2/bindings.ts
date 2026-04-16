import _ from 'lodash';
import jsonata from 'jsonata';
import Handlebars from 'handlebars';
import { registerSharedHandlebarsHelpers } from '@researchdatabox/sails-ng-common';
import type { ValueBinding } from '../../configmodels/DoiPublishing';
import type { DoiBindingContext, DoiBindingIterationContext } from './types';

let handlebarsHelpersRegistered = false;

function ensureHandlebarsHelpersRegistered(): void {
  if (!handlebarsHelpersRegistered) {
    registerSharedHandlebarsHelpers(Handlebars);
    handlebarsHelpersRegistered = true;
  }
}

export function validateHandlebarsTemplate(template: string): void {
  const allowedHelpers = new Set(['default', 'join', 'lower', 'upper', 'trim', 'formatDate']);
  const tagPattern = /{{{?\s*([#/!>]?)\s*([A-Za-z_][A-Za-z0-9_]*)?/g;
  let match: RegExpExecArray | null;
  while ((match = tagPattern.exec(template)) != null) {
    const sigil = match[1];
    const token = match[2];
    if (sigil === '!' || sigil === '>' || !token) {
      continue;
    }
    if (sigil === '#') {
      throw new Error(`Unsupported Handlebars block helper '${token}' in DOI binding`);
    }
    const afterToken = template.slice(tagPattern.lastIndex).trimStart();
    const isSimpleLookup = afterToken.startsWith('}}') || afterToken.startsWith('}}}') || afterToken.startsWith('.');
    if (isSimpleLookup || allowedHelpers.has(token)) {
      continue;
    }
    throw new Error(`Unsupported Handlebars helper '${token}' in DOI binding`);
  }
}

async function evaluateJsonata(expression: string, context: DoiBindingContext | DoiBindingIterationContext): Promise<unknown> {
  const compiled = jsonata(expression);
  compiled.registerFunction('eval', () => undefined);
  return compiled.evaluate(context);
}

export async function evaluateBinding(
  binding: ValueBinding | undefined,
  context: DoiBindingContext | DoiBindingIterationContext
): Promise<unknown> {
  if (binding == null) {
    return undefined;
  }

  if (binding.kind === 'path') {
    return _.get(context, binding.path, binding.defaultValue);
  }

  if (binding.kind === 'handlebars') {
    ensureHandlebarsHelpersRegistered();
    validateHandlebarsTemplate(binding.template);
    const compiled = Handlebars.compile(binding.template);
    const value = compiled(context);
    return value === '' ? binding.defaultValue : value;
  }

  const value = await evaluateJsonata(binding.expression, context);
  return value ?? binding.defaultValue;
}

export function asTrimmedString(value: unknown): string | undefined {
  if (value == null) {
    return undefined;
  }
  const text = String(value).trim();
  return text === '' ? undefined : text;
}

export function asStringArray(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.map(item => asTrimmedString(item)).filter((item): item is string => item != null);
  }
  const single = asTrimmedString(value);
  return single == null ? [] : [single];
}

export function asObjectArray(value: unknown): Array<Record<string, unknown>> {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.filter((item): item is Record<string, unknown> => item != null && typeof item === 'object' && !Array.isArray(item));
}
