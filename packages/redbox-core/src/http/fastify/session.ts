import { createHmac } from 'node:crypto';
import { AsyncLocalStorage } from 'node:async_hooks';
import proxyAddr from '@fastify/proxy-addr';
import type { FastifyServerOptions } from 'fastify';
import cookiePlugin from '@fastify/cookie';
import sessionPlugin, { type FastifySessionOptions, type SessionStore } from '@fastify/session';
import type { FastifyRequest, FastifyReply, Session } from 'fastify';
import type { Collection, Db } from 'mongodb';
import type { PersistenceOwner } from '../../persistence/owner';
import { mongoSessionDatabase, registerPersistenceResource, hasActivePersistenceWork } from '../../persistence/runtime';
import { prepareSessionIndexes } from '../../persistence/sessions/indexes';
import { hasActiveHttpRequest, retainHttpRequestFollowup } from '../../middleware/requestLifetime';
import type { FastifyPreparation } from './preparation';
import { requestPathname } from './router';
import { requestText } from '../requestValues';

/** Separate from Express's unprefixed IDs; the existing expires_1 maintenance applies. */
export const nativeSessionNamespace = 'redbox-fastify-v1:';
const version = 1;
const metadata = '__fastifySessionMetadata'; // @fastify/session 11.1.6 generation contract

export interface NativeSessionConfiguration {
  readonly adapter: 'mongo';
  readonly mongoUrl: string;
  readonly mongoOptions?: Record<string, unknown>;
  readonly dbName?: string;
  readonly collection?: string;
  readonly name?: string;
  readonly secret: string | readonly string[];
  readonly cookie?: FastifySessionOptions['cookie'];
  readonly proxy?: boolean;
  readonly rolling?: boolean;
  readonly resave?: boolean;
  readonly saveUninitialized?: boolean;
  /** Fallback lifetime in seconds for cookies without an expiry (connect-mongo default). */
  readonly ttl?: number;
  readonly touchAfter?: number;
}

/** The cookie lifecycle used by the current session contract. Serialization
 * intentionally forwards the same fields as express-session Cookie.data: maxAge
 * is milliseconds/Expires, and serializer encode/signed options are not forwarded.
 * This is transport data only; native Session still owns signing and generation.
 */
class SessionCookie {
  public path = '/';
  public httpOnly = true;
  public originalMaxAge: number | null = null;
  private _expires: Date | null = null;
  public constructor(options: Record<string, unknown>, loaded = false) {
    for (const [key, value] of Object.entries(options)) {
      if (key === 'data') continue;
      Reflect.set(this, key, key === 'expires' && value != null ? new Date(value as string | number | Date) : value);
    }
    if (this.originalMaxAge == null) this.originalMaxAge = this.maxAge;
    if (loaded && Object.hasOwn(options, 'originalMaxAge'))
      this.originalMaxAge = options.originalMaxAge as number | null;
  }
  public get expires(): Date | null {
    return this._expires;
  }
  public set expires(value: Date | null) {
    this._expires = value;
    this.originalMaxAge = this.maxAge;
  }
  public get maxAge(): number | null {
    return this.expires instanceof Date ? this.expires.getTime() - Date.now() : null;
  }
  public set maxAge(value: number | null) {
    this.expires = typeof value === 'number' ? new Date(Date.now() + value) : value;
  }
  public toJSON(): Record<string, unknown> {
    return Object.fromEntries(
      ['originalMaxAge', 'partitioned', 'priority', 'expires', 'secure', 'httpOnly', 'domain', 'path', 'sameSite'].map(
        key => [key, Reflect.get(this, key)]
      )
    );
  }
}
declare module 'fastify' {
  interface Session {
    resetMaxAge(): this;
  }
}
interface SessionContext {
  cookie?: Record<string, unknown>;
  bind: (session: Session, cookie?: Record<string, unknown>) => void;
}

interface SessionDocument {
  _id: string;
  version: number;
  generation: string;
  expires: Date;
  session: string;
  lastModified?: Date;
}
type Completion<T = void> = (error: Error | null, value?: T) => unknown;
const absent = () => Object.assign(new Error('The session does not exist or has changed.'), { code: 'ENOENT' });
function generation(session: Session): string {
  const value: unknown = Reflect.get(session, metadata)?.generation;
  if (typeof value !== 'string' || !value) throw new TypeError('Native session generation is required.');
  return value;
}

