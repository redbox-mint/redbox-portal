/**
 * Session Config Interface
 * (sails.config.session)
 * 
 * Session management configuration.
 */

export interface SessionCookieConfig {
    /** Cookie max age in milliseconds */
    maxAge?: number;

    /** Cookie secure flag (HTTPS only) */
    secure?: boolean;

    /** Cookie httpOnly flag */
    httpOnly?: boolean;

    /** Cookie same site setting */
    sameSite?: boolean | 'lax' | 'strict' | 'none';

    /** Cookie path */
    path?: string;

    /** Cookie domain */
    domain?: string;
}

export interface SessionConfig {
    /** Session secret for signing cookies */
    secret?: string;

    /** Session cookie configuration */
    cookie?: SessionCookieConfig;

    /** Session adapter (e.g., 'memory', 'redis', etc.) */
    adapter?: string;

    /** Session store URL (for Redis, etc.) */
    url?: string;

    /** Session name */
    name?: string;

    /** Allow certain requests to skip session */
    isSessionDisabled?: (req: any) => boolean;
}

// Session can be disabled entirely by setting to false
export type SessionConfigOrDisabled = SessionConfig | false;

export const session: SessionConfigOrDisabled = false;
