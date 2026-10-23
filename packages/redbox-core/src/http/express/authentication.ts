import type { Request, RequestHandler } from 'express';
import { Passport } from 'passport';
import { Strategy as BearerStrategy } from 'passport-http-bearer';
import { Strategy as LocalStrategy } from 'passport-local';
import type { AuthenticatedActor, HttpIdentity } from './identity';
import { trackHttpRequestWork } from '../../middleware/requestLifetime';

function trackedSession(middleware: RequestHandler): RequestHandler {
  return (req, res, next) => {
    const { promise, resolve } = Promise.withResolvers<void>();
    trackHttpRequestWork(req, promise);
    try {
      middleware(req, res, error => {
        try {
          next(error);
        } finally {
          resolve();
        }
      });
    } catch (error) {
      try {
        next(error);
      } finally {
        resolve();
      }
    }
  };
}

function actor(value: unknown): value is AuthenticatedActor {
  return (
    !!value &&
    typeof value === 'object' &&
    typeof Reflect.get(value, 'id') === 'string' &&
    typeof Reflect.get(value, 'username') === 'string' &&
    Array.isArray(Reflect.get(value, 'roles'))
  );
}

/** Fresh Passport instance; only this application's serializers/strategies are installed. */
export function createHttpAuthentication(identity: HttpIdentity) {
  const passport = new Passport();
  passport.serializeUser((user, done) => {
    if (!actor(user)) {
      done(new Error('Invalid authenticated actor.'));
      return;
    }
    done(null, user.id);
  });
  passport.deserializeUser((id: string, done) => {
    void identity.session(id).then(user => done(null, user), done);
  });
  passport.use(
    'bearer',
    new BearerStrategy((token, done) => {
      void identity.bearer(token).then(user => done(null, user), done);
    })
  );
  passport.use(
    'local',
    new LocalStrategy((username, password, done) => {
      void identity.local(username, password).then(user => done(null, user), done);
    })
  );
  return {
    passport,
    initialize: passport.initialize() as RequestHandler,
    session: trackedSession(passport.session() as RequestHandler),
    /** For an explicit login adapter. Browser flows and CSRF remain P6. */
    local: ((req, res, next) => {
      const work = new Promise<void>((resolve, reject) => {
        const middleware: RequestHandler = passport.authenticate('local', (error: unknown, user: unknown) => {
          if (error) {
            reject(error);
            return;
          }
          if (!actor(user)) {
            res.status(401).json({ message: 'Authentication required', details: '' });
            resolve();
            return;
          }
          req.logIn(user, loginError => {
            if (loginError) reject(loginError);
            else {
              Reflect.set(req.session, 'authenticationVersion', 6);
              try {
                next();
                resolve();
              } catch (error) {
                reject(error);
              }
            }
          });
        });
        middleware(req, res, reject);
      });
      trackHttpRequestWork(req, work);
      void work.catch(next);
    }) satisfies RequestHandler,
    authenticate(req: Request): Promise<AuthenticatedActor | false> {
      // An explicit invalid bearer credential must not recover through a session.
      if (req.headers.authorization === undefined && req.isAuthenticated() && actor(req.user))
        return Promise.resolve(req.user);
      return new Promise((resolve, reject) => {
        const middleware: RequestHandler = passport.authenticate(
          'bearer',
          { session: false },
          (error: unknown, user: unknown) => {
            if (error) reject(error);
            else resolve(actor(user) ? user : false);
          }
        );
        // Bearer authentication with a callback never writes a response or session.
        middleware(req, req.res!, reject);
      });
    },
  };
}
