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
import {
    DateInputFieldComponentDefinitionOutline,
    DateInputFieldModelDefinitionOutline, DateInputFormComponentDefinitionOutline
} from "../component/date-input.outline";
import {TemplateCompileKey} from "../../template.outline";
import {FormComponentDefinitionOutline} from "../form-component.outline";
import {ILogger} from "@researchdatabox/redbox-core-types";


/**
 * The form config visitor definition.
 */
export abstract class FormConfigVisitor implements FormConfigVisitorOutline {
    protected logName = "FormConfigVisitor";
    protected logger: ILogger;

    protected constructor(logger: ILogger) {
        this.logger = logger;
    }

    /* Form Config */

    visitFormConfig(item: FormConfigOutline): void {
        this.notImplemented();
    }

    /* SimpleInput */

    visitSimpleInputFieldComponentDefinition(item: SimpleInputFieldComponentDefinitionOutline): void {
        this.notImplemented();
    }

    visitSimpleInputFieldModelDefinition(item: SimpleInputFieldModelDefinitionOutline): void {
        this.notImplemented();
    }

    visitSimpleInputFormComponentDefinition(item: SimpleInputFormComponentDefinitionOutline): void {
        this.notImplemented();
    }

    /* Content */

    visitContentFieldComponentDefinition(item: ContentFieldComponentDefinitionOutline): void {
        this.notImplemented();
    }

    visitContentFormComponentDefinition(item: ContentFormComponentDefinitionOutline): void {
        this.notImplemented();
    }

    /* Repeatable  */

    visitRepeatableFieldComponentDefinition(item: RepeatableFieldComponentDefinitionOutline): void {
        this.notImplemented();
    }

    visitRepeatableFieldModelDefinition(item: RepeatableFieldModelDefinitionOutline): void {
        this.notImplemented();
    }

    visitRepeatableElementFieldLayoutDefinition(item: RepeatableElementFieldLayoutDefinitionOutline): void {
        this.notImplemented();
    }

    visitRepeatableFormComponentDefinition(item: RepeatableFormComponentDefinitionOutline): void {
        this.notImplemented();
    }

    /* Validation Summary */

    visitValidationSummaryFieldComponentDefinition(item: ValidationSummaryFieldComponentDefinitionOutline): void {
        this.notImplemented();
    }

    visitValidationSummaryFormComponentDefinition(item: ValidationSummaryFormComponentDefinitionOutline): void {
        this.notImplemented();
    }

    /* Group */

    visitGroupFieldComponentDefinition(item: GroupFieldComponentDefinitionOutline): void {
        this.notImplemented();
    }

    visitGroupFieldModelDefinition(item: GroupFieldModelDefinitionOutline): void {
        this.notImplemented();
    }

    visitGroupFormComponentDefinition(item: GroupFormComponentDefinitionOutline): void {
        this.notImplemented();
    }

    /* Tab  */

    visitTabFieldComponentDefinition(item: TabFieldComponentDefinitionOutline): void {
        this.notImplemented();
    }

    visitTabFieldLayoutDefinition(item: TabFieldLayoutDefinitionOutline): void {
        this.notImplemented();
    }

    visitTabFormComponentDefinition(item: TabFormComponentDefinitionOutline): void {
        this.notImplemented();
    }

    /*  Tab Content */

    visitTabContentFieldComponentDefinition(item: TabContentFieldComponentDefinitionOutline): void {
        this.notImplemented();
    }

    visitTabContentFieldLayoutDefinition(item: TabContentFieldLayoutDefinitionOutline): void {
        this.notImplemented();
    }

    visitTabContentFormComponentDefinition(item: TabContentFormComponentDefinitionOutline): void {
        this.notImplemented();
    }

    /* Save Button  */

    visitSaveButtonFieldComponentDefinition(item: SaveButtonFieldComponentDefinitionOutline): void {
        this.notImplemented();
    }

    visitSaveButtonFormComponentDefinition(item: SaveButtonFormComponentDefinitionOutline): void {
        this.notImplemented();
    }

    /* Text Area */

    visitTextAreaFieldComponentDefinition(item: TextAreaFieldComponentDefinitionOutline): void {
        this.notImplemented();
    }

    visitTextAreaFieldModelDefinition(item: TextAreaFieldModelDefinitionOutline): void {
        this.notImplemented();
    }

    visitTextAreaFormComponentDefinition(item: TextAreaFormComponentDefinitionOutline): void {
        this.notImplemented();
    }

    /* Default Layout  */

    visitDefaultFieldLayoutDefinition(item: DefaultFieldLayoutDefinitionOutline): void {
        this.notImplemented();
    }

    /* Checkbox Input */

    visitCheckboxInputFieldComponentDefinition(item: CheckboxInputFieldComponentDefinitionOutline): void {
        this.notImplemented();
    }

    visitCheckboxInputFieldModelDefinition(item: CheckboxInputFieldModelDefinitionOutline): void {
        this.notImplemented();
    }

    visitCheckboxInputFormComponentDefinition(item: CheckboxInputFormComponentDefinitionOutline): void {
        this.notImplemented();
    }

    /* Dropdown Input */

    visitDropdownInputFieldComponentDefinition(item: DropdownInputFieldComponentDefinitionOutline): void {
        this.notImplemented();
    }

    visitDropdownInputFieldModelDefinition(item: DropdownInputFieldModelDefinitionOutline): void {
        this.notImplemented();
    }

    visitDropdownInputFormComponentDefinition(item: DropdownInputFormComponentDefinitionOutline): void {
        this.notImplemented();
    }

    /* Radio Input */

    visitRadioInputFieldComponentDefinition(item: RadioInputFieldComponentDefinitionOutline): void {
        this.notImplemented();
    }

    visitRadioInputFieldModelDefinition(item: RadioInputFieldModelDefinitionOutline): void {
        this.notImplemented();
    }

    visitRadioInputFormComponentDefinition(item: RadioInputFormComponentDefinitionOutline): void {
        this.notImplemented();
    }

    /* Date Input */

    visitDateInputFieldComponentDefinition(item: DateInputFieldComponentDefinitionOutline): void {
        this.notImplemented();
    }

    visitDateInputFieldModelDefinition(item: DateInputFieldModelDefinitionOutline): void {
        this.notImplemented();
    }

    visitDateInputFormComponentDefinition(item: DateInputFormComponentDefinitionOutline): void {
        this.notImplemented();
    }

    /* Shared */

    protected notImplemented() {
        throw new Error(`Visitor method must be implemented.`);
    }

    // TODO: fix typing
    protected getDataPath(data?: FormConfigFrame, path?: string[]) {
        const result = path && path.length > 0 ? _get(data, path.map((i: string) => i.toString())) : data;

        // for debugging:
        // const msg = [
        //     result?.['name'] ? `with name '${result?.['name']}'` : '',
        //     result?.['class'] ? `with class '${result?.['class']}'` : '',
        // ];
        // this.logger.debug(`Visitor path '${path}' ${msg.filter(i => !!i).join(' ')}`.trim());

        return result;
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

            // for debugging
            // this.logger.debug(`Accept '${item.constructor.name}' at '${this.currentPath}'.`);

            item.accept(this);
        } catch (error) {
            // rethrow error - the finally block will ensure the currentPath is correct
            throw error;
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