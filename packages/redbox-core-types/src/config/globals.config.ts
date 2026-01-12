/**
 * Globals Config Interface
 * (sails.config.globals)
 * 
 * Configure which global variables Sails exposes.
 * Note: This file contains require() calls and must stay as JS for runtime.
 */

export interface GlobalsConfig {
    /** Expose lodash as global _ */
    _: any | boolean;

    /** Expose async library as global */
    async: any | boolean;

    /** Expose models globally */
    models: boolean;

    /** Expose sails globally */
    sails: boolean;
}

// Note: Default values require runtime require() calls.
// The original config/globals.js file must be kept.
