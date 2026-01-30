import {FormConfigVisitor} from "./base.model";
import {
    FormValidatorConfig,
    FormValidatorControl,
    FormValidatorDefinition,
    FormValidatorSummaryErrors,
    SimpleServerFormValidatorControl
} from "../../validation/form.model";
import {FormConfigOutline} from "../form-config.outline";
import {ILogger} from "../../logger.interface";
import {
    SimpleInputFieldComponentDefinitionOutline,
    SimpleInputFieldModelDefinitionOutline,
    SimpleInputFormComponentDefinitionOutline
} from "../component/simple-input.outline";
import {guessType} from "../helpers";
import {FormComponentDefinitionOutline} from "../form-component.outline";
import {ValidatorsSupport} from "../../validation/validators-support";
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
import {FormConfig} from "../form-config.model";
import {FormPathHelper} from "./common.model";
import {DataValueFormConfigVisitor} from "./data-value.visitor";
import {buildLineagePaths} from "../names/naming-helpers";

/**
 * Visit each form config component and run its validators.
 *
 * This visitor is for the server-side.
 * On the client, use the standard angular component validator methods.
 *
 * By default, all validators are run: ['all'].
 * Specify which validators are run by providing enabledValidationGroups.
 */
export class ValidatorFormConfigVisitor extends FormConfigVisitor {
    private resultPath: string[];

    private validatorSupport: ValidatorsSupport;

    private form: FormConfigOutline;
    private enabledValidationGroups: string[];
    private validatorDefinitionsMap: Map<string, FormValidatorDefinition>;

    private validationErrors: FormValidatorSummaryErrors[];

    private formConfigPathHelper: FormPathHelper;

    constructor(logger: ILogger) {
        super(logger);

        this.resultPath = [];

        this.validatorSupport = new ValidatorsSupport();

        this.form = new FormConfig();
        this.enabledValidationGroups = [];
        this.validatorDefinitionsMap = new Map<string, FormValidatorDefinition>();

        this.validationErrors = [];

        this.formConfigPathHelper = new FormPathHelper(logger, this);
    }

    /**
     * Start the visitor.
     * @param options Configure the visitor.
     * @param options.form The constructed form.
     * @param options.enabledValidationGroups The validation groups to enable.
     * @param options.validatorDefinitions The validation definitions to make available.
     */
    start(options: {
              form: FormConfigOutline;
              enabledValidationGroups?: string[];
              validatorDefinitions?: FormValidatorDefinition[];
          }
    ): FormValidatorSummaryErrors[] {
        this.formConfigPathHelper.reset();
        this.resultPath = [];

        this.form = options.form;

        // use the first non-null, non-undefined value - empty array is a valid value
        this.enabledValidationGroups = options.enabledValidationGroups ?? this.form.enabledValidationGroups ?? ['all'];
        this.validatorDefinitionsMap = this.validatorSupport.createValidatorDefinitionMapping(options.validatorDefinitions || []);

        this.validationErrors = [];

        this.form.accept(this);

        return this.validationErrors;
    }

    /* Form Config */

    visitFormConfig(item: FormConfigOutline): void {
        (item?.componentDefinitions ?? []).forEach((componentDefinition, index) => {
            // Visit children
            this.formConfigPathHelper.acceptFormConfigPath(
                componentDefinition,
                {formConfig: ["componentDefinitions", index.toString()]}
            );
        });

        // Run form-level validators using the full form data model.
        // There are various reasons a validator is at form level, e.g. they involve more than one field.
        const dataValueVisitor = new DataValueFormConfigVisitor(this.logger);
        const value = dataValueVisitor.start({form: item});
        const itemName = item?.name ?? "";
        this.validationErrors.push(...this.validateFormComponent(itemName, value, item?.validators));
    }

    /* SimpleInput */

    visitSimpleInputFieldComponentDefinition(item: SimpleInputFieldComponentDefinitionOutline): void {
    }

    visitSimpleInputFieldModelDefinition(item: SimpleInputFieldModelDefinitionOutline): void {
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
    }

