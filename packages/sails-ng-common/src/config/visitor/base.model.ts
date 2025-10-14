import {get as _get} from "lodash";
import {FormConfigFrame, FormConfigOutline} from "../form-config.outline";
import {CanVisit, FormConfigVisitorOutline} from "./base.outline";
import {
    SimpleInputFieldComponentDefinitionOutline,
    SimpleInputFieldModelDefinitionOutline,
    SimpleInputFormComponentDefinitionOutline,
} from "../component/simple-input.outline";
import {
    ContentFieldComponentDefinitionOutline,
    ContentFormComponentDefinitionOutline,
} from "../component/content.outline";
import {
    RepeatableElementFieldLayoutDefinitionOutline,
    RepeatableFieldComponentDefinitionOutline,
    RepeatableFieldModelDefinitionOutline,
    RepeatableFormComponentDefinitionOutline,
} from "../component/repeatable.outline";
import {
    ValidationSummaryFieldComponentDefinitionOutline,
    ValidationSummaryFormComponentDefinitionOutline,
} from "../component/validation-summary.outline";
import {
    GroupFieldComponentDefinitionOutline,
    GroupFieldModelDefinitionOutline,
    GroupFormComponentDefinitionOutline,
} from "../component/group.outline";
import {
    TabFieldComponentDefinitionOutline,
    TabFieldLayoutDefinitionOutline,
    TabFormComponentDefinitionOutline,
} from "../component/tab.outline";
import {
    TabContentFieldComponentDefinitionOutline,
    TabContentFieldLayoutDefinitionOutline,
    TabContentFormComponentDefinitionOutline,
} from "../component/tab-content.outline";
import {
    SaveButtonFieldComponentDefinitionOutline,
    SaveButtonFormComponentDefinitionOutline,
} from "../component/save-button.outline";
import {
    TextAreaFieldComponentDefinitionOutline,
    TextAreaFieldModelDefinitionOutline,
    TextAreaFormComponentDefinitionOutline,
} from "../component/text-area.outline";
import {
    DefaultFieldLayoutDefinitionOutline,
} from "../component/default-layout.outline";
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
import {FieldLayoutConfigFrame, FieldLayoutConfigOutline} from "../field-layout.outline";
import {FieldModelConfigFrame, FieldModelConfigOutline} from "../field-model.outline";
import {FieldComponentConfigFrame, FieldComponentConfigOutline} from "../field-component.outline";
import {guessType, isFormFieldDefinition} from "../helpers";
import {
    DateInputFieldComponentDefinitionOutline,
    DateInputFieldModelDefinitionOutline, DateInputFormComponentDefinitionOutline
} from "../component/date-input.outline";
import {TemplateCompileKey} from "../../template.outline";
import {FormComponentDefinitionOutline} from "../form-component.outline";


/**
 * The form config visitor definition.
 */
export abstract class FormConfigVisitor implements FormConfigVisitorOutline {

    /* Form Config */

    visitFormConfig(item: FormConfigOutline): void {
        // HasChildren, HasCompilableTemplates
        //     /**
        //      * Get all the components that are directly contained by this component.
        //      */
        //     get children(): AllFormComponentDefinitionOutlines[];
        //     /**
        //      * Get all the templates for this component.
        //      */
        //     get templates(): TemplateCompileInput[];
        this.notImplemented('visitFormConfig');
    }

    /* SimpleInput */

    visitSimpleInputFieldComponentDefinition(item: SimpleInputFieldComponentDefinitionOutline): void {
        this.notImplemented('visitSimpleInputFieldComponentDefinition');
    }

    visitSimpleInputFieldModelDefinition(item: SimpleInputFieldModelDefinitionOutline): void {
        this.notImplemented('visitSimpleInputFieldModelDefinition');
    }

    visitSimpleInputFormComponentDefinition(item: SimpleInputFormComponentDefinitionOutline): void {
        this.notImplemented('visitSimpleInputFormComponentDefinition');
    }

    /* Content */

    visitContentFieldComponentDefinition(item: ContentFieldComponentDefinitionOutline): void {
        this.notImplemented('visitContentFieldComponentDefinition');
    }

    visitContentFormComponentDefinition(item: ContentFormComponentDefinitionOutline): void {
        this.notImplemented('visitContentFormComponentDefinition');
    }

    /* Repeatable  */

    visitRepeatableFieldComponentDefinition(item: RepeatableFieldComponentDefinitionOutline): void {
        this.notImplemented('visitRepeatableFieldComponentDefinition');
    }

    visitRepeatableFieldModelDefinition(item: RepeatableFieldModelDefinitionOutline): void {
        this.notImplemented('visitRepeatableFieldModelDefinition');
    }

    visitRepeatableElementFieldLayoutDefinition(item: RepeatableElementFieldLayoutDefinitionOutline): void {
        this.notImplemented('visitRepeatableElementFieldLayoutDefinition');
    }

