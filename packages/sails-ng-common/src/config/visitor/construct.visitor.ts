import { cloneDeep as _cloneDeep, get as _get, mergeWith as _mergeWith, set as _set } from 'lodash';
import { FormConfig } from '../form-config.model';

import { FormConfigVisitor } from './base.model';
import { FormConfigFrame, FormConfigOutline } from '../form-config.outline';
import {
  GroupFieldComponentDefinitionFrame,
  GroupFieldComponentDefinitionOutline,
  GroupFieldComponentName,
  GroupFieldModelDefinitionFrame,
  GroupFieldModelDefinitionOutline,
  GroupFieldModelName,
  GroupFormComponentDefinitionOutline,
} from '../component/group.outline';
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
  RepeatableModelName,
} from '../component/repeatable.outline';
import {
  RepeatableElementFieldLayoutConfig,
  RepeatableFieldComponentConfig,
  RepeatableFieldModelConfig,
} from '../component/repeatable.model';
import { GroupFieldComponentConfig, GroupFieldModelConfig } from '../component/group.model';
import {
  SimpleInputComponentName,
  SimpleInputFieldComponentDefinitionFrame,
  SimpleInputFieldComponentDefinitionOutline,
  SimpleInputFieldModelDefinitionFrame,
  SimpleInputFieldModelDefinitionOutline,
  SimpleInputFormComponentDefinitionOutline,
  SimpleInputModelName,
} from '../component/simple-input.outline';
import { SimpleInputFieldComponentConfig, SimpleInputFieldModelConfig } from '../component/simple-input.model';
import {
  DefaultFieldLayoutDefinitionFrame,
  DefaultFieldLayoutDefinitionOutline,
  DefaultLayoutName,
} from '../component/default-layout.outline';
import { DefaultFieldLayoutConfig } from '../component/default-layout.model';
import { FormExpressionsConfig } from '../form-component.model';
import {
  FormComponentDefinitionFrame,
  FormComponentDefinitionOutline,
  FormExpressionsOperationConfigFrame,
  FormExpressionsTemplateConfigFrame,
} from '../form-component.outline';
import {
  ContentComponentName,
  ContentFieldComponentDefinitionFrame,
  ContentFieldComponentDefinitionOutline,
  ContentFormComponentDefinitionOutline,
} from '../component/content.outline';
import {
  TabComponentName,
  TabFieldComponentDefinitionFrame,
  TabFieldComponentDefinitionOutline,
  TabFieldLayoutDefinitionFrame,
  TabFieldLayoutDefinitionOutline,
  TabFormComponentDefinitionOutline,
  TabLayoutName,
} from '../component/tab.outline';
import { TabFieldComponentConfig, TabFieldLayoutConfig } from '../component/tab.model';
import {
  TabContentComponentName,
  TabContentFieldComponentDefinitionFrame,
  TabContentFieldComponentDefinitionOutline,
  TabContentFieldLayoutDefinitionFrame,
  TabContentFieldLayoutDefinitionOutline,
  TabContentFormComponentDefinitionFrame,
  TabContentFormComponentDefinitionOutline,
  TabContentLayoutName,
} from '../component/tab-content.outline';
import {
  TabContentFieldComponentConfig,
  TabContentFieldLayoutConfig,
  TabContentFormComponentDefinition,
} from '../component/tab-content.model';
import {
  TextAreaComponentName,
  TextAreaFieldComponentDefinitionFrame,
  TextAreaFieldComponentDefinitionOutline,
  TextAreaFieldModelDefinitionFrame,
  TextAreaFieldModelDefinitionOutline,
  TextAreaFormComponentDefinitionOutline,
  TextAreaModelName,
} from '../component/text-area.outline';
import { TextAreaFieldComponentConfig, TextAreaFieldModelConfig } from '../component/text-area.model';
import {
  RichTextEditorComponentName,
  RichTextEditorFieldComponentDefinitionFrame,
  RichTextEditorFieldComponentDefinitionOutline,
  RichTextEditorFieldModelDefinitionFrame,
  RichTextEditorFieldModelDefinitionOutline,
  RichTextEditorFormComponentDefinitionOutline,
  RichTextEditorModelName,
} from '../component/rich-text-editor.outline';
import {
  RichTextEditorFieldComponentConfig,
  RichTextEditorFieldModelConfig,
} from '../component/rich-text-editor.model';
import {
  MapComponentName,
  MapDrawingMode,
  MapFieldComponentDefinitionFrame,
  MapFieldComponentDefinitionOutline,
  MapFieldModelDefinitionFrame,
  MapFieldModelDefinitionOutline,
  MapFormComponentDefinitionOutline,
  MapModelName,
} from '../component/map.outline';
import { MapFieldComponentConfig, MapFieldModelConfig } from '../component/map.model';
import {
  FileUploadComponentName,
  FileUploadFieldComponentDefinitionFrame,
  FileUploadFieldComponentDefinitionOutline,
  FileUploadFieldModelDefinitionFrame,
  FileUploadFieldModelDefinitionOutline,
  FileUploadFormComponentDefinitionOutline,
  FileUploadModelName,
} from '../component/file-upload.outline';
import { FileUploadFieldComponentConfig, FileUploadFieldModelConfig } from '../component/file-upload.model';
import { ContentFieldComponentConfig } from '../component/content.model';
import {
  DropdownInputComponentName,
  DropdownInputFieldComponentDefinitionFrame,
  DropdownInputFieldComponentDefinitionOutline,
  DropdownInputFieldModelDefinitionFrame,
  DropdownInputFieldModelDefinitionOutline,
  DropdownInputFormComponentDefinitionOutline,
  DropdownInputModelName,
} from '../component/dropdown-input.outline';
import { DropdownInputFieldComponentConfig, DropdownInputFieldModelConfig } from '../component/dropdown-input.model';
import {
  TypeaheadInputComponentName,
  TypeaheadInputFieldComponentDefinitionFrame,
  TypeaheadInputFieldComponentDefinitionOutline,
  TypeaheadInputFieldModelDefinitionFrame,
  TypeaheadInputFieldModelDefinitionOutline,
  TypeaheadInputFormComponentDefinitionOutline,
  TypeaheadInputModelName,
} from '../component/typeahead-input.outline';
import { TypeaheadInputFieldComponentConfig, TypeaheadInputFieldModelConfig } from '../component/typeahead-input.model';
import {
  CheckboxInputComponentName,
  CheckboxInputFieldComponentDefinitionFrame,
  CheckboxInputFieldComponentDefinitionOutline,
  CheckboxInputFieldModelDefinitionFrame,
  CheckboxInputFieldModelDefinitionOutline,
  CheckboxInputFormComponentDefinitionOutline,
  CheckboxInputModelName,
} from '../component/checkbox-input.outline';
import { CheckboxInputFieldComponentConfig, CheckboxInputFieldModelConfig } from '../component/checkbox-input.model';
import {
  CheckboxTreeComponentName,
  CheckboxTreeFieldComponentDefinitionFrame,
  CheckboxTreeFieldComponentDefinitionOutline,
  CheckboxTreeFieldModelDefinitionFrame,
  CheckboxTreeFieldModelDefinitionOutline,
  CheckboxTreeFormComponentDefinitionOutline,
  CheckboxTreeModelName,
} from '../component/checkbox-tree.outline';
import { CheckboxTreeFieldComponentConfig, CheckboxTreeFieldModelConfig } from '../component/checkbox-tree.model';
import {
  RadioInputComponentName,
  RadioInputFieldComponentDefinitionFrame,
  RadioInputFieldComponentDefinitionOutline,
  RadioInputFieldModelDefinitionFrame,
  RadioInputFieldModelDefinitionOutline,
  RadioInputFormComponentDefinitionOutline,
  RadioInputModelName,
} from '../component/radio-input.outline';
import { RadioInputFieldComponentConfig, RadioInputFieldModelConfig } from '../component/radio-input.model';
import {
  DateInputComponentName,
  DateInputFieldComponentDefinitionFrame,
  DateInputFieldComponentDefinitionOutline,
  DateInputFieldModelDefinitionFrame,
  DateInputFieldModelDefinitionOutline,
  DateInputFormComponentDefinitionOutline,
  DateInputModelName,
} from '../component/date-input.outline';
import { DateInputFieldComponentConfig, DateInputFieldModelConfig } from '../component/date-input.model';
import {
  SaveButtonComponentName,
  SaveButtonFieldComponentDefinitionFrame,
  SaveButtonFieldComponentDefinitionOutline,
  SaveButtonFormComponentDefinitionOutline,
} from '../component/save-button.outline';
import { SaveButtonFieldComponentConfig } from '../component/save-button.model';
import {
  CancelButtonComponentName,
  CancelButtonFieldComponentDefinitionFrame,
  CancelButtonFieldComponentDefinitionOutline,
  CancelButtonFormComponentDefinitionOutline,
} from '../component/cancel-button.outline';
import { CancelButtonFieldComponentConfig } from '../component/cancel-button.model';
import {
  TabNavButtonComponentName,
  TabNavButtonFieldComponentDefinitionFrame,
  TabNavButtonFieldComponentDefinitionOutline,
  TabNavButtonFormComponentDefinitionOutline,
} from '../component/tab-nav-button.outline';
import { TabNavButtonFieldComponentConfig } from '../component/tab-nav-button.model';
import {
  ValidationSummaryComponentName,
  ValidationSummaryFieldComponentDefinitionFrame,
  ValidationSummaryFieldComponentDefinitionOutline,
  ValidationSummaryFormComponentDefinitionOutline,
} from '../component/validation-summary.outline';
import { ValidationSummaryFieldComponentConfig } from '../component/validation-summary.model';
import {
  isTypeFieldDefinitionName,
  isTypeFormComponentDefinition,
  isTypeFormComponentDefinitionName,
  isTypeFormConfig,
} from '../form-types.outline';
import { AllFormComponentDefinitionOutlines, ReusableFormDefinitions } from '../dictionary.outline';
import { ILogger } from '../../logger.interface';
import { FormModesConfig } from '../shared.outline';
import { FieldModelConfigFrame, FieldModelDefinitionOutline } from '../field-model.outline';
import { FormOverride } from '../form-override.model';
import { FormPathHelper, PropertiesHelper } from './common.model';
import { LineagePath } from '../names/naming-helpers';

