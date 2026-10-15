/**
 * Built-in Log Configuration
 * (sails.config.log)
 *
 * Configure the log level for your app, as well as the transport.
 *
 * Using pino for namespace logging and different formats to different transports.
 */

import * as _ from 'lodash';
const pino = require('pino');
import type { Logger, LoggerOptions, DestinationStream } from 'pino';
import { AvailableLogLevels, ILogger, isLogger } from '@researchdatabox/sails-ng-common';
import { isPinoLogger } from '../utilities/PinoLoggerUtils';
import { defaultRequestChronicleSettings, RequestChronicleSettings } from '../utilities/RequestChronicleSettings';

export { isPinoLogger } from '../utilities/PinoLoggerUtils';

// Declare global sails type for namespace logger
declare const sails: Sails.Application;

/**
 * The sails log levels.
 * Retained for compatibility; equivalent to {@link AvailableLogLevels}.
 */
export type SailsLogLevel = AvailableLogLevels;

const initialLogLevel = 'verbose' as const;

/**
 * Pino level values for the application log levels that pino does not provide.
 * Pino provides fatal (60), error (50), warn (40), info (30), debug (20), trace (10), and silent.
 */
const customLevelBlank = 69;
const customLevelMap: Record<'blank' | 'crit' | 'log' | 'verbose' | 'silly', number> = {
  blank: customLevelBlank,
  crit: 59,
  log: 29,
  verbose: 19,
  silly: 9,
};

export interface LogConfig {
  custom: ILogger; // Use ILogger instead of custom interface
  inspect: boolean;
  level: SailsLogLevel;
  customLogger: ILogger;
  createNamespaceLogger: typeof createNamespaceLogger;
  createPinoLogger: typeof createPinoLogger;
  /**
   * Retention settings for the request chronicle event logged at the end of each HTTP request.
   * See the 'Request Chronicle Logging' wiki page.
   */
  requestChronicle?: Partial<RequestChronicleSettings>;
}

/** The default transport is shipped as CommonJS so Pino workers can load it without a TypeScript loader. */
export const logfmtTransportTarget = require.resolve('../../logfmt-transport.cjs');
/** The options for the default logfmt transport. */
export const logfmtTransportOptions = Object.freeze({
  formatTime: true,
  flattenNestedObjects: true,
  convertToSnakeCase: true,
});

/**
 * Create a pino logger, using an optional log level and an optional destination.
 */
function createPinoLogger(level?: AvailableLogLevels, destination?: DestinationStream): ILogger & Logger {
  const options: LoggerOptions = {
    formatters: {
      level: (label: string) => ({ level: label }),
    },
    customLevels: customLevelMap,
    level: level ?? initialLogLevel,
    hooks: {
      logMethod(inputArgs: unknown[], method: (...args: unknown[]) => void, level: number) {
        if (level === customLevelBlank) {
          return;
        } else if (inputArgs.length === 1) {
          return method.apply(this, inputArgs);
        } else if (inputArgs.length >= 2 && _.isString(inputArgs[0]) && !_.isString(inputArgs[1])) {
          const arg1 = (inputArgs as unknown[]).shift();
          const arg2 = (inputArgs as unknown[]).shift();
          return method.apply(this, [arg2, arg1, ...inputArgs]);
        } else if (inputArgs.length > 1 && _.isString(inputArgs[0])) {
          const arg1 = (inputArgs as unknown[]).shift();
          const arg2 = (inputArgs as unknown[]).shift();
          return method.apply(this, [arg2, arg1, ...inputArgs]);
        } else {
          return method.apply(this, inputArgs);
        }
      },
    },
  };

  let logger: Logger;
  if (destination) {
    logger = pino(options, destination);
  } else {
    options.transport = {
      target: logfmtTransportTarget,
      options: { ...logfmtTransportOptions },
    };
    logger = pino(options);
  }

  if (!isLogger(logger)) {
    throw new Error(`Pino logger does not have all the log level functions expected.`);
  }
  return logger;
}

/**
 * Create a namespaced logger using the pino 'childlogger' feature.
 */
function createNamespaceLogger(
  name: string,
  parentLogger: ILogger,
  prefix?: string,
  level?: AvailableLogLevels
): ILogger & Logger {
  if (!name) {
    throw new Error('Must provide a logger name.');
  }
  if (!isPinoLogger(parentLogger)) {
    throw new Error(
      `Expected parentLogger to be a pino logger with a 'child' function, but got ${typeof parentLogger}.`
    );
  }

  let calcLevel: string | null = level ?? null;
  if (!calcLevel && typeof sails !== 'undefined') {
    calcLevel = sails.config?.lognamespace?.[name] ?? calcLevel;
  }

  const bindings = { name: name };
  const options: Record<string, unknown> = {};

  if (calcLevel !== null) {
    options['level'] = calcLevel;
  }
  if (prefix) {
    options['msgPrefix'] = prefix;
  }

  const namespaceLogger = parentLogger.child(bindings, options);

  if (!isLogger(namespaceLogger)) {
    throw new Error(`Pino namespace logger does not have the expected log level functions.`);
  }
  return namespaceLogger;
}

const customLogger = createPinoLogger(initialLogLevel);

export const log: LogConfig = {
  custom: customLogger,
  inspect: false,
  level: initialLogLevel,
  customLogger: customLogger,
  createNamespaceLogger: createNamespaceLogger,
  createPinoLogger: createPinoLogger,
  requestChronicle: { ...defaultRequestChronicleSettings },
};
