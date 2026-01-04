import {cloneDeep as _cloneDeep, mergeWith as _mergeWith} from "lodash";
import {FormConfig} from "../form-config.model";
import {
    ComponentClassDefMapType,
    FieldComponentDefinitionMap,
    FieldLayoutDefinitionMap,
    FieldModelDefinitionMap, FormComponentClassDefMapType,
    FormComponentDefinitionMap, LayoutClassDefMapType, ModelClassDefMapType,
} from "../dictionary.model";
import {CurrentPathFormConfigVisitor} from "./base.model";
import {FormConfigFrame, FormConfigOutline} from "../form-config.outline";
import {
    GroupFieldComponentDefinitionFrame,
    GroupFieldComponentDefinitionOutline, GroupFieldComponentName, GroupFieldModelDefinitionFrame,
    GroupFieldModelDefinitionOutline, GroupFieldModelName,
    GroupFormComponentDefinitionOutline
} from "../component/group.outline";
import {
    RepeatableComponentName, RepeatableElementFieldLayoutDefinitionFrame,
    RepeatableElementFieldLayoutDefinitionOutline, RepeatableElementLayoutName, RepeatableFieldComponentDefinitionFrame,
    RepeatableFieldComponentDefinitionOutline,
    RepeatableFieldModelDefinitionFrame, RepeatableFieldModelDefinitionOutline,
    RepeatableFormComponentDefinitionOutline, RepeatableModelName
} from "../component/repeatable.outline";
import {
    RepeatableElementFieldLayoutConfig,
    RepeatableFieldComponentConfig,
    RepeatableFieldModelConfig
} from "../component/repeatable.model";
import {
    GroupFieldComponentConfig,
    GroupFieldModelConfig
} from "../component/group.model";
import {
    SimpleInputComponentName,
    SimpleInputFieldComponentDefinitionFrame,
    SimpleInputFieldComponentDefinitionOutline, SimpleInputFieldModelDefinitionFrame,
    SimpleInputFieldModelDefinitionOutline, SimpleInputFormComponentDefinitionOutline, SimpleInputModelName
} from "../component/simple-input.outline";
import {SimpleInputFieldComponentConfig, SimpleInputFieldModelConfig} from "../component/simple-input.model";
import {
    DefaultFieldLayoutDefinitionFrame,
    DefaultFieldLayoutDefinitionOutline, DefaultLayoutName
} from "../component/default-layout.outline";
import {DefaultFieldLayoutConfig, DefaultFieldLayoutDefinition} from "../component/default-layout.model";
import {FormConstraintAuthorizationConfig, FormConstraintConfig, FormExpressionsConfig} from "../form-component.model";
import {FormComponentDefinitionFrame, FormComponentDefinitionOutline} from "../form-component.outline";
import {
    ContentComponentName, ContentFieldComponentDefinitionFrame,
    ContentFieldComponentDefinitionOutline,
    ContentFormComponentDefinitionOutline
} from "../component/content.outline";
import {
    TabComponentName, TabFieldComponentDefinitionFrame,
    TabFieldComponentDefinitionOutline, TabFieldLayoutDefinitionFrame,
    TabFieldLayoutDefinitionOutline,
    TabFormComponentDefinitionOutline, TabLayoutName
} from "../component/tab.outline";
import {TabFieldComponentConfig, TabFieldLayoutConfig} from "../component/tab.model";
import {
    TabContentComponentName,
    TabContentFieldComponentDefinitionFrame,
    TabContentFieldComponentDefinitionOutline, TabContentFieldLayoutDefinitionFrame,
    TabContentFieldLayoutDefinitionOutline,
    TabContentFormComponentDefinitionFrame, TabContentFormComponentDefinitionOutline, TabContentLayoutName
} from "../component/tab-content.outline";
import {
    TabContentFieldComponentConfig,
    TabContentFieldLayoutConfig,
    TabContentFormComponentDefinition
} from "../component/tab-content.model";
import {
    TextAreaComponentName,
    TextAreaFieldComponentDefinitionFrame,
    TextAreaFieldComponentDefinitionOutline, TextAreaFieldModelDefinitionFrame,
    TextAreaFieldModelDefinitionOutline, TextAreaFormComponentDefinitionOutline, TextAreaModelName
} from "../component/text-area.outline";
import {TextAreaFieldComponentConfig, TextAreaFieldModelConfig} from "../component/text-area.model";
import {
    ContentFieldComponentConfig,
    ContentFieldComponentDefinition,
    ContentFormComponentDefinition
} from "../component/content.model";
import {
    DropdownInputComponentName,
    DropdownInputFieldComponentDefinitionFrame,
    DropdownInputFieldComponentDefinitionOutline, DropdownInputFieldModelDefinitionFrame,
    DropdownInputFieldModelDefinitionOutline, DropdownInputFormComponentDefinitionOutline, DropdownInputModelName
} from "../component/dropdown-input.outline";
import {DropdownInputFieldComponentConfig, DropdownInputFieldModelConfig} from "../component/dropdown-input.model";
import {
    CheckboxInputComponentName,
    CheckboxInputFieldComponentDefinitionFrame,
    CheckboxInputFieldComponentDefinitionOutline, CheckboxInputFieldModelDefinitionFrame,
    CheckboxInputFieldModelDefinitionOutline, CheckboxInputFormComponentDefinitionOutline, CheckboxInputModelName
} from "../component/checkbox-input.outline";
import {CheckboxInputFieldComponentConfig, CheckboxInputFieldModelConfig} from "../component/checkbox-input.model";
import {
    RadioInputComponentName, RadioInputFieldComponentDefinitionFrame,
    RadioInputFieldComponentDefinitionOutline, RadioInputFieldModelDefinitionFrame,
    RadioInputFieldModelDefinitionOutline, RadioInputFormComponentDefinitionOutline, RadioInputModelName
} from "../component/radio-input.outline";
import {RadioInputFieldComponentConfig, RadioInputFieldModelConfig} from "../component/radio-input.model";
import {
    DateInputComponentName,
    DateInputFieldComponentDefinitionFrame,
    DateInputFieldComponentDefinitionOutline, DateInputFieldModelDefinitionFrame,
    DateInputFieldModelDefinitionOutline, DateInputFormComponentDefinitionOutline, DateInputModelName
} from "../component/date-input.outline";
import {DateInputFieldComponentConfig, DateInputFieldModelConfig} from "../component/date-input.model";
import {
    SaveButtonComponentName,
    SaveButtonFieldComponentDefinitionFrame,
    SaveButtonFieldComponentDefinitionOutline,
    SaveButtonFormComponentDefinitionOutline
} from "../component/save-button.outline";
import {SaveButtonFieldComponentConfig} from "../component/save-button.model";
import {
    ValidationSummaryComponentName,
    ValidationSummaryFieldComponentDefinitionFrame,
    ValidationSummaryFieldComponentDefinitionOutline,
    ValidationSummaryFormComponentDefinitionOutline
} from "../component/validation-summary.outline";
import {ValidationSummaryFieldComponentConfig} from "../component/validation-summary.model";
import {
    isTypeFieldDefinitionName,
    isTypeFormComponentDefinition, isTypeFormComponentDefinitionName,
    isTypeFormConfig,
} from "../helpers";
import {AvailableFormComponentDefinitionFrames, ReusableFormDefinitions} from "../dictionary.outline";
import {FormModesConfig} from "../shared.outline";
import {ReusableComponentName, ReusableFormComponentDefinitionFrame} from "../component/reusable.outline";
import {FormModel, ILogger} from "@researchdatabox/redbox-core-types";
import {ConstructOverrides} from "./construct.overrides";
import {FieldModelConfigFrame} from "../field-model.outline";
import {FieldComponentConfigFrame} from "../field-component.outline";
import {FieldLayoutConfigFrame} from "../field-layout.outline";


