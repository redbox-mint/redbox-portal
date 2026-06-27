import _ from 'lodash';
import Handlebars from 'handlebars';
import { jsonataCompileAndEvaluate, registerSharedHandlebarsHelpers } from '@researchdatabox/sails-ng-common';
import type { OniValueBinding } from '../../configmodels/OniPublishing';
import type { AnyRecord } from './types';

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
      throw new Error(`Unsupported Handlebars block helper '${token}' in Oni binding`);
    }
    const afterToken = template.slice(tagPattern.lastIndex).trimStart();
    const isSimpleLookup = afterToken.startsWith('}}') || afterToken.startsWith('}}}') || afterToken.startsWith('.');
    if (isSimpleLookup || allowedHelpers.has(token)) {
      continue;
    }
    throw new Error(`Unsupported Handlebars helper '${token}' in Oni binding`);
  }
}

export async function evaluateBinding(binding: OniValueBinding | undefined, context: AnyRecord): Promise<unknown> {
  if (binding == null) {
    return undefined;
  }
  if (binding.kind === 'path') {
    return _.get(context, binding.path, binding.defaultValue);
  }
  if (binding.kind === 'handlebars') {
    ensureHandlebarsHelpersRegistered();
    validateHandlebarsTemplate(binding.template);
    const value = Handlebars.compile(binding.template, { noEscape: true })(context);
    return value === '' ? binding.defaultValue : value;
  }
  const value = await jsonataCompileAndEvaluate(binding.expression, context);
  return value ?? binding.defaultValue;
}
