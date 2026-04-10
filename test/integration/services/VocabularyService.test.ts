import type {VocabularyAttributes} from "../../../packages/redbox-core/src/waterline-models";

describe('VocabularyService integration', function () {

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
