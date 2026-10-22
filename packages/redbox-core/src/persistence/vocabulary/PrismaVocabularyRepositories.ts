import type { CorePrismaClient } from '../prisma/client';
import type { MongoFilterExpr } from '@prisma/orm-mongo/query-ast';
import { prismaModelValues } from '../prisma/modelValues';
import { prismaModelFilter } from '../prisma/modelFilter';
import type { VocabularyPage } from './VocabularyRepositories';
import type {
  VocabularyRepositories,
  VocabularyRow,
  EntryRow,
  SourceRow,
  CategoryRow,
  CrosswalkRow,
  MappingRow,
  SyncRunRow,
} from './VocabularyRepositories';
import { vocabularySelection, entrySelection, entryLookup, sourceSelection, crosswalkSelection } from './selections';
import {
  encodeVocabulary,
  prepareVocabulary,
  encodePreparedVocabulary,
  decodeVocabulary,
  vocabularyCriteria,
  vocabularySort,
  vocabularyOperation,
} from './physical';
import { legacyModelPage } from '../pagination';
/** Model CRUD over the existing physical contract. No transactions or retries. */
export function prismaVocabularyRepositories(
  client: CorePrismaClient,
  findBrand: (name: string) => Promise<{ id: string } | null>
): VocabularyRepositories {
  type Collection =
    | 'vocabulary'
    | 'vocabularyentry'
    | 'figsharevocabularysource'
    | 'figsharevocabularycategory'
    | 'figsharevocabularycrosswalk'
    | 'figsharevocabularycrosswalkmapping'
    | 'figsharevocabularysyncrun';
  const updates = {
    vocabulary: (where: MongoFilterExpr, values: Record<string, unknown>) =>
      client.orm.vocabulary.where(where).update(values),
    vocabularyentry: (where: MongoFilterExpr, values: Record<string, unknown>) =>
      client.orm.vocabularyentry.where(where).update(values),
    figsharevocabularysource: (where: MongoFilterExpr, values: Record<string, unknown>) =>
      client.orm.figsharevocabularysource.where(where).update(values),
    figsharevocabularycategory: (where: MongoFilterExpr, values: Record<string, unknown>) =>
      client.orm.figsharevocabularycategory.where(where).update(values),
    figsharevocabularycrosswalk: (where: MongoFilterExpr, values: Record<string, unknown>) =>
      client.orm.figsharevocabularycrosswalk.where(where).update(values),
    figsharevocabularycrosswalkmapping: (where: MongoFilterExpr, values: Record<string, unknown>) =>
      client.orm.figsharevocabularycrosswalkmapping.where(where).update(values),
    figsharevocabularysyncrun: (where: MongoFilterExpr, values: Record<string, unknown>) =>
      client.orm.figsharevocabularysyncrun.where(where).update(values),
  };
  const where = (collection: Collection, lookup: object): MongoFilterExpr =>
    prismaModelFilter(vocabularyCriteria(collection, lookup));
  const list = async <T>(collection: Collection, lookup: object, options?: VocabularyPage): Promise<T[]> => {
    const page = legacyModelPage(options?.offset, options?.limit);
    if (page.limit === 0) return [];
    let query = client.orm[collection].where(where(collection, lookup));
    if (options?.sort !== undefined) query = query.orderBy(vocabularySort(collection, options.sort));
    query = query.offset(page.skip);
    if (page.limit !== undefined) query = query.limit(page.limit);
    return (await query.all().toArray()).map(row => decodeVocabulary<T>(collection, row, true)!);
  };
  const one = async <T extends { id: string }>(collection: Collection, lookup: object): Promise<T | null> =>
    decodeVocabulary<T>(collection, await client.orm[collection].where(where(collection, lookup)).first(), true);
  const count = async (collection: Collection, lookup: object): Promise<number> =>
    (await client.orm[collection].where(where(collection, lookup)).select('_id').all().toArray()).length;
  const findEntry: VocabularyRepositories['getEntry'] = lookup =>
    vocabularyOperation(() => one<EntryRow>('vocabularyentry', entryLookup(lookup)));
  const create = async <T>(collection: Collection, values: Record<string, unknown>): Promise<T> =>
    decodeVocabulary<T>(
      collection,
      await client.orm[collection].create(
        prismaModelValues(await encodeVocabulary(collection, values, false, findEntry, findBrand))
      ),
      true
    )!;
  const revise = async <T>(
    collection: Collection,
    lookup: object,
    values: Record<string, unknown>
  ): Promise<T | null> => {
    const patch = await encodeVocabulary(collection, values, true, findEntry, findBrand);
    // update() emits a single conditional findAndModify, retaining state predicates at
    // the write. In particular only one overlapping previewed -> applying claim wins.
    return decodeVocabulary<T>(
      collection,
      await updates[collection](where(collection, lookup), prismaModelValues(patch)),
      true
    );
  };
  const remove = async (collection: Collection, lookup: object, single = false): Promise<void> => {
    const query = client.orm[collection].where(where(collection, lookup));
    if (single) await query.delete();
    else await query.deleteAndCount();
  };
  return {
    getVocabulary: lookup => vocabularyOperation(() => one<VocabularyRow>('vocabulary', lookup)),
    listVocabularies: (filter, options) =>
      vocabularyOperation(() => list<VocabularyRow>('vocabulary', vocabularySelection(filter), options)),
    countVocabularies: filter => vocabularyOperation(() => count('vocabulary', vocabularySelection(filter))),
    createVocabulary: values => vocabularyOperation(() => create<VocabularyRow>('vocabulary', values)),
    reviseVocabulary: (id, values) => vocabularyOperation(() => revise<VocabularyRow>('vocabulary', { id }, values)),
    removeVocabulary: id => vocabularyOperation(() => remove('vocabulary', { id }, true)),
    getEntry: findEntry,
    listEntries: (filter, options) =>
      vocabularyOperation(() => list<EntryRow>('vocabularyentry', entrySelection(filter), options)),
    countEntries: filter => vocabularyOperation(() => count('vocabularyentry', entrySelection(filter))),
    createEntry: values => vocabularyOperation(() => create<EntryRow>('vocabularyentry', values)),
    reviseEntry: (id, values) => vocabularyOperation(() => revise<EntryRow>('vocabularyentry', { id }, values)),
    getSource: lookup => vocabularyOperation(() => one<SourceRow>('figsharevocabularysource', lookup)),
    listSources: (filter, options) =>
      vocabularyOperation(() => list<SourceRow>('figsharevocabularysource', sourceSelection(filter), options)),
    countSources: filter => vocabularyOperation(() => count('figsharevocabularysource', sourceSelection(filter))),
    createSource: values => vocabularyOperation(() => create<SourceRow>('figsharevocabularysource', values)),
    reviseSource: (id, values) =>
      vocabularyOperation(() => revise<SourceRow>('figsharevocabularysource', { id }, values)),
    removeSource: id => vocabularyOperation(() => remove('figsharevocabularysource', { id }, true)),
    getCategory: lookup => vocabularyOperation(() => one<CategoryRow>('figsharevocabularycategory', lookup)),
    listCategories: filter => vocabularyOperation(() => list<CategoryRow>('figsharevocabularycategory', filter)),
    countCategories: filter => vocabularyOperation(() => count('figsharevocabularycategory', filter)),
    createCategory: values => vocabularyOperation(() => create<CategoryRow>('figsharevocabularycategory', values)),
    reviseCategory: (id, values) =>
      vocabularyOperation(() => revise<CategoryRow>('figsharevocabularycategory', { id }, values)),
    getCrosswalk: lookup => vocabularyOperation(() => one<CrosswalkRow>('figsharevocabularycrosswalk', lookup)),
    listCrosswalks: (filter, options) =>
      vocabularyOperation(() => list<CrosswalkRow>('figsharevocabularycrosswalk', crosswalkSelection(filter), options)),
    countCrosswalks: filter =>
      vocabularyOperation(() => count('figsharevocabularycrosswalk', crosswalkSelection(filter))),
    createCrosswalk: values => vocabularyOperation(() => create<CrosswalkRow>('figsharevocabularycrosswalk', values)),
    reviseCrosswalk: (id, values) =>
      vocabularyOperation(() => revise<CrosswalkRow>('figsharevocabularycrosswalk', { id }, values)),
    removeCrosswalk: id => vocabularyOperation(() => remove('figsharevocabularycrosswalk', { id }, true)),
    getMapping: lookup => vocabularyOperation(() => one<MappingRow>('figsharevocabularycrosswalkmapping', lookup)),
    listMappings: filter => vocabularyOperation(() => list<MappingRow>('figsharevocabularycrosswalkmapping', filter)),
    countMappings: filter => vocabularyOperation(() => count('figsharevocabularycrosswalkmapping', filter)),
    createMapping: values =>
      vocabularyOperation(() => create<MappingRow>('figsharevocabularycrosswalkmapping', values)),
    reviseMapping: (id, values) =>
      vocabularyOperation(() => revise<MappingRow>('figsharevocabularycrosswalkmapping', { id }, values)),
    getRun: lookup => vocabularyOperation(() => one<SyncRunRow>('figsharevocabularysyncrun', lookup)),
    listRuns: (filter, options) =>
      vocabularyOperation(() => list<SyncRunRow>('figsharevocabularysyncrun', filter, options)),
    countRuns: filter => vocabularyOperation(() => count('figsharevocabularysyncrun', filter)),
    createRun: values => vocabularyOperation(() => create<SyncRunRow>('figsharevocabularysyncrun', values)),
    createEntries: values =>
      vocabularyOperation(async () => {
        // Waterline validates every batch row before a single ordered insertMany. Callback reads run together.
        const now = new Date().toISOString();
        const prepared = values.map(v => prepareVocabulary('vocabularyentry', v, false, now));
        const docs = await Promise.all(
          prepared.map(v => encodePreparedVocabulary('vocabularyentry', v, false, findEntry, findBrand))
        );
        if (!docs.length) return [];
        return (await client.orm.vocabularyentry.createAll(docs.map(prismaModelValues))).map(
          doc => decodeVocabulary<EntryRow>('vocabularyentry', doc, true)!
        );
      }),
    removeVocabularyEntries: vocabulary => vocabularyOperation(() => remove('vocabularyentry', { vocabulary })),
    removeSourceCategories: source => vocabularyOperation(() => remove('figsharevocabularycategory', { source })),
    removeMappings: filter => vocabularyOperation(() => remove('figsharevocabularycrosswalkmapping', filter)),
    changeRunState: (id, from, values) =>
      vocabularyOperation(() => revise<SyncRunRow>('figsharevocabularysyncrun', { id, state: from }, values)),
    expirePreviews: (branding, before) =>
      vocabularyOperation(async () => {
        const patch = prismaModelValues(
          await encodeVocabulary('figsharevocabularysyncrun', { state: 'expired' }, true, findEntry, findBrand)
        );
        const predicate = where('figsharevocabularysyncrun', {
          branding,
          state: ['fetching', 'previewed'],
          expiresAt: { '<': before },
        });
        // updateAll selects IDs before writing. Recheck each original predicate so
        // a concurrently applying preview cannot be expired by a stale selection.
        for (const row of await client.orm.figsharevocabularysyncrun.where(predicate).select('_id').all().toArray())
          await client.orm.figsharevocabularysyncrun.where(predicate).where({ _id: row._id }).update(patch);
      }),
  };
}