    visitRepeatableFormComponentDefinition(item: RepeatableFormComponentDefinitionOutline): void {
        this.notImplemented('visitRepeatableFormComponentDefinition');
    }

    /* Validation Summary */

    visitValidationSummaryFieldComponentDefinition(item: ValidationSummaryFieldComponentDefinitionOutline): void {
        this.notImplemented('visitValidationSummaryFieldComponentDefinition');
    }

    visitValidationSummaryFormComponentDefinition(item: ValidationSummaryFormComponentDefinitionOutline): void {
        this.notImplemented('visitValidationSummaryFormComponentDefinition');
    }

    /* Group */

    visitGroupFieldComponentDefinition(item: GroupFieldComponentDefinitionOutline): void {
        this.notImplemented('visitGroupFieldComponentDefinition');
    }

    visitGroupFieldModelDefinition(item: GroupFieldModelDefinitionOutline): void {
        this.notImplemented('visitGroupFieldModelDefinition');
    }

    visitGroupFormComponentDefinition(item: GroupFormComponentDefinitionOutline): void {
        this.notImplemented('visitGroupFormComponentDefinition');
    }

    /* Tab  */

    visitTabFieldComponentDefinition(item: TabFieldComponentDefinitionOutline): void {
        this.notImplemented('visitTabFieldComponentDefinition');
    }

    visitTabFieldLayoutDefinition(item: TabFieldLayoutDefinitionOutline): void {
        this.notImplemented('visitTabFieldLayoutDefinition');
    }

    visitTabFormComponentDefinition(item: TabFormComponentDefinitionOutline): void {
        this.notImplemented('visitTabFormComponentDefinition');
    }

    /*  Tab Content */

    visitTabContentFieldComponentDefinition(item: TabContentFieldComponentDefinitionOutline): void {
        this.notImplemented('visitTabContentFieldComponentDefinition');
    }

    visitTabContentFieldLayoutDefinition(item: TabContentFieldLayoutDefinitionOutline): void {
        this.notImplemented('visitTabContentFieldLayoutDefinition');
    }

    visitTabContentFormComponentDefinition(item: TabContentFormComponentDefinitionOutline): void {
        this.notImplemented('visitTabContentFormComponentDefinition');
    }

    /* Save Button  */

    visitSaveButtonFieldComponentDefinition(item: SaveButtonFieldComponentDefinitionOutline): void {
        this.notImplemented('visitSaveButtonFieldComponentDefinition');
    }

    visitSaveButtonFormComponentDefinition(item: SaveButtonFormComponentDefinitionOutline): void {
        this.notImplemented('visitSaveButtonFormComponentDefinition');
    }

    /* Text Area */

    visitTextAreaFieldComponentDefinition(item: TextAreaFieldComponentDefinitionOutline): void {
        this.notImplemented('visitTextAreaFieldComponentDefinition');
    }

    visitTextAreaFieldModelDefinition(item: TextAreaFieldModelDefinitionOutline): void {
        this.notImplemented('visitTextAreaFieldModelDefinition');
    }

    visitTextAreaFormComponentDefinition(item: TextAreaFormComponentDefinitionOutline): void {
        this.notImplemented('visitTextAreaFormComponentDefinition');
    }

    /* Default Layout  */

    visitDefaultFieldLayoutDefinition(item: DefaultFieldLayoutDefinitionOutline): void {
        this.notImplemented('visitDefaultFieldLayoutDefinition');
    }

    /* Checkbox Input */

    visitCheckboxInputFieldComponentDefinition(item: CheckboxInputFieldComponentDefinitionOutline): void {
        this.notImplemented('visitCheckboxInputFieldComponentDefinition');
    }

    visitCheckboxInputFieldModelDefinition(item: CheckboxInputFieldModelDefinitionOutline): void {
        this.notImplemented('visitCheckboxInputFieldModelDefinition');
    }

    visitCheckboxInputFormComponentDefinition(item: CheckboxInputFormComponentDefinitionOutline): void {
        this.notImplemented('visitCheckboxInputFormComponentDefinition');
    }

    /* Dropdown Input */

    visitDropdownInputFieldComponentDefinition(item: DropdownInputFieldComponentDefinitionOutline): void {
        this.notImplemented('visitDropdownInputFieldComponentDefinition');
    }

    visitDropdownInputFieldModelDefinition(item: DropdownInputFieldModelDefinitionOutline): void {
        this.notImplemented('visitDropdownInputFieldModelDefinition');
    }

    visitDropdownInputFormComponentDefinition(item: DropdownInputFormComponentDefinitionOutline): void {
        this.notImplemented('visitDropdownInputFormComponentDefinition');
    }

    /* Radio Input */

    visitRadioInputFieldComponentDefinition(item: RadioInputFieldComponentDefinitionOutline): void {
        this.notImplemented('visitRadioInputFieldComponentDefinition');
    }

    visitRadioInputFieldModelDefinition(item: RadioInputFieldModelDefinitionOutline): void {
        this.notImplemented('visitRadioInputFieldModelDefinition');
    }

