import type { IncomingMessage, Server } from 'node:http';
import type { Duplex } from 'node:stream';
import { writeHttpError } from '../fastify/errorBoundary';

type Upgrade = (request: IncomingMessage, socket: Duplex, head: Buffer) => void;
const dispatchers = new WeakMap<
  Server,
  { owners: Map<object, { matches(request: IncomingMessage): boolean; handle: Upgrade }>; dispatch: Upgrade }
>();
/** One server listener selects exactly one protocol owner. Unknown upgrades have
 * no portal handler and close without a response, as on the Express host. */
export function ownUpgrade(
  server: Server,
  owner: object,
  matches: (request: IncomingMessage) => boolean,
  handle: Upgrade
): () => void {
  let dispatcher = dispatchers.get(server);
  if (!dispatcher) {
    const owners = new Map<object, { matches(request: IncomingMessage): boolean; handle: Upgrade }>();
    const dispatch: Upgrade = (request, socket, head) => {
      try {
        const selected = [...owners.values()].filter(candidate => candidate.matches(request));
        if (selected.length !== 1) {
          socket.destroy();
          return;
        }
        selected[0]!.handle(request, socket, head);
      } catch (error) {
        writeHttpError(error, { socket: socket as import('node:net').Socket });
      }
    };
    dispatcher = { owners, dispatch };
    dispatchers.set(server, dispatcher);
    server.on('upgrade', dispatch);
  }
  if (dispatcher.owners.has(owner)) throw new TypeError('Upgrade owner already attached.');
  dispatcher.owners.set(owner, { matches, handle });
  return () => {
    dispatcher.owners.delete(owner);
    if (!dispatcher.owners.size) {
      server.off('upgrade', dispatcher.dispatch);
      dispatchers.delete(server);
    }
  };
}
