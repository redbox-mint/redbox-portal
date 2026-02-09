import {cloneDeep as _cloneDeep, get as _get} from "lodash";
import {FormConfig} from "../form-config.model";
import {FormConfigOutline} from "../form-config.outline";
import {
    GroupFieldComponentDefinitionOutline,
    GroupFieldComponentName,
    GroupFieldModelDefinitionOutline,
    GroupFieldModelName,
    GroupFormComponentDefinitionOutline
} from "../component/group.outline";
import {
    RepeatableComponentName,
    RepeatableElementFieldLayoutDefinitionOutline,
    RepeatableFieldComponentDefinitionOutline,
    RepeatableFieldModelDefinitionOutline,
    RepeatableFormComponentDefinitionOutline,
    RepeatableModelName
} from "../component/repeatable.outline";
import {
    RepeatableElementFieldLayoutConfig,
    RepeatableFieldComponentConfig,
    RepeatableFieldModelConfig
} from "../component/repeatable.model";
import {GroupFieldComponentConfig, GroupFieldModelConfig} from "../component/group.model";
import {
    SimpleInputComponentName,
    SimpleInputFieldComponentDefinitionOutline,
    SimpleInputFieldModelDefinitionOutline,
    SimpleInputFormComponentDefinitionOutline,
    SimpleInputModelName
} from "../component/simple-input.outline";
import {SimpleInputFieldComponentConfig, SimpleInputFieldModelConfig} from "../component/simple-input.model";
import {DefaultFieldLayoutDefinitionOutline, DefaultLayoutName} from "../component/default-layout.outline";
import {DefaultFieldLayoutConfig} from "../component/default-layout.model";
import {FormComponentDefinitionFrame, FormComponentDefinitionOutline} from "../form-component.outline";
import {
    ContentComponentName,
    ContentFieldComponentDefinitionOutline,
    ContentFormComponentDefinitionOutline
} from "../component/content.outline";
import {
    TabComponentName,
    TabFieldComponentDefinitionOutline,
    TabFieldLayoutDefinitionOutline,
    TabFormComponentDefinitionOutline,
    TabLayoutName
} from "../component/tab.outline";
import {TabFieldComponentConfig, TabFieldLayoutConfig} from "../component/tab.model";
import {
    TabContentComponentName,
    TabContentFieldComponentDefinitionOutline,
    TabContentFieldLayoutDefinitionOutline, TabContentFormComponentDefinitionFrame,
    TabContentFormComponentDefinitionOutline,
    TabContentLayoutName
} from "../component/tab-content.outline";
import {
    TabContentFieldComponentConfig,
    TabContentFieldLayoutConfig,
} from "../component/tab-content.model";
import {
    TextAreaComponentName,
    TextAreaFieldComponentDefinitionOutline,
    TextAreaFieldModelDefinitionOutline,
    TextAreaFormComponentDefinitionOutline,
    TextAreaModelName
} from "../component/text-area.outline";
import {TextAreaFieldComponentConfig, TextAreaFieldModelConfig} from "../component/text-area.model";
import {ContentFieldComponentConfig} from "../component/content.model";
import {
    DropdownInputComponentName,
    DropdownInputFieldComponentDefinitionOutline,
    DropdownInputFieldModelDefinitionOutline,
    DropdownInputFormComponentDefinitionOutline,
    DropdownInputModelName
} from "../component/dropdown-input.outline";
import {DropdownInputFieldComponentConfig, DropdownInputFieldModelConfig} from "../component/dropdown-input.model";
import {
    CheckboxInputFieldComponentDefinitionOutline,
    CheckboxInputFieldModelDefinitionOutline,
    CheckboxInputFormComponentDefinitionOutline
} from "../component/checkbox-input.outline";
import {CheckboxInputFieldComponentConfig, CheckboxInputFieldModelConfig} from "../component/checkbox-input.model";
import {
    RadioInputFieldComponentDefinitionOutline,
    RadioInputFieldModelDefinitionOutline,
    RadioInputFormComponentDefinitionOutline
} from "../component/radio-input.outline";
import {RadioInputFieldComponentConfig, RadioInputFieldModelConfig} from "../component/radio-input.model";
import {
    DateInputComponentName,
    DateInputFieldComponentDefinitionOutline,
    DateInputFieldModelDefinitionOutline,
    DateInputFormComponentDefinitionOutline,
    DateInputModelName
} from "../component/date-input.outline";
import {DateInputFieldComponentConfig, DateInputFieldModelConfig} from "../component/date-input.model";
import {
    SaveButtonComponentName,
    SaveButtonFieldComponentDefinitionOutline,
    SaveButtonFormComponentDefinitionOutline
} from "../component/save-button.outline";
import {SaveButtonFieldComponentConfig} from "../component/save-button.model";
import {
    ValidationSummaryFieldComponentDefinitionOutline,
    ValidationSummaryFormComponentDefinitionOutline
} from "../component/validation-summary.outline";
import {ValidationSummaryFieldComponentConfig} from "../component/validation-summary.model";


import {FieldModelConfigFrame} from "../field-model.outline";
import {FieldComponentConfigFrame} from "../field-component.outline";
import {FieldLayoutConfigFrame} from "../field-layout.outline";
import {FormConfigVisitor} from "./base.model";
import {FormPathHelper, PropertiesHelper} from "./common.model";
import {AllFormComponentDefinitionOutlines} from "../dictionary.outline";
import {CanVisit} from "./base.outline";
import {LineagePath, LineagePathsPartial} from "../names/naming-helpers";
import {VisitorFormComponentClassDefMapType, FormComponentDefinitionMap} from "../dictionary.model";
import {isTypeFormComponentDefinitionName} from "../form-types.outline";
import {ILogger} from "../../logger.interface";
import {
    ReusableComponentName,
    ReusableFieldComponentDefinitionOutline,
    ReusableFormComponentDefinitionOutline
} from "../component/reusable.outline";
import {ReusableFieldComponentConfig} from "../component/reusable.model";

interface V4ClassNames {
    v4ClassName: string;
    v4CompClassName: string;
}

