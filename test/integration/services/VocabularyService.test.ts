import type {VocabularyAttributes} from "../../../packages/redbox-core/src/waterline-models";

describe('VocabularyService integration', function () {

  it ('rejects entry value as null', async function () {
    try {
      // value cannot be null or undefined on service create
      await VocabularyService.create({
        name: 'test-invalid-entry',
        slug: 'test-invalid-entry',
        description: 'test-invalid-entry',
        owner: "owner",
        source: 'local',
        sourceId: 'test-invalid-entry-source-id',
        sourceVersionId: 'version1',
        lastSyncedAt: new Date().toISOString(),
        type: 'flat',
        branding: 'default',
        entries: [{
          label: 'Label1',
          labelLower: 'label1',
          value: null as any,
          valueLower: null as any,
          vocabulary: 'vocab1',
        }]
      });
    } catch (error) {
      expect(error.message).to.contain('VocabularyEntry.label and VocabularyEntry.value are required');
    }
  });
  it ('allows entry value to be empty string', async function () {
    try {
      // value cannot be null or undefined on service create
      await VocabularyService.create({
        name: 'test-invalid-entry',
        slug: 'test-invalid-entry',
        description: 'test-invalid-entry',
        owner: "owner",
        source: 'local',
        sourceId: 'test-invalid-entry-source-id',
        sourceVersionId: 'version1',
        lastSyncedAt: new Date().toISOString(),
        type: 'flat',
        branding: 'default',
        entries: [{
          label: 'Label1',
          labelLower: 'label1',
          value: null as any,
          valueLower: null as any,
          vocabulary: 'vocab1',
        }]
      });
    } catch (error) {
      expect(error.message).to.contain('VocabularyEntry.label and VocabularyEntry.value are required');
    }
  });

  it('builds tree structure from entries', async function () {
    let vocabularyId: string | null = null;


    try {
      const vocabulary = await Vocabulary.create({
        name: `Service Tree ${Date.now()}`,
        branding: 'default',
        type: 'tree',
        source: 'local'
      }).fetch();
      vocabularyId = vocabulary.id;

      const parent = await VocabularyEntry.create({
        vocabulary: vocabulary.id,
        label: 'Parent',
        value: 'parent',
        order: 0
      }).fetch();

      // value can be empty string
      await VocabularyEntry.create({
        vocabulary: vocabulary.id,
        label: 'Child',
        value: '',
        parent: parent.id,
        order: 1
      }).fetch();

      const invalidEntryValue = async function () {
        // value cannot be null or undefined on entry create
        await VocabularyEntry.create({
          vocabulary: vocabulary.id,
          label: 'Child',
          value: undefined,
          parent: parent.id,
          order: 2
        })
      };
      expect(invalidEntryValue).to.throw('VocabularyEntry.value is required');

      const tree = await VocabularyService.getTree(vocabulary.id);
      expect(tree).to.have.length(1);
      expect(tree[0].children).to.have.length(1);
    } finally {
      if (vocabularyId) {
        await VocabularyEntry.destroy({ vocabulary: vocabularyId });
        await Vocabulary.destroyOne({ id: vocabularyId });
      }
    }
  });
});