export class MigrationV4ToV5FormConfigVisitor extends CurrentPathFormConfigVisitor {
    private original?: FormModel;
    private result?: FormConfigOutline;

    private fieldComponentMap?: ComponentClassDefMapType;
    private fieldModelMap?: ModelClassDefMapType;
    private fieldLayoutMap?: LayoutClassDefMapType;
    private formComponentMap?: FormComponentClassDefMapType;

    constructor(logger: ILogger) {
        super(logger);
        this.fieldComponentMap = FieldComponentDefinitionMap;
        this.fieldModelMap = FieldModelDefinitionMap;
        this.fieldLayoutMap = FieldLayoutDefinitionMap;
        this.formComponentMap = FormComponentDefinitionMap;
    }

    start(original: FormModel): FormConfigFrame {
        this.original = _cloneDeep(original) ?? {};
        this.result = new FormConfig();
        this.resetCurrentPath();
        this.result.accept(this);
        return this.result;
    }

    /* Form Config */

    visitFormConfig(item: FormConfigOutline): void {
        const currentData = this.getDataPath(this.original, this.currentPath);

        // Set properties that are the same in v4 and v5.
        this.sharedProps.setPropOverride('name', item, currentData);
        this.sharedProps.setPropOverride('type', item, currentData);
        this.sharedProps.setPropOverride('viewCssClasses', item, currentData);
        this.sharedProps.setPropOverride('editCssClasses', item, currentData);

        // TODO: form.customAngularApp?
        // TODO: form.fields?
        // TODO: form.workflowStep?
        // TODO: form.requiredFieldIndicator?
        // TODO: form.messages?
        // TODO: form.attachmentFields?

        // TODO: enabledValidationGroups
        // // Convert properties from v4 to v5.
        // if (Object.hasOwn(currentData, 'skipValidationOnSave')) {
        //     switch (currentData.skipValidationOnSave) {
        //         case true:
        //             item.enabledValidationGroups = ["none"];
        //             break;
        //         default:
        //         case false:
        //             item.enabledValidationGroups = ["all"];
        //             break;
        //     }
        // }

        // Convert components.
        const fields: Record<string, unknown>[] = currentData.fields ?? [];
        fields.forEach((field, index) => {
            const formComponent = this.sharedConstructFormComponentFromField(field);
            item.componentDefinitions.push(formComponent);
            this.acceptCurrentPath(formComponent, ["fields", index.toString()]);
        });
    }


