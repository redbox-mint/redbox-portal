import type { Server, IncomingMessage } from 'node:http';
import { lookup } from 'node:dns';
import type { AddressInfo } from 'node:net';
import type { FastifyInstance, FastifyServerOptions } from 'fastify';
import type { Application } from '../../application';
import type { PersistenceOwner } from '../../persistence/owner';
import { runAcceptedPersistenceWork } from '../../persistence/runtime';
import { beginHttpRequest, registerHttpRequestDrain, runHttpRequestContext } from '../../middleware/requestLifetime';
import { withTimeout } from '../../utilities/withTimeout';
import { createPortalRouter, requestPathname } from './router';
import { requestOwnership } from './requestOwnership';
import { sealPreparation, type FastifyPreparation } from './preparation';
import { HttpRouteRegistry } from './registry';
import { normalizeHttpError, HttpFailure, writeHttpError } from './errorBoundary';
import { drainHttpLogger, httpLogStats, ownerHttpLogger, type HttpLogTarget } from './logging';

export interface FastifyHostOptions {
  readonly hostname: string;
  readonly port: number;
  readonly stopDeadlineMs?: number;
  readonly trustProxy?: FastifyServerOptions['trustProxy'];
  /** The application's persistence owner, when handlers borrow its operations. */
  readonly owner?: PersistenceOwner;
  /** Core-only route ownership and ordered stage binding; never given to extensions. */
  readonly routeRegistry?: HttpRouteRegistry;
  /** Borrowed sink receives fixed codes and query-free paths. External Pino
   * loggers supply their concrete destinations in sources; no Pino symbols. */
  readonly logger?: HttpLogTarget;
  /** Register the complete graph after application initialization. Never listen here.
   * Integrations borrow this server; register their cleanup with the application.
   * Route composition owns the configured root context; probes remain global.
   */
  readonly prepare: (app: FastifyPreparation, server: Server) => Promise<void>;
}

/** Internal, late-listening composition. The production executable still uses Express. */
export class FastifyHost {
  private readonly fastify: FastifyInstance;
  private readonly owner: PersistenceOwner;
  private readonly preparation: FastifyPreparation;
  private readonly routeRegistry: HttpRouteRegistry;
  private initializing?: Promise<void>;
  private activating?: Promise<void>;
  private inFlight?: Promise<void>;
  private closing?: Promise<void>;
  private pluginReadiness?: Promise<void>;
  private applicationStop?: Promise<void>;
  private applicationCleaned = false;
  private readonly requests = new Set<Promise<void>>();
  private stopping?: Promise<void>;
  private prepared = false;
  private activated = false;
  private stopRequested = false;
  private stopped = false;
  private stopFailed = false;
  private failure?: 'initialize' | 'activate';
  private removeSignals?: () => void;

