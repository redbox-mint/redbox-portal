import * as _ from 'lodash';
import MongoStore from 'connect-mongo';
import session from 'express-session';
import { RequestHandler } from 'express';

export function redboxSession(sessionConfig: session.SessionOptions & { [key: string]: unknown }): RequestHandler {
    const defaultSessionConfig: { [key: string]: unknown } = {
        resave: false,
        saveUninitialized: false
    };

    // set the isSessionDisabled function as a property of the sessionConfig object
    defaultSessionConfig.isSessionDisabled = function (req: { path: string; _sails: { LOOKS_LIKE_ASSET_RX: RegExp } }) {
        return !!req.path.match(req._sails.LOOKS_LIKE_ASSET_RX);
    };

    sessionConfig = _.extend(defaultSessionConfig, sessionConfig);

    if (sessionConfig.adapter == "mongo") {
        // connect-mongo v4+ uses .create()
        sessionConfig.store = MongoStore.create(sessionConfig as unknown as Parameters<typeof MongoStore.create>[0]);
    }

    // configure express-session using the sessionConfig object
    return session(sessionConfig);
}