    /* SimpleInput */

    visitSimpleInputFieldComponentDefinition(item: SimpleInputFieldComponentDefinitionOutline): void {
        const field = this.getDataPath(this.original, this.currentPath);
        item.config = new SimpleInputFieldComponentConfig();
        this.sharedPopulateFieldComponentConfig(item.config, field);
        this.sharedProps.setPropOverride('type', item.config, field?.definition);
    }

    visitSimpleInputFieldModelDefinition(item: SimpleInputFieldModelDefinitionOutline): void {
        const field = this.getDataPath(this.original, this.currentPath);
        item.config = new SimpleInputFieldModelConfig();
        this.sharedPopulateFieldModelConfig(item.config, field);

    }

    visitSimpleInputFormComponentDefinition(item: SimpleInputFormComponentDefinitionOutline): void {
        this.sharedPopulateFormComponent(item);
    }


    /* Content */

    visitContentFieldComponentDefinition(item: ContentFieldComponentDefinitionOutline): void {
        const field = this.getDataPath(this.original, this.currentPath);
        if (!item.config) {
            item.config = new ContentFieldComponentConfig();
        }
        this.sharedPopulateFieldComponentConfig(item.config, field);
    }

    visitContentFormComponentDefinition(item: ContentFormComponentDefinitionOutline): void {
        this.sharedPopulateFormComponent(item);
    }

    /* Repeatable  */

    visitRepeatableFieldComponentDefinition(item: RepeatableFieldComponentDefinitionOutline): void {
        const field = this.getDataPath(this.original, this.currentPath);
        item.config = new RepeatableFieldComponentConfig();
        this.sharedPopulateFieldComponentConfig(item.config, field);

        if (field?.definition?.fields?.length === 1) {
            // populate elementTemplate
            item.config.elementTemplate = this.sharedConstructFormComponentFromField(field);
            this.acceptCurrentPath(item.config.elementTemplate, ["definition", "fields", "0"]);
        }
    }

