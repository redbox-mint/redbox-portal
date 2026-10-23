import { createHash } from 'node:crypto';
import type { BrandRow, BrandingHistoryRow, BrandingRepository } from '../persistence/branding/BrandingRepository';

export const BRANDING_TYPEFACE_MIGRATION_NAME = '20260904000000-branding-typeface-backfill';
export interface BrandingTypefaceMigrationInput {
  readonly repository: BrandingRepository;
  readonly historyMaxVersions?: unknown;
  readonly log: { info(message: string): void; verbose(message: string): void };
}

/** Frozen historical conversion shared by both hosts. Requires explicit repository readiness. */
const DEFAULT_HISTORY_MAX_VERSIONS = 3;
// Frozen legacy editable keys: hidden/derived CSS tokens cannot be restored as inputs.
const LEGACY_EDITABLE_KEYS = new Set([
  'site-branding-area-background-color',
  'logo-heading-text-color',
  'panel-branding-background-color',
  'panel-branding-color',
  'panel-branding-border-color',
  'main-menu-branding-background-color',
  'header-branding-link-color',
  'header-branding-background-color',
  'header-branding-text-color',
  'main-menu-active-item-color',
  'main-menu-active-item-color-hover',
  'main-menu-active-item-background-color',
  'main-menu-active-item-background-color-hover',
  'main-menu-inactive-item-color',
  'main-menu-inactive-item-color-hover',
  'main-menu-inactive-item-background-color',
  'main-menu-inactive-item-background-color-hover',
  'main-menu-inactive-dropdown-item-color',
  'main-menu-inactive-dropdown-item-color-hover',
  'main-menu-inactive-dropdown-item-background-color',
  'main-menu-active-dropdown-item-color',
  'main-menu-active-dropdown-item-color-hover',
  'main-menu-active-dropdown-item-background-color',
  'main-menu-active-dropdown-item-background-color-hover',
  'body-background-color',
  'body-text-color',
  'anchor-color',
  'anchor-color-hover',
  'anchor-color-focus',
  'footer-bottom-area-branding-background-color',
  'footer-bottom-area-branding-color',
  'primary',
  'secondary',
  'success',
  'info',
  'warning',
  'danger',
  'light',
  'dark',
]);

function isMissing(value: unknown) {
  return value === undefined || value === null;
}

function snapshotKey(value: unknown) {
  return JSON.stringify(value === undefined ? null : value);
}

function effectiveHash(brand: BrandRow) {
  // Mirrors the preservation fallback so reruns compare equal (idempotency).
  return (
    brand.hash ||
    createHash('sha256')
      .update(String(brand.css || ''))
      .digest('hex')
      .slice(0, 32)
  );
}

function activeMatchesHistory(brand: BrandRow, history: BrandingHistoryRow) {
  return snapshotKey(brand.css) === snapshotKey(history.css) && effectiveHash(brand) === history.hash;
}

function readHistoryMaxVersions(input: BrandingTypefaceMigrationInput): number {
  const configured = input.historyMaxVersions;
  if (typeof configured === 'number' && Number.isSafeInteger(configured) && configured > 0) return configured;
  input.log.info('Branding typeface backfill: Invalid historyMaxVersions; using safe default 3.');
  return DEFAULT_HISTORY_MAX_VERSIONS;
}

function isUniqueViolation(error: unknown) {
  if (!error) {
    return false;
  }
  const code =
    typeof error === 'object' && error !== null && typeof Reflect.get(error, 'code') === 'string'
      ? String(Reflect.get(error, 'code'))
      : '';
  const message =
    typeof error === 'object' && error !== null && typeof Reflect.get(error, 'message') === 'string'
      ? String(Reflect.get(error, 'message'))
      : '';
  return code === 'E_UNIQUE' || /E_UNIQUE|unique|duplicate key/i.test(code + ' ' + message);
}

async function backfillBrandFields(BrandingConfig: BrandingRepository, brand: BrandRow) {
  await BrandingConfig.backfillBrandTypeface(brand.id);
}

async function backfillHistoryTypeface(BrandingConfigHistory: BrandingRepository, histories: BrandingHistoryRow[]) {
  for (const history of histories) {
    await BrandingConfigHistory.backfillHistoryTypeface(history.id);
  }
}

