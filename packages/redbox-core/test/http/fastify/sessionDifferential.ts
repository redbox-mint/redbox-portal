import assert from 'node:assert/strict';
import { request, Agent, type IncomingHttpHeaders } from 'node:http';
import { setTimeout as delay } from 'node:timers/promises';
import sinon from 'sinon';
import { Signer } from '@fastify/cookie';
import type { Db } from 'mongodb';
import type { FastifyRequest } from 'fastify';
import type { Request } from 'express';
import type {} from '../../../dist/http/express/sessionData';
import { ApplicationRuntime } from '../../../dist/application';
import { ExpressHost } from '../../../dist/http/express/ExpressHost';
import { composeHttpSession } from '../../../dist/http/express/session';
import { FastifyHost } from '../../../dist/http/fastify/FastifyHost';
import { prepareNativeSessions, type NativeSessionConfiguration } from '../../../dist/http/fastify/session';
import { mongoDatabase } from '../../../dist/persistence/runtime';
import { prepareSessionIndexes } from '../../../dist/persistence/sessions/indexes';

export const url = process.env.FM014_TEST_MONGO_URL;
if (process.env.FM014_SESSION_FULL === '1' && !url)
  throw new Error('Full session matrix requires FM014_TEST_MONGO_URL and real Mongo 9.0.4+.');
let qualifiedMongo = false;
if (url && !/\/fm014_sessions(?:\?|$)/.test(url)) throw new Error('Use disposable /fm014_sessions.');
declare module 'express-session' {
  interface SessionData {
    value?: string;
  }
}
const secret = 'fm014-differential-root-secret-for-mongo-0001';
export const epoch = Date.UTC(2035, 0, 1);
const maxAge = 1200;
export const actions = ['modify', 'read', 'save', 'modify-save', 'destroy', 'regenerate'] as const;
type Action = (typeof actions)[number] | 'sequence';
type Site = NonNullable<NativeSessionConfiguration['cookie']>['sameSite'];
export const targetForms = [
  'origin',
  'origin-query',
  'absolute',
  'absolute-query',
  'origin-encoded',
  'origin-encoded-query',
  'absolute-encoded',
  'absolute-encoded-query',
] as const;
export type TargetForm = (typeof targetForms)[number];
function actionPath(prefix: string, action: Action) {
  return prefix.replace(/\/$/, '') + '/' + action;
}
export function requestTarget(action: Action, form: TargetForm = 'origin', prefix?: string) {
  const path = actionPath(prefix ?? (form.includes('encoded') ? '/%73cope' : '/scope'), action);
  return (
    (form.startsWith('absolute') ? 'http://example.test' : '') +
    path +
    (form.endsWith('query') ? '?next=%2Fscope%2Fread&value=%3F+x' : '')
  );
}
export interface Settings {
  rolling: boolean;
  resave: boolean;
  saveUninitialized: boolean;
  secure: boolean | 'auto';
  trust: boolean | string[];
  proto?: string;
  sameSite?: Site;
  proxy?: boolean;
  sessionCookie?: boolean;
  cookie?: NativeSessionConfiguration['cookie'];
  ttl?: number;
  touchAfter?: number;
  target?: TargetForm;
  optionUpdate?: Record<string, unknown>;
}
interface Stored {
  _id: string;
  expires: Date;
  session: string;
}
export interface Result {
  headers: IncomingHttpHeaders;
  status: number;
  complete: boolean;
  body: {
    value: string | null;
    id: string | null;
    credential: string | null;
    events?: unknown[];
    target?: string;
    sessionPresent?: boolean;
  };
}

