const crypto = require("node:crypto");

/**
 * Adds the Content Security Policy (CSP) http header.
 *
 * Includes generating a nonce ("number used once") for verifying server-provided files on the client.
 * This enables dynamic scripts to be generated and compiled on the server-side,
 * then provided to the client-side in a way that can be verified.
 *
 * NOTE: The CSP is a 'defense in depth' approach, it helps limit potential issues,
 * but does not prevent cross site scripting or script injection attacks.
 * For example, the nonce allows the client to verify that scripts originated from the server,
 * but the server could provide scripts with malicious code already injected
 * (e.g. from a user-entered value stored in a database).
 *
 * See: https://cheatsheetseries.owasp.org/cheatsheets/Content_Security_Policy_Cheat_Sheet.html
 * See: https://developer.mozilla.org/en-US/docs/Web/HTTP/Guides/CSP
 * See: https://angular.dev/best-practices/security#content-security-policy
 * See: https://centralcsp.com/docs
 * @param req Sails request.
 * @param res Sail response.
 * @param next Call this to proceed to the next policy.
 */
module.exports = function (req, res, next) {
    sails.log.verbose(`Setting Content Security Policy nonce headers and view local for ${req.path}`);

    // generate a nonce - a cryptographically secure random string,
    // which must be different for each request
    const generatedNonce = crypto.randomBytes(16).toString("base64");

    // build the CSP header value
    const headerValues = [
        // == fetch directives ==
        // default-src sets a fallback policy for all resources whose directives are not explicitly listed
        "default-src 'self'",
        `script-src 'nonce-${generatedNonce}' 'self'`,
        "worker-src 'self'",
        // elements controlled by object-src are legacy, so set this to none
        // see https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Content-Security-Policy/object-src
        "object-src 'none'",
        "manifest-src 'self'",
        // allow Google Fonts
        `style-src 'nonce-${generatedNonce}' 'self' https://fonts.googleapis.com https://fonts.gstatic.com`,
        "font-src 'self' https://fonts.googleapis.com https://fonts.gstatic.com",
        // == navigation directives ==
        "frame-ancestors 'none'",
        "form-action 'self'",
        // == document directives ==
        "base-uri 'self'",
        // == other directives ==
        "upgrade-insecure-requests",
    ]
    const headerValue = headerValues.join('; ');

    // set the CSP header and value
    res.setHeader('Content-Security-Policy', headerValue + ';');

    // provide the nonce to the view, so it can be set in the angular app and scripts
    if (req.options.locals == null) {
        req.options.locals = {};
    }
    req.options.locals.contentSecurityPolicyNonce = generatedNonce;

    // proceed to the next policy
    return next();
};