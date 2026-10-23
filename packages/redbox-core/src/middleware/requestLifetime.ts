import type { Response } from 'express';
import { AsyncLocalStorage } from 'node:async_hooks';

interface RequestLifetime {
  app?: Sails.Application;
  transportDone: boolean;
  responseEnded: boolean;
  responsePending: boolean;
  callbackPending: boolean;
  dispatching: number;
  active: Set<Promise<unknown>>;
  completed: boolean;
  queued: boolean;
  check: () => void;
}

interface HttpOwner {
  context: AsyncLocalStorage<RequestLifetime>;
  drain?: () => Promise<void>;
}
const ownerKey: unique symbol = Symbol.for('@researchdatabox/redbox-core/http-request-owner/v1');
type Application = Sails.Application & { [ownerKey]?: HttpOwner };
function owner(app: Sails.Application): HttpOwner {
  const holder = app as Application;
  if (!holder[ownerKey]) Object.defineProperty(holder, ownerKey, { value: { context: new AsyncLocalStorage<RequestLifetime>() } });
  return holder[ownerKey]!;
}

/** Queue shutdown must quiesce HTTP producers before finishing enqueue drain. */
export function registerHttpRequestDrain(app: Sails.Application, drain: () => Promise<void>): void {
  owner(app).drain = drain;
}
export function drainHttpRequests(app: Sails.Application): Promise<void> {
  return owner(app).drain?.() ?? Promise.resolve();
}
/** Only the still-owned request's asynchronous descendants can finish enqueues. */
export function hasActiveHttpRequest(app: Sails.Application): boolean {
  return owner(app).context.getStore()?.completed === false;
}
export function runHttpRequestContext<T>(request: unknown, invoke: () => T): T {
  const state = lifetime(request);
  return state?.app ? owner(state.app).context.run(state, invoke) : invoke();
}

// Source and built core can coexist in development; both must see one lifetime.
const key: unique symbol = Symbol.for('@researchdatabox/redbox-core/http-request-lifetime/v1');
type RequestOwner = { [key]?: RequestLifetime };
function lifetime(request: unknown): RequestLifetime | undefined {
  return request && typeof request === 'object' ? (request as RequestOwner)[key] : undefined;
}
function promiseLike(value: unknown): value is PromiseLike<unknown> {
  return (
    value !== null &&
    (typeof value === 'object' || typeof value === 'function') &&
    typeof Reflect.get(value, 'then') === 'function'
  );
}

/** Own transport and controller work separately: a disconnected client does not cancel a write. */
export function beginHttpRequest(request: object, response: Response, complete: () => void, app?: Sails.Application): void {
  const state: RequestLifetime = {
    app,
    transportDone: false,
    responseEnded: false,
    responsePending: false,
    callbackPending: false,
    dispatching: 0,
    active: new Set(),
    completed: false,
    queued: false,
    check: () => {},
  };
  Object.defineProperty(request, key, { value: state });
  const canComplete = () =>
    state.transportDone &&
    !state.responsePending &&
    !state.callbackPending &&
    state.dispatching === 0 &&
    state.active.size === 0;
  const transportDone = () => {
    state.transportDone = true;
    state.check();
  };
  state.check = () => {
    if (state.completed || state.queued || !canComplete()) return;
    state.queued = true;
    // A callback can register background work immediately after ending its response.
    queueMicrotask(() => {
      state.queued = false;
      if (state.completed || !canComplete()) return;
      state.completed = true;
      response.removeListener('finish', transportDone);
      response.removeListener('close', transportDone);
      complete();
    });
  };
  response.once('finish', transportDone);
  response.once('close', transportDone);
  const originalEnd = response.end;
  // Install before express-session. Its saved-session callback reaches this end
  // only after the session write, including when no finish event follows an abort.
  response.end = function (this: Response, ...args: unknown[]) {
    try {
      return Reflect.apply(originalEnd, this, args);
    } finally {
      state.responseEnded = true;
      state.responsePending = false;
      state.callbackPending = false;
      state.check();
    }
  } as Response['end'];
}

/** Response middleware retains its own callback independently of action errors. */
export function retainHttpResponse(request: unknown): void {
  const state = lifetime(request);
  if (state && !state.completed && !state.responseEnded) state.responsePending = true;
}

/** A failed end attempt has no response handoff; dispatched store callbacks own their work separately. */
export function failHttpResponse(request: unknown): void {
  const state = lifetime(request);
  if (state) {
    // express-session makes its end wrapper terminal before serialization or
    // dispatch. An error response retry cannot acquire a second handoff.
    state.responseEnded = true;
    state.responsePending = false;
    state.callbackPending = false;
    state.check();
  }
}

/** An async action that hands its response to a callback must declare that handoff. */
export function retainHttpCallback(request: unknown): void {
  const state = lifetime(request);
  if (state && !state.completed && !state.responseEnded) state.callbackPending = true;
}

function ownWork(state: RequestLifetime, work: PromiseLike<unknown>, failed?: () => void): void {
  const pending = Promise.resolve(work);
  state.active.add(pending);
  const settled = () => {
    state.active.delete(pending);
    state.check();
  };
  void pending.then(settled, () => {
    failed?.();
    settled();
  });
}

/** Track explicitly detached work without changing its result or error. */
export function trackHttpRequestWork<T>(request: unknown, work: PromiseLike<T>): PromiseLike<T> {
  const state = lifetime(request);
  if (state && !state.completed) ownWork(state, work);
  return work;
}

/** Optional follow-ups retain HTTP shutdown ownership without delaying the response.
 * Workers and direct callers still await their completion in their existing scope.
 */
export function retainHttpRequestFollowup(app: Sails.Application, work: Promise<void>): Promise<void> {
  const state = owner(app).context.getStore();
  if (!state || state.completed) return work;
  ownWork(state, work);
  return Promise.resolve();
}

/** Called by exported core controllers; non-HTTP direct calls retain their ordinary behavior. */
export function runHttpRequestHandler<T>(request: unknown, invoke: () => T): T | undefined {
  const state = lifetime(request);
  if (!state) return invoke();
  // Static/policy responses may finish or disconnect before controller dispatch.
  // Do not start a controller after its accepted request has already been released.
  if (state.completed) return undefined;
  state.dispatching++;
  try {
    const result = runHttpRequestContext(request, invoke);
    if (promiseLike(result)) {
      ownWork(state, result, () => {
        state.callbackPending = false;
      });
    } else if (!state.responseEnded) {
      // This includes returned RxJS subscriptions. An outer subscription can
      // complete while a nested subscription or async next callback still runs.
      state.callbackPending = true;
    }
    return result;
  } catch (error) {
    state.callbackPending = false;
    throw error;
  } finally {
    state.dispatching--;
    state.check();
  }
}