interface V5ClassNames {
    componentClassName: string;
    modelClassName?: string;
    layoutClassName?: string;
}

/*
 * HOW TO ADD OR UPDATE THE MAPPING
 *
 * There are a few places to update to properly map from a v4 form config to a v5 form config:
 * 1. Add the v4 class name and comp class name to formConfigV4ToV5Mapping, along with the matching v5 class names.
 * 2. Add any component-specific mapping post-processing to postProcessingFormConfigV4ToV5Mapping.
 * 3. Check the 'visit<Name>[Field|Form]...' methods, and see if there is any special processing needed.
 *
 */

/**
 * Overall mapping from v4 class, v4 compClass to v5 class names.
 */
const formConfigV4ToV5Mapping: { [v4ClassName: string]: { [v4CompClassName: string]: V5ClassNames } } = {
    "Container": {
        "": {
            componentClassName: GroupFieldComponentName,
            modelClassName: GroupFieldModelName
        },
        "TextBlockComponent": {
            componentClassName: ContentComponentName
        },
        "GenericGroupComponent": {
            componentClassName: GroupFieldComponentName,
            modelClassName: GroupFieldModelName
        },
    },
    "TextArea": {
        "": {
            componentClassName: TextAreaComponentName,
            modelClassName: TextAreaModelName
        },
        "TextAreaComponent": {
            componentClassName: TextAreaComponentName,
            modelClassName: TextAreaModelName
        },
    },
    // TODO: create a Markdown / HTML text edit component
    "MarkdownTextArea": {
        "": {
            componentClassName: TextAreaComponentName,
            modelClassName: TextAreaModelName
        },
        "MarkdownTextAreaComponent": {
            componentClassName: TextAreaComponentName,
            modelClassName: TextAreaModelName
        }
    },
    "TabOrAccordionContainer": {
        "": {
            componentClassName: TabComponentName,
            layoutClassName: TabLayoutName
        },
        "TabOrAccordionContainerComponent": {
            componentClassName: TabComponentName,
            layoutClassName: TabLayoutName
        },
    },
    "ButtonBarContainer": {
        "": {
            componentClassName: GroupFieldComponentName,
            modelClassName: GroupFieldModelName
        },
        "ButtonBarContainerComponent": {
            componentClassName: GroupFieldComponentName,
            modelClassName: GroupFieldModelName
        },
    },
    "TextField": {
        "": {
            componentClassName: SimpleInputComponentName,
            modelClassName: SimpleInputModelName
        },
    },
    "HiddenValue": {
        "HiddenValueComponent": {
            componentClassName: SimpleInputComponentName,
            modelClassName: SimpleInputModelName
        },
    },
    "RepeatableContainer": {
        "": {
            componentClassName: RepeatableComponentName,
            modelClassName: RepeatableModelName
        },
        "RepeatableTextfieldComponent": {
            componentClassName: RepeatableComponentName,
            modelClassName: RepeatableModelName
        },
        "RepeatableGroupComponent": {
            componentClassName: RepeatableComponentName,
            modelClassName: RepeatableModelName
        },
        "RepeatableVocabComponent": {
            componentClassName: RepeatableComponentName,
            modelClassName: RepeatableModelName
        }
    },
    "RepeatableContributor": {
        "RepeatableContributorComponent": {
            componentClassName: RepeatableComponentName,
            modelClassName: RepeatableModelName
        }
    },
    "RepeatableVocab": {
        "": {
            componentClassName: RepeatableComponentName,
            modelClassName: RepeatableModelName
        },
        "RepeatableVocabComponent": {
            componentClassName: RepeatableComponentName,
            modelClassName: RepeatableModelName
        }
    },
    "SelectionField": {
        "DropdownFieldComponent": {
            componentClassName: DropdownInputComponentName,
            modelClassName: DropdownInputModelName
        },
        "SelectionFieldComponent": {
            componentClassName: DropdownInputComponentName,
            modelClassName: DropdownInputModelName
        }
    },
    "DateTime": {
        "": {
            componentClassName: DateInputComponentName,
            modelClassName: DateInputModelName
        },
    },
    "SaveButton": {
        "": {
            componentClassName: SaveButtonComponentName
        },
    },
    // TODO: Should tab nav be a different component?
    "TabNavButton": {
        "": {
            componentClassName: SaveButtonComponentName
        },
    },
    // TODO: Should anchor or button be a different component?
    "AnchorOrButton": {
        "": {
            componentClassName: SaveButtonComponentName
        },
        // TODO: what is class: AnchorOrButton, compClass: TextBlockComponent?
        // "TextBlockComponent": {}
    },
    // TODO: Should cancel button be a different component?
    "CancelButton": {
        "": {
            componentClassName: SaveButtonComponentName
        },
    },
    // TabContentContainer is not a real v4 class: it a placeholder to aid mapping to tab content component
    "TabContentContainer": {
        "": {
            componentClassName: TabContentComponentName,
            layoutClassName: TabContentLayoutName
        },
    },
    "ContributorField": {
        "": {
            componentClassName: ReusableComponentName,
        },
    },
};

/**
 * Post-processing after mapping v4 to v5 class names.
 * @param v4Field The v4 field.
 * @param v4ClassNames The v4 class names used to match the mapping.
 * @param v5ClassNames The v5 class names that matched.
 */
function postProcessingFormConfigV4ToV5Mapping(
    v4Field: Record<string, unknown>, v4ClassNames: V4ClassNames, v5ClassNames: V5ClassNames
): V5ClassNames {
    const v4ClassName = v4ClassNames.v4ClassName;
    const v4CompClassName = v4ClassNames.v4CompClassName;
    const fieldDefinition = (v4Field?.definition ?? {}) as Record<string, unknown>;

    let v5ComponentClassName = v5ClassNames.componentClassName || "";
    let v5ModelClassName = v5ClassNames.modelClassName || "";
    let v5LayoutClassName = v5ClassNames.layoutClassName || "";

    // Some components need special processing.

    // Use the CheckboxInputComponent
    if (fieldDefinition?.controlType === 'checkbox') {
        v5ComponentClassName = "CheckboxInputComponent";
        v5ModelClassName = "CheckboxInputModel";
    }

    // Use the RadioInputComponent
    if (fieldDefinition?.controlType === 'radio') {
        v5ComponentClassName = "RadioInputComponent";
        v5ModelClassName = "RadioInputModel";
    }

    return {
        componentClassName: v5ComponentClassName,
        modelClassName: v5ModelClassName,
        layoutClassName: v5LayoutClassName,
    }
}


