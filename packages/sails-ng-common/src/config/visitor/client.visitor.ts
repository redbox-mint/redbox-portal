import {FormConfigFrame, FormConfigOutline} from "../form-config.outline";
import {CurrentPathFormConfigVisitor} from "./base.model";
import {FormModesConfig} from "../shared.outline";
import {ConstructFormConfigVisitor} from "./construct.visitor";
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
import {DefaultValueFormConfigVisitor} from "./default-value.visitor";
import {get as _get, isPlainObject as _isPlainObject} from "lodash";
import {FieldModelDefinition} from "../field-model.model";
import {FormComponentDefinitionOutline} from "../form-component.outline";
import {FieldComponentDefinitionOutline} from "../field-component.outline";
import {FieldModelDefinitionOutline} from "../field-model.outline";
import {FieldLayoutDefinitionOutline} from "../field-layout.outline";


export type NameConstraints = { name: string, constraints: FormConstraintConfig };

/**
 * Visit each form config class type and build the form config for the client-side.
 *
 * This process does a few things:
 * - removes fields the user does not have permissions to access
 * - removes fields that have the value undefined
 * - removes fields that are not supposed to be accessed on the client
 * - populate the value from the defaultValue properties if no record or the provided record metadata
 */
export class ClientFormConfigVisitor extends CurrentPathFormConfigVisitor {
    private formMode: FormModesConfig = "view";
    private userRoles: string[] = [];
    private recordOid: string | null = null;
    private recordData: unknown = null;
    private defaultValues: Record<string, unknown> | null = null;

    private result: FormConfigFrame = {name: '', componentDefinitions: []};
    private constraintPath: NameConstraints[] = [];

    startExistingRecord(data: FormConfigFrame, formMode?: FormModesConfig, userRoles?: string[], recordOid?: string, recordData?: unknown): FormConfigFrame {
        const constructVisitor = new ConstructFormConfigVisitor();
        const constructed = constructVisitor.start(data);

        // The current record oid, default to null.
        this.recordOid = recordOid || null;

        // The current record data, default to null.
        this.recordData = recordData ?? null;

        return this.start(constructed, formMode, userRoles);
    }

    startNewRecord(data: FormConfigFrame, formMode?: FormModesConfig, userRoles?: string[]): FormConfigFrame {
        const constructVisitor = new ConstructFormConfigVisitor();
        const constructed = constructVisitor.start(data);

        const defaultValueVisitor = new DefaultValueFormConfigVisitor();
        this.defaultValues = defaultValueVisitor.startExisting(constructed);

        return this.start(constructed, formMode, userRoles);
    }

    protected start(formConfig: FormConfigOutline, formMode?: FormModesConfig, userRoles?: string[]) {

        // The current context mode, default to no mode.
        this.formMode = formMode ?? "view";

        // The current user's roles, default to no roles.
        this.userRoles = userRoles || [];

        this.resetCurrentPath();
        this.constraintPath = [];
        this.result = formConfig;
        formConfig.accept(this);
        return this.result;
    }

    visitFormConfig(item: FormConfigOutline): void {
        this.removePropsUndefined(item);
        const items: AvailableFormComponentDefinitionOutlines[] = [];
        const that = this;
        (item?.componentDefinitions ?? []).forEach((componentDefinition, index) => {
            this.acceptCheckConstraintsCurrentPath(
                componentDefinition,
                () => {
                    items.push(componentDefinition);
                    that.acceptCurrentPath(componentDefinition, ["componentDefinitions", index.toString()]);
                }
            )
        });
        item.componentDefinitions = items.filter(i => !!i);

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
        this.setModelValue(item);
        this.processFieldModelDefinition(item);
    }

    visitSimpleInputFormComponentDefinition(item: SimpleInputFormComponentDefinitionOutline): void {
        const that = this;
        this.acceptCheckConstraintsCurrentPath(
            item,
            () => {
                that.acceptFormComponentDefinition(item);
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
                that.acceptFormComponentDefinition(item);
            }
        )
        this.processFormComponentDefinition(item);
    }

    /* Repeatable  */

