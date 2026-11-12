import { isOwnedReadStream } from './readStreams';
import { bindMultipartRequestView } from './rawMultipart';
import { bindCompanionRequestView } from '../integrations/companion/fastify';
import { AsyncLocalStorage } from 'node:async_hooks';
import type { FastifyReply, FastifyRequest } from 'fastify';
import {
  hasActiveHttpRequest,
  runHttpRequestContext,
  runHttpRequestWork,
  trackHttpRequestWork,
} from '../../middleware/requestLifetime';
import type { PersistenceOwner } from '../../persistence/owner';
import { bindAcceptedPersistenceContext } from '../../persistence/runtime';
import {
  normalizeHttpError,
  writeHttpError,
  httpSendState,
  beginHttpErrorHandler,
  registerHttpReplyView,
  httpReplySubmitted,
  isEmptyHttpErrorPayload,
} from './errorBoundary';

// Preserve arity and AsyncFunction classification for Fastify's signature checks.
export const requestHooks = [
  'onRequest',
  'preParsing',
  'preValidation',
  'preHandler',
  'preSerialization',
  'onSend',
  'onResponse',
  'onError',
  'onTimeout',
  'onRequestAbort',
] as const;
type Callable = (...args: never[]) => unknown;

// Union of Fastify's send, body-discard and generated-HEAD producer predicates.
// Bare async iterables are not consumed by Fastify 5.12.8.
function payloadType(payload: unknown) {
  if (payload == null) return 'empty';
  const value = payload as { pipe?: unknown; resume?: unknown; getReader?: unknown; buffer?: unknown };
  if (typeof value.pipe === 'function' || typeof value.resume === 'function') return 'node-stream';
  if (typeof value.getReader === 'function') return 'web-stream';
  if (typeof payload === 'object' && Object.prototype.toString.call(payload) === '[object Response]') return 'response';
  if (value.buffer instanceof ArrayBuffer) return 'bytes';
  return typeof payload === 'string' ? 'string' : 'object';
}
function sendPayload(payload: unknown) {
  if (!isOwnedReadStream(payload) && ['node-stream', 'web-stream', 'response'].includes(payloadType(payload)))
    throw new TypeError('send(stream/Response) requires a qualified module with drain/hijack.');
  return payload;
}

