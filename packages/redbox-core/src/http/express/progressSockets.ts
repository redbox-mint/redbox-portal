import { Server as SocketServer, type Socket } from 'socket.io';
import type { Server } from 'node:http';
import { randomBytes } from 'node:crypto';
import type { AuthenticatedActor } from './identity';
import type { RecordsService } from '../../RecordsService';
import type { Services as Progress } from '../../progress/Asynchs';
import { authorizeProgressRoom } from '../../progress/authorization';
import type { PersistenceOwner } from '../../persistence/owner';
import { hasActivePersistenceWork, runAcceptedPersistenceWork } from '../../persistence/runtime';
export interface ProgressCredential {
  sessionId?: string;
  authorization?: string;
}
interface Grant {
  credential: ProgressCredential;
  brand: { id: string; name?: string };
  actorId: string;
  expires: number;
}
interface Connection {
  grant: Grant;
  rooms: Set<string>;
  subscriptions: Map<string, Subscription>;
}
interface Subscription {
  pending: number;
}
const attachments = new WeakSet<Server>();
/** The portal owns this namespace; Companion attaches its own distinct socket path. */
export class ProgressSockets {
  private readonly grants = new Map<string, Grant>();
  private readonly connections = new Map<Socket, Connection>();
  private readonly pending = new Set<Promise<unknown>>();
  private closing = false;
  private closed = false;
  private io?: SocketServer;
  private detachUpgrade?: () => void;
  constructor(
    private readonly input: {
      owner: PersistenceOwner;
      path: string;
      origins: readonly string[];
      records: Pick<RecordsService, 'getMeta' | 'hasViewAccess'>;
      progress: Pick<Progress.Asynchs, 'get'>;
      authenticate(credential: ProgressCredential): Promise<AuthenticatedActor | false>;
    }
  ) {}
  attach(server: Server): void {
    if (this.io || attachments.has(server)) throw new Error('Portal sockets already attached');
    attachments.add(server);
    const upgrades = new Set(server.listeners('upgrade'));
    const io = (this.io = new SocketServer(server, {
      path: this.input.path,
      serveClient: true,
      maxHttpBufferSize: 16384,
      allowRequest: (req, callback) => {
        const origin = req.headers.origin;
        callback(null, !this.closing && typeof origin === 'string' && this.input.origins.includes(origin));
      },
    }));
    // Engine.IO closes transports but leaves its HTTP upgrade listener installed.
    // Retain only this attachment's listeners so Companion/other owners survive.
    const attached = server.listeners('upgrade').filter(listener => !upgrades.has(listener));
    this.detachUpgrade = () =>
      attached.forEach(listener => server.off('upgrade', listener as (...args: unknown[]) => void));
    const authenticated = new WeakMap<Socket, Grant>();
    io.use((socket, next) => {
      const token = socket.handshake.auth.token;
      const grant = typeof token === 'string' ? this.grants.get(token) : undefined;
      if (typeof token === 'string') this.grants.delete(token);
      if (!grant || grant.expires < Date.now() || this.closing) {
        next(new Error('Authentication required'));
        return;
      }
      const work = runAcceptedPersistenceWork(this.input.owner, () => this.input.authenticate(grant.credential))
        .then(
          actor => {
            if (!actor || actor.id !== grant.actorId || !actor.roles.some(r => r.brandId === grant.brand.id))
              throw new Error('Authentication required');
            authenticated.set(socket, grant);
            next();
          },
          () => next(new Error('Authentication required'))
        )
        .catch(() => next(new Error('Authentication required')));
      this.retain(work);
    });
    io.on('connection', socket => {
      const grant = authenticated.get(socket);
      authenticated.delete(socket);
      if (!grant || this.closing) {
        socket.disconnect(true);
        return;
      }
      // A transport can close while authentication is pending; only live
      // connections acquire a retained session binding and disconnect cleanup.
      this.connections.set(socket, { grant, rooms: new Set(), subscriptions: new Map() });
      socket.on('subscribe', (room: unknown, ack: unknown) => {
        const work = runAcceptedPersistenceWork(this.input.owner, () => this.subscribe(socket, room, ack)).catch(() => {
          if (typeof ack === 'function') ack({ status: false });
        });
        this.retain(work);
      });
      socket.on('unsubscribe', (room: unknown, ack: unknown) => {
        const connection = this.connections.get(socket);
        if (typeof room === 'string') {
          connection?.subscriptions.delete(room);
          connection?.rooms.delete(room);
        }
        if (typeof ack === 'function') ack({ status: true });
      });
      socket.on('disconnect', () => this.connections.delete(socket));
    });
  }
  issue(credential: ProgressCredential, brand: { id: string; name?: string }, actor: AuthenticatedActor): string {
    if (this.closing) throw new Error('Progress is draining');
    for (const [token, grant] of this.grants) if (grant.expires < Date.now()) this.grants.delete(token);
    if (this.grants.size >= 10000) throw new Error('Too many pending socket grants');
    const token = randomBytes(32).toString('hex');
    this.grants.set(token, {
      credential: { ...credential },
      brand: { ...brand },
      actorId: actor.id,
      expires: Date.now() + 30000,
    });
    return token;
  }
  private retain(work: Promise<unknown>): void {
    this.pending.add(work);
    void work.then(
      () => this.pending.delete(work),
      () => this.pending.delete(work)
    );
  }
  private async permitted(connection: Connection, room: string): Promise<boolean> {
    const actor = await this.input.authenticate(connection.grant.credential);
    return (
      !!actor &&
      actor.id === connection.grant.actorId &&
      (await authorizeProgressRoom(room, connection.grant.brand, actor, this.input))
    );
  }
  private async subscribe(socket: Socket, room: unknown, ack: unknown): Promise<void> {
    const connection = this.connections.get(socket);
    let request: Subscription | undefined;
    try {
      if (!connection || this.closing || typeof room !== 'string') {
        if (typeof ack === 'function') ack({ status: false });
        return;
      }
      const rooms = new Set([...connection.rooms, ...connection.subscriptions.keys()]);
      if (!rooms.has(room) && rooms.size >= 100) {
        if (typeof ack === 'function') ack({ status: false });
        return;
      }
      // Duplicate subscriptions express the same room intent until unsubscribe.
      // Keep it alive until every concurrent authorization has acknowledged.
      request = connection.subscriptions.get(room) ?? { pending: 0 };
      request.pending++;
      connection.subscriptions.set(room, request);
      const permitted = await this.permitted(connection, room);
      const allowed =
        permitted &&
        !this.closing &&
        this.connections.get(socket) === connection &&
        connection.subscriptions.get(room) === request;
      if (allowed) connection.rooms.add(room);
      if (typeof ack === 'function') ack({ status: !!allowed });
    } catch {
      if (typeof ack === 'function') ack({ status: false });
    } finally {
      if (
        connection &&
        request &&
        --request.pending === 0 &&
        typeof room === 'string' &&
        connection.subscriptions.get(room) === request
      )
        connection.subscriptions.delete(room);
    }
  }
  emit(event: string, progress: Record<string, unknown>): Promise<void> {
    if (this.closed || (this.closing && !hasActivePersistenceWork(this.input.owner)))
      return Promise.reject(new Error('Progress is draining'));
    const work = runAcceptedPersistenceWork(this.input.owner, () => this.emitAccepted(event, progress));
    this.retain(work);
    return work;
  }
  private async emitAccepted(event: string, progress: Record<string, unknown>): Promise<void> {
    const rooms = [
      progress.relatedRecordId,
      progress.id,
      progress.taskType ? `${progress.relatedRecordId}-${progress.taskType}` : undefined,
    ].filter((v): v is string => typeof v === 'string' && !!v);
    for (const [socket, connection] of this.connections) {
      if (connection.grant.brand.id !== progress.branding) continue;
      for (const room of rooms) {
        if (
          connection.rooms.has(room) &&
          (await this.permitted(connection, room)) &&
          this.connections.get(socket) === connection &&
          connection.rooms.has(room)
        ) {
          socket.emit(event, progress);
          break;
        }
      }
    }
  }
  quiesce(): void {
    this.closing = true;
    this.grants.clear();
  }
  async drain(): Promise<void> {
    while (this.pending.size) await Promise.allSettled(this.pending);
  }
  async close(): Promise<void> {
    this.quiesce();
    await this.drain();
    this.closed = true;
    if (this.io) {
      await new Promise<void>(resolve => this.io!.close(() => resolve()));
      this.detachUpgrade?.();
      this.detachUpgrade = undefined;
      this.io = undefined;
    }
    this.connections.clear();
  }
}
