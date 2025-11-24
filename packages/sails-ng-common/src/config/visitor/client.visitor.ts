import {FormConfigOutline} from "../form-config.outline";
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
import {FormConstraintConfig} from "../form-component.model";
import {AvailableFormComponentDefinitionOutlines} from "../dictionary.outline";
import {get as _get, isPlainObject as _isPlainObject} from "lodash";
import {FieldModelDefinition} from "../field-model.model";
import {FormComponentDefinitionOutline} from "../form-component.outline";
import {FieldComponentDefinitionOutline} from "../field-component.outline";
import {FieldModelDefinitionOutline} from "../field-model.outline";
import {FieldLayoutDefinitionOutline} from "../field-layout.outline";
import {ILogger} from "@researchdatabox/redbox-core-types";
import {VisitorStartCurrentRecordValues, VisitorStartConstructed} from "./base.outline";
import {FormConfig} from "../form-config.model";
import {FormConfigVisitor} from "./base.model";
import {CurrentPathHelper, CurrentRecordValuesHelper} from "./helpers";

/**
 * The details needed to evaluate the constraint config.
 */
export type NameConstraints = {
    /**
     * The form component name.
     */
    name: string,
    /**
     * The form component constraints.
     */
    constraints: FormConstraintConfig,
    /**
     * Whether the form component has a model definition or not.
     */
    model: boolean,
};

/**
 * Visit each form config class type and build the form config for the client-side.
 *
 * This process does a few things:
 * - removes fields the user does not have permissions to access, or are not relevant to the client, or where the property value is 'undefined'
 * - generates client-side fields that are constructed from the server-side fields
 * - populate the value from the defaultValue properties if no record or the provided record metadata
 *
 * TODO:
 * - use the field component config property 'defaultComponentCssClasses' to set the component css classes, then remove the property
 * - use the form config property 'defaultLayoutComponent' to set the default layout, then remove the property
 * - use the form config property 'defaultComponentConfig' to set the default component config, then remove the property
 * - use the various 'viewCssClasses' and 'editCssClasses' to set the css classes depending on the form mode, then remove these properties
 * - use the various 'wrapperCssClasses' and 'hostCssClasses' to set the css classes in the relevant config, then remove these properties??
 */
export class ClientFormConfigVisitor extends FormConfigVisitor {
    protected override logName = "ClientFormConfigVisitor";

    private result: FormConfigOutline;
    private constraintPath: NameConstraints[];

    private currentPathHelper: CurrentPathHelper;
    private currentRecordValuesHelper: CurrentRecordValuesHelper;

    constructor(logger: ILogger) {
        super(logger);
        this.result = new FormConfig();
        this.constraintPath = [];

        this.currentPathHelper = new CurrentPathHelper(logger, this);
        this.currentRecordValuesHelper = new CurrentRecordValuesHelper(logger);
    }

    start(options: VisitorStartConstructed & VisitorStartCurrentRecordValues) {
        this.currentPathHelper.resetCurrentPath();

        this.currentRecordValuesHelper.start({
            form: options.form,
            formMode: options.formMode,
            userRoles: options.userRoles,
            record: options.record,
            useFormDefaults: options.useFormDefaults
        });

        this.constraintPath = [];
        this.result = options.form;
        this.result.accept(this);

        // for debugging:
        // this.logger.verbose(`${this.logName}: built client form config from record ${JSON.stringify({
        //     form, formMode, userRoles,
        // })}`);

        return this.result;
    }

    visitFormConfig(item: FormConfigOutline): void {
        this.removePropsUndefined(item);
        const items: AvailableFormComponentDefinitionOutlines[] = [];
        const that = this;
        (item?.componentDefinitions ?? []).forEach((componentDefinition, index) => {
            items.push(componentDefinition);
            that.currentPathHelper.acceptCurrentPath(componentDefinition, ["componentDefinitions", index.toString()]);
        });
        item.componentDefinitions = items.filter(i => this.hasObjectProps(i));

        // if there are no components, this is an invalid form
        // indicate this by deleting all properties on item
        if ((item.componentDefinitions ?? []).length === 0) {
            this.removePropsAll(item);
        }
    }