// `variables` on the brand is the independent draft, never publication evidence.
function publishedVariables(brand: BrandRow, histories: BrandingHistoryRow[]) {
  const matching = histories.find(row => activeMatchesHistory(brand, row));
  if (matching) return matching.variables || {};
  const root = /:root\s*\{([^}]+)\}/.exec(brand.css || '');
  const variables: Record<string, string> = {};
  if (root) {
    for (const match of root[1].matchAll(/--rb-([a-z0-9-]+)\s*:\s*(#[a-fA-F0-9]{3,8})\s*;/g)) {
      if (LEGACY_EDITABLE_KEYS.has(match[1])) variables[match[1]] = match[2];
    }
  }
  if (Object.keys(variables).length === 0) {
    // Do not prune anything when the published snapshot cannot be recovered.
    throw new Error(`Branding typeface backfill: cannot recover published colours for brand ${brand.id}`);
  }
  return variables;
}

async function preserveActiveState(
  BrandingConfig: BrandingRepository,
  BrandingConfigHistory: BrandingRepository,
  input: BrandingTypefaceMigrationInput,
  brand: BrandRow,
  maxVersion: number,
  histories: BrandingHistoryRow[]
) {
  const activeVersion = typeof brand.version === 'number' ? brand.version : 0;
  const nextVersion = Math.max(maxVersion, activeVersion) + 1;
  // BrandingConfigHistory.hash is required and rejects empty strings, so a
  // never-published brand (empty hash) is preserved under the deterministic
  // effective content hash (see effectiveHash) instead of ''.
  const preservedHash = effectiveHash(brand);
  const preserved = {
    branding: brand.id,
    version: nextVersion,
    hash: preservedHash,
    css: brand.css || '',
    variables: publishedVariables(brand, histories),
    typeface: null,
  };
  try {
    await BrandingConfigHistory.insertHistory(preserved);
  } catch (error) {
    if (!isUniqueViolation(error)) {
      throw error;
    }
    // A concurrent migration runner may have won the same preservation.
    // Converge only when the existing row is the same preserved snapshot.
    const existing = await BrandingConfigHistory.getHistory({ branding: brand.id, version: nextVersion });
    if (!existing || !activeMatchesHistory(brand, existing)) {
      throw error;
    }
    input.log.verbose(`Branding typeface backfill: concurrent preservation of brand ${brand.id} converged.`);
  }
  // Conditional move so a concurrent winner is never overwritten blindly.
  const updated = await BrandingConfig.publishBrand(brand.id, brand.version, undefined, {
    version: nextVersion,
  });
  if (updated) {
    brand.version = nextVersion;
  } else {
    const reread = await BrandingConfig.getBrand({ id: brand.id });
    if (!reread || reread.version !== nextVersion) {
      throw new Error(`Branding typeface backfill: concurrent brand update conflict for brand ${brand.id}`);
    }
    brand.version = reread.version;
  }
  return nextVersion;
}

async function pruneHistories(BrandingConfigHistory: BrandingRepository, brandId: string, retain: number) {
  const histories = await BrandingConfigHistory.listHistories(brandId, 'DESC');
  const excess = histories.slice(retain);
  for (const history of excess) {
    await BrandingConfigHistory.removeHistory(history.id);
  }
  return excess.length;
}

async function migrateBrand(input: BrandingTypefaceMigrationInput, brand: BrandRow, retain: number) {
  const BrandingConfig = input.repository;
  const BrandingConfigHistory = input.repository;
  const stats: { brandBackfilled: boolean; preservedVersion: number | null; pruned: number } = {
    brandBackfilled: false,
    preservedVersion: null,
    pruned: 0,
  };

  const needsBackfill =
    brand.typeface === undefined || brand.draftTypeface === undefined || isMissing(brand.draftRevision);
  await backfillBrandFields(BrandingConfig, brand);
  stats.brandBackfilled = needsBackfill;

  let histories = await BrandingConfigHistory.listHistories(brand.id, 'ASC');
  await backfillHistoryTypeface(BrandingConfigHistory, histories);

  const maxVersion = histories.reduce((max, history) => Math.max(max, history.version), 0);
  const activeVersion = brand.version || 0;
  // Version zero with no history is the generated-default state and is already
  // represented. Otherwise the active state must equal the maximum-version row;
  // a rewound version, an unmatched version, or a divergent same-number
  // snapshot is preserved as max(maxVersion, activeVersion) + 1 before any pruning.
  const maxRow = histories.find(history => history.version === maxVersion);
  const activeRepresented =
    (activeVersion === 0 && maxVersion === 0) ||
    (activeVersion === maxVersion && maxRow !== undefined && activeMatchesHistory(brand, maxRow));
  if (!activeRepresented) {
    stats.preservedVersion = await preserveActiveState(
      BrandingConfig,
      BrandingConfigHistory,
      input,
      brand,
      maxVersion,
      histories
    );
    histories = await BrandingConfigHistory.listHistories(brand.id, 'ASC');
  }

  stats.pruned = await pruneHistories(BrandingConfigHistory, brand.id, retain);
  return stats;
}

export async function migrateBrandingTypefaces(input: BrandingTypefaceMigrationInput): Promise<void> {
  const retain = readHistoryMaxVersions(input);
  const brands = await input.repository.listBrands();
  let preserved = 0;
  let pruned = 0;
  for (const brand of brands) {
    const stats = await migrateBrand(input, brand, retain);
    if (stats.preservedVersion !== null && stats.preservedVersion !== undefined) {
      preserved += 1;
    }
    pruned += stats.pruned;
  }
  input.log.info(
    `Branding typeface backfill complete: brands=${brands.length}, preserved=${preserved}, pruned=${pruned}, retain=${retain}.`
  );
}
