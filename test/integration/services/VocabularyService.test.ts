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

      let invalidEntryLabelErr = null;
      try {
        await VocabularyEntry.create({
          vocabulary: vocabulary.id,
          label: '',
          value: 'child2',
          parent: parent.id,
          order: 2
        });
      } catch (err) {
        invalidEntryLabelErr = err;
      }
      // Error is from validator not beforeCreate.
      // expect(invalidEntryLabelErr?.message).to.contain('VocabularyEntry.label is required');
      expect(invalidEntryLabelErr?.message).to.contain('Invalid new record.');
      expect(invalidEntryLabelErr?.message).to.contain('Could not use specified `label`.');
      expect(invalidEntryLabelErr?.message).to.contain('Cannot set "" (empty string) for a required attribute.');

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
