import {FormConfigVisitor} from "./base.model";
import {
    FormValidatorConfig,
    FormValidatorControl,
    FormValidatorDefinition,
    FormValidatorSummaryErrors,
    SimpleServerFormValidatorControl
} from "../../validation/form.model";
import {FormConfigOutline} from "../form-config.outline";
import {DefaultValueFormConfigVisitor} from "./default-value.visitor";
import {ILogger} from "@researchdatabox/redbox-core-types";
import {
    SimpleInputFieldComponentDefinitionOutline,
    SimpleInputFieldModelDefinitionOutline, SimpleInputFormComponentDefinitionOutline
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
import {get as _get} from "lodash";
import {VisitorStartConstructed, VisitorStartCurrentRecordValues} from "./base.outline";
import {FormConfig} from "../form-config.model";
import {CurrentPathHelper} from "./helpers.outline";

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
    /**
     * The constructed form to validate.
     */
    private formConfig: FormConfigOutline;
    /**
     * The validation group names to enable.
     */
    private enabledValidationGroups: string[];
    /**
     * The record values to validate.
     */
    private recordValues: Record<string, unknown>;
    /**
     * A map of the validator keys to validation functions.
     */
    private validatorDefinitionsMap: Map<string, FormValidatorDefinition>;
    /**
     * The 'lineage path' from the form to the current component.
     * This is updated as processing progresses to reflect the nesting to the current component.
     */
    private resultPath: string[];
    /**
     * Any validation errors, including the identifier of form field control for each.
     */
    private result: FormValidatorSummaryErrors[];

    private validatorSupport: ValidatorsSupport;
    private currentPathHelper: CurrentPathHelper;

    constructor(logger: ILogger) {
        super(logger);
        this.formConfig = new FormConfig();
        this.enabledValidationGroups = [];
        this.recordValues = {};
        this.validatorDefinitionsMap = new Map<string, FormValidatorDefinition>();
        this.resultPath = [];
        this.result = [];

        this.validatorSupport = new ValidatorsSupport();
        this.currentPathHelper = new CurrentPathHelper(logger, this);
    }

    /**
     * Start the visitor.
     * @param options
     * @param options.enabledValidationGroups The validation groups to enable.
     * @param options.validatorDefinitions The validation definitions to make available.
     * @param options.form The constructed form.
     * @param options.record The record values.
     * @param options.useFormDefaults Whether to use the form defaults or not.
     */
    start(options: {
              enabledValidationGroups?: string[],
              validatorDefinitions?: FormValidatorDefinition[]
          } & VisitorStartConstructed & VisitorStartCurrentRecordValues
    ): FormValidatorSummaryErrors[] {
        this.formConfig = options.form;
        this.enabledValidationGroups = options.enabledValidationGroups || this.formConfig.enabledValidationGroups || ['all'];
        this.validatorDefinitionsMap = this.validatorSupport.createValidatorDefinitionMapping(options.validatorDefinitions || []);

        // Get the record values to use.
        if (options.record === null || options.record === undefined) {
            // Use the defaultValues from the form config as the record values.
            const defaultValueVisitor = new DefaultValueFormConfigVisitor(this.logger);
            this.recordValues = defaultValueVisitor.start({form: options.form});
        } else {
            // The current record data, default to null.
            this.recordValues = options.record;
        }

        this.currentPathHelper.resetCurrentPath();
        this.result = [];
        this.resultPath = [];
        this.formConfig.accept(this);
        return this.result;
    }

    /* Form Config */

    visitFormConfig(item: FormConfigOutline): void {
        (item?.componentDefinitions ?? []).forEach((componentDefinition, index) => {
            // Visit children
            this.currentPathHelper.acceptCurrentPath(componentDefinition, ["componentDefinitions", index.toString()]);
        });

        // Run form-level validators, usually because they involve more than one field.
        const itemName = item?.name ?? "";
        this.result = [...this.result, ...this.validateFormComponent(itemName, item?.validators)];
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
            this.currentPathHelper.acceptCurrentPath(componentDefinition, ["config", "componentDefinitions", index.toString()]);
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
            this.currentPathHelper.acceptCurrentPath(componentDefinition, ["config", "tabs", index.toString()]);
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
            this.currentPathHelper.acceptCurrentPath(componentDefinition, ["config", "componentDefinitions", index.toString()]);
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

        this.result = [...this.result, ...this.validateFormComponent(
            item?.name,
            item?.model?.config?.validators,
            item?.layout?.config?.label,
        )];

        this.currentPathHelper.acceptFormComponentDefinition(item);
        this.resultPath = [...itemResultPath];
    }

    protected validateFormComponent(itemName: string, validators?: FormValidatorConfig[], message?: string) {
        const createFormValidatorFns = this.validatorSupport.createFormValidatorInstancesFromMapping;
        // Use the result path to get the value for this component.
        const value = this.resultPath.length > 0 ? _get(this.recordValues, this.resultPath, undefined) : this.recordValues;

        // for debugging:
        // this.logger.verbose(`validateFormComponent resultPath: ${JSON.stringify(this.resultPath)} value: ${JSON.stringify(value)}`);

        // Use the result path to get the parents of the form control.
        const parents: string[] = this.resultPath.length > 1 ? this.resultPath.slice(0, this.resultPath.length - 1) : [];

        const availableValidatorGroups = this.formConfig?.validationGroups ?? {};
        const result: FormValidatorSummaryErrors[] = [];
        if (Array.isArray(validators) && validators.length > 0) {
            const filteredValidators = validators.filter(validator =>
                this.validatorSupport.isValidatorEnabled(availableValidatorGroups, this.enabledValidationGroups, validator)
            );
            const formValidatorFns = createFormValidatorFns(this.validatorDefinitionsMap, filteredValidators);
            const recordFormControl = this.createFormControlFromRecordValue(value);

            // for debugging:
            // this.logger.verbose(`validateFormComponent createFormControlFromRecordValue: ${JSON.stringify(recordFormControl)}`)

            const summaryErrors: FormValidatorSummaryErrors = {
                id: itemName,
                message: message || null,
                errors: [],
                parents: parents,
            }
            for (const formValidatorFn of formValidatorFns) {
                const funcResult = formValidatorFn(recordFormControl);
                Object.entries(funcResult ?? {})
                    .forEach(([key, item]) => {
                        summaryErrors.errors.push({
                            class: key,
                            message: item.message ?? null,
                            params: {...item.params},
                        })
                    });
            }
            if (summaryErrors.errors.length > 0) {
                result.push(summaryErrors)
            }
        }

        return result;
    }


}
