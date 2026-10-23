import { composeHttpSession } from '../http/express/session';
import type session from 'express-session';
export { buildRedboxSessionOptions } from '../http/express/session';

/** Temporary Sails lifecycle adapter over the shared per-application middleware. */
export function redboxSession(config: session.SessionOptions & { [key: string]: unknown }) {
  const app = typeof sails === 'undefined' ? undefined : sails;
  const composed = composeHttpSession(config, app);
  if (app) {
    const previous = app.config.beforeShutdown;
    app.config.beforeShutdown = callback => {
      void composed.drain().then(() => {
        try {
          if (previous) previous(callback);
          else callback();
        } catch (error) {
          callback(error);
        }
      }, callback);
    };
  }
  return composed.middleware;
}
