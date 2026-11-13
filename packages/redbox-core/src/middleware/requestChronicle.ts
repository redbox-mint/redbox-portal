import { RequestChronicleHelper } from '../utilities/RequestChronicle';
import { runWithRequestChronicle } from '../utilities/RequestChronicleContext';

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
  let helper: RequestChronicleHelper | undefined;
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
      } catch {
        try {
          sails.log.warn('Request chronicle: could not conclude the request chronicle.');
        } catch {
          // Ignore logging failures.
        }
      }
    };
    res.once('finish', conclude);
    res.once('close', conclude);
    helper = item;
  } catch {
    try {
      sails.log.warn('Request chronicle: could not start the request chronicle.');
    } catch {
      // Ignore logging failures.
    }
  }

  // Keep next outside the setup catch: a downstream error must propagate once.
  return runWithRequestChronicle(helper, next);
}

const errorCaptureRegistered = Symbol.for('@researchdatabox/redbox-core/requestChronicleErrorCapture');

/** Capture errors raised before Sails binds custom response helpers, such as malformed JSON. */
export function registerRequestChronicleErrorCapture(app: Sails.Application): void {
  const state = app as Sails.Application & { [errorCaptureRegistered]?: boolean };
  if (state[errorCaptureRegistered] || typeof app.on !== 'function') {
    return;
  }
  app.on('router:request:500', (error: unknown, request: unknown, response: unknown) => {
    const req = request as Sails.Req;
    const res = response as Sails.Res;
    // Bound custom responses record errors themselves.
    if (typeof res.serverError !== 'function') {
      const helper = RequestChronicleHelper.existing(req);
      helper?.addInfo({ responseHandler: 'sailsHttpError' });
      helper?.addError(error);
    }
  });
  state[errorCaptureRegistered] = true;
}
