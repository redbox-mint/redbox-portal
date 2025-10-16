import {CurrentPathFormConfigVisitor} from "./base.model";
import {FormConfigFrame, FormConfigOutline} from "../form-config.outline";
import {ConstructFormConfigVisitor} from "./construct.visitor";
import {set as _set, get as _get, mergeWith as _mergeWith} from "lodash";
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
    RepeatableFieldModelDefinitionOutline, RepeatableFormComponentDefinitionOutline,
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
import {FormComponentDefinitionOutline} from "../form-component.outline";
import {FieldModelDefinitionFrame} from "../field-model.outline";


/**
 * Visit each form config class type and extract the default value for each field.
 *
 * Each component definition is a property,
 * where the key is the name and the value is the model value.
 *
 * Provides defaults from ancestors to descendants,
 * so the descendants can either use their default or an ancestors default.
 */
export class DefaultValueFormConfigVisitor extends CurrentPathFormConfigVisitor {
    private result: Record<string, unknown> = {};
    private resultPath: string[] = [];
    private defaultValues: Record<string, unknown> = {};

    start(data: FormConfigFrame): Record<string, unknown> {
        const constructVisitor = new ConstructFormConfigVisitor();
        const constructed = constructVisitor.start(data);

        return this.startExisting(constructed);
    }

    startExisting(data: FormConfigOutline): Record<string, unknown> {
        this.resetCurrentPath();
        this.result = {};
        this.resultPath = [];
        this.defaultValues = {};
        data.accept(this);
        return this.result;
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
        // NOTES:
        // - For each element in the default value array, build the component from any ancestor defaultValues.
        // - The default in the elementTemplate is the default for *new* items, the template default doesn't create any array elements.
        // - The easiest way to do this is to just not visit the elementTemplate.
        // item.config?.elementTemplate?.accept(this);
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
        const defaultValue = _get(this.defaultValues, this.resultPath, item?.config?.defaultValue);
        if (defaultValue !== undefined) {
            _set(this.result, this.resultPath, defaultValue);
        }
    }

    /**
     * Visit the component, model, and layout for a form component.
     * @param item
     * @protected
     */
    protected acceptFormComponentDefinitionWithModel(item: FormComponentDefinitionOutline) {
        const itemResultPath = [...this.resultPath];
        const itemName = item?.name ?? "";
        const itemDefaultValue = item?.model?.config?.defaultValue;

        if (item.model && itemName) {
            this.resultPath = [...itemResultPath, itemName];
        }

        if (itemName && itemDefaultValue !== undefined) {
            const defaultValue = _set({}, this.resultPath, itemDefaultValue);
            // Use lodash mergeWith because it will recurse into nested objects and arrays.
            // Object.assign and the spread operator do not recurse.
            // The lodash mergeWith also allows specifying how to handle arrays, which we need to handle in a special way.
            if (defaultValue !== undefined) {
                _mergeWith(
                    this.defaultValues,
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
        // console.debug(`Default Value Visitor defaults for '${itemName}': ${JSON.stringify(this.defaultValues)}`);
        // console.debug(`Default Value Visitor result path for '${itemName}': ${JSON.stringify(this.resultPath)}`);

        this.acceptFormComponentDefinition(item);
        this.resultPath = [...itemResultPath];
    }
}
