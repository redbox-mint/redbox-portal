import { KeyValueStringNested, KeyValueStringProperty} from "./shared.model";
import {FormValidatorConfig, FormValidatorDefinition} from "../validation";
import {FormComponentDefinition} from "./form-component.model";

// TODO: https://www.typescriptlang.org/docs/handbook/2/narrowing.html#discriminated-unions

/**
 * These classes are used to define the configuration for the form and form components.
 *
 * These can be used to generate JSON schema for validation, etc. both on the client and server side.
 *
 * Classes ending `Definition` establish the metadata (name, class, config type) for the form and its components.
 *
 * Classes ending `Config` establish the field-type-specific config structure of the form and its components.
 *
 * These may or may not share the same field name(s) as the `Definition` classes.
 * This could also be used to define the expected JSON schema, where it is indicated.
 */


/**
 * The form definition.
 *
 * Also, used to define the JSON schema.
 *
 * */
export class FormConfig {
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
    skipValidationOnSave?: boolean = false;
    /**
     * The validators that are configured at the form level, usually because they involve two or more fields.
     */
    validators?: FormValidatorConfig[] = [];

    // TODO: a way to create groups of validators
    // This is not implemented yet.
    // each group has a name, plus either which validators to 'exclude' or 'include', but not both.
    // validatorProfiles: {
    //     // all: All validators (exclude none).
    //     all: {exclude: []},
    //     // minimumSave: The minimum set of validators that must pass to be able to save (create or update).
    //     minimumSave: {include: ['project_title']},
    // },

    // -- Component-related config --

    /**
     * TODO: the default layout component
     */
    defaultLayoutComponent?: string;
    /**
     * the components of this form
     */
    componentDefinitions?: FormComponentDefinition[] = [];
    /**
     * debug: show the form JSON
     * Default false.
     */
    debugValue?: boolean = false;
}

