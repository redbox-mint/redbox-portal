
import {FormConfigVisitor} from "./base.model";
import {FormConfigFrame, FormConfigOutline} from "../form-config.outline";
import {get as _get, mergeWith as _mergeWith, set as _set, cloneDeep as _cloneDeep} from "lodash";
import {
    SimpleInputFieldComponentDefinitionOutline,
    SimpleInputFieldModelDefinitionOutline,
    SimpleInputFormComponentDefinitionOutline
} from "../component/simple-input.outline";
import {
    ContentFieldComponentDefinitionOutline,
    ContentFormComponentDefinitionOutline
} from "../component/content.outline";
import {
    RepeatableElementFieldLayoutDefinitionOutline,
    RepeatableFieldComponentDefinitionOutline,
    RepeatableFieldModelDefinitionOutline,
    RepeatableFormComponentDefinitionOutline,
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
    TabContentFieldLayoutDefinitionOutline,
    TabContentFormComponentDefinitionOutline
} from "../component/tab-content.outline";
import {
    SaveButtonFieldComponentDefinitionOutline,
    SaveButtonFormComponentDefinitionOutline
} from "../component/save-button.outline";
import {
    TextAreaFieldComponentDefinitionOutline,
    TextAreaFieldModelDefinitionOutline,
    TextAreaFormComponentDefinitionOutline
} from "../component/text-area.outline";
import {DefaultFieldLayoutDefinitionOutline} from "../component/default-layout.outline";
import {
    CheckboxInputFieldComponentDefinitionOutline,
    CheckboxInputFieldModelDefinitionOutline,
    CheckboxInputFormComponentDefinitionOutline
} from "../component/checkbox-input.outline";
import {
    DropdownInputFieldComponentDefinitionOutline,
    DropdownInputFieldModelDefinitionOutline,
    DropdownInputFormComponentDefinitionOutline
} from "../component/dropdown-input.outline";
import {
    RadioInputFieldComponentDefinitionOutline,
    RadioInputFieldModelDefinitionOutline,
    RadioInputFormComponentDefinitionOutline
} from "../component/radio-input.outline";
import {
    DateInputFieldComponentDefinitionOutline,
    DateInputFieldModelDefinitionOutline,
    DateInputFormComponentDefinitionOutline
} from "../component/date-input.outline";
import {FormComponentDefinitionOutline} from "../form-component.outline";
import {FieldModelDefinitionFrame} from "../field-model.outline";
import {ILogger} from "@researchdatabox/redbox-core-types";
import {CanVisit} from "./base.outline";
import {LineagePath} from "../names/naming-helpers";
import {FormConfig} from "../form-config.model";


/**
 * Visit each form config component and extract the default value for each field.
 * This is used for new records to populate the value defaults.
 *
 * Each component definition is a property,
 * where the key is the name and the value is the model value.
 *
 * Provides defaults from ancestors to descendants,
 * so the descendants can either use their default or an ancestors default.
 */
export class DefaultValueFormConfigVisitor extends FormConfigVisitor {
    protected override logName = "DefaultValueFormConfigVisitor";

    private formConfigPath: string[];
    private dataModelPath: LineagePath;

    private data: FormConfigFrame;

    private defaultValues: Record<string, unknown>;
    private intermediateValues: Record<string, unknown>;

    private formConfig: FormConfigOutline;

    constructor(logger: ILogger) {
        super(logger);
        this.formConfigPath = [];
        this.dataModelPath = [];

        this.data = {name: "", componentDefinitions: []};

        this.defaultValues = {};
        this.intermediateValues = {};

        this.formConfig = new FormConfig();
    }

    // TODO:  the default value visitor needs to be able to start with FormConfigFrame
    start(options: { data: FormConfigFrame }): Record<string, unknown> {
        this.formConfigPath = [];
        this.dataModelPath = [];

        this.data = _cloneDeep(options.data);

        this.defaultValues = {};
        this.intermediateValues = {};

        this.formConfig = new FormConfig();

        // TODO: construct basic class instances to support getting the default values.
        this.formConfig.accept(this);

        return this.defaultValues;
    }

    /* Form Config */

    visitFormConfig(item: FormConfigOutline): void {
        (item?.componentDefinitions ?? []).forEach((componentDefinition, index) => {
            // Visit children
            this.acceptCurrentPath(componentDefinition, ["componentDefinitions", index.toString()]);
        });
    }

    /* SimpleInput */

    visitSimpleInputFieldComponentDefinition(item: SimpleInputFieldComponentDefinitionOutline): void {
    }

