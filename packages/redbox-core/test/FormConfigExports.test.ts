import { buildKeyString, handlebarsTemplate, type DynamicScriptResponse } from '@researchdatabox/sails-ng-common';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { render } from 'ejs';
import * as sinon from 'sinon';
import { createSinonStubLogger } from './logger.test';
import { ConstructFormConfigVisitor } from '../src/visitor/construct.visitor';
import { TemplateFormConfigVisitor } from '../src/visitor/template.visitor';
import { Services as TemplateServices } from '../src/services/TemplateService';
import generatedViewOnly from '../src/form-config/generated-view-only';
let expect: Chai.ExpectStatic;
import('chai').then(mod => (expect = mod.expect));
import { FormConfigExports, reusableFormDefinitions } from '../src';

describe('FormConfigExports', function () {
  it('should expose default form config', function () {
    expect(FormConfigExports).to.be.an('object');
    expect(FormConfigExports).to.have.property('generated-view-only');
    expect(FormConfigExports).not.to.have.property('default-1.0-draft');
  });
});

describe('Generated related-record heading', () => {
  for (const type of ['party', 'dataset', 'rdmp']) {
    it(`translates details for the authoritative ${type} record type`, async () => {
      const logger = createSinonStubLogger(sinon);
      const form = await new ConstructFormConfigVisitor(logger).start({
        data: generatedViewOnly,
        formMode: 'view',
        reusableFormDefs: reusableFormDefinitions,
      });
      const inputs = await new TemplateFormConfigVisitor(logger).start({ form });
      const headingIndex = generatedViewOnly.componentDefinitions.findIndex(
        definition => definition.name === 'generated_view_only_details_heading'
      );
      const key = ['componentDefinitions', headingIndex, 'component', 'config', 'template'];
      expect(inputs.some(input => buildKeyString(input.key) === buildKeyString(key))).to.equal(true);
      const service = new TemplateServices.Template();
      const entries = service
        .buildClientMapping(inputs)
        .map(entry => ({ key: buildKeyString(entry.key), value: entry.value }));
      const template = await readFile(resolve(__dirname, '../../../views/dynamicScriptAsset.ejs'), 'utf8');
      const source = render(template, { entries });
      const module: DynamicScriptResponse = await import(
        `data:text/javascript;base64,${Buffer.from(source).toString('base64')}`
      );
      const rendered = module.evaluate(
        key,
        {
          runtimeContext: { record: { type } },
          requestParams: { recordType: 'spoofed' },
          translationService: { t: (key: string) => `Translated ${key}` },
        },
        { libraries: { handlebars: handlebarsTemplate } }
      );
      expect(rendered).to.equal(`<h2>Translated @lookup-record-details-${type}</h2>`);
    });
  }
});
