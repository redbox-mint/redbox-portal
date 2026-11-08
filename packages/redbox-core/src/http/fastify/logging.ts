import type { FastifyBaseLogger } from 'fastify';
import { EventEmitter } from 'node:events';
import { Worker } from 'node:worker_threads';
import { writeSync } from 'node:fs';
import type { PersistenceOwner } from '../../persistence/owner';
import { runAcceptedPersistenceWork } from '../../persistence/runtime';
import { retainHttpRequestFollowup } from '../../middleware/requestLifetime';
import { pinoLoggerDestinations } from '../../utilities/PinoLoggerUtils';

export interface HttpLogRecord {
  readonly code: string;
  readonly level: 'trace' | 'debug' | 'info' | 'warn' | 'error' | 'fatal' | 'silent';
  readonly path?: string;
}
export type HttpLogSink = (record: Readonly<HttpLogRecord>) => unknown;
/** Opaque callback destinations must declare their streams at composition time. */
export type HttpLogTarget =
  | HttpLogSink
  | {
      readonly write: HttpLogSink;
      readonly sources: readonly unknown[];
    };
/** Shared explicit production selection and low-level host default. */
export function ownerHttpLogger(owner: PersistenceOwner): HttpLogTarget {
  return {
    sources: pinoLoggerDestinations(owner.log),
    write: record => {
      if (['warn', 'error', 'fatal'].includes(record.level)) return owner.log.warn(record.code);
    },
  };
}
export const httpLogFallbackIntervalMs = 30_000;
const codes = new Set([
  'HTTP_REQUEST_FAILED',
  'HTTP_OBSERVATION_FAILED',
  'HTTP_POST_SEND_FAILURE',
  'HTTP_DUPLICATE_SEND',
  'HTTP_REPLY_CALLBACK_FAILED',
  'HTTP_REPLY_REJECTED',
]);
type FailureClass = 'SINK' | 'STREAM' | 'WORKER';
type Counts = {
  failures: number;
  diagnostics: number;
  dropped: number;
  degraded: boolean;
  fallbackWrites: number;
  fallbackFailures: number;
};
type Observer = { failed(source: EventEmitter, kind: FailureClass): void };
type Control = { counts: Counts; pending: Set<Promise<void>>; check(): void; drain(): Promise<void> };
const controls = new WeakMap<object, Control>();
// Keep one listener for the destination's lifetime, including delayed errors after
// host stop. Weak observers neither retain stopped hosts nor accumulate listeners.
const destinations = new WeakMap<EventEmitter, { failed: boolean; observers: Set<WeakRef<Observer>> }>();

function containDestination(source: EventEmitter, observer: Observer) {
  let state = destinations.get(source);
  if (!state) {
    const created = { failed: false, observers: new Set<WeakRef<Observer>>() };
    state = created;
    destinations.set(source, state);
    const failed = (kind: FailureClass) => {
      created.failed = true;
      for (const observer of created.observers) {
        const listener = observer.deref();
        if (!listener) created.observers.delete(observer);
        else listener.failed(source, kind);
      }
    };
    // Never format, retain, re-emit or log the event's exception.
    source.on('error', () => failed(source instanceof Worker ? 'WORKER' : 'STREAM'));
    source.on('close', () => failed('STREAM'));
    source.on('finish', () => failed('STREAM'));
    if (source instanceof Worker) source.on('exit', () => failed('WORKER'));
  }
  for (const reference of state.observers) {
    const listener = reference.deref();
    if (!listener) state.observers.delete(reference);
    else if (listener === observer) return;
  }
  state.observers.add(new WeakRef(observer));
  if (state.failed) observer.failed(source, source instanceof Worker ? 'WORKER' : 'STREAM');
}

/** Observe concrete destinations supplied by composition, including multistream,
 * pipes and transport workers. Never inspect Pino logger internals or symbols. */
function containSources(
  sources: readonly unknown[],
  observed: Set<EventEmitter>,
  observer: Observer,
  connections: [object, unknown][]
) {
  const pending = [...sources];
  const seen = new Set<object>();
  while (pending.length) {
    const source = pending.pop();
    if (!source || typeof source !== 'object' || seen.has(source)) continue;
    seen.add(source);
    if (source instanceof EventEmitter) {
      observed.add(source);
      containDestination(source, observer);
    }
    const worker = Reflect.get(source, 'worker');
    if (worker instanceof Worker) pending.push(worker);
    const streams = Reflect.get(source, 'streams');
    if (Array.isArray(streams)) for (const entry of streams) if (entry?.stream) pending.push(entry.stream);
    const pipes = Reflect.get(source, '_readableState')?.pipes;
    if (Array.isArray(pipes)) {
      pending.push(...pipes);
      for (const destination of pipes) connections.push([source, destination]);
    }
  }
}

