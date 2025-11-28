import {cloneDeep as _cloneDeep, get as _get, mergeWith as _mergeWith, set as _set} from "lodash";
import {FormConfig} from "../form-config.model";

import {FormConfigVisitor} from "./base.model";
import {FormConfigFrame, FormConfigOutline} from "../form-config.outline";
import {
    GroupFieldComponentDefinitionFrame,
    GroupFieldComponentDefinitionOutline,
    GroupFieldComponentName,
    GroupFieldModelDefinitionFrame,
    GroupFieldModelDefinitionOutline,
    GroupFieldModelName,
    GroupFormComponentDefinitionOutline
} from "../component/group.outline";
import {
    RepeatableComponentName,
    RepeatableElementFieldLayoutDefinitionFrame,
    RepeatableElementFieldLayoutDefinitionOutline,
    RepeatableElementLayoutName,
    RepeatableFieldComponentDefinitionFrame,
    RepeatableFieldComponentDefinitionOutline,
    RepeatableFieldModelDefinitionFrame,
    RepeatableFieldModelDefinitionOutline,
    RepeatableFormComponentDefinitionOutline,
    RepeatableModelName
} from "../component/repeatable.outline";
import {
    RepeatableElementFieldLayoutConfig,
    RepeatableFieldComponentConfig,
    RepeatableFieldModelConfig
} from "../component/repeatable.model";
import {GroupFieldComponentConfig, GroupFieldModelConfig} from "../component/group.model";
import {
    SimpleInputComponentName,
    SimpleInputFieldComponentDefinitionFrame,
    SimpleInputFieldComponentDefinitionOutline,
    SimpleInputFieldModelDefinitionFrame,
    SimpleInputFieldModelDefinitionOutline,
    SimpleInputFormComponentDefinitionOutline,
    SimpleInputModelName
} from "../component/simple-input.outline";
import {SimpleInputFieldComponentConfig, SimpleInputFieldModelConfig} from "../component/simple-input.model";
import {
    DefaultFieldLayoutDefinitionFrame,
    DefaultFieldLayoutDefinitionOutline,
    DefaultLayoutName
} from "../component/default-layout.outline";
import {DefaultFieldLayoutConfig} from "../component/default-layout.model";
import {FormComponentDefinitionFrame, FormComponentDefinitionOutline} from "../form-component.outline";
import {
    ContentComponentName,
    ContentFieldComponentDefinitionFrame,
    ContentFieldComponentDefinitionOutline,
    ContentFormComponentDefinitionOutline
} from "../component/content.outline";
import {
    TabComponentName,
    TabFieldComponentDefinitionFrame,
    TabFieldComponentDefinitionOutline,
    TabFieldLayoutDefinitionFrame,
    TabFieldLayoutDefinitionOutline,
    TabFormComponentDefinitionOutline,
    TabLayoutName
} from "../component/tab.outline";
import {TabFieldComponentConfig, TabFieldLayoutConfig} from "../component/tab.model";
import {
    TabContentComponentName,
    TabContentFieldComponentDefinitionFrame,
    TabContentFieldComponentDefinitionOutline,
    TabContentFieldLayoutDefinitionFrame,
    TabContentFieldLayoutDefinitionOutline,
    TabContentFormComponentDefinitionFrame,
    TabContentFormComponentDefinitionOutline,
    TabContentLayoutName
} from "../component/tab-content.outline";
import {
    TabContentFieldComponentConfig,
    TabContentFieldLayoutConfig,
    TabContentFormComponentDefinition
} from "../component/tab-content.model";
import {
    TextAreaComponentName,
    TextAreaFieldComponentDefinitionFrame,
    TextAreaFieldComponentDefinitionOutline,
    TextAreaFieldModelDefinitionFrame,
    TextAreaFieldModelDefinitionOutline,
    TextAreaFormComponentDefinitionOutline,
    TextAreaModelName
} from "../component/text-area.outline";
import {TextAreaFieldComponentConfig, TextAreaFieldModelConfig} from "../component/text-area.model";
import {ContentFieldComponentConfig} from "../component/content.model";
import {
    DropdownInputComponentName,
    DropdownInputFieldComponentDefinitionFrame,
    DropdownInputFieldComponentDefinitionOutline,
    DropdownInputFieldModelDefinitionFrame,
    DropdownInputFieldModelDefinitionOutline,
    DropdownInputFormComponentDefinitionOutline,
    DropdownInputModelName
} from "../component/dropdown-input.outline";
import {DropdownInputFieldComponentConfig, DropdownInputFieldModelConfig} from "../component/dropdown-input.model";
import {
    CheckboxInputComponentName,
    CheckboxInputFieldComponentDefinitionFrame,
    CheckboxInputFieldComponentDefinitionOutline,
    CheckboxInputFieldModelDefinitionFrame,
    CheckboxInputFieldModelDefinitionOutline,
    CheckboxInputFormComponentDefinitionOutline,
    CheckboxInputModelName
} from "../component/checkbox-input.outline";
import {CheckboxInputFieldComponentConfig, CheckboxInputFieldModelConfig} from "../component/checkbox-input.model";
import {
    RadioInputComponentName,
    RadioInputFieldComponentDefinitionFrame,
    RadioInputFieldComponentDefinitionOutline,
    RadioInputFieldModelDefinitionFrame,
    RadioInputFieldModelDefinitionOutline,
    RadioInputFormComponentDefinitionOutline,
    RadioInputModelName
} from "../component/radio-input.outline";
import {RadioInputFieldComponentConfig, RadioInputFieldModelConfig} from "../component/radio-input.model";
import {
    DateInputComponentName,
    DateInputFieldComponentDefinitionFrame,
    DateInputFieldComponentDefinitionOutline,
    DateInputFieldModelDefinitionFrame,
    DateInputFieldModelDefinitionOutline,
    DateInputFormComponentDefinitionOutline,
    DateInputModelName
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
    isTypeFormComponentDefinition,
    isTypeFormComponentDefinitionName,
    isTypeFormConfig,
} from "../form-types.outline";
import {ReusableFormDefinitions} from "../dictionary.outline";
import {ILogger} from "@researchdatabox/redbox-core-types";
import {FormModesConfig} from "../shared.outline";
import {FieldModelDefinitionOutline} from "../field-model.outline";
import {FormOverride} from "../form-override.model";
import {FormConfigPathHelper, PropertiesHelper} from "./common.model";


