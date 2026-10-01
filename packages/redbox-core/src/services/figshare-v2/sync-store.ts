import type { Collection, Db, Filter } from 'mongodb';
import type { FigshareSyncModel, FigshareIntentKind, FigshareSourceIntent, FigshareWork } from '../../model/storage/FigshareSyncModel';

export class FigshareLeaseLost extends Error {
  constructor() { super('Figshare worker lease was lost'); this.name = 'FigshareLeaseLost'; }
}
const kinds: FigshareIntentKind[] = ['sync', 'cleanup', 'observe'];
const emptyWork = (): FigshareWork => ({ requested: 0, processed: 0, sourceGeneration: 0, dueAt: null, policies: [], requestedBy: '' });
export function nextAction(work: FigshareSyncModel['work']): number | null {
  const times = kinds.map(k => work[k].dueAt).filter((t): t is number => t != null);
  return times.length ? Math.min(...times) : null;
}

/** All compound mutations use revision CAS; workers additionally match an unexpired owner. */
export class FigshareSyncStore {
  readonly collection: Collection<FigshareSyncModel>;
  constructor(db: Db) { this.collection = db.collection<FigshareSyncModel>('figsharesync'); }
  async ensureIndexes(): Promise<void> {
    await this.collection.createIndex({ oid: 1 }, { unique: true });
    await this.collection.createIndex({ namespace: 1, articleId: 1 }, {
      unique: true, partialFilterExpression: { articleId: { $type: 'string' }, namespace: { $type: 'string' } }
    });
    await this.collection.createIndex({ nextActionAt: 1, dispatchUntil: 1 });
  }
  async initialise(oid: string, brandId: string): Promise<void> {
    const initial: FigshareSyncModel = {
      oid, brandId, revision: 0, importedGeneration: 0,
      work: { sync: emptyWork(), cleanup: emptyWork(), observe: emptyWork() },
      nextActionAt: null, dispatchUntil: 0, leaseOwner: null, leaseUntil: 0,
      receipts: [], checkpoints: {}, status: 'queued'
    };
    try { await this.collection.updateOne({ oid }, { $setOnInsert: initial }, { upsert: true }); }
    catch (e) { if (!(e instanceof Error && 'code' in e && e.code === 11000)) throw e; }
    const saved = await this.get(oid);
    if (saved?.brandId !== brandId) throw new Error('Figshare record brand changed; administrative reconciliation required');
  }
  get(oid: string) { return this.collection.findOne({ oid }); }
  async change(oid: string, fn: (state: FigshareSyncModel) => void, owner?: string): Promise<FigshareSyncModel> {
    for (let attempt = 0; attempt < 30; attempt++) {
      const state = await this.get(oid);
      if (!state) throw new Error(`Missing Figshare state for ${oid}`);
      if (owner && (state.leaseOwner !== owner || state.leaseUntil <= Date.now())) throw new FigshareLeaseLost();
      const revision = state.revision;
      fn(state);
      state.nextActionAt = nextAction(state.work);
      state.revision++;
      const filter: Filter<FigshareSyncModel> = { oid, revision };
      if (owner) { filter.leaseOwner = owner; filter.leaseUntil = { $gt: Date.now() }; }
      // Preserve Mongo's _id and unset optional fields by replacing under CAS.
      const result = await this.collection.replaceOne(filter, state);
      if (result.matchedCount) return state;
    }
    throw new Error('Figshare state contention; retry the operation');
  }
  async importSource(oid: string, brandId: string, intent: FigshareSourceIntent): Promise<void> {
    if (intent.readiness !== 'ready') return;
    await this.initialise(oid, brandId);
    await this.change(oid, state => {
      if (state.importedGeneration >= intent.generation) return;
      state.importedGeneration = intent.generation;
      for (const kind of ['sync', 'cleanup'] as const) {
        const policies = intent.intents.filter(i => i.kind === kind);
        if (!policies.length) continue;
        const work = state.work[kind];
        work.requested++;
        work.sourceGeneration = intent.generation;
        work.requestedBy = policies[policies.length - 1].requestedBy ?? intent.requestedBy;
        work.policies = policies;
        work.dueAt = Date.now();
      }
      if (state.status === 'failed' || state.status === 'synced') {
        state.status = 'queued'; delete state.error;
        if (state.auditClosed) { delete state.audit; state.auditClosed = false; }
      }
    });
  }
  async request(oid: string, kind: FigshareIntentKind, dueAt = Date.now(), onlyIfIdle = false): Promise<void> {
    await this.change(oid, state => {
      const work = state.work[kind];
      if (onlyIfIdle && work.requested > work.processed) return;
      work.requested++;
      work.dueAt = work.dueAt == null ? dueAt : Math.min(work.dueAt, dueAt);
    });
  }
  async claim(oid: string, brandId: string, owner: string, leaseMs: number): Promise<FigshareSyncModel | null> {
    const now = Date.now();
    return this.collection.findOneAndUpdate({ oid, brandId, leaseUntil: { $lte: now }, nextActionAt: { $ne: null, $lte: now } }, {
      $set: { leaseOwner: owner, leaseUntil: now + leaseMs, status: 'running' }, $inc: { revision: 1 }
    }, { returnDocument: 'after', includeResultMetadata: false });
  }
  async renew(oid: string, owner: string, leaseMs: number): Promise<void> {
    const result = await this.collection.updateOne({ oid, leaseOwner: owner, leaseUntil: { $gt: Date.now() } }, {
      $set: { leaseUntil: Date.now() + leaseMs }, $inc: { revision: 1 }
    });
    if (!result.matchedCount) throw new FigshareLeaseLost();
  }
  async assertOwner(oid: string, owner: string): Promise<void> {
    if (!await this.collection.findOne({ oid, leaseOwner: owner, leaseUntil: { $gt: Date.now() } })) throw new FigshareLeaseLost();
  }
  async release(oid: string, owner: string): Promise<void> {
    await this.collection.updateOne({ oid, leaseOwner: owner }, { $set: { leaseOwner: null, leaseUntil: 0 }, $inc: { revision: 1 } });
  }
  async due(limit = 100): Promise<Array<{ oid: string; brandId: string }>> {
    const now = Date.now();
    return this.collection.find({ nextActionAt: { $ne: null, $lte: now }, dispatchUntil: { $lte: now } })
      .sort({ nextActionAt: 1 }).limit(limit).project<{ oid: string; brandId: string }>({ oid: 1, brandId: 1 }).toArray();
  }
  async dispatchClaim(oid: string, cooldownMs = 10000, extend = false): Promise<boolean> {
    const result = await this.collection.updateOne(extend ? { oid } : { oid, dispatchUntil: { $lte: Date.now() } }, {
      $set: { dispatchUntil: Date.now() + cooldownMs }, $inc: { revision: 1 }
    });
    return result.matchedCount === 1;
  }
}
