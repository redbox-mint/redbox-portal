import _ from 'lodash';
import Handlebars from 'handlebars';
import { jsonataCompileAndEvaluate, registerSharedHandlebarsHelpers } from '@researchdatabox/sails-ng-common';
import type { OniValueBinding } from '../../configmodels/OniPublishing';
import type { AnyRecord } from './types';
import { validateSafeHandlebarsTemplate } from '../integration-v2/bindings';

let handlebarsHelpersRegistered = false;

function ensureHandlebarsHelpersRegistered(): void {
  if (!handlebarsHelpersRegistered) {
    registerSharedHandlebarsHelpers(Handlebars);
    handlebarsHelpersRegistered = true;
  }
}

export function validateHandlebarsTemplate(template: string): void {
  validateSafeHandlebarsTemplate(template, 'Oni');
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