/**
 * Visit each form config frame and create an instance of the associated class.
 *
 * This visitor performs the tasks needed to create a form component class instances:
 * - populate the instance properties from the form config data
 * - assign the created classes to the expected property to build the component hierarchy
 * - populate the model.config.value and/or the properties specific to a component from either a record or the form defaults
 * - when using form defaults, provide default values from ancestors to descendants, so the descendants can either use their default or an ancestors default
 * - expand reusable form config to the actual form config
 * - transform component definitions to be a different component(s)
 */
export class ConstructFormConfigVisitor extends FormConfigVisitor {
    protected override logName = "ConstructFormConfigVisitor";

    private formMode: FormModesConfig;
    private recordValues: Record<string, unknown> | null;
    private extractedDefaultValues: Record<string, unknown>;

    private dataModelPath: string[];

    private isRepeatableElementTemplate: boolean = false;

    private data: FormConfigFrame;

    private reusableFormDefs: ReusableFormDefinitions;

    private formConfig: FormConfigOutline;

    private formOverride: FormOverride;
    private formConfigPathHelper: FormConfigPathHelper;
    private sharedProps: PropertiesHelper;

    constructor(logger: ILogger) {
        super(logger);

        this.formMode = "view";
        this.recordValues = null;
        this.extractedDefaultValues = {};

        this.dataModelPath = [];

        this.isRepeatableElementTemplate = false;

        this.data = {name: "", componentDefinitions: []};

        this.reusableFormDefs = {};

        this.formConfig = new FormConfig();

        this.formOverride = new FormOverride(this.logger);
        this.formConfigPathHelper = new FormConfigPathHelper(logger, this);
        this.sharedProps = new PropertiesHelper();
    }

