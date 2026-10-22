import type {
  FigshareSyncModel,
  FigshareIntentKind,
  FigshareSourceIntent,
} from '../../model/storage/FigshareSyncModel';
/** Durable single-record job state. All times used for ownership/dispatch are milliseconds. */
export interface FigshareSyncRepository {
  assertReady(): Promise<void>;
  initialise(oid: string, brandId: string): Promise<void>;
  get(oid: string): Promise<FigshareSyncModel | null>;
  change(oid: string, change: (state: FigshareSyncModel) => void, owner?: string): Promise<FigshareSyncModel>;
  importSource(oid: string, brandId: string, intent: FigshareSourceIntent): Promise<void>;
  request(oid: string, kind: FigshareIntentKind, dueAt?: number, onlyIfIdle?: boolean): Promise<void>;
  claim(oid: string, brandId: string, owner: string, leaseMs: number): Promise<FigshareSyncModel | null>;
  renew(oid: string, owner: string, leaseMs: number): Promise<void>;
  assertOwner(oid: string, owner: string): Promise<void>;
  release(oid: string, owner: string): Promise<void>;
  due(limit?: number, excludeOids?: Iterable<string>): Promise<Array<{ oid: string; brandId: string }>>;
  dispatchClaim(oid: string, cooldownMs?: number, extend?: boolean): Promise<boolean>;
  claimAdministration(oid: string, owner: string, leaseMs: number): Promise<boolean>;
  findOtherBinding(namespace: string, articleId: string, exceptOid: string): Promise<{ oid: string } | null>;
}
