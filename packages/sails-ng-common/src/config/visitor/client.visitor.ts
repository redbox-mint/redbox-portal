import {FormConfigFrame, FormConfigOutline} from "../form-config.outline";
import {CurrentPathFormConfigVisitor} from "./base.model";
import {FormModesConfig} from "../shared.outline";
import {ConstructFormConfigVisitor} from "./construct.visitor";
import {
    SimpleInputFieldComponentDefinitionOutline,
    SimpleInputFieldModelDefinitionOutline, SimpleInputFormComponentDefinitionOutline
} from "../component/simple-input.outline";
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
import {FormConstraintConfig} from "../form-component.model";
import {AvailableFormComponentDefinitionOutlines} from "../dictionary.outline";
import {DefaultValueFormConfigVisitor} from "./default-value.visitor";


export type RemovePropsConfig = {
    removeNames?: string[],
    removeUndefined?: boolean,
    removeConstraints?: boolean,
    removeExpressions?: boolean,
};

export type NameConstraints = { name: string, constraints: FormConstraintConfig };

/**
 * Visit each form config class type and build the form config for the client-side.
 *
 * This process does a few things:
 * - removes fields the user does not have permissions to access
 * - removes fields that have the value undefined
 * - removes fields that are not supposed to be accessed on the client
 * - populate the value from the defaultValue properties or
 *
 * TODO: Populate model.config.value from either model.config.defaultValue or context.current.model.data.
 * Use the context to decide where to obtain any existing data model value.
 * If there is a model id, use the context current model data.
 * If there isn't a model id, use the model.config.defaultValue.
 *
 */
export class ClientFormConfigVisitor extends CurrentPathFormConfigVisitor {
    private formMode: FormModesConfig | null = null;
    private userRoles: string[] = [];
    private recordOid: string | null = null;
    private recordData: unknown = null;
    private defaultValues: Record<string, unknown> | null = null;

    private result: FormConfigFrame = {name: '', componentDefinitions: []};
    private constraintPath: NameConstraints[] = [];

    startExistingRecord(data: FormConfigFrame, formMode?: FormModesConfig, userRoles?: string[], recordOid?: string, recordData?: unknown): FormConfigFrame {
        const constructVisitor = new ConstructFormConfigVisitor();
        const constructed = constructVisitor.start(data);

        // The current context mode, default to no mode.
        this.formMode = formMode ?? null;

        // The current user's roles, default to no roles.
        this.userRoles = userRoles || [];

        // The current record oid, default to null.
        this.recordOid = recordOid || null;

        // The current record data, default to null.
        this.recordData = recordData ?? null;

        this.resetCurrentPath();
        this.constraintPath = [];
        this.result = constructed;
        constructed.accept(this);
        return this.result;
    }

    startNewRecord(data: FormConfigFrame, formMode?: FormModesConfig, userRoles?: string[]): FormConfigFrame {
        const constructVisitor = new ConstructFormConfigVisitor();
        const constructed = constructVisitor.start(data);

        // The current context mode, default to no mode.
        this.formMode = formMode ?? null;

        // The current user's roles, default to no roles.
        this.userRoles = userRoles || [];

        const defaultValueVisitor = new DefaultValueFormConfigVisitor();
        this.defaultValues = defaultValueVisitor.startExisting(constructed);

        this.resetCurrentPath();
        this.constraintPath = [];
        this.result = constructed;
        constructed.accept(this);
        return this.result;
    }

    visitFormConfig(item: FormConfigOutline): void {
        this.removeProps(item);
        // TODO: set constraintPath before and after processing components
        const items: AvailableFormComponentDefinitionOutlines[] = [];
        (item?.componentDefinitions ?? []).forEach((componentDefinition, index) => {
            const allowedByUserRoles = ClientFormConfigVisitor.hasUserRole(this.userRoles, this.constraintPath);
            const allowedByFormMode = ClientFormConfigVisitor.isFormMode(this.formMode, this.constraintPath);
            if (allowedByUserRoles && allowedByFormMode) {
                items.push(componentDefinition);
                this.acceptCurrentPath(componentDefinition, ["componentDefinitions", index.toString()]);
            }
        });
        item.componentDefinitions = items;
    }


    /* SimpleInput */

    visitSimpleInputFieldComponentDefinition(item: SimpleInputFieldComponentDefinitionOutline): void {
        this.removeProps(item);
        this.removeProps(item.config);
    }

