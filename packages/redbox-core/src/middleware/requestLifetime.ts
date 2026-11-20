import type { ServerResponse } from 'node:http';
import { AsyncLocalStorage } from 'node:async_hooks';

interface RequestLifetime {
  app?: object;
  transportDone: boolean;
  responseEnded: boolean;
  callbackPending: boolean;
  dispatching: number;
  active: Set<Promise<unknown>>;
  completed: boolean;
  queued: boolean;
  completions: Set<() => void>;
  check: () => void;
}

interface HttpOwner {
  context: AsyncLocalStorage<RequestLifetime>;
  drain?: () => Promise<void>;
}
const ownerKey: unique symbol = Symbol.for('@researchdatabox/redbox-core/http-request-owner/v1');
type Application = { [ownerKey]?: HttpOwner };
function owner(app: object): HttpOwner {
  const holder = app as Application;
  if (!holder[ownerKey])
    Object.defineProperty(holder, ownerKey, { value: { context: new AsyncLocalStorage<RequestLifetime>() } });
  return holder[ownerKey]!;
}

/** Queue shutdown must quiesce HTTP producers before finishing enqueue drain. */
export function registerHttpRequestDrain(app: object, drain: () => Promise<void>): void {
  owner(app).drain = drain;
}
export function drainHttpRequests(app: object): Promise<void> {
  return owner(app).drain?.() ?? Promise.resolve();
}
/** Only the still-owned request's asynchronous descendants can finish enqueues. */
export function hasActiveHttpRequest(app: object): boolean {
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

/** Core integration alias: the provider borrows the same accepted request lease. */
export function linkHttpRequestLifetime(request: object, alias: object): void {
  const state = lifetime(request);
  if (!state || state.completed) throw new Error('Integration requires an active HTTP lifetime.');
  const existing = lifetime(alias);
  if (existing && existing !== state) throw new Error('HTTP lifetime belongs to a different request.');
  if (!existing) Object.defineProperty(alias, key, { value: state });
}
function promiseLike(value: unknown): value is PromiseLike<unknown> {
  return (
    value !== null &&
    (typeof value === 'object' || typeof value === 'function') &&
    typeof Reflect.get(value, 'then') === 'function'
  );
}

/** Own transport and controller work separately: a disconnected client does not cancel a write. */
export function beginHttpRequest(request: object, response: ServerResponse, complete: () => void, app?: object): void {
  const existing = lifetime(request);
  if (existing) {
    if (app && existing.app !== app) throw new Error('HTTP lifetime belongs to a different application.');
    if (existing.completed) complete();
    else existing.completions.add(complete);
    return;
  }
  const state: RequestLifetime = {
    app,
    transportDone: false,
    responseEnded: false,
    callbackPending: false,
    dispatching: 0,
    active: new Set(),
    completed: false,
    queued: false,
    completions: new Set([complete]),
    check: () => {},
  };
  Object.defineProperty(request, key, { value: state });
  const canComplete = () =>
    state.transportDone && !state.callbackPending && state.dispatching === 0 && state.active.size === 0;
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
      for (const completion of state.completions) completion();
      state.completions.clear();
    });
  };
  response.once('finish', transportDone);
  response.once('close', transportDone);
  const originalEnd = response.end;
  // Companion retains callback dispatch until its provider reaches the native
  // response end, including when no finish event follows an abort.
  response.end = function (this: ServerResponse, ...args: unknown[]) {
    try {
      return Reflect.apply(originalEnd, this, args);
    } finally {
      state.responseEnded = true;
      state.callbackPending = false;
      state.check();
    }
  } as ServerResponse['end'];
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
export function retainHttpRequestFollowup(app: object, work: Promise<void>): Promise<void> {
  const state = owner(app).context.getStore();
  if (!state || state.completed) return work;
  ownWork(state, work);
  return Promise.resolve();
}

/** Native request entry points retain returned asynchronous work. @internal */
export function runHttpRequestWork<T>(request: unknown, invoke: () => T): T {
  const state = lifetime(request);
  if (!state || state.completed) return invoke();
  state.dispatching++;
  try {
    const result = runHttpRequestContext(request, invoke);
    if (promiseLike(result)) ownWork(state, result);
    return result;
  } finally {
    state.dispatching--;
    state.check();
  }
}
