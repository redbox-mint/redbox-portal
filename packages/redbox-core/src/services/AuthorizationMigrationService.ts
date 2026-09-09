import { metrics } from '@opentelemetry/api';
import { Services as services } from '../CoreService';
import {
  DEFAULT_ROLE_TEMPLATES,
  ROLE_ASSIGNMENT_SOURCES,
  FROZEN_LEGACY_ROUTE_BASELINE,
  LEGACY_PATH_RULE_BASELINE,
  buildRoleIdentityKey,
  isExactBrandAdminRole,
  isExactGuestRole,
  isExactSystemAdminRole,
  isRoleKey,
  validateRolePersistenceContext,
  type DefaultRoleTemplateDefinition,
  type ProtectedRoleKind,
} from '../authorization';
import type { RoleAttributes } from '../waterline-models/Role';
import type { RoleAssignmentAttributes, RoleAssignmentCreateRecord } from '../waterline-models/RoleAssignment';
import type { RoleTemplateAttributes } from '../waterline-models/RoleTemplate';
import type { UserAttributes } from '../waterline-models/User';
import {
  AuthorizationTransactionUnavailableError,
  runWithRequiredTransaction,
} from '../utilities/RequiredTransactionUtils';

export const AUTHORIZATION_MIGRATION_NAME = '20260828T120000-authorization-model-v1';
export const AUTHORIZATION_MIGRATION_DEFAULT_BATCH_SIZE = 100;
export const AUTHORIZATION_MIGRATION_MAX_BATCH_SIZE = 500;
const MIGRATION_ACTOR = 'migration:authorization-model-v1';

const authorizationMigrationMeter = metrics.getMeter('redbox.authorization');
const authorizationMigrationBatchOutcomes = authorizationMigrationMeter.createCounter(
  'redbox.authorization_migration.batch.outcomes',
  { description: 'Authorization migration batch applications by phase and outcome.', unit: '{batch}' }
);
const authorizationMigrationConflicts = authorizationMigrationMeter.createCounter(
  'redbox.authorization_migration.conflicts',
  { description: 'Authorization migration unique-conflict resolutions by phase.', unit: '{conflict}' }
);
const authorizationMigrationTransactionFailures = authorizationMigrationMeter.createCounter(
  'redbox.authorization_migration.transaction_failures',
  { description: 'Authorization migration batch transaction failures by phase.', unit: '{failure}' }
);

export type AuthorizationMigrationIssueSeverity = 'blocker' | 'warning' | 'expected';

export interface AuthorizationMigrationIssue {
  readonly code: string;
  readonly severity: AuthorizationMigrationIssueSeverity;
  readonly entityType: 'role' | 'user' | 'assignment' | 'protected-state';
  readonly entityId?: string;
}

export interface AuthorizationMigrationMetrics {
  readonly batchesApplied: number;
  readonly conflictsResolved: number;
  readonly transactionFailures: number;
}

export interface AuthorizationMigrationSummary {
  readonly rolesScanned: number;
  readonly rolesMigrated: number;
  readonly usersScanned: number;
  readonly assignmentsCreated: number;
  readonly guestAssociationsSkipped: number;
  readonly issues: readonly AuthorizationMigrationIssue[];
  readonly metrics: AuthorizationMigrationMetrics;
  /** True when the 500-entry issue cap was hit; `issues` is then a prefix, not the full set. */
  readonly issuesTruncated?: boolean;
}

export interface AuthorizationDriftReport {
  readonly generatedAt: string;
  readonly issues: readonly AuthorizationMigrationIssue[];
  readonly truncated: boolean;
  /**
   * Opaque resumption cursor describing the last fully scanned key per
   * section. Present only when `truncated` is true so operators can continue
   * a capped scan instead of re-reading from the start.
   */
  readonly continuation?: string;
  readonly summary: Readonly<Record<AuthorizationMigrationIssueSeverity, number>>;
}

interface MutableMigrationSummary {
  rolesScanned: number;
  rolesMigrated: number;
  usersScanned: number;
  assignmentsCreated: number;
  guestAssociationsSkipped: number;
  issues: AuthorizationMigrationIssue[];
  metrics: { batchesApplied: number; conflictsResolved: number; transactionFailures: number };
  issuesTruncated: boolean;
}

export type AuthorizationMigrationPhase = 'roles' | 'assignments';

export interface AuthorizationMigrationCheckpoint {
  readonly migrationName: string;
  readonly phase: AuthorizationMigrationPhase;
  readonly lastId?: string;
  readonly updatedAt: string;
  /**
   * Optimistic-concurrency revision, incremented on every successful write.
   * Durable writes CAS on this value and require `matchedCount === 1`, so a
   * concurrent writer that advanced the row between our read and our update
   * fails closed instead of silently winning. `fence`/`owner` record the
   * lease that performed the write; a writer with a lower fence (a runner
   * superseded by TTL takeover) is rejected before it can regress the cursor.
   */
  readonly revision: number;
  readonly fence?: number;
  readonly owner?: string;
  /**
   * Cumulative blocker state persisted across interrupted batches. The
   * in-memory `issues` array alone is lost when a batch transaction throws,
   * so resume merges these persisted blocker codes/counts instead of
   * silently dropping blockers found before the interruption. `issuesTruncated`
   * records whether the 500-entry issue cap was hit before the interruption.
   * Cumulative progress counters and bounded blocker metadata (entity type/id)
   * are persisted alongside so a restart resumes counts instead of resetting
   * them to zero and preserves blocker attribution.
   */
  readonly blockerCodes?: readonly string[];
  readonly blockerCount?: number;
  readonly issuesTruncated?: boolean;
  readonly blockerIssues?: readonly {
    readonly code: string;
    readonly entityType: 'role' | 'user' | 'assignment' | 'protected-state';
    readonly entityId?: string;
  }[];
  readonly rolesScanned?: number;
  readonly usersScanned?: number;
  readonly assignmentsCreated?: number;
  readonly guestAssociationsSkipped?: number;
  readonly batchesApplied?: number;
  readonly conflictsResolved?: number;
  readonly transactionFailures?: number;
}

const MIGRATION_CHECKPOINT_COLLECTION = 'authorizationmigrationcheckpoint';
const MIGRATION_LEASE_COLLECTION = 'authorizationmigrationlease';
export const MIGRATION_LEASE_TTL_MS = 5 * 60 * 1000;
export const MIGRATION_LEASE_RENEW_INTERVAL_MS = Math.floor(MIGRATION_LEASE_TTL_MS / 2);
const migrationCheckpointMemory = new Map<string, AuthorizationMigrationCheckpoint>();
const migrationLeaseMemory = new Map<string, { owner: string; fence: number; expiresAt: number }>();
let migrationLeaseFenceCounter = 0;
function nextLeaseFence(prevFence?: number): number {
  const base = typeof prevFence === 'number' && Number.isSafeInteger(prevFence) && prevFence >= 0 ? prevFence : 0;
  migrationLeaseFenceCounter = Math.max(migrationLeaseFenceCounter + 1, base + 1);
  return migrationLeaseFenceCounter;
}

/**
 * Fencing-token lease handle. `fence` is monotonically increasing across
 * owners: every takeover allocates a strictly greater fence, so a runner
 * that lost the lease (TTL expiry + takeover) can never again mutate
 * checkpoints even if its process is still alive. The handle is callable as
 * the legacy release function so existing `await release()` call sites keep
 * working; new code should use `.release()` / `.renew()`.
 */
export interface MigrationLeaseHandle {
  readonly owner: string;
  readonly fence: number;
  expiresAt: number;
  renew(): Promise<void>;
  release(): Promise<void>;
}

export type MigrationLeaseRelease = MigrationLeaseHandle & (() => Promise<void>);

export interface MigrationLeaseState {
  readonly owner: string;
  readonly fence: number;
  readonly expiresAt: number;
}

function attachLeaseHandle(release: () => Promise<void>, state: MigrationLeaseState): MigrationLeaseRelease {
  // `Object.assign` on the release function yields the callable-plus-handle
  // intersection structurally; no cast is needed or used.
  const handle: MigrationLeaseRelease = Object.assign(release, {
    owner: state.owner,
    fence: state.fence,
    expiresAt: state.expiresAt,
    renew: async (): Promise<void> => {
      await renewMigrationLease(handle);
    },
    release,
  });
  return handle;
}

/** Process-wide active lease set by MigrationRunner for the duration of `umzug.up()`. */
let activeMigrationLease: Pick<MigrationLeaseHandle, 'owner' | 'fence'> | undefined;
export function setActiveMigrationLease(lease: Pick<MigrationLeaseHandle, 'owner' | 'fence'> | undefined): void {
  activeMigrationLease = lease;
}
export function getActiveMigrationLease(): Pick<MigrationLeaseHandle, 'owner' | 'fence'> | undefined {
  return activeMigrationLease;
}
/** Test-only reset for the active lease and in-memory mirrors. */
export function __resetMigrationLeaseStateForTests(): void {
  activeMigrationLease = undefined;
  migrationLeaseMemory.clear();
  migrationCheckpointMemory.clear();
  migrationLeaseFenceCounter = 0;
}

/**
 * Durable uniqueness contract for the native checkpoint/lease collections
 * (mirrored in `AuthorizationPersistenceService.AUTHORIZATION_NATIVE_COLLECTION_INDEXES`):
 * `{ migrationName: 1, phase: 1 }` unique on the checkpoint collection and
 * `{ migrationName: 1 }` unique on the lease collection. `ensureMigrationCheckpointIndexes()`
 * materialises them on Mongo; concurrent writers that bypass the lease still
 * fail closed on duplicate-key instead of forking checkpoint rows.
 */
export const AUTHORIZATION_MIGRATION_CHECKPOINT_UNIQUE_KEYS = Object.freeze({
  checkpoint: Object.freeze({ migrationName: 1, phase: 1 }),
  lease: Object.freeze({ migrationName: 1 }),
});

interface IndexManageableCollection {
  createIndex?(key: unknown, options: unknown): Promise<unknown>;
  createIndexes?(indexes: readonly unknown[]): Promise<unknown>;
}

function asIndexManageableCollection(value: unknown): IndexManageableCollection | undefined {
  if (!isObject(value)) return undefined;
  const createIndex = value.createIndex;
  const createIndexes = value.createIndexes;
  if (typeof createIndex !== 'function' && typeof createIndexes !== 'function') return undefined;
  const collection: IndexManageableCollection = {};
  if (typeof createIndex === 'function') {
    collection.createIndex = (key: unknown, options: unknown): Promise<unknown> =>
      Reflect.apply(createIndex, value, [key, options]);
  }
  if (typeof createIndexes === 'function') {
    collection.createIndexes = (indexes: readonly unknown[]): Promise<unknown> =>
      Reflect.apply(createIndexes, value, [indexes]);
  }
  return collection;
}

export async function ensureMigrationCheckpointIndexes(): Promise<void> {
  const datastore: unknown = Role.getDatastore?.();
  if (!isObject(datastore)) return;
  const manager = asNativeCollectionManager(datastore.manager);
  if (manager === undefined) return;
  for (const [collectionName, key] of [
    [MIGRATION_CHECKPOINT_COLLECTION, AUTHORIZATION_MIGRATION_CHECKPOINT_UNIQUE_KEYS.checkpoint],
    [MIGRATION_LEASE_COLLECTION, AUTHORIZATION_MIGRATION_CHECKPOINT_UNIQUE_KEYS.lease],
  ] as const) {
    try {
      const collection = asIndexManageableCollection(manager.collection(collectionName));
      if (collection === undefined) continue;
      if (typeof collection.createIndex === 'function') {
        await collection.createIndex(key, { unique: true, name: `${String(collectionName)}_unique` });
      } else if (typeof collection.createIndexes === 'function') {
        await collection.createIndexes([{ key, unique: true, name: `${String(collectionName)}_unique` }]);
      }
    } catch {
      // Best-effort on adapters without index management; the lease CAS and
      // duplicate-row detection below still fail closed.
    }
  }
}

function migrationLeaseKey(): string {
  return AUTHORIZATION_MIGRATION_NAME;
}

function newLeaseOwner(): string {
  const host = typeof process?.versions?.node === 'string' ? `${process.pid}` : 'lift';
  return `migration-lease:${Date.now()}:${host}:${Math.random().toString(36).slice(2, 10)}`;
}

interface LeaseCollection {
  findOne(filter: unknown): Promise<unknown>;
  insertOne?(doc: unknown): Promise<unknown>;
  updateOne(filter: unknown, update: unknown, options?: unknown): Promise<unknown>;
  deleteOne?(filter: unknown): Promise<unknown>;
}

function isLeaseCollection(value: unknown): value is LeaseCollection {
  if (!isObject(value)) return false;
  if (typeof value.findOne !== 'function' || typeof value.updateOne !== 'function') return false;
  const optional: readonly string[] = ['insertOne', 'deleteOne'];
  for (const method of optional) {
    const candidate = value[method];
    if (candidate !== undefined && typeof candidate !== 'function') return false;
  }
  return true;
}

function migrationLeaseCollection(): LeaseCollection | undefined {
  try {
    const datastore: unknown = Role.getDatastore?.();
    if (!isObject(datastore)) return undefined;
    const manager = asNativeCollectionManager(datastore.manager);
    if (manager === undefined) return undefined;
    const collection: unknown = manager.collection(MIGRATION_LEASE_COLLECTION);
    return isLeaseCollection(collection) ? collection : undefined;
  } catch {
    return undefined;
  }
}

function parseLeaseFence(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 ? value : undefined;
}

function parseLeaseRow(value: unknown): MigrationLeaseState | undefined {
  if (!isObject(value)) return undefined;
  const owner = value.owner;
  if (typeof owner !== 'string' || owner.length === 0) return undefined;
  const fence = parseLeaseFence(value.fence);
  if (fence === undefined) return undefined;
  const rawExpires = value.expiresAt;
  const expiresAt =
    rawExpires instanceof Date
      ? rawExpires.getTime()
      : typeof rawExpires === 'number' && Number.isFinite(rawExpires)
        ? rawExpires
        : typeof rawExpires === 'string' && rawExpires.length > 0
          ? Date.parse(rawExpires)
          : NaN;
  if (!Number.isFinite(expiresAt)) return undefined;
  return { owner, fence, expiresAt };
}

/** Raw durable lease row (unvalidated) so callers can distinguish missing from malformed. */
async function readRawLeaseRow(collection: LeaseCollection): Promise<unknown> {
  if (typeof collection.findOne !== 'function') return undefined;
  return collection.findOne({ migrationName: migrationLeaseKey() });
}

interface NativeUpdateResult {
  readonly matchedCount?: unknown;
  readonly modifiedCount?: unknown;
  readonly upsertedCount?: unknown;
  readonly deletedCount?: unknown;
}

function asNativeUpdateResult(value: unknown): NativeUpdateResult | undefined {
  if (!isObject(value)) return undefined;
  const result: NativeUpdateResult = {};
  for (const key of ['matchedCount', 'modifiedCount', 'upsertedCount', 'deletedCount'] as const) {
    const candidate = value[key];
    if (candidate !== undefined) {
      if (typeof candidate !== 'number' || !Number.isFinite(candidate)) return undefined;
      (result as Record<string, unknown>)[key] = candidate;
    }
  }
  return result;
}

/** Affected-row count when the driver reports counts; `undefined` for count-less test doubles (`{}`). */
function affectedRowCount(value: unknown): number | undefined {
  const result = asNativeUpdateResult(value);
  if (result === undefined) return undefined;
  const keys = ['matchedCount', 'modifiedCount', 'upsertedCount', 'deletedCount'] as const;
  const reported = keys.some(key => result[key] !== undefined);
  if (!reported) return undefined;
  return (
    Number(result.matchedCount ?? 0) +
    Number(result.modifiedCount ?? 0) +
    Number(result.upsertedCount ?? 0) +
    Number(result.deletedCount ?? 0)
  );
}

function hasReportedCounts(value: unknown): boolean {
  const result = asNativeUpdateResult(value);
  if (result === undefined) return false;
  return (
    result.matchedCount !== undefined ||
    result.modifiedCount !== undefined ||
    result.upsertedCount !== undefined ||
    result.deletedCount !== undefined
  );
}

/**
 * Fail-closed lease-holder assertion for checkpoint and migration gating.
 * The durable row must be present, well-formed, unexpired, and held by the
 * exact `owner`+`fence`. A missing, malformed, expired, or foreign row
 * rejects; read failures propagate instead of being treated as absent.
 */
export async function assertMigrationLeaseHeld(lease: Pick<MigrationLeaseHandle, 'owner' | 'fence'>): Promise<void> {
  const collection = migrationLeaseCollection();
  const nowMs = Date.now();
  if (collection === undefined) {
    if (process.env.NODE_ENV === 'production' || !memoryCheckpointFallbackAllowed()) {
      throw new Error(
        `Authorization migration lease for owner '${lease.owner}' requires a durable lease collection in production.`
      );
    }
    const held = migrationLeaseMemory.get(migrationLeaseKey());
    if (held === undefined) {
      throw new Error(
        `Authorization migration lease for owner '${lease.owner}' has no durable lease row; failing closed.`
      );
    }
    if (held.owner !== lease.owner || held.fence !== lease.fence) {
      throw new Error(
        `Authorization migration lease for owner '${lease.owner}' was superseded (fence ${lease.fence}); failing closed.`
      );
    }
    if (held.expiresAt <= nowMs) {
      throw new Error(
        `Authorization migration lease for owner '${lease.owner}' expired; failing closed instead of running past the lease.`
      );
    }
    return;
  }
  const raw = await readRawLeaseRow(collection);
  if (raw === undefined || raw === null) {
    throw new Error(
      `Authorization migration lease for owner '${lease.owner}' has no durable lease row; failing closed.`
    );
  }
  const held = parseLeaseRow(raw);
  if (held === undefined) {
    throw new Error('Authorization migration lease row is malformed; failing closed instead of running unguarded.');
  }
  if (held.owner !== lease.owner || held.fence !== lease.fence) {
    throw new Error(
      `Authorization migration lease for owner '${lease.owner}' was superseded (holder fence ${held.fence}); failing closed.`
    );
  }
  if (held.expiresAt <= nowMs) {
    throw new Error(
      `Authorization migration lease for owner '${lease.owner}' expired; failing closed instead of running past the lease.`
    );
  }
}

/**
 * Durable fencing tombstone: release expires the row in place while retaining
 * `owner`+`fence`, so a restart or a new owner allocates a strictly greater
 * fence from the retained sequence instead of restarting at zero after a
 * delete. The CAS filter guarantees a superseded releaser never expires its
 * successor's row. Best-effort: TTL bounds a failed release.
 */
async function releaseLeaseTombstone(
  collection: LeaseCollection,
  lease: Pick<MigrationLeaseHandle, 'owner' | 'fence'>
): Promise<void> {
  try {
    await collection.updateOne(
      { migrationName: migrationLeaseKey(), owner: lease.owner, fence: lease.fence },
      { $set: { expiresAt: new Date(Date.now()), released: true } },
      { upsert: false }
    );
  } catch {
    /* release is best-effort; TTL bounds the lease */
  }
}

/** Observability read of the current lease holder (durable row or memory mirror). */
export async function readMigrationLease(): Promise<MigrationLeaseState | undefined> {
  const collection = migrationLeaseCollection();
  if (collection === undefined) {
    if (process.env.NODE_ENV === 'production' || !memoryCheckpointFallbackAllowed()) return undefined;
    const held = migrationLeaseMemory.get(migrationLeaseKey());
    return held === undefined ? undefined : { owner: held.owner, fence: held.fence, expiresAt: held.expiresAt };
  }
  if (typeof collection.findOne !== 'function') return undefined;
  return parseLeaseRow(await collection.findOne({ migrationName: migrationLeaseKey() }));
}

/**
 * Distributed migration lease: at most one lift worker may advance migration
 * checkpoints at a time. Acquire with insert-or-CAS-takeover-when-expired;
 * a live lease held by another owner fails closed. Every acquisition carries
 * a monotonically increasing fencing token: a fresh row starts above any
 * previously observed fence and every takeover allocates `prevFence + 1`, so
 * a runner that held the lease before a TTL expiry can never fence a
 * successor. Memory fallback only under the explicit test opt-in. Returns a
 * fencing handle that is also callable as the legacy release function and
 * expires in place (tombstone, fence retained) only when this owner+fence
 * still holds the lease (CAS owner check).
 * Long migrations must call `renew()` (or `renewMigrationLease(handle)`)
 * at least every TTL; `MigrationRunner` runs that heartbeat automatically.
 */
export async function acquireMigrationLease(owner = newLeaseOwner()): Promise<MigrationLeaseRelease> {
  const collection = migrationLeaseCollection();
  if (collection === undefined) {
    if (process.env.NODE_ENV === 'production' || !memoryCheckpointFallbackAllowed()) {
      throw new Error(
        'Authorization migration lease requires a durable lease collection outside explicit test fallback.'
      );
    }
    const now = Date.now();
    const held = migrationLeaseMemory.get(migrationLeaseKey());
    if (held !== undefined && held.expiresAt > now && held.owner !== owner) {
      throw new Error(`Authorization migration is already running under lease owner '${held.owner}'.`);
    }
    const fence =
      held !== undefined && held.owner === owner
        ? held.fence
        : nextLeaseFence(held !== undefined ? held.fence : undefined);
    const state: MigrationLeaseState = { owner, fence, expiresAt: now + MIGRATION_LEASE_TTL_MS };
    migrationLeaseMemory.set(migrationLeaseKey(), { owner, fence, expiresAt: state.expiresAt });
    const release = async (): Promise<void> => {
      const current = migrationLeaseMemory.get(migrationLeaseKey());
      // Tombstone in place (expired, fence retained) so a later owner
      // allocates a strictly greater fence from the retained sequence.
      if (current !== undefined && current.owner === owner && current.fence === fence)
        migrationLeaseMemory.set(migrationLeaseKey(), { owner, fence, expiresAt: Date.now() });
    };
    return attachLeaseHandle(release, state);
  }
  const now = new Date();
  const nowMs = now.getTime();
  try {
    const existingRaw =
      typeof collection.findOne === 'function'
        ? await collection.findOne({ migrationName: migrationLeaseKey() })
        : undefined;
    // A present-but-malformed row proves a forked or corrupted lease state:
    // fail closed instead of treating it as absent and forking a second row.
    if (existingRaw !== undefined && existingRaw !== null && parseLeaseRow(existingRaw) === undefined) {
      throw new Error('Authorization migration lease row is malformed; failing closed instead of taking over.');
    }
    const existing = parseLeaseRow(existingRaw);
    if (existing !== undefined && existing.owner === owner && existing.expiresAt > nowMs) {
      const state: MigrationLeaseState = { owner, fence: existing.fence, expiresAt: existing.expiresAt };
      const release = async (): Promise<void> => {
        await releaseLeaseTombstone(collection, { owner, fence: existing.fence });
      };
      return attachLeaseHandle(release, state);
    }
    if (existing !== undefined && existing.expiresAt > nowMs) {
      throw new Error(`Authorization migration is already running under lease owner '${existing.owner}'.`);
    }
    const fence = nextLeaseFence(existing?.fence);
    if (typeof collection.insertOne === 'function' && existing === undefined) {
      try {
        await collection.insertOne({
          migrationName: migrationLeaseKey(),
          owner,
          fence,
          expiresAt: new Date(nowMs + MIGRATION_LEASE_TTL_MS),
        });
        const state: MigrationLeaseState = { owner, fence, expiresAt: nowMs + MIGRATION_LEASE_TTL_MS };
        const release = async (): Promise<void> => {
          await releaseLeaseTombstone(collection, { owner, fence });
        };
        return attachLeaseHandle(release, state);
      } catch {
        // Row appeared concurrently: fall through to fenced CAS takeover below.
      }
    }
    // Fenced CAS takeover: match the exact fence observed above so concurrent
    // takers serialize; the winner's fence is strictly greater, which is what
    // makes every checkpoint mutation able to reject the stale loser.
    const filter =
      existing === undefined
        ? { migrationName: migrationLeaseKey(), expiresAt: { $lte: now } }
        : {
            migrationName: migrationLeaseKey(),
            fence: existing.fence,
            $or: [{ owner }, { expiresAt: { $lte: now } }],
          };
    const taken = await collection.updateOne(
      filter,
      { $set: { owner, fence, expiresAt: new Date(nowMs + MIGRATION_LEASE_TTL_MS) } },
      { upsert: false }
    );
    // Count-less doubles (`{}`) cannot prove the CAS won: reread the row and
    // accept only when it now carries this owner+fence. Real drivers must
    // report exactly one affected row.
    if (!hasReportedCounts(taken)) {
      const confirm = parseLeaseRow(
        typeof collection.findOne === 'function'
          ? await collection.findOne({ migrationName: migrationLeaseKey() })
          : undefined
      );
      if (confirm !== undefined && confirm.owner === owner && confirm.fence === fence) {
        const state: MigrationLeaseState = { owner, fence, expiresAt: nowMs + MIGRATION_LEASE_TTL_MS };
        const release = async (): Promise<void> => {
          await releaseLeaseTombstone(collection, { owner, fence });
        };
        return attachLeaseHandle(release, state);
      }
      throw new Error(`Authorization migration is already running under lease owner 'unknown'.`);
    }
    const matched = affectedRowCount(taken) ?? 0;
    if (matched < 1) {
      const reread = parseLeaseRow(
        typeof collection.findOne === 'function'
          ? await collection.findOne({ migrationName: migrationLeaseKey() })
          : undefined
      );
      const holder = reread !== undefined ? reread.owner : 'unknown';
      throw new Error(`Authorization migration is already running under lease owner '${holder}'.`);
    }
    const state: MigrationLeaseState = { owner, fence, expiresAt: nowMs + MIGRATION_LEASE_TTL_MS };
    const release = async (): Promise<void> => {
      await releaseLeaseTombstone(collection, { owner, fence });
    };
    return attachLeaseHandle(release, state);
  } catch (error) {
    if (error instanceof Error && error.message.startsWith('Authorization migration is already running')) throw error;
    throw error instanceof Error ? error : new Error('Authorization migration lease acquisition failed.');
  }
}

/**
 * Renew a held lease for another full TTL. Verifies owner+fence still match
 * the stored row and the row has not expired or been taken over (higher
 * fence): a stale runner whose TTL lapsed fails closed here instead of
 * continuing to mutate checkpoints past its lease.
 */
export async function renewMigrationLease(lease: MigrationLeaseHandle): Promise<void> {
  const collection = migrationLeaseCollection();
  const nowMs = Date.now();
  if (collection === undefined) {
    if (process.env.NODE_ENV === 'production' || !memoryCheckpointFallbackAllowed()) {
      throw new Error(
        'Authorization migration lease requires a durable lease collection outside explicit test fallback.'
      );
    }
    const held = migrationLeaseMemory.get(migrationLeaseKey());
    if (held === undefined || held.owner !== lease.owner || held.fence !== lease.fence) {
      throw new Error(
        `Authorization migration lease for owner '${lease.owner}' was superseded (fence ${lease.fence}); failing closed.`
      );
    }
    if (held.expiresAt <= nowMs) {
      throw new Error(
        `Authorization migration lease for owner '${lease.owner}' expired; failing closed instead of renewing a stale runner.`
      );
    }
    const expiresAt = nowMs + MIGRATION_LEASE_TTL_MS;
    migrationLeaseMemory.set(migrationLeaseKey(), { owner: held.owner, fence: held.fence, expiresAt });
    lease.expiresAt = expiresAt;
    return;
  }
  const now = new Date(nowMs);
  const taken = await collection.updateOne(
    {
      migrationName: migrationLeaseKey(),
      owner: lease.owner,
      fence: lease.fence,
      expiresAt: { $gt: now },
    },
    { $set: { expiresAt: new Date(nowMs + MIGRATION_LEASE_TTL_MS) } },
    { upsert: false }
  );
  // Count-less doubles cannot prove the CAS won: reread and accept only when
  // the row still carries this owner+fence with a fresh expiry.
  if (!hasReportedCounts(taken)) {
    const confirm = parseLeaseRow(await readRawLeaseRow(collection));
    if (confirm !== undefined && confirm.owner === lease.owner && confirm.fence === lease.fence) {
      lease.expiresAt = confirm.expiresAt;
      return;
    }
    throw new Error(
      `Authorization migration lease for owner '${lease.owner}' was superseded or expired (fence ${lease.fence}); failing closed.`
    );
  }
  const matched = affectedRowCount(taken) ?? 0;
  if (matched < 1) {
    throw new Error(
      `Authorization migration lease for owner '${lease.owner}' was superseded or expired (fence ${lease.fence}); failing closed.`
    );
  }
  lease.expiresAt = nowMs + MIGRATION_LEASE_TTL_MS;
}

/** Resolve the lease a checkpoint mutation must be fenced by (explicit argument wins). */
function effectiveCheckpointLease(
  explicit?: Pick<MigrationLeaseHandle, 'owner' | 'fence'>
): Pick<MigrationLeaseHandle, 'owner' | 'fence'> | undefined {
  if (explicit !== undefined) {
    if (typeof explicit.owner !== 'string' || explicit.owner.length === 0) return undefined;
    if (typeof explicit.fence !== 'number' || !Number.isSafeInteger(explicit.fence)) return undefined;
    return explicit;
  }
  return activeMigrationLease;
}

