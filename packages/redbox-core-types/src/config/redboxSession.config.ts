/**
 * ReDBox Session Configuration
 * (sails.config.redboxSession)
 */

export interface RedboxSessionConfig {
    name: string;
    secret: string;
    adapter: string;
    mongoUrl: string;
    [key: string]: unknown;
    // Optional fields from comments
    cookie?: {
        maxAge?: number;
    };
    host?: string;
    port?: number;
    ttl?: number;
    db?: number;
    pass?: string;
    prefix?: string;
    collection?: string;
    stringify?: boolean;
    mongoOptions?: {
        server?: {
            ssl?: boolean;
        };
    };
}

export const redboxSession: RedboxSessionConfig = {
    name: "redbox.sid",
    secret: process.env['sails__redboxSession_secret'] ? process.env['sails__redboxSession_secret'] : 'a7f06b2584ca1b8e456874024e95ec73',
    adapter: process.env['sails__redboxSession_adapter'] ? process.env['sails__redboxSession_adapter'] : 'mongo',
    mongoUrl: process.env['sails__redboxSession_mongoUrl'] ? process.env['sails__redboxSession_mongoUrl'] : 'mongodb://mongodb:27017/sessions',
};
