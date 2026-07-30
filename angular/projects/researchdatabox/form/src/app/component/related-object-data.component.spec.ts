import { TestBed } from '@angular/core/testing';
import { HandlebarsTemplateService, UtilityService } from '@researchdatabox/portal-ng-common';
import { FormConfigFrame, handlebarsCompile } from '@researchdatabox/sails-ng-common';
import { createFormAndWaitForReady, createTestbedModule, DynamicAssetOptions } from '../helpers.spec';
import { RelatedObjectDataComponent } from './related-object-data.component';

describe('RelatedObjectDataComponent', () => {
  let utilityService: UtilityService;

  beforeEach(async () => {
    await createTestbedModule({
      declarations: { RelatedObjectDataComponent },
      providers: { UtilityService: null, HandlebarsTemplateService: { provide: HandlebarsTemplateService, useValue: {} } },
    });
    utilityService = TestBed.inject(UtilityService);
  });

  it('renders server-injected related object buckets without requiring content', async () => {
    const assets: DynamicAssetOptions = { entries: [{
      urlKeyStart: 'http://localhost/default/rdmp/dynamicAsset/formCompiledItems/rdmp/oid-generated-',
      callable: (_key: string, _path: (string | number)[], context: Record<string, unknown>) =>
        handlebarsCompile('{{#each relatedObjects}}<b>{{title}}</b>{{/each}}{{#each accessDeniedOids}}<i>denied:{{this}}</i>{{/each}}{{#each failedOids}}<u>failed:{{this}}</u>{{/each}}')(context),
    }] };
    const formConfig: FormConfigFrame = {
      name: 'testing',
      componentDefinitions: [{ name: 'related', component: { class: 'RelatedObjectDataComponent', config: {
        template: 'compiled server-side',
        relatedObjects: [{ oid: 'one', title: 'One' }],
        accessDeniedOids: ['two'],
        failedOids: ['three'],
      } } }],
    };
    const { fixture } = await createFormAndWaitForReady(formConfig, undefined, undefined, assets);
    expect(utilityService.getDynamicImport).toHaveBeenCalled();
    expect(fixture.nativeElement.textContent).toContain('One');
    expect(fixture.nativeElement.textContent).toContain('denied:two');
    expect(fixture.nativeElement.textContent).toContain('failed:three');
  });
});
