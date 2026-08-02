import { Services as services } from '../CoreService';
import {
  FigshareVocabularyCategoryAttributes,
  FigshareVocabularyCrosswalkAttributes,
  FigshareVocabularyCrosswalkMappingAttributes,
  FigshareVocabularySourceAttributes,
  FigshareVocabularySyncRunAttributes,
  VocabularyAttributes,
  VocabularyEntryAttributes
} from '../waterline-models';
import { isAllowedSyncRunTransition } from '../waterline-models/FigshareVocabularySyncRun';
import { runWithOptionalTransaction } from '../utilities/TransactionUtils';
import { promiseWithTimeout } from '../utilities/PromiseUtils';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import _ from 'lodash';
import { resolveFigshareVocabularyConfig } from './figshare-v2/config';
import type { FigshareClient } from './figshare-v2/http';
import { FigshareHttpError, makeFixtureClient, makeLiveClient } from './figshare-v2/http';
import type { FigshareCategoryScope, FigshareRunContext } from './figshare-v2/types';
import {
  assertSnapshotWithinLimits,
  buildIdentityProposals,
  buildProposals,
  classifyChanges,
  ExistingMirrorCategory,
  FIGSHARE_NORMALIZER_VERSION,
  FigshareDiffResult,
  FigshareDiffRow,
  FigshareProposal,
  FigshareTaxonomySummary,
  filterByTaxonomy,
  groupTaxonomies,
  hashSnapshot,
  LocalEntryCandidate,
  normalizeCategoryCode,
  normalizeFigshareCategories,
  NormalizedFigshareCategory
} from './figshare-v2/categories';
import {
  CatalogueInvalidError,
  CrosswalkRevisionError,
  FigshareTransportError,
  PreviewExpiredError,
  RelationshipBoundaryError,
  StalePreviewError
} from './figshare-v2/vocabulary-errors';

export namespace Services {
  const PREVIEW_TTL_MS = 24 * 60 * 60 * 1000;
  const MAX_MAPPING_BATCH = 2000;
  const MAX_PAGE_SIZE = 200;
  const DEFAULT_BOOTSTRAP_DATA_PATH = 'bootstrap-data';
  const FIGSHARE_IMPORTS_FILE = 'figshare-imports.json';
  const FIGSHARE_IMPORT_TIMEOUT_MS = 120_000;
  const BOOTSTRAP_ACTOR = 'bootstrap-data';

  /** One declared import in `bootstrap-data/vocabularies/figshare-imports.json`. */
  export interface BootstrapFigshareImportItem {
    scope?: string;
    taxonomyId?: string | number;
    localCloneName?: string;
    localCloneSlug?: string;
    crosswalkName?: string;
  }

  export interface BootstrapFigshareImportsFile {
    imports?: BootstrapFigshareImportItem[];
  }

  export interface ActorContext {
    brandId: string;
    userId: string;
  }

  export interface CreatePreviewInput {
    scope: FigshareCategoryScope;
    taxonomyId: string;
    sourceId?: string;
    crosswalkId?: string;
    localVocabularyId?: string;
    createLocalClone?: boolean;
    localCloneName?: string;
    localCloneSlug?: string;
  }

  export interface SyncPreviewSummary {
    added: number;
    changed: number;
    removed: number;
    reappeared: number;
    unchanged: number;
    proposed: number;
    preselected: number;
    unresolved: number;
    historicalWarnings: number;
  }

  export interface SyncPreview {
    runId: string;
    state: string;
    scope: FigshareCategoryScope | string;
    taxonomyId: string;
    sourceId?: string | null;
    localVocabularyId?: string | null;
    crosswalkId?: string | null;
    createLocalClone: boolean;
    baseHash: string;
    remoteHash: string;
    expiresAt: string;
    normalizerVersion: string;
    summary: SyncPreviewSummary;
    warnings: unknown[];
  }

  export interface PreviewPageQuery {
    view?: 'proposals' | 'diff';
    changeClass?: string;
    matchType?: string;
    q?: string;
    unresolvedOnly?: boolean;
    historicalOnly?: boolean;
    limit?: number;
    offset?: number;
  }

  export interface PagedPreview extends SyncPreview {
    page: {
      view: 'proposals' | 'diff';
      records: unknown[];
      total: number;
      limit: number;
      offset: number;
    };
    unresolved: Array<{ localEntryId: string; localLabel: string; localValue: string }>;
  }

  export interface ManualMappingInput {
    localEntryId?: string;
    /** Clone identity fallback: the remote sourceId whose cloned entry should be mapped. */
    localEntryKey?: string;
    figshareSourceIds: string[];
  }

  export interface ApplyDecisions {
    remoteHash: string;
    expectedRevision?: number;
    approvedProposalIds?: string[];
    manualMappings?: ManualMappingInput[];
  }

  export interface ApplyResult {
    runId: string;
    state: string;
    sourceId: string;
    vocabularyId: string;
    localVocabularyId?: string | null;
    crosswalkId?: string | null;
    crosswalkRevision?: number | null;
    categories: { created: number; updated: number; historical: number; reappeared: number };
    mappings: { created: number; removed: number };
    cloneCreated: boolean;
    appliedAt: string;
  }

  export interface CrosswalkSummary {
    id: string;
    name: string;
    status: string;
    workingRevision: number;
    approvedRevision?: number | null;
    approvedAt?: string;
    approvedBy?: string;
    localVocabularyId: string;
    localVocabularyName: string;
    figshareSourceId: string;
    figshareSourceName: string;
    scope: string;
    taxonomyId: string;
    approvedMappingCount: number;
    workingMappingCount: number;
    historicalTargetCount: number;
  }

  export interface CrosswalkMappingChange {
    op: 'add' | 'remove';
    localEntryId: string;
    figshareCategoryId: string;
    matchType?: string;
    status?: 'proposed' | 'approved' | 'rejected';
  }

  /** One selectable Figshare target offered by the manual mapping picker. */
  export interface SourceCategoryOption {
    id: string;
    sourceId: string;
    categoryId: number;
    title: string;
    parentSourceId?: string;
    selectable: boolean;
    historical: boolean;
  }

  /** One local vocabulary term offered by the manual mapping picker. */
  export interface CrosswalkLocalEntryOption {
    id: string;
    label: string;
    value: string;
    identifier?: string;
    historical: boolean;
    /** Targets already mapped to this term in the requested revision. */
    targetCount: number;
  }

  export interface CrosswalkUsage {
    brandName: string;
    configKey: string;
    /** Dotted path of the crosswalk binding within the config, e.g. `metadata.categories.source`. */
    bindingPath: string;
    outputs?: string;
    sourceVocabularyId?: string;
  }

  export interface ResolveCategoriesInput {
    brandId: string;
    crosswalkId: string;
    sourceVocabularyId: string;
    codes: string[];
  }

  export interface ResolveCategoriesResult {
    categoryIds: number[];
    unresolvedCodes: string[];
    historicalTargets: Array<{ code: string; categoryId: number; sourceId: string }>;
  }

  export type CrosswalkOutput = 'categoryId' | 'label' | 'sourceId';

  export interface ResolveCrosswalkValuesInput extends ResolveCategoriesInput {
    outputs: CrosswalkOutput;
  }

  export interface ResolveCrosswalkValuesResult {
    values: Array<number | string>;
    normalizedCodes: string[];
    unresolvedCodes: string[];
    historicalTargets: Array<{ code: string; categoryId: number; sourceId: string }>;
  }

  /** Intermediate shape shared by every output mode. */
  interface CrosswalkTargetResolution {
    normalizedCodes: string[];
    matches: Array<{ code: string; category: FigshareVocabularyCategoryAttributes }>;
    unresolvedCodes: string[];
    historicalTargets: Array<{ code: string; categoryId: number; sourceId: string }>;
  }

  interface SnapshotRowsWithWarnings {
    rows: NormalizedFigshareCategory[];
    warnings: unknown[];
  }

  export class FigshareVocabularyService extends services.Core.Service {
    protected override _exportedMethods: string[] = [
      'discoverTaxonomies',
      'createPreview',
      'getPreview',
      'applyPreview',
      'cloneMirror',
      'listSources',
      'getSource',
      'listSourceCategories',
      'listSyncRuns',
      'listCrosswalks',
      'getCrosswalk',
      'getCrosswalkUsage',
      'createCrosswalk',
      'listCrosswalkLocalEntries',
      'listCrosswalkMappings',
      'saveMappings',
      'approveCrosswalk',
      'deleteCrosswalk',
      'resolveCategories',
      'resolveCrosswalkValues',
      'bootstrapData'
    ];

    // ── Infrastructure helpers ────────────────────────────────────────

    private getDatastore(): Sails.Datastore | null {
      return Vocabulary.getDatastore?.() ?? sails.getDatastore?.() ?? null;
    }

    private async runQuery<T>(query: Sails.WaterlinePromise<T>, connection?: Sails.Connection): Promise<T> {
      return connection ? query.usingConnection(connection) : query;
    }

    private async createOne<T>(query: Sails.WaterlinePromise<T>, connection?: Sails.Connection): Promise<T> {
      return this.runQuery(query.fetch(), connection);
    }

    private nowIso(): string {
      return new Date().toISOString();
    }

    private resolveBrandName(brandId: string): string {
      const brandingService = typeof BrandingService === 'undefined' ? undefined : BrandingService;
      const brand = brandingService?.getBrandById?.(brandId);
      if (brand?.name != null && String(brand.name).trim() !== '') {
        return String(brand.name);
      }
      return String(brandId);
    }

    private buildRunContext(brandId: string, correlationId: string): FigshareRunContext {
      const brandName = this.resolveBrandName(brandId);
      return {
        recordOid: '',
        brandId,
        brandName,
        correlationId,
        triggerSource: 'figshare-vocabulary-admin'
      };
    }

    /**
     * Resolve a Figshare client for catalogue reads. The client is always built from
     * trusted deployment configuration; a request never supplies a base URL or token.
     */
    private resolveClient(brandId: string, scope: FigshareCategoryScope): FigshareClient {
      const brandName = this.resolveBrandName(brandId);
      const config = resolveFigshareVocabularyConfig(brandName);
      if (config == null) {
        throw new FigshareTransportError('Figshare is not configured for this brand');
      }
      if (scope === 'account' && String(config.connection.token ?? '').trim() === '' && config.runtime.mode !== 'fixture') {
        throw new FigshareTransportError('The Figshare account catalogue requires a configured API token', 401);
      }
      const runContext = this.buildRunContext(brandId, `figshare-vocab-${Date.now()}`);
      return config.runtime.mode === 'fixture'
        ? makeFixtureClient(config)
        : makeLiveClient(config, runContext);
    }

    private async fetchCatalogue(brandId: string, scope: FigshareCategoryScope): Promise<unknown> {
      const client = this.resolveClient(brandId, scope);
      try {
        return scope === 'account' ? await client.listAccountCategories() : await client.listPublicCategories();
      } catch (error) {
        if (error instanceof FigshareHttpError) {
          // FigshareHttpError already strips the axios request config; keep it that way.
          throw new FigshareTransportError(
            `Figshare category catalogue request failed${error.statusCode == null ? '' : ` (status ${error.statusCode})`}`,
            error.statusCode
          );
        }
        throw error;
      }
    }

    private assertScope(scope: unknown): FigshareCategoryScope {
      const normalized = String(scope ?? '').trim().toLowerCase();
      if (normalized !== 'public' && normalized !== 'account') {
        throw new CatalogueInvalidError("scope must be either 'public' or 'account'");
      }
      return normalized;
    }

    private parsePaging(limit: unknown, offset: unknown, defaultLimit = 50): { limit: number; offset: number } {
      const parsedLimit = Number.parseInt(String(limit ?? defaultLimit), 10);
      const parsedOffset = Number.parseInt(String(offset ?? 0), 10);
      return {
        limit: Number.isInteger(parsedLimit) && parsedLimit > 0 ? Math.min(MAX_PAGE_SIZE, parsedLimit) : defaultLimit,
        offset: Number.isInteger(parsedOffset) && parsedOffset >= 0 ? parsedOffset : 0
      };
    }

    // ── Brand-scoped resolution ───────────────────────────────────────

