import {ILogger} from "@researchdatabox/redbox-core-types";
import {FormModesConfig} from "../shared.outline";
import {FormConfigOutline} from "../form-config.outline";
import {VisitorStartCurrentRecordValues} from "./base.outline";
import {DefaultValueFormConfigVisitor} from "./default-value.visitor";

export class CurrentRecordValuesHelper {
    private readonly logName = "CurrentRecordValuesHelper";
    private readonly logger: ILogger;

    private _formMode: FormModesConfig;
    private _userRoles: string[];
    private _recordValues: Record<string, unknown>;
    private useFormDefaults: boolean;

    constructor(logger: ILogger) {
        this.logger = logger;
        this._formMode = "view";
        this._userRoles = [];
        this._recordValues = {};
        this.useFormDefaults = false;
    }

    get userRoles(): string[] {
        return this._userRoles;
    }

    get formMode(): FormModesConfig {
        return this._formMode;
    }

    get recordValues(): Record<string, unknown> {
        return this._recordValues;
    }

    start(options: { form?: FormConfigOutline } & VisitorStartCurrentRecordValues) {
        // The current context mode, default to no view.
        this._formMode = options.formMode ?? "view";

        // The current user's roles, default to no roles.
        this._userRoles = options.userRoles || [];

        // Whether to use the form defaults.
        this.useFormDefaults = options.useFormDefaults ?? false;

        // Get the record values to use.
        if (this.useFormDefaults && (options.record === null || options.record === undefined)) {
            if (!options.form) {
                // TODO: construct visitor cannot yet use the form defaults as the values
                throw new Error(`${this.logName}: Options indicate to use form defaults, but no form was provided. Note that using form defaults in the construct visitor is not yet implemented.`);
            }
            // Use the defaultValues from the form config as the record values.
            const defaultValueVisitor = new DefaultValueFormConfigVisitor(this.logger);
            this._recordValues = defaultValueVisitor.start({form: options.form});
        } else if (!this.useFormDefaults && options.record !== null && options.record !== undefined) {
            // The current record data
            this._recordValues = options.record;
        } else if (!this.useFormDefaults && (options.record === null || options.record === undefined)) {
            // Don't use any default values
        } else {
            throw new Error(`${this.logName}: Conflicting options for record and useFormDefaults: ${JSON.stringify({
                useFormDefaults: options.useFormDefaults,
                record: options.record
            })}`);
        }
    }
}
