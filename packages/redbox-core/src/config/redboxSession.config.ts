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
    httpOnly?: boolean;
    sameSite?: boolean | 'lax' | 'strict' | 'none';
    secure?: boolean | 'auto';
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

/** Deployment secrets and stores are supplied through the v6 configuration loader. */
export const redboxSession: RedboxSessionConfig = {
  name: 'redbox.sid',
  secret: '',
  adapter: 'mongo',
  mongoUrl: 'mongodb://mongodb:27017/sessions',
};
