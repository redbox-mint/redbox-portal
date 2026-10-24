import { createServer, type Server, type IncomingMessage } from 'node:http';
import type { Duplex } from 'node:stream';
import { mkdir, access } from 'node:fs/promises';
import { constants } from 'node:fs';
import type { Request, Response, NextFunction, Router, RequestHandler } from 'express';
import { json, urlencoded } from 'express';
import type * as Companion from '@uppy/companion';
import type { PersistenceOwner } from '../../persistence/owner';
import { registerPersistenceResource } from '../../persistence/runtime';
import { beginHttpRequest, trackHttpRequestWork } from '../../middleware/requestLifetime';
import { bindHttpPolicies, pilotPolicyChain, requestContext, resolveEffectivePolicies } from './policies';
import type { PoliciesConfig } from '../../config/policies.config';
import type { createHttpCsrf } from './csrf';
import { httpAction } from './middleware';
import type { AuthenticatedActor } from './identity';
import { buildCompanionSendTokenHtml } from './companionSendToken';

type ProviderOptions = Parameters<typeof Companion.app>[0];
type Provider = ReturnType<typeof Companion.app>;
const processOwner = Symbol.for('@researchdatabox/redbox-core/companion-process-owner/v1');
const pathPattern = /^(?:\/[A-Za-z0-9_-]+)+$/;
export interface CompanionInput {
  owner: PersistenceOwner;
  /** Called only from host.prepare/application initialize, never from a request. */
  options: Omit<ProviderOptions, 'metrics' | 'redisUrl' | 'redisOptions' | 'periodicPingUrls'> & { metrics: boolean };
  /** Mount relative to rootContext; options.server describes the canonical external URL. */
  path: string;
  origins: readonly string[];
  isReady(): boolean;
}

/** One process-wide provider, owned by its application. Uses only Companion's public app/socket/emitter APIs. */
export class CompanionUploads {
  private initializing?: Promise<void>;
  private server?: Server;
  private dedicated?: Server;
  private provider?: Provider;
  private closing = false;
  private closed = false;
  private terminated = false;
  private readonly requests = new Map<Promise<void>, Duplex>();
  private readonly sockets = new Map<Duplex, Promise<void>>();
  private readonly transfers = new Map<string, { finish(): void; start(): void }>();
  private readonly socketPath: string;

  constructor(private readonly input: CompanionInput) {
    const { options } = input;
    if (!pathPattern.test(input.path) || !pathPattern.test(options.server.path ?? ''))
      throw new TypeError('Companion requires normalized explicit mount and server paths.');
    this.socketPath = (options.server.implicitPath ?? '') + options.server.path;
    if (!pathPattern.test(this.socketPath) || typeof options.metrics !== 'boolean')
      throw new TypeError('Companion requires an explicit metrics setting and normalized external path.');
    if (
      options.secret.length < 32 ||
      !input.origins.length ||
      input.origins.some(origin => URL.parse(origin)?.origin !== origin)
    )
      throw new TypeError('Companion requires a secret of at least 32 characters and canonical origins.');
    if (!input.options.uploadUrls?.length)
      throw new TypeError('Companion requires an explicit nonempty upload destination allowlist.');
    // These optional process-wide services expose no public close handle in 7.1.1.
    if (
      Reflect.get(options, 'redisUrl') ||
      Reflect.get(options, 'redisOptions') ||
      Reflect.get(options, 'periodicPingUrls')?.length
    )
      throw new TypeError('Owned Companion does not support Redis or periodic pings.');
  }

  initialize(server: Server): Promise<void> {
    if (this.server && this.server !== server)
      return Promise.reject(new Error('Companion already attached to another host.'));
    if (this.closing) return Promise.reject(new Error('Companion has stopped; start a fresh process.'));
    if (this.initializing) return this.initializing;
    this.server = server;
    registerPersistenceResource(this.input.owner, 'companion-uploads', this);
    return (this.initializing = this.prepare(server));
  }

