import {cloneDeep as _cloneDeep} from "lodash";
import {FormConfigFrame, FormConfigOutline} from "../form-config.outline";
import {FormModel, ILogger} from "@researchdatabox/redbox-core-types";
import {CurrentPathFormConfigVisitor} from "./base.model";
import {FormConfig} from "../form-config.model";
import {
    ComponentClassDefMapType,
    FieldComponentDefinitionMap,
    FieldLayoutDefinitionMap,
    FieldModelDefinitionMap,
    FormComponentClassDefMapType,
    FormComponentDefinitionMap,
    LayoutClassDefMapType,
    ModelClassDefMapType
} from "../dictionary.model";
import {
    ContentFieldComponentConfig,
    ContentFieldComponentDefinition,
    ContentFormComponentDefinition
} from "../component/content.model";
import {
    SimpleInputFieldComponentDefinitionOutline,
    SimpleInputFieldModelDefinitionOutline, SimpleInputFormComponentDefinitionOutline
} from "../component/simple-input.outline";
import {
    ContentFieldComponentDefinitionOutline,
    ContentFormComponentDefinitionOutline
} from "../component/content.outline";
import {
    RepeatableElementFieldLayoutDefinitionOutline,
    RepeatableFieldComponentDefinitionOutline,
    RepeatableFieldModelDefinitionOutline, RepeatableFormComponentDefinitionOutline
} from "../component/repeatable.outline";
import {
    ValidationSummaryFieldComponentDefinitionOutline,
    ValidationSummaryFormComponentDefinitionOutline
} from "../component/validation-summary.outline";
import {
    GroupFieldComponentDefinitionOutline,
    GroupFieldModelDefinitionOutline,
    GroupFormComponentDefinitionOutline
} from "../component/group.outline";
import {
    TabFieldComponentDefinitionOutline,
    TabFieldLayoutDefinitionOutline,
    TabFormComponentDefinitionOutline
} from "../component/tab.outline";
import {
    TabContentFieldComponentDefinitionOutline,
    TabContentFieldLayoutDefinitionOutline, TabContentFormComponentDefinitionOutline
} from "../component/tab-content.outline";
import {
    SaveButtonFieldComponentDefinitionOutline,
    SaveButtonFormComponentDefinitionOutline
} from "../component/save-button.outline";
import {
    TextAreaFieldComponentDefinitionOutline,
    TextAreaFieldModelDefinitionOutline, TextAreaFormComponentDefinitionOutline
} from "../component/text-area.outline";
import {DefaultFieldLayoutDefinitionOutline} from "../component/default-layout.outline";
import {
    CheckboxInputFieldComponentDefinitionOutline,
    CheckboxInputFieldModelDefinitionOutline, CheckboxInputFormComponentDefinitionOutline
} from "../component/checkbox-input.outline";
import {
    DropdownInputFieldComponentDefinitionOutline,
    DropdownInputFieldModelDefinitionOutline, DropdownInputFormComponentDefinitionOutline
} from "../component/dropdown-input.outline";
import {
    RadioInputFieldComponentDefinitionOutline,
    RadioInputFieldModelDefinitionOutline, RadioInputFormComponentDefinitionOutline
} from "../component/radio-input.outline";
import {
    DateInputFieldComponentDefinitionOutline,
    DateInputFieldModelDefinitionOutline, DateInputFormComponentDefinitionOutline
} from "../component/date-input.outline";

export class MigrationV4ToV5FormConfigVisitor extends CurrentPathFormConfigVisitor {
    private original?: FormModel;
    private result?: FormConfigOutline;

    private fieldComponentMap?: ComponentClassDefMapType;
    private fieldModelMap?: ModelClassDefMapType;
    private fieldLayoutMap?: LayoutClassDefMapType;
    private formComponentMap?: FormComponentClassDefMapType;

    constructor(logger: ILogger) {
        super(logger);
        this.fieldComponentMap = FieldComponentDefinitionMap;
        this.fieldModelMap = FieldModelDefinitionMap;
        this.fieldLayoutMap = FieldLayoutDefinitionMap;
        this.formComponentMap = FormComponentDefinitionMap;
    }

    start(original: FormModel): FormConfigFrame {
        this.original = _cloneDeep(original) ?? {};
        this.result = new FormConfig();
        this.resetCurrentPath();
        this.result.accept(this);
        return this.result;
    }

    /* Form Config */