async function assertCheckpointLeaseValid(
  lease: Pick<MigrationLeaseHandle, 'owner' | 'fence'>,
  operation: string,
  prevFence?: number,
  sessionLease?: LeaseCollection
): Promise<void> {
  const nowMs = Date.now();
  const collection = sessionLease ?? migrationLeaseCollection();
  if (collection === undefined) {
    if (process.env.NODE_ENV === 'production' || !memoryCheckpointFallbackAllowed()) {
      throw new Error(
        `Authorization migration checkpoint ${operation} requires a durable checkpoint collection in production.`
      );
    }
    const held = migrationLeaseMemory.get(migrationLeaseKey());
    // Production fail-closed: a checkpoint mutation without a lease row is
    // never allowed. The memory mirror is test-only, so a missing holder
    // still fails closed here; pure unit-test doubles exercise the
    // fence-monotonicity path via `prevFence` below only when no holder was
    // ever registered AND the checkpoint row itself carries no fence.
    if (held === undefined) {
      if (prevFence !== undefined && lease.fence < prevFence) {
        throw new Error(
          `Authorization migration checkpoint ${operation} rejected: stale fence ${lease.fence} < checkpoint fence ${prevFence}.`
        );
      }
      if (prevFence !== undefined && prevFence > 0) {
        throw new Error(
          `Authorization migration checkpoint ${operation} rejected: no lease row for fenced checkpoint (fence ${prevFence}).`
        );
      }
      return;
    }
    if (held.owner !== lease.owner || held.fence !== lease.fence) {
      throw new Error(
        `Authorization migration checkpoint ${operation} rejected: lease owner/fence mismatch (stale runner fence ${lease.fence}).`
      );
    }
    if (held.expiresAt <= nowMs) {
      throw new Error(
        `Authorization migration checkpoint ${operation} rejected: lease for owner '${lease.owner}' expired.`
      );
    }
    if (prevFence !== undefined && lease.fence < prevFence) {
      throw new Error(
        `Authorization migration checkpoint ${operation} rejected: stale fence ${lease.fence} < checkpoint fence ${prevFence}.`
      );
    }
    return;
  }
  // Durable path: the lease row must exist, parse, be unexpired, and match
  // the exact owner+fence. A missing row, a malformed row, an expired row,
  // or a foreign holder all fail closed. Read errors propagate. When called
  // with a session-bound collection from `runCheckpointMutationAtomically`,
  // this read participates in the same required transaction/session as the
  // checkpoint mutation, so the owner+fence predicate and the write commit
  // or abort atomically with no check-then-act window.
  const raw = await readRawLeaseRow(collection);
  if (raw === undefined || raw === null) {
    throw new Error(
      `Authorization migration checkpoint ${operation} rejected: no durable lease row for owner '${lease.owner}'.`
    );
  }
  const held = parseLeaseRow(raw);
  if (held === undefined) {
    throw new Error(
      `Authorization migration checkpoint ${operation} rejected: durable lease row is malformed; failing closed.`
    );
  }
  if (held.owner !== lease.owner || held.fence !== lease.fence) {
    throw new Error(
      `Authorization migration checkpoint ${operation} rejected: lease owner/fence mismatch (stale runner fence ${lease.fence}, holder fence ${held.fence}).`
    );
  }
  if (held.expiresAt <= nowMs) {
    throw new Error(
      `Authorization migration checkpoint ${operation} rejected: lease for owner '${lease.owner}' expired.`
    );
  }
  if (prevFence !== undefined && lease.fence < prevFence) {
    throw new Error(
      `Authorization migration checkpoint ${operation} rejected: stale fence ${lease.fence} < checkpoint fence ${prevFence}.`
    );
  }
}

/**
 * Conditional owner+fence/unexpired lease write fence in the same
 * transaction/session as the checkpoint mutation. The filter pins
 * `{ migrationName, owner, fence }` plus `expiresAt > now`, so a TTL takeover
 * that rewrites the lease row between our read and our commit makes this
 * write match zero rows (or abort with a write conflict on real drivers)
 * instead of committing a stale checkpoint. Refreshing `expiresAt` also acts
 * as a write heartbeat for the active holder. Count-less doubles (`{}`)
 * cannot prove the fence either way and are accepted so memory-backed unit
 * doubles keep working; real drivers must report exactly one matched row.
 */
async function writeSessionLeaseFence(
  collection: LeaseCollection,
  lease: Pick<MigrationLeaseHandle, 'owner' | 'fence'>,
  operation: string
): Promise<void> {
  const now = new Date(Date.now());
  const result = await collection.updateOne(
    {
      migrationName: migrationLeaseKey(),
      owner: lease.owner,
      fence: lease.fence,
      expiresAt: { $gt: now },
    },
    { $set: { expiresAt: new Date(now.getTime() + MIGRATION_LEASE_TTL_MS) } },
    { upsert: false }
  );
  if (hasReportedCounts(result) && (affectedRowCount(result) ?? 0) < 1) {
    throw new Error(
      `Authorization migration checkpoint ${operation} rejected: lease write fence matched 0 rows for owner '${lease.owner}' (fence ${lease.fence}); failing closed.`
    );
  }
}

/**
 * Shared session-bound bootstrap/marker lease fence for datastores other than
 * the checkpoint datastore (migration markers, catalog/template, Guest-role,
 * system-role, system-assignment, success-audit transactions).
 *
 * Resolves the `authorizationmigrationlease` collection from the caller's own
 * transaction connection/session, validates the exact `owner`+`fence` holder
 * is live (present, well-formed, unexpired), then issues the same conditional
 * owner+fence+unexpired write fence (`updateOne` heartbeat) in that session so
 * a TTL takeover between the read and the mutation commits aborts instead of
 * committing stale state. All three steps share the caller's transaction: the
 * predicate and the mutation commit or abort atomically with no check-then-act
 * window.
 *
 * Fail-closed contract: when the session exposes no lease collection while a
 * durable lease collection exists anywhere (split-datastore topology where the
 * lease is not represented in the mutating datastore), production rejects
 * instead of mutating past the lease. Memory-mirror fallback applies only
 * under the explicit test opt-in, mirroring `assertCheckpointLeaseValid`.
 */
export async function fenceLeaseInMutationSession(
  lease: Pick<MigrationLeaseHandle, 'owner' | 'fence'>,
  connection: unknown,
  operation: string,
  prevFence?: number
): Promise<void> {
  const sessionLease = sessionLeaseCollectionForConnection(connection);
  if (sessionLease !== undefined) {
    await assertCheckpointLeaseValid(lease, operation, prevFence, sessionLease);
    await writeSessionLeaseFence(sessionLease, lease, operation);
    return;
  }
  // No session-bound lease collection on this connection: fall back to the
  // canonical lease read + fence only when no durable lease collection exists
  // anywhere (pure unit-test doubles). Otherwise the lease is not represented
  // in the mutating datastore and the mutation must fail closed: a
  // cross-datastore read cannot fence a same-session commit.
  if (migrationLeaseCollection() !== undefined) {
    throw new AuthorizationTransactionUnavailableError(
      `Authorization migration ${operation} requires a session-bound lease collection; the lease is not represented in the mutating datastore.`
    );
  }
  await assertCheckpointLeaseValid(lease, operation, prevFence, undefined);
}

/** Resolve the session-bound lease collection from a transaction connection. */
function sessionLeaseCollectionForConnection(connection: unknown): LeaseCollection | undefined {
  if (!isObject(connection) || typeof connection.collection !== 'function') return undefined;
  try {
    const raw: unknown = Reflect.apply(connection.collection, connection, [MIGRATION_LEASE_COLLECTION]);
    return isLeaseCollection(raw) ? raw : undefined;
  } catch {
    return undefined;
  }
}

function migrationCheckpointKey(phase: AuthorizationMigrationPhase): string {
  return `${AUTHORIZATION_MIGRATION_NAME}:${phase}`;
}

/**
 * Declared runtime-boundary interfaces. Waterline globals, datastore managers,
 * and native cursors cross an untyped JS boundary, so every adapter below
 * validates the runtime shape with a type guard before use instead of casting
 * blindly. A shape mismatch yields `undefined`/empty (fail-closed), never a
 * misread foreign key.
 */
interface CheckpointCollection {
  find(filter: unknown): { limit(limit: number): { toArray(): Promise<unknown[]> } };
  insertOne?(doc: unknown): Promise<unknown>;
  updateOne(filter: unknown, update: unknown, options?: unknown): Promise<unknown>;
  deleteOne?(filter: unknown): Promise<unknown>;
}

interface NativeCollectionManager {
  collection(name: string): unknown;
}

interface ArrayCursor {
  toArray(): Promise<unknown>;
}

interface ForEachCursor {
  forEach(callback: (document: unknown) => void): unknown;
}

function isCheckpointCollection(value: unknown): value is CheckpointCollection {
  if (!isObject(value)) return false;
  if (typeof value.find !== 'function' || typeof value.updateOne !== 'function') return false;
  for (const method of ['insertOne', 'deleteOne'] as const) {
    const candidate = value[method];
    if (candidate !== undefined && typeof candidate !== 'function') return false;
  }
  return true;
}

function asNativeCollectionManager(value: unknown): NativeCollectionManager | undefined {
  if (!isObject(value) || typeof value.collection !== 'function') return undefined;
  const collectionFn = value.collection;
  return { collection: (name: string): unknown => Reflect.apply(collectionFn, value, [name]) };
}

function isArrayCursor(value: unknown): value is ArrayCursor {
  return isObject(value) && typeof value.toArray === 'function';
}

function isForEachCursor(value: unknown): value is ForEachCursor {
  return isObject(value) && typeof value.forEach === 'function';
}

function isAsyncIterableCursor(value: unknown): value is AsyncIterable<unknown> {
  if (!isObject(value)) return false;
  return typeof Reflect.get(value, Symbol.asyncIterator) === 'function';
}

/** Ambient Sails global behind a validated read; `undefined` outside Sails. */
function readSailsGlobal(): Record<string, unknown> | undefined {
  const candidate: unknown = Reflect.get(globalThis, 'sails');
  return isObject(candidate) ? candidate : undefined;
}

function migrationCheckpointCollection(): CheckpointCollection | undefined {
  try {
    const datastore: unknown = Role.getDatastore?.();
    if (!isObject(datastore)) return undefined;
    const manager = asNativeCollectionManager(datastore.manager);
    if (manager === undefined) return undefined;
    const collection: unknown = manager.collection(MIGRATION_CHECKPOINT_COLLECTION);
    return isCheckpointCollection(collection) ? collection : undefined;
  } catch {
    return undefined;
  }
}

function migrationCheckpointDatastore(): Sails.Datastore | null | undefined {
  try {
    return Role.getDatastore?.() as Sails.Datastore | null | undefined;
  } catch {
    return undefined;
  }
}

/** True when the checkpoint datastore can run required transactions/sessions. */
function isCheckpointTransactionCapable(datastore: unknown): boolean {
  if (!isObject(datastore)) return false;
  if (typeof datastore.transaction === 'function') return true;
  const manager: unknown = datastore.manager;
  if (!isObject(manager)) return false;
  const client: unknown = manager.client;
  if (!isObject(client)) return false;
  return typeof client.startSession === 'function';
}

/** Session-bound native collections for a required-transaction connection. */
function sessionNativeCollections(connection: unknown): {
  lease?: LeaseCollection;
  checkpoint?: CheckpointCollection;
} {
  if (!isObject(connection) || typeof connection.collection !== 'function') return {};
  try {
    const leaseRaw: unknown = Reflect.apply(connection.collection, connection, [MIGRATION_LEASE_COLLECTION]);
    const checkpointRaw: unknown = Reflect.apply(connection.collection, connection, [MIGRATION_CHECKPOINT_COLLECTION]);
    return {
      ...(isLeaseCollection(leaseRaw) ? { lease: leaseRaw } : {}),
      ...(isCheckpointCollection(checkpointRaw) ? { checkpoint: checkpointRaw } : {}),
    };
  } catch {
    return {};
  }
}

/**
 * Runs a durable checkpoint/lease mutation atomically lease-fenced in a single
 * required transaction/session whenever the datastore supports it, so the
 * conditional owner+fence lease predicate and the checkpoint insert/update/
 * clear commit or abort together. No crash window between a lease check and
 * the mutation can leave stale durable state, and no swallowed compensation
 * is needed on the transactional path: a lease loss aborts the transaction.
 *
 * When the datastore offers no transaction capability, production fails
 * closed with `AuthorizationTransactionUnavailableError` instead of writing
 * past the lease. Non-production unit doubles without transaction support keep
 * the historical fenced CAS path (with propagating, never swallowed,
 * compensation) so deterministic memory-backed tests keep working; the
 * transactional path is exercised by doubles that provide `transaction` or a
 * native `client.startSession` (see the Phase 3 atomic-fencing tests).
 */
async function runCheckpointMutationAtomically<T>(
  operation: string,
  mutate: (session: {
    readonly lease?: LeaseCollection;
    readonly checkpoint?: CheckpointCollection;
    readonly inTransaction: boolean;
  }) => Promise<T>
): Promise<T> {
  const datastore = migrationCheckpointDatastore();
  const durablePresent = migrationLeaseCollection() !== undefined || migrationCheckpointCollection() !== undefined;
  if (!isCheckpointTransactionCapable(datastore)) {
    // Fail closed everywhere except explicit test-only doubles: the
    // process-memory mirror opt-in (`AUTHORIZATION_MIGRATION_CHECKPOINT_MEMORY=test-allowed`,
    // set only by `packages/redbox-core/test/setup.ts`) proves the caller is a
    // deterministic unit double. Production always fails closed, even when the
    // test opt-in leaks into the environment, so a production checkpoint is
    // never mutated without a session-bound fence. Development and staging
    // without transaction support must also fail closed instead of writing
    // checkpoints past the lease.
    if (process.env.NODE_ENV === 'production' || !memoryCheckpointFallbackAllowed()) {
      throw new AuthorizationTransactionUnavailableError(
        `Authorization migration checkpoint ${operation} requires datastore transaction support.`
      );
    }
    return mutate({ inTransaction: false });
  }
  return runWithRequiredTransaction(datastore, async connection => {
    const session = sessionNativeCollections(connection);
    if (durablePresent && (session.lease === undefined || session.checkpoint === undefined)) {
      throw new AuthorizationTransactionUnavailableError(
        `Authorization migration checkpoint ${operation} requires session-bound lease/checkpoint collections.`
      );
    }
    return mutate({ ...session, inTransaction: true });
  });
}

function isCheckpointRow(value: unknown): value is {
  lastId?: unknown;
  updatedAt?: unknown;
  revision?: unknown;
  fence?: unknown;
  owner?: unknown;
  blockerCodes?: unknown;
  blockerCount?: unknown;
  issuesTruncated?: unknown;
  blockerIssues?: unknown;
  rolesScanned?: unknown;
  usersScanned?: unknown;
  assignmentsCreated?: unknown;
  guestAssociationsSkipped?: unknown;
  batchesApplied?: unknown;
  conflictsResolved?: unknown;
  transactionFailures?: unknown;
} {
  return isObject(value);
}

export interface MigrationCheckpointWriteOptions {
  readonly lease?: Pick<MigrationLeaseHandle, 'owner' | 'fence'>;
  /** Optimistic-concurrency precondition: fail when the stored revision differs. */
  readonly expectedRevision?: number;
}

export interface MigrationCheckpointClearOptions {
  readonly lease?: Pick<MigrationLeaseHandle, 'owner' | 'fence'>;
  /** Optimistic-concurrency precondition: fail when the stored revision differs. */
  readonly expectedRevision?: number;
}

/** True when a production durable mutation must prove a lease (durable row or production). */
export function isDurableMutationLeaseRequired(): boolean {
  const memoryHeld = memoryCheckpointFallbackAllowed() ? migrationLeaseMemory.get(migrationLeaseKey()) : undefined;
  const memoryLive = memoryHeld !== undefined && memoryHeld.expiresAt > Date.now();
  return process.env.NODE_ENV === 'production' || migrationLeaseCollection() !== undefined || memoryLive;
}

/**
 * Fail-closed entry guard for every exported/internal mutating entry point
 * (role/assignment batches, catalog bootstrap/reconcile, orphan apply,
 * Guest/system/bootstrap mutations). Resolves the explicit lease (wins) or
 * the runner's active lease, then requires one whenever durability can be
 * checked (production or a durable lease collection or a live memory holder).
 * Pure unit-test doubles with no holder anywhere keep the historical
 * leaseless path; every durable topology rejects before any write.
 */
export function requireMutationLeaseForDurable(
  operation: string,
  explicitLease?: Pick<MigrationLeaseHandle, 'owner' | 'fence'>
): Pick<MigrationLeaseHandle, 'owner' | 'fence'> | undefined {
  const lease = effectiveCheckpointLease(explicitLease);
  if (isDurableMutationLeaseRequired() && lease === undefined) {
    throw new Error(`Authorization migration ${operation} rejected: no lease held; acquire the migration lease first.`);
  }
  return lease;
}

/** Checkpoint writes require a lease whenever durability can be checked. */
function resolveCheckpointLeaseForMutation(
  operation: string,
  explicitLease: Pick<MigrationLeaseHandle, 'owner' | 'fence'> | undefined
): Pick<MigrationLeaseHandle, 'owner' | 'fence'> | undefined {
  const lease = effectiveCheckpointLease(explicitLease);
  // Production and any environment with a durable lease collection (or a
  // live memory holder under the test opt-in) must prove the exact
  // owner+fence lease. Pure unit-test doubles with no live holder anywhere
  // keep the historical leaseless path with fence monotonicity only; an
  // explicitly supplied lease is still validated strictly (so an expired or
  // superseded holder rejects even there).
  if (isDurableMutationLeaseRequired() && lease === undefined) {
    throw new Error(
      `Authorization migration checkpoint ${operation} rejected: no lease held; acquire the migration lease first.`
    );
  }
  return lease;
}

/** Fail-closed durability probe: production must persist checkpoints durably. */
export function migrationCheckpointDurabilityUnavailable(): boolean {
  if (process.env.NODE_ENV !== 'production')
    return migrationCheckpointCollection() === undefined && !memoryCheckpointFallbackAllowed();
  return migrationCheckpointCollection() === undefined;
}

/**
 * Explicit test-only opt-in for the process-memory checkpoint mirror. Staging
 * and development must use durable storage like production: an implicit
 * memory fallback would appear resumable but lose restart state. Unit tests
 * set `AUTHORIZATION_MIGRATION_CHECKPOINT_MEMORY=test-allowed` (see
 * `packages/redbox-core/test/setup.ts`); every other environment requires the
 * durable collection.
 */
export function memoryCheckpointFallbackAllowed(): boolean {
  return process.env.AUTHORIZATION_MIGRATION_CHECKPOINT_MEMORY === 'test-allowed';
}

function requireDurableCheckpointCollection(operation: string): CheckpointCollection {
  const collection = migrationCheckpointCollection();
  if (collection === undefined) {
    throw new Error(
      `Authorization migration checkpoint ${operation} requires a durable checkpoint collection in production.`
    );
  }
  return collection;
}

/**
 * Durable resume cursor for the migration batch loops. Prefers a native
 * checkpoint collection so an interrupted lift can resume after restart;
 * falls back to process memory only when the explicit test-only opt-in
 * `AUTHORIZATION_MIGRATION_CHECKPOINT_MEMORY=test-allowed` is set (unit
 * tests). Every other environment without a durable collection fails closed
 * so staging/dev cannot appear resumable while losing restart state.
 */
async function readCheckpointRows(
  collection: CheckpointCollection,
  phase: AuthorizationMigrationPhase
): Promise<unknown[]> {
  const limited = collection.find({ migrationName: AUTHORIZATION_MIGRATION_NAME, phase }).limit(2);
  if (!isObject(limited) || typeof limited.toArray !== 'function') {
    throw new Error(
      `Authorization migration checkpoint read for phase '${phase}' returned an unreadable cursor; failing closed.`
    );
  }
  const rows: unknown = await Reflect.apply(limited.toArray, limited, []);
  if (!Array.isArray(rows)) {
    throw new Error(
      `Authorization migration checkpoint read for phase '${phase}' returned a non-array page; failing closed.`
    );
  }
  return rows;
}

export async function readMigrationCheckpoint(
  phase: AuthorizationMigrationPhase
): Promise<AuthorizationMigrationCheckpoint | undefined> {
  const collection = migrationCheckpointCollection();
  if (collection === undefined) {
    if (process.env.NODE_ENV === 'production' || !memoryCheckpointFallbackAllowed()) {
      throw new Error(
        'Authorization migration checkpoint read requires a durable checkpoint collection outside explicit test fallback.'
      );
    }
    return migrationCheckpointMemory.get(migrationCheckpointKey(phase));
  }
  const rows = await readCheckpointRows(collection, phase);
  return parseCheckpointRows(rows, phase);
}

/** Fail-closed duplicate detection + row parsing shared by direct and session-bound reads. */
function parseCheckpointRows(
  rows: unknown[],
  phase: AuthorizationMigrationPhase
): AuthorizationMigrationCheckpoint | undefined {
  // Duplicate checkpoint rows prove concurrent writers forked state without
  // the unique index/lease: fail closed instead of reading an arbitrary
  // first row that could regress or recreate stale progress.
  if (rows.length > 1) {
    throw new Error(
      `Authorization migration checkpoint for phase '${phase}' has ${rows.length} rows; duplicate checkpoints detected. Failing closed.`
    );
  }
  return parseCheckpointRow(rows[0], phase);
}

/**
 * Session-bound checkpoint read for transactional mutations: when a required
 * transaction/session collection is supplied, the read participates in the
 * same transaction as the lease predicate and the mutation that follows.
 * Otherwise it delegates to the canonical direct reader (fail-closed on
 * duplicates, never a misread).
 */
async function readCheckpointForMutation(
  phase: AuthorizationMigrationPhase,
  sessionCheckpoint: CheckpointCollection | undefined
): Promise<AuthorizationMigrationCheckpoint | undefined> {
  if (sessionCheckpoint === undefined) return readMigrationCheckpoint(phase);
  const rows = await readCheckpointRows(sessionCheckpoint, phase);
  return parseCheckpointRows(rows, phase);
}

function parseCheckpointRow(
  row: unknown,
  phase: AuthorizationMigrationPhase
): AuthorizationMigrationCheckpoint | undefined {
  if (!isCheckpointRow(row)) return undefined;
  const blockerCodes = Array.isArray(row.blockerCodes)
    ? Object.freeze(row.blockerCodes.filter((code): code is string => typeof code === 'string').slice(0, 500))
    : undefined;
  const blockerIssues = Array.isArray(row.blockerIssues)
    ? Object.freeze(
        row.blockerIssues
          .filter(
            (
              issue
            ): issue is {
              code: string;
              entityType: 'role' | 'user' | 'assignment' | 'protected-state';
              entityId?: string;
            } =>
              isObject(issue) &&
              typeof issue.code === 'string' &&
              (issue.entityType === 'role' ||
                issue.entityType === 'user' ||
                issue.entityType === 'assignment' ||
                issue.entityType === 'protected-state') &&
              (issue.entityId === undefined || typeof issue.entityId === 'string')
          )
          // Full 500-entry detail prefix: truncating to 200 here would lose
          // attribution for blockers 201-500 and make a resumed run appear
          // untruncated. Count/truncation metadata below restores the total.
          .slice(0, 500)
      )
    : undefined;
  const counter = (value: unknown): number | undefined =>
    typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 ? value : undefined;
  const rolesScanned = counter(row.rolesScanned);
  const usersScanned = counter(row.usersScanned);
  const assignmentsCreated = counter(row.assignmentsCreated);
  const guestAssociationsSkipped = counter(row.guestAssociationsSkipped);
  const batchesApplied = counter(row.batchesApplied);
  const conflictsResolved = counter(row.conflictsResolved);
  const transactionFailures = counter(row.transactionFailures);
  const lastId = typeof row.lastId === 'string' && row.lastId.length > 0 ? row.lastId : undefined;
  const hasBlockerState =
    (blockerCodes !== undefined && blockerCodes.length > 0) ||
    (blockerIssues !== undefined && blockerIssues.length > 0) ||
    (typeof row.blockerCount === 'number' && Number.isSafeInteger(row.blockerCount) && row.blockerCount > 0) ||
    row.issuesTruncated === true;
  // A cleared checkpoint row carries no resume state: `clearMigrationCheckpoint`
  // deletes the row, but adapters without `deleteOne` retain a stateless row
  // via `$unset`. That residual row must never read back as a valid
  // checkpoint, otherwise a repaired run would resume from a stale position
  // instead of performing a full clean rerun.
  if (lastId === undefined && !hasBlockerState) return undefined;
  const revision =
    typeof row.revision === 'number' && Number.isSafeInteger(row.revision) && row.revision >= 1 ? row.revision : 1;
  const fence = parseLeaseFence(row.fence);
  const owner = typeof row.owner === 'string' && row.owner.length > 0 ? row.owner : undefined;
  return Object.freeze({
    migrationName: AUTHORIZATION_MIGRATION_NAME,
    phase,
    ...(lastId !== undefined ? { lastId } : {}),
    updatedAt:
      typeof row.updatedAt === 'string' && row.updatedAt.length > 0 ? row.updatedAt : new Date(0).toISOString(),
    revision,
    ...(fence !== undefined ? { fence } : {}),
    ...(owner !== undefined ? { owner } : {}),
    ...(blockerCodes !== undefined ? { blockerCodes } : {}),
    ...(typeof row.blockerCount === 'number' && Number.isSafeInteger(row.blockerCount) && row.blockerCount >= 0
      ? { blockerCount: row.blockerCount }
      : {}),
    ...(typeof row.issuesTruncated === 'boolean' ? { issuesTruncated: row.issuesTruncated } : {}),
    ...(blockerIssues !== undefined ? { blockerIssues } : {}),
    ...(rolesScanned !== undefined ? { rolesScanned } : {}),
    ...(usersScanned !== undefined ? { usersScanned } : {}),
    ...(assignmentsCreated !== undefined ? { assignmentsCreated } : {}),
    ...(guestAssociationsSkipped !== undefined ? { guestAssociationsSkipped } : {}),
    ...(batchesApplied !== undefined ? { batchesApplied } : {}),
    ...(conflictsResolved !== undefined ? { conflictsResolved } : {}),
    ...(transactionFailures !== undefined ? { transactionFailures } : {}),
  });
}

export interface MigrationCheckpointState {
  readonly blockerCodes?: readonly string[];
  readonly blockerCount?: number;
  readonly issuesTruncated?: boolean;
  readonly blockerIssues?: readonly {
    readonly code: string;
    readonly entityType: 'role' | 'user' | 'assignment' | 'protected-state';
    readonly entityId?: string;
  }[];
  readonly rolesScanned?: number;
  readonly usersScanned?: number;
  readonly assignmentsCreated?: number;
  readonly guestAssociationsSkipped?: number;
  readonly batchesApplied?: number;
  readonly conflictsResolved?: number;
  readonly transactionFailures?: number;
}

