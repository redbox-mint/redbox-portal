import 'express-session';
declare module 'express-session' {
  interface SessionData {
    branding?: string; portal?: string; user?: Record<string, unknown>;
    redirUrl?: string; logoutUrl?: string; lang?: string; authenticated?: boolean; data?: unknown;
  }
}
