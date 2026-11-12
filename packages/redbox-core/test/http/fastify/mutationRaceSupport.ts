import assert from 'node:assert/strict';
import { AsyncLocalStorage } from 'node:async_hooks';
import sinon from 'sinon';
import { getConfigurationRepositories } from '../../../src/persistence/configuration/runtime';
import type { Fixture, Wire } from './mutationDifferentialSupport';

type Participant = 'winner' | 'loser';
function gate() {
  const deferred = Promise.withResolvers<void>();
  return {
    open: () => deferred.resolve(),
    wait: async () => {
      let timer: NodeJS.Timeout | undefined;
      try {
        await Promise.race([
          deferred.promise,
          new Promise<never>((_, reject) => {
            timer = setTimeout(() => reject(new Error('Mutation race barrier timed out')), 8000);
          }),
        ]);
      } finally {
        clearTimeout(timer);
      }
    },
  };
}
function coordinates(value: unknown) {
  const record = value as { revision?: number; lifecycleState?: string } | null;
  return record ? { revision: record.revision, lifecycleState: record.lifecycleState } : null;
}

export const raceRequestIds = {
  winner: '02600000-0000-4000-8000-000000000001',
  loser: '02600000-0000-4000-8000-000000000002',
} as const;
export const recordInterleavings = [
  'claim-held-through-conflict-response',
  'winner-settled-before-loser-cas',
  'winner-settled-before-response-projection',
] as const;

/** Only pause real application calls. Neither snapshots, CAS results nor decisions are substituted.
 * Both callers reach persistence with the original authority. The first schedule freezes the
 * winner's committed claim until the loser's conflict reads AND HTTP decision finish; the second
 * freezes the loser before dispatch until the winner's complete HTTP response has arrived.
 * The third lets the loser decide its domain conflict from the held claim, then finishes the
 * winner before the action's authorization/representation re-read. */
export async function recordRace(
  f: Fixture,
  action: string,
  interleaving: (typeof recordInterleavings)[number],
  send: (participant: Participant) => Promise<Wire>
) {
  if (action === 'delete') action = 'deleteRecord';
  const sandbox = sinon.createSandbox(),
    context = new AsyncLocalStorage<Participant>();
  const initial = [gate(), gate()],
    releaseInitial = gate(),
    bothCas = gate(),
    committed = gate(),
    winnerDone = gate(),
    releaseWinner = gate();
  const gates = [...initial, releaseInitial, bothCas, committed, winnerDone, releaseWinner];
  const records = f.data.records.get(),
    storage = f.data.storage();
  const deleted = action === 'restoreRecord' || action === 'destroyDeletedRecord';
  const read = deleted ? 'getDeletedRecordMeta' : 'getMeta';
  const domain =
    action === 'deleteRecord'
      ? 'delete'
      : action === 'restoreRecord'
        ? 'restoreRecord'
        : action === 'destroyDeletedRecord'
          ? 'destroyDeletedRecord'
          : 'updateMeta';
  const mutation = deleted ? 'updateTombstone' : action === 'deleteRecord' ? 'createTombstone' : 'updateMeta';
  const originalRead = records[read].bind(records),
    originalDomain = records[domain].bind(records),
    originalMutation = storage[mutation]!.bind(storage);
  let reads = 0,
    winnerResponseReceived = false;
  const attempted = new Set<Participant>();
  const trace: Record<string, unknown> = { conflictReads: [] };
  sandbox.stub(records, read).callsFake(async (...args: unknown[]) => {
    const value = await Reflect.apply(originalRead, records, args);
    if (!context.getStore() && reads < 2) {
      initial[reads++].open();
      await releaseInitial.wait();
    }
    return value;
  });
  sandbox.stub(records, domain).callsFake((...args: unknown[]) => {
    const requestId = (args.at(-1) as { requestId: string }).requestId;
    assert(
      Object.values(raceRequestIds).some(value => value === requestId),
      requestId
    );
    const participant = requestId === raceRequestIds.winner ? 'winner' : 'loser';
    return context.run(participant, async () => {
      const result = await Reflect.apply(originalDomain, records, args);
      if (participant === 'loser') {
        trace.domainDecisionAfterWinnerResponse = winnerResponseReceived;
        trace.domainDecision = structuredClone({
          outcome: result.outcome,
          problems: result.problems,
          concurrency: result.concurrency,
        });
      }
      if (participant === 'loser' && interleaving === 'winner-settled-before-response-projection') {
        releaseWinner.open();
        await winnerDone.wait();
      }
      return result;
    });
  });
  for (const method of ['getMeta', 'getTombstone'] as const) {
    const original = storage[method]!.bind(storage);
    sandbox.stub(storage, method).callsFake(async (...args: unknown[]) => {
      const traceRead = context.getStore() === 'loser' && attempted.has('loser');
      try {
        const value = await Reflect.apply(original, storage, args);
        if (traceRead) (trace.conflictReads as unknown[]).push({ method, value: coordinates(value) });
        return value;
      } catch (error) {
        if (traceRead) (trace.conflictReads as unknown[]).push({ method, unavailable: true });
        throw error;
      }
    });
  }
  sandbox.stub(storage, mutation).callsFake(async (...args: unknown[]) => {
    const participant = context.getStore();
    if (!participant || attempted.has(participant)) return Reflect.apply(originalMutation, storage, args);
    attempted.add(participant);
    if (attempted.size === 2) bothCas.open();
    await bothCas.wait();
    if (participant === 'loser') {
      await committed.wait();
      if (interleaving === 'winner-settled-before-loser-cas') await winnerDone.wait();
    }
    const result = await Reflect.apply(originalMutation, storage, args);
    trace[participant + 'Persistence'] = {
      applicationState: result.applicationState,
      nonApplicationReason: result.nonApplicationReason,
    };
    if (participant === 'winner') {
      assert.equal(result.applicationState, 'applied');
      const oid =
        action === 'restoreRecord' || action === 'destroyDeletedRecord' ? 'deleted-record' : 'reference-record';
      trace.winnerClaim = {
        active: coordinates(await f.client.db().collection('record').findOne({ redboxOid: oid })),
        tombstone: coordinates(await f.client.db().collection('deletedrecord').findOne({ redboxOid: oid })),
      };
      committed.open();
      if (interleaving !== 'winner-settled-before-loser-cas') await releaseWinner.wait();
    } else assert.equal(result.applicationState, 'not-applied');
    return result;
  });
  const pending: Promise<Wire>[] = [];
  try {
    const winner = send('winner').then(response => {
      winnerResponseReceived = true;
      winnerDone.open();
      return response;
    });
    pending.push(winner);
    await initial[0].wait();
    const loser = send('loser').then(response => {
      trace.loserResponseAfterWinnerResponse = winnerResponseReceived;
      releaseWinner.open();
      return response;
    });
    pending.push(loser);
    await initial[1].wait();
    releaseInitial.open();
    const responses = await Promise.all([winner, loser]);
    assert.equal(reads, 2);
    assert.equal(attempted.size, 2);
    assert.equal(trace.domainDecisionAfterWinnerResponse, interleaving === 'winner-settled-before-loser-cas');
    assert.equal(trace.loserResponseAfterWinnerResponse, interleaving !== 'claim-held-through-conflict-response');
    assert.equal(responses[0].status, 200, JSON.stringify(responses));
    const expected =
      action === 'deleteRecord'
        ? 409
        : action === 'restoreRecord' && interleaving === 'winner-settled-before-loser-cas'
          ? 409
          : action === 'destroyDeletedRecord' && interleaving !== 'claim-held-through-conflict-response'
            ? 403
            : 412;
    assert.equal(responses[1].status, expected, JSON.stringify({ action, interleaving, responses, trace }));
    return { responses, trace };
  } finally {
    gates.forEach(value => value.open());
    await Promise.allSettled(pending);
    sandbox.restore();
  }
}