/**
 * Visit each form config frame and create an instance of the associated class.
 *
 * This visitor performs the tasks needed to create form component class instances:
 * - populate the instance properties from the form config data
 * - assign the created classes to the expected property to build the component hierarchy
 * - populate the model.config.value and/or the properties specific to a component from either a record or the form defaults
 * - when using form defaults, provide default values from ancestors to descendants, so the descendants can either use their default or an ancestors default
 * - expand reusable form config to the actual form config
 * - transform component definitions to be a different component(s)
 */
export class ConstructFormConfigVisitor extends FormConfigVisitor {
  protected override logName = 'ConstructFormConfigVisitor';

  private formMode: FormModesConfig;
  private recordValues: Record<string, unknown> | null;
  private extractedDefaultValues: Record<string, unknown>;

  private mostRecentRepeatableElementTemplatePath: LineagePath | null;

  private data: FormConfigFrame;

  private reusableFormDefs: ReusableFormDefinitions;

  private formConfig: FormConfigOutline;

  private formOverride: FormOverride;
  private formPathHelper: FormPathHelper;
  private sharedProps: PropertiesHelper;

  constructor(logger: ILogger) {
    super(logger);

    this.formMode = 'view';
    this.recordValues = null;
    this.extractedDefaultValues = {};

    this.mostRecentRepeatableElementTemplatePath = null;

    this.data = { name: '', componentDefinitions: [] };

    this.reusableFormDefs = {};

    this.formConfig = new FormConfig();

    this.formOverride = new FormOverride(logger);
    this.formPathHelper = new FormPathHelper(logger, this);
    this.sharedProps = new PropertiesHelper();
  }

  /**
   * Start the visitor.
   * @param options Configure the visitor.
   * @param options.data The form config to construct into class instances.
   * @param options.reusableFormDefs The reusable form definitions. Default empty.
   * @param options.formMode The currently active form mode. Defaults to 'view'.
   * @param options.record The record metadata values. Set to undefined or null to use the form default values.
   */
  start(options: {
    data: FormConfigFrame;
    reusableFormDefs?: ReusableFormDefinitions;
    formMode?: FormModesConfig;
    record?: Record<string, unknown> | null;
  }): FormConfigOutline {
    this.data = _cloneDeep(options.data);
    this.reusableFormDefs = options.reusableFormDefs ?? {};
    this.formMode = options.formMode ?? 'view';

    // When options.record is null or undefined, use the form defaults. Otherwise, use recordValues only.
    // This allows for specifying an empty record '{}' and using that instead of the defaults.
    this.recordValues = options.record === null || options.record === undefined ? null : options.record;

    // Collect the form config defaults.
    // The defaults always need to be extract so they are available to any repeatable components.
    this.extractedDefaultValues = {};

    this.mostRecentRepeatableElementTemplatePath = null;

    this.formPathHelper.reset();

    this.formConfig = new FormConfig();
    this.formConfig.accept(this);
    return this.formConfig;
  }

  /* Form Config */