/** Borrows only an application-owned collection. No MongoClient, index DDL or close. @internal */
export class NativeMongoSessionStore implements SessionStore {
  private readonly collection: Collection<SessionDocument>;
  private readonly pending = new Set<Promise<unknown>>();
  private readonly revoked = new WeakSet<Session>();
  private closed = false;
  public readonly loading = new AsyncLocalStorage<SessionContext>();

  public isRevoked(session: Session): boolean {
    return this.revoked.has(session);
  }

  public revoke(session: Session): void {
    this.revoked.add(session);
  }

  public constructor(
    private readonly owner: PersistenceOwner,
    database: Db,
    collection: string,
    private readonly ttl: number,
    private readonly touchAfter = 0
  ) {
    this.collection = database.collection<SessionDocument>(collection);
    registerPersistenceResource(owner, 'sessions', {
      drain: async () => {
        while (this.pending.size) await Promise.allSettled(this.pending);
      },
      close: async () => {
        this.closed = true;
        this.loading.disable();
      },
    });
  }

  private dispatch<T>(operation: () => Promise<T>, callback: Completion<T>): void {
    // Refuse stale/unowned references before any database operation starts. Already
    // admitted requests may continue through quiesce, disconnect and stop retry.
    if (this.closed || !hasActiveHttpRequest(this.owner)) {
      callback(new Error('Session operation requires an active owned HTTP request.'));
      return;
    }
    const work = Promise.resolve()
      .then(operation)
      .then(
        value => callback(null, value),
        error => {
          return callback(
            (error as NodeJS.ErrnoException)?.code === 'ENOENT' ? absent() : new Error('Session persistence failed.')
          );
        }
      );
    this.pending.add(work);
    retainHttpRequestFollowup(
      this.owner,
      work.then(() => {})
    );
    const settled = () => this.pending.delete(work);
    void work.then(settled, settled);
  }

  private expiry(session: Session): Date {
    const expiry = session.cookie.expires;
    const date = expiry ? new Date(expiry) : new Date(Date.now() + this.ttl * 1000);
    if (!Number.isFinite(date.getTime())) throw new TypeError('Invalid session expiry.');
    return date;
  }

  private serialize(session: Session): string {
    // connect-mongo's throttling marker is transient request state, not payload.
    if (this.touchAfter > 0 && Reflect.get(session, 'lastModified')) Reflect.deleteProperty(session, 'lastModified');
    return JSON.stringify(session);
  }

  public get(id: string, callback: Completion<Session | null>): void {
    this.dispatch(() => this.read(id), callback);
  }

  /** Socket operations already admitted by their owner may borrow the same store. */
  public readAccepted(id: string): Promise<Session | null> {
    if (this.closed || !hasActivePersistenceWork(this.owner))
      return Promise.reject(new Error('Session lookup requires accepted work.'));
    const work = this.read(id);
    this.pending.add(work);
    const settled = () => this.pending.delete(work);
    void work.then(settled, settled);
    return work;
  }

  private async read(id: string): Promise<Session | null> {
    const document = await this.collection.findOne({
      _id: nativeSessionNamespace + id,
      version,
      expires: { $gt: new Date() },
    });
    if (!document) return null;
    const session = JSON.parse(document.session) as Session;
    const loading = this.loading.getStore();
    if (loading) loading.cookie = { ...session.cookie };
    if (session.cookie.expires) session.cookie.expires = document.expires;
    if (this.touchAfter > 0 && document.lastModified) Reflect.set(session, 'lastModified', document.lastModified);
    return session;
  }

  private async insert(id: string, session: Session): Promise<void> {
    if (this.revoked.has(session)) throw absent();
    const serialized = this.serialize(session);
    await this.collection.insertOne({
      _id: nativeSessionNamespace + id,
      version,
      generation: generation(session),
      expires: this.expiry(session),
      session: serialized,
      ...(this.touchAfter > 0 ? { lastModified: new Date() } : {}),
    });
  }

  public set(id: string, session: Session, callback: Completion): void {
    this.dispatch(async () => {
      this.loading.getStore()?.bind(session);
      await this.insert(id, session);
    }, callback);
  }

