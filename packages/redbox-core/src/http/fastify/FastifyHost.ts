import type { Server } from 'node:http';
import { lookup } from 'node:dns';
import type { AddressInfo } from 'node:net';
import type { FastifyInstance, FastifyServerOptions } from 'fastify';
import type { Application } from '../../application';
import { withTimeout } from '../../utilities/withTimeout';
import { createPortalRouter, requestPathname } from './router';

export interface FastifyHostOptions {
  readonly hostname: string;
  readonly port: number;
  readonly stopDeadlineMs?: number;
  readonly trustProxy?: FastifyServerOptions['trustProxy'];
  /** Register the complete graph after application initialization. Never listen here.
   * Integrations borrow this server; register their cleanup with the application.
   * Route composition owns the configured root context; probes remain global.
   */
  readonly prepare: (app: FastifyInstance, server: Server) => Promise<void>;
}

/** Internal, late-listening composition. The production executable still uses Express. */
export class FastifyHost {
  private readonly fastify: FastifyInstance;
  private initializing?: Promise<void>;
  private activating?: Promise<void>;
  private inFlight?: Promise<void>;
  private closing?: Promise<void>;
  private applicationStop?: Promise<void>;
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
    this.fastify = createPortalRouter({
      trustProxy: options.trustProxy ?? false,
      exposeHeadRoutes: false,
      // Keep our admission envelope while close hooks run, until the listener closes.
      return503OnClosing: false,
      forceCloseConnections: false,
    });
    // Root hooks precede every prepared plugin, parser, action and fallback. Do not
    // register health routes: native case/slash matching and implicit HEAD differ
    // from the existing exact global GET probe contract.
    this.fastify.addHook('onRequest', async (request, reply) => {
      const ready = this.status().ready;
      const path = requestPathname(request.raw.url ?? '/');
      if (request.method === 'GET' && path === '/healthz') {
        const healthy = !this.failure && !this.stopFailed && !this.stopped;
        return reply.code(healthy ? 200 : 503).send({ healthy });
      }
      if (request.method === 'GET' && path === '/readyz') return reply.code(ready ? 200 : 503).send({ ready });
      if (!ready) return reply.code(503).send({ error: 'application-not-ready' });
    });
    this.fastify.setNotFoundHandler((_request, reply) => reply.code(404).send({ error: 'not-found' }));
  }

  /** Initialize, prepare all plugins and bind one listener with admission still closed. */
  public initialize(): Promise<void> {
    if (this.stopRequested) return Promise.reject(new Error('Host stopped; construct a fresh host.'));
    if (this.initializing) return this.initializing;
    const work = Promise.resolve().then(async () => {
      this.assertRunning();
      await this.application.initialize();
      this.assertRunning();
      await this.options.prepare(this.fastify, this.fastify.server);
      this.assertRunning();
      await this.fastify.ready();
      this.assertRunning();
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
      this.closing ??= this.fastify.close();
      await this.withDeadline(this.closing, deadline);
      if (quiesceFailure) throw quiesceFailure;
      // A caller deadline does not cancel an earlier application stop attempt.
      await this.withDeadline(this.applicationStop?.catch(() => {}) ?? Promise.resolve(), deadline);
      if (Date.now() >= deadline) throw stopDeadlineError();
      this.applicationStop = this.application.stop({ deadlineMs: Math.max(1, deadline - Date.now()) });
      await this.withDeadline(this.applicationStop, deadline);
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