export function exchange(
  port: number,
  action: Action,
  cookie: string | undefined,
  proto: string | undefined,
  agent: Agent,
  form: TargetForm = 'origin',
  prefix?: string
) {
  const target = requestTarget(action, form, prefix);
  return new Promise<Result>((resolve, reject) => {
    const req = request(
      {
        hostname: '127.0.0.1',
        port,
        path: target,
        agent,
        headers: { ...(cookie ? { cookie } : {}), ...(proto ? { 'x-forwarded-proto': proto } : {}) },
      },
      res => {
        let text = '';
        res.setEncoding('utf8');
        res.on('data', chunk => (text += chunk));
        res.on('aborted', () =>
          resolve({ status: res.statusCode!, complete: false, headers: res.headers, body: {} as Result['body'] })
        );
        res.on('error', error => {
          if (res.complete) reject(error);
        });
        res.on('end', () => {
          try {
            const body = JSON.parse(text);
            if (res.statusCode === 200) {
              assert.equal(body.target, target, 'Application must see the original request target.');
              assert.equal(
                body.sessionPresent,
                Boolean(body.id),
                'Disabled paths must not expose a placeholder session.'
              );
            }
            resolve({ status: res.statusCode!, complete: true, headers: res.headers, body });
          } catch (error) {
            reject(error);
          }
        });
      }
    );
    req.setTimeout(5000, () => req.destroy(new Error('Differential HTTP timeout.')));
    req.on('error', error => {
      if ((error as NodeJS.ErrnoException).code === 'ECONNRESET')
        resolve({ status: 0, complete: false, headers: {}, body: {} as Result['body'] });
      else reject(error);
    });
    req.end();
  });
}

export async function fixture(
  native: boolean,
  settings: Settings,
  execute?: (driver: Driver, database: Db) => Promise<unknown[]>
) {
  const owner = { config: { datastores: { mongodb: { url } } }, log: { warn() {} } };
  const application = new ApplicationRuntime(owner);
  const session: NativeSessionConfiguration = {
    adapter: 'mongo',
    mongoUrl: url!,
    secret,
    name: 'redbox.sid',
    rolling: settings.rolling,
    resave: settings.resave,
    saveUninitialized: settings.saveUninitialized,
    proxy: settings.proxy,
    ttl: settings.ttl,
    touchAfter: settings.touchAfter,
    cookie: {
      ...(settings.sessionCookie ? {} : { maxAge }),
      secure: settings.secure,
      sameSite: settings.sameSite,
      path: '/',
      domain: 'example.test',
      httpOnly: true,
      ...settings.cookie,
    },
  };
  const routePrefixes = new Set(
    ['/scope', '/%73cope', session.cookie?.path || '/scope'].map(prefix => prefix.replace(/\/$/, ''))
  );
  let database!: Db;
  const initialize = async () => {
    database = await mongoDatabase(owner, 'mongodb');
    if (!qualifiedMongo) {
      const { version } = await database.admin().command({ buildInfo: 1 });
      const [major, minor, patch] = String(version).split('.').map(Number);
      assert(major > 9 || (major === 9 && (minor > 0 || patch >= 4)), 'Session differential requires Mongo 9.0.4+.');
      qualifiedMongo = true;
    }
    await database.collection('sessions').deleteMany({});
    await prepareSessionIndexes(owner, { ...session }, 'ensure');
  };
  const host = native
    ? new FastifyHost(application, {
        hostname: '127.0.0.1',
        port: 0,
        owner,
        trustProxy: settings.trust,
        prepare: async app => {
          await initialize();
          await prepareNativeSessions(app, owner, session);
          for (const prefix of routePrefixes)
            for (const action of [...actions, 'sequence'] as const)
              app.get(actionPath(prefix, action), async req => {
                const driver = nativeDriver(req, settings.optionUpdate);
                const events = action === 'sequence' ? await execute!(driver, database) : undefined;
                if (req.session?.sessionId && (action === 'modify' || action === 'modify-save'))
                  req.session.set('value', (req.session.get('value') ?? '') + 'kept');
                if (req.session?.sessionId && (action === 'save' || action === 'modify-save')) await req.session.save();
                if (req.session?.sessionId && action === 'destroy') await req.session.destroy();
                if (req.session?.sessionId && action === 'regenerate') await req.session.regenerate();
                return {
                  value: req.session?.sessionId ? (req.session.get('value') ?? null) : null,
                  id: req.session?.sessionId ?? null,
                  credential: req.session?.encryptedSessionId ?? null,
                  events,
                  target: req.raw.url,
                  sessionPresent: Boolean(req.session),
                };
              });
          app.setErrorHandler((_error, _req, reply) => reply.code(500).send({ error: 'session-failed' }));
        },
      })
    : new ExpressHost(application, {
        hostname: '127.0.0.1',
        port: 0,
        owner,
        trustProxy: settings.trust,
        prepare: async app => {
          await initialize();
          // Exactly the current production composeHttpSession + store configuration.
          // DDL remains the explicit maintenance step above, as in prepareHttpMiddleware.
          const composed = composeHttpSession(
            { ...session, secret, autoRemove: 'disabled', collectionName: 'sessions' },
            owner,
            true
          );
          await composed.ready;
          app.use(composed.middleware);
          for (const prefix of routePrefixes)
            for (const action of [...actions, 'sequence'] as const)
              app.get(actionPath(prefix, action), async (req, res) => {
                const driver = expressDriver(req, settings.optionUpdate);
                const events = action === 'sequence' ? await execute!(driver, database) : undefined;
                if (req.session && (action === 'modify' || action === 'modify-save'))
                  req.session.value = (req.session.value ?? '') + 'kept';
                if (
                  req.session &&
                  (action === 'save' || action === 'modify-save' || action === 'destroy' || action === 'regenerate')
                ) {
                  await new Promise<void>((resolve, reject) =>
                    req.session[action === 'modify-save' ? 'save' : action](error =>
                      error ? reject(error) : resolve()
                    )
                  );
                }
                const id = req.session ? req.sessionID : null;
                res.json({
                  value: req.session?.value ?? null,
                  id,
                  credential: id ? new Signer(secret).sign(id) : null,
                  events,
                  target: req.url,
                  sessionPresent: Boolean(req.session),
                });
              });
          app.use(
            (_error: unknown, _req: Request, res: import('express').Response, _next: import('express').NextFunction) =>
              res.status(500).json({ error: 'session-failed' })
          );
        },
      });
  try {
    await host.initialize();
    await host.activate();
  } catch (error) {
    await host.stop();
    throw error;
  }
  return { host, database, port: host.address()!.port };
}