    visitRadioInputFormComponentDefinition(item: RadioInputFormComponentDefinitionOutline): void {
        this.notImplemented('visitRadioInputFormComponentDefinition');
    }

    /* Date Input */

    visitDateInputFieldComponentDefinition(item: DateInputFieldComponentDefinitionOutline): void {
        this.notImplemented('visitDateInputFieldComponentDefinition');
    }

    visitDateInputFieldModelDefinition(item: DateInputFieldModelDefinitionOutline): void {
        this.notImplemented('visitDateInputFieldModelDefinition');
    }

    visitDateInputFormComponentDefinition(item: DateInputFormComponentDefinitionOutline): void {
        this.notImplemented('visitDateInputFormComponentDefinition');
    }

    /* Shared */

    protected notImplemented(name: string) {
        throw new Error(`Method '${name}' is not implemented.`);
    }

    // TODO: fix typing
    protected getDataPath(data?: FormConfigFrame, path?: string[]) {
        const result = path && path.length > 0 ? _get(data, path.map((i: string) => i.toString())) : data;
        const name = result?.['name'] ?? '(none)';
        const className = result?.['class'] ?? '(none)';

        console.info(`getDataPath '${path}' with name '${name}' with class '${className}'`);
        return result;
    }

    protected isFormConfig(value: unknown): value is FormConfigFrame {
        // use typescript narrowing to check the value
        const i = value as FormConfigFrame;
        // only name and component are required
        const outcome = 'componentDefinitions' in i && guessType(i?.componentDefinitions) === 'array';
        if (!outcome) {
            throw new Error("Invalid FormConfig");
        }
        return outcome;
    }

    protected isFieldDefinition<T>(value: unknown, name: string): value is T {
        const outcome = isFormFieldDefinition(value) && value?.class === name;
        if (!outcome) {
            throw new Error(`Definition of '${name}' is invalid.`);
        }
        return outcome;
    }

    protected sharedPopulateFieldComponentConfig(item: FieldComponentConfigOutline, config?: FieldComponentConfigFrame) {
        // Set the common field component config properties
        this.setProp('readonly', item, config);
        this.setProp('visible', item, config);
        this.setProp('editMode', item, config);
        this.setProp('label', item, config);
        this.setProp('defaultComponentCssClasses', item, config);
        this.setProp('hostCssClasses', item, config);
        this.setProp('wrapperCssClasses', item, config);
        this.setProp('disabled', item, config);
        this.setProp('autofocus', item, config);
        this.setProp('tooltip', item, config);
    }

    protected sharedPopulateFieldModelConfig(item: FieldModelConfigOutline<unknown>, config?: FieldModelConfigFrame<unknown>) {
        // Set the common field model config properties
        this.setProp('disableFormBinding', item, config);
        this.setProp('value', item, config);
        this.setProp('defaultValue', item, config);
        this.setProp('validators', item, config);
        this.setProp('wrapperCssClasses', item, config);
        this.setProp('editCssClasses', item, config);
    }

    protected sharedPopulateFieldLayoutConfig(item: FieldLayoutConfigOutline, config?: FieldLayoutConfigFrame) {
        // Set the common field model config properties
        this.sharedPopulateFieldComponentConfig(item, config);
        this.setProp('labelRequiredStr', item, config);
        this.setProp('helpText', item, config);
        this.setProp('cssClassesMap', item, config);
        this.setProp('helpTextVisibleOnInit', item, config);
        this.setProp('helpTextVisible', item, config);
    }

    protected setProp(name: string, item: { [x: string]: any; }, config?: { [x: string]: any; },) {
        if (item === undefined || item === null){
            throw new Error("Item provided to setProp was undefined or null.");
        }
        if (!(name in item)){
            throw new Error(`Item provided to setProp does not have property '${name}': ${JSON.stringify(item)}`);
        }
        const itemValue = item[name];
        const configValue = config?.[name] ?? undefined;
        item[name] = configValue ?? itemValue;
    }
}

export abstract class CurrentPathFormConfigVisitor extends FormConfigVisitor {
    protected currentPath: TemplateCompileKey = [];

    /**
     * Reset the current path to an empty array.
     * @protected
     */
    protected resetCurrentPath(): void {
        this.currentPath = [];
    }

    /**
     * Call accept on the provided item and set the current path with the given suffix.
     * Set the current path to the previous value after the accept method is done.
     * @param item
     * @param suffixPath
     * @protected
     */
    protected acceptCurrentPath(item: CanVisit, suffixPath: TemplateCompileKey): void {
        const itemCurrentPath = [...(this.currentPath ?? [])];
        try {
            this.currentPath = [...itemCurrentPath, ...(suffixPath ?? [])];
            item.accept(this);
        } catch (error) {
            console.error(error);
        } finally {
            this.currentPath = itemCurrentPath;
        }
    }

    /**
     * Call accept on the properties of the form component definition outline that can be visited.
     * @param item The form component definition outline.
     * @protected
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
}