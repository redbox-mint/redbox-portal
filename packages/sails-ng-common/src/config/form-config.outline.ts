import {FormValidatorConfig} from "../validation/form.model";
import {AvailableFormComponentDefinitionFrames, AvailableFormComponentDefinitionOutlines} from "./dictionary.outline";
import {CanVisit} from "./visitor/base.outline";
import {KeyValueStringNested, KeyValueStringProperty} from "./shared.outline";


/**
 * The top-level form config interface that provides typing for the object literal and schema.
 */
export interface FormConfigFrame {
    /**
     * optional form name, will be used to identify the form in the config
     */
    name?: string;
    /**
     * the record type
     */
    type?: string;

    // -- DOM related config --

    /**
     * the dom element type to inject, e.g. div, span, etc. leave empty to use 'ng-container'
     */
    domElementType?: string;
    /**
     * optional form dom id property. When set, value will be injected into the overall dom node
     */
    domId?: string;
    /**
     * the optional css clases to be applied to the form dom node in view / read-only mode
     */
    viewCssClasses?: KeyValueStringProperty;
    /**
     * the optional css clases to be applied to the form dom node in edit mode
     */
    editCssClasses?: KeyValueStringProperty;
    /**
     * optional configuration to set in each component
     */
    defaultComponentConfig?: KeyValueStringNested;

    // -- validation-related config --

    /**
     * whether to trigger validation on save
     * Default false.
     */
    skipValidationOnSave?: boolean;
    /**
     * The validators that are configured at the form level, usually because they involve two or more fields.
     */
    validators?: FormValidatorConfig[];

    // -- Component-related config --

    /**
     * TODO: the default layout component
     */
    defaultLayoutComponent?: string;
    /**
     * the components of this form
     */
    componentDefinitions: AvailableFormComponentDefinitionFrames[];
    /**
     * debug: show the form JSON
     * Default false.
     */
    debugValue?: boolean;
}

export interface FormConfigOutline extends FormConfigFrame, CanVisit {
    componentDefinitions: AvailableFormComponentDefinitionOutlines[];
}