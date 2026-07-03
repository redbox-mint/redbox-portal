import { TestBed } from "@angular/core/testing";
import { TypeaheadModule } from "ngx-bootstrap/typeahead";
import { By } from "@angular/platform-browser";
import { firstValueFrom } from "rxjs";
import {FormConfigFrame} from "@researchdatabox/sails-ng-common";
import {createFormAndWaitForReady, createTestbedModule, DynamicAssetOptions} from "../helpers.spec";
import { TypeaheadDataService } from "../service/typeahead-data.service";
import { TypeaheadInputComponent } from "./typeahead-input.component";
import type { TypeaheadMatch } from "ngx-bootstrap/typeahead";
import i18next from "i18next";
import {RepeatableComponent, RepeatableElementLayoutComponent} from "./repeatable.component";
import {SimpleInputComponent} from "./simple-input.component";
import {ContentComponent} from "./content.component";
import {GroupFieldComponent} from "./group.component";

describe("TypeaheadInputComponent", () => {
  let translationService: any;

    beforeEach(async () => {
      ({ translationService } = await createTestbedModule({
            declarations: {
                "TypeaheadInputComponent": TypeaheadInputComponent,
                "SimpleInputComponent": SimpleInputComponent,
                "ContentComponent": ContentComponent,
                "RepeatableComponent": RepeatableComponent,
                "RepeatableElementLayoutComponent": RepeatableElementLayoutComponent,
                "GroupFieldComponent": GroupFieldComponent,
            },
            imports: {
                "TypeaheadModule": TypeaheadModule.forRoot()
            }
        }));
      translationService.getCurrentLanguage = jasmine.createSpy('getCurrentLanguage').and.returnValue('en');
      translationService.translationMap = translationService.translationMap || {};
      translationService.t = jasmine.createSpy('t').and.callFake((key: string) => translationService.translationMap[key] ?? key);
    });

    it("should create component", () => {
        const fixture = TestBed.createComponent(TypeaheadInputComponent);
        const component = fixture.componentInstance;
        expect(component).toBeDefined();
    });

    it("renders pre-populated optionObject label", async () => {
        const formConfig: FormConfigFrame = {
            name: "testing",
            componentDefinitions: [
                {
                    name: "person_lookup",
                    component: {
                        class: "TypeaheadInputComponent",
                        config: {
                            sourceType: "static",
                            valueMode: "optionObject",
                            staticOptions: [
                                { label: "Jane Doe", value: "jane" },
                                { label: "John Smith", value: "john" }
                            ]
                        }
                    },
                    model: {
                        class: "TypeaheadInputModel",
                        config: {
                            value: { label: "Jane Doe", value: "jane" }
                        }
                    }
                }
            ]
        };

        const { fixture } = await createFormAndWaitForReady(formConfig);
        const input = fixture.nativeElement.querySelector("input") as HTMLInputElement;
        expect(input.value).toBe("Jane Doe");
    });

    it("updates displayed text when the underlying model value changes after init", async () => {
        const formConfig: FormConfigFrame = {
            name: "testing",
            componentDefinitions: [
                {
                    name: "person_lookup",
                    component: {
                        class: "TypeaheadInputComponent",
                        config: {
                            sourceType: "namedQuery",
                            queryId: "party",
                            minChars: 1,
                            requireSelection: true
                        }
                    },
                    model: {
                        class: "TypeaheadInputModel",
                        config: {}
                    }
                }
            ]
        };

        const { fixture, formComponent } = await createFormAndWaitForReady(formConfig);
        const input = fixture.nativeElement.querySelector("input") as HTMLInputElement;

        (formComponent as any).form.get("person_lookup")?.setValue("Andrew");
        await fixture.whenStable();
        fixture.detectChanges();

        expect(input.value).toBe("Andrew");
    });

    it("updates displayed text when the underlying model value changes silently after init", async () => {
        const formConfig: FormConfigFrame = {
            name: "testing",
            componentDefinitions: [
                {
                    name: "person_lookup",
                    component: {
                        class: "TypeaheadInputComponent",
                        config: {
                            sourceType: "static",
                            staticOptions: [
                                { label: "Alice Scott", value: "Alice Scott" },
                                { label: "Jane Doe", value: "Jane Doe" }
                            ]
                        }
                    },
                    model: {
                        class: "TypeaheadInputModel",
                        config: {}
                    }
                }
            ]
        };

        const { fixture, formComponent } = await createFormAndWaitForReady(formConfig);
        const input = fixture.nativeElement.querySelector("input") as HTMLInputElement;

        (formComponent as any).form.get("person_lookup")?.setValue("Alice Scott", { emitEvent: false });
        fixture.detectChanges();
        await fixture.whenStable();
        fixture.detectChanges();

        expect(input.value).toBe("Alice Scott");
    });

    it("stores free text as optionObject by default", async () => {
        const formConfig: FormConfigFrame = {
            name: "testing",
            componentDefinitions: [
                {
                    name: "person_lookup",
                    component: {
                        class: "TypeaheadInputComponent",
                        config: {
                            sourceType: "static",
                            valueMode: "optionObject",
                            staticOptions: [{ label: "Alpha", value: "alpha" }]
                        }
                    },
                    model: {
                        class: "TypeaheadInputModel",
                        config: {}
                    }
                }
            ]
        };

        const { fixture, formComponent } = await createFormAndWaitForReady(formConfig);
        const input = fixture.nativeElement.querySelector("input") as HTMLInputElement;
        input.value = "Custom Person";
        input.dispatchEvent(new Event("input"));
        input.dispatchEvent(new Event("blur"));
        await fixture.whenStable();

        const value = (formComponent as any).form.value?.person_lookup;
        expect(value).toEqual({
            label: "Custom Person",
            value: "Custom Person",
            sourceType: "freeText"
        });
        expect((formComponent as any).form.get("person_lookup")?.dirty).toBeTrue();
    });

    it("does not store free text when selection is required", async () => {
        const formConfig: FormConfigFrame = {
            name: "testing",
            componentDefinitions: [
                {
                    name: "person_lookup",
                    component: {
                        class: "TypeaheadInputComponent",
                        config: {
                            sourceType: "static",
                            requireSelection: true,
                            staticOptions: [{ label: "Alpha", value: "alpha" }]
                        }
                    },
                    model: {
                        class: "TypeaheadInputModel",
                        config: {}
                    }
                }
            ]
        };

        const { fixture, formComponent } = await createFormAndWaitForReady(formConfig);
        const input = fixture.nativeElement.querySelector("input") as HTMLInputElement;
        input.value = "Custom Person";
        input.dispatchEvent(new Event("input"));
        input.dispatchEvent(new Event("blur"));
        await fixture.whenStable();

        expect((formComponent as any).form.value?.person_lookup).toBeNull();
    });

    it("marks the control dirty when a suggestion is selected", async () => {
        const formConfig: FormConfigFrame = {
            name: "testing",
            componentDefinitions: [
                {
                    name: "person_lookup",
                    component: {
                        class: "TypeaheadInputComponent",
                        config: {
                            sourceType: "static",
                          // valueMode is 'value' by default
                            staticOptions: [{ label: "Jane Doe", value: "jane" }]
                        }
                    },
                    model: {
                        class: "TypeaheadInputModel",
                        config: {}
                    }
                }
            ]
        };

        const { fixture, formComponent } = await createFormAndWaitForReady(formConfig);
        const component = fixture.debugElement.query(By.directive(TypeaheadInputComponent)).componentInstance as TypeaheadInputComponent;

        component.onSelect({
            item: {
                label: "Jane Doe",
                value: "jane",
                sourceType: "static"
            }
        } as TypeaheadMatch);

        expect((formComponent as any).form.get("person_lookup")?.value).toBe("jane");
        expect((formComponent as any).form.get("person_lookup")?.dirty).toBeTrue();
    });

    it("keeps the display control in sync with disabled state changes", async () => {
        const formConfig: FormConfigFrame = {
            name: "testing",
            componentDefinitions: [
                {
                    name: "person_lookup",
                    component: {
                        class: "TypeaheadInputComponent",
                        config: {
                            sourceType: "static",
                            staticOptions: [{ label: "Jane Doe", value: "jane" }]
                        }
                    },
                    model: {
                        class: "TypeaheadInputModel",
                        config: {}
                    }
                }
            ]
        };

        const { fixture, formComponent } = await createFormAndWaitForReady(formConfig);
        const component = fixture.debugElement.query(By.directive(TypeaheadInputComponent)).componentInstance as TypeaheadInputComponent;
        const input = fixture.nativeElement.querySelector("input") as HTMLInputElement;

        expect(component.displayControl.disabled).toBeFalse();
        expect(input.disabled).toBeFalse();

        component.setDisabled(true, { emitEvent: false, onlySelf: true });
        await fixture.whenStable();
        fixture.detectChanges();

        expect(component.isDisabled).toBeTrue();
        expect(component.displayControl.disabled).toBeTrue();
        expect(input.disabled).toBeTrue();
        expect((formComponent as any).form.get("person_lookup")?.disabled).toBeTrue();

        component.setDisabled(false, { emitEvent: false, onlySelf: true });
        await fixture.whenStable();
        fixture.detectChanges();

        expect(component.isDisabled).toBeFalse();
        expect(component.displayControl.disabled).toBeFalse();
        expect(input.disabled).toBeFalse();
        expect((formComponent as any).form.get("person_lookup")?.disabled).toBeFalse();
    });

    it("shows misconfiguration message when named query source lacks queryId", async () => {
        const formConfig: FormConfigFrame = {
            name: "testing",
            componentDefinitions: [
                {
                    name: "broken_lookup",
                    component: {
                        class: "TypeaheadInputComponent",
                        config: {
                            sourceType: "namedQuery"
                        }
                    },
                    model: { class: "TypeaheadInputModel", config: {} }
                }
            ]
        };

        const { fixture } = await createFormAndWaitForReady(formConfig);
        const text = String((fixture.nativeElement as HTMLElement).textContent ?? "");
        expect(text).toContain("Missing queryId for namedQuery typeahead source");
    });

    it("shows misconfiguration message when external source lacks provider", async () => {
        const formConfig: FormConfigFrame = {
            name: "testing",
            componentDefinitions: [
                {
                    name: "broken_external_lookup",
                    component: {
                        class: "TypeaheadInputComponent",
                        config: {
                            sourceType: "external"
                        }
                    },
                    model: { class: "TypeaheadInputModel", config: {} }
                }
            ]
        };

        const { fixture } = await createFormAndWaitForReady(formConfig);
        const text = String((fixture.nativeElement as HTMLElement).textContent ?? "");
        expect(text).toContain("Missing provider for external typeahead source");
    });

    it("shows misconfiguration message when service source lacks serviceId", async () => {
        const formConfig: FormConfigFrame = {
            name: "testing",
            componentDefinitions: [
                {
                    name: "broken_service_lookup",
                    component: {
                        class: "TypeaheadInputComponent",
                        config: {
                            sourceType: "service"
                        }
                    },
                    model: { class: "TypeaheadInputModel", config: {} }
                }
            ]
        };

        const { fixture } = await createFormAndWaitForReady(formConfig);
        const text = String((fixture.nativeElement as HTMLElement).textContent ?? "");
        expect(text).toContain("Missing serviceId for service typeahead source");
    });

    it("renders named query suggestions with labelTemplate from query response fields", async () => {
      const dynamicAssetOptions: DynamicAssetOptions = {
        entries: [{
          urlKeyStart: "http://localhost/default/rdmp/dynamicAsset/formCompiledItems/rdmp/oid-generated-",
          callable: function (keyStr: string, key: (string | number)[], context: any, extra?: any) {
            switch (keyStr) {
              case "componentDefinitions__0__component__config__labelTemplate":
                return `${context?.raw?.title ?? ""} (${context?.raw?.code ?? ""})`;
              default:
                throw new Error(`Unknown key: ${keyStr}`);
            }
          }
        }]
      };
        const typeaheadDataService = TestBed.inject(TypeaheadDataService);
        spyOn(typeaheadDataService, "searchNamedQuery").and.resolveTo([
            {
                label: "Default Label",
                value: "abc-001",
                sourceType: "namedQuery",
                raw: {
                    code: "ABC-001",
                    title: "Project Atlas"
                }
            }
        ]);

        const formConfig: FormConfigFrame = {
            name: "testing",
            componentDefinitions: [
                {
                    name: "query_lookup",
                    component: {
                        class: "TypeaheadInputComponent",
                        config: {
                            sourceType: "namedQuery",
                            queryId: "projectLookup",
                            labelTemplate: "{{raw.title}} ({{raw.code}})",
                            minChars: 1
                        }
                    },
                    model: { class: "TypeaheadInputModel", config: {} }
                }
            ]
        };

        const { fixture } = await createFormAndWaitForReady(
          formConfig, undefined, undefined, dynamicAssetOptions);
        const component = fixture.debugElement.query(By.directive(TypeaheadInputComponent)).componentInstance as TypeaheadInputComponent;
        component.displayControl.setValue("atlas");
        const options = await firstValueFrom(component.suggestions$);
        expect(options[0]?.label).toBe("Project Atlas (ABC-001)");
    });

    it("renders external provider suggestions", async () => {
        const typeaheadDataService = TestBed.inject(TypeaheadDataService);
        spyOn(typeaheadDataService, "searchExternal").and.resolveTo([
            {
                label: "Australia",
                value: "Australia",
                sourceType: "external",
                raw: {
                    utf8_name: "Australia"
                }
            }
        ]);

        const formConfig: FormConfigFrame = {
            name: "testing",
            componentDefinitions: [
                {
                    name: "country_lookup",
                    component: {
                        class: "TypeaheadInputComponent",
                        config: {
                            sourceType: "external",
                            provider: "geonamesCountries",
                            resultArrayProperty: "response.docs",
                            labelField: "utf8_name",
                            valueField: "utf8_name",
                            minChars: 1
                        }
                    },
                    model: { class: "TypeaheadInputModel", config: {} }
                }
            ]
        };

        const { fixture } = await createFormAndWaitForReady(formConfig);
        const component = fixture.debugElement.query(By.directive(TypeaheadInputComponent)).componentInstance as TypeaheadInputComponent;
        component.displayControl.setValue("aus");
        const options = await firstValueFrom(component.suggestions$);
        expect(options[0]?.label).toBe("Australia");
        expect(typeaheadDataService.searchExternal).toHaveBeenCalledWith(
            "geonamesCountries",
            "aus",
            "response.docs",
            "utf8_name",
            "utf8_name"
        );
    });

    it("calls service lookup for service-backed typeahead sources", async () => {
        const typeaheadDataService = TestBed.inject(TypeaheadDataService);
        spyOn(typeaheadDataService, "searchService").and.resolveTo([
            {
                label: "Jane Doe",
                value: "party-1",
                sourceType: "service",
                raw: { id: "party-1" }
            }
        ]);

        const formConfig: FormConfigFrame = {
            name: "testing",
            componentDefinitions: [
                {
                    name: "service_lookup",
                    component: {
                        class: "TypeaheadInputComponent",
                        config: {
                            sourceType: "service",
                            serviceId: "contributors",
                            minChars: 1
                        }
                    },
                    model: { class: "TypeaheadInputModel", config: {} }
                }
            ]
        };

        const { fixture } = await createFormAndWaitForReady(formConfig);
        const component = fixture.debugElement.query(By.directive(TypeaheadInputComponent)).componentInstance as TypeaheadInputComponent;
        component.displayControl.setValue("jan");
        const options = await firstValueFrom(component.suggestions$);

        expect(options[0]?.label).toBe("Jane Doe");
        expect(typeaheadDataService.searchService).toHaveBeenCalledWith("contributors", "jan", 0, 25);
    });

    it("resolves pre-populated historical vocabulary labels in hide mode", async () => {
        const typeaheadDataService = TestBed.inject(TypeaheadDataService);
        const searchVocabularyEntries = spyOn(typeaheadDataService, "searchVocabularyEntries").and.resolveTo([]);

        const formConfig: FormConfigFrame = {
            name: "testing",
            componentDefinitions: [
                {
                    name: "vocab_lookup",
                    component: {
                        class: "TypeaheadInputComponent",
                        config: {
                            sourceType: "vocabulary",
                            vocabRef: "access-rights",
                            minChars: 1,
                            historicalVocabMode: "hide"
                        }
                    },
                    model: {
                        class: "TypeaheadInputModel",
                        config: {
                            value: "legacy"
                        }
                    }
                }
            ]
        };

        const { fixture } = await createFormAndWaitForReady(formConfig);
        await fixture.whenStable();
        fixture.detectChanges();

        const input = fixture.nativeElement.querySelector("input") as HTMLInputElement;
        expect(input.value).toBe("legacy");
        expect(searchVocabularyEntries).not.toHaveBeenCalled();
    });

    it("hides historical vocabulary suggestions by default", async () => {
        const typeaheadDataService = TestBed.inject(TypeaheadDataService);
        spyOn(typeaheadDataService, "searchVocabularyEntries").and.resolveTo([
            { label: "Active", value: "active", sourceType: "vocabulary" },
            { label: "Legacy", value: "legacy", sourceType: "vocabulary", historical: true }
        ]);

        const formConfig: FormConfigFrame = {
            name: "testing",
            componentDefinitions: [
                {
                    name: "vocab_lookup",
                    component: {
                        class: "TypeaheadInputComponent",
                        config: {
                            sourceType: "vocabulary",
                            vocabRef: "access-rights",
                            minChars: 1
                        }
                    },
                    model: { class: "TypeaheadInputModel", config: {} }
                }
            ]
        };

        const { fixture } = await createFormAndWaitForReady(formConfig);
        const component = fixture.debugElement.query(By.directive(TypeaheadInputComponent)).componentInstance as TypeaheadInputComponent;
        component.displayControl.setValue("a");
        const options = await firstValueFrom(component.suggestions$);
        expect(options.map(option => option.value)).toEqual(["active"]);
        expect(typeaheadDataService.searchVocabularyEntries).toHaveBeenCalledWith("access-rights", "a", 25, 0, false);
    });

    it("requests historical suggestions when the stored vocabulary value is historical in hide mode", async () => {
        const typeaheadDataService = TestBed.inject(TypeaheadDataService);
        const searchVocabularyEntries = spyOn(typeaheadDataService, "searchVocabularyEntries").and.callFake(async (
            _vocabRef: string,
            search: string,
            _limit: number,
            _offset: number,
            includeHistoricalValues?: boolean
        ) => {
            if (includeHistoricalValues && (search === "legacy" || search === "leg")) {
                return [
                    { label: "Legacy", value: "legacy", sourceType: "vocabulary", historical: true }
                ];
            }
            return [];
        });

        const formConfig: FormConfigFrame = {
            name: "testing",
            componentDefinitions: [
                {
                    name: "vocab_lookup",
                    component: {
                        class: "TypeaheadInputComponent",
                        config: {
                            sourceType: "vocabulary",
                            vocabRef: "access-rights",
                            minChars: 1,
                            historicalVocabMode: "hide"
                        }
                    },
                    model: {
                        class: "TypeaheadInputModel",
                        config: {
                            value: "legacy"
                        }
                    }
                }
            ]
        };

        const { fixture } = await createFormAndWaitForReady(formConfig);
        await fixture.whenStable();
        fixture.detectChanges();

        expect(searchVocabularyEntries).not.toHaveBeenCalled();

        const component = fixture.debugElement.query(By.directive(TypeaheadInputComponent)).componentInstance as TypeaheadInputComponent;
        component.displayControl.setValue("leg");
        const options = await firstValueFrom(component.suggestions$);

        expect(options.map(option => option.value)).toEqual(["legacy"]);
        expect(searchVocabularyEntries).toHaveBeenCalledOnceWith("access-rights", "leg", 25, 0, true);
    });

    it("retains historical vocabulary suggestions in disable mode", async () => {
        const typeaheadDataService = TestBed.inject(TypeaheadDataService);
        spyOn(typeaheadDataService, "searchVocabularyEntries").and.resolveTo([
            { label: "Active", value: "active", sourceType: "vocabulary" },
            { label: "Legacy", value: "legacy", sourceType: "vocabulary", historical: true },
            { label: "Other Legacy", value: "other-legacy", sourceType: "vocabulary", historical: true }
        ]);

        const formConfig: FormConfigFrame = {
            name: "testing",
            componentDefinitions: [
                {
                    name: "vocab_lookup",
                    component: {
                        class: "TypeaheadInputComponent",
                        config: {
                            sourceType: "vocabulary",
                            vocabRef: "access-rights",
                            minChars: 1,
                            historicalVocabMode: "disable"
                        }
                    },
                    model: {
                        class: "TypeaheadInputModel",
                        config: {
                            value: "legacy"
                        }
                    }
                }
            ]
        };

        const { fixture } = await createFormAndWaitForReady(formConfig);
        const component = fixture.debugElement.query(By.directive(TypeaheadInputComponent)).componentInstance as TypeaheadInputComponent;
        component.displayControl.setValue("leg");
        const options = await firstValueFrom(component.suggestions$);
        expect(options.map(option => option.value)).toEqual(["active", "legacy", "other-legacy"]);
        expect(typeaheadDataService.searchVocabularyEntries).toHaveBeenCalledWith("access-rights", "leg", 25, 0, true);
        expect(options[1]?.disabled).toBeTrue();
        expect(options[2]?.disabled).toBeTrue();
    });

    it("does not select disabled historical vocabulary suggestions", async () => {
        const formConfig: FormConfigFrame = {
            name: "testing",
            componentDefinitions: [
                {
                    name: "vocab_lookup",
                    component: {
                        class: "TypeaheadInputComponent",
                        config: {
                            sourceType: "vocabulary",
                            vocabRef: "access-rights",
                            minChars: 1,
                            historicalVocabMode: "disable"
                        }
                    },
                    model: { class: "TypeaheadInputModel", config: {} }
                }
            ]
        };

        const { fixture, formComponent } = await createFormAndWaitForReady(formConfig);
        const component = fixture.debugElement.query(By.directive(TypeaheadInputComponent)).componentInstance as TypeaheadInputComponent;
        component.onSelect({
            item: {
                label: "Legacy",
                value: "legacy",
                sourceType: "vocabulary",
                historical: true,
                disabled: true
            }
        } as TypeaheadMatch);

        expect((formComponent as any).form.get("vocab_lookup")?.value).toBeNull();
    });

    it("displays translated placeholder", async () => {
      const translationMapItems = {
        '@lookup-placeholder-party': "Start typing a party name...",
      }
      if (!i18next.isInitialized) {
        await i18next.init({
          lng: 'en',
          fallbackLng: 'en',
          returnEmptyString: false,
          resources: {
            en: {
              translation: {},
            },
          },
        });
      }
      i18next.addResourceBundle('en', 'translation', translationMapItems, true, true);
      await i18next.changeLanguage('en');

      Object.assign(translationService.translationMap, translationMapItems);

      const formConfig: FormConfigFrame = {
        name: "testing",
        componentDefinitions: [
          {
            name: "person_lookup",
            component: {
              class: "TypeaheadInputComponent",
              config: {
                sourceType: "static",
                staticOptions: [{ label: "Jane Doe", value: "jane" }],
                placeholder: '@lookup-placeholder-party',
              }
            },
            model: {
              class: "TypeaheadInputModel",
              config: {}
            }
          }
        ]
      };
      const { fixture } = await createFormAndWaitForReady(formConfig);

      const input = fixture.nativeElement.querySelector("input") as HTMLInputElement;
      expect(input.placeholder).toEqual("Start typing a party name...");

      expect(translationService.t).toHaveBeenCalledWith('@lookup-placeholder-party');
    });
  it("stores free text entered after selecting from lookup when requireSelection is false", async () => {
    const formConfig: FormConfigFrame = {
      name: "testing",
      componentDefinitions: [
        {
          name: "person_lookup",
          component: {
            class: "TypeaheadInputComponent",
            config: {
              sourceType: "static",
              valueMode: "optionObject",
              staticOptions: [{label: "Item 1", value: "item1"}],
              requireSelection: false,
            }
          },
          model: {
            class: "TypeaheadInputModel",
            config: {}
          }
        }
      ]
    };

    const {fixture, formComponent} = await createFormAndWaitForReady(formConfig);
    const input = fixture.nativeElement.querySelector("input") as HTMLInputElement;
    const component = fixture.debugElement.query(By.directive(TypeaheadInputComponent)).componentInstance as TypeaheadInputComponent;

    // Select item from lookup
    component.onSelect({
      item: {
        label: "Item 1",
        value: "item1",
        sourceType: "static"
      }
    } as TypeaheadMatch);

    expect((formComponent as any).form.get("person_lookup")?.value).toEqual({
      label: "Item 1",
      value: "item1",
      sourceType: "static"
    });
    expect((formComponent as any).form.get("person_lookup")?.dirty).toBeTrue();
    expect(input.value).toBe("Item 1");

    // Change to free text entry
    input.value = "Custom Entry";
    input.dispatchEvent(new Event("input"));
    input.dispatchEvent(new Event("blur"));
    await fixture.whenStable();

    const value = (formComponent as any).form.value?.person_lookup;
    expect(value).toEqual({
      label: "Custom Entry",
      value: "Custom Entry",
      sourceType: "freeText"
    });
    expect((formComponent as any).form.get("person_lookup")?.dirty).toBeTrue();
  });
  it("should store free text entered after selecting from lookup in a group when requireSelection is false", async () => {
    const formConfig: FormConfigFrame = {
      name: "testing",
      debugValue: false,
      domElementType: 'form',
      defaultComponentConfig: {
        defaultComponentCssClasses: 'row',
      },
      editCssClasses: "redbox-form form",
      componentDefinitions: [
        {
          name: "related_services",
          component: {
            class: "RepeatableComponent", config: {
              elementTemplate: {
                name: "",
                component: {
                  class: "GroupComponent", config: {
                    componentDefinitions: [
                      {
                        name: "related_title",
                        component: {
                          class: 'TypeaheadInputComponent',
                          config: {
                            sourceType: "static",
                            valueMode: "optionObject",
                            staticOptions: [{label: "Item 1", value: "item1"}],
                            requireSelection: false,
                            placeholder: '@lookup-placeholder-service',
                            minChars: 1,
                            debounceMs: 250,
                            maxResults: 25,
                            label: "@dataPublication-related-service-title",
                            wrapperCssClasses: "rb-form-related-link-inline__field"
                          },
                        },
                        model: {class: "TypeaheadInputModel"},
                        layout: {
                          class: "InlineLayout",
                          config: {
                            label: "@dataPublication-related-service-title",
                          }
                        }
                      },
                    ]
                  }
                },
                model: {class: "GroupModel"},
                layout: {class: "RepeatableElementLayout"}
              }
            }
          },
          layout: {
            class: "DefaultLayout",
            config: {
              label: "@dataPublication-related-services",
              helpText: "@dataPublication-related-services-help",
            }
          },
          model: {
            class: "RepeatableModel",
            config: {value: [{related_title: {label: "", value: "", sourceType: "static"}}]}
          }
        }
      ]
    };

    const {fixture, formComponent} = await createFormAndWaitForReady(formConfig);

    const compiled = fixture.nativeElement as HTMLElement;
    let inputElements = compiled.querySelectorAll('input');
    expect(Array.from(inputElements)).toHaveSize(1);

    const input = inputElements[0];

    const component = fixture.debugElement.query(By.directive(TypeaheadInputComponent)).componentInstance as TypeaheadInputComponent;

    // Select item from lookup
    component?.onSelect({
      item: {
        label: "Item 1",
        value: "item1",
        sourceType: "static"
      }
    } as TypeaheadMatch);

    expect((formComponent as any).form.value).toEqual({related_services: [{related_title: {
        label: "Item 1",
        value: "item1",
        sourceType: "static"
      }}]});
    expect((formComponent as any).form.get("related_services")?.dirty).toBeTrue();
    expect(input.value).toBe("Item 1");

    // Change to free text entry
    input.value = "Custom Entry";
    input.dispatchEvent(new Event("input"));
    input.dispatchEvent(new Event("blur"));
    await fixture.whenStable();

    expect((formComponent as any).form.value).toEqual({related_services: [{related_title: {
      label: "Custom Entry",
      value: "Custom Entry",
      sourceType: "freeText"
    }}]});
    expect((formComponent as any).form.get("related_services")?.dirty).toBeTrue();
  });
});
