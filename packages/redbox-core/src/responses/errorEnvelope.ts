import { APIErrorResponse } from '../model/APIErrorResponse';
import { ErrorResponseItemV2, ErrorResponseV2, MetaResponseItemV2 } from '../model/api/APIResponseVersion2';

/**
 * Resolves the requested API version, mirroring CoreController/validateApiContractRequest.
 * Defaults to `1.0` when no explicit version is supplied.
 */
export function getRequestApiVersion(req: Sails.Req): '1.0' | '2.0' {
    const headerValue = req.headers?.['x-redbox-api-version'];
    const headerVersion = typeof headerValue === 'string' ? headerValue.trim().toLowerCase() : '';
    const queryValue = (req.query as Record<string, unknown> | undefined)?.['apiVersion'];
    const queryVersion = typeof queryValue === 'string' ? queryValue.trim().toLowerCase() : '';
    return (headerVersion || queryVersion) === '2.0' ? '2.0' : '1.0';
}

/**
 * Builds the legacy v1 `{ message, details }` error body from a set of display errors.
 */
export function buildV1ErrorBody(displayErrors: ErrorResponseItemV2[]): APIErrorResponse {
    if (displayErrors.length === 1) {
        const displayError = displayErrors[0] ?? {};
        const title = displayError.title?.toString()?.trim() || displayError.code?.toString()?.trim() || '';
        const detail = displayError.detail?.toString()?.trim() || '';
        if (title || detail) {
            return new APIErrorResponse(title || detail || 'An error occurred', title && detail ? detail : '');
        }
    }
    const message = displayErrors
        .map(error => error.detail || error.title || error.code || 'An error occurred')
        .join(' | ');
    return new APIErrorResponse(message || 'An error occurred', '');
}

/**
 * Builds a version-appropriate error envelope so that runtime responses match the
 * published OpenAPI contract: legacy `{ message, details }` for v1 (the default) and
 * the JSON:API `{ errors, meta }` envelope for v2.
 */
export function buildErrorEnvelope(
    req: Sails.Req,
    displayErrors: ErrorResponseItemV2[],
    meta: MetaResponseItemV2 = {}
): APIErrorResponse | ErrorResponseV2 {
    if (getRequestApiVersion(req) === '2.0') {
        return { errors: displayErrors, meta };
    }
    return buildV1ErrorBody(displayErrors);
}
