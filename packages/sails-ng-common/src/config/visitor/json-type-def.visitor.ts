import {FormConfigVisitor} from "./base.model";
import {FormConfigOutline} from "../form-config.outline";
import {set as _set} from "lodash";
import {
    SimpleInputFieldComponentDefinitionOutline,
    SimpleInputFieldModelDefinitionOutline,
    SimpleInputFormComponentDefinitionOutline
} from "../component/simple-input.outline";
import {
    ContentFieldComponentDefinitionOutline, ContentFieldModelDefinitionOutline,
    ContentFormComponentDefinitionOutline
} from "../component/content.outline";
import {
    RepeatableElementFieldLayoutDefinitionOutline,
    RepeatableFieldComponentDefinitionOutline,
    RepeatableFieldModelDefinitionOutline,
    RepeatableFormComponentDefinitionOutline, RepeatableModelName
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
import {guessType} from "../helpers";
import {FieldModelDefinitionFrame} from "../field-model.outline";
import {FormComponentDefinitionOutline} from "../form-component.outline";
import {ILogger} from "@researchdatabox/redbox-core-types";
import {CanVisit} from "./base.outline";
import {FormConfigPathHelper} from "./common.model";
import {StaticFieldComponentDefinitionOutline, StaticFormComponentDefinitionOutline} from "../component/static.outline";


/**
 * Visit each form config class type to build the JSON TypeDef schema that represents the form config.
 *
 * One use for this is to enable merging two records.
 */
export class JsonTypeDefSchemaFormConfigVisitor extends FormConfigVisitor {
    protected override logName = "JsonTypeDefSchemaFormConfigVisitor";

    private jsonTypeDefPath: string[];

    private jsonTypeDef: Record<string, unknown>;

    private formConfigPathHelper: FormConfigPathHelper;

    constructor(logger: ILogger) {
        super(logger);
        this.jsonTypeDefPath = [];

        this.jsonTypeDef = {};

        this.formConfigPathHelper = new FormConfigPathHelper(logger, this);
    }

    /**
     * Start the visitor.
     * @param options Configure the visitor.
     * @param options.form The constructed form.
     */
    start(options: { form: FormConfigOutline }): Record<string, unknown> {
        this.formConfigPathHelper.reset();
        this.jsonTypeDefPath = [];

        this.jsonTypeDef = {};

        options.form.accept(this);
        return this.jsonTypeDef;
    }

    /* Form Config */

    visitFormConfig(item: FormConfigOutline): void {
        (item?.componentDefinitions ?? []).forEach((componentDefinition, index) => {
            // Visit children
            this.acceptJsonTypeDefPath(componentDefinition, ["componentDefinitions", index.toString()], ["properties"]);
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

    visitContentFieldModelDefinition(item: ContentFieldModelDefinitionOutline): void {
        this.setFromModelDefinition(item);
    }

    visitContentFormComponentDefinition(item: ContentFormComponentDefinitionOutline): void {
        this.acceptFormComponentDefinitionWithModel(item);
    }

    /* Static */

    visitStaticFieldComponentDefinition(item: StaticFieldComponentDefinitionOutline): void {
    }

    visitStaticFormComponentDefinition(item: StaticFormComponentDefinitionOutline): void {
        this.acceptFormComponentDefinitionWithModel(item);
    }

    /* Repeatable  */

    visitRepeatableFieldComponentDefinition(item: RepeatableFieldComponentDefinitionOutline): void {
        if (item.config?.elementTemplate) {
            this.acceptJsonTypeDefPath(item.config?.elementTemplate, ["config", "elementTemplate"], ["elements"]);
        }
    }

    visitRepeatableFieldModelDefinition(item: RepeatableFieldModelDefinitionOutline): void {
        // Build the json type def from the component instead of model for repeatable.
        // Need to visit nested components to build the correct structure.
        // this.setFromModelDefinition(item);
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
            this.acceptJsonTypeDefPath(componentDefinition, ["config", "componentDefinitions", index.toString()], ["properties"]);
        });
    }

    visitGroupFieldModelDefinition(item: GroupFieldModelDefinitionOutline): void {
        // Build the json type def from the component instead of model for group.
        // Need to visit nested components to build the correct structure.
        // this.setFromModelDefinition(item);
    }

    visitGroupFormComponentDefinition(item: GroupFormComponentDefinitionOutline): void {
        this.acceptFormComponentDefinitionWithModel(item);
    }

    /* Tab  */

    visitTabFieldComponentDefinition(item: TabFieldComponentDefinitionOutline): void {
        (item.config?.tabs ?? []).forEach((componentDefinition, index) => {
            // Visit children
            this.formConfigPathHelper.acceptFormConfigPath(componentDefinition, ["config", "tabs", index.toString()]);
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
            this.formConfigPathHelper.acceptFormConfigPath(componentDefinition, ["config", "componentDefinitions", index.toString()]);
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

    protected setFromModelDefinition(item: FieldModelDefinitionFrame<unknown>) {
        const value = item?.config?.value;

        // default to a type of string
        let guessedType = "string";

        if (value !== undefined) {
            // this.logger.info(`setFromModelDefinition model class ${JSON.stringify(item?.class)} value: ${JSON.stringify(value)}`);
            if (item?.class === RepeatableModelName) {
                if (Array.isArray(value) && value.length > 0) {
                    guessedType = guessType(value[0]);
                } else {
                    guessedType = "string";
                }
            } else {
                guessedType = guessType(value);
            }
        }
        // type: https://jsontypedef.com/docs/jtd-in-5-minutes/#type-schemas
        _set(this.jsonTypeDef, this.jsonTypeDefPath, {type: guessedType});
    }

    /**
     * Call accept on the properties of the form component definition outline that can be visited.
     * @param item The form component definition outline.
     * @protected
     */
    protected acceptFormComponentDefinitionWithModel(item: FormComponentDefinitionOutline) {
        const jsonTypeDefPathKeys = item.model && item.name ? [item.name] : [];

        this.acceptJsonTypeDefPath(item.component, ['component'], jsonTypeDefPathKeys);
        if (item.model) {
            this.acceptJsonTypeDefPath(item.model, ['model'], jsonTypeDefPathKeys);
        }
        if (item.layout) {
            this.acceptJsonTypeDefPath(item.layout, ['layout'], jsonTypeDefPathKeys);
        }
    }

    protected acceptJsonTypeDefPath(item: CanVisit, formConfigPathKeys: string[], jsonTypeDefPathKeys: string[]): void {
        const originalPath = [...this.jsonTypeDefPath];
        try {
            this.jsonTypeDefPath = [...originalPath, ...jsonTypeDefPathKeys];
            // TODO: is this needed?
            // _set(this.result, this.resultPath, {});
            this.formConfigPathHelper.acceptFormConfigPath(item, formConfigPathKeys);
        } catch (error) {
            // rethrow error - the finally block will ensure the currentPath is correct
            throw error;
        } finally {
            this.jsonTypeDefPath = originalPath;
        }
    }
}