    visitSimpleInputFieldModelDefinition(item: SimpleInputFieldModelDefinitionOutline): void {
        this.removeProps(item);
        this.removeProps(item.config);
    }

    visitSimpleInputFormComponentDefinition(item: SimpleInputFormComponentDefinitionOutline): void {
        if (!ClientFormConfigVisitor.hasUserRole(this.userRoles, this.constraintPath)) {
            return;
        }
        if (!ClientFormConfigVisitor.isFormMode(this.formMode, this.constraintPath)) {
            return;
        }
        this.removeProps(item);
        this.acceptFormComponentDefinition(item);
    }

    /* Content */

    visitContentFieldComponentDefinition(item: ContentFieldComponentDefinitionOutline): void {
        this.removeProps(item);
        this.removeProps(item.config);
    }

    visitContentFormComponentDefinition(item: ContentFormComponentDefinitionOutline): void {
        if (!ClientFormConfigVisitor.hasUserRole(this.userRoles, this.constraintPath)) {
            return;
        }
        if (!ClientFormConfigVisitor.isFormMode(this.formMode, this.constraintPath)) {
            return;
        }
        this.removeProps(item);
        this.acceptFormComponentDefinition(item);
    }

    /* Repeatable  */

    visitRepeatableFieldComponentDefinition(item: RepeatableFieldComponentDefinitionOutline): void {
        this.removeProps(item);
        this.removeProps(item.config);

        item.config?.elementTemplate?.accept(this);
    }

    visitRepeatableFieldModelDefinition(item: RepeatableFieldModelDefinitionOutline): void {
        this.removeProps(item);
        this.removeProps(item.config);
    }

    visitRepeatableElementFieldLayoutDefinition(item: RepeatableElementFieldLayoutDefinitionOutline): void {
        this.removeProps(item);
        this.removeProps(item.config);
    }

    visitRepeatableFormComponentDefinition(item: RepeatableFormComponentDefinitionOutline): void {
        if (!ClientFormConfigVisitor.hasUserRole(this.userRoles, this.constraintPath)) {
            return;
        }
        if (!ClientFormConfigVisitor.isFormMode(this.formMode, this.constraintPath)) {
            return;
        }
        this.removeProps(item);
        this.acceptFormComponentDefinition(item);
    }

    /* Validation Summary */

    visitValidationSummaryFieldComponentDefinition(item: ValidationSummaryFieldComponentDefinitionOutline): void {
        this.removeProps(item);
        this.removeProps(item.config);
    }

    visitValidationSummaryFormComponentDefinition(item: ValidationSummaryFormComponentDefinitionOutline): void {
        if (!ClientFormConfigVisitor.hasUserRole(this.userRoles, this.constraintPath)) {
            return;
        }
        if (!ClientFormConfigVisitor.isFormMode(this.formMode, this.constraintPath)) {
            return;
        }
        this.removeProps(item);
        this.acceptFormComponentDefinition(item);
    }

    /* Group */

    visitGroupFieldComponentDefinition(item: GroupFieldComponentDefinitionOutline): void {
        this.removeProps(item);
        this.removeProps(item.config);

        (item.config?.componentDefinitions ?? []).forEach((componentDefinition, index) => {
            // Visit children
            this.acceptCurrentPath(componentDefinition, ["config", "componentDefinitions", index.toString()]);
        });
    }

    visitGroupFieldModelDefinition(item: GroupFieldModelDefinitionOutline): void {
        this.removeProps(item);
        this.removeProps(item.config);
    }

    visitGroupFormComponentDefinition(item: GroupFormComponentDefinitionOutline): void {
        if (!ClientFormConfigVisitor.hasUserRole(this.userRoles, this.constraintPath)) {
            return;
        }
        if (!ClientFormConfigVisitor.isFormMode(this.formMode, this.constraintPath)) {
            return;
        }
        this.removeProps(item);
        this.acceptFormComponentDefinition(item);
    }

    /* Tab  */

    visitTabFieldComponentDefinition(item: TabFieldComponentDefinitionOutline): void {
        this.removeProps(item);
        this.removeProps(item.config);

        (item.config?.tabs ?? []).forEach((componentDefinition, index) => {
            // Visit children
            this.acceptCurrentPath(componentDefinition, ["config", "tabs", index.toString()]);
        });
    }

    visitTabFieldLayoutDefinition(item: TabFieldLayoutDefinitionOutline): void {
        this.removeProps(item);
        this.removeProps(item.config);
    }

