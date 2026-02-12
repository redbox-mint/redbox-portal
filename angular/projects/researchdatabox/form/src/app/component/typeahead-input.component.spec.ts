import {TestBed} from "@angular/core/testing";
import {TypeaheadModule} from "ngx-bootstrap/typeahead";
import {FormConfigFrame} from "@researchdatabox/sails-ng-common";
import {createFormAndWaitForReady, createTestbedModule} from "../helpers.spec";
import {TypeaheadInputComponent} from "./typeahead-input.component";

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
                                {label: "Jane Doe", value: "jane"},
                                {label: "John Smith", value: "john"}
                            ]
                        }
                    },
                    model: {
                        class: "TypeaheadInputModel",
                        config: {
                            value: {label: "Jane Doe", value: "jane"}
                        }
                    }
                }
            ]
        };

        const {fixture} = await createFormAndWaitForReady(formConfig);
        const input = fixture.nativeElement.querySelector("input") as HTMLInputElement;
        expect(input.value).toBe("Jane Doe");
    });

    it("stores free text as optionObject when enabled", async () => {
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
                            allowFreeText: true,
                            staticOptions: [{label: "Alpha", value: "alpha"}]
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
                    model: {class: "TypeaheadInputModel", config: {}}
                }
            ]
        };

        const {fixture} = await createFormAndWaitForReady(formConfig);
        const text = String((fixture.nativeElement as HTMLElement).textContent ?? "");
        expect(text).toContain("Missing queryId for namedQuery typeahead source");
    });
});
