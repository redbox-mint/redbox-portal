/**
 * HTTP Config Interface
 * Auto-generated from config/http.js
 * 
 * Note: The actual HTTP configuration requires runtime middleware setup.
 * This file only provides TypeScript interfaces for type checking.
 */

import { RequestHandler, Request, Response, NextFunction } from 'express';

/**
 * Middleware function signature
 */
export type MiddlewareFunction = (req: Request, res: Response, next: NextFunction) => void;

/**
 * Middleware configuration object
 */
export interface HttpMiddlewareConfig {
    /** Order of middleware execution */
    order: string[];

    /** Middleware functions by name */
    redboxSession?: MiddlewareFunction;
    passportInit?: RequestHandler;
    passportSession?: RequestHandler;
    brandingAndPortalAwareStaticRouter?: MiddlewareFunction;
    translate?: MiddlewareFunction;
    myBodyParser?: MiddlewareFunction;
    poweredBy?: MiddlewareFunction;
    redirectNoCacheHeaders?: MiddlewareFunction;
    cacheControl?: MiddlewareFunction;
    handleBodyParserError?: MiddlewareFunction;
    startRequestTimer?: MiddlewareFunction;
    cookieParser?: RequestHandler;
    compress?: RequestHandler;
    methodOverride?: RequestHandler;
    router?: RequestHandler;
    www?: RequestHandler;
    favicon?: RequestHandler;

    /** Allow additional custom middleware */
    [key: string]: MiddlewareFunction | RequestHandler | string[] | undefined;
}

/**
 * HTTP configuration interface for sails.config.http
 */
export interface HttpConfig {
    /** Root context path for the application */
    rootContext: string;

    /** Middleware configuration */
    middleware: HttpMiddlewareConfig;

    /** Number of seconds to cache flat files on disk */
    cache?: number;
}

// Note: Default values are NOT exported as they require runtime middleware setup.
// The original config/http.js file must be kept for runtime functionality.
