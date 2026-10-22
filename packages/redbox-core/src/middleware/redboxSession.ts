import { initializePersistence, registerPersistenceResource, mongoSessionDatabase } from '../persistence/runtime';
import {
  beginHttpRequest,
  failHttpResponse,
  retainHttpResponse,
  trackHttpRequestWork,
  registerHttpRequestDrain,
  runHttpRequestContext,
} from './requestLifetime';
import * as _ from 'lodash';
import MongoStore from 'connect-mongo';
import { resolveSessionDatastore } from '../persistence/mongodb/configuration';
import session from 'express-session';
import { RequestHandler } from 'express';

export function buildRedboxSessionOptions(
  sessionConfig: session.SessionOptions & { [key: string]: unknown }
): session.SessionOptions & { [key: string]: unknown } {
  const defaultSessionConfig: Partial<session.SessionOptions> & { [key: string]: unknown } = {
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      sameSite: 'lax',
      secure: true,
    },
  };

  // set the isSessionDisabled function as a property of the defaultSessionConfig object before merging with caller-supplied config
  defaultSessionConfig.isSessionDisabled = function (req: { path: string; _sails?: { LOOKS_LIKE_ASSET_RX?: RegExp } }) {
    const path = req.path || '';
    const looksLikeAssetRx = req._sails?.LOOKS_LIKE_ASSET_RX;
    return (
      (!!looksLikeAssetRx && looksLikeAssetRx.test(path)) ||
      /^\/(?:[^/]+\/[^/]+\/)?(?:js|styles|images|fonts|angular|icons)\//.test(path) ||
      /^\/(?:apple-touch-icon|favicon-|site\.webmanifest)/.test(path)
    );
  };

  return _.merge({}, defaultSessionConfig, sessionConfig);
}

export function redboxSession(sessionConfig: session.SessionOptions & { [key: string]: unknown }): RequestHandler {
  const app = typeof sails === 'undefined' ? undefined : sails;
  sessionConfig = buildRedboxSessionOptions(sessionConfig);
  const pending = new Set<Promise<void>>();
  let closing = false;
  const drain = async () => {
    closing = true;
    while (pending.size) await Promise.allSettled(pending);
  };
  if (app) registerHttpRequestDrain(app, drain);

  if (sessionConfig.adapter == 'mongo') {
    // connect-mongo v4+ uses .create()
    const owned: { store?: MongoStore } = {};
    if (typeof sails !== 'undefined')
      registerPersistenceResource(sails, 'sessions', {
        drain,
        close: async () => {
          await owned.store?.close();
        },
      });
    if (!app) throw new Error('Initialize application persistence before creating MongoDB sessions.');
    const database = initializePersistence(app).then(() => mongoSessionDatabase(app, sessionConfig));
    // connect-mongo closes even borrowed clients. Give it a close-only facade;
    // every database operation still uses the real runtime-owned client.
    const clientPromise = database.then(
      db =>
        new Proxy(db.client, {
          get(client, property) {
            if (property === 'close') return async () => {};
            const value = Reflect.get(client, property, client);
            return typeof value === 'function' ? value.bind(client) : value;
          },
        })
    );
    const { mongoUrl: _url, mongoOptions: _options, ...storeOptions } = sessionConfig;
    const store = MongoStore.create({
      ...storeOptions,
      clientPromise,
      dbName: resolveSessionDatastore(sessionConfig).database,
    } as unknown as Parameters<typeof MongoStore.create>[0]);
    owned.store = store;
    sessionConfig.store = store;
  }

  if (typeof sails !== 'undefined') {
    const previous = sails.config.beforeShutdown;
    // Sails runs beforeShutdown before closing HTTP. Accepted requests must
    // finish their repository writes before the persistence drain begins.
    sails.config.beforeShutdown = callback => {
      void drain().then(() => {
        try {
          if (previous) previous(callback);
          else callback();
        } catch (error) {
          callback(error);
        }
      }, callback);
    };
  }

  // Store dispatch is synchronous within end(), but its callback may outlive
  // a later response-writing throw. Keep that work independently owned.
  let respondingRequest: unknown;
  const responseStore = sessionConfig.store ?? (sessionConfig.store = new session.MemoryStore());
  for (const name of ['set', 'touch', 'destroy']) {
    const method = Reflect.get(responseStore, name);
    if (typeof method !== 'function') continue;
    Reflect.set(responseStore, name, function (this: unknown, ...args: unknown[]) {
      const callback = args[args.length - 1];
      if (!respondingRequest || typeof callback !== 'function') return Reflect.apply(method, this, args);
      let settled!: () => void;
      trackHttpRequestWork(
        respondingRequest,
        new Promise<void>(resolve => {
          settled = resolve;
        })
      );
      const complete = function (this: unknown, ...values: unknown[]) {
        try {
          return Reflect.apply(callback, this, values);
        } finally {
          settled();
        }
      };
      try {
        return Reflect.apply(method, this, [...args.slice(0, -1), complete]);
      } catch (error) {
        settled();
        throw error;
      }
    });
  }

  // configure express-session using the sessionConfig object
  const middleware = session(sessionConfig) as unknown as RequestHandler;
  return (req, res, next) => {
    if (closing) {
      next(new Error('Session store is draining.'));
      return;
    }
    let finish!: () => void;
    const active = new Promise<void>(resolve => {
      finish = resolve;
    });
    const done = () => {
      pending.delete(active);
      finish();
    };
    pending.add(active);
    beginHttpRequest(req, res, done, app);
    // The initial store lookup can outlive an aborted transport before any
    // controller exists to own the request.
    let loaded!: () => void;
    trackHttpRequestWork(
      req,
      new Promise<void>(resolve => {
        loaded = resolve;
      })
    );
    try {
      runHttpRequestContext(req, () =>
        middleware(req, res, error => {
          const endWithSession = res.end;
          // express-session may defer the underlying end until save/touch/
          // destroy completes. An async action can settle before that callback.
          res.end = function (this: typeof res, ...args: unknown[]) {
            retainHttpResponse(req);
            const previousRequest = respondingRequest;
            respondingRequest = req;
            try {
              return Reflect.apply(endWithSession, this, args);
            } catch (error) {
              failHttpResponse(req);
              throw error;
            } finally {
              respondingRequest = previousRequest;
            }
          } as typeof res.end;
          try {
            next(error);
          } finally {
            loaded();
          }
        })
      );
    } catch (error) {
      try {
        next(error);
      } finally {
        loaded();
      }
    }
  };
}
