import type { RequestHandler } from 'express';
import { applyPageHeaders, type PageHeaderInput } from '../../pages/headers';
export { applyPageHeaders, isImmutableAssetPath, type PageHeaderInput } from '../../pages/headers';

export function pageResponseHeaders(input: PageHeaderInput): RequestHandler {
  return (req, res, next) => {
    applyPageHeaders(req, res, input);
    next();
  };
}
