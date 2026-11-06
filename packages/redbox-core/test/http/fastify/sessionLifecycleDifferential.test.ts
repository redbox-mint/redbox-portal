import assert from 'node:assert/strict';
import { Agent } from 'node:http';
import sinon from 'sinon';
import type { Db } from 'mongodb';
import {
  fixture,
  exchange,
  epoch,
  url,
  cookiePayload,
  cookieHeaders,
  type Settings,
  type Method,
  type Driver,
  type Result,
  script,
} from './sessionDifferential';
import { pairwise, assertPairwise } from './sessionMatrix';

const full = process.env.FM014_SESSION_FULL === '1';
const lifetimes = ['session', 'maxAge', 'expires', 'maxAge-last', 'expires-last', 'zero', 'negative'] as const;
type Lifetime = (typeof lifetimes)[number];
const base: Settings = { rolling: true, resave: false, saveUninitialized: false, secure: false, trust: false };
function lifetime(value: Lifetime): Settings['cookie'] {
  const expires = new Date(epoch + 1200);
  switch (value) {
    case 'session':
      return {};
    case 'maxAge':
      return { maxAge: 1200 };
    case 'expires':
      return { expires };
    case 'maxAge-last':
      return { expires, maxAge: 1600 };
    case 'expires-last':
      return { maxAge: 1600, expires };
    case 'zero':
      return { maxAge: 0 };
    case 'negative':
      return { maxAge: -100 };
  }
}
interface CookieRow {
  lifetime: Lifetime;
  partitioned: boolean;
  priority: 'none' | 'low' | 'medium' | 'high';
  domain: 'none' | 'host' | 'suffix';
  path: 'root' | 'scope' | 'empty';
  encode: 'default' | 'custom';
  httpOnly: boolean;
}
const cookies: CookieRow[] = [];
for (const age of lifetimes)
  for (const partitioned of [false, true])
    for (const priority of ['none', 'low', 'medium', 'high'] as const)
      for (const domain of ['none', 'host', 'suffix'] as const)
        for (const path of ['root', 'scope', 'empty'] as const)
          for (const encode of ['default', 'custom'] as const)
            for (const httpOnly of [false, true])
              cookies.push({ lifetime: age, partitioned, priority, domain, path, encode, httpOnly });
function cookieSettings(row: CookieRow): Settings {
  return {
    ...base,
    sessionCookie: true,
    cookie: {
      ...lifetime(row.lifetime),
      partitioned: row.partitioned,
      httpOnly: row.httpOnly,
      priority: row.priority === 'none' ? undefined : row.priority,
      domain: row.domain === 'none' ? undefined : row.domain === 'host' ? 'example.test' : '.example.test',
      path: row.path === 'root' ? '/' : row.path === 'scope' ? '/scope' : '',
      // express-session Cookie.data deliberately does not forward encode. The
      // current Express stack must never call this function; native must agree.
      ...(row.encode === 'custom'
        ? {
            encode: () => {
              throw new Error('Session encode must not be forwarded.');
            },
          }
        : {}),
    },
  };
}
const methods: Method[] = [
  'read',
  'modify',
  'save',
  'reload',
  'touch',
  'resetMaxAge',
  'regenerate',
  'destroy',
  'options',
];
const sequences = methods.flatMap(first => methods.map(second => [first, second]));
const cookieSequences: Method[][] = [
  ['modify', 'save', 'reload'],
  ['touch', 'resetMaxAge', 'save'],
  ['regenerate', 'reload', 'save'],
];
type FaultKind =
  | 'lookup'
  | 'reload'
  | 'insert'
  | 'update'
  | 'destroy'
  | 'regenerate-insert'
  | 'regenerate-update'
  | 'auto-insert'
  | 'auto-update'
  | 'auto-touch';
interface Fault {
  kind: FaultKind;
  retry: boolean;
  propagate?: boolean;
}
const automatic = (fault?: Fault) => fault?.kind.startsWith('auto-') ?? false;

