declare module 'express-serve-static-core' {
    interface Response {
        created(data?: unknown, options?: string | { view?: string }): Response;
    }
}

/**
 * 201 (Created) Response
 *
 * Usage:
 * return res.created();
 * return res.created(data);
 * return res.created(data, 'auth/login');
 */
export function created(this: { req: Sails.Req, res: Sails.Res }, data?: unknown, options?: string | { view?: string }) {

    // Get access to `req`, `res`, & `sails`
    const req = this.req;
    const res = this.res;
    const sails = req._sails as Sails.Application;

    sails.log.silly('res.created() :: Sending 201 ("CREATED") response');

    // Set status code
    res.status(201);

    // If appropriate, serve data as JSON(P)
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
        return res.view(options.view, { data: viewData, title: 'Created' });
    }

    // If no second argument provided, try to serve the implied view,
    // but fall back to sending JSON(P) if no view can be inferred.
    else return res.guessView({ data: viewData, title: 'Created' }, function couldNotGuessView() {
        return res.json(data);
    });

};
