describe('RvaImportService integration', function () {
  it('imports production RVA vocabulary 316', async function () {
    this.timeout(60000);

    const imported = await RvaImportService.importRvaVocabulary('316');
    expect(imported).to.exist;
    expect(imported.source).to.equal('rva');
    expect(String(imported.sourceId)).to.equal('316');
    expect(String(imported.sourceVersionId || '')).to.not.equal('');

    const entryCount = await VocabularyEntry.count({ vocabulary: imported.id });
    expect(entryCount).to.be.greaterThan(0);
  });
});
