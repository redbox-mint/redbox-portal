import {FormConfigVisitor} from "./base.model";
import {FormConfigOutline} from "../form-config.outline";
import {TemplateCompileInput} from "../../template.outline";
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
    RepeatableFormComponentDefinitionOutline
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
import {FormExpressionsConfigFrame} from "../form-component.outline";
import {ILogger} from "../../logger.interface";
import {FormConfigPathHelper} from "./common.model";


/**
 * Visit each form config class type and extract information about any
 * templates that need to be compiled.
 *
 * This is the data allowing templates and expressions to be compiled on the server-side
 * so they can be provided to the client.
 */
export class TemplateFormConfigVisitor extends FormConfigVisitor {
    protected override logName = "TemplateFormConfigVisitor";

    private formConfigPathHelper: FormConfigPathHelper;

    private templates: TemplateCompileInput[];

    constructor(logger: ILogger) {
        super(logger);
        this.formConfigPathHelper = new FormConfigPathHelper(logger, this);
        this.templates = [];
    }

    /**
     * Start the visitor.
     * @param options Configure the visitor.
     * @param options.form The constructed form.
     */
    start(options: { form: FormConfigOutline }): TemplateCompileInput[] {
        this.formConfigPathHelper.reset();
        this.templates = [];

        options.form.accept(this);
        return this.templates;
    }


    visitFormConfig(item: FormConfigOutline) {
        this.extractExpressions(item.expressions);
        (item?.componentDefinitions ?? []).forEach((componentDefinition, index) => {
            // Visit children
            this.formConfigPathHelper.acceptFormConfigPath(componentDefinition, ["componentDefinitions", index.toString()]);
        });
    }

    /* SimpleInput */

    visitSimpleInputFieldComponentDefinition(item: SimpleInputFieldComponentDefinitionOutline): void {
    }

    visitSimpleInputFieldModelDefinition(item: SimpleInputFieldModelDefinitionOutline): void {
    }

    visitSimpleInputFormComponentDefinition(item: SimpleInputFormComponentDefinitionOutline): void {
        this.extractExpressions(item.expressions);
        this.formConfigPathHelper.acceptFormComponentDefinition(item);
    }

    /* Content */

    visitContentFieldComponentDefinition(item: ContentFieldComponentDefinitionOutline): void {
        const template = (item.config?.template ?? "").trim();
        if (template) {
            this.templates?.push({
                key: [...(this.formConfigPathHelper.formConfigPath ?? []), "config", "template"],
                value: template,
                kind: "handlebars"
            });
        }
    }

    visitContentFormComponentDefinition(item: ContentFormComponentDefinitionOutline): void {
        this.extractExpressions(item.expressions);
        this.formConfigPathHelper.acceptFormComponentDefinition(item);
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
        this.formConfigPathHelper.acceptFormComponentDefinition(item);
    }

    /* Validation Summary */

    visitValidationSummaryFieldComponentDefinition(item: ValidationSummaryFieldComponentDefinitionOutline): void {
    }

    visitValidationSummaryFormComponentDefinition(item: ValidationSummaryFormComponentDefinitionOutline): void {
        this.extractExpressions(item.expressions);
        this.formConfigPathHelper.acceptFormComponentDefinition(item);
    }

    /* Group */

    visitGroupFieldComponentDefinition(item: GroupFieldComponentDefinitionOutline): void {
        (item.config?.componentDefinitions ?? []).forEach((componentDefinition, index) => {
            // Visit children
            this.formConfigPathHelper.acceptFormConfigPath(componentDefinition, ["config", "componentDefinitions", index.toString()]);
        });
    }

    visitGroupFieldModelDefinition(item: GroupFieldModelDefinitionOutline): void {
    }

    visitGroupFormComponentDefinition(item: GroupFormComponentDefinitionOutline): void {
        this.extractExpressions(item.expressions);
        this.formConfigPathHelper.acceptFormComponentDefinition(item);
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
        this.extractExpressions(item.expressions);
        this.formConfigPathHelper.acceptFormComponentDefinition(item);
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
        this.extractExpressions(item.expressions);
        this.formConfigPathHelper.acceptFormComponentDefinition(item);
    }

    /* Save Button  */

    visitSaveButtonFieldComponentDefinition(item: SaveButtonFieldComponentDefinitionOutline): void {
    }

    visitSaveButtonFormComponentDefinition(item: SaveButtonFormComponentDefinitionOutline): void {
        this.extractExpressions(item.expressions);
        this.formConfigPathHelper.acceptFormComponentDefinition(item);
    }

    /* Text Area */

    visitTextAreaFieldComponentDefinition(item: TextAreaFieldComponentDefinitionOutline): void {
    }

    visitTextAreaFieldModelDefinition(item: TextAreaFieldModelDefinitionOutline): void {
    }

    visitTextAreaFormComponentDefinition(item: TextAreaFormComponentDefinitionOutline): void {
        this.extractExpressions(item.expressions);
        this.formConfigPathHelper.acceptFormComponentDefinition(item);
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
        this.formConfigPathHelper.acceptFormComponentDefinition(item);
    }

    /* Dropdown Input */

    visitDropdownInputFieldComponentDefinition(item: DropdownInputFieldComponentDefinitionOutline): void {
    }

    visitDropdownInputFieldModelDefinition(item: DropdownInputFieldModelDefinitionOutline): void {
    }

    visitDropdownInputFormComponentDefinition(item: DropdownInputFormComponentDefinitionOutline): void {
        this.extractExpressions(item.expressions);
        this.formConfigPathHelper.acceptFormComponentDefinition(item);
    }

    /* Radio Input */

    visitRadioInputFieldComponentDefinition(item: RadioInputFieldComponentDefinitionOutline): void {
    }

    visitRadioInputFieldModelDefinition(item: RadioInputFieldModelDefinitionOutline): void {
    }

    visitRadioInputFormComponentDefinition(item: RadioInputFormComponentDefinitionOutline): void {
        this.extractExpressions(item.expressions);
        this.formConfigPathHelper.acceptFormComponentDefinition(item);
    }

    /* Date Input */

    visitDateInputFieldComponentDefinition(item: DateInputFieldComponentDefinitionOutline): void {
    }

    visitDateInputFieldModelDefinition(item: DateInputFieldModelDefinitionOutline): void {
    }

    visitDateInputFormComponentDefinition(item: DateInputFormComponentDefinitionOutline): void {
        this.extractExpressions(item.expressions);
        this.formConfigPathHelper.acceptFormComponentDefinition(item);
    }

    protected extractExpressions(expressions?: FormExpressionsConfigFrame[]): void {
        this.logger.info(`TemplateFormConfigVisitor: Extracting expressions...`);
        (expressions ?? []).forEach((expression, index) => {
            for (const prop of ['template', 'condition'] as const) {
                const value = (expression.config as any)?.[prop];
                const kind = (expression.config as any)?.['conditionKind'];
                if (kind == 'jsonpointer' && prop == 'condition') {
                    // Ignore JSONPointer conditions, no need to compile these
                    continue;
                }
                if (value) {
                    this.templates?.push({
                        key: [...(this.formConfigPathHelper.formConfigPath ?? []), 'expressions', index.toString(), 'config', prop],
                        value: value,
                        kind: "jsonata"
                    });
                }
            }
        });
    }}