/** The only logger supplied to Fastify, including all child/internal log calls. */
export function createHttpLogger(target?: HttpLogTarget, owner?: PersistenceOwner): FastifyBaseLogger {
  const counts: Counts = {
    failures: 0,
    diagnostics: 0,
    dropped: 0,
    degraded: false,
    fallbackWrites: 0,
    fallbackFailures: 0,
  };
  const pending = new Set<Promise<void>>();
  const observed = new Set<EventEmitter>();
  const connections: [object, unknown][] = [];
  let closed = false;
  const fallbackAt = new Map<FailureClass, number>();
  let failureClass: FailureClass = 'SINK';
  const fallback = (kind: FailureClass) => {
    const now = Date.now();
    if (now >= (fallbackAt.get(kind) ?? -Infinity)) {
      fallbackAt.set(kind, now + httpLogFallbackIntervalMs);
      // A synchronous fd write cannot emit an unhandled stderr stream error.
      // Never interpolate the caught value, a URL, or any request-derived data.
      try {
        writeSync(2, `HTTP_LOG_${kind}_FAILURE\n`);
        counts.fallbackWrites++;
      } catch {
        counts.fallbackFailures++;
      }
    }
  };
  const fail = (kind: FailureClass) => {
    counts.failures++;
    counts.degraded = true;
    failureClass = kind;
    fallback(kind);
  };
  const observer: Observer = {
    failed: (source, kind) => {
      if (observed.has(source)) fail(kind);
    },
  };
  if (target && typeof target !== 'function') containSources(target.sources, observed, observer, connections);
  const track = (work: Promise<void>) => {
    pending.add(work);
    if (owner) void retainHttpRequestFollowup(owner, work);
    void work.then(() => pending.delete(work));
  };
  const write = (record: Readonly<HttpLogRecord>) => (typeof target === 'function' ? target : target?.write)?.(record);
  const available = () =>
    connections.every(([source, destination]) => Reflect.get(source, '_readableState')?.pipes?.includes(destination)) &&
    [...observed].every(
      source =>
        !destinations.get(source)?.failed &&
        !Reflect.get(source, 'destroyed') &&
        !Reflect.get(source, 'closed') &&
        !Reflect.get(source, 'errored') &&
        !Reflect.get(source, 'writableErrored') &&
        Reflect.get(source, 'writable') !== false &&
        !Reflect.get(source, 'writableEnded') &&
        !Reflect.get(source, 'writableFinished') &&
        !(source instanceof Worker && (source.threadId === -1 || Reflect.get(source, 'exited')))
    );
  const check = () => {
    if (!closed && !available()) fail('STREAM');
  };
  const logger: Record<string, unknown> = { level: 'info' };
  for (const level of ['trace', 'debug', 'info', 'warn', 'error', 'fatal', 'silent'] as const)
    logger[level] = (...args: unknown[]) => {
      counts.diagnostics++;
      check();
      if (counts.degraded || closed) {
        counts.dropped++;
        if (!closed) fallback(failureClass);
        return;
      }
      try {
        // Never format arguments, exceptions or bindings. Only known fixed codes
        // and a query-free path may cross the transport boundary.
        const code = args.find(value => typeof value === 'string' && codes.has(value)) as string | undefined;
        const first = args[0];
        const req = first && typeof first === 'object' ? Reflect.get(first, 'req') : undefined;
        const url = req && typeof req === 'object' ? Reflect.get(req, 'url') : undefined;
        const path = typeof url === 'string' && url.startsWith('/') ? url.split(/[?#]/, 1)[0] : undefined;
        const record = Object.freeze({ code: code ?? 'HTTP_DIAGNOSTIC', level, ...(path ? { path } : {}) });
        const result = owner ? runAcceptedPersistenceWork(owner, () => Promise.resolve(write(record))) : write(record);
        if (result && typeof (result as PromiseLike<unknown>).then === 'function')
          track(
            Promise.resolve(result).then(
              () => {},
              () => fail('SINK')
            )
          );
      } catch {
        fail('SINK');
      }
    };
  logger.child = () => logger;
  logger.bindings = () => Object.freeze({});
  controls.set(logger, {
    counts,
    pending,
    check,
    drain: async () => {
      closed = true;
      while (pending.size) await Promise.all(pending);
    },
  });
  return Object.freeze(logger) as unknown as FastifyBaseLogger;
}

/** Read-only internal instrumentation; transports and caught values never escape. */
export function httpLogStats(logger: object) {
  const control = controls.get(logger);
  control?.check();
  return Object.freeze({
    ...(control?.counts ?? {
      failures: 0,
      diagnostics: 0,
      dropped: 0,
      degraded: false,
      fallbackWrites: 0,
      fallbackFailures: 0,
    }),
    pending: control?.pending.size ?? 0,
  });
}

export function drainHttpLogger(logger: object): Promise<void> {
  return controls.get(logger)?.drain() ?? Promise.resolve();
}
