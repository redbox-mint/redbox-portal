// Run only in the disposable integration-test Mongo database, before conversion.
if (process.env.PUBLICATION_VOCABULARY_ACCEPTANCE !== 'disposable' || db.getName() !== 'redbox-portal')
  throw new Error('This fixture requires an explicitly disposable redbox-portal database.');
const brand = db.brandingconfig.findOne({ name: 'default' });
if (!brand || db.publicationvocabularyconversion.countDocuments({}))
  throw new Error('Expected an unconverted fixture brand.');
const local = ObjectId('2123456789abcdef01234567');
const mirror = ObjectId('3123456789abcdef01234567');
const source = ObjectId('1123456789abcdef01234567');
const crosswalk = ObjectId('0123456789abcdef01234567');
const entry = ObjectId('4123456789abcdef01234567');
const categories = [ObjectId('5123456789abcdef01234567'), ObjectId('6123456789abcdef01234567')];
const mirrors = [ObjectId(), ObjectId()];
db.vocabulary.insertMany([
  { _id: local, branding: brand._id, name: 'PUB24 Local codes', source: 'local', readOnly: false },
  { _id: mirror, branding: brand._id, name: 'PUB24 Mirror', source: 'external', readOnly: true },
]);
db.vocabularyentry.insertMany([
  {
    _id: entry,
    vocabulary: local,
    label: 'Case code',
    value: 'CaseSensitive',
    valueLower: 'casesensitive',
    identifier: 'urn:local:case',
  },
  { _id: mirrors[0], vocabulary: mirror, label: 'Mathematics', value: 'CaseSensitive' },
  { _id: mirrors[1], vocabulary: mirror, label: 'Retired subject', value: 'removed' },
]);
db.figsharevocabularysource.insertOne({
  _id: source,
  branding: brand._id,
  vocabulary: mirror,
  scope: 'account',
  taxonomyId: '1',
  displayName: 'PUB24 Account taxonomy',
  createdBy: 'original-importer',
  updatedBy: 'original-importer',
  remoteHash: 'original-hash',
});
db.figsharevocabularycategory.insertMany(
  categories.map((id, i) => ({
    _id: id,
    source,
    entry: mirrors[i],
    sourceId: i ? 'removed' : 'CaseSensitive',
    categoryId: i ? 99 : 42,
    taxonomyId: '1',
    selectable: true,
    historical: i === 1,
    firstSeenAt: '2025-01-01T00:00:00Z',
    lastSeenAt: '2026-01-01T00:00:00Z',
    contentHash: `hash-${i}`,
  }))
);
db.figsharevocabularycrosswalk.insertOne({
  _id: crosswalk,
  branding: brand._id,
  name: 'PUB24 Legacy crosswalk',
  localVocabulary: local,
  figshareSource: source,
  status: 'approved',
  workingRevision: 2,
  approvedRevision: 1,
  approvedAt: '2025-06-01T00:00:00Z',
  approvedBy: 'departed-approver',
  updatedBy: 'editor',
});
db.figsharevocabularycrosswalkmapping.insertMany([
  ...categories.map(category => ({
    crosswalk,
    revision: 1,
    localEntry: entry,
    figshareCategory: category,
    status: 'approved',
    matchType: 'manual',
    approvedAt: '2025-06-01T00:00:00Z',
    approvedBy: 'departed-approver',
    evidence: { auditId: 'original-audit' },
  })),
  {
    crosswalk,
    revision: 2,
    localEntry: entry,
    figshareCategory: categories[1],
    status: 'proposed',
    matchType: 'manual',
  },
]);
db.figsharevocabularysyncrun.insertOne({
  branding: brand._id,
  source,
  scope: 'account',
  taxonomyId: '1',
  state: 'applied',
  requestedBy: 'original-importer',
  appliedBy: 'original-importer',
  appliedAt: '2026-01-01T00:00:00Z',
  result: { auditId: 'original-import-audit' },
  normalizedSnapshot: [{ categoryId: 42 }],
});
db.publicationvocabularysource.insertOne({
  schemaVersion: 1,
  brandId: 'other',
  id: 'foreign-source',
  provider: 'other',
  scope: 'public',
  catalogueId: 'foreign',
  displayName: 'FOREIGN SOURCE',
});
db.publicationvocabularycrosswalk.insertOne({ schemaVersion: 1, brandId: 'other', id: 'foreign-crosswalk' });
print(String(brand._id));
