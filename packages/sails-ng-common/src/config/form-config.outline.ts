import { FormValidatorConfig, FormValidationGroups } from "../validation/form.model";
import { AvailableFormComponentDefinitionFrames, AvailableFormComponentDefinitionOutlines } from "./dictionary.outline";
import { CanVisit } from "./visitor/base.outline";
import { KeyValueStringNested, KeyValueStringProperty } from "./shared.outline";
import { FormExpressionsConfigOutline } from "./form-component.outline";


/**
 * The top-level form config interface that provides typing for the object literal and schema.
 */
export interface FormConfigFrame {
    /**
     * optional form name, will be used to identify the form in the config
     */
    name: string;
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
     * The validation groups to enable for the form.
     * The validation groups will be set as part of loading the form.
     * Default ["all"] if none specified.
     *
     * TODO: Should it be possible to change the enabled validation groups after the form has loaded?
     *       If yes, this property will need to be updated when the enabled validation groups change.
     */
    enabledValidationGroups?: string[];
    /**
     * The validators that are configured at the form level, usually because they involve two or more fields.
     */
    validators?: FormValidatorConfig[];

    /**
     * The validation groups available in this form.
     * These are the only validation group names that can be used in the validator config.
     */
    validationGroups?: FormValidationGroups;

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
    /**
     * A record with string keys and expression template values for defining expressions.
     */
    expressions?: FormExpressionsConfigOutline[];
    /**
     * The list of fields that are attachments.
     * This is automatically populated by the form config visitor.
     */
    attachmentFields?: string[];
}

export interface FormConfigOutline extends FormConfigFrame, CanVisit {
    componentDefinitions: AvailableFormComponentDefinitionOutlines[];
    expressions?: FormExpressionsConfigOutline[];
}
