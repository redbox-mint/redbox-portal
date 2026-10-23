import type { CorePrismaClient } from '../prisma/client';
import { prismaCommand } from '../prisma/documents';
import { prismaModelValues } from '../prisma/modelValues';
import { prismaModelFilter } from '../prisma/modelFilter';
import { MongoAggFieldRef as Ref, MongoAggLiteral as Lit, MongoAggOperator as Op } from '@prisma/orm-mongo/query-ast';

import type {
  FigshareSyncModel,
  FigshareIntentKind,
  FigshareSourceIntent,
  FigshareWork,
} from '../../model/storage/FigshareSyncModel';
import type { FigshareSyncRepository } from './FigshareSyncRepository';
import { FigshareLeaseLost, nextAction } from '../../services/figshare-v2/sync-store';
import { assertJsonValue } from '../cache/validation';
import { PersistenceError } from '../errors';
const emptyWork = (): FigshareWork => ({
  requested: 0,
  processed: 0,
  sourceGeneration: 0,
  dueAt: null,
  policies: [],
  requestedBy: '',
});
/** All compound mutations use revision CAS; workers additionally match an unexpired owner. */
export function prismaFigshareRepository(client: CorePrismaClient): FigshareSyncRepository {
  const operation = async <T>(operation: () => Promise<T>): Promise<T> => {
    try {
      return await operation();
    } catch (error) {
      if (error instanceof PersistenceError) throw error;
      if (error && typeof error === 'object' && 'code' in error && error.code === 11000)
        throw new PersistenceError(
          'E_UNIQUE',
          'Figshare duplicate key: OID or exclusive namespace/article binding conflict.'
        );
      throw new PersistenceError(
        'figshare-operation',
        'Figshare durable state operation failed. Re-read durable state before retrying an unknown outcome.'
      );
    }
  };
  const plain = (value: unknown): void => {
    try {
      assertJsonValue(value);
    } catch {
      throw new PersistenceError(
        'invalid-figshare',
        'Figshare state requires plain JSON; inspect unsupported stored values without rewriting.'
      );
    }
  };
  const validateState = (state: FigshareSyncModel): void => {
    plain(state);
    const numeric = (value: unknown) => typeof value === 'number' && Number.isFinite(value);
    if (
      typeof state.oid !== 'string' ||
      !state.oid ||
      typeof state.brandId !== 'string' ||
      !state.brandId ||
      !Number.isSafeInteger(state.revision) ||
      state.revision < 0 ||
      !Number.isSafeInteger(state.importedGeneration) ||
      state.importedGeneration < 0 ||
      !numeric(state.leaseUntil) ||
      !numeric(state.dispatchUntil) ||
      (state.nextActionAt !== null && !numeric(state.nextActionAt)) ||
      (state.leaseOwner !== null && typeof state.leaseOwner !== 'string') ||
      !Array.isArray(state.receipts) ||
      !state.checkpoints ||
      typeof state.checkpoints !== 'object' ||
      Array.isArray(state.checkpoints) ||
      !state.work ||
      ['sync', 'cleanup', 'observe'].some(kind => {
        const work = Reflect.get(state.work, kind);
        return (
          !work ||
          typeof work !== 'object' ||
          !numeric(work.requested) ||
          !numeric(work.processed) ||
          !numeric(work.sourceGeneration) ||
          (work.dueAt !== null && !numeric(work.dueAt)) ||
          !Array.isArray(work.policies) ||
          typeof work.requestedBy !== 'string'
        );
      })
    )
      throw new PersistenceError(
        'invalid-figshare',
        'Unsupported Figshare physical state. Inventory revision/generations and numeric millisecond leases without rewriting.'
      );
  };
  const identity = (value: unknown): void => {
    if (typeof value !== 'string' || !value)
      throw new PersistenceError('invalid-figshare', 'Figshare identifiers and owners require nonempty strings.');
  };
  const duration = (value: number): void => {
    if (!Number.isFinite(value) || value <= 0)
      throw new PersistenceError(
        'invalid-figshare',
        'Figshare lease and dispatch durations require positive milliseconds.'
      );
  };
  const repository: FigshareSyncRepository = {
    async assertReady() {},
    async initialise(oid: string, brandId: string): Promise<void> {
      const initial: FigshareSyncModel = {
        oid,
        brandId,
        revision: 0,
        importedGeneration: 0,
        work: { sync: emptyWork(), cleanup: emptyWork(), observe: emptyWork() },
        nextActionAt: null,
        dispatchUntil: 0,
        leaseOwner: null,
        leaseUntil: 0,
        receipts: [],
        checkpoints: {},
        status: 'queued',
      };
      validateState(initial);
      try {
        await operation(() =>
          client.orm.figsharesync
            .where({ oid })
            .upsert({ create: { ...prismaModelValues({ ...initial }), revision: initial.revision }, update: {} })
        );
      } catch (e) {
        if (!(e instanceof Error && 'code' in e && (e.code === 11000 || e.code === 'E_UNIQUE'))) throw e;
      }
      const saved = await repository.get(oid);
      if (saved?.brandId !== brandId)
        throw new Error('Figshare record brand changed; administrative reconciliation required');
    },
    async get(oid: string): Promise<FigshareSyncModel | null> {
      identity(oid);
      // Whole-state CAS needs the physical field presence; an ORM read would turn
      // absent optional fields into null and a replacement would store those nulls.
      const row = await operation(() =>
        prismaCommand<{ state: unknown } | undefined>(
          client,
          client.query
            .from('figsharesync')
            .match(f => f.oid.eq(oid))
            .limit(1)
            .project(() => ({
              state: {
                node: Op.of('$unsetField', { field: Lit.of('_id'), input: Ref.of('$ROOT') }),
                _field: { codecId: 'mongo/json@1', nullable: false },
              },
            }))
            .build()
        )
      );
      if (!row) return null;
      validateState(row.state as FigshareSyncModel);
      return row.state as FigshareSyncModel;
    },
    async change(oid: string, fn: (state: FigshareSyncModel) => void, owner?: string): Promise<FigshareSyncModel> {
      if (owner !== undefined) identity(owner);
      for (let attempt = 0; attempt < 30; attempt++) {
        const state = await repository.get(oid);
        if (!state) throw new Error(`Missing Figshare state for ${oid}`);
        if (owner && (state.leaseOwner !== owner || state.leaseUntil <= Date.now())) throw new FigshareLeaseLost();
        const revision = state.revision;
        const brand = state.brandId;
        fn(state);
        if (state.oid !== oid || state.brandId !== brand || state.revision !== revision)
          throw new PersistenceError(
            'invalid-figshare',
            'Figshare identity, brand and revision are immutable during a state change.'
          );
        state.nextActionAt = nextAction(state.work);
        state.revision++;
        const filter: Record<string, unknown> = { oid, revision };
        if (owner) {
          filter.leaseOwner = owner;
          filter.leaseUntil = { $gt: Date.now() };
        }
        // A typed replacement stage preserves _id and exact field absence. Model patches
        // alone cannot represent whole-state replacement (including deleted optional keys).
        validateState(state);
        const result = await operation(() =>
          prismaCommand<Record<string, unknown> | null>(
            client,
            client.query
              .from('figsharesync')
              .match(prismaModelFilter(filter))
              .findOneAndUpdate(f => [
                f.stage.replaceRoot(
                  Op.of('$setField', { field: Lit.of('_id'), input: Lit.of(state), value: Ref.of('_id') })
                ),
              ])
          )
        );
        if (result) return state;
      }
      throw new Error('Figshare state contention; retry the operation');
    },
    async importSource(oid: string, brandId: string, intent: FigshareSourceIntent): Promise<void> {
      if (intent.readiness !== 'ready') return;
      await repository.initialise(oid, brandId);
      await repository.change(oid, state => {
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
          state.status = 'queued';
          delete state.error;
          if (state.auditClosed) {
            delete state.audit;
            state.auditClosed = false;
          }
        }
      });
    },
    async request(oid: string, kind: FigshareIntentKind, dueAt = Date.now(), onlyIfIdle = false): Promise<void> {
      await repository.change(oid, state => {
        const work = state.work[kind];
        if (onlyIfIdle && work.requested > work.processed) return;
        work.requested++;
        work.dueAt = work.dueAt == null ? dueAt : Math.min(work.dueAt, dueAt);
      });
    },
    async claim(oid: string, brandId: string, owner: string, leaseMs: number): Promise<FigshareSyncModel | null> {
      identity(oid);
      identity(owner);
      duration(leaseMs);
      const now = Date.now();
      const row = await operation(() =>
        client.orm.figsharesync
          .where(prismaModelFilter({ oid, brandId, leaseUntil: { $lte: now }, nextActionAt: { $ne: null, $lte: now } }))
          .update(f => [
            f.leaseOwner.set(owner),
            f.leaseUntil.set(now + leaseMs),
            f.status.set('running'),
            f.revision.inc(1),
          ])
      );
      if (!row) return null;
      const { _id, ...state } = row;
      validateState(state as unknown as FigshareSyncModel);
      return state as unknown as FigshareSyncModel;
    },
    async renew(oid: string, owner: string, leaseMs: number): Promise<void> {
      identity(oid);
      identity(owner);
      duration(leaseMs);
      const result = await operation(() =>
        client.orm.figsharesync
          .where(prismaModelFilter({ oid, leaseOwner: owner, leaseUntil: { $gt: Date.now() } }))
          .update(f => [f.leaseUntil.set(Date.now() + leaseMs), f.revision.inc(1)])
      );
      if (!result) throw new FigshareLeaseLost();
    },
    async assertOwner(oid: string, owner: string): Promise<void> {
      identity(oid);
      identity(owner);
      if (
        !(await operation(() =>
          client.orm.figsharesync
            .where(prismaModelFilter({ oid, leaseOwner: owner, leaseUntil: { $gt: Date.now() } }))
            .first()
        ))
      )
        throw new FigshareLeaseLost();
    },
    async release(oid: string, owner: string): Promise<void> {
      identity(oid);
      identity(owner);
      await operation(() =>
        client.orm.figsharesync
          .where({ oid, leaseOwner: owner })
          .update(f => [f.leaseOwner.set(null), f.leaseUntil.set(0), f.revision.inc(1)])
      );
    },
    async due(limit = 100, excludeOids: Iterable<string> = []): Promise<Array<{ oid: string; brandId: string }>> {
      const now = Date.now();
      const rows = await operation(async () => {
        let query = client.orm.figsharesync
          .where(
            prismaModelFilter({
              oid: { $nin: [...excludeOids] },
              nextActionAt: { $ne: null, $lte: now },
              dispatchUntil: { $lte: now },
            })
          )
          .orderBy({ nextActionAt: 1 });
        if (limit) query = query.limit(Math.abs(limit));
        return query.select('oid', 'brandId').all().toArray();
      });
      for (const row of rows) {
        identity(row.oid);
        identity(row.brandId);
      }
      return rows.map(row => ({ oid: row.oid!, brandId: row.brandId! }));
    },
    async dispatchClaim(oid: string, cooldownMs = 10000, extend = false): Promise<boolean> {
      identity(oid);
      duration(cooldownMs);
      const result = await operation(() =>
        client.orm.figsharesync
          .where(prismaModelFilter(extend ? { oid } : { oid, dispatchUntil: { $lte: Date.now() } }))
          .update(f => [f.dispatchUntil.set(Date.now() + cooldownMs), f.revision.inc(1)])
      );
      return !!result;
    },
    async claimAdministration(oid: string, owner: string, leaseMs: number): Promise<boolean> {
      identity(oid);
      identity(owner);
      duration(leaseMs);
      const row = await operation(() =>
        client.orm.figsharesync
          .where(prismaModelFilter({ oid, leaseUntil: { $lte: Date.now() } }))
          .update(f => [f.leaseOwner.set(owner), f.leaseUntil.set(Date.now() + leaseMs), f.revision.inc(1)])
      );
      return !!row && row.leaseOwner === owner && row.leaseUntil !== null && row.leaseUntil > Date.now();
    },
    async findOtherBinding(namespace: string, articleId: string, exceptOid: string): Promise<{ oid: string } | null> {
      const row = await operation(() =>
        client.orm.figsharesync
          .where(prismaModelFilter({ namespace, articleId, oid: { $ne: exceptOid } }))
          .select('oid')
          .first()
      );
      if (row) identity(row.oid);
      return row ? { oid: row.oid! } : null;
    },
  };
  return repository;
}
