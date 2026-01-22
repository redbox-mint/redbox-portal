/**
 * Globals Config
 * (sails.config.globals)
 * 
 * Sails globals configuration.
 * Exports lodash and async as globals.
 */

import * as _ from 'lodash';
import * as async from 'async';

export interface GlobalsConfig {
    /** Lodash library */
    _: typeof _;
    /** Async library */
    async: typeof async;
    /** Enable global models */
    models: boolean;
    /** Enable global sails object */
    sails: boolean;
}

export const globals: GlobalsConfig = {
    _: _,
    async: async,
    models: true,
    sails: true
};
