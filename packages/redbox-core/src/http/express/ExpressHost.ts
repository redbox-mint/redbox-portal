import type { PersistenceOwner } from '../../persistence/owner';
import { registerPersistenceResource, runAcceptedPersistenceWork } from '../../persistence/runtime';
import { beginHttpRequest, registerHttpRequestDrain, runHttpRequestContext } from '../../middleware/requestLifetime';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import express, { type Router } from 'express';
import type { Application } from '../../application';

export interface ExpressHostOptions {
  readonly port: number;
  readonly stopDeadlineMs?: number;
  /** Supply the same owner as the application when handlers use persistence. */
  readonly owner?: PersistenceOwner;
  readonly hostname: string;
  /** Partial composition only. Register acquired integration cleanup with the application owner. */
  readonly prepare: (router: Router, server: Server) => Promise<void>;
}

/** One listener and one runtime. No discovery, legacy dispatch or production config defaults. */
export class ExpressHost {
  private readonly requests = new Set<Promise<void>>();
  private readonly server: Server;
  private readonly router = express.Router();
  private initializing?: Promise<void>;
  private activating?: Promise<void>;
  private binding?: Promise<void>;
  private closing?: Promise<void>;
  private activated = false;
  private inFlight?: Promise<void>;
  private stopping?: Promise<void>;
  private prepared = false;
  private stopRequested = false;
  private stopDuringStartup?: boolean;
  private stopped = false;
  private stopFailed = false;
  private failure?: 'initialize' | 'activate';
  private removeSignals?: () => void;

  public constructor(
    private readonly application: Application,
    private readonly options: ExpressHostOptions
  ) {
    if (!Number.isInteger(options.port) || options.port < 0 || options.port > 65535 || !options.hostname)
      throw new TypeError('Express host requires an explicit hostname and port (0 is allowed for tests).');
    if (
      options.stopDeadlineMs !== undefined &&
      (!Number.isSafeInteger(options.stopDeadlineMs) ||
        options.stopDeadlineMs <= 0 ||
        options.stopDeadlineMs > 2_147_483_647)
    )
      throw new TypeError('Host stopDeadlineMs must be a positive timer interval.');
    const app = express();
    app.disable('x-powered-by');
    app.use((req, res, next) => {
      const ready = this.status().ready;
      if (req.method === 'GET' && req.path === '/readyz') {
        res.status(ready ? 200 : 503).json({ ready });
      } else if (!ready) {
        res.status(503).json({ error: 'application-not-ready' });
      } else next();
    });
    const drainRequests = async () => {
      while (this.requests.size) await Promise.allSettled(this.requests);
    };
    if (options.owner) {
      registerHttpRequestDrain(options.owner, drainRequests);
      registerPersistenceResource(options.owner, 'http-requests', {
        quiesce: () => {
          this.stopRequested = true;
        },
        drain: drainRequests,
        close: async () => {},
      });
    }
    app.use((req, res, next) => {
      const { promise, resolve } = Promise.withResolvers<void>();
      this.requests.add(promise);
      beginHttpRequest(
        req,
        res,
        () => {
          this.requests.delete(promise);
          resolve();
        },
        options.owner
      );
      const dispatch = () => {
        runHttpRequestContext(req, next);
        return promise;
      };
      if (options.owner)
        void runAcceptedPersistenceWork(options.owner, dispatch).catch(() => {
          if (!res.headersSent) res.status(503).json({ error: 'application-not-ready' });
        });
      else dispatch();
    });
    app.use(this.router);
    app.use((_req, res) => {
      res.status(404).json({ error: 'not-found' });
    });
    this.server = createServer(app);
  }