/**
 * A form config visitor for migrating from v4 form config structure to v5 structure.
 *
 * Any v4 form config that cannot be automatically mapped will be added as a string value to a property.
 * If a component cannot be mapped, it will be added as a ContentComponent with a descriptive content.
 *
 * The resulting FormConfig is intended to be passed to the construct visitor, as if it was loaded from form config json.
 */
export class MigrationV4ToV5FormConfigVisitor extends FormConfigVisitor {
    protected override logName = "MigrationV4ToV5FormConfigVisitor";

    private formComponentMap: VisitorFormComponentClassDefMapType;

    private v4FormConfig: Record<string, unknown>;
    private v5FormConfig: FormConfigOutline;

    private mostRecentRepeatableElementTemplatePath: LineagePath | null;

    private v4FormPath: LineagePath;
    private formPathHelper: FormPathHelper;
    private sharedProps: PropertiesHelper;

    constructor(logger: ILogger) {
        super(logger);
        this.formComponentMap = FormComponentDefinitionMap;

        this.v4FormConfig = {
            attachmentFields: undefined,
            customAngularApp: {appName: "", appSelector: ""},
            editCssClasses: "",
            fields: [],
            messages: {},
            name: "",
            requiredFieldIndicator: "",
            skipValidationOnSave: false,
            type: "",
            viewCssClasses: "",
            workflowStep: "",
        };
        this.v5FormConfig = new FormConfig();
        this.v4FormPath = [];

        this.mostRecentRepeatableElementTemplatePath = null;

        this.formPathHelper = new FormPathHelper(logger, this);
        this.sharedProps = new PropertiesHelper();
    }

    start(options: { data: any }): FormConfigOutline {
        this.v4FormConfig = _cloneDeep(this.normaliseV4FormConfig(options.data));
        this.v5FormConfig = new FormConfig();
        this.v5FormConfig.debugValue = true;
        this.v4FormPath = [];

        this.mostRecentRepeatableElementTemplatePath = null;

        this.formPathHelper.reset();

        this.v5FormConfig.accept(this);
        return this.v5FormConfig;
    }

    /* Form Config */

    visitFormConfig(item: FormConfigOutline): void {
        const currentData = this.getV4Data();

        // Set properties that are the same in v4 and v5.
        this.sharedProps.setPropOverride('name', item, currentData);
        this.sharedProps.setPropOverride('type', item, currentData);
        this.sharedProps.setPropOverride('viewCssClasses', item, currentData);
        this.sharedProps.setPropOverride('editCssClasses', item, currentData);

        // Convert properties from v4 to v5.

        // TODO: form.customAngularApp?
        // TODO: form.workflowStep?
        // TODO: form.requiredFieldIndicator?
        // TODO: form.messages?
        // TODO: form.attachmentFields?

        // Convert skipValidationOnSave to enabledValidationGroups.
        if (Object.hasOwn(currentData, 'skipValidationOnSave')) {
            switch (currentData.skipValidationOnSave) {
                case true:
                    item.enabledValidationGroups = ["none"];
                    break;
                default:
                case false:
                    item.enabledValidationGroups = ["all"];
                    break;
            }
        }

        // Convert fields to components
        const fields: Record<string, unknown>[] = currentData.fields ?? [];
        // this.logger.info(`Processing '${item.name}': with ${fields.length} fields at ${JSON.stringify(this.v4FormPath)}.`);
        fields.forEach((field, index) => {
            const v4FormPathMore = ["fields", index.toString()];
            // Create the instance from the v4 config
            const formComponent = this.constructFormComponent(field, v4FormPathMore);

            // Visit children
            this.acceptV4FormConfigPath(
                formComponent,
                this.formPathHelper.lineagePathsForFormConfigComponentDefinition(formComponent, index),
                v4FormPathMore,
            );

            // Store the instance on the item
            item.componentDefinitions.push(formComponent);
        });

        // Add the validation summary.
        const validationSummaryFrame = {
            name: 'validation_summary',
            component: {class: "ValidationSummaryComponent"}
        };
        const validationSummaryComponent = this.sharedProps.sharedConstructFormComponent(validationSummaryFrame);
        item.componentDefinitions.push(validationSummaryComponent);
    }


    /* SimpleInput */

    visitSimpleInputFieldComponentDefinition(item: SimpleInputFieldComponentDefinitionOutline): void {
        const field = this.getV4Data();
        item.config = new SimpleInputFieldComponentConfig();
        this.sharedPopulateFieldComponentConfig(item.config, field);
        this.sharedProps.setPropOverride('type', item.config, field?.definition);

        if (field?.class === 'HiddenValue' || field?.compClass === 'HiddenValueComponent') {
            item.config.type = "hidden";
        }
    }

    visitSimpleInputFieldModelDefinition(item: SimpleInputFieldModelDefinitionOutline): void {
        const field = this.getV4Data();
        item.config = new SimpleInputFieldModelConfig();
        this.sharedPopulateFieldModelConfig(item.config, field);

    }

    visitSimpleInputFormComponentDefinition(item: SimpleInputFormComponentDefinitionOutline): void {
        this.populateFormComponent(item);
    }


    /* Content */

