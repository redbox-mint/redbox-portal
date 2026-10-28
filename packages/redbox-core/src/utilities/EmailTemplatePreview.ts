import { handlebarsInstance, normaliseVisual } from '@researchdatabox/sails-ng-common';
import { toPath } from 'lodash';

/** Read data descriptors only, including every intermediate path segment. */
function ownPath(value: unknown, path: unknown, fallback: unknown): unknown {
  // Numeric keys (array indexes) are ordinary own properties, as in the send render.
  if (typeof path === 'number' && Number.isSafeInteger(path) && path >= 0) path = String(path);
  if (typeof path !== 'string' && !Array.isArray(path)) return fallback;
  // As with lodash.get, a literal own key takes precedence over dotted syntax.
  const parts = typeof path === 'string' && value != null && Object.hasOwn(Object(value), path)
    ? [path] : toPath(path);
  if (!parts.length) return fallback;
  for (const part of parts) {
    if (value == null || ['__proto__', 'prototype', 'constructor'].includes(part)) return fallback;
    const descriptor = Object.getOwnPropertyDescriptor(Object(value), part);
    if (!descriptor || !Object.hasOwn(descriptor, 'value')) return fallback;
    value = descriptor.value;
  }
  return value === undefined ? fallback : value;
}

interface PreviewContainer {
  strict: (value: unknown, name: string, loc: hbs.AST.SourceLocation) => unknown;
}
interface PreviewSpecification {
  main: (container: PreviewContainer, ...args: unknown[]) => string;
}

/** Isolated admin preview compiler. Never changes the shared send environment. */
export function compileEmailTemplatePreview(source: string): Handlebars.TemplateDelegate {
  const environment = handlebarsInstance().create();
  environment.registerHelper(handlebarsInstance().helpers);
  environment.registerHelper({
    get: (...args: unknown[]) => {
      args.pop(); // The runtime options argument must never become the fallback.
      return ownPath(args[0], args[1], args[2] ?? '');
    },
    pluck: (...args: unknown[]) => {
      args.pop();
      return Array.isArray(args[0]) ? args[0].map(item => ownPath(item, args[1], '')) : [];
    },
  });
  const template = environment.template.bind(environment);
  environment.template = specification => {
    const { main } = specification as PreviewSpecification;
    return template({ ...specification, main(container: PreviewContainer, ...args: unknown[]) {
      // Handlebars' strict failure interpolates the failing object into its
      // message, which throws before attaching coordinates for null-prototype
      // objects. Capture the compiler's location in the ORIGINAL render instead.
      // No diagnostic compile, extra helper calls, output, or wider context.
      container.strict = (value, name, loc) => {
        const descriptor = value == null ? undefined : Object.getOwnPropertyDescriptor(Object(value), name);
        if (!descriptor || !Object.hasOwn(descriptor, 'value')) {
          throw Object.assign(new Error('Email preview lookup failed.'), {
            lineNumber: loc?.start.line, column: loc?.start.column,
          });
        }
        return descriptor.value;
      };
      return main(container, ...args);
    } });
  };
  return environment.compile(normaliseVisual(source), { strict: true });
}
