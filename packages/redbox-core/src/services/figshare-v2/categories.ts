import { createHash } from 'node:crypto';
import type { FigshareCategory } from './types';
import { CatalogueInvalidError, SnapshotTooLargeError } from './vocabulary-errors';

/**
 * Bumped whenever normalisation or proposal rules change so that stored sync runs
 * remain reproducible and comparable.
 */
export const FIGSHARE_NORMALIZER_VERSION = '1';

/** Guard rails that keep a preview inside Mongo's document size limit. */
export const FIGSHARE_SNAPSHOT_LIMITS = {
  maxCategories: 20000,
  maxSnapshotBytes: 8 * 1024 * 1024
} as const;

export interface NormalizedFigshareCategory {
  sourceId: string;
  categoryId: number;
  taxonomyId: string;
  title: string;
  parentSourceId: string | null;
  path: string[];
  selectable: boolean;
  hasChildren: boolean;
  contentHash: string;
}

export interface FigshareNormalizationWarning {
  code: 'missing-parent' | 'cycle-detected' | 'missing-taxonomy';
  sourceId: string;
  detail: string;
}

export interface FigshareNormalizationResult {
  rows: NormalizedFigshareCategory[];
  warnings: FigshareNormalizationWarning[];
}

export interface FigshareTaxonomySummary {
  taxonomyId: string;
  title: string;
  categoryCount: number;
  selectableCount: number;
  missingParentCount: number;
}

export type FigshareChangeClass = 'added' | 'changed' | 'removed' | 'reappeared' | 'unchanged';

export interface FigshareDiffRow {
  changeClass: FigshareChangeClass;
  sourceId: string;
  title: string;
  categoryId?: number;
  previousCategoryId?: number;
  previousTitle?: string;
}

export interface FigshareDiffSummary {
  added: number;
  changed: number;
  removed: number;
  reappeared: number;
  unchanged: number;
}

export interface FigshareDiffResult {
  rows: FigshareDiffRow[];
  summary: FigshareDiffSummary;
}

/** The mirror state a diff is computed against. */
export interface ExistingMirrorCategory {
  sourceId: string;
  categoryId: number;
  title: string;
  contentHash: string;
  historical: boolean;
}

export type FigshareProposalMatchType = 'exact-code' | 'identity' | 'label-suggestion' | 'manual' | 'historical';

export interface FigshareProposal {
  proposalId: string;
  localEntryId: string;
  localLabel: string;
  localValue: string;
  localIdentifier?: string;
  targetSourceId: string;
  targetCategoryId: number;
  targetTitle: string;
  matchType: FigshareProposalMatchType;
  /** Exact code/identity matches arrive preselected; label suggestions never do. */
  preselected: boolean;
  historical: boolean;
  evidence: Record<string, unknown>;
}

export interface FigshareProposalResult {
  proposals: FigshareProposal[];
  unresolvedLocalEntryIds: string[];
}

/** Local entry projection used by the matching engine. */
export interface LocalEntryCandidate {
  id: string;
  label: string;
  labelLower: string;
  value: string;
  valueLower: string;
  identifier?: string;
}

/**
 * Trim, drop any query string and keep the final URI/hash segment so that
 * `http://purl.org/au-research/vocabulary/anzsrc-for/2020/300101` and `300101`
 * compare equal.
 */
export function normalizeCategoryCode(value: unknown): string {
  const rawValue = String(value ?? '').trim();
  if (rawValue === '') {
    return '';
  }
  const withoutQuery = rawValue.split('?')[0] ?? rawValue;
  const delimiterIndex = Math.max(withoutQuery.lastIndexOf('/'), withoutQuery.lastIndexOf('#'));
  const segment = delimiterIndex === -1 ? withoutQuery : withoutQuery.slice(delimiterIndex + 1);
  return segment.trim().toLowerCase();
}

