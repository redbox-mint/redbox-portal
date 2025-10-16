import {FormConfig} from "../form-config.model";
import {
    FieldComponentDefinitionMap,
    FieldLayoutDefinitionMap,
    FieldModelDefinitionMap,
    FormComponentDefinitionMap,
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
import {DefaultFieldLayoutConfig} from "../component/default-layout.model";
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
    TabContentFieldLayoutDefinitionOutline, TabContentFormComponentDefinitionOutline, TabContentLayoutName
} from "../component/tab-content.outline";
import {TabContentFieldComponentConfig, TabContentFieldLayoutConfig} from "../component/tab-content.model";
import {
    TextAreaComponentName,
    TextAreaFieldComponentDefinitionFrame,
    TextAreaFieldComponentDefinitionOutline, TextAreaFieldModelDefinitionFrame,
    TextAreaFieldModelDefinitionOutline, TextAreaFormComponentDefinitionOutline, TextAreaModelName
} from "../component/text-area.outline";
import {TextAreaFieldComponentConfig, TextAreaFieldModelConfig} from "../component/text-area.model";
import {ContentFieldComponentConfig} from "../component/content.model";
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
import {isTypeFieldDefinitionName, isTypeFormComponentDefinition, isTypeFormConfig} from "../helpers";


/**
 * Visit each form config frame and create an instance of the associated class.
 * Populate the form config hierarchy with the class instances.
 */
export class ConstructFormConfigVisitor extends CurrentPathFormConfigVisitor {
    private result?: FormConfigOutline;
    private data?: FormConfigFrame;

    private fieldComponentMap?;
    private fieldModelMap?;
    private fieldLayoutMap?;
    private formComponentMap?;

    constructor() {
        super();
        this.fieldComponentMap = FieldComponentDefinitionMap;
        this.fieldModelMap = FieldModelDefinitionMap;
        this.fieldLayoutMap = FieldLayoutDefinitionMap;
        this.formComponentMap = FormComponentDefinitionMap;
    }

    start(data: FormConfigFrame): FormConfigOutline {
        this.result = new FormConfig();
        this.data = data;
        this.resetCurrentPath();
        this.result.accept(this);
        return this.result;
    }

    /* Form Config */

    visitFormConfig(item: FormConfigOutline): void {
        const currentData = this.getDataPath(this.data, this.currentPath);
        if (!isTypeFormConfig(currentData)) {
            return;
        }

        // Set the simple properties, using the class instance property values as the defaults.
        item.name = currentData.name ?? item.name;
        item.type = currentData.type ?? item.type;
        item.domElementType = currentData.domElementType ?? item.domElementType;
        item.domId = currentData.domId ?? item.domId;
        item.viewCssClasses = currentData.viewCssClasses ?? item.viewCssClasses;
        item.editCssClasses = currentData.editCssClasses ?? item.editCssClasses;
        item.defaultComponentConfig = currentData.defaultComponentConfig ?? item.defaultComponentConfig;
        item.skipValidationOnSave = currentData.skipValidationOnSave ?? item.skipValidationOnSave;
        item.validators = currentData.validators ?? item.validators;
        item.defaultLayoutComponent = currentData.defaultLayoutComponent ?? item.defaultLayoutComponent;
        item.debugValue = currentData.debugValue ?? item.debugValue;

        // Visit the components
        (currentData?.componentDefinitions ?? []).forEach((componentDefinition, index) => {
            const formComponent = this.sharedConstructFormComponent(componentDefinition);

            // Store the instances on the item
            item.componentDefinitions.push(formComponent);

            // Continue the construction
            this.acceptCurrentPath(formComponent, ["componentDefinitions", index.toString()]);
        });
    }

    /* SimpleInput */

    visitSimpleInputFieldComponentDefinition(item: SimpleInputFieldComponentDefinitionOutline): void {
        // Get the current raw data for constructing the class instance.
        const currentData = this.getDataPath(this.data, this.currentPath);
        if (!isTypeFieldDefinitionName<SimpleInputFieldComponentDefinitionFrame>(currentData, SimpleInputComponentName)) {
            return;
        }
        const config = currentData?.config;

        // Create the class instance for the config
        item.config = new SimpleInputFieldComponentConfig();

        this.sharedPopulateFieldComponentConfig(item.config, config);

        this.setProp('type', item.config, config);
    }

