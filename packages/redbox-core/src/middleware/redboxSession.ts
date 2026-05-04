import * as _ from 'lodash';
import MongoStore from 'connect-mongo';
import session from 'express-session';
import { RequestHandler } from 'express';

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

    // set the isSessionDisabled function as a property of the sessionConfig object
    defaultSessionConfig.isSessionDisabled = function (req: { path: string; _sails: { LOOKS_LIKE_ASSET_RX: RegExp } }) {
        return !!req.path.match(req._sails.LOOKS_LIKE_ASSET_RX);
    };

    return _.merge({}, defaultSessionConfig, sessionConfig);
}

export function redboxSession(sessionConfig: session.SessionOptions & { [key: string]: unknown }): RequestHandler {
    sessionConfig = buildRedboxSessionOptions(sessionConfig);

    if (sessionConfig.adapter == "mongo") {
        // connect-mongo v4+ uses .create()
        sessionConfig.store = MongoStore.create(sessionConfig as unknown as Parameters<typeof MongoStore.create>[0]);
    }

    // configure express-session using the sessionConfig object
    return session(sessionConfig);
}
