import { handlebarsInstance, normaliseVisual } from '@researchdatabox/sails-ng-common';
import { boundedJsonBytes } from './NamedQueryPreview';

/** Internal control flow: discard the current row and return the bounded sample. */
export class NamedQueryPreviewOutputLimitError extends Error {}

// Handlebars documents appendToBuffer as a compiler extension point, but does not
// include its JavaScriptCompiler in its TypeScript declarations.
interface BufferCompiler {
  appendToBuffer(source: unknown, location?: unknown, explicit?: boolean): unknown;
}
interface PreviewContainer {
  previewAppend: (value: unknown) => string;
  invokePartial: (partial: unknown, context: unknown, options: { indent?: string }) => string | undefined;
}
interface PreviewSpecification {
  main: (container: PreviewContainer, ...args: unknown[]) => string;
}

/** Bound construction, including every expression, literal and nested block append. */
export function renderNamedQueryPreviewTemplate(
  source: string,
  variables: Record<string, unknown>,
  limit: number
): string {
  const shared = handlebarsInstance();
  const environment = shared.create() as ReturnType<typeof handlebarsInstance> & {
    JavaScriptCompiler: new () => BufferCompiler;
  };
  let constructedBytes = 0;
  const check = (value: unknown): void => {
    if (boundedJsonBytes(value, limit - constructedBytes) > limit - constructedBytes)
      throw new NamedQueryPreviewOutputLimitError();
  };
  const append = (value: unknown): string => {
    // Check before coercion: Array#toString can itself amplify repeated values.
    check(value);
    const text = String(value);
    const bytes = Buffer.byteLength(text, 'utf8');
    if (bytes > limit - constructedBytes) throw new NamedQueryPreviewOutputLimitError();
    constructedBytes += bytes;
    return text;
  };
  class PreviewCompiler extends environment.JavaScriptCompiler {
    // Child programs must use the same compiler, including each/with/inverse bodies.
    compiler = PreviewCompiler;
    override appendToBuffer(value: unknown, location?: unknown, explicit?: boolean): unknown {
      return super.appendToBuffer(['container.previewAppend(', value, ')'], location, explicit);
    }
  }
  environment.JavaScriptCompiler = PreviewCompiler;
  const template = environment.template.bind(environment);
  const containers = new WeakSet<PreviewContainer>();
  environment.template = specification => {
    const { main } = specification as PreviewSpecification;
    return template({
      ...specification,
      main(container: PreviewContainer, ...args: unknown[]) {
        container.previewAppend = append;
        if (!containers.has(container)) {
          containers.add(container);
          const invokePartial = container.invokePartial;
          container.invokePartial = (partial, context, options) => {
            // Handlebars normally adds indentation to every line after rendering
            // a partial. Account for that amplification before concatenating it.
            const { indent, ...unindented } = options;
            const result = invokePartial.call(container, partial, context, unindented);
            if (!indent || result == null) return result;
            const lines = result.split('\n');
            let indented = '';
            for (let i = 0; i < lines.length; i++) {
              if (lines[i] || i + 1 < lines.length) indented += append(indent);
              indented += append(lines[i]);
              if (i + 1 < lines.length) indented += append('\n');
            }
            return indented;
          };
        }
        return main(container, ...args);
      },
    });
  };
  for (const [name, helper] of Object.entries(shared.helpers)) {
    environment.registerHelper(name, function (this: unknown, ...args: unknown[]) {
      // Include overrides of builtins: any registered helper may expand inputs.
      // Count repeated references before calling join/json/concat or hook helpers.
      check(args.slice(0, -1));
      const options = args[args.length - 1] as Handlebars.HelperOptions;
      check(options.hash);
      const result: unknown = Reflect.apply(helper, this, args);
      // Subexpressions need a guard too, before feeding another helper.
      check(result);
      return result;
    });
  }
  // Compile source partials in this environment. Function partials have already
  // been compiled without append guards and cannot safely participate in preview.
  for (const [name, partial] of Object.entries(shared.partials)) {
    environment.registerPartial(
      name,
      typeof partial === 'string'
        ? partial
        : () => {
            throw new NamedQueryPreviewOutputLimitError();
          }
    );
  }
  return environment.compile(normaliseVisual(source), { noEscape: true })(variables);
}
