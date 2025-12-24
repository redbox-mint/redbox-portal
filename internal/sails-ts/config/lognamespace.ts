import type { SailsConfig } from "redbox-core-types";

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

const lognamespaceConfig: SailsConfig["lognamespace"] = {
  // Set TranslationService to only show warn or error messages
  TranslationService: 'warn',
  // Set I18nEntriesService to only show warn or error messages
  I18nEntriesService: 'warn',
  // Set WorkflowStepsService to only show warn or error messages
  WorkflowStepsService: 'warn',
  // Set FormsService to only show warn or error messages
  FormsService: 'warn',
  // Set RenderViewController to only show warn or error messages
  RenderViewController: 'warn',
};

module.exports.lognamespace = lognamespaceConfig;
