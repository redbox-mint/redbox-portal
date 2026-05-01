import {set as _set} from 'lodash';
import {RequestChronicleHelper} from "../utilities/RequestChronicle";


/**
 * Provide the request chronicle for a request.
 * @param req The sails request.
 * @param res The sails response.
 * @param next The next middleware callback.
 */
export function requestChronicle(req: Sails.Req, res: Sails.Res, next: Sails.NextFunction): void {
  // Initialize the request chronicle with request context
  const item = new RequestChronicleHelper();
  item.updateReq(req);

  // Make the event accessible to other middleware, plus anywhere that can access the req.
  // TODO: This could use opentelemetry span or logs or trace, but that doesn't have to happen right now.
  if (req.options === undefined) {
    req.options = {};
  }
  _set(req.options, ['requestChronicle'], item);

  try {
    next();
    item.updateRes(res);
  } catch (error: any) {
    item.addError(error);
    throw error;
  } finally {
    item.finish();
    item.log(sails.log);
  }
}