  public compareAndSet(id: string, expectedGeneration: string, session: Session, callback: Completion): void {
    this.dispatch(async () => {
      this.loading.getStore()?.bind(session);
      if (this.revoked.has(session)) throw absent();
      const serialized = this.serialize(session);
      const result = await this.collection.updateOne(
        { _id: nativeSessionNamespace + id, version, generation: expectedGeneration },
        {
          $set: {
            generation: generation(session),
            expires: this.expiry(session),
            session: serialized,
            ...(this.touchAfter > 0 ? { lastModified: new Date() } : {}),
          },
        }
      );
      if (!result.matchedCount) {
        this.revoked.add(session);
        throw absent();
      }
    }, callback);
  }

  /** Expiry-only CAS: an unchanged request cannot overwrite a concurrent mutation. */
  public touch(id: string, session: Session, callback: Completion): void {
    this.dispatch(async () => {
      const lastModified: unknown = Reflect.get(session, 'lastModified');
      const throttled = this.touchAfter > 0 && lastModified instanceof Date && lastModified.getTime() > 0;
      if (throttled && Date.now() - lastModified.getTime() < this.touchAfter * 1000) return;
      const result = await this.collection.updateOne(
        { _id: nativeSessionNamespace + id, version, generation: generation(session) },
        { $set: { expires: this.expiry(session), ...(throttled ? { lastModified: new Date() } : {}) } }
      );
      if (!result.matchedCount) {
        this.revoked.add(session);
        throw absent();
      }
    }, callback);
  }

  public destroy(id: string, callback: Completion): void {
    this.dispatch(async () => {
      await this.collection.deleteOne({ _id: nativeSessionNamespace + id, version });
    }, callback);
  }
}

export interface NativeSessionOptions extends FastifySessionOptions {
  readonly store: NativeMongoSessionStore;
  readonly resave: boolean;
  readonly proxy?: boolean;
}

type PeerTrust = (address: string, hop: number) => boolean;
interface RequestSessionState {
  id: string;
  hash: string;
  persisted: boolean;
  savedId?: string;
  savedHash?: string;
  automaticFailed?: boolean;
}
const requests = new WeakMap<FastifyRequest, RequestSessionState>();
function dataHash(session: Session): string {
  return JSON.stringify(session, function (key, value) {
    return this === session && (key === 'cookie' || key === metadata) ? undefined : value;
  });
}
function secure(request: FastifyRequest, proxy: boolean | undefined, trust: PeerTrust): boolean {
  if (Reflect.get(request.raw.socket, 'encrypted') === true) return true;
  if (proxy === false) return false;
  if (proxy === undefined && !trust(request.raw.socket.remoteAddress ?? '', 0)) return false;
  const first = (requestText(request.headers['x-forwarded-proto']) ?? '').split(',', 1)[0].trim();
  // Express's req.protocol preserves case; express-session's proxy:true override
  // explicitly lowercases the header. Both select the first forwarded entry.
  return (proxy === true ? first.toLowerCase() : first) === 'https';
}
export function sessionPeerTrust(value: FastifyServerOptions['trustProxy'] = false): PeerTrust {
  if (typeof value === 'function') return value;
  if (typeof value === 'boolean') return () => value;
  return proxyAddr.compile(typeof value === 'string' ? value.split(',').map(part => part.trim()) : value);
}

/** Every Session construction/inflation crosses this request-local boundary,
 * including replacements made by reload/regenerate, before caller continuation.
 */