async function fail(database: Db, command: string): Promise<void> {
  await database.admin().command({
    configureFailPoint: 'failCommand',
    mode: { times: 1 },
    data: { failCommands: [command], errorCode: 112 },
  });
}
function command(native: boolean, kind: FaultKind, existing: boolean): string {
  if (kind === 'lookup' || kind === 'reload') return 'find';
  if (kind === 'destroy' || kind.startsWith('regenerate')) return 'delete';
  return native && !existing ? 'insert' : 'update';
}

async function run(
  native: boolean,
  settings: Settings,
  scripts: Method[][],
  states: boolean[] = [false, true],
  fault?: Fault,
  timing?: { actionAt: number; reads: number[] }
) {
  const clock = sinon.useFakeTimers({ now: epoch, toFake: ['Date'] });
  const agent = new Agent({ keepAlive: true });
  let current: Method[] = [];
  let start = 0;
  const execute = async (driver: Driver, database: Db) => {
    const events: unknown[] = [];
    for (const [i, method] of current.entries()) {
      clock.setSystemTime(epoch + start + i * 75);
      if (
        fault &&
        ['reload', 'insert', 'update', 'destroy', 'regenerate-insert', 'regenerate-update'].includes(fault.kind) &&
        i === current.length - 1
      )
        await fail(database, command(native, fault.kind, states[0]));
      try {
        await driver.invoke(method);
        events.push({ method, error: false, ...driver.snapshot() });
      } catch {
        events.push({ method, error: true, ...driver.snapshot() });
        if (fault?.propagate && !fault.retry) throw new Error('session-failed');
        if (fault?.retry) {
          clock.setSystemTime(epoch + start + i * 75 + 25);
          try {
            await driver.invoke(method, true);
            events.push({ method, error: false, ...driver.snapshot() });
          } catch {
            events.push({ method, error: true, ...driver.snapshot() });
          }
        }
      }
    }
    return events;
  };
  let f: Awaited<ReturnType<typeof fixture>> | undefined;
  const observations: unknown[] = [];
  try {
    f = await fixture(native, settings, execute);
    // All test URLs pass the configured /scope cookie path as well as root/empty.
    for (const existing of states)
      for (const steps of scripts) {
        await f.database.collection('sessions').deleteMany({});
        clock.setSystemTime(epoch);
        const ids = new Map<string, number>();
        const identity = (id: unknown) => {
          if (typeof id !== 'string') return null;
          if (!ids.has(id)) ids.set(id, ids.size + 1);
          return ids.get(id);
        };
        let cookie: string | undefined;
        const documents = async () =>
          (await f!.database.collection('sessions').find({}).toArray())
            .map(doc => {
              const { cookie: attributes, __fastifySessionMetadata: metadata, ...data } = JSON.parse(doc.session);
              return {
                id: identity(native ? metadata.generation : doc._id),
                expires: doc.expires.getTime(),
                lastModified: doc.lastModified?.getTime() ?? null,
                cookie: cookiePayload(attributes),
                data,
              };
            })
            .sort((a, b) => a.id! - b.id!);
        const snapshot = async (result: Result, label: string, expectedFailure = false, before?: unknown[]) => {
          const id = identity(result.body.id);
          const events = result.body.events?.map(value => {
            const event = value as { id: unknown };
            return { ...event, id: identity(event.id) };
          });
          const stored = await documents();
          if (expectedFailure) {
            // ACCEPTED-AUTO-PERSIST-FAILURE: assert the approved exception exactly;
            // storage and any caller retry are still compared without normalization.
            if (native) {
              assert.equal(result.status, 500);
              assert.equal(result.complete, true);
              assert.deepEqual(result.body, { error: 'session-failed' });
              assert.equal(result.headers['set-cookie'], undefined);
            } else assert.equal(result.complete, false, 'Express must abort the automatic persistence failure.');
            assert.deepEqual(stored, before, 'No persisted success state on automatic failure.');
            observations.push({ existing, steps, label, acceptedDeviation: 'ACCEPTED-AUTO-PERSIST-FAILURE', stored });
          } else if (fault?.propagate && !fault.retry && label === 'action') {
            assert(result.complete);
            assert.equal(result.status, 500);
            assert.deepEqual(result.body, { error: 'session-failed' });
            observations.push({ existing, steps, label, status: 500, cookies: cookieHeaders(result.headers), stored });
          } else {
            assert(result.complete, 'Unexpected aborted response.');
            assert.equal(result.status, 200, JSON.stringify(result.body));
            observations.push({
              existing,
              steps,
              label,
              id,
              value: result.body.value,
              events,
              cookies: cookieHeaders(result.headers),
              stored,
            });
          }
          if (result.complete && result.headers['set-cookie']?.[0])
            cookie = result.headers['set-cookie'][0].split(';', 1)[0];
        };
        if (existing) {
          await snapshot(await exchange(f.port, 'modify', undefined, settings.proto, agent), 'seed');
          const seed = observations.at(-1) as { id: unknown };
          // Get an authentic signed credential from a second read only when emission
          // is suppressed; fixture policies here use HTTP auto, so seed emits it.
          assert(seed);
          assert(cookie, 'Existing lifecycle scenario must have a seed cookie.');
        }
        current = steps;
        start = timing?.actionAt ?? (existing ? 250 : 0);
        clock.setSystemTime(epoch + start);
        const before = await documents();
        if (fault && (automatic(fault) || fault.kind === 'lookup'))
          await fail(f.database, command(native, fault.kind, existing));
        const result = await exchange(f.port, 'sequence', cookie, settings.proto, agent);
        if (fault?.kind === 'lookup') {
          assert.equal(result.status, 500);
          assert(result.complete);
          assert.equal(result.headers['set-cookie'], undefined);
          assert.deepEqual(await documents(), before);
          observations.push({ existing, steps, label: 'lookup-failed', stored: before });
        } else await snapshot(result, 'action', automatic(fault), before);
        if (fault?.retry && (automatic(fault) || fault.kind === 'lookup')) {
          clock.setSystemTime(epoch + start + 25);
          await snapshot(await exchange(f.port, 'sequence', cookie, settings.proto, agent), 'http-retry');
        }
        for (const elapsed of timing?.reads ?? [750, 1500]) {
          clock.setSystemTime(epoch + elapsed);
          await snapshot(await exchange(f.port, 'read', cookie, settings.proto, agent), '+' + elapsed);
        }
      }
    return observations;
  } finally {
    agent.destroy();
    if (f) {
      await f.database.admin().command({ configureFailPoint: 'failCommand', mode: 'off' });
      await f.host.stop();
    }
    clock.restore();
  }
}
async function compare(
  settings: Settings,
  scripts: Method[][],
  states?: boolean[],
  fault?: Fault,
  timing?: { actionAt: number; reads: number[] }
) {
  const express = await run(false, settings, scripts, states, fault, timing);
  const native = await run(true, settings, scripts, states, fault, timing);
  assert.deepEqual(native, express);
}

