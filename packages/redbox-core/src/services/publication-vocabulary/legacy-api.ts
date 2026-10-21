import { randomUUID, createHash } from 'node:crypto';
import type { ObjectId, Db } from 'mongodb';
import type { Services as Legacy } from '../FigshareVocabularyService';
import type {
  PublicationVocabularyActor,
  PublicationVocabularyCrosswalk,
  PublicationVocabularySource,
  PublicationCrosswalkMapping,
  PublicationSourceImport,
} from './contracts';
import { PublicationVocabularyError } from './contracts';
import { PublicationVocabularyStore } from './store';
import { insertLegacyVocabularyRow, legacyVocabularyMatch } from './mongo';
import { vocabularyEntries } from './conversion';
import { figshareCategoryId } from '../figshare-v2/vocabulary-adapter';
import { figshareVocabularyCatalogue } from './figshare-source';
import { publicationDigest } from '../publication/canonical';
import {
  buildProposals,
  classifyChanges,
  type FigshareProposal,
  type FigshareDiffRow,
  type NormalizedFigshareCategory,
} from '../figshare-v2/categories';

interface SharedPreview {
  brandId: string;
  id: string;
  input: Legacy.CreatePreviewInput;
  catalogue: Omit<PublicationSourceImport, 'importId'>;
  sourceId?: string;
  version?: number;
  crosswalkVersion?: number;
  summary: Legacy.SyncPreviewSummary;
  remoteHash: string;
  baseHash: string;
  state: string;
  expiresAt: string;
  result?: Legacy.ApplyResult;
  proposals: FigshareProposal[];
  diff: FigshareDiffRow[];
  requestedBy: string;
  appliedBy?: string;
  unresolved: Array<{ localEntryId: string; localLabel: string; localValue: string }>;
}
export async function sharedFigshareVocabulary(
  ctx: PublicationVocabularyActor
): Promise<SharedFigshareVocabulary | null> {
  if (
    typeof PublicationVocabularyService === 'undefined' ||
    !(await PublicationVocabularyService.converted(ctx.brandId))
  )
    return null;
  await PublicationVocabularyService.listSources(ctx); // Current brand administrator and independent stage-2 gate.
  const db: Db = PublicationSync.getDatastore().manager;
  if (!Object.is(Vocabulary.getDatastore().manager, db))
    throw new PublicationVocabularyError('Vocabulary conversion requires one Mongo datastore', 409);
  return new SharedFigshareVocabulary(new PublicationVocabularyStore(db), ctx);
}
/** Legacy shapes are constructed at this boundary; the shared store never assumes category numbers. */
export class SharedFigshareVocabulary {
  constructor(
    private readonly store: PublicationVocabularyStore,
    private readonly ctx: PublicationVocabularyActor
  ) {}
  private page<T>(rows: T[], query: { limit?: number; offset?: number }) {
    const limit = Math.min(200, Math.max(1, Math.floor(Number(query.limit) || 25)));
    const offset = Math.max(0, Math.floor(Number(query.offset) || 0));
    return { data: rows.slice(offset, offset + limit), meta: { total: rows.length, limit, offset } };
  }
  private async source(id: string) {
    const source = await this.store.source(this.ctx.brandId, id);
    if (source.provider !== 'figshare')
      throw new PublicationVocabularyError('Legacy Figshare route requires a Figshare source');
    return source;
  }
  private status(row: PublicationVocabularyCrosswalk): PublicationVocabularyCrosswalk['status'] {
    return row.status === 'archived' ? 'archived' : row.approvedRevision ? 'approved' : 'draft';
  }
  async summary(row: PublicationVocabularyCrosswalk): Promise<Legacy.CrosswalkSummary> {
    const source = await this.source(row.sourceId);
    const working = row.revisions.find(revision => revision.revision === row.workingRevision);
    const approved = row.revisions.find(revision => revision.revision === row.approvedRevision);
    const local = await this.store.db
      .collection<{ _id: string | ObjectId; name?: string }>('vocabulary')
      .findOne(legacyVocabularyMatch('_id', row.localVocabularyId));
    return {
      id: row.id,
      name: row.name,
      status: this.status(row),
      workingRevision: row.workingRevision,
      approvedRevision: row.approvedRevision,
      approvedAt: approved?.approvedAt,
      approvedBy: approved?.approvedBy,
      localVocabularyId: row.localVocabularyId,
      localVocabularyName: String(local?.name ?? row.localVocabularyId),
      figshareSourceId: source.id,
      figshareSourceName: source.displayName,
      scope: source.scope,
      taxonomyId: source.catalogueId,
      approvedMappingCount: approved?.mappings.filter(mapping => mapping.status === 'approved').length ?? 0,
      workingMappingCount: working?.mappings.length ?? 0,
      historicalTargetCount:
        source.terms.filter(term => term.historical && approved?.mappings.some(mapping => mapping.targetId === term.id))
          .length ?? 0,
    };
  }
  async getCrosswalk(id: string) {
    return this.summary(await this.store.crosswalk(this.ctx.brandId, id));
  }
  async listCrosswalks(query: {
    q?: string;
    status?: string;
    localVocabularyId?: string;
    sourceId?: string;
    limit?: number;
    offset?: number;
  }) {
    const sources = await this.store.sources
      .find({ brandId: this.ctx.brandId, provider: 'figshare' }, { projection: { id: 1 } })
      .toArray();
    const rows = await this.store.crosswalks
      .find({ brandId: this.ctx.brandId, sourceId: { $in: sources.map(source => source.id) } })
      .sort({ name: 1 })
      .toArray();
    const data = await Promise.all(
      rows
        .filter(
          row =>
            (!query.q || row.name.toLowerCase().includes(query.q.toLowerCase())) &&
            (!query.status || this.status(row) === query.status) &&
            (!query.localVocabularyId || row.localVocabularyId === query.localVocabularyId) &&
            (!query.sourceId || row.sourceId === query.sourceId)
        )
        .map(row => this.summary(row))
    );
    return this.page(data, query);
  }
  private describeSource(source: PublicationVocabularySource) {
    return {
      ...(source.legacy ?? {}),
      id: source.id,
      displayName: source.displayName,
      scope: source.scope,
      taxonomyId: source.catalogueId,
      archived: source.archived,
      categoryCount: source.terms.length,
      historicalCount: source.terms.filter(term => term.historical).length,
      vocabularyId: String(source.legacy?.vocabulary ?? source.id),
      lastSyncedAt: source.imports.at(-1)?.at,
      remoteHash: source.imports.at(-1)?.digest ?? String(source.legacy?.remoteHash ?? ''),
    };
  }
  async listSources(query: { q?: string; scope?: string; limit?: number; offset?: number }) {
    const rows = await this.store.sources
      .find({ brandId: this.ctx.brandId, provider: 'figshare' })
      .sort({ displayName: 1 })
      .toArray();
    return this.page(
      rows
        .filter(
          row =>
            (!query.q || row.displayName.toLowerCase().includes(query.q.toLowerCase())) &&
            (!query.scope || row.scope === query.scope)
        )
        .map(row => this.describeSource(row)),
      query
    );
  }
  async getSource(id: string) {
    return this.describeSource(await this.source(id));
  }
  async listSourceCategories(
    id: string,
    query: { q?: string; includeHistorical?: boolean; selectableOnly?: boolean; limit?: number; offset?: number }
  ): Promise<{ data: Legacy.SourceCategoryOption[]; meta: { total: number; limit: number; offset: number } }> {
    const source = await this.source(id);
    const rows = source.terms
      .filter(
        term =>
          (query.includeHistorical || !term.historical) &&
          (!query.selectableOnly || term.selectable) &&
          (!query.q || `${term.label} ${term.sourceId} ${term.value}`.toLowerCase().includes(query.q.toLowerCase()))
      )
      .map(term => ({
        id: String(term.evidence?.legacyCategoryId ?? term.id),
        sourceId: term.sourceId,
        categoryId: figshareCategoryId(term),
        title: term.label,
        parentSourceId: source.terms.find(parent => parent.id === term.parentId)?.sourceId,
        selectable: term.selectable,
        historical: term.historical,
      }));
    rows.sort((a, b) => a.sourceId.localeCompare(b.sourceId, undefined, { numeric: true }));
    return this.page(rows, query);
  }
  async listMappings(
    id: string,
    query: { q?: string; status?: string; revision?: number; limit?: number; offset?: number }
  ) {
    const row = await this.store.crosswalk(this.ctx.brandId, id);
    const revision = row.revisions.find(item => item.revision === (query.revision ?? row.workingRevision));
    if (!revision) throw new PublicationVocabularyError('Revision unavailable', 404);
    const rows = revision.mappings
      .map(mapping => {
        const target = revision.targets.find(term => term.id === mapping.targetId)!;
        const entry = revision.entries.find(term => term.id === mapping.localEntryId)!;
        return {
          id: mapping.id,
          revision: revision.revision,
          status: mapping.status,
          matchType: mapping.matchType,
          localEntryId: mapping.localEntryId,
          localLabel: entry.label,
          localValue: entry.value,
          figshareCategoryId: String(target.evidence?.legacyCategoryId ?? target.id),
          figshareSourceId: target.sourceId,
          figshareCategoryNumber: figshareCategoryId(target),
          historical: target.historical,
          approvedAt: mapping.approvedAt ?? null,
          approvedBy: mapping.approvedBy ?? null,
        };
      })
      .filter(
        mapping =>
          (!query.status || mapping.status === query.status) &&
          (!query.q ||
            `${mapping.localLabel} ${mapping.localValue} ${mapping.figshareSourceId}`
              .toLowerCase()
              .includes(query.q.toLowerCase()))
      );
    const page = this.page(rows, query);
    return { ...page, meta: { ...page.meta, revision: revision.revision } };
  }
  async listLocalEntries(
    id: string,
    query: { q?: string; mapped?: string; revision?: number; limit?: number; offset?: number }
  ) {
    const row = await this.store.crosswalk(this.ctx.brandId, id);
    const revision = row.revisions.find(item => item.revision === (query.revision ?? row.workingRevision));
    if (!revision) throw new PublicationVocabularyError('Revision unavailable', 404);
    const entries = await vocabularyEntries(this.store.db, row.localVocabularyId);
    const rows = entries
      .map(entry => ({
        id: entry.id,
        label: entry.label,
        value: entry.value,
        historical: false,
        targetCount: revision.mappings.filter(mapping => mapping.localEntryId === entry.id).length,
      }))
      .filter(
        entry =>
          (!query.q || `${entry.label} ${entry.value}`.toLowerCase().includes(query.q.toLowerCase())) &&
          (query.mapped !== 'mapped' || entry.targetCount > 0) &&
          (query.mapped !== 'unmapped' || entry.targetCount === 0)
      );
    const page = this.page(rows, query);
    return { ...page, meta: { ...page.meta, revision: revision.revision } };
  }
  async createCrosswalk(input: { name: string; sourceId: string; localVocabularyId: string }) {
    await this.source(input.sourceId);
    return this.summary(
      await PublicationVocabularyService.createCrosswalk({ ...input, normalizer: 'figshare-code-v1' }, this.ctx)
    );
  }
  async saveMappings(id: string, input: { revision: number; changes: Legacy.CrosswalkMappingChange[] }) {
    const row = await this.store.crosswalk(this.ctx.brandId, id);
    if (input.revision !== row.workingRevision) throw new PublicationVocabularyError('Crosswalk changed; reload', 409);
    const source = await this.source(row.sourceId);
    const draft = row.revisions.find(revision => revision.revision === row.workingRevision)!;
    let mappings = [...draft.mappings];
    for (const change of input.changes) {
      const target = source.terms.find(
        term => term.id === change.figshareCategoryId || term.evidence?.legacyCategoryId === change.figshareCategoryId
      );
      if (!target) throw new PublicationVocabularyError('Target does not belong to the crosswalk source');
      const existing = mappings.find(
        mapping => mapping.localEntryId === change.localEntryId && mapping.targetId === target.id
      );
      mappings = mappings.filter(mapping => mapping !== existing);
      if (change.op === 'add')
        mappings.push({
          id: existing?.id ?? randomUUID(),
          localEntryId: change.localEntryId,
          targetId: target.id,
          status: change.status ?? 'proposed',
          matchType: change.matchType ?? 'manual',
        });
      else if (change.op !== 'remove') throw new PublicationVocabularyError('Unsupported mapping operation');
    }
    return this.summary(
      await PublicationVocabularyService.saveMappings(id, { version: row.version, mappings }, this.ctx)
    );
  }
  async approveCrosswalk(id: string, revision: number) {
    const row = await this.store.crosswalk(this.ctx.brandId, id);
    if (revision !== row.workingRevision) throw new PublicationVocabularyError('Crosswalk changed; reload', 409);
    return this.summary(await PublicationVocabularyService.approveCrosswalk(id, row.version, this.ctx));
  }
  async deleteCrosswalk(id: string): Promise<void> {
    const row = await this.store.crosswalk(this.ctx.brandId, id);
    await this.store.replaceCrosswalk(row, {
      ...row,
      status: 'archived',
      version: row.version + 1,
      updatedBy: this.ctx.userId,
    });
  }
  async cloneMirror(sourceId: string, input: { name: string; slug?: string }) {
    const source = await this.source(sourceId);
    const result = await this.clone(source, input.name, input.slug, randomUUID());
    const entries = await vocabularyEntries(this.store.db, result.localVocabularyId);
    await this.store.saveMappings(
      result.crosswalk.id,
      {
        version: result.crosswalk.version,
        mappings: source.terms
          .filter(term => !term.historical)
          .map(term => ({
            id: randomUUID(),
            localEntryId: entries.find(entry => entry.value === term.sourceId)!.id,
            targetId: term.id,
            status: 'proposed',
            matchType: 'identity',
          })),
      },
      entries,
      this.ctx
    );
    return {
      localVocabularyId: result.localVocabularyId,
      crosswalkId: result.crosswalk.id,
      entries: source.terms.filter(term => !term.historical).length,
    };
  }
  private async clone(source: PublicationVocabularySource, name: string, slug: string | undefined, key: string) {
    if (!name.trim()) throw new PublicationVocabularyError('Clone name is required');
    const oid = (value: string) =>
      createHash('sha256').update(`${this.ctx.brandId}:${key}:${value}`).digest('hex').slice(0, 24);
    const vocabularyId = oid('vocabulary');
    await insertLegacyVocabularyRow(this.store.db, 'vocabulary', vocabularyId, {
      name,
      slug: slug || `${name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${key.slice(0, 8)}`,
      type: 'tree',
      source: 'local',
      branding: this.ctx.brandId,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });
    const usedLabels = new Set<string>();
    for (const term of source.terms.filter(term => !term.historical)) {
      let label = term.label;
      let suffix = 1;
      while (usedLabels.has(label.toLowerCase())) {
        label = `${term.label} (${term.sourceId}${suffix === 1 ? '' : `-${suffix}`})`;
        suffix++;
      }
      usedLabels.add(label.toLowerCase());
      await insertLegacyVocabularyRow(
        this.store.db,
        'vocabularyentry',
        oid(term.id),
        {
          label,
          labelLower: label.toLowerCase(),
          value: term.sourceId,
          valueLower: term.sourceId.toLowerCase(),
          identifier: term.sourceId,
          historical: false,
          order: 0,
          createdAt: Date.now(),
          updatedAt: Date.now(),
        },
        {
          vocabulary: vocabularyId,
          ...(term.parentId && source.terms.some(parent => parent.id === term.parentId && !parent.historical)
            ? { parent: oid(term.parentId) }
            : {}),
        }
      );
    }
    const crosswalkId = String(oid('crosswalk'));
    let crosswalk: PublicationVocabularyCrosswalk | null = await this.store.crosswalks.findOne({
      brandId: this.ctx.brandId,
      id: crosswalkId,
    });
    if (!crosswalk) {
      try {
        await this.store.createCrosswalk(
          {
            id: crosswalkId,
            name: `${name} → ${source.displayName}`,
            sourceId: source.id,
            localVocabularyId: String(vocabularyId),
            normalizer: 'figshare-code-v1',
          },
          this.ctx
        );
      } catch (error) {
        if (!(await this.store.crosswalks.findOne({ brandId: this.ctx.brandId, id: crosswalkId }))) throw error;
      }
      crosswalk = await this.store.crosswalk(this.ctx.brandId, crosswalkId);
    }
    return { localVocabularyId: String(vocabularyId), crosswalk };
  }
  async createPreview(input: Legacy.CreatePreviewInput): Promise<Legacy.SyncPreview> {
    const catalogue = await figshareVocabularyCatalogue(this.ctx.brandId, input.scope, input.taxonomyId);
    const source = input.sourceId
      ? await this.source(input.sourceId)
      : await this.store.sources.findOne({
          brandId: this.ctx.brandId,
          provider: 'figshare',
          scope: input.scope,
          catalogueId: input.taxonomyId,
        });
    if (source && (source.scope !== input.scope || source.catalogueId !== input.taxonomyId))
      throw new PublicationVocabularyError('Preview source scope/taxonomy mismatch');
    let crosswalk = input.crosswalkId ? await this.store.crosswalk(this.ctx.brandId, input.crosswalkId) : null;
    if (
      crosswalk &&
      (!source ||
        crosswalk.sourceId !== source.id ||
        (input.localVocabularyId && input.localVocabularyId !== crosswalk.localVocabularyId))
    )
      throw new PublicationVocabularyError('Preview crosswalk pairing does not match the source and local vocabulary');
    const localVocabularyId = input.localVocabularyId ?? crosswalk?.localVocabularyId;
    if (localVocabularyId) await this.store.assertLocalVocabulary(this.ctx.brandId, localVocabularyId);
    if (!crosswalk && source && localVocabularyId)
      crosswalk = await this.store.crosswalks.findOne({
        brandId: this.ctx.brandId,
        sourceId: source.id,
        localVocabularyId,
        status: { $ne: 'archived' },
      });
    const remote: NormalizedFigshareCategory[] = catalogue.terms.map(term => ({
      sourceId: term.sourceId,
      categoryId: figshareCategoryId(term),
      taxonomyId: catalogue.catalogueId,
      title: term.label,
      selectable: term.selectable,
      parentSourceId: catalogue.terms.find(parent => parent.id === term.parentId)?.sourceId ?? null,
      path: [],
      hasChildren: catalogue.terms.some(child => child.parentId === term.id),
      contentHash: String(term.evidence?.contentHash ?? publicationDigest(JSON.parse(JSON.stringify(term)))),
    }));
    const diff = classifyChanges(
      (source?.terms ?? []).map(term => {
        const category = term.evidence?.category;
        const legacyHash =
          category && typeof category === 'object' && !Array.isArray(category) ? category.contentHash : undefined;
        return {
          sourceId: term.sourceId,
          categoryId: figshareCategoryId(term),
          title: term.label,
          historical: term.historical,
          contentHash: String(term.evidence?.contentHash ?? legacyHash ?? ''),
        };
      }),
      remote
    );
    const entries = localVocabularyId ? await vocabularyEntries(this.store.db, localVocabularyId) : [];
    const proposals = input.createLocalClone
      ? remote.map(term => ({
          proposalId: `clone:${term.sourceId}`,
          localEntryId: '',
          localLabel: term.title,
          localValue: term.sourceId,
          targetSourceId: term.sourceId,
          targetCategoryId: term.categoryId,
          targetTitle: term.title,
          matchType: 'identity' as const,
          preselected: true,
          historical: false,
          evidence: { rule: 'clone-identity' },
        }))
      : buildProposals(
          entries.map(entry => ({
            ...entry,
            valueLower: entry.value.toLowerCase(),
            labelLower: entry.label.toLowerCase(),
            identifier: entry.codes.find(code => code !== entry.value),
          })),
          remote
        ).proposals;
    const unresolved = entries
      .filter(entry => !proposals.some(proposal => proposal.localEntryId === entry.id))
      .map(entry => ({ localEntryId: entry.id, localLabel: entry.label, localValue: entry.value }));
    const row: SharedPreview = {
      brandId: this.ctx.brandId,
      id: randomUUID(),
      requestedBy: this.ctx.userId,
      input: { ...input, localVocabularyId, crosswalkId: crosswalk?.id },
      catalogue,
      proposals,
      diff: diff.rows,
      unresolved,
      sourceId: source?.id,
      version: source?.version,
      crosswalkVersion: crosswalk?.version,
      remoteHash: publicationDigest(JSON.parse(JSON.stringify(catalogue.terms))),
      baseHash: source?.imports.at(-1)?.digest ?? '',
      state: 'previewed',
      expiresAt: new Date(Date.now() + 86400000).toISOString(),
      summary: {
        ...diff.summary,
        proposed: proposals.length,
        preselected: proposals.filter(proposal => proposal.preselected).length,
        unresolved: unresolved.length,
        historicalWarnings: diff.summary.removed,
      },
    };
    await this.store.db.collection<SharedPreview>('publicationvocabularypreview').insertOne(row);
    return this.preview(row);
  }
  private preview(row: SharedPreview): Legacy.SyncPreview {
    return {
      runId: row.id,
      state: row.state,
      scope: row.catalogue.scope,
      taxonomyId: row.catalogue.catalogueId,
      sourceId: row.sourceId,
      localVocabularyId: row.input.localVocabularyId,
      crosswalkId: row.input.crosswalkId,
      createLocalClone: row.input.createLocalClone === true,
      baseHash: row.baseHash,
      remoteHash: row.remoteHash,
      expiresAt: row.expiresAt,
      normalizerVersion: 'shared-v1',
      summary: row.summary,
      warnings: [],
    };
  }
  private async requirePreview(id: string) {
    const row = await this.store.db
      .collection<SharedPreview>('publicationvocabularypreview')
      .findOne({ brandId: this.ctx.brandId, id });
    if (!row) throw new PublicationVocabularyError('Preview not available for this brand', 404);
    return row;
  }
  async hasPreview(id: string): Promise<boolean> {
    return !!(await this.store.db
      .collection<SharedPreview>('publicationvocabularypreview')
      .findOne({ brandId: this.ctx.brandId, id }, { projection: { id: 1 } }));
  }
  async getPreview(id: string, query: Legacy.PreviewPageQuery): Promise<Legacy.PagedPreview> {
    const row = await this.requirePreview(id);
    const view = query.view === 'diff' ? 'diff' : 'proposals';
    const records = (view === 'proposals' ? row.proposals : row.diff).filter(item => {
      if (query.q && !JSON.stringify(item).toLowerCase().includes(query.q.toLowerCase())) return false;
      if (query.changeClass && 'changeClass' in item && item.changeClass !== query.changeClass) return false;
      if (query.matchType && 'matchType' in item && item.matchType !== query.matchType) return false;
      if (query.historicalOnly && 'historical' in item && !item.historical) return false;
      if (query.unresolvedOnly && 'preselected' in item && item.preselected) return false;
      return true;
    });
    const page = this.page(records, query);
    return {
      ...this.preview(row),
      page: { view, records: page.data, ...page.meta },
      unresolved: row.unresolved,
    };
  }
  async applyPreview(id: string, decisions: Legacy.ApplyDecisions): Promise<Legacy.ApplyResult> {
    const row = await this.requirePreview(id);
    if (row.result) return row.result;
    if (row.state !== 'previewed')
      throw new PublicationVocabularyError(
        'Preview application is unfinished; inspect the retained source import and finish through shared administration',
        409
      );
    if (row.remoteHash !== decisions.remoteHash || Date.parse(row.expiresAt) < Date.now())
      throw new PublicationVocabularyError('Preview changed or expired', 409);
    if ((decisions.approvedProposalIds ?? []).some(id => !row.proposals.some(proposal => proposal.proposalId === id)))
      throw new PublicationVocabularyError('Selected proposal is outside this preview');
    if (row.input.crosswalkId) {
      const crosswalk = await this.store.crosswalk(this.ctx.brandId, row.input.crosswalkId);
      if (
        crosswalk.version !== row.crosswalkVersion ||
        (decisions.expectedRevision !== undefined && crosswalk.workingRevision !== decisions.expectedRevision)
      )
        throw new PublicationVocabularyError('Crosswalk changed; generate another preview', 409);
    }
    const admitted = await this.store.db
      .collection<SharedPreview>('publicationvocabularypreview')
      .updateOne({ brandId: this.ctx.brandId, id, state: 'previewed' }, { $set: { state: 'applying' } });
    if (!admitted.matchedCount) throw new PublicationVocabularyError('Preview is already being applied', 409);
    let source = await this.store.importSource(
      {
        ...row.catalogue,
        ...(row.sourceId ? { id: row.sourceId } : {}),
        expectedVersion: row.version,
        importId: row.id,
      },
      this.ctx
    );
    let crosswalk = row.input.crosswalkId ? await this.store.crosswalk(this.ctx.brandId, row.input.crosswalkId) : null;
    let localVocabularyId = row.input.localVocabularyId;
    if (row.input.createLocalClone) {
      const clone = await this.clone(source, row.input.localCloneName ?? '', row.input.localCloneSlug, row.id);
      crosswalk = clone.crosswalk;
      localVocabularyId = clone.localVocabularyId;
    }
    if (!crosswalk && localVocabularyId)
      crosswalk = await PublicationVocabularyService.createCrosswalk(
        {
          name: `${localVocabularyId} → ${source.displayName}`,
          sourceId: source.id,
          localVocabularyId,
          normalizer: 'figshare-code-v1',
        },
        this.ctx
      );
    let mappingsCreated = 0;
    if (crosswalk) {
      if (crosswalk.sourceId !== source.id)
        throw new PublicationVocabularyError('Preview crosswalk belongs to another source');
      const entries = await vocabularyEntries(this.store.db, crosswalk.localVocabularyId);
      const prior = crosswalk.revisions.find(revision => revision.revision === crosswalk!.workingRevision)!;
      const mappings: PublicationCrosswalkMapping[] = [...prior.mappings];
      for (const proposal of row.proposals.filter(proposal =>
        (decisions.approvedProposalIds ?? []).includes(proposal.proposalId)
      )) {
        const entry = entries.find(
          entry =>
            entry.id === proposal.localEntryId || (row.input.createLocalClone && entry.value === proposal.localValue)
        );
        const target = source.terms.find(term => term.sourceId === proposal.targetSourceId);
        if (!entry || !target) throw new PublicationVocabularyError('Reviewed proposal entry/target is unavailable');
        if (!mappings.some(mapping => mapping.localEntryId === entry.id && mapping.targetId === target.id))
          mappings.push({
            id: randomUUID(),
            localEntryId: entry.id,
            targetId: target.id,
            status: 'proposed',
            matchType: proposal.matchType,
          });
      }
      for (const decision of decisions.manualMappings ?? []) {
        const entry = entries.find(
          entry => entry.id === decision.localEntryId || entry.codes.includes(decision.localEntryKey ?? '')
        );
        if (!entry) throw new PublicationVocabularyError('Manual mapping entry is outside the local vocabulary');
        for (const sourceId of decision.figshareSourceIds) {
          const target = source.terms.find(term => term.sourceId === sourceId);
          if (!target) throw new PublicationVocabularyError('Manual mapping target is outside the imported source');
          if (!mappings.some(mapping => mapping.localEntryId === entry.id && mapping.targetId === target.id))
            mappings.push({
              id: randomUUID(),
              localEntryId: entry.id,
              targetId: target.id,
              status: 'proposed',
              matchType: 'manual',
            });
        }
      }
      mappingsCreated = mappings.length - prior.mappings.length;
      crosswalk = await this.store.saveMappings(
        crosswalk.id,
        { version: crosswalk.version, mappings },
        entries,
        this.ctx
      );
    }
    source = await this.source(source.id);
    const result: Legacy.ApplyResult = {
      runId: row.id,
      state: 'applied',
      sourceId: source.id,
      vocabularyId: String(source.legacy?.vocabulary ?? source.id),
      localVocabularyId: localVocabularyId ?? null,
      crosswalkId: crosswalk?.id ?? null,
      crosswalkRevision: crosswalk?.workingRevision ?? null,
      categories: {
        created: row.summary.added,
        updated: row.summary.changed,
        historical: row.summary.removed,
        reappeared: row.summary.reappeared,
      },
      mappings: { created: mappingsCreated, removed: 0 },
      cloneCreated: row.input.createLocalClone === true,
      appliedAt: source.imports.find(item => item.id === row.id)!.at,
    };
    await this.store.db
      .collection<SharedPreview>('publicationvocabularypreview')
      .updateOne({ brandId: this.ctx.brandId, id }, { $set: { state: 'applied', appliedBy: this.ctx.userId, result } });
    return result;
  }
  async listSyncRuns(query: { sourceId?: string; limit?: number; offset?: number }) {
    const legacyRuns = await this.store.db
      .collection('figsharevocabularysyncrun')
      .find({
        $and: [
          legacyVocabularyMatch('branding', this.ctx.brandId),
          ...(query.sourceId ? [legacyVocabularyMatch('source', query.sourceId)] : []),
        ],
      })
      .sort({ createdAt: -1 })
      .toArray();
    const sources = query.sourceId
      ? [await this.source(query.sourceId)]
      : await this.store.sources.find({ brandId: this.ctx.brandId, provider: 'figshare' }).toArray();
    const previews = await this.store.db
      .collection<SharedPreview>('publicationvocabularypreview')
      .find({
        brandId: this.ctx.brandId,
        ...(query.sourceId ? { $or: [{ sourceId: query.sourceId }, { 'result.sourceId': query.sourceId }] } : {}),
      })
      .toArray();
    const rows = legacyRuns.map(run => ({
      id: String(run._id),
      state: String(run.state),
      scope: String(run.scope),
      taxonomyId: String(run.taxonomyId),
      sourceId: run.source == null ? null : String(run.source),
      summary: run.summary ?? {},
      requestedBy: run.requestedBy,
      appliedBy: run.appliedBy ?? null,
      appliedAt: run.appliedAt ?? null,
      expiresAt: run.expiresAt,
      errorCode: run.errorCode ?? null,
    }));
    const seen = new Set(rows.map(row => row.id));
    for (const preview of previews) {
      seen.add(preview.id);
      rows.unshift({
        id: preview.id,
        state: preview.state,
        scope: preview.catalogue.scope,
        taxonomyId: preview.catalogue.catalogueId,
        sourceId: preview.result?.sourceId ?? preview.sourceId ?? null,
        summary: preview.summary,
        requestedBy: preview.requestedBy,
        appliedBy: preview.appliedBy ?? null,
        appliedAt: preview.result?.appliedAt ?? null,
        expiresAt: preview.expiresAt,
        errorCode: null,
      });
    }
    for (const source of sources)
      for (const item of source.imports)
        if (!seen.has(item.id)) {
          rows.unshift({
            id: item.id,
            state: String(item.evidence?.state ?? 'applied'),
            scope: source.scope,
            taxonomyId: source.catalogueId,
            sourceId: source.id,
            summary: {},
            requestedBy: item.actor,
            appliedBy: item.actor,
            appliedAt: item.at,
            expiresAt: null,
            errorCode: null,
          });
        }
    return this.page(rows, query);
  }
}
