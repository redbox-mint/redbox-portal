import {setReqChronicleError, setReqCustomOption} from "../utilities/RequestUtils";

/**
 * A holder for attributes of one request and response,
 * which chronicles what happened over the whole request.
 *
 * See also https://loggingsucks.com/.
 */
export interface RequestChronicle {
  meta: {
    timestamp?: string,
    outcome?: "success" | "error",
    durationMs?: number,
    classification?: string,
  }
  req: {
    method?: string,
    path?: string,
    hostname?: string,
  }
  error?: {
    raw?: string,
    name?: string,
    message?: string,
    code?: string,
    cause?: string,
  },
  res: {
    statusCode?: string | number,
  }

  // TODO: consider adding these properties:
  // request_id: ctx.get('requestId'),
  // service: process.env.SERVICE_NAME,
  // version: process.env.SERVICE_VERSION,
  // deployment_id: process.env.DEPLOYMENT_ID,
  // region: process.env.REGION,
}

/**
 * Provide the request chronicle for a request.
 * @param req The sails request.
 * @param res The sails response.
 * @param next The next middleware callback.
 */
export function requestChronicle(req: Sails.Req, res: Sails.Res, next: Sails.NextFunction): void {

  // Initialize the request chronicle with request context
  const startTime = new Date();
  const event: RequestChronicle = {
    meta: {
      timestamp: startTime.toISOString(),
      outcome: 'success',
    },
    req: {
      method: req.method,
      path: req.path,
      hostname: req.hostname,
    },
    res: {}
  };

  // Make the event accessible to other middleware, plus anywhere that can access the req.
  // TODO: This could use opentelemetry span or logs or trace, but that doesn't have to happen right now.
  setReqCustomOption(req, ['requestChronicle'], event);

  try {
    next();
    event.res.statusCode = res.statusCode;
  } catch (error: any) {
    setReqChronicleError(error);
    throw error;
  } finally {
    event.meta.durationMs = Date.now() - startTime.getTime();

    // Classify and decide whether to log or not.
    const classification = classifyRequestChronicle(event);
    event.meta.classification = classification;
    switch (classification) {
      case "error":
        sails.log.error(event);
        break;
      case "slow":
      case "flagged":
        sails.log.warn(event);
        break;
      case "sample":
        sails.log.info(event);
        break;
      case "discard":
        // Don't log discarded request chronicles.
        break;
      default:
        const _check: never = classification;
    }
  }
}

/**
 * Classify a request chronicle.
 * Only keep a sample of the standard successful request chronicle logs.
 * @param event The event to assess.
 * @return The classification of the request chronicle.
 */
export function classifyRequestChronicle(event?: RequestChronicle): "error" | "slow" | "flagged" | "sample" | "discard" {
  // Classify as error
  if (event?.meta.outcome === "error") {
    return "error";
  }
  if (event?.res.statusCode?.toString()?.startsWith('5')) {
    return "error";
  }
  if (event?.error?.raw) {
    return "error";
  }

  // Classify as slow
  if ((event?.meta.durationMs ?? 0) > 2000) {
    return "slow";
  }

  // TODO: flagged events

  // Classify a 5% random selection of the remaining 'standard' and 'success' events as samples.
  // Discard the rest.
  return Math.random() <= 0.05 ? "sample" : "discard";
}
