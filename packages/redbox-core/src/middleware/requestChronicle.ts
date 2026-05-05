import {set as _set} from 'lodash';
import {RequestChronicleHelper} from "../utilities/RequestChronicle";


/**
 * Provide the request chronicle for a request.
 * @param req The sails request.
 * @param res The sails response.
 * @param next The next middleware callback.
 */
export function requestChronicle(req: Sails.Req, res: Sails.Res, next: Sails.NextFunction): void {
  const item = RequestChronicleHelper.fromReq(req);

  // Initialize the request chronicle with request context
  item.updateReq(req);

  try {
    next();
    item.updateRes(res);
  } catch (error) {
    item.addError(error);
    throw error;
  } finally {
    item.finish();
    item.log(sails.log);
  }
}