  private async prepare(server: Server): Promise<void> {
    await mkdir(this.input.options.filePath, { recursive: true });
    await access(this.input.options.filePath, constants.R_OK | constants.W_OK);
    const companion: typeof Companion = await import('@uppy/companion');
    if (this.closing) throw new Error('Companion stopped during initialization.');
    if (Reflect.get(globalThis, processOwner))
      throw new Error(
        'Only one Companion app() is supported per process. Start a separate process for another application.'
      );
    // Never reset this guard: the provider keeps shared emitter/cron state after close.
    Reflect.set(globalThis, processOwner, this);
    this.provider = companion.app({ ...this.input.options, corsOrigins: [...this.input.origins] });
    this.provider.emitter.on('upload-start', this.started);
    this.dedicated = createServer(); // Deliberately never listens on a port.
    // The real host already parsed the upgrade. Make our unlistened bridge
    // event-only: Node's ordinary HTTP connection parser must not parse ws frames.
    this.dedicated.removeAllListeners('connection');
    this.dedicated.on('connection', (socket: Duplex) => {
      const { promise, resolve } = Promise.withResolvers<void>();
      this.sockets.set(socket, promise);
      socket.once('close', () => {
        this.sockets.delete(socket);
        resolve();
      });
      socket.on('error', () => {});
    });
    companion.socket(this.dedicated, this.input.options);
    server.on('upgrade', this.upgrade);
  }

  private readonly upgrade = (req: IncomingMessage, socket: Duplex, head: Buffer): void => {
    const path = URL.parse(req.url ?? '', 'http://companion.invalid')?.pathname;
    if (!path?.startsWith(this.socketPath + '/')) return;
    const relative = path.slice(this.socketPath.length);
    const upload = /^\/api\/([^/]+)$/.exec(relative);
    const callback = /^\/api2\/auth-callback\/token\/[A-Za-z0-9_-]{16,256}$/.test(relative);
    const allowed = (upload && this.transfers.has(upload[1]!)) || callback;
    if (
      this.closing ||
      !this.input.isReady() ||
      !allowed ||
      typeof req.headers.origin !== 'string' ||
      !this.input.origins.includes(req.headers.origin)
    ) {
      socket.end('HTTP/1.1 403 Forbidden\r\nConnection: close\r\nContent-Length: 0\r\n\r\n', () => socket.destroy());
      return;
    }
    this.dedicated!.emit('connection', socket);
    this.dedicated!.emit('upgrade', req, socket, head);
  };

  handle(req: Request, res: Response, next: NextFunction): void {
    if (this.closing || !this.provider || !this.input.isReady()) {
      res.status(503).end();
      return;
    }
    const { promise, resolve } = Promise.withResolvers<void>();
    this.requests.set(promise, req.socket);
    beginHttpRequest(
      req,
      res,
      () => {
        this.requests.delete(promise);
        resolve();
      },
      this.input.owner
    );
    // Companion forks transfers before returning { token }. Retain that request's
    // existing completion scope until its public terminal event or the stop deadline.
    const json = res.json;
    res.json = (body: unknown) => {
      const token = body && typeof body === 'object' ? Reflect.get(body, 'token') : undefined;
      if (
        req.method === 'POST' &&
        /\/get(?:\/[^/]+)?$/.test(req.path) &&
        res.statusCode < 400 &&
        typeof token === 'string'
      )
        this.retainTransfer(req, token);
      return json.call(res, body);
    };
    const original = req.url;
    req.url = req.url.slice(this.input.path.length) || '/';
    this.provider.app(req, res, error => {
      req.url = original;
      next(error);
    });
  }

  private retainTransfer(req: Request, token: string): void {
    // A provider callback can return after its transport was destroyed at the
    // deadline. It must not acquire another completion scope or timer then.
    if (this.terminated || this.transfers.has(token)) return;
    const { promise, resolve } = Promise.withResolvers<void>();
    // awaitReady times out without a terminal upload event when no client connects.
    const connectTimeout = setTimeout(() => finish(), this.input.options.clientSocketConnectTimeout ?? 60_000);
    const terminal = (...args: unknown[]) => {
      const event = args[0];
      if (event && typeof event === 'object' && ['success', 'error'].includes(String(Reflect.get(event, 'action'))))
        finish();
    };
    const finish = () => {
      clearTimeout(connectTimeout);
      this.provider!.emitter.removeListener(token, terminal);
      this.transfers.delete(token);
      resolve();
    };
    this.transfers.set(token, { finish, start: () => clearTimeout(connectTimeout) });
    this.provider!.emitter.on(token, terminal);
    trackHttpRequestWork(req, promise);
  }

