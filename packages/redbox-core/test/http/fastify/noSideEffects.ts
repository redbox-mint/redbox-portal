import { captureAuthorizationRequests } from './authorizationRequests';
import assert from 'node:assert/strict';
import { channel } from 'node:diagnostics_channel';
import type { ClientRequest } from 'node:http';
import sinon, { type SinonSpy } from 'sinon';
import { drainHttpRequests } from '../../../src/middleware/requestLifetime';
import { drainAcceptedPersistenceWork } from '../../../src/persistence/runtime';
import { mutationCollections, settleMutationWork, type Fixture } from './mutationDifferentialSupport';

const collections = [
  'user',
  'role',
  'role_users__user_roles',
  'agendaJobs',
  // The request gate may emit its own security event on a refusal.
  ...mutationCollections.filter(name => name !== 'securityevent'),
];
const securityTelemetryJobs = new Set([
  'SecurityEventService-StoreSecurityEvent',
  'SiemForwardingService-ForwardSecurityEvents',
]);
const verifiedEffects = channel('redbox.test.verified-denial-effects');
const drainedObservations = new WeakMap<readonly string[], string[]>();

export function assertNoObservedEffects(
  effects: readonly string[],
  message = 'Prohibited side effects after draining the production request'
) {
  assert(drainedObservations.has(effects), 'Expected a drained production side-effect observation');
  assert.deepEqual(effects, [], message);
  verifiedEffects.publish(drainedObservations.get(effects));
}
type ObservedFixture = Pick<Fixture, 'client' | 'data' | 'owner' | 'url'> & {
  drainRequestEffects?: () => Promise<void>;
};

/** Compare business state and the actual handoffs. A rolled-back write or a
 * request queued after the HTTP response is still a prohibited effect. */