// Differential normalization list:
// - Random credentials, cutover key namespace/signature and native metadata are
//   mapped to opaque identity continuity. Expiry and application data stay exact.
// - Null/absent/false flags and SameSite true/strict are equivalent cookie forms.
// - ACCEPTED-AUTO-PERSIST-FAILURE (sessionLifecycleDifferential): assert native's
//   complete safe 500/no cookie/no write versus Express's aborted response, then
//   compare storage and caller retries exactly. No other fault is normalized.
export function cookiePayload(cookie: Record<string, unknown>) {
  return {
    expires: cookie.expires ? new Date(String(cookie.expires)).getTime() : null,
    originalMaxAge: cookie.originalMaxAge ?? null,
    path: cookie.path ?? '/',
    domain: cookie.domain || null,
    secure: !!cookie.secure,
    httpOnly: !!cookie.httpOnly,
    sameSite: cookie.sameSite === true ? 'strict' : cookie.sameSite || null,
    partitioned: !!cookie.partitioned,
    priority: cookie.priority ?? null,
  };
}
export function cookieHeaders(headers: IncomingHttpHeaders) {
  return (headers['set-cookie'] ?? []).map(header => {
    const [pair, ...attributes] = header.split(';').map(value => value.trim());
    assert(pair.startsWith('redbox.sid='));
    return attributes.sort();
  });
}

