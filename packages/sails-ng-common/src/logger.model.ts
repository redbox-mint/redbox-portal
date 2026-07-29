/**
 * Define an array of the known log levels.
 *
 * Combines the log levels from a number of log libraries.
 * Each library then needs a defined logger that maps to its own log levels.
 *
 * sails: https://github.com/balderdashy/captains-log/blob/28fb8e0ce903e23d2eabf881bc4020223847ac54/lib/captains.js
 * winston: https://github.com/winstonjs/winston#logging-levels
 * pino: https://github.com/pinojs/pino/blob/98d8fa4d95f1c759eb0dd6e4aca496a0eee31e25/lib/constants.js
 * console: https://developer.mozilla.org/en-US/docs/Web/API/console#outputting_text_to_the_console
 */
export const availableLogLevels = [
  'silent',
  'blank',
  'fatal',
  'crit',
  'emerg',
  'error',
  'alert',
  'warn',
  'warning',
  'info',
  'log',
  'notice',
  'debug',
  'verbose',
  'trace',
  'silly',
] as const;

/**
 * Log levels as a union type.
 */
export type AvailableLogLevels = typeof availableLogLevels[number];

/**
 * Log levels as a map of name to function signature.
 */
type AvailableLogFuncs = {
  [K in AvailableLogLevels]: (...args: unknown[]) => void;
}

/**
 * Log levels as an interface.
 */
export interface ILogger extends AvailableLogFuncs {
}

/**
 * Log function that does nothing.
 */
export const noOpLogFunc = (): void => undefined;

/**
 * Type guard that checks if the value satisfies the ILogger interface.
 * @param value Value to check.
 */
export function isLogger(value: unknown): value is ILogger {
  if (value === undefined || value === null || typeof value !== 'object' || Array.isArray(value)) {
    return false;
  }
  const record = value as Record<PropertyKey, unknown>;
  for (const availableLogLevel of availableLogLevels) {
    if (!(availableLogLevel in value) || typeof record[availableLogLevel] !== 'function') {
      return false;
    }
  }
  return true;
}

/**
 * Type guard that checks if the value is an available log level.
 * @param value Value to check.
 */
export function isAvailableLogLevel(value: unknown): value is AvailableLogLevels {
  if (value === undefined || value === null || typeof value !== 'string') {
    return false;
  }
  return availableLogLevels.some(i => i === value);
}

/**
 * Logger implementation that uses the console.
 */
export const consoleLogger: ILogger = {
  silent: noOpLogFunc,
  blank: () => console.log(''),
  fatal: (...args: unknown[]) => console.error(...args),
  crit: (...args: unknown[]) => console.error(...args),
  emerg: (...args: unknown[]) => console.error(...args),
  error: (...args: unknown[]) => console.error(...args),
  alert: (...args: unknown[]) => console.error(...args),
  warn: (...args: unknown[]) => console.warn(...args),
  warning: (...args: unknown[]) => console.warn(...args),
  info: (...args: unknown[]) => console.info(...args),
  log: (...args: unknown[]) => console.log(...args),
  notice: (...args: unknown[]) => console.info(...args),
  debug: (...args: unknown[]) => console.debug(...args),
  verbose: (...args: unknown[]) => console.debug(...args),
  silly: (...args: unknown[]) => console.debug(...args),
  trace: (...args: unknown[]) => console.trace(...args),
};

/**
 * Logger implementation that discards all logs.
 */
export const nothingLogger: ILogger = {
  silent: noOpLogFunc,
  blank: noOpLogFunc,
  fatal: noOpLogFunc,
  crit: noOpLogFunc,
  emerg: noOpLogFunc,
  error: noOpLogFunc,
  alert: noOpLogFunc,
  warn: noOpLogFunc,
  warning: noOpLogFunc,
  info: noOpLogFunc,
  log: noOpLogFunc,
  notice: noOpLogFunc,
  debug: noOpLogFunc,
  verbose: noOpLogFunc,
  silly: noOpLogFunc,
  trace: noOpLogFunc,
}
