import {
    BaseFormFieldComponentConfig,
    BaseFormFieldComponentConfigFrame, BaseFormFieldComponentDefinition,
    BaseFormFieldComponentDefinitionFrame
} from "./form-field-component.model";

/**
 * The form field layout config interface that provides typing for the object literal and schema.
 */
export interface FormFieldLayoutConfigFrame extends BaseFormFieldComponentConfigFrame {
    /**
     * The string to show when a value is required.
     */
    labelRequiredStr?: string;
    /**
     * The help text translation message id.
     */
    helpText?: string;
    /**
     * The css classes to apply to the layout element.
     */
    cssClassesMap?: Record<string, string>;
    /**
     * Whether the help text is visible on initialisation or not.
     */
    helpTextVisibleOnInit?: boolean;
    /**
     * Whether the help text is currently visible or not.
     */
    helpTextVisible?: boolean;
}

/**
 * The common form field layout config properties.
 */
export abstract class FormFieldLayoutConfig extends BaseFormFieldComponentConfig implements FormFieldLayoutConfigFrame {
    public labelRequiredStr?: string = '*';
    public helpText?: string;
    public cssClassesMap?: Record<string, string> = {};
    public helpTextVisibleOnInit?: boolean = false;
    public helpTextVisible?: boolean = false;

    protected constructor(data: FormFieldLayoutConfigFrame) {
        super(data);
        Object.assign(this, data);
    }
}

/**
 * The form field layout definition interface that provides typing for the object literal and schema.
 */
export interface FormFieldLayoutDefinitionFrame extends BaseFormFieldComponentDefinitionFrame {
    config?: FormFieldLayoutConfigFrame;
}

/**
 * The common form field layout definition properties.
 */
export abstract class FormFieldLayoutDefinition extends BaseFormFieldComponentDefinition implements FormFieldLayoutDefinitionFrame {
    config?: FormFieldLayoutConfig;
    /**
     * Optional name for the layout, used to reference the layout on the client-side.
     */
    name?: string;

    protected constructor(data: FormFieldLayoutDefinitionFrame) {
        super(data);
        // The config must be assigned in the subclasses.
        this.config = undefined;
    }
}
