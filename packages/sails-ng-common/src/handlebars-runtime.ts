import Runtime from 'handlebars/runtime.js';
import type Handlebars from 'handlebars';
import { registerHandlebarsHelpers } from './handlebars-registration';

export { handlebarsHelperDefinitions, loadMarkdownParser } from './handlebars-helper-definitions';

// Handlebars' runtime.d.ts declares an empty module. Describe only the runtime
// surface so browser consumers cannot accidentally call a missing compiler.
export type HandlebarsRuntime = Omit<
  typeof Handlebars,
  | 'compile'
  | 'precompile'
  | 'parse'
  | 'parseWithoutProcessing'
  | 'AST'
  | 'Compiler'
  | 'JavaScriptCompiler'
  | 'Parser'
  | 'Visitor'
  | 'create'
  | 'noConflict'
> & {
  create(): HandlebarsRuntime;
  noConflict(): HandlebarsRuntime;
};
const instance = Runtime as unknown as HandlebarsRuntime;

/** CSP-safe instance for precompiled templates and hook helper registration. */
export function handlebarsInstance() {
  registerHandlebarsHelpers(instance);
  return instance;
}

export function handlebarsTemplate(precompilation: TemplateSpecification): HandlebarsTemplateDelegate {
  return handlebarsInstance().template(precompilation);
}