  public initialize(): Promise<void> {
    if (this.stopRequested) return Promise.reject(new Error('Host stopped; construct a fresh host.'));
    if (this.initializing) return this.initializing;
    const work = Promise.resolve().then(async () => {
      this.assertRunning();
      // Some integrations need a bound server during preparation. The gate is
      // already installed and remains closed until explicit runtime activation.
      this.binding = new Promise<void>((resolve, reject) => {
        const fail = (error: Error) => {
          this.server.off('listening', listening);
          reject(error);
        };
        const listening = () => {
          this.server.off('error', fail);
          resolve();
        };
        this.server.once('error', fail);
        this.server.once('listening', listening);
        this.server.listen(this.options.port, this.options.hostname);
      });
      await this.binding;
      this.assertRunning();
      await this.application.initialize();
      this.assertRunning();
      await this.options.prepare(this.router, this.server);
      this.assertRunning();
      this.prepared = true;
    });
    this.inFlight = work;
    return (this.initializing = work.catch(error => this.failed(error, 'initialize')));
  }

  public activate(): Promise<void> {
    if (this.stopRequested) return Promise.reject(new Error('Host stopped; construct a fresh host.'));
    if (this.activating) return this.activating;
    if (!this.prepared) return Promise.reject(new Error('Await host initialization before activation.'));
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
    if (!Number.isSafeInteger(deadlineMs) || deadlineMs <= 0 || deadlineMs > 2_147_483_647)
      return Promise.reject(new TypeError('Host stop deadlineMs must be a positive integer.'));
    this.stopDuringStartup ??= !this.application.status().ready;
    this.stopRequested = true;
    let quiesceFailure: unknown;
    try {
      this.application.quiesce?.();
    } catch (error) {
      quiesceFailure = error;
    }
    const deadline = Date.now() + deadlineMs;
    // Owned request work participates in application drain. Older nonpersistent
    // test hosts still wait for transport closure before releasing their modules.
    const earlyStop = this.options.owner || this.stopDuringStartup ? this.application.stop(options) : undefined;
    // Observe immediately even if preparation is still pending.
    void earlyStop?.catch(() => {});
    const drainAcceptedRequests = async () => {
      while (this.requests.size) await Promise.allSettled(this.requests);
    };
    const attempt = Promise.resolve().then(async () => {
      await this.withDeadline(this.inFlight?.catch(() => {}) ?? Promise.resolve(), deadline);
      this.closing ??= new Promise<void>((resolve, reject) => {
        if (!this.server.listening) {
          resolve();
          return;
        }
        this.server.close(error => (error ? reject(error) : resolve()));
      });
      await this.withDeadline(this.closing, deadline);
      await this.withDeadline(drainAcceptedRequests(), deadline);
      if (quiesceFailure) throw quiesceFailure;
      await this.withDeadline(
        earlyStop ?? this.application.stop({ deadlineMs: Math.max(1, deadline - Date.now()) }),
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
    const address = this.server.address();
    return typeof address === 'object' ? address : null;
  }

  public status() {
    return {
      ready: this.activated && !this.stopRequested && this.application.status().ready,
      listening: this.server.listening,
      prepared: this.prepared,
      stopped: this.stopped,
      stopFailed: this.stopFailed,
      failure: this.failure,
      application: this.application.status(),
    };
  }

  /** Opt in at the executable host boundary; domain imports install no handlers. */
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
    this.removeSignals = () => {
      process.off('SIGINT', stop);
      process.off('SIGTERM', stop);
      this.removeSignals = undefined;
    };
    return this.removeSignals;
  }

  private assertRunning(): void {
    if (this.stopRequested) throw new Error('Host stop has begun.');
  }

  private async failed(error: unknown, phase: 'initialize' | 'activate'): Promise<never> {
    this.failure = phase;
    if (!this.stopRequested) await this.stop().catch(() => {});
    throw error;
  }

  private async withDeadline(work: Promise<void>, deadline: number): Promise<void> {
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      await Promise.race([
        work,
        new Promise<never>((_resolve, reject) => {
          timer = setTimeout(
            () => reject(new Error('Host stop deadline exceeded; resources remain owned. Retry stop.')),
            Math.max(0, deadline - Date.now())
          );
        }),
      ]);
    } finally {
      clearTimeout(timer);
    }
  }
}