    private async requireSource(sourceId: string, brandId: string): Promise<FigshareVocabularySourceAttributes> {
      const source = await FigshareVocabularySource.findOne({
        id: String(sourceId ?? '').trim(),
        branding: brandId
      }) as FigshareVocabularySourceAttributes | null;
      if (!source) {
        throw new RelationshipBoundaryError('Figshare source not found');
      }
      return source;
    }

    private async requireCrosswalk(crosswalkId: string, brandId: string): Promise<FigshareVocabularyCrosswalkAttributes> {
      const crosswalk = await FigshareVocabularyCrosswalk.findOne({
        id: String(crosswalkId ?? '').trim(),
        branding: brandId
      }) as FigshareVocabularyCrosswalkAttributes | null;
      if (!crosswalk) {
        throw new RelationshipBoundaryError('Figshare crosswalk not found');
      }
      return crosswalk;
    }

    private async requireLocalVocabulary(vocabularyId: string, brandId: string): Promise<VocabularyAttributes> {
      const vocabulary = await Vocabulary.findOne({
        id: String(vocabularyId ?? '').trim(),
        branding: brandId
      }) as VocabularyAttributes | null;
      if (!vocabulary) {
        throw new RelationshipBoundaryError('Local vocabulary not found');
      }
      if (vocabulary.source === 'external') {
        throw new RelationshipBoundaryError('A Figshare mirror cannot be used as the local side of a crosswalk');
      }
      return vocabulary;
    }

    private async requireRun(runId: string, brandId: string): Promise<FigshareVocabularySyncRunAttributes> {
      const run = await FigshareVocabularySyncRun.findOne({
        id: String(runId ?? '').trim(),
        branding: brandId
      }) as FigshareVocabularySyncRunAttributes | null;
      if (!run) {
        throw new RelationshipBoundaryError('Synchronisation preview not found');
      }
      return run;
    }

    /** Expiry is enforced synchronously; no scheduled job is introduced. */
    private async pruneExpiredRuns(brandId: string): Promise<void> {
      const now = this.nowIso();
      await FigshareVocabularySyncRun.update({
        branding: brandId,
        state: ['fetching', 'previewed'],
        expiresAt: { '<': now }
      }).set({ state: 'expired' });
    }

    private async transitionRun(
      runId: string,
      from: string,
      to: string,
      patch: Partial<FigshareVocabularySyncRunAttributes> = {},
      connection?: Sails.Connection
    ): Promise<void> {
      if (!isAllowedSyncRunTransition(from, to)) {
        throw new StalePreviewError(`Synchronisation run cannot move from '${from}' to '${to}'`);
      }
      const updated = await this.runQuery(
        FigshareVocabularySyncRun.updateOne({ id: runId, state: from }).set({ ...patch, state: to }) as Sails.WaterlinePromise<unknown>,
        connection
      );
      if (!updated) {
        throw new StalePreviewError(`Synchronisation run is no longer '${from}'`);
      }
    }

    // ── Discovery ─────────────────────────────────────────────────────

    public async discoverTaxonomies(
      input: { scope: FigshareCategoryScope },
      ctx: ActorContext
    ): Promise<FigshareTaxonomySummary[]> {
      const scope = this.assertScope(input?.scope);
      const raw = await this.fetchCatalogue(ctx.brandId, scope);
      return groupTaxonomies(normalizeFigshareCategories(raw));
    }

    // ── Preview ───────────────────────────────────────────────────────

    private async loadSnapshot(
      brandId: string,
      scope: FigshareCategoryScope,
      taxonomyId: string
    ): Promise<SnapshotRowsWithWarnings> {
      const raw = await this.fetchCatalogue(brandId, scope);
      const normalized = normalizeFigshareCategories(raw);
      const filtered = filterByTaxonomy(normalized, taxonomyId);
      if (filtered.rows.length === 0) {
        throw new CatalogueInvalidError(`Figshare returned no categories for taxonomy '${taxonomyId}'`);
      }
      assertSnapshotWithinLimits(filtered.rows);
      return { rows: filtered.rows, warnings: filtered.warnings };
    }

    private async loadExistingCategories(sourceId: string): Promise<ExistingMirrorCategory[]> {
      const categories = await FigshareVocabularyCategory.find({ source: sourceId }) as FigshareVocabularyCategoryAttributes[];
      return categories.map((category) => ({
        sourceId: category.sourceId,
        categoryId: category.categoryId,
        title: '',
        contentHash: category.contentHash,
        historical: category.historical === true
      }));
    }

    private async loadLocalEntries(vocabularyId: string): Promise<LocalEntryCandidate[]> {
      const entries = await VocabularyEntry.find({ vocabulary: vocabularyId }) as VocabularyEntryAttributes[];
      return entries.map((entry) => ({
        id: String(entry.id),
        label: String(entry.label ?? ''),
        labelLower: String(entry.labelLower ?? ''),
        value: String(entry.value ?? ''),
        valueLower: String(entry.valueLower ?? ''),
        identifier: entry.identifier
      }));
    }

    /**
     * A brand may only mirror a given catalogue once, so an import that names no explicit
     * source still has to bind the existing mirror instead of creating a second one.
     */
    private async findSourceForCatalogue(
      brandId: string,
      scope: FigshareCategoryScope,
      taxonomyId: string
    ): Promise<FigshareVocabularySourceAttributes | null> {
      return await FigshareVocabularySource.findOne({
        branding: brandId,
        scope,
        taxonomyId
      }) as FigshareVocabularySourceAttributes | null;
    }

    /**
     * Likewise, a local vocabulary is crosswalked to a mirror at most once; re-running the
     * wizard for an existing pairing resynchronises that crosswalk rather than forking it.
     */
    private async findCrosswalkForPairing(
      brandId: string,
      localVocabularyId: string,
      sourceId: string
    ): Promise<FigshareVocabularyCrosswalkAttributes | null> {
      return await FigshareVocabularyCrosswalk.findOne({
        branding: brandId,
        localVocabulary: localVocabularyId,
        figshareSource: sourceId
      }) as FigshareVocabularyCrosswalkAttributes | null;
    }

    /**
     * Resolve which of the mutually exclusive preview modes was requested.
     *
     * Four shapes are accepted: an explicit crosswalk resync, a mirror-only resync
     * (`sourceId` with no local target), an existing local vocabulary, and a new clone.
     */
    private async resolvePreviewMode(
      input: CreatePreviewInput,
      brandId: string,
      scope: FigshareCategoryScope
    ): Promise<{
      source: FigshareVocabularySourceAttributes | null;
      crosswalk: FigshareVocabularyCrosswalkAttributes | null;
      localVocabulary: VocabularyAttributes | null;
      createLocalClone: boolean;
    }> {
      const createLocalClone = input.createLocalClone === true;
      const crosswalkId = String(input.crosswalkId ?? '').trim();
      const sourceId = String(input.sourceId ?? '').trim();
      const localVocabularyId = String(input.localVocabularyId ?? '').trim();

      if (crosswalkId) {
        if (localVocabularyId || createLocalClone) {
          throw new CatalogueInvalidError('A crosswalk resync cannot also select a local vocabulary or request a clone');
        }
        const crosswalk = await this.requireCrosswalk(crosswalkId, brandId);
        const source = await this.requireSource(String(crosswalk.figshareSource), brandId);
        const localVocabulary = await this.requireLocalVocabulary(String(crosswalk.localVocabulary), brandId);
        return { source, crosswalk, localVocabulary, createLocalClone: false };
      }

      if (localVocabularyId && createLocalClone) {
        throw new CatalogueInvalidError('Select an existing local vocabulary or create a clone, not both');
      }
      if (createLocalClone && String(input.localCloneName ?? '').trim() === '') {
        throw new CatalogueInvalidError('localCloneName is required when creating an editable clone');
      }

      const source = sourceId
        ? await this.requireSource(sourceId, brandId)
        : await this.findSourceForCatalogue(brandId, scope, String(input.taxonomyId ?? '').trim());

      // Refreshing an existing mirror is a complete request on its own; only a brand new
      // mirror needs to be told what it should be crosswalked to.
      if (!localVocabularyId && !createLocalClone && !source) {
        throw new CatalogueInvalidError('Select an existing local vocabulary or request an editable clone');
      }

      const localVocabulary = localVocabularyId ? await this.requireLocalVocabulary(localVocabularyId, brandId) : null;
      const crosswalk = source && localVocabulary
        ? await this.findCrosswalkForPairing(brandId, String(localVocabulary.id), String(source.id))
        : null;
      return { source, crosswalk, localVocabulary, createLocalClone };
    }

    public async createPreview(input: CreatePreviewInput, ctx: ActorContext): Promise<SyncPreview> {
      await this.pruneExpiredRuns(ctx.brandId);

      const scope = this.assertScope(input?.scope);
      const taxonomyId = String(input?.taxonomyId ?? '').trim();
      if (!taxonomyId) {
        throw new CatalogueInvalidError('taxonomyId is required');
      }

      const mode = await this.resolvePreviewMode(input, ctx.brandId, scope);
      if (mode.source && mode.source.scope !== scope) {
        throw new CatalogueInvalidError('The requested scope does not match the existing Figshare source');
      }
      if (mode.source && mode.source.taxonomyId !== taxonomyId) {
        throw new CatalogueInvalidError('The requested taxonomy does not match the existing Figshare source');
      }

      const snapshot = await this.loadSnapshot(ctx.brandId, scope, taxonomyId);
      const remoteHash = hashSnapshot(snapshot.rows);
      const existing = mode.source ? await this.loadExistingCategories(String(mode.source.id)) : [];
      const diff: FigshareDiffResult = classifyChanges(existing, snapshot.rows);
      const historicalSourceIds = new Set(
        diff.rows.filter((row) => row.changeClass === 'removed').map((row) => row.sourceId)
      );

      let proposals: FigshareProposal[] = [];
      let unresolvedLocalEntryIds: string[] = [];
      if (mode.createLocalClone) {
        // Clone entries do not exist yet; propose identity by remote sourceId and let
        // apply bind them to the entry ids created inside the same transaction.
        proposals = snapshot.rows.map((row) => ({
          proposalId: `clone:${row.sourceId}`,
          localEntryId: '',
          localLabel: row.title,
          localValue: row.sourceId,
          targetSourceId: row.sourceId,
          targetCategoryId: row.categoryId,
          targetTitle: row.title,
          matchType: 'identity' as const,
          preselected: true,
          historical: false,
          evidence: { rule: 'clone-identity', normalizerVersion: FIGSHARE_NORMALIZER_VERSION }
        }));
      } else if (mode.localVocabulary) {
        const localEntries = await this.loadLocalEntries(String(mode.localVocabulary.id));
        const result = buildProposals(localEntries, snapshot.rows, { historicalSourceIds });
        proposals = result.proposals;
        unresolvedLocalEntryIds = result.unresolvedLocalEntryIds;
      }

      const summary: SyncPreviewSummary = {
        ...diff.summary,
        proposed: proposals.length,
        preselected: proposals.filter((proposal) => proposal.preselected).length,
        unresolved: unresolvedLocalEntryIds.length,
        historicalWarnings: diff.summary.removed
      };

      const expiresAt = new Date(Date.now() + PREVIEW_TTL_MS).toISOString();
      const run = await FigshareVocabularySyncRun.create({
        branding: ctx.brandId,
        source: mode.source ? String(mode.source.id) : null,
        scope,
        taxonomyId,
        localVocabulary: mode.localVocabulary ? String(mode.localVocabulary.id) : null,
        crosswalk: mode.crosswalk ? String(mode.crosswalk.id) : null,
        createLocalClone: mode.createLocalClone,
        localCloneName: String(input.localCloneName ?? '').trim() || undefined,
        localCloneSlug: String(input.localCloneSlug ?? '').trim() || undefined,
        normalizerVersion: FIGSHARE_NORMALIZER_VERSION,
        state: 'previewed',
        baseHash: mode.source ? String(mode.source.remoteHash ?? '') : '',
        remoteHash,
        normalizedSnapshot: snapshot.rows,
        diff: { rows: diff.rows, summary: diff.summary },
        proposals,
        summary,
        warnings: [...snapshot.warnings, ...unresolvedLocalEntryIds.map((id) => ({ code: 'unresolved-local-entry', localEntryId: id }))],
        expiresAt,
        requestedBy: ctx.userId
      }).fetch() as FigshareVocabularySyncRunAttributes;

      return this.toSyncPreview(run);
    }

