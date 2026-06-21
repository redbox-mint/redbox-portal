import { buildErrorEnvelope } from './errorEnvelope';

declare module 'express-serve-static-core' {
    interface Response {
        notFound(data?: unknown, options?: string | { view?: string }): Response;
    }
}

export function notFound(this: { req: Sails.Req, res: Sails.Res }, data?: unknown, options?: string | { view?: string }) {
    const req = this.req;
    const res = this.res;
    const sails = req._sails as Sails.Application;

    res.status(404);

    if (data !== undefined) {
        sails.log.verbose('Sending 404 ("Not Found") response: \n', data);
    }
    else sails.log.verbose('Sending 404 ("Not Found") response');

    if (sails.config.environment === 'production' && sails.config.keepResponseErrors !== true) {
        data = undefined;
    }

    if (req.wantsJSON || sails.config.hooks.views === false) {
        return res.json(data ?? buildErrorEnvelope(req, [{ detail: 'Not Found' }]));
    }

    options = (typeof options === 'string') ? { view: options } : options || {};

    let viewData = data;
    if (!(viewData instanceof Error) && 'object' == typeof viewData) {
        try {
            viewData = require('util').inspect(data, { depth: null });
        }
        catch (_e) {
            viewData = undefined;
        }
    }

    if (options.view) {
        return res.view(options.view, { data: viewData, title: 'Not Found' });
    }
    else return res.guessView({ data: viewData, title: 'Not Found' }, function couldNotGuessView() {
        return res.json(buildErrorEnvelope(req, [{ detail: 'Not Found' }]));
    });
};
