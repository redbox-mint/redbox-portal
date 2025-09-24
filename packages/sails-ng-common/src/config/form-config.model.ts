import {
    KeyValueStringNested,
    KeyValueStringProperty,
    FormValidatorConfig,
    FormComponentDefinition, HasChildren,
    FormConfigItemVisitor, Visitee,
    HasCompilableTemplates, TemplateCompileInput, AvailableFormComponentDefinitions,
    AvailableFormComponentDefinitionFrames
} from "..";

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
    componentDefinitions: AvailableFormComponentDefinitionFrames[];
    /**
     * debug: show the form JSON
     * Default false.
     */
    debugValue?: boolean;
}

/**
 * The form definition.
 * */
export class FormConfig implements FormConfigFrame, HasChildren, HasCompilableTemplates, Visitee {
    public name?: string;
    public type?: string;
    public domElementType?: string;
    public domId?: string;
    public viewCssClasses?: KeyValueStringProperty;
    public editCssClasses?: KeyValueStringProperty;
    public defaultComponentConfig?: KeyValueStringNested;
    public defaultLayoutComponent?: string;
    public skipValidationOnSave: boolean = false;
    public validators: FormValidatorConfig[] = [];
    public componentDefinitions: AvailableFormComponentDefinitions[] = [];
    public debugValue: boolean = false;

    constructor(data?: FormConfigFrame) {
        Object.assign(this, data ?? {});
    }

    get templates(): TemplateCompileInput[] {
        throw new Error("Method not implemented.");
    }

    get children(): FormComponentDefinition[] {
        return this.componentDefinitions;
    }

    accept(visitor: FormConfigItemVisitor): void {
        visitor.visitFormConfig(this);
    }
}