    visitSimpleInputFieldModelDefinition(item: SimpleInputFieldModelDefinitionOutline): void {
        // Get the current raw data for constructing the class instance.
        const currentData = this.getDataPath(this.data, this.currentPath);
        if (!isTypeFieldDefinitionName<SimpleInputFieldModelDefinitionFrame>(currentData, SimpleInputModelName)) {
            return;
        }

        // Create the class instance for the config
        item.config = new SimpleInputFieldModelConfig();

        this.sharedPopulateFieldModelConfig(item.config, currentData?.config);
    }

    visitSimpleInputFormComponentDefinition(item: SimpleInputFormComponentDefinitionOutline): void {
        this.sharedPopulateFormComponent(item);
    }

    /* Content */

    visitContentFieldComponentDefinition(item: ContentFieldComponentDefinitionOutline): void {
        // Get the current raw data for constructing the class instance.
        const currentData = this.getDataPath(this.data, this.currentPath);
        if (!isTypeFieldDefinitionName<ContentFieldComponentDefinitionFrame>(currentData, ContentComponentName)) {
            return;
        }
        const config = currentData?.config;

        // Create the class instance for the config
        item.config = new ContentFieldComponentConfig();

        this.sharedPopulateFieldComponentConfig(item.config, config);

        this.setProp('content', item.config, config);
        this.setProp('template', item.config, config);
    }

    visitContentFormComponentDefinition(item: ContentFormComponentDefinitionOutline): void {
        this.sharedPopulateFormComponent(item);
    }

    /* Repeatable  */

    visitRepeatableFieldComponentDefinition(item: RepeatableFieldComponentDefinitionOutline): void {
        // Get the current raw data for constructing the class instance.
        const currentData = this.getDataPath(this.data, this.currentPath);
        if (!isTypeFieldDefinitionName<RepeatableFieldComponentDefinitionFrame>(currentData, RepeatableComponentName)) {
            return;
        }
        const config = currentData?.config;

        // Create the class instance for the config
        item.config = new RepeatableFieldComponentConfig();

        this.sharedPopulateFieldComponentConfig(item.config, config);

        if (!config?.elementTemplate) {
            throw new Error(`Missing elementTemplate for repeatable at '${this.currentPath}'.`)
        }

        const formComponent = this.sharedConstructFormComponent(config?.elementTemplate);

        // Store the instances on the item
        item.config.elementTemplate = formComponent;

        // Continue the construction
        this.acceptCurrentPath(formComponent, ["config", "elementTemplate"]);
    }

    visitRepeatableFieldModelDefinition(item: RepeatableFieldModelDefinitionOutline): void {
        // Get the current raw data for constructing the class instance.
        const currentData = this.getDataPath(this.data, this.currentPath);
        if (!isTypeFieldDefinitionName<RepeatableFieldModelDefinitionFrame>(currentData, RepeatableModelName)) {
            return;
        }

        // Create the class instance for the config
        item.config = new RepeatableFieldModelConfig();

        this.sharedPopulateFieldModelConfig(item.config, currentData?.config);
    }

    visitRepeatableElementFieldLayoutDefinition(item: RepeatableElementFieldLayoutDefinitionOutline): void {
        // Get the current raw data for constructing the class instance.
        const currentData = this.getDataPath(this.data, this.currentPath);
        if (!isTypeFieldDefinitionName<RepeatableElementFieldLayoutDefinitionFrame>(currentData, RepeatableElementLayoutName)) {
            return;
        }

        // Create the class instance for the config
        item.config = new RepeatableElementFieldLayoutConfig();

        this.sharedPopulateFieldLayoutConfig(item.config, currentData?.config);

    }

    visitRepeatableFormComponentDefinition(item: RepeatableFormComponentDefinitionOutline): void {
        this.sharedPopulateFormComponent(item);
    }

    /* Validation Summary */

    visitValidationSummaryFieldComponentDefinition(item: ValidationSummaryFieldComponentDefinitionOutline): void {
        // Get the current raw data for constructing the class instance.
        const currentData = this.getDataPath(this.data, this.currentPath);
        if (!isTypeFieldDefinitionName<ValidationSummaryFieldComponentDefinitionFrame>(currentData, ValidationSummaryComponentName)) {
            return;
        }
        const config = currentData?.config;

        // Create the class instance for the config
        item.config = new ValidationSummaryFieldComponentConfig();

        this.sharedPopulateFieldComponentConfig(item.config, config);
    }

