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

  it('expands notation paths with shared ancestors and missing entries', async function () {
    let vocabularyId: string | null = null;

    try {
      const vocabulary = await Vocabulary.create({
        name: `Service Expand Path ${Date.now()}`,
        branding: 'default',
        type: 'tree',
        source: 'local'
      }).fetch();
      vocabularyId = vocabulary.id;

      const root = await VocabularyEntry.create({
        vocabulary: vocabulary.id,
        label: 'Root',
        value: '08',
        identifier: '08',
        order: 0
      }).fetch();

      const ai = await VocabularyEntry.create({
        vocabulary: vocabulary.id,
        label: 'Artificial Intelligence',
        value: '0801',
        identifier: '0801',
        parent: root.id,
        order: 1
      }).fetch();

      const data = await VocabularyService.expandPaths('default', vocabulary.id, ['0801', '0802', '0801', '9999']);
      expect(data).to.not.equal(null);
      expect(data?.meta.vocabularyId).to.equal(vocabulary.id);
      expect(data?.meta.notations).to.deep.equal(['0801', '0802', '9999']);
      expect(data?.paths['0801']).to.have.length(2);
      expect(data?.paths['0801'][0].id).to.equal(root.id);
      expect(data?.paths['0801'][0].hasChildren).to.equal(true);
      expect(data?.paths['0801'][1].id).to.equal(ai.id);
      expect(data?.paths['0801'][1].notation).to.equal('0801');
      expect(data?.paths['0801'][1].hasChildren).to.equal(false);
      expect(data?.paths['0802']).to.deep.equal([]);
      expect(data?.paths['9999']).to.deep.equal([]);
    } finally {
      if (vocabularyId) {
        await VocabularyEntry.destroy({ vocabulary: vocabularyId });
        await Vocabulary.destroyOne({ id: vocabularyId });
      }
    }
  });
});
