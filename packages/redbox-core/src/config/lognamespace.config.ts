/**
 * Log Namespace Config Interface
 * (sails.config.lognamespace)
 * 
 * Per-namespace log level configuration.
 */

export type LogLevel = 'silly' | 'verbose' | 'debug' | 'info' | 'warn' | 'error' | 'silent';

export interface LogNamespaceConfig {
    /** Log level for each namespace (typically class names) */
    [namespaceName: string]: LogLevel;
}

export const lognamespace: LogNamespaceConfig = {
    TranslationService: 'warn',
    I18nEntriesService: 'warn',
    WorkflowStepsService: 'warn',
    FormsService: 'warn',
    RenderViewController: 'warn',
};
