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
  if (['node-stream', 'web-stream', 'response'].includes(payloadType(payload)))
    throw new TypeError('send(stream/Response) requires a qualified module with drain/hijack.');
  return payload;
}

/** One lifetime adapter per sealed host. @internal */
export function requestOwnership(owner: PersistenceOwner) {
  const contexts = new WeakMap<FastifyRequest, ReturnType<typeof bindAcceptedPersistenceContext>>();
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
    const denied = (key: PropertyKey): never => {
      throw new TypeError(`Fastify cannot replace/use ${kind}.${String(key)}; use owned hooks/module drains.`);
    };
    const protectedKey = (key: PropertyKey) => {
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
      if (value && key === 'log') return publicView(value, 'log');
      if (value && key === 'signal') return publicView(value, 'signal');
      if (typeof value !== 'function') return publicValue(value);
      if (!methodsFor[kind].split(' ').includes(key)) {
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
          const result = Reflect.apply(fn, target, args);
          if (key === 'getDecorator')
            return typeof result === 'function' || ['routeOptions', 'log', 'signal'].includes(args[0])
              ? read(args[0])
              : publicValue(result);
          if (typeof result === 'function')
            return key.includes('Serialization') ? handler(result, -1) : wrap(result, -1);
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
      deleteProperty: () => denied('property deletion'),
      preventExtensions: () => false,
    });
    publicObjects.set(target, view);
    publicObjects.set(view, view);
    nativeObjects.set(view, target);
    return view;
  }
  let preparation: (instance: unknown) => unknown;
  function wrap<T>(fn: T, requestIndex = 0, callback = false, shortCircuit = false, outgoing = false): T {
    if (typeof fn !== 'function' || wrapped.has(fn as Callable)) return fn;
    const proxy = new Proxy(fn as Callable, {
      apply(target, receiver, args) {
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
            const reply = args[2] as FastifyReply;
            return reply.code(500).send({ error: 'internal-server-error' });
          }
          return args.length >= 3 ? args[2] : undefined;
        }
        const handoff = (value: unknown) => {
          const native = nativeValue(value);
          // Undefined keeps a hook's existing payload, including in-place changes.
          if (outgoing) sendPayload(native === undefined && callback && args.length === 4 ? args[2] : native);
          return native;
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
                const result = Reflect.apply(target, publicValue(receiver), args.map(publicValue));
                // Returned promises settle both callback leases and request work.
                if (release && result && typeof result.then === 'function')
                  void Promise.resolve(result).then(release, release);
                // Return native capabilities only to Fastify.
                return result && typeof result.then === 'function'
                  ? Promise.resolve(result).then(handoff)
                  : callback
                    ? nativeValue(result)
                    : handoff(result);
              } catch (error) {
                release?.();
                throw error;
              }
            })
          );
        return context(invoke);
      },
    });
    wrapped.add(proxy);
    return proxy as T;
  }
  function handler<T>(fn: T, requestIndex = 0): T {
    return wrap(fn, requestIndex, false, false, true);
  }
  function hook(name: string, fn: unknown) {
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
    publicView(request, 'request');
    publicView(reply, 'reply');
    for (const transport of [request.raw, reply.raw, request.raw.socket]) publicView(transport, 'raw');
    contexts.set(request, bindAcceptedPersistenceContext(owner));
    const send = reply.send;
    reply.send = function (payload: unknown) {
      sendPayload(payload);
      if (payload && typeof (payload as PromiseLike<unknown>).then === 'function')
        trackHttpRequestWork(request, payload as PromiseLike<unknown>);
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
            void Promise.resolve(result).then(lease.resolve, error => {
              reply.log.error({ err: error }, 'reply.then callback failed');
              lease.resolve();
            });
            return result;
          } catch (error) {
            lease.resolve();
            throw error;
          }
        };
      try {
        const onError = rejected ?? (() => reply.log.warn('unhandled rejection on reply.then'));
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
    hooks,
    preserve: (value: object) => publicObjects.set(value, value),
    bindPreparation: (view: typeof preparation) => {
      preparation = view;
    },
  };
}
