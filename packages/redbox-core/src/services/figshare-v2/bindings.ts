import _ from 'lodash';
import Handlebars from 'handlebars';
import { jsonataCompileAndEvaluate, registerSharedHandlebarsHelpers } from '@researchdatabox/sails-ng-common';
import { ValueBinding } from '../../configmodels/FigsharePublishing';
import { AnyRecord } from './types';
import { validateSafeHandlebarsTemplate } from '../integration-v2/bindings';

let handlebarsHelpersRegistered = false;

export function ensureHandlebarsHelpersRegistered(): void {
  if (!handlebarsHelpersRegistered) {
    registerSharedHandlebarsHelpers(Handlebars);
    handlebarsHelpersRegistered = true;
  }
}

export function validateHandlebarsTemplate(template: string): void {
  validateSafeHandlebarsTemplate(template, 'Figshare');
}

export async function evaluateBinding(binding: ValueBinding | undefined, record: AnyRecord): Promise<unknown> {
  if (binding == null) {
    return undefined;
  }

  if (binding.kind === 'path') {
    const value = _.get(record, binding.path, binding.defaultValue);
    return value ?? binding.defaultValue;
  }

  if (binding.kind === 'handlebars') {
    ensureHandlebarsHelpersRegistered();
    validateHandlebarsTemplate(binding.template);
    const compiled = Handlebars.compile(binding.template);
    const value = compiled(record);
    return value === '' ? binding.defaultValue : value;
  }

  const value = await jsonataCompileAndEvaluate(binding.expression, record);

  return value ?? binding.defaultValue;
}
