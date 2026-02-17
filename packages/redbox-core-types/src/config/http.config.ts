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
import type { CompanionConfig } from './companion.config';
import * as BrandingServiceModule from '../services/BrandingService';
import * as PathRulesServiceModule from '../services/PathRulesService';

// Declare Sails and its config structure
declare const sails: {
    config: {
        appPath: string;
        passport: PassportStatic; // The passport instance configured by UsersService
        companion?: CompanionConfig;
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
declare const BrandingService: BrandingServiceModule.Services.Branding;
declare const PathRulesService: PathRulesServiceModule.Services.PathRules;

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

export interface CompanionAuthorizationDecision {
    isCompanionRequest: boolean;
    allowed: boolean;
    statusCode?: number;
    body?: Record<string, unknown>;
}

function isAuthenticatedRequest(req: Request): boolean {
    return typeof (req as Request & { isAuthenticated?: () => boolean }).isAuthenticated === 'function'
        && Boolean((req as Request & { isAuthenticated: () => boolean }).isAuthenticated());
}

export function authorizeCompanionRequest(req: Request, normalizedRoute: string, requestPath: string): CompanionAuthorizationDecision {
    const isCompanionRequest = requestPath === normalizedRoute || requestPath.startsWith(`${normalizedRoute}/`);
    if (!isCompanionRequest) {
        return { isCompanionRequest: false, allowed: true };
    }

    if (!isAuthenticatedRequest(req)) {
        return {
            isCompanionRequest: true,
            allowed: false,
            statusCode: 401,
            body: { message: 'Authentication required' },
        };
    }

    const reqSessionBranding = String((req as Request & { session?: { branding?: unknown } }).session?.branding ?? '').trim();
    if (!reqSessionBranding) {
        return {
            isCompanionRequest: true,
            allowed: false,
            statusCode: 403,
            body: { message: 'Access Denied' },
        };
    }

    const brand = BrandingService.getBrand(reqSessionBranding);
    if (!brand) {
        return {
            isCompanionRequest: true,
            allowed: false,
            statusCode: 403,
            body: { message: 'Access Denied' },
        };
    }

    const rules = PathRulesService.getRulesFromPath(requestPath, brand);
    if (!rules || rules.length === 0) {
        return {
            isCompanionRequest: true,
            allowed: true,
        };
    }

    const userRoles = (req as Request & { user?: { roles?: unknown[] } }).user?.roles ?? [];
    const canRead = PathRulesService.canRead(rules, userRoles as Parameters<typeof PathRulesService.canRead>[1], brand.name);
    if (!canRead) {
        return {
            isCompanionRequest: true,
            allowed: false,
            statusCode: 403,
            body: { message: 'Access Denied' },
        };
    }

    return {
        isCompanionRequest: true,
        allowed: true,
    };
}

const getCookieValue = (cookieHeader: string | undefined, cookieName: string): string | undefined => {
    if (!cookieHeader) {
        return undefined;
    }
    const segments = cookieHeader.split(';');
    for (const rawSegment of segments) {
        const segment = rawSegment.trim();
        if (!segment.startsWith(`${cookieName}=`)) {
            continue;
        }
        const encodedValue = segment.substring(cookieName.length + 1).trim();
        if (!encodedValue) {
            return undefined;
        }
        try {
            return decodeURIComponent(encodedValue);
        } catch (_err) {
            return encodedValue;
        }
    }
    return undefined;
};

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

            const companionSecret = String(companionConfig.secret ?? '').trim();
            if (!companionSecret || companionSecret.length < 32) {
                return next(new Error('Companion is enabled but companion.secret is missing or too short. Configure a secret with at least 32 characters.'));
            }

            const route = String(companionConfig.route ?? '/companion').trim();
            const normalizedRoute = route.startsWith('/') ? route : `/${route}`;
            const requestPath = (req.originalUrl ?? req.url).split('?')[0];
            const authorizationDecision = authorizeCompanionRequest(req, normalizedRoute, requestPath);
            if (!authorizationDecision.isCompanionRequest) {
                return next();
            }
            if (!authorizationDecision.allowed) {
                const statusCode = authorizationDecision.statusCode ?? 403;
                return res.status(statusCode).json(authorizationDecision.body ?? { message: 'Access Denied' });
            }

            const relativePath = requestPath.substring(normalizedRoute.length);
            const relativePathParts = relativePath.split('/').filter(Boolean);
            const hasAuthTokenHeader = typeof req.headers?.['uppy-auth-token'] === 'string'
                && req.headers['uppy-auth-token'].trim().length > 0;
            const hasAuthTokenQuery = typeof req.query?.uppyAuthToken === 'string'
                && req.query.uppyAuthToken.trim().length > 0;
            if (!hasAuthTokenHeader && !hasAuthTokenQuery && relativePathParts.length > 0) {
                const providerName = relativePathParts[0];
                const cookieHeader = req.headers?.cookie;
                const cookieToken = getCookieValue(cookieHeader, `uppyAuthToken--${providerName}`)
                    || (providerName === 'drive'
                        ? getCookieValue(cookieHeader, 'uppyAuthToken--googledrive')
                        : undefined);
                if (cookieToken) {
                    req.headers['uppy-auth-token'] = cookieToken;
                    if (req.query && typeof req.query === 'object') {
                        (req.query as Record<string, unknown>).uppyAuthToken = cookieToken;
                    }
                    console.debug(`Companion auth token restored from cookie for provider "${providerName}".`);
                }
            }
            const isSendTokenPath = relativePathParts.length === 2 && relativePathParts[1] === 'send-token';
            if (isSendTokenPath) {
                const appUrl = String((sails.config as { appUrl?: unknown }).appUrl ?? '').trim();
                if (appUrl) {
                    let targetOrigin = appUrl;
                    try {
                        targetOrigin = new URL(appUrl).origin;
                    } catch (_err) {
                        // Keep configured appUrl as-is if URL parsing fails.
                    }
                    const originPayload = JSON.stringify(targetOrigin);
                    res.setHeader('Content-Type', 'text/html; charset=utf-8');
                    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
                    res.setHeader('Pragma', 'no-cache');
                    res.setHeader('Expires', '0');
                    return res.send(
                        `<!DOCTYPE html><html><head><meta charset="utf-8" /><script>(function(){'use strict';var origin=${originPayload};var provider=${JSON.stringify(relativePathParts[0] ?? '')};var query=new URLSearchParams(window.location.search);var hashRaw=window.location.hash&&window.location.hash.charAt(0)==='#'?window.location.hash.slice(1):'';var hash=new URLSearchParams(hashRaw);var token=(query.get('uppyAuthToken')||hash.get('uppyAuthToken')||'').trim();if(!token){window.location.replace(origin);return;}if(provider){var storageKey='companion-'+provider+'-auth-token';var cookieName='uppyAuthToken--'+provider;if(provider==='drive'){storageKey='companion-GoogleDrive-auth-token';cookieName='uppyAuthToken--googledrive';}if(provider==='onedrive'){storageKey='companion-OneDrive-auth-token';}try{window.localStorage.setItem(storageKey,token);}catch(_e){}document.cookie=cookieName+'='+encodeURIComponent(token)+'; Path=/; Max-Age=34560000; SameSite=Lax';}var data={token:token};var openerRef=null;try{openerRef=window.opener||null;}catch(_e){}if(!openerRef){window.location.replace(origin);return;}var attempts=0;var send=function(){attempts+=1;try{openerRef.postMessage(data,origin);}catch(_e){}if(attempts<5){setTimeout(send,150);return;}setTimeout(function(){try{window.close();}catch(_e){}},300);};send();})();</script></head><body>Completing sign in...</body></html>`
                    );
                }
            }

            if (!_lazyCompanionMiddleware || _lazyCompanionMountPath !== normalizedRoute) {
                const companionFilePath = String(companionConfig.filePath ?? '/tmp/companion').trim();
                try {
                    fs.mkdirSync(companionFilePath, { recursive: true });
                    fs.accessSync(companionFilePath, fs.constants.R_OK | fs.constants.W_OK);
                } catch (err: unknown) {
                    if (err instanceof Error) {
                        return next(new Error(`Companion filePath "${companionFilePath}" is not accessible: ${err.message}`));
                    }
                    return next(new Error(`Companion filePath "${companionFilePath}" is not accessible.`));
                }

                const companionModule = require('@uppy/companion');
                const appFactory = companionModule?.app || companionModule?.companion?.app;
                if (typeof appFactory !== 'function') {
                    console.warn('Companion is enabled but companion module app export is not a function; skipping companion middleware initialization.');
                    return next();
                }

                const providerOptions = { ...(companionConfig.providerOptions || {}) } as Record<string, unknown>;
                if ('google' in providerOptions) {
                    if (!('drive' in providerOptions)) {
                        providerOptions.drive = providerOptions.google;
                    }
                    delete providerOptions.google;
                    console.warn('Companion config key "providerOptions.google" is deprecated and has been remapped to "providerOptions.drive". Update your config to use "drive".');
                }

                const configuredCorsOrigins = companionConfig.corsOrigins;
                const defaultCorsOrigin = String((sails.config as { appUrl?: unknown }).appUrl ?? '').trim();
                const corsOrigins = configuredCorsOrigins ?? (defaultCorsOrigin || true);
                const companionUploadHeaders: Record<string, string> = {
                    ...(companionConfig.uploadHeaders || {}),
                };
                const uploadSecretHeader = String(companionConfig.attachmentSecretHeader ?? 'x-companion-secret')
                    .trim() || 'x-companion-secret';
                const uploadSecret = String(companionConfig.attachmentSecret ?? companionConfig.secret ?? '').trim();
                if (uploadSecret) {
                    companionUploadHeaders[uploadSecretHeader] = uploadSecret;
                }

                const companionAppResult = appFactory({
                    providerOptions,
                    filePath: companionFilePath,
                    secret: companionSecret,
                    uploadUrls: companionConfig.uploadUrls || [],
                    tusDeferredUploadLength: companionConfig.tusDeferredUploadLength ?? true,
                    uploadHeaders: companionUploadHeaders,
                    server: companionConfig.server || {},
                    corsOrigins,
                    metrics: companionConfig.metrics || false,
                    debug: companionConfig.debug || false,
                    i18n: companionConfig.i18n || undefined
                });

                const companionMiddleware = typeof companionAppResult === 'function'
                    ? companionAppResult
                    : companionAppResult?.app;
                if (typeof companionMiddleware !== 'function') {
                    console.warn('Companion initialization did not return a callable middleware app; skipping companion middleware initialization.');
                    return next();
                }

                _lazyCompanionMiddleware = companionMiddleware;
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
            const restoreUrls = () => {
                req.url = originalUrl;
                if (typeof originalOriginalUrl === 'string') {
                    req.originalUrl = originalOriginalUrl;
                }
            };
            if (req.url.startsWith(_lazyCompanionMountPath)) {
                req.url = req.url.substring(_lazyCompanionMountPath.length) || '/';
            }
            // Keep originalUrl intact so Grant's prefix matching (which uses originalUrl)
            // still sees the configured server.path (e.g. /companion/connect/*).

            try {
                return _lazyCompanionMiddleware(req, res, (err?: unknown) => {
                    restoreUrls();
                    if (err) {
                        return next(err as Error);
                    }
                    return next();
                });
            } catch (err: unknown) {
                restoreUrls();
                if (err instanceof Error) {
                    return next(err);
                }
                return next(new Error(String(err ?? 'Unknown companion middleware error')));
            }
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
            // Required for OAuth popup flows (e.g. Uppy Companion providers)
            // so window.opener/window.closed checks are not blocked by COOP.
            res.set('Cross-Origin-Opener-Policy', 'same-origin-allow-popups');
            res.set('Pragma', 'no-cache');
            return next();
        }
    },
};