    visitSimpleInputFieldModelDefinition(item: SimpleInputFieldModelDefinitionOutline): void {
        this.setFromModelDefinition(item);
    }

    visitSimpleInputFormComponentDefinition(item: SimpleInputFormComponentDefinitionOutline): void {
        this.acceptFormComponentDefinitionWithModel(item);
    }

    /* Content */

    visitContentFieldComponentDefinition(item: ContentFieldComponentDefinitionOutline): void {
    }

    visitContentFormComponentDefinition(item: ContentFormComponentDefinitionOutline): void {
        this.acceptFormComponentDefinitionWithModel(item);
    }

    /* Repeatable  */

    visitRepeatableFieldComponentDefinition(item: RepeatableFieldComponentDefinitionOutline): void {
        // The default in the elementTemplate is the default for *new* items,
        // the template default doesn't create any array elements.
        // The easiest way to do this is to just not visit the elementTemplate.
        // if (item.config?.elementTemplate) {
        //     this.acceptCurrentPath(item.config?.elementTemplate, ["config", "elementTemplate"]);
        // }
        // (Note that the form config needs to include any elementTemplate defaultValue as the value,
        // as the value is used when creating new items in the repeatable array.
        // This is implemented in the client visitor.)
    }

    visitRepeatableFieldModelDefinition(item: RepeatableFieldModelDefinitionOutline): void {
        this.setFromModelDefinition(item);
    }

    visitRepeatableElementFieldLayoutDefinition(item: RepeatableElementFieldLayoutDefinitionOutline): void {
    }

    visitRepeatableFormComponentDefinition(item: RepeatableFormComponentDefinitionOutline): void {
        this.acceptFormComponentDefinitionWithModel(item);
    }

    /* Validation Summary */

    visitValidationSummaryFieldComponentDefinition(item: ValidationSummaryFieldComponentDefinitionOutline): void {
    }

    visitValidationSummaryFormComponentDefinition(item: ValidationSummaryFormComponentDefinitionOutline): void {
        this.acceptFormComponentDefinitionWithModel(item);
    }

    /* Group */

    visitGroupFieldComponentDefinition(item: GroupFieldComponentDefinitionOutline): void {
        (item.config?.componentDefinitions ?? []).forEach((componentDefinition, index) => {
            // Visit children
            this.acceptCurrentPath(componentDefinition, ["config", "componentDefinitions", index.toString()]);
        });
    }

    visitGroupFieldModelDefinition(item: GroupFieldModelDefinitionOutline): void {
        this.setFromModelDefinition(item);
    }

    visitGroupFormComponentDefinition(item: GroupFormComponentDefinitionOutline): void {
        this.acceptFormComponentDefinitionWithModel(item);
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
        this.acceptFormComponentDefinitionWithModel(item);
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
        this.acceptFormComponentDefinitionWithModel(item);
    }

    /* Save Button  */

    visitSaveButtonFieldComponentDefinition(item: SaveButtonFieldComponentDefinitionOutline): void {
    }

    visitSaveButtonFormComponentDefinition(item: SaveButtonFormComponentDefinitionOutline): void {
        this.acceptFormComponentDefinitionWithModel(item);
    }

    /* Text Area */

    visitTextAreaFieldComponentDefinition(item: TextAreaFieldComponentDefinitionOutline): void {
    }

    visitTextAreaFieldModelDefinition(item: TextAreaFieldModelDefinitionOutline): void {
        this.setFromModelDefinition(item);
    }

    visitTextAreaFormComponentDefinition(item: TextAreaFormComponentDefinitionOutline): void {
        this.acceptFormComponentDefinitionWithModel(item);
    }

    /* Default Layout  */

    visitDefaultFieldLayoutDefinition(item: DefaultFieldLayoutDefinitionOutline): void {
    }

    /* Checkbox Input */

    visitCheckboxInputFieldComponentDefinition(item: CheckboxInputFieldComponentDefinitionOutline): void {
    }

    visitCheckboxInputFieldModelDefinition(item: CheckboxInputFieldModelDefinitionOutline): void {
        this.setFromModelDefinition(item);
    }

    visitCheckboxInputFormComponentDefinition(item: CheckboxInputFormComponentDefinitionOutline): void {
        this.acceptFormComponentDefinitionWithModel(item);
    }

    /* Dropdown Input */

    visitDropdownInputFieldComponentDefinition(item: DropdownInputFieldComponentDefinitionOutline): void {
    }

    visitDropdownInputFieldModelDefinition(item: DropdownInputFieldModelDefinitionOutline): void {
        this.setFromModelDefinition(item);
    }

