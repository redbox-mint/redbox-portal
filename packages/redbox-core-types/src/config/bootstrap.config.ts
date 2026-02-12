/**
 * Bootstrap Config Interface
 * (sails.config.bootstrap)
 * 
 * App bootstrap lifecycle function.
 * Note: This file contains async runtime code and must stay as JS.
 */

export type BootstrapFunction = (done: (err?: Error) => void) => Promise<void> | void;

export interface BootstrapConfig {
    /** Bootstrap function that runs before Sails app lifts */
    bootstrap?: BootstrapFunction;
    /** Base directory used for development/test bootstrap seed data */
    bootstrapDataPath?: string;
}

// Note: Default values contain async runtime code.
// The original config/bootstrap.js file must be kept for runtime.
