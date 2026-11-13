/**
 * The application log levels, ordered from most to least severe.
 *
 * These are the levels provided by sails (captains-log) and the custom logger in `config/log.js`.
 * Other log libraries use different level names (e.g. pino, winston, console).
 * Map those provider levels in an adapter, instead of adding them to this list,
 * so that existing logger implementations remain compatible with {@link ILogger}.
 *
 * sails: https://github.com/balderdashy/captains-log/blob/28fb8e0ce903e23d2eabf881bc4020223847ac54/lib/captains.js
 */
export const availableLogLevels = [
  'silent',
  'blank',
  'fatal',
  'crit',
  'error',
  'warn',
  'info',
  'log',
  'debug',
  'verbose',
  'trace',
  'silly',
] as const;

/**
 * Log levels as a union type.
 */
export type AvailableLogLevels = (typeof availableLogLevels)[number];

/**
 * Logger interface based on the sails logger and the custom logger in `config/log.js`.
 */
export interface ILogger {
  level?: string;
  silly: (...args: unknown[]) => void;
  verbose: (...args: unknown[]) => void;
  trace: (...args: unknown[]) => void;
  debug: (...args: unknown[]) => void;
  log: (...args: unknown[]) => void;
  info: (...args: unknown[]) => void;
  warn: (...args: unknown[]) => void;
  error: (...args: unknown[]) => void;
  crit: (...args: unknown[]) => void;
  fatal: (...args: unknown[]) => void;
  silent: (...args: unknown[]) => void;
  blank: (...args: unknown[]) => void;
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
 * Log at a level that is only known at runtime, such as a level from config.
 * Unknown levels are logged at 'info', with a warning.
 * @param logger The logger to use.
 * @param level The log level.
 * @param args The log arguments.
 */
export function logAtLevel(logger: ILogger, level: unknown, ...args: unknown[]): void {
  let resolvedLevel: AvailableLogLevels = 'info';
  if (isAvailableLogLevel(level)) {
    resolvedLevel = level;
  } else {
    logger.warn(`Unknown log level '${String(level)}', using 'info' instead.`);
  }
  const logFunc = logger[resolvedLevel];
  if (typeof logFunc === 'function') {
    logFunc.apply(logger, args);
  }
}

/**
 * Logger implementation that uses the console.
 */
export const consoleLogger: ILogger = {
  silent: noOpLogFunc,
  blank: () => console.log(''),
  fatal: (...args: unknown[]) => console.error(...args),
  crit: (...args: unknown[]) => console.error(...args),
  error: (...args: unknown[]) => console.error(...args),
  warn: (...args: unknown[]) => console.warn(...args),
  info: (...args: unknown[]) => console.info(...args),
  log: (...args: unknown[]) => console.log(...args),
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
  error: noOpLogFunc,
  warn: noOpLogFunc,
  info: noOpLogFunc,
  log: noOpLogFunc,
  debug: noOpLogFunc,
  verbose: noOpLogFunc,
  silly: noOpLogFunc,
  trace: noOpLogFunc,
};
