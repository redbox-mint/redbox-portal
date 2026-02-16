/**
 * HTTP Config
 * (sails.config.http)
 *
 * Configuration for the underlying HTTP server in Sails.
 * Only applies to HTTP requests (not WebSockets)
 */

import { RequestHandler, Request, Response, NextFunction } from 'express';
import type { PassportStatic } from 'passport';
import * as _ from 'lodash';
import * as fs from 'fs';
const skipper = require('skipper');

import { redboxSession as redboxSessionMiddleware } from '../middleware/redboxSession';
import { redboxSession as redboxSessionConfigValue } from './redboxSession.config';

// Declare Sails and its config structure
declare const sails: {
    config: {
        appPath: string;
        passport: PassportStatic; // The passport instance configured by UsersService
        companion?: {
            enabled?: boolean;
            route?: string;
            secret?: string;
            filePath?: string;
            uploadUrls?: string[];
            server?: Record<string, unknown>;
            providerOptions?: Record<string, unknown>;
            metrics?: boolean;
            debug?: boolean;
            i18n?: Record<string, unknown>;
        };
        session: {
            cookie?: {
                maxAge?: number;
            };
        };
        custom: {
            cacheControl: {
                noCache: string[];
            };
        };
    };
    hooks?: {
        http?: {
            server?: unknown;
        };
    };
};

// Extended Request interface for custom properties
interface ExtendedRequest extends Request {
    options?: {
        locals?: {
            branding?: string;
            portal?: string;
            [key: string]: unknown;
        };
    };
    [key: string]: unknown;
}

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
    companion?: MiddlewareFunction;
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

// Global variable to cache the initialized session middleware, matching original logic
// (Using a module-level variable instead of global._redboxSessionMiddleware for cleaner scope,
//  but since this module is cached by Node, it works similarly)
let _lazyRedboxSessionMiddleware: RequestHandler | null = null;
let _lazyCompanionMiddleware: RequestHandler | null = null;
let _lazyCompanionMountPath = '/companion';
let _lazyCompanionSocketWired = false;