    visitFormConfig(item: FormConfigOutline): void {
        const currentData = this.getDataPath(this.original, this.currentPath);

        // Set properties that are the same in v4 and v5.
        this.sharedProps.setPropOverride('name', item, currentData);
        this.sharedProps.setPropOverride('type', item, currentData);
        this.sharedProps.setPropOverride('viewCssClasses', item, currentData);
        this.sharedProps.setPropOverride('editCssClasses', item, currentData);

        // TODO: form.customAngularApp?
        // TODO: form.fields?
        // TODO: form.workflowStep?
        // TODO: form.requiredFieldIndicator?
        // TODO: form.messages?
        // TODO: form.attachmentFields?

        // Convert properties from v4 to v5.
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

        // Convert components.
        const fields: Record<string, unknown>[] = currentData.fields ?? [];
        fields.forEach((field, index) => {
            const {class: componentClassString, message} = this.mapV4ClasstoV5Class(field);
            const formComponentClass = this.formComponentMap?.get(componentClassString);


            let formComponent;
            if (componentClassString && formComponentClass) {
                formComponent = new formComponentClass();
            } else {
                formComponent = new ContentFormComponentDefinition();
                formComponent.component = new ContentFieldComponentDefinition();
                formComponent.component.config = new ContentFieldComponentConfig();

                let msg = message;
                if (componentClassString) {
                    msg += ` Could not find class for form component class name '${componentClassString}' at path '${this.currentPath}'.`;
                }
                formComponent.component.config.content = msg;
                this.logger.warn(formComponent.component.config.content);
            }

            // Store the instances on the item
            item.componentDefinitions.push(formComponent);

            // Continue the construction
            this.acceptCurrentPath(formComponent, [index.toString()]);
        });
    }


    /* SimpleInput */

    visitSimpleInputFieldComponentDefinition(item: SimpleInputFieldComponentDefinitionOutline): void {
    }

    visitSimpleInputFieldModelDefinition(item: SimpleInputFieldModelDefinitionOutline): void {
    }

    visitSimpleInputFormComponentDefinition(item: SimpleInputFormComponentDefinitionOutline): void {
        const currentData = this.getDataPath(this.original, this.currentPath);

    }


    /* Content */

    visitContentFieldComponentDefinition(item: ContentFieldComponentDefinitionOutline): void {
    }

    visitContentFormComponentDefinition(item: ContentFormComponentDefinitionOutline): void {
        const currentData = this.getDataPath(this.original, this.currentPath);

    }

    /* Repeatable  */

    visitRepeatableFieldComponentDefinition(item: RepeatableFieldComponentDefinitionOutline): void {
    }

    visitRepeatableFieldModelDefinition(item: RepeatableFieldModelDefinitionOutline): void {
    }

    visitRepeatableElementFieldLayoutDefinition(item: RepeatableElementFieldLayoutDefinitionOutline): void {
    }

    visitRepeatableFormComponentDefinition(item: RepeatableFormComponentDefinitionOutline): void {
    }

    /* Validation Summary */

    visitValidationSummaryFieldComponentDefinition(item: ValidationSummaryFieldComponentDefinitionOutline): void {
    }

    visitValidationSummaryFormComponentDefinition(item: ValidationSummaryFormComponentDefinitionOutline): void {
    }

    /* Group */

    visitGroupFieldComponentDefinition(item: GroupFieldComponentDefinitionOutline): void {
        (item.config?.componentDefinitions ?? []).forEach((componentDefinition, index) => {
            // Visit children
            this.acceptCurrentPath(componentDefinition, ["config", "componentDefinitions", index.toString()]);
        });
    }

    visitGroupFieldModelDefinition(item: GroupFieldModelDefinitionOutline): void {
    }

    visitGroupFormComponentDefinition(item: GroupFormComponentDefinitionOutline): void {
    }

    /* Tab  */

    visitTabFieldComponentDefinition(item: TabFieldComponentDefinitionOutline): void {
        (item.config?.tabs ?? []).forEach((componentDefinition, index) => {
            // Visit children
            this.acceptCurrentPath(componentDefinition, ["config", "tabs", index.toString()]);
        });
    }

    visitTabFieldLayoutDefinition(item: TabFieldLayoutDefinitionOutline): void {
    }

    visitTabFormComponentDefinition(item: TabFormComponentDefinitionOutline): void {
    }

    /*  Tab Content */

    visitTabContentFieldComponentDefinition(item: TabContentFieldComponentDefinitionOutline): void {
        (item.config?.componentDefinitions ?? []).forEach((componentDefinition, index) => {
            // Visit children
            this.acceptCurrentPath(componentDefinition, ["config", "componentDefinitions", index.toString()]);
        });
    }

    visitTabContentFieldLayoutDefinition(item: TabContentFieldLayoutDefinitionOutline): void {
    }

