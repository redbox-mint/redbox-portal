import type { Db, Document } from 'mongodb';
import type { PublicationVocabularyEntry } from './contracts';

/** Compare persisted string/BSON identities without passing BSON between different driver versions. */
export function legacyVocabularyMatch(field: string, ids: string | string[]): Document {
  const keys = [...new Set(Array.isArray(ids) ? ids : [ids])];
  return {
    $or: [
      { [field]: { $in: keys } },
      ...keys
        .filter(id => /^[a-f0-9]{24}$/i.test(id))
        .map(id => ({ $expr: { $eq: [`$${field}`, { $toObjectId: { $literal: id } }] } })),
    ],
  };
}
/** Create deterministic legacy BSON IDs on the server; existing rows are never replaced on replay. */
export async function insertLegacyVocabularyRow(
  db: Db,
  collection: 'vocabulary' | 'vocabularyentry',
  id: string,
  value: Document,
  objectIds: Record<string, string> = {}
): Promise<void> {
  await db
    .aggregate(
      [
        { $documents: { $literal: [value] } },
        {
          $set: Object.fromEntries(
            Object.entries({ ...objectIds, _id: id }).map(([field, key]) => [field, { $toObjectId: key }])
          ),
        },
        { $merge: { into: collection, on: '_id', whenMatched: 'keepExisting', whenNotMatched: 'insert' } },
      ],
      { writeConcern: { w: 'majority', j: true } }
    )
    .toArray();
}
export async function vocabularyEntries(db: Db, vocabularyId: string): Promise<PublicationVocabularyEntry[]> {
  const rows = await db.collection('vocabularyentry').find(legacyVocabularyMatch('vocabulary', vocabularyId)).toArray();
  return rows.map(row => ({
    id: String(row._id ?? row.id ?? ''),
    label: String(row.label ?? ''),
    value: String(row.value ?? ''),
    codes: [...new Set([String(row.value ?? ''), String(row.identifier ?? '')].filter(Boolean))],
  }));
}
