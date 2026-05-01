import {ILogger} from "@researchdatabox/sails-ng-common";
import {RBValidationError} from "../model";

const RequestChronicleOutcome = ["success", "error"] as const;
type RequestChronicleOutcomeType = typeof RequestChronicleOutcome[number];

const RequestChronicleClassifications = ["error", "slow", "flagged", "sample", "discard"] as const;
type RequestChronicleClassificationsType = typeof RequestChronicleClassifications[number];


export type RequestChronicleError = {
  name?: string,
  message?: string,
  code?: string,
  cause?: RequestChronicleError,
  [key: string]: unknown,
} | string;

/**
 * A holder for attributes of one request and response,
 * which chronicles what happened over the whole request.
 *
 * See also https://loggingsucks.com/.
 */
export interface RequestChronicle {
  /**
   * Details of the result of the reqeust chronicle.
   */
  result?: {
    timestamp?: string,
    outcome?: RequestChronicleOutcomeType,
    durationMs?: number,
    classification?: RequestChronicleClassificationsType,
  },
  /**
   * Details of the original request.
   */
  req?: {
    method?: string,
    path?: string,
    hostname?: string,
  },
  /**
   * Details of the response generated from the request.
   */
  res?: {
    statusCode?: string | number,
  },
  /**
   * Any errors encountered during the request processing.
   */
  errors?: RequestChronicleError[],

  /**
   * Arbitrary data added during the request processing.
   */
  [key: string]: unknown,

  // TODO: consider adding these properties:
  // request_id: ctx.get('requestId'),
  // service: process.env.SERVICE_NAME,
  // version: process.env.SERVICE_VERSION,
  // deployment_id: process.env.DEPLOYMENT_ID,
  // region: process.env.REGION,
}

export class RequestChronicleHelper {
  #startTime?: Date;
  #duration?: number;

  #data: RequestChronicle = {};

  start(): void {
    if (this.#startTime !== undefined || this.#duration !== undefined) {
      return;
    }
    this.#startTime = new Date();
    if (this.#data.result === undefined) {
      this.#data.result = {};
    }
    this.#data.result.timestamp = this.#startTime.toISOString();
  }

  finish(): void {
    if (this.#startTime === undefined || this.#duration !== undefined) {
      return;
    }
    this.#duration = Date.now() - this.#startTime.getTime();

    if (this.#data.result === undefined) {
      this.#data.result = {};
    }
    this.#data.result.outcome = this.hasErrors ? "success" : "error";
    this.#data.result.classification = this.classify();
  }

  get isRunning() {
    return this.#startTime !== undefined && this.#duration === undefined;
  }

  get isFinished() {
    return this.#startTime !== undefined && this.#duration !== undefined;
  }

  updateReq(req: Sails.Req): void {
    if (!this.isRunning) {
      throw new Error("Must be running to update.");
    }
    if (this.#data.req !== undefined) {
      throw new Error("Cannot overwrite existing req data.")
    }

    this.#data.req = {
      method: req.method,
      path: req.path,
      hostname: req.hostname,
    };
  }

  updateRes(res: Sails.Res): void {
    if (!this.isRunning) {
      throw new Error("Must be running to update.");
    }
    if (this.#data.res !== undefined) {
      throw new Error("Cannot overwrite existing res data.")
    }

    this.#data.res = {
      statusCode: res.statusCode,
    };
  }

  public log(logger: ILogger) {
    if (!this.isFinished) {
      throw new Error("Must be finished before logging.");
    }
    const data = this.#data;
    const classification = data.result?.classification;
    switch (classification) {
      case "error":
        logger.error(data);
        break;
      case "slow":
      case "flagged":
        logger.warn(data);
        break;
      case "sample":
        logger.info(data);
        break;
      case "discard":
      case undefined:
      case null:
        // Don't log discarded request chronicles.
        break;
      default:
        const _check: never = classification;
    }
  }

  get hasErrors() {
    return (this.#data.errors?.length ?? 0) > 0;
  }

  public addError(error?: any): void {
    if (!Array.isArray(this.#data.errors)) {
      this.#data.errors = [];
    }
    if (RBValidationError.isError(error)) {
      this.#data.errors.push(RBValidationError.toObj(error));
    } else {
      this.#data.errors.push({raw: String(error)});
    }
  }

  public addInfo(info: Record<string, unknown>) {
    const notAllowedKeys = ['result', 'req', 'res', 'errors'];
    for (const [key, value] of Object.entries(info ?? {})) {
      if (notAllowedKeys.includes(key)) {
        throw new Error(`Cannot overwrite request chronicle key '${key}'.`);
      }
      this.#data[key] = value;
    }
  }

  /**
   * Classify this request chronicle.
   * Only keep a sample of the standard successful request chronicle logs.
   * @return The classification.
   */
  private classify(): RequestChronicleClassificationsType {
    const item = this.#data;

    // Classify as error
    if (item?.result?.outcome === "error") {
      return "error";
    }
    if (item?.res?.statusCode?.toString()?.startsWith('5')) {
      return "error";
    }
    if (this.hasErrors) {
      return "error";
    }

    // Classify as slow
    if ((item?.result?.durationMs ?? 0) > 2000) {
      return "slow";
    }

    // TODO: check for specific properties and treat the request chronicle specially if present

    // Classify a 5% random selection of the remaining 'standard' and 'success' items as samples.
    // Discard the rest.
    return Math.random() <= 0.05 ? "sample" : "discard";
  }

}


// import {RequestChronicle} from "../middleware/requestChronicle";
// import {RBValidationError} from "../model";
//
// export function getReqCustomOption(req: Sails.Req, path: string | string[]): unknown {
//   return _get(req?.options ?? {}, path);
// }
//
//
// export function setReqError(req: Sails.Req, error?: any, statusCode?: string | number): void {
//   if (!req.options?.requestChronicle) {
//     throw new Error("Request Chronicle was not available.");
//   }
//   setReqChronicleError(req.options.requestChronicle, error, statusCode)
// }
//
//
