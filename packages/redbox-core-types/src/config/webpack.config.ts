/**
 * Webpack Config Interface
 * (sails.config.webpack)
 * 
 * Webpack bundling configuration.
 * Note: This file contains require() calls and must stay as JS.
 */

import type { Configuration } from 'webpack';

export interface WebpackConfig {
    /** Webpack configuration array */
    config: Configuration[];

    /** Enable watch mode */
    watch: boolean;

    /** Watch options */
    watchOptions?: {
        ignored?: string[];
        aggregateTimeout?: number;
        poll?: number | boolean;
    };
}

// Note: Default values require runtime require() calls.
// The original config/webpack.js file must be kept for runtime.