    /* SimpleInput */

    visitSimpleInputFieldComponentDefinition(item: SimpleInputFieldComponentDefinitionOutline): void {
        this.processFieldComponentDefinition(item);
    }

    visitSimpleInputFieldModelDefinition(item: SimpleInputFieldModelDefinitionOutline): void {
        this.processFieldModelDefinition(item);
    }

    visitSimpleInputFormComponentDefinition(item: SimpleInputFormComponentDefinitionOutline): void {
        const that = this;
        this.acceptCheckConstraintsCurrentPath(
            item,
            () => {
                that.currentPathHelper.acceptFormComponentDefinition(item);
            }
        )
        this.processFormComponentDefinition(item);
    }

    /* Content */

    visitContentFieldComponentDefinition(item: ContentFieldComponentDefinitionOutline): void {
        this.processFieldComponentDefinition(item);
    }

    visitContentFormComponentDefinition(item: ContentFormComponentDefinitionOutline): void {
        const that = this;
        this.acceptCheckConstraintsCurrentPath(
            item,
            () => {
                that.currentPathHelper.acceptFormComponentDefinition(item);
            }
        )
        this.processFormComponentDefinition(item);
    }

    /* Repeatable  */

    visitRepeatableFieldComponentDefinition(item: RepeatableFieldComponentDefinitionOutline): void {
        this.processFieldComponentDefinition(item);

        if (item.config?.elementTemplate) {
            this.currentPathHelper.acceptCurrentPath(item.config?.elementTemplate, ["config", "elementTemplate"]);
        }
    }

    visitRepeatableFieldModelDefinition(item: RepeatableFieldModelDefinitionOutline): void {
        this.processFieldModelDefinition(item);
    }

    visitRepeatableElementFieldLayoutDefinition(item: RepeatableElementFieldLayoutDefinitionOutline): void {
        this.processFieldLayoutDefinition(item);
    }

    visitRepeatableFormComponentDefinition(item: RepeatableFormComponentDefinitionOutline): void {
        const that = this;
        this.acceptCheckConstraintsCurrentPath(
            item,
            () => {
                that.currentPathHelper.acceptFormComponentDefinition(item);
            }
        )
        this.processFormComponentDefinition(item);

        // if the element template is empty, this is an invalid component
        // indicate this by deleting all properties on item
        if (!this.hasObjectProps(item.component?.config?.elementTemplate)) {
            this.removePropsAll(item);
        }
    }

    /* Validation Summary */

    visitValidationSummaryFieldComponentDefinition(item: ValidationSummaryFieldComponentDefinitionOutline): void {
        this.processFieldComponentDefinition(item);
    }

    visitValidationSummaryFormComponentDefinition(item: ValidationSummaryFormComponentDefinitionOutline): void {
        const that = this;
        this.acceptCheckConstraintsCurrentPath(
            item,
            () => {
                that.currentPathHelper.acceptFormComponentDefinition(item);
            }
        )
        this.processFormComponentDefinition(item);
    }

    /* Group */

    visitGroupFieldComponentDefinition(item: GroupFieldComponentDefinitionOutline): void {
        this.processFieldComponentDefinition(item);

        const items: AvailableFormComponentDefinitionOutlines[] = [];
        const that = this;
        (item?.config?.componentDefinitions ?? []).forEach((componentDefinition, index) => {
            items.push(componentDefinition);
            that.currentPathHelper.acceptCurrentPath(componentDefinition, ["config", "componentDefinitions", index.toString()]);
        });
        if (item.config) {
            item.config.componentDefinitions = items.filter(i => this.hasObjectProps(i));
        }
    }

    visitGroupFieldModelDefinition(item: GroupFieldModelDefinitionOutline): void {
        this.processFieldModelDefinition(item);
    }

    visitGroupFormComponentDefinition(item: GroupFormComponentDefinitionOutline): void {
        const that = this;
        this.acceptCheckConstraintsCurrentPath(
            item,
            () => {
                that.currentPathHelper.acceptFormComponentDefinition(item);
            }
        )
        this.processFormComponentDefinition(item);

        // if there are no components, this is an invalid component
        // indicate this by deleting all properties on item
        if ((item.component?.config?.componentDefinitions ?? [])?.length === 0) {
            this.removePropsAll(item);
        }
    }