export const dashboardInterleavings = [
  'validation-after-winner',
  'save-read-after-winner',
  'cas-after-winner',
] as const;

/** Pin each distinct dashboard stale branch: initial validation read, second save read,
 * or real Mongo CAS loss. Copy has one authority read, so it has no second-read schedule. */
export async function dashboardRace(
  f: Fixture,
  action: string,
  interleaving: (typeof dashboardInterleavings)[number],
  send: () => Promise<Wire>
) {
  const sandbox = sinon.createSandbox(),
    context = new AsyncLocalStorage<Participant>();
  const entered = [gate(), gate()],
    start = gate(),
    bothReads = gate(),
    bothCas = gate(),
    winnerDone = gate();
  const gates = [...entered, start, bothReads, bothCas, winnerDone];
  const dashboard = f.data.reference.dashboardConfig.get(),
    repository = getConfigurationRepositories(f.owner).dashboards;
  const method = action === 'applyCopy' ? 'applyCopy' : 'saveTargetSettings';
  const original = dashboard[method].bind(dashboard),
    read = repository.findForBrand.bind(repository),
    cas = repository.compareAndSwap.bind(repository);
  let calls = 0,
    firstReads = 0,
    casCalls = 0;
  const reads = { winner: 0, loser: 0 };
  const trace = { reads: { winner: [] as unknown[], loser: [] as unknown[] }, cas: {} as Record<string, unknown> };
  sandbox.stub(dashboard, method).callsFake((...args: unknown[]) => {
    const index = calls++,
      participant = index === 0 ? 'winner' : 'loser';
    assert(index < 2);
    entered[index].open();
    return context.run(participant, async () => {
      await start.wait();
      return Reflect.apply(original, dashboard, args);
    });
  });
  sandbox.stub(repository, 'findForBrand').callsFake(async (...args) => {
    const participant = context.getStore();
    if (!participant) return read(...args);
    const number = ++reads[participant];
    if (
      participant === 'loser' &&
      ((interleaving === 'validation-after-winner' && number === 1) ||
        (interleaving === 'save-read-after-winner' && number === 2))
    )
      await winnerDone.wait();
    const value = await read(...args);
    trace.reads[participant].push(coordinates(value));
    if (number === 1 && interleaving !== 'validation-after-winner') {
      if (++firstReads === 2) bothReads.open();
      await bothReads.wait();
    }
    return value;
  });
  sandbox.stub(repository, 'compareAndSwap').callsFake(async (...args) => {
    const participant = context.getStore();
    assert(participant);
    if (interleaving === 'cas-after-winner') {
      if (++casCalls === 2) bothCas.open();
      await bothCas.wait();
      if (participant === 'loser') await winnerDone.wait();
    }
    const result = await cas(...args);
    trace.cas[participant] = { expectedRevision: args[1], applied: result };
    return result;
  });
  const pending: Promise<Wire>[] = [];
  try {
    const winner = send().then(response => {
      winnerDone.open();
      return response;
    });
    pending.push(winner);
    await entered[0].wait();
    const loser = send();
    pending.push(loser);
    await entered[1].wait();
    start.open();
    const responses = await Promise.all([winner, loser]);
    assert.deepEqual(
      responses.map(response => response.status),
      [200, 409],
      JSON.stringify(responses)
    );
    assert.equal(trace.cas.winner && (trace.cas.winner as { applied: boolean }).applied, true);
    assert.equal(casCalls, interleaving === 'cas-after-winner' ? 2 : 0);
    return { responses, trace };
  } finally {
    gates.forEach(value => value.open());
    await Promise.allSettled(pending);
    sandbox.restore();
  }
}
