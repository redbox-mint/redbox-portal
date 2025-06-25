/**
 * From https://github.com/mathematic-inc/ts-japi/blob/main/src/models/error.model.ts
 * Licence Apache 2.0.
 */
export interface ErrorResponseItemV2 {
    /**
     * A unique identifier for this particular occurrence of the problem.
     */
    id?: string;

    /**
     * The HTTP status code applicable to this problem, expressed as a string
     * value.
     */
    status?: string;

    /**
     * An application-specific error code, expressed as a string value.
     */
    code?: string;

    /**
     * A short, human-readable summary of the problem that SHOULD NOT change from
     * occurrence to occurrence of the problem, except for purposes of
     * localization.
     */
    title?: string;

    /**
     * A human-readable explanation specific to this occurrence of the problem.
     * Like title, this field's value can be localized.
     */
    detail?: string;

    /**
     * An object containing references to the source of the error, optionally
     * including any of the following members.
     */
    source?: {
        /**
         * A JSON Pointer [RFC6901] to the value in the request document that caused the error
         * [e.g. "/data" for a primary data object, or "/data/attributes/title" for a specific attribute].
         * This MUST point to a value in the request document that exists; if it doesn’t,
         * the client SHOULD simply ignore the pointer.
         */
        pointer?: string;

        /**
         * A string indicating which URI query parameter caused the error.
         */
        parameter?: string;

        /**
         * A string indicating the name of a single request header which caused
         * the error.
         */
        header?: string;
    };

    /**
     * Links to more information about the error.
     */
    links?: {
        /**
         * A link that leads to further details about this particular occurrence of the problem.
         * When dereferenced, this URI SHOULD return a human-readable description of the error.
         */

        about?: string;
        /**
         * A link that identifies the type of error that this particular error is an instance of.
         * This URI SHOULD be dereferenceable to a human-readable explanation of the general error.
         */
        type?: string;
    }

    /**
     * A meta object containing non-standard meta-information about the error.
     */
    meta?: { [key: string]: unknown };
}

/**
 * An error response to a request.
 */
export interface ErrorResponseV2 {
    /**
     * The errors.
     */
    errors: ErrorResponseItemV2[];
    /**
     * A meta-object containing non-standard meta-information about the response.
     */
    meta: { [key: string]: unknown };
}

/**
 * A successful response to a request.
 */
export interface DataResponseV2 {
    /**
     * The response primary data.
     */
    data: unknown;
    /**
     * A meta-object containing non-standard meta-information about the response.
     */
    meta: { [key: string]: unknown };
}
