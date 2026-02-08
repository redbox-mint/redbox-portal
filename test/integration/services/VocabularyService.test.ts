describe('VocabularyService integration', function () {
  it('builds tree structure from entries', async function () {
    const vocabulary = await Vocabulary.create({
      name: `Service Tree ${Date.now()}`,
      branding: 'default',
      type: 'tree',
      source: 'local'
    }).fetch();

    const parent = await VocabularyEntry.create({
      vocabulary: vocabulary.id,
      label: 'Parent',
      value: 'parent',
      order: 0
    }).fetch();

    await VocabularyEntry.create({
      vocabulary: vocabulary.id,
      label: 'Child',
      value: 'child',
      parent: parent.id,
      order: 1
    }).fetch();

    const tree = await VocabularyService.getTree(vocabulary.id);
    expect(tree).to.have.length(1);
    expect(tree[0].children).to.have.length(1);
  });
});
