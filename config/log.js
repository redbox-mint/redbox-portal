/**
 * Built-in Log Configuration
 * (sails.config.log)
 *
 * Configure the log level for your app, as well as the transport.
 *
 * For more information on the Sails logger, check out:
 * http://sailsjs.org/#!/documentation/concepts/Logging
 *
 * Using pino for namespace logging and different formats to different transports.
 * https://getpino.io
 */

const _ = require("lodash");
const pino = require('pino');

/**
 * Create a pino logger, using an optional log level and an optional destination.
 * @param level The log level (a sails.js log level).
 * @param destination An additional pino destination
 * @returns {*}
 */
function createPinoLogger(level, destination) {
    // TODO: Set up transports to send:
    //       - JSON formatted logs to Grafana (at log level e.g. warn)
    //       - Simple logs to stdout (using the provided log level)

    // At the moment, all logs are sent only to stdout, in logfmt format.

    // Set up a default configuration for pino.
    // This is used in configuring the logger and for testing.
    const options = {
        // use level labels instead of numbers
        formatters: {
            level: (label) => {
                return {
                    level: label
                }
            }
        },

        // This adds more log levels to pino to match the levels expected by sails.js.
        // Only the sails.js log levels are recognised.
        customLevels: {
            // sails.js 'silly' is 'more verbose' than pino 'trace'
            silly: 5,

            // sails.js 'verbose' is pino 'trace'
            verbose: 9,

            // trace: 10, // pino only
            // debug: 20, // sails.js & pino

            // 'log' is 'info'
            log: 29,

            // info: 30, // sails.js & pino
            // warn: 40, // sails.js & pino
            // error: 50, // sails.js & pino

            // sails.js 'crit' is pino 'fatal'
            crit: 59,

            // fatal: 60, // pino

            // sails.js 'blank' is pino 'silent'
            // TODO: _.noop cannot be cloned by pino-logfmt
            // blank: _.noop,

            // pino 'silent' is also a no-op
        },
        // Set the pino log level. This must be kept in sync with the sails log level.
        // Initially set to 'verbose', then set to the sails.log.level in bootstrap.js.
        level: level ?? 'verbose',
        hooks: {
            logMethod(inputArgs, method, level) {
                // See: https://getpino.io/#/docs/api?id=hooks-object
                // Cater for the existing usages of the log methods in sails, so everything is included in the log output
                // console.log('translateSailsToPino', arguments);
                if (inputArgs.length === 1) {
                    // A message string can optionally be supplied as the first parameter
                    // An object can optionally be supplied as the first parameter.
                    return method.apply(this, inputArgs);
                } else if (inputArgs.length >= 2 && _.isString(inputArgs[0]) && !_.isString(inputArgs[1])) {
                    // A message string can optionally be supplied as the second parameter after supplying a mergingObject.
                    const arg1 = inputArgs.shift();
                    const arg2 = inputArgs.shift();
                    return method.apply(this, [arg2, arg1, ...inputArgs]);
                } else if (inputArgs.length > 1 && _.isString(inputArgs[0])) {
                    // If the first argument is a string, assume it is the message, and put the rest of the arguments into the object.
                    const arg1 = inputArgs.shift();
                    const arg2 = inputArgs.shift();
                    return method.apply(this, [arg2, arg1, ...inputArgs]);
                } else {
                    // Ensure all the arguments are logged
                    return method.apply(this, inputArgs);
                }
            }
        }
    };

    if (destination) {
        return pino(options, destination);
    } else {
        // Use the logfmt format instead of the default JSON format.
        options.transport = {
            target: "pino-logfmt",
            options: {
                formatTime: true,
                flattenNestedObjects: true,
                convertToSnakeCase: true,
            }
        };
        return pino(options);
    }
}

/**
 * Create a namespaced logger using the pino 'childlogger' feature.
 * @param name The name for the namespace.
 * @param parentLogger The existing logger to use. Will use the default sails logger if not provided.
 * @param prefix A prefix to apply to every log created by this namespaced logger.
 * @param level The log level for the new namespaced logger.
 * @returns The new namespaced logger.
 */
function createNamespaceLogger(name, parentLogger, prefix, level) {
    // Refs:
    // https://getpino.io/#/docs/api?id=child
    // https://getpino.io/#/docs/child-loggers
    // https://github.com/pinojs/pino/issues/1886

    // if (!parentLogger && typeof sails !== undefined) {
    //     parentLogger = sails.log;
    // }
    if (!name) {
        throw new Error(`Must provide a logger name.`);
    }


    let calcLevel = level ?? null;
    // console.log(`CalcLevel initial ${calcLevel}`);
    if (!calcLevel && typeof sails !== undefined) {
        // console.log(`sails is available`);
        calcLevel = sails.config.lognamespace[name] ?? calcLevel;
        // console.log(`CalcLevel after sails lognamespace ${calcLevel}`);
    }

    const bindings = {name: name};
    const options = {};

    // Set any customisations.
    if (calcLevel !== null) {
        options['level'] = calcLevel;
    }
    if (prefix) {
        options['msgPrefix'] = prefix;
    }

    // console.log(`newLogger bindings ${JSON.stringify(bindings)} options ${JSON.stringify(options)}`);
    const newLogger = parentLogger.child(bindings, options);

    // // for debugging:
    // // Helper function to check the type of the item.
    // function checkType(item) {
    //     // see: https://github.com/balderdashy/captains-log/blob/28fb8e0ce903e23d2eabf881bc4020223847ac54/index.js#L57
    //     return {
    //         'obj': item,
    //         'toString.call': Object.prototype.toString.call(item),
    //         'typeof': typeof item,
    //         'isObject': _.isObject(item),
    //         'isFunction': _.isFunction(item.log),
    //     };
    // }
    // console.log(`createNamespaceLogger result`, JSON.stringify({
    //     bindings: bindings,
    //     options: options,
    //     checkType: checkType(newLogger)
    // }));

    return newLogger;
}

const customLogger = createPinoLogger();

module.exports.log = {
    // Wrap the pino logger so it passes the sails.js 'valid custom logger' check.
    // Include the additional pino levels so that any log calls within pino work.
    custom: {
        silly: function silly() { customLogger.silly(...arguments)},
        verbose: function verbose() { customLogger.verbose(...arguments)},
        trace: function trace() { customLogger.trace(...arguments)},
        debug: function debug() { customLogger.debug(...arguments)},
        log: function log() { customLogger.log(...arguments)},
        info: function info() { customLogger.info(...arguments)},
        warn: function warn() { customLogger.warn(...arguments)},
        error: function error() { customLogger.error(...arguments)},
        crit: function crit() { customLogger.crit(...arguments)},
        fatal: function fatal() { customLogger.fatal(...arguments)},
        silent: function silent() { customLogger.silent(...arguments)},
        blank: function blank() { customLogger.silent(...arguments)},
    },
    // Turn off the sails captains-log inspection.
    inspect: false,
    // Set a sails default log level.
    level: 'verbose',
    // Store the custom logger so it can be accessed.
    customLogger: customLogger,
    // Provide custom function to create a namespaced ('child') pino logger.
    createNamespaceLogger: createNamespaceLogger,
    // Provide custom function to create a top-level pino logger.
    createPinoLogger: createPinoLogger,
};
