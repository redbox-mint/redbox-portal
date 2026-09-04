import { inspect } from 'node:util';
import { renderErrorView } from './renderErrorView';
import { resolveSiteTitle } from './siteTitle';

declare module 'express-serve-static-core' {
  interface Response {
    notFound(data?: unknown, options?: string | { view?: string }): Response;
  }
}

/**
 * 404 (Not Found) Handler
 *
 * Usage:
 * return res.notFound();
 * return res.notFound(data);
 * return res.notFound(data, 'some/specific/notFound/view');
 */
export function notFound(
  this: { req: Sails.Req; res: Sails.Res },
  data?: unknown,
  options?: string | { view?: string }
): Sails.Res {
  const req = this.req;
  const res = this.res;
  const sails = req._sails as Sails.Application;
  const siteTitle = resolveSiteTitle('Site', req.options?.locals as Record<string, unknown> | undefined);

  res.status(404);

  if (data !== undefined) {
    sails.log.verbose('Sending 404 ("Not Found") response: \n', data);
  } else {
    sails.log.verbose('Sending 404 ("Not Found") response');
  }

  if (sails.config.environment === 'production' && sails.config.keepResponseErrors !== true) {
    data = undefined;
  }

  if (req.wantsJSON || sails.config.hooks.views === false) {
    return res.json(data) as Sails.Res;
  }

  options = typeof options === 'string' ? { view: options } : options || {};

  let viewData = data;
  if (!(viewData instanceof Error) && typeof viewData === 'object') {
    try {
      viewData = inspect(data, { depth: null });
    } catch (_error) {
      viewData = undefined;
    }
  }

  return renderErrorView(req, res, options.view || '404', { data: viewData, title: siteTitle });
}