    visitContentFieldComponentDefinition(item: ContentFieldComponentDefinitionOutline): void {
        const field = this.getV4Data();
        if (!item.config) {
            item.config = new ContentFieldComponentConfig();
        }
        this.sharedPopulateFieldComponentConfig(item.config, field);

        // Content component is used to display info about missing component mappings.
        // Provide a message for not yet implemented fields.
        let {componentClassName, modelClassName, layoutClassName} = this.mapV4ToV5(field);
        if (!componentClassName) {
            const v4ClassName = field?.class?.toString() ?? "";
            const v4CompClassName = field?.compClass?.toString() ?? "";
            const v4Name = field?.definition?.name || field?.definition?.id;

            const msgs = [
                `Not yet implemented in v5: v4ClassName ${JSON.stringify(v4ClassName)} v4CompClassName ${JSON.stringify(v4CompClassName)} v4Name ${JSON.stringify(v4Name)}.`,
                `At path '${JSON.stringify(this.v4FormPath)}'.`
            ];

            if (modelClassName) {
                msgs.push(`Model: ${modelClassName}.`);
            }

            if (layoutClassName) {
                msgs.push(`Layout: ${layoutClassName}.`);
            }

            const msg = msgs.join(' ');
            item.config.content = msg;
            this.logger.warn(msg);
        } else {
            // Map from the v4 config to v5 config.

            /*
             * The below template is a reference that needs to be taken into account for legacy compatibility
             *
             * <span *ngSwitchCase="'h1'" role="heading" aria-level="1" [ngClass]="field.cssClasses">{{field.value == null? '' : field.value}}</span>
             * <span *ngSwitchCase="'h2'" role="heading" aria-level="2" [ngClass]="field.cssClasses">{{field.value == null? '' : field.value}}</span>
             * <span *ngSwitchCase="'h3'" role="heading" aria-level="3" [ngClass]="field.cssClasses">{{field.value == null? '' : field.value}}</span>
             * <span *ngSwitchCase="'h4'" role="heading" aria-level="4" [ngClass]="field.cssClasses">{{field.value == null? '' : field.value}}</span>
             * <span *ngSwitchCase="'h5'" role="heading" aria-level="5" [ngClass]="field.cssClasses">{{field.value == null? '' : field.value}}</span>
             * <span *ngSwitchCase="'h6'" role="heading" aria-level="6" [ngClass]="field.cssClasses">{{field.value == null? '' : field.value}}</span>
             * <hr *ngSwitchCase="'hr'" [ngClass]="field.cssClasses">
             * <span *ngSwitchCase="'span'" [ngClass]="field.cssClasses">{{field.label == null? '' : field.label + ': '}}{{field.value == null? '' : field.value}}</span>
             * <p *ngSwitchDefault [ngClass]="field.cssClasses" [innerHtml]="field.value == null? '' : field.value"></p>
             */

            const v4Value = field?.definition?.value ?? "";
            const v4Type = field?.definition?.type;

            switch (v4Type) {
                case "h1":
                    item.config.content = v4Value;
                    item.config.template = `<span role="heading" aria-level="1">{{content}}</span>`;
                    break;
                case "h2":
                    item.config.content = v4Value;
                    item.config.template = `<span role="heading" aria-level="2">{{content}}</span>`;
                    break;
                case "h3":
                    item.config.content = v4Value;
                    item.config.template = `<span role="heading" aria-level="3">{{content}}</span>`;
                    break;
                case "h4":
                    item.config.content = v4Value;
                    item.config.template = `<span role="heading" aria-level="4">{{content}}</span>`;
                    break;
                case "h5":
                    item.config.content = v4Value;
                    item.config.template = `<span role="heading" aria-level="5">{{content}}</span>`;
                    break;
                case "h6":
                    item.config.content = v4Value;
                    item.config.template = `<span role="heading" aria-level="6">{{content}}</span>`;
                    break;
                case "hr":
                    item.config.content = v4Value;
                    item.config.template = `<hr>`;
                    break;
                case "span":
                    const label = item.config.label;
                    if (v4Value && label) {
                        item.config.content = {value: v4Value, label: item.config.label};
                        item.config.template = `<span>{{content.label}}: {{content.value}}</span>`;
                    } else if (v4Value && !label) {
                        item.config.content = v4Value
                        item.config.template = `<span>{{content}}</span>`;
                    } else if (!v4Value && label) {
                        item.config.content = label
                        item.config.template = `<span>{{content}}:</span>`;
                    } else {
                        item.config.content = "";
                    }
                    break;
                default:
                    item.config.content = v4Value;
                    item.config.template = `<p>{{content}}</p>`;
                    break;
            }
        }
    }

    visitContentFormComponentDefinition(item: ContentFormComponentDefinitionOutline): void {
        this.populateFormComponent(item);
    }

    /* Repeatable  */

    visitRepeatableFieldComponentDefinition(item: RepeatableFieldComponentDefinitionOutline): void {
        const field = this.getV4Data();
        item.config = new RepeatableFieldComponentConfig();
        this.sharedPopulateFieldComponentConfig(item.config, field);
        const currentFormConfigPath = this.formPathHelper.formPath.formConfig;

        const fields = field?.definition?.fields ?? [];
        // this.logger.info(`Processing '${item.class}': with ${fields.length} fields at ${JSON.stringify(this.v4FormPath)}.`);

        if (fields.length === 1) {
            const v4Field = fields[0];

            // Track the most recent element template.
            // - Ensure newEntryValue is used only in elementTemplate definitions.
            // - Ensure defaultValue is not defined in elementTemplate or any nested components.
            const previousMostRecentRepeatableElementTemplatePath = this.mostRecentRepeatableElementTemplatePath === null
                ? null : [...this.mostRecentRepeatableElementTemplatePath];
            this.mostRecentRepeatableElementTemplatePath = [...currentFormConfigPath, "config", "elementTemplate"];

            try {
                const v4FormPathMore = ["definition", "fields", "0"];
                // Create the instance from the v4 config
                const formComponent = this.constructFormComponent(v4Field, v4FormPathMore);

                // The elementTemplate's name must be a falsy value.
                formComponent.name = "";

                // Visit children
                this.acceptV4FormConfigPath(
                    formComponent,
                    this.formPathHelper.lineagePathsForRepeatableFieldComponentDefinition(formComponent),
                    v4FormPathMore,
                );

                // TODO: This check & change needs to be expanded to collect the defaultValues for all nested components as well.
                //       Likely something similar to how the construct visitor does it could be adapted for this.
                // Overall repeatable default: repeatable.model.config.defaultValue
                // New item default: elementTemplate.model.config.newEntryValue
                // The elementTemplate defaultValue must be set in newEntryValue
                if (formComponent?.model?.config?.defaultValue !== undefined) {
                    formComponent.model.config.newEntryValue = formComponent?.model?.config?.defaultValue;
                    const i = formComponent.model.config;
                    delete i['defaultValue'];
                }

                // The newEntryValue must have a value.
                // if (formComponent?.model?.config !== undefined && formComponent.model.config.newEntryValue === undefined) {
                //     formComponent.model.config.newEntryValue = {};
                // }


                // Store the instance on the item
                item.config.elementTemplate = formComponent;
            } finally {
                // Restore the previous element template state.
                this.mostRecentRepeatableElementTemplatePath = previousMostRecentRepeatableElementTemplatePath;
            }
        } else {
            this.logger.error(`${this.logName}: Expected one field in definition for repeatable, but found ${fields.length}: ${JSON.stringify(field)}`);
        }
    }

