import {CurrentPathFormConfigVisitor} from "./base.model";
import {FormValidatorSummaryErrors} from "../../validation/form.model";
import {FormConfigFrame, FormConfigOutline} from "../form-config.outline";
import {ConstructFormConfigVisitor} from "./construct.visitor";
import {DefaultValueFormConfigVisitor} from "./default-value.visitor";

/**
 * Visit each form config component and run its validators.
 *
 * This visitor is for the server-side.
 * On the client, use the standard angular component validator methods.
 *
 * Be default, all validators are run.
 * A validator profile can be used to control which validators are run.
 */
export class ValidatorFormConfigVisitor extends CurrentPathFormConfigVisitor {
    private formConfig: FormConfigOutline | undefined = undefined;
    private validatorProfileName: string | undefined = undefined;
    private recordValues: Record<string, unknown> | undefined = undefined;

    private result: FormValidatorSummaryErrors[] = [];

    startExistingRecord(data: FormConfigFrame, validatorProfileName?: string, recordData?: Record<string, unknown>): FormValidatorSummaryErrors[] {
        const constructVisitor = new ConstructFormConfigVisitor();
        const constructed = constructVisitor.start(data);

        this.recordValues = recordData ?? undefined;

        return this.start(constructed, validatorProfileName);
    }

    startNewRecord(data: FormConfigFrame, validatorProfileName?: string): FormValidatorSummaryErrors[] {
        const constructVisitor = new ConstructFormConfigVisitor();
        const constructed = constructVisitor.start(data);

        // Use the defaultValues from the form config as the record values.
        const defaultValueVisitor = new DefaultValueFormConfigVisitor();
        this.recordValues = defaultValueVisitor.startExisting(constructed);

        return this.start(constructed, validatorProfileName);
    }

    protected start(formConfig: FormConfigOutline, validatorProfileName?: string): FormValidatorSummaryErrors[] {
        this.formConfig = formConfig;
        this.validatorProfileName = validatorProfileName;

        this.resetCurrentPath();
        this.result = [];
        formConfig.accept(this);
        return this.result;
    }
}