    /**
     * Start the visitor.
     * @param options Configure the visitor.
     * @param options.data The form config to construct into class instances.
     * @param options.reusableFormDefs The reusable form definitions. Default empty.
     * @param options.formMode The currently active form mode. Defaults to 'view'.
     * @param options.record The record values. Don't set (undefined) or set to null to use the form default values.
     */
    start(options: {
              data: FormConfigFrame;
              reusableFormDefs?: ReusableFormDefinitions;
              formMode?: FormModesConfig;
              record?: Record<string, unknown> | null;
          }
    ): FormConfigOutline {
        this.data = _cloneDeep(options.data);
        this.reusableFormDefs = options.reusableFormDefs ?? {};
        this.formMode = options.formMode ?? "view";

        // When options.record is null or undefined, use the form defaults. Otherwise, use recordValues only.
        this.recordValues = (options.record === null || options.record === undefined) ? null : options.record;

        // Collect the form config defaults.
        // The defaults always need to be extract so they are available to any repeatable components.
        this.extractedDefaultValues = {};

        this.dataModelPath = [];

        this.isRepeatableElementTemplate = false;

        this.formConfigPathHelper.reset();

        this.formConfig = new FormConfig();
        this.formConfig.accept(this);
        return this.formConfig;
    }

    /* Form Config */

    visitFormConfig(item: FormConfigOutline): void {
        const currentData = this.getData();
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
        this.sharedProps.setPropOverride('enabledValidationGroups', item, currentData);
        this.sharedProps.setPropOverride('validators', item, currentData);
        this.sharedProps.setPropOverride('validationGroups', item, currentData);
        this.sharedProps.setPropOverride('defaultLayoutComponent', item, currentData);
        this.sharedProps.setPropOverride('debugValue', item, currentData);

        // Ensure the default validation groups are present.
        if (!item.validationGroups) {
            item.validationGroups = {};
        }
        if (!Object.hasOwn(item.validationGroups, "all")) {
            item.validationGroups['all'] = {
                description: "Validate all fields with validators.",
                initialMembership: "all"
            };
        }
        if (!Object.hasOwn(item.validationGroups, "none")) {
            item.validationGroups['none'] = {
                description: "Validate none of the fields.",
                initialMembership: "none",
            };
        }

        currentData.componentDefinitions = this.formOverride.applyOverridesReusable(currentData?.componentDefinitions ?? [], this.reusableFormDefs);

        // Visit the components
        currentData.componentDefinitions.forEach((componentDefinition, index) => {
            const formComponent = this.constructFormComponent(componentDefinition);

            // Continue the construction
            this.formConfigPathHelper.acceptFormConfigPath(formComponent, ["componentDefinitions", index.toString()]);

            // After the construction is done, apply any transforms
            const itemTransformed = this.formOverride.applyOverrideTransform(formComponent, this.formMode);

            // Store the instance on the item
            item.componentDefinitions.push(itemTransformed);
        });
    }

    /* SimpleInput */

    visitSimpleInputFieldComponentDefinition(item: SimpleInputFieldComponentDefinitionOutline): void {
        // Get the current raw data for constructing the class instance.
        const currentData = this.getData();
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
        const currentData = this.getData();
        if (!isTypeFieldDefinitionName<SimpleInputFieldModelDefinitionFrame>(currentData, SimpleInputModelName)) {
            return;
        }

        // Create the class instance for the config
        item.config = new SimpleInputFieldModelConfig();

        this.sharedProps.sharedPopulateFieldModelConfig(item.config, currentData?.config);

        this.setModelValue(item);
    }

    visitSimpleInputFormComponentDefinition(item: SimpleInputFormComponentDefinitionOutline): void {
        this.populateFormComponent(item);
    }

    /* Content */

