import {get as _get, set as _set} from 'lodash';
import {RequestChronicle} from "../middleware/requestChronicle";

export function getReqCustomOption(req: Sails.Req, path: string | string[]): unknown {
  return _get(req?.options ?? {}, path);
}

export function setReqCustomOption(req: Sails.Req, path: string | string[], value: unknown): void {
  if (req.options === undefined) {
    req.options = {};
  }
  _set(req.options, path, value);
}

export function setReqError(req: Sails.Req, error?: any, statusCode?: string | number): void {
  if (!req.options?.requestChronicle) {
    throw new Error("Request Chronicle was not available.");
  }
  setReqChronicleError(req.options.requestChronicle, error, statusCode)
}

export function setReqChronicleError(event: RequestChronicle, error?: any, statusCode?: string | number): void {
  event.meta.outcome = 'error';
  event.res.statusCode = statusCode ?? 500;

  if (error) {
    event.error = {raw: String(error)};
    if (error instanceof Error) {
      event.error.name = error.name;
      event.error.message = error.message;
      event.error.cause = error.cause?.toString();
    }
    if ('code' in error) {
      event.error.code = error.code;
    }
  }
}
