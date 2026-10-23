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
    const io = (this.io = new SocketServer(server, {
      path: this.input.path,
      serveClient: true,
      maxHttpBufferSize: 16384,
      allowRequest: (req, callback) => {
        const origin = req.headers.origin;
        callback(null, !this.closing && typeof origin === 'string' && this.input.origins.includes(origin));
      },
    }));
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
            this.connections.set(socket, { grant, rooms: new Set() });
            next();
          },
          () => next(new Error('Authentication required'))
        )
        .catch(() => next(new Error('Authentication required')));
      this.retain(work);
    });
    io.on('connection', socket => {
      socket.on('subscribe', (room: unknown, ack: unknown) => {
        const work = runAcceptedPersistenceWork(this.input.owner, () => this.subscribe(socket, room, ack)).catch(() => {
          if (typeof ack === 'function') ack({ status: false });
        });
        this.retain(work);
      });
      socket.on('unsubscribe', (room: unknown, ack: unknown) => {
        const connection = this.connections.get(socket);
        if (typeof room === 'string') connection?.rooms.delete(room);
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
    try {
      const connection = this.connections.get(socket);
      const allowed =
        !this.closing &&
        connection &&
        typeof room === 'string' &&
        connection.rooms.size < 100 &&
        (await this.permitted(connection, room));
      if (allowed) connection.rooms.add(room);
      if (typeof ack === 'function') ack({ status: !!allowed });
    } catch {
      if (typeof ack === 'function') ack({ status: false });
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
        if (connection.rooms.has(room) && (await this.permitted(connection, room))) {
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
      this.io = undefined;
    }
    this.connections.clear();
  }
}