    visitRepeatableFieldModelDefinition(item: RepeatableFieldModelDefinitionOutline): void {
        const field = this.getDataPath(this.original, this.currentPath);
        item.config = new RepeatableFieldModelConfig();
        this.sharedPopulateFieldModelConfig(item.config, field);
    }

    visitRepeatableElementFieldLayoutDefinition(item: RepeatableElementFieldLayoutDefinitionOutline): void {
        const field = this.getDataPath(this.original, this.currentPath);
        item.config = new RepeatableElementFieldLayoutConfig();
        this.sharedPopulateFieldLayoutConfig(item.config, field);
    }

    visitRepeatableFormComponentDefinition(item: RepeatableFormComponentDefinitionOutline): void {
        this.sharedPopulateFormComponent(item);
    }

    /* Validation Summary */

    visitValidationSummaryFieldComponentDefinition(item: ValidationSummaryFieldComponentDefinitionOutline): void {
        const field = this.getDataPath(this.original, this.currentPath);
        item.config = new ValidationSummaryFieldComponentConfig();
        this.sharedPopulateFieldComponentConfig(item.config, field);
    }

    visitValidationSummaryFormComponentDefinition(item: ValidationSummaryFormComponentDefinitionOutline): void {
        this.sharedPopulateFormComponent(item);
    }

    /* Group */

    visitGroupFieldComponentDefinition(item: GroupFieldComponentDefinitionOutline): void {
        const field = this.getDataPath(this.original, this.currentPath);
        const config = new GroupFieldComponentConfig();
        item.config = config;
        this.sharedPopulateFieldComponentConfig(item.config, field);

        const fields: Record<string, unknown>[] = field?.definition?.fields ?? [];
        fields.forEach((field, index) => {
            const formComponent = this.sharedConstructFormComponentFromField(field);
            config.componentDefinitions.push(formComponent);
            this.acceptCurrentPath(formComponent, ["definition", "fields", index.toString()]);
        });
    }

    visitGroupFieldModelDefinition(item: GroupFieldModelDefinitionOutline): void {
        const field = this.getDataPath(this.original, this.currentPath);
        item.config = new GroupFieldModelConfig();
        this.sharedPopulateFieldModelConfig(item.config, field);
    }

    visitGroupFormComponentDefinition(item: GroupFormComponentDefinitionOutline): void {
        this.sharedPopulateFormComponent(item);
    }

    /* Tab  */

    visitTabFieldComponentDefinition(item: TabFieldComponentDefinitionOutline): void {
        const field = this.getDataPath(this.original, this.currentPath);
        const config = new TabFieldComponentConfig();
        item.config = config;
        this.sharedPopulateFieldComponentConfig(item.config, field);

        const fields: Record<string, unknown>[] = field?.definition?.fields ?? [];
        fields.forEach((field, index) => {
            // TODO: build tab component from field
            const tab = new TabContentFormComponentDefinition();
            config.tabs.push(tab);
            field.class = "TabContentContainer";
            this.acceptCurrentPath(tab, ["definition", "fields", index.toString()]);
        });
    }

    visitTabFieldLayoutDefinition(item: TabFieldLayoutDefinitionOutline): void {
        const field = this.getDataPath(this.original, this.currentPath);
        item.config = new TabFieldLayoutConfig();
        this.sharedPopulateFieldLayoutConfig(item.config, field);
    }

    visitTabFormComponentDefinition(item: TabFormComponentDefinitionOutline): void {
        this.sharedPopulateFormComponent(item);
    }

    /*  Tab Content */

