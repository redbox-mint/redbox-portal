import jsonata from 'jsonata';
import { DateTime } from 'luxon';
import { decodeBase64, encodeBase64 } from './html-helpers';
import { normaliseVisual } from './config/names/naming-helpers';
import { guessNameParts } from './translation-helpers';

/**
 * A function that accepts a context and evaluates a previously compiled expression.
 */
export type JSONataEvaluate = (context: unknown) => Promise<unknown>;

/** Bindings that could restore dynamic expression evaluation are never accepted. */
export const JSONATA_PROHIBITED_BINDING_NAMES = ['eval', 'jsonata'] as const;

type JSONataFunctionImplementation = Parameters<jsonata.Expression['registerFunction']>[1];

export interface JSONataFunctionDefinition {
  implementation: JSONataFunctionImplementation;
  signature?: string;
}

export type JSONataFunctionRegistry = Readonly<Record<string, JSONataFunctionDefinition>>;

/**
 * Format a date using the luxon library.
 * @param value The value to format.
 * @param format The format to use.
 * @param sourceFormat The optional format of the value, if known.
 */
export function luxonFormatDate(
  value: undefined | null | string | number | Date,
  format: undefined | null | string,
  sourceFormat?: null | string
): string {
  if (value === undefined || value === null || value === '') {
    return '';
  }

  const outputFormat = typeof format === 'string' && format ? format : 'yyyy-LL-dd';
  const inputFormat = typeof sourceFormat === 'string' && sourceFormat ? sourceFormat : undefined;
  const valueAsString = typeof value === 'string' ? value.trim() : String(value);
  let dateTime: DateTime;

  if (value instanceof Date) {
    dateTime = DateTime.fromJSDate(value);
  } else if (typeof value === 'number') {
    dateTime = DateTime.fromMillis(value);
  } else if (inputFormat) {
    dateTime = DateTime.fromFormat(valueAsString, inputFormat);
  } else {
    const candidates = [
      DateTime.fromISO(valueAsString),
      DateTime.fromFormat(valueAsString, 'yyyy/MM/dd'),
      DateTime.fromFormat(valueAsString, 'yyyy-MM-dd'),
      DateTime.fromRFC2822(valueAsString),
      DateTime.fromHTTP(valueAsString),
    ];
    dateTime = candidates.find(candidate => candidate.isValid) ?? DateTime.invalid('Unparsable date');
  }

  return dateTime.isValid ? dateTime.toFormat(outputFormat) : '';
}

/** The single source of truth for functions installed by every shared compiler. */
const JSONATA_CUSTOM_FUNCTION_REGISTRY = {
  eval: {
    implementation: () => {
      throw new Error('Attempted to invoke eval');
    },
  },
  luxonFormatDate: {
    implementation: luxonFormatDate,
    signature: '<(snlo)(sl)(sl)?:s>',
  },
  guessNameParts: {
    implementation: guessNameParts,
    signature: '<(sl):o>',
  },
} as const satisfies JSONataFunctionRegistry;

/** Deterministic names derived from the complete shared function registry. */
export const JSONATA_CUSTOM_FUNCTION_NAMES = Object.freeze(
  Object.keys(JSONATA_CUSTOM_FUNCTION_REGISTRY) as (keyof typeof JSONATA_CUSTOM_FUNCTION_REGISTRY)[]
);

/**
 * Prepare a jsonata expression to be transferred from server to client.
 * @param expression The jsonata expression string.
 */
export function jsonataExpressionEncode(expression: string): string {
  expression = normaliseVisual(expression);
  return encodeBase64(expression);
}

/**
 * Provide an encoded JSONata expression string and return a compiled JSONata expression object.
 *
 * Registers the common custom functions that should be available everywhere.
 *
 * @param expressionEncoded The encoded expression string.
 * @param options The compile options.
 * @return compiled JSONata expression object
 */
export function jsonataDecodeCompile(expressionEncoded: string, options?: jsonata.JsonataOptions): jsonata.Expression {
  return jsonataCompile(decodeBase64(expressionEncoded), options);
}

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
  expression = normaliseVisual(expression);
  const compiled = jsonata(expression, options);

  registerJSONataCustomFunctions(compiled);

  return compiled;
}

/** Register the complete shared JSONata function set on a compiled expression. */
export function registerJSONataCustomFunctions(compiled: jsonata.Expression): jsonata.Expression {
  // Register jsonata functions.
  // The function signatures are used on purpose to restrict the arguments,
  // so invalid input types are clear instead of hidden.
  // Callers of the jsonata helper functions must be prepared for possible parse errors and input type errors.

  registerJSONataFunctions(compiled, JSONATA_CUSTOM_FUNCTION_REGISTRY);

  // TODO: consider registering a function for translations
  // TODO: consider replacing regex with google's re2?

  return compiled;
}

/** Register a deterministic function set, including service-local extensions. */
export function registerJSONataFunctions(
  compiled: jsonata.Expression,
  registry: JSONataFunctionRegistry
): jsonata.Expression {
  for (const [name, definition] of Object.entries(registry)) {
    compiled.registerFunction(name, definition.implementation, definition.signature);
  }
  return compiled;
}

function assertSafeJSONataBindings(bindings?: Record<string, unknown>): void {
  if (!bindings) {
    return;
  }
  const prohibited = new Set<string>(JSONATA_PROHIBITED_BINDING_NAMES);
  for (const key of Object.keys(bindings)) {
    if (prohibited.has(key.replace(/^\$/, ''))) {
      throw new Error(`JSONata binding '${key}' is not supported`);
    }
  }
}

export async function jsonataEvaluate(
  compiled: jsonata.Expression,
  context: unknown,
  bindings?: Record<string, unknown>
): Promise<unknown> {
  assertSafeJSONataBindings(bindings);
  return await compiled.evaluate(context, bindings);
}

export async function jsonataCompileAndEvaluate(
  expression: string,
  context: unknown,
  bindings?: Record<string, unknown>
): Promise<unknown> {
  const compiled = jsonataCompile(expression);
  return await jsonataEvaluate(compiled, context, bindings);
}

export function jsonataEvaluateFunc(expression: string, bindings?: Record<string, unknown>): JSONataEvaluate {
  const compiled = jsonataCompile(expression);
  return async function (value: unknown) {
    return await jsonataEvaluate(compiled, value, bindings);
  };
}