(url ? describe : describe.skip)('Express/native cookie, Session API and fault differential', function () {
  this.timeout(60_000);
  const selected = full ? cookies : pairwise(cookies);
  it('retains every cookie-option pair in the default subset', () => assertPairwise(cookies, pairwise(cookies)));
  for (const row of selected) it(`cookie ${JSON.stringify(row)}`, () => compare(cookieSettings(row), cookieSequences));
  const api = lifetimes.flatMap(age =>
    [false, true].flatMap(rolling =>
      [false, true].flatMap(resave =>
        [false, true].flatMap(saveUninitialized =>
          [0, 1].map(touchAfter => ({ age, rolling, resave, saveUninitialized, touchAfter }))
        )
      )
    )
  );
  it('retains every API-configuration pair in the default subset', () => assertPairwise(api, pairwise(api)));
  for (const row of full ? api : pairwise(api))
    it(`API pairs ${JSON.stringify(row)}`, () =>
      compare({ ...base, ...row, ttl: 2, sessionCookie: true, cookie: lifetime(row.age) }, sequences));
  const faults = [
    'lookup',
    'reload',
    'insert',
    'update',
    'destroy',
    'regenerate-insert',
    'regenerate-update',
    'auto-insert',
    'auto-update',
    'auto-touch',
  ].flatMap(kind =>
    [false, true].flatMap(retry =>
      ['session', 'maxAge', 'expires'].flatMap(age =>
        [false, true].flatMap(rolling =>
          [false, true].flatMap(resave =>
            [false, true].map(propagate => ({
              kind: kind as FaultKind,
              retry,
              age: age as Lifetime,
              rolling,
              resave,
              propagate,
            }))
          )
        )
      )
    )
  );
  it('retains every fault/configuration pair in the default subset', () => assertPairwise(faults, pairwise(faults)));
  for (const row of full ? faults : pairwise(faults))
    it(`fault ${JSON.stringify(row)}`, () => {
      const steps: Method[] =
        row.kind === 'reload'
          ? ['reload']
          : row.kind.startsWith('regenerate')
            ? ['regenerate']
            : row.kind === 'destroy'
              ? ['destroy']
              : row.kind.includes('insert') || row.kind.includes('update')
                ? ['modify', ...(automatic(row) ? [] : ['save' as const])]
                : ['read'];
      const existing = !row.kind.includes('insert');
      return compare({ ...base, ...row, sessionCookie: true, cookie: lifetime(row.age) }, [steps], [existing], row);
    });
  const updates = ['attributes', 'maxAge', 'expires', 'maxAge-expires', 'expires-maxAge'] as const;
  const optionRows = (['session', 'maxAge', 'expires'] as const).flatMap(age =>
    updates.flatMap(update =>
      [false, true].flatMap(rolling =>
        [false, true].flatMap(resave =>
          [false, true].map(saveUninitialized => ({ age, update, rolling, resave, saveUninitialized }))
        )
      )
    )
  );
  it('retains every delayed option-update pair in the default subset', () =>
    assertPairwise(optionRows, pairwise(optionRows)));
  for (const row of full ? optionRows : pairwise(optionRows))
    it(`delayed options ${JSON.stringify(row)}`, () => {
      const expires = new Date(epoch + 90000);
      const optionUpdate =
        row.update === 'attributes'
          ? { priority: 'high', partitioned: true }
          : row.update === 'maxAge'
            ? { maxAge: 30000 }
            : row.update === 'expires'
              ? { expires }
              : row.update === 'maxAge-expires'
                ? { maxAge: 30000, expires }
                : { expires, maxAge: 30000 };
      return compare(
        {
          ...base,
          ...row,
          optionUpdate,
          sessionCookie: true,
          cookie:
            row.age === 'session'
              ? {}
              : row.age === 'maxAge'
                ? { maxAge: 60000 }
                : { expires: new Date(epoch + 60000) },
        },
        [
          ['read', 'options'],
          ['options', 'save'],
          ['options', 'reload'],
          ['options', 'touch'],
          ['touch', 'options'],
          ['options', 'options'],
          ['options', 'regenerate'],
        ],
        undefined,
        undefined,
        { actionAt: 50000, reads: [50750, 61500] }
      );
    });
  it('retains expires-only data with real 750ms rolling reads', async () => {
    for (const native of [false, true]) {
      const observations = (await script(
        native,
        { ...base, sessionCookie: true, cookie: { expires: new Date(Date.now() + 1200) } },
        true
      )) as { value: unknown; cookies: unknown[] }[];
      assert.equal(observations.length, 4);
      assert(observations.every(row => row.value === 'kept' && row.cookies.length === 1));
    }
  });
});