  private readonly started = (...args: unknown[]): void => {
    const event = args[0];
    const token = event && typeof event === 'object' ? Reflect.get(event, 'token') : undefined;
    if (typeof token === 'string') this.transfers.get(token)?.start();
  };

  quiesce(): void {
    this.closing = true;
  }

  async drain(options: { deadline?: number } = {}): Promise<void> {
    this.quiesce();
    const deadline = options.deadline ?? Date.now() + 30_000;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const expired = new Promise<void>(resolve => {
      timer = setTimeout(
        () => {
          this.terminate();
          resolve();
        },
        Math.max(0, deadline - Date.now())
      );
    });
    try {
      while (this.requests.size || this.sockets.size) {
        await Promise.race([expired, ...this.requests.keys(), ...this.sockets.values()]);
        if (Date.now() >= deadline) break;
      }
    } finally {
      clearTimeout(timer);
    }
  }

  private terminate(): void {
    this.terminated = true;
    for (const socket of this.sockets.keys()) socket.destroy();
    for (const socket of this.requests.values()) socket.destroy();
    for (const transfer of this.transfers.values()) transfer.finish();
  }

  async close(): Promise<void> {
    if (this.closed) return;
    this.quiesce();
    this.terminate();
    this.provider?.emitter.removeListener('upload-start', this.started);
    this.server?.off('upgrade', this.upgrade);
    if (this.dedicated)
      await new Promise<void>((resolve, reject) => {
        // An unlistened Server still emits close, which closes Companion's ws owner.
        this.dedicated!.close(error => {
          if (error && Reflect.get(error, 'code') !== 'ERR_SERVER_NOT_RUNNING') reject(error);
          else resolve();
        });
      });
    this.closed = true;
  }
}

/** Preserve the unbranded provider URL using trusted session/deployment brand selection. */
export function mountCompanionRoutes(
  router: Router,
  input: {
    uploads: CompanionUploads;
    path: string;
    /** Canonical browser destination supplied by the application, never request headers. */
    appUrl?: string;
    context(req: Request): { branding: string; portal: string } | undefined;
    policies: Readonly<Record<string, RequestHandler>>;
    policyConfiguration: PoliciesConfig;
    csrf: Pick<ReturnType<typeof createHttpCsrf>, 'apiProtect'>;
    audit(actor: AuthenticatedActor, action: string, context: { brandId: string; method: string }): Promise<unknown>;
  }
): void {
  const policies = bindHttpPolicies(
    [
      ...pilotPolicyChain.map(name => name.toLowerCase()),
      ...resolveEffectivePolicies({ controller: 'CompanionController', action: 'handle' }, input.policyConfiguration),
    ],
    input.policies
  );
  router.all(
    [input.path, input.path + '/{*companionPath}'],
    (req, res, next) => {
      const context = input.context(req);
      if (!context) {
        res.status(403).end();
        return;
      }
      Object.assign(req.params, context);
      next();
    },
    json({ limit: '1mb' }),
    urlencoded({ extended: false, limit: '1mb' }),
    ...policies,
    (req, res, next) => {
      if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) next();
      else input.csrf.apiProtect(req, res, next);
    },
    httpAction(async (req, res, next) => {
      if (
        req.method === 'POST' &&
        [input.path + '/url/meta', input.path + '/url/get'].includes(req.path) &&
        (!req.body || typeof req.body.url !== 'string')
      ) {
        res.status(400).json({ message: 'Invalid URL request' });
        return;
      }
      const relative = req.path.slice(input.path.length).split('/').filter(Boolean);
      if (req.method === 'GET' && input.appUrl && relative.length === 2 && relative[1] === 'send-token') {
        res
          .set({
            'Cache-Control': 'no-cache, no-store, must-revalidate',
            Pragma: 'no-cache',
            Expires: '0',
            'Content-Security-Policy':
              "default-src 'none'; script-src 'unsafe-inline'; connect-src 'none'; img-src 'none'; style-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'",
          })
          .type('html')
          .send(buildCompanionSendTokenHtml(input.appUrl, relative[0]!));
        return;
      }
      const { actor, brand } = requestContext(req);
      if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method))
        await input.audit(actor!, 'companion-request', { brandId: brand.id, method: req.method });
      input.uploads.handle(req, res, next);
    })
  );
}