export function nativeSessionRequest(
  options: NativeSessionOptions,
  hook: (request: FastifyRequest, reply: FastifyReply, done: (error?: Error) => void) => void,
  trust: PeerTrust,
  createSession: (
    request: FastifyRequest,
    cookie: NonNullable<FastifySessionOptions['cookie']>,
    done: (error?: Error) => void
  ) => void
) {
  return function (request: FastifyRequest, reply: FastifyReply, done: (error?: Error) => void) {
    const bound = new WeakSet<Session>();
    const configured = {
      ...options.cookie,
      secure: options.cookie?.secure === true || secure(request, options.proxy, trust),
    };
    const bind = (session: Session, cookie?: Record<string, unknown>) => {
      if (bound.has(session)) return;
      bound.add(session);
      const current = session as FastifyRequest['session'];
      current.options(configured);
      Reflect.set(current, 'cookie', new SessionCookie(cookie ?? configured, cookie != null));
      const method = (name: string, value: unknown) =>
        Object.defineProperty(current, name, { value, configurable: true, writable: true });
      const touch = () => {
        current.cookie.maxAge = current.cookie.originalMaxAge!;
        return current;
      };
      method('touch', touch);
      method('resetMaxAge', touch);
      method('options', (options: Record<string, unknown>) => {
        if (!Object.keys(options).length) return;
        // Preserve expiry/originalMaxAge and object identity. Assigning only the
        // supplied fields also preserves caller order between maxAge and expires.
        Object.assign(current.cookie, options);
      });
      const save = current.save;
      method('save', (callback?: Completion) => {
        const state = requests.get(request);
        if (state) {
          state.savedId = current.sessionId;
          state.savedHash = dataHash(current);
        }
        return Reflect.apply(save, current, [callback]);
      });
      method('regenerate', (...args: unknown[]) => {
        const callback = typeof args.at(-1) === 'function' ? (args.pop() as Completion) : undefined;
        const keys = Array.isArray(args[0]) ? (args[0] as string[]) : [];
        const run = (complete: Completion) =>
          options.store.destroy(current.sessionStoreId, error => {
            if (!error) options.store.revoke(current);
            // Express generates a fresh, unsaved session even when destroy fails.
            // The qualified native factory retains native ID generation/signing and
            // avoids native regenerate's eager persistence and stable old store key.
            createSession(request, configured, creationError => {
              if (!creationError) {
                bind(request.session);
                for (const key of keys) Reflect.set(request.session, key, Reflect.get(current, key));
              }
              return complete(error ?? creationError ?? null);
            });
          });
        return callback
          ? run(callback)
          : new Promise<void>((resolve, reject) => run(error => (error ? reject(error) : resolve())));
      });
      const reload = current.reload;
      method('reload', (callback?: Completion) => {
        const loaded: SessionContext = { bind };
        const run = (complete: Completion) =>
          options.store.loading.run(loaded, () => {
            const finish = (error?: Error) => {
              if (!error && !loaded.cookie) {
                request.session = current;
                error = absent();
              }
              if (!error) bind(request.session, loaded.cookie);
              return complete(error ?? null);
            };
            return Reflect.apply(reload, current, [finish]);
          });
        return callback
          ? run(callback)
          : new Promise<void>((resolve, reject) => run(error => (error ? reject(error) : resolve())));
      });
      const destroy = current.destroy;
      method('destroy', (callback?: Completion) => {
        const result = Reflect.apply(destroy, current, [callback]);
        Reflect.set(request, 'session', null);
        return result;
      });
    };
    const loaded: SessionContext = { bind };
    options.store.loading.run(loaded, () => {
      const target = request.raw.url;
      const pathname = requestPathname(target ?? '/') ?? '/';
      const path = options.cookie?.path || '/';
      // Express admits literal pathname prefixes, including /scop -> /scope.
      // The native plugin also requires a slash boundary. Qualify admission here
      // and give its synchronous path check the exact accepted cookie path.
      if (!pathname.startsWith(path)) {
        Reflect.set(request, 'session', undefined);
        done();
        return;
      }
      request.raw.url = path;
      try {
        return hook(request, reply, error => {
          request.raw.url = target;
          if (error) return done(error);
          const session = request.session;
          if (session?.sessionId) {
            bind(session, session.isPersisted() ? loaded.cookie : undefined);
            requests.set(request, {
              id: session.sessionId,
              hash: dataHash(session),
              persisted: session.isPersisted(),
              ...(session.isPersisted() && !options.resave
                ? { savedId: session.sessionId, savedHash: dataHash(session) }
                : {}),
            });
          } else Reflect.set(request, 'session', undefined);
          done();
        });
      } finally {
        // The pinned hook reads its path synchronously, including before a get.
        // Restore before synchronous continuation and throughout asynchronous I/O.
        request.raw.url = target;
      }
    });
  };
}

/** Qualified replacement for the pinned plugin's incompatible default onSend.
 * Native Session still owns signing, hashing, serialization state and rotation.
 * Express persists even on insecure transport and touches without resaving data.
 */