    visitValidationSummaryFormComponentDefinition(item: ValidationSummaryFormComponentDefinitionOutline): void {
        this.sharedPopulateFormComponent(item);
    }

    /* Group */

    visitGroupFieldComponentDefinition(item: GroupFieldComponentDefinitionOutline): void {
        // Get the current raw data for constructing the class instance.
        const currentData = this.getDataPath(this.data, this.currentPath);
        if (!isTypeFieldDefinitionName<GroupFieldComponentDefinitionFrame>(currentData, GroupFieldComponentName)) {
            return;
        }
        const config = currentData?.config;

        // Create the class instance for the config
        item.config = new GroupFieldComponentConfig();

        this.sharedPopulateFieldComponentConfig(item.config, config);

        // Visit the components
        (config?.componentDefinitions ?? []).forEach((componentDefinition, index) => {
            const formComponent = this.sharedConstructFormComponent(componentDefinition);

            // Store the instances on the item
            item.config?.componentDefinitions.push(formComponent);

            // Continue the construction
            this.acceptCurrentPath(formComponent, ["config", "componentDefinitions", index.toString()]);
        });
    }

    visitGroupFieldModelDefinition(item: GroupFieldModelDefinitionOutline): void {
        // Get the current raw data for constructing the class instance.
        const currentData = this.getDataPath(this.data, this.currentPath);
        if (!isTypeFieldDefinitionName<GroupFieldModelDefinitionFrame>(currentData, GroupFieldModelName)) {
            return;
        }

        // Create the class instance for the config
        item.config = new GroupFieldModelConfig();

        this.sharedPopulateFieldModelConfig(item.config, currentData?.config);
    }

    visitGroupFormComponentDefinition(item: GroupFormComponentDefinitionOutline): void {
        this.sharedPopulateFormComponent(item);
    }

    /* Tab  */

    visitTabFieldComponentDefinition(item: TabFieldComponentDefinitionOutline): void {
        // Get the current raw data for constructing the class instance.
        const currentData = this.getDataPath(this.data, this.currentPath);
        if (!isTypeFieldDefinitionName<TabFieldComponentDefinitionFrame>(currentData, TabComponentName)) {
            return;
        }
        const config = currentData?.config;

        // Create the class instance for the config
        item.config = new TabFieldComponentConfig();

        this.sharedPopulateFieldComponentConfig(item.config, config);

        // Visit the components
        (config?.tabs ?? []).forEach((componentDefinition, index) => {
            const formComponent = this.sharedConstructFormComponent(componentDefinition);

            // Store the instances on the item
            item.config?.tabs.push(formComponent);

            // Continue the construction
            this.acceptCurrentPath(formComponent, ["config", "tabs", index.toString()]);
        });
    }

    visitTabFieldLayoutDefinition(item: TabFieldLayoutDefinitionOutline): void {
        // Get the current raw data for constructing the class instance.
        const currentData = this.getDataPath(this.data, this.currentPath);
        if (!isTypeFieldDefinitionName<TabFieldLayoutDefinitionFrame>(currentData, TabLayoutName)) {
            return;
        }
        const config = currentData?.config;

        // Create the class instance for the config
        item.config = new TabFieldLayoutConfig();

        this.sharedPopulateFieldLayoutConfig(item.config, config);

        this.setProp('buttonSectionCssClass', item.config, config);
        this.setProp('tabPaneCssClass', item.config, config);
        this.setProp('tabPaneActiveCssClass', item.config, config);
        this.setProp('buttonSectionAriaOrientation', item.config, config);
    }

    visitTabFormComponentDefinition(item: TabFormComponentDefinitionOutline): void {
        this.sharedPopulateFormComponent(item);
    }

    /* Tab Content */

