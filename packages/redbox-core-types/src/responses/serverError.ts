import { Response } from 'express';

declare module 'express-serve-static-core' {
    interface Response {
        serverError(data?: any, options?: string | { view?: string }): Response;
    }
}

/**
 * 500 (Server Error) Response
 *
 * Usage:
 * return res.serverError();
 * return res.serverError(data);
 * return res.serverError(data, 'some/specific/error/view');
 */
export function serverError(this: { req: any, res: Response }, data?: any, options?: string | { view?: string }) {

    // Get access to `req`, `res`, & `sails`
    const req = this.req;
    const res = this.res;
    const sails = req._sails;

    // Set status code
    res.status(500);

    // Log error to console
    if (data !== undefined) {
        sails.log.error('Sending 500 ("Server Error") response: \n', data);
    }
    else sails.log.error('Sending 500 ("Server Error") response');

    // Only include errors in response if application environment
    // is not set to 'production'.  In production, we shouldn't
    // send back any identifying information about errors.
    if (sails.config.environment === 'production' && sails.config.keepResponseErrors !== true) {
        data = undefined;
    }

    // If the user-agent wants JSON, always respond with JSON
    // If views are disabled, revert to json
    if (req.wantsJSON || sails.config.hooks.views === false) {
        return res.json(data);
    }

    // If second argument is a string, we take that to mean it refers to a view.
    // If it was omitted, use an empty object (`{}`)
    options = (typeof options === 'string') ? { view: options } : options || {};

    // Attempt to prettify data for views, if it's a non-error object
    let viewData = data;
    if (!(viewData instanceof Error) && 'object' == typeof viewData) {
        try {
            viewData = require('util').inspect(data, { depth: null });
        }
        catch (e) {
            viewData = undefined;
        }
    }

    // If a view was provided in options, serve it.
    // Otherwise try to guess an appropriate view, or if that doesn't
    // work, just send JSON.
    // If a view was provided in options, serve it.
    // Otherwise try to guess an appropriate view, or if that doesn't
    // work, just send JSON.
    if (options.view) {
        return (res as any).view(options.view, { data: viewData, title: 'Server Error' });
    }

    // If no second argument provided, try to serve the implied view,
    // but fall back to sending JSON(P) if no view can be inferred.
    else return (res as any).guessView({ data: viewData, title: 'Server Error' }, function couldNotGuessView() {
        return res.json(data);
    });

};