    visitRepeatableFieldModelDefinition(item: RepeatableFieldModelDefinitionOutline): void {
        const field = this.getV4Data();
        item.config = new RepeatableFieldModelConfig();
        this.sharedPopulateFieldModelConfig(item.config, field);
    }

    visitRepeatableElementFieldLayoutDefinition(item: RepeatableElementFieldLayoutDefinitionOutline): void {
        const field = this.getV4Data();
        item.config = new RepeatableElementFieldLayoutConfig();
        this.sharedPopulateFieldLayoutConfig(item.config, field);
    }

    visitRepeatableFormComponentDefinition(item: RepeatableFormComponentDefinitionOutline): void {
        this.populateFormComponent(item);
    }

    /* Validation Summary */

    visitValidationSummaryFieldComponentDefinition(item: ValidationSummaryFieldComponentDefinitionOutline): void {
        const field = this.getV4Data();
        item.config = new ValidationSummaryFieldComponentConfig();
        this.sharedPopulateFieldComponentConfig(item.config, field);
    }

    visitValidationSummaryFormComponentDefinition(item: ValidationSummaryFormComponentDefinitionOutline): void {
        this.populateFormComponent(item);
    }

    /* Group */

    visitGroupFieldComponentDefinition(item: GroupFieldComponentDefinitionOutline): void {
        const field = this.getV4Data();
        const config = new GroupFieldComponentConfig();
        item.config = config;
        this.sharedPopulateFieldComponentConfig(item.config, field);
        this.logger.info(`${this.logName}: visitGroupFieldComponentDefinition field ${JSON.stringify(field)} item ${JSON.stringify(item)}`);

        const fields: Record<string, unknown>[] = field?.definition?.fields ?? [];
        // this.logger.info(`Processing '${item.class}': with ${fields.length} fields at ${JSON.stringify(this.v4FormPath)}.`);
        fields.forEach((field, index) => {
            const v4FormPathMore = ["definition", "fields", index.toString()];
            // Create the instance from the v4 config
            const formComponent = this.constructFormComponent(field, v4FormPathMore);

            // Visit children
            this.acceptV4FormConfigPath(
                formComponent,
                this.formPathHelper.lineagePathsForGroupFieldComponentDefinition(formComponent, index),
                v4FormPathMore,
            );

            // Store the instance on the item
            config.componentDefinitions.push(formComponent);
        });
    }

    visitGroupFieldModelDefinition(item: GroupFieldModelDefinitionOutline): void {
        const field = this.getV4Data();
        item.config = new GroupFieldModelConfig();
        this.sharedPopulateFieldModelConfig(item.config, field);
    }

    visitGroupFormComponentDefinition(item: GroupFormComponentDefinitionOutline): void {
        this.populateFormComponent(item);
    }

    /* Tab  */

    visitTabFieldComponentDefinition(item: TabFieldComponentDefinitionOutline): void {
        const field = this.getV4Data();
        const config = new TabFieldComponentConfig();
        item.config = config;
        this.sharedPopulateFieldComponentConfig(item.config, field);

        const fields: Record<string, unknown>[] = field?.definition?.fields ?? [];
        // this.logger.info(`Processing '${item.class}': with ${fields.length} fields at ${JSON.stringify(this.v4FormPath)}.`);
        fields.forEach((field, index) => {
            const v4FormPathMore = ["definition", "fields", index.toString()];

            // TODO: Does this approach to mapping the tab content component lose data?
            // build tab component from field by setting 'placeholder' v4 class
            // TabContentContainer is not a real v4 class: it a placeholder to aid mapping to tab content component
            field.class = "TabContentContainer";

            // Create the instance from the v4 config
            const formComponent = this.constructFormComponent(field, v4FormPathMore);
            if (isTypeFormComponentDefinitionName<TabContentFormComponentDefinitionFrame>(formComponent, TabContentComponentName)) {

                // Visit children
                this.acceptV4FormConfigPath(
                    formComponent,
                    this.formPathHelper.lineagePathsForTabFieldComponentDefinition(formComponent, index),
                    v4FormPathMore,
                );

                // Store the instance on the item
                config.tabs.push(formComponent);
            }
        });
    }

    visitTabFieldLayoutDefinition(item: TabFieldLayoutDefinitionOutline): void {
        const field = this.getV4Data();
        item.config = new TabFieldLayoutConfig();
        this.sharedPopulateFieldLayoutConfig(item.config, field);
    }

    visitTabFormComponentDefinition(item: TabFormComponentDefinitionOutline): void {
        this.populateFormComponent(item);
    }

    /*  Tab Content */