    visitTabContentFieldComponentDefinition(item: TabContentFieldComponentDefinitionOutline): void {
        // Get the current raw data for constructing the class instance.
        const currentData = this.getDataPath(this.data, this.currentPath);
        if (!isTypeFieldDefinitionName<TabContentFieldComponentDefinitionFrame>(currentData, TabContentComponentName)) {
            return;
        }
        const config = currentData?.config;

        // Create the class instance for the config
        item.config = new TabContentFieldComponentConfig();

        this.sharedPopulateFieldComponentConfig(item.config, config);

        this.setProp('selected', item.config, config);

        // Visit the components
        (config?.componentDefinitions ?? []).forEach((componentDefinition, index) => {
            const formComponent = this.sharedConstructFormComponent(componentDefinition);

            // Store the instances on the item
            item.config?.componentDefinitions.push(formComponent);

            // Continue the construction
            this.acceptCurrentPath(formComponent, ["config", "componentDefinitions", index.toString()]);
        });
    }

    visitTabContentFieldLayoutDefinition(item: TabContentFieldLayoutDefinitionOutline): void {
        // Get the current raw data for constructing the class instance.
        const currentData = this.getDataPath(this.data, this.currentPath);
        if (!isTypeFieldDefinitionName<TabContentFieldLayoutDefinitionFrame>(currentData, TabContentLayoutName)) {
            return;
        }
        const config = currentData?.config;

        // Create the class instance for the config
        item.config = new TabContentFieldLayoutConfig();

        this.sharedPopulateFieldLayoutConfig(item.config, config);

        this.setProp('buttonLabel', item.config, config);
    }

    visitTabContentFormComponentDefinition(item: TabContentFormComponentDefinitionOutline): void {
        this.sharedPopulateFormComponent(item);
    }

    /* Save Button  */

    visitSaveButtonFieldComponentDefinition(item: SaveButtonFieldComponentDefinitionOutline): void {
        // Get the current raw data for constructing the class instance.
        const currentData = this.getDataPath(this.data, this.currentPath);
        if (!isTypeFieldDefinitionName<SaveButtonFieldComponentDefinitionFrame>(currentData, SaveButtonComponentName)) {
            return;
        }
        const config = currentData?.config;

        // Create the class instance for the config
        item.config = new SaveButtonFieldComponentConfig();

        this.sharedPopulateFieldComponentConfig(item.config, config);

        this.setProp('targetStep', item.config, config);
        this.setProp('forceSave', item.config, config);
        this.setProp('skipValidation', item.config, config);
    }

    visitSaveButtonFormComponentDefinition(item: SaveButtonFormComponentDefinitionOutline): void {
        this.sharedPopulateFormComponent(item);
    }

    /* Text Area */

    visitTextAreaFieldComponentDefinition(item: TextAreaFieldComponentDefinitionOutline): void {
        // Get the current raw data for constructing the class instance.
        const currentData = this.getDataPath(this.data, this.currentPath);
        if (!isTypeFieldDefinitionName<TextAreaFieldComponentDefinitionFrame>(currentData, TextAreaComponentName)) {
            return;
        }
        const config = currentData?.config;

        // Create the class instance for the config
        item.config = new TextAreaFieldComponentConfig();

        this.sharedPopulateFieldComponentConfig(item.config, config);

        this.setProp('rows', item.config, config);
        this.setProp('cols', item.config, config);
        this.setProp('placeholder', item.config, config);
    }

    visitTextAreaFieldModelDefinition(item: TextAreaFieldModelDefinitionOutline): void {
        // Get the current raw data for constructing the class instance.
        const currentData = this.getDataPath(this.data, this.currentPath);
        if (!isTypeFieldDefinitionName<TextAreaFieldModelDefinitionFrame>(currentData, TextAreaModelName)) {
            return;
        }

        // Create the class instance for the config
        item.config = new TextAreaFieldModelConfig();

        this.sharedPopulateFieldModelConfig(item.config, currentData?.config);
    }

    visitTextAreaFormComponentDefinition(item: TextAreaFormComponentDefinitionOutline): void {
        this.sharedPopulateFormComponent(item);
    }

    /* Default Layout  */

    visitDefaultFieldLayoutDefinition(item: DefaultFieldLayoutDefinitionOutline): void {
        // Get the current raw data for constructing the class instance.
        const currentData = this.getDataPath(this.data, this.currentPath);
        if (!isTypeFieldDefinitionName<DefaultFieldLayoutDefinitionFrame>(currentData, DefaultLayoutName)) {
            return;
        }

        // Create the class instance for the config
        item.config = new DefaultFieldLayoutConfig();

        this.sharedPopulateFieldLayoutConfig(item.config, currentData?.config);
    }

