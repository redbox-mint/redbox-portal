import { Services as Domain } from '../../forms/DomSanitizer';
import { registerPersistenceResource } from '../../persistence/runtime';
const methods = ['getMaxBytes', 'sanitize', 'sanitizeWithProfile'] as const;
export class LegacyDomSanitizer extends Domain.DomSanitizer {
  public constructor() {
    super({
      get config() {
        return sails.config;
      },
      get log() {
        return sails.log;
      },
    });
  }
  public exports(): Record<string, unknown> {
    return Object.fromEntries(methods.map(name => [name, this[name].bind(this)]));
  }
}
const key = Symbol.for('@researchdatabox/redbox-core/comparison/DomSanitizer');
function instance(): LegacyDomSanitizer {
  let value = Reflect.get(sails, key) as LegacyDomSanitizer | undefined;
  if (!value) {
    value = new LegacyDomSanitizer();
    Object.defineProperty(sails, key, { value });
    registerPersistenceResource(sails, 'DomSanitizer', { close: () => value!.close() });
  }
  return value;
}
export function sailsDomSanitizerExports(): Record<string, unknown> {
  return Object.fromEntries(
    methods.map(name => [name, (...args: unknown[]) => Reflect.apply(instance()[name], instance(), args)])
  );
}
// Hooks using the legacy global resolve the comparison application's owned DOM.
Object.defineProperty(globalThis, 'DOMPurify', {
  configurable: true,
  enumerable: true,
  get: () => instance().getPurifier(),
  set(value: unknown) {
    Object.defineProperty(globalThis, 'DOMPurify', { configurable: true, enumerable: true, writable: true, value });
  },
});