    private toSyncPreview(run: FigshareVocabularySyncRunAttributes): SyncPreview {
      return {
        runId: String(run.id),
        state: String(run.state),
        scope: run.scope,
        taxonomyId: run.taxonomyId,
        sourceId: run.source == null ? null : String(run.source),
        localVocabularyId: run.localVocabulary == null ? null : String(run.localVocabulary),
        crosswalkId: run.crosswalk == null ? null : String(run.crosswalk),
        createLocalClone: run.createLocalClone === true,
        baseHash: String(run.baseHash ?? ''),
        remoteHash: String(run.remoteHash ?? ''),
        expiresAt: run.expiresAt,
        normalizerVersion: run.normalizerVersion,
        summary: (run.summary ?? {}) as unknown as SyncPreviewSummary,
        warnings: (run.warnings ?? []) as unknown[]
      };
    }

    public async getPreview(runId: string, query: PreviewPageQuery, ctx: ActorContext): Promise<PagedPreview> {
      const run = await this.requireRun(runId, ctx.brandId);
      if ((run.state === 'previewed' || run.state === 'fetching') && new Date(run.expiresAt).getTime() <= Date.now()) {
        await this.transitionRun(String(run.id), String(run.state), 'expired');
        throw new PreviewExpiredError();
      }

      const view = query?.view === 'diff' ? 'diff' : 'proposals';
      const { limit, offset } = this.parsePaging(query?.limit, query?.offset);
      const search = String(query?.q ?? '').trim().toLowerCase();

      let records: unknown[];
      if (view === 'diff') {
        const diffRows = ((run.diff as { rows?: FigshareDiffRow[] } | undefined)?.rows ?? []);
        records = diffRows.filter((row) => {
          if (query?.changeClass && row.changeClass !== query.changeClass) {
            return false;
          }
          if (search && !`${row.sourceId} ${row.title}`.toLowerCase().includes(search)) {
            return false;
          }
          return true;
        });
      } else {
        const proposals = (run.proposals ?? []) as FigshareProposal[];
        records = proposals.filter((proposal) => {
          if (query?.matchType && proposal.matchType !== query.matchType) {
            return false;
          }
          if (query?.historicalOnly === true && !proposal.historical) {
            return false;
          }
          if (query?.unresolvedOnly === true && proposal.preselected) {
            return false;
          }
          if (search) {
            const haystack = `${proposal.localLabel} ${proposal.localValue} ${proposal.targetSourceId} ${proposal.targetTitle}`.toLowerCase();
            if (!haystack.includes(search)) {
              return false;
            }
          }
          return true;
        });
      }

      const unresolvedIds = ((run.warnings ?? []) as Array<{ code?: string; localEntryId?: string }>)
        .filter((warning) => warning?.code === 'unresolved-local-entry' && warning.localEntryId)
        .map((warning) => String(warning.localEntryId));
      const unresolvedEntries = unresolvedIds.length === 0
        ? []
        : (await VocabularyEntry.find({ id: unresolvedIds }) as VocabularyEntryAttributes[]).map((entry) => ({
          localEntryId: String(entry.id),
          localLabel: String(entry.label ?? ''),
          localValue: String(entry.value ?? '')
        }));

      return {
        ...this.toSyncPreview(run),
        page: {
          view,
          records: records.slice(offset, offset + limit),
          total: records.length,
          limit,
          offset
        },
        unresolved: unresolvedEntries
      };
    }

    // ── Apply ─────────────────────────────────────────────────────────

    private dedupeLabel(title: string, sourceId: string, usedLabels: Set<string>): string {
      // VocabularyEntry enforces a unique label per vocabulary while Figshare freely
      // repeats titles across a taxonomy, so collisions are disambiguated by code.
      const base = title.trim() || sourceId;
      if (!usedLabels.has(base.toLowerCase())) {
        usedLabels.add(base.toLowerCase());
        return base;
      }
      let candidate = `${base} (${sourceId})`;
      let suffix = 2;
      while (usedLabels.has(candidate.toLowerCase())) {
        candidate = `${base} (${sourceId}-${suffix})`;
        suffix += 1;
      }
      usedLabels.add(candidate.toLowerCase());
      return candidate;
    }

    public async applyPreview(runId: string, decisions: ApplyDecisions, ctx: ActorContext): Promise<ApplyResult> {
      const run = await this.requireRun(runId, ctx.brandId);

      if (run.state === 'applied') {
        // A completed run is idempotent: replay the stored result without writing.
        return (run.result ?? {}) as unknown as ApplyResult;
      }
      if (run.state === 'applying') {
        throw new StalePreviewError('This preview is already being applied');
      }
      if (run.state !== 'previewed') {
        throw new StalePreviewError(`This preview is '${run.state}' and can no longer be applied`);
      }
      if (new Date(run.expiresAt).getTime() <= Date.now()) {
        await this.transitionRun(String(run.id), 'previewed', 'expired');
        throw new PreviewExpiredError();
      }
      if (String(decisions?.remoteHash ?? '') !== String(run.remoteHash ?? '')) {
        throw new StalePreviewError('The reviewed remote snapshot no longer matches this preview');
      }

      const existingSource = run.source ? await this.requireSource(String(run.source), ctx.brandId) : null;
      if (existingSource && String(existingSource.remoteHash ?? '') !== String(run.baseHash ?? '')) {
        throw new StalePreviewError('The Figshare mirror changed since this preview was generated');
      }

      const existingCrosswalk = run.crosswalk ? await this.requireCrosswalk(String(run.crosswalk), ctx.brandId) : null;
      if (existingCrosswalk && decisions?.expectedRevision != null
        && Number(decisions.expectedRevision) !== Number(existingCrosswalk.workingRevision)) {
        throw new CrosswalkRevisionError();
      }

      await this.transitionRun(String(run.id), 'previewed', 'applying');

      const createdIds: { vocabularies: string[]; sources: string[]; crosswalks: string[] } = {
        vocabularies: [],
        sources: [],
        crosswalks: []
      };

      try {
        const result = await runWithOptionalTransaction(
          this.getDatastore(),
          async (connection) => this.applyPreviewWork(run, decisions, ctx, existingSource, existingCrosswalk, createdIds, connection),
          {
            logger: sails.log,
            unsupportedAdapterWarning:
              'Transactions are not supported by this datastore adapter. Falling back to compensating cleanup for Figshare vocabulary apply.'
          }
        );
        await this.transitionRun(String(run.id), 'applying', 'applied', {
          appliedBy: ctx.userId,
          appliedAt: result.appliedAt,
          source: result.sourceId,
          crosswalk: result.crosswalkId ?? null,
          localVocabulary: result.localVocabularyId ?? null,
          result: result as unknown as Record<string, unknown>
        });
        return result;
      } catch (error) {
        await this.compensate(createdIds);
        await this.transitionRun(String(run.id), 'applying', 'failed', {
          errorCode: (error as { code?: string })?.code ?? 'apply-failed',
          errorDetail: (error as Error)?.message ?? 'Figshare vocabulary apply failed'
        });
        throw error;
      }
    }

    /** Best-effort cleanup for datastores without transaction support. */
    private async compensate(created: { vocabularies: string[]; sources: string[]; crosswalks: string[] }): Promise<void> {
      try {
        for (const crosswalkId of created.crosswalks) {
          await FigshareVocabularyCrosswalkMapping.destroy({ crosswalk: crosswalkId });
          await FigshareVocabularyCrosswalk.destroyOne({ id: crosswalkId });
        }
        for (const sourceId of created.sources) {
          await FigshareVocabularyCategory.destroy({ source: sourceId });
          await FigshareVocabularySource.destroyOne({ id: sourceId });
        }
        for (const vocabularyId of created.vocabularies) {
          await VocabularyEntry.destroy({ vocabulary: vocabularyId });
          await Vocabulary.destroyOne({ id: vocabularyId });
        }
      } catch (cleanupError) {
        sails.log.error('Figshare vocabulary apply compensation failed', cleanupError);
      }
    }

    private async applyPreviewWork(
      run: FigshareVocabularySyncRunAttributes,
      decisions: ApplyDecisions,
      ctx: ActorContext,
      existingSource: FigshareVocabularySourceAttributes | null,
      existingCrosswalk: FigshareVocabularyCrosswalkAttributes | null,
      createdIds: { vocabularies: string[]; sources: string[]; crosswalks: string[] },
      connection?: Sails.Connection
    ): Promise<ApplyResult> {
      const snapshot = (run.normalizedSnapshot ?? []) as NormalizedFigshareCategory[];
      const appliedAt = this.nowIso();

      // 1. Source + external mirror vocabulary.
      let source = existingSource;
      let mirrorVocabularyId: string;
      if (source) {
        mirrorVocabularyId = String(source.vocabulary);
      } else {
        const mirrorName = `Figshare ${run.scope} taxonomy ${run.taxonomyId}`;
        const mirror = await this.createOne<VocabularyAttributes>(
          Vocabulary.create({
            name: mirrorName,
            description: `Read-only mirror of the Figshare ${run.scope} category catalogue for taxonomy ${run.taxonomyId}`,
            type: 'tree',
            source: 'external',
            sourceId: `${run.scope}:${run.taxonomyId}`,
            figshareSourceKey: `${ctx.brandId}:${run.scope}:${run.taxonomyId}`,
            branding: ctx.brandId
          }) as Sails.WaterlinePromise<VocabularyAttributes>,
          connection
        );
        mirrorVocabularyId = String(mirror.id);
        createdIds.vocabularies.push(mirrorVocabularyId);

        source = await this.createOne<FigshareVocabularySourceAttributes>(
          FigshareVocabularySource.create({
            branding: ctx.brandId,
            vocabulary: mirrorVocabularyId,
            scope: run.scope,
            taxonomyId: run.taxonomyId,
            displayName: mirrorName,
            createdBy: ctx.userId,
            updatedBy: ctx.userId
          }) as Sails.WaterlinePromise<FigshareVocabularySourceAttributes>,
          connection
        );
        createdIds.sources.push(String(source.id));
      }
      const sourceId = String(source.id);

      // 2/3. Upsert category relationships and mirrored entries, then mark omissions historical.
      const mirrorStats = await this.syncMirror(sourceId, mirrorVocabularyId, snapshot, appliedAt, connection);

      // 4. Optional independent local clone.
      let localVocabularyId = run.localVocabulary == null ? null : String(run.localVocabulary);
      let cloneCreated = false;
      let cloneEntryBySourceId = new Map<string, string>();
      if (run.createLocalClone === true && !localVocabularyId) {
        const clone = await this.createCloneVocabulary(
          String(run.localCloneName ?? '').trim(),
          String(run.localCloneSlug ?? '').trim(),
          snapshot,
          ctx,
          connection
        );
        localVocabularyId = clone.vocabularyId;
        cloneEntryBySourceId = clone.entryBySourceId;
        cloneCreated = true;
        createdIds.vocabularies.push(localVocabularyId);
      }

      // 5. Crosswalk and mapping edges.
      let crosswalkId: string | null = existingCrosswalk ? String(existingCrosswalk.id) : null;
      let crosswalkRevision: number | null = existingCrosswalk ? Number(existingCrosswalk.workingRevision) : null;
      let mappingStats = { created: 0, removed: 0 };

      if (localVocabularyId) {
        if (!crosswalkId) {
          // A clone knows its own name up front; an existing local vocabulary has to be
          // read back so the crosswalk is labelled after it rather than a generic stand-in.
          let localLabel = String(run.localCloneName ?? '').trim();
          if (!localLabel) {
            const localVocabulary = await this.runQuery(
              Vocabulary.findOne({ id: localVocabularyId }) as Sails.WaterlinePromise<VocabularyAttributes | null>,
              connection
            );
            localLabel = String(localVocabulary?.name ?? '').trim();
          }
          const crosswalkName = await this.uniqueCrosswalkName(
            `${localLabel || 'Crosswalk'} → Figshare taxonomy ${run.taxonomyId}`,
            ctx.brandId,
            connection
          );
          const crosswalk = await this.createOne<FigshareVocabularyCrosswalkAttributes>(
            FigshareVocabularyCrosswalk.create({
              branding: ctx.brandId,
              name: crosswalkName,
              localVocabulary: localVocabularyId,
              figshareSource: sourceId,
              status: 'draft',
              workingRevision: 1,
              updatedBy: ctx.userId
            }) as Sails.WaterlinePromise<FigshareVocabularyCrosswalkAttributes>,
            connection
          );
          crosswalkId = String(crosswalk.id);
          crosswalkRevision = 1;
          createdIds.crosswalks.push(crosswalkId);
        }

        mappingStats = await this.writeMappingEdges(
          crosswalkId,
          crosswalkRevision ?? 1,
          run,
          decisions,
          sourceId,
          localVocabularyId,
          cloneEntryBySourceId,
          ctx,
          connection
        );
      }

      // 6. Source cursor.
      await this.runQuery(
        FigshareVocabularySource.updateOne({ id: sourceId }).set({
          remoteHash: String(run.remoteHash ?? ''),
          lastSyncedAt: appliedAt,
          lastSyncRun: String(run.id),
          updatedBy: ctx.userId
        }) as Sails.WaterlinePromise<unknown>,
        connection
      );

      return {
        runId: String(run.id),
        state: 'applied',
        sourceId,
        vocabularyId: mirrorVocabularyId,
        localVocabularyId,
        crosswalkId,
        crosswalkRevision,
        categories: mirrorStats,
        mappings: mappingStats,
        cloneCreated,
        appliedAt
      };
    }

