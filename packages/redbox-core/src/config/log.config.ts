/**
 * Built-in Log Configuration
 * (sails.config.log)
 *
 * Configure the log level for your app, as well as the transport.
 * Using pino for namespace logging and different formats to different transports.
 */

import * as _ from 'lodash';
const pino = require('pino');
import type { Logger, LoggerOptions, DestinationStream } from 'pino';
import { ILogger } from '../Logger';

// Declare global sails type for namespace logger
declare const sails: {
    config: {
        lognamespace: Record<string, string>;
    };
};

export type SailsLogLevel = 'silly' | 'verbose' | 'trace' | 'debug' | 'log' | 'info' | 'warn' | 'error' | 'crit' | 'fatal' | 'silent' | 'blank';

// Helper to ensure the logger satisfies ILogger interface
function asILogger(logger: Logger): ILogger {
    const iLogger = logger as unknown as ILogger;
    // Add missing blank method if it doesn't exist (pino doesn't support 'blank' level natively)
    if (!iLogger.blank) {
        iLogger.blank = iLogger.silent;
    }
    return iLogger;
}

export interface LogConfig {
    custom: ILogger; // Use ILogger instead of custom interface
    inspect: boolean;
    level: SailsLogLevel;
    customLogger: ILogger;
    createNamespaceLogger: (name: string, parentLogger: ILogger, prefix?: string, level?: string) => ILogger;
    createPinoLogger: (level?: string, destination?: DestinationStream) => ILogger;
}

/**
 * Create a pino logger, using an optional log level and an optional destination.
 */
function createPinoLogger(level?: string, destination?: DestinationStream): ILogger {
    const options: LoggerOptions = {
        formatters: {
            level: (label: string) => ({ level: label })
        },
        customLevels: {
            silly: 5,
            verbose: 9,
            log: 29,
            crit: 59,
        },
        level: level ?? 'verbose',
        hooks: {
            logMethod(inputArgs: unknown[], method: (...args: unknown[]) => void) {
                if (inputArgs.length === 1) {
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

    return asILogger(logger);
}

/**
 * Create a namespaced logger using the pino 'childlogger' feature.
 */
function createNamespaceLogger(name: string, parentLogger: ILogger, prefix?: string, level?: string): ILogger {
    if (!name) {
        throw new Error('Must provide a logger name.');
    }

    let calcLevel: string | null = level ?? null;
    if (!calcLevel && typeof sails !== 'undefined') {
        calcLevel = sails.config.lognamespace[name] ?? calcLevel;
    }

    const bindings = { name: name };
    const options: Record<string, unknown> = {};

    if (calcLevel !== null) {
        options['level'] = calcLevel;
    }
    if (prefix) {
        options['msgPrefix'] = prefix;
    }

    // parentLogger is ILogger but underlying is pino. Need to cast to pino Logger to call child()
    // However, ILogger methods are compatible. 
    // Typescript might complain if we treat ILogger as pino Logger directly if ILogger is missing pino specific methods.
    // But since we created it via createPinoLogger, it IS a pino logger.
    const pinoParent = parentLogger as unknown as Logger;
    const newLogger = pinoParent.child(bindings, options);

    return asILogger(newLogger);
}

const customLogger = createPinoLogger();

export const log: LogConfig = {
    custom: {
        silly: function silly(...args: unknown[]) { customLogger.silly(...args); },
        verbose: function verbose(...args: unknown[]) { customLogger.verbose(...args); },
        trace: function trace(...args: unknown[]) { customLogger.trace(...args); },
        debug: function debug(...args: unknown[]) { customLogger.debug(...args); },
        log: function log(...args: unknown[]) { customLogger.log(...args); },
        info: function info(...args: unknown[]) { customLogger.info(...args); },
        warn: function warn(...args: unknown[]) { customLogger.warn(...args); },
        error: function error(...args: unknown[]) { customLogger.error(...args); },
        crit: function crit(...args: unknown[]) { customLogger.crit(...args); },
        fatal: function fatal(...args: unknown[]) { customLogger.fatal(...args); },
        silent: function silent(...args: unknown[]) { customLogger.silent(...args); },
        blank: function blank(...args: unknown[]) { customLogger.silent(...args); },
    },
    inspect: false,
    level: 'verbose',
    customLogger: customLogger,
    createNamespaceLogger: createNamespaceLogger,
    createPinoLogger: createPinoLogger,
};