    visitContentFieldComponentDefinition(item: ContentFieldComponentDefinitionOutline): void {
        // Get the current raw data for constructing the class instance.
        const currentData = this.getData();
        if (!isTypeFieldDefinitionName<ContentFieldComponentDefinitionFrame>(currentData, ContentComponentName)) {
            return;
        }
        const config = currentData?.config;

        // Create the class instance for the config
        item.config = new ContentFieldComponentConfig();

        this.sharedProps.sharedPopulateFieldComponentConfig(item.config, config);

        const configContent = {content: this.currentModelValue() ?? config?.content};
        // this.logger.info(`visitContentFieldComponentDefinition ${JSON.stringify({content: this.currentModelValue(), config})}`);

        this.sharedProps.setPropOverride('content', item.config, configContent);
        this.sharedProps.setPropOverride('template', item.config, config);
    }

    visitContentFormComponentDefinition(item: ContentFormComponentDefinitionOutline): void {
        const requireModel = false;
        this.populateFormComponent(item, requireModel);
    }

    /* Repeatable  */

    /*
     * The repeatable model and repeatable elementTemplate are special. Some notes:
     *
     * - The repeatable model.config.defaultValue is the default for the whole repeatable.
     *
     * - The elementTemplate model.config.defaultValue is the default for *new* entries, not the value for existing entries.
     *   This means the elementTemplate defaultValue is always used to build the elementTemplate.model.config.value, not the record.
     *   So, the default values need to be collected whether there is a record or not,
     *   as the default values need to be available to be able to create new repeatable entries.
     *
     * - The repeatable elementTemplate must not have a name.
     *   The name property needs to be present, but it must be a falsy value.
     *   This is because it is a template, and the name is generated based on the repeatable's name.
     *
     * - There is a dedicated private property 'isRepeatableElementTemplate: boolean' to indicate the current form component is a repeatable element template.
     *   This is needed to make it possible to construct the templates differently.
     */

    visitRepeatableFieldComponentDefinition(item: RepeatableFieldComponentDefinitionOutline): void {
        // Get the current raw data for constructing the class instance.
        const currentData = this.getData();
        if (!isTypeFieldDefinitionName<RepeatableFieldComponentDefinitionFrame>(currentData, RepeatableComponentName)) {
            return;
        }
        const frame = currentData?.config;

        // Create the class instance for the config
        item.config = new RepeatableFieldComponentConfig();

        this.sharedProps.sharedPopulateFieldComponentConfig(item.config, frame);

        if (!isTypeFormComponentDefinition(frame?.elementTemplate)) {
            throw new Error(`Invalid elementTemplate for repeatable at '${this.formConfigPathHelper.formConfigPath}'.`);
        }

        const compDefs = this.formOverride.applyOverridesReusable([frame?.elementTemplate], this.reusableFormDefs);
        const compDefLength = compDefs?.length ?? 0;
        if (compDefLength !== 1) {
            throw new Error(`Repeatable element template overrides must result in exactly one item, got ${compDefLength}.`);
        }
        frame.elementTemplate = compDefs[0];

        if (!!frame.elementTemplate?.name) {
            throw new Error(`Repeatable element template must have a 'falsy' name, got '${frame.elementTemplate?.name}'.`);
        }

        this.isRepeatableElementTemplate = true;

        const formComponent = this.constructFormComponent(frame.elementTemplate);

        // Continue the construction
        this.formConfigPathHelper.acceptFormConfigPath(formComponent, ["config", "elementTemplate"]);

        // After the construction is done, apply any transforms
        const itemTransformed = this.formOverride.applyOverrideTransform(formComponent, this.formMode);

        // Store the instance on the item
        item.config.elementTemplate = itemTransformed;

        this.isRepeatableElementTemplate = false;
    }

    visitRepeatableFieldModelDefinition(item: RepeatableFieldModelDefinitionOutline): void {
        // Get the current raw data for constructing the class instance.
        const currentData = this.getData();
        if (!isTypeFieldDefinitionName<RepeatableFieldModelDefinitionFrame>(currentData, RepeatableModelName)) {
            return;
        }

        // Create the class instance for the config
        item.config = new RepeatableFieldModelConfig();

        this.sharedProps.sharedPopulateFieldModelConfig(item.config, currentData?.config);

        this.setModelValue(item);
    }

