import { GenerationError } from '../../model/generation';

function hasRequiredMethods<T extends object>(value: object, methodNames: readonly string[]): value is T {
  return methodNames.every((methodName) => typeof Reflect.get(value, methodName) === 'function');
}

/**
 * Resolve a dynamically registered Sails service through a checked, typed seam.
 * This keeps service-boundary typing honest without relying on double assertions.
 */
export function requireService<T extends object>(name: string, methodNames: readonly string[]): T {
  const service: object | undefined = sails.services[name];
  if (!service || !hasRequiredMethods<T>(service, methodNames)) {
    throw new GenerationError('GENERATION_NOT_CONFIGURED', `Required generation service '${name}' is unavailable`);
  }
  return service;
}

export function requireWaterlineRows<T>(value: unknown, modelName: string): T[] {
  if (!Array.isArray(value)) {
    throw new GenerationError('GENERATION_INVALID_STATE', `Expected a row collection from '${modelName}'`);
  }
  return value;
}
