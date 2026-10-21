import { ObjectId, type Db } from 'mongodb';

export const crosswalkId = new ObjectId('0123456789abcdef01234567');
export const sourceId = new ObjectId('1123456789abcdef01234567');
export const localId = new ObjectId('2123456789abcdef01234567');
export const mirrorId = new ObjectId('3123456789abcdef01234567');
export const localEntryId = new ObjectId('4123456789abcdef01234567');
export const categoryIds = [new ObjectId('5123456789abcdef01234567'), new ObjectId('6123456789abcdef01234567')];

export async function seedLegacyVocabulary(db: Db) {
  await db.collection('figsharevocabularysource').insertOne({
    _id: sourceId,
    branding: 'brand',
    vocabulary: mirrorId,
    scope: 'account',
    taxonomyId: '1',
    displayName: 'Account taxonomy',
    createdBy: 'importer',
    updatedBy: 'importer',
    lastSyncRun: 'run-1',
    remoteHash: 'remote-original',
  });
  await db.collection('vocabulary').insertMany([
    { _id: localId, branding: 'brand', name: 'Local codes', source: 'local' },
    { _id: mirrorId, branding: 'brand', name: 'Mirror', source: 'external', readOnly: true },
  ]);
  const mirrors = [new ObjectId(), new ObjectId()];
  await db.collection('vocabularyentry').insertMany([
    {
      _id: localEntryId,
      vocabulary: localId,
      value: '300101',
      valueLower: '300101',
      identifier: 'https://example.org/for/300101',
      label: 'Local mathematics',
    },
    { _id: mirrors[0], vocabulary: mirrorId, value: '300101', label: 'Mathematics' },
    { _id: mirrors[1], vocabulary: mirrorId, value: 'removed', label: 'Historical subject' },
  ]);
  await db.collection('figsharevocabularycategory').insertMany(
    categoryIds.map((id, index) => ({
      _id: id,
      source: sourceId,
      entry: mirrors[index],
      sourceId: index ? 'removed' : '300101',
      categoryId: index ? 99 : 42,
      taxonomyId: '1',
      selectable: true,
      historical: index === 1,
      firstSeenAt: '2025-01-01T00:00:00Z',
      lastSeenAt: '2026-01-01T00:00:00Z',
      contentHash: `hash-${index}`,
    }))
  );
  await db.collection('figsharevocabularycrosswalk').insertOne({
    _id: crosswalkId,
    branding: 'brand',
    name: 'Approved mappings',
    localVocabulary: localId,
    figshareSource: sourceId,
    status: 'approved',
    workingRevision: 2,
    approvedRevision: 1,
    approvedAt: '2025-06-01T00:00:00Z',
    approvedBy: 'departed-approver',
    updatedBy: 'editor',
  });
  await db.collection('figsharevocabularycrosswalkmapping').insertMany([
    {
      crosswalk: crosswalkId,
      revision: 1,
      localEntry: localEntryId,
      figshareCategory: categoryIds[0],
      status: 'approved',
      matchType: 'manual',
      approvedAt: '2025-06-01T00:00:00Z',
      approvedBy: 'departed-approver',
      evidence: { auditId: 'audit-original' },
    },
    {
      crosswalk: crosswalkId,
      revision: 1,
      localEntry: localEntryId,
      figshareCategory: categoryIds[1],
      status: 'approved',
      matchType: 'manual',
      approvedAt: '2025-06-01T00:00:00Z',
      approvedBy: 'departed-approver',
    },
    {
      crosswalk: crosswalkId,
      revision: 2,
      localEntry: localEntryId,
      figshareCategory: categoryIds[1],
      status: 'proposed',
      matchType: 'manual',
    },
  ]);
  await db.collection('figsharevocabularysyncrun').insertOne({
    branding: 'brand',
    source: sourceId,
    scope: 'account',
    taxonomyId: '1',
    state: 'applied',
    requestedBy: 'importer',
    appliedBy: 'importer',
    appliedAt: '2026-01-01T00:00:00Z',
    result: { auditId: 'import-audit' },
    normalizedSnapshot: [{ categoryId: 42 }],
  });
}
