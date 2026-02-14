
import { FormConfigFrame } from '@researchdatabox/sails-ng-common';
import { SimpleInputComponent } from './simple-input.component';
import { GroupFieldComponent } from "./group.component";
import { SaveButtonComponent } from "./save-button.component";
import { createFormAndWaitForReady, createTestbedModule } from "../helpers.spec";
import { TestBed } from "@angular/core/testing";

describe('GroupFieldComponent Buttons Rendering', () => {
    beforeEach(async () => {
        await createTestbedModule({
            declarations: {
                "SimpleInputComponent": SimpleInputComponent,
                "GroupFieldComponent": GroupFieldComponent,
                "SaveButtonComponent": SaveButtonComponent,
            }
        });
    });

    it('should render child components without form controls (e.g. SaveButtonComponent)', async () => {
        // arrange
        const formConfig: FormConfigFrame = {
            name: 'testing_buttons',
            componentDefinitions: [
                {
                    name: 'group_with_button',
                    model: {
                        class: 'GroupModel',
                        config: {
                            value: {},
                        }
                    },
                    component: {
                        class: 'GroupComponent',
                        config: {
                            componentDefinitions: [
                                {
                                    name: 'text_1',
                                    model: {
                                        class: 'SimpleInputModel',
                                        config: {
                                            value: 'initial value'
                                        }
                                    },
                                    component: {
                                        class: 'SimpleInputComponent'
                                    }
                                },
                                {
                                    name: 'save_button',
                                    component: {
                                        class: 'SaveButtonComponent',
                                        config: {
                                            label: 'Save Me'
                                        }
                                    }
                                }
                            ]
                        }
                    }
                }
            ]
        };

        // act
        const { fixture } = await createFormAndWaitForReady(formConfig);

        // assert
        const compiled = fixture.nativeElement as HTMLElement;

        // Check if SimpleInput is rendered
        const inputElement = compiled.querySelector('input[type="text"]');
        expect(inputElement).toBeTruthy();
        expect((inputElement as HTMLInputElement).value).toBe('initial value');

        // Check if SaveButton is rendered
        const buttonElement = compiled.querySelector('button.btn-primary');
        expect(buttonElement).toBeTruthy();
        expect(buttonElement?.textContent).toContain('Save Me');

        // Verify component map size
        const groupComponent = fixture.componentInstance.componentDefArr[0].component as GroupFieldComponent;
        expect(groupComponent.formFieldCompMapEntries.length).toBe(2);
    });
});
