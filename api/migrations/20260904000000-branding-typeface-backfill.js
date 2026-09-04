'use strict';

const crypto = require('crypto');

/**
 * Branding typeface backfill migration.
 *
 * Backfills the Brand Typeface persistence fields introduced for custom brand
 * typefaces (see design.md section 6):
 *
 * 1. `BrandingConfig.typeface` / `draftTypeface` (absent -> null, i.e. Default
 *    Typography) and `draftRevision` (absent -> 0) for every brand.
 * 2. `BrandingConfigHistory.typeface` (absent -> null) for every history row.
 * 3. Legacy rollback repair: the old `rollback` implementation rewound the
 *    active version number instead of allocating a new version. If the current
 *    active state is not represented by the maximum history version, or the
 *    active snapshot (variables/css/hash) differs from the history row bearing
 *    its version, the current active colours are preserved as a new complete
 *    history row at `max + 1` (Default Typography) and the active version is
 *    moved to that value before any pruning.
 * 4. Retains only the newest configured (`sails.config.branding.historyMaxVersions`,
 *    default 3) history rows per brand.
 *
 * Idempotency: every write is conditional on the row still needing it, so a
 * second execution performs zero writes. Two instances attempting the same
 * pending migration converge via the unique `(branding, version)` history
 * index: a duplicate version insert is re-read and accepted only when the
 * existing row represents the same preserved active snapshot.
 *
 * No `down` migration is provided on purpose: step 4 prunes history rows and
 * deleted rows cannot be reconstructed, so a destructive rollback would risk
 * data loss. Recovery from a bad deploy uses the pre-deployment database
 * backup (see the implementation plan deployment sequence).
 */

const MIGRATION_NAME = '20260904000000-branding-typeface-backfill';
const DEFAULT_HISTORY_MAX_VERSIONS = 3;

function isMissing(value) {
  return value === undefined || value === null;
}

function snapshotKey(value) {
  return JSON.stringify(value === undefined ? null : value);
}

function effectiveHash(brand) {
  // Mirrors the preservation fallback so reruns compare equal (idempotency).
  return (
    brand.hash ||
    crypto
      .createHash('sha256')
      .update(String(brand.css || ''))
      .digest('hex')
      .slice(0, 32)
  );
}

function activeMatchesHistory(brand, history) {
  return (
    snapshotKey(brand.variables) === snapshotKey(history.variables) &&
    snapshotKey(brand.css) === snapshotKey(history.css) &&
    effectiveHash(brand) === history.hash
  );
}

function readHistoryMaxVersions(sails) {
  try {
    const configured = sails && sails.config && sails.config.branding && sails.config.branding.historyMaxVersions;
    if (typeof configured === 'number' && Number.isFinite(configured) && configured > 0) {
      return Math.floor(configured);
    }
  } catch (_ignored) {
    // Fall through to the default.
  }
  return DEFAULT_HISTORY_MAX_VERSIONS;
}

function isUniqueViolation(error) {
  if (!error) {
    return false;
  }
  const code = typeof error.code === 'string' ? error.code : '';
  const message = typeof error.message === 'string' ? error.message : '';
  return code === 'E_UNIQUE' || /E_UNIQUE|unique|duplicate key/i.test(code + ' ' + message);
}

async function backfillBrandFields(BrandingConfig, brand) {
  const patch = {};
  if (brand.typeface === undefined) {
    patch.typeface = null;
  }
  if (brand.draftTypeface === undefined) {
    patch.draftTypeface = null;
  }
  if (isMissing(brand.draftRevision)) {
    patch.draftRevision = 0;
  }
  if (Object.keys(patch).length === 0) {
    return;
  }
  await BrandingConfig.updateOne({ id: brand.id }).set(patch);
  Object.assign(brand, patch);
}

async function backfillHistoryTypeface(BrandingConfigHistory, histories) {
  for (const history of histories) {
    if (history.typeface === undefined) {
      await BrandingConfigHistory.updateOne({ id: history.id }).set({ typeface: null });
      history.typeface = null;
    }
  }
}

