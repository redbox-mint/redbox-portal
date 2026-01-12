/**
 * Routes Config Interface
 * (sails.config.routes)
 * 
 * Custom route mappings.
 * Note: This file contains complex route definitions and must stay as JS.
 */

export interface RouteLocals {
    view?: string;
    [key: string]: unknown;
}

export interface RouteTarget {
    controller?: string;
    action?: string;
    view?: string;
    locals?: RouteLocals;
    skipAssets?: boolean;
    skipRegex?: RegExp;
    cors?: boolean | object;
    csrf?: boolean;
    response?: string;
    [key: string]: unknown;
}

export interface RoutesConfig {
    /** Route pattern to target mapping */
    [routePattern: string]: string | RouteTarget;
}

// Note: Default values contain complex route definitions.
// The original config/routes.js file must be kept for runtime.
