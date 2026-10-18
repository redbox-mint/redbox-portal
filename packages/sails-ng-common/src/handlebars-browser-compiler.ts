import Handlebars from 'handlebars';
import { normaliseVisual } from './config/names/naming-helpers';
import { handlebarsInstance } from './handlebars-runtime';

// Compatibility for explicit browser compilation (including test fixtures).
// Production callers use the runtime exports, allowing this entire module and
// its compiler/source-map dependencies to be removed by the bundler.
function compilerInstance() {
  const runtime = handlebarsInstance();
  return Object.assign(Handlebars.create(), {
    helpers: runtime.helpers,
    partials: runtime.partials,
    decorators: runtime.decorators,
  });
}

export function handlebarsPrecompile(input: unknown, options?: PrecompileOptions): TemplateSpecification {
  return compilerInstance().precompile(normaliseVisual(input), options);
}

export function handlebarsCompile(input: unknown, options?: CompileOptions): HandlebarsTemplateDelegate {
  return compilerInstance().compile(normaliseVisual(input), options);
}