    visitTabContentFieldComponentDefinition(item: TabContentFieldComponentDefinitionOutline): void {
        const field = this.getDataPath(this.original, this.currentPath);
        const config = new TabContentFieldComponentConfig();
        item.config = config;
        this.sharedPopulateFieldComponentConfig(item.config, field);

        const fields: Record<string, unknown>[] = field?.definition?.fields ?? [];
        fields.forEach((field, index) => {
            const formComponent = this.sharedConstructFormComponentFromField(field);
            config.componentDefinitions.push(formComponent);
            this.acceptCurrentPath(formComponent, ["definition", "fields", index.toString()]);
        });
    }

    visitTabContentFieldLayoutDefinition(item: TabContentFieldLayoutDefinitionOutline): void {
        const field = this.getDataPath(this.original, this.currentPath);
        item.config = new TabContentFieldLayoutConfig();
        this.sharedPopulateFieldLayoutConfig(item.config, field);
    }

    visitTabContentFormComponentDefinition(item: TabContentFormComponentDefinitionOutline): void {
        this.sharedPopulateFormComponent(item);
    }

    /* Save Button  */

    visitSaveButtonFieldComponentDefinition(item: SaveButtonFieldComponentDefinitionOutline): void {
        const field = this.getDataPath(this.original, this.currentPath);
        item.config = new SaveButtonFieldComponentConfig();
        this.sharedPopulateFieldComponentConfig(item.config, field);
    }

    visitSaveButtonFormComponentDefinition(item: SaveButtonFormComponentDefinitionOutline): void {
        this.sharedPopulateFormComponent(item);
    }

    /* Text Area */

    visitTextAreaFieldComponentDefinition(item: TextAreaFieldComponentDefinitionOutline): void {
        const field = this.getDataPath(this.original, this.currentPath);
        item.config = new TextAreaFieldComponentConfig();
        this.sharedPopulateFieldComponentConfig(item.config, field);

        const cols = field?.definition?.cols ?? field?.definition?.columns ?? undefined;
        this.sharedProps.setPropOverride('cols', item.config, {cols: cols === undefined ? undefined : parseInt(cols)});

        const rows = field?.definition?.rows ?? undefined;
        this.sharedProps.setPropOverride('rows', item.config, {rows: rows === undefined ? undefined : parseInt(rows)});
    }

    visitTextAreaFieldModelDefinition(item: TextAreaFieldModelDefinitionOutline): void {
        const field = this.getDataPath(this.original, this.currentPath);
        item.config = new TextAreaFieldModelConfig();
        this.sharedPopulateFieldModelConfig(item.config, field);
    }

    visitTextAreaFormComponentDefinition(item: TextAreaFormComponentDefinitionOutline): void {
        this.sharedPopulateFormComponent(item);
    }

    /* Default Layout  */

    visitDefaultFieldLayoutDefinition(item: DefaultFieldLayoutDefinitionOutline): void {
        const field = this.getDataPath(this.original, this.currentPath);
        item.config = new DefaultFieldLayoutConfig();
        this.sharedPopulateFieldLayoutConfig(item.config, field);
    }

    /* Checkbox Input */

    visitCheckboxInputFieldComponentDefinition(item: CheckboxInputFieldComponentDefinitionOutline): void {
        const field = this.getDataPath(this.original, this.currentPath);
        item.config = new CheckboxInputFieldComponentConfig();
        this.sharedPopulateFieldComponentConfig(item.config, field);

        this.sharedProps.setPropOverride('options', item.config, field?.definition);
    }

    visitCheckboxInputFieldModelDefinition(item: CheckboxInputFieldModelDefinitionOutline): void {
        const field = this.getDataPath(this.original, this.currentPath);
        item.config = new CheckboxInputFieldModelConfig();
        this.sharedPopulateFieldModelConfig(item.config, field);
    }

    visitCheckboxInputFormComponentDefinition(item: CheckboxInputFormComponentDefinitionOutline): void {
        this.sharedPopulateFormComponent(item);
    }

    /* Dropdown Input */

    visitDropdownInputFieldComponentDefinition(item: DropdownInputFieldComponentDefinitionOutline): void {
        const field = this.getDataPath(this.original, this.currentPath);
        item.config = new DropdownInputFieldComponentConfig();
        this.sharedPopulateFieldComponentConfig(item.config, field);

        this.sharedProps.setPropOverride('options', item.config, field?.definition);
    }