async function preserveActiveState(BrandingConfig, BrandingConfigHistory, sails, brand, maxVersion) {
  const nextVersion = maxVersion + 1;
  // BrandingConfigHistory.hash is required and rejects empty strings, so a
  // never-published brand (empty hash) is preserved under the deterministic
  // effective content hash (see effectiveHash) instead of ''.
  const preservedHash = effectiveHash(brand);
  const preserved = {
    branding: brand.id,
    version: nextVersion,
    hash: preservedHash,
    css: brand.css || '',
    variables: brand.variables || {},
    typeface: null,
  };
  try {
    await BrandingConfigHistory.create(preserved);
  } catch (error) {
    if (!isUniqueViolation(error)) {
      throw error;
    }
    // A concurrent migration runner may have won the same preservation.
    // Converge only when the existing row is the same preserved snapshot.
    const existing = await BrandingConfigHistory.findOne({ branding: brand.id, version: nextVersion });
    if (!existing || !activeMatchesHistory(brand, existing)) {
      throw error;
    }
    sails.log.verbose(`Branding typeface backfill: concurrent preservation of brand ${brand.id} converged.`);
  }
  // Conditional move so a concurrent winner is never overwritten blindly.
  const updated = await BrandingConfig.updateOne({ id: brand.id, version: brand.version }).set({
    version: nextVersion,
  });
  if (updated) {
    brand.version = nextVersion;
  } else {
    const reread = await BrandingConfig.findOne({ id: brand.id });
    if (!reread || reread.version !== nextVersion) {
      throw new Error(`Branding typeface backfill: concurrent brand update conflict for brand ${brand.id}`);
    }
    brand.version = reread.version;
  }
  return nextVersion;
}

async function pruneHistories(BrandingConfigHistory, brandId, retain) {
  const histories = await BrandingConfigHistory.find({ branding: brandId }).sort('version DESC');
  const excess = histories.slice(retain);
  for (const history of excess) {
    await BrandingConfigHistory.destroy({ id: history.id });
  }
  return excess.length;
}

async function migrateBrand(sails, brand, retain) {
  const BrandingConfig = sails.models.brandingconfig;
  const BrandingConfigHistory = sails.models.brandingconfighistory;
  const stats = { brandBackfilled: false, preservedVersion: null, pruned: 0 };

  const needsBackfill =
    brand.typeface === undefined || brand.draftTypeface === undefined || isMissing(brand.draftRevision);
  await backfillBrandFields(BrandingConfig, brand);
  stats.brandBackfilled = needsBackfill;

  let histories = await BrandingConfigHistory.find({ branding: brand.id }).sort('version ASC');
  await backfillHistoryTypeface(BrandingConfigHistory, histories);

  const maxVersion = histories.reduce((max, history) => Math.max(max, history.version), 0);
  const activeVersion = brand.version || 0;
  // Version zero with no history is the generated-default state and is already
  // represented. Otherwise the active state must equal the maximum-version row;
  // a rewound version, an unmatched version, or a divergent same-number
  // snapshot is preserved as max + 1 before any pruning.
  const maxRow = histories.find(history => history.version === maxVersion);
  const activeRepresented =
    (activeVersion === 0 && maxVersion === 0) ||
    (activeVersion === maxVersion && maxRow !== undefined && activeMatchesHistory(brand, maxRow));
  if (!activeRepresented) {
    stats.preservedVersion = await preserveActiveState(BrandingConfig, BrandingConfigHistory, sails, brand, maxVersion);
    histories = await BrandingConfigHistory.find({ branding: brand.id }).sort('version ASC');
  }

  stats.pruned = await pruneHistories(BrandingConfigHistory, brand.id, retain);
  return stats;
}

async function up(params) {
  const sails = params && params.context;
  if (!sails || !sails.models || !sails.models.brandingconfig || !sails.models.brandingconfighistory) {
    throw new Error('branding-typeface-backfill-models-unavailable');
  }
  const retain = readHistoryMaxVersions(sails);
  const brands = await sails.models.brandingconfig.find({});
  let preserved = 0;
  let pruned = 0;
  for (const brand of brands) {
    const stats = await migrateBrand(sails, brand, retain);
    if (stats.preservedVersion !== null && stats.preservedVersion !== undefined) {
      preserved += 1;
    }
    pruned += stats.pruned;
  }
  sails.log.info(
    `Branding typeface backfill complete: brands=${brands.length}, preserved=${preserved}, pruned=${pruned}, retain=${retain}.`
  );
}

module.exports = { name: MIGRATION_NAME, up };
