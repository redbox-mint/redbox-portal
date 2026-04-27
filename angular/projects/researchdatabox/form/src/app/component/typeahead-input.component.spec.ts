import { TestBed } from "@angular/core/testing";
import { TypeaheadModule } from "ngx-bootstrap/typeahead";
import { By } from "@angular/platform-browser";
import { firstValueFrom } from "rxjs";
import { FormConfigFrame } from "@researchdatabox/sails-ng-common";
import { createFormAndWaitForReady, createTestbedModule, setUpDynamicAssets } from "../helpers.spec";
import { TypeaheadDataService } from "../service/typeahead-data.service";
import { TypeaheadInputComponent } from "./typeahead-input.component";
import type { TypeaheadMatch } from "ngx-bootstrap/typeahead";

describe("TypeaheadInputComponent", () => {
    beforeEach(async () => {
        await createTestbedModule({
            declarations: {
                "TypeaheadInputComponent": TypeaheadInputComponent
            },
            imports: {
                "TypeaheadModule": TypeaheadModule.forRoot()
            }
        });
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

    it("renders named query suggestions with labelTemplate from query response fields", async () => {
        setUpDynamicAssets({
            callable: function (keyStr: string, key: (string | number)[], context: any, extra?: any) {
                switch (keyStr) {
                    case "componentDefinitions__0__component__config__labelTemplate":
                        return `${context?.raw?.title ?? ""} (${context?.raw?.code ?? ""})`;
                    default:
                        throw new Error(`Unknown key: ${keyStr}`);
                }
            }
        });

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

        const { fixture } = await createFormAndWaitForReady(formConfig);
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
        expect(options[1]?.disabled).toBeUndefined();
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
});