/** Collapse internal whitespace and normalise Unicode so labels compare stably. */
export function normalizeLabel(value: unknown): string {
  return String(value ?? '').normalize('NFC').replace(/\s+/g, ' ').trim();
}

function sha256(value: string): string {
  return `sha256:${createHash('sha256').update(value, 'utf8').digest('hex')}`;
}

function canonicalRow(row: Omit<NormalizedFigshareCategory, 'contentHash'>): string {
  return JSON.stringify([
    row.sourceId,
    row.categoryId,
    row.taxonomyId,
    row.title,
    row.parentSourceId,
    row.path,
    row.selectable,
    row.hasChildren
  ]);
}

function toPositiveInteger(value: unknown): number | null {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

/**
 * Validate and canonicalise a raw Figshare category response.
 *
 * Identity is the Figshare `source_id` when present (Q-01: prefer the taxonomy code,
 * keep the numeric id as the mutable publishing relationship), falling back to the
 * numeric id for catalogues that omit it.
 */
export function normalizeFigshareCategories(raw: unknown): FigshareNormalizationResult {
  if (!Array.isArray(raw)) {
    throw new CatalogueInvalidError('Figshare returned a category catalogue that is not an array');
  }
  if (raw.length > FIGSHARE_SNAPSHOT_LIMITS.maxCategories) {
    throw new SnapshotTooLargeError(
      `Figshare returned ${raw.length} categories which exceeds the supported maximum of ${FIGSHARE_SNAPSHOT_LIMITS.maxCategories}`
    );
  }

  interface StagedCategory {
    sourceId: string;
    categoryId: number;
    taxonomyId: string;
    title: string;
    rawParentId: number | null;
    selectable: boolean;
    hasChildren: boolean;
  }

  const staged: StagedCategory[] = [];
  const byCategoryId = new Map<number, StagedCategory>();
  const seenSourceIds = new Set<string>();

  for (const entry of raw) {
    if (entry == null || typeof entry !== 'object' || Array.isArray(entry)) {
      throw new CatalogueInvalidError('Figshare category catalogue contains a non-object entry');
    }
    const category = entry as FigshareCategory;
    const categoryId = toPositiveInteger(category.id);
    if (categoryId == null) {
      throw new CatalogueInvalidError('Figshare category is missing a positive numeric id');
    }
    const title = normalizeLabel(category.title);
    if (title === '') {
      throw new CatalogueInvalidError(`Figshare category ${categoryId} is missing a title`);
    }
    const sourceId = String(category.source_id ?? '').trim() || String(categoryId);
    if (seenSourceIds.has(sourceId)) {
      throw new CatalogueInvalidError(`Figshare category catalogue contains a duplicate source_id '${sourceId}'`);
    }
    if (byCategoryId.has(categoryId)) {
      throw new CatalogueInvalidError(`Figshare category catalogue contains a duplicate id '${categoryId}'`);
    }
    seenSourceIds.add(sourceId);

    const stagedCategory: StagedCategory = {
      sourceId,
      categoryId,
      taxonomyId: String(toPositiveInteger(category.taxonomy_id) ?? ''),
      title,
      rawParentId: toPositiveInteger(category.parent_id),
      selectable: category.is_selectable !== false,
      hasChildren: category.has_children === true
    };
    staged.push(stagedCategory);
    byCategoryId.set(categoryId, stagedCategory);
  }

  const warnings: FigshareNormalizationWarning[] = [];
  const parentBySourceId = new Map<string, string | null>();

  for (const category of staged) {
    if (category.rawParentId == null) {
      parentBySourceId.set(category.sourceId, null);
      continue;
    }
    const parent = byCategoryId.get(category.rawParentId);
    if (!parent) {
      // Public catalogue responses can omit ancestors; promote to a root and say so.
      warnings.push({
        code: 'missing-parent',
        sourceId: category.sourceId,
        detail: `Parent category ${category.rawParentId} is not present in this catalogue; the term is promoted to a root`
      });
      parentBySourceId.set(category.sourceId, null);
      continue;
    }
    parentBySourceId.set(category.sourceId, parent.sourceId);
  }

  const stagedBySourceId = new Map(staged.map((category) => [category.sourceId, category]));

  const buildPath = (category: StagedCategory): string[] => {
    const path: string[] = [category.sourceId];
    const seen = new Set<string>([category.sourceId]);
    let cursorSourceId = parentBySourceId.get(category.sourceId) ?? null;
    while (cursorSourceId != null) {
      if (seen.has(cursorSourceId)) {
        warnings.push({
          code: 'cycle-detected',
          sourceId: category.sourceId,
          detail: `Ancestor cycle detected at '${cursorSourceId}'; the remaining ancestors are omitted`
        });
        break;
      }
      seen.add(cursorSourceId);
      path.unshift(cursorSourceId);
      cursorSourceId = parentBySourceId.get(cursorSourceId) ?? null;
    }
    return path;
  };

  const resolveTaxonomyId = (category: StagedCategory): string => {
    if (category.taxonomyId !== '') {
      return category.taxonomyId;
    }
    // Catalogues without taxonomy_id are grouped by their root ancestor instead.
    const path = buildPath(category);
    const rootSourceId = path[0] ?? category.sourceId;
    const root = stagedBySourceId.get(rootSourceId);
    if (root != null && root.taxonomyId !== '') {
      return root.taxonomyId;
    }
    warnings.push({
      code: 'missing-taxonomy',
      sourceId: category.sourceId,
      detail: `Figshare did not supply taxonomy_id; grouped under root term '${rootSourceId}'`
    });
    return `root:${rootSourceId}`;
  };

  const rows: NormalizedFigshareCategory[] = staged.map((category) => {
    const base = {
      sourceId: category.sourceId,
      categoryId: category.categoryId,
      taxonomyId: resolveTaxonomyId(category),
      title: category.title,
      parentSourceId: parentBySourceId.get(category.sourceId) ?? null,
      path: buildPath(category),
      selectable: category.selectable,
      hasChildren: category.hasChildren
    };
    return { ...base, contentHash: sha256(canonicalRow(base)) };
  });

  rows.sort((left, right) => left.sourceId.localeCompare(right.sourceId));

  return { rows, warnings };
}

/** Group a normalized catalogue into the taxonomies an administrator can select. */
export function groupTaxonomies(
  result: FigshareNormalizationResult
): FigshareTaxonomySummary[] {
  const missingParentSourceIds = new Set(
    result.warnings.filter((warning) => warning.code === 'missing-parent').map((warning) => warning.sourceId)
  );
  const summaries = new Map<string, FigshareTaxonomySummary>();

  for (const row of result.rows) {
    const summary = summaries.get(row.taxonomyId) ?? {
      taxonomyId: row.taxonomyId,
      title: `Taxonomy ${row.taxonomyId}`,
      categoryCount: 0,
      selectableCount: 0,
      missingParentCount: 0
    };
    summary.categoryCount += 1;
    if (row.selectable) {
      summary.selectableCount += 1;
    }
    if (missingParentSourceIds.has(row.sourceId)) {
      summary.missingParentCount += 1;
    }
    summaries.set(row.taxonomyId, summary);
  }

  return Array.from(summaries.values()).sort((left, right) => left.taxonomyId.localeCompare(right.taxonomyId));
}

/** Restrict a normalized catalogue to a single taxonomy. */
export function filterByTaxonomy(
  result: FigshareNormalizationResult,
  taxonomyId: string
): FigshareNormalizationResult {
  const normalizedTaxonomyId = String(taxonomyId ?? '').trim();
  const rows = result.rows.filter((row) => row.taxonomyId === normalizedTaxonomyId);
  const retained = new Set(rows.map((row) => row.sourceId));
  return {
    rows,
    warnings: result.warnings.filter((warning) => retained.has(warning.sourceId))
  };
}

/**
 * Serialise the canonical ordered row set and hash it. The same Figshare content
 * always produces the same hash.
 */
export function hashSnapshot(rows: readonly NormalizedFigshareCategory[]): string {
  const ordered = [...rows].sort((left, right) => left.sourceId.localeCompare(right.sourceId));
  const serialized = JSON.stringify(ordered.map((row) => row.contentHash));
  return sha256(serialized);
}

/** Reject an over-limit snapshot before any database write. */
export function assertSnapshotWithinLimits(rows: readonly NormalizedFigshareCategory[]): void {
  if (rows.length > FIGSHARE_SNAPSHOT_LIMITS.maxCategories) {
    throw new SnapshotTooLargeError(
      `The selected taxonomy contains ${rows.length} categories which exceeds the supported maximum of ${FIGSHARE_SNAPSHOT_LIMITS.maxCategories}`
    );
  }
  const byteLength = Buffer.byteLength(JSON.stringify(rows), 'utf8');
  if (byteLength > FIGSHARE_SNAPSHOT_LIMITS.maxSnapshotBytes) {
    throw new SnapshotTooLargeError(
      `The normalized snapshot is ${byteLength} bytes which exceeds the supported maximum of ${FIGSHARE_SNAPSHOT_LIMITS.maxSnapshotBytes}`
    );
  }
}

/** Classify remote changes against the currently mirrored categories. */
export function classifyChanges(
  existing: readonly ExistingMirrorCategory[],
  snapshot: readonly NormalizedFigshareCategory[]
): FigshareDiffResult {
  const existingBySourceId = new Map(existing.map((row) => [row.sourceId, row]));
  const remoteBySourceId = new Map(snapshot.map((row) => [row.sourceId, row]));
  const rows: FigshareDiffRow[] = [];
  const summary: FigshareDiffSummary = { added: 0, changed: 0, removed: 0, reappeared: 0, unchanged: 0 };

  for (const remote of snapshot) {
    const local = existingBySourceId.get(remote.sourceId);
    if (!local) {
      rows.push({ changeClass: 'added', sourceId: remote.sourceId, title: remote.title, categoryId: remote.categoryId });
      summary.added += 1;
      continue;
    }
    if (local.historical) {
      rows.push({
        changeClass: 'reappeared',
        sourceId: remote.sourceId,
        title: remote.title,
        categoryId: remote.categoryId,
        previousCategoryId: local.categoryId,
        previousTitle: local.title
      });
      summary.reappeared += 1;
      continue;
    }
    if (local.contentHash !== remote.contentHash) {
      rows.push({
        changeClass: 'changed',
        sourceId: remote.sourceId,
        title: remote.title,
        categoryId: remote.categoryId,
        previousCategoryId: local.categoryId,
        previousTitle: local.title
      });
      summary.changed += 1;
      continue;
    }
    rows.push({ changeClass: 'unchanged', sourceId: remote.sourceId, title: remote.title, categoryId: remote.categoryId });
    summary.unchanged += 1;
  }

  for (const local of existing) {
    if (remoteBySourceId.has(local.sourceId) || local.historical) {
      continue;
    }
    rows.push({
      changeClass: 'removed',
      sourceId: local.sourceId,
      title: local.title,
      previousCategoryId: local.categoryId,
      previousTitle: local.title
    });
    summary.removed += 1;
  }

  rows.sort((left, right) => left.sourceId.localeCompare(right.sourceId));
  return { rows, summary };
}

/**
 * Deterministic proposal rules. Exact code and identity matches are preselected;
 * a unique exact label match is offered but never preselected; anything ambiguous
 * stays unresolved. No fuzzy matching is performed.
 */
export function buildProposals(
  localEntries: readonly LocalEntryCandidate[],
  snapshot: readonly NormalizedFigshareCategory[],
  options: { historicalSourceIds?: ReadonlySet<string> } = {}
): FigshareProposalResult {
  const historicalSourceIds = options.historicalSourceIds ?? new Set<string>();

  const byCode = new Map<string, NormalizedFigshareCategory[]>();
  const byLabel = new Map<string, NormalizedFigshareCategory[]>();
  for (const row of snapshot) {
    const code = normalizeCategoryCode(row.sourceId);
    if (code !== '') {
      byCode.set(code, [...(byCode.get(code) ?? []), row]);
    }
    const label = row.title.toLowerCase();
    byLabel.set(label, [...(byLabel.get(label) ?? []), row]);
  }

  const proposals: FigshareProposal[] = [];
  const unresolvedLocalEntryIds: string[] = [];

  const pushProposal = (
    entry: LocalEntryCandidate,
    target: NormalizedFigshareCategory,
    matchType: FigshareProposalMatchType,
    preselected: boolean,
    evidence: Record<string, unknown>
  ): void => {
    proposals.push({
      proposalId: `${entry.id}:${target.sourceId}`,
      localEntryId: entry.id,
      localLabel: entry.label,
      localValue: entry.value,
      localIdentifier: entry.identifier,
      targetSourceId: target.sourceId,
      targetCategoryId: target.categoryId,
      targetTitle: target.title,
      matchType,
      preselected,
      historical: historicalSourceIds.has(target.sourceId),
      evidence: { ...evidence, normalizerVersion: FIGSHARE_NORMALIZER_VERSION }
    });
  };

  for (const entry of localEntries) {
    const normalizedValue = normalizeCategoryCode(entry.value);
    const exactCodeMatches = normalizedValue === '' ? [] : (byCode.get(normalizedValue) ?? []);
    if (exactCodeMatches.length > 0) {
      for (const target of exactCodeMatches) {
        pushProposal(entry, target, 'exact-code', true, { rule: 'exact-code', normalizedValue });
      }
      continue;
    }

    const normalizedIdentifier = normalizeCategoryCode(entry.identifier);
    const identityMatches = normalizedIdentifier === '' ? [] : (byCode.get(normalizedIdentifier) ?? []);
    if (identityMatches.length > 0) {
      for (const target of identityMatches) {
        pushProposal(entry, target, 'identity', true, { rule: 'identity', normalizedIdentifier });
      }
      continue;
    }

    const labelMatches = byLabel.get(normalizeLabel(entry.label).toLowerCase()) ?? [];
    if (labelMatches.length === 1) {
      pushProposal(entry, labelMatches[0], 'label-suggestion', false, {
        rule: 'exact-label',
        normalizedLabel: normalizeLabel(entry.label)
      });
      continue;
    }

    unresolvedLocalEntryIds.push(entry.id);
  }

  return { proposals, unresolvedLocalEntryIds };
}

/** Identity proposals for a freshly created clone: every entry maps to its own source term. */
export function buildIdentityProposals(
  clonedEntries: readonly (LocalEntryCandidate & { sourceId: string })[],
  snapshot: readonly NormalizedFigshareCategory[]
): FigshareProposalResult {
  const bySourceId = new Map(snapshot.map((row) => [row.sourceId, row]));
  const proposals: FigshareProposal[] = [];
  const unresolvedLocalEntryIds: string[] = [];

  for (const entry of clonedEntries) {
    const target = bySourceId.get(entry.sourceId);
    if (!target) {
      unresolvedLocalEntryIds.push(entry.id);
      continue;
    }
    proposals.push({
      proposalId: `${entry.id}:${target.sourceId}`,
      localEntryId: entry.id,
      localLabel: entry.label,
      localValue: entry.value,
      localIdentifier: entry.identifier,
      targetSourceId: target.sourceId,
      targetCategoryId: target.categoryId,
      targetTitle: target.title,
      matchType: 'identity',
      preselected: true,
      historical: false,
      evidence: { rule: 'clone-identity', normalizerVersion: FIGSHARE_NORMALIZER_VERSION }
    });
  }

  return { proposals, unresolvedLocalEntryIds };
}
