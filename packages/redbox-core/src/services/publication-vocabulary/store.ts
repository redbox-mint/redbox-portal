import { legacyVocabularyMatch } from './mongo';
import { randomUUID } from 'node:crypto';
import { cloneDeep } from 'lodash';
import type { Db, Collection, ObjectId } from 'mongodb';
import { publicationDigest } from '../publication/canonical';
import { isDuplicateKey } from '../publication/ownership';
import { resolvePublicationVocabulary } from './resolution';
import { PublicationVocabularyError, targetIdentity } from './contracts';
import type {
  PublicationVocabularySource,
  PublicationSourceImport,
  PublicationVocabularyActor,
  PublicationVocabularyCrosswalk,
  PublicationCrosswalkMapping,
  PublicationVocabularyEntry,
  PublicationVocabularyResolveInput,
  PublicationCrosswalkRevision,
} from './contracts';

export interface VocabularyConversionControl {
  schemaVersion: 1;
  brandId: string;
  state: 'legacy' | 'converting' | 'committed';
  writers: string[];
  writerOwners?: Array<{ id: string; host: string; pid: number; startedAt: string }>;
  fingerprint?: string;
  reason?: string;
  actor?: string;
  convertedAt?: string;
  report?: import('../publication/contracts').PublicationObject;
  settlements?: Array<{ actor: string; at: string; reason: string; evidenceReference: string; writerIds: string[] }>;
}
export function boundedVocabularyDocument(value: unknown): void {
  if (Buffer.byteLength(JSON.stringify(value)) > 8 * 1024 * 1024)
    throw new PublicationVocabularyError(
      'Vocabulary history exceeds the safe document limit; archive or partition this catalogue before continuing',
      409
    );
}
export function sealVocabularyRevision(
  value: Omit<PublicationCrosswalkRevision, 'digest'>
): PublicationCrosswalkRevision {
  const snapshot: Omit<PublicationCrosswalkRevision, 'digest'> = JSON.parse(JSON.stringify(value));
  Reflect.deleteProperty(snapshot, 'digest');
  return { ...snapshot, digest: publicationDigest(JSON.parse(JSON.stringify(snapshot))) };
}
export class PublicationVocabularyStore {
  readonly sources: Collection<PublicationVocabularySource>;
  readonly crosswalks: Collection<PublicationVocabularyCrosswalk>;
  readonly controls: Collection<VocabularyConversionControl>;
  constructor(readonly db: Db) {
    const options = { writeConcern: { w: 'majority' as const, j: true } };
    this.sources = db.collection('publicationvocabularysource', options);
    this.crosswalks = db.collection('publicationvocabularycrosswalk', options);
    this.controls = db.collection('publicationvocabularyconversion', options);
  }
  async ensureIndexes(): Promise<void> {
    await this.sources.createIndex({ brandId: 1, id: 1 }, { unique: true });
    await this.sources.createIndex({ brandId: 1, provider: 1, scope: 1, catalogueId: 1 }, { unique: true });
    await this.crosswalks.createIndex({ brandId: 1, id: 1 }, { unique: true });
    await this.controls.createIndex({ brandId: 1 }, { unique: true });
  }
  async control(brandId: string): Promise<VocabularyConversionControl | null> {
    const row = await this.controls.findOne({ brandId });
    if (
      row &&
      (row.schemaVersion !== 1 ||
        !['legacy', 'converting', 'committed'].includes(row.state) ||
        !Array.isArray(row.writers))
    )
      throw new PublicationVocabularyError(
        'Unsupported vocabulary conversion authority; retain evidence and investigate',
        409
      );
    return row;
  }
  async source(brandId: string, id: string): Promise<PublicationVocabularySource> {
    const row = await this.sources.findOne({ brandId, id });
    if (!row || row.schemaVersion !== 1) throw new PublicationVocabularyError('Source unavailable for this brand', 404);
    return row;
  }
  async crosswalk(brandId: string, id: string): Promise<PublicationVocabularyCrosswalk> {
    const row = await this.crosswalks.findOne({ brandId, id });
    if (!row || row.schemaVersion !== 1)
      throw new PublicationVocabularyError('Crosswalk unavailable for this brand', 404);
    return row;
  }
  async assertLocalVocabulary(brandId: string, id: string): Promise<void> {
    const row = await this.db
      .collection<{ _id: string | ObjectId; branding?: string | ObjectId; readOnly?: boolean }>('vocabulary')
      .findOne({ $and: [legacyVocabularyMatch('_id', id), legacyVocabularyMatch('branding', brandId)] });
    if (!row || row.readOnly === true)
      throw new PublicationVocabularyError('Local vocabulary does not belong to this brand or is read-only', 404);
  }
  async importSource(
    input: PublicationSourceImport,
    actor: PublicationVocabularyActor
  ): Promise<PublicationVocabularySource> {
    if (
      ![
        input.provider,
        input.scope,
        input.catalogueId,
        input.namespace,
        input.displayName,
        input.importId,
        actor.brandId,
        actor.userId,
      ].every(value => typeof value === 'string' && value.trim())
    )
      throw new PublicationVocabularyError('Complete source identity, import identity and actor are required');
    if (!Array.isArray(input.terms) || input.terms.length > 20000)
      throw new PublicationVocabularyError('Import supports at most 20000 terms');
    const seen = new Set<string>();
    for (const term of input.terms) {
      if (
        term.namespace !== input.namespace ||
        term.id !== targetIdentity(term.namespace, term.value) ||
        !term.label.trim() ||
        !term.sourceId.trim() ||
        typeof term.selectable !== 'boolean' ||
        seen.has(term.id)
      )
        throw new PublicationVocabularyError('Invalid or duplicate target identity');
      seen.add(term.id);
    }
    if (input.terms.some(term => term.parentId && !seen.has(term.parentId)))
      throw new PublicationVocabularyError('Target parent is outside the imported source');
    const existing = input.id
      ? await this.source(actor.brandId, input.id)
      : await this.sources.findOne({
          brandId: actor.brandId,
          provider: input.provider,
          scope: input.scope,
          catalogueId: input.catalogueId,
        });
    if (
      existing &&
      (existing.provider !== input.provider ||
        existing.scope !== input.scope ||
        existing.catalogueId !== input.catalogueId ||
        existing.namespace !== input.namespace)
    )
      throw new PublicationVocabularyError('A source cannot be reassigned to a different catalogue', 409);
    const digest = publicationDigest(JSON.parse(JSON.stringify(input.terms)));
    const priorImport = existing?.imports.find(row => row.id === input.importId);
    if (priorImport) {
      if (priorImport.digest !== digest)
        throw new PublicationVocabularyError('Import ID was already used for different content', 409);
      return existing!;
    }
    if (existing && existing.version !== input.expectedVersion)
      throw new PublicationVocabularyError('Source changed; reload before importing', 409);
    const now = new Date().toISOString();
    const old = new Map(existing?.terms.map(term => [term.id, term]));
    const terms = input.terms.map(term => ({
      ...cloneDeep(term),
      ...(old.get(term.id)?.evidence ? { evidence: { ...old.get(term.id)!.evidence, ...term.evidence } } : {}),
      historical: false,
      firstSeenAt: old.get(term.id)?.firstSeenAt ?? now,
      lastSeenAt: now,
    }));
    for (const term of existing?.terms ?? []) if (!seen.has(term.id)) terms.push({ ...term, historical: true });
    const next: PublicationVocabularySource = {
      schemaVersion: 1,
      brandId: actor.brandId,
      id: existing?.id ?? randomUUID(),
      provider: input.provider,
      scope: input.scope,
      catalogueId: input.catalogueId,
      namespace: input.namespace,
      displayName: input.displayName,
      version: (existing?.version ?? 0) + 1,
      archived: false,
      terms,
      imports: [...(existing?.imports ?? []), { id: input.importId, at: now, actor: actor.userId, digest }],
      ...(existing?.legacy ? { legacy: existing.legacy } : {}),
    };
    boundedVocabularyDocument(next);
    if (existing) {
      const result = await this.sources.replaceOne(
        { brandId: actor.brandId, id: existing.id, version: existing.version },
        next
      );
      if (!result.matchedCount) throw new PublicationVocabularyError('Concurrent source import; reload', 409);
    } else {
      try {
        await this.sources.insertOne(next);
      } catch (error) {
        if (isDuplicateKey(error)) throw new PublicationVocabularyError('Source already imported; reload', 409);
        throw error;
      }
    }
    return next;
  }
  async createCrosswalk(
    input: {
      name: string;
      sourceId: string;
      localVocabularyId: string;
      normalizer?: PublicationVocabularyCrosswalk['normalizer'];
      id?: string;
    },
    actor: PublicationVocabularyActor
  ): Promise<PublicationVocabularyCrosswalk> {
    if (!input.name.trim() || !input.localVocabularyId.trim())
      throw new PublicationVocabularyError('Name and local vocabulary are required');
    const source = await this.source(actor.brandId, input.sourceId);
    if (source.archived) throw new PublicationVocabularyError('Source is archived', 409);
    const row: PublicationVocabularyCrosswalk = {
      schemaVersion: 1,
      brandId: actor.brandId,
      id: input.id ?? randomUUID(),
      name: input.name,
      sourceId: source.id,
      localVocabularyId: input.localVocabularyId,
      normalizer: input.normalizer ?? 'exact-v1',
      version: 1,
      status: 'draft',
      workingRevision: 1,
      updatedBy: actor.userId,
      revisions: [sealVocabularyRevision({ revision: 1, mappings: [], entries: [], targets: [], auditReferences: [] })],
    };
    await this.crosswalks.insertOne(row);
    return row;
  }
  async saveMappings(
    id: string,
    input: { version: number; mappings: PublicationCrosswalkMapping[] },
    entries: PublicationVocabularyEntry[],
    actor: PublicationVocabularyActor
  ): Promise<PublicationVocabularyCrosswalk> {
    const row = await this.crosswalk(actor.brandId, id);
    if (row.version !== input.version || row.status === 'archived')
      throw new PublicationVocabularyError('Crosswalk changed or archived; reload', 409);
    if (input.mappings.length > 10000) throw new PublicationVocabularyError('Mapping limit exceeded');
    const source = await this.source(actor.brandId, row.sourceId);
    const localIds = new Set(entries.map(entry => entry.id));
    const targets = new Set(source.terms.map(term => term.id));
    const edges = new Set<string>();
    const mappingIds = new Set<string>();
    for (const mapping of input.mappings) {
      const key = JSON.stringify([mapping.localEntryId, mapping.targetId]);
      if (
        typeof mapping.id !== 'string' ||
        !mapping.id.trim() ||
        mappingIds.has(mapping.id) ||
        typeof mapping.matchType !== 'string' ||
        !mapping.matchType.trim() ||
        !localIds.has(mapping.localEntryId) ||
        !targets.has(mapping.targetId) ||
        !['proposed', 'approved', 'rejected'].includes(mapping.status) ||
        edges.has(key)
      )
        throw new PublicationVocabularyError('Duplicate mapping or mapping outside its vocabulary/source');
      edges.add(key);
      mappingIds.add(mapping.id);
    }
    const workingRevision =
      row.workingRevision === row.approvedRevision ? row.workingRevision + 1 : row.workingRevision;
    const revision = sealVocabularyRevision({
      revision: workingRevision,
      entries: cloneDeep(entries),
      targets: cloneDeep(source.terms),
      mappings: input.mappings.map(mapping => ({
        ...cloneDeep(mapping),
        approvedAt: undefined,
        approvedBy: undefined,
      })),
      auditReferences: [],
    });
    const next = {
      ...row,
      workingRevision,
      version: row.version + 1,
      status: 'draft' as const,
      updatedBy: actor.userId,
      revisions: [...row.revisions.filter(item => item.revision !== workingRevision), revision],
    };
    await this.replaceCrosswalk(row, next);
    return next;
  }
  async approve(
    id: string,
    version: number,
    entries: PublicationVocabularyEntry[],
    actor: PublicationVocabularyActor
  ): Promise<PublicationVocabularyCrosswalk> {
    const row = await this.crosswalk(actor.brandId, id);
    if (row.version !== version || row.status === 'archived')
      throw new PublicationVocabularyError('Crosswalk changed or archived; reload', 409);
    if (row.approvedRevision === row.workingRevision) return row;
    const source = await this.source(actor.brandId, row.sourceId);
    if (source.archived) throw new PublicationVocabularyError('Source is archived', 409);
    const draft = row.revisions.find(item => item.revision === row.workingRevision)!;
    if (!draft.mappings.some(item => item.status !== 'rejected'))
      throw new PublicationVocabularyError('Approval requires at least one mapping');
    const at = new Date().toISOString();
    const localIds = new Set(entries.map(entry => entry.id));
    const targetIds = new Set(source.terms.map(target => target.id));
    if (draft.mappings.some(mapping => !localIds.has(mapping.localEntryId) || !targetIds.has(mapping.targetId)))
      throw new PublicationVocabularyError('Draft mappings no longer belong to this vocabulary/source', 409);
    const approved = sealVocabularyRevision({
      ...draft,
      entries: cloneDeep(entries),
      targets: cloneDeep(source.terms),
      mappings: draft.mappings.map(mapping =>
        mapping.status === 'rejected'
          ? mapping
          : { ...mapping, status: 'approved', approvedAt: at, approvedBy: actor.userId }
      ),
      approvedAt: at,
      approvedBy: actor.userId,
      auditReferences: [...draft.auditReferences, `publication-vocabulary:${row.id}:${row.workingRevision}`],
    });
    const next = {
      ...row,
      status: 'approved' as const,
      approvedRevision: row.workingRevision,
      version: row.version + 1,
      updatedBy: actor.userId,
      revisions: row.revisions.map(item => (item.revision === approved.revision ? approved : item)),
    };
    await this.replaceCrosswalk(row, next);
    return next;
  }
  async replaceCrosswalk(prior: PublicationVocabularyCrosswalk, next: PublicationVocabularyCrosswalk): Promise<void> {
    boundedVocabularyDocument(next);
    const result = await this.crosswalks.replaceOne(
      { brandId: prior.brandId, id: prior.id, version: prior.version },
      next
    );
    if (!result.matchedCount) throw new PublicationVocabularyError('Crosswalk changed; reload', 409);
  }
  async resolve(input: PublicationVocabularyResolveInput) {
    const row = await this.crosswalk(input.brandId, input.crosswalkId);
    if (input.revision === undefined && (await this.source(input.brandId, row.sourceId)).archived)
      throw new PublicationVocabularyError('Source is archived', 409);
    if (input.revision !== undefined) return resolvePublicationVocabulary(row, input);
    const source = await this.source(input.brandId, row.sourceId);
    // Live bindings retain catalogue retirement/label behaviour; explicit pins use the approval snapshot.
    return resolvePublicationVocabulary(
      {
        ...row,
        revisions: row.revisions.map(revision =>
          revision.revision === row.approvedRevision ? { ...revision, targets: source.terms } : revision
        ),
      },
      input
    );
  }
}