    private async syncMirror(
      sourceId: string,
      mirrorVocabularyId: string,
      snapshot: readonly NormalizedFigshareCategory[],
      appliedAt: string,
      connection?: Sails.Connection
    ): Promise<{ created: number; updated: number; historical: number; reappeared: number }> {
      const existingCategories = await this.runQuery(
        FigshareVocabularyCategory.find({ source: sourceId }) as unknown as Sails.WaterlinePromise<FigshareVocabularyCategoryAttributes[]>,
        connection
      );
      const existingBySourceId = new Map(existingCategories.map((category) => [category.sourceId, category]));

      const existingEntries = await this.runQuery(
        VocabularyEntry.find({ vocabulary: mirrorVocabularyId }) as unknown as Sails.WaterlinePromise<VocabularyEntryAttributes[]>,
        connection
      );
      const usedLabels = new Set(existingEntries.map((entry) => String(entry.labelLower ?? '')));
      const entryIdByCategoryId = new Map(existingCategories.map((category) => [category.sourceId, String(category.entry)]));

      const stats = { created: 0, updated: 0, historical: 0, reappeared: 0 };
      const entryIdBySourceId = new Map<string, string>();

      for (const row of snapshot) {
        const existing = existingBySourceId.get(row.sourceId);
        if (!existing) {
          const label = this.dedupeLabel(row.title, row.sourceId, usedLabels);
          const entry = await this.createOne<VocabularyEntryAttributes>(
            VocabularyEntry.create({
              vocabulary: mirrorVocabularyId,
              label,
              value: row.sourceId,
              identifier: row.sourceId,
              order: 0,
              historical: false
            }) as Sails.WaterlinePromise<VocabularyEntryAttributes>,
            connection
          );
          entryIdBySourceId.set(row.sourceId, String(entry.id));
          await this.createOne<FigshareVocabularyCategoryAttributes>(
            FigshareVocabularyCategory.create({
              source: sourceId,
              entry: String(entry.id),
              sourceId: row.sourceId,
              categoryId: row.categoryId,
              taxonomyId: row.taxonomyId,
              parentSourceId: row.parentSourceId ?? undefined,
              path: row.path,
              selectable: row.selectable,
              historical: false,
              firstSeenAt: appliedAt,
              lastSeenAt: appliedAt,
              contentHash: row.contentHash
            }) as Sails.WaterlinePromise<FigshareVocabularyCategoryAttributes>,
            connection
          );
          stats.created += 1;
          continue;
        }

        const entryId = String(existing.entry);
        entryIdBySourceId.set(row.sourceId, entryId);
        const wasHistorical = existing.historical === true;
        if (wasHistorical) {
          stats.reappeared += 1;
        } else if (existing.contentHash !== row.contentHash) {
          stats.updated += 1;
        }

        if (wasHistorical || existing.contentHash !== row.contentHash) {
          await this.runQuery(
            VocabularyEntry.updateOne({ id: entryId }).set({
              label: this.relabelExisting(row, existingEntries, entryId, usedLabels),
              historical: false
            }) as Sails.WaterlinePromise<unknown>,
            connection
          );
        }
        await this.runQuery(
          FigshareVocabularyCategory.updateOne({ id: String(existing.id) }).set({
            categoryId: row.categoryId,
            taxonomyId: row.taxonomyId,
            parentSourceId: row.parentSourceId ?? undefined,
            path: row.path,
            selectable: row.selectable,
            historical: false,
            lastSeenAt: appliedAt,
            contentHash: row.contentHash
          }) as Sails.WaterlinePromise<unknown>,
          connection
        );
      }

      // Remote omission never hard-deletes: retain identity and audit evidence.
      const remoteSourceIds = new Set(snapshot.map((row) => row.sourceId));
      for (const existing of existingCategories) {
        if (remoteSourceIds.has(existing.sourceId) || existing.historical === true) {
          continue;
        }
        await this.runQuery(
          FigshareVocabularyCategory.updateOne({ id: String(existing.id) }).set({ historical: true }) as Sails.WaterlinePromise<unknown>,
          connection
        );
        await this.runQuery(
          VocabularyEntry.updateOne({ id: String(existing.entry) }).set({ historical: true }) as Sails.WaterlinePromise<unknown>,
          connection
        );
        stats.historical += 1;
      }

      // Parents are rebuilt after every entry exists so ordering never matters.
      for (const row of snapshot) {
        const entryId = entryIdBySourceId.get(row.sourceId) ?? entryIdByCategoryId.get(row.sourceId);
        if (!entryId) {
          continue;
        }
        const parentEntryId = row.parentSourceId == null
          ? null
          : entryIdBySourceId.get(row.parentSourceId) ?? entryIdByCategoryId.get(row.parentSourceId) ?? null;
        await this.runQuery(
          VocabularyEntry.updateOne({ id: entryId }).set({ parent: parentEntryId }) as Sails.WaterlinePromise<unknown>,
          connection
        );
      }

      return stats;
    }

    private relabelExisting(
      row: NormalizedFigshareCategory,
      existingEntries: readonly VocabularyEntryAttributes[],
      entryId: string,
      usedLabels: Set<string>
    ): string {
      const current = existingEntries.find((entry) => String(entry.id) === entryId);
      const currentLabelLower = String(current?.labelLower ?? '');
      if (currentLabelLower === row.title.toLowerCase()) {
        return row.title;
      }
      usedLabels.delete(currentLabelLower);
      return this.dedupeLabel(row.title, row.sourceId, usedLabels);
    }

    private async createCloneVocabulary(
      name: string,
      slug: string,
      snapshot: readonly NormalizedFigshareCategory[],
      ctx: ActorContext,
      connection?: Sails.Connection
    ): Promise<{ vocabularyId: string; entryBySourceId: Map<string, string> }> {
      if (!name) {
        throw new CatalogueInvalidError('A clone name is required to create an editable local vocabulary');
      }
      const clone = await this.createOne<VocabularyAttributes>(
        Vocabulary.create({
          name,
          ...(slug ? { slug } : {}),
          description: 'Editable local copy of a Figshare category catalogue',
          type: 'tree',
          source: 'local',
          branding: ctx.brandId
        }) as Sails.WaterlinePromise<VocabularyAttributes>,
        connection
      );
      const vocabularyId = String(clone.id);

      const usedLabels = new Set<string>();
      const entryBySourceId = new Map<string, string>();
      for (const row of snapshot) {
        const entry = await this.createOne<VocabularyEntryAttributes>(
          VocabularyEntry.create({
            vocabulary: vocabularyId,
            label: this.dedupeLabel(row.title, row.sourceId, usedLabels),
            value: row.sourceId,
            identifier: row.sourceId,
            order: 0,
            historical: false
          }) as Sails.WaterlinePromise<VocabularyEntryAttributes>,
          connection
        );
        entryBySourceId.set(row.sourceId, String(entry.id));
      }

      // Parent references are rebuilt against clone entry ids once all entries exist.
      for (const row of snapshot) {
        const entryId = entryBySourceId.get(row.sourceId);
        const parentId = row.parentSourceId == null ? null : entryBySourceId.get(row.parentSourceId) ?? null;
        if (!entryId || parentId == null) {
          continue;
        }
        await this.runQuery(
          VocabularyEntry.updateOne({ id: entryId }).set({ parent: parentId }) as Sails.WaterlinePromise<unknown>,
          connection
        );
      }

      return { vocabularyId, entryBySourceId };
    }

    private async uniqueCrosswalkName(base: string, brandId: string, connection?: Sails.Connection): Promise<string> {
      let candidate = base;
      let suffix = 2;
      // The unique { branding, name } index makes collisions a hard failure, so probe first.
      while (await this.runQuery(
        FigshareVocabularyCrosswalk.findOne({ branding: brandId, name: candidate }) as Sails.WaterlinePromise<unknown>,
        connection
      )) {
        candidate = `${base} (${suffix})`;
        suffix += 1;
      }
      return candidate;
    }

    private async writeMappingEdges(
      crosswalkId: string,
      revision: number,
      run: FigshareVocabularySyncRunAttributes,
      decisions: ApplyDecisions,
      sourceId: string,
      localVocabularyId: string,
      cloneEntryBySourceId: Map<string, string>,
      ctx: ActorContext,
      connection?: Sails.Connection
    ): Promise<{ created: number; removed: number }> {
      const categories = await this.runQuery(
        FigshareVocabularyCategory.find({ source: sourceId }) as unknown as Sails.WaterlinePromise<FigshareVocabularyCategoryAttributes[]>,
        connection
      );
      const categoryBySourceId = new Map(categories.map((category) => [category.sourceId, category]));

      const approvedProposalIds = new Set((decisions?.approvedProposalIds ?? []).map((id) => String(id)));
      const proposals = (run.proposals ?? []) as FigshareProposal[];
      const desiredEdges = new Map<string, { localEntryId: string; categoryId: string; matchType: string }>();

      const addEdge = (localEntryId: string, categorySourceId: string, matchType: string): void => {
        const category = categoryBySourceId.get(categorySourceId);
        if (!localEntryId || !category) {
          return;
        }
        desiredEdges.set(`${localEntryId}::${String(category.id)}`, {
          localEntryId,
          categoryId: String(category.id),
          matchType
        });
      };

      for (const proposal of proposals) {
        if (!approvedProposalIds.has(proposal.proposalId)) {
          continue;
        }
        const localEntryId = proposal.localEntryId
          || cloneEntryBySourceId.get(proposal.targetSourceId)
          || '';
        addEdge(localEntryId, proposal.targetSourceId, proposal.matchType);
      }

      const manualMappings = decisions?.manualMappings ?? [];
      if (manualMappings.length > MAX_MAPPING_BATCH) {
        throw new CatalogueInvalidError(`manualMappings exceeds the maximum batch size of ${MAX_MAPPING_BATCH}`);
      }
      for (const mapping of manualMappings) {
        const localEntryId = String(mapping.localEntryId ?? '').trim()
          || cloneEntryBySourceId.get(String(mapping.localEntryKey ?? '').trim())
          || '';
        for (const targetSourceId of mapping.figshareSourceIds ?? []) {
          addEdge(localEntryId, String(targetSourceId).trim(), 'manual');
        }
      }

      if (desiredEdges.size > 0) {
        const localEntryIds = Array.from(new Set(Array.from(desiredEdges.values()).map((edge) => edge.localEntryId)));
        const localEntries = await this.runQuery(
          VocabularyEntry.find({ id: localEntryIds, vocabulary: localVocabularyId }) as unknown as Sails.WaterlinePromise<VocabularyEntryAttributes[]>,
          connection
        );
        const validLocalEntryIds = new Set(localEntries.map((entry) => String(entry.id)));
        for (const edge of desiredEdges.values()) {
          if (!validLocalEntryIds.has(edge.localEntryId)) {
            throw new RelationshipBoundaryError('A mapping references a local entry outside the crosswalk local vocabulary');
          }
        }
      }

      const existingEdges = await this.runQuery(
        FigshareVocabularyCrosswalkMapping.find({ crosswalk: crosswalkId, revision }) as unknown as Sails.WaterlinePromise<FigshareVocabularyCrosswalkMappingAttributes[]>,
        connection
      );
      const existingKeys = new Set(existingEdges.map((edge) => `${String(edge.localEntry)}::${String(edge.figshareCategory)}`));

      let created = 0;
      for (const [key, edge] of desiredEdges) {
        if (existingKeys.has(key)) {
          continue;
        }
        await this.createOne<FigshareVocabularyCrosswalkMappingAttributes>(
          FigshareVocabularyCrosswalkMapping.create({
            crosswalk: crosswalkId,
            revision,
            localEntry: edge.localEntryId,
            figshareCategory: edge.categoryId,
            status: 'proposed',
            matchType: edge.matchType
          }) as Sails.WaterlinePromise<FigshareVocabularyCrosswalkMappingAttributes>,
          connection
        );
        created += 1;
      }

      await this.runQuery(
        FigshareVocabularyCrosswalk.updateOne({ id: crosswalkId }).set({ updatedBy: ctx.userId }) as Sails.WaterlinePromise<unknown>,
        connection
      );

      return { created, removed: 0 };
    }