    visitDropdownInputFormComponentDefinition(item: DropdownInputFormComponentDefinitionOutline): void {
        this.acceptFormComponentDefinitionWithModel(item);
    }

    /* Radio Input */

    visitRadioInputFieldComponentDefinition(item: RadioInputFieldComponentDefinitionOutline): void {
    }

    visitRadioInputFieldModelDefinition(item: RadioInputFieldModelDefinitionOutline): void {
        this.setFromModelDefinition(item);
    }

    visitRadioInputFormComponentDefinition(item: RadioInputFormComponentDefinitionOutline): void {
        this.acceptFormComponentDefinitionWithModel(item);
    }

    /* Date Input */

    visitDateInputFieldComponentDefinition(item: DateInputFieldComponentDefinitionOutline): void {
    }

    visitDateInputFieldModelDefinition(item: DateInputFieldModelDefinitionOutline): void {
        this.setFromModelDefinition(item);
    }

    visitDateInputFormComponentDefinition(item: DateInputFormComponentDefinitionOutline): void {
        this.acceptFormComponentDefinitionWithModel(item);
    }

    /* Shared */

    /**
     * Set the default value for the form component when visiting the model definition.
     * @param item The field model definition.
     * @protected
     */
    protected setFromModelDefinition(item: FieldModelDefinitionFrame<unknown>) {
        const defaultValue = _get(this.intermediateValues, this.dataModelPath, item?.config?.defaultValue);
        if (defaultValue !== undefined) {
            _set(this.defaultValues, this.dataModelPath, defaultValue);
        }
    }

    /**
     * Visit the component, model, and layout for a form component.
     * @param item
     * @protected
     */
    protected acceptFormComponentDefinitionWithModel(item: FormComponentDefinitionOutline) {
        const itemResultPath = [...this.dataModelPath];
        const itemName = item?.name ?? "";
        const itemDefaultValue = item?.model?.config?.defaultValue;

        if (item.model && itemName) {
            this.dataModelPath = [...itemResultPath, itemName];
        }

        if (itemName && itemDefaultValue !== undefined) {
            const defaultValue = _set({}, this.dataModelPath, itemDefaultValue);
            // Use lodash mergeWith because it will recurse into nested objects and arrays.
            // Object.assign and the spread operator do not recurse.
            // The lodash mergeWith also allows specifying how to handle arrays, which we need to handle in a special way.
            if (defaultValue !== undefined) {
                _mergeWith(
                    this.intermediateValues,
                    defaultValue,
                    (objValue, srcValue) => {
                        // merge approach for arrays is to choose the source array,
                        // or the one that is an array if the other isn't
                        if (Array.isArray(objValue) && Array.isArray(srcValue)) {
                            return srcValue;
                        } else if (Array.isArray(objValue) && !Array.isArray(srcValue)) {
                            return objValue;
                        } else if (!Array.isArray(objValue) && Array.isArray(srcValue)) {
                            return srcValue;
                        }
                        // undefined = use the default merge approach
                        return undefined;
                    });
            }
        }

        // For debugging:
        // this.logger.debug(`Default Value Visitor defaults for '${itemName}': ${JSON.stringify(this.defaultValues)}`);
        // this.logger.debug(`Default Value Visitor result path for '${itemName}': ${JSON.stringify(this.resultPath)}`);

        this.acceptFormComponentDefinition(item);
        this.dataModelPath = [...itemResultPath];
    }

    /**
     * Call accept on the properties of the form component definition outline that can be visited.
     * @param item The form component definition outline.
     */
    protected acceptFormComponentDefinition(item: FormComponentDefinitionOutline): void {
        this.acceptCurrentPath(item.component, ['component']);
        if (item.model) {
            this.acceptCurrentPath(item.model, ['model']);
        }
        if (item.layout) {
            this.acceptCurrentPath(item.layout, ['layout']);
        }
    }

    /**
     * Call accept on the provided item and set the current path with the given suffix.
     * Set the current path to the previous value after the accept method is done.
     * @param item
     * @param suffixPath
     * @protected
     */
    protected acceptCurrentPath(item: CanVisit, suffixPath: string[]): void {
        const itemCurrentPath = [...(this.formConfigPath ?? [])];
        try {
            this.formConfigPath = [...itemCurrentPath, ...(suffixPath ?? [])];

            // for debugging
            // this.logger.debug(`Accept '${item.constructor.name}' at '${this.currentPath}'.`);

            item.accept(this);
        } catch (error) {
            // rethrow error - the finally block will ensure the currentPath is correct
            throw error;
        } finally {
            this.formConfigPath = itemCurrentPath;
        }
    }
}
