let expect: Chai.ExpectStatic;
import("chai").then(mod => expect = mod.expect);
import { FormConfigExports } from '../src';
import { handlebarsCompile } from '@researchdatabox/sails-ng-common';
import generatedViewOnly from '../src/form-config/generated-view-only';

describe('FormConfigExports', function () {
  it('should expose default form config', function () {
    expect(FormConfigExports).to.be.an('object');
    expect(FormConfigExports).to.have.property('generated-view-only');
    expect(FormConfigExports).not.to.have.property('default-1.0-draft');
  });

  for (const [type, heading] of [
    ['party', 'Parties or people record details'],
    ['activity', 'Research activities record details'],
    ['funding', 'Funding bodies record details'],
  ]) {
    it(`renders the translated ${type} section heading independently of a title field`, function () {
      const definition = generatedViewOnly.componentDefinitions.find(
        component => component.name === 'generated_view_only_details_heading'
      );
      if (definition?.component.class !== 'ContentComponent' || !definition.component.config.template) {
        throw new Error('Generated view-only details heading is missing.');
      }
      const render = handlebarsCompile(definition.component.config.template);
      const requested: string[] = [];
      const result = render({
        content: definition.component.config.content,
        formData: type === 'funding' ? { 'provider-name': 'Synthetic funding body' } : { title: 'Synthetic lookup' },
        runtimeContext: { record: { type, hasEditAccess: false } },
        translationService: {
          t(key: string) {
            requested.push(key);
            return key === `@lookup-record-details-${type}` ? heading : key;
          },
        },
      });
      expect(requested).to.deep.equal([`@lookup-record-details-${type}`]);
      expect(result).to.equal(`<h2>${heading}</h2>`);
      expect(generatedViewOnly.componentDefinitions.findIndex(
        component => component.name === 'generated_view_only_details_heading'
      )).to.be.lessThan(generatedViewOnly.componentDefinitions.findIndex(
        component => component.name === 'generated_view_only_metadata'
      ));
    });
  }
});