    // ── Sources ───────────────────────────────────────────────────────

    public async listSources(
      query: { q?: string; scope?: string; limit?: number; offset?: number },
      ctx: ActorContext
    ): Promise<{ data: unknown[]; meta: { total: number; limit: number; offset: number } }> {
      const { limit, offset } = this.parsePaging(query?.limit, query?.offset, 25);
      const where: Record<string, unknown> = { branding: ctx.brandId };
      if (query?.scope === 'public' || query?.scope === 'account') {
        where.scope = query.scope;
      }
      const search = String(query?.q ?? '').trim();
      if (search) {
        where.displayName = { contains: search };
      }
      const total = await FigshareVocabularySource.count(where);
      const sources = await FigshareVocabularySource.find(where)
        .sort('displayName ASC')
        .skip(offset)
        .limit(limit) as FigshareVocabularySourceAttributes[];
      const data = await Promise.all(sources.map((source) => this.describeSource(source)));
      return { data, meta: { total, limit, offset } };
    }

    public async getSource(sourceId: string, ctx: ActorContext): Promise<unknown> {
      return this.describeSource(await this.requireSource(sourceId, ctx.brandId));
    }

    /**
     * Search the mirrored categories of one source so an operator can pick a manual
     * crosswalk target. Historical targets stay hidden unless explicitly requested:
     * mapping to a retired Figshare category is a deliberate act, not a default.
     */
    public async listSourceCategories(
      sourceId: string,
      query: { q?: string; includeHistorical?: boolean; selectableOnly?: boolean; limit?: number; offset?: number },
      ctx: ActorContext
    ): Promise<{ data: SourceCategoryOption[]; meta: { total: number; limit: number; offset: number } }> {
      const source = await this.requireSource(sourceId, ctx.brandId);
      const { limit, offset } = this.parsePaging(query?.limit, query?.offset, 25);

      const where: Record<string, unknown> = { source: String(source.id) };
      if (query?.includeHistorical !== true) {
        where.historical = false;
      }
      if (query?.selectableOnly === true) {
        where.selectable = true;
      }
      const categories = await FigshareVocabularyCategory.find(where) as FigshareVocabularyCategoryAttributes[];
      const titleByEntryId = await this.loadCategoryTitles(categories);

      const search = String(query?.q ?? '').trim().toLowerCase();
      const rows = categories
        .map((category) => ({
          id: String(category.id),
          sourceId: String(category.sourceId),
          categoryId: Number(category.categoryId),
          title: titleByEntryId.get(String(category.entry)) ?? String(category.sourceId),
          parentSourceId: category.parentSourceId,
          selectable: category.selectable !== false,
          historical: category.historical === true
        }))
        .filter((row) => !search
          || `${row.title} ${row.sourceId} ${row.categoryId}`.toLowerCase().includes(search))
        .sort((left, right) => left.sourceId.localeCompare(right.sourceId, undefined, { numeric: true }));

      return {
        data: rows.slice(offset, offset + limit),
        meta: { total: rows.length, limit, offset }
      };
    }

    /** Mirrored category titles live on the linked vocabulary entry, not the category row. */
    private async loadCategoryTitles(
      categories: FigshareVocabularyCategoryAttributes[]
    ): Promise<Map<string, string>> {
      if (categories.length === 0) {
        return new Map();
      }
      const entryIds = Array.from(new Set(categories.map((category) => String(category.entry))));
      const entries = await VocabularyEntry.find({ id: entryIds }) as VocabularyEntryAttributes[];
      return new Map(entries.map((entry) => [String(entry.id), String(entry.label ?? '')]));
    }

    private async describeSource(source: FigshareVocabularySourceAttributes): Promise<Record<string, unknown>> {
      const sourceId = String(source.id);
      const [mirroredCount, historicalCount, crosswalkCount] = await Promise.all([
        FigshareVocabularyCategory.count({ source: sourceId, historical: false }),
        FigshareVocabularyCategory.count({ source: sourceId, historical: true }),
        FigshareVocabularyCrosswalk.count({ figshareSource: sourceId })
      ]);
      const vocabulary = await Vocabulary.findOne({ id: String(source.vocabulary) }) as VocabularyAttributes | null;
      return {
        id: sourceId,
        displayName: source.displayName,
        scope: source.scope,
        taxonomyId: source.taxonomyId,
        vocabularyId: String(source.vocabulary),
        vocabularyName: vocabulary?.name ?? '',
        lastSyncedAt: source.lastSyncedAt ?? null,
        archived: source.archived === true,
        mirroredCount,
        historicalCount,
        crosswalkCount
      };
    }

    public async listSyncRuns(
      query: { sourceId?: string; limit?: number; offset?: number },
      ctx: ActorContext
    ): Promise<{ data: unknown[]; meta: { total: number; limit: number; offset: number } }> {
      const { limit, offset } = this.parsePaging(query?.limit, query?.offset, 25);
      const where: Record<string, unknown> = { branding: ctx.brandId };
      const sourceId = String(query?.sourceId ?? '').trim();
      if (sourceId) {
        where.source = sourceId;
      }
      const total = await FigshareVocabularySyncRun.count(where);
      const runs = await FigshareVocabularySyncRun.find(where)
        .sort('createdAt DESC')
        .skip(offset)
        .limit(limit) as FigshareVocabularySyncRunAttributes[];
      return {
        data: runs.map((run) => ({
          id: String(run.id),
          state: run.state,
          scope: run.scope,
          taxonomyId: run.taxonomyId,
          sourceId: run.source == null ? null : String(run.source),
          summary: run.summary ?? {},
          requestedBy: run.requestedBy,
          appliedBy: run.appliedBy ?? null,
          appliedAt: run.appliedAt ?? null,
          expiresAt: run.expiresAt,
          errorCode: run.errorCode ?? null
        })),
        meta: { total, limit, offset }
      };
    }

    /**
     * Create an independent editable local vocabulary from an existing mirror plus a
     * draft identity crosswalk. Later mirror synchronisation never edits clone terms.
     */
    public async cloneMirror(
      sourceId: string,
      cloneInput: { name: string; slug?: string },
      ctx: ActorContext
    ): Promise<{ localVocabularyId: string; crosswalkId: string; entries: number }> {
      const source = await this.requireSource(sourceId, ctx.brandId);
      const categories = await FigshareVocabularyCategory.find({
        source: String(source.id),
        historical: false
      }) as FigshareVocabularyCategoryAttributes[];
      if (categories.length === 0) {
        throw new CatalogueInvalidError('The Figshare mirror has no current categories to clone');
      }
      const snapshot: NormalizedFigshareCategory[] = categories.map((category) => ({
        sourceId: category.sourceId,
        categoryId: category.categoryId,
        taxonomyId: category.taxonomyId,
        title: '',
        parentSourceId: category.parentSourceId ?? null,
        path: category.path ?? [category.sourceId],
        selectable: category.selectable !== false,
        hasChildren: false,
        contentHash: category.contentHash
      }));
      const entries = await VocabularyEntry.find({
        id: categories.map((category) => String(category.entry))
      }) as VocabularyEntryAttributes[];
      const labelByEntryId = new Map(entries.map((entry) => [String(entry.id), String(entry.label ?? '')]));
      for (const [index, category] of categories.entries()) {
        snapshot[index].title = labelByEntryId.get(String(category.entry)) ?? category.sourceId;
      }

      const createdIds: { vocabularies: string[]; sources: string[]; crosswalks: string[] } = {
        vocabularies: [],
        sources: [],
        crosswalks: []
      };

      try {
        return await runWithOptionalTransaction(
          this.getDatastore(),
          async (connection) => {
            const clone = await this.createCloneVocabulary(
              String(cloneInput?.name ?? '').trim(),
              String(cloneInput?.slug ?? '').trim(),
              snapshot,
              ctx,
              connection
            );
            createdIds.vocabularies.push(clone.vocabularyId);

            const crosswalkName = await this.uniqueCrosswalkName(
              `${String(cloneInput.name).trim()} → ${source.displayName}`,
              ctx.brandId,
              connection
            );
            const crosswalk = await this.createOne<FigshareVocabularyCrosswalkAttributes>(
              FigshareVocabularyCrosswalk.create({
                branding: ctx.brandId,
                name: crosswalkName,
                localVocabulary: clone.vocabularyId,
                figshareSource: String(source.id),
                status: 'draft',
                workingRevision: 1,
                updatedBy: ctx.userId
              }) as Sails.WaterlinePromise<FigshareVocabularyCrosswalkAttributes>,
              connection
            );
            createdIds.crosswalks.push(String(crosswalk.id));

            const cloneEntries = Array.from(clone.entryBySourceId.entries()).map(([entrySourceId, entryId]) => ({
              id: entryId,
              label: '',
              labelLower: '',
              value: entrySourceId,
              valueLower: entrySourceId.toLowerCase(),
              sourceId: entrySourceId
            }));
            const identity = buildIdentityProposals(cloneEntries, snapshot);
            const categoryBySourceId = new Map(categories.map((category) => [category.sourceId, category]));
            for (const proposal of identity.proposals) {
              const category = categoryBySourceId.get(proposal.targetSourceId);
              if (!category) {
                continue;
              }
              await this.createOne(
                FigshareVocabularyCrosswalkMapping.create({
                  crosswalk: String(crosswalk.id),
                  revision: 1,
                  localEntry: proposal.localEntryId,
                  figshareCategory: String(category.id),
                  status: 'proposed',
                  matchType: 'identity'
                }) as Sails.WaterlinePromise<unknown>,
                connection
              );
            }

            return {
              localVocabularyId: clone.vocabularyId,
              crosswalkId: String(crosswalk.id),
              entries: clone.entryBySourceId.size
            };
          },
          {
            logger: sails.log,
            unsupportedAdapterWarning:
              'Transactions are not supported by this datastore adapter. Falling back to compensating cleanup for Figshare clone.'
          }
        );
      } catch (error) {
        await this.compensate(createdIds);
        throw error;
      }
    }

    // ── Crosswalks ────────────────────────────────────────────────────

