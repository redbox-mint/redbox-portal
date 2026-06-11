import jsonata from 'jsonata';
import { DateTime } from 'luxon';

/**
 * A function that accepts a context and evaluates a previously compiled expression.
 */
export type JSONataEvaluate = (context: unknown) => Promise<unknown>;

/**
 * Format a date using the luxon library.
 * @param value The value to format.
 * @param format The format to use.
 * @param sourceFormat The optional format of the value, if known.
 */
export function luxonFormatDate(value: unknown, format: unknown, sourceFormat?: unknown): string {
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

/**
 * helper object to provide the wrapped jsonata expression parsing.
 */
export const jsonataLibrary = {jsonata: jsonataCompile};

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

  // Disable JSONata's dynamic eval function so browser/server validators only run the configured expression.
  compiled.registerFunction('eval', () => undefined);

  // Register a function for formatting date time values.
  compiled.registerFunction('luxonFormatDate', luxonFormatDate, '<(snd)(sn)s?:s>');

  // TODO: consider registering a function for translations
  // TODO: consider replacing regex with google's re2?

  return compiled;
}

export async function jsonataEvaluate(
  compiled: jsonata.Expression,
  context: unknown,
  bindings?: Record<string, unknown>
): Promise<unknown> {
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