    visitRepeatableElementFieldLayoutDefinition(item: RepeatableElementFieldLayoutDefinitionOutline): void {
        // Get the current raw data for constructing the class instance.
        const currentData = this.getData();
        if (!isTypeFieldDefinitionName<RepeatableElementFieldLayoutDefinitionFrame>(currentData, RepeatableElementLayoutName)) {
            return;
        }

        // Create the class instance for the config
        item.config = new RepeatableElementFieldLayoutConfig();

        this.sharedProps.sharedPopulateFieldLayoutConfig(item.config, currentData?.config);
    }

    visitRepeatableFormComponentDefinition(item: RepeatableFormComponentDefinitionOutline): void {
        this.populateFormComponent(item);
    }

    /* Validation Summary */

    visitValidationSummaryFieldComponentDefinition(item: ValidationSummaryFieldComponentDefinitionOutline): void {
        // Get the current raw data for constructing the class instance.
        const currentData = this.getData();
        if (!isTypeFieldDefinitionName<ValidationSummaryFieldComponentDefinitionFrame>(currentData, ValidationSummaryComponentName)) {
            return;
        }
        const config = currentData?.config;

        // Create the class instance for the config
        item.config = new ValidationSummaryFieldComponentConfig();

        this.sharedProps.sharedPopulateFieldComponentConfig(item.config, config);
    }

    visitValidationSummaryFormComponentDefinition(item: ValidationSummaryFormComponentDefinitionOutline): void {
        this.populateFormComponent(item);
    }

    /* Group */

    visitGroupFieldComponentDefinition(item: GroupFieldComponentDefinitionOutline): void {
        // Get the current raw data for constructing the class instance.
        const currentData = this.getData();
        if (!isTypeFieldDefinitionName<GroupFieldComponentDefinitionFrame>(currentData, GroupFieldComponentName)) {
            return;
        }
        const frame = currentData?.config ?? {componentDefinitions: []};

        // Create the class instance for the config
        item.config = new GroupFieldComponentConfig();

        this.sharedProps.sharedPopulateFieldComponentConfig(item.config, frame);

        frame.componentDefinitions = this.formOverride.applyOverridesReusable(frame?.componentDefinitions ?? [], this.reusableFormDefs);

        // Visit the components
        frame.componentDefinitions.forEach((componentDefinition, index) => {
            const formComponent = this.constructFormComponent(componentDefinition);

            // Continue the construction
            this.formConfigPathHelper.acceptFormConfigPath(formComponent, ["config", "componentDefinitions", index.toString()]);

            // After the construction is done, apply any transforms
            const itemTransformed = this.formOverride.applyOverrideTransform(formComponent, this.formMode);

            // Store the instance on the item
            item.config?.componentDefinitions.push(itemTransformed);
        });
    }

    visitGroupFieldModelDefinition(item: GroupFieldModelDefinitionOutline): void {
        // Get the current raw data for constructing the class instance.
        const currentData = this.getData();
        if (!isTypeFieldDefinitionName<GroupFieldModelDefinitionFrame>(currentData, GroupFieldModelName)) {
            return;
        }

        // Create the class instance for the config
        item.config = new GroupFieldModelConfig();

        this.sharedProps.sharedPopulateFieldModelConfig(item.config, currentData?.config);

        this.setModelValue(item);
    }

    visitGroupFormComponentDefinition(item: GroupFormComponentDefinitionOutline): void {
        this.populateFormComponent(item);
    }

    /* Tab  */