    public async listCrosswalks(
      query: { q?: string; status?: string; localVocabularyId?: string; sourceId?: string; limit?: number; offset?: number },
      ctx: ActorContext
    ): Promise<{ data: CrosswalkSummary[]; meta: { total: number; limit: number; offset: number } }> {
      const { limit, offset } = this.parsePaging(query?.limit, query?.offset, 25);
      const where: Record<string, unknown> = { branding: ctx.brandId };
      if (query?.status) {
        where.status = String(query.status);
      }
      if (query?.localVocabularyId) {
        where.localVocabulary = String(query.localVocabularyId);
      }
      if (query?.sourceId) {
        where.figshareSource = String(query.sourceId);
      }
      const search = String(query?.q ?? '').trim();
      if (search) {
        where.name = { contains: search };
      }
      const total = await FigshareVocabularyCrosswalk.count(where);
      const crosswalks = await FigshareVocabularyCrosswalk.find(where)
        .sort('name ASC')
        .skip(offset)
        .limit(limit) as FigshareVocabularyCrosswalkAttributes[];
      const data = await Promise.all(crosswalks.map((crosswalk) => this.describeCrosswalk(crosswalk)));
      return { data, meta: { total, limit, offset } };
    }

    public async getCrosswalk(crosswalkId: string, ctx: ActorContext): Promise<CrosswalkSummary> {
      return this.describeCrosswalk(await this.requireCrosswalk(crosswalkId, ctx.brandId));
    }

    private async describeCrosswalk(crosswalk: FigshareVocabularyCrosswalkAttributes): Promise<CrosswalkSummary> {
      const crosswalkId = String(crosswalk.id);
      const [localVocabulary, source] = await Promise.all([
        Vocabulary.findOne({ id: String(crosswalk.localVocabulary) }) as Promise<VocabularyAttributes | null>,
        FigshareVocabularySource.findOne({ id: String(crosswalk.figshareSource) }) as Promise<FigshareVocabularySourceAttributes | null>
      ]);
      const [approvedMappingCount, workingMappingCount] = await Promise.all([
        crosswalk.approvedRevision == null
          ? Promise.resolve(0)
          : FigshareVocabularyCrosswalkMapping.count({
            crosswalk: crosswalkId,
            revision: Number(crosswalk.approvedRevision),
            status: 'approved'
          }),
        FigshareVocabularyCrosswalkMapping.count({ crosswalk: crosswalkId, revision: Number(crosswalk.workingRevision) })
      ]);

      const historicalTargetCount = await this.countHistoricalTargets(crosswalkId, crosswalk);

      return {
        id: crosswalkId,
        name: crosswalk.name,
        status: String(crosswalk.status),
        workingRevision: Number(crosswalk.workingRevision),
        approvedRevision: crosswalk.approvedRevision ?? null,
        approvedAt: crosswalk.approvedAt,
        approvedBy: crosswalk.approvedBy,
        localVocabularyId: String(crosswalk.localVocabulary),
        localVocabularyName: localVocabulary?.name ?? '',
        figshareSourceId: String(crosswalk.figshareSource),
        figshareSourceName: source?.displayName ?? '',
        scope: String(source?.scope ?? ''),
        taxonomyId: String(source?.taxonomyId ?? ''),
        approvedMappingCount,
        workingMappingCount,
        historicalTargetCount
      };
    }

    private async countHistoricalTargets(
      crosswalkId: string,
      crosswalk: FigshareVocabularyCrosswalkAttributes
    ): Promise<number> {
      const revision = Number(crosswalk.approvedRevision ?? crosswalk.workingRevision);
      const mappings = await FigshareVocabularyCrosswalkMapping.find({
        crosswalk: crosswalkId,
        revision
      }) as FigshareVocabularyCrosswalkMappingAttributes[];
      if (mappings.length === 0) {
        return 0;
      }
      const categoryIds = Array.from(new Set(mappings.map((mapping) => String(mapping.figshareCategory))));
      return FigshareVocabularyCategory.count({ id: categoryIds, historical: true });
    }

    public async createCrosswalk(
      input: { name: string; localVocabularyId: string; sourceId: string },
      ctx: ActorContext
    ): Promise<CrosswalkSummary> {
      const name = String(input?.name ?? '').trim();
      if (!name) {
        throw new CatalogueInvalidError('name is required');
      }
      const localVocabulary = await this.requireLocalVocabulary(String(input?.localVocabularyId ?? ''), ctx.brandId);
      const source = await this.requireSource(String(input?.sourceId ?? ''), ctx.brandId);
      const existing = await FigshareVocabularyCrosswalk.findOne({ branding: ctx.brandId, name });
      if (existing) {
        throw new RelationshipBoundaryError(`A crosswalk named '${name}' already exists for this brand`);
      }
      const crosswalk = await FigshareVocabularyCrosswalk.create({
        branding: ctx.brandId,
        name,
        localVocabulary: String(localVocabulary.id),
        figshareSource: String(source.id),
        status: 'draft',
        workingRevision: 1,
        updatedBy: ctx.userId
      }).fetch() as FigshareVocabularyCrosswalkAttributes;
      return this.describeCrosswalk(crosswalk);
    }

    /**
     * Search the local vocabulary behind a crosswalk, annotated with how many targets
     * each term already has. Terms with no target never appear in the mapping table,
     * so this is the only way the manual picker can reach them.
     */
    public async listCrosswalkLocalEntries(
      crosswalkId: string,
      query: { q?: string; mapped?: string; revision?: number; limit?: number; offset?: number },
      ctx: ActorContext
    ): Promise<{ data: CrosswalkLocalEntryOption[]; meta: { total: number; limit: number; offset: number; revision: number } }> {
      const crosswalk = await this.requireCrosswalk(crosswalkId, ctx.brandId);
      const { limit, offset } = this.parsePaging(query?.limit, query?.offset, 25);
      const revision = Number(query?.revision ?? crosswalk.workingRevision);

      const [entries, mappings] = await Promise.all([
        VocabularyEntry.find({ vocabulary: String(crosswalk.localVocabulary) }) as Promise<VocabularyEntryAttributes[]>,
        FigshareVocabularyCrosswalkMapping.find({
          crosswalk: String(crosswalk.id),
          revision
        }) as Promise<FigshareVocabularyCrosswalkMappingAttributes[]>
      ]);

      const targetCountByEntryId = new Map<string, number>();
      for (const mapping of mappings) {
        const key = String(mapping.localEntry);
        targetCountByEntryId.set(key, (targetCountByEntryId.get(key) ?? 0) + 1);
      }

      const search = String(query?.q ?? '').trim().toLowerCase();
      const mappedFilter = String(query?.mapped ?? '').trim().toLowerCase();
      const rows = entries
        .map((entry) => ({
          id: String(entry.id),
          label: String(entry.label ?? ''),
          value: String(entry.value ?? ''),
          identifier: entry.identifier,
          historical: entry.historical === true,
          targetCount: targetCountByEntryId.get(String(entry.id)) ?? 0
        }))
        .filter((row) => !search || `${row.label} ${row.value}`.toLowerCase().includes(search))
        .filter((row) => {
          if (mappedFilter === 'unmapped') {
            return row.targetCount === 0;
          }
          if (mappedFilter === 'mapped') {
            return row.targetCount > 0;
          }
          return true;
        })
        .sort((left, right) => left.label.localeCompare(right.label));

      return {
        data: rows.slice(offset, offset + limit),
        meta: { total: rows.length, limit, offset, revision }
      };
    }

    public async listCrosswalkMappings(
      crosswalkId: string,
      query: { status?: string; q?: string; revision?: number; limit?: number; offset?: number },
      ctx: ActorContext
    ): Promise<{ data: unknown[]; meta: { total: number; limit: number; offset: number; revision: number } }> {
      const crosswalk = await this.requireCrosswalk(crosswalkId, ctx.brandId);
      const { limit, offset } = this.parsePaging(query?.limit, query?.offset);
      const revision = Number(query?.revision ?? crosswalk.workingRevision);

      const where: Record<string, unknown> = { crosswalk: String(crosswalk.id), revision };
      if (query?.status) {
        where.status = String(query.status);
      }
      const mappings = await FigshareVocabularyCrosswalkMapping.find(where) as FigshareVocabularyCrosswalkMappingAttributes[];

      const [entries, categories] = await Promise.all([
        mappings.length === 0
          ? Promise.resolve([] as VocabularyEntryAttributes[])
          : VocabularyEntry.find({ id: Array.from(new Set(mappings.map((mapping) => String(mapping.localEntry)))) }) as Promise<VocabularyEntryAttributes[]>,
        mappings.length === 0
          ? Promise.resolve([] as FigshareVocabularyCategoryAttributes[])
          : FigshareVocabularyCategory.find({ id: Array.from(new Set(mappings.map((mapping) => String(mapping.figshareCategory)))) }) as Promise<FigshareVocabularyCategoryAttributes[]>
      ]);
      const entryById = new Map(entries.map((entry) => [String(entry.id), entry]));
      const categoryById = new Map(categories.map((category) => [String(category.id), category]));

      const search = String(query?.q ?? '').trim().toLowerCase();
      const rows = mappings
        .map((mapping) => {
          const entry = entryById.get(String(mapping.localEntry));
          const category = categoryById.get(String(mapping.figshareCategory));
          return {
            id: String(mapping.id),
            revision: mapping.revision,
            status: mapping.status,
            matchType: mapping.matchType,
            localEntryId: String(mapping.localEntry),
            localLabel: String(entry?.label ?? ''),
            localValue: String(entry?.value ?? ''),
            figshareCategoryId: String(mapping.figshareCategory),
            figshareSourceId: String(category?.sourceId ?? ''),
            figshareCategoryNumber: category?.categoryId ?? null,
            historical: category?.historical === true,
            approvedAt: mapping.approvedAt ?? null,
            approvedBy: mapping.approvedBy ?? null
          };
        })
        .filter((row) => !search || `${row.localLabel} ${row.localValue} ${row.figshareSourceId}`.toLowerCase().includes(search))
        .sort((left, right) => left.localLabel.localeCompare(right.localLabel));

      return {
        data: rows.slice(offset, offset + limit),
        meta: { total: rows.length, limit, offset, revision }
      };
    }