    visitTabFormComponentDefinition(item: TabFormComponentDefinitionOutline): void {
        if (!ClientFormConfigVisitor.hasUserRole(this.userRoles, this.constraintPath)) {
            return;
        }
        if (!ClientFormConfigVisitor.isFormMode(this.formMode, this.constraintPath)) {
            return;
        }
        this.removeProps(item);
        this.acceptFormComponentDefinition(item);
    }

    /*  Tab Content */

    visitTabContentFieldComponentDefinition(item: TabContentFieldComponentDefinitionOutline): void {
        this.removeProps(item);
        this.removeProps(item.config);

        (item.config?.componentDefinitions ?? []).forEach((componentDefinition, index) => {
            // Visit children
            this.acceptCurrentPath(componentDefinition, ["config", "componentDefinitions", index.toString()]);
        });
    }

    visitTabContentFieldLayoutDefinition(item: TabContentFieldLayoutDefinitionOutline): void {
        this.removeProps(item);
        this.removeProps(item.config);
    }

    visitTabContentFormComponentDefinition(item: TabContentFormComponentDefinitionOutline): void {
        if (!ClientFormConfigVisitor.hasUserRole(this.userRoles, this.constraintPath)) {
            return;
        }
        if (!ClientFormConfigVisitor.isFormMode(this.formMode, this.constraintPath)) {
            return;
        }
        this.removeProps(item);
        this.acceptFormComponentDefinition(item);
    }

    /* Save Button  */

    visitSaveButtonFieldComponentDefinition(item: SaveButtonFieldComponentDefinitionOutline): void {
        this.removeProps(item);
        this.removeProps(item.config);
    }

    visitSaveButtonFormComponentDefinition(item: SaveButtonFormComponentDefinitionOutline): void {
        if (!ClientFormConfigVisitor.hasUserRole(this.userRoles, this.constraintPath)) {
            return;
        }
        if (!ClientFormConfigVisitor.isFormMode(this.formMode, this.constraintPath)) {
            return;
        }
        this.removeProps(item);
        this.acceptFormComponentDefinition(item);
    }

    /* Text Area */

    visitTextAreaFieldComponentDefinition(item: TextAreaFieldComponentDefinitionOutline): void {
        this.removeProps(item);
        this.removeProps(item.config);
    }

    visitTextAreaFieldModelDefinition(item: TextAreaFieldModelDefinitionOutline): void {
        this.removeProps(item);
        this.removeProps(item.config);
    }

    visitTextAreaFormComponentDefinition(item: TextAreaFormComponentDefinitionOutline): void {
        if (!ClientFormConfigVisitor.hasUserRole(this.userRoles, this.constraintPath)) {
            return;
        }
        if (!ClientFormConfigVisitor.isFormMode(this.formMode, this.constraintPath)) {
            return;
        }
        this.removeProps(item);
        this.acceptFormComponentDefinition(item);
    }

    /* Default Layout  */

    visitDefaultFieldLayoutDefinition(item: DefaultFieldLayoutDefinitionOutline): void {
        this.removeProps(item);
        this.removeProps(item.config);
    }

    /* Checkbox Input */

    visitCheckboxInputFieldComponentDefinition(item: CheckboxInputFieldComponentDefinitionOutline): void {
        this.removeProps(item);
        this.removeProps(item.config);
    }

    visitCheckboxInputFieldModelDefinition(item: CheckboxInputFieldModelDefinitionOutline): void {
        this.removeProps(item);
        this.removeProps(item.config);
    }

    visitCheckboxInputFormComponentDefinition(item: CheckboxInputFormComponentDefinitionOutline): void {
        if (!ClientFormConfigVisitor.hasUserRole(this.userRoles, this.constraintPath)) {
            return;
        }
        if (!ClientFormConfigVisitor.isFormMode(this.formMode, this.constraintPath)) {
            return;
        }
        this.removeProps(item);
        this.acceptFormComponentDefinition(item);
    }

    /* Dropdown Input */

    visitDropdownInputFieldComponentDefinition(item: DropdownInputFieldComponentDefinitionOutline): void {
        this.removeProps(item);
        this.removeProps(item.config);
    }

    visitDropdownInputFieldModelDefinition(item: DropdownInputFieldModelDefinitionOutline): void {
        this.removeProps(item);
        this.removeProps(item.config);
    }

