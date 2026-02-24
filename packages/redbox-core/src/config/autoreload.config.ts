/**
 * Autoreload Config Interface
 * (sails.config.autoreload)
 * 
 * Hot reload configuration for development.
 */

export interface AutoreloadConfig {
    /** Enable/disable autoreload */
    active: boolean;

    /** Use file polling for change detection */
    usePolling: boolean;

    /** Directories to watch for changes */
    dirs: string[];

    /** File patterns to ignore */
    ignored: string[];
}

export const autoreload: AutoreloadConfig = {
    active: false,
    usePolling: false,
    dirs: [
        'api/models',
        'api/controllers',
        'api/services',
        'config/locales'
    ],
    ignored: ['**.ts']
};