    visitDropdownInputFieldModelDefinition(item: DropdownInputFieldModelDefinitionOutline): void {
        const field = this.getDataPath(this.original, this.currentPath);
        item.config = new DropdownInputFieldModelConfig();
        this.sharedPopulateFieldModelConfig(item.config, field);
    }

    visitDropdownInputFormComponentDefinition(item: DropdownInputFormComponentDefinitionOutline): void {
        this.sharedPopulateFormComponent(item);
    }

    /* Radio Input */

    visitRadioInputFieldComponentDefinition(item: RadioInputFieldComponentDefinitionOutline): void {
        const field = this.getDataPath(this.original, this.currentPath);
        item.config = new RadioInputFieldComponentConfig();
        this.sharedPopulateFieldComponentConfig(item.config, field);

        this.sharedProps.setPropOverride('options', item.config, field?.definition);
    }

    visitRadioInputFieldModelDefinition(item: RadioInputFieldModelDefinitionOutline): void {
        const field = this.getDataPath(this.original, this.currentPath);
        item.config = new RadioInputFieldModelConfig();
        this.sharedPopulateFieldModelConfig(item.config, field);
    }

    visitRadioInputFormComponentDefinition(item: RadioInputFormComponentDefinitionOutline): void {
        this.sharedPopulateFormComponent(item);
    }

    /* Date Input */

    visitDateInputFieldComponentDefinition(item: DateInputFieldComponentDefinitionOutline): void {
        const field = this.getDataPath(this.original, this.currentPath);
        item.config = new DateInputFieldComponentConfig();
        this.sharedPopulateFieldComponentConfig(item.config, field);
    }

    visitDateInputFieldModelDefinition(item: DateInputFieldModelDefinitionOutline): void {
        const field = this.getDataPath(this.original, this.currentPath);
        item.config = new DateInputFieldModelConfig();
        this.sharedPopulateFieldModelConfig(item.config, field);
    }

    visitDateInputFormComponentDefinition(item: DateInputFormComponentDefinitionOutline): void {
        this.sharedPopulateFormComponent(item);
    }

    /* Shared */

    /**
     * Map from v4 class and compClass to v5 class.
     * Return an instance of the form component without properties set.
     */
    protected sharedConstructFormComponentFromField(field: Record<string, unknown>) {
        const {componentClassName: componentClassString, message} = this.mapV4ToV5(field);

        const formComponentClass = this.formComponentMap?.get(componentClassString);

        let formComponent;
        if (componentClassString && formComponentClass) {
            formComponent = new formComponentClass();
        } else {
            formComponent = new ContentFormComponentDefinition();
            formComponent.component = new ContentFieldComponentDefinition();
            formComponent.component.config = new ContentFieldComponentConfig();

            let msg = message;
            if (componentClassString) {
                msg += ` Could not find class for form component class name '${componentClassString}' at path '${this.currentPath}'.`;
            }
            formComponent.component.config.content = msg;
            this.logger.warn(msg);
        }

        return formComponent;
    }