    /* Checkbox Input */

    visitCheckboxInputFieldComponentDefinition(item: CheckboxInputFieldComponentDefinitionOutline): void {
        // Get the current raw data for constructing the class instance.
        const currentData = this.getDataPath(this.data, this.currentPath);
        if (!isTypeFieldDefinitionName<CheckboxInputFieldComponentDefinitionFrame>(currentData, CheckboxInputComponentName)) {
            return;
        }
        const config = currentData?.config;

        // Create the class instance for the config
        item.config = new CheckboxInputFieldComponentConfig();

        this.sharedPopulateFieldComponentConfig(item.config, config);

        this.setProp('placeholder', item.config, config);
        this.setProp('options', item.config, config);
        this.setProp('multipleValues', item.config, config);
    }

    visitCheckboxInputFieldModelDefinition(item: CheckboxInputFieldModelDefinitionOutline): void {
        // Get the current raw data for constructing the class instance.
        const currentData = this.getDataPath(this.data, this.currentPath);
        if (!isTypeFieldDefinitionName<CheckboxInputFieldModelDefinitionFrame>(currentData, CheckboxInputModelName)) {
            return;
        }

        // Create the class instance for the config
        item.config = new CheckboxInputFieldModelConfig();

        this.sharedPopulateFieldModelConfig(item.config, currentData?.config);
    }

    visitCheckboxInputFormComponentDefinition(item: CheckboxInputFormComponentDefinitionOutline): void {
        this.sharedPopulateFormComponent(item);
    }

    /* Dropdown Input */

    visitDropdownInputFieldComponentDefinition(item: DropdownInputFieldComponentDefinitionOutline): void {
        // Get the current raw data for constructing the class instance.
        const currentData = this.getDataPath(this.data, this.currentPath);
        if (!isTypeFieldDefinitionName<DropdownInputFieldComponentDefinitionFrame>(currentData, DropdownInputComponentName)) {
            return;
        }
        const config = currentData?.config;

        // Create the class instance for the config
        item.config = new DropdownInputFieldComponentConfig();

        this.sharedPopulateFieldComponentConfig(item.config, config);

        this.setProp('placeholder', item.config, config);
        this.setProp('options', item.config, config);
    }

    visitDropdownInputFieldModelDefinition(item: DropdownInputFieldModelDefinitionOutline): void {
        // Get the current raw data for constructing the class instance.
        const currentData = this.getDataPath(this.data, this.currentPath);
        if (!isTypeFieldDefinitionName<DropdownInputFieldModelDefinitionFrame>(currentData, DropdownInputModelName)) {
            return;
        }

        // Create the class instance for the config
        item.config = new DropdownInputFieldModelConfig();

        this.sharedPopulateFieldModelConfig(item.config, currentData?.config);
    }

    visitDropdownInputFormComponentDefinition(item: DropdownInputFormComponentDefinitionOutline): void {
        this.sharedPopulateFormComponent(item);
    }

    /* Radio Input */

    visitRadioInputFieldComponentDefinition(item: RadioInputFieldComponentDefinitionOutline): void {
        // Get the current raw data for constructing the class instance.
        const currentData = this.getDataPath(this.data, this.currentPath);
        if (!isTypeFieldDefinitionName<RadioInputFieldComponentDefinitionFrame>(currentData, RadioInputComponentName)) {
            return;
        }
        const config = currentData?.config;

        // Create the class instance for the config
        item.config = new RadioInputFieldComponentConfig();

        this.sharedPopulateFieldComponentConfig(item.config, config);

        this.setProp('options', item.config, config);
    }

    visitRadioInputFieldModelDefinition(item: RadioInputFieldModelDefinitionOutline): void {
        // Get the current raw data for constructing the class instance.
        const currentData = this.getDataPath(this.data, this.currentPath);
        if (!isTypeFieldDefinitionName<RadioInputFieldModelDefinitionFrame>(currentData, RadioInputModelName)) {
            return;
        }

        // Create the class instance for the config
        item.config = new RadioInputFieldModelConfig();

        this.sharedPopulateFieldModelConfig(item.config, currentData?.config);
    }

