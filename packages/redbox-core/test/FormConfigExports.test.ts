import { handlebarsCompile } from '@researchdatabox/sails-ng-common';
import generatedViewOnly from '../src/form-config/generated-view-only';
let expect: Chai.ExpectStatic;
import("chai").then(mod => expect = mod.expect);
import { FormConfigExports } from '../src';

describe('FormConfigExports', function () {
  it('should expose default form config', function () {
    expect(FormConfigExports).to.be.an('object');
    expect(FormConfigExports).to.have.property('generated-view-only');
    expect(FormConfigExports).not.to.have.property('default-1.0-draft');
  });
});

describe('Generated related-record heading', () => {
  for (const type of ['party', 'dataset', 'rdmp']) {
    it(`translates details for the authoritative ${type} record type`, () => {
      const heading = generatedViewOnly.componentDefinitions.find(definition => definition.name === 'generated_view_only_details_heading');
      const template = Reflect.get(heading?.component?.config ?? {}, 'template');
      expect(template).to.be.a('string');
      if (typeof template !== 'string') throw new Error('Missing generated details heading template');
      const rendered = handlebarsCompile(template)({
        runtimeContext: { record: { type } },
        requestParams: { recordType: 'spoofed' },
        translationService: { t: (key: string) => `Translated ${key}` },
      });
      expect(rendered).to.equal(`<h2>Translated @lookup-record-details-${type}</h2>`);
    });
  }
});
