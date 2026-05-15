import jsonata from "jsonata";

/**
 * A function that accepts a context and evaluates a previously compiled expression.
 */
export type JSONataEvaluate = (context: unknown) => Promise<unknown>;

/**
 * A function that registers a custom JSONata function.
 */
export type JSONataRegisterFunction = (name: string, implementation: (this: jsonata.Focus, ...args: any[]) => any, signature?: string) => void;

export const jsonataLibrary = {jsonata: jsonata};

/**
 * Provide a JSONata expression string and return a compiled JSONata expression object.
 *
 * Registers the common custom functions that should be available everywhere.
 *
 * @param expression The expression string.
 * @param options The compile options.
 * @return compiled JSONata expression object
 */
export function jsonataCompile(expression: string, options?: jsonata.JsonataOptions): jsonata.Expression {
  const compiled = jsonata(expression, options);

  // override the built-in JSONata 'eval' function
  // TODO: check this actually overrides the 'eval' function
  compiled.registerFunction("eval", () => undefined);

  // TODO: register helper functions


  // TODO: register a function for obtaining translations
  // TODO: register a function for formatting date time values
  // TODO: register a function / context state holder that provides model data
  // TODO: replace regex with google's re2?

  return compiled;
}

export async function jsonataEvaluate(compiled: jsonata.Expression, context: unknown, bindings?: Record<string, unknown>): Promise<unknown> {
  return await compiled.evaluate(context, bindings);
}

export async function jsonataCompileAndEvaluate(expression: string, context: unknown, bindings?: Record<string, unknown>): Promise<unknown> {
  const compiled = jsonataCompile(expression);
  return await jsonataEvaluate(compiled, context, bindings);
}

export async function jsonataEvaluateFunc(expression: string, bindings?: Record<string, unknown>): Promise<JSONataEvaluate> {
  const compiled = jsonataCompile(expression);
  return async function (value: unknown) {
    return await jsonataEvaluate(compiled, value, bindings);
  }
}


