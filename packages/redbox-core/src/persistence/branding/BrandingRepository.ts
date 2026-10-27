import type { BrandingTypefaceState } from '../../model/BrandingTypeface';
import type { RoleModel } from '../../model/storage/RoleModel';

/** Plain branding snapshots. Physical IDs, datastores and driver errors stay adapter-owned. */
export interface BrandRow {
  id: string;
  name?: string;
  css?: string;
  variables?: Record<string, string>;
  hash?: string;
  version?: number;
  draftRevision?: number;
  typeface?: BrandingTypefaceState | null;
  draftTypeface?: BrandingTypefaceState | null;
  logo?: Record<string, unknown>;
  favicon?: Record<string, unknown>;
  roles?: RoleModel[];
  createdAt?: string;
  updatedAt?: string;
}
export interface BrandingHistoryRow {
  id: string;
  branding: string;
  version: number;
  hash: string;
  css?: string;
  variables?: Record<string, string>;
  typeface?: BrandingTypefaceState | null;
  dateCreated?: string;
  actorId?: string;
  actorDisplayName?: string;
  restoredFromVersion?: number;
  createdAt?: string;
  updatedAt?: string;
}
export type BrandingValues = Record<string, unknown>;
export interface BrandingRepository {
  getBrand(lookup: { id: string } | { name: string }, withRoles?: boolean): Promise<BrandRow | null>;
  listBrands(withRoles?: boolean): Promise<BrandRow[]>;
  createBrand(values: BrandingValues): Promise<BrandRow>;
  setBrandAssets(
    id: string,
    values: { logo?: Record<string, unknown>; favicon?: Record<string, unknown> }
  ): Promise<void>;
  reviseBrand(id: string, values: BrandingValues): Promise<BrandRow | null>;
  reviseDraft(id: string, draftRevision: number, values: BrandingValues): Promise<BrandRow | null>;
  publishBrand(
    id: string,
    version: number | undefined,
    draftRevision: number | undefined,
    values: BrandingValues
  ): Promise<BrandRow | null>;
  getHistory(lookup: { id: string } | { branding: string; version: number }): Promise<BrandingHistoryRow | null>;
  listHistories(branding?: string, order?: 'ASC' | 'DESC'): Promise<BrandingHistoryRow[]>;
  insertHistory(values: BrandingValues): Promise<BrandingHistoryRow>;
  removeHistory(id: string): Promise<void>;
  /** Frozen historical allowlist bypass; no arbitrary native patch API. */
  migrateAdminSidebarTextColor(): Promise<number>;
  /** Frozen typeface migration: no arbitrary history editing surface. */
  backfillBrandTypeface(id: string): Promise<void>;
  backfillHistoryTypeface(id: string): Promise<void>;
}