    visitTabContentFieldComponentDefinition(item: TabContentFieldComponentDefinitionOutline): void {
        const field = this.getV4Data();
        const config = new TabContentFieldComponentConfig();
        item.config = config;
        this.sharedPopulateFieldComponentConfig(item.config, field);

        const fields: Record<string, unknown>[] = field?.definition?.fields ?? [];
        // this.logger.info(`Processing '${item.class}': with ${fields.length} fields at ${JSON.stringify(this.v4FormPath)}.`);
        fields.forEach((field, index) => {
            const v4FormPathMore = ["definition", "fields", index.toString()];
            // Create the instance from the v4 config
            const formComponent = this.constructFormComponent(field, v4FormPathMore);

            // Visit children
            this.acceptV4FormConfigPath(
                formComponent,
                this.formPathHelper.lineagePathsForTabContentFieldComponentDefinition(formComponent, index),
                ["definition", "fields", index.toString()],
            );

            // Store the instance on the item
            config.componentDefinitions.push(formComponent);
        });
    }

    visitTabContentFieldLayoutDefinition(item: TabContentFieldLayoutDefinitionOutline): void {
        const field = this.getV4Data();
        item.config = new TabContentFieldLayoutConfig();
        if (field?.definition?.label) {
            item.config.buttonLabel = field?.definition?.label;
        }
        this.sharedPopulateFieldLayoutConfig(item.config, field);
    }

    visitTabContentFormComponentDefinition(item: TabContentFormComponentDefinitionOutline): void {
        this.populateFormComponent(item);
    }

    /* Save Button  */

    visitSaveButtonFieldComponentDefinition(item: SaveButtonFieldComponentDefinitionOutline): void {
        const field = this.getV4Data();
        item.config = new SaveButtonFieldComponentConfig();
        this.sharedPopulateFieldComponentConfig(item.config, field);
    }

    visitSaveButtonFormComponentDefinition(item: SaveButtonFormComponentDefinitionOutline): void {
        this.populateFormComponent(item);
    }

    /* Text Area */

    visitTextAreaFieldComponentDefinition(item: TextAreaFieldComponentDefinitionOutline): void {
        const field = this.getV4Data();
        item.config = new TextAreaFieldComponentConfig();
        this.sharedPopulateFieldComponentConfig(item.config, field);

        const cols = field?.definition?.cols ?? field?.definition?.columns ?? undefined;
        this.sharedProps.setPropOverride('cols', item.config, {cols: cols === undefined ? undefined : parseInt(cols)});

        const rows = field?.definition?.rows ?? undefined;
        this.sharedProps.setPropOverride('rows', item.config, {rows: rows === undefined ? undefined : parseInt(rows)});
    }

    visitTextAreaFieldModelDefinition(item: TextAreaFieldModelDefinitionOutline): void {
        const field = this.getV4Data();
        item.config = new TextAreaFieldModelConfig();
        this.sharedPopulateFieldModelConfig(item.config, field);
    }

    visitTextAreaFormComponentDefinition(item: TextAreaFormComponentDefinitionOutline): void {
        this.populateFormComponent(item);
    }

    /* Default Layout  */

    visitDefaultFieldLayoutDefinition(item: DefaultFieldLayoutDefinitionOutline): void {
        const field = this.getV4Data();
        item.config = new DefaultFieldLayoutConfig();
        this.sharedPopulateFieldLayoutConfig(item.config, field);
    }

    /* Checkbox Input */

    visitCheckboxInputFieldComponentDefinition(item: CheckboxInputFieldComponentDefinitionOutline): void {
        const field = this.getV4Data();
        item.config = new CheckboxInputFieldComponentConfig();
        this.sharedPopulateFieldComponentConfig(item.config, field);

        const options = this.migrateOptions(field);
        this.sharedProps.setPropOverride('options', item.config, {options: options});
    }

    visitCheckboxInputFieldModelDefinition(item: CheckboxInputFieldModelDefinitionOutline): void {
        const field = this.getV4Data();
        item.config = new CheckboxInputFieldModelConfig();
        this.sharedPopulateFieldModelConfig(item.config, field);
    }

    visitCheckboxInputFormComponentDefinition(item: CheckboxInputFormComponentDefinitionOutline): void {
        this.populateFormComponent(item);
    }

    /* Dropdown Input */

    visitDropdownInputFieldComponentDefinition(item: DropdownInputFieldComponentDefinitionOutline): void {
        const field = this.getV4Data();
        item.config = new DropdownInputFieldComponentConfig();
        this.sharedPopulateFieldComponentConfig(item.config, field);

        const options = this.migrateOptions(field);
        this.sharedProps.setPropOverride('options', item.config, {options: options});
    }

    visitDropdownInputFieldModelDefinition(item: DropdownInputFieldModelDefinitionOutline): void {
        const field = this.getV4Data();
        item.config = new DropdownInputFieldModelConfig();
        this.sharedPopulateFieldModelConfig(item.config, field);
    }

    visitDropdownInputFormComponentDefinition(item: DropdownInputFormComponentDefinitionOutline): void {
        this.populateFormComponent(item);
    }

    /* Radio Input */

    visitRadioInputFieldComponentDefinition(item: RadioInputFieldComponentDefinitionOutline): void {
        const field = this.getV4Data();
        item.config = new RadioInputFieldComponentConfig();
        this.sharedPopulateFieldComponentConfig(item.config, field);

        const options = this.migrateOptions(field);
        this.sharedProps.setPropOverride('options', item.config, {options: options});
    }

    visitRadioInputFieldModelDefinition(item: RadioInputFieldModelDefinitionOutline): void {
        const field = this.getV4Data();
        item.config = new RadioInputFieldModelConfig();
        this.sharedPopulateFieldModelConfig(item.config, field);
    }

    visitRadioInputFormComponentDefinition(item: RadioInputFormComponentDefinitionOutline): void {
        this.populateFormComponent(item);
    }

    /* Date Input */

    visitDateInputFieldComponentDefinition(item: DateInputFieldComponentDefinitionOutline): void {
        const field = this.getV4Data();
        item.config = new DateInputFieldComponentConfig();
        this.sharedPopulateFieldComponentConfig(item.config, field);
    }

    visitDateInputFieldModelDefinition(item: DateInputFieldModelDefinitionOutline): void {
        const field = this.getV4Data();
        item.config = new DateInputFieldModelConfig();
        this.sharedPopulateFieldModelConfig(item.config, field);
    }

