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
import {
    isTypeFieldDefinitionName,
    isTypeFormComponentDefinition, isTypeFormComponentDefinitionName,
    isTypeFormConfig,
} from "../helpers";
import {AvailableFormComponentDefinitionFrames, ReusableFormDefinitions} from "../dictionary.outline";
import {FormModesConfig} from "../shared.outline";
import {ReusableComponentName, ReusableFormComponentDefinitionFrame} from "../component/reusable.outline";
import {ILogger} from "@researchdatabox/redbox-core-types";
import {ConstructOverrides} from "./construct.overrides";


/**
 * Visit each form config frame and create an instance of the associated class.
 * Populate the form config hierarchy with the class instances.
 */
export class ConstructFormConfigVisitor extends CurrentPathFormConfigVisitor {
    protected override logName = "ConstructFormConfigVisitor";
    private result?: FormConfigOutline;
    private data?: FormConfigFrame;
    private formMode: FormModesConfig = "view";
    private reusableFormConfig: ReusableFormDefinitions = {};
    private reusableFormConfigNames: string[] = [];

    private fieldComponentMap?: ComponentClassDefMapType;
    private fieldModelMap?: ModelClassDefMapType;
    private fieldLayoutMap?: LayoutClassDefMapType;
    private formComponentMap?: FormComponentClassDefMapType;

    private constructOverrides: ConstructOverrides;

    constructor(logger: ILogger) {
        super(logger);
        this.fieldComponentMap = FieldComponentDefinitionMap;
        this.fieldModelMap = FieldModelDefinitionMap;
        this.fieldLayoutMap = FieldLayoutDefinitionMap;
        this.formComponentMap = FormComponentDefinitionMap;

        this.constructOverrides = new ConstructOverrides();
    }