export async function writeMigrationCheckpoint(
  phase: AuthorizationMigrationPhase,
  lastId: string,
  state?: MigrationCheckpointState,
  options?: MigrationCheckpointWriteOptions
): Promise<AuthorizationMigrationCheckpoint> {
  if (typeof lastId !== 'string' || lastId.length === 0) {
    throw new Error(`Authorization migration checkpoint write for phase '${phase}' requires a non-empty cursor.`);
  }
  const collection = migrationCheckpointCollection();
  if (collection === undefined && (process.env.NODE_ENV === 'production' || !memoryCheckpointFallbackAllowed())) {
    requireDurableCheckpointCollection('write');
  }
  // Monotonic progress: merge with the existing row so a concurrent or
  // stale writer can never regress counters, drop blockers, or recreate a
  // cleared cursor. Counter fields take max(existing, incoming); blocker
  // codes/issues union; issuesTruncated latches true.
  const monotonic = (next: number | undefined, prev: number | undefined): number | undefined => {
    if (next === undefined) return prev;
    if (prev === undefined) return next;
    return Math.max(next, prev);
  };
  let prev: AuthorizationMigrationCheckpoint | undefined;
  if (collection !== undefined) {
    // Duplicate-row fail-closed from the reader propagates; a forked row is
    // never overwritten by the merging writer below.
    prev = await readMigrationCheckpoint(phase);
  } else if (memoryCheckpointFallbackAllowed()) {
    prev = migrationCheckpointMemory.get(migrationCheckpointKey(phase));
  }
  // Cursor monotonicity: a stale writer carrying an older cursor must never
  // regress the resume position. Equal cursors are idempotent retries and are
  // allowed; strictly older cursors fail closed.
  if (prev?.lastId !== undefined && lastId < prev.lastId) {
    throw new Error(
      `Authorization migration checkpoint for phase '${phase}' rejected stale cursor '${lastId}' < '${prev.lastId}'.`
    );
  }
  // Optimistic-concurrency precondition for racing writers that snapshot the
  // revision before mutating.
  if (options?.expectedRevision !== undefined && (prev?.revision ?? 0) !== options.expectedRevision) {
    throw new Error(
      `Authorization migration checkpoint for phase '${phase}' revision conflict: expected ${options.expectedRevision}, found ${prev?.revision ?? 0}.`
    );
  }
  // Lease/fence verification: every durable mutation verifies the writer
  // still holds the exact owner+fence lease. An explicit lease wins;
  // otherwise the Runner's active lease is used. A missing, malformed,
  // expired, or foreign holder rejects the write fail-closed.
  const lease = resolveCheckpointLeaseForMutation('write', options?.lease);
  if (lease !== undefined) {
    await assertCheckpointLeaseValid(lease, 'write', prev?.fence);
  }
  const unionCodes = (() => {
    const seen = new Set<string>([...(prev?.blockerCodes ?? []), ...(state?.blockerCodes ?? [])]);
    return seen.size > 0 ? Object.freeze([...seen].slice(0, 500)) : undefined;
  })();
  const unionIssues = (() => {
    const seen = new Map<
      string,
      { code: string; entityType: 'role' | 'user' | 'assignment' | 'protected-state'; entityId?: string }
    >();
    for (const issue of [...(prev?.blockerIssues ?? []), ...(state?.blockerIssues ?? [])]) {
      seen.set(`${issue.code}::${issue.entityType}::${issue.entityId ?? ''}`, {
        code: issue.code,
        entityType: issue.entityType,
        ...(issue.entityId !== undefined ? { entityId: issue.entityId } : {}),
      });
      if (seen.size >= 500) break;
    }
    return seen.size > 0 ? Object.freeze([...seen.values()]) : undefined;
  })();
  const nextRevision = (prev?.revision ?? 0) + 1;
  const nextFence = lease !== undefined ? lease.fence : (prev?.fence ?? 0);
  if (prev?.fence !== undefined && nextFence < prev.fence) {
    throw new Error(
      `Authorization migration checkpoint for phase '${phase}' rejected stale fence ${nextFence} < ${prev.fence}.`
    );
  }
  // Precomputed monotonic counters: each is `number | undefined` without
  // casts, spread into the frozen checkpoint only when defined.
  const nextBlockerCount = monotonic(state?.blockerCount, prev?.blockerCount);
  const nextRolesScanned = monotonic(state?.rolesScanned, prev?.rolesScanned);
  const nextUsersScanned = monotonic(state?.usersScanned, prev?.usersScanned);
  const nextAssignmentsCreated = monotonic(state?.assignmentsCreated, prev?.assignmentsCreated);
  const nextGuestAssociationsSkipped = monotonic(state?.guestAssociationsSkipped, prev?.guestAssociationsSkipped);
  const nextBatchesApplied = monotonic(state?.batchesApplied, prev?.batchesApplied);
  const nextConflictsResolved = monotonic(state?.conflictsResolved, prev?.conflictsResolved);
  const nextTransactionFailures = monotonic(state?.transactionFailures, prev?.transactionFailures);
  const checkpoint = Object.freeze({
    migrationName: AUTHORIZATION_MIGRATION_NAME,
    phase,
    lastId,
    updatedAt: new Date().toISOString(),
    revision: nextRevision,
    ...(nextFence > 0 ? { fence: nextFence } : {}),
    ...(lease !== undefined ? { owner: lease.owner } : prev?.owner !== undefined ? { owner: prev.owner } : {}),
    ...(unionCodes !== undefined ? { blockerCodes: unionCodes } : {}),
    ...(nextBlockerCount !== undefined ? { blockerCount: nextBlockerCount } : {}),
    ...(state?.issuesTruncated === true || prev?.issuesTruncated === true ? { issuesTruncated: true as const } : {}),
    ...(unionIssues !== undefined ? { blockerIssues: unionIssues } : {}),
    ...(nextRolesScanned !== undefined ? { rolesScanned: nextRolesScanned } : {}),
    ...(nextUsersScanned !== undefined ? { usersScanned: nextUsersScanned } : {}),
    ...(nextAssignmentsCreated !== undefined ? { assignmentsCreated: nextAssignmentsCreated } : {}),
    ...(nextGuestAssociationsSkipped !== undefined ? { guestAssociationsSkipped: nextGuestAssociationsSkipped } : {}),
    ...(nextBatchesApplied !== undefined ? { batchesApplied: nextBatchesApplied } : {}),
    ...(nextConflictsResolved !== undefined ? { conflictsResolved: nextConflictsResolved } : {}),
    ...(nextTransactionFailures !== undefined ? { transactionFailures: nextTransactionFailures } : {}),
  });
  if (collection !== undefined) {
    // Atomically lease-fenced durable mutation: the conditional owner+fence
    // lease predicates (pre-write assert, CAS filters pinning revision/fence/
    // owner, post-write revalidation) and the checkpoint insert/update commit
    // or abort in a single required transaction/session whenever the
    // datastore supports it, so no crash window between the lease check and
    // the write can leave stale durable state behind. Without transaction
    // support the fenced CAS path below still applies, with compensation
    // failures propagated (never swallowed) alongside the lease rejection.
    await runCheckpointMutationAtomically('write', async session => {
      const fencedCollection = session.checkpoint ?? collection;
      const fencedLease = session.lease;
      // In-transaction lease revalidation: the outer pre-write check above is
      // an early fail-fast only. This predicate runs inside the same required
      // transaction/session as the mutation below (session-bound lease row
      // read), so a TTL takeover between the outer check and the commit still
      // aborts instead of writing past the lease.
      if (lease !== undefined) {
        await assertCheckpointLeaseValid(lease, 'write', prev?.fence, fencedLease);
        // Same-session conditional write fence: a takeover between the read
        // above and the mutation below turns this write into a 0-match (or a
        // native write conflict) instead of a stale commit.
        if (session.inTransaction && fencedLease !== undefined) {
          await writeSessionLeaseFence(fencedLease, lease, 'write');
        }
      }
      try {
        const durableSet = {
          lastId,
          updatedAt: checkpoint.updatedAt,
          revision: checkpoint.revision,
          ...(checkpoint.fence !== undefined ? { fence: checkpoint.fence } : {}),
          ...(checkpoint.owner !== undefined ? { owner: checkpoint.owner } : {}),
          ...(checkpoint.blockerCodes !== undefined ? { blockerCodes: [...checkpoint.blockerCodes] } : {}),
          ...(checkpoint.blockerCount !== undefined ? { blockerCount: checkpoint.blockerCount } : {}),
          ...(checkpoint.issuesTruncated !== undefined ? { issuesTruncated: checkpoint.issuesTruncated } : {}),
          ...(checkpoint.blockerIssues !== undefined ? { blockerIssues: [...checkpoint.blockerIssues] } : {}),
          ...(checkpoint.rolesScanned !== undefined ? { rolesScanned: checkpoint.rolesScanned } : {}),
          ...(checkpoint.usersScanned !== undefined ? { usersScanned: checkpoint.usersScanned } : {}),
          ...(checkpoint.assignmentsCreated !== undefined ? { assignmentsCreated: checkpoint.assignmentsCreated } : {}),
          ...(checkpoint.guestAssociationsSkipped !== undefined
            ? { guestAssociationsSkipped: checkpoint.guestAssociationsSkipped }
            : {}),
          ...(checkpoint.batchesApplied !== undefined ? { batchesApplied: checkpoint.batchesApplied } : {}),
          ...(checkpoint.conflictsResolved !== undefined ? { conflictsResolved: checkpoint.conflictsResolved } : {}),
          ...(checkpoint.transactionFailures !== undefined
            ? { transactionFailures: checkpoint.transactionFailures }
            : {}),
        };
        // Previous row state for best-effort post-write compensation: when the
        // post-write lease fence below detects a TTL takeover, the stale update
        // is rolled back to exactly these fields under a CAS on the revision
        // just written, so a successor's newer row is never clobbered.
        const prevDurableSet =
          prev === undefined
            ? undefined
            : {
                ...(prev.lastId !== undefined ? { lastId: prev.lastId } : {}),
                updatedAt: prev.updatedAt,
                revision: prev.revision,
                ...(prev.fence !== undefined ? { fence: prev.fence } : {}),
                ...(prev.owner !== undefined ? { owner: prev.owner } : {}),
                ...(prev.blockerCodes !== undefined ? { blockerCodes: [...prev.blockerCodes] } : {}),
                ...(prev.blockerCount !== undefined ? { blockerCount: prev.blockerCount } : {}),
                ...(prev.issuesTruncated !== undefined ? { issuesTruncated: prev.issuesTruncated } : {}),
                ...(prev.blockerIssues !== undefined ? { blockerIssues: [...prev.blockerIssues] } : {}),
                ...(prev.rolesScanned !== undefined ? { rolesScanned: prev.rolesScanned } : {}),
                ...(prev.usersScanned !== undefined ? { usersScanned: prev.usersScanned } : {}),
                ...(prev.assignmentsCreated !== undefined ? { assignmentsCreated: prev.assignmentsCreated } : {}),
                ...(prev.guestAssociationsSkipped !== undefined
                  ? { guestAssociationsSkipped: prev.guestAssociationsSkipped }
                  : {}),
                ...(prev.batchesApplied !== undefined ? { batchesApplied: prev.batchesApplied } : {}),
                ...(prev.conflictsResolved !== undefined ? { conflictsResolved: prev.conflictsResolved } : {}),
                ...(prev.transactionFailures !== undefined ? { transactionFailures: prev.transactionFailures } : {}),
              };
        if (prev === undefined) {
          // Race-safe creation: unique-insert on `{ migrationName, phase }`
          // (see `ensureMigrationCheckpointIndexes`) so concurrent creators
          // serialize on duplicate-key instead of both upserting. Adapters
          // without `insertOne` fall back to the upsert below; the unique
          // index still fails one writer closed on real drivers.
          if (typeof fencedCollection.insertOne === 'function') {
            try {
              await fencedCollection.insertOne({
                migrationName: AUTHORIZATION_MIGRATION_NAME,
                phase,
                ...durableSet,
              });
            } catch (error) {
              if (isUniqueConstraintError(error)) {
                throw new Error(
                  `Authorization migration checkpoint for phase '${phase}' detected a duplicate write; failing closed.`
                );
              }
              // A concurrent row may have appeared between our read and the
              // insert on adapters that surface it as a generic error: reread
              // to distinguish a lost race (fail closed as a conflict) from a
              // genuine write failure. Reread failures propagate fail-closed;
              // they are never swallowed into a false "absent" assumption. The
              // reread uses the session-bound collection when transactional so
              // it observes the same snapshot as the mutation.
              const raced = await readCheckpointForMutation(phase, session.checkpoint);
              if (raced !== undefined) {
                throw new Error(
                  `Authorization migration checkpoint for phase '${phase}' lost a concurrent create race; failing closed.`
                );
              }
              throw error;
            }
            // Post-write fence: inside a required transaction/session this
            // revalidation reads the session-bound lease row in the same
            // transaction as the insert, so a TTL takeover in between aborts
            // the transaction instead of leaving a stale row behind. Outside a
            // transaction (unit doubles without session support) the stale row
            // just inserted is removed under a CAS on the revision, owner, and
            // fence written above (so a successor's overwrite is never
            // removed) and the write rejects instead of reporting success.
            // Compensation failures propagate with the lease rejection as their
            // cause: swallowing them could hide a stale row that was left
            // behind, and callers must observe the full failure.
            if (lease !== undefined) {
              try {
                await assertCheckpointLeaseValid(lease, 'write', nextFence, fencedLease);
              } catch (postError) {
                try {
                  if (typeof fencedCollection.deleteOne === 'function') {
                    await fencedCollection.deleteOne({
                      migrationName: AUTHORIZATION_MIGRATION_NAME,
                      phase,
                      revision: nextRevision,
                      ...(checkpoint.fence !== undefined ? { fence: checkpoint.fence } : {}),
                      ...(checkpoint.owner !== undefined ? { owner: checkpoint.owner } : {}),
                    });
                  }
                } catch (compensationError) {
                  throw new Error(
                    `Authorization migration checkpoint for phase '${phase}' lost its lease during write and the stale-row compensation failed; failing closed without reporting success.`,
                    { cause: { lease: postError, compensation: compensationError } }
                  );
                }
                throw postError;
              }
            }
          } else {
            const result = await fencedCollection.updateOne(
              { migrationName: AUTHORIZATION_MIGRATION_NAME, phase },
              { $set: durableSet },
              { upsert: true }
            );
            // Real drivers must report exactly one affected row; count-less
            // doubles (`{}`) are accepted only so memory-backed unit doubles
            // keep working, and the reread below proves the row exists.
            if (hasReportedCounts(result) && (affectedRowCount(result) ?? 0) < 1) {
              throw new Error(
                `Authorization migration checkpoint for phase '${phase}' write affected 0 rows; failing closed.`
              );
            }
            // Post-write fence for the legacy upsert fallback: no compensating
            // delete is attempted here because a blind upsert may have matched
            // a pre-existing row owned by someone else. The rejection below
            // still fails closed instead of reporting success past the lease.
            // Inside a required transaction the lease predicate above and this
            // mutation share one atomic commit.
            if (lease !== undefined) {
              await assertCheckpointLeaseValid(lease, 'write', nextFence, fencedLease);
            }
          }
        } else {
          // Driver-level CAS on the exact row state read above: the revision
          // plus the fence/owner observed on that read are all pinned, so a
          // concurrent writer that advanced the row first leaves matchedCount
          // === 0 and this writer fails closed instead of silently clobbering
          // the winner. Real drivers always report counts and require exactly
          // one affected row. Count-less doubles (`{}`) cannot prove the CAS
          // either way: they are accepted as applied so memory-backed unit
          // doubles keep working, exactly as before. The conditional fence/owner
          // pins below are the in-transaction lease predicate for the CAS path:
          // only the writer whose observed fence/owner still match may advance
          // the row, so a superseded runner's update matches zero rows and the
          // transaction aborts instead of clobbering the winner.
          const result = await fencedCollection.updateOne(
            {
              migrationName: AUTHORIZATION_MIGRATION_NAME,
              phase,
              revision: prev.revision,
              ...(prev.fence !== undefined ? { fence: prev.fence } : {}),
              ...(prev.owner !== undefined ? { owner: prev.owner } : {}),
            },
            { $set: durableSet },
            { upsert: false }
          );
          if (hasReportedCounts(result) && (affectedRowCount(result) ?? 0) < 1) {
            throw new Error(
              `Authorization migration checkpoint for phase '${phase}' revision conflict: expected revision ${prev.revision}; failing closed.`
            );
          }
          // Post-write fence: inside a required transaction/session this
          // revalidation shares the transaction with the CAS above, so a TTL
          // takeover aborts atomically with no stale cursor left behind.
          // Outside a transaction the previous row state is restored under a
          // CAS on the revision, owner, and fence just written (so a
          // successor's overwrite is never clobbered) and the write rejects
          // instead of reporting success. Restoration failures propagate with
          // the lease rejection as their cause instead of being swallowed.
          if (lease !== undefined) {
            try {
              await assertCheckpointLeaseValid(lease, 'write', nextFence, fencedLease);
            } catch (postError) {
              try {
                await fencedCollection.updateOne(
                  {
                    migrationName: AUTHORIZATION_MIGRATION_NAME,
                    phase,
                    revision: nextRevision,
                    ...(checkpoint.owner !== undefined ? { owner: checkpoint.owner } : {}),
                    ...(checkpoint.fence !== undefined ? { fence: checkpoint.fence } : {}),
                  },
                  { $set: prevDurableSet },
                  { upsert: false }
                );
              } catch (compensationError) {
                throw new Error(
                  `Authorization migration checkpoint for phase '${phase}' lost its lease during write and the prior-row restoration failed; failing closed without reporting success.`,
                  { cause: { lease: postError, compensation: compensationError } }
                );
              }
              throw postError;
            }
          }
        }
      } catch (error) {
        // A duplicate-key failure proves a concurrent fork despite the lease:
        // fail closed rather than silently adopting one winner's row.
        if (isUniqueConstraintError(error)) {
          throw new Error(
            `Authorization migration checkpoint for phase '${phase}' detected a duplicate write; failing closed.`
          );
        }
        throw error;
      }
    });
  }
  // Memory mirror only under the explicit test opt-in outside production;
  // every other environment without a durable row fails closed via the
  // reader/writer guards and never trusts process memory across restarts.
  // Production never populates the mirror, even when the test opt-in leaks.
  if (process.env.NODE_ENV !== 'production' && memoryCheckpointFallbackAllowed()) {
    migrationCheckpointMemory.set(migrationCheckpointKey(phase), checkpoint);
  }
  return checkpoint;
}

export async function clearMigrationCheckpoint(
  phase: AuthorizationMigrationPhase,
  options?: MigrationCheckpointClearOptions
): Promise<void> {
  const collection = migrationCheckpointCollection();
  if (collection === undefined && (process.env.NODE_ENV === 'production' || !memoryCheckpointFallbackAllowed())) {
    requireDurableCheckpointCollection('clear');
  }
  // The lease holder must still be valid before a clear: resolve the
  // explicit lease (or the Runner's active lease), require one whenever a
  // holder exists, and fail closed on a missing/malformed/expired/foreign
  // durable row or a stale fence. Read errors propagate; they are never
  // swallowed into an unguarded clear.
  const lease = resolveCheckpointLeaseForMutation('clear', options?.lease);
  let prevForFence: AuthorizationMigrationCheckpoint | undefined;
  if (collection !== undefined) {
    prevForFence = await readMigrationCheckpoint(phase);
  } else if (memoryCheckpointFallbackAllowed()) {
    prevForFence = migrationCheckpointMemory.get(migrationCheckpointKey(phase));
  }
  if (options?.expectedRevision !== undefined && prevForFence !== undefined) {
    if (prevForFence.revision !== options.expectedRevision) {
      throw new Error(
        `Authorization migration checkpoint for phase '${phase}' revision conflict: expected ${options.expectedRevision}, found ${prevForFence.revision}.`
      );
    }
  }
  if (lease !== undefined) {
    await assertCheckpointLeaseValid(lease, 'clear', prevForFence?.fence);
  }
  migrationCheckpointMemory.delete(migrationCheckpointKey(phase));
  if (collection === undefined) {
    return;
  }
  // A clear that observed no row is an idempotent no-op and must never issue
  // a durable delete: an unconditional `deleteOne({ migrationName, phase })`
  // would remove a row created after our read (for example by a successor
  // that took over the lease), resurrecting a lost-update window. Likewise
  // the `$unset` fallback below is skipped: unsetting a row that appeared
  // after our read would wipe its freshly written cursor.
  if (prevForFence === undefined) {
    return;
  }
  // Fenced CAS clear: match the exact revision, fence, and owner read above
  // so a concurrent writer that advanced the row between our read and our
  // clear fails closed instead of deleting the winner's progress. The clear
  // and its owner+fence lease predicate commit or abort in a single required
  // transaction/session whenever the datastore supports it: the lease is
  // revalidated inside the transaction below and re-proven after the delete,
  // so no crash window can report a clean clear past a lost lease.
  await runCheckpointMutationAtomically('clear', async session => {
    const fencedCollection = session.checkpoint ?? collection;
    const fencedLease = session.lease;
    if (lease !== undefined) {
      await assertCheckpointLeaseValid(lease, 'clear', prevForFence?.fence, fencedLease);
      if (session.inTransaction && fencedLease !== undefined) {
        await writeSessionLeaseFence(fencedLease, lease, 'clear');
      }
    }
    if (typeof fencedCollection.deleteOne === 'function') {
      const removed = await fencedCollection.deleteOne({
        migrationName: AUTHORIZATION_MIGRATION_NAME,
        phase,
        revision: options?.expectedRevision ?? prevForFence.revision,
        ...(prevForFence.fence !== undefined ? { fence: prevForFence.fence } : {}),
        ...(prevForFence.owner !== undefined ? { owner: prevForFence.owner } : {}),
      });
      if (hasReportedCounts(removed) && (affectedRowCount(removed) ?? 0) < 1) {
        // A concurrent clear is an idempotent success; a concurrent advance
        // that replaced the row is a conflict. Reread to distinguish. Reread
        // failures propagate fail-closed; they are never swallowed into a
        // false "absent" assumption. The reread uses the session-bound
        // collection when transactional.
        const raced = await readCheckpointForMutation(phase, session.checkpoint);
        if (raced !== undefined) {
          throw new Error(
            `Authorization migration checkpoint for phase '${phase}' changed concurrently during clear; failing closed.`
          );
        }
      }
      // Post-clear fence: a TTL takeover between the pre-clear validation and
      // this delete must not be reported as a clean clear. Inside a required
      // transaction this revalidation shares the transaction with the delete,
      // so the clear and the lease predicate commit or abort atomically. There
      // is nothing to roll back (a concurrent clear is idempotent and a
      // successor rewrites its own cursor), but the rejection below fails
      // closed instead of reporting success past the lease.
      if (lease !== undefined) {
        await assertCheckpointLeaseValid(lease, 'clear', prevForFence.fence, fencedLease);
      }
      return;
    }
    // Adapters without `deleteOne` fall back to unsetting every run-state
    // field under the same revision/fence/owner CAS; the reader treats such a
    // stateless row as absent (see above).
    const cleared = await fencedCollection.updateOne(
      {
        migrationName: AUTHORIZATION_MIGRATION_NAME,
        phase,
        revision: options?.expectedRevision ?? prevForFence.revision,
        ...(prevForFence.fence !== undefined ? { fence: prevForFence.fence } : {}),
        ...(prevForFence.owner !== undefined ? { owner: prevForFence.owner } : {}),
      },
      {
        $unset: {
          lastId: '',
          updatedAt: '',
          revision: '',
          fence: '',
          owner: '',
          blockerCodes: '',
          blockerCount: '',
          issuesTruncated: '',
          blockerIssues: '',
          rolesScanned: '',
          usersScanned: '',
          assignmentsCreated: '',
          guestAssociationsSkipped: '',
          batchesApplied: '',
          conflictsResolved: '',
          transactionFailures: '',
        },
      },
      { upsert: false }
    );
    if (hasReportedCounts(cleared) && (affectedRowCount(cleared) ?? 0) < 1) {
      const raced = await readCheckpointForMutation(phase, session.checkpoint);
      if (raced !== undefined) {
        throw new Error(
          `Authorization migration checkpoint for phase '${phase}' changed concurrently during clear; failing closed.`
        );
      }
    }
    if (lease !== undefined) {
      await assertCheckpointLeaseValid(lease, 'clear', prevForFence.fence, fencedLease);
    }
  });
}

function emptyMetrics(): MutableMigrationSummary['metrics'] {
  return { batchesApplied: 0, conflictsResolved: 0, transactionFailures: 0 };
}

function emptySummary(): MutableMigrationSummary {
  return {
    rolesScanned: 0,
    rolesMigrated: 0,
    usersScanned: 0,
    assignmentsCreated: 0,
    guestAssociationsSkipped: 0,
    issues: [],
    metrics: emptyMetrics(),
    issuesTruncated: false,
  };
}

function freezeSummary(summary: MutableMigrationSummary): AuthorizationMigrationSummary {
  return Object.freeze({
    ...summary,
    metrics: Object.freeze({ ...summary.metrics }),
    issues: Object.freeze([...summary.issues]),
    ...(summary.issuesTruncated ? { issuesTruncated: true as const } : {}),
  });
}

function emitMigrationMetrics(stage: string, summary: Pick<MutableMigrationSummary, 'metrics'>): void {
  try {
    const sailsGlobal = readSailsGlobal();
    if (sailsGlobal === undefined) return;
    const logValue = sailsGlobal.log;
    if (!isObject(logValue)) return;
    const info = logValue.info;
    if (typeof info !== 'function') return;
    Reflect.apply(info, logValue, [
      `AuthorizationMigrationService:: ${stage} metrics`,
      {
        batchesApplied: summary.metrics.batchesApplied,
        conflictsResolved: summary.metrics.conflictsResolved,
        transactionFailures: summary.metrics.transactionFailures,
      },
    ]);
  } catch {
    // Metrics emission is observational only and must never fail migration.
  }
}

function associationId(value: unknown): string | undefined {
  if (typeof value === 'string' || typeof value === 'number') return String(value);
  if (typeof value === 'object' && value !== null && 'id' in value) {
    const id = value.id;
    if (typeof id === 'string' || typeof id === 'number') return String(id);
  }
  return undefined;
}

function isRoleAttributes(value: unknown): value is RoleAttributes {
  return typeof value === 'object' && value !== null && 'id' in value && 'name' in value;
}

/**
 * Checked adapter for Waterline assignment reads/writes crossing the untyped
 * runtime boundary. Proves the row is an object with an id instead of casting
 * blindly; tuple-level validity (principal/role/brand/source/status) is
 * classified downstream by `migrationWinnerBlocker` and the drift
 * per-row checks, never assumed here. Non-object or id-less rows fail closed.
 */
function isMigrationAssignmentRow(value: unknown): value is RoleAssignmentAttributes {
  return isObject(value) && (typeof value.id === 'string' || typeof value.id === 'number');
}

/**
 * Pageable-row guard for drift scans: the scan pages by id and classifies
 * field-level validity per row as blockers downstream, so the page adapter
 * only proves each row carries an id. Non-object or id-less rows fail closed.
 */
function isPageableAssignmentRow(value: unknown): value is RoleAssignmentAttributes {
  return isObject(value) && (typeof value.id === 'string' || typeof value.id === 'number');
}

function asRoleAssignmentAttributes(value: unknown, operation: string): RoleAssignmentAttributes {
  if (!isMigrationAssignmentRow(value)) {
    throw new Error(`Authorization migration ${operation} returned an unreadable assignment row; failing closed.`);
  }
  return value;
}