export async function observeNoSideEffects(
  fixture: ObservedFixture,
  options: {
    collections?: readonly string[];
    ignorePorts?: readonly string[];
    expectedCalls?: Readonly<Record<string, number>>;
    concurrentWinner?: { collection: 'record' | 'deletedrecord'; oid: string };
    expectedStrictSchemaGrant?: string;
    expectedCredentialTimestamp?: string;
    expectedRemovedAccount?: string;
    expectedConsumedOidcState?: { sessionId: string; issuerHost: string };
    expectedRevokedSessionId?: string;
    expectedAnonymousPageContext?: {
      sessionId: string;
      branding: string;
      portal: string;
      langCode: string;
    };
    sessionCollection?: string;
    skipStagingSnapshot?: boolean;
  } = {}
) {
  const { data, owner } = fixture;
  const drainRequestEffects =
    fixture.drainRequestEffects ??
    (async () => {
      await drainHttpRequests(owner);
      await drainAcceptedPersistenceWork(owner);
    });
  const drain = async () => {
    await drainRequestEffects();
    await settleMutationWork(fixture);
    await drainRequestEffects();
  };
  const disk = data.disks.get().stagingDisk();
  const snapshot = async (afterRequest = false) => {
    const db = fixture.client.db();
    const sessions = options.sessionCollection ?? 'referenceSessions';
    const result = new Map<string, unknown>();
    for (const name of new Set([...collections, sessions, ...(options.collections ?? [])])) {
      let where = {};
      if (name === 'user' && options.expectedRemovedAccount)
        where = { username: { $ne: options.expectedRemovedAccount } };
      if (options.concurrentWinner?.collection === name) where = { redboxOid: { $ne: options.concurrentWinner.oid } };
      if (name === 'recordschemareference' && options.expectedStrictSchemaGrant)
        where = { $nor: [{ oid: options.expectedStrictSchemaGrant, kind: 'grant', operation: 'strict-all' }] };
      const rows = await db.collection(name).find(where).sort({ _id: 1 }).toArray();
      if (name === sessions) {
        const pageContext = options.expectedAnonymousPageContext;
        const revoked = options.expectedRevokedSessionId;
        if (revoked)
          assert.equal(
            rows.some(row => String(row._id) === revoked),
            !afterRequest,
            'Expected only this session to be revoked'
          );
        result.set(
          'session',
          rows
            .filter(row => String(row._id) !== revoked)
            .map(({ expires: _expires, lastModified: _modified, session, ...rest }) => {
              const payload = JSON.parse(session);
              // Store touch times/cookie renewal are not an authentication change.
              if (payload.cookie) delete payload.cookie.expires;
              delete payload.lastModified;
              const consumed = options.expectedConsumedOidcState;
              if (consumed?.sessionId === String(rest._id)) {
                if (afterRequest) assert(!Object.hasOwn(payload, consumed.issuerHost), 'OIDC state must be consumed');
                delete payload[consumed.issuerHost];
              }
              // An HTML refusal can remember the page context in the existing
              // anonymous session. Every other field, including auth, must match.
              if (pageContext?.sessionId === String(rest._id)) {
                assert.equal(payload.passport?.user, undefined);
                for (const key of ['branding', 'portal', 'langCode'] as const) {
                  if (afterRequest) assert.equal(payload[key], pageContext[key], 'Rejected page session ' + key);
                  delete payload[key];
                }
              }
              return { ...rest, session: payload };
            })
        );
      } else if (name === 'user' && options.expectedCredentialTimestamp) {
        result.set(
          'mongo:' + name,
          rows.map(row => {
            if (row.username !== options.expectedCredentialTimestamp) return row;
            const { lastLogin: _login, updatedAt: _update, ...account } = row;
            return account;
          })
        );
      } else if (name === 'agendaJobs') {
        result.set(
          'mongo:' + name,
          rows
            .filter(row => !securityTelemetryJobs.has(row.name))
            .map(row => {
              // The scheduler may update known jobs independently of this
              // request. Still compare every job's identity and payload.
              const job = { ...row };
              for (const field of [
                'nextRunAt',
                'lastRunAt',
                'lastFinishedAt',
                'failedAt',
                'failCount',
                'failReason',
                'lockedAt',
                'lastModifiedBy',
              ])
                delete job[field];
              return job;
            })
        );
      } else result.set('mongo:' + name, rows);
    }
    if (!options.skipStagingSnapshot)
      result.set('staging contents', Array.from((await disk.listAll('', { recursive: true })).objects));
    return result;
  };
  await drain();
  const before = await snapshot();
  const sandbox = sinon.createSandbox();
  const ports = new Map<string, { spy: SinonSpy; initial: number }>();
  function watch(group: string, object: object, methods: readonly string[]) {
    for (const name of methods) {
      const key = group + ':' + name;
      if (options.ignorePorts?.includes(key)) continue;
      const method = Reflect.get(object, name);
      if (typeof method === 'function') {
        const spy =
          typeof method.callCount === 'number'
            ? (method as SinonSpy)
            : sandbox.spy(object as Record<string, () => unknown>, name);
        ports.set(key, { spy, initial: spy.callCount });
      }
    }
  }
  const requests: string[] = [];
  const portal = new URL(fixture.url);
  const observedRequests = captureAuthorizationRequests(Number(portal.port));
  const pending = new Map<ClientRequest, () => void>();
  const http = channel('http.client.request.start');
  const undici = channel('undici:request:create');
  const outbound = (host: string | undefined) => {
    if (host && host !== portal.host) requests.push(host);
  };
  const onHttp = (event: unknown) => {
    const { request } = event as { request: ClientRequest };
    let detach = () => {};
    const cancel = () => {
      detach();
      request.off('socket', inspect);
      pending.delete(request);
    };
    const inspect = (socket: NonNullable<ClientRequest['socket']>) => {
      const connected = () => {
        const address = socket.remoteAddress?.replace(/^::ffff:/, '');
        if (!address || !socket.remotePort) return;
        cancel();
        if (address !== portal.hostname || socket.remotePort !== Number(portal.port))
          requests.push(`${address}:${socket.remotePort}`);
      };
      if (socket.remotePort) connected();
      else {
        socket.once('connect', connected);
        detach = () => socket.off('connect', connected);
      }
    };
    pending.set(request, cancel);
    if (request.socket) inspect(request.socket);
    else request.once('socket', inspect);
  };
  const onUndici = (event: unknown) => {
    const { request } = event as { request: { origin: string } };
    outbound(new URL(request.origin).host);
  };
  try {
    watch('profile', data.users.get(), ['updateUserDetails', 'updateUserRoles', 'disableUser', 'linkAccounts']);
    watch('audit', data.users.get(), ['addUserAuditEvent']);
    watch('record', data.records.get(), ['create', 'updateMeta', 'delete', 'restoreRecord', 'destroyDeletedRecord']);
    watch('queue', data.queue.get(), ['now', 'schedule', 'every']);
    watch('index', data.search.get(), ['index', 'remove']);
    watch('solr', data.search.get(), ['solrAddOrUpdate', 'solrDelete']);
    watch('storage', data.storage(), [
      'create',
      'updateMeta',
      'delete',
      'removeActiveRecord',
      'createTombstone',
      'updateTombstone',
      'removeTombstone',
    ]);
    watch('staging', disk, ['put', 'putStream', 'copy', 'move', 'delete', 'deleteAll']);
    watch('attachments', data.datastream.get(), ['addDatastreams']);
    http.subscribe(onHttp);
    undici.subscribe(onUndici);
  } catch (error) {
    observedRequests();
    sandbox.restore();
    throw error;
  }
  async function differences() {
    await drain();
    const after = await snapshot(true);
    const effects = [...ports].flatMap(([name, { spy, initial }]) => {
      const calls = spy
        .getCalls()
        .slice(initial)
        .filter(call => name !== 'queue:now' || !securityTelemetryJobs.has(call.args[0]));
      return calls.length === (options.expectedCalls?.[name] ?? 0) ? [] : [name];
    });
    for (const [name, state] of before) {
      try {
        assert.deepEqual(after.get(name), state);
      } catch (error) {
        if (!(error instanceof assert.AssertionError)) throw error;
        effects.push(name);
      }
    }
    if (requests.length || pending.size) effects.push('outbound HTTP');
    drainedObservations.set(effects, observedRequests());
    return effects;
  }
  return {
    differences,
    async assertNone() {
      assertNoObservedEffects(await differences());
    },
    restore() {
      http.unsubscribe(onHttp);
      undici.unsubscribe(onUndici);
      for (const cancel of pending.values()) cancel();
      observedRequests();
      sandbox.restore();
    },
  };
}

export async function withoutSideEffects<T>(
  fixture: ObservedFixture,
  run: () => Promise<T>,
  options?: Parameters<typeof observeNoSideEffects>[1]
): Promise<T> {
  const effects = await observeNoSideEffects(fixture, options);
  try {
    const value = await run();
    await effects.assertNone();
    return value;
  } finally {
    effects.restore();
  }
}
