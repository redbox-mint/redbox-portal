import * as _ from 'lodash';
import MongoStore from 'connect-mongo';
import session from 'express-session';
import { RequestHandler } from 'express';

export function redboxSession(sessionConfig: any): RequestHandler {
    const defaultSessionConfig: any = {
        resave: false,
        saveUninitialized: false
    };

    // set the isSessionDisabled function as a property of the sessionConfig object
    defaultSessionConfig.isSessionDisabled = function (req: any) {
        return !!req.path.match(req._sails.LOOKS_LIKE_ASSET_RX);
    };

    sessionConfig = _.extend(defaultSessionConfig, sessionConfig);

    if (sessionConfig.adapter == "mongo") {
        // connect-mongo v4+ uses .create()
        sessionConfig.store = MongoStore.create(sessionConfig);
    }

    // configure express-session using the sessionConfig object
    return session(sessionConfig);
}