  public constructor(
    private readonly application: Application,
    private readonly options: FastifyHostOptions
  ) {
    if (!Number.isInteger(options.port) || options.port < 0 || options.port > 65535 || !options.hostname)
      throw new TypeError('Fastify host requires an explicit hostname and port (0 is allowed for tests).');
    if (options.stopDeadlineMs !== undefined && !validDeadline(options.stopDeadlineMs))
      throw new TypeError('Host stopDeadlineMs must be a positive timer interval.');
    if (!application.registerHttpHost)
      throw new TypeError(
        'FastifyHost requires application.registerHttpHost for concurrent application/request drain and dependency-safe cleanup. Use ApplicationRuntime.'
      );
    this.owner = application.registerHttpHost(
      {
        quiesce: () => {
          this.activated = false;
        },
        drain: () => this.drainRequests(),
        close: async () => {},
      },
      options.owner
    );
    registerHttpRequestDrain(this.owner, () => this.drainRequests());
    this.routeRegistry = options.routeRegistry ?? new HttpRouteRegistry();
    this.fastify = createPortalRouter(
      {
        trustProxy: options.trustProxy ?? false,
        exposeHeadRoutes: false,
        // A framework plugin timeout cannot cancel its raw acquisition promise.
        // Caller stop deadlines bound waiting while retaining that acquisition.
        pluginTimeout: 0,
        // Keep our admission envelope while close hooks run, until the listener closes.
        return503OnClosing: false,
        forceCloseConnections: false,
      },
      options.logger ?? ownerHttpLogger(this.owner),
      this.owner
    );
    // Integrations may replace Node request listeners (including static scripts).
    // Admission belongs to the owned server, before that entire dispatcher chain.
    const server = this.fastify.server;
    const originalRequest = server.listeners('request')[0];
    const emit = server.emit;
    const admissionFailures = new WeakMap<IncomingMessage, Error>();
    server.emit = (event: string | symbol, ...args: unknown[]) => {
      if (event === 'request' || event === 'upgrade') {
        let ready = false;
        try {
          ready = this.status().ready;
        } catch (error) {
          if (event === 'upgrade') {
            writeHttpError(normalizeHttpError(error), { socket: args[1] as import('node:net').Socket });
            return true;
          }
          // Preserve the ordinary root error writer even if readiness throws
          // only once. Third-party dispatch must still remain behind admission.
          admissionFailures.set(args[0] as IncomingMessage, normalizeHttpError(error));
        }
        if (!ready) {
          if (event === 'request') Reflect.apply(originalRequest, server, args);
          else writeHttpError(new HttpFailure(503), { socket: args[1] as import('node:net').Socket });
          return true;
        }
      }
      return Reflect.apply(emit, server, [event, ...args]);
    };
    // Root hooks precede every prepared plugin, parser, action and fallback. Do not
    // register health routes: native case/slash matching and implicit HEAD differ
    // from the existing exact global GET probe contract.
    this.fastify.addHook('onRequest', async (request, reply) => {
      try {
        const admissionFailure = admissionFailures.get(request.raw);
        admissionFailures.delete(request.raw);
        if (admissionFailure) throw admissionFailure;
        const ready = this.status().ready;
        const path = requestPathname(request.raw.url ?? '/');
        if (request.method === 'GET' && path === this.routeRegistry.probe('healthz')) {
          const healthy = !this.failure && !this.stopFailed && !this.stopped;
          const logging = httpLogStats(this.fastify.log);
          return reply.code(healthy ? 200 : 503).send({ healthy, ...(logging.failures ? { logging } : {}) });
        }
        if (request.method === 'GET' && path === this.routeRegistry.probe('readyz'))
          return reply.code(ready ? 200 : 503).send({ ready });
        if (!ready) return reply.code(503).send({ error: 'application-not-ready' });
      } catch (error) {
        throw normalizeHttpError(error);
      }
    });
    this.fastify.setNotFoundHandler((_request, reply) => reply.code(404).send({ error: 'not-found' }));
    // Callback form keeps Fastify's continuation in the accepted persistence and
    // HTTP contexts. The lease outlives finish/disconnect while actions, session
    // callbacks or explicit follow-ups still own work (trackHttpRequestWork).
    this.fastify.addHook('onRequest', (request, reply, done) => {
      const { promise, resolve } = Promise.withResolvers<void>();
      this.requests.add(promise);
      beginHttpRequest(
        request,
        reply.raw,
        () => {
          this.requests.delete(promise);
          resolve();
        },
        this.owner
      );
      const dispatch = () => {
        runHttpRequestContext(request, () => {
          captureRequest(request, reply, done);
        });
        return promise;
      };
      void runAcceptedPersistenceWork(this.owner, dispatch).catch(() => {
        return reply.code(503).send({ error: 'application-not-ready' });
      });
    });
    const ownership = requestOwnership(this.owner);
    const captureRequest = ownership.capture;
    this.preparation = sealPreparation(this.fastify, ownership, options.trustProxy, this.routeRegistry);
  }

  /** Immutable descriptive snapshots only; no handler, request, router or server capabilities. */
  public registeredRoutes() {
    return this.routeRegistry.snapshot();
  }

