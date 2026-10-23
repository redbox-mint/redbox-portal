import * as _ from 'lodash';
import MongoStore from 'connect-mongo';
import session from 'express-session';
import { Request, RequestHandler } from 'express';

export function buildRedboxSessionOptions(sessionConfig: session.SessionOptions & { [key: string]: unknown }): session.SessionOptions & { [key: string]: unknown } {
    const defaultSessionConfig: Partial<session.SessionOptions> & { [key: string]: unknown } = {
        resave: false,
        saveUninitialized: false,
        cookie: {
            httpOnly: true,
            sameSite: 'lax',
            secure: true
        }
    };

    // set the isSessionDisabled function as a property of the defaultSessionConfig object before merging with caller-supplied config
    defaultSessionConfig.isSessionDisabled = function (req: { path: string; _sails?: { LOOKS_LIKE_ASSET_RX?: RegExp } }) {
        const path = req.path || '';
        const looksLikeAssetRx = req._sails?.LOOKS_LIKE_ASSET_RX;
        return (!!looksLikeAssetRx && looksLikeAssetRx.test(path)) ||
            /^\/(?:[^/]+\/[^/]+\/)?(?:js|styles|images|fonts|angular|icons)\//.test(path) ||
            /^\/(?:apple-touch-icon|favicon-|site\.webmanifest)/.test(path);
    };

    return _.merge({}, defaultSessionConfig, sessionConfig);
}

// Mirrors express-session's own HTTPS detection for secure: 'auto'.
function isSecureRequest(req: Request, proxy: boolean | undefined): boolean {
    if ((req.socket as { encrypted?: boolean } | undefined)?.encrypted) {
        return true;
    }
    if (proxy === false) {
        return false;
    }
    if (proxy !== true) {
        return req.secure === true;
    }
    const header = String(req.headers['x-forwarded-proto'] ?? '');
    return header.split(',')[0].trim().toLowerCase() === 'https';
}

export function redboxSession(sessionConfig: session.SessionOptions & { [key: string]: unknown }): RequestHandler {
    sessionConfig = buildRedboxSessionOptions(sessionConfig);

    if (sessionConfig.adapter == "mongo") {
        // connect-mongo v4+ uses .create()
        sessionConfig.store = MongoStore.create(sessionConfig as unknown as Parameters<typeof MongoStore.create>[0]);
    }

    // configure express-session using the sessionConfig object. The session cookie is never sent
    // without TLS: anything other than secure: true becomes 'auto', which marks the cookie secure
    // whenever the request arrives over HTTPS (behind a TLS proxy this relies on trust proxy) and
    // still lets plain-HTTP development stacks keep a session.
    const configured = sessionConfig.cookie;
    if (typeof configured === 'function') {
        // express-session only resolves 'auto' for object cookie options, so resolve it per request here.
        const proxy = sessionConfig.proxy;
        return session({
            ...sessionConfig,
            cookie: req => {
                const options = configured(req);
                return { ...options, secure: options?.secure === true || isSecureRequest(req, proxy) };
            }
        }) as unknown as RequestHandler;
    }
    return session({
        ...sessionConfig,
        cookie: { ...configured, secure: configured?.secure === true ? true : 'auto' as const }
    }) as unknown as RequestHandler;
}
