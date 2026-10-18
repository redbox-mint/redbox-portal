import Handlebars from 'handlebars';
import { normaliseVisual } from './config/names/naming-helpers';
import { registerHandlebarsHelpers } from './handlebars-registration';

export { handlebarsHelperDefinitions, loadMarkdownParser } from './handlebars-helper-definitions';

/** The original full compiler instance for Node/CommonJS callers. */
export function handlebarsInstance() {
  registerHandlebarsHelpers(Handlebars);
  return Handlebars;
}

export function handlebarsPrecompile(input: unknown, options?: PrecompileOptions): TemplateSpecification {
  return handlebarsInstance().precompile(normaliseVisual(input), options);
}

export function handlebarsCompile(input: unknown, options?: CompileOptions): HandlebarsTemplateDelegate {
  return handlebarsInstance().compile(normaliseVisual(input), options);
}

export function handlebarsTemplate(precompilation: TemplateSpecification): HandlebarsTemplateDelegate {
  return handlebarsInstance().template(precompilation);
}