    /**
     * Batch upsert/delete mapping edges under optimistic revision control. The first
     * edit of an approved crosswalk copies the approved rows into a new working
     * revision so publishing continues against the previous approved snapshot.
     */
    public async saveMappings(
      crosswalkId: string,
      input: { revision: number; changes: CrosswalkMappingChange[] },
      ctx: ActorContext
    ): Promise<CrosswalkSummary> {
      const crosswalk = await this.requireCrosswalk(crosswalkId, ctx.brandId);
      const changes = input?.changes ?? [];
      if (changes.length > MAX_MAPPING_BATCH) {
        throw new CatalogueInvalidError(`changes exceeds the maximum batch size of ${MAX_MAPPING_BATCH}`);
      }
      if (Number(input?.revision) !== Number(crosswalk.workingRevision)) {
        throw new CrosswalkRevisionError();
      }

      return runWithOptionalTransaction(
        this.getDatastore(),
        async (connection) => {
          let workingRevision = Number(crosswalk.workingRevision);
          if (crosswalk.approvedRevision != null && Number(crosswalk.approvedRevision) === workingRevision) {
            workingRevision += 1;
            const approvedRows = await this.runQuery(
              FigshareVocabularyCrosswalkMapping.find({
                crosswalk: String(crosswalk.id),
                revision: Number(crosswalk.approvedRevision)
              }) as unknown as Sails.WaterlinePromise<FigshareVocabularyCrosswalkMappingAttributes[]>,
              connection
            );
            for (const row of approvedRows) {
              await this.createOne(
                FigshareVocabularyCrosswalkMapping.create({
                  crosswalk: String(crosswalk.id),
                  revision: workingRevision,
                  localEntry: String(row.localEntry),
                  figshareCategory: String(row.figshareCategory),
                  status: row.status,
                  matchType: row.matchType,
                  evidence: row.evidence,
                  approvedAt: row.approvedAt,
                  approvedBy: row.approvedBy
                }) as Sails.WaterlinePromise<unknown>,
                connection
              );
            }
            await this.runQuery(
              FigshareVocabularyCrosswalk.updateOne({ id: String(crosswalk.id) }).set({ workingRevision }) as Sails.WaterlinePromise<unknown>,
              connection
            );
          }

          for (const change of changes) {
            const localEntryId = String(change?.localEntryId ?? '').trim();
            const figshareCategoryId = String(change?.figshareCategoryId ?? '').trim();
            if (!localEntryId || !figshareCategoryId) {
              throw new CatalogueInvalidError('Each change requires localEntryId and figshareCategoryId');
            }
            await this.assertMappingOwnership(crosswalk, localEntryId, figshareCategoryId, connection);

            if (change.op === 'remove') {
              await this.runQuery(
                FigshareVocabularyCrosswalkMapping.destroy({
                  crosswalk: String(crosswalk.id),
                  revision: workingRevision,
                  localEntry: localEntryId,
                  figshareCategory: figshareCategoryId
                }) as unknown as Sails.WaterlinePromise<unknown>,
                connection
              );
              continue;
            }

            const existing = await this.runQuery(
              FigshareVocabularyCrosswalkMapping.findOne({
                crosswalk: String(crosswalk.id),
                revision: workingRevision,
                localEntry: localEntryId,
                figshareCategory: figshareCategoryId
              }) as Sails.WaterlinePromise<FigshareVocabularyCrosswalkMappingAttributes | null>,
              connection
            );
            const status = change.status ?? 'proposed';
            const approvalPatch = status === 'approved'
              ? { approvedAt: this.nowIso(), approvedBy: ctx.userId }
              : { approvedAt: undefined, approvedBy: undefined };
            if (existing) {
              await this.runQuery(
                FigshareVocabularyCrosswalkMapping.updateOne({ id: String(existing.id) }).set({
                  status,
                  matchType: change.matchType ?? existing.matchType,
                  ...approvalPatch
                }) as Sails.WaterlinePromise<unknown>,
                connection
              );
              continue;
            }
            await this.createOne(
              FigshareVocabularyCrosswalkMapping.create({
                crosswalk: String(crosswalk.id),
                revision: workingRevision,
                localEntry: localEntryId,
                figshareCategory: figshareCategoryId,
                status,
                matchType: change.matchType ?? 'manual',
                ...approvalPatch
              }) as Sails.WaterlinePromise<unknown>,
              connection
            );
          }

          await this.runQuery(
            FigshareVocabularyCrosswalk.updateOne({ id: String(crosswalk.id) }).set({ updatedBy: ctx.userId }) as Sails.WaterlinePromise<unknown>,
            connection
          );

          const refreshed = await this.runQuery(
            FigshareVocabularyCrosswalk.findOne({ id: String(crosswalk.id) }) as Sails.WaterlinePromise<FigshareVocabularyCrosswalkAttributes | null>,
            connection
          );
          return this.describeCrosswalk(refreshed ?? crosswalk);
        },
        {
          logger: sails.log,
          unsupportedAdapterWarning:
            'Transactions are not supported by this datastore adapter. Falling back to non-transactional crosswalk mapping save.'
        }
      );
    }

    private async assertMappingOwnership(
      crosswalk: FigshareVocabularyCrosswalkAttributes,
      localEntryId: string,
      figshareCategoryId: string,
      connection?: Sails.Connection
    ): Promise<void> {
      const entry = await this.runQuery(
        VocabularyEntry.findOne({ id: localEntryId, vocabulary: String(crosswalk.localVocabulary) }) as Sails.WaterlinePromise<VocabularyEntryAttributes | null>,
        connection
      );
      if (!entry) {
        throw new RelationshipBoundaryError('The local entry does not belong to the crosswalk local vocabulary');
      }
      const category = await this.runQuery(
        FigshareVocabularyCategory.findOne({ id: figshareCategoryId, source: String(crosswalk.figshareSource) }) as Sails.WaterlinePromise<FigshareVocabularyCategoryAttributes | null>,
        connection
      );
      if (!category) {
        throw new RelationshipBoundaryError('The Figshare category does not belong to the crosswalk source');
      }
    }

    /**
     * Promote the working revision to the approved revision. AppConfig keeps its stable
     * crosswalkId; publishing immediately follows the newly approved revision.
     */
    public async approveCrosswalk(crosswalkId: string, revision: number, ctx: ActorContext): Promise<CrosswalkSummary> {
      const crosswalk = await this.requireCrosswalk(crosswalkId, ctx.brandId);
      if (Number(revision) !== Number(crosswalk.workingRevision)) {
        throw new CrosswalkRevisionError();
      }

      const mappings = await FigshareVocabularyCrosswalkMapping.find({
        crosswalk: String(crosswalk.id),
        revision: Number(crosswalk.workingRevision)
      }) as FigshareVocabularyCrosswalkMappingAttributes[];
      const approvable = mappings.filter((mapping) => mapping.status !== 'rejected');
      if (approvable.length === 0) {
        throw new CatalogueInvalidError('A crosswalk revision must contain at least one mapping before it can be approved');
      }

      const approvedAt = this.nowIso();
      return runWithOptionalTransaction(
        this.getDatastore(),
        async (connection) => {
          for (const mapping of approvable) {
            await this.assertMappingOwnership(crosswalk, String(mapping.localEntry), String(mapping.figshareCategory), connection);
            if (mapping.status === 'approved') {
              continue;
            }
            await this.runQuery(
              FigshareVocabularyCrosswalkMapping.updateOne({ id: String(mapping.id) }).set({
                status: 'approved',
                approvedAt,
                approvedBy: ctx.userId
              }) as Sails.WaterlinePromise<unknown>,
              connection
            );
          }
          await this.runQuery(
            FigshareVocabularyCrosswalk.updateOne({ id: String(crosswalk.id) }).set({
              status: 'approved',
              approvedRevision: Number(crosswalk.workingRevision),
              approvedAt,
              approvedBy: ctx.userId,
              updatedBy: ctx.userId
            }) as Sails.WaterlinePromise<unknown>,
            connection
          );
          const refreshed = await this.runQuery(
            FigshareVocabularyCrosswalk.findOne({ id: String(crosswalk.id) }) as Sails.WaterlinePromise<FigshareVocabularyCrosswalkAttributes | null>,
            connection
          );
          return this.describeCrosswalk(refreshed ?? crosswalk);
        },
        {
          logger: sails.log,
          unsupportedAdapterWarning:
            'Transactions are not supported by this datastore adapter. Falling back to non-transactional crosswalk approval.'
        }
      );
    }

    /**
     * Collect the dotted paths of every crosswalk binding in a config that selects
     * `crosswalkId`. A crosswalk can now be referenced by any binding, not just the
     * categories one, so the whole config tree has to be walked.
     */
    private collectCrosswalkBindings(
      node: unknown,
      crosswalkId: string,
      pathSegments: string[],
      found: Array<{ bindingPath: string; outputs?: string; sourceVocabularyId?: string }>
    ): void {
      if (node == null || typeof node !== 'object') {
        return;
      }
      if (Array.isArray(node)) {
        node.forEach((item, index) => this.collectCrosswalkBindings(item, crosswalkId, [...pathSegments, String(index)], found));
        return;
      }
      const candidate = node as Record<string, unknown>;
      if (candidate.kind === 'crosswalk' && String(candidate.crosswalkId ?? '') === crosswalkId) {
        found.push({
          bindingPath: pathSegments.join('.'),
          outputs: candidate.outputs == null ? undefined : String(candidate.outputs),
          sourceVocabularyId: candidate.sourceVocabularyId == null ? undefined : String(candidate.sourceVocabularyId)
        });
      }
      for (const [key, value] of Object.entries(candidate)) {
        this.collectCrosswalkBindings(value, crosswalkId, [...pathSegments, key], found);
      }
    }

    /** Report the Figshare publishing bindings that select this crosswalk. */
    public async getCrosswalkUsage(crosswalkId: string, ctx: ActorContext): Promise<CrosswalkUsage[]> {
      const crosswalk = await this.requireCrosswalk(crosswalkId, ctx.brandId);
      const appConfigService = sails.services?.appconfigservice as {
        getAppConfigurationForBrand?: (name: string) => Record<string, unknown> | undefined;
      } | undefined;
      const brandName = this.resolveBrandName(ctx.brandId);
      const brandConfig = appConfigService?.getAppConfigurationForBrand?.(brandName);
      const figsharePublishing = brandConfig?.figsharePublishing;
      const found: Array<{ bindingPath: string; outputs?: string; sourceVocabularyId?: string }> = [];
      this.collectCrosswalkBindings(figsharePublishing, String(crosswalk.id), [], found);
      return found.map((binding) => ({
        brandName,
        configKey: 'figsharePublishing',
        bindingPath: binding.bindingPath,
        outputs: binding.outputs,
        sourceVocabularyId: binding.sourceVocabularyId
      }));
    }

    /** Draft crosswalks are deleted; approved ones archive to protect AppConfig references. */
    public async deleteCrosswalk(crosswalkId: string, ctx: ActorContext): Promise<void> {
      const crosswalk = await this.requireCrosswalk(crosswalkId, ctx.brandId);
      const usage = await this.getCrosswalkUsage(crosswalkId, ctx);
      if (usage.length > 0) {
        throw new RelationshipBoundaryError(
          'This crosswalk is selected by a Figshare publishing configuration. Remove or replace the reference first.'
        );
      }
      if (crosswalk.status === 'approved') {
        await FigshareVocabularyCrosswalk.updateOne({ id: String(crosswalk.id) }).set({
          status: 'archived',
          updatedBy: ctx.userId
        });
        return;
      }
      await FigshareVocabularyCrosswalkMapping.destroy({ crosswalk: String(crosswalk.id) });
      await FigshareVocabularyCrosswalk.destroyOne({ id: String(crosswalk.id) });
    }

    // ── Publishing resolution ─────────────────────────────────────────

    /**
     * Resolve record codes to the Figshare categories they map to through the
     * approved revision of a crosswalk. Working revisions are never consulted.
     *
     * Shared by every output mode: the caller decides whether to emit the numeric
     * category ID, the mirrored label, or the Figshare source ID.
     */
    private async resolveCrosswalkTargets(input: ResolveCategoriesInput): Promise<CrosswalkTargetResolution> {
      const crosswalk = await this.requireCrosswalk(String(input?.crosswalkId ?? ''), String(input?.brandId ?? ''));
      if (crosswalk.status !== 'approved' || crosswalk.approvedRevision == null) {
        throw new RelationshipBoundaryError('The configured Figshare crosswalk has no approved revision');
      }
      const sourceVocabularyId = String(input?.sourceVocabularyId ?? '').trim();
      if (!sourceVocabularyId || String(crosswalk.localVocabulary) !== sourceVocabularyId) {
        throw new RelationshipBoundaryError('The configured Figshare crosswalk maps a different local vocabulary');
      }
      const source = await FigshareVocabularySource.findOne({
        id: String(crosswalk.figshareSource),
        branding: String(input.brandId)
      }) as FigshareVocabularySourceAttributes | null;
      if (!source || source.archived === true) {
        throw new RelationshipBoundaryError('The Figshare source behind the configured crosswalk is unavailable');
      }

      const codes = Array.from(new Set((input?.codes ?? []).map((code) => normalizeCategoryCode(code)).filter((code) => code !== '')));
      if (codes.length === 0) {
        return { normalizedCodes: [], matches: [], unresolvedCodes: [], historicalTargets: [] };
      }

      const entries = await VocabularyEntry.find({ vocabulary: sourceVocabularyId }) as VocabularyEntryAttributes[];
      const entryByCode = new Map<string, VocabularyEntryAttributes>();
      for (const entry of entries) {
        const valueCode = normalizeCategoryCode(entry.valueLower ?? entry.value);
        if (valueCode !== '' && !entryByCode.has(valueCode)) {
          entryByCode.set(valueCode, entry);
        }
        const identifierCode = normalizeCategoryCode(entry.identifier);
        if (identifierCode !== '' && !entryByCode.has(identifierCode)) {
          entryByCode.set(identifierCode, entry);
        }
      }

      const unresolvedCodes: string[] = [];
      const matchedEntryIdsByCode = new Map<string, string>();
      for (const code of codes) {
        const entry = entryByCode.get(code);
        if (!entry) {
          unresolvedCodes.push(code);
          continue;
        }
        matchedEntryIdsByCode.set(code, String(entry.id));
      }
      if (matchedEntryIdsByCode.size === 0) {
        return { normalizedCodes: codes, matches: [], unresolvedCodes, historicalTargets: [] };
      }

      const mappings = await FigshareVocabularyCrosswalkMapping.find({
        crosswalk: String(crosswalk.id),
        revision: Number(crosswalk.approvedRevision),
        status: 'approved',
        localEntry: Array.from(new Set(matchedEntryIdsByCode.values()))
      }) as FigshareVocabularyCrosswalkMappingAttributes[];
      if (mappings.length === 0) {
        return {
          normalizedCodes: codes,
          matches: [],
          unresolvedCodes: [...unresolvedCodes, ...matchedEntryIdsByCode.keys()],
          historicalTargets: []
        };
      }

      const categories = await FigshareVocabularyCategory.find({
        id: Array.from(new Set(mappings.map((mapping) => String(mapping.figshareCategory))))
      }) as FigshareVocabularyCategoryAttributes[];
      const categoryById = new Map(categories.map((category) => [String(category.id), category]));

      const mappingsByEntryId = new Map<string, FigshareVocabularyCrosswalkMappingAttributes[]>();
      for (const mapping of mappings) {
        const entryId = String(mapping.localEntry);
        const bucket = mappingsByEntryId.get(entryId);
        if (bucket) {
          bucket.push(mapping);
        } else {
          mappingsByEntryId.set(entryId, [mapping]);
        }
      }

      // Walk in code order so every output mode returns a deterministic sequence
      // that follows the record's own ordering.
      const matches: CrosswalkTargetResolution['matches'] = [];
      const historicalTargets: CrosswalkTargetResolution['historicalTargets'] = [];
      for (const [code, entryId] of matchedEntryIdsByCode) {
        let resolved = false;
        for (const mapping of mappingsByEntryId.get(entryId) ?? []) {
          const category = categoryById.get(String(mapping.figshareCategory));
          if (!category) {
            continue;
          }
          resolved = true;
          if (category.historical === true) {
            historicalTargets.push({ code, categoryId: category.categoryId, sourceId: category.sourceId });
            continue;
          }
          matches.push({ code, category });
        }
        if (!resolved) {
          unresolvedCodes.push(code);
        }
      }

      return { normalizedCodes: codes, matches, unresolvedCodes, historicalTargets };
    }