    protected mapV4ToV5(field: Record<string, unknown>): MappedClasses & { message: string } {
        const v4ClassName = field?.class?.toString() ?? "";
        const v4CompClassName = field?.compClass?.toString() ?? "";
        const fieldDefinition = (field?.definition ?? {}) as Record<string, unknown>;

        // Overall mapping from v4 class, v4 compClass to v5 class.
        const contentComponent = {componentClassName: ContentComponentName};
        const groupComponent = {componentClassName: GroupFieldComponentName, modelClassName: GroupFieldModelName};
        const repeatableComponent = {componentClassName: RepeatableComponentName, modelClassName: RepeatableModelName};
        const tabComponent = {componentClassName: TabComponentName, layoutClassName: TabLayoutName};
        const tabContentComponent = {
            componentClassName: TabContentComponentName,
            layoutClassName: TabContentLayoutName
        };
        const textAreaComponent = {componentClassName: TextAreaComponentName, modelClassName: TextAreaModelName};
        const simpleInputComponent = {
            componentClassName: SimpleInputComponentName,
            modelClassName: SimpleInputModelName
        };
        const dropDownComponent = {
            componentClassName: DropdownInputComponentName,
            modelClassName: DropdownInputModelName
        };
        const dateInputComponent = {componentClassName: DateInputComponentName, modelClassName: DateInputModelName};
        const saveButtonComponent = {componentClassName: SaveButtonComponentName};
        const classMap: Record<string, MappedClasses> = {
            "Container__TextBlockComponent": contentComponent,
            "Container__GenericGroupComponent": groupComponent,
            "TextArea__": textAreaComponent,
            "TextArea__TextAreaComponent": textAreaComponent,
            "TabOrAccordionContainer__TabOrAccordionContainerComponent": tabComponent,
            "ButtonBarContainer__ButtonBarContainerComponent": groupComponent,
            "Container__": groupComponent,
            "TextField__": simpleInputComponent,
            "RepeatableContainer__RepeatableTextfieldComponent": repeatableComponent,
            "RepeatableContainer__RepeatableGroupComponent": repeatableComponent,
            "RepeatableContributor__RepeatableContributorComponent": repeatableComponent,
            "RepeatableVocab__RepeatableVocabComponent": repeatableComponent,
            "SelectionField__DropdownFieldComponent": dropDownComponent,
            "DateTime__": dateInputComponent,
            "SaveButton__": saveButtonComponent,
            "TabContentContainer__": tabContentComponent, // TabContentContainer is a made-up v4 class for mapping to tab content component
            // TODO: generic components that likely need to be more specific
            "ContributorField__": groupComponent,
        };
        const v5ClassNames = classMap[`${v4ClassName}__${v4CompClassName}`] ?? {};
        let v5ComponentClassName = v5ClassNames.componentClassName || "";
        let v5ModelClassName = v5ClassNames.modelClassName || "";
        let v5LayoutClassName = v5ClassNames.layoutClassName || DefaultLayoutName;


        // Some components need special processing.
        if (v5ComponentClassName === "SelectionInputComponent" && fieldDefinition?.controlType === 'checkbox') {
            v5ComponentClassName = "CheckboxInputComponent";
            v5ModelClassName = "CheckboxInputModel";
        }

        // Provide a message for not yet implemented fields.
        let message = "";
        if (!v5ComponentClassName) {
            const v4Name = fieldDefinition?.name || fieldDefinition?.id;
            message = `Not yet implemented v4: class ${JSON.stringify(v4ClassName)} compClass ${JSON.stringify(v4CompClassName)} name ${JSON.stringify(v4Name)}.`;
        }
        return {
            componentClassName: v5ComponentClassName || "",
            modelClassName: v5ModelClassName || "",
            layoutClassName: v5LayoutClassName || "",
            message: message,
        }
    }

