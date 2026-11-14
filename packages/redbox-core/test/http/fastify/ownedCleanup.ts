import assert from 'node:assert/strict';
import type { Server } from 'node:http';
import { appendFileSync } from 'node:fs';
import { persistenceStatus } from '../../../src/persistence/runtime';
import type { PersistenceOwner } from '../../../src/persistence/owner';
import { connect } from 'node:net';

/** Use a fresh TCP connection; an HTTP agent could reuse an accepted socket. */
export async function assertNoNewConnections(url: string): Promise<void> {
  await assert.rejects(
    new Promise<void>((resolve, reject) => {
      const target = new URL(url);
      const socket = connect(Number(target.port), target.hostname);
      socket.setTimeout(2000, () => socket.destroy(new Error('Admission probe timed out')));
      socket.once('error', reject);
      socket.once('connect', () => {
        socket.destroy();
        resolve();
      });
    }),
    { code: 'ECONNREFUSED' }
  );
}

/** Assert owned cleanup while the test process is still running. Vendor timers
 * cannot turn a stopped host, open listener or live pool into a passing receipt. */
export async function assertOwnedHttpClosed(
  host: { status(): { stopped: boolean; listening: boolean } },
  owner: PersistenceOwner,
  explicitServer?: Server
): Promise<void> {
  const server: Server = explicitServer ?? Reflect.get(host, 'fastify')?.server ?? Reflect.get(host, 'server');
  assert(server, 'The production host must expose its server to this private test probe');
  assert.equal(host.status().stopped, true);
  assert.equal(host.status().listening, false);
  assert.equal(server.listening, false);
  assert.equal(server.address(), null);
  assert.equal(server.listenerCount('upgrade'), 0);
  assert.equal(server.listenerCount('request'), 1, 'Only the host dispatcher remains');
  const connections = await new Promise<number>((resolve, reject) =>
    server.getConnections((error, count) => (error ? reject(error) : resolve(count)))
  );
  assert.equal(connections, 0);
  assert.equal(persistenceStatus(owner).pools, 0);
  const requests = Reflect.get(host, 'requests');
  if (requests instanceof Set) assert.equal(requests.size, 0);
  if (process.env.FM036_CLEANUP)
    appendFileSync(
      process.env.FM036_CLEANUP,
      JSON.stringify({
        at: new Date().toISOString(),
        pid: process.pid,
        stopped: true,
        listening: false,
        connections,
        pools: 0,
        requests: requests?.size ?? 0,
        requestListeners: server.listenerCount('request'),
        upgradeListeners: 0,
      }) + '\n'
    );
}
