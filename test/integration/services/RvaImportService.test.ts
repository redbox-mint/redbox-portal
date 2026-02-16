import { expect } from 'chai';
import { Services as RvaImportServiceModule } from '../../../packages/redbox-core-types/src/services/RvaImportService';
import type { VocabularyEntryWaterlineModel } from '../../../packages/redbox-core-types/src/waterline-models/VocabularyEntry';

declare const RvaImportService: RvaImportServiceModule.RvaImport;
declare const VocabularyEntry: VocabularyEntryWaterlineModel;

describe('RvaImportService integration', function () {
  it('imports production RVA vocabulary 316', async function () {
    this.timeout(60000);

    const imported = await RvaImportService.importRvaVocabulary('316');
    expect(imported).to.exist;
    expect(imported.source).to.equal('rva');
    expect(String(imported.sourceId)).to.equal('316');
    expect(imported.sourceVersionId).to.be.a('string');
    expect(String(imported.sourceVersionId)).to.not.equal('');

    const entryCount = await VocabularyEntry.count({ vocabulary: imported.id });
    expect(entryCount).to.be.greaterThan(0);
  });
});