export async function script(native: boolean, settings: Settings, realClock = false) {
  const f = await fixture(native, settings);
  const agent = new Agent({ keepAlive: true });
  const clock = realClock ? undefined : sinon.useFakeTimers({ now: epoch, toFake: ['Date'] });
  const observations: unknown[] = [];
  try {
    for (const existing of realClock ? [true] : [false, true])
      for (const action of realClock ? ['read' as const] : actions) {
        await f.database.collection('sessions').deleteMany({});
        clock?.setSystemTime(epoch);
        const ids = new Map<string, number>();
        const identity = (id: string | null) => {
          if (!id) return null;
          if (!ids.has(id)) ids.set(id, ids.size + 1);
          return ids.get(id);
        };
        let cookie: string | undefined;
        const snapshot = async (result: Result, label: string) => {
          assert.equal(result.status, 200);
          assert(result.complete);
          const id = identity(result.body.id);
          const documents = await f.database.collection<Stored>('sessions').find({}).toArray();
          const stored = documents
            .map(document => {
              const {
                cookie: storedCookie,
                __fastifySessionMetadata: metadata,
                ...data
              } = JSON.parse(document.session);
              return {
                id: identity(native ? metadata.generation : document._id),
                expires: document.expires.getTime(),
                cookie: cookiePayload(storedCookie),
                data,
              };
            })
            .sort((a, b) => a.id! - b.id!);
          for (const header of result.headers['set-cookie'] ?? []) {
            const credential = header.split(';', 1)[0].slice('redbox.sid='.length);
            assert.equal(decodeURIComponent(credential), 's:' + result.body.credential);
          }
          const cookies = cookieHeaders(result.headers);
          observations.push({ existing, action, label, value: result.body.value, id, cookies, stored });
          if (result.headers['set-cookie']?.[0]) cookie = result.headers['set-cookie'][0].split(';', 1)[0];
        };
        if (existing) {
          const seed = await exchange(
            f.port,
            'modify',
            undefined,
            settings.proto,
            agent,
            settings.target,
            settings.cookie?.path || undefined
          );
          await snapshot(seed, 'seed');
          // Exercise a genuine existing cookie even where transport policy suppresses
          // emission; this is a signed credential from this real stack, not a fake store.
          assert(seed.body.credential, 'Existing scenario must have a genuine signed seed cookie.');
          cookie = 'redbox.sid=' + encodeURIComponent('s:' + seed.body.credential);
        }
        if (existing && clock) clock.setSystemTime(epoch + 250);
        await snapshot(await exchange(f.port, action, cookie, settings.proto, agent, settings.target), 'action');
        for (const elapsed of [750, 1500]) {
          if (realClock) await delay(750);
          else clock!.setSystemTime(epoch + elapsed);
          await snapshot(await exchange(f.port, 'read', cookie, settings.proto, agent, settings.target), '+' + elapsed);
        }
      }
    return observations;
  } finally {
    clock?.restore();
    agent.destroy();
    await f.host.stop();
  }
}

export type Method =
  'read' | 'modify' | 'save' | 'reload' | 'touch' | 'resetMaxAge' | 'regenerate' | 'destroy' | 'options';
export interface Driver {
  snapshot(): {
    id: string | null;
    value: string | null;
    cookie: Record<string, unknown> | null;
    lastModified: number | null;
  };
  invoke(method: Method, retry?: boolean): Promise<void>;
}
function driver(
  read: () => object | null | undefined,
  native: boolean,
  options = { maxAge: 1300, partitioned: true, priority: 'high' } as Record<string, unknown>
): Driver {
  let previous: object | null | undefined;
  return {
    snapshot() {
      const session = read();
      const cookie = session && Reflect.get(session, 'cookie');
      const lastModified = session && Reflect.get(session, 'lastModified');
      return {
        id: session ? Reflect.get(session, native ? 'sessionId' : 'id') : null,
        value: session ? (Reflect.get(session, 'value') ?? null) : null,
        cookie: cookie ? cookiePayload(JSON.parse(JSON.stringify(cookie))) : null,
        lastModified: lastModified instanceof Date ? lastModified.getTime() : null,
      };
    },
    async invoke(method, retry = false) {
      const session = read() ?? (retry ? previous : undefined);
      previous = session;
      if (!session) throw new Error('Session absent.');
      if (method === 'read') return;
      if (method === 'modify') {
        Reflect.set(session, 'value', (Reflect.get(session, 'value') ?? '') + 'kept');
        return;
      }
      if (method === 'options') {
        const cookie = Reflect.get(session, 'cookie');
        if (native) Reflect.apply(Reflect.get(session, 'options'), session, [options]);
        else Object.assign(cookie, options);
        assert.strictEqual(Reflect.get(session, 'cookie'), cookie, 'Cookie option updates preserve identity.');
        return;
      }
      const fn = Reflect.get(session, method);
      if (method === 'touch' || method === 'resetMaxAge') {
        Reflect.apply(fn, session, []);
        return;
      }
      await new Promise<void>((resolve, reject) =>
        Reflect.apply(fn, session, [(error?: Error) => (error ? reject(error) : resolve())])
      );
    },
  };
}
function nativeDriver(request: FastifyRequest, options?: Record<string, unknown>): Driver {
  return driver(() => (request.session?.sessionId ? request.session : undefined), true, options);
}
function expressDriver(request: Request, options?: Record<string, unknown>): Driver {
  return driver(() => request.session, false, options);
}