    visitTabFieldComponentDefinition(item: TabFieldComponentDefinitionOutline): void {
        // Get the current raw data for constructing the class instance.
        const currentData = this.getData();
        if (!isTypeFieldDefinitionName<TabFieldComponentDefinitionFrame>(currentData, TabComponentName)) {
            return;
        }
        const frame = currentData?.config ?? {tabs: []};

        // Create the class instance for the config
        item.config = new TabFieldComponentConfig();

        this.sharedProps.sharedPopulateFieldComponentConfig(item.config, frame);

        const compDefs = this.formOverride.applyOverridesReusable(frame?.tabs ?? [], this.reusableFormDefs);
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
                const formComponent = this.constructFormComponent(componentDefinition)

                // Continue the construction
                this.formConfigPathHelper.acceptFormConfigPath(formComponent, ["config", "tabs", index.toString()]);

                // After the construction is done, apply any transforms
                // TODO: Use type assert for now.
                //  The Map<string,T> type in dictionary.model.ts should map specific string -> specific type.
                //  It currently maps string -> type union, which is too loose, as it doesn't imply that a particular string key maps to one type.
                const itemTransformed = this.formOverride.applyOverrideTransform(formComponent, this.formMode) as TabContentFormComponentDefinition;

                // Store the instance on the item
                item.config?.tabs.push(itemTransformed);
            }
        });
    }

    visitTabFieldLayoutDefinition(item: TabFieldLayoutDefinitionOutline): void {
        // Get the current raw data for constructing the class instance.
        const currentData = this.getData();
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
        this.populateFormComponent(item);
    }

    /* Tab Content */

    visitTabContentFieldComponentDefinition(item: TabContentFieldComponentDefinitionOutline): void {
        // Get the current raw data for constructing the class instance.
        const currentData = this.getData();
        if (!isTypeFieldDefinitionName<TabContentFieldComponentDefinitionFrame>(currentData, TabContentComponentName)) {
            return;
        }
        const config = currentData?.config ?? {componentDefinitions: []};

        // Create the class instance for the config
        item.config = new TabContentFieldComponentConfig();

        this.sharedProps.sharedPopulateFieldComponentConfig(item.config, config);

        this.sharedProps.setPropOverride('selected', item.config, config);

        config.componentDefinitions = this.formOverride.applyOverridesReusable(config?.componentDefinitions ?? [], this.reusableFormDefs);

        // Visit the components
        config?.componentDefinitions.forEach((componentDefinition, index) => {
            const formComponent = this.constructFormComponent(componentDefinition);

            // Continue the construction
            this.formConfigPathHelper.acceptFormConfigPath(formComponent, ["config", "componentDefinitions", index.toString()]);

            // After the construction is done, apply any transforms
            const itemTransformed = this.formOverride.applyOverrideTransform(formComponent, this.formMode);

            // Store the instance on the item
            item.config?.componentDefinitions.push(itemTransformed);
        });
    }

    visitTabContentFieldLayoutDefinition(item: TabContentFieldLayoutDefinitionOutline): void {
        // Get the current raw data for constructing the class instance.
        const currentData = this.getData();
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
        this.populateFormComponent(item);
    }

    /* Save Button  */

    visitSaveButtonFieldComponentDefinition(item: SaveButtonFieldComponentDefinitionOutline): void {
        // Get the current raw data for constructing the class instance.
        const currentData = this.getData();
        if (!isTypeFieldDefinitionName<SaveButtonFieldComponentDefinitionFrame>(currentData, SaveButtonComponentName)) {
            return;
        }
        const config = currentData?.config;

        // Create the class instance for the config
        item.config = new SaveButtonFieldComponentConfig();

        this.sharedProps.sharedPopulateFieldComponentConfig(item.config, config);

        this.sharedProps.setPropOverride('targetStep', item.config, config);
        this.sharedProps.setPropOverride('forceSave', item.config, config);
        this.sharedProps.setPropOverride('enabledValidationGroups', item.config, config);
        this.sharedProps.setPropOverride('labelSaving', item.config, config);
    }

    visitSaveButtonFormComponentDefinition(item: SaveButtonFormComponentDefinitionOutline): void {
        this.populateFormComponent(item);
    }

    /* Text Area */

    visitTextAreaFieldComponentDefinition(item: TextAreaFieldComponentDefinitionOutline): void {
        // Get the current raw data for constructing the class instance.
        const currentData = this.getData();
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
        const currentData = this.getData();
        if (!isTypeFieldDefinitionName<TextAreaFieldModelDefinitionFrame>(currentData, TextAreaModelName)) {
            return;
        }

        // Create the class instance for the config
        item.config = new TextAreaFieldModelConfig();

        this.sharedProps.sharedPopulateFieldModelConfig(item.config, currentData?.config);

        this.setModelValue(item);
    }

    visitTextAreaFormComponentDefinition(item: TextAreaFormComponentDefinitionOutline): void {
        this.populateFormComponent(item);
    }

    /* Default Layout  */

    visitDefaultFieldLayoutDefinition(item: DefaultFieldLayoutDefinitionOutline): void {
        // Get the current raw data for constructing the class instance.
        const currentData = this.getData();
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
        const currentData = this.getData();
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
        const currentData = this.getData();
        if (!isTypeFieldDefinitionName<CheckboxInputFieldModelDefinitionFrame>(currentData, CheckboxInputModelName)) {
            return;
        }

        // Create the class instance for the config
        item.config = new CheckboxInputFieldModelConfig();

        this.sharedProps.sharedPopulateFieldModelConfig(item.config, currentData?.config);

        this.setModelValue(item);
    }

    visitCheckboxInputFormComponentDefinition(item: CheckboxInputFormComponentDefinitionOutline): void {
        this.populateFormComponent(item);
    }

    /* Dropdown Input */

    visitDropdownInputFieldComponentDefinition(item: DropdownInputFieldComponentDefinitionOutline): void {
        // Get the current raw data for constructing the class instance.
        const currentData = this.getData();
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
        const currentData = this.getData();
        if (!isTypeFieldDefinitionName<DropdownInputFieldModelDefinitionFrame>(currentData, DropdownInputModelName)) {
            return;
        }

        // Create the class instance for the config
        item.config = new DropdownInputFieldModelConfig();

        this.sharedProps.sharedPopulateFieldModelConfig(item.config, currentData?.config);

        this.setModelValue(item);
    }

    visitDropdownInputFormComponentDefinition(item: DropdownInputFormComponentDefinitionOutline): void {
        this.populateFormComponent(item);
    }

    /* Radio Input */

    visitRadioInputFieldComponentDefinition(item: RadioInputFieldComponentDefinitionOutline): void {
        // Get the current raw data for constructing the class instance.
        const currentData = this.getData();
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
        const currentData = this.getData();
        if (!isTypeFieldDefinitionName<RadioInputFieldModelDefinitionFrame>(currentData, RadioInputModelName)) {
            return;
        }

        // Create the class instance for the config
        item.config = new RadioInputFieldModelConfig();

        this.sharedProps.sharedPopulateFieldModelConfig(item.config, currentData?.config);

        this.setModelValue(item);
    }

    visitRadioInputFormComponentDefinition(item: RadioInputFormComponentDefinitionOutline): void {
        this.populateFormComponent(item);
    }

    /* Date Input */

    visitDateInputFieldComponentDefinition(item: DateInputFieldComponentDefinitionOutline): void {
        // Get the current raw data for constructing the class instance.
        const currentData = this.getData();
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
        const currentData = this.getData();
        if (!isTypeFieldDefinitionName<DateInputFieldModelDefinitionFrame>(currentData, DateInputModelName)) {
            return;
        }

        // Create the class instance for the config
        item.config = new DateInputFieldModelConfig();

        this.sharedProps.sharedPopulateFieldModelConfig(item.config, currentData?.config);

        this.setModelValue(item);
    }

    visitDateInputFormComponentDefinition(item: DateInputFormComponentDefinitionOutline): void {
        this.populateFormComponent(item);
    }

    /* Shared */

    protected constructFormComponent(item: FormComponentDefinitionFrame) {
        const constructed = this.sharedProps.sharedConstructFormComponent(item);
        if (!constructed) {
            throw new Error(`Could not find class for form component class name '${item?.component?.class}' at path '${this.formConfigPathHelper.formConfigPath}'.`)
        }
        return constructed;
    }

    protected populateFormComponent(item: FormComponentDefinitionOutline, requireModel?: boolean) {
        const currentData = this.getData();
        if (!isTypeFormComponentDefinition(currentData)) {
            throw new Error(`Invalid FormComponentDefinition at '${this.formConfigPathHelper.formConfigPath}': ${JSON.stringify(currentData)}`);
        }
        this.sharedProps.sharedPopulateFormComponent(item, currentData);

        this.acceptFormComponentDefinitionWithValue(item, currentData, requireModel);

        this.isRepeatableElementTemplate = false;
    }

    /**
     * Set the model value from the record values.
     * @param item The field model component instance.
     * @protected
     */
    protected setModelValue(item: FieldModelDefinitionOutline<unknown>) {
        if (item?.config?.value !== undefined) {
            throw new Error(`${this.logName}: Use 'model.config.defaultValue' in form config instead of 'model.config.value': ${JSON.stringify(item)}`);
        }

        if (item.config === null || item.config === undefined) {
            throw new Error(`${this.logName}: Missing config for item: ${JSON.stringify(item)}`);
        }

        // Set the model.config.value
        item.config.value = this.currentModelValue(item?.config?.defaultValue);

        // Remove the defaultValue property.
        if (item?.config && 'defaultValue' in item.config) {
            delete item.config.defaultValue;
        }
    }

    protected currentModelValue(itemDefaultValue?: unknown): unknown {
        //   Use the collected default value if form config default values are being used, otherwise, use the record values.
        const useFormConfigDefaultValues = this.isRepeatableElementTemplate || this.recordValues === null;
        const dataValueSource = useFormConfigDefaultValues ? this.extractedDefaultValues : this.recordValues;
        const defaultValue = useFormConfigDefaultValues ? itemDefaultValue : undefined;
        return _cloneDeep(_get(dataValueSource, this.dataModelPath, defaultValue));
    }

    /**
     * Extract the default value from the form component definition.
     * @param item The form component definition.
     * @param currentData The form component data.
     * @param requireModel True if a model needs to be present to update the data model path,
     *   false to update the data model path regardless of the presence of a model.
     * @protected
     */
    protected acceptFormComponentDefinitionWithValue(item: FormComponentDefinitionOutline, currentData: FormComponentDefinitionFrame, requireModel?: boolean): void {
        const original = [...(this.dataModelPath ?? [])];
        const itemName = item?.name ?? "";
        const itemDefaultValue = currentData?.model?.config?.defaultValue;

        try {
            if ((requireModel !== false ? !!item.model : true) && itemName) {
                this.dataModelPath = [...original, itemName];
            }

            // Merge the default value if form default values are being used and item has a default value.
            this.mergeDefaultValues(itemName, itemDefaultValue);

            // Continue visiting
            this.formConfigPathHelper.acceptFormComponentDefinition(item);
        } catch (error) {
            // rethrow error - the finally block will ensure the dataModelPath is correct
            throw error;
        } finally {
            this.dataModelPath = original;
        }
    }

    /**
     * Merge the items' default value into the intermediate values.
     * @param itemName The item name.
     * @param itemDefaultValue The item's default value.
     * @protected
     */
    protected mergeDefaultValues(itemName: string, itemDefaultValue: unknown): void {
        if (itemName && itemDefaultValue !== undefined) {
            // Set the default value at the current data model path.
            // This makes it easier to merge defaults.
            const dataModelWithDefaultValue = _set({}, this.dataModelPath, itemDefaultValue);
            // Merging is only needed if there is a default value.
            if (dataModelWithDefaultValue !== undefined) {
                // Use lodash mergeWith because it will recurse into nested objects and arrays.
                // Object.assign and the spread operator do not recurse.
                // The lodash mergeWith also allows specifying how to handle arrays, which we need to handle in a special way.
                _mergeWith(
                    this.extractedDefaultValues,
                    dataModelWithDefaultValue,
                    (objValue, srcValue) => {
                        // merge approach for arrays is to choose the source array,
                        // or the one that is an array if the other isn't
                        if (Array.isArray(objValue) && Array.isArray(srcValue)) {
                            return srcValue;
                        } else if (Array.isArray(objValue) && !Array.isArray(srcValue)) {
                            return objValue;
                        } else if (!Array.isArray(objValue) && Array.isArray(srcValue)) {
                            return srcValue;
                        }
                        // undefined = use the default merge approach
                        return undefined;
                    });
            }
        }
    }

    protected getData() {
        return this.sharedProps.getDataPath(this.data, this.formConfigPathHelper.formConfigPath);
    }
}
