/**
 * Views Config Interface
 * (sails.config.views)
 * 
 * View engine configuration for server-side rendering.
 */

export interface ViewsConfig {
    /** Template engine: 'ejs', 'jade', 'handlebars', etc. */
    engine?: string;

    /** Layout template path (relative to views/) or false to disable */
    layout?: string | false;

    /** Partials directory path or false to disable */
    partials?: string | false;

    /** View paths that should have no-cache headers */
    noCache?: string[];

    /** Additional view engine options */
    [key: string]: unknown;
}

export const views: ViewsConfig = {
    engine: 'ejs',
    layout: 'default/default/layout',
    partials: false,
    noCache: [
        '/default/rdmp/researcher/home',
        '/default/rdmp/home',
        '/',
    ],
};