    start(data: FormConfigFrame, reusableFormConfig?: ReusableFormDefinitions, formMode?: FormModesConfig): FormConfigOutline {
        this.reusableFormConfig = reusableFormConfig ?? {};
        this.reusableFormConfigNames = Object.keys(this.reusableFormConfig).sort();
        this.formMode = formMode ?? "view";
        this.result = new FormConfig();
        this.data = _cloneDeep(data);
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
        this.sharedProps.setPropOverride('name', item, currentData);
        this.sharedProps.setPropOverride('type', item, currentData);
        this.sharedProps.setPropOverride('domElementType', item, currentData);
        this.sharedProps.setPropOverride('domId', item, currentData);
        this.sharedProps.setPropOverride('viewCssClasses', item, currentData);
        this.sharedProps.setPropOverride('editCssClasses', item, currentData);
        this.sharedProps.setPropOverride('defaultComponentConfig', item, currentData);
        this.sharedProps.setPropOverride('skipValidationOnSave', item, currentData);
        this.sharedProps.setPropOverride('validators', item, currentData);
        this.sharedProps.setPropOverride('defaultLayoutComponent', item, currentData);
        this.sharedProps.setPropOverride('debugValue', item, currentData);

        currentData.componentDefinitions = this.applyOverrides(currentData?.componentDefinitions ?? []);

        // Visit the components
        currentData?.componentDefinitions.forEach((componentDefinition, index) => {
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

        this.sharedProps.sharedPopulateFieldComponentConfig(item.config, config);

        this.sharedProps.setPropOverride('type', item.config, config);
    }

    visitSimpleInputFieldModelDefinition(item: SimpleInputFieldModelDefinitionOutline): void {
        // Get the current raw data for constructing the class instance.
        const currentData = this.getDataPath(this.data, this.currentPath);
        if (!isTypeFieldDefinitionName<SimpleInputFieldModelDefinitionFrame>(currentData, SimpleInputModelName)) {
            return;
        }

        // Create the class instance for the config
        item.config = new SimpleInputFieldModelConfig();

        this.sharedProps.sharedPopulateFieldModelConfig(item.config, currentData?.config);
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

        this.sharedProps.sharedPopulateFieldComponentConfig(item.config, config);

        this.sharedProps.setPropOverride('content', item.config, config);
        this.sharedProps.setPropOverride('template', item.config, config);
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
        const frame = currentData?.config;

        // Create the class instance for the config
        item.config = new RepeatableFieldComponentConfig();

        this.sharedProps.sharedPopulateFieldComponentConfig(item.config, frame);

        if (!isTypeFormComponentDefinition(frame?.elementTemplate)) {
            throw new Error(`Invalid elementTemplate for repeatable at '${this.currentPath}'.`);
        }

        const compDefs = this.applyOverrides([frame?.elementTemplate]);
        const compDefLength = compDefs?.length ?? 0;
        if (compDefLength !== 1) {
            throw new Error(`Repeatable element template overrides must result in exactly one item, got ${compDefLength}.`);
        }
        frame.elementTemplate = compDefs[0];

        const formComponent = this.sharedConstructFormComponent(frame.elementTemplate);

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

        this.sharedProps.sharedPopulateFieldModelConfig(item.config, currentData?.config);
    }

    visitRepeatableElementFieldLayoutDefinition(item: RepeatableElementFieldLayoutDefinitionOutline): void {
        // Get the current raw data for constructing the class instance.
        const currentData = this.getDataPath(this.data, this.currentPath);
        if (!isTypeFieldDefinitionName<RepeatableElementFieldLayoutDefinitionFrame>(currentData, RepeatableElementLayoutName)) {
            return;
        }

        // Create the class instance for the config
        item.config = new RepeatableElementFieldLayoutConfig();

        this.sharedProps.sharedPopulateFieldLayoutConfig(item.config, currentData?.config);

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

        this.sharedProps.sharedPopulateFieldComponentConfig(item.config, config);
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
        const frame = currentData?.config ?? {componentDefinitions: []};

        // Create the class instance for the config
        item.config = new GroupFieldComponentConfig();

        this.sharedProps.sharedPopulateFieldComponentConfig(item.config, frame);

        frame.componentDefinitions = this.applyOverrides(frame?.componentDefinitions ?? []);

        // Visit the components
        frame.componentDefinitions.forEach((componentDefinition, index) => {
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

        this.sharedProps.sharedPopulateFieldModelConfig(item.config, currentData?.config);
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
        const frame = currentData?.config ?? {tabs: []};

        // Create the class instance for the config
        item.config = new TabFieldComponentConfig();

        this.sharedProps.sharedPopulateFieldComponentConfig(item.config, frame);

        const compDefs = this.applyOverrides(frame?.tabs ?? []);
        const tabs: TabContentFormComponentDefinitionFrame[] = [];
        for (const compDef of compDefs) {
            if (isTypeFormComponentDefinitionName<TabContentFormComponentDefinitionFrame>(compDef, TabContentComponentName)) {
                tabs.push(compDef);
            }
        }
        frame.tabs = tabs;

        // Visit the components
        frame?.tabs.forEach((componentDefinition, index) => {

            if (isTypeFormComponentDefinitionName<TabContentFormComponentDefinitionFrame>(componentDefinition, TabContentComponentName)) {
                // TODO: Use type assert for now.
                //  The Map<string,T> type in dictionary.model.ts should map specific string -> specific type.
                //  It currently maps string -> type union, which is too loose, as it doesn't imply that a particular string key maps to one type.
                const formComponent = this.sharedConstructFormComponent(componentDefinition) as TabContentFormComponentDefinition;

                // Store the instances on the item
                item.config?.tabs.push(formComponent);

                // Continue the construction
                this.acceptCurrentPath(formComponent, ["config", "tabs", index.toString()]);
            }
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

        this.sharedProps.sharedPopulateFieldLayoutConfig(item.config, config);

        this.sharedProps.setPropOverride('buttonSectionCssClass', item.config, config);
        this.sharedProps.setPropOverride('tabPaneCssClass', item.config, config);
        this.sharedProps.setPropOverride('tabPaneActiveCssClass', item.config, config);
        this.sharedProps.setPropOverride('buttonSectionAriaOrientation', item.config, config);
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
        const config = currentData?.config ?? {componentDefinitions: []};

        // Create the class instance for the config
        item.config = new TabContentFieldComponentConfig();

        this.sharedProps.sharedPopulateFieldComponentConfig(item.config, config);

        this.sharedProps.setPropOverride('selected', item.config, config);

        config.componentDefinitions = this.applyOverrides(config?.componentDefinitions ?? []);

        // Visit the components
        config?.componentDefinitions.forEach((componentDefinition, index) => {
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

        this.sharedProps.sharedPopulateFieldLayoutConfig(item.config, config);

        this.sharedProps.setPropOverride('buttonLabel', item.config, config);
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

        this.sharedProps.sharedPopulateFieldComponentConfig(item.config, config);

        this.sharedProps.setPropOverride('targetStep', item.config, config);
        this.sharedProps.setPropOverride('forceSave', item.config, config);
        this.sharedProps.setPropOverride('skipValidation', item.config, config);
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

        this.sharedProps.sharedPopulateFieldComponentConfig(item.config, config);

        this.sharedProps.setPropOverride('rows', item.config, config);
        this.sharedProps.setPropOverride('cols', item.config, config);
        this.sharedProps.setPropOverride('placeholder', item.config, config);
    }

    visitTextAreaFieldModelDefinition(item: TextAreaFieldModelDefinitionOutline): void {
        // Get the current raw data for constructing the class instance.
        const currentData = this.getDataPath(this.data, this.currentPath);
        if (!isTypeFieldDefinitionName<TextAreaFieldModelDefinitionFrame>(currentData, TextAreaModelName)) {
            return;
        }

        // Create the class instance for the config
        item.config = new TextAreaFieldModelConfig();

        this.sharedProps.sharedPopulateFieldModelConfig(item.config, currentData?.config);
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

        this.sharedProps.sharedPopulateFieldLayoutConfig(item.config, currentData?.config);
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

        this.sharedProps.sharedPopulateFieldComponentConfig(item.config, config);

        this.sharedProps.setPropOverride('placeholder', item.config, config);
        this.sharedProps.setPropOverride('options', item.config, config);
        this.sharedProps.setPropOverride('multipleValues', item.config, config);
    }

    visitCheckboxInputFieldModelDefinition(item: CheckboxInputFieldModelDefinitionOutline): void {
        // Get the current raw data for constructing the class instance.
        const currentData = this.getDataPath(this.data, this.currentPath);
        if (!isTypeFieldDefinitionName<CheckboxInputFieldModelDefinitionFrame>(currentData, CheckboxInputModelName)) {
            return;
        }

        // Create the class instance for the config
        item.config = new CheckboxInputFieldModelConfig();

        this.sharedProps.sharedPopulateFieldModelConfig(item.config, currentData?.config);
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

        this.sharedProps.sharedPopulateFieldComponentConfig(item.config, config);

        this.sharedProps.setPropOverride('placeholder', item.config, config);
        this.sharedProps.setPropOverride('options', item.config, config);
    }

    visitDropdownInputFieldModelDefinition(item: DropdownInputFieldModelDefinitionOutline): void {
        // Get the current raw data for constructing the class instance.
        const currentData = this.getDataPath(this.data, this.currentPath);
        if (!isTypeFieldDefinitionName<DropdownInputFieldModelDefinitionFrame>(currentData, DropdownInputModelName)) {
            return;
        }

        // Create the class instance for the config
        item.config = new DropdownInputFieldModelConfig();

        this.sharedProps.sharedPopulateFieldModelConfig(item.config, currentData?.config);
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

        this.sharedProps.sharedPopulateFieldComponentConfig(item.config, config);

        this.sharedProps.setPropOverride('options', item.config, config);
    }

    visitRadioInputFieldModelDefinition(item: RadioInputFieldModelDefinitionOutline): void {
        // Get the current raw data for constructing the class instance.
        const currentData = this.getDataPath(this.data, this.currentPath);
        if (!isTypeFieldDefinitionName<RadioInputFieldModelDefinitionFrame>(currentData, RadioInputModelName)) {
            return;
        }

        // Create the class instance for the config
        item.config = new RadioInputFieldModelConfig();

        this.sharedProps.sharedPopulateFieldModelConfig(item.config, currentData?.config);
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

        this.sharedProps.sharedPopulateFieldComponentConfig(item.config, config);

        this.sharedProps.setPropOverride('placeholder', item.config, config);
        this.sharedProps.setPropOverride('dateFormat', item.config, config);
        this.sharedProps.setPropOverride('showWeekNumbers', item.config, config);
        this.sharedProps.setPropOverride('containerClass', item.config, config);
        this.sharedProps.setPropOverride('enableTimePicker', item.config, config);
        this.sharedProps.setPropOverride('bsFullConfig', item.config, config);
    }

    visitDateInputFieldModelDefinition(item: DateInputFieldModelDefinitionOutline): void {
        // Get the current raw data for constructing the class instance.
        const currentData = this.getDataPath(this.data, this.currentPath);
        if (!isTypeFieldDefinitionName<DateInputFieldModelDefinitionFrame>(currentData, DateInputModelName)) {
            return;
        }

        // Create the class instance for the config
        item.config = new DateInputFieldModelConfig();

        this.sharedProps.sharedPopulateFieldModelConfig(item.config, currentData?.config);
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
        return new formComponentClass();
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

    protected applyOverrides(items: AvailableFormComponentDefinitionFrames[]): AvailableFormComponentDefinitionFrames[] {
        // NOTE: The order the overrides are actioned matters - different orders will produce different results.

        // Replace the 'ReusableComponent' with the definitions from the 'reusableFormName'.
        // This must be done first, as the other overrides don't make sense without this step.
        const itemsReusableExpanded = this.applyOverrideReusable(items);

        // Apply the rest of the overrides.
        return itemsReusableExpanded.map(item => {
            // Update the class names using 'formModeClasses' and the default transforms.
            const itemTransformed = this.constructOverrides.transform(item, this.formMode);

            // Use 'replaceName' to update the form component name.
            if (itemTransformed.overrides?.replaceName) {
                // for debugging:
                // this.logger.debug(`Name changed from '${item.name}' to '${item.overrides?.replaceName}'.`);

                itemTransformed.name = itemTransformed.overrides?.replaceName;
            }

            // Remove the 'overrides' property, as it has been applied and so should not be present in the form config.
            if ('overrides' in itemTransformed) {
                delete itemTransformed['overrides'];
            }

            return itemTransformed;
        });
    }

    protected applyOverrideReusable(items: AvailableFormComponentDefinitionFrames[]): AvailableFormComponentDefinitionFrames[] {
        // Expanding the reusable form name to the associated form config requires replacing the item in the array.
        // Changing the array that's currently being iterated can result in unstable or undefined behaviour.
        // Instead, find the index of the first item that is a reusable component.
        const index = items.findIndex((item) => this.isReusableComponent(item));

        // When there are no more items to expand, return the updated items array.
        if (index === -1) {
            return items;
        }

        // Update the items array to remove the reusable component and replace it with the form config it represents.
        const item = items[index];
        if (this.isReusableComponent(item)) {
            const expandedItems = this.applyOverrideReusableExpand(item);

            // for debugging
            // this.logger.debug(`Expanded '${item.overrides?.reusableFormName}' to ${expandedItems.length} ` +
            //     `items ${expandedItems.map(i => `'${i.name}:${i.component.class}'`).join(', ')}`);

            const newItems = [...items];
            newItems.splice(index, 1, ...expandedItems);
            items = newItems;
        } else {
            throw new Error(`Somehow the isReusableComponent was true earlier, but is now false, for the same item. Logic error?`);
        }

        // Continue until there are no more reusable components to expand.
        return this.applyOverrideReusable(items);
    }

    protected isReusableComponent(item: AvailableFormComponentDefinitionFrames): item is ReusableFormComponentDefinitionFrame {
        const componentClassName = item?.component?.class ?? "";
        const itemReusableFormName = item?.overrides?.reusableFormName ?? "";

        const isReusableComponent = componentClassName === ReusableComponentName;
        const hasReusableFormName = itemReusableFormName && this.reusableFormConfigNames.includes(itemReusableFormName);

        if (!isReusableComponent && !hasReusableFormName) {
            return false;
        }

        if (hasReusableFormName && isTypeFormComponentDefinitionName<ReusableFormComponentDefinitionFrame>(item, ReusableComponentName)) {
            const overrides = item?.overrides ?? {};
            const overrideKeys = Object.keys(overrides);
            const reusableFormNameOnly = overrideKeys.includes('reusableFormName') && overrideKeys.length === 1;
            const noKeys = overrideKeys.length === 0;
            if (!reusableFormNameOnly && !noKeys) {
                throw new Error("Invalid usage of reusable form config. " +
                    `Override for component name '${item.name}' class '${item.component.class}' must contain only 'reusableFormName', ` +
                    `it cannot be combined with other properties '${JSON.stringify(overrides)}'.`);
            }
            return true;
        }

        throw new Error("Invalid usage of reusable form config. " +
            `Component class '${componentClassName}' must be '${ReusableComponentName}' ` +
            `and reusableFormName '${itemReusableFormName}' must be one of '${this.reusableFormConfigNames.join(', ')}'.`);
    }

    protected applyOverrideReusableExpand(item: ReusableFormComponentDefinitionFrame): AvailableFormComponentDefinitionFrames[] {
        const reusableFormName = item?.overrides?.reusableFormName ?? "";
        const expandedItemsRaw = this.reusableFormConfigNames.includes(reusableFormName) ? this.reusableFormConfig[reusableFormName] : [];
        const expandedItems = this.applyOverrideReusable(expandedItemsRaw);
        const additionalItemsRaw = item.component.config?.componentDefinitions ?? [];
        const additionalItems = this.applyOverrideReusable(additionalItemsRaw);

        const expandedItemNames = expandedItems.map(i => i.name);
        const extraAdditionalItems = additionalItems.filter((i) => !expandedItemNames.includes(i.name));
        if (extraAdditionalItems.length > 0) {
            throw new Error("Invalid usage of reusable form config. " +
                `Each item in the ${ReusableComponentName} componentDefinitions must have a name that matches an item in the reusable form config '${reusableFormName}'. ` +
                `Names '${extraAdditionalItems.map(i => i.name)}' did not match any reusable form config items. ` +
                `Available names are '${expandedItems.map((i) => i.name).sort().join(', ')}'.`);
        }

        const result = [];
        for (const expandedItem of expandedItems) {
            const additionalItemsMatched = additionalItems.filter((additionalItem) => expandedItem.name === additionalItem.name);
            if (additionalItemsMatched.length > 1) {
                throw new Error("Invalid usage of reusable form config. " +
                    `Each item in the ${ReusableComponentName} componentDefinitions must have a unique name. ` +
                    `These names were not unique '${Array.from(new Set(additionalItemsMatched.map(i => i.name))).sort().join(', ')}'.`);
            }

            if (additionalItemsMatched.length === 1) {
                const additionalItem = additionalItemsMatched[0];
                const known = {
                    component: {reusable: expandedItem.component.class, additional: additionalItem.component.class},
                    model: {reusable: expandedItem.model?.class, additional: additionalItem.model?.class},
                    layout: {reusable: expandedItem.layout?.class, additional: additionalItem.layout?.class},
                };
                for (const [key, values] of Object.entries(known)) {
                    const reusableValue = values['reusable'];
                    const additionalValue = values['additional'];
                    if (reusableValue && additionalValue && reusableValue !== additionalValue) {
                        throw new Error(
                            "Invalid usage of reusable form config. The class must match the reusable form config. " +
                            "To change the class, use 'formModeClasses'. " +
                            `The ${key} class in reusable form config '${reusableFormName}' item '${expandedItem.name}' ` +
                            `is '${reusableValue}' given class was '${additionalValue}'.`);
                    }
                }
            }

            const newItem = _mergeWith({}, expandedItem, additionalItemsMatched.length === 1 ? additionalItemsMatched[0] : {});
            result.push(newItem);
        }
        return result;
    }
}