    visitDropdownInputFormComponentDefinition(item: DropdownInputFormComponentDefinitionOutline): void {
        if (!ClientFormConfigVisitor.hasUserRole(this.userRoles, this.constraintPath)) {
            return;
        }
        if (!ClientFormConfigVisitor.isFormMode(this.formMode, this.constraintPath)) {
            return;
        }
        this.removeProps(item);
        this.acceptFormComponentDefinition(item);
    }

    /* Radio Input */

    visitRadioInputFieldComponentDefinition(item: RadioInputFieldComponentDefinitionOutline): void {
        this.removeProps(item);
        this.removeProps(item.config);
    }

    visitRadioInputFieldModelDefinition(item: RadioInputFieldModelDefinitionOutline): void {
        this.removeProps(item);
        this.removeProps(item.config);
    }

    visitRadioInputFormComponentDefinition(item: RadioInputFormComponentDefinitionOutline): void {
        if (!ClientFormConfigVisitor.hasUserRole(this.userRoles, this.constraintPath)) {
            return;
        }
        if (!ClientFormConfigVisitor.isFormMode(this.formMode, this.constraintPath)) {
            return;
        }
        this.removeProps(item);
        this.acceptFormComponentDefinition(item);
    }

    /* Date Input */

    visitDateInputFieldComponentDefinition(item: DateInputFieldComponentDefinitionOutline): void {
        this.removeProps(item);
        this.removeProps(item.config);
    }

    visitDateInputFieldModelDefinition(item: DateInputFieldModelDefinitionOutline): void {
        this.removeProps(item);
        this.removeProps(item.config);
    }

    visitDateInputFormComponentDefinition(item: DateInputFormComponentDefinitionOutline): void {
        if (!ClientFormConfigVisitor.hasUserRole(this.userRoles, this.constraintPath)) {
            return;
        }
        if (!ClientFormConfigVisitor.isFormMode(this.formMode, this.constraintPath)) {
            return;
        }
        this.removeProps(item);
        this.acceptFormComponentDefinition(item);
    }

    /* Shared */

    protected removeProps(item: any, config?: RemovePropsConfig) {
        const removeNames = config?.removeNames ?? [];
        const removeUndefined = config?.removeUndefined ?? true;
        const removeConstraints = config?.removeConstraints ?? true;
        const removeExpressions = config?.removeExpressions ?? true;

        for (const [key, value] of Object.entries(item ?? {})) {
            if (removeNames.includes(key)) {
                delete item[key];
            }
            if (removeUndefined && value === undefined) {
                delete item[key];
            }
            if (removeConstraints && 'constraints' in item) {
                delete item['constraints'];
            }
            if (removeExpressions && 'expressions' in item) {
                delete item['expressions'];
            }
        }
    }

    private static hasUserRole(currentUserRoles: string[], constraints: NameConstraints[]): boolean {
        const requiredRoles = constraints
            ?.map(b => b?.constraints?.authorization?.allowRoles)
            ?.filter(i => i !== null && i !== undefined) ?? [];

        // The current user must have at least one of the roles required by each component.
        const isAllowed = requiredRoles?.every(i => {
            const isArray = Array.isArray(i);
            const hasElements = i?.length > 0;
            const hasAtLeastOneUserRole = hasElements && currentUserRoles.some(c => i.includes(c));
            return (isArray && hasElements && hasAtLeastOneUserRole) || !isArray || !hasElements;
        });

        if (!isAllowed) {
            console.debug(`FormsService - access denied for form component definition authorization, current: ${currentUserRoles?.join(', ')}, required: ${requiredRoles?.join(', ')}`);
        }

        return isAllowed;
    }

    private static isFormMode(currentContextMode: FormModesConfig | null, constraints: NameConstraints[]): boolean {
        const requiredModes = constraints
            ?.map(b => b?.constraints?.allowModes)
            ?.filter(i => i !== null && i !== undefined) ?? [];

        // The current user must have at least one of the roles required by each component.
        const isAllowed = requiredModes?.every(i => {
            const isArray = Array.isArray(i);
            const hasElements = i?.length > 0;
            const hasMode = hasElements && currentContextMode && i.includes(currentContextMode);
            return (isArray && hasElements && hasMode) || !isArray || !hasElements;
        });

        if (!isAllowed) {
            console.debug(`FormsService - access denied for form component definition mode, current: ${currentContextMode}, required: ${requiredModes?.join(', ')}`);
        }

        return isAllowed;
    }
}
