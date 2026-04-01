import * as crypto from 'node:crypto';

interface CspConfig {
    enabled?: boolean;
    reportOnly?: boolean;
    addNonceTo?: string[];
    directives?: Record<string, string[]>;
    extras?: string[];
}

/**
 * ContentSecurityPolicy Policy
 *
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
 */
export function contentSecurityPolicy(req: Sails.Req, res: Sails.Res, next: Sails.NextFunction): void {
    sails.log.verbose(`Setting Content Security Policy nonce headers and view local for ${req.path}`);

    // Config can be provided at sails.config.csp or sails.config.security.csp
    const cfg: CspConfig = (sails.config && (sails.config.csp as CspConfig || (sails.config.security && (sails.config.security as unknown as Record<string, unknown>).csp as CspConfig | undefined))) || {};

    // Fallback defaults mirror previous hard-coded behavior
    const defaults: Required<CspConfig> = {
        enabled: true,
        reportOnly: false,
        addNonceTo: ['script-src', 'style-src'],
        directives: {
            'default-src': ["'self'"],
            'script-src': ["'self'"],
            'worker-src': ["'self'"],
            'object-src': ["'none'"],
            'manifest-src': ["'self'"],
            'style-src': ["'self'", 'https://fonts.googleapis.com', 'https://fonts.gstatic.com'],
            'font-src': ["'self'", 'https://fonts.googleapis.com', 'https://fonts.gstatic.com'],
            'frame-ancestors': ["'none'"],
            'form-action': ["'self'"],
            'base-uri': ["'self'"],
        },
        extras: ['upgrade-insecure-requests'],
    };

    // Merge settings: shallow for top-level, replace arrays for directives keys if provided
    const enabled = cfg.enabled != null ? !!cfg.enabled : defaults.enabled;
    const reportOnly = cfg.reportOnly != null ? !!cfg.reportOnly : defaults.reportOnly;
    const addNonceTo = Array.isArray(cfg.addNonceTo) ? cfg.addNonceTo : defaults.addNonceTo;
    const extras = Array.isArray(cfg.extras) ? cfg.extras : defaults.extras;
    const directives: Record<string, string[]> = Object.assign({}, defaults.directives, cfg.directives || {});

    if (!enabled) {
        return next();
    }

    // generate a nonce - a cryptographically secure random string,
    // which must be different for each request
    const generatedNonce = crypto.randomBytes(16).toString("base64");

    // For any directive configured in addNonceTo, ensure the nonce token is prepended
    addNonceTo.forEach((name) => {
        const arr = directives[name];
        if (Array.isArray(arr)) {
            const token = `'nonce-${generatedNonce}'`;
            // Remove any existing nonces and prepend the fresh one
            const filtered = arr.filter((v) => typeof v !== 'string' || !v.startsWith("'nonce-"));
            directives[name] = [token, ...filtered];
        }
    });

    // Build the header value
    const parts: string[] = [];
    Object.keys(directives).forEach((key) => {
        const values = directives[key];
        if (Array.isArray(values) && values.length > 0) {
            parts.push(`${key} ${values.join(' ')}`);
        }
        // empty array means emit key with no values (rare), skip to avoid invalid policy
    });
    (extras || []).forEach((d) => {
        if (typeof d === 'string' && d.trim().length > 0) {
            parts.push(d.trim());
        }
    });

    if (parts.length === 0) {
        sails.log.warn('CSP is enabled but no directives or extras are configured. Skipping CSP header.');
        return next();
    }

    const headerValue = parts.join('; ');

    // Set the appropriate CSP header; add trailing semicolon for readability consistency with previous code
    const headerName = reportOnly ? 'Content-Security-Policy-Report-Only' : 'Content-Security-Policy';
    res.set(headerName, `${headerValue};`);

    // provide the nonce to the view, so it can be set in the angular app and scripts
    if (!req.options) req.options = {};
    const locals = (req.options.locals ?? {}) as Record<string, unknown>;
    req.options.locals = locals;
    locals.contentSecurityPolicyNonce = generatedNonce;

    // proceed to the next policy
    return next();
}

export default contentSecurityPolicy;