export function nativeSessionSend(options: NativeSessionOptions, trust: PeerTrust) {
  return async function (request: FastifyRequest, reply: FastifyReply, payload: unknown) {
    const session = request.session;
    const name = options.cookieName!;
    const initial = requests.get(request);
    if (!session?.sessionId) return payload;
    // Fastify can rerun onSend for an error response; a failed automatic write must not be
    // retried implicitly or emit credentials for the failed action.
    if (initial?.automaticFailed || options.store.isRevoked(session)) return payload;
    if (!initial) return payload;
    const modified = initial.id !== session.sessionId || initial.hash !== dataHash(session);
    const sameCookie = initial.persisted && initial.id === session.sessionId;
    const saved =
      initial.id === session.sessionId &&
      initial.savedId === session.sessionId &&
      initial.savedHash === dataHash(session);
    const shouldSave = !options.saveUninitialized && !saved && !sameCookie ? modified : !saved;
    session.touch();
    try {
      if (shouldSave) {
        await session.save();
      } else if (sameCookie) {
        await new Promise<void>((resolve, reject) =>
          options.store.touch(session.sessionStoreId, session, error => (error ? reject(error) : resolve()))
        );
      }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
        initial.automaticFailed = true;
        throw error;
      }
      // A concurrent rotation/logout wins; never issue its stale credentials.
      reply.clearCookie(name, { path: options.cookie?.path || '/', domain: options.cookie?.domain });
      return payload;
    }
    // connect-mongo removes its transient lastModified marker while saving.
    // Express evaluates renewal after that synchronous store dispatch, so a
    // resave can change the data hash even when the handler made no mutation.
    const renewModified = initial.id !== session.sessionId || initial.hash !== dataHash(session);
    const renew = !sameCookie
      ? options.saveUninitialized || renewModified
      : options.rolling || (session.cookie.expires != null && renewModified);
    const value = (options.cookiePrefix ?? '') + session.encryptedSessionId;
    if (session.cookie.secure !== true || secure(request, options.proxy, trust)) {
      if (renew)
        reply.setCookie(name, value, {
          encode: encodeURIComponent,
          expires: session.cookie.expires ?? undefined,
          path: session.cookie.path,
          domain: session.cookie.domain,
          secure: session.cookie.secure,
          sameSite: session.cookie.sameSite,
          httpOnly: session.cookie.httpOnly,
          partitioned: Reflect.get(session.cookie, 'partitioned'),
          priority: Reflect.get(session.cookie, 'priority'),
        });
    }
    return payload;
  };
}

/** Core preparation only; maintenance remains prepareSessionIndexes(inspect/ensure).
 * Deployment MUST rotate the root secret at cutover AND rollback, without retaining
 * a preceding-host secret. Namespace/derived keys also reject Express state even
 * when a development fixture reuses its root secret. See FM-014 evidence.
 */
export async function prepareNativeSessions(
  app: FastifyPreparation,
  owner: PersistenceOwner,
  config: NativeSessionConfiguration
): Promise<Pick<NativeMongoSessionStore, 'readAccepted'>> {
  if (config.adapter !== 'mongo') throw new TypeError('Native sessions require the application-owned Mongo datastore.');
  const secrets = typeof config.secret === 'string' ? [config.secret] : [...config.secret];
  if (!secrets.length || secrets.some(secret => typeof secret !== 'string' || secret.length < 32))
    throw new TypeError('Session signing secrets must each contain at least 32 characters.');
  if (typeof config.cookie === 'function') throw new TypeError('Session cookie must be an object.');
  const ttl = config.ttl ?? 14 * 24 * 60 * 60;
  if (!Number.isFinite(ttl) || ttl <= 0) throw new TypeError('Session ttl must be a positive number of seconds.');
  const touchAfter = config.touchAfter ?? 0;
  if (!Number.isFinite(touchAfter) || touchAfter < 0)
    throw new TypeError('Session touchAfter must be a nonnegative number of seconds.');
  const indexes = await prepareSessionIndexes(owner, { ...config }, 'inspect');
  if (indexes.some(index => index.index !== 'ready'))
    throw new Error('Session indexes are not ready. Run explicit persistence:indexes maintenance.');
  const database = await mongoSessionDatabase(owner, { ...config });
  const store = new NativeMongoSessionStore(owner, database, config.collection ?? 'sessions', ttl, touchAfter);
  const cookie = {
    ...config.cookie,
    httpOnly: config.cookie?.httpOnly ?? true,
    sameSite: config.cookie?.sameSite ?? ('lax' as const),
    secure: config.cookie?.secure ?? true,
  };
  app.register(cookiePlugin);
  app.register(sessionPlugin, {
    store,
    secret: secrets.map(secret => createHmac('sha256', secret).update(nativeSessionNamespace).digest('base64url')),
    cookieName: config.name ?? 'redbox.sid',
    cookiePrefix: 's:',
    cookie,
    saveUninitialized: config.saveUninitialized ?? false,
    rolling: config.rolling ?? false,
    resave: config.resave ?? false,
    proxy: config.proxy,
  });
  return store;
}
