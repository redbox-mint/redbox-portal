import { Controllers } from '../CoreController';

const errorViewController = new Controllers.Core.Controller();

/**
 * Render an error view through the same hook-aware view and layout resolver used
 * by controllers. Sails' built-in response rendering only searches the app view
 * root, so it cannot apply layouts supplied by a Redbox hook.
 */
export function renderErrorView(
  req: Sails.Req,
  res: Sails.Res,
  view: string,
  locals: Record<string, unknown>
): Sails.Res {
  errorViewController.sendView(req, res, view, locals);
  return res;
}
