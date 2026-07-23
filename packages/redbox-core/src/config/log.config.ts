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
import type {Logger, LoggerOptions, DestinationStream, LevelWithSilent} from 'pino';
import {availableLogLevels, AvailableLogLevels, ILogger, isLogger} from '@researchdatabox/sails-ng-common';
import {isPlainObject as _isPlainObject} from "lodash-es";

// Declare global sails type for namespace logger
declare const sails: Sails.Application;

const initialLogLevel = 'verbose' as const;

const pinoLevels: LevelWithSilent[] = ["fatal", "error", "warn", "info", "debug", "trace", "silent"] as const;

type CustomLevels = Exclude<AvailableLogLevels, LevelWithSilent>;
const customLevels = availableLogLevels.filter(i => !(pinoLevels as readonly string[]).includes(i));
type CustomLogLevelValues = Record<CustomLevels, number>;

const customLevelBlank = 69;
const customLevelMap: CustomLogLevelValues = {
  // silent: ,
  blank: customLevelBlank,
  // fatal: 60,
  crit: 59,
  emerg: 58,
  // error: 50,
  alert: 49,
  // warn: 40,
  warning: 39,
  // info: 30,
  log: 29,
  notice: 28,
  // debug: 20,
  verbose: 19,
  // trace: 10,
  silly: 9,
};


export interface LogConfig {
  custom: ILogger; // Use ILogger instead of custom interface
  inspect: boolean;
  level: AvailableLogLevels;
  customLogger: ILogger;
  createNamespaceLogger: typeof createNamespaceLogger;
  createPinoLogger: typeof createPinoLogger;
  lognamespace: Record<string, string>;
}

export function isPinoLogger(value: unknown): value is Logger {
  if (value === undefined || value === null || typeof value !== 'object') {
    return false;
  }
  if (!('level' in value) || typeof value.level !== 'string' || !availableLogLevels.some(i => i === value.level)) {
    return false;
  }
  // TODO
  // if (!('customLevels' in value) || value.customLevels === null || typeof value.customLevels !== 'object' || !_isPlainObject(value.customLevels)) {
  //   return false;
  // }
  // if (!('child' in value) || typeof value.child !== 'function') {
  //   return false;
  // }
  // if (!Object.keys(value.customLevels).every(i => (customLevels as readonly string[]).includes(i))) {
  //   return false;
  // }
  return true;
}

/**
 * Create a pino logger, using an optional log level and an optional destination.
 */
function createPinoLogger(level?: AvailableLogLevels, destination?: DestinationStream): ILogger & Logger {
  const options: LoggerOptions = {
    formatters: {
      level: (label: string) => ({level: label})
    },
    customLevels: customLevelMap,
    level: level ?? initialLogLevel,
    hooks: {
      logMethod(inputArgs: unknown[], method: (...args: unknown[]) => void, level: number) {
        if (level === customLevelBlank) {
          return method.apply(this, []);
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
      }
    }
  };

  let logger: Logger;
  if (destination) {
    logger = pino(options, destination);
  } else {
    options.transport = {
      target: 'pino-logfmt',
      options: {
        formatTime: true,
        flattenNestedObjects: true,
        convertToSnakeCase: true,
      }
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
function createNamespaceLogger(name: string, parentLogger: ILogger, prefix?: string, level?: AvailableLogLevels): ILogger & Logger {
  if (!name) {
    throw new Error('Must provide a logger name.');
  }
  if (!isPinoLogger(parentLogger)) {
    throw new Error(`Expected parentLogger to be a pino logger, but got ${parentLogger}`);
  }

  let calcLevel: string | null = level ?? null;
  if (!calcLevel && typeof sails !== 'undefined') {
    calcLevel = sails.config.lognamespace[name] ?? calcLevel;
  }

  const bindings = {name: name};
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
  lognamespace: {},
};
