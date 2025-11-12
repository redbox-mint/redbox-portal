import {CurrentPathFormConfigVisitor} from "./base.model";
import {
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
import {FormComponentDefinitionFrame, FormComponentDefinitionOutline} from "../form-component.outline";
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

/**
 * Visit each form config component and run its validators.
 *
 * This visitor is for the server-side.
 * On the client, use the standard angular component validator methods.
 *
 * By default, all validators are run: ['all'].
 * Specify which validators are run by providing validationGroupNames.
 */
export class ValidatorFormConfigVisitor extends CurrentPathFormConfigVisitor {
    private formConfig: FormConfigOutline | undefined = undefined;
    private validationGroupNames: string[] = [];
    private recordValues: Record<string, unknown> | undefined = undefined;
    private validatorDefinitionsMap: Map<string, FormValidatorDefinition>;
    private resultPath: string[] = [];
    private result: FormValidatorSummaryErrors[] = [];
    private validatorSupport: ValidatorsSupport;

    constructor(logger: ILogger) {
        super(logger);
        this.validatorDefinitionsMap = new Map<string, FormValidatorDefinition>();
        this.validatorSupport = new ValidatorsSupport();
    }

    startExistingRecord(
        form: FormConfigOutline,
        validationGroupNames?: string[],
        validatorDefinitions?: FormValidatorDefinition[],
        recordData?: Record<string, unknown>
    ): FormValidatorSummaryErrors[] {
        this.recordValues = recordData ?? undefined;
        return this.start(form, validationGroupNames, validatorDefinitions);
    }

    startNewRecord(
        form: FormConfigOutline,
        validationGroupNames?: string[],
        validatorDefinitions?: FormValidatorDefinition[]
    ): FormValidatorSummaryErrors[] {
        // Use the defaultValues from the form config as the record values.
        const defaultValueVisitor = new DefaultValueFormConfigVisitor(this.logger);
        this.recordValues = defaultValueVisitor.start(form);
        return this.start(form, validationGroupNames, validatorDefinitions);
    }

    protected start(
        formConfig: FormConfigOutline,
        validationGroupNames?: string[],
        validatorDefinitions?: FormValidatorDefinition[]
    ): FormValidatorSummaryErrors[] {
        this.formConfig = formConfig;
        this.validationGroupNames = validationGroupNames || ['all'];
        this.validatorDefinitionsMap = this.validatorSupport.createValidatorDefinitionMapping(validatorDefinitions || []);

        this.resetCurrentPath();
        this.result = [];
        this.resultPath = [];
        this.formConfig.accept(this);
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
        if (guessedType === "object") {
            return new SimpleServerFormValidatorControl(
                Object.fromEntries(
                    Object.entries(recordValue as Record<string, unknown>)
                        .map(([key, value]) => [key, this.createFormControlFromRecordValue(value)])
                )
            );
        } else if (guessedType === "array") {
            return new SimpleServerFormValidatorControl(
                (recordValue as Array<unknown>).map(i => this.createFormControlFromRecordValue(i))
            );
        } else {
            return new SimpleServerFormValidatorControl(recordValue);
        }
    }

    protected acceptFormComponentDefinitionWithModel(item: FormComponentDefinitionOutline) {
        const itemResultPath = [...this.resultPath];
        const itemName = item?.name ?? "";

        if (item.model && itemName) {
            this.resultPath = [...itemResultPath, itemName];
        }

        this.result = [...this.result, ...this.validateFormComponent(item)];

        this.acceptFormComponentDefinition(item);
        this.resultPath = [...itemResultPath];
    }

    protected validateFormComponent(item: FormComponentDefinitionFrame) {
        const itemName = item?.name;
        const validators = item?.model?.config?.validators ?? [];
        const createFormValidatorFns = this.validatorSupport.createFormValidatorInstancesFromMapping;
        // TODO: get record for the form component
        const record = {};
        // TODO: get the parents for the form control
        const parents: string[] = [];

        const result: FormValidatorSummaryErrors[] = [];
        if (Array.isArray(validators) && validators.length > 0) {
            const filteredValidators = validators.filter(validator => {
                const include = (validator?.groups?.include ?? []);
                const exclude = (validator?.groups?.exclude ?? []);
                if (include.length > 0 && !include.some(group => this.validationGroupNames.includes(group))){
                    return false;
                }
                if (exclude.length > 0 && exclude.some(group => this.validationGroupNames.includes(group))){
                    return false;
                }
                return true;
            });
            const formValidatorFns = createFormValidatorFns(this.validatorDefinitionsMap, filteredValidators);
            const recordFormControl = this.createFormControlFromRecordValue(record);
            const summaryErrors: FormValidatorSummaryErrors = {
                id: itemName,
                message: item?.layout?.config?.label || null,
                errors: [],
                parents: parents,
            }
            for (const formValidatorFn of formValidatorFns) {
                const funcResult = formValidatorFn(recordFormControl);
                Object.entries(funcResult ?? {})
                    .forEach(([key, item]) => {
                        summaryErrors.errors.push({
                            name: key,
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