export const http: HttpConfig = {
    rootContext: '',

    middleware: {
        // Lazy load redboxSession to support async shim generation
        redboxSession: function (req: Request, res: Response, next: NextFunction) {
            if (!_lazyRedboxSessionMiddleware) {
                // Initialize the session middleware with the config
                _lazyRedboxSessionMiddleware = redboxSessionMiddleware(redboxSessionConfigValue);
            }
            return _lazyRedboxSessionMiddleware(req, res, next);
        },

        // Lazy load passport middleware to use sails.config.passport
        // This ensures we use the same passport instance that has deserializeUser configured
        passportInit: function (req: Request, res: Response, next: NextFunction) {
            return sails.config.passport.initialize()(req, res, next);
        },
        passportSession: function (req: Request, res: Response, next: NextFunction) {
            return sails.config.passport.session()(req, res, next);
        },

        companion: function (req: Request, res: Response, next: NextFunction) {
            const companionConfig = sails.config.companion;
            if (!companionConfig?.enabled) {
                return next();
            }

            const route = String(companionConfig.route ?? '/companion').trim();
            const normalizedRoute = route.startsWith('/') ? route : `/${route}`;
            const requestPath = (req.originalUrl ?? req.url).split('?')[0];
            if (requestPath !== normalizedRoute && !requestPath.startsWith(`${normalizedRoute}/`)) {
                return next();
            }

            if (!_lazyCompanionMiddleware || _lazyCompanionMountPath !== normalizedRoute) {
                const companionModule = require('@uppy/companion');
                const appFactory = companionModule?.app || companionModule?.companion?.app;
                if (typeof appFactory !== 'function') {
                    return next();
                }

                _lazyCompanionMiddleware = appFactory({
                    providerOptions: companionConfig.providerOptions || {},
                    filePath: companionConfig.filePath,
                    secret: companionConfig.secret,
                    uploadUrls: companionConfig.uploadUrls || [],
                    server: companionConfig.server || {},
                    metrics: companionConfig.metrics || false,
                    debug: companionConfig.debug || false,
                    i18n: companionConfig.i18n || undefined
                });
                _lazyCompanionMountPath = normalizedRoute;
                _lazyCompanionSocketWired = false;
            }

            if (!_lazyCompanionSocketWired) {
                const companionModule = require('@uppy/companion');
                const socketFactory = companionModule?.socket || companionModule?.companion?.socket;
                const httpServer = sails?.hooks?.http?.server;
                if (typeof socketFactory === 'function' && httpServer) {
                    socketFactory(httpServer);
                }
                _lazyCompanionSocketWired = true;
            }

            if (!_lazyCompanionMiddleware) {
                return next();
            }

            const originalUrl = req.url;
            const originalOriginalUrl = req.originalUrl;
            if (req.url.startsWith(_lazyCompanionMountPath)) {
                req.url = req.url.substring(_lazyCompanionMountPath.length) || '/';
            }
            if (typeof req.originalUrl === 'string' && req.originalUrl.startsWith(_lazyCompanionMountPath)) {
                req.originalUrl = req.originalUrl.substring(_lazyCompanionMountPath.length) || '/';
            }

            return _lazyCompanionMiddleware(req, res, (err?: unknown) => {
                req.url = originalUrl;
                if (typeof originalOriginalUrl === 'string') {
                    req.originalUrl = originalOriginalUrl;
                }
                if (err) {
                    return next(err as Error);
                }
                return next();
            });
        },

        brandingAndPortalAwareStaticRouter: function (req: Request, res: Response, next: NextFunction) {
            const extendedReq = req as ExtendedRequest;
            const existsSync = fs.existsSync;

            // Checks the branding and portal parameters if the resource isn't overidden for the required portal and branding,
            // it routes the request to the default location
            const url = req.url;
            const splitUrl = url.split('/');

            if (splitUrl.length > 3) {
                const branding = splitUrl[1];
                const portal = splitUrl[2];
                if (extendedReq.options == null) {
                    extendedReq.options = {};
                }
                if (extendedReq.options.locals == null) {
                    extendedReq.options.locals = {};
                }
                if (branding != null && extendedReq.options.locals.branding == null) {
                    extendedReq.options.locals.branding = branding;
                }
                if (portal != null && extendedReq.options.locals.portal == null) {
                    extendedReq.options.locals.portal = portal;
                }

                let resourceLocation = splitUrl.slice(3, splitUrl.length).join("/");
                if (resourceLocation.lastIndexOf('?') != -1) {
                    resourceLocation = resourceLocation.substring(0, resourceLocation.lastIndexOf('?'));
                }
                let resolvedPath: string | null = null;
                let locationToTest = sails.config.appPath + "/.tmp/public/" + branding + "/" + portal + "/" + resourceLocation;
                if (existsSync(locationToTest)) {
                    resolvedPath = "/" + branding + "/" + portal + "/" + resourceLocation;
                }

                if (resolvedPath == null) {
                    locationToTest = sails.config.appPath + "/.tmp/public/default/" + portal + "/" + resourceLocation;
                    if (existsSync(locationToTest)) {
                        resolvedPath = "/default/" + portal + "/" + resourceLocation;
                    }
                }
                if (resolvedPath == null) {
                    locationToTest = sails.config.appPath + "/.tmp/public/default/default/" + resourceLocation;
                    if (existsSync(locationToTest)) {
                        resolvedPath = "/default/default/" + resourceLocation;
                    }
                }

                // We found the resource in a location so let's set the url on the request to it so that the static server can serve it
                if (resolvedPath != null) {
                    req.url = resolvedPath;
                }
            }
            next();
        },

        translate: function (req: Request, res: Response, next: NextFunction) {
            next();
        },

        order: [
            'cacheControl',
            'redirectNoCacheHeaders',
            'startRequestTimer',
            'cookieParser',
            'redboxSession',
            'passportInit',
            'passportSession',
            'companion',
            'myBodyParser',
            'handleBodyParserError',
            'compress',
            'methodOverride',
            'poweredBy',
            'router',
            'translate',
            'brandingAndPortalAwareStaticRouter',
            'www',
            'favicon',
            '404',
            '500'
        ],

        myBodyParser: function (req: Request, res: Response, next: NextFunction) {
            // ignore if there is '/attach/' on the url
            if (req.url.toLowerCase().includes('/attach')) {
                return next();
            }
            const skipperMiddleware = skipper({
                // strict: true,
                // ... more Skipper options here ...
            });
            return skipperMiddleware(req, res, next);
        },

        poweredBy: function (req: Request, res: Response, next: NextFunction) {
            res.set('X-Powered-By', "QCIF");
            return next();
        },

        redirectNoCacheHeaders: function (req: Request, res: Response, next: NextFunction) {
            const originalRedirect = res.redirect;

            // Patch the redirect function so that it sets the no-cache headers
            res.redirect = function (this: Response, urlOrStatus: string | number, statusOrUrl?: number | string) {
                res.set('Cache-Control', 'no-cache, no-store, must-revalidate');
                res.set('Pragma', 'no-cache');
                res.set('Expires', '0');

                const redirect = originalRedirect as unknown as (...args: unknown[]) => Response;
                if (typeof urlOrStatus === 'number') {
                    return redirect.call(this, urlOrStatus, statusOrUrl as string | undefined);
                }
                if (typeof statusOrUrl === 'number') {
                    return redirect.call(this, statusOrUrl, urlOrStatus);
                }
                return redirect.call(this, urlOrStatus);
            } as Response['redirect'];

            return next();
        },

        cacheControl: function (req: Request, res: Response, next: NextFunction) {
            const sessionTimeoutSeconds = (_.isUndefined(sails.config.session.cookie) || _.isUndefined(sails.config.session.cookie.maxAge) ? 31536000 : sails.config.session.cookie.maxAge / 1000);
            let cacheControlHeaderVal: string | null = null;
            let expiresHeaderVal: string | null = null;
            if (sessionTimeoutSeconds > 0) {
                // Warning: sails.config.custom might differ at runtime verify structure
                const noCachePaths = sails.config.custom?.cacheControl?.noCache || [];
                const isMatch = _.find(noCachePaths, (path => {
                    return _.endsWith(req.path, path);
                }));
                if (!_.isEmpty(isMatch)) {
                    cacheControlHeaderVal = 'no-cache, no-store';
                    expiresHeaderVal = new Date(0).toUTCString();
                } else {
                    cacheControlHeaderVal = 'max-age=' + sessionTimeoutSeconds + ', private';
                    const expiresMilli = new Date().getTime() + (sessionTimeoutSeconds * 1000);
                    expiresHeaderVal = new Date(expiresMilli).toUTCString();
                }
            } else {
                // when session expiry isn't set, defaults to one year for everything...
                cacheControlHeaderVal = 'max-age=' + 31536000 + ', private';
                expiresHeaderVal = new Date(new Date().getTime() + (31536000 * 1000)).toUTCString();
            }
            if (!_.isEmpty(cacheControlHeaderVal) && cacheControlHeaderVal) {
                res.set('Cache-Control', cacheControlHeaderVal);
            }
            if (!_.isEmpty(expiresHeaderVal) && expiresHeaderVal) {
                res.set('Expires', expiresHeaderVal);
            }
            res.set('Pragma', 'no-cache');
            return next();
        }
    },
};