    visitDateInputFormComponentDefinition(item: DateInputFormComponentDefinitionOutline): void {
        this.populateFormComponent(item);
    }

    /* Reusable */

    visitReusableFieldComponentDefinition(item: ReusableFieldComponentDefinitionOutline): void {
        const field = this.getV4Data();
        item.config = new ReusableFieldComponentConfig();
        this.sharedPopulateFieldComponentConfig(item.config, field);

        // Set up the reusable form config for ContributorField in the field component.
        const v4ClassName = field?.class?.toString() ?? "";
        if (v4ClassName === "ContributorField") {
            const fieldDefinition = (field?.definition ?? {}) as Record<string, unknown>;

            // TODO: use more of the contributor field properties on the new component?
            const showHeader = field.showHeader ?? true;
            const required = fieldDefinition.required ?? false;
            const label = fieldDefinition.label?.toString() ?? "";
            const help = fieldDefinition.help ?? "";
            const role = fieldDefinition.role ?? "";
            const name = fieldDefinition.name?.toString() ?? "";
            const freeText = fieldDefinition.freeText ?? false;
            const forceLookupOnly = fieldDefinition?.forceLookupOnly ?? true;
            const vocabQueryId = fieldDefinition?.vocabQueryId ?? '';
            const sourceType = fieldDefinition?.sourceType ?? '';
            const fieldNames = fieldDefinition?.fieldNames ?? [];
            const searchFields = fieldDefinition?.searchFields ?? "";
            const titleFieldArr = fieldDefinition?.titleFieldArr ?? [];
            const titleFieldDelim = fieldDefinition?.titleFieldDelim ?? "";
            const nameColHdr = fieldDefinition?.nameColHdr ?? "";
            const emailColHdr = fieldDefinition?.emailColHdr ?? "";
            const orcidColHdr = fieldDefinition?.orcidColHdr ?? "";
            const showRole = fieldDefinition?.showRole ?? false;
            const placeHolder = fieldDefinition?.placeHolder ?? "";
            const activeValidators = fieldDefinition?.activeValidators ?? {};
            const publish = fieldDefinition?.publish ?? {};
            const validation_required_name = fieldDefinition?.validation_required_name ?? "";
            const validation_required_email = fieldDefinition?.validation_required_email ?? "";
            const validation_invalid_email = fieldDefinition?.validation_invalid_email ?? "";

            // Use the same field, so don't change the lineage path.
            const reusableComponentItemData = {
                name: "standard_contributor_fields_group",
                overrides: {replaceName: ""},
                layout: {class: "DefaultLayout", config: {}},
                component: {class: "GroupComponent", config: {}},
            };
            const reusableComponentItem = this.sharedProps.sharedConstructFormComponent(reusableComponentItemData);

            // Visit children
            this.acceptV4FormConfigPath(
                reusableComponentItem,
                this.formPathHelper.lineagePathsForReusableFieldComponentDefinition(reusableComponentItem, 0),
            );

            // Store the instance on the item
            item.config.componentDefinitions.push(reusableComponentItem);
        }
    }

    visitReusableFormComponentDefinition(item: ReusableFormComponentDefinitionOutline): void {
        const field = this.getV4Data();

        const v4ClassName = field?.class?.toString() ?? "";

        // Set up the reusable form config for ContributorField in the form component.
        if (v4ClassName === "ContributorField") {
            // Use a reusable form config.
            item.overrides = {reusableFormName: "standard-contributor-fields-group"};

            // ReusableComponent cannot have a layout.
            item.layout = undefined;
        }

        this.populateFormComponent(item);
    }

    /* Shared */

    protected acceptV4FormConfigPath(item: CanVisit, more?: LineagePathsPartial, v4FormPath?: string[]): void {
        // Copy the original lineage paths so they can be restored.
        const original = [...(this.v4FormPath ?? [])];
        try {
            this.v4FormPath = [...original, ...(v4FormPath ?? [])];
            this.formPathHelper.acceptFormPath(item, more);
        } catch (error) {
            throw error;
        } finally {
            this.v4FormPath = original;
        }
    }

    protected mapV4ToV5(v4Field: Record<string, unknown>): V5ClassNames {
        const v4ClassName = v4Field?.class?.toString() ?? "";
        const v4CompClassName = v4Field?.compClass?.toString() ?? "";

        const matched = formConfigV4ToV5Mapping[v4ClassName]?.[v4CompClassName] ?? {};
        const v4ClassNames = {v4ClassName, v4CompClassName};
        return postProcessingFormConfigV4ToV5Mapping(v4Field, v4ClassNames, matched);
    }

    protected constructFormComponent(field: Record<string, any>, more?: LineagePath): AllFormComponentDefinitionOutlines {
        let {componentClassName, modelClassName, layoutClassName} = this.mapV4ToV5(field);

        const name = field?.definition?.name || field?.definition?.id || [componentClassName, ...this.v4FormPath, ...(more ?? [])].join('-');

        // Build the form component definition frame
        const currentData: FormComponentDefinitionFrame = {
            name: name,
            module: undefined,
            component: {
                class: componentClassName, config: {},
            },
        };
        if (modelClassName) {
            currentData.model = {class: modelClassName, config: {}};
        }
        // TODO: Give everything a layout for now.
        if (!layoutClassName) {
            layoutClassName = "DefaultLayout";
        }
        currentData.layout = {class: layoutClassName, config: {}};


        // Set the constraints
        currentData.constraints = {};

        if (field?.editOnly === true || field?.viewOnly === true) {
            currentData.constraints.allowModes = [];
            if (field?.editOnly === true) {
                currentData.constraints.allowModes.push("edit");
            }
            if (field?.viewOnly === true) {
                currentData.constraints.allowModes.push("view");
            }
        }

        currentData.constraints.authorization = {};
        currentData.constraints.authorization.allowRoles = [];
        if (field?.roles?.length > 0) {
            currentData.constraints.authorization.allowRoles.push(...field?.roles);
        }

        // TODO: Set the expressions

        // If there is an error message or the form component class is not known,
        // create a content component instead.
        // The content is set when visiting the field component.

        const formComponentClass = this.formComponentMap?.get(componentClassName);
        if (!componentClassName || !formComponentClass) {
            currentData.component.class = ContentComponentName;
            currentData.layout = {class: DefaultLayoutName, config: {}};
            currentData.model = undefined;
            if (!currentData.component.config) {
                currentData.component.config = {};
            }
        }

        // Construct the form component instance from the built form config frame.
        return this.sharedProps.sharedConstructFormComponent(currentData);
    }