  /** Initialize, prepare all plugins and bind one listener with admission still closed. */
  public initialize(): Promise<void> {
    if (this.stopRequested) return Promise.reject(new Error('Host stopped; construct a fresh host.'));
    if (this.initializing) return this.initializing;
    const work = Promise.resolve().then(async () => {
      this.assertRunning();
      await this.application.initialize();
      this.assertRunning();
      await runAcceptedPersistenceWork(this.owner, async () => {
        try {
          await this.options.prepare(this.preparation, this.fastify.server);
          this.assertRunning();
          await this.settlePlugins();
          this.assertRunning();
        } finally {
          // Even a failed prepare may have queued plugins. Their acquisition is
          // part of this accepted stage, including persistence access after stop.
          await this.settlePlugins().catch(() => {});
        }
      });
      this.prepared = true;
      // Fastify creates secondary servers for a literal 'localhost' listen host.
      // Resolve once to one address, preserving Node's resolver order and Fastify's
      // own server configuration. Stop still owns this asynchronous startup work.
      const hostname = await new Promise<string>((resolve, reject) => {
        lookup(this.options.hostname, (error, address) => (error ? reject(error) : resolve(address)));
      });
      this.assertRunning();
      await this.fastify.listen({ port: this.options.port, host: hostname });
      this.assertRunning();
    });
    this.inFlight = work;
    return (this.initializing = work.catch(error => this.failed(error, 'initialize')));
  }

  public activate(): Promise<void> {
    if (this.stopRequested) return Promise.reject(new Error('Host stopped; construct a fresh host.'));
    if (this.activating) return this.activating;
    if (!this.prepared || !this.fastify.server.listening)
      return Promise.reject(new Error('Await host initialization before activation.'));
    const work = Promise.resolve().then(async () => {
      this.assertRunning();
      await this.application.activate();
      this.assertRunning();
      this.activated = true;
    });
    this.inFlight = work;
    return (this.activating = work.catch(error => this.failed(error, 'activate')));
  }

  public stop(options: { deadlineMs?: number } = {}): Promise<void> {
    if (this.stopping) return this.stopping;
    if (this.stopped) return Promise.resolve();
    const deadlineMs = options.deadlineMs ?? this.options.stopDeadlineMs ?? 30_000;
    if (!validDeadline(deadlineMs))
      return Promise.reject(new TypeError('Host stop deadlineMs must be a positive integer.'));
    this.stopRequested = true;
    let quiesceFailure: unknown;
    try {
      this.application.quiesce?.();
    } catch (error) {
      quiesceFailure = error;
    }
    const deadline = Date.now() + deadlineMs;
    const attempt = Promise.resolve().then(async () => {
      // Wait for raw stage work, never its failure handler (which can await stop).
      // In particular, partial preparation may still use initialized collaborators.
      await this.withDeadline(this.inFlight?.catch(() => {}) ?? Promise.resolve(), deadline);
      // close() itself boots queued plugins. Settle that acquisition first so it
      // cannot race application cleanup after interrupted/failed prepare().
      await this.withDeadline(
        this.settlePlugins().catch(() => {}),
        deadline
      );
      this.closing ??= this.closeTransport();
      const cleanup = (async () => {
        if (quiesceFailure) throw quiesceFailure;
        // Caller timeouts do not cancel an existing cleanup. Join it before an
        // explicit retry; never restart cleanup automatically after this deadline.
        await this.withDeadline(this.applicationStop?.catch(() => {}) ?? Promise.resolve(), deadline);
        // Application-owned producer drains and registered HTTP request drain
        // start together, including when options.owner was omitted.
        if (Date.now() >= deadline) throw stopDeadlineError();
        if (!this.applicationCleaned) {
          this.applicationStop = Promise.resolve().then(async () => {
            await this.application.stop({ deadlineMs: Math.max(1, deadline - Date.now()), deadline });
            this.applicationCleaned = true;
          });
          await this.applicationStop;
        }
      })();
      // A rejected transport close must not prevent retrying application cleanup.
      // Conversely an application failure never authorizes another Fastify close.
      await this.withDeadline(
        (async () => {
          const outcomes = await Promise.allSettled([this.closing, cleanup]);
          const errors = outcomes.filter(result => result.status === 'rejected').map(result => result.reason);
          if (errors.length === 1) throw errors[0];
          if (errors.length) throw new AggregateError(errors, 'Transport and application cleanup failed.');
        })(),
        deadline
      );
      this.stopped = true;
      this.stopFailed = false;
      this.removeSignals?.();
    });
    const result = attempt.catch(error => {
      this.stopFailed = true;
      throw error;
    });
    this.stopping = result;
    const settled = () => {
      if (this.stopping === result) this.stopping = undefined;
    };
    void result.then(settled, settled);
    return result;
  }

