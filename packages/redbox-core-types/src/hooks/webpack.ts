/**
 * Webpack Hook
 * 
 * Compiles assets using webpack during Sails lift.
 * - In production (docker): build once, then trigger done
 * - In development: builds and triggers done
 * 
 * Skipped when:
 * - NODE_ENV != 'docker'
 * - WEBPACK_SKIP === 'true'
 * - isSailsScriptEnv()
 */

import webpack from 'webpack';
import { once } from 'lodash';
// Import to ensure Sails namespace is available
import '../sails';

declare var sails: Sails.Application;
declare var global: any;

interface WebpackStats {
    hasErrors(): boolean;
    toString(options?: { colors?: boolean; chunks?: boolean }): string;
}

function logCompileInfo(err: Error | null, stats: WebpackStats): void {
    if (err) {
        sails.log.error('sails-hook-webpack: Build error: \n\n', err);
    }
    sails.log[stats.hasErrors() ? 'error' : 'info'](
        `sails-hook-webpack:\n${stats.toString({ colors: true, chunks: true })}`
    );
}

export function defineWebpackHook(sailsInstance: Sails.Application, _webpack = webpack) {
    if (!sailsInstance.config.webpack) {
        sailsInstance.log.warn('sails-hook-webpack: No Webpack options have been defined.');
        return {};
    }

    if (!sailsInstance.config.webpack.config) {
        sailsInstance.log.warn('sails-hook-webpack: Configure your config/webpack.js file.');
        return {};
    }

    if (process.env.NODE_ENV !== 'docker' || process.env.WEBPACK_SKIP === 'true') {
        sailsInstance.log.warn(`sails-hook-webpack: Configured to skip webpack.`);
        return {};
    }

    return {
        /**
         * Runs when this Sails app loads/lifts.
         */
        initialize: async function (done: () => void) {
            sailsInstance.log.info('Initializing custom hook (`webpack`)');

            const isSailsScriptEnv = () => global.isSailsScriptEnv;
            if (isSailsScriptEnv()) {
                done();
                return;
            }

            // Enable minimization of CSS when explicitly told so
            if (process.env.WEBPACK_CSS_MINI === 'true') {
                sailsInstance.config.webpack.config[0].optimization.minimize = true;
                sailsInstance.log.info(`Webpack hook is configured for CSS minimization.`);
            }

            const compiler = _webpack(sailsInstance.config.webpack.config);

            // On first compilation, if it fails throw, else call done
            const triggerDoneOnce = once((err: Error | null, stats: WebpackStats) => {
                if (err || stats.hasErrors()) {
                    sailsInstance.log.error(err);
                    sailsInstance.log.error(stats);
                    throw new Error(`sails-hook-webpack failed`);
                } else {
                    done();
                }
            });

            const compileCallback = (...args: [Error | null, WebpackStats]) => {
                logCompileInfo(...args);
                triggerDoneOnce(...args);
            };

            compiler.run(compileCallback as any);
        }
    };
}

export default defineWebpackHook;
