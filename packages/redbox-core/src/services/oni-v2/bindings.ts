import { Effect } from 'effect';
import type { OniValueBinding } from '../../configmodels/OniPublishing';
import type { AnyRecord } from './types';
import { validateSafeHandlebarsTemplate } from '../integration-v2/bindings';
import { OniTemplatingLive, OniTemplatingServiceTag } from './templating';
import { runEffectProgram } from '../integration-v2/runtime';

export function validateHandlebarsTemplate(template: string): void {
  validateSafeHandlebarsTemplate(template, 'Oni');
}

export function evaluateBindingEffect(binding: OniValueBinding | undefined, context: AnyRecord) {
  return Effect.gen(function* () {
    if (binding == null) return undefined;
    const templating = yield* OniTemplatingServiceTag;
    if (binding.kind === 'path') return yield* templating.path(binding.path, context, binding.defaultValue);
    if (binding.kind === 'handlebars') {
      const value = yield* templating.handlebars(binding.template, context);
      return value === '' ? binding.defaultValue : value;
    }
    const value = yield* templating.jsonata(binding.expression, context);
    return value ?? binding.defaultValue;
  });
}

export async function evaluateBinding(binding: OniValueBinding | undefined, context: AnyRecord): Promise<unknown> {
  return runEffectProgram(evaluateBindingEffect(binding, context).pipe(Effect.provide(OniTemplatingLive)));
}
