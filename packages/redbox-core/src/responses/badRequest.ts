import { resolveSiteTitle } from './siteTitle';
import { inspect } from 'node:util';
import { renderErrorView } from './renderErrorView';

declare module 'express-serve-static-core' {
    interface Response {
        badRequest(data?: unknown, options?: string | { view?: string }): Response;
    }
}

/**
 * 400 (Bad Request) Handler
 *
 * Usage:
 * return res.badRequest();
 * return res.badRequest(data);
 * return res.badRequest(data, 'some/specific/badRequest/view');
 */
export function badRequest(this: { req: Sails.Req, res: Sails.Res }, data?: unknown, options?: string | { view?: string }) {

    // Get access to `req`, `res`, & `sails`
    const req = this.req;
    const res = this.res;
    const sails = req._sails as Sails.Application;
    const siteTitle = resolveSiteTitle('Site', req.options?.locals as Record<string, unknown> | undefined);

    // Set status code
    res.status(400);

    // Log error to console
    if (data !== undefined) {
        sails.log.verbose('Sending 400 ("Bad Request") response: \n', data);
    }
    else sails.log.verbose('Sending 400 ("Bad Request") response');

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
            viewData = inspect(data, { depth: null });
        }
        catch (_e) {
            viewData = undefined;
        }
    }

    return renderErrorView(req, res, options.view || '400', { data: viewData, title: siteTitle });

};