    protected populateFormComponent(item: FormComponentDefinitionOutline): void {
        // Continue visiting
        this.formPathHelper.acceptFormComponentDefinition(item);
        // this.acceptV4FormConfigPath(item.component, {formConfig: ['component']});
        // if (item.model) {
        //     this.acceptV4FormConfigPath(item.model, {formConfig: ['model']});
        // }
        // if (item.layout) {
        //     this.acceptV4FormConfigPath(item.layout, {formConfig: ['layout']});
        // }
    }

    protected sharedPopulateFieldComponentConfig(item: FieldComponentConfigFrame, field?: any) {
        const config = {
            label: field?.definition?.label || field?.definition?.name,
        };
        this.sharedProps.sharedPopulateFieldComponentConfig(item, config);
    }

    protected sharedPopulateFieldModelConfig(item: FieldModelConfigFrame<unknown>, field?: any) {
        if (!item.validators) {
            item.validators = [];
        }
        if (field?.definition?.required === true) {
            item.validators.push({class: 'required'});
        }
        if (field?.definition?.maxLength !== undefined) {
            item.validators.push({class: 'maxLength', config: {maxLength: field?.definition?.maxLength}});
        }
        const config = {
            defaultValue: field?.definition?.value ?? field?.definition?.defaultValue,
        };
        // TODO: Components that are a descendant of a repeatable element template cannot have a default value.
        //       The default values should be collected and set as the element template newEntryValue.
        if (this.isRepeatableElementTemplateDescendant()) {
            delete config['defaultValue'];
        }
        this.sharedProps.sharedPopulateFieldModelConfig(item, config);
    }

    protected sharedPopulateFieldLayoutConfig(item: FieldLayoutConfigFrame, field?: any) {
        const config = {
            label: field?.definition?.label,
            helpText: field?.definition?.help,
        };
        this.sharedProps.sharedPopulateFieldLayoutConfig(item, config);
    }

    protected getV4Data() {
        const data = this.v4FormConfig;
        const path = this.v4FormPath;

        const result = (!path || path.length < 1) ? data : _get(data, path.map(i => i.toString()));

        // this.logger.info(JSON.stringify({path, result}));
        return result;
    }

    private normaliseV4FormConfig(formConfig: any): Record<string, unknown> {
        if (formConfig === undefined || formConfig === null) {
            formConfig = {};
        }

        // If the top level is an array, assume it is an array of field definitions.
        if (Array.isArray(formConfig)) {
            formConfig = {fields: formConfig};
        }

        // If the top level has a 'form' property, assume it is an export in the structure form.forms[formId] = formConfig.
        if (Object.hasOwn(formConfig, 'form')) {
            const formIds = Object.keys(formConfig.form.forms ?? {}).filter(formId => formId !== '_dontMerge');
            if (formIds.length === 1) {
                this.logger.info(`Migrating form id: ${formIds[0]}`);
                formConfig = formConfig.form.forms[formIds[0]];
            } else {
                const topKeys = Object.keys(formConfig);
                const formKeys = Object.keys(formConfig.form ?? {});
                const formsKeys = Object.keys(formConfig.form?.forms ?? {});
                this.logger.error(`Cannot migrate due to more or less than one form id: ${JSON.stringify({
                    topKeys,
                    formKeys,
                    formsKeys
                })}`);
                formConfig = {};
            }
        }

        // Set the form config name if there isn't one.
        if (!formConfig.name) {
            formConfig.name = 'v4FormConfig';
        }
        return formConfig;
    }

    protected migrateOptions(field: Record<string, unknown>) {
        return ((field?.definition as Record<string, unknown>)?.options as string[] ?? []).map((option: any) => {
            return {
                label: option?.label ?? '',
                value: option?.value ?? '',
                disabled: option?.disabled ?? option?.historicalOnly ?? undefined,
            }
        });
    }

    /**
     * Check whether the current form config path matches the
     * most recent repeatable element template path.
     * @protected
     */
    protected isMostRecentRepeatableElementTemplate(): boolean {
        const array1 = this.mostRecentRepeatableElementTemplatePath ?? [];
        const array2 = this.formPathHelper.formPath.formConfig;
        if (!array1 || array1.length === 0 || !array2 || array2.length === 0) {
            return false;
        }
        // Either array can have 'component', 'model', 'layout' at the end and
        // still match if the other array is one item shorter.
        const allowedExtras: LineagePath = ["component", "model", "layout"];
        if (array1.length === array2.length) {
            return array1.every((value, index) => value === array2[index]);
        } else if (array1.length === array2.length - 1) {
            return allowedExtras.includes(array2[array2.length - 1]) &&
                array1.every((value, index) => value === array2[index]);
        } else if (array1.length - 1 === array2.length) {
            return allowedExtras.includes(array1[array1.length - 1]) &&
                array2.every((value, index) => value === array1[index]);
        }
        return false;
    }

    /**
     * Check whether the current form config path is a descendant (and not a match)
     * of the most recent repeatable element template path.
     * @protected
     */
    protected isRepeatableElementTemplateDescendant(): boolean {
        const array1 = this.mostRecentRepeatableElementTemplatePath ?? [];
        const array2 = this.formPathHelper.formPath.formConfig;
        if (!array1 || array1.length === 0 || !array2 || array2.length === 0 || array2.length + 2 <= array1.length) {
            return false;
        }
        return array1.every((value, index) => value === array2[index]);
    }
}