/** One lifetime adapter per sealed host. @internal */
export function requestOwnership(owner: PersistenceOwner) {
  const contexts = new WeakMap<FastifyRequest, ReturnType<typeof bindAcceptedPersistenceContext>>();
  const replies = new WeakMap<FastifyRequest, FastifyReply>();
  const current = new AsyncLocalStorage<FastifyRequest>();
  const wrapped = new WeakSet<Callable>();
  const publicObjects = new WeakMap<object, object>();
  const nativeObjects = new WeakMap<object, object>();
  const snapshots = new WeakMap<object, unknown>();
  function publicValue(value: unknown): unknown {
    const capability = preparation(value);
    if (capability !== value) return capability;
    return value && typeof value === 'object' ? (publicObjects.get(value) ?? value) : value;
  }
  const nativeValue = (value: unknown) =>
    value && typeof value === 'object' ? (nativeObjects.get(value) ?? value) : value;
  // Snapshot metadata; request data and callback arguments stay native.
  function metadata(value: unknown): unknown {
    const capability = publicValue(value);
    if (capability !== value || !value || !['object', 'function'].includes(typeof value)) return capability;
    if (snapshots.has(value)) return snapshots.get(value);
    if (typeof value === 'function')
      return new Proxy(value, { apply: (fn, receiver, args) => metadata(Reflect.apply(fn, receiver, args)) });
    if (![Object.prototype, null].includes(Object.getPrototypeOf(value)) && !Array.isArray(value)) return value;
    const copy = Array.isArray(value) ? [] : Object.create(null);
    snapshots.set(value, copy);
    for (const key of Object.keys(value)) Reflect.set(copy, key, metadata((value as Record<string, unknown>)[key]));
    return Object.freeze(copy);
  }
  const methodsFor = {
    request: 'getValidationFunction compileValidationSchema validateInput getDecorator setDecorator',
    session: 'save reload regenerate destroy touch resetMaxAge options get set isModified isSaved isPersisted',
    reply:
      'code status send header headers getHeader getHeaders removeHeader hasHeader redirect writeEarlyHints hijack ' +
      'callNotFound type serializer serialize getSerializationFunction compileSerializationSchema serializeInput then trailer hasTrailer removeTrailer getDecorator',
    raw: 'writeHead write end destroy emit listenerCount',
    log: 'trace debug info warn error fatal silent bindings',
    signal: 'throwIfAborted',
  };
  type Kind = keyof typeof methodsFor;
  function publicView<T extends object>(target: T, kind: Kind): T {
    const cached = publicObjects.get(target);
    if (cached) return cached as T;
    const methods = new Map<PropertyKey, Callable>();
    const methodNames = methodsFor[kind].split(' ');
    // Accessors may return a method before its named property is ever read.
    // Re-enter the same view path so every handle retains that method's adapter.
    const methodView = (value: unknown) => {
      if (typeof value !== 'function') return undefined;
      const name = methodNames.find(name => Reflect.get(target, name, target) === value);
      return name === undefined ? undefined : read(name);
    };
    const denied = (key: PropertyKey): never => {
      throw new TypeError(`Fastify cannot replace/use ${kind}.${String(key)}; use owned hooks/module drains.`);
    };
    const protectedKey = (key: PropertyKey) => {
      if (key === 'log') return true;
      const value = Reflect.get(target, key, target);
      return typeof key === 'symbol' || typeof value === 'function' || publicValue(value) !== value;
    };
    const write = (key: PropertyKey, value: unknown) => {
      if (kind === 'signal' || protectedKey(key)) denied(key);
      return Reflect.set(target, key, value, target);
    };
    const read = (key: string | symbol): unknown => {
      if (typeof key === 'symbol') {
        if (key === Symbol.for('@researchdatabox/redbox-core/http-request-lifetime/v1'))
          return Reflect.get(target, key, target);
        if (key === Symbol.asyncIterator && kind === 'raw') denied(key);
        return undefined;
      }
      const value = Reflect.get(target, key, target);
      if (key === 'routeOptions') return metadata(value);
      if (kind === 'request' && key === 'session' && value && typeof value === 'object')
        return publicView(value, 'session');
      if (value && key === 'log') return publicView(value, 'log');
      if (value && key === 'signal') return publicView(value, 'signal');
      if (typeof value !== 'function') return publicValue(value);
      if (!methodNames.includes(key)) {
        const method = methodView(value);
        if (method) return method;
        if (['request', 'reply'].includes(kind) && Object.hasOwn(target, key)) return value;
        denied(key);
      }
      if (methods.has(key)) return methods.get(key);
      const guarded = new Proxy(value, {
        apply(fn, _receiver, args) {
          if (
            (kind === 'raw' || key === 'writeEarlyHints') &&
            args.some(value => typeof value === 'function' || value?.then)
          )
            denied(key);
          if (key === 'setDecorator' && protectedKey(args[0])) denied(key);
          if (key === 'serializer') args[0] = handler(args[0], -1);
          if (key === 'trailer') args[1] = wrap(args[1], 0, true);
          // Native Session methods may finish through a callback whose returned
          // work is independent of the store callback and transport completion.
          if (kind === 'session' && ['save', 'reload', 'regenerate', 'destroy'].includes(key))
            args = args.map(value => (typeof value === 'function' ? wrap(value, -1) : value));
          const result = Reflect.apply(fn, target, args);
          if (key === 'getDecorator')
            return typeof result === 'function' || ['routeOptions', 'log', 'signal', 'session'].includes(args[0])
              ? read(args[0])
              : publicValue(result);
          if (typeof result === 'function')
            return methodView(result) ?? (key.includes('Serialization') ? handler(result, -1) : wrap(result, -1));
          if (key === 'validateInput' && result?.then) trackHttpRequestWork(target, result);
          if (['serialize', 'serializeInput'].includes(key)) sendPayload(result);
          return kind === 'log' ? metadata(result) : publicValue(result);
        },
      });
      methods.set(key, guarded as Callable);
      return guarded;
    };
    const view = new Proxy(Object.create(null), {
      get: (_object, key) => read(key),
      set: (_object, key, value) => write(key, value),
      ownKeys: () => Object.getOwnPropertyNames(target),
      getOwnPropertyDescriptor(_object, key) {
        const descriptor = typeof key === 'string' && Object.getOwnPropertyDescriptor(target, key);
        return descriptor ? { enumerable: descriptor.enumerable, configurable: true, value: read(key) } : undefined;
      },
      has: (_object, key) => typeof key === 'string' && Reflect.has(target, key),
      getPrototypeOf: () => null,
      setPrototypeOf: () => denied('__proto__'),
      defineProperty: (_object, key) => denied(key),
      deleteProperty: (_object, key) => {
        if (kind === 'session' && !protectedKey(key)) return Reflect.deleteProperty(target, key);
        return denied('property deletion');
      },
      preventExtensions: () => false,
    });
    publicObjects.set(target, view);
    publicObjects.set(view, view);
    nativeObjects.set(view, target);
    if (kind === 'reply') registerHttpReplyView(target as FastifyReply, view);
    return view;
  }
  let preparation: (instance: unknown) => unknown;
  function wrap<T>(
    fn: T,
    requestIndex = 0,
    callback = false,
    shortCircuit = false,
    outgoing = false,
    native = false
  ): T {
    if (typeof fn !== 'function' || wrapped.has(fn as Callable)) return fn;
    const proxy = new Proxy(fn as Callable, {
      apply(target, receiver, args) {
        // The core's bounded empty-denial stream is framing, not application
        // data. Preserve the absent-entity hook contract and keep that stream
        // private; every application-provided replacement still passes the
        // ordinary producer guard before reaching Fastify.
        const emptyDenial = outgoing && isEmptyHttpErrorPayload(args[2]) ? args[2] : undefined;
        if (emptyDenial) args[2] = undefined;
        const candidate = nativeValue(args[requestIndex]?.request ?? args[requestIndex]);
        const request =
          candidate && typeof candidate === 'object' && Reflect.get(candidate, 'raw')
            ? (candidate as FastifyRequest)
            : current.getStore();
        const context = request && contexts.get(request);
        // Probes, malformed targets and closed admission skip prepared domain hooks.
        if (!request || !context || !runHttpRequestContext(request, () => hasActiveHttpRequest(owner))) {
          const done = args.at(-1);
          if (callback && typeof done === 'function') {
            return args.length === 4 ? done(null, args[2]) : done();
          }
          if (requestIndex === 1) {
            // No admitted context exists for prepared work. Even this early
            // error must bypass serializers/send hooks and the default parent.
            return writeHttpError(normalizeHttpError(args[0]), { request: args[1], reply: args[2] });
          }
          return args.length >= 3 ? args[2] : undefined;
        }
        const reply = replies.get(request);
        let generation = reply && httpSendState(reply).generation;
        const nativeDone = callback && outgoing && typeof args.at(-1) === 'function' ? args.at(-1) : undefined;
        let continued = false;
        if (nativeDone)
          args[args.length - 1] = function (this: unknown, ...values: unknown[]) {
            if (continued) return;
            continued = true;
            // A hijacked/committed response owns its bytes. Never resume a stale
            // Fastify send pipeline after a concurrent failure or raw completion.
            if (reply?.sent || reply?.raw.headersSent || (reply && httpSendState(reply).generation !== generation))
              return;
            if (values[0]) values[0] = normalizeHttpError(values[0]);
            try {
              return Reflect.apply(nativeDone, this, values);
            } catch (error) {
              // Native continuation work (for example writeHead) may throw too.
              // It must never become an unhandled promise from our callback.
              if (reply) writeHttpError(normalizeHttpError(error), { request, reply });
            }
          };
        const failed = (error: unknown) => {
          if (
            continued ||
            reply?.sent ||
            reply?.raw.headersSent ||
            (reply && httpSendState(reply).generation !== generation)
          ) {
            reply?.log.error('HTTP_POST_SEND_FAILURE');
            return undefined;
          }
          throw normalizeHttpError(error);
        };
        const handoff = (value: unknown) => {
          const result = nativeValue(value);
          // An async hook's owned callback continuation can see this restored
          // core payload a second time; the application never receives it.
          if (emptyDenial && result === emptyDenial) return result;
          if (shortCircuit && !outgoing && reply && httpReplySubmitted(reply)) return reply;
          // Undefined keeps a hook's existing payload, including in-place changes.
          const payload = result === undefined && callback && args.length === 4 ? args[2] : result;
          if (outgoing) sendPayload(payload);
          if (emptyDenial && payload !== undefined) reply?.removeHeader('Transfer-Encoding');
          if (outgoing && !callback && reply?.sent && result !== undefined && result !== reply) {
            reply.log.warn('HTTP_DUPLICATE_SEND');
            return undefined;
          }
          return emptyDenial && payload === undefined ? emptyDenial : result;
        };
        const invoke = () =>
          current.run(request, () =>
            runHttpRequestWork(request, () => {
              let release: (() => void) | undefined;
              const response = (args[1] as FastifyReply)?.raw;
              if (callback && target.constructor.name !== 'AsyncFunction' && typeof args.at(-1) === 'function') {
                const lease = Promise.withResolvers<void>();
                trackHttpRequestWork(request, lease.promise);
                const done = args.at(-1);
                const disconnected = () => {
                  if ((args[1] as FastifyReply)?.sent) release!();
                };
                release = () => {
                  response?.off('finish', release!);
                  response?.off('close', disconnected);
                  lease.resolve();
                };
                args[args.length - 1] = function (this: unknown, ...values: unknown[]) {
                  try {
                    if (!values[0] && shortCircuit && !outgoing && reply && httpReplySubmitted(reply)) return reply;
                    if (args.length === 4) {
                      if (outgoing && !values[0]) {
                        try {
                          values[1] = handoff(values[1]);
                        } catch (error) {
                          values = [error];
                        }
                      } else values[1] = nativeValue(values[1]);
                    }
                    return Reflect.apply(done, this, values);
                  } finally {
                    release!();
                  }
                };
                // Pre-response hooks may send/hijack without done(); post-response hooks must complete.
                if (shortCircuit) {
                  const reply = args[1] as FastifyReply;
                  reply?.raw?.once('finish', release);
                  reply?.raw?.once('close', disconnected);
                }
              }
              try {
                if (requestIndex === 1) {
                  args[0] = normalizeHttpError(args[0]);
                  if (reply) {
                    beginHttpErrorHandler(reply);
                    generation = httpSendState(reply).generation;
                  }
                }
                // Only pinned, qualified framework plugins receive native objects.
                // Application hooks always receive capability views.
                const result = Reflect.apply(
                  target,
                  native ? receiver : publicValue(receiver),
                  native ? args : args.map(publicValue)
                );
                // Returned promises settle both callback leases and request work.
                if (release && result && typeof result.then === 'function')
                  void Promise.resolve(result).then(release, release);
                // Return native capabilities only to Fastify.
                return result && typeof result.then === 'function'
                  ? Promise.resolve(result).then(handoff).catch(failed)
                  : callback
                    ? nativeValue(result)
                    : handoff(result);
              } catch (error) {
                release?.();
                return failed(error);
              }
            })
          );
        const result = context(invoke);
        if (nativeDone) {
          // Retain the original async work, but own the native continuation.
          // Fastify must not also resume it through its promise hook runner.
          if (result && typeof (result as PromiseLike<unknown>).then === 'function')
            void Promise.resolve(result).then(
              value => {
                if (!continued) args.at(-1)(null, value);
              },
              error => {
                if (!continued) args.at(-1)(normalizeHttpError(error));
              }
            );
          return undefined;
        }
        return result;
      },
    });
    wrapped.add(proxy);
    return proxy as T;
  }
  function handler<T>(fn: T, requestIndex = 0): T {
    return wrap(fn, requestIndex, false, false, true);
  }
  function hook(name: string, fn: unknown) {
    if (name === 'onError' && typeof fn === 'function')
      fn = new Proxy(fn, {
        apply(target, receiver, args) {
          args[2] = normalizeHttpError(args[2]);
          return Reflect.apply(target, receiver, args);
        },
      });
    return wrap(
      fn,
      0,
      true,
      !['onResponse', 'onError', 'onTimeout', 'onRequestAbort'].includes(name),
      ['onSend', 'preSerialization'].includes(name)
    );
  }
  function hooks(options: Record<string, unknown>) {
    for (const name of requestHooks) {
      const value = options[name];
      const adapt = (fn: unknown) => hook(name, fn);
      if (value !== undefined) options[name] = Array.isArray(value) ? value.map(adapt) : adapt(value);
    }
    if (options.errorHandler) options.errorHandler = handler(options.errorHandler, 1);
  }
  const capture = (request: FastifyRequest, reply: FastifyReply, done: () => void) => {
    replies.set(request, reply);
    bindMultipartRequestView(request, publicView(request, 'request'));
    bindCompanionRequestView(request, reply, publicView(request, 'request'));
    publicView(reply, 'reply');
    for (const transport of [request.raw, reply.raw, request.raw.socket]) publicView(transport, 'raw');
    contexts.set(request, bindAcceptedPersistenceContext(owner));
    const send = reply.send;
    reply.send = function (payload: unknown) {
      sendPayload(payload);
      if (reply.sent) {
        reply.log.warn('HTTP_DUPLICATE_SEND');
        return reply;
      }
      if (payload && typeof (payload as PromiseLike<unknown>).then === 'function')
        trackHttpRequestWork(
          request,
          Promise.resolve(payload).catch(() => {
            reply.log.error('HTTP_POST_SEND_FAILURE');
          })
        );
      return send.call(this, payload);
    };
    const then = reply.then;
    reply.then = function (fulfilled, rejected) {
      const lease = Promise.withResolvers<void>();
      trackHttpRequestWork(request, lease.promise);
      const completion = (fn: unknown) =>
        function (this: unknown, ...values: unknown[]) {
          try {
            const invoke = () => Reflect.apply(fn as Callable, publicValue(this), values.map(publicValue));
            const result = contexts.get(request)!(() =>
              current.run(request, () => runHttpRequestWork(request, invoke))
            );
            void Promise.resolve(result).then(lease.resolve, () => {
              runHttpRequestContext(request, () => reply.log.error('HTTP_REPLY_CALLBACK_FAILED'));
              lease.resolve();
            });
            return result;
          } catch {
            runHttpRequestContext(request, () => reply.log.error('HTTP_REPLY_CALLBACK_FAILED'));
            lease.resolve();
          }
        };
      try {
        const onError = rejected ?? (() => reply.log.warn('HTTP_REPLY_REJECTED'));
        return then.call(this, completion(fulfilled), completion(onError));
      } catch (error) {
        lease.resolve();
        throw error;
      }
    };
    current.run(request, done);
  };
  return {
    capture,
    wrap,
    handler,
    hook,
    nativeHook: (name: string, fn: unknown) =>
      wrap(
        fn,
        0,
        true,
        !['onResponse', 'onError', 'onTimeout', 'onRequestAbort'].includes(name),
        name === 'onSend',
        true
      ),
    hooks,
    preserve: (value: object) => publicObjects.set(value, value),
    bindPreparation: (view: typeof preparation) => {
      preparation = view;
    },
  };
}
