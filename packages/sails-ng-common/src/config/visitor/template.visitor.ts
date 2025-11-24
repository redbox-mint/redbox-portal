import {FormConfigVisitor} from "./base.model";
import {FormConfigOutline} from "../form-config.outline";
import {TemplateCompileInput} from "../../template.outline";
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
import {FormExpressionsConfigFrame} from "../form-component.outline";
import {ILogger} from "@researchdatabox/redbox-core-types";
import {VisitorStartConstructed} from "./base.outline";
import {CurrentPathHelper} from "./helpers.outline";


/**
 * Visit each form config class type and extract information about any
 * templates that need to be compiled.
 *
 * This is the data allowing templates and expressions to be compiled on the server-side
 * so they can be provided to the client.
 */
export class TemplateFormConfigVisitor extends FormConfigVisitor {
    protected override logName = "TemplateFormConfigVisitor";
    private result: TemplateCompileInput[];

    private currentPathHelper: CurrentPathHelper;

    constructor(logger: ILogger) {
        super(logger);
        this.result = [];

        this.currentPathHelper = new CurrentPathHelper(logger, this);
    }

    start(options: VisitorStartConstructed): TemplateCompileInput[] {
        this.currentPathHelper.resetCurrentPath();
        this.result = [];
        options.form.accept(this);
        return this.result;
    }


    visitFormConfig(item: FormConfigOutline) {
        (item?.componentDefinitions ?? []).forEach((componentDefinition, index) => {
            // Visit children
            this.currentPathHelper.acceptCurrentPath(componentDefinition, ["componentDefinitions", index.toString()]);
        });
    }

    /* SimpleInput */

    visitSimpleInputFieldComponentDefinition(item: SimpleInputFieldComponentDefinitionOutline): void {
    }

    visitSimpleInputFieldModelDefinition(item: SimpleInputFieldModelDefinitionOutline): void {
    }

    visitSimpleInputFormComponentDefinition(item: SimpleInputFormComponentDefinitionOutline): void {
        this.extractExpressions(item.expressions);
        this.currentPathHelper.acceptFormComponentDefinition(item);
    }

    /* Content */

    visitContentFieldComponentDefinition(item: ContentFieldComponentDefinitionOutline): void {
        const template = (item.config?.template ?? "").trim();
        if (template) {
            this.result?.push({
                key: [...(this.currentPathHelper.currentPath ?? []), "config", "template"],
                value: template,
                kind: "handlebars"
            });
        }
    }

    visitContentFormComponentDefinition(item: ContentFormComponentDefinitionOutline): void {
        this.extractExpressions(item.expressions);
        this.currentPathHelper.acceptFormComponentDefinition(item);
    }

    /* Repeatable  */

    visitRepeatableFieldComponentDefinition(item: RepeatableFieldComponentDefinitionOutline): void {
        item.config?.elementTemplate?.accept(this);
    }

    visitRepeatableFieldModelDefinition(item: RepeatableFieldModelDefinitionOutline): void {
    }

    visitRepeatableElementFieldLayoutDefinition(item: RepeatableElementFieldLayoutDefinitionOutline): void {
    }

    visitRepeatableFormComponentDefinition(item: RepeatableFormComponentDefinitionOutline): void {
        this.extractExpressions(item.expressions);
        this.currentPathHelper.acceptFormComponentDefinition(item);
    }

    /* Validation Summary */

    visitValidationSummaryFieldComponentDefinition(item: ValidationSummaryFieldComponentDefinitionOutline): void {
    }

    visitValidationSummaryFormComponentDefinition(item: ValidationSummaryFormComponentDefinitionOutline): void {
        this.extractExpressions(item.expressions);
        this.currentPathHelper.acceptFormComponentDefinition(item);
    }

    /* Group */

    visitGroupFieldComponentDefinition(item: GroupFieldComponentDefinitionOutline): void {
        (item.config?.componentDefinitions ?? []).forEach((componentDefinition, index) => {
            // Visit children
            this.currentPathHelper.acceptCurrentPath(componentDefinition, ["config", "componentDefinitions", index.toString()]);
        });
    }

    visitGroupFieldModelDefinition(item: GroupFieldModelDefinitionOutline): void {
    }