    visitRepeatableFieldComponentDefinition(item: RepeatableFieldComponentDefinitionOutline): void {
        this.processFieldComponentDefinition(item);

        if (item.config?.elementTemplate) {
            this.acceptCheckConstraintsCurrentPath(
                item.config?.elementTemplate,
                () => {
                    item.config?.elementTemplate?.accept(this);
                }
            )
        }
    }

    visitRepeatableFieldModelDefinition(item: RepeatableFieldModelDefinitionOutline): void {
        this.setModelValue(item);
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
                that.acceptFormComponentDefinition(item);
            }
        )
        this.processFormComponentDefinition(item);

        // if the element template is empty, this is an invalid component
        // indicate this by deleting all properties on item
        if (Object.keys(item.component?.config?.elementTemplate ?? {}).length === 0) {
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
                that.acceptFormComponentDefinition(item);
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
            this.acceptCheckConstraintsCurrentPath(
                componentDefinition,
                () => {
                    items.push(componentDefinition);
                    that.acceptCurrentPath(componentDefinition, ["config", "componentDefinitions", index.toString()]);
                }
            )
        });
        if (item.config) {
            item.config.componentDefinitions = items.filter(i => Object.keys(i ?? {}).length > 0);
        }
    }

    visitGroupFieldModelDefinition(item: GroupFieldModelDefinitionOutline): void {
        this.setModelValue(item);
        this.processFieldModelDefinition(item);
    }

    visitGroupFormComponentDefinition(item: GroupFormComponentDefinitionOutline): void {
        const that = this;
        this.acceptCheckConstraintsCurrentPath(
            item,
            () => {
                that.acceptFormComponentDefinition(item);
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
            this.acceptCurrentPath(componentDefinition, ["config", "tabs", index.toString()]);
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
                that.acceptFormComponentDefinition(item);
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
            this.acceptCurrentPath(componentDefinition, ["config", "componentDefinitions", index.toString()]);
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
                that.acceptFormComponentDefinition(item);
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
                that.acceptFormComponentDefinition(item);
            }
        )
        this.processFormComponentDefinition(item);
    }

    /* Text Area */

    visitTextAreaFieldComponentDefinition(item: TextAreaFieldComponentDefinitionOutline): void {
        this.processFieldComponentDefinition(item);
    }

    visitTextAreaFieldModelDefinition(item: TextAreaFieldModelDefinitionOutline): void {
        this.setModelValue(item);
        this.processFieldModelDefinition(item);
    }

    visitTextAreaFormComponentDefinition(item: TextAreaFormComponentDefinitionOutline): void {
        const that = this;
        this.acceptCheckConstraintsCurrentPath(
            item,
            () => {
                that.acceptFormComponentDefinition(item);
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
        this.setModelValue(item);
        this.processFieldModelDefinition(item);
    }

    visitCheckboxInputFormComponentDefinition(item: CheckboxInputFormComponentDefinitionOutline): void {
        const that = this;
        this.acceptCheckConstraintsCurrentPath(
            item,
            () => {
                that.acceptFormComponentDefinition(item);
            }
        )
        this.processFormComponentDefinition(item);
    }

    /* Dropdown Input */

    visitDropdownInputFieldComponentDefinition(item: DropdownInputFieldComponentDefinitionOutline): void {
        this.processFieldComponentDefinition(item);
    }

    visitDropdownInputFieldModelDefinition(item: DropdownInputFieldModelDefinitionOutline): void {
        this.setModelValue(item);
        this.processFieldModelDefinition(item);
    }

    visitDropdownInputFormComponentDefinition(item: DropdownInputFormComponentDefinitionOutline): void {
        const that = this;
        this.acceptCheckConstraintsCurrentPath(
            item,
            () => {
                that.acceptFormComponentDefinition(item);
            }
        )
        this.processFormComponentDefinition(item);
    }

    /* Radio Input */

    visitRadioInputFieldComponentDefinition(item: RadioInputFieldComponentDefinitionOutline): void {
        this.processFieldComponentDefinition(item);
    }

    visitRadioInputFieldModelDefinition(item: RadioInputFieldModelDefinitionOutline): void {
        this.setModelValue(item);
        this.processFieldModelDefinition(item);
    }

    visitRadioInputFormComponentDefinition(item: RadioInputFormComponentDefinitionOutline): void {
        const that = this;
        this.acceptCheckConstraintsCurrentPath(
            item,
            () => {
                that.acceptFormComponentDefinition(item);
            }
        )
        this.processFormComponentDefinition(item);
    }

    /* Date Input */

    visitDateInputFieldComponentDefinition(item: DateInputFieldComponentDefinitionOutline): void {
        this.processFieldComponentDefinition(item);
    }

    visitDateInputFieldModelDefinition(item: DateInputFieldModelDefinitionOutline): void {
        this.setModelValue(item);
        this.processFieldModelDefinition(item);
    }

    visitDateInputFormComponentDefinition(item: DateInputFormComponentDefinitionOutline): void {
        const that = this;
        this.acceptCheckConstraintsCurrentPath(
            item,
            () => {
                that.acceptFormComponentDefinition(item);
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
        const currentUserRoles = Array.from(new Set(this.userRoles.filter(i => !!i)));
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

        if (!isAllowed) {
            const c = currentUserRoles.sort().join(', ');
            const r = requiredRoles.sort().join(', ');
            console.debug(`ClientFormConfigVisitor - access denied for form component definition authorization, current: '${c}', required: '${r}'`);
        }

        return isAllowed;
    }

    protected isAllowedByFormMode(): boolean {
        const currentContextMode = this.formMode;
        const constraints = this.constraintPath;
        const requiredModes = Array.from(new Set(constraints
            ?.map(b => b?.constraints?.allowModes ?? [])
            ?.filter(i => i.length > 0) ?? []));

        // The current user must have at least one of the roles required by each component.
        const isAllowed = requiredModes?.every(i => {
            const isArray = Array.isArray(i);
            const hasElements = i.length > 0;
            const hasMode = hasElements && currentContextMode && i.includes(currentContextMode);
            return (isArray && hasElements && hasMode) || !isArray || !hasElements;
        });

        if (!isAllowed) {
            const r = requiredModes.sort().join(', ');
            console.debug(`ClientFormConfigVisitor - access denied for form component definition mode, current: '${currentContextMode}', required: '${r}'`);
        }

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
                && Object.getOwnPropertyNames(item.constraints ?? {}).length > 0
            ) {
                this.constraintPath = [
                    ...this.constraintPath,
                    {name: item.name, constraints: item.constraints},
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
            console.error(`ClientFormConfigVisitor acceptCheckConstraintsCurrentPath: ${error}`);
        } finally {
            this.constraintPath = currentConstraintPath;
        }
    }

    protected setModelValue(item: FieldModelDefinition<unknown>) {
        if (item?.config?.value !== undefined) {
            throw new Error(`ClientFormConfigVisitor - 'value' in the base form field model definition config is for the client-side, use 'defaultValue' instead ${JSON.stringify(item)}`);
        }

        // Populate model.config.value from either model.config.defaultValue or context.current.model.data.
        // Use the context to decide where to obtain any existing data model value.
        // If there is a model id, use the context current model data.
        // If there isn't a model id, use the model.config.defaultValue.
        const hasContextModelId = (this.recordOid?.toString()?.trim() ?? "").length > 0;
        const hasContextModelData = this.recordData && _isPlainObject(this.recordData);
        if ((hasContextModelId && !hasContextModelData) || (!hasContextModelId && hasContextModelData)) {
            throw new Error(`ClientFormConfigVisitor - cannot populate client form data model values due to inconsistent context current model id and data. Either provide both id and data, or neither.`);
        }

        if (hasContextModelId && hasContextModelData) {
            // set the model.config.value using the value from the record
            const path = this.constraintPath?.map(i => i?.name)?.filter(i => !!i) ?? [];
            const modelValue = _get(this.recordData, path, undefined);
            if (item.config === undefined || !_isPlainObject(item.config)) {
                item.config = {};
            }
            item.config.value = modelValue;
        } else if (item?.config?.defaultValue !== undefined) {
            // set the model.config.value using the defaultValue property
            item.config.value = item.config.defaultValue;
        }

        // remove the defaultValue property
        if (item?.config && 'defaultValue' in item.config) {
            delete item.config.defaultValue;
        }
    }
}
