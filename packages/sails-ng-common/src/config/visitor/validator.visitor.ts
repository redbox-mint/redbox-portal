import {CurrentPathFormConfigVisitor} from "./base.model";
import {FormValidatorSummaryErrors} from "../../validation/form.model";
import {FormConfigOutline} from "../form-config.outline";
import {DefaultValueFormConfigVisitor} from "./default-value.visitor";
import {ILogger} from "@researchdatabox/redbox-core-types";

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

    constructor(logger: ILogger) {
        super(logger);
    }

    startExistingRecord(form: FormConfigOutline, validationGroupNames?: string[], recordData?: Record<string, unknown>): FormValidatorSummaryErrors[] {
        this.recordValues = recordData ?? undefined;

        return this.start(form, validationGroupNames);
    }

    startNewRecord(form: FormConfigOutline, validationGroupNames?: string[]): FormValidatorSummaryErrors[] {
        // Use the defaultValues from the form config as the record values.
        const defaultValueVisitor = new DefaultValueFormConfigVisitor(this.logger);
        this.recordValues = defaultValueVisitor.start(form);

        return this.start(form, validationGroupNames);
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
