import { RequestChronicleHelper } from '../utilities/RequestChronicle';

/**
 * Provide the request chronicle for a request.
 *
 * The chronicle is concluded and logged exactly once, when the response finishes,
 * or when the connection closes before the response finishes (an aborted request).
 * Failures in the request chronicle never prevent the request from being processed.
 * @param req The sails request.
 * @param res The sails response.
 * @param next The next middleware callback.
 */
export function requestChronicle(req: Sails.Req, res: Sails.Res, next: Sails.NextFunction): void {
  try {
    // Create the request chronicle and init with request context
    const item = RequestChronicleHelper.fromReq(sails.log, req);
    item.start();
    item.updateReq(req);

    const conclude = () => {
      try {
        if (item.finish(res)) {
          item.log(sails.log);
        }
      } catch (error) {
        sails.log.warn('Request chronicle: could not conclude the request chronicle.', error);
      }
    };
    res.once('finish', conclude);
    res.once('close', conclude);
  } catch (error) {
    try {
      sails.log.warn('Request chronicle: could not start the request chronicle.', error);
    } catch {
      // Ignore logging failures.
    }
  }

  return next();
}