    visitRadioInputFormComponentDefinition(item: RadioInputFormComponentDefinitionOutline): void {
        this.sharedPopulateFormComponent(item);
    }
    
    /* Date Input */

    visitDateInputFieldComponentDefinition(item: DateInputFieldComponentDefinitionOutline): void {
        // Get the current raw data for constructing the class instance.
        const currentData = this.getDataPath(this.data, this.currentPath);
        if (!isTypeFieldDefinitionName<DateInputFieldComponentDefinitionFrame>(currentData, DateInputComponentName)) {
            return;
        }
        const config = currentData?.config;

        // Create the class instance for the config
        item.config = new DateInputFieldComponentConfig();

        this.sharedPopulateFieldComponentConfig(item.config, config);

        this.setProp('placeholder', item.config, config);
        this.setProp('dateFormat', item.config, config);
        this.setProp('showWeekNumbers', item.config, config);
        this.setProp('containerClass', item.config, config);
        this.setProp('enableTimePicker', item.config, config);
        this.setProp('bsFullConfig', item.config, config);
    }

    visitDateInputFieldModelDefinition(item: DateInputFieldModelDefinitionOutline): void {
        // Get the current raw data for constructing the class instance.
        const currentData = this.getDataPath(this.data, this.currentPath);
        if (!isTypeFieldDefinitionName<DateInputFieldModelDefinitionFrame>(currentData, DateInputModelName)) {
            return;
        }

        // Create the class instance for the config
        item.config = new DateInputFieldModelConfig();

        this.sharedPopulateFieldModelConfig(item.config, currentData?.config);
    }

    visitDateInputFormComponentDefinition(item: DateInputFormComponentDefinitionOutline): void {
        this.sharedPopulateFormComponent(item);
    }

    /* Shared */

    protected sharedConstructFormComponent(item: FormComponentDefinitionFrame) {
        // The class to use is identified by the class property string values in the field definitions.
        const componentClassString = item?.component?.class;

        // The class to use is identified by the class property string values in the field definitions.
        // The form component is identifier the component field class string
        const formComponentClass = this.formComponentMap?.get(componentClassString);

        // Create new instance
        if (!formComponentClass) {
            throw new Error(`Could not find class for form component class name '${componentClassString}' at path '${this.currentPath}'.`)
        }
        const formComponent = new formComponentClass(item);
        return formComponent;
    }

    protected sharedPopulateFormComponent(item: FormComponentDefinitionOutline): void {
        // Get the current raw data for constructing the class instance.
        const currentData = this.getDataPath(this.data, this.currentPath);
        if (!isTypeFormComponentDefinition(currentData)) {
            throw new Error(`Invalid FormComponentDefinition at '${this.currentPath}': ${JSON.stringify(currentData)}`);
        }

        // Set the simple properties
        item.name = currentData.name;
        item.module = currentData.module;

        // Set the constraints
        item.constraints = new FormConstraintConfig();
        item.constraints.allowModes = currentData?.constraints?.allowModes ?? [];

        item.constraints.authorization = new FormConstraintAuthorizationConfig();
        item.constraints.authorization.allowRoles = currentData?.constraints?.authorization?.allowRoles ?? [];

        // Set the expressions
        item.expressions = new FormExpressionsConfig();
        for (const [key, value] of Object.entries(currentData.expressions ?? {})) {
            item.expressions[key] = value;
        }

        // Get the class string names.
        const componentClassString = currentData?.component?.class;
        const modelClassString = currentData?.model?.class;
        const layoutClassString = currentData?.layout?.class;

        // Get the classes
        const componentClass = this.fieldComponentMap?.get(componentClassString);
        const modelClass = modelClassString ? this.fieldModelMap?.get(modelClassString) : null;
        const layoutClass = layoutClassString ? this.fieldLayoutMap?.get(layoutClassString) : null;

        // Create new instances
        if (!componentClass) {
            throw new Error(`Could not find class for field component class string '${componentClassString}'.`)
        }
        const component = new componentClass();
        const model = modelClass ? new modelClass() : null;
        const layout = layoutClass ? new layoutClass() : null;

        // Set the instances
        item.component = component;
        item.model = model || undefined;
        item.layout = layout || undefined;

        // Continue visiting
        this.acceptFormComponentDefinition(item);
    }
}
