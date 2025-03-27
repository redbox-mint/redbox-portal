/*
 * Namespace loggers:
 * Change the log level individually per logger.
 * The convention is to use class names.
 *
 * Implementation:
 * Key is the case-sensitive name passed to 'createNamespaceLogger'.
 * Value is the log level, one of the sails.js levels.
 *
 * These can be set in a config file named 'lognamespace.js' using 'module.exports.lognamespace',
 * or set via env var e.g. `'sails_lognamespace__EmailService=info'`
 */

module.exports.lognamespace = {};