    visitTabContentFormComponentDefinition(item: TabContentFormComponentDefinitionOutline): void {
    }

    /* Save Button  */

    visitSaveButtonFieldComponentDefinition(item: SaveButtonFieldComponentDefinitionOutline): void {
    }

    visitSaveButtonFormComponentDefinition(item: SaveButtonFormComponentDefinitionOutline): void {
    }

    /* Text Area */

    visitTextAreaFieldComponentDefinition(item: TextAreaFieldComponentDefinitionOutline): void {
    }

    visitTextAreaFieldModelDefinition(item: TextAreaFieldModelDefinitionOutline): void {
    }

    visitTextAreaFormComponentDefinition(item: TextAreaFormComponentDefinitionOutline): void {
    }

    /* Default Layout  */

    visitDefaultFieldLayoutDefinition(item: DefaultFieldLayoutDefinitionOutline): void {
    }

    /* Checkbox Input */

    visitCheckboxInputFieldComponentDefinition(item: CheckboxInputFieldComponentDefinitionOutline): void {
    }

    visitCheckboxInputFieldModelDefinition(item: CheckboxInputFieldModelDefinitionOutline): void {
    }

    visitCheckboxInputFormComponentDefinition(item: CheckboxInputFormComponentDefinitionOutline): void {
    }

    /* Dropdown Input */

    visitDropdownInputFieldComponentDefinition(item: DropdownInputFieldComponentDefinitionOutline): void {
    }

    visitDropdownInputFieldModelDefinition(item: DropdownInputFieldModelDefinitionOutline): void {
    }

    visitDropdownInputFormComponentDefinition(item: DropdownInputFormComponentDefinitionOutline): void {
    }

    /* Radio Input */

    visitRadioInputFieldComponentDefinition(item: RadioInputFieldComponentDefinitionOutline): void {
    }

    visitRadioInputFieldModelDefinition(item: RadioInputFieldModelDefinitionOutline): void {
    }

    visitRadioInputFormComponentDefinition(item: RadioInputFormComponentDefinitionOutline): void {
    }

    /* Date Input */

    visitDateInputFieldComponentDefinition(item: DateInputFieldComponentDefinitionOutline): void {
    }

    visitDateInputFieldModelDefinition(item: DateInputFieldModelDefinitionOutline): void {
    }

    visitDateInputFormComponentDefinition(item: DateInputFormComponentDefinitionOutline): void {
    }

    /* Shared */

    /**
     * Map from v4 class and compClass to v5 class.
     */
    protected mapV4ClasstoV5Class(field: Record<string, unknown>): { class: string, message: string } {
        const v4ClassName = field.class?.toString() ?? "";
        const v4CompClassName = field.compClass?.toString() ?? "";
        const fieldDefinition = (field?.definition ?? {}) as Record<string, unknown>;
        const classMap: Record<string, Record<string, string>> = {
            "Container": {
                "TextBlockComponent": "ContentComponent",
                "GenericGroupComponent": "GroupComponent",
                "": "GroupComponent",
            },
            "RepeatableContributor": {
                "RepeatableContributorComponent": "RepeatableComponent",
            },
            "SelectionField": {},
            "RepeatableContainer": {},
            "RepeatableVocab": {
                "RepeatableVocabComponent": "RepeatableComponent",
            },
            "NotInFormField": {},
            "WorkspaceSelectorField": {},
            "TextArea": {
                "": "TextAreaComponent"
            },
            "TabOrAccordionContainer": {
                "TabOrAccordionContainerComponent": "TabContentComponent",
            },
            "ButtonBarContainer": {
                "ButtonBarContainerComponent": "GroupComponent",
            },
            "TextField": {
                "": "SimpleInputComponent",
            },
            "DropdownFieldComponent": {
                "": "DropdownInputComponent",
            },
            "SelectionFieldComponent": {
                "": "SelectionInputComponent",
            }
        };

        const v4ClassOpts = classMap[v4ClassName] ?? {};
        let v5ClassName = v4ClassOpts[v4CompClassName] ?? "";

        // Some components need special processing.
        if (v5ClassName === "SelectionInputComponent" && fieldDefinition?.controlType === 'checkbox') {
            v5ClassName = "CheckboxInputComponent";
        }

        // Provide a message for unparsable fields.
        let message = "";
        if (!v5ClassName) {
            const v4Name = fieldDefinition?.name ?? "(unknown)";
            message = `Unparsable: class '${v4ClassName}' compClass '${v4CompClassName}' name '${v4Name}'`;
        }
        return {
            class: v5ClassName || "",
            message: message,
        }
    }
}
