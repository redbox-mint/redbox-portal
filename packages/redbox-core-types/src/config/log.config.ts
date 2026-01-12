/**
 * Log Config Interface
 * Auto-generated from config/log.js
 * 
 * Note: The actual log configuration requires runtime pino setup.
 * This file only provides TypeScript interfaces for type checking.
 */

import { ILogger } from '../Logger';

/**
 * Custom log methods matching Sails.js log levels
 */
export interface CustomLogMethods {
    silly: (...args: any[]) => void;
    verbose: (...args: any[]) => void;
    trace: (...args: any[]) => void;
    debug: (...args: any[]) => void;
    log: (...args: any[]) => void;
    info: (...args: any[]) => void;
    warn: (...args: any[]) => void;
    error: (...args: any[]) => void;
    crit: (...args: any[]) => void;
    fatal: (...args: any[]) => void;
    silent: (...args: any[]) => void;
    blank: (...args: any[]) => void;
}

/**
 * Log configuration interface for sails.config.log
 */
export interface LogConfig {
    /** Custom logger implementing Sails log methods */
    custom: CustomLogMethods;

    /** Turn off the sails captains-log inspection */
    inspect: boolean;

    /** Sails default log level */
    level: 'silly' | 'verbose' | 'debug' | 'info' | 'warn' | 'error' | 'crit' | 'silent' | string;

    /** The underlying pino logger instance */
    customLogger: ILogger;

    /** Create a namespaced ('child') pino logger */
    createNamespaceLogger: (
        name: string,
        parentLogger?: ILogger,
        prefix?: string,
        level?: string
    ) => ILogger;

    /** Create a top-level pino logger */
    createPinoLogger: (
        level?: string,
        destination?: any
    ) => ILogger;
}

// Note: Default values are NOT exported as they require runtime pino initialization.
// The original config/log.js file must be kept for runtime functionality.
