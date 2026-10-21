import { legacyVocabularyMatch } from './mongo';
export { vocabularyEntries } from './mongo';
import type { ObjectId, Db, Document } from 'mongodb';
import { publicationDigest } from '../publication/canonical';
import type { PublicationObject } from '../publication/contracts';
import { PublicationVocabularyError, targetIdentity } from './contracts';
import type {
  PublicationVocabularySource,
  PublicationVocabularyCrosswalk,
  PublicationCrosswalkMapping,
  PublicationTargetTerm,
} from './contracts';
import { PublicationVocabularyStore, boundedVocabularyDocument, sealVocabularyRevision } from './store';
import { isDuplicateKey } from '../publication/ownership';

export interface VocabularyConversionOptions {
  brandId: string;
  actor: string;
  apply?: boolean;
  reason?: string;
  settledWriterIds?: string[];
  settlementEvidence?: string;
  confirmLegacyWritersStopped?: boolean;
}
function json(row: Document): PublicationObject {
  return JSON.parse(JSON.stringify(row));
}
function text(row: Document, key: string): string {
  const value = row[key];
  return value == null ? '' : String(value);
}
function id(row: Document): string {
  return text(row, '_id') || text(row, 'id');
}
function required(row: Document, key: string): string {
  const value = text(row, key);
  if (!value) throw new PublicationVocabularyError(`Legacy vocabulary evidence lacks ${key}`, 409);
  return value;
}
function withoutMongoId(row: Document): Document {
  const copy = { ...row };
  delete copy._id;
  return copy;
}
/** Legacy collections remain immutable evidence. IDs are retained exactly, so no lossy translation is needed. */
export async function convertPublicationVocabulary(
  db: Db,
  options: VocabularyConversionOptions,
  afterStep: (step: string) => Promise<void> = async () => {}
): Promise<unknown> {
  if (!options.brandId.trim() || !options.actor.trim() || (options.apply && !options.reason?.trim()))
    throw new PublicationVocabularyError('Explicit brand, actor and apply reason are required');
  const store = new PublicationVocabularyStore(db);
  let existingControl = await store.control(options.brandId);
  if (existingControl?.state === 'committed')
    return { ...(existingControl.report ?? {}), state: 'committed', dryRun: !options.apply };
  if (options.apply && options.settledWriterIds?.length) {
    const writerIds = [...new Set(options.settledWriterIds)].sort();
    if (
      !options.confirmLegacyWritersStopped ||
      !options.settlementEvidence?.trim() ||
      !options.reason?.trim() ||
      writerIds.some(id => typeof id !== 'string' || !id.trim())
    )
      throw new PublicationVocabularyError(
        'Settling crashed legacy writers requires stopped-process confirmation, an evidence reference and a reason',
        409
      );
    const priorSettlement = existingControl?.settlements?.some(
      row =>
        row.evidenceReference === options.settlementEvidence &&
        JSON.stringify([...row.writerIds].sort()) === JSON.stringify(writerIds)
    );
    if (!priorSettlement) {
      if (existingControl?.state !== 'legacy' || writerIds.some(id => !existingControl!.writers.includes(id)))
        throw new PublicationVocabularyError(
          'Settlement must identify currently retained legacy writer admissions',
          409
        );
      const settled = await store.controls.updateOne(
        { brandId: options.brandId, state: 'legacy', writers: { $all: writerIds } },
        {
          $pull: { writers: { $in: writerIds }, writerOwners: { id: { $in: writerIds } } },
          $push: {
            settlements: {
              actor: options.actor,
              at: new Date().toISOString(),
              reason: options.reason,
              evidenceReference: options.settlementEvidence,
              writerIds,
            },
          },
        }
      );
      if (!settled.matchedCount)
        throw new PublicationVocabularyError(
          'Legacy writer admissions changed; reload the inventory before settlement',
          409
        );
    }
    existingControl = await store.control(options.brandId);
    await afterStep('writers_settled');
  }
  const owned = legacyVocabularyMatch('branding', options.brandId);
  const sources = await db.collection('figsharevocabularysource').find(owned).sort({ _id: 1 }).toArray();
  const crosswalks = await db.collection('figsharevocabularycrosswalk').find(owned).sort({ _id: 1 }).toArray();
  const sourceIds = sources.map(id);
  const crosswalkIds = crosswalks.map(id);
  const categories = await db
    .collection('figsharevocabularycategory')
    .find(legacyVocabularyMatch('source', sourceIds))
    .sort({ _id: 1 })
    .toArray();
  const mappings = await db
    .collection('figsharevocabularycrosswalkmapping')
    .find(legacyVocabularyMatch('crosswalk', crosswalkIds))
    .sort({ _id: 1 })
    .toArray();
  const runs = await db.collection('figsharevocabularysyncrun').find(owned).sort({ _id: 1 }).toArray();
  const vocabularyIds = [
    ...sources.map(row => text(row, 'vocabulary')),
    ...crosswalks.map(row => text(row, 'localVocabulary')),
  ];
  const entries = await db
    .collection('vocabularyentry')
    .find(legacyVocabularyMatch('vocabulary', vocabularyIds))
    .sort({ _id: 1 })
    .toArray();
  const vocabularies = await db
    .collection<{ _id: string | ObjectId; branding?: string | ObjectId }>('vocabulary')
    .find(legacyVocabularyMatch('_id', vocabularyIds))
    .sort({ _id: 1 })
    .toArray();
  for (const vocabularyId of vocabularyIds) {
    const vocabulary = vocabularies.find(row => String(row._id) === vocabularyId);
    if (!vocabulary || String(vocabulary.branding) !== options.brandId)
      throw new PublicationVocabularyError('Legacy vocabulary reference crosses a brand boundary or is missing', 409);
  }
  const inventory = {
    vocabularies: vocabularies.map(json),
    sources: sources.map(json),
    crosswalks: crosswalks.map(json),
    categories: categories.map(json),
    mappings: mappings.map(json),
    runs: runs.map(json),
    entries: entries.map(json),
  };
  const fingerprint = publicationDigest(inventory);
  const convertedSources: PublicationVocabularySource[] = sources.map(source => {
    const sourceId = id(source);
    const namespace = `figshare:${options.brandId}:${required(source, 'scope')}:${required(source, 'taxonomyId')}`;
    const terms: PublicationTargetTerm[] = categories
      .filter(category => text(category, 'source') === sourceId)
      .map(category => {
        const categoryId = text(category, 'categoryId');
        if (!/^[1-9][0-9]*$/.test(categoryId) || !Number.isSafeInteger(Number(categoryId)))
          throw new PublicationVocabularyError('Invalid legacy Figshare category', 409);
        const entry = entries.find(row => id(row) === text(category, 'entry'));
        if (!entry || text(entry, 'vocabulary') !== text(source, 'vocabulary'))
          throw new PublicationVocabularyError('Legacy category has no mirrored entry', 409);
        return {
          id: targetIdentity(namespace, categoryId),
          namespace,
          value: categoryId,
          sourceId: required(category, 'sourceId'),
          label: text(entry, 'label').trim() || text(category, 'sourceId'),
          selectable: category.selectable !== false,
          historical: category.historical === true,
          firstSeenAt: required(category, 'firstSeenAt'),
          lastSeenAt: required(category, 'lastSeenAt'),
          evidence: { legacyCategoryId: id(category), category: json(category), entry: json(entry) },
        };
      });
    if (
      new Set(terms.map(term => term.id)).size !== terms.length ||
      new Set(terms.map(term => term.sourceId)).size !== terms.length
    )
      throw new PublicationVocabularyError('Duplicate legacy category identity', 409);
    for (const term of terms) {
      const parentSourceId = term.evidence?.category;
      if (parentSourceId && typeof parentSourceId === 'object' && !Array.isArray(parentSourceId)) {
        const parent = terms.find(row => row.sourceId === parentSourceId.parentSourceId);
        if (parent) term.parentId = parent.id;
      }
    }
    const history = runs.filter(run => text(run, 'source') === sourceId);
    return {
      schemaVersion: 1,
      brandId: options.brandId,
      id: sourceId,
      provider: 'figshare',
      scope: text(source, 'scope'),
      catalogueId: text(source, 'taxonomyId'),
      namespace,
      displayName: required(source, 'displayName'),
      version: 1,
      archived: source.archived === true,
      terms,
      imports: history.map(run => ({
        id: id(run),
        at: text(run, 'appliedAt') || text(run, 'createdAt'),
        actor: text(run, 'appliedBy') || text(run, 'requestedBy'),
        digest: publicationDigest(json(run)),
        evidence: json(run),
      })),
      legacy: json(source),
    };
  });
  const convertedCrosswalks: PublicationVocabularyCrosswalk[] = crosswalks.map(crosswalk => {
    const source = convertedSources.find(row => row.id === text(crosswalk, 'figshareSource'));
    if (!source)
      throw new PublicationVocabularyError('Legacy crosswalk source crosses a brand boundary or is missing', 409);
    const localVocabularyId = required(crosswalk, 'localVocabulary');
    const localEntries = entries
      .filter(row => text(row, 'vocabulary') === localVocabularyId)
      .map(row => ({
        id: id(row),
        label: text(row, 'label'),
        value: text(row, 'value'),
        codes: [...new Set([text(row, 'valueLower') || text(row, 'value'), text(row, 'identifier')].filter(Boolean))],
      }));
    const rows = mappings.filter(row => text(row, 'crosswalk') === id(crosswalk));
    const workingRevision = Number(crosswalk.workingRevision);
    const approvedRevision = crosswalk.approvedRevision == null ? undefined : Number(crosswalk.approvedRevision);
    if (
      !Number.isSafeInteger(workingRevision) ||
      workingRevision < 1 ||
      (approvedRevision !== undefined &&
        (!Number.isSafeInteger(approvedRevision) || approvedRevision < 1 || approvedRevision > workingRevision))
    )
      throw new PublicationVocabularyError('Invalid legacy crosswalk revisions', 409);
    const revisions = [
      ...new Set([
        workingRevision,
        ...(approvedRevision ? [approvedRevision] : []),
        ...rows.map(row => Number(row.revision)),
      ]),
    ]
      .sort((a, b) => a - b)
      .map(revision => {
        if (!Number.isSafeInteger(revision) || revision < 1)
          throw new PublicationVocabularyError('Invalid legacy mapping revision', 409);
        const revisionRows = rows.filter(row => Number(row.revision) === revision);
        const edges: PublicationCrosswalkMapping[] = revisionRows.map(row => {
          const target = source.terms.find(term => term.evidence?.legacyCategoryId === text(row, 'figshareCategory'));
          if (
            !target ||
            !localEntries.some(entry => entry.id === text(row, 'localEntry')) ||
            !['proposed', 'approved', 'rejected'].includes(text(row, 'status'))
          )
            throw new PublicationVocabularyError('Legacy mapping crosses its vocabulary/source boundary', 409);
          const status = row.status === 'approved' ? 'approved' : row.status === 'rejected' ? 'rejected' : 'proposed';
          return {
            id: id(row),
            localEntryId: text(row, 'localEntry'),
            targetId: target.id,
            status,
            matchType: text(row, 'matchType'),
            ...(row.approvedAt ? { approvedAt: text(row, 'approvedAt') } : {}),
            ...(row.approvedBy ? { approvedBy: text(row, 'approvedBy') } : {}),
            evidence: json(row),
          };
        });
        const approved = approvedRevision !== undefined && revision <= approvedRevision;
        const attribution =
          revision === approvedRevision
            ? crosswalk
            : revisionRows.find(row => row.status === 'approved' && row.approvedAt && row.approvedBy);
        if (approved && (!attribution?.approvedAt || !attribution.approvedBy))
          throw new PublicationVocabularyError(
            'Legacy approval attribution is missing; repair evidence before conversion',
            409
          );
        return sealVocabularyRevision({
          revision,
          mappings: edges,
          entries: localEntries,
          targets: source.terms,
          ...(approved && attribution
            ? { approvedAt: text(attribution, 'approvedAt'), approvedBy: text(attribution, 'approvedBy') }
            : {}),
          auditReferences: [
            ...new Set(
              [text(source.legacy ?? {}, 'lastSyncRun'), ...revisionRows.map(row => text(row, 'id') || id(row))].filter(
                Boolean
              )
            ),
          ],
        });
      });
    return {
      schemaVersion: 1,
      brandId: options.brandId,
      id: id(crosswalk),
      name: required(crosswalk, 'name'),
      sourceId: source.id,
      localVocabularyId,
      normalizer: 'figshare-code-v1',
      version: 1,
      status: crosswalk.status === 'archived' ? 'archived' : crosswalk.status === 'approved' ? 'approved' : 'draft',
      workingRevision,
      ...(approvedRevision ? { approvedRevision } : {}),
      updatedBy: required(crosswalk, 'updatedBy'),
      revisions,
      legacy: json(crosswalk),
    };
  });
  for (const row of [...convertedSources, ...convertedCrosswalks]) boundedVocabularyDocument(row);
  const control = await store.control(options.brandId);
  if (control?.fingerprint && control.fingerprint !== fingerprint)
    throw new PublicationVocabularyError(
      'Legacy vocabulary evidence changed after conversion began; retain the fence and investigate',
      409
    );
  const report = {
    brandId: options.brandId,
    fingerprint,
    sources: sources.length,
    terms: categories.length,
    crosswalks: crosswalks.length,
    mappings: mappings.length,
    imports: runs.length,
    revisions: convertedCrosswalks.reduce((count, row) => count + row.revisions.length, 0),
    identity: 'preserved',
    state: control?.state ?? 'legacy',
    dryRun: !options.apply,
    pendingLegacyWriterIds: control?.writers ?? [],
    legacyWriterAdmissions: control?.writerOwners ?? [],
  };
  if (!options.apply) return report;
  await store.ensureIndexes();
  if (control?.state === 'committed') return { ...report, state: 'committed', dryRun: false };
  if (!control) {
    try {
      await store.controls.insertOne({ schemaVersion: 1, brandId: options.brandId, state: 'legacy', writers: [] });
    } catch (error) {
      if (!isDuplicateKey(error)) throw error;
    }
  }
  const fenced = await store.controls.findOneAndUpdate(
    { brandId: options.brandId, state: 'legacy', writers: { $size: 0 } },
    { $set: { state: 'converting', fingerprint, actor: options.actor, reason: options.reason } },
    { returnDocument: 'after' }
  );
  const current = fenced ?? (await store.control(options.brandId));
  if (!current || current.state !== 'converting' || current.fingerprint !== fingerprint)
    throw new PublicationVocabularyError('Legacy vocabulary writers must drain before conversion', 409);
  await afterStep('fenced');
  // Re-read under the durable fence: no legacy mutation may slip between inventory and authority change.
  const fresh = await convertPublicationVocabularyInventoryFingerprint(db, options.brandId);
  if (fresh !== fingerprint)
    throw new PublicationVocabularyError('Legacy evidence changed during inventory; conversion remains fenced', 409);
  for (const row of convertedSources) {
    await store.sources.updateOne({ brandId: row.brandId, id: row.id }, { $setOnInsert: row }, { upsert: true });
    if (
      publicationDigest(json(withoutMongoId(await store.source(row.brandId, row.id)))) !==
      publicationDigest(JSON.parse(JSON.stringify(row)))
    )
      throw new PublicationVocabularyError('Converted source differs from original evidence', 409);
    await afterStep(`source:${row.id}`);
  }
  for (const row of convertedCrosswalks) {
    await store.crosswalks.updateOne({ brandId: row.brandId, id: row.id }, { $setOnInsert: row }, { upsert: true });
    if (
      publicationDigest(json(withoutMongoId(await store.crosswalk(row.brandId, row.id)))) !==
      publicationDigest(JSON.parse(JSON.stringify(row)))
    )
      throw new PublicationVocabularyError('Converted crosswalk differs from original evidence', 409);
    await afterStep(`crosswalk:${row.id}`);
  }
  await afterStep('verified');
  const committed = await store.controls.updateOne(
    { brandId: options.brandId, state: 'converting', fingerprint, writers: { $size: 0 } },
    { $set: { state: 'committed', convertedAt: new Date().toISOString(), report } }
  );
  if (!committed.matchedCount) throw new PublicationVocabularyError('Vocabulary conversion authority changed', 409);
  await afterStep('committed');
  return { ...report, state: 'committed', dryRun: false };
}
async function convertPublicationVocabularyInventoryFingerprint(db: Db, brandId: string): Promise<string> {
  const report = await convertPublicationVocabulary(db, { brandId, actor: 'verification' });
  if (!report || typeof report !== 'object' || !('fingerprint' in report) || typeof report.fingerprint !== 'string')
    throw new Error('Invalid vocabulary inventory');
  return report.fingerprint;
}