  visitFormConfig(item: FormConfigOutline): void {
    const currentData = this.getData();
    if (!isTypeFormConfig(currentData)) {
      throw new Error(
        `Invalid FormConfigFrame at '${this.formPathHelper.formPath.formConfig}': ${JSON.stringify(currentData)}`
      );
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
    this.sharedProps.setPropOverride('expressions', item, currentData);
    this.sharedProps.setPropOverride('attachmentFields', item, currentData);
    // Ensure the default validation groups are present.
    if (!item.validationGroups) {
      item.validationGroups = {};
    }
    if (!Object.hasOwn(item.validationGroups, 'all')) {
      item.validationGroups['all'] = {
        description: 'Validate all fields with validators.',
        initialMembership: 'all',
      };
    }
    if (!Object.hasOwn(item.validationGroups, 'none')) {
      item.validationGroups['none'] = {
        description: 'Validate none of the fields.',
        initialMembership: 'none',
      };
    }

    currentData.componentDefinitions = this.formOverride.applyOverridesReusable(
      currentData?.componentDefinitions ?? [],
      this.reusableFormDefs
    );

    // Visit the components
    currentData.componentDefinitions.forEach((componentDefinition, index) => {
      const formComponent = this.constructFormComponent(componentDefinition);

      // Visit children
      const testing = this.formPathHelper.lineagePathsForFormConfigComponentDefinition(formComponent, index);
      this.formPathHelper.acceptFormPath(formComponent, testing);

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
      throw new Error(
        `Invalid ${SimpleInputComponentName} at '${this.formPathHelper.formPath.formConfig}': ${JSON.stringify(currentData)}`
      );
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
      throw new Error(
        `Invalid ${SimpleInputModelName} at '${this.formPathHelper.formPath.formConfig}': ${JSON.stringify(currentData)}`
      );
    }

    // Create the class instance for the config
    item.config = new SimpleInputFieldModelConfig();

    this.sharedProps.sharedPopulateFieldModelConfig(item.config, currentData?.config);

    this.setModelValue(item, currentData?.config);
  }

  visitSimpleInputFormComponentDefinition(item: SimpleInputFormComponentDefinitionOutline): void {
    this.populateFormComponent(item);
  }

  /* Content */

  visitContentFieldComponentDefinition(item: ContentFieldComponentDefinitionOutline): void {
    // Get the current raw data for constructing the class instance.
    const currentData = this.getData();
    if (!isTypeFieldDefinitionName<ContentFieldComponentDefinitionFrame>(currentData, ContentComponentName)) {
      throw new Error(
        `Invalid ${ContentComponentName} at '${this.formPathHelper.formPath.formConfig}': ${JSON.stringify(currentData)}`
      );
    }
    const config = currentData?.config;

    // Create the class instance for the config
    item.config = new ContentFieldComponentConfig();

    this.sharedProps.sharedPopulateFieldComponentConfig(item.config, config);

    this.sharedProps.setPropOverride('template', item.config, config);
    this.sharedProps.setPropOverride('content', item.config, config);
  }

  visitContentFormComponentDefinition(item: ContentFormComponentDefinitionOutline): void {
    // TODO: does the content component require the data model?
    this.populateFormComponent(item);
  }

  /* Repeatable  */

  visitRepeatableFieldComponentDefinition(item: RepeatableFieldComponentDefinitionOutline): void {
    // Get the current raw data for constructing the class instance.
    const currentData = this.getData();
    if (!isTypeFieldDefinitionName<RepeatableFieldComponentDefinitionFrame>(currentData, RepeatableComponentName)) {
      throw new Error(
        `Invalid ${RepeatableComponentName} at '${this.formPathHelper.formPath.formConfig}': ${JSON.stringify(currentData)}`
      );
    }
    const frame = currentData?.config;

    // Create the class instance for the config
    item.config = new RepeatableFieldComponentConfig();

    this.sharedProps.sharedPopulateFieldComponentConfig(item.config, frame);

    const currentFormConfigPath = this.formPathHelper.formPath.formConfig;

    if (!isTypeFormComponentDefinition(frame?.elementTemplate)) {
      throw new Error(`Invalid elementTemplate for repeatable at '${currentFormConfigPath}'.`);
    }

    const compDefs = this.formOverride.applyOverridesReusable([frame?.elementTemplate], this.reusableFormDefs);
    const compDefLength = compDefs?.length ?? 0;
    if (compDefLength !== 1) {
      throw new Error(
        `Repeatable element template overrides must result in exactly one item, got ${compDefLength} at '${currentFormConfigPath}'.`
      );
    }
    frame.elementTemplate = compDefs[0];

    // The element template name must be falsy.
    // It is also allowed for a ReusableComponent to have a replaceName that is falsy.
    const elementTemplateName = frame.elementTemplate?.name;
    const elementTemplateClass = frame.elementTemplate?.component?.class;
    const elementTemplateReplaceName = frame.elementTemplate?.overrides?.replaceName;
    const nameIsFalsy = !elementTemplateName;
    const nameWillBeTransformedToFalsy = elementTemplateReplaceName === null || elementTemplateReplaceName === '';
    if (!nameIsFalsy && !nameWillBeTransformedToFalsy) {
      this.logger.error(
        `Repeatable element template must have a 'falsy' name: elementTemplateName '${JSON.stringify(elementTemplateName)}' ` +
        `elementTemplateClass ${JSON.stringify(elementTemplateClass)} elementTemplateReplaceName ${JSON.stringify(elementTemplateReplaceName)}`
      );
      throw new Error(
        `Repeatable element template must have a 'falsy' name, got ${JSON.stringify(frame.elementTemplate?.name)} at ${JSON.stringify(currentFormConfigPath)}.`
      );
    }

    // Track the most recent element template.
    // - Ensure newEntryValue is used only in elementTemplate definitions.
    // - Ensure defaultValue is not defined in elementTemplate or any nested components.
    const previousMostRecentRepeatableElementTemplatePath =
      this.mostRecentRepeatableElementTemplatePath === null ? null : [...this.mostRecentRepeatableElementTemplatePath];
    this.mostRecentRepeatableElementTemplatePath = [...currentFormConfigPath, 'config', 'elementTemplate'];

    const formComponent = this.constructFormComponent(frame.elementTemplate);

    // Continue the construction
    this.formPathHelper.acceptFormPath(
      formComponent,
      this.formPathHelper.lineagePathsForRepeatableFieldComponentDefinition(formComponent)
    );

    // After the construction is done, apply any transforms
    const itemTransformed = this.formOverride.applyOverrideTransform(formComponent, this.formMode);

    // Store the instance on the item
    item.config.elementTemplate = itemTransformed;

    this.mostRecentRepeatableElementTemplatePath = previousMostRecentRepeatableElementTemplatePath;
  }

  visitRepeatableFieldModelDefinition(item: RepeatableFieldModelDefinitionOutline): void {
    // Get the current raw data for constructing the class instance.
    const currentData = this.getData();
    if (!isTypeFieldDefinitionName<RepeatableFieldModelDefinitionFrame>(currentData, RepeatableModelName)) {
      throw new Error(
        `Invalid ${RepeatableModelName} at '${this.formPathHelper.formPath.formConfig}': ${JSON.stringify(currentData)}`
      );
    }

    // Create the class instance for the config
    item.config = new RepeatableFieldModelConfig();

    this.sharedProps.sharedPopulateFieldModelConfig(item.config, currentData?.config);

    this.setModelValue(item, currentData?.config);
  }

  visitRepeatableElementFieldLayoutDefinition(item: RepeatableElementFieldLayoutDefinitionOutline): void {
    // Get the current raw data for constructing the class instance.
    const currentData = this.getData();
    if (
      !isTypeFieldDefinitionName<RepeatableElementFieldLayoutDefinitionFrame>(currentData, RepeatableElementLayoutName)
    ) {
      throw new Error(
        `Invalid ${RepeatableElementLayoutName} at '${this.formPathHelper.formPath.formConfig}': ${JSON.stringify(currentData)}`
      );
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
    if (
      !isTypeFieldDefinitionName<ValidationSummaryFieldComponentDefinitionFrame>(
        currentData,
        ValidationSummaryComponentName
      )
    ) {
      throw new Error(
        `Invalid ${ValidationSummaryComponentName} at '${this.formPathHelper.formPath.formConfig}': ${JSON.stringify(currentData)}`
      );
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
      throw new Error(
        `Invalid ${GroupFieldComponentName} at '${this.formPathHelper.formPath.formConfig}': ${JSON.stringify(currentData)}`
      );
    }
    const frame = currentData?.config ?? { componentDefinitions: [] };

    // Create the class instance for the config
    item.config = new GroupFieldComponentConfig();

    this.sharedProps.sharedPopulateFieldComponentConfig(item.config, frame);

    frame.componentDefinitions = this.formOverride.applyOverridesReusable(
      frame?.componentDefinitions ?? [],
      this.reusableFormDefs
    );

    // Visit the components
    frame.componentDefinitions.forEach((componentDefinition, index) => {
      const formComponent = this.constructFormComponent(componentDefinition);

      // Continue the construction
      this.formPathHelper.acceptFormPath(
        formComponent,
        this.formPathHelper.lineagePathsForGroupFieldComponentDefinition(formComponent, index)
      );

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
      throw new Error(
        `Invalid ${GroupFieldModelName} at '${this.formPathHelper.formPath.formConfig}': ${JSON.stringify(currentData)}`
      );
    }

    // Create the class instance for the config
    item.config = new GroupFieldModelConfig();

    this.sharedProps.sharedPopulateFieldModelConfig(item.config, currentData?.config);

    this.setModelValue(item, currentData?.config);
  }

  visitGroupFormComponentDefinition(item: GroupFormComponentDefinitionOutline): void {
    this.populateFormComponent(item);
  }

  /* Tab  */

  visitTabFieldComponentDefinition(item: TabFieldComponentDefinitionOutline): void {
    // Get the current raw data for constructing the class instance.
    const currentData = this.getData();
    if (!isTypeFieldDefinitionName<TabFieldComponentDefinitionFrame>(currentData, TabComponentName)) {
      throw new Error(
        `Invalid ${TabComponentName} at '${this.formPathHelper.formPath.formConfig}': ${JSON.stringify(currentData)}`
      );
    }
    const frame = currentData?.config ?? { tabs: [] };

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
      if (
        isTypeFormComponentDefinitionName<TabContentFormComponentDefinitionFrame>(
          componentDefinition,
          TabContentComponentName
        )
      ) {
        const formComponent = this.constructFormComponent(componentDefinition);

        // Continue the construction
        this.formPathHelper.acceptFormPath(
          formComponent,
          this.formPathHelper.lineagePathsForTabFieldComponentDefinition(formComponent, index)
        );

        // After the construction is done, apply any transforms
        // TODO: Use type assert for now.
        //  The Map<string,T> type in dictionary.model.ts should map specific string -> specific type.
        //  It currently maps string -> type union, which is too loose, as it doesn't imply that a particular string key maps to one type.
        const itemTransformed = this.formOverride.applyOverrideTransform(
          formComponent,
          this.formMode
        ) as TabContentFormComponentDefinition;

        // Store the instance on the item
        item.config?.tabs.push(itemTransformed);
      }
    });
  }

  visitTabFieldLayoutDefinition(item: TabFieldLayoutDefinitionOutline): void {
    // Get the current raw data for constructing the class instance.
    const currentData = this.getData();
    if (!isTypeFieldDefinitionName<TabFieldLayoutDefinitionFrame>(currentData, TabLayoutName)) {
      throw new Error(
        `Invalid ${TabLayoutName} at '${this.formPathHelper.formPath.formConfig}': ${JSON.stringify(currentData)}`
      );
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
      throw new Error(
        `Invalid ${TabContentComponentName} at '${this.formPathHelper.formPath.formConfig}': ${JSON.stringify(currentData)}`
      );
    }
    const config = currentData?.config ?? { componentDefinitions: [] };

    // Create the class instance for the config
    item.config = new TabContentFieldComponentConfig();

    this.sharedProps.sharedPopulateFieldComponentConfig(item.config, config);

    this.sharedProps.setPropOverride('selected', item.config, config);

    config.componentDefinitions = this.formOverride.applyOverridesReusable(
      config?.componentDefinitions ?? [],
      this.reusableFormDefs
    );

    // Visit the components
    config?.componentDefinitions.forEach((componentDefinition, index) => {
      const formComponent = this.constructFormComponent(componentDefinition);

      // Continue the construction
      this.formPathHelper.acceptFormPath(
        formComponent,
        this.formPathHelper.lineagePathsForTabContentFieldComponentDefinition(formComponent, index)
      );

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
      throw new Error(
        `Invalid ${TabContentLayoutName} at '${this.formPathHelper.formPath.formConfig}': ${JSON.stringify(currentData)}`
      );
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
      throw new Error(
        `Invalid ${SaveButtonComponentName} at '${this.formPathHelper.formPath.formConfig}': ${JSON.stringify(currentData)}`
      );
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

  /* Cancel Button  */

  visitCancelButtonFieldComponentDefinition(item: CancelButtonFieldComponentDefinitionOutline): void {
    // Get the current raw data for constructing the class instance.
    const currentData = this.getData();
    if (!isTypeFieldDefinitionName<CancelButtonFieldComponentDefinitionFrame>(currentData, CancelButtonComponentName)) {
      throw new Error(
        `Invalid ${CancelButtonComponentName} at '${this.formPathHelper.formPath.formConfig}': ${JSON.stringify(currentData)}`
      );
    }
    const config = currentData?.config;

    // Create the class instance for the config
    item.config = new CancelButtonFieldComponentConfig();

    this.sharedProps.sharedPopulateFieldComponentConfig(item.config, config);

    this.sharedProps.setPropOverride('confirmationMessage', item.config, config);
    this.sharedProps.setPropOverride('confirmationTitle', item.config, config);
    this.sharedProps.setPropOverride('cancelButtonMessage', item.config, config);
    this.sharedProps.setPropOverride('confirmButtonMessage', item.config, config);
  }

  visitCancelButtonFormComponentDefinition(item: CancelButtonFormComponentDefinitionOutline): void {
    this.populateFormComponent(item);
  }

  /* Tab Nav Button  */

  visitTabNavButtonFieldComponentDefinition(item: TabNavButtonFieldComponentDefinitionOutline): void {
    // Get the current raw data for constructing the class instance.
    const currentData = this.getData();
    if (!isTypeFieldDefinitionName<TabNavButtonFieldComponentDefinitionFrame>(currentData, TabNavButtonComponentName)) {
      throw new Error(
        `Invalid ${TabNavButtonComponentName} at '${this.formPathHelper.formPath.formConfig}': ${JSON.stringify(currentData)}`
      );
    }
    const config = currentData?.config;

    // Create the class instance for the config
    item.config = new TabNavButtonFieldComponentConfig();

    this.sharedProps.sharedPopulateFieldComponentConfig(item.config, config);

    this.sharedProps.setPropOverride('prevLabel', item.config, config);
    this.sharedProps.setPropOverride('nextLabel', item.config, config);
    this.sharedProps.setPropOverride('targetTabContainerId', item.config, config);
    this.sharedProps.setPropOverride('endDisplayMode', item.config, config);
  }

  visitTabNavButtonFormComponentDefinition(item: TabNavButtonFormComponentDefinitionOutline): void {
    this.populateFormComponent(item);
  }

  /* Text Area */

  visitTextAreaFieldComponentDefinition(item: TextAreaFieldComponentDefinitionOutline): void {
    // Get the current raw data for constructing the class instance.
    const currentData = this.getData();
    if (!isTypeFieldDefinitionName<TextAreaFieldComponentDefinitionFrame>(currentData, TextAreaComponentName)) {
      throw new Error(
        `Invalid ${TextAreaComponentName} at '${this.formPathHelper.formPath.formConfig}': ${JSON.stringify(currentData)}`
      );
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
      throw new Error(
        `Invalid ${TextAreaModelName} at '${this.formPathHelper.formPath.formConfig}': ${JSON.stringify(currentData)}`
      );
    }

    // Create the class instance for the config
    item.config = new TextAreaFieldModelConfig();

    this.sharedProps.sharedPopulateFieldModelConfig(item.config, currentData?.config);

    this.setModelValue(item, currentData?.config);
  }

  visitTextAreaFormComponentDefinition(item: TextAreaFormComponentDefinitionOutline): void {
    this.populateFormComponent(item);
  }

  /* Rich Text Editor */

  visitRichTextEditorFieldComponentDefinition(item: RichTextEditorFieldComponentDefinitionOutline): void {
    const currentData = this.getData();
    if (
      !isTypeFieldDefinitionName<RichTextEditorFieldComponentDefinitionFrame>(currentData, RichTextEditorComponentName)
    ) {
      throw new Error(
        `Invalid ${RichTextEditorComponentName} at '${this.formPathHelper.formPath.formConfig}': ${JSON.stringify(currentData)}`
      );
    }
    const config = currentData?.config;

    item.config = new RichTextEditorFieldComponentConfig();

    this.sharedProps.sharedPopulateFieldComponentConfig(item.config, config);

    this.sharedProps.setPropOverride('outputFormat', item.config, config);
    this.sharedProps.setPropOverride('showSourceToggle', item.config, config);
    this.sharedProps.setPropOverride('toolbar', item.config, config);
    this.sharedProps.setPropOverride('minHeight', item.config, config);
    this.sharedProps.setPropOverride('placeholder', item.config, config);
  }

  visitRichTextEditorFieldModelDefinition(item: RichTextEditorFieldModelDefinitionOutline): void {
    const currentData = this.getData();
    if (!isTypeFieldDefinitionName<RichTextEditorFieldModelDefinitionFrame>(currentData, RichTextEditorModelName)) {
      throw new Error(
        `Invalid ${RichTextEditorModelName} at '${this.formPathHelper.formPath.formConfig}': ${JSON.stringify(currentData)}`
      );
    }

    item.config = new RichTextEditorFieldModelConfig();

    this.sharedProps.sharedPopulateFieldModelConfig(item.config, currentData?.config);

    this.setModelValue(item, currentData?.config);
  }

  visitRichTextEditorFormComponentDefinition(item: RichTextEditorFormComponentDefinitionOutline): void {
    this.populateFormComponent(item);
  }

  /* Map */

  visitMapFieldComponentDefinition(item: MapFieldComponentDefinitionOutline): void {
    const currentData = this.getData();
    if (!isTypeFieldDefinitionName<MapFieldComponentDefinitionFrame>(currentData, MapComponentName)) {
      throw new Error(
        `Invalid ${MapComponentName} at '${this.formPathHelper.formPath.formConfig}': ${JSON.stringify(currentData)}`
      );
    }
    const config = currentData?.config;

    item.config = new MapFieldComponentConfig();

    this.sharedProps.sharedPopulateFieldComponentConfig(item.config, config);

    this.sharedProps.setPropOverride('center', item.config, config);
    this.sharedProps.setPropOverride('zoom', item.config, config);
    this.sharedProps.setPropOverride('mapHeight', item.config, config);
    this.sharedProps.setPropOverride('tileLayers', item.config, config);
    this.sharedProps.setPropOverride('enabledModes', item.config, config);
    this.sharedProps.setPropOverride('enableImport', item.config, config);
    this.sharedProps.setPropOverride('coordinatesHelp', item.config, config);

    item.config.enabledModes = this.sanitizeMapEnabledModes(item.config.enabledModes, 'construct');
  }

  visitMapFieldModelDefinition(item: MapFieldModelDefinitionOutline): void {
    const currentData = this.getData();
    if (!isTypeFieldDefinitionName<MapFieldModelDefinitionFrame>(currentData, MapModelName)) {
      throw new Error(
        `Invalid ${MapModelName} at '${this.formPathHelper.formPath.formConfig}': ${JSON.stringify(currentData)}`
      );
    }

    item.config = new MapFieldModelConfig();

    this.sharedProps.sharedPopulateFieldModelConfig(item.config, currentData?.config);

    this.setModelValue(item, currentData?.config);
  }

  visitMapFormComponentDefinition(item: MapFormComponentDefinitionOutline): void {
    this.populateFormComponent(item);
  }

  /* File Upload */

  visitFileUploadFieldComponentDefinition(item: FileUploadFieldComponentDefinitionOutline): void {
    const currentData = this.getData();
    if (!isTypeFieldDefinitionName<FileUploadFieldComponentDefinitionFrame>(currentData, FileUploadComponentName)) {
      throw new Error(
        `Invalid ${FileUploadComponentName} at '${this.formPathHelper.formPath.formConfig}': ${JSON.stringify(currentData)}`
      );
    }
    const config = currentData?.config;

    item.config = new FileUploadFieldComponentConfig();

    this.sharedProps.sharedPopulateFieldComponentConfig(item.config, config);

    this.sharedProps.setPropOverride('restrictions', item.config, config);
    this.sharedProps.setPropOverride('enabledSources', item.config, config);
    this.sharedProps.setPropOverride('companionUrl', item.config, config);
    this.sharedProps.setPropOverride('allowUploadWithoutSave', item.config, config);
    this.sharedProps.setPropOverride('uppyDashboardNote', item.config, config);
    this.sharedProps.setPropOverride('tusHeaders', item.config, config);
  }

  visitFileUploadFieldModelDefinition(item: FileUploadFieldModelDefinitionOutline): void {
    const currentData = this.getData();
    if (!isTypeFieldDefinitionName<FileUploadFieldModelDefinitionFrame>(currentData, FileUploadModelName)) {
      throw new Error(
        `Invalid ${FileUploadModelName} at '${this.formPathHelper.formPath.formConfig}': ${JSON.stringify(currentData)}`
      );
    }

    item.config = new FileUploadFieldModelConfig();

    this.sharedProps.sharedPopulateFieldModelConfig(item.config, currentData?.config);

    this.setModelValue(item, currentData?.config);
  }

  visitFileUploadFormComponentDefinition(item: FileUploadFormComponentDefinitionOutline): void {
    this.populateFormComponent(item);
  }

  /* Default Layout  */

  visitDefaultFieldLayoutDefinition(item: DefaultFieldLayoutDefinitionOutline): void {
    // Get the current raw data for constructing the class instance.
    const currentData = this.getData();
    if (!isTypeFieldDefinitionName<DefaultFieldLayoutDefinitionFrame>(currentData, DefaultLayoutName)) {
      throw new Error(
        `Invalid ${DefaultLayoutName} at '${this.formPathHelper.formPath.formConfig}': ${JSON.stringify(currentData)}`
      );
    }

    // Create the class instance for the config
    item.config = new DefaultFieldLayoutConfig();

    this.sharedProps.sharedPopulateFieldLayoutConfig(item.config, currentData?.config);
  }

  /* Checkbox Input */

  visitCheckboxInputFieldComponentDefinition(item: CheckboxInputFieldComponentDefinitionOutline): void {
    // Get the current raw data for constructing the class instance.
    const currentData = this.getData();
    if (
      !isTypeFieldDefinitionName<CheckboxInputFieldComponentDefinitionFrame>(currentData, CheckboxInputComponentName)
    ) {
      throw new Error(
        `Invalid ${CheckboxInputComponentName} at '${this.formPathHelper.formPath.formConfig}': ${JSON.stringify(currentData)}`
      );
    }
    const config = currentData?.config;

    // Create the class instance for the config
    item.config = new CheckboxInputFieldComponentConfig();

    this.sharedProps.sharedPopulateFieldComponentConfig(item.config, config);

    this.sharedProps.setPropOverride('placeholder', item.config, config);
    this.sharedProps.setPropOverride('options', item.config, config);
    this.sharedProps.setPropOverride('multipleValues', item.config, config);
    this.sharedProps.setPropOverride('vocabRef', item.config, config);
    this.sharedProps.setPropOverride('inlineVocab', item.config, config);
  }

  visitCheckboxInputFieldModelDefinition(item: CheckboxInputFieldModelDefinitionOutline): void {
    // Get the current raw data for constructing the class instance.
    const currentData = this.getData();
    if (!isTypeFieldDefinitionName<CheckboxInputFieldModelDefinitionFrame>(currentData, CheckboxInputModelName)) {
      throw new Error(
        `Invalid ${CheckboxInputModelName} at '${this.formPathHelper.formPath.formConfig}': ${JSON.stringify(currentData)}`
      );
    }

    // Create the class instance for the config
    item.config = new CheckboxInputFieldModelConfig();

    this.sharedProps.sharedPopulateFieldModelConfig(item.config, currentData?.config);

    this.setModelValue(item, currentData?.config);
  }

  visitCheckboxInputFormComponentDefinition(item: CheckboxInputFormComponentDefinitionOutline): void {
    this.populateFormComponent(item);
  }

  /* Checkbox Tree */

  visitCheckboxTreeFieldComponentDefinition(item: CheckboxTreeFieldComponentDefinitionOutline): void {
    // Get the current raw data for constructing the class instance.
    const currentData = this.getData();
    if (!isTypeFieldDefinitionName<CheckboxTreeFieldComponentDefinitionFrame>(currentData, CheckboxTreeComponentName)) {
      throw new Error(
        `Invalid ${CheckboxTreeComponentName} at '${this.formPathHelper.formPath.formConfig}': ${JSON.stringify(currentData)}`
      );
    }
    const config = currentData?.config;

    // Create the class instance for the config
    item.config = new CheckboxTreeFieldComponentConfig();

    this.sharedProps.sharedPopulateFieldComponentConfig(item.config, config);

    this.sharedProps.setPropOverride('vocabRef', item.config, config);
    this.sharedProps.setPropOverride('inlineVocab', item.config, config);
    this.sharedProps.setPropOverride('treeData', item.config, config);
    this.sharedProps.setPropOverride('leafOnly', item.config, config);
    this.sharedProps.setPropOverride('maxDepth', item.config, config);
    this.sharedProps.setPropOverride('labelTemplate', item.config, config);
  }

  visitCheckboxTreeFieldModelDefinition(item: CheckboxTreeFieldModelDefinitionOutline): void {
    // Get the current raw data for constructing the class instance.
    const currentData = this.getData();
    if (!isTypeFieldDefinitionName<CheckboxTreeFieldModelDefinitionFrame>(currentData, CheckboxTreeModelName)) {
      throw new Error(
        `Invalid ${CheckboxTreeModelName} at '${this.formPathHelper.formPath.formConfig}': ${JSON.stringify(currentData)}`
      );
    }

    // Create the class instance for the config
    item.config = new CheckboxTreeFieldModelConfig();

    this.sharedProps.sharedPopulateFieldModelConfig(item.config, currentData?.config);

    this.setModelValue(item, currentData?.config);
  }

  visitCheckboxTreeFormComponentDefinition(item: CheckboxTreeFormComponentDefinitionOutline): void {
    this.populateFormComponent(item);
  }

  /* Dropdown Input */

  visitDropdownInputFieldComponentDefinition(item: DropdownInputFieldComponentDefinitionOutline): void {
    // Get the current raw data for constructing the class instance.
    const currentData = this.getData();
    if (
      !isTypeFieldDefinitionName<DropdownInputFieldComponentDefinitionFrame>(currentData, DropdownInputComponentName)
    ) {
      throw new Error(
        `Invalid ${DropdownInputComponentName} at '${this.formPathHelper.formPath.formConfig}': ${JSON.stringify(currentData)}`
      );
    }
    const config = currentData?.config;

    // Create the class instance for the config
    item.config = new DropdownInputFieldComponentConfig();

    this.sharedProps.sharedPopulateFieldComponentConfig(item.config, config);

    this.sharedProps.setPropOverride('placeholder', item.config, config);
    this.sharedProps.setPropOverride('options', item.config, config);
    this.sharedProps.setPropOverride('vocabRef', item.config, config);
    this.sharedProps.setPropOverride('inlineVocab', item.config, config);
  }

  visitDropdownInputFieldModelDefinition(item: DropdownInputFieldModelDefinitionOutline): void {
    // Get the current raw data for constructing the class instance.
    const currentData = this.getData();
    if (!isTypeFieldDefinitionName<DropdownInputFieldModelDefinitionFrame>(currentData, DropdownInputModelName)) {
      throw new Error(
        `Invalid ${DropdownInputModelName} at '${this.formPathHelper.formPath.formConfig}': ${JSON.stringify(currentData)}`
      );
    }

    // Create the class instance for the config
    item.config = new DropdownInputFieldModelConfig();

    this.sharedProps.sharedPopulateFieldModelConfig(item.config, currentData?.config);

    this.setModelValue(item, currentData?.config);
  }

  visitDropdownInputFormComponentDefinition(item: DropdownInputFormComponentDefinitionOutline): void {
    this.populateFormComponent(item);
  }

  /* Typeahead Input */

  visitTypeaheadInputFieldComponentDefinition(item: TypeaheadInputFieldComponentDefinitionOutline): void {
    const currentData = this.getData();
    if (
      !isTypeFieldDefinitionName<TypeaheadInputFieldComponentDefinitionFrame>(currentData, TypeaheadInputComponentName)
    ) {
      throw new Error(
        `Invalid ${TypeaheadInputComponentName} at '${this.formPathHelper.formPath.formConfig}': ${JSON.stringify(currentData)}`
      );
    }
    const config = currentData?.config;

    item.config = new TypeaheadInputFieldComponentConfig();
    this.sharedProps.sharedPopulateFieldComponentConfig(item.config, config);

    this.sharedProps.setPropOverride('sourceType', item.config, config);
    this.sharedProps.setPropOverride('staticOptions', item.config, config);
    this.sharedProps.setPropOverride('vocabRef', item.config, config);
    this.sharedProps.setPropOverride('queryId', item.config, config);
    this.sharedProps.setPropOverride('labelField', item.config, config);
    this.sharedProps.setPropOverride('labelTemplate', item.config, config);
    this.sharedProps.setPropOverride('valueField', item.config, config);
    this.sharedProps.setPropOverride('minChars', item.config, config);
    this.sharedProps.setPropOverride('debounceMs', item.config, config);
    this.sharedProps.setPropOverride('maxResults', item.config, config);
    this.sharedProps.setPropOverride('allowFreeText', item.config, config);
    this.sharedProps.setPropOverride('valueMode', item.config, config);
    this.sharedProps.setPropOverride('cacheResults', item.config, config);
    this.sharedProps.setPropOverride('multiSelect', item.config, config);
    this.sharedProps.setPropOverride('placeholder', item.config, config);
    this.sharedProps.setPropOverride('readOnlyAfterSelect', item.config, config);

    const sourceType = item.config.sourceType ?? 'static';
    if (sourceType === 'namedQuery') {
      if (!item.config.labelField) {
        item.config.labelField = 'label';
      }
      if (!item.config.valueField) {
        item.config.valueField = 'value';
      }
      if (config?.cacheResults === undefined) {
        item.config.cacheResults = false;
      }
    } else if (config?.cacheResults === undefined) {
      item.config.cacheResults = true;
    }

    const minChars = Number(item.config.minChars);
    const debounceMs = Number(item.config.debounceMs);
    const maxResults = Number(item.config.maxResults);
    if (!Number.isInteger(minChars) || minChars < 0) {
      item.config.minChars = 2;
    }
    if (!Number.isInteger(debounceMs) || debounceMs < 0) {
      item.config.debounceMs = 250;
    }
    if (!Number.isInteger(maxResults) || maxResults <= 0) {
      item.config.maxResults = 25;
    }

    item.config.allowFreeText = Boolean(item.config.allowFreeText);
    item.config.multiSelect = Boolean(item.config.multiSelect);
  }

  visitTypeaheadInputFieldModelDefinition(item: TypeaheadInputFieldModelDefinitionOutline): void {
    const currentData = this.getData();
    if (!isTypeFieldDefinitionName<TypeaheadInputFieldModelDefinitionFrame>(currentData, TypeaheadInputModelName)) {
      throw new Error(
        `Invalid ${TypeaheadInputModelName} at '${this.formPathHelper.formPath.formConfig}': ${JSON.stringify(currentData)}`
      );
    }

    item.config = new TypeaheadInputFieldModelConfig();
    this.sharedProps.sharedPopulateFieldModelConfig(item.config, currentData?.config);

    this.setModelValue(item, currentData?.config);
  }

  visitTypeaheadInputFormComponentDefinition(item: TypeaheadInputFormComponentDefinitionOutline): void {
    this.populateFormComponent(item);
  }

  /* Radio Input */

  visitRadioInputFieldComponentDefinition(item: RadioInputFieldComponentDefinitionOutline): void {
    // Get the current raw data for constructing the class instance.
    const currentData = this.getData();
    if (!isTypeFieldDefinitionName<RadioInputFieldComponentDefinitionFrame>(currentData, RadioInputComponentName)) {
      throw new Error(
        `Invalid ${RadioInputComponentName} at '${this.formPathHelper.formPath.formConfig}': ${JSON.stringify(currentData)}`
      );
    }
    const config = currentData?.config;

    // Create the class instance for the config
    item.config = new RadioInputFieldComponentConfig();

    this.sharedProps.sharedPopulateFieldComponentConfig(item.config, config);

    this.sharedProps.setPropOverride('options', item.config, config);
    this.sharedProps.setPropOverride('vocabRef', item.config, config);
    this.sharedProps.setPropOverride('inlineVocab', item.config, config);
  }

  visitRadioInputFieldModelDefinition(item: RadioInputFieldModelDefinitionOutline): void {
    // Get the current raw data for constructing the class instance.
    const currentData = this.getData();
    if (!isTypeFieldDefinitionName<RadioInputFieldModelDefinitionFrame>(currentData, RadioInputModelName)) {
      throw new Error(
        `Invalid ${RadioInputModelName} at '${this.formPathHelper.formPath.formConfig}': ${JSON.stringify(currentData)}`
      );
    }

    // Create the class instance for the config
    item.config = new RadioInputFieldModelConfig();

    this.sharedProps.sharedPopulateFieldModelConfig(item.config, currentData?.config);

    this.setModelValue(item, currentData?.config);
  }

  visitRadioInputFormComponentDefinition(item: RadioInputFormComponentDefinitionOutline): void {
    this.populateFormComponent(item);
  }

  /* Date Input */

  visitDateInputFieldComponentDefinition(item: DateInputFieldComponentDefinitionOutline): void {
    // Get the current raw data for constructing the class instance.
    const currentData = this.getData();
    if (!isTypeFieldDefinitionName<DateInputFieldComponentDefinitionFrame>(currentData, DateInputComponentName)) {
      throw new Error(
        `Invalid ${DateInputComponentName} at '${this.formPathHelper.formPath.formConfig}': ${JSON.stringify(currentData)}`
      );
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
      throw new Error(
        `Invalid ${DateInputModelName} at '${this.formPathHelper.formPath.formConfig}': ${JSON.stringify(currentData)}`
      );
    }

    // Create the class instance for the config
    item.config = new DateInputFieldModelConfig();

    this.sharedProps.sharedPopulateFieldModelConfig(item.config, currentData?.config);

    this.setModelValue(item, currentData?.config);
  }

  visitDateInputFormComponentDefinition(item: DateInputFormComponentDefinitionOutline): void {
    this.populateFormComponent(item);
  }

  /* Shared */

  protected constructFormComponent(item: FormComponentDefinitionFrame): AllFormComponentDefinitionOutlines {
    return this.sharedProps.sharedConstructFormComponent(item);
  }

  protected populateFormComponent(item: FormComponentDefinitionOutline) {
    const currentData = this.getData();
    if (!isTypeFormComponentDefinition(currentData)) {
      throw new Error(
        `Invalid FormComponentDefinition at '${this.formPathHelper.formPath.formConfig}': ${JSON.stringify(currentData)}`
      );
    }

    // NOTE: Leaving expressions form-level processing placeholder, currently unused and unimplemented.
    // Set the expressions
    item.expressions = [];
    const expressionNames = new Set<string>();
    for (const exprData of currentData.expressions ?? []) {
      if (expressionNames.has(exprData.name)) {
        throw new Error(`Duplicate name in expression: ${exprData.name}`);
      }
      expressionNames.add(exprData.name);

      const exprItem = new FormExpressionsConfig();
      exprItem.name = exprData.name;
      exprItem.description = exprData.description;
      const config = exprData.config;
      if (!config) {
        throw new Error(`Missing config for expression: ${exprData.name}`);
      }
      if ('operation' in config) {
        const opConfig = config as FormExpressionsOperationConfigFrame;
        exprItem.config = {
          operation: opConfig.operation,
          condition: opConfig.condition,
          conditionKind: opConfig.conditionKind,
          target: opConfig.target,
        };
      } else {
        const tmplConfig = config as FormExpressionsTemplateConfigFrame;
        exprItem.config = {
          template: tmplConfig.template,
          condition: tmplConfig.condition,
          conditionKind: tmplConfig.conditionKind,
          target: tmplConfig.target,
        };
      }
      item.expressions.push(exprItem);
    }

    const itemName = item?.name ?? '';
    const itemDefaultValue = currentData?.model?.config?.defaultValue;

    // Merge the default value if form default values are being used and item has a default value.
    // Repeatable elementTemplate and descendants cannot declare a defaultValue.
    const isElementTemplate = this.isMostRecentRepeatableElementTemplate();
    const isElementTemplateDescendant = this.isRepeatableElementTemplateDescendant();
    if (!isElementTemplate && !isElementTemplateDescendant) {
      this.mergeDefaultValues(itemName, itemDefaultValue);
    }

    // Continue visiting
    this.formPathHelper.acceptFormComponentDefinition(item);
  }

  /**
   * Set the model value from the record values.
   * @param item The field model component instance.
   * @param config The field model form config.
   * @protected
   */
  protected setModelValue(item: FieldModelDefinitionOutline<unknown>, config?: FieldModelConfigFrame<unknown>) {
    // Use defaultValue in form config, not value.
    if (item?.config?.value !== undefined || config?.value !== undefined) {
      throw new Error(
        `${this.logName}: Use 'model.config.defaultValue' in form config ` +
        `instead of 'model.config.value' - item: ${JSON.stringify(item)} config: ${JSON.stringify(config)}`
      );
    }

    if (item.config === null || item.config === undefined) {
      throw new Error(`${this.logName}: Missing config for item: ${JSON.stringify(item)}`);
    }

    const isElementTemplate = this.isMostRecentRepeatableElementTemplate();
    const isElementTemplateDescendant = this.isRepeatableElementTemplateDescendant();

    // Only elementTemplates can use newEntryValue.
    if (!isElementTemplate && (item.config.newEntryValue !== undefined || config?.newEntryValue !== undefined)) {
      throw new Error(
        `${this.logName}: Only repeatable elementTemplates can define 'model.config.newEntryValue', ` +
        `use 'model.config.defaultValue' in other places ` +
        `- item: ${JSON.stringify(item)} config: ${JSON.stringify(config)}`
      );
    }

    // The elementTemplate definitions cannot have a defaultValue.
    if (isElementTemplate && (item.config.defaultValue !== undefined || config?.defaultValue !== undefined)) {
      throw new Error(
        `${this.logName}: Set the repeatable elementTemplate new item default ` +
        `using 'elementTemplate.model.config.newEntryValue', not 'elementTemplate.model.config.defaultValue', ` +
        `set the repeatable default in 'repeatable.model.config.defaultValue' ` +
        `- item: ${JSON.stringify(item)} config: ${JSON.stringify(config)}`
      );
    }

    // Components in an elementTemplate cannot set default values.
    if (isElementTemplateDescendant && (item.config.defaultValue !== undefined || config?.defaultValue !== undefined)) {
      throw new Error(
        `${this.logName}: Set the repeatable elementTemplate descendant component new item default ` +
        `using 'elementTemplate.model.config.newEntryValue', ` +
        `set the repeatable default in 'repeatable.model.config.defaultValue', ` +
        `not the descendant components ` +
        `- item: ${JSON.stringify(item)} config: ${JSON.stringify(config)}`
      );
    }

    // Set the model.config.value or new item value
    if (isElementTemplate) {
      item.config.newEntryValue = config?.newEntryValue;
    } else if (!isElementTemplateDescendant) {
      // NOTE: It is useless to set the model.config.value on an elementTemplate or a descendant component.
      // The top-most repeatable must have either:
      // - no value, in which case the elementTemplate.model.config.newEntryValue will be used if one item is added by default; or
      // - a value, which will be used to populate the entire repeatable and so any value on nested components will be ignored.
      item.config.value = this.currentModelValue();

      // Remove the defaultValue property.
      if (item?.config && 'defaultValue' in item.config) {
        delete item.config.defaultValue;
      }
    }
  }

  /**
   * Get the value for the current data model path.
   * @param itemDefaultValue The default value if there is no existing value.
   * @protected
   */
  protected currentModelValue(itemDefaultValue?: unknown): unknown {
    // Use the collected default value if form config default values are being used, otherwise, use the record values.
    const useFormConfigDefaultValues = this.recordValues === null;

    const defaultValue = this.currentDefaultValue(itemDefaultValue);
    const recordValue = this.currentRecordValue();

    // For debugging:
    // this.logger.info(`currentModelValue itemDefaultValue ${JSON.stringify(itemDefaultValue)} defaultValue ${JSON.stringify(defaultValue)} recordValue ${JSON.stringify(recordValue)} formPath ${JSON.stringify(this.formPathHelper.formPath.dataModel)}`);

    return useFormConfigDefaultValues ? defaultValue : recordValue;
  }

  /**
   * Get the default value for the current data model path.
   * @param itemDefaultValue The default value if no default value was provided in the form config.
   * @protected
   */
  protected currentDefaultValue(itemDefaultValue?: unknown) {
    const dataModelPath = this.formPathHelper.formPath.dataModel;
    return _cloneDeep(_get(this.extractedDefaultValues, dataModelPath, itemDefaultValue));
  }

  /**
   * Get the record / existing value for the current data model path.
   * @protected
   */
  protected currentRecordValue() {
    const dataModelPath = this.formPathHelper.formPath.dataModel;
    return _cloneDeep(_get(this.recordValues, dataModelPath, undefined));
  }

  /**
   * Check whether the current form config path matches the
   * most recent repeatable element template path.
   * @protected
   */
  protected isMostRecentRepeatableElementTemplate(): boolean {
    const mostRecent = this.mostRecentRepeatableElementTemplatePath ?? [];
    const formConfig = this.formPathHelper.formPath.formConfig;
    if (!mostRecent || mostRecent.length === 0 || !formConfig || formConfig.length === 0) {
      return false;
    }
    // Either array can have 'component', 'model', 'layout' at the end and
    // still match if the other array is one item shorter.
    const allowedExtras: LineagePath = ['component', 'model', 'layout'];
    if (mostRecent.length === formConfig.length) {
      return mostRecent.every((value, index) => value === formConfig[index]);
    } else if (mostRecent.length === formConfig.length - 1) {
      return (
        allowedExtras.includes(formConfig[formConfig.length - 1]) &&
        mostRecent.every((value, index) => value === formConfig[index])
      );
    } else if (mostRecent.length - 1 === formConfig.length) {
      return (
        allowedExtras.includes(mostRecent[mostRecent.length - 1]) &&
        formConfig.every((value, index) => value === mostRecent[index])
      );
    }
    return false;
  }

  /**
   * Check whether the current form config path is a descendant (and not a match)
   * of the most recent repeatable element template path.
   * @protected
   */
  protected isRepeatableElementTemplateDescendant(): boolean {
    const mostRecentPath = this.mostRecentRepeatableElementTemplatePath ?? [];
    const formConfigPath = this.formPathHelper.formPath.formConfig;
    if (!mostRecentPath || mostRecentPath.length === 0 || !formConfigPath || formConfigPath.length === 0) {
      return false;
    }
    // The formConfig path might have ["[component|model|layout]", "config"] at the end (2 additional items),
    // but only the path up to ["config", "elementTemplate"] is relevant for this check.
    if (formConfigPath.length + 2 <= mostRecentPath.length) {
      return false;
    }
    return mostRecentPath.every((value, index) => value === formConfigPath[index]);
  }

  /**
   * Merge the items' default value into the intermediate values.
   * @param itemName The item name.
   * @param itemDefaultValue The item's default value.
   * @protected
   */
  protected mergeDefaultValues(itemName: string, itemDefaultValue: unknown): void {
    const isElementTemplate = this.isMostRecentRepeatableElementTemplate();
    const isElementTemplateDescendant = this.isRepeatableElementTemplateDescendant();
    if (isElementTemplate || isElementTemplateDescendant) {
      throw new Error(
        `${this.logName}: Cannot merge default values for a repeatable elementTemplate or descendants ` +
        `- itemName: ${JSON.stringify(itemName)} itemDefaultValue: ${JSON.stringify(itemDefaultValue)}`
      );
    }

    if (itemName && itemDefaultValue !== undefined) {
      // Set the default value at the current data model path.
      // This makes it easier to merge defaults.
      const dataModelPath = this.formPathHelper.formPath.dataModel;
      const dataModelWithDefaultValue = _set({}, dataModelPath, itemDefaultValue);
      // Merging is only needed if there is a default value.
      if (dataModelWithDefaultValue !== undefined) {
        // Use lodash mergeWith because it will recurse into nested objects and arrays.
        // Object.assign and the spread operator do not recurse.
        // The lodash mergeWith also allows specifying how to handle arrays, which we need to handle in a special way.
        _mergeWith(this.extractedDefaultValues, dataModelWithDefaultValue, (objValue, srcValue) => {
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

  private sanitizeMapEnabledModes(rawModes: unknown, source: 'construct' | 'migrate'): MapDrawingMode[] {
    const fallback: MapDrawingMode[] = ['point', 'polygon', 'linestring', 'rectangle', 'select'];
    if (!Array.isArray(rawModes)) {
      return fallback;
    }
    const validModes: MapDrawingMode[] = [];
    const invalidModes: unknown[] = [];
    for (const mode of rawModes) {
      if (
        mode === 'point' ||
        mode === 'polygon' ||
        mode === 'linestring' ||
        mode === 'rectangle' ||
        mode === 'select'
      ) {
        validModes.push(mode);
      } else {
        invalidModes.push(mode);
      }
    }
    if (invalidModes.length > 0) {
      this.logger.warn(
        `${this.logName}: Map ${source} dropped unsupported enabledModes values at ${JSON.stringify(this.formPathHelper.formPath.formConfig)}: ${JSON.stringify(invalidModes)}.`
      );
    }
    return validModes;
  }

  protected getData() {
    const formConfigData = this.data;
    const formConfigPath = this.formPathHelper.formPath.formConfig;

    if (!formConfigPath || formConfigPath.length < 1) {
      return formConfigData;
    }

    return _get(
      formConfigData,
      formConfigPath.map(i => i.toString())
    );
  }
}
