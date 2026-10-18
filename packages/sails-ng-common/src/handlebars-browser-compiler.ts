import Handlebars from 'handlebars';
import { normaliseVisual } from './config/names/naming-helpers';
import { handlebarsInstance as runtimeInstance } from './handlebars-runtime';

// Compatibility for the full compiler API in both environments.
// Browser production callers use the runtime exports, allowing this module and
// its compiler/source-map dependencies to be removed by the bundler.
export function handlebarsInstance() {
  const runtime = runtimeInstance();
  // Keep additions made through a hook's direct Handlebars import before its
  // first package compiler request, as well as explicit runtime overrides.
  for (const registry of ['helpers', 'partials', 'decorators'] as const) {
    Object.assign(runtime[registry], { ...Handlebars[registry], ...runtime[registry] });
  }
  // Explicit compiler users historically could register string partials and
  // execute them through handlebarsTemplate. Enable that fallback only when
  // compilation is explicitly requested; runtime-only bundles keep no compiler.
  Object.assign(runtime, { compile: Handlebars.compile });
  return Object.assign(Handlebars, {
    helpers: runtime.helpers,
    partials: runtime.partials,
    decorators: runtime.decorators,
  });
}

export function handlebarsPrecompile(input: unknown, options?: PrecompileOptions): TemplateSpecification {
  return handlebarsInstance().precompile(normaliseVisual(input), options);
}

export function handlebarsCompile(input: unknown, options?: CompileOptions): HandlebarsTemplateDelegate {
  return handlebarsInstance().compile(normaliseVisual(input), options);
}