  public address(): AddressInfo | null {
    const address = this.fastify.server.address();
    return typeof address === 'object' ? address : null;
  }

  public status() {
    return {
      ready: this.activated && !this.stopRequested && !this.failure && this.application.status().ready,
      listening: this.fastify.server.listening,
      prepared: this.prepared,
      stopped: this.stopped,
      stopFailed: this.stopFailed,
      failure: this.failure,
      application: this.application.status(),
      logging: httpLogStats(this.fastify.log),
    };
  }

  /** Explicit executable boundary. Imports/construction install no process handlers. */
  public installSignalHandlers(callbacks: { onStopped(): void; onError(error: unknown): void }): () => void {
    if (this.removeSignals) return this.removeSignals;
    if (this.stopRequested) throw new Error('Cannot attach signals after host stop begins.');
    let handling = false;
    const stop = () => {
      if (handling) return;
      handling = true;
      void this.stop().then(
        () => {
          handling = false;
          callbacks.onStopped();
        },
        error => {
          handling = false;
          callbacks.onError(error);
        }
      );
    };
    process.on('SIGINT', stop);
    process.on('SIGTERM', stop);
    // A retained remover must not clear handlers installed by a later opt-in.
    const remove = () => {
      process.off('SIGINT', stop);
      process.off('SIGTERM', stop);
      if (this.removeSignals === remove) this.removeSignals = undefined;
    };
    this.removeSignals = remove;
    return remove;
  }

  private assertRunning(): void {
    if (this.stopRequested) throw new Error('Host stop has begun.');
  }

  private settlePlugins(): Promise<void> {
    return (this.pluginReadiness ??= Promise.resolve(this.fastify.ready()).then(() => {}));
  }

  private async drainRequests(): Promise<void> {
    while (this.requests.size) await Promise.allSettled(this.requests);
    await drainHttpLogger(this.fastify.log);
    // Native close reaps connections idle at its start. A request accepted
    // earlier can become idle afterwards, including after a stop deadline.
    // Reap only after native close starts and owned response work drains.
    // A pending preClose hook must still permit pipelined admission refusals.
    if (this.stopRequested && !this.fastify.server.listening) this.fastify.server.closeIdleConnections();
  }

  private async closeTransport(): Promise<void> {
    const server = this.fastify.server;
    const close = server.close;
    let transportError: Error | undefined;
    // Fastify 5.12.8 discards native server.close callback errors. Observe that
    // boundary ourselves while leaving Fastify as the sole close/hook owner.
    // ERR_SERVER_NOT_RUNNING is expected for stop before late listening.
    server.close = function (callback) {
      return close.call(this, (error?: NodeJS.ErrnoException) => {
        if (error && error.code !== 'ERR_SERVER_NOT_RUNNING') transportError = error;
        callback?.(error);
      });
    };
    try {
      await this.fastify.close();
    } catch (error) {
      if (transportError) throw new AggregateError([transportError, error], 'Transport close failed.');
      throw error;
    } finally {
      server.close = close;
    }
    if (transportError) throw transportError;
  }

  private async failed(error: unknown, phase: 'initialize' | 'activate'): Promise<never> {
    this.failure = phase;
    // Admission closes before cleanup; retain the original startup failure even
    // if cleanup fails. A caller-initiated stop must not trigger an implicit retry.
    if (!this.stopRequested) await this.stop().catch(() => {});
    throw error;
  }

  private async withDeadline(work: Promise<void>, deadline: number): Promise<void> {
    await withTimeout(work, Math.max(0, deadline - Date.now()), stopDeadlineError);
  }
}

function validDeadline(value: number): boolean {
  return Number.isSafeInteger(value) && value > 0 && value <= 2_147_483_647;
}

function stopDeadlineError(): Error {
  return new Error('Host stop deadline exceeded; resources remain owned. Retry stop.');
}