    /**
     * Resolve record category codes to numeric Figshare category IDs. Retained as
     * the stable narrow surface over {@link resolveCrosswalkValues}.
     */
    public async resolveCategories(input: ResolveCategoriesInput): Promise<ResolveCategoriesResult> {
      const resolution = await this.resolveCrosswalkTargets(input);
      const categoryIds = new Set<number>(resolution.matches.map((match) => match.category.categoryId));
      return {
        categoryIds: Array.from(categoryIds).sort((left, right) => left - right),
        unresolvedCodes: resolution.unresolvedCodes,
        historicalTargets: resolution.historicalTargets
      };
    }

    /**
     * Resolve record codes through a crosswalk into the values a publishing binding
     * asks for. Historical targets are excluded from `values` in every mode and
     * reported separately so the caller can decide whether they are fatal.
     */
    public async resolveCrosswalkValues(input: ResolveCrosswalkValuesInput): Promise<ResolveCrosswalkValuesResult> {
      const outputs: CrosswalkOutput = input?.outputs || 'categoryId';
      const resolution = await this.resolveCrosswalkTargets(input);
      const base = {
        normalizedCodes: resolution.normalizedCodes,
        unresolvedCodes: resolution.unresolvedCodes,
        historicalTargets: resolution.historicalTargets
      };

      if (outputs === 'categoryId') {
        const categoryIds = new Set<number>(resolution.matches.map((match) => match.category.categoryId));
        return { ...base, values: Array.from(categoryIds).sort((left, right) => left - right) };
      }

      if (outputs === 'sourceId') {
        return { ...base, values: Array.from(new Set(resolution.matches.map((match) => match.category.sourceId))) };
      }

      // Labels live on the mirrored VocabularyEntry, not on the category row.
      const entryIds = Array.from(new Set(resolution.matches.map((match) => String(match.category.entry))));
      const entries = entryIds.length === 0
        ? []
        : await VocabularyEntry.find({ id: entryIds }) as VocabularyEntryAttributes[];
      const labelByEntryId = new Map(entries.map((entry) => [String(entry.id), entry.label]));

      const labels = new Set<string>();
      for (const match of resolution.matches) {
        const label = String(labelByEntryId.get(String(match.category.entry)) ?? '').trim();
        if (label !== '') {
          labels.add(label);
          continue;
        }
        // The mapping resolved; only the display label is missing. Falling back to
        // the source ID keeps the value usable rather than silently dropping it.
        sails.log.warn(
          `Figshare crosswalk ${input.crosswalkId}: category ${match.category.sourceId} has no mirrored label, using its source ID`
        );
        labels.add(match.category.sourceId);
      }
      return { ...base, values: Array.from(labels) };
    }

    // ── Bootstrap data ────────────────────────────────────────────────

    private getBootstrapDataPath(): string {
      const configuredPath = _.get(sails.config, 'bootstrap.bootstrapDataPath', DEFAULT_BOOTSTRAP_DATA_PATH);
      return path.resolve(String(configuredPath), 'vocabularies');
    }

    /** Overridable seam so unit tests can drive bootstrapData() without touching disk. */
    protected getBootstrapFileOps(): Pick<typeof fs, 'readFile'> {
      return fs;
    }

    private resolveDefaultBrandingId(): string {
      const brandingService = sails.services?.brandingservice as { getDefault?: () => unknown } | undefined;
      const defaultBrand = brandingService?.getDefault?.();
      if (defaultBrand && typeof defaultBrand === 'object') {
        const brand = defaultBrand as { id?: string | number; _id?: string | number };
        const id = brand.id ?? brand._id;
        if (id != null && String(id).trim() !== '') {
          return String(id).trim();
        }
      }
      return '';
    }

    /**
     * Declaratively import Figshare taxonomies listed in
     * `<bootstrapDataPath>/vocabularies/figshare-imports.json` during the Sails lift.
     *
     * Each item produces a read-only mirror, an editable local clone, and an approved
     * identity crosswalk - the state a fresh environment needs for Figshare publishing to
     * resolve categories without an administrator visiting the admin UI.
     *
     * Idempotent: an item whose FigshareVocabularySource already exists is skipped, so a
     * restart never re-syncs or forks admin-curated crosswalks. Nothing here throws - a
     * bootstrap importer must not be able to fail the lift.
     */
    public async bootstrapData(): Promise<void> {
      if (_.get(sails.config, 'vocab.bootstrapFigshareImports') === false) {
        sails.log.verbose('Skipping Figshare vocabulary bootstrap imports (disabled)');
        return;
      }

      const filePath = path.join(this.getBootstrapDataPath(), FIGSHARE_IMPORTS_FILE);
      let parsed: BootstrapFigshareImportsFile | null = null;
      try {
        const content = await this.getBootstrapFileOps().readFile(filePath, 'utf8');
        parsed = JSON.parse(content) as BootstrapFigshareImportsFile;
      } catch (error) {
        const ioError = error as NodeJS.ErrnoException;
        if (ioError?.code === 'ENOENT') {
          sails.log.verbose(`Figshare vocabulary bootstrap file not found: ${filePath}`);
          return;
        }
        sails.log.error(`Failed to read Figshare vocabulary bootstrap file: ${FIGSHARE_IMPORTS_FILE}`, error);
        return;
      }

      if (!Array.isArray(parsed?.imports)) {
        sails.log.error(`Invalid Figshare imports format in bootstrap file: ${FIGSHARE_IMPORTS_FILE}`);
        return;
      }
      const imports = parsed.imports;
      if (imports.length === 0) {
        return;
      }

      const brandId = this.resolveDefaultBrandingId();
      if (!brandId) {
        sails.log.error('Unable to resolve default branding for Figshare vocabulary bootstrap data');
        return;
      }

      // Most deployments have no Figshare configuration at all; resolveClient() would throw
      // a transport error on every lift, so check first and skip quietly instead.
      if (resolveFigshareVocabularyConfig(this.resolveBrandName(brandId)) == null) {
        sails.log.verbose('Skipping Figshare vocabulary bootstrap imports: Figshare is not configured for the default brand');
        return;
      }

      const ctx: ActorContext = { brandId, userId: BOOTSTRAP_ACTOR };
      for (const item of imports) {
        await this.processBootstrapImport(item, ctx);
      }
    }

    private async processBootstrapImport(item: BootstrapFigshareImportItem, ctx: ActorContext): Promise<void> {
      const scope = String(item?.scope ?? '').trim().toLowerCase();
      const taxonomyId = String(item?.taxonomyId ?? '').trim();
      const localCloneName = String(item?.localCloneName ?? '').trim();
      const label = `${scope || '?'}:${taxonomyId || '?'}`;

      if (scope !== 'public' && scope !== 'account') {
        sails.log.error(`Skipping Figshare bootstrap import with invalid scope '${item?.scope}' (expected 'public' or 'account')`);
        return;
      }
      if (!taxonomyId) {
        sails.log.error('Skipping Figshare bootstrap import with missing taxonomyId');
        return;
      }
      if (!localCloneName) {
        sails.log.error(`Skipping Figshare bootstrap import with missing localCloneName: ${label}`);
        return;
      }

      const existing = await FigshareVocabularySource.findOne({
        branding: ctx.brandId,
        scope,
        taxonomyId
      }) as FigshareVocabularySourceAttributes | null;
      if (existing) {
        sails.log.verbose(`Skipping existing Figshare bootstrap import: ${label}`);
        return;
      }

      try {
        await promiseWithTimeout(
          this.runBootstrapImport({ scope, taxonomyId, localCloneName, item }, ctx),
          FIGSHARE_IMPORT_TIMEOUT_MS,
          `Figshare vocabulary import ${label}`
        );
        sails.log.verbose(`Imported Figshare bootstrap vocabulary: ${label}`);
      } catch (error) {
        sails.log.error(`Failed Figshare bootstrap import: ${label}`, error);
      }
    }

    private async runBootstrapImport(
      input: { scope: FigshareCategoryScope; taxonomyId: string; localCloneName: string; item: BootstrapFigshareImportItem },
      ctx: ActorContext
    ): Promise<void> {
      const localCloneSlug = String(input.item?.localCloneSlug ?? '').trim();
      const preview = await this.createPreview({
        scope: input.scope,
        taxonomyId: input.taxonomyId,
        createLocalClone: true,
        localCloneName: input.localCloneName,
        localCloneSlug: localCloneSlug || undefined
      }, ctx);

      // Read the run row directly rather than paging getPreview(), which caps at
      // MAX_PAGE_SIZE per page - a real taxonomy has thousands of categories. In clone
      // mode every proposal is an identity match and preselected.
      const run = await FigshareVocabularySyncRun.findOne({ id: preview.runId }) as FigshareVocabularySyncRunAttributes | null;
      const proposals = ((run?.proposals ?? []) as FigshareProposal[]);
      const approvedProposalIds = proposals
        .filter((proposal) => proposal.preselected)
        .map((proposal) => proposal.proposalId);

      const result = await this.applyPreview(preview.runId, {
        remoteHash: preview.remoteHash,
        approvedProposalIds
      }, ctx);

      const crosswalkId = String(result.crosswalkId ?? '');
      if (!crosswalkId) {
        throw new Error('Figshare bootstrap import did not produce a crosswalk');
      }

      const requestedName = String(input.item?.crosswalkName ?? '').trim();
      if (requestedName) {
        // { branding, name } is a unique index, so probe before renaming.
        const name = await this.uniqueCrosswalkName(requestedName, ctx.brandId);
        await FigshareVocabularyCrosswalk.updateOne({ id: crosswalkId }).set({
          name,
          updatedBy: ctx.userId
        });
      }

      // Mapping edges are written as 'proposed' and resolveCategories() refuses any
      // crosswalk without an approved revision - approving here is what makes the
      // bootstrapped crosswalk usable for publishing.
      await this.approveCrosswalk(crosswalkId, Number(result.crosswalkRevision ?? 1), ctx);
    }
  }
}

declare global {
  let FigshareVocabularyService: Services.FigshareVocabularyService;
}
