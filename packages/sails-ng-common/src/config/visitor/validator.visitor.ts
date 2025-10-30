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
 * By default, all validators are run: ['all'].
 * Specify which validators are run by providing validationGroupNames.
 */
export class ValidatorFormConfigVisitor extends CurrentPathFormConfigVisitor {
    private formConfig: FormConfigOutline | undefined = undefined;
    private validationGroupNames: string[] = [];
    private recordValues: Record<string, unknown> | undefined = undefined;

    private result: FormValidatorSummaryErrors[] = [];

    startExistingRecord(data: FormConfigFrame, validationGroupNames?: string[], recordData?: Record<string, unknown>): FormValidatorSummaryErrors[] {
        const constructVisitor = new ConstructFormConfigVisitor();
        const constructed = constructVisitor.start(data);

        this.recordValues = recordData ?? undefined;

        return this.start(constructed, validationGroupNames);
    }

    startNewRecord(data: FormConfigFrame, validationGroupNames?: string[]): FormValidatorSummaryErrors[] {
        const constructVisitor = new ConstructFormConfigVisitor();
        const constructed = constructVisitor.start(data);

        // Use the defaultValues from the form config as the record values.
        const defaultValueVisitor = new DefaultValueFormConfigVisitor();
        this.recordValues = defaultValueVisitor.startExisting(constructed);

        return this.start(constructed, validationGroupNames);
    }

    protected start(formConfig: FormConfigOutline, validationGroupNames?: string[]): FormValidatorSummaryErrors[] {
        this.formConfig = formConfig;
        this.validationGroupNames = validationGroupNames || ['all'];

        this.resetCurrentPath();
        this.result = [];
        formConfig.accept(this);
        return this.result;
    }
}