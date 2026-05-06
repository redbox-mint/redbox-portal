import _ from 'lodash';
import jsonata from 'jsonata';
import Handlebars from 'handlebars';
import { registerSharedHandlebarsHelpers } from '@researchdatabox/sails-ng-common';
import { ValueBinding } from '../../configmodels/FigsharePublishing';
import { AnyRecord } from './types';

let handlebarsHelpersRegistered = false;

export function ensureHandlebarsHelpersRegistered(): void {
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
      throw new Error(`Unsupported Handlebars block helper '${token}' in Figshare binding`);
    }
    const afterToken = template.slice(tagPattern.lastIndex).trimStart();
    const isSimpleLookup = afterToken.startsWith('}}') || afterToken.startsWith('}}}') || afterToken.startsWith('.');
    if (isSimpleLookup || allowedHelpers.has(token)) {
      continue;
    }
    throw new Error(`Unsupported Handlebars helper '${token}' in Figshare binding`);
  }
}

export async function evaluateBinding(binding: ValueBinding | undefined, record: AnyRecord): Promise<unknown> {
  if (binding == null) {
    return undefined;
  }

  if (binding.kind === 'path') {
    return _.get(record, binding.path, binding.defaultValue);
  }

  if (binding.kind === 'handlebars') {
    ensureHandlebarsHelpersRegistered();
    validateHandlebarsTemplate(binding.template);
    const compiled = Handlebars.compile(binding.template);
    const value = compiled(record);
    return value === '' ? binding.defaultValue : value;
  }

  const compiled = jsonata(binding.expression);
  compiled.registerFunction('eval', () => undefined);
  const value = await compiled.evaluate(record);
  return value ?? binding.defaultValue;
}