    protected sharedPopulateFormComponent(item: FormComponentDefinitionOutline): void {
        // Get the current raw data for constructing the class instance.
        const currentData = this.getDataPath(this.original, this.currentPath);
        let {componentClassName, modelClassName, layoutClassName, message} = this.mapV4ToV5(currentData);

        // Set the simple properties
        item.name = currentData?.definition?.name || currentData?.definition?.id || `${componentClassName}-${this.currentPath.join('-')}`;
        item.module = undefined;

        // Set the constraints
        item.constraints = new FormConstraintConfig();
        item.constraints.allowModes = [];
        if (currentData?.editOnly === true) {
            item.constraints.allowModes.push("edit");
        }
        if (currentData?.viewOnly === true) {
            item.constraints.allowModes.push("view");
        }

        item.constraints.authorization = new FormConstraintAuthorizationConfig();
        item.constraints.authorization.allowRoles = [];
        if (currentData?.roles?.length > 0) {
            item.constraints.authorization.allowRoles.push(...currentData?.roles);
        }

        // Set the expressions
        item.expressions = new FormExpressionsConfig();
        // TODO: expressions

        // Get the classes
        let componentClass = this.fieldComponentMap?.get(componentClassName);
        let modelClass = modelClassName ? this.fieldModelMap?.get(modelClassName) : null;
        let layoutClass = layoutClassName ? this.fieldLayoutMap?.get(layoutClassName) : null;

        // Use content component if the component is not yet implemented.
        if (!componentClass) {
            componentClass = ContentFieldComponentDefinition;
            modelClass = null
            layoutClass = DefaultFieldLayoutDefinition;
            message += ` Could not find class for form component class name ${JSON.stringify(componentClassName)} at path ${JSON.stringify(this.currentPath)} with currentData ${JSON.stringify(currentData)}.`;
        }

        // Create new instances
        const component = new componentClass();
        const model = modelClass ? new modelClass() : null;
        const layout = layoutClass ? new layoutClass() : null;

        // Add message to content component if it is not yet implemented.
        if (message) {
            const contentConfig = new ContentFieldComponentConfig();
            contentConfig.content = message;
            component.config = contentConfig
        }

        // Set the instances
        item.component = component;
        item.model = model || undefined;
        item.layout = layout || undefined;

        // Continue visiting
        this.acceptCurrentPath(item.component, []);
        if (item.model) {
            this.acceptCurrentPath(item.model, []);
        }
        if (item.layout) {
            this.acceptCurrentPath(item.layout, []);
        }
    }

    protected sharedPopulateFieldComponentConfig(item: FieldComponentConfigFrame, field?: any) {
        // Set the common field component config properties
        // this.sharedProps.setPropOverride('readonly', item, config);
        // this.sharedProps.setPropOverride('visible', item, config);
        // this.sharedProps.setPropOverride('editMode', item, config);
        this.sharedProps.setPropOverride('label', item, field?.definition);
        // this.sharedProps.setPropOverride('defaultComponentCssClasses', item, config);
        // this.sharedProps.setPropOverride('hostCssClasses', item, config);
        // this.sharedProps.setPropOverride('wrapperCssClasses', item, config);
        // this.sharedProps.setPropOverride('disabled', item, config);
        // this.sharedProps.setPropOverride('autofocus', item, config);
        // this.sharedProps.setPropOverride('tooltip', item, config);
    }

    protected sharedPopulateFieldModelConfig(item: FieldModelConfigFrame<unknown>, field?: any) {
        // Set the common field model config properties
        // this.sharedProps.setPropOverride('disableFormBinding', item, config);
        // this.sharedProps.setPropOverride('value', item, config);
        this.sharedProps.setPropOverride('defaultValue', item, {defaultValue: field?.definition?.defaultValue ?? field?.definition?.value});
        // this.sharedProps.setPropOverride('validators', item, config);
        // this.sharedProps.setPropOverride('wrapperCssClasses', item, config);
        // this.sharedProps.setPropOverride('editCssClasses', item, config);
        if (!item.validators) {
            item.validators = [];
        }
        if (field?.definition?.required === true) {
            item.validators.push({class: 'required'});
        }
        if (field?.definition?.maxLength !== undefined) {
            item.validators.push({class: 'maxLength', config: {maxLength: field?.definition?.maxLength}});
        }
    }

    protected sharedPopulateFieldLayoutConfig(item: FieldLayoutConfigFrame, field?: any) {
        // Set the common field model config properties
        this.sharedPopulateFieldComponentConfig(item, field);
        // this.sharedProps.setPropOverride('labelRequiredStr', item, config);
        this.sharedProps.setPropOverride('helpText', item, {helpText: field?.definition?.help});
        // this.sharedProps.setPropOverride('cssClassesMap', item, config);
        // this.sharedProps.setPropOverride('helpTextVisibleOnInit', item, config);
        // this.sharedProps.setPropOverride('helpTextVisible', item, config);
    }


}

interface MappedClasses {
    componentClassName: string;
    modelClassName?: string;
    layoutClassName?: string;
}