    /* Tab  */

    visitTabFieldComponentDefinition(item: TabFieldComponentDefinitionOutline): void {
        this.processFieldComponentDefinition(item);

        (item.config?.tabs ?? []).forEach((componentDefinition, index) => {
            // Visit children
            this.currentPathHelper.acceptCurrentPath(componentDefinition, ["config", "tabs", index.toString()]);
        });
    }

    visitTabFieldLayoutDefinition(item: TabFieldLayoutDefinitionOutline): void {
        this.processFieldLayoutDefinition(item);
    }

    visitTabFormComponentDefinition(item: TabFormComponentDefinitionOutline): void {
        const that = this;
        this.acceptCheckConstraintsCurrentPath(
            item,
            () => {
                that.currentPathHelper.acceptFormComponentDefinition(item);
            }
        )
        this.processFormComponentDefinition(item);

        // if there are no tabs, this is an invalid component
        // indicate this by deleting all properties on item
        if ((item.component?.config?.tabs ?? [])?.length === 0) {
            this.removePropsAll(item);
        }
    }

    /*  Tab Content */

    visitTabContentFieldComponentDefinition(item: TabContentFieldComponentDefinitionOutline): void {
        this.processFieldComponentDefinition(item);

        (item.config?.componentDefinitions ?? []).forEach((componentDefinition, index) => {
            // Visit children
            this.currentPathHelper.acceptCurrentPath(componentDefinition, ["config", "componentDefinitions", index.toString()]);
        });
    }

    visitTabContentFieldLayoutDefinition(item: TabContentFieldLayoutDefinitionOutline): void {
        this.processFieldLayoutDefinition(item);
    }

    visitTabContentFormComponentDefinition(item: TabContentFormComponentDefinitionOutline): void {
        const that = this;
        this.acceptCheckConstraintsCurrentPath(
            item,
            () => {
                that.currentPathHelper.acceptFormComponentDefinition(item);
            }
        )
        this.processFormComponentDefinition(item);

        // if there are no components, this is an invalid component
        // indicate this by deleting all properties on item
        if ((item.component?.config?.componentDefinitions ?? [])?.length === 0) {
            this.removePropsAll(item);
        }
    }

    /* Save Button  */

    visitSaveButtonFieldComponentDefinition(item: SaveButtonFieldComponentDefinitionOutline): void {
        this.processFieldComponentDefinition(item);
    }

    visitSaveButtonFormComponentDefinition(item: SaveButtonFormComponentDefinitionOutline): void {
        const that = this;
        this.acceptCheckConstraintsCurrentPath(
            item,
            () => {
                that.currentPathHelper.acceptFormComponentDefinition(item);
            }
        )
        this.processFormComponentDefinition(item);
    }

    /* Text Area */

    visitTextAreaFieldComponentDefinition(item: TextAreaFieldComponentDefinitionOutline): void {
        this.processFieldComponentDefinition(item);
    }

    visitTextAreaFieldModelDefinition(item: TextAreaFieldModelDefinitionOutline): void {
        this.processFieldModelDefinition(item);
    }

    visitTextAreaFormComponentDefinition(item: TextAreaFormComponentDefinitionOutline): void {
        const that = this;
        this.acceptCheckConstraintsCurrentPath(
            item,
            () => {
                that.currentPathHelper.acceptFormComponentDefinition(item);
            }
        )
        this.processFormComponentDefinition(item);
    }

    /* Default Layout  */

    visitDefaultFieldLayoutDefinition(item: DefaultFieldLayoutDefinitionOutline): void {
        this.processFieldLayoutDefinition(item);
    }

    /* Checkbox Input */

    visitCheckboxInputFieldComponentDefinition(item: CheckboxInputFieldComponentDefinitionOutline): void {
        this.processFieldComponentDefinition(item);
    }

