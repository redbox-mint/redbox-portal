/**
 * ReDBox Session Config Interface
 * (sails.config.redboxSession)
 * 
 * Custom session configuration for ReDBox.
 * Note: Uses process.env values at runtime, must stay as JS.
 */

export interface RedboxSessionCookie {
    /** Cookie max age in milliseconds */
    maxAge?: number;

    /** Cookie secure flag */
    secure?: boolean;

    /** Cookie httpOnly flag */
    httpOnly?: boolean;

    /** Cookie same site setting */
    sameSite?: boolean | 'lax' | 'strict' | 'none';
}

export interface RedboxSessionConfig {
    /** Session cookie name */
    name: string;

    /** Session secret for signing */
    secret: string;

    /** Session cookie configuration */
    cookie?: RedboxSessionCookie;

    /** Session adapter ('mongo' | 'redis' | 'memory') */
    adapter?: string;

    /** MongoDB connection URL for mongo adapter */
    mongoUrl?: string;

    /** Redis host */
    host?: string;

    /** Redis port */
    port?: number;

    /** Redis TTL in seconds */
    ttl?: number;

    /** Redis database number */
    db?: number;

    /** Redis password */
    pass?: string;

    /** Redis key prefix */
    prefix?: string;

    /** MongoDB collection name */
    collection?: string;

    /** Stringify session data */
    stringify?: boolean;

    /** MongoDB options */
    mongoOptions?: Record<string, unknown>;
}

// Note: Default values use process.env at runtime.
// The original config/redboxSession.js file must be kept for runtime.
