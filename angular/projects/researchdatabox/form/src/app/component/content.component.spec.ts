import {FormConfig} from '@researchdatabox/sails-ng-common';
import {ContentComponent} from "./content.component";
import {createFormAndWaitForReady, createTestbedModule} from "../helpers.spec";
import {TestBed} from "@angular/core/testing";
import { UtilityService } from "@researchdatabox/portal-ng-common";
import * as Handlebars from "handlebars";



describe('ContentComponent', () => {
  let utilityService: UtilityService;
  beforeEach(async () => {
    await createTestbedModule({
      declarations: {"ContentComponent": ContentComponent},
      providers: {"UtilityService": null}
    });
    utilityService = TestBed.inject(UtilityService);
    spyOn(utilityService, 'getDynamicImport').and.callFake(
      async function (brandingAndPortalUrl: string, urlPath: string[]) {
        const urlKey = `${brandingAndPortalUrl}/${(urlPath ?? [])?.join('/')}`;
        switch (urlKey) {
          // For the simple test that only creates the component
          case "http://localhost/default/rdmp/dynamicAsset/formCompiledItems/rdmp":
            return {
              evaluate: function (key: string[], context: any, extra: any) {
                // normalise the key the same way as the server
                const keyStr = (key ?? [])?.map(i => i?.toString()?.normalize("NFKC"))?.join('__');
                switch (keyStr) {
                  case "componentDefinitions__0__component__config__template":
                    return Handlebars.compile('<h3>{{content}}</h3>')(context);
                  default:
                    throw new Error(`Unknown key: ${keyStr}`);
                }
              }
            };
          default:
            throw new Error(`Unknown url key: ${urlKey}`);
        }
      });
  });

  it('should create component', () => {
    let fixture = TestBed.createComponent(ContentComponent);
    let component = fixture.componentInstance;
    expect(utilityService.getDynamicImport).not.toHaveBeenCalled();
    expect(component).toBeDefined();
  });
  it('should render TextField component', async () => {
    // arrange
    const formConfig: FormConfig = {
      debugValue: true,
      defaultComponentConfig: {
        defaultComponentCssClasses: 'row',
      },
      editCssClasses: "redbox-form form",
      componentDefinitions: [
        {
          name: 'text_1_event',
          component: {
            class: 'ContentComponent',
            config: {
              content: 'My first text block component!!!',
              template: '<h3>{{content}}</h3>'
            }
          }
        }
      ]
    };

    // act
    const {fixture, formComponent} = await createFormAndWaitForReady(formConfig);

    // Now run your expectations
    const compiled = fixture.nativeElement as HTMLElement;
    const inputElement = compiled.querySelector('h3');
    expect(utilityService.getDynamicImport).toHaveBeenCalled();
    expect((inputElement as HTMLHeadingElement).textContent).toEqual('My first text block component!!!');
  });

});