    visitCheckboxInputFieldModelDefinition(item: CheckboxInputFieldModelDefinitionOutline): void {
        this.processFieldModelDefinition(item);
    }

    visitCheckboxInputFormComponentDefinition(item: CheckboxInputFormComponentDefinitionOutline): void {
        const that = this;
        this.acceptCheckConstraintsCurrentPath(
            item,
            () => {
                that.currentPathHelper.acceptFormComponentDefinition(item);
            }
        )
        this.processFormComponentDefinition(item);
    }

    /* Dropdown Input */

    visitDropdownInputFieldComponentDefinition(item: DropdownInputFieldComponentDefinitionOutline): void {
        this.processFieldComponentDefinition(item);
    }

    visitDropdownInputFieldModelDefinition(item: DropdownInputFieldModelDefinitionOutline): void {
        this.processFieldModelDefinition(item);
    }

    visitDropdownInputFormComponentDefinition(item: DropdownInputFormComponentDefinitionOutline): void {
        const that = this;
        this.acceptCheckConstraintsCurrentPath(
            item,
            () => {
                that.currentPathHelper.acceptFormComponentDefinition(item);
            }
        )
        this.processFormComponentDefinition(item);
    }

    /* Radio Input */

    visitRadioInputFieldComponentDefinition(item: RadioInputFieldComponentDefinitionOutline): void {
        this.processFieldComponentDefinition(item);
    }

    visitRadioInputFieldModelDefinition(item: RadioInputFieldModelDefinitionOutline): void {
        this.processFieldModelDefinition(item);
    }

    visitRadioInputFormComponentDefinition(item: RadioInputFormComponentDefinitionOutline): void {
        const that = this;
        this.acceptCheckConstraintsCurrentPath(
            item,
            () => {
                that.currentPathHelper.acceptFormComponentDefinition(item);
            }
        )
        this.processFormComponentDefinition(item);
    }

    /* Date Input */

    visitDateInputFieldComponentDefinition(item: DateInputFieldComponentDefinitionOutline): void {
        this.processFieldComponentDefinition(item);
    }

    visitDateInputFieldModelDefinition(item: DateInputFieldModelDefinitionOutline): void {
        this.processFieldModelDefinition(item);
    }

    visitDateInputFormComponentDefinition(item: DateInputFormComponentDefinitionOutline): void {
        const that = this;
        this.acceptCheckConstraintsCurrentPath(
            item,
            () => {
                that.currentPathHelper.acceptFormComponentDefinition(item);
            }
        )
        this.processFormComponentDefinition(item);
    }

    /* Shared */

    protected processFormComponentDefinition(item: FormComponentDefinitionOutline) {
        if ('constraints' in item) {
            delete item['constraints'];
        }
        if ('expressions' in item) {
            delete item['expressions'];
        }
        this.removePropsUndefined(item);
    }

    protected processFieldComponentDefinition(item: FieldComponentDefinitionOutline) {
        this.removePropsUndefined(item);
        this.removePropsUndefined(item?.config ?? {});
    }

    protected processFieldModelDefinition(item: FieldModelDefinitionOutline<unknown>) {
        this.setModelValue(item);

        this.removePropsUndefined(item);
        this.removePropsUndefined(item?.config ?? {});
    }

    protected processFieldLayoutDefinition(item: FieldLayoutDefinitionOutline) {
        this.removePropsUndefined(item);
        this.removePropsUndefined(item?.config ?? {});
    }

    protected removePropsAll(item: any) {
        for (const key of Object.keys(item ?? {})) {
            delete (item as any)[key];
        }
    }

    protected removePropsUndefined(item: any) {
        // provide the item with asserted type any to allow deleting non-optional properties
        for (const [key, value] of Object.entries(item ?? {})) {
            if (value === undefined) {
                delete item[key];
            }
        }
    }

