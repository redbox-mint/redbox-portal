import {RequestChronicleHelper} from "../utilities/RequestChronicle";


/**
 * Provide the request chronicle for a request.
 * @param req The sails request.
 * @param res The sails response.
 * @param next The next middleware callback.
 */
export function requestChronicle(req: Sails.Req, res: Sails.Res, next: Sails.NextFunction): void {
  // Conclude the request chronicle when the response is closed.
  res.on('close', () => {
    const item = RequestChronicleHelper.fromReq(sails.log, res.req);
    item.updateRes(res);
    item.finish();
    item.log(sails.log);
  });

  // Create the request chronicle and init with request context
  const item = RequestChronicleHelper.fromReq(sails.log, req);
  item.start();
  item.updateReq(req);

  return next();
}

