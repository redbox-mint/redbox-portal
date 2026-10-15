import type {VocabularyAttributes} from "../../../packages/redbox-core/src/waterline-models";

describe('VocabularyService integration', function () {

  it('imports identified entries with normalized values and a complete parent tree', async function () {
    let vocabularyId: string | null = null;
    try {
      const vocabulary = await VocabularyService.create({
        name: `Batch tree ${Date.now()}`,
        branding: 'default',
        type: 'tree',
        entries: [
          {
            id: 'source-root',
            identifier: 'root',
            label: ' Root ',
            value: ' ROOT ',
            children: [
              {
                id: 'source-child',
                identifier: 'child',
                label: ' Child ',
                value: '',
                historical: true,
                children: [{ id: 'source-leaf', identifier: 'leaf', label: 'Leaf', value: ' LEAF ' }],
              },
              {
                id: 'source-sibling',
                identifier: 'sibling',
                label: 'Sibling',
                value: 'sibling',
              },
            ],
          },
        ],
      });
      vocabularyId = vocabulary.id;
      const entries = await VocabularyEntry.find({ vocabulary: vocabulary.id });
      expect(entries).to.have.length(4);
      const byIdentifier = new Map(entries.map(entry => [entry.identifier, entry]));
      const root = byIdentifier.get('root');
      const child = byIdentifier.get('child');
      const leaf = byIdentifier.get('leaf');
      const sibling = byIdentifier.get('sibling');
      expect(root?.label).to.equal('Root');
      expect(root?.labelLower).to.equal('root');
      expect(root?.value).to.equal('ROOT');
      expect(root?.valueLower).to.equal('root');
      expect(child?.value).to.equal('');
      expect(child?.historical).to.equal(true);
      expect(child?.parent).to.equal(root?.id);
      expect(sibling?.parent).to.equal(root?.id);
      expect(leaf?.parent).to.equal(child?.id);
      const tree = await VocabularyService.getTree(vocabulary.id);
      expect(tree).to.have.length(1);
      expect(tree[0].children).to.have.length(2);
    } finally {
      if (vocabularyId) {
        await VocabularyEntry.destroy({ vocabulary: vocabularyId });
        await Vocabulary.destroyOne({ id: vocabularyId });
      }
    }
  });

  for (const [name, entries, message] of [
    [
      'duplicate identifiers',
      [
        { id: 'a', identifier: 'same', label: 'A', value: 'a' },
        { id: 'b', identifier: ' same ', label: 'B', value: 'b' },
      ],
      'VocabularyEntry.identifier must be unique within a vocabulary',
    ],
    [
      'cyclic parents',
      [
        { id: 'a', identifier: 'a', label: 'A', value: 'a', parent: 'b' },
        { id: 'b', identifier: 'b', label: 'B', value: 'b', parent: 'a' },
      ],
      'VocabularyEntry cycle detected',
    ],
    [
      'missing parent',
      [{ id: 'child', identifier: 'child', label: 'Child', value: 'child', parent: '000000000000000000000001' }],
      'VocabularyEntry.parent not found',
    ],
  ] as const) {
    it(`rejects ${name} and cleans up a failed import`, async function () {
      const beforeCount = await VocabularyEntry.count();
      const vocabularyName = `Invalid ${name} ${Date.now()}`;
      let rejected: unknown;
      try {
        await VocabularyService.create({
          name: vocabularyName,
          branding: 'default',
          type: 'tree',
          entries: [...entries],
        });
      } catch (error) {
        rejected = error;
      }
      expect((rejected as Error)?.message).to.contain(message);
      expect(await Vocabulary.findOne({ name: vocabularyName })).to.equal(undefined);
      expect(await VocabularyEntry.count()).to.equal(beforeCount);
    });
  }

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