    protected isAllowedByUserRoles(): boolean {
        const currentUserRoles = Array.from(new Set(this.currentRecordValuesHelper.userRoles.filter(i => !!i)));
        const constraints = this.constraintPath
        const requiredRoles = Array.from(new Set(constraints
            ?.map(b => b?.constraints?.authorization?.allowRoles ?? [])
            ?.filter(i => i.length > 0) ?? []));

        // The current user must have at least one of the roles required by each component.
        const isAllowed = requiredRoles?.every(i => {
            const isArray = Array.isArray(i);
            const hasElements = i.length > 0;
            const hasAtLeastOneUserRole = hasElements && currentUserRoles.some(c => i.includes(c));
            return (isArray && hasElements && hasAtLeastOneUserRole) || !isArray || !hasElements;
        });

        // for debugging:
        // if (!isAllowed) {
        //     const c = currentUserRoles.sort().join(', ');
        //     const r = requiredRoles.sort().join(', ');
        //     this.logger.debug(`${this.logName} - access denied for form component definition authorization, current: '${c}', required: '${r}'`);
        // }

        return isAllowed;
    }

    protected isAllowedByFormMode(): boolean {
        const currentContextMode = this.currentRecordValuesHelper.formMode;
        const constraints = this.constraintPath;
        const requiredModes = Array.from(new Set(constraints
            ?.map(b => b?.constraints?.allowModes ?? [])
            ?.filter(i => i.length > 0) ?? []));

        // The allowed modes must include the form mode.
        const isAllowed = requiredModes?.every(i => {
            const isArray = Array.isArray(i);
            const hasElements = i.length > 0;
            const hasMode = hasElements && currentContextMode && i.includes(currentContextMode);
            return (isArray && hasElements && hasMode) || !isArray || !hasElements;
        });

        // for debugging:
        // const r = requiredModes.sort().join(', ');
        // this.logger.debug(`${this.logName} - access ${isAllowed ? 'allowed' : 'denied'} for form component definition mode, current: '${currentContextMode}', required: '${r}'`);

        return isAllowed;
    }

    protected acceptCheckConstraintsCurrentPath(
        item: AvailableFormComponentDefinitionOutlines,
        action: () => void,
    ) {
        const currentConstraintPath = [...this.constraintPath];
        try {
            // add constraints to constraintPath before and after processing components
            // if the component has constraints
            if (
                item.constraints !== undefined
                && this.hasObjectProps(item.constraints)
            ) {
                this.constraintPath = [
                    ...currentConstraintPath,
                    {
                        name: item.name,
                        constraints: item.constraints,
                        model: this.hasObjectProps(item.model)
                    },
                ];
            }

            const allowedByUserRoles = this.isAllowedByUserRoles();
            const allowedByFormMode = this.isAllowedByFormMode();
            if (allowedByUserRoles && allowedByFormMode) {
                action();
            } else {
                this.removePropsAll(item)
            }
        } catch (error) {
            // rethrow error - the finally block will ensure the constraintPath is correct
            throw error;
        } finally {
            this.constraintPath = currentConstraintPath;
        }
    }

    protected setModelValue(item: FieldModelDefinition<unknown>) {
        if (item?.config?.value !== undefined) {
            throw new Error(`${this.logName} - in the field model config '{config:{value: "[some value]"}}', 'value' is for the client only, use 'defaultValue' on the server instead: ${JSON.stringify(item)}`);
        }

        // Set an empty config if the form config didn't include one.
        if (item.config === null || item.config === undefined) {
            item.config = {};
        }

        // Set the config value from the record values.
        const rawRecordValues = this.currentRecordValuesHelper.recordValues
        const recordValues = rawRecordValues && _isPlainObject(rawRecordValues) ? rawRecordValues : {};
        const path = this.constraintPath?.filter(i => !!i && i.model)?.map(i => i?.name) ?? [];
        const value = _get(recordValues, path, undefined);

        item.config.value = value;

        // for debugging:
        // this.logger.debug(`${this.logName} setModelValue path: '${path}' value: '${JSON.stringify(value)}' available: ${JSON.stringify(this.recordValues)}`);

        // Remove the defaultValue property.
        if (item?.config && 'defaultValue' in item.config) {
            delete item.config.defaultValue;
        }
    }

    protected hasObjectProps(item: any) {
        if (item === null || item === undefined) {
            return false;
        }
        return Object.keys(item).length > 0;
    }
}
