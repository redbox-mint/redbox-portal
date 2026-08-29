/**
 * DisallowedHeadRequestHandler Policy
 *
 * Blocks HEAD requests by returning a 400 Bad Request response.
 */
import { isWebServiceAuthenticated } from './isWebServiceAuthenticated';

export function disallowedHeadRequestHandler(req: Sails.Req, res: Sails.Res, next: Sails.NextFunction): void {
  isWebServiceAuthenticated(req, res, () => {
    if (req.method === 'HEAD') {
      res.status(400).send('Bad Request: HEAD method is not allowed');
      return;
    }
    next();
  });
}

export default disallowedHeadRequestHandler;