    visitRepeatableFieldModelDefinition(item: RepeatableFieldModelDefinitionOutline): void {
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
            this.formConfigPathHelper.acceptFormConfigPath(
                componentDefinition,
                {formConfig: ["config", "componentDefinitions", index.toString()]}
            );
        });
    }

    visitGroupFieldModelDefinition(item: GroupFieldModelDefinitionOutline): void {
    }

    visitGroupFormComponentDefinition(item: GroupFormComponentDefinitionOutline): void {
        this.acceptFormComponentDefinitionWithModel(item);
    }

    /* Tab  */

    visitTabFieldComponentDefinition(item: TabFieldComponentDefinitionOutline): void {
        (item.config?.tabs ?? []).forEach((componentDefinition, index) => {
            // Visit children
            this.formConfigPathHelper.acceptFormConfigPath(
                componentDefinition,
                {formConfig: ["config", "tabs", index.toString()]}
            );
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
            this.formConfigPathHelper.acceptFormConfigPath(
                componentDefinition,
                {formConfig: ["config", "componentDefinitions", index.toString()]}
            );
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
    }

    visitCheckboxInputFormComponentDefinition(item: CheckboxInputFormComponentDefinitionOutline): void {
        this.acceptFormComponentDefinitionWithModel(item);
    }

    /* Dropdown Input */

    visitDropdownInputFieldComponentDefinition(item: DropdownInputFieldComponentDefinitionOutline): void {
    }

    visitDropdownInputFieldModelDefinition(item: DropdownInputFieldModelDefinitionOutline): void {
    }

    visitDropdownInputFormComponentDefinition(item: DropdownInputFormComponentDefinitionOutline): void {
        this.acceptFormComponentDefinitionWithModel(item);
    }

    /* Radio Input */

    visitRadioInputFieldComponentDefinition(item: RadioInputFieldComponentDefinitionOutline): void {
    }

    visitRadioInputFieldModelDefinition(item: RadioInputFieldModelDefinitionOutline): void {
    }

    visitRadioInputFormComponentDefinition(item: RadioInputFormComponentDefinitionOutline): void {
        this.acceptFormComponentDefinitionWithModel(item);
    }

    /* Date Input */

    visitDateInputFieldComponentDefinition(item: DateInputFieldComponentDefinitionOutline): void {
    }

    visitDateInputFieldModelDefinition(item: DateInputFieldModelDefinitionOutline): void {
    }

    visitDateInputFormComponentDefinition(item: DateInputFormComponentDefinitionOutline): void {
        this.acceptFormComponentDefinitionWithModel(item);
    }

    /* Shared */

    protected createFormControlFromRecordValue(recordValue: unknown): FormValidatorControl {
        const guessedType = guessType(recordValue);
        let result;
        if (guessedType === "object") {
            result = new SimpleServerFormValidatorControl(
                Object.fromEntries(
                    Object.entries(recordValue as Record<string, unknown>)
                        .map(([key, value]) => [key, this.createFormControlFromRecordValue(value)])
                )
            );
        } else if (guessedType === "array") {
            result = new SimpleServerFormValidatorControl(
                (recordValue as Array<unknown>).map(i => this.createFormControlFromRecordValue(i))
            );
        } else {
            result = new SimpleServerFormValidatorControl(recordValue);
        }
        return result;
    }

    protected acceptFormComponentDefinitionWithModel(item: FormComponentDefinitionOutline) {
        const itemResultPath = [...this.resultPath];
        const itemName = item?.name ?? "";

        if (item.model && itemName) {
            this.resultPath = [...itemResultPath, itemName];
        }

        this.validationErrors.push(...this.validateFormComponent(
            item?.name,
            item?.model?.config?.value,
            item?.model?.config?.validators,
            item?.layout?.config?.label,
        ));

        this.formConfigPathHelper.acceptFormComponentDefinition(item);
        this.resultPath = [...itemResultPath];
    }

    protected validateFormComponent(itemName: string, value: any, validators?: FormValidatorConfig[], message?: string): FormValidatorSummaryErrors[] {
        const createFormValidatorFns = this.validatorSupport.createFormValidatorInstancesFromMapping;

        const availableValidatorGroups = this.form?.validationGroups ?? {};
        const result: FormValidatorSummaryErrors[] = [];
        if (Array.isArray(validators) && validators.length > 0) {
            const filteredValidators = this.validatorSupport.enabledValidators(availableValidatorGroups, this.enabledValidationGroups, validators);
            const formValidatorFns = createFormValidatorFns(this.validatorDefinitionsMap, filteredValidators);
            const recordFormControl = this.createFormControlFromRecordValue(value);
            const summaryErrors: FormValidatorSummaryErrors = {
                id: itemName,
                message: message || null,
                errors: [],
                lineagePaths: buildLineagePaths({
                    formConfig: [...this.formConfigPathHelper.formPath.formConfig],
                    dataModel: [...this.resultPath],
                    // TODO: how to build the angular component path?
                    angularComponents: []
                })
            }
            for (const formValidatorFn of formValidatorFns) {
                const funcResult = formValidatorFn(recordFormControl);
                const compErrors = this.validatorSupport.getFormValidatorComponentErrors(funcResult);
                summaryErrors.errors.push(...compErrors);
            }
            if (summaryErrors.errors.length > 0) {
                result.push(summaryErrors)
            }
        }

        return result;
    }
}
