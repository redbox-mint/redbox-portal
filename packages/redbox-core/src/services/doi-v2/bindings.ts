import _ from 'lodash';
import { handlebarsCompile, jsonataCompileAndEvaluate } from '@researchdatabox/sails-ng-common';
import type { ValueBinding } from '../../configmodels/DoiPublishing';
import type { DoiBindingContext, DoiBindingIterationContext } from './types';
import { validateSafeHandlebarsTemplate } from '../integration-v2/bindings';


export function validateHandlebarsTemplate(template: string): void {
  validateSafeHandlebarsTemplate(template, 'DOI');
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
    validateHandlebarsTemplate(binding.template);
    const compiled = handlebarsCompile(binding.template);
    const value = compiled(context);
    return value === '' ? binding.defaultValue : value;
  }

  const value = await jsonataCompileAndEvaluate(binding.expression, context);
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
  return value.filter(
    (item): item is Record<string, unknown> => item != null && typeof item === 'object' && !Array.isArray(item)
  );
}