    visitGroupFormComponentDefinition(item: GroupFormComponentDefinitionOutline): void {
        this.extractExpressions(item.expressions);
        this.currentPathHelper.acceptFormComponentDefinition(item);
    }

    /* Tab  */

    visitTabFieldComponentDefinition(item: TabFieldComponentDefinitionOutline): void {
        (item.config?.tabs ?? []).forEach((componentDefinition, index) => {
            // Visit children
            this.currentPathHelper.acceptCurrentPath(componentDefinition, ["config", "tabs", index.toString()]);
        });
    }

    visitTabFieldLayoutDefinition(item: TabFieldLayoutDefinitionOutline): void {
    }

    visitTabFormComponentDefinition(item: TabFormComponentDefinitionOutline): void {
        this.extractExpressions(item.expressions);
        this.currentPathHelper.acceptFormComponentDefinition(item);
    }

    /*  Tab Content */

    visitTabContentFieldComponentDefinition(item: TabContentFieldComponentDefinitionOutline): void {
        (item.config?.componentDefinitions ?? []).forEach((componentDefinition, index) => {
            // Visit children
            this.currentPathHelper.acceptCurrentPath(componentDefinition, ["config", "componentDefinitions", index.toString()]);
        });
    }

    visitTabContentFieldLayoutDefinition(item: TabContentFieldLayoutDefinitionOutline): void {
    }

    visitTabContentFormComponentDefinition(item: TabContentFormComponentDefinitionOutline): void {
        this.extractExpressions(item.expressions);
        this.currentPathHelper.acceptFormComponentDefinition(item);
    }

    /* Save Button  */

    visitSaveButtonFieldComponentDefinition(item: SaveButtonFieldComponentDefinitionOutline): void {
    }

    visitSaveButtonFormComponentDefinition(item: SaveButtonFormComponentDefinitionOutline): void {
        this.extractExpressions(item.expressions);
        this.currentPathHelper.acceptFormComponentDefinition(item);
    }

    /* Text Area */

    visitTextAreaFieldComponentDefinition(item: TextAreaFieldComponentDefinitionOutline): void {
    }

    visitTextAreaFieldModelDefinition(item: TextAreaFieldModelDefinitionOutline): void {
    }

    visitTextAreaFormComponentDefinition(item: TextAreaFormComponentDefinitionOutline): void {
        this.extractExpressions(item.expressions);
        this.currentPathHelper.acceptFormComponentDefinition(item);
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
        this.extractExpressions(item.expressions);
        this.currentPathHelper.acceptFormComponentDefinition(item);
    }

    /* Dropdown Input */

    visitDropdownInputFieldComponentDefinition(item: DropdownInputFieldComponentDefinitionOutline): void {
    }

    visitDropdownInputFieldModelDefinition(item: DropdownInputFieldModelDefinitionOutline): void {
    }

    visitDropdownInputFormComponentDefinition(item: DropdownInputFormComponentDefinitionOutline): void {
        this.extractExpressions(item.expressions);
        this.currentPathHelper.acceptFormComponentDefinition(item);
    }

    /* Radio Input */

    visitRadioInputFieldComponentDefinition(item: RadioInputFieldComponentDefinitionOutline): void {
    }

    visitRadioInputFieldModelDefinition(item: RadioInputFieldModelDefinitionOutline): void {
    }

    visitRadioInputFormComponentDefinition(item: RadioInputFormComponentDefinitionOutline): void {
        this.extractExpressions(item.expressions);
        this.currentPathHelper.acceptFormComponentDefinition(item);
    }

    /* Date Input */

    visitDateInputFieldComponentDefinition(item: DateInputFieldComponentDefinitionOutline): void {
    }

    visitDateInputFieldModelDefinition(item: DateInputFieldModelDefinitionOutline): void {
    }

    visitDateInputFormComponentDefinition(item: DateInputFormComponentDefinitionOutline): void {
        this.extractExpressions(item.expressions);
        this.currentPathHelper.acceptFormComponentDefinition(item);
    }

    protected extractExpressions(expressions?: FormExpressionsConfigFrame): void {
        for (const [name, value] of Object.entries(expressions ?? {})) {
            this.result?.push({
                key: [...(this.currentPathHelper.currentPath ?? []), 'expressions', name, 'template'],
                value: value?.template,
                kind: "jsonata"
            });
        }
    }
}
