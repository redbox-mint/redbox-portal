import {Component, Injectable, Input, NgModule} from '@angular/core';
import {
    FormComponentResolver,
    FormFieldBaseComponent,
    FormFieldCompMapEntry,
    FormFieldModel,
    FormFieldResolver
} from '@researchdatabox/portal-ng-common';
import {
    BaseFormFieldComponentConfig,
    BaseFormFieldComponentDefinition,
    BaseFormFieldModelConfig,
    BaseFormFieldModelDefinition,
    FormComponentDefinition,
    FormConfig,
    FormFieldComponentDefinition,
    FormFieldModelDefinition,
} from "@researchdatabox/sails-ng-common";
import {ReactiveFormsModule} from "@angular/forms";

@Injectable({
    providedIn: 'root'
})
export class PortalNgFormCustomService implements FormComponentResolver, FormFieldResolver {
    public async getFieldClass(fieldClass: string): Promise<typeof FormFieldModel<unknown>> {
        switch (fieldClass) {
            case "ExampleCustomFieldModel":
                return ExampleCustomFormFieldModel;
            default:
                throw new Error(`Failed to resolve field: ${fieldClass}`);
        }
    }

    public async getComponentClass(componentName: string): Promise<typeof FormFieldBaseComponent<unknown>> {
        switch (componentName) {
            case "ExampleCustomFieldComponent":
                return ExampleCustomFieldComponent;
            default:
                throw new Error(`Failed to resolve component: ${componentName}`);
        }
    }
}

export type ExampleCustomFieldModelValueType = number;

export class ExampleCustomFormFieldModel extends FormFieldModel<ExampleCustomFieldModelValueType> {
}

@Component({
    selector: 'redbox-textfield',
    template: `
        @if (getBooleanProperty('visible')) {
            <ng-container *ngTemplateOutlet="getTemplateRef('before')"/>
            <input type='number' [formControl]="formControl"/>
            <ng-container *ngTemplateOutlet="getTemplateRef('after')"/>
        }
    `,
    standalone: false
})
export class ExampleCustomFieldComponent extends FormFieldBaseComponent<ExampleCustomFieldModelValueType> {
    public tooltip = '';
    public tooltipPlaceholder = 'placeholder';
    /**
     * The model associated with this component.
     */
    @Input() public override model?: ExampleCustomFormFieldModel;
    protected override logName: string = "ExampleCustomFieldComponent";

    /**
     * Override to set additional properties required by the wrapper component.
     *
     * @param formFieldCompMapEntry
     */
    protected override setPropertiesFromComponentMapEntry(formFieldCompMapEntry: FormFieldCompMapEntry): void {
        super.setPropertiesFromComponentMapEntry(formFieldCompMapEntry);
        this.tooltip = this.getTooltip();
        this.tooltipPlaceholder = '';
    }
}

@NgModule({
    declarations: [
        ExampleCustomFieldComponent,
    ],
    providers: [],
    imports: [
        ReactiveFormsModule
    ],
    exports: [],
})
export class ExampleCustomPortalCoreModule {
}


export interface ExampleCustomFormFieldComponentDefinition extends BaseFormFieldComponentDefinition {
    class: "ExampleCustomFieldComponent";
    config?: ExampleCustomFormFieldComponentConfig;
}

export class ExampleCustomFormFieldComponentConfig extends BaseFormFieldComponentConfig {

}

export interface ExampleCustomFormFieldModelDefinition extends BaseFormFieldModelDefinition<ExampleCustomFieldModelValueType> {
    class: "ExampleCustomFieldModel";
    config: ExampleCustomFormFieldModelConfig;
}

export class ExampleCustomFormFieldModelConfig extends BaseFormFieldModelConfig<ExampleCustomFieldModelValueType> {

}


export type AllExampleCustomFormFieldModelDefinition = FormFieldModelDefinition | ExampleCustomFormFieldModelDefinition;
export type AllExampleCustomFormFieldComponentDefinition =
    FormFieldComponentDefinition
    | ExampleCustomFormFieldComponentDefinition;


export interface ExampleCustomFormComponentDefinition extends Omit<FormComponentDefinition, 'model' | "component"> {
    /**
     * The definition of the model that backs the form field.
     */
    model: AllExampleCustomFormFieldModelDefinition;
    /**
     * The definition of the client-side component for the form field.
     */
    component: AllExampleCustomFormFieldComponentDefinition;
}

/**
 * Use the built-in TypeScript 'Omit' to remove properties from a class.
 * @param Class The class to operate on.
 * @param keys The properties to remove.
 * @constructor
 */
const OmitClass = <T, K extends keyof T>(Class: new () => T, keys: K[]): new () => Omit<T, typeof keys[number]> => Class;

/**
 * The customised FormConfig can come from a sails hook, or a separate repo,
 *   or from custom angular components, and just import the custom form config.
 *
 *
 * This is needed to ensure the form config declaration can use the custom components.
 *
 *
 * WARNING: The way this is done means that the CustomFormConfig and FormConfig are not compatible,
 * but they are used for typescript type checking and building json schema,
 * so the incompatibility doesn't matter.
 */
export class CustomFormConfig extends OmitClass(FormConfig, ['componentDefinitions']) {
    componentDefinitions?: ExampleCustomFormComponentDefinition[] = [];
}

export const exampleCustomFormConfig: CustomFormConfig = {
    name: "example-1.0-draft",
    type: "rdmp",
    debugValue: true,
    domElementType: 'form',
    defaultComponentConfig: {
        defaultComponentCssClasses: 'row',
    },
    editCssClasses: "redbox-form form",
    skipValidationOnSave: false,
    validatorDefinitions: [],
    validators: [],
    componentDefinitions: [
        {
            name: 'core_text_1',
            model: {
                class: 'TextFieldModel',
                config: {
                    value: 'hello world!',
                    defaultValue: 'hello world!',
                    validators: [
                        {name: 'required'},
                    ]
                }
            },
            component: {
                class: 'TextFieldComponent'
            }
        },
        {
            name: 'example_custom_1',
            model: {
                class: 'ExampleCustomFieldModel',
                config: {
                    value: 3,
                    defaultValue: 10,
                    validators: [
                        {name: 'required'},
                    ]
                }
            },
            component: {
                class: 'ExampleCustomFieldComponent'
            }
        }
    ]
}