function asOptionalRoleAssignmentAttributes(
  value: unknown,
  operation: string
): RoleAssignmentAttributes | null | undefined {
  if (value == null) return value;
  return asRoleAssignmentAttributes(value, operation);
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function nestedErrorCode(error: unknown, visited = new WeakSet<object>()): unknown {
  if (!isObject(error) || visited.has(error)) return undefined;
  visited.add(error);
  if (error.code !== undefined) return error.code;
  for (const nested of [error.raw, error.cause, error.details]) {
    const code = nestedErrorCode(nested, visited);
    if (code !== undefined) return code;
  }
  return undefined;
}

function isUniqueConstraintError(error: unknown): boolean {
  const code = nestedErrorCode(error);
  return code === 'E_UNIQUE' || code === 11_000;
}

function migrationAssignmentSelector(input: RoleAssignmentCreateRecord): Record<string, unknown> {
  return {
    principalType: input.principalType,
    principalId: input.principalId,
    role: input.role,
    source: input.source,
    sourceKey: input.sourceKey,
  };
}

/**
 * Validates an adopted migration assignment winner (a pre-existing or
 * race-winning row for the exact source tuple) as a complete effective
 * canonical projection. The tuple selector alone cannot prove the winner
 * grants anything: a revoked, suppressed, expired, or source-absent row
 * grants no authority, and a brand/principal/role/source mismatch means the
 * row is not the migration's projection at all. Returns the blocking drift
 * code, or `undefined` when the winner is effective and canonical.
 */
function migrationWinnerBlocker(
  input: RoleAssignmentCreateRecord,
  winner: RoleAssignmentAttributes,
  now: Date
): string | undefined {
  if (String(winner.principalId) !== String(input.principalId)) return 'migration-winner-principal-mismatch';
  if (String(associationId(winner.role)) !== String(input.role)) return 'migration-winner-role-mismatch';
  if (winner.source !== input.source || winner.sourceKey !== input.sourceKey) {
    return 'migration-winner-source-mismatch';
  }
  if (associationId(winner.branding) !== associationId(input.branding)) return 'migration-winner-brand-mismatch';
  if (winner.status === 'revoked') return 'migration-winner-revoked';
  if (winner.status === 'suppressed') return 'migration-winner-suppressed';
  if (winner.expiresAt != null && new Date(winner.expiresAt).getTime() <= now.getTime()) {
    return 'migration-winner-expired';
  }
  if (winner.sourcePresent !== true) return 'migration-winner-source-absent';
  if (winner.status !== 'active') return 'migration-winner-not-effective';
  return undefined;
}

/**
 * Creates a migration assignment and its success audit atomically in the same
 * fresh transaction/session without reusing the caller's transaction after a
 * duplicate-key conflict.
 *
 * MongoDB aborts the writing transaction on duplicate-key, so the aborted
 * session cannot be reused for the conflict reread. The creation-plus-audit
 * runs in its own transaction (aborted/ended by `runWithRequiredTransaction`
 * on failure) and the winner reread runs in a subsequent fresh
 * transaction/session where the committed winner is visible. This helper may
 * run only after the batch read transaction has closed: both transactions
 * write the same lease fence and cannot overlap. A later batch failure can
 * never leave an assignment committed without its success audit.
 *
 * @returns The created row, or `undefined` when a concurrent worker won the
 * race and its row is visible in the fresh reread (idempotent success).
 */
async function createMigrationAssignmentWithAuditAtomically(
  input: RoleAssignmentCreateRecord,
  audit: { readonly after: Record<string, unknown>; readonly brandId?: string },
  datastore: Sails.Datastore | null | undefined,
  metrics?: { conflictsResolved: number },
  onWinnerBlocker?: (code: string, winner: RoleAssignmentAttributes) => void,
  lease?: Pick<MigrationLeaseHandle, 'owner' | 'fence'>
): Promise<RoleAssignmentAttributes | undefined> {
  try {
    const created = await runWithRequiredTransaction(datastore, async freshConnection => {
      if (lease !== undefined) {
        await fenceLeaseInMutationSession(lease, freshConnection, 'assignment creation');
      } else if (isDurableMutationLeaseRequired()) {
        throw new Error(
          'Authorization migration assignment creation rejected: no lease held; acquire the migration lease first.'
        );
      }
      const rawCreated: unknown = await sails.services.authorizationpersistenceservice.createRoleAssignment(
        input,
        freshConnection
      );
      const createdRow = asRoleAssignmentAttributes(rawCreated, 'assignment creation');
      await sails.services.authorizationauditservice.createSucceededEvent(
        {
          eventType: 'assignment.created',
          actorType: 'system-process',
          actorId: MIGRATION_ACTOR,
          authMethod: 'internal',
          targetType: 'role-assignment',
          targetId: createdRow.id,
          brandId: audit.brandId,
          after: audit.after,
          reasonCode: AUTHORIZATION_MIGRATION_NAME,
        },
        freshConnection
      );
      if (lease !== undefined) {
        await fenceLeaseInMutationSession(lease, freshConnection, 'assignment creation (pre-commit)');
      } else if (isDurableMutationLeaseRequired()) {
        throw new Error(
          'Authorization migration assignment creation rejected: no lease held; acquire the migration lease first.'
        );
      }
      return createdRow;
    });
    return asRoleAssignmentAttributes(created, 'assignment creation');
  } catch (error) {
    if (!isUniqueConstraintError(error)) throw error;
    // The winner reread, full effective-projection validation, and the
    // adopt-noop audit share ONE fresh required transaction after the aborted
    // creation transaction: a split reread/audit could record an adoption the
    // reread never validated, and an outside-transaction audit could survive a
    // reread that a retry would contradict. An audit failure rolls back the
    // adoption observation atomically.
    // Absent winner rereads throw (fail closed, no silent adoption); invalid
    // winners return undefined after recording the blocker via `onWinnerBlocker`
    // (no throw, no creation). Both paths share the fresh transaction with the
    // noop audit so validation and audit are atomic.
    await runWithRequiredTransaction(datastore, async freshConnection => {
      if (lease !== undefined) {
        await fenceLeaseInMutationSession(lease, freshConnection, 'assignment adoption');
      }
      const rawWinner: unknown = await RoleAssignment.findOne(migrationAssignmentSelector(input)).usingConnection(
        freshConnection
      );
      const winner = asOptionalRoleAssignmentAttributes(rawWinner, 'conflict reread');
      if (winner == null) throw error;
      const candidate: RoleAssignmentAttributes = winner;
      const blocker = migrationWinnerBlocker(input, candidate, new Date());
      if (blocker !== undefined) {
        if (onWinnerBlocker !== undefined) onWinnerBlocker(blocker, candidate);
        if (lease !== undefined) {
          await fenceLeaseInMutationSession(lease, freshConnection, 'assignment adoption (pre-commit)');
        }
        return undefined;
      }
      await sails.services.authorizationauditservice.createSucceededEvent(
        {
          eventType: 'assignment.noop',
          actorType: 'system-process',
          actorId: MIGRATION_ACTOR,
          authMethod: 'internal',
          targetType: 'role-assignment',
          targetId: candidate.id,
          brandId: audit.brandId,
          after: { ...audit.after, state: 'active-adopted' },
          reasonCode: AUTHORIZATION_MIGRATION_NAME,
        },
        freshConnection
      );
      if (lease !== undefined) {
        await fenceLeaseInMutationSession(lease, freshConnection, 'assignment adoption (pre-commit)');
      }
      return candidate;
    });
    if (metrics !== undefined) metrics.conflictsResolved += 1;
    authorizationMigrationConflicts.add(1, { phase: 'assignments', resolution: 'reread-winner' });
    return undefined;
  }
}

/**
 * Compare-and-swap criteria for a migration role write. Rows that already carry
 * a positive version are rewritten only when the version still matches the
 * snapshot read inside the transaction, so a concurrent administrative mutation
 * fails closed instead of being silently clobbered. Versionless legacy rows
 * predate optimistic concurrency: they pin every field the migration derives
 * or overwrites (`roleProjection`: key, identity, label, context, kind,
 * status, template, actor metadata, plus the `name`/`branding` identity the
 * projection is derived from) with explicit null/absence semantics, so an
 * id-only predicate cannot overwrite a concurrent field change. A snapshot
 * value of `null`/`undefined` pins `{ field: null }`, which matches only rows
 * that are still null or absent; any concurrent write then matches zero rows
 * and the migration fails closed. `version` itself is pinned explicitly as
 * null/absent for versionless rows so a concurrent writer that established a
 * version (including the migration itself on a retry) cannot be silently
 * clobbered: the predicate matches zero rows and the migration fails closed.
 */
function roleMigrationUpdateCriteria(role: RoleAttributes): Record<string, unknown> {
  if (Number.isInteger(role.version) && Number(role.version) >= 1) {
    return { id: role.id, version: role.version };
  }
  // Absence pins as null (matches only null/absent); every present value pins
  // exactly, including empty strings and non-positive version sentinels.
  // `version` is pinned explicitly: a versionless snapshot pins null/absent,
  // so a concurrent version establishment fails closed instead of being
  // overwritten.
  const pin = (value: unknown): unknown => (value === undefined ? null : value);
  return {
    id: role.id,
    version: pin(role.version),
    name: pin(role.name),
    branding: pin(associationId(role.branding)),
    template: pin(associationId(role.template)),
    key: pin(role.key),
    identityKey: pin(role.identityKey),
    displayName: pin(role.displayName),
    contextType: pin(role.contextType),
    protectedKind: pin(role.protectedKind),
    status: pin(role.status),
    templateRevision: pin(role.templateRevision),
    createdBy: pin(role.createdBy),
    updatedBy: pin(role.updatedBy),
  };
}

function boundedBatchSize(value: number | undefined): number {
  if (value === undefined) return AUTHORIZATION_MIGRATION_DEFAULT_BATCH_SIZE;
  if (!Number.isInteger(value) || value < 1 || value > AUTHORIZATION_MIGRATION_MAX_BATCH_SIZE) {
    throw new Error(
      `Authorization migration batch size must be between 1 and ${AUTHORIZATION_MIGRATION_MAX_BATCH_SIZE}.`
    );
  }
  return value;
}

function addIssue(
  summary: MutableMigrationSummary,
  issue: AuthorizationMigrationIssue,
  maximum = AUTHORIZATION_MIGRATION_MAX_BATCH_SIZE
): void {
  if (summary.issues.length < maximum) {
    summary.issues.push(Object.freeze(issue));
  } else {
    // Fail open visibility, fail closed authority: record that the capped
    // prefix is incomplete so callers rescan instead of trusting a silent cap.
    summary.issuesTruncated = true;
  }
}

/** Seed a resumed run with blockers and cumulative counters persisted before an interruption. */
function seedResumedBlockers(summary: MutableMigrationSummary, checkpoint: MigrationCheckpointState | undefined): void {
  if (checkpoint === undefined) return;
  // Prefer bounded full blocker metadata; fall back to legacy code-only
  // prefixes (attributed to `role` for backward compatibility).
  if (checkpoint.blockerIssues !== undefined) {
    for (const issue of checkpoint.blockerIssues) {
      addIssue(summary, {
        code: issue.code,
        severity: 'blocker',
        entityType: issue.entityType,
        ...(issue.entityId !== undefined ? { entityId: issue.entityId } : {}),
      });
      if (summary.issuesTruncated) break;
    }
  } else if (checkpoint.blockerCodes !== undefined) {
    for (const code of checkpoint.blockerCodes) {
      addIssue(summary, { code, severity: 'blocker', entityType: 'role' });
      if (summary.issuesTruncated) break;
    }
  }
  if (checkpoint.issuesTruncated === true) summary.issuesTruncated = true;
  // Restore total/truncation metadata: a snapshot capped at 500 details must
  // never read back as an untruncated complete set when the persisted total
  // exceeds the restored prefix.
  const seededBlockers = summary.issues.filter(issue => issue.severity === 'blocker').length;
  if (
    checkpoint.blockerCount !== undefined &&
    Number.isSafeInteger(checkpoint.blockerCount) &&
    checkpoint.blockerCount > seededBlockers
  ) {
    summary.issuesTruncated = true;
  }
  if (checkpoint.rolesScanned !== undefined) summary.rolesScanned = checkpoint.rolesScanned;
  if (checkpoint.usersScanned !== undefined) summary.usersScanned = checkpoint.usersScanned;
  if (checkpoint.assignmentsCreated !== undefined) summary.assignmentsCreated = checkpoint.assignmentsCreated;
  if (checkpoint.guestAssociationsSkipped !== undefined)
    summary.guestAssociationsSkipped = checkpoint.guestAssociationsSkipped;
  if (checkpoint.batchesApplied !== undefined) summary.metrics.batchesApplied = checkpoint.batchesApplied;
  if (checkpoint.conflictsResolved !== undefined) summary.metrics.conflictsResolved = checkpoint.conflictsResolved;
  if (checkpoint.transactionFailures !== undefined)
    summary.metrics.transactionFailures = checkpoint.transactionFailures;
}

function blockerSnapshot(summary: MutableMigrationSummary): MigrationCheckpointState {
  const blockers = summary.issues.filter(issue => issue.severity === 'blocker');
  return {
    blockerCodes: Object.freeze(blockers.map(issue => issue.code).slice(0, 500)),
    blockerCount: blockers.length,
    issuesTruncated: summary.issuesTruncated,
    blockerIssues: Object.freeze(
      blockers.slice(0, 500).map(issue =>
        Object.freeze({
          code: issue.code,
          entityType: issue.entityType,
          ...(issue.entityId !== undefined ? { entityId: issue.entityId } : {}),
        })
      )
    ),
    rolesScanned: summary.rolesScanned,
    usersScanned: summary.usersScanned,
    assignmentsCreated: summary.assignmentsCreated,
    guestAssociationsSkipped: summary.guestAssociationsSkipped,
    batchesApplied: summary.metrics.batchesApplied,
    conflictsResolved: summary.metrics.conflictsResolved,
    transactionFailures: summary.metrics.transactionFailures,
  };
}

function templateForLegacyRole(name: string): DefaultRoleTemplateDefinition | undefined {
  return DEFAULT_ROLE_TEMPLATES.find(template => template.legacyRoleName === name);
}

function expectedProtectedKind(template: DefaultRoleTemplateDefinition | undefined): ProtectedRoleKind {
  return template?.protectedKind ?? 'none';
}

async function migrationAudit(
  eventType: 'role.updated' | 'assignment.created' | 'authorization.migration.batch-applied',
  targetType: 'role' | 'role-assignment' | 'authorization-migration',
  targetId: string,
  after: unknown,
  connection: Sails.Connection,
  brandId?: string
): Promise<void> {
  await sails.services.authorizationauditservice.createSucceededEvent(
    {
      eventType,
      actorType: 'system-process',
      actorId: MIGRATION_ACTOR,
      authMethod: 'internal',
      targetType,
      targetId,
      brandId,
      after,
      reasonCode: AUTHORIZATION_MIGRATION_NAME,
    },
    connection
  );
}

async function loadTemplates(connection?: Sails.Connection): Promise<Map<string, RoleTemplateAttributes>> {
  // Bounded startup state: query only the declared default template keys
  // instead of retaining every persisted template. An unbounded scan would
  // accumulate the whole template table in process memory on every lift.
  const declaredKeys = DEFAULT_ROLE_TEMPLATES.map(template => String(template.key));
  let chain: unknown = RoleTemplate.find({ key: declaredKeys }).sort('id ASC');
  if (connection !== undefined)
    chain = (chain as { usingConnection(c: Sails.Connection): unknown }).usingConnection(connection);
  const rows = (await withBoundedLimit<RoleTemplateAttributes[]>(
    chain,
    declaredKeys.length + 1
  )) as RoleTemplateAttributes[];
  if (!Array.isArray(rows)) throw new Error('authorization.scan-unbounded: template scan did not return a page.');
  if (rows.length > declaredKeys.length)
    throw new Error('authorization.scan-unbounded: unexpected duplicate template keys.');
  return new Map(rows.map(template => [template.key, template]));
}

function roleProjection(
  role: RoleAttributes,
  brandId: string,
  template: RoleTemplateAttributes | undefined,
  definition: DefaultRoleTemplateDefinition | undefined
): Record<string, unknown> {
  const key = role.name;
  const protectedKind = expectedProtectedKind(definition);
  const projection: Record<string, unknown> = {
    key,
    identityKey: buildRoleIdentityKey('brand', key, brandId),
    displayName: role.displayName?.trim() ? role.displayName : role.name,
    contextType: 'brand',
    protectedKind,
    status: role.status === 'inactive' ? 'inactive' : 'active',
    version: Number.isInteger(role.version) && Number(role.version) >= 1 ? Number(role.version) + 1 : 1,
    createdBy: role.createdBy?.trim() ? role.createdBy : MIGRATION_ACTOR,
    updatedBy: MIGRATION_ACTOR,
  };
  if (template !== undefined && definition !== undefined) {
    projection.template = template.id;
    projection.templateRevision = definition.revision;
  }
  validateRolePersistenceContext({
    name: role.name,
    key,
    contextType: 'brand',
    branding: brandId,
    protectedKind,
    identityKey: String(projection.identityKey),
  });
  return projection;
}

function projectionDiffers(role: RoleAttributes, projection: Record<string, unknown>): boolean {
  // Positive version is required: a missing/non-positive version is drift that
  // must be repaired (CAS pins version explicitly). When the version is
  // already positive it is excluded from the field diff because the projection
  // advances it by one on every successful write; comparing values would make
  // every migrated row look dirty forever.
  if (!Number.isInteger(role.version) || Number(role.version) < 1) return true;
  return Object.entries(projection).some(([field, value]) => {
    if (field === 'version') return false;
    const current = role[field as keyof RoleAttributes];
    if (field === 'template') return associationId(current) !== associationId(value);
    return current !== value;
  });
}

const LINKED_ACCOUNT_MAX_DEPTH = 16;

type LinkChainFailure =
  | 'linked-account-cycle'
  | 'linked-alias-missing-primary'
  | 'canonical-user-disabled'
  | 'linked-alias-primary-not-found'
  | 'linked-account-depth-exceeded';

type LinkChainResolution =
  | { readonly user: UserAttributes }
  | { readonly failure: LinkChainFailure; readonly entityId: string };

/**
 * Walks a linked-account alias chain to its active primary user. Migration and drift
 * reporting share this walker so a chain longer than one link cannot be canonicalized
 * one way when writing assignments and another way when auditing them.
 */
async function resolveLinkChain(user: UserAttributes, connection?: Sails.Connection): Promise<LinkChainResolution> {
  let current = user;
  const visited = new Set<string>();
  for (let depth = 0; depth < LINKED_ACCOUNT_MAX_DEPTH; depth += 1) {
    const currentId = String(current.id);
    if (visited.has(currentId)) {
      return { failure: 'linked-account-cycle', entityId: currentId };
    }
    visited.add(currentId);
    const primaryId = current.linkedPrimaryUserId?.trim();
    if (!primaryId) {
      if (current.accountLinkState === 'linked-alias') {
        return { failure: 'linked-alias-missing-primary', entityId: currentId };
      }
      if (current.loginDisabled === true) {
        return { failure: 'canonical-user-disabled', entityId: currentId };
      }
      return { user: current };
    }
    let query = User.findOne({ id: primaryId });
    if (connection !== undefined) query = query.usingConnection(connection);
    const primary = await query;
    if (primary == null) {
      return { failure: 'linked-alias-primary-not-found', entityId: currentId };
    }
    current = primary;
  }
  return { failure: 'linked-account-depth-exceeded', entityId: String(user.id) };
}

async function canonicalUser(
  user: UserAttributes,
  connection: Sails.Connection,
  summary: MutableMigrationSummary
): Promise<UserAttributes | undefined> {
  const resolution = await resolveLinkChain(user, connection);
  if ('user' in resolution) {
    return resolution.user;
  }
  addIssue(summary, {
    code: resolution.failure,
    severity: 'blocker',
    entityType: 'user',
    entityId: resolution.entityId,
  });
  return undefined;
}

async function canonicalUserFromLinkChain(user: UserAttributes): Promise<UserAttributes | undefined> {
  const resolution = await resolveLinkChain(user);
  return 'user' in resolution ? resolution.user : undefined;
}

/**
 * The protected system administrator role is intentionally brandless: it lives
 * in the `system` context and must never be treated as a brand role with a
 * missing brand. Brand reconciliation skips it so full reruns stay green once
 * bootstrap has established protected state. The exemption requires the exact
 * brandless protected identity (all fields conjunctive): any role merely named
 * `system-admin` without the exact identity is NOT exempt and flows through
 * brand validation as blocking drift.
 */
function isBrandlessSystemAdministratorRole(role: RoleAttributes): boolean {
  // Exact persisted `key` is required: a missing key never falls back to
  // `name`, so a keyless `system-admin` row flows through brand validation
  // as blocking drift instead of silently skipping as exempt.
  return (
    role.contextType === 'system' &&
    role.protectedKind === 'system-admin' &&
    role.identityKey === 'system:system-admin' &&
    role.name === 'system-admin' &&
    role.key === 'system-admin' &&
    associationId(role.branding) === undefined
  );
}

/**
 * Central effective-assignment predicate. An assignment counts as effective
 * only when it is active, still present at its source (`sourcePresent: true`),
 * and unexpired (`expiresAt` null or in the future). All drift counters and
 * projection checks share this predicate so brand/system quorum and legacy
 * projection cannot disagree about what "assigned" means.
 */
function effectiveAssignmentMatch(now: Date = new Date()): Record<string, unknown> {
  return {
    status: 'active',
    sourcePresent: true,
    or: [{ expiresAt: null }, { expiresAt: { '>': now } }],
  };
}

function effectiveAssignmentCriteria(extra: Record<string, unknown>, now: Date = new Date()): Record<string, unknown> {
  return { ...extra, ...effectiveAssignmentMatch(now) };
}

export const DRIFT_CONTINUATION_SECTIONS = [
  'brands',
  'users',
  'assignments',
  'roles',
  'records',
  'pathRules',
  'templates',
] as const;

export type DriftContinuationSection = (typeof DRIFT_CONTINUATION_SECTIONS)[number];

export type DriftContinuationState = Partial<Record<DriftContinuationSection, string>>;

function isDriftContinuationSection(value: unknown): value is DriftContinuationSection {
  return typeof value === 'string' && (DRIFT_CONTINUATION_SECTIONS as readonly string[]).includes(value);
}

const DRIFT_CONTINUATION_ALLOWED_TOP_LEVEL = new Set(['v', 'cursors', 'completed', 'systemReported', 'systemOffset']);

/**
 * Validates an opaque drift continuation cursor. Strict versioned envelope
 * only: `{ v: 1, cursors: { <section>: <lastKey> }, completed: [<section>] }`
 * with optional `systemReported: true` and `systemOffset: 1..500`. Legacy
 * flat `{ <section>: <lastKey> }` tokens are rejected: they carry no version
 * and cannot prove canonical shape. The outer token must be canonical
 * unpadded base64url (round-trip exact, no `=` padding, no `+/` alphabet) and
 * the envelope must contain no unknown fields, so tampered or non-canonical
 * cursors fail closed instead of silently restarting the scan.
 */
export function decodeDriftContinuation(input: string | undefined): DriftContinuationState {
  if (input === undefined) return {};
  if (typeof input !== 'string' || input.length === 0 || input.length > 4096) {
    throw new Error('Authorization drift continuation cursor is invalid.');
  }
  // Canonical unpadded base64url alphabet only: reject padding, `+/`, and
  // whitespace/non-alphabet bytes before decoding.
  if (!/^[A-Za-z0-9_-]+$/.test(input)) {
    throw new Error('Authorization drift continuation cursor is invalid.');
  }
  let rawJson: string;
  try {
    rawJson = Buffer.from(input, 'base64url').toString('utf8');
  } catch {
    throw new Error('Authorization drift continuation cursor is invalid.');
  }
  // Canonical round-trip: the decoded JSON must re-encode to the exact input.
  // Non-canonical bytes (alternate padding, non-minimal encodings) reject.
  if (Buffer.from(rawJson, 'utf8').toString('base64url') !== input) {
    throw new Error('Authorization drift continuation cursor is invalid.');
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(rawJson);
  } catch {
    throw new Error('Authorization drift continuation cursor is invalid.');
  }
  if (!isObject(parsed)) throw new Error('Authorization drift continuation cursor is invalid.');
  const envelope = parsed;
  for (const key of Object.keys(envelope)) {
    if (!DRIFT_CONTINUATION_ALLOWED_TOP_LEVEL.has(key)) {
      throw new Error('Authorization drift continuation cursor is invalid.');
    }
  }
  if (envelope.v !== 1) {
    throw new Error('Authorization drift continuation cursor is invalid.');
  }
  if (!isObject(envelope.cursors)) {
    throw new Error('Authorization drift continuation cursor is invalid.');
  }
  if (!Array.isArray(envelope.completed)) {
    throw new Error('Authorization drift continuation cursor is invalid.');
  }
  if (
    !envelope.completed.every((section): section is DriftContinuationSection => isDriftContinuationSection(section))
  ) {
    throw new Error('Authorization drift continuation cursor is invalid.');
  }
  const completed = envelope.completed as DriftContinuationSection[];
  if (new Set(completed).size !== completed.length) {
    throw new Error('Authorization drift continuation cursor is invalid.');
  }
  if (envelope.systemReported !== undefined && envelope.systemReported !== true) {
    throw new Error('Authorization drift continuation cursor is invalid.');
  }
  // Canonical envelope: the decoded JSON must be byte-identical to the
  // canonical serialization (sorted keys, sorted cursors/completed, no
  // whitespace, exact top-level order v/cursors/completed/systemReported/
  // systemOffset). Whitespace, reordered keys, or duplicate keys reject
  // fail-closed instead of silently restarting the scan.
  const rawCursors = envelope.cursors as Record<string, unknown>;
  const rawCompleted = envelope.completed as DriftContinuationSection[];
  const sortedCursorKeys = Object.keys(rawCursors).sort();
  const incomingCursorKeys = Object.keys(rawCursors);
  if (JSON.stringify(incomingCursorKeys) !== JSON.stringify(sortedCursorKeys)) {
    throw new Error('Authorization drift continuation cursor is invalid.');
  }
  const sortedCompleted = [...rawCompleted].sort();
  if (JSON.stringify(rawCompleted) !== JSON.stringify(sortedCompleted)) {
    throw new Error('Authorization drift continuation cursor is invalid.');
  }
  const canonicalCursors: Record<string, string> = {};
  for (const key of sortedCursorKeys) canonicalCursors[key] = rawCursors[key] as string;
  const canonicalJson = JSON.stringify({
    v: 1,
    cursors: canonicalCursors,
    completed: sortedCompleted,
    ...(envelope.systemReported === true ? { systemReported: true as const } : {}),
    ...(envelope.systemOffset !== undefined ? { systemOffset: envelope.systemOffset } : {}),
  });
  if (canonicalJson !== rawJson) {
    throw new Error('Authorization drift continuation cursor is invalid.');
  }
  if (envelope.systemOffset !== undefined) {
    if (
      typeof envelope.systemOffset !== 'number' ||
      !Number.isSafeInteger(envelope.systemOffset) ||
      envelope.systemOffset < 1 ||
      envelope.systemOffset > 500
    ) {
      throw new Error('Authorization drift continuation cursor is invalid.');
    }
  }
  const cursorsRecord = envelope.cursors as Record<string, unknown>;
  const state: DriftContinuationState = {};
  for (const [section, cursor] of Object.entries(cursorsRecord)) {
    if (!isDriftContinuationSection(section)) {
      throw new Error('Authorization drift continuation cursor is invalid.');
    }
    if (typeof cursor !== 'string' || cursor.length === 0) {
      throw new Error('Authorization drift continuation cursor is invalid.');
    }
    // The templates section resumes two sub-streams via a `t=<b64>;r=<b64>`
    // cursor whose base64 sides expand past the plain item bound; its detailed
    // shape is validated by the section parser below. All other sections use
    // the strict `item[#offset]` grammar validated here.
    if (section === 'templates') {
      if (cursor.length > 2048) {
        throw new Error('Authorization drift continuation cursor is invalid.');
      }
    } else {
      if (cursor.length > 516) {
        throw new Error('Authorization drift continuation cursor is invalid.');
      }
      const hash = cursor.indexOf('#');
      if (hash >= 0) {
        if (cursor.indexOf('#', hash + 1) >= 0) {
          throw new Error('Authorization drift continuation cursor is invalid.');
        }
        const itemId = cursor.slice(0, hash);
        const suffix = cursor.slice(hash + 1);
        if (itemId.length === 0 || itemId.length > 512 || suffix.length === 0) {
          throw new Error('Authorization drift continuation cursor is invalid.');
        }
        if (!/^[1-9][0-9]*$/.test(suffix)) {
          throw new Error('Authorization drift continuation cursor is invalid.');
        }
        const offset = Number(suffix);
        if (!Number.isSafeInteger(offset) || offset < 1 || offset > 500) {
          throw new Error('Authorization drift continuation cursor is invalid.');
        }
      } else if (cursor.includes('#')) {
        throw new Error('Authorization drift continuation cursor is invalid.');
      }
    }
    if (completed.includes(section)) {
      throw new Error('Authorization drift continuation cursor is invalid.');
    }
    state[section] = cursor;
  }
  for (const section of completed) {
    if (state[section] === undefined) state[section] = '';
  }
  return state;
}

/** Full parsed continuation: per-section cursors, completion, and global flags. */
interface ParsedDriftContinuation {
  readonly cursors: DriftContinuationState;
  readonly completed: readonly DriftContinuationSection[];
  /** True once the unkeyed system-role check has been fully reported. */
  readonly systemReported: boolean;
  /** Number of system findings already flushed when one page could not hold them all. */
  readonly systemOffset: number;
}

function parseDriftContinuation(input: string | undefined): ParsedDriftContinuation {
  const cursors = decodeDriftContinuation(input);
  if (input === undefined) return { cursors, completed: [], systemReported: false, systemOffset: 0 };
  let parsed: unknown;
  try {
    parsed = JSON.parse(Buffer.from(input, 'base64url').toString('utf8'));
  } catch {
    throw new Error('Authorization drift continuation cursor is invalid.');
  }
  if (!isObject(parsed)) throw new Error('Authorization drift continuation cursor is invalid.');
  const completed: DriftContinuationSection[] = [];
  for (const [section, cursor] of Object.entries(cursors)) {
    if (cursor === '' && isDriftContinuationSection(section)) completed.push(section);
  }
  const systemReported = parsed.systemReported === true;
  const rawOffset = parsed.systemOffset;
  if (rawOffset !== undefined) {
    if (!Number.isSafeInteger(rawOffset) || (rawOffset as number) < 0 || (rawOffset as number) > 500) {
      throw new Error('Authorization drift continuation cursor is invalid.');
    }
  }
  const systemOffset = typeof rawOffset === 'number' ? rawOffset : 0;
  // Validate finding-level `item#offset` cursors fail closed on tampering.
  // Anchored strict grammar: `item` is nonempty (<=512) with no `#`
  // delimiters, plus an optional single `#<positive 1..500>` suffix. Any
  // extra `#` (in the item or a second suffix), offset 0, empty item, empty
  // suffix, or bare `#` rejects.
  for (const cursor of Object.values(cursors)) {
    if (cursor === '' || cursor === undefined) continue;
    if (cursor.length > 512 + 1 + 3) {
      // Upper bound: 512 item chars plus `#` plus at most `500`.
    }
    const hash = cursor.indexOf('#');
    if (hash >= 0) {
      // Exactly one `#` delimiter is permitted.
      if (cursor.indexOf('#', hash + 1) >= 0) {
        throw new Error('Authorization drift continuation cursor is invalid.');
      }
      const itemId = cursor.slice(0, hash);
      const suffix = cursor.slice(hash + 1);
      if (itemId.length === 0 || itemId.length > 512 || suffix.length === 0) {
        throw new Error('Authorization drift continuation cursor is invalid.');
      }
      if (itemId.includes('#')) {
        throw new Error('Authorization drift continuation cursor is invalid.');
      }
      if (!/^[1-9][0-9]*$/.test(suffix)) {
        throw new Error('Authorization drift continuation cursor is invalid.');
      }
      const offset = Number(suffix);
      if (!Number.isSafeInteger(offset) || offset < 1 || offset > 500) {
        throw new Error('Authorization drift continuation cursor is invalid.');
      }
    } else if (cursor.length === 0 || cursor.length > 512 || cursor.includes('#')) {
      throw new Error('Authorization drift continuation cursor is invalid.');
    }
  }
  return { cursors, completed, systemReported, systemOffset };
}

/** Versioned continuation: stable per-section keys plus explicit completion. */
function encodeDriftContinuation(
  cursors: Record<string, string>,
  completed: readonly DriftContinuationSection[] = [],
  systemReported = false,
  systemOffset = 0
): string {
  const sortedCursors: Record<string, string> = {};
  for (const key of Object.keys(cursors).sort()) sortedCursors[key] = cursors[key];
  return Buffer.from(
    JSON.stringify({
      v: 1,
      cursors: sortedCursors,
      completed: [...completed].sort(),
      ...(systemReported ? { systemReported: true as const } : {}),
      ...(systemOffset > 0 ? { systemOffset } : {}),
    }),
    'utf8'
  ).toString('base64url');
}

/** Completion marker: empty-string cursor means "section fully scanned". */
function isSectionCompleted(resume: DriftContinuationState, section: DriftContinuationSection): boolean {
  return resume[section] === '';
}

function isObjectIdHex(value: string): boolean {
  return /^[0-9a-fA-F]{24}$/.test(value);
}

/**
 * Applies a bounded `.limit()` to a Waterline query chain before
 * materialization. Fail-closed: when the adapter chain exposes no `.limit`
 * method the bound cannot be enforced, so an explicit
 * `authorization.scan-unbounded` error is thrown and callers must report an
 * incomplete blocker instead of trusting an unbounded result. Callers MUST
 * pass the un-awaited chain: awaiting before calling this helper materializes
 * the full result set first and the bound becomes a no-op. Tests must use lazy
 * cursor/query doubles that assert `.limit()` is applied before resolution,
 * never pre-materialized arrays.
 */
async function withBoundedLimit<T>(chain: unknown, limit: number): Promise<T> {
  if (isObject(chain) && typeof Reflect.get(chain, 'limit') === 'function') {
    const limitFn = Reflect.get(chain, 'limit') as (n: number) => unknown;
    return (await Reflect.apply(limitFn, chain, [limit])) as T;
  }
  throw new Error('authorization.scan-unbounded: query chain exposes no .limit method.');
}

/**
 * Range predicate for the durable `lastId` cursor.
 *
 * sails-mongo maps `id` onto the native `_id`, but does not reify primary-key
 * strings for range modifiers. Convert Mongo-shaped cursors explicitly; keep
 * non-hex cursors as strings for unit-test doubles and string-key adapters.
 * Callers MUST also apply `afterCursorClientSide` to the fetched batch,
 * because an adapter that ignores the predicate (or a mixed-type `_id`
 * collection) would otherwise re-emit the previous page or skip rows.
 */
function idCursorCriteria(cursor: string | undefined): Record<string, unknown> {
  if (cursor === undefined) return {};
  // Non-Mongo adapters and test doubles use the Waterline string criterion.
  // Mongo-shaped cursors are handled by the native page helper below because
  // sails-mongo rejects ObjectId values in Waterline range criteria.
  return { id: { '>': cursor } };
}

function nativeObjectId(value: unknown): string | undefined {
  if (typeof value === 'string') return value;
  if (!isObject(value) || typeof value.toHexString !== 'function') return undefined;
  const hex = Reflect.apply(value.toHexString, value, []);
  return typeof hex === 'string' ? hex : undefined;
}

interface NativeObjectIdConstructor {
  new (value: string): unknown;
  isValid?(value: string): boolean;
}

function nativeObjectIdConstructor(collection: unknown): NativeObjectIdConstructor | undefined {
  if (!isObject(collection) || !isObject(collection.s) || !isObject(collection.s.pkFactory)) return undefined;
  const createPk = collection.s.pkFactory.createPk;
  if (typeof createPk !== 'function') return undefined;
  const sample = Reflect.apply(createPk, collection.s.pkFactory, []);
  if (!isObject(sample) || typeof sample.constructor !== 'function') return undefined;
  return sample.constructor as NativeObjectIdConstructor;
}

/**
 * Fetches only native Mongo ids for a resumed page. Waterline exposes Mongo's
 * ObjectId primary key as a string, but its range validator rejects the native
 * value needed by Mongo's `_id` comparison. The page is subsequently hydrated
 * through the transaction-bound Waterline model, so this helper need not
 * duplicate adapter field conversion.
 */
async function nativeIdPage(
  model: unknown,
  collectionName: string,
  cursor: string | undefined,
  limit: number
): Promise<Array<{ id: string }> | undefined> {
  if (cursor === undefined || !isObjectIdHex(cursor) || !isObject(model)) return undefined;
  const getDatastore = model.getDatastore;
  if (typeof getDatastore !== 'function') return undefined;
  let datastore: unknown;
  try {
    datastore = Reflect.apply(getDatastore, model, []);
  } catch {
    return undefined;
  }
  if (!isObject(datastore)) return undefined;
  const manager = asNativeCollectionManager(datastore.manager);
  if (manager === undefined) return undefined;
  const collection = manager.collection(collectionName);
  if (!isObject(collection) || typeof collection.find !== 'function') return undefined;
  const ObjectIdConstructor = nativeObjectIdConstructor(collection);
  if (ObjectIdConstructor === undefined || ObjectIdConstructor.isValid?.(cursor) !== true) {
    throw new Error('authorization.scan-invalid: native Mongo collection exposes no compatible ObjectId factory.');
  }
  const rawChain = Reflect.apply(collection.find, collection, [
    { _id: { $gt: new ObjectIdConstructor(cursor) } },
    { projection: { _id: 1 } },
  ]);
  if (!isObject(rawChain) || typeof rawChain.sort !== 'function') {
    throw new Error('authorization.scan-unbounded: native id cursor exposes no .sort method.');
  }
  const sorted = Reflect.apply(rawChain.sort, rawChain, [{ _id: 1 }]);
  if (!isObject(sorted) || typeof sorted.limit !== 'function') {
    throw new Error('authorization.scan-unbounded: native id cursor exposes no .limit method.');
  }
  const bounded = Reflect.apply(sorted.limit, sorted, [limit]);
  if (!isObject(bounded) || typeof bounded.toArray !== 'function') {
    throw new Error('authorization.scan-unbounded: native id cursor exposes no .toArray method.');
  }
  const rows: unknown = await Reflect.apply(bounded.toArray, bounded, []);
  if (!Array.isArray(rows)) throw new Error('authorization.scan-invalid: native id cursor returned a non-array page.');
  return rows.map((row, index) => {
    const id = isObject(row) ? nativeObjectId(row._id) : undefined;
    if (id === undefined) {
      throw new Error(`authorization.scan-invalid: native id cursor row ${index} has no readable _id.`);
    }
    return { id };
  });
}

/** Authoritative client-side resume filter: keeps only rows strictly after the cursor. */
function afterCursorClientSide<T extends { id: unknown }>(rows: readonly T[], cursor: string | undefined): T[] {
  if (cursor === undefined) return [...rows];
  return rows.filter(row => String(row.id) > cursor);
}

/**
 * Resume-aware range predicate for drift scans with finding-level offsets.
 *
 * When the continuation carries `itemId#offset` for a section, the current
 * entity still has unflushed findings and must be re-read: a strict
 * `id > itemId` predicate would skip its remainder on a real adapter. An
 * inclusive `id >= itemId` predicate returns the entity again; the
 * client-side `afterResumeClientSide` filter remains authoritative for
 * adapters that ignore the predicate, so no omission or duplication occurs.
 */
function idCursorCriteriaForResume(
  resumeCursor: string | undefined,
  parseItemCursor: (cursor: string | undefined) => { itemId: string; offset: number } | undefined
): Record<string, unknown> {
  const parsed = parseItemCursor(resumeCursor);
  if (parsed === undefined || parsed.itemId === '') return {};
  if (parsed.offset > 0) return { id: { '>=': parsed.itemId } };
  return { id: { '>': parsed.itemId } };
}

/** Maximum finding offset addressable by an `item#offset` subcursor. */
export const DRIFT_FINDING_OFFSET_MAX = 500;
/** Maximum total findings attributed to a single drift entity before overflow blocks. */
export const DRIFT_ENTITY_FINDINGS_MAX = 500;

/**
 * Reusable keyset-page helper for predicate-ignoring adapter detection.
 *
 * Callers request `batchSize + 1` rows (limit+1 probe). The adapter predicate
 * (`id > cursor`) is best-effort: an adapter that ignores it returns the head
 * of the collection on every page. The client-side filter above is
 * authoritative, so a full raw page (`raw.length > batchSize`) with zero
 * post-cursor rows (`batch.length === 0`) proves the adapter made no progress
 * past `cursor` — the scan stalled. Callers must then emit an explicit
 * incomplete blocker/error, preserve their checkpoint/continuation, and never
 * mark the section complete. A short raw page with an empty batch is genuine
 * completion, not a stall.
 */
export interface KeysetPage<T> {
  readonly batch: T[];
  /** True when a full raw page yielded no post-cursor progress. */
  readonly stalled: boolean;
  /** True when the raw probe indicates more rows may remain. */
  readonly hasMore: boolean;
}

export function keysetPage<T extends { id: unknown }>(
  raw: readonly T[],
  cursor: string | undefined,
  batchSize: number
): KeysetPage<T> {
  const batch = afterCursorClientSide(raw, cursor).slice(0, batchSize);
  const hasMore = raw.length > batchSize;
  const stalled = cursor !== undefined && hasMore && batch.length === 0;
  return { batch, stalled, hasMore };
}

/**
 * String-key variant for drift scans that resume from opaque `item[#offset]`
 * cursors. `resumeId` is the already-stripped item id (no `#offset` suffix);
 * an undefined/empty resume means "from the start" and can never stall.
 */
export function keysetPageById<T>(
  raw: readonly T[],
  resumeId: string | undefined,
  limit: number,
  idOf: (row: T) => string,
  afterResume: (id: string) => boolean
): { readonly batch: T[]; readonly stalled: boolean; readonly hasMore: boolean } {
  const filtered = resumeId === undefined || resumeId === '' ? [...raw] : raw.filter(row => afterResume(idOf(row)));
  const batch = filtered.slice(0, limit);
  const hasMore = raw.length > limit;
  const stalled = resumeId !== undefined && resumeId !== '' && hasMore && filtered.length === 0;
  return { batch, stalled, hasMore };
}

/**
 * Operation-sensitive PathRule signature. Legacy grants differ by
 * can_read/can_update, so path+role alone cannot prove a rule is still
 * exercised by the new engine: a flag change is an unmapped operation drift.
 */
function pathRuleOperationSignature(path: string, role: string, canRead: boolean, canUpdate: boolean): string {
  return `${path}::${role}::${canRead ? 'r' : '-'}::${canUpdate ? 'w' : '-'}`;
}

/**
 * Normalizes a live PathRule's operation flags across deployed
 * representations (`can_read`/`can_update` from `auth.config`, `can_write`
 * from the `PathRule` Waterline model, plus camelCase doubles). The actual
 * model uses `can_write`, so `can_update` and `can_write` are treated as the
 * same write grant. Absent or malformed flags grant nothing
 * (`false/false`); they never fall back to path+role matching, otherwise an
 * operation narrowing would be reported as mapped (false negative).
 */
function normalizePathRuleFlags(rule: {
  can_read?: unknown;
  can_update?: unknown;
  can_write?: unknown;
  canRead?: unknown;
  canUpdate?: unknown;
  canWrite?: unknown;
}): { canRead: boolean; canUpdate: boolean } {
  const rawRead = rule.can_read ?? rule.canRead;
  const rawUpdate = rule.can_update ?? rule.canUpdate ?? rule.can_write ?? rule.canWrite;
  const canUpdate = rawUpdate === true;
  // Legacy read grant is can_read OR write. Malformed/absent => false.
  const canRead = rawRead === true || canUpdate;
  return { canRead, canUpdate };
}

/**
 * Waterline many-to-many junction candidates for the dominant `User.roles`
 * (`User.ts:112`) association. Waterline materialises the join in its own
 * collection (conventionally `user_roles__role_users`); the foreign keys live
 * there, never as an inline `roles` array on the native user document.
 */
function userRoleJunctionCandidates(): string[] {
  const candidates = ['user_roles__role_users', 'role_users__user_roles', 'user_roles', 'role_users'];
  try {
    const userTable = waterlineModelName(User, 'user');
    const roleTable = waterlineModelName(Role, 'role');
    for (const candidate of [`${userTable}_roles__${roleTable}_users`, `${roleTable}_users__${userTable}_roles`]) {
      if (!candidates.includes(candidate)) candidates.push(candidate);
    }
  } catch {
    // Identity introspection is best-effort; static candidates still apply.
  }
  return candidates;
}

/** Declared Waterline model identity surface (`tableName`/`identity`). */
interface WaterlineModelIdentity {
  readonly tableName?: unknown;
  readonly identity?: unknown;
}

/** Best-effort model name without blind casts; falls back on any shape mismatch. */
function waterlineModelName(model: unknown, fallback: string): string {
  if (!isObject(model)) return fallback;
  const identityModel: WaterlineModelIdentity = model;
  if (typeof identityModel.tableName === 'string' && identityModel.tableName.length > 0) {
    return identityModel.tableName;
  }
  if (typeof identityModel.identity === 'string' && identityModel.identity.length > 0) {
    return identityModel.identity;
  }
  return fallback;
}

/** Declared native-collection surface for junction introspection. */
interface JunctionCollection {
  find(filter: unknown): unknown;
}

function isNativeCollection(value: unknown): value is JunctionCollection {
  return isObject(value) && typeof value.find === 'function';
}

function discoverUserRoleJunctionCollection():
  | { find: (filter: unknown) => unknown; junctionName: string }
  | undefined {
  try {
    // Prefer an explicitly registered junction model when one is discoverable
    // (e.g. a test double or a Waterline join model containing both sides).
    const sailsGlobal = readSailsGlobal();
    const models = sailsGlobal?.models;
    if (isObject(models)) {
      for (const [identity, model] of Object.entries(models)) {
        const lowered = identity.toLowerCase();
        if (lowered.includes('user') && lowered.includes('role') && isNativeCollection(model)) {
          const find = model.find.bind(model);
          return { find: (filter: unknown): unknown => Reflect.apply(find, model, [filter]), junctionName: identity };
        }
      }
    }
    const datastore: unknown = User.getDatastore?.();
    if (!isObject(datastore)) return undefined;
    const manager = asNativeCollectionManager(datastore.manager);
    if (manager === undefined) return undefined;
    for (const name of userRoleJunctionCandidates()) {
      try {
        const collection: unknown = manager.collection(name);
        if (isNativeCollection(collection)) {
          const find = collection.find.bind(collection);
          return {
            find: (filter: unknown): unknown => Reflect.apply(find, collection, [filter]),
            junctionName: name,
          };
        }
      } catch {
        continue;
      }
    }
    return undefined;
  } catch {
    return undefined;
  }
}

/** Maximum junction rows examined per user before overflow is reported explicitly. */
const JUNCTION_SCAN_ROW_LIMIT = 500;

interface JunctionScanResult {
  readonly docs: Array<Record<string, unknown>>;
  /** True when more than `JUNCTION_SCAN_ROW_LIMIT` rows matched: the prefix is not the full set. */
  readonly truncated: boolean;
  /** True when the read itself failed (adapter/introspection error). */
  readonly failed: boolean;
}

/**
 * Applies `.limit()` to a not-yet-awaited junction target so the bound reaches
 * the adapter. Awaiting first would materialize an unbounded result set.
 * Fail-closed: when the target exposes no `.limit`, the bound cannot be
 * enforced and the caller must treat the scan as failed, never as clean.
 */
function applyPreAwaitJunctionLimit(target: unknown, limit: number): unknown {
  if (isObject(target) && typeof Reflect.get(target, 'limit') === 'function') {
    try {
      return Reflect.apply(Reflect.get(target, 'limit') as (n: number) => unknown, target, [limit]);
    } catch {
      throw new Error('authorization.scan-unbounded: junction target rejects .limit.');
    }
  }
  throw new Error('authorization.scan-unbounded: junction target exposes no .limit.');
}

async function readJunctionDocuments(find: (filter: unknown) => unknown, filter: unknown): Promise<JunctionScanResult> {
  const failed: JunctionScanResult = { docs: [], truncated: false, failed: true };
  let cursor: unknown;
  try {
    // Bound before awaiting: Waterline junction models return a thenable query
    // that executes on await, and native Mongo cursors accept `.limit()`.
    // A missing `.limit` throws above and reports failed, never clean.
    cursor = await applyPreAwaitJunctionLimit(find(filter), JUNCTION_SCAN_ROW_LIMIT + 1);
  } catch {
    return failed;
  }
  try {
    if (Array.isArray(cursor)) {
      const rows = cursor.filter(isObject);
      return {
        docs: rows.slice(0, JUNCTION_SCAN_ROW_LIMIT),
        truncated: rows.length > JUNCTION_SCAN_ROW_LIMIT,
        failed: false,
      };
    }
    if (isArrayCursor(cursor)) {
      const rows: unknown = await cursor.toArray();
      const docs = Array.isArray(rows) ? rows.filter(isObject) : [];
      return {
        docs: docs.slice(0, JUNCTION_SCAN_ROW_LIMIT),
        truncated: docs.length > JUNCTION_SCAN_ROW_LIMIT,
        failed: false,
      };
    }
    if (isForEachCursor(cursor)) {
      // The pre-await `.limit()` above bounds the cursor when the adapter
      // honors it; `forEach` then iterates at most limit+1 rows. Overflow is
      // reported explicitly instead of silently scanning unbounded state.
      const docs: Array<Record<string, unknown>> = [];
      let observed = 0;
      await cursor.forEach(document => {
        observed += 1;
        if (isObject(document) && docs.length <= JUNCTION_SCAN_ROW_LIMIT) docs.push(document);
      });
      return {
        docs: docs.slice(0, JUNCTION_SCAN_ROW_LIMIT),
        truncated: observed > JUNCTION_SCAN_ROW_LIMIT,
        failed: false,
      };
    }
    if (isAsyncIterableCursor(cursor)) {
      // Break once the limit+1 probe is satisfied: no unbounded iteration.
      const docs: Array<Record<string, unknown>> = [];
      for await (const document of cursor) {
        if (isObject(document)) docs.push(document);
        if (docs.length > JUNCTION_SCAN_ROW_LIMIT) break;
      }
      return {
        docs: docs.slice(0, JUNCTION_SCAN_ROW_LIMIT),
        truncated: docs.length > JUNCTION_SCAN_ROW_LIMIT,
        failed: false,
      };
    }
  } catch {
    return failed;
  }
  // Unknown cursor shape: nothing was verified, so fail closed as incomplete
  // rather than clean. Returning clean here would prove nothing about dangling
  // references.
  return failed;
}

/**
 * Explicit Waterline role-side junction attributes for the dominant
 * `User.roles` many-to-many (`User.ts:112`). The junction row's own primary
 * key (`id`/`_id`), timestamps, and metadata must never be mistaken for a role
 * reference. When Waterline attribute metadata is discoverable, the role-side
 * column names come from there; otherwise the known static orientations apply.
 */
const JUNCTION_NON_ROLE_KEYS = new Set([
  'id',
  '_id',
  'createdAt',
  'updatedAt',
  'created_at',
  'updated_at',
  'id__',
  '__v',
]);

function waterlineRoleSideKeys(): string[] {
  const staticKeys = ['role_users', 'role', 'roleId', 'role_id'];
  try {
    const userModel: unknown = Reflect.get(globalThis, 'User');
    if (!isObject(userModel)) return staticKeys;
    const attributes = userModel.attributes;
    if (!isObject(attributes)) return staticKeys;
    const rolesAttribute = attributes.roles;
    if (!isObject(rolesAttribute)) return staticKeys;
    // Dominant side: `User.roles` has `collection: 'role', via: 'users'`.
    // The junction columns are the two association identities; the role side
    // is the one that is not the local `roles` attribute.
    const via = rolesAttribute.via;
    if (typeof via === 'string' && via.length > 0) {
      return [...staticKeys, via].filter((key, index, all) => key.length > 0 && all.indexOf(key) === index);
    }
  } catch {
    // Metadata introspection is best-effort; static keys still apply.
  }
  return staticKeys;
}

const JUNCTION_USER_SIDE_KEYS = ['user_roles', 'user', 'userId', 'user_id'];

function junctionRoleIdsForUser(docs: ReadonlyArray<Record<string, unknown>>, userId: string): string[] {
  const roleKeys = waterlineRoleSideKeys();
  const roleIds: string[] = [];
  const push = (value: unknown): void => {
    const id = associationId(value);
    if (id !== undefined && id !== userId && !roleIds.includes(id)) roleIds.push(id);
  };
  for (const doc of docs) {
    const mentionsUser = JUNCTION_USER_SIDE_KEYS.some(side => {
      const value = doc[side];
      if (Array.isArray(value)) return value.map(String).includes(userId);
      return value !== undefined && String(value) === userId;
    });
    if (!mentionsUser) continue;
    // Role side only: never treat the junction primary key, timestamps, or
    // unrelated metadata as a role reference.
    for (const key of roleKeys) {
      if (JUNCTION_NON_ROLE_KEYS.has(key)) continue;
      const value = doc[key];
      if (Array.isArray(value)) {
        for (const entry of value) push(entry);
      } else if (value !== undefined) {
        push(value);
      }
    }
  }
  return roleIds;
}

/**
 * Discovers orphaned legacy user-role references through the real Waterline
 * many-to-many junction (`User.roles`, `User.ts:112`). `populate('roles')`
 * silently drops rows whose role document no longer exists, so the populated
 * array alone cannot distinguish "no roles" from "dangling references". The
 * junction collection holds the stored foreign keys; diffing those keys against
 * the populated set surfaces dangling references. Never reads an inline
 * `roles` array from the native user document: that array does not exist for a
 * many-to-many association and would always report zero orphans.
 *
 * Junction reads are bounded (`JUNCTION_SCAN_ROW_LIMIT` + 1 probe) with
 * explicit overflow evidence. When junction discovery or every read fails, the
 * scan is reported `incomplete` (fail-closed drift) rather than clean: an
 * empty orphan list then proves nothing about dangling references.
 */
async function findOrphanLegacyRoleIds(
  user: UserAttributes,
  populatedIds: ReadonlySet<string>
): Promise<{ readonly orphanIds: string[]; readonly incomplete: boolean; readonly truncated: boolean }> {
  const clean = { orphanIds: [] as string[], incomplete: false, truncated: false };
  try {
    const junction = discoverUserRoleJunctionCollection();
    if (junction === undefined) return { ...clean, incomplete: true };
    const userId = String(user.id);
    // Junction rows may store the user side under either association column;
    // query both orientations so a dangling row is found regardless of which
    // side Waterline used as dominant.
    const seen = new Map<string, Record<string, unknown>>();
    let readFailed = false;
    let overflow = false;
    for (const filter of [
      { user_roles: userId },
      { role_users: userId },
      { user: userId },
      { $or: [{ user_roles: userId }, { role_users: userId }, { user: userId }] },
    ]) {
      let result: JunctionScanResult;
      try {
        result = await readJunctionDocuments(junction.find, filter);
      } catch {
        continue;
      }
      if (result.failed) {
        readFailed = true;
        continue;
      }
      if (result.truncated) overflow = true;
      for (const doc of result.docs) seen.set(JSON.stringify(doc), doc);
      if (seen.size > 0) break;
    }
    // Every orientation failed: nothing was verified, so the scan is
    // incomplete rather than clean. Overflow alone still yields usable orphan
    // evidence from the bounded prefix, flagged via `truncated`.
    if (seen.size === 0 && readFailed) return { ...clean, incomplete: true };
    const stored = junctionRoleIdsForUser([...seen.values()], userId);
    return {
      orphanIds: stored.filter(id => !populatedIds.has(id)),
      incomplete: false,
      truncated: overflow,
    };
  } catch {
    return { ...clean, incomplete: true };
  }
}

/**
 * Recovers the original legacy user id and role id from a migration
 * sourceKey (`legacy-role:<originalUserId>:<roleId>`). The role id is split
 * at the last colon so user ids containing colons still resolve. Both parts
 * are required: discarding the role or canonical identity would let a direct
 * assignment for an unrelated primary pass as a migrated alias projection.
 */
function migrationSourceKeyParts(
  source: unknown,
  sourceKey: unknown
): { originalUserId: string; roleId: string } | undefined {
  if (source !== 'migration' || typeof sourceKey !== 'string') return undefined;
  const prefix = 'legacy-role:';
  if (!sourceKey.startsWith(prefix)) return undefined;
  const rest = sourceKey.slice(prefix.length);
  const separator = rest.lastIndexOf(':');
  if (separator <= 0 || separator >= rest.length - 1) return undefined;
  const originalUserId = rest.slice(0, separator);
  const roleId = rest.slice(separator + 1);
  if (originalUserId.length === 0 || roleId.length === 0) return undefined;
  return { originalUserId, roleId };
}

function assignmentInput(userId: string, originalUserId: string, role: RoleAttributes): RoleAssignmentCreateRecord {
  const brandId = associationId(role.branding);
  return {
    principalType: 'user',
    principalId: userId,
    role: role.id,
    ...(brandId ? { branding: brandId } : {}),
    source: 'migration',
    sourceKey: `legacy-role:${originalUserId}:${role.id}`,
    status: 'active',
    sourcePresent: true,
    assignedBy: MIGRATION_ACTOR,
    assignedAt: new Date(),
    reason: 'Projected from the retained legacy user-role association.',
    version: 1,
  };
}

export namespace Services {
  export class AuthorizationMigrationService extends services.Core.Service {
    protected override _exportedMethods: string[] = [
      'migrateUserAssignments',
      'reconcileBrandRoles',
      'reportDrift',
      'run',
    ];

    public async reconcileBrandRoles(
      batchSizeInput?: number,
      lease?: Pick<MigrationLeaseHandle, 'owner' | 'fence'>
    ): Promise<AuthorizationMigrationSummary> {
      const previousActive = getActiveMigrationLease();
      if (lease !== undefined) setActiveMigrationLease(lease);
      try {
        // Fail-closed entry gate: with a real durable datastore (or a live
        // holder/production), an absent lease rejects before the first batch
        // transaction can commit role writes ahead of checkpoint rejection.
        const effectiveLease = requireMutationLeaseForDurable('reconcileBrandRoles', lease);
        return await this.reconcileBrandRolesInner(batchSizeInput, effectiveLease);
      } finally {
        if (lease !== undefined) setActiveMigrationLease(previousActive);
      }
    }

    private async reconcileBrandRolesInner(
      batchSizeInput?: number,
      lease?: Pick<MigrationLeaseHandle, 'owner' | 'fence'>
    ): Promise<AuthorizationMigrationSummary> {
      const batchSize = boundedBatchSize(batchSizeInput);
      const summary: MutableMigrationSummary = emptySummary();
      // Internal defense-in-depth: the public entry already requires a lease
      // on durable topologies; a direct inner call must fail closed here too
      // instead of entering batch transactions unfenced.
      requireMutationLeaseForDurable('reconcileBrandRoles', lease);
      if (migrationCheckpointDurabilityUnavailable()) {
        addIssue(summary, {
          code: 'migration-checkpoint-durability-unavailable',
          severity: 'blocker',
          entityType: 'protected-state',
        });
        throw new Error('Authorization migration checkpoint durability is unavailable in production.');
      }
      const templates = await loadTemplates();
      const checkpoint = await readMigrationCheckpoint('roles');
      seedResumedBlockers(summary, checkpoint);
      let lastId = checkpoint?.lastId;
      let scanIncomplete = false;
      for (;;) {
        const criteria = lastId === undefined ? {} : idCursorCriteria(lastId);
        const fetched =
          (await nativeIdPage(Role, waterlineModelName(Role, 'role'), lastId, batchSize + 1)) ??
          ((await Role.find(criteria)
            .sort('id ASC')
            .limit(batchSize + 1)) as RoleAttributes[]);
        // Authoritative resume: the adapter predicate is best-effort (sails-mongo
        // binds 24-hex cursors to native ObjectIds; other adapters may ignore
        // the range). Filter client-side so a resume never re-emits or skips.
        // A full raw page with no post-cursor progress proves the adapter
        // ignored the predicate: fail closed with an explicit incomplete
        // blocker, preserve the checkpoint, and never mark the scan complete.
        const page = keysetPage(fetched, lastId, batchSize);
        if (page.stalled) {
          addIssue(summary, {
            code: 'role-scan-incomplete',
            severity: 'blocker',
            entityType: 'protected-state',
          });
          if (lastId !== undefined) await writeMigrationCheckpoint('roles', lastId, blockerSnapshot(summary));
          scanIncomplete = true;
          break;
        }
        const batch = page.batch;
        if (batch.length === 0) break;
        try {
          await runWithRequiredTransaction(Role.getDatastore(), async connection => {
            if (lease !== undefined) {
              await fenceLeaseInMutationSession(lease, connection, 'roles batch');
            }
            for (const snapshot of batch) {
              summary.rolesScanned += 1;
              const role = await Role.findOne({ id: snapshot.id }).usingConnection(connection);
              if (role == null) continue;
              if (isBrandlessSystemAdministratorRole(role)) continue;
              const brandId = associationId(role.branding);
              if (!brandId) {
                addIssue(summary, {
                  code: 'role-brand-missing',
                  severity: 'blocker',
                  entityType: 'role',
                  entityId: role.id,
                });
                continue;
              }
              if (!isRoleKey(role.name)) {
                addIssue(summary, {
                  code: 'role-key-invalid',
                  severity: 'blocker',
                  entityType: 'role',
                  entityId: role.id,
                });
                continue;
              }
              const duplicateCount = await Role.count({ branding: brandId, name: role.name }).usingConnection(
                connection
              );
              if (duplicateCount !== 1) {
                addIssue(summary, {
                  code: 'duplicate-brand-role-key',
                  severity: 'blocker',
                  entityType: 'role',
                  entityId: role.id,
                });
                continue;
              }
              if (role.key && role.key !== role.name) {
                addIssue(summary, {
                  code: 'role-key-name-drift',
                  severity: 'blocker',
                  entityType: 'role',
                  entityId: role.id,
                });
                continue;
              }
              const definition = templateForLegacyRole(role.name);
              const template = definition ? templates.get(String(definition.key)) : undefined;
              if (definition !== undefined && template === undefined) {
                addIssue(summary, {
                  code: 'default-template-missing',
                  severity: 'blocker',
                  entityType: 'role',
                  entityId: role.id,
                });
                continue;
              }
              const projection = roleProjection(role, brandId, template, definition);
              if (!projectionDiffers(role, projection)) continue;
              const updated = await Role.updateOne(roleMigrationUpdateCriteria(role))
                .set(projection)
                .meta({ skipAllLifecycleCallbacks: true })
                .usingConnection(connection);
              if (updated == null) throw new Error(`Role '${role.id}' changed concurrently during migration.`);
              await migrationAudit(
                'role.updated',
                'role',
                role.id,
                { key: role.name, contextType: 'brand', protectedKind: projection.protectedKind },
                connection,
                brandId
              );
              summary.rolesMigrated += 1;
            }
            await migrationAudit(
              'authorization.migration.batch-applied',
              'authorization-migration',
              AUTHORIZATION_MIGRATION_NAME,
              { phase: 'roles', batchSize: batch.length },
              connection
            );
            if (lease !== undefined) {
              await fenceLeaseInMutationSession(lease, connection, 'roles batch (pre-commit)');
            }
          });
          summary.metrics.batchesApplied += 1;
          authorizationMigrationBatchOutcomes.add(1, { phase: 'roles', outcome: 'applied' });
        } catch (error) {
          summary.metrics.transactionFailures += 1;
          authorizationMigrationBatchOutcomes.add(1, { phase: 'roles', outcome: 'failed' });
          authorizationMigrationTransactionFailures.add(1, { phase: 'roles' });
          emitMigrationMetrics('roles batch failed', summary);
          // Persist cumulative blocker state with the cursor so an interrupted
          // lift resumes without losing blockers found in completed batches.
          if (lastId !== undefined) await writeMigrationCheckpoint('roles', lastId, blockerSnapshot(summary));
          throw error;
        }
        lastId = String(batch[batch.length - 1].id);
        await writeMigrationCheckpoint('roles', lastId, blockerSnapshot(summary));
      }
      // Completed scan: rescan is unnecessary; the accumulated prefix plus the
      // persisted blocker snapshot already carry every completed-batch blocker.
      // Surface truncation explicitly instead of silently capping at 500.
      // A stalled predicate-ignoring scan preserves its checkpoint above and
      // never clears: the remainder is unverified, not complete.
      if (!scanIncomplete) await clearMigrationCheckpoint('roles');
      emitMigrationMetrics('roles reconciled', summary);
      return freezeSummary(summary);
    }

    public async migrateUserAssignments(
      batchSizeInput?: number,
      onlyUserIds?: readonly string[],
      lease?: Pick<MigrationLeaseHandle, 'owner' | 'fence'>
    ): Promise<AuthorizationMigrationSummary> {
      const previousActive = getActiveMigrationLease();
      if (lease !== undefined) setActiveMigrationLease(lease);
      try {
        // Fail-closed entry gate shared with the roles path: unleased callers
        // on a durable datastore must not create assignment rows before the
        // checkpoint write rejects.
        const effectiveLease = requireMutationLeaseForDurable('migrateUserAssignments', lease);
        return await this.migrateUserAssignmentsInner(batchSizeInput, onlyUserIds, effectiveLease);
      } finally {
        if (lease !== undefined) setActiveMigrationLease(previousActive);
      }
    }

    private async migrateUserAssignmentsInner(
      batchSizeInput?: number,
      onlyUserIds?: readonly string[],
      lease?: Pick<MigrationLeaseHandle, 'owner' | 'fence'>
    ): Promise<AuthorizationMigrationSummary> {
      const batchSize = boundedBatchSize(batchSizeInput);
      const summary: MutableMigrationSummary = emptySummary();
      const scoped = onlyUserIds !== undefined;
      // The scoped bootstrap parent-admin path also mutates assignment rows:
      // it must prove the lease on durable topologies exactly like full scans.
      requireMutationLeaseForDurable('migrateUserAssignments', lease);
      if (!scoped && migrationCheckpointDurabilityUnavailable()) {
        addIssue(summary, {
          code: 'migration-checkpoint-durability-unavailable',
          severity: 'blocker',
          entityType: 'protected-state',
        });
        throw new Error('Authorization migration checkpoint durability is unavailable in production.');
      }
      // The durable cursor belongs to full scans only: an explicitly requested
      // id set (for example the bootstrap parent administrator) must never be
      // suppressed by a stale global cursor, nor may a scoped run pollute the
      // full-scan resume position.
      const scopedIds = scoped ? [...(onlyUserIds as readonly string[])].sort() : undefined;
      const checkpoint = scoped ? undefined : await readMigrationCheckpoint('assignments');
      seedResumedBlockers(summary, checkpoint);
      let lastId = checkpoint?.lastId;
      let overflowBlocked = false;
      for (;;) {
        const criteria = scoped
          ? { id: (scopedIds as string[]).filter(id => lastId === undefined || id > lastId).slice(0, batchSize) }
          : lastId === undefined
            ? {}
            : idCursorCriteria(lastId);
        // Adapter-bounded nested roles: the per-user `roles` collection is
        // populated with an explicit limit+1 probe (501) before
        // materialization, so one pathological user cannot materialize an
        // unbounded association. Overflow is reported explicitly below.
        const fetched = (await User.find(criteria)
          .populate('roles', { limit: JUNCTION_SCAN_ROW_LIMIT + 1, sort: 'id ASC' })
          .sort('id ASC')
          .limit(scoped ? batchSize : batchSize + 1)) as UserAttributes[];
        // Full raw page with no post-cursor progress proves the adapter
        // ignored the range predicate: fail closed, preserve the checkpoint,
        // and never mark the scan complete. Scoped id-set runs address rows
        // directly and cannot stall on a range predicate.
        if (!scoped) {
          const userPage = keysetPage(fetched, lastId, batchSize);
          if (userPage.stalled) {
            addIssue(summary, {
              code: 'user-scan-incomplete',
              severity: 'blocker',
              entityType: 'protected-state',
            });
            if (lastId !== undefined) await writeMigrationCheckpoint('assignments', lastId, blockerSnapshot(summary));
            overflowBlocked = true;
            break;
          }
        }
        const batch = scoped ? fetched : afterCursorClientSide(fetched, lastId).slice(0, batchSize);
        if (batch.length === 0) break;
        const overflowUserIds = new Set<string>();
        const assignmentMutations: Array<() => Promise<void>> = [];
        try {
          // Finish the fenced read snapshot before opening assignment transactions;
          // nested writers would contend with this transaction on the lease row.
          await runWithRequiredTransaction(User.getDatastore(), async connection => {
            if (lease !== undefined) {
              await fenceLeaseInMutationSession(lease, connection, 'assignments batch');
            }
            for (const user of batch) {
              summary.usersScanned += 1;
              const canonical = await canonicalUser(user, connection, summary);
              if (canonical === undefined) continue;
              const populatedIds = new Set<string>();
              for (const roleValue of user.roles ?? []) {
                if (isRoleAttributes(roleValue)) populatedIds.add(String(roleValue.id));
              }
              // Populate drops dangling references, so diff the stored foreign
              // keys against the populated set to surface orphaned legacy roles.
              // A failed junction scan is blocking drift, never clean: without
              // the junction, dangling references are unverifiable.
              const junctionScan = await findOrphanLegacyRoleIds(user, populatedIds);
              if (junctionScan.incomplete) {
                addIssue(summary, {
                  code: 'user-role-junction-scan-incomplete',
                  severity: 'blocker',
                  entityType: 'user',
                  entityId: user.id,
                });
              }
              if (junctionScan.truncated) {
                addIssue(summary, {
                  code: 'user-role-junction-scan-truncated',
                  severity: 'warning',
                  entityType: 'user',
                  entityId: user.id,
                });
              }
              // Fail-closed nested overflow: the populate limit+1 probe (501)
              // proves the prefix is incomplete when more than 500 roles are
              // present. Migrating only the first 500 would leave a partial
              // grant while the checkpoint advances past the user, so the user
              // is skipped entirely as a blocker and the checkpoint below does
              // not advance past them.
              const nestedOverflow =
                (user.roles ?? []).length > JUNCTION_SCAN_ROW_LIMIT || junctionScan.truncated === true;
              if (nestedOverflow) {
                addIssue(summary, {
                  code: 'user-role-associations-overflow',
                  severity: 'blocker',
                  entityType: 'user',
                  entityId: user.id,
                });
                overflowUserIds.add(String(user.id));
                continue;
              }
              for (const orphanId of junctionScan.orphanIds) {
                addIssue(summary, {
                  code: 'user-role-reference-missing',
                  severity: 'blocker',
                  entityType: 'user',
                  entityId: user.id,
                });
                void orphanId;
              }
              for (const roleValue of user.roles ?? []) {
                if (!isRoleAttributes(roleValue)) {
                  addIssue(summary, {
                    code: 'user-role-reference-missing',
                    severity: 'blocker',
                    entityType: 'user',
                    entityId: user.id,
                  });
                  continue;
                }
                const role = roleValue;
                if (role.protectedKind === 'guest' || role.name === 'Guest') {
                  summary.guestAssociationsSkipped += 1;
                  continue;
                }
                if (role.contextType !== 'brand' || !associationId(role.branding)) {
                  addIssue(summary, {
                    code: 'user-role-not-migrated',
                    severity: 'blocker',
                    entityType: 'role',
                    entityId: role.id,
                  });
                  continue;
                }
                const input = assignmentInput(String(canonical.id), String(user.id), role);
                const rawExisting: unknown = await RoleAssignment.findOne(
                  migrationAssignmentSelector(input)
                ).usingConnection(connection);
                const existing = asOptionalRoleAssignmentAttributes(rawExisting, 'assignment reread');
                if (existing != null) {
                  // A pre-existing tuple row is adopted only when it is the
                  // complete effective canonical projection; otherwise the
                  // legacy association has no live grant and that blocks.
                  // The reread, full validation, and adopt-noop audit share one
                  // fresh required transaction so the adoption is audited
                  // atomically and an audit failure rolls back the observation.
                  const existingBlocker = migrationWinnerBlocker(input, existing, new Date());
                  if (existingBlocker !== undefined) {
                    addIssue(summary, {
                      code: existingBlocker,
                      severity: 'blocker',
                      entityType: 'assignment',
                      entityId: existing.id,
                    });
                    continue;
                  }
                  assignmentMutations.push(async () => {
                    try {
                      await runWithRequiredTransaction(User.getDatastore(), async freshConnection => {
                        if (lease !== undefined) {
                          await fenceLeaseInMutationSession(lease, freshConnection, 'assignment adoption');
                        }
                        const rawReread: unknown = await RoleAssignment.findOne(
                          migrationAssignmentSelector(input)
                        ).usingConnection(freshConnection);
                        const reread = asOptionalRoleAssignmentAttributes(rawReread, 'adoption reread');
                        if (reread == null) throw new Error('Migration winner disappeared during adoption.');
                        const rereadBlocker = migrationWinnerBlocker(input, reread, new Date());
                        if (rereadBlocker !== undefined) throw new Error(`Migration winner invalid: ${rereadBlocker}.`);
                        await sails.services.authorizationauditservice.createSucceededEvent(
                          {
                            eventType: 'assignment.noop',
                            actorType: 'system-process',
                            actorId: MIGRATION_ACTOR,
                            authMethod: 'internal',
                            targetType: 'role-assignment',
                            targetId: reread.id,
                            brandId: associationId(role.branding),
                            after: {
                              principalId: input.principalId,
                              roleId: role.id,
                              source: 'migration',
                              state: 'active-adopted',
                            },
                            reasonCode: AUTHORIZATION_MIGRATION_NAME,
                          },
                          freshConnection
                        );
                        if (lease !== undefined) {
                          await fenceLeaseInMutationSession(lease, freshConnection, 'assignment adoption (pre-commit)');
                        }
                      });
                    } catch (auditError) {
                      // A failed reread/audit means the winner cannot be proven
                      // effective: fail closed as blocking drift rather than
                      // silently adopting.
                      const message = auditError instanceof Error ? auditError.message : String(auditError);
                      if (message.startsWith('Migration winner')) {
                        const code = message.includes(':')
                          ? message.slice(message.indexOf(':') + 2).replace(/\.$/, '')
                          : 'migration-winner-not-effective';
                        addIssue(summary, {
                          code,
                          severity: 'blocker',
                          entityType: 'assignment',
                          entityId: existing.id,
                        });
                      } else {
                        throw auditError;
                      }
                    }
                  });
                  continue;
                }
                // A concurrent migration worker may win the check-then-create race on
                // the unique source tuple. Creation plus its success audit commit
                // atomically in a fresh transaction/session: the failed creation
                // transaction is aborted/ended before the winner reread, because
                // MongoDB aborts the transaction on duplicate-key and the aborted
                // session is unusable. The batch read session closes before
                // the mutation, so a later batch failure cannot leave an
                // assignment committed without its audit.
                assignmentMutations.push(async () => {
                  const created = await createMigrationAssignmentWithAuditAtomically(
                    input,
                    {
                      after: { principalId: input.principalId, roleId: role.id, source: 'migration' },
                      brandId: associationId(role.branding),
                    },
                    User.getDatastore(),
                    summary.metrics,
                    (code, winner) => {
                      addIssue(summary, {
                        code,
                        severity: 'blocker',
                        entityType: 'assignment',
                        entityId: winner.id,
                      });
                    },
                    lease
                  );
                  if (created !== undefined) summary.assignmentsCreated += 1;
                });
              }
            }
            if (lease !== undefined) {
              await fenceLeaseInMutationSession(lease, connection, 'assignments batch read (pre-commit)');
            }
          });
          for (const mutateAssignment of assignmentMutations) {
            await mutateAssignment();
          }
          await runWithRequiredTransaction(User.getDatastore(), async connection => {
            if (lease !== undefined) {
              await fenceLeaseInMutationSession(lease, connection, 'assignments batch audit');
            }
            await migrationAudit(
              'authorization.migration.batch-applied',
              'authorization-migration',
              AUTHORIZATION_MIGRATION_NAME,
              { phase: 'assignments', batchSize: batch.length },
              connection
            );
            if (lease !== undefined) {
              await fenceLeaseInMutationSession(lease, connection, 'assignments batch (pre-commit)');
            }
          });
          summary.metrics.batchesApplied += 1;
          authorizationMigrationBatchOutcomes.add(1, { phase: 'assignments', outcome: 'applied' });
        } catch (error) {
          summary.metrics.transactionFailures += 1;
          authorizationMigrationBatchOutcomes.add(1, { phase: 'assignments', outcome: 'failed' });
          authorizationMigrationTransactionFailures.add(1, { phase: 'assignments' });
          emitMigrationMetrics('assignments batch failed', summary);
          if (!scoped && lastId !== undefined)
            await writeMigrationCheckpoint('assignments', lastId, blockerSnapshot(summary));
          throw error;
        }
        if (!scoped && overflowUserIds.size > 0) {
          // Fail-closed checkpoint hold: do not advance past the first
          // overflow user. The blocker above forces operator remediation;
          // advancing would mark a partially-migrated user as complete.
          const firstOverflowIndex = batch.findIndex(user => overflowUserIds.has(String(user.id)));
          const holdId = firstOverflowIndex > 0 ? String(batch[firstOverflowIndex - 1].id) : lastId;
          if (holdId !== undefined) await writeMigrationCheckpoint('assignments', holdId, blockerSnapshot(summary));
          overflowBlocked = true;
          break;
        }
        const lastBatchRow = batch[batch.length - 1];
        if (lastBatchRow === undefined) break;
        lastId = String(lastBatchRow.id);
        if (!scoped) await writeMigrationCheckpoint('assignments', lastId, blockerSnapshot(summary));
      }
      if (!scoped && !overflowBlocked) await clearMigrationCheckpoint('assignments');
      emitMigrationMetrics('assignments migrated', summary);
      return freezeSummary(summary);
    }

    public async run(
      batchSizeInput?: number,
      lease?: Pick<MigrationLeaseHandle, 'owner' | 'fence'>
    ): Promise<AuthorizationMigrationSummary> {
      const previousActive = getActiveMigrationLease();
      if (lease !== undefined) setActiveMigrationLease(lease);
      try {
        const effectiveLease = effectiveCheckpointLease(lease);
        if (effectiveLease === undefined) {
          throw new Error(
            'Authorization migration run rejected: no migration lease is held; acquire the migration lease first.'
          );
        }
        await sails.services.authorizationscopeservice.bootstrap(undefined, effectiveLease);
        const roles = await this.reconcileBrandRolesInner(batchSizeInput, effectiveLease);
        const assignments = await this.migrateUserAssignmentsInner(batchSizeInput, undefined, effectiveLease);
        const metrics = Object.freeze({
          batchesApplied: roles.metrics.batchesApplied + assignments.metrics.batchesApplied,
          conflictsResolved: roles.metrics.conflictsResolved + assignments.metrics.conflictsResolved,
          transactionFailures: roles.metrics.transactionFailures + assignments.metrics.transactionFailures,
        });
        // Fail-closed truncation: either phase may have capped its 500-entry
        // prefix (`issuesTruncated`), and the merged prefix itself is capped at
        // 500. A capped prefix is never the full set: a blocker beyond the cap
        // (for example 500 warnings followed by a blocker) would otherwise be
        // invisible to an entrypoint that only inspects visible blockers.
        const merged = [...roles.issues, ...assignments.issues];
        const issuesTruncated =
          roles.issuesTruncated === true || assignments.issuesTruncated === true || merged.length > 500;
        const result = Object.freeze({
          rolesScanned: roles.rolesScanned,
          rolesMigrated: roles.rolesMigrated,
          usersScanned: assignments.usersScanned,
          assignmentsCreated: assignments.assignmentsCreated,
          guestAssociationsSkipped: assignments.guestAssociationsSkipped,
          issues: Object.freeze(merged.slice(0, 500)),
          metrics,
          ...(issuesTruncated ? { issuesTruncated: true as const } : {}),
        });
        const counts = result.issues.reduce<Record<string, number>>((summary, issue) => {
          summary[issue.code] = (summary[issue.code] ?? 0) + 1;
          return summary;
        }, {});
        sails.log.info(`${this.logHeader} Authorization migration summary`, {
          rolesScanned: result.rolesScanned,
          rolesMigrated: result.rolesMigrated,
          usersScanned: result.usersScanned,
          assignmentsCreated: result.assignmentsCreated,
          guestAssociationsSkipped: result.guestAssociationsSkipped,
          issueCounts: counts,
          batchesApplied: metrics.batchesApplied,
          conflictsResolved: metrics.conflictsResolved,
          transactionFailures: metrics.transactionFailures,
        });
        return result;
      } finally {
        if (lease !== undefined) setActiveMigrationLease(previousActive);
      }
    }

    public async reportDrift(limitInput = 100, continuationInput?: string): Promise<AuthorizationDriftReport> {
      const limit = boundedBatchSize(limitInput);
      const parsed = parseDriftContinuation(continuationInput);
      const resume = parsed.cursors;
      const now = new Date();
      const issues: AuthorizationMigrationIssue[] = [];
      let truncated = false;
      const continuationCursors: Record<string, string> = {};
      const completedSections: DriftContinuationSection[] = [...parsed.completed];
      // Last fully flushed item key per section, plus finding-level offsets for
      // single items that alone exceed the page limit (`itemId#offset`). The
      // continuation resumes from these keys so a findings-full page always
      // carries a usable cursor: items flush atomically when they fit,
      // otherwise the first `limit` findings flush partially and the remainder
      // continues from the recorded offset (no omission, no duplication).
      const progress: Record<string, string> = {};
      const partialOffsets: Record<string, { itemId: string; offset: number }> = {};
      // `true` once the bounded findings page is full: remaining sections are
      // not scanned on this page, and the continuation resumes at the active
      // section cursor so no finding is omitted or duplicated across pages.
      let pageFull = false;
      const parseItemCursor = (cursor: string | undefined): { itemId: string; offset: number } | undefined => {
        if (cursor === undefined || cursor === '') return undefined;
        // Strict single-`#` split: validated cursors carry at most one `#`
        // (see parseDriftContinuation); a second `#` is never a valid offset
        // and resumes as the whole item so it cannot alias another key.
        const hash = cursor.indexOf('#');
        if (hash < 0) return { itemId: cursor, offset: 0 };
        if (hash === 0 || cursor.indexOf('#', hash + 1) >= 0) return { itemId: cursor, offset: 0 };
        const suffix = cursor.slice(hash + 1);
        if (!/^[1-9][0-9]*$/.test(suffix)) return { itemId: cursor, offset: 0 };
        const offset = Number(suffix);
        if (!Number.isSafeInteger(offset) || offset < 1 || offset > 500) return { itemId: cursor, offset: 0 };
        return { itemId: cursor.slice(0, hash), offset };
      };
      /** Stripped item id for range predicates; `#offset` suffix never reaches the adapter. */
      const resumeItemId = (section: DriftContinuationSection): string | undefined => {
        const parsedCursor = parseItemCursor(resume[section]);
        return parsedCursor?.itemId;
      };
      /** Client-side resume filter aware of `item#offset`: same item re-scans for its remainder. */
      const afterResumeClientSide = (id: string, section: DriftContinuationSection): boolean => {
        const parsedCursor = parseItemCursor(resume[section]);
        if (parsedCursor === undefined) return true;
        if (id > parsedCursor.itemId) return true;
        return id === parsedCursor.itemId && parsedCursor.offset > 0;
      };
      const flushItem = (
        section: DriftContinuationSection,
        itemId: string,
        local: readonly AuthorizationMigrationIssue[]
      ): boolean => {
        if (pageFull) return false;
        // Apply a resumed finding offset for this item when the continuation
        // carries `itemId#offset` from a prior partial flush.
        const resumed = parseItemCursor(resume[section]);
        const resumedOffset =
          resumed !== undefined && resumed.itemId === itemId && resumed.offset > 0 ? resumed.offset : 0;
        // Per-entity finding bound: an entity with more than 500 total
        // findings can never be addressed by an `item#offset` subcursor
        // (decoder caps offsets at 500). Cap the entity at 500 findings
        // including an explicit overflow blocker so the reporter can never
        // emit an unparseable `item#501` cursor.
        let effectiveLocal = resumedOffset > 0 ? local.slice(resumedOffset) : [...local];
        if (resumedOffset >= DRIFT_ENTITY_FINDINGS_MAX) {
          effectiveLocal = [
            Object.freeze({
              code: `${section}-findings-overflow`,
              severity: 'blocker',
              entityType: 'protected-state',
              entityId: itemId,
            } as AuthorizationMigrationIssue),
          ];
        } else if (resumedOffset + effectiveLocal.length > DRIFT_ENTITY_FINDINGS_MAX) {
          const keep = Math.max(0, DRIFT_ENTITY_FINDINGS_MAX - resumedOffset - 1);
          effectiveLocal = [
            ...effectiveLocal.slice(0, keep),
            Object.freeze({
              code: `${section}-findings-overflow`,
              severity: 'blocker',
              entityType: 'protected-state',
              entityId: itemId,
            } as AuthorizationMigrationIssue),
          ];
        }
        if (issues.length + effectiveLocal.length <= limit) {
          for (const issue of effectiveLocal) issues.push(Object.freeze(issue));
          progress[section] = itemId;
          return true;
        }
        // Single item alone exceeds the remaining page: when the page is still
        // empty, flush findings partially so pagination always progresses
        // (limit=1 over a multi-finding entity still returns 1 finding plus a
        // continuation). Otherwise defer the whole item to the next page.
        if (issues.length === 0 && effectiveLocal.length > 0) {
          const take = Math.min(limit, effectiveLocal.length);
          for (const issue of effectiveLocal.slice(0, take)) issues.push(Object.freeze(issue));
          const consumed = (resumed !== undefined && resumed.itemId === itemId ? resumed.offset : 0) + take;
          partialOffsets[section] = { itemId, offset: consumed };
          progress[section] = `${itemId}#${consumed}`;
          truncated = true;
          pageFull = true;
          return false;
        }
        truncated = true;
        pageFull = true;
        return false;
      };
      const markCompleted = (section: DriftContinuationSection): void => {
        if (!completedSections.includes(section)) completedSections.push(section);
      };
      let systemReported = parsed.systemReported;
      let systemOffsetFlushed = 0;
      // Every scan below is stable-sorted by `id ASC` and bounded with a
      // limit+1 probe so truncation is detected rather than silently dropped.
      // When truncated, `continuation` carries the versioned active-section
      // cursor plus explicit completion state so an operator resumes via the
      // validated opaque `continuationInput` cursor without omissions or
      // duplicates across pages. Each item's findings flush atomically through
      // `flushItem`: either every finding for the item fits on this page, or
      // the whole item is deferred to the next page via the progress cursor.
      // The unkeyed system-role check runs first on a fresh scan and is
      // reported exactly once via the `systemReported` continuation flag.
      if (!systemReported && !pageFull) {
        // Limit is applied to the un-awaited chain so the adapter bounds the
        // scan; awaiting first would materialize every row before the bound.
        // Fail-closed when the bound cannot be enforced.
        let systemRoles: RoleAttributes[] | undefined;
        try {
          systemRoles = (await withBoundedLimit<RoleAttributes[] | undefined>(
            Role.find({
              contextType: 'system',
              protectedKind: 'system-admin',
              status: 'active',
            }).sort('id ASC'),
            501
          )) as RoleAttributes[] | undefined;
        } catch {
          systemRoles = undefined;
        }
        const systemLocal: AuthorizationMigrationIssue[] = [];
        if (systemRoles === undefined) {
          systemLocal.push({
            code: 'system-role-scan-incomplete',
            severity: 'blocker',
            entityType: 'protected-state',
          });
        } else if ((systemRoles ?? []).length !== 1) {
          systemLocal.push({
            code: 'system-admin-role-count-invalid',
            severity: 'blocker',
            entityType: 'protected-state',
          });
        } else if (!isExactSystemAdminRole((systemRoles as RoleAttributes[])[0])) {
          systemLocal.push({
            code: 'system-admin-role-identity-drift',
            severity: 'blocker',
            entityType: 'protected-state',
            entityId: String((systemRoles as RoleAttributes[])[0].id),
          });
        } else {
          const count = await RoleAssignment.count(effectiveAssignmentCriteria({ role: systemRoles?.[0].id }, now));
          if (count === 0)
            systemLocal.push({
              code: 'system-admin-assignment-missing',
              severity: 'blocker',
              entityType: 'protected-state',
            });
          if (count === 1)
            systemLocal.push({
              code: 'system-admin-enforce-quorum-low',
              severity: 'warning',
              entityType: 'protected-state',
            });
        }
        const pendingSystem = systemLocal.slice(parsed.systemOffset);
        if (issues.length + pendingSystem.length <= limit) {
          for (const issue of pendingSystem) issues.push(Object.freeze(issue));
          systemReported = true;
          systemOffsetFlushed = 0;
        } else if (issues.length === 0 && pendingSystem.length > 0) {
          // Finding-level pagination for the unkeyed system check: a limit=1
          // page over two system findings still progresses with a continuation.
          const take = Math.min(limit, pendingSystem.length);
          for (const issue of pendingSystem.slice(0, take)) issues.push(Object.freeze(issue));
          systemOffsetFlushed = parsed.systemOffset + take;
          truncated = true;
          pageFull = true;
        } else {
          truncated = true;
          pageFull = true;
        }
      }
      if (!isSectionCompleted(resume, 'brands') && !pageFull) {
        const brandResumeId = resumeItemId('brands');
        const fetchedBrands = (await BrandingConfig.find(idCursorCriteriaForResume(resume.brands, parseItemCursor))
          .sort('id ASC')
          .limit(limit + 1)) as Array<{ id: string }>;
        const brandPage = keysetPageById(
          fetchedBrands,
          brandResumeId,
          limit,
          brand => String(brand.id),
          id => afterResumeClientSide(id, 'brands')
        );
        if (brandPage.stalled) {
          // Full raw page with no post-cursor progress: the adapter ignored
          // the range predicate. Fail closed, preserve the resume cursor, and
          // never mark the section complete.
          issues.push(
            Object.freeze({
              code: 'brand-scan-incomplete',
              severity: 'blocker',
              entityType: 'protected-state',
            } as AuthorizationMigrationIssue)
          );
          truncated = true;
          pageFull = true;
        } else {
          const brands = brandPage.batch;
          if (brandPage.hasMore) {
            truncated = true;
          }
          let flushedAll = true;
          for (const brand of brands.slice(0, limit)) {
            if (pageFull) {
              flushedAll = false;
              break;
            }
            const local: AuthorizationMigrationIssue[] = [];
            const guests = await Role.count({ branding: brand.id, protectedKind: 'guest', status: 'active' });
            if (guests !== 1) {
              local.push({
                code: 'protected-guest-count-invalid',
                severity: 'blocker',
                entityType: 'protected-state',
                entityId: brand.id,
              });
            } else {
              // Exact Guest identity: count alone cannot prove key, displayName,
              // context, brand, version, and identity are exact.
              const guestRow = (await Role.findOne({
                branding: brand.id,
                protectedKind: 'guest',
                status: 'active',
              })) as RoleAttributes | null | undefined;
              if (guestRow == null || !isExactGuestRole(guestRow, String(brand.id))) {
                local.push({
                  code: 'protected-guest-identity-drift',
                  severity: 'blocker',
                  entityType: 'protected-state',
                  entityId: brand.id,
                });
              } else {
                // Floor-removal overrides must block even before bootstrap
                // deletes them: an effective Guest without the floor grants
                // nothing for `authorization.self.read` and fails closed only
                // when reported. Bounded single-row probe; failure blocks.
                try {
                  const overrideModel = (globalThis as Record<string, unknown>).RoleScopeOverride as
                    | { findOne(criteria: unknown): unknown }
                    | undefined;
                  if (overrideModel === undefined || typeof overrideModel.findOne !== 'function') {
                    throw new Error('RoleScopeOverride model unavailable.');
                  }
                  const floorRemoval = (await overrideModel.findOne({
                    role: guestRow.id,
                    effect: 'remove',
                    scopeKey: 'authorization.self.read',
                  })) as unknown;
                  if (floorRemoval != null) {
                    local.push({
                      code: 'protected-guest-floor-removed',
                      severity: 'blocker',
                      entityType: 'role',
                      entityId: String(guestRow.id),
                    });
                  }
                } catch {
                  local.push({
                    code: 'protected-guest-override-scan-incomplete',
                    severity: 'blocker',
                    entityType: 'role',
                    entityId: String(guestRow.id),
                  });
                }
              }
            }
            const adminProbe = (await withBoundedLimit<RoleAttributes[]>(
              Role.find({
                branding: brand.id,
                protectedKind: 'brand-admin',
                status: 'active',
              }).sort('id ASC'),
              502
            )) as RoleAttributes[];
            if (adminProbe.length > 501) {
              local.push({
                code: 'brand-admin-role-scan-truncated',
                severity: 'blocker',
                entityType: 'protected-state',
                entityId: brand.id,
              });
            }
            const admins = adminProbe.slice(0, 501);
            // Exact brand-admin identity: every active brand-admin pin must
            // carry the exact key/identity/display/context/brand/version.
            for (const admin of admins) {
              if (!isExactBrandAdminRole(admin, String(brand.id))) {
                local.push({
                  code: 'brand-admin-role-identity-drift',
                  severity: 'blocker',
                  entityType: 'role',
                  entityId: String(admin.id),
                });
                break;
              }
            }
            if (admins.length === 0) {
              local.push({
                code: 'brand-admin-role-missing',
                severity: 'blocker',
                entityType: 'protected-state',
                entityId: brand.id,
              });
              if (!flushItem('brands', String(brand.id), local)) {
                flushedAll = false;
                break;
              }
              continue;
            }
            const activeAssignments = await RoleAssignment.count(
              effectiveAssignmentCriteria({ role: admins.map(role => role.id) }, now)
            );
            if (activeAssignments === 0) {
              local.push({
                code: 'brand-admin-assignment-missing',
                severity: 'blocker',
                entityType: 'protected-state',
                entityId: brand.id,
              });
            }
            if (!flushItem('brands', String(brand.id), local)) {
              flushedAll = false;
              break;
            }
          }
          if (!brandPage.hasMore && flushedAll) markCompleted('brands');
        }
      } // end brands section
      if (!isSectionCompleted(resume, 'users') && !pageFull) {
        const userResumeId = resumeItemId('users');
        const fetchedUsers = (await User.find(idCursorCriteriaForResume(resume.users, parseItemCursor))
          .populate('roles', { limit: JUNCTION_SCAN_ROW_LIMIT + 1, sort: 'id ASC' })
          .sort('id ASC')
          .limit(limit + 1)) as UserAttributes[];
        const userPage = keysetPageById(
          fetchedUsers,
          userResumeId,
          limit,
          user => String(user.id),
          id => afterResumeClientSide(id, 'users')
        );
        if (userPage.stalled) {
          issues.push(
            Object.freeze({
              code: 'user-scan-incomplete',
              severity: 'blocker',
              entityType: 'protected-state',
            } as AuthorizationMigrationIssue)
          );
          truncated = true;
          pageFull = true;
        } else {
          const users = userPage.batch;
          if (userPage.hasMore) {
            truncated = true;
          }
          let flushedAll = true;
          for (const user of users.slice(0, limit)) {
            if (pageFull) {
              flushedAll = false;
              break;
            }
            const local: AuthorizationMigrationIssue[] = [];
            // Drift must canonicalize exactly the way the migration did. A single hop would
            // report a false projection gap for any alias chain longer than one link.
            const canonical = await canonicalUserFromLinkChain(user);
            if (canonical === undefined) {
              local.push({ code: 'linked-account-unresolvable', severity: 'blocker', entityType: 'user' });
              if (!flushItem('users', String(user.id), local)) {
                flushedAll = false;
                break;
              }
              continue;
            }
            const principalId = String(canonical.id);
            const populatedIds = new Set<string>();
            // Bound nested per-user role fan-out: a pathological user row with
            // thousands of legacy associations must not issue unbounded queries
            // on one drift page. First 500 roles are checked deterministically;
            // overflow is reported explicitly so it cannot hide as clean.
            const userRoles = (user.roles ?? []).slice(0, 500);
            if ((user.roles ?? []).length > 500) {
              local.push({ code: 'user-roles-scan-truncated', severity: 'warning', entityType: 'user' });
              local.push({
                code: 'user-role-associations-overflow',
                severity: 'blocker',
                entityType: 'user',
                entityId: String(user.id),
              });
            }
            for (const roleValue of userRoles) {
              if (isRoleAttributes(roleValue)) populatedIds.add(String(roleValue.id));
            }
            // Populate drops dangling junction rows, so diff the junction keys against
            // the populated set to surface orphaned legacy roles in drift too.
            // A failed junction scan is blocking drift, never clean.
            const driftJunction = await findOrphanLegacyRoleIds(user, populatedIds);
            if (driftJunction.incomplete) {
              local.push({
                code: 'user-role-junction-scan-incomplete',
                severity: 'blocker',
                entityType: 'user',
                entityId: String(user.id),
              });
            }
            if (driftJunction.truncated) {
              local.push({
                code: 'user-role-junction-scan-truncated',
                severity: 'warning',
                entityType: 'user',
                entityId: String(user.id),
              });
              local.push({
                code: 'user-role-associations-overflow',
                severity: 'blocker',
                entityType: 'user',
                entityId: String(user.id),
              });
            }
            for (const orphanId of driftJunction.orphanIds) {
              local.push({
                code: 'user-role-reference-missing',
                severity: 'blocker',
                entityType: 'user',
                entityId: String(user.id),
              });
              void orphanId;
            }
            for (const roleValue of userRoles) {
              if (!isRoleAttributes(roleValue)) {
                local.push({ code: 'user-role-reference-missing', severity: 'blocker', entityType: 'user' });
                continue;
              }
              if (roleValue.protectedKind === 'guest' || roleValue.name === 'Guest') continue;
              if (roleValue.status !== 'active') continue;
              // Membership is the union of every effective supported source. Count
              // accepts multiple grants for the same user/role; findOne does not.
              // Migration sourceKey/linkage validation remains in the assignments
              // section and must not constrain this effective-membership check.
              const assignmentCount = await RoleAssignment.count(
                effectiveAssignmentCriteria(
                  {
                    principalType: 'user',
                    principalId,
                    role: roleValue.id,
                    source: [...ROLE_ASSIGNMENT_SOURCES],
                  },
                  now
                )
              );
              if (assignmentCount === 0) {
                local.push({
                  code: 'legacy-assignment-projection-missing',
                  severity: 'blocker',
                  entityType: 'assignment',
                });
              }
            }
            if (!flushItem('users', String(user.id), local)) {
              flushedAll = false;
              break;
            }
          }
          if (!userPage.hasMore && flushedAll) markCompleted('users');
        }
      } // end users section

      if (!isSectionCompleted(resume, 'assignments') && !pageFull) {
        const assignmentResumeId = resumeItemId('assignments');
        const fetchedRawAssignments: unknown = await RoleAssignment.find(
          idCursorCriteriaForResume(resume.assignments, parseItemCursor)
        )
          .populate('role')
          .sort('id ASC')
          .limit(limit + 1);
        if (!Array.isArray(fetchedRawAssignments)) {
          throw new Error('Authorization migration assignment scan returned a non-array page; failing closed.');
        }
        // Pageable-row guard: every row must carry an id for keyset paging;
        // field-level validity (role/brand/source/status) is classified
        // per-row as blockers by the loop below, never by a blind cast here.
        // Genuinely unreadable rows (non-objects, id-less) fail closed.
        const fetchedAssignments = fetchedRawAssignments.filter(isPageableAssignmentRow);
        if (fetchedAssignments.length !== fetchedRawAssignments.length) {
          throw new Error(
            'Authorization migration assignment scan returned an unreadable assignment row; failing closed.'
          );
        }
        // Resume client-side as well so hook adapters that ignore the `id > cursor`
        // predicate cannot re-emit the previous page as duplicates.
        const assignmentPage = keysetPageById(
          fetchedAssignments,
          assignmentResumeId,
          limit,
          assignment => String(assignment.id),
          id => afterResumeClientSide(id, 'assignments')
        );
        if (assignmentPage.stalled) {
          issues.push(
            Object.freeze({
              code: 'assignment-scan-incomplete',
              severity: 'blocker',
              entityType: 'protected-state',
            } as AuthorizationMigrationIssue)
          );
          truncated = true;
          pageFull = true;
        } else {
          const assignments = assignmentPage.batch;
          if (assignmentPage.hasMore) {
            truncated = true;
          }
          let flushedAll = true;
          for (const assignment of assignments.slice(0, limit)) {
            if (pageFull) {
              flushedAll = false;
              break;
            }
            const local: AuthorizationMigrationIssue[] = [];
            if (!isRoleAttributes(assignment.role)) {
              local.push({ code: 'assignment-role-missing', severity: 'blocker', entityType: 'assignment' });
              if (!flushItem('assignments', String(assignment.id), local)) {
                flushedAll = false;
                break;
              }
              continue;
            }
            const assignmentBrand = associationId(assignment.branding);
            const roleBrand = associationId(assignment.role.branding);
            if (assignment.role.contextType === 'brand' && assignmentBrand !== roleBrand) {
              local.push({ code: 'assignment-role-brand-mismatch', severity: 'blocker', entityType: 'assignment' });
            }
            // System roles are brandless: a branding value on either the
            // assignment or its system role proves a direct-write anomaly and
            // blocks explicitly (it must not escape via the brand-role-only
            // check above).
            if (
              assignment.role.contextType === 'system' &&
              (assignmentBrand !== undefined || roleBrand !== undefined)
            ) {
              local.push({
                code: 'assignment-system-branding-present',
                severity: 'blocker',
                entityType: 'assignment',
                entityId: String(assignment.id),
              });
            }
            // Supported-source gate independent of legacy projection: an
            // effective assignment with an unknown source can never prove its
            // provenance, so it blocks fail-closed without parsing any key.
            const supportedSources: readonly string[] = ROLE_ASSIGNMENT_SOURCES;
            if (!supportedSources.includes(String(assignment.source))) {
              local.push({
                code: 'assignment-source-unsupported',
                severity: 'blocker',
                entityType: 'assignment',
                entityId: String(assignment.id),
              });
              if (!flushItem('assignments', String(assignment.id), local)) {
                flushedAll = false;
                break;
              }
              continue;
            }
            // Bidirectional projection: legacy -> assignment is checked in the
            // users section; here assignment -> legacy is checked so new-only
            // effective grants (or direct-write drift) cannot hide. System
            // assignments are intentionally brandless with no legacy projection
            // and are excluded, as are non-effective rows (inactive roles and
            // revoked/suppressed/expired/source-absent assignments grant nothing).
            // Active assignment provenance remains checked independently of
            // role status, even when role inactivation removes legacy membership.
            // The migration-key check
            // applies only when source=migration: legitimate manual,
            // onboarding, recovery, and external assignments have no migration
            // sourceKey. Their supported writes still maintain legacy membership;
            // migration-specific provenance must not false-positive as missing.
            const assignmentCurrent =
              assignment.status === 'active' &&
              assignment.sourcePresent === true &&
              (assignment.expiresAt == null || new Date(assignment.expiresAt).getTime() > now.getTime());
            const legacyBrandAssignment =
              assignmentCurrent &&
              assignment.role.contextType === 'brand' &&
              assignment.role.protectedKind !== 'guest' &&
              assignment.role.name !== 'Guest';
            const principalId = String(assignment.principalId);
            const legacyUserIds = new Set<string>([principalId]);
            if (legacyBrandAssignment && assignment.source === 'migration') {
              // Migration provenance is separate from effective membership.
              // Its sourceKey may identify an alias retaining the legacy role;
              // validate role identity and canonical linkage before including
              // that alias. Other sources project onto the principal directly.
              const sourceParts = migrationSourceKeyParts(assignment.source, assignment.sourceKey);
              if (sourceParts === undefined || sourceParts.roleId !== String(assignment.role.id)) {
                local.push({
                  code: 'new-assignment-legacy-projection-missing',
                  severity: 'blocker',
                  entityType: 'assignment',
                  entityId: String(assignment.id),
                });
                if (!flushItem('assignments', String(assignment.id), local)) {
                  flushedAll = false;
                  break;
                }
                continue;
              }
              let linkageValid = false;
              try {
                const originalUser = (await User.findOne({ id: sourceParts.originalUserId }).populate('roles', {
                  limit: JUNCTION_SCAN_ROW_LIMIT + 1,
                  sort: 'id ASC',
                })) as UserAttributes | undefined;
                if (originalUser != null) {
                  const originalResolution = await resolveLinkChain(originalUser);
                  if ('user' in originalResolution && String(originalResolution.user.id) === principalId) {
                    linkageValid = true;
                  }
                } else if (sourceParts.originalUserId === principalId) {
                  linkageValid = true;
                }
              } catch {
                linkageValid = false;
              }
              if (!linkageValid) {
                local.push({
                  code: 'new-assignment-legacy-projection-missing',
                  severity: 'blocker',
                  entityType: 'assignment',
                  entityId: String(assignment.id),
                });
                if (!flushItem('assignments', String(assignment.id), local)) {
                  flushedAll = false;
                  break;
                }
                continue;
              }
              legacyUserIds.add(sourceParts.originalUserId);
            }
            if (legacyBrandAssignment && assignment.role.status === 'active') {
              let legacyRoleIds: Set<string> | undefined;
              let projectionScanIncomplete = false;
              try {
                let verifiedAny = false;
                const union = new Set<string>();
                for (const legacyUserId of legacyUserIds) {
                  let principal: UserAttributes | undefined;
                  try {
                    principal = (await User.findOne({ id: legacyUserId }).populate('roles', {
                      limit: JUNCTION_SCAN_ROW_LIMIT + 1,
                      sort: 'id ASC',
                    })) as UserAttributes | undefined;
                  } catch {
                    // A throwing reverse-projection read proves nothing about
                    // the legacy junction: fail closed with an entity-scoped
                    // blocker instead of silently skipping the principal.
                    projectionScanIncomplete = true;
                    continue;
                  }
                  if (principal == null) continue;
                  verifiedAny = true;
                  for (const roleValue of principal.roles ?? []) {
                    if (isRoleAttributes(roleValue)) union.add(String(roleValue.id));
                  }
                  const principalJunction = await findOrphanLegacyRoleIds(principal, union);
                  for (const orphanId of principalJunction.orphanIds) union.add(orphanId);
                  if (principalJunction.incomplete) {
                    local.push({
                      code: 'user-role-junction-scan-incomplete',
                      severity: 'blocker',
                      entityType: 'assignment',
                      entityId: String(assignment.id),
                    });
                  }
                  if (principalJunction.truncated) {
                    local.push({
                      code: 'user-role-junction-scan-truncated',
                      severity: 'warning',
                      entityType: 'assignment',
                      entityId: String(assignment.id),
                    });
                  }
                }
                if (!verifiedAny) {
                  local.push({
                    code: 'assignment-principal-missing',
                    severity: 'blocker',
                    entityType: 'assignment',
                    entityId: String(assignment.id),
                  });
                } else {
                  legacyRoleIds = union;
                }
                if (projectionScanIncomplete) {
                  local.push({
                    code: 'assignment-legacy-projection-scan-incomplete',
                    severity: 'blocker',
                    entityType: 'assignment',
                    entityId: String(assignment.id),
                  });
                }
              } catch {
                // Any other reverse-projection exception leaves the scan
                // incomplete: report an entity-scoped blocker.
                local.push({
                  code: 'assignment-legacy-projection-scan-incomplete',
                  severity: 'blocker',
                  entityType: 'assignment',
                  entityId: String(assignment.id),
                });
                legacyRoleIds = undefined;
              }
              if (legacyRoleIds !== undefined && !legacyRoleIds.has(String(assignment.role.id))) {
                local.push({
                  code: 'new-assignment-legacy-projection-missing',
                  severity: 'blocker',
                  entityType: 'assignment',
                  entityId: String(assignment.id),
                });
              }
            }
            if (!flushItem('assignments', String(assignment.id), local)) {
              flushedAll = false;
              break;
            }
          }
          if (!assignmentPage.hasMore && flushedAll && !pageFull) markCompleted('assignments');
        }
      } // end assignments section

      // Bounded resumable ordinary-role scan: every auth-aware role is
      // validated (brand, key/identity, status, version, duplicate identity,
      // template pin), including inactive protected anomalies that the
      // active-only protected-pin probe cannot see. Direct ordinary-role
      // writes with a missing brand, duplicate key, invalid identity/status/
      // version, or malformed rows otherwise evade drift entirely.
      if (!isSectionCompleted(resume, 'roles') && !pageFull) {
        const roleResumeId = resumeItemId('roles');
        let fetchedRoles: RoleAttributes[];
        try {
          fetchedRoles = (await withBoundedLimit<RoleAttributes[]>(
            Role.find(idCursorCriteriaForResume(resume.roles, parseItemCursor)).sort('id ASC'),
            limit + 1
          )) as RoleAttributes[];
        } catch {
          issues.push(
            Object.freeze({
              code: 'role-scan-incomplete',
              severity: 'blocker',
              entityType: 'protected-state',
            } as AuthorizationMigrationIssue)
          );
          truncated = true;
          pageFull = true;
          fetchedRoles = [];
          // Fall through to the stalled/completion handling below via empty batch guard.
          if (pageFull) {
            // Preserve the resume cursor so the next page retries this section.
            if (resume.roles !== undefined && progress.roles === undefined) {
              continuationCursors.roles = resume.roles;
            }
          }
        }
        if (!pageFull || fetchedRoles.length > 0) {
          // When the bound above failed, fetchedRoles is empty and pageFull is
          // set: skip item processing but keep the section incomplete.
          const rolePage = keysetPageById(
            fetchedRoles,
            roleResumeId,
            limit,
            role => String(role.id),
            id => afterResumeClientSide(id, 'roles')
          );
          if (rolePage.stalled) {
            issues.push(
              Object.freeze({
                code: 'role-scan-incomplete',
                severity: 'blocker',
                entityType: 'protected-state',
              } as AuthorizationMigrationIssue)
            );
            truncated = true;
            pageFull = true;
          } else {
            const roles = rolePage.batch;
            if (rolePage.hasMore) {
              truncated = true;
            }
            let flushedAll = true;
            for (const role of roles.slice(0, limit)) {
              if (pageFull) {
                flushedAll = false;
                break;
              }
              const local: AuthorizationMigrationIssue[] = [];
              const roleId = String(role.id);
              const protectedKind = role.protectedKind ?? 'none';
              const contextType = role.contextType;
              const brandId = associationId(role.branding);
              // Design contract: immutable key equals legacy name exactly.
              // A missing/empty key plus a matching name/identity must not
              // pass: the key is the authoritative identity and is required
              // to be a non-empty string with key === name.
              if (typeof role.name !== 'string' || role.name.length === 0) {
                local.push({ code: 'role-key-invalid', severity: 'blocker', entityType: 'role', entityId: roleId });
              } else if (typeof role.key !== 'string' || role.key.length === 0) {
                local.push({ code: 'role-key-invalid', severity: 'blocker', entityType: 'role', entityId: roleId });
              } else if (role.key !== role.name) {
                local.push({ code: 'role-key-name-drift', severity: 'blocker', entityType: 'role', entityId: roleId });
              }
              // Brand shape: brand-context roles require a brand; system
              // context must be brandless (system-admin only).
              if (contextType === 'brand' && brandId === undefined) {
                local.push({ code: 'role-brand-missing', severity: 'blocker', entityType: 'role', entityId: roleId });
              } else if (contextType === 'system' && brandId !== undefined && protectedKind === 'system-admin') {
                local.push({
                  code: 'protected-role-identity-drift',
                  severity: 'blocker',
                  entityType: 'role',
                  entityId: roleId,
                });
              } else if (contextType !== 'brand' && contextType !== 'system') {
                local.push({ code: 'role-context-invalid', severity: 'blocker', entityType: 'role', entityId: roleId });
              }
              // Identity key must be the server-computed `brand:<id>:<key>` (or
              // `system:system-admin` for the system role), derived from the
              // validated immutable key — never from `name` alone, so a
              // keyless row cannot validate via name.
              if (typeof role.key === 'string' && role.key.length > 0) {
                const expectedIdentity =
                  contextType === 'system' && protectedKind === 'system-admin'
                    ? 'system:system-admin'
                    : brandId !== undefined
                      ? buildRoleIdentityKey('brand', role.key, brandId)
                      : undefined;
                if (expectedIdentity !== undefined && role.identityKey !== expectedIdentity) {
                  local.push({
                    code: 'role-identity-invalid',
                    severity: 'blocker',
                    entityType: 'role',
                    entityId: roleId,
                  });
                }
              }
              if (role.status !== 'active' && role.status !== 'inactive') {
                local.push({ code: 'role-status-invalid', severity: 'blocker', entityType: 'role', entityId: roleId });
              }
              if (!Number.isInteger(role.version) || Number(role.version) < 1) {
                local.push({ code: 'role-version-invalid', severity: 'blocker', entityType: 'role', entityId: roleId });
              }
              // Inactive protected anomalies: an inactive Guest/brand-admin/
              // system-admin row is never effective, but its presence proves a
              // direct write or failed repair that must stay visible. Active
              // protected identity drift is also reported here (defence in
              // depth alongside the brands/templates sections).
              if (protectedKind === 'guest' || protectedKind === 'brand-admin' || protectedKind === 'system-admin') {
                let exact = false;
                try {
                  if (protectedKind === 'guest' && brandId !== undefined) exact = isExactGuestRole(role, brandId);
                  else if (protectedKind === 'brand-admin' && brandId !== undefined)
                    exact = isExactBrandAdminRole(role, brandId);
                  else if (protectedKind === 'system-admin') exact = isExactSystemAdminRole(role);
                } catch {
                  exact = false;
                }
                if (!exact) {
                  local.push({
                    code: 'protected-role-identity-drift',
                    severity: 'blocker',
                    entityType: 'role',
                    entityId: roleId,
                  });
                }
                if (role.status === 'inactive') {
                  local.push({
                    code: 'protected-role-inactive',
                    severity: 'blocker',
                    entityType: 'role',
                    entityId: roleId,
                  });
                }
                // Protected pins require a positive template revision; the
                // full key/kind/revision pin is verified in the templates
                // section, but a missing pin here blocks even when that
                // section is truncated.
                if (
                  role.templateRevision === undefined ||
                  role.templateRevision === null ||
                  !Number.isInteger(role.templateRevision) ||
                  Number(role.templateRevision) < 1
                ) {
                  local.push({
                    code: 'protected-role-revision-missing',
                    severity: 'blocker',
                    entityType: 'role',
                    entityId: roleId,
                  });
                }
              }
              // Duplicate brand identity: two rows with the same brand+key
              // prove a direct-write collision. Bounded single count probe on
              // the validated immutable key only: a keyless row already
              // blocks above and must never validate via a name fallback.
              try {
                if (contextType === 'brand' && brandId !== undefined && typeof role.key === 'string' && role.key) {
                  const duplicateCount = (await Role.count({ branding: brandId, key: role.key })) as number;
                  if (typeof duplicateCount === 'number' && duplicateCount !== 1) {
                    local.push({
                      code: 'duplicate-brand-role-key',
                      severity: 'blocker',
                      entityType: 'role',
                      entityId: roleId,
                    });
                  }
                }
              } catch {
                local.push({
                  code: 'role-scan-incomplete',
                  severity: 'blocker',
                  entityType: 'role',
                  entityId: roleId,
                });
              }
              if (!flushItem('roles', roleId, local)) {
                flushedAll = false;
                break;
              }
            }
            if (!rolePage.hasMore && flushedAll) markCompleted('roles');
          }
        }
      } // end roles section

      if (!isSectionCompleted(resume, 'records') && !pageFull) {
        const recordModel = sails.models.record;
        // Fail-closed when the Record model is absent: an absent model proves
        // nothing about record ACL drift, so report an explicit incomplete
        // blocker instead of silently skipping as clean.
        if (recordModel === undefined) {
          // Single-shot blocker: once flushed, the section completes instead
          // of re-emitting on every subsequent page (which would loop forever
          // under limit=1 pagination).
          if (resume.records === undefined) {
            const local: AuthorizationMigrationIssue[] = [
              { code: 'record-model-unavailable', severity: 'blocker', entityType: 'protected-state' },
            ];
            // `flushItem` applies page-budget rules: the blocker is recorded
            // and the section cursor advances without forcing the whole page
            // full, so later sections still scan on the same page when budget
            // remains.
            flushItem('records', 'record-model-unavailable', local);
          } else {
            markCompleted('records');
          }
        }
        if (recordModel !== undefined) {
          // Stable key is `id` only: `oid` is a record payload field that is
          // absent on some rows and collates differently from `id`, so an
          // oid-or-id cursor can skip rows or re-emit them across pages.
          // Resume from the opaque cursor at both layers: the query predicate
          // avoids re-reading the first page from the adapter, and the
          // client-side filter guarantees no duplicates when the adapter
          // ignores the predicate. Finding-level `item#offset` cursors resume
          // the same record for its remaining findings.
          const recordResume = resumeItemId('records');
          const recordCursor = recordResume;
          const fetchedRecords = (await recordModel
            .find(
              recordCursor === undefined || recordCursor === ''
                ? {}
                : idCursorCriteriaForResume(resume.records, parseItemCursor)
            )
            .sort('id ASC')
            .limit(limit + 1)) as Array<Record<string, unknown>>;
          const sorted = [...fetchedRecords].sort((a, b) => String(a.id ?? '').localeCompare(String(b.id ?? '')));
          const recordPage = keysetPageById(
            sorted,
            recordCursor,
            limit,
            record => String(record.id ?? ''),
            id => afterResumeClientSide(id, 'records')
          );
          if (recordPage.stalled) {
            issues.push(
              Object.freeze({
                code: 'record-scan-incomplete',
                severity: 'blocker',
                entityType: 'protected-state',
              } as AuthorizationMigrationIssue)
            );
            truncated = true;
            pageFull = true;
          } else {
            const records = recordPage.batch;
            if (recordPage.hasMore) {
              truncated = true;
            }
            let flushedAll = true;
            for (const record of records.slice(0, limit)) {
              if (pageFull) {
                flushedAll = false;
                break;
              }
              const local: AuthorizationMigrationIssue[] = [];
              const metadata = isObject(record.metaMetadata) ? record.metaMetadata : {};
              const authorization = isObject(record.authorization) ? record.authorization : {};
              const brandId = typeof metadata.brandId === 'string' ? metadata.brandId : undefined;
              const roleKeys = [authorization.viewRoles, authorization.editRoles]
                .flatMap(value => (Array.isArray(value) ? value : []))
                .filter((value): value is string => typeof value === 'string');
              const uniqueRoleKeys = [...new Set(roleKeys)];
              // Bound per-record ACL fan-out: an unbounded role-key array must
              // not issue unbounded Role.findOne queries on one drift page.
              // Overflow is an explicit blocker; the bounded prefix is still
              // verified via a single bulk lookup with continuation support.
              if (uniqueRoleKeys.length > 500) {
                local.push({
                  code: 'record-acl-scan-truncated',
                  severity: 'blocker',
                  entityType: 'protected-state',
                  entityId: String(record.id ?? ''),
                });
              }
              const boundedKeys = uniqueRoleKeys.slice(0, 500);
              if (boundedKeys.length > 0) {
                if (!brandId) {
                  local.push({ code: 'record-acl-brand-missing', severity: 'warning', entityType: 'protected-state' });
                } else {
                  // Bounded bulk lookup: the limit is applied to the un-awaited
                  // chain before materialization so an unbounded role table
                  // cannot materialize silently. An unenforceable bound fails
                  // closed with an explicit incomplete blocker.
                  let matched: Array<{ key?: unknown; name?: unknown }>;
                  try {
                    const rows = (await withBoundedLimit<Array<{ key?: unknown; name?: unknown }>>(
                      Role.find({
                        branding: brandId,
                        key: boundedKeys,
                        status: 'active',
                      }).sort('id ASC'),
                      501
                    )) as Array<{ key?: unknown; name?: unknown }>;
                    if (!Array.isArray(rows)) throw new Error('authorization.scan-unbounded');
                    matched = rows.slice(0, 500);
                    if (rows.length > 500) {
                      local.push({
                        code: 'record-acl-scan-incomplete',
                        severity: 'blocker',
                        entityType: 'protected-state',
                        entityId: String(record.id ?? ''),
                      });
                    }
                  } catch {
                    local.push({
                      code: 'record-acl-scan-incomplete',
                      severity: 'blocker',
                      entityType: 'protected-state',
                      entityId: String(record.id ?? ''),
                    });
                    matched = [];
                  }
                  const matchedKeys = new Set(
                    matched.map(row => (typeof row.key === 'string' ? row.key : String(row.name ?? '')))
                  );
                  for (const roleKey of boundedKeys) {
                    if (!matchedKeys.has(roleKey)) {
                      local.push({ code: 'record-acl-role-unmatched', severity: 'warning', entityType: 'role' });
                      break;
                    }
                  }
                }
              }
              if (!flushItem('records', String(record.id ?? ''), local)) {
                flushedAll = false;
                break;
              }
            }
            if (!recordPage.hasMore && flushedAll) markCompleted('records');
          }
        }
      } // end records section

      // Each retained legacy PathRule is mapped deterministically against the
      // frozen compatibility baseline: a rule is mapped only when its
      // path-plus-granting-role-plus-operation-flags matches a baseline row
      // that a scoped (new-engine) route actually exercises. Rules with no
      // baseline row, changed can_read/can_update flags, or whose baseline row
      // no scoped route matches, are reported per rule with the stable rule id
      // so operators see exactly what is unmapped.
      if (!isSectionCompleted(resume, 'pathRules') && !pageFull) {
        const mappedBaselineIndexes = new Set<number>();
        for (const entry of FROZEN_LEGACY_ROUTE_BASELINE) {
          if (entry.authorizationKind !== 'scope') continue;
          for (const index of entry.pathRuleMatches) mappedBaselineIndexes.add(index);
        }
        const baselineBySignature = new Map<string, number>();
        const baselineByPathRole = new Map<string, number>();
        for (const row of LEGACY_PATH_RULE_BASELINE) {
          baselineBySignature.set(
            pathRuleOperationSignature(row.path, row.role, row.canRead, row.canUpdate),
            row.index
          );
          if (!baselineByPathRole.has(`${row.path}::${row.role}`)) {
            baselineByPathRole.set(`${row.path}::${row.role}`, row.index);
          }
        }
        const pathRuleResumeId = resumeItemId('pathRules');
        const fetchedPathRules = (await PathRule.find(idCursorCriteriaForResume(resume.pathRules, parseItemCursor))
          .populate('role')
          .sort('id ASC')
          .limit(limit + 1)) as Array<{
          id: string;
          path: string;
          role: unknown;
          can_read?: unknown;
          can_update?: unknown;
          can_write?: unknown;
          canRead?: unknown;
          canUpdate?: unknown;
          canWrite?: unknown;
        }>;
        const pathRulePage = keysetPageById(
          fetchedPathRules,
          pathRuleResumeId,
          limit,
          rule => String(rule.id),
          id => afterResumeClientSide(id, 'pathRules')
        );
        if (pathRulePage.stalled) {
          issues.push(
            Object.freeze({
              code: 'path-rule-scan-incomplete',
              severity: 'blocker',
              entityType: 'protected-state',
            } as AuthorizationMigrationIssue)
          );
          truncated = true;
          pageFull = true;
        } else {
          const pathRules = pathRulePage.batch;
          if (pathRulePage.hasMore) {
            truncated = true;
          }
          let flushedAll = true;
          for (const rule of pathRules.slice(0, limit)) {
            if (pageFull) {
              flushedAll = false;
              break;
            }
            const local: AuthorizationMigrationIssue[] = [];
            const roleName = isRoleAttributes(rule.role) ? rule.role.name : undefined;
            if (roleName === undefined) {
              local.push({ code: 'legacy-path-rule-role-missing', severity: 'blocker', entityType: 'assignment' });
              if (!flushItem('pathRules', String(rule.id), local)) {
                flushedAll = false;
                break;
              }
              continue;
            }
            const flags = normalizePathRuleFlags(rule);
            const baselineIndex = baselineBySignature.get(
              pathRuleOperationSignature(rule.path, roleName, flags.canRead, flags.canUpdate)
            );
            if (baselineIndex === undefined || !mappedBaselineIndexes.has(baselineIndex)) {
              // Distinguish a pure operation narrowing (same path+role exists in
              // the baseline with different flags) from a fully unmapped rule so
              // absent/malformed flags can never hide as mapped.
              const pathRoleKnown = baselineByPathRole.has(`${rule.path}::${roleName}`);
              local.push({
                code: pathRoleKnown ? 'legacy-path-rule-operation-unmapped' : 'legacy-path-rule-unmapped',
                severity: 'warning',
                entityType: 'protected-state',
                entityId: String(rule.id),
              });
            }
            if (!flushItem('pathRules', String(rule.id), local)) {
              flushedAll = false;
              break;
            }
          }
          if (!pathRulePage.hasMore && flushedAll) markCompleted('pathRules');
        }
      } // end pathRules section
      // Bounded protected-template drift: missing/inactive/drifted default
      // templates and invalid protected-role pins. Inactive protected defaults
      // must never be pinned silently, so a role pointing at a missing or
      // inactive template/revision is a blocker. The section scans two
      // ordered sub-streams with separate cursor state: static template
      // definitions (ordered by key) drain first, then live protected-role
      // pins (ordered by role id). A single lexical cursor over the mixed
      // `template:*`/`role:*` namespaces would skip role items once the
      // cursor passes them lexically, so each stream resumes from its own
      // `item[#offset]` position encoded as `t=<base64url>;r=<base64url>`.
      // Finding-level offsets reuse the page-budget rules of `flushItem`.
      if (!isSectionCompleted(resume, 'templates') && !pageFull) {
        // Production lifts always expose both models. When either is absent
        // the scan cannot verify a single template or pin: fail closed with
        // an explicit blocking incomplete finding instead of skipping as
        // clean. Unit-test doubles must provide both globals (healthy or
        // empty) to exercise the verified path.
        const templateGlobalsAvailable =
          typeof (globalThis as Record<string, unknown>).RoleTemplate !== 'undefined' &&
          typeof (globalThis as Record<string, unknown>).RoleTemplateRevision !== 'undefined';
        const parseTemplateSectionCursor = (
          cursor: string | undefined
        ): { templates: string | undefined; roles: string | undefined } => {
          const empty = { templates: undefined, roles: undefined };
          if (cursor === undefined || cursor === '') return empty;
          // Fail-closed: a malformed `t/r` subcursor must reject as an invalid
          // continuation instead of silently restarting from the beginning,
          // which would omit or duplicate findings.
          const match = /^t=([^;]*);r=(.*)$/.exec(cursor);
          if (match === null) throw new Error('Authorization drift continuation cursor is invalid.');
          const decodeSide = (side: string, stream: 't' | 'r'): string | undefined => {
            if (side === '') return undefined;
            // Canonical base64url alphabet only (no padding, no `+/`).
            if (!/^[A-Za-z0-9_-]+$/.test(side)) {
              throw new Error('Authorization drift continuation cursor is invalid.');
            }
            let decoded: string;
            try {
              decoded = Buffer.from(side, 'base64url').toString('utf8');
            } catch {
              throw new Error('Authorization drift continuation cursor is invalid.');
            }
            // Canonical roundtrip: non-canonical encodings restart the scan.
            if (Buffer.from(decoded, 'utf8').toString('base64url') !== side) {
              throw new Error('Authorization drift continuation cursor is invalid.');
            }
            // Nonempty values only: an encoded empty string carries no cursor.
            if (decoded.length === 0) {
              throw new Error('Authorization drift continuation cursor is invalid.');
            }
            // Anchored strict `item[#offset]` grammar with stream namespace.
            // Exactly one `#` delimiter is permitted: any extra `#` in the
            // item or a second suffix rejects fail-closed. Offset is a
            // positive integer (1..500); offset 0, empty item, empty suffix,
            // bare `#`, and wrong stream prefix all reject fail-closed.
            const hash = decoded.indexOf('#');
            if (hash >= 0 && decoded.indexOf('#', hash + 1) >= 0) {
              throw new Error('Authorization drift continuation cursor is invalid.');
            }
            const itemId = hash >= 0 ? decoded.slice(0, hash) : decoded;
            if (itemId.length === 0) {
              throw new Error('Authorization drift continuation cursor is invalid.');
            }
            const expectedPrefix = stream === 't' ? 'template:' : 'role:';
            if (!itemId.startsWith(expectedPrefix) || itemId.length <= expectedPrefix.length) {
              throw new Error('Authorization drift continuation cursor is invalid.');
            }
            if (hash >= 0) {
              const suffix = decoded.slice(hash + 1);
              if (suffix.length === 0 || !/^[1-9][0-9]*$/.test(suffix)) {
                throw new Error('Authorization drift continuation cursor is invalid.');
              }
              const offset = Number(suffix);
              if (!Number.isSafeInteger(offset) || offset < 1 || offset > 500) {
                throw new Error('Authorization drift continuation cursor is invalid.');
              }
            } else if (decoded.includes('#')) {
              throw new Error('Authorization drift continuation cursor is invalid.');
            }
            return decoded;
          };
          return { templates: decodeSide(match[1], 't'), roles: decodeSide(match[2], 'r') };
        };
        const encodeTemplateSectionCursor = (templates: string | undefined, roles: string | undefined): string => {
          const encodeSide = (side: string | undefined): string =>
            side === undefined || side === '' ? '' : Buffer.from(side, 'utf8').toString('base64url');
          return `t=${encodeSide(templates)};r=${encodeSide(roles)}`;
        };
        const sectionCursor = parseTemplateSectionCursor(resume.templates);
        const afterStreamCursor = (itemId: string, cursor: string | undefined): boolean => {
          const parsed = parseItemCursor(cursor);
          if (parsed === undefined) return true;
          if (itemId > parsed.itemId) return true;
          return itemId === parsed.itemId && parsed.offset > 0;
        };
        // Per-stream findings accounting with the same page-budget rules as
        // `flushItem`: an item flushes atomically when it fits, partially
        // (with an `item#offset` remainder) when it alone fills an empty
        // page, and defers otherwise. Progress is recorded per stream so the
        // template stream can complete while role pins continue next page.
        // `roleProbeFull` tracks whether the raw limit+1 pin probe came back
        // full: more pin rows may exist beyond this page, so the section may
        // only complete on a short probe, never on a drained filtered prefix.
        let roleProbeFull = false;
        const streamProgress: Partial<Record<'t' | 'r', string>> = {};
        const flushStreamItem = (
          stream: 't' | 'r',
          itemId: string,
          local: readonly AuthorizationMigrationIssue[]
        ): boolean => {
          if (pageFull) return false;
          const streamCursor = stream === 't' ? sectionCursor.templates : sectionCursor.roles;
          const resumed = parseItemCursor(streamCursor);
          const resumedOffset =
            resumed !== undefined && resumed.itemId === itemId && resumed.offset > 0 ? resumed.offset : 0;
          let effectiveLocal = resumedOffset > 0 ? local.slice(resumedOffset) : [...local];
          if (resumedOffset >= DRIFT_ENTITY_FINDINGS_MAX) {
            effectiveLocal = [
              Object.freeze({
                code: 'templates-findings-overflow',
                severity: 'blocker',
                entityType: 'protected-state',
                entityId: itemId,
              } as AuthorizationMigrationIssue),
            ];
          } else if (resumedOffset + effectiveLocal.length > DRIFT_ENTITY_FINDINGS_MAX) {
            const keep = Math.max(0, DRIFT_ENTITY_FINDINGS_MAX - resumedOffset - 1);
            effectiveLocal = [
              ...effectiveLocal.slice(0, keep),
              Object.freeze({
                code: 'templates-findings-overflow',
                severity: 'blocker',
                entityType: 'protected-state',
                entityId: itemId,
              } as AuthorizationMigrationIssue),
            ];
          }
          if (issues.length + effectiveLocal.length <= limit) {
            for (const issue of effectiveLocal) issues.push(Object.freeze(issue));
            streamProgress[stream] = itemId;
            return true;
          }
          if (issues.length === 0 && effectiveLocal.length > 0) {
            const take = Math.min(limit, effectiveLocal.length);
            for (const issue of effectiveLocal.slice(0, take)) issues.push(Object.freeze(issue));
            const consumed = (resumed !== undefined && resumed.itemId === itemId ? resumed.offset : 0) + take;
            streamProgress[stream] = `${itemId}#${consumed}`;
            truncated = true;
            pageFull = true;
            return false;
          }
          truncated = true;
          pageFull = true;
          return false;
        };
        const templateStream: Array<{ itemId: string; kind: 'template'; key: string }> = [];
        const roleStream: Array<{ itemId: string; kind: 'rolePin' | 'roleScanIssue'; key: string }> = [];
        if (!templateGlobalsAvailable) {
          templateStream.push({ itemId: 'template:globals-unavailable', kind: 'template', key: 'globals-unavailable' });
        } else {
          for (const definition of DEFAULT_ROLE_TEMPLATES) {
            templateStream.push({
              itemId: `template:${String(definition.key)}`,
              kind: 'template',
              key: String(definition.key),
            });
          }
          let protectedRoles: RoleAttributes[] = [];
          let protectedRolesIncomplete = false;
          let protectedRolesTruncated = false;
          try {
            // Ordered role cursor with limit+1: resume from the `r` subcursor
            // role id so >501 protected pins traverse across drift pages
            // instead of always reading the first 502. The bound is applied
            // before awaiting; an unenforceable bound fails closed.
            const roleCursorRaw = sectionCursor.roles;
            const roleCursorItem = (() => {
              if (roleCursorRaw === undefined || roleCursorRaw === '') return undefined;
              // Strict single-`#` split: the subcursor grammar permits at most
              // one `#offset` suffix, so an extra `#` never strips to an alias.
              const hash = roleCursorRaw.indexOf('#');
              const itemPart =
                hash >= 0 && roleCursorRaw.indexOf('#', hash + 1) < 0 && hash > 0
                  ? roleCursorRaw.slice(0, hash)
                  : roleCursorRaw;
              // Stream item ids are `role:<id>`; strip the prefix for the
              // range predicate, keeping the full item for client-side resume.
              return itemPart.startsWith('role:') ? itemPart.slice('role:'.length) : itemPart;
            })();
            const roleCursorHasOffset = (() => {
              if (roleCursorRaw === undefined || roleCursorRaw === '') return false;
              const hash = roleCursorRaw.indexOf('#');
              if (hash <= 0 || roleCursorRaw.indexOf('#', hash + 1) >= 0) return false;
              const suffix = roleCursorRaw.slice(hash + 1);
              return /^[1-9][0-9]*$/.test(suffix);
            })();
            const roleCriteria =
              roleCursorItem === undefined || roleCursorItem === ''
                ? {
                    protectedKind: ['guest', 'brand-admin', 'system-admin'],
                    status: 'active',
                  }
                : {
                    protectedKind: ['guest', 'brand-admin', 'system-admin'],
                    status: 'active',
                    // Inclusive when resuming a partial `role:<id>#offset` item:
                    // strict `>` would skip the remainder of the current pin on
                    // a real adapter. Client-side resume stays authoritative.
                    ...(roleCursorHasOffset ? { id: { '>=': roleCursorItem } } : { id: { '>': roleCursorItem } }),
                  };
            const fetched = (await withBoundedLimit<RoleAttributes[]>(
              Role.find(roleCriteria).sort('id ASC'),
              502
            )) as RoleAttributes[];
            if (!Array.isArray(fetched)) {
              protectedRoles = [];
              protectedRolesIncomplete = true;
            } else {
              // Authoritative client-side resume: adapters that ignore the
              // range predicate must not re-emit the previous page. A full
              // raw page with no post-cursor progress proves the predicate
              // was ignored: fail closed as incomplete, never as complete.
              const ordered = [...fetched].sort((a, b) => String(a.id).localeCompare(String(b.id)));
              const resumed =
                roleCursorItem === undefined || roleCursorItem === ''
                  ? ordered
                  : ordered.filter(r => String(r.id) > roleCursorItem);
              const stalled =
                roleCursorItem !== undefined && roleCursorItem !== '' && fetched.length > 501 && resumed.length === 0;
              roleProbeFull = fetched.length > 501;
              if (stalled) {
                protectedRoles = [];
                protectedRolesIncomplete = true;
              } else {
                protectedRoles = resumed.slice(0, 501);
                protectedRolesTruncated = resumed.length > 501;
              }
            }
          } catch {
            protectedRoles = [];
            protectedRolesIncomplete = true;
          }
          for (const role of protectedRoles) {
            roleStream.push({ itemId: `role:${String(role.id)}`, kind: 'rolePin', key: String(role.id) });
          }
          // Adapter/introspection failure or overflow must not read as a
          // clean role-pin scan: the unverified remainder is explicit drift.
          // The markers sort deterministically inside the role stream.
          if (protectedRolesIncomplete) {
            roleStream.push({ itemId: 'role:scan-incomplete', kind: 'roleScanIssue', key: 'scan-incomplete' });
          }
          if (protectedRolesTruncated) {
            roleStream.push({ itemId: 'role:scan-truncated', kind: 'roleScanIssue', key: 'scan-truncated' });
          }
          // Stash the bounded pins for the item handlers below.
          (
            roleStream as Array<{ itemId: string; kind: 'rolePin' | 'roleScanIssue'; key: string }> & {
              pins?: RoleAttributes[];
            }
          ).pins = protectedRoles;
        }
        templateStream.sort((a, b) => (a.itemId < b.itemId ? -1 : a.itemId > b.itemId ? 1 : 0));
        roleStream.sort((a, b) => (a.itemId < b.itemId ? -1 : a.itemId > b.itemId ? 1 : 0));
        const pendingTemplates = templateStream.filter(item => afterStreamCursor(item.itemId, sectionCursor.templates));
        const pendingRoles = roleStream.filter(item => afterStreamCursor(item.itemId, sectionCursor.roles));
        const combined: Array<{ stream: 't' | 'r'; itemId: string; kind: string; key: string }> = [
          ...pendingTemplates.map(item => ({ stream: 't' as const, ...item })),
          ...pendingRoles.map(item => ({ stream: 'r' as const, ...item })),
        ];
        if (combined.length > limit) {
          truncated = true;
        }
        // A full raw pin probe means rows past this page are unverified: carry
        // a continuation even when the drained prefix fits the page budget.
        if (roleProbeFull) {
          truncated = true;
        }
        let flushedTemplates = 0;
        let flushedRoles = 0;
        for (const item of combined.slice(0, limit)) {
          if (pageFull) break;
          const local: AuthorizationMigrationIssue[] = [];
          if (item.key === 'globals-unavailable') {
            local.push({
              code: 'protected-template-scan-incomplete',
              severity: 'blocker',
              entityType: 'protected-state',
            });
          } else if (item.key === 'scan-incomplete') {
            local.push({
              code: 'protected-role-scan-incomplete',
              severity: 'blocker',
              entityType: 'protected-state',
            });
          } else if (item.key === 'scan-truncated') {
            local.push({
              code: 'protected-role-scan-truncated',
              severity: 'warning',
              entityType: 'protected-state',
            });
          } else if (item.stream === 't') {
            const definition = DEFAULT_ROLE_TEMPLATES.find(candidate => String(candidate.key) === item.key);
            if (definition !== undefined) {
              let template: RoleTemplateAttributes | undefined;
              try {
                template = (await RoleTemplate.findOne({ key: item.key })) as RoleTemplateAttributes | undefined;
              } catch {
                template = undefined;
              }
              if (template == null) {
                local.push({
                  code: 'protected-template-missing',
                  severity: 'blocker',
                  entityType: 'protected-state',
                  entityId: item.key,
                });
              } else {
                if (template.status !== 'active' && template.protectedKind !== 'none') {
                  local.push({
                    code: 'protected-template-inactive',
                    severity: 'blocker',
                    entityType: 'protected-state',
                    entityId: item.key,
                  });
                }
                if (template.currentRevision !== definition.revision) {
                  local.push({
                    code: 'protected-template-revision-drift',
                    severity: 'blocker',
                    entityType: 'protected-state',
                    entityId: item.key,
                  });
                }
                let revision: { scopeKeys?: unknown } | undefined;
                try {
                  revision = (await RoleTemplateRevision.findOne({
                    template: template.id,
                    revision: definition.revision,
                  })) as { scopeKeys?: unknown } | undefined;
                } catch {
                  revision = undefined;
                }
                if (revision == null) {
                  local.push({
                    code: 'protected-template-revision-missing',
                    severity: 'blocker',
                    entityType: 'protected-state',
                    entityId: item.key,
                  });
                } else {
                  const persisted = Array.isArray(revision.scopeKeys)
                    ? [...(revision.scopeKeys as string[])].sort()
                    : [];
                  const expected = [...definition.scopeKeys].map(String).sort();
                  if (JSON.stringify(persisted) !== JSON.stringify(expected)) {
                    local.push({
                      code: 'protected-template-scopes-drifted',
                      severity: 'blocker',
                      entityType: 'protected-state',
                      entityId: item.key,
                    });
                  }
                }
              }
            }
          } else {
            const pins =
              (roleStream as Array<{ itemId: string; kind: string; key: string }> & { pins?: RoleAttributes[] }).pins ??
              [];
            const role = pins.find(candidate => String(candidate.id) === item.key);
            if (role !== undefined && role.protectedKind !== 'none') {
              const templateId = associationId(role.template);
              if (templateId === undefined) {
                local.push({
                  code: 'protected-role-pin-invalid',
                  severity: 'blocker',
                  entityType: 'role',
                  entityId: role.id,
                });
              } else {
                let template: RoleTemplateAttributes | undefined;
                try {
                  template = (await RoleTemplate.findOne({ id: templateId })) as RoleTemplateAttributes | undefined;
                } catch {
                  template = undefined;
                }
                if (template == null || template.status !== 'active') {
                  local.push({
                    code: 'protected-role-pin-invalid',
                    severity: 'blocker',
                    entityType: 'role',
                    entityId: role.id,
                  });
                } else if (
                  // Required template pin: a protected role must pin its own
                  // kind's template key/kind, not merely any active template.
                  // Accepting any active template would launder an unrelated
                  // template's scopes into protected authority.
                  (role.protectedKind === 'guest' && template.key !== 'guest') ||
                  (role.protectedKind === 'brand-admin' && template.key !== 'brand-admin') ||
                  (role.protectedKind === 'system-admin' && template.key !== 'system-admin') ||
                  template.protectedKind !== role.protectedKind
                ) {
                  local.push({
                    code: 'protected-role-pin-invalid',
                    severity: 'blocker',
                    entityType: 'role',
                    entityId: role.id,
                  });
                } else if (
                  role.templateRevision === undefined ||
                  role.templateRevision === null ||
                  !Number.isInteger(role.templateRevision) ||
                  Number(role.templateRevision) < 1
                ) {
                  // A protected role without an exact integer revision pin
                  // cannot prove which immutable revision authorizes it: an
                  // absent or malformed pin is never accepted as pinned.
                  local.push({
                    code: 'protected-role-revision-missing',
                    severity: 'blocker',
                    entityType: 'role',
                    entityId: role.id,
                  });
                } else {
                  let revision: unknown;
                  try {
                    revision = await RoleTemplateRevision.findOne({
                      template: templateId,
                      revision: role.templateRevision,
                    });
                  } catch {
                    revision = undefined;
                  }
                  if (revision == null) {
                    local.push({
                      code: 'protected-role-pin-invalid',
                      severity: 'blocker',
                      entityType: 'role',
                      entityId: role.id,
                    });
                  } else if (role.templateRevision !== template.currentRevision) {
                    // Immutable pin: a protected role must pin exactly the
                    // template's current revision. A stale pin after a
                    // template publish must be upgraded explicitly, never
                    // accepted silently.
                    local.push({
                      code: 'protected-role-revision-missing',
                      severity: 'blocker',
                      entityType: 'role',
                      entityId: role.id,
                    });
                  }
                }
              }
            }
          }
          if (flushStreamItem(item.stream, item.itemId, local)) {
            if (item.stream === 't') flushedTemplates += 1;
            else flushedRoles += 1;
          } else {
            // A deferred or partially flushed item stops this page; streams
            // after it keep their incoming cursor for the next page.
            break;
          }
        }
        // Record per-stream resume state: an untouched stream keeps its
        // incoming cursor, a drained stream records its last flushed item.
        // The section completes only when both streams drain.
        progress.templates = encodeTemplateSectionCursor(
          streamProgress.t ?? sectionCursor.templates,
          streamProgress.r ?? sectionCursor.roles
        );
        if (
          combined.length <= limit &&
          flushedTemplates >= pendingTemplates.length &&
          flushedRoles >= pendingRoles.length &&
          !roleProbeFull
        ) {
          markCompleted('templates');
        }
      } // end templates section
      const summary = Object.freeze({
        blocker: issues.filter(issue => issue.severity === 'blocker').length,
        warning: issues.filter(issue => issue.severity === 'warning').length,
        expected: issues.filter(issue => issue.severity === 'expected').length,
      });
      // The continuation resumes from the last fully flushed key per
      // incomplete section, so a findings-full page always carries a usable
      // cursor: no finding is omitted and none repeats across pages. Sections
      // never scanned on this page keep their incoming cursor (or start over
      // when they have none and emitted nothing, which cannot duplicate).
      // Finding-level `item#offset` cursors are preserved verbatim so a
      // single over-limit entity resumes at its finding offset.
      for (const section of DRIFT_CONTINUATION_SECTIONS) {
        if (completedSections.includes(section)) continue;
        const cursor = progress[section] ?? (resume[section] === '' ? undefined : resume[section]);
        if (cursor !== undefined) continuationCursors[section] = cursor;
      }
      // Guarantee: truncated always carries a continuation. If the page filled
      // before any item cursor was recorded (system-only partial or a deferred
      // first item), synthesize the resume position so callers can progress.
      let continuation: string | undefined;
      if (truncated) {
        if (Object.keys(continuationCursors).length === 0) {
          if (!systemReported) {
            // System findings alone filled the page: next page resumes the
            // system check via its offset; section cursors stay at start.
            continuation = encodeDriftContinuation({}, completedSections, false, systemOffsetFlushed);
          } else {
            // First item deferred with no prior cursor: resume from the start
            // of the earliest incomplete section on the next page.
            const firstIncomplete = DRIFT_CONTINUATION_SECTIONS.find(s => !completedSections.includes(s));
            if (firstIncomplete !== undefined && resume[firstIncomplete] !== undefined) {
              continuationCursors[firstIncomplete] = resume[firstIncomplete] as string;
            }
            continuation =
              Object.keys(continuationCursors).length > 0
                ? encodeDriftContinuation(continuationCursors, completedSections, systemReported, systemOffsetFlushed)
                : encodeDriftContinuation({}, completedSections, systemReported, systemOffsetFlushed);
          }
        } else {
          continuation = encodeDriftContinuation(
            continuationCursors,
            completedSections,
            systemReported,
            systemOffsetFlushed
          );
        }
      }
      return Object.freeze({
        generatedAt: new Date().toISOString(),
        issues: Object.freeze(issues),
        truncated,
        ...(continuation === undefined ? {} : { continuation }),
        summary,
      });
    }
  }
}

declare global {
  let AuthorizationMigrationService: Services.AuthorizationMigrationService;
}
