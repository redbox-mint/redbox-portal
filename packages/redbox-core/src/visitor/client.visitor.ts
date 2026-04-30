import { cloneDeep as _cloneDeep } from 'lodash';
import { FormConfigOutline } from '@researchdatabox/sails-ng-common';
import {
  SimpleInputFieldComponentDefinitionOutline,
  SimpleInputFieldModelDefinitionOutline,
  SimpleInputFormComponentDefinitionOutline,
} from '@researchdatabox/sails-ng-common';
import {
  ContentFieldComponentDefinitionOutline,
  ContentFormComponentDefinitionOutline,
} from '@researchdatabox/sails-ng-common';
import {
  RepeatableElementFieldLayoutDefinitionOutline,
  RepeatableFieldComponentDefinitionOutline,
  RepeatableFieldModelDefinitionOutline,
  RepeatableFormComponentDefinitionOutline,
} from '@researchdatabox/sails-ng-common';
import {
  ValidationSummaryFieldComponentDefinitionOutline,
  ValidationSummaryFormComponentDefinitionOutline,
} from '@researchdatabox/sails-ng-common';
import {
  SuggestedValidationSummaryFieldComponentDefinitionOutline,
  SuggestedValidationSummaryFormComponentDefinitionOutline,
} from '@researchdatabox/sails-ng-common';
import {
  SaveStatusFieldComponentDefinitionOutline,
  SaveStatusFormComponentDefinitionOutline,
} from '@researchdatabox/sails-ng-common';
import {
  GroupFieldComponentDefinitionOutline,
  GroupFieldModelDefinitionOutline,
  GroupFormComponentDefinitionOutline,
} from '@researchdatabox/sails-ng-common';
import {
  TabFieldComponentDefinitionOutline,
  TabFieldLayoutDefinitionOutline,
  TabFormComponentDefinitionOutline,
} from '@researchdatabox/sails-ng-common';
import {
  AccordionFieldComponentDefinitionOutline,
  AccordionFieldLayoutDefinitionOutline,
  AccordionFormComponentDefinitionOutline,
  AccordionPanelFieldComponentDefinitionOutline,
  AccordionPanelFieldLayoutDefinitionOutline,
  AccordionPanelFormComponentDefinitionOutline,
} from '@researchdatabox/sails-ng-common';
import {
  TabContentFieldComponentDefinitionOutline,
  TabContentFieldLayoutDefinitionOutline,
  TabContentFormComponentDefinitionOutline,
} from '@researchdatabox/sails-ng-common';
import {
  SaveButtonFieldComponentDefinitionOutline,
  SaveButtonFormComponentDefinitionOutline,
} from '@researchdatabox/sails-ng-common';
import {
  CancelButtonFieldComponentDefinitionOutline,
  CancelButtonFormComponentDefinitionOutline,
} from '@researchdatabox/sails-ng-common';
import {
  DeleteButtonFieldComponentDefinitionOutline,
  DeleteButtonFormComponentDefinitionOutline,
} from '@researchdatabox/sails-ng-common';
import {
  TabNavButtonFieldComponentDefinitionOutline,
  TabNavButtonFormComponentDefinitionOutline,
} from '@researchdatabox/sails-ng-common';
import {
  TextAreaFieldComponentDefinitionOutline,
  TextAreaFieldModelDefinitionOutline,
  TextAreaFormComponentDefinitionOutline,
} from '@researchdatabox/sails-ng-common';
import {DefaultFieldLayoutDefinitionOutline} from '@researchdatabox/sails-ng-common';
import {ActionRowLayoutName} from '@researchdatabox/sails-ng-common';
import {
  CheckboxInputFieldComponentDefinitionOutline,
  CheckboxInputFieldModelDefinitionOutline,
  CheckboxInputFormComponentDefinitionOutline,
} from '@researchdatabox/sails-ng-common';
import {
  CheckboxTreeFieldComponentDefinitionOutline,
  CheckboxTreeFieldModelDefinitionOutline,
  CheckboxTreeFormComponentDefinitionOutline,
} from '@researchdatabox/sails-ng-common';
import {
  RecordSelectorFieldComponentDefinitionOutline,
  RecordSelectorFieldModelDefinitionOutline,
  RecordSelectorFormComponentDefinitionOutline,
} from '@researchdatabox/sails-ng-common';
import {
  DropdownInputFieldComponentDefinitionOutline,
  DropdownInputFieldModelDefinitionOutline,
  DropdownInputFormComponentDefinitionOutline,
} from '@researchdatabox/sails-ng-common';
import {
  TypeaheadInputFieldComponentDefinitionOutline,
  TypeaheadInputFieldModelDefinitionOutline,
  TypeaheadInputFormComponentDefinitionOutline,
} from '@researchdatabox/sails-ng-common';
import {
  RichTextEditorFieldComponentDefinitionOutline,
  RichTextEditorFieldModelDefinitionOutline,
  RichTextEditorFormComponentDefinitionOutline,
} from '@researchdatabox/sails-ng-common';
import {
  MapFieldComponentDefinitionOutline,
  MapFieldModelDefinitionOutline,
  MapFormComponentDefinitionOutline,
} from '@researchdatabox/sails-ng-common';
import {
  FileUploadFieldComponentDefinitionOutline,
  FileUploadFieldModelDefinitionOutline,
  FileUploadFormComponentDefinitionOutline,
} from '@researchdatabox/sails-ng-common';
import {
  PDFListFieldComponentDefinitionOutline,
  PDFListFieldModelDefinitionOutline,
  PDFListFormComponentDefinitionOutline,
} from '@researchdatabox/sails-ng-common';
import {
  DataLocationFieldComponentDefinitionOutline,
  DataLocationFieldModelDefinitionOutline,
  DataLocationFormComponentDefinitionOutline,
} from '@researchdatabox/sails-ng-common';
import {
  PublishDataLocationRefreshFieldComponentDefinitionOutline,
  PublishDataLocationRefreshFormComponentDefinitionOutline,
} from '@researchdatabox/sails-ng-common';
import {
  PublishDataLocationSelectorFieldComponentDefinitionOutline,
  PublishDataLocationSelectorFieldModelDefinitionOutline,
  PublishDataLocationSelectorFormComponentDefinitionOutline,
} from '@researchdatabox/sails-ng-common';
import {
  RadioInputFieldComponentDefinitionOutline,
  RadioInputFieldModelDefinitionOutline,
  RadioInputFormComponentDefinitionOutline,
} from '@researchdatabox/sails-ng-common';
import {
  DateInputFieldComponentDefinitionOutline,
  DateInputFieldModelDefinitionOutline,
  DateInputFormComponentDefinitionOutline,
} from '@researchdatabox/sails-ng-common';
import {
  QuestionTreeFieldComponentDefinitionOutline,
  QuestionTreeFieldModelDefinitionOutline,
  QuestionTreeFormComponentDefinitionOutline,
} from '@researchdatabox/sails-ng-common';
import {FormConstraintConfig} from '@researchdatabox/sails-ng-common';
import {AvailableFormComponentDefinitionOutlines} from '@researchdatabox/sails-ng-common';
import {FormComponentDefinitionOutline} from '@researchdatabox/sails-ng-common';
import {FieldComponentDefinitionOutline} from '@researchdatabox/sails-ng-common';
import {FieldModelDefinitionOutline} from '@researchdatabox/sails-ng-common';
import {FieldLayoutDefinitionOutline} from '@researchdatabox/sails-ng-common';
import {
  RecordMetadataRetrieverFieldComponentDefinitionOutline,
  RecordMetadataRetrieverFormComponentDefinitionOutline,
} from '@researchdatabox/sails-ng-common';
import {ReusableFormDefinitions} from '@researchdatabox/sails-ng-common';
import {ILogger} from '@researchdatabox/sails-ng-common';
import {FormConfig} from '@researchdatabox/sails-ng-common';
import {FormConfigVisitor} from '@researchdatabox/sails-ng-common';
import {FormModesConfig} from '@researchdatabox/sails-ng-common';
import {FormPathHelper} from '@researchdatabox/sails-ng-common';
import {isTypeWithComponentDefinitions} from '@researchdatabox/sails-ng-common';
import {JsonTypeDefSchemaFormConfigVisitor} from './json-type-def.visitor';
import {guessType} from '@researchdatabox/sails-ng-common';
import {FormOverride} from '@researchdatabox/sails-ng-common';
import {GroupFieldComponentName} from '@researchdatabox/sails-ng-common';
import {RepeatableComponentName} from '@researchdatabox/sails-ng-common';
import {QuestionTreeComponentName} from '@researchdatabox/sails-ng-common';

/**
 * Visit each form config class type and build the form config for the client-side.
 *
 * This visitor performs the tasks to make the form config suitable for the client:
 * - remove fields with constraints that are not met by the provided formMode or userRoles
 * - process expressions, as these must be retrieved by the client separately
 * - remove fields that have value 'undefined'
 * - remove repeatable.model.config.value items that have no matching component
 * - remove repeatable.elementTemplate.model.config.newEntryValue items that have no matching component
 *
 * TODO: future improvements to the client form config visitor:
 *  - use the field component config property 'defaultComponentCssClasses' to set the component css classes, then remove the property
 *  - use the form config property 'defaultLayoutComponent' to set the default layout, then remove the property
 *  - use the form config property 'defaultComponentConfig' to set the default component config, then remove the property
 *  - use the various 'viewCssClasses' and 'editCssClasses' to set the css classes depending on the form mode, then remove these properties
 *  - use the various 'wrapperCssClasses' and 'hostCssClasses' to set the css classes in the relevant config, then remove these properties??
 */
export class ClientFormConfigVisitor extends FormConfigVisitor {
  protected override logName = 'ClientFormConfigVisitor';

  private clientFormConfig: FormConfigOutline;
  private formMode: FormModesConfig;
  private formModeProvided: boolean;
  private userRoles: string[];
  private reusableFormDefs: ReusableFormDefinitions;

  private constraintPath: FormConstraintConfig[];

  private formPathHelper: FormPathHelper;
  private formOverride: FormOverride;

  constructor(logger: ILogger) {
    super(logger);

    this.clientFormConfig = new FormConfig();
    this.formMode = 'view';
    this.formModeProvided = false;
    this.userRoles = [];
    this.reusableFormDefs = {};

    this.constraintPath = [];

    this.formPathHelper = new FormPathHelper(logger, this);
    this.formOverride = new FormOverride(logger);
  }

  /**
   * Start the visitor.
   *
   * Note that `options.form` will be modified, and is the same as the return value.
   * It is implemented this way because the class instance methods are needed and functions are not cloned.
   *
   * @param options Configure the visitor.
   * @param options.form The constructed form.
   * @param options.formMode The currently active form mode.
   * @param options.userRoles The current user's roles.
   */
  start(options: {
    form: FormConfigOutline;
    formMode?: FormModesConfig;
    userRoles?: string[];
    reusableFormDefs?: ReusableFormDefinitions;
  }) {
    this.clientFormConfig = options.form;
    this.formMode = options.formMode ?? 'view';
    this.formModeProvided = options.formMode !== undefined;
    this.userRoles = options.userRoles ?? [];
    this.reusableFormDefs = options.reusableFormDefs ?? {};

    this.constraintPath = [];
    this.formPathHelper.reset();

    this.clientFormConfig.accept(this);
    this.applyPostPruningViewModeTransforms();

    return this.clientFormConfig;
  }

  protected applyPostPruningViewModeTransforms(): void {
    if (this.formMode !== 'view' || !this.formModeProvided) {
      return;
    }
    if (!Array.isArray(this.clientFormConfig.componentDefinitions)) {
      return;
    }
    this.clientFormConfig.componentDefinitions = this.applyPostPruningTransforms(
      this.clientFormConfig.componentDefinitions
    );
  }

  protected applyPostPruningTransforms(
    items: AvailableFormComponentDefinitionOutlines[]
  ): AvailableFormComponentDefinitionOutlines[] {
    return items
      .filter(item => !this.isExplicitlyDisallowedByFormMode(item))
      .map(item => this.applyPostPruningTransformToComponent(item));
  }

  protected isExplicitlyDisallowedByFormMode(item: AvailableFormComponentDefinitionOutlines): boolean {
    const allowModes = item?.constraints?.allowModes;
    return Array.isArray(allowModes) && allowModes.length > 0 && !allowModes.includes(this.formMode);
  }

  protected applyPostPruningTransformToComponent(
    item: AvailableFormComponentDefinitionOutlines
  ): AvailableFormComponentDefinitionOutlines {
    const className = item?.component?.class;
    const shouldTransformRepeatable = className === RepeatableComponentName;
    const shouldTransformGroup = className === GroupFieldComponentName && item?.layout?.class !== ActionRowLayoutName;
    const shouldTransformQuestionTree = className === QuestionTreeComponentName;
    const shouldSkipViewTransform = this.hasExplicitAllowedMode(item, 'view');

    if (shouldTransformRepeatable || shouldTransformGroup || shouldTransformQuestionTree) {
      if (shouldSkipViewTransform) {
        this.applyPostPruningTransformsToNestedChildren(item);
        if ('constraints' in item) {
          delete item['constraints'];
        }
        return item;
      }

      const transformed = this.formOverride.applyOverrideTransform(item, this.formMode, {
        phase: 'client',
        reusableFormDefs: this.reusableFormDefs,
      }) as AvailableFormComponentDefinitionOutlines;
      this.processFormComponentDefinition(transformed);
      this.applyPostPruningTransformsToNestedChildren(transformed);
      if ('constraints' in transformed) {
        delete transformed['constraints'];
      }
      return transformed;
    }

    this.applyPostPruningTransformsToNestedChildren(item);
    return item;
  }

  protected hasExplicitAllowedMode(item: AvailableFormComponentDefinitionOutlines, mode: FormModesConfig): boolean {
    const overrides = item?.overrides as Record<string, unknown> | undefined;
    if (overrides?.__forceViewTransform === true) {
      return false;
    }
    const allowModes = item?.constraints?.allowModes;
    return Array.isArray(allowModes) && allowModes.includes(mode);
  }

  protected applyPostPruningTransformsToNestedChildren(item: AvailableFormComponentDefinitionOutlines): void {
    const config = item?.component?.config as Record<string, unknown> | undefined;
    if (!config) {
      return;
    }

    if (Array.isArray(config.componentDefinitions)) {
      config.componentDefinitions = this.applyPostPruningTransforms(
        config.componentDefinitions as AvailableFormComponentDefinitionOutlines[]
      );
    }
    if (Array.isArray(config.tabs)) {
      config.tabs = this.applyPostPruningTransforms(config.tabs as AvailableFormComponentDefinitionOutlines[]);
    }
    if (Array.isArray(config.panels)) {
      config.panels = this.applyPostPruningTransforms(config.panels as AvailableFormComponentDefinitionOutlines[]);
    }
  }

  visitFormConfig(item: FormConfigOutline): void {
    // Behaviours follow the same client-delivery pattern as expressions:
    // compile JSONata on the server, strip raw source from the delivered config,
    // and leave marker flags so the Angular runtime knows which compiled keys to
    // evaluate. JSONPointer conditions remain inline because they are cheap and
    // already executable in the browser without compiled assets.
    //
    // v1 intentionally only strips the built-in behaviour templates defined in
    // the implementation plan. Future extensibility would likely move this to a
    // more generic registry-driven mechanism.
    const behaviours = (item as FormConfigOutline & { behaviours?: Array<Record<string, unknown>> }).behaviours;
    (behaviours ?? []).forEach((behaviour: Record<string, unknown>) => {
      const typedBehaviour = behaviour as Record<string, unknown> & {
        condition?: string;
        conditionKind?: string;
        hasCondition?: boolean;
        processors?: Array<{ config?: { template?: string; hasTemplate?: boolean } }>;
        actions: Array<{ config: Record<string, unknown> }>;
        onError?: Array<{ config: Record<string, unknown> }>;
      };
      const conditionKind = typedBehaviour.conditionKind ?? 'jsonpointer';
      if (conditionKind !== 'jsonpointer') {
        typedBehaviour.hasCondition = typedBehaviour.condition !== undefined;
        delete typedBehaviour.condition;
      }

      (typedBehaviour.processors ?? []).forEach(processor => {
        const config = processor.config as { template?: string; hasTemplate?: boolean } | undefined;
        if (config?.template) {
          config.hasTemplate = true;
          delete config.template;
        }
      });

      [typedBehaviour.actions, typedBehaviour.onError].forEach(actions => {
        (actions ?? []).forEach(action => {
          const config = action.config as {
            valueTemplate?: string;
            hasValueTemplate?: boolean;
            fieldPath?: string;
            fieldPathKind?: string;
            hasFieldPathTemplate?: boolean;
          };

          if (config.valueTemplate) {
            config.hasValueTemplate = true;
            delete config.valueTemplate;
          }
          if (config.fieldPathKind === 'jsonata' && config.fieldPath) {
            config.hasFieldPathTemplate = true;
            delete config.fieldPath;
          }
        });
      });
    });

    this.removePropsUndefined(item);
    const items: AvailableFormComponentDefinitionOutlines[] = [];
    const that = this;
    (item?.componentDefinitions ?? []).forEach((componentDefinition, index) => {
      items.push(componentDefinition);
      // Visit children
      that.formPathHelper.acceptFormPath(
        componentDefinition,
        that.formPathHelper.lineagePathsForFormConfigComponentDefinition(componentDefinition, index)
      );
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
    this.acceptCheckConstraintsCurrentPath(item);
    this.processFormComponentDefinition(item);
  }

  /* Content */

  visitContentFieldComponentDefinition(item: ContentFieldComponentDefinitionOutline): void {
    this.processFieldComponentDefinition(item);
  }

  visitContentFormComponentDefinition(item: ContentFormComponentDefinitionOutline): void {
    this.acceptCheckConstraintsCurrentPath(item);
    this.processFormComponentDefinition(item);
  }

  /* Repeatable  */

  visitRepeatableFieldComponentDefinition(item: RepeatableFieldComponentDefinitionOutline): void {
    this.processFieldComponentDefinition(item);

    const componentDefinition = item?.config?.elementTemplate;
    if (componentDefinition) {
      this.formPathHelper.acceptFormPath(
        componentDefinition,
        this.formPathHelper.lineagePathsForRepeatableFieldComponentDefinition(componentDefinition)
      );
    }
  }

  visitRepeatableFieldModelDefinition(item: RepeatableFieldModelDefinitionOutline): void {
    this.processFieldModelDefinition(item);
  }

  visitRepeatableElementFieldLayoutDefinition(item: RepeatableElementFieldLayoutDefinitionOutline): void {
    this.processFieldLayoutDefinition(item);
  }

  visitRepeatableFormComponentDefinition(item: RepeatableFormComponentDefinitionOutline): void {
    this.acceptCheckConstraintsCurrentPath(item);
    this.processFormComponentDefinition(item);

    // if the element template is empty, this is an invalid component
    // indicate this by deleting all properties on item
    if (!this.hasObjectProps(item.component?.config?.elementTemplate)) {
      this.removePropsAll(item);
    }

    // Constraints may remove some components.
    // The data model items in 'repeatable.model.config.value' and
    // 'repeatable.elementTemplate.model.config.newEntryValue'
    // need to be updated to reflect any changes in components.
    this.updateRepeatableDataModels(item);
  }

  /* Validation Summary */

  visitValidationSummaryFieldComponentDefinition(item: ValidationSummaryFieldComponentDefinitionOutline): void {
    this.processFieldComponentDefinition(item);
  }

  visitValidationSummaryFormComponentDefinition(item: ValidationSummaryFormComponentDefinitionOutline): void {
    this.acceptCheckConstraintsCurrentPath(item);
    this.processFormComponentDefinition(item);
  }

  visitSuggestedValidationSummaryFieldComponentDefinition(item: SuggestedValidationSummaryFieldComponentDefinitionOutline): void {
    this.processFieldComponentDefinition(item);
  }

  visitSuggestedValidationSummaryFormComponentDefinition(item: SuggestedValidationSummaryFormComponentDefinitionOutline): void {
    this.acceptCheckConstraintsCurrentPath(item);
    this.processFormComponentDefinition(item);
  }

  visitSaveStatusFieldComponentDefinition(item: SaveStatusFieldComponentDefinitionOutline): void {
    this.processFieldComponentDefinition(item);
  }

  visitSaveStatusFormComponentDefinition(item: SaveStatusFormComponentDefinitionOutline): void {
    this.acceptCheckConstraintsCurrentPath(item);
    this.processFormComponentDefinition(item);
  }

  /* Group */

  visitGroupFieldComponentDefinition(item: GroupFieldComponentDefinitionOutline): void {
    this.processFieldComponentDefinition(item);

    const items: AvailableFormComponentDefinitionOutlines[] = [];
    const that = this;
    (item?.config?.componentDefinitions ?? []).forEach((componentDefinition, index) => {
      items.push(componentDefinition);
      that.formPathHelper.acceptFormPath(
        componentDefinition,
        this.formPathHelper.lineagePathsForGroupFieldComponentDefinition(componentDefinition, index)
      );
    });
    if (item.config) {
      item.config.componentDefinitions = items.filter(i => this.hasObjectProps(i));
    }
  }

  visitGroupFieldModelDefinition(item: GroupFieldModelDefinitionOutline): void {
    this.processFieldModelDefinition(item);
  }

  visitGroupFormComponentDefinition(item: GroupFormComponentDefinitionOutline): void {
    this.acceptCheckConstraintsCurrentPath(item);
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
      this.formPathHelper.acceptFormPath(
        componentDefinition,
        this.formPathHelper.lineagePathsForTabFieldComponentDefinition(componentDefinition, index)
      );
    });
  }

  visitTabFieldLayoutDefinition(item: TabFieldLayoutDefinitionOutline): void {
    this.processFieldLayoutDefinition(item);
  }

  visitTabFormComponentDefinition(item: TabFormComponentDefinitionOutline): void {
    this.acceptCheckConstraintsCurrentPath(item);
    this.processFormComponentDefinition(item);

    // if there are no tabs, this is an invalid component
    // indicate this by deleting all properties on item
    if ((item.component?.config?.tabs ?? [])?.length === 0) {
      this.removePropsAll(item);
    }
  }

  /* Accordion */

  visitAccordionFieldComponentDefinition(item: AccordionFieldComponentDefinitionOutline): void {
    this.processFieldComponentDefinition(item);

    (item.config?.panels ?? []).forEach((componentDefinition, index) => {
      this.formPathHelper.acceptFormPath(
        componentDefinition,
        this.formPathHelper.lineagePathsForAccordionFieldComponentDefinition(componentDefinition, index)
      );
    });
  }

  visitAccordionFieldLayoutDefinition(item: AccordionFieldLayoutDefinitionOutline): void {
    this.processFieldLayoutDefinition(item);
  }

  visitAccordionFormComponentDefinition(item: AccordionFormComponentDefinitionOutline): void {
    this.acceptCheckConstraintsCurrentPath(item);
    this.processFormComponentDefinition(item);

    if ((item.component?.config?.panels ?? [])?.length === 0) {
      this.removePropsAll(item);
    }
  }

  visitAccordionPanelFieldComponentDefinition(item: AccordionPanelFieldComponentDefinitionOutline): void {
    this.processFieldComponentDefinition(item);

    const items: AvailableFormComponentDefinitionOutlines[] = [];
    (item.config?.componentDefinitions ?? []).forEach((componentDefinition, index) => {
      items.push(componentDefinition);
      this.formPathHelper.acceptFormPath(
        componentDefinition,
        this.formPathHelper.lineagePathsForAccordionPanelFieldComponentDefinition(componentDefinition, index)
      );
    });
    if (item.config) {
      item.config.componentDefinitions = items.filter(i => this.hasObjectProps(i));
    }
  }

  visitAccordionPanelFieldLayoutDefinition(item: AccordionPanelFieldLayoutDefinitionOutline): void {
    this.processFieldLayoutDefinition(item);
  }

  visitAccordionPanelFormComponentDefinition(item: AccordionPanelFormComponentDefinitionOutline): void {
    this.acceptCheckConstraintsCurrentPath(item);
    this.processFormComponentDefinition(item);

    if ((item.component?.config?.componentDefinitions ?? []).length === 0) {
      this.removePropsAll(item);
    }
  }

  /*  Tab Content */

  visitTabContentFieldComponentDefinition(item: TabContentFieldComponentDefinitionOutline): void {
    this.processFieldComponentDefinition(item);

    const items: AvailableFormComponentDefinitionOutlines[] = [];
    (item.config?.componentDefinitions ?? []).forEach((componentDefinition, index) => {
      items.push(componentDefinition);
      // Visit children
      this.formPathHelper.acceptFormPath(
        componentDefinition,
        this.formPathHelper.lineagePathsForTabContentFieldComponentDefinition(componentDefinition, index)
      );
    });
    if (item.config) {
      item.config.componentDefinitions = items.filter(i => this.hasObjectProps(i));
    }
  }

  visitTabContentFieldLayoutDefinition(item: TabContentFieldLayoutDefinitionOutline): void {
    this.processFieldLayoutDefinition(item);
  }

  visitTabContentFormComponentDefinition(item: TabContentFormComponentDefinitionOutline): void {
    this.acceptCheckConstraintsCurrentPath(item);
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
    this.acceptCheckConstraintsCurrentPath(item);
    this.processFormComponentDefinition(item);
  }

  /* Cancel Button  */

  visitCancelButtonFieldComponentDefinition(item: CancelButtonFieldComponentDefinitionOutline): void {
    this.processFieldComponentDefinition(item);
  }

  visitCancelButtonFormComponentDefinition(item: CancelButtonFormComponentDefinitionOutline): void {
    this.acceptCheckConstraintsCurrentPath(item);
    this.processFormComponentDefinition(item);
  }

  visitDeleteButtonFieldComponentDefinition(item: DeleteButtonFieldComponentDefinitionOutline): void {
    this.processFieldComponentDefinition(item);
  }

  visitDeleteButtonFormComponentDefinition(item: DeleteButtonFormComponentDefinitionOutline): void {
    this.acceptCheckConstraintsCurrentPath(item);
    this.processFormComponentDefinition(item);
  }

  /* Tab Nav Button  */

  visitTabNavButtonFieldComponentDefinition(item: TabNavButtonFieldComponentDefinitionOutline): void {
    this.processFieldComponentDefinition(item);
  }

  visitTabNavButtonFormComponentDefinition(item: TabNavButtonFormComponentDefinitionOutline): void {
    this.acceptCheckConstraintsCurrentPath(item);
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
    this.acceptCheckConstraintsCurrentPath(item);
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
    this.acceptCheckConstraintsCurrentPath(item);
    this.processFormComponentDefinition(item);
  }

  /* Checkbox Tree */

  visitCheckboxTreeFieldComponentDefinition(item: CheckboxTreeFieldComponentDefinitionOutline): void {
    this.processFieldComponentDefinition(item);
  }

  visitCheckboxTreeFieldModelDefinition(item: CheckboxTreeFieldModelDefinitionOutline): void {
    this.processFieldModelDefinition(item);
  }

  visitCheckboxTreeFormComponentDefinition(item: CheckboxTreeFormComponentDefinitionOutline): void {
    this.acceptCheckConstraintsCurrentPath(item);
    this.processFormComponentDefinition(item);
  }

  /* Record Selector */

  visitRecordSelectorFieldComponentDefinition(item: RecordSelectorFieldComponentDefinitionOutline): void {
    this.processFieldComponentDefinition(item);
  }

  visitRecordSelectorFieldModelDefinition(item: RecordSelectorFieldModelDefinitionOutline): void {
    this.processFieldModelDefinition(item);
  }

  visitRecordSelectorFormComponentDefinition(item: RecordSelectorFormComponentDefinitionOutline): void {
    this.acceptCheckConstraintsCurrentPath(item);
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
    this.acceptCheckConstraintsCurrentPath(item);
    this.processFormComponentDefinition(item);
  }

  /* Typeahead Input */

  visitTypeaheadInputFieldComponentDefinition(item: TypeaheadInputFieldComponentDefinitionOutline): void {
    this.processFieldComponentDefinition(item);
  }

  visitTypeaheadInputFieldModelDefinition(item: TypeaheadInputFieldModelDefinitionOutline): void {
    this.processFieldModelDefinition(item);
  }

  visitTypeaheadInputFormComponentDefinition(item: TypeaheadInputFormComponentDefinitionOutline): void {
    this.acceptCheckConstraintsCurrentPath(item);
    this.processFormComponentDefinition(item);
  }

  /* Rich Text Editor */

  visitRichTextEditorFieldComponentDefinition(item: RichTextEditorFieldComponentDefinitionOutline): void {
    this.processFieldComponentDefinition(item);
  }

  visitRichTextEditorFieldModelDefinition(item: RichTextEditorFieldModelDefinitionOutline): void {
    this.processFieldModelDefinition(item);
  }

  visitRichTextEditorFormComponentDefinition(item: RichTextEditorFormComponentDefinitionOutline): void {
    this.acceptCheckConstraintsCurrentPath(item);
    this.processFormComponentDefinition(item);
  }

  /* Map */

  visitMapFieldComponentDefinition(item: MapFieldComponentDefinitionOutline): void {
    this.processFieldComponentDefinition(item);
  }

  visitMapFieldModelDefinition(item: MapFieldModelDefinitionOutline): void {
    this.processFieldModelDefinition(item);
  }

  visitMapFormComponentDefinition(item: MapFormComponentDefinitionOutline): void {
    this.acceptCheckConstraintsCurrentPath(item);
    this.processFormComponentDefinition(item);
  }

  /* File Upload */

  visitFileUploadFieldComponentDefinition(item: FileUploadFieldComponentDefinitionOutline): void {
    this.processFieldComponentDefinition(item);
  }

  visitFileUploadFieldModelDefinition(item: FileUploadFieldModelDefinitionOutline): void {
    this.processFieldModelDefinition(item);
  }

  visitFileUploadFormComponentDefinition(item: FileUploadFormComponentDefinitionOutline): void {
    this.acceptCheckConstraintsCurrentPath(item);
    this.processFormComponentDefinition(item);
  }

  /* PDF List */

  visitPDFListFieldComponentDefinition(item: PDFListFieldComponentDefinitionOutline): void {
    this.processFieldComponentDefinition(item);
  }

  visitPDFListFieldModelDefinition(item: PDFListFieldModelDefinitionOutline): void {
    this.processFieldModelDefinition(item);
  }

  visitPDFListFormComponentDefinition(item: PDFListFormComponentDefinitionOutline): void {
    this.acceptCheckConstraintsCurrentPath(item);
    this.processFormComponentDefinition(item);
  }

  /* Record Metadata Retriever */

  visitRecordMetadataRetrieverFieldComponentDefinition(
    item: RecordMetadataRetrieverFieldComponentDefinitionOutline
  ): void {
    this.processFieldComponentDefinition(item);
  }

  visitRecordMetadataRetrieverFormComponentDefinition(
    item: RecordMetadataRetrieverFormComponentDefinitionOutline
  ): void {
    this.acceptCheckConstraintsCurrentPath(item);
    this.processFormComponentDefinition(item);
  }

  /* Data Location */

  visitDataLocationFieldComponentDefinition(item: DataLocationFieldComponentDefinitionOutline): void {
    this.processFieldComponentDefinition(item);
  }

  visitDataLocationFieldModelDefinition(item: DataLocationFieldModelDefinitionOutline): void {
    this.processFieldModelDefinition(item);
  }

  visitDataLocationFormComponentDefinition(item: DataLocationFormComponentDefinitionOutline): void {
    this.acceptCheckConstraintsCurrentPath(item);
    this.processFormComponentDefinition(item);
  }

  // Client visitor treats the refresh trigger like any other field component,
  // but there is intentionally no model companion to process.
  visitPublishDataLocationRefreshFieldComponentDefinition(
    item: PublishDataLocationRefreshFieldComponentDefinitionOutline
  ): void {
    this.processFieldComponentDefinition(item);
  }

  visitPublishDataLocationRefreshFormComponentDefinition(
    item: PublishDataLocationRefreshFormComponentDefinitionOutline
  ): void {
    this.acceptCheckConstraintsCurrentPath(item);
    this.processFormComponentDefinition(item);
  }

  visitPublishDataLocationSelectorFieldComponentDefinition(
    item: PublishDataLocationSelectorFieldComponentDefinitionOutline
  ): void {
    this.processFieldComponentDefinition(item);
  }

  visitPublishDataLocationSelectorFieldModelDefinition(
    item: PublishDataLocationSelectorFieldModelDefinitionOutline
  ): void {
    this.processFieldModelDefinition(item);
  }

  visitPublishDataLocationSelectorFormComponentDefinition(
    item: PublishDataLocationSelectorFormComponentDefinitionOutline
  ): void {
    this.acceptCheckConstraintsCurrentPath(item);
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
    this.acceptCheckConstraintsCurrentPath(item);
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
    this.acceptCheckConstraintsCurrentPath(item);
    this.processFormComponentDefinition(item);
  }

  /* Question Tree */

  visitQuestionTreeFieldComponentDefinition(item: QuestionTreeFieldComponentDefinitionOutline): void {
    this.processFieldComponentDefinition(item);

    const items: AvailableFormComponentDefinitionOutlines[] = [];
    (item?.config?.componentDefinitions ?? []).forEach((componentDefinition, index) => {
      items.push(componentDefinition);
      this.formPathHelper.acceptFormPath(
        componentDefinition,
        this.formPathHelper.lineagePathsForQuestionTreeFieldComponentDefinition(componentDefinition, index)
      );
    });
    if (item.config) {
      item.config.componentDefinitions = items.filter(i => this.hasObjectProps(i));
    }
  }

  visitQuestionTreeFieldModelDefinition(item: QuestionTreeFieldModelDefinitionOutline): void {
    this.processFieldModelDefinition(item);
  }

  visitQuestionTreeFormComponentDefinition(item: QuestionTreeFormComponentDefinitionOutline): void {
    this.acceptCheckConstraintsCurrentPath(item);
    this.processFormComponentDefinition(item);

    if ((item.component?.config?.componentDefinitions ?? [])?.length === 0) {
      this.removePropsAll(item);
    }
  }

  /* Shared */

  protected processFormComponentDefinition(item: FormComponentDefinitionOutline) {
    const isPostPruningCandidate =
      this.formMode === 'view' &&
      this.formModeProvided &&
      (item?.component?.class === RepeatableComponentName ||
        item?.component?.class === GroupFieldComponentName ||
        item?.component?.class === QuestionTreeComponentName);

    // Constraint define the criteria for including a component.
    // The client has no need for the constraints.
    if ('constraints' in item && !isPostPruningCandidate) {
      delete item['constraints'];
    }
    // Expressions must be compiled on the server, then retrieved by the client.
    // The raw expressions must not be available to the client.
    if ('expressions' in item) {
      // Loop through the expressions and remove `template` if defined and set the `hasTemplate` flag
      item.expressions?.forEach(expr => {
        expr.config.hasTemplate = 'template' in expr?.config && expr.config?.template !== undefined && expr.config?.template !== null;
        this.removePropsUndefined(expr);
        this.removePropsUndefined(expr.config);
      });
      if (item.expressions?.length === 0) {
        delete item['expressions'];
      }
    }
    this.removePropsUndefined(item);
  }

  protected processFieldComponentDefinition(item: FieldComponentDefinitionOutline) {
    this.removeShowValidIndicatorIfDefault(item);
    this.removePropsUndefined(item);
    this.removePropsUndefined(item?.config ?? {});
  }

  protected removeShowValidIndicatorIfDefault(
    item: FieldComponentDefinitionOutline | FieldLayoutDefinitionOutline | null | undefined
  ) {
    const config = (item?.config ?? {}) as globalThis.Record<string, unknown>;
    if (config.showValidIndicator === false) {
      delete config.showValidIndicator;
    }
  }

  protected processFieldModelDefinition(item: FieldModelDefinitionOutline<unknown>) {
    this.removePropsUndefined(item);
    this.removePropsUndefined(item?.config ?? {});
  }

  protected processFieldLayoutDefinition(item: FieldLayoutDefinitionOutline) {
    this.removeShowValidIndicatorIfDefault(item);
    if (this.formModeProvided && this.formMode === 'view' && item?.config) {
      delete item.config.helpText;
      delete item.config.helpTextVisibleOnInit;
      delete item.config.helpTextVisible;
    }
    this.removePropsUndefined(item);
    this.removePropsUndefined(item?.config ?? {});
  }

  protected removePropsAll(item: object | null | undefined) {
    const mutable = (item ?? {}) as globalThis.Record<string, unknown>;
    for (const key of Object.keys(mutable)) {
      delete mutable[key];
    }
  }

  protected removePropsUndefined(item: object | null | undefined) {
    const mutable = (item ?? {}) as globalThis.Record<string, unknown>;
    for (const [key, value] of Object.entries(mutable)) {
      if (value === undefined) {
        delete mutable[key];
      }
    }
  }

  protected isAllowedByUserRoles(): boolean {
    const currentUserRoles = Array.from(new Set(this.userRoles.filter(i => !!i)));
    const constraints = this.constraintPath;
    const requiredRoles = Array.from(
      new Set(constraints?.map(b => b?.authorization?.allowRoles ?? [])?.filter(i => i.length > 0) ?? [])
    );

    // The current user must have at least one of the roles required by each component.
    return requiredRoles?.every(i => {
      const isArray = Array.isArray(i);
      const hasElements = i.length > 0;
      const hasAtLeastOneUserRole = hasElements && currentUserRoles.some(c => i.includes(c));
      return (isArray && hasElements && hasAtLeastOneUserRole) || !isArray || !hasElements;
    });
  }

  protected isAllowedByFormMode(): boolean {
    const currentContextMode = this.formMode;
    const constraints = this.constraintPath;
    const requiredModes = Array.from(
      new Set(constraints?.map(b => b?.allowModes ?? [])?.filter(i => i.length > 0) ?? [])
    );

    // The allowed modes must include the form mode.
    return requiredModes?.every(i => {
      const isArray = Array.isArray(i);
      const hasElements = i.length > 0;
      const hasMode = hasElements && currentContextMode && i.includes(currentContextMode);
      return (isArray && hasElements && hasMode) || !isArray || !hasElements;
    });
  }

  protected acceptCheckConstraintsCurrentPath(item: AvailableFormComponentDefinitionOutlines) {
    const currentConstraintPath = [...this.constraintPath];
    try {
      // add constraints to constraintPath before and after processing components
      // if the component has constraints
      if (item.constraints !== undefined && this.hasObjectProps(item.constraints)) {
        this.constraintPath = [...currentConstraintPath, item.constraints];
      }

      const allowedByUserRoles = this.isAllowedByUserRoles();
      const allowedByFormMode = this.isAllowedByFormMode();
      if (allowedByUserRoles && allowedByFormMode) {
        this.formPathHelper.acceptFormComponentDefinition(item);
      } else {
        this.removePropsAll(item);
      }
    } finally {
      this.constraintPath = currentConstraintPath;
    }
  }

  protected hasObjectProps(item: unknown): boolean {
    if (!item || typeof item !== 'object') {
      return false;
    }
    return Object.keys(item).length > 0;
  }

  /**
   * The data model items in 'repeatable.model.value' and 'repeatable.elementTemplate.model.config.newEntryValue'
   * need to reflect any components removed via constraints.
   * The item's data models will be updated to match the components.
   * @param item The repeatable form component.
   * @protected
   */
  protected updateRepeatableDataModels(item: RepeatableFormComponentDefinitionOutline): void {
    this.updateLayoutVisibilityForZeroRows(item);

    const elementTemplate = item.component?.config?.elementTemplate;
    const elementTemplateCompConfig = elementTemplate?.component?.config;

    if (!isTypeWithComponentDefinitions(elementTemplateCompConfig)) {
      // The elementTemplate does not have nested components. Nothing to update.
      return;
    }

    // Build the data model schema from the components.
    // NOTE: This depends on the repeatable model being set already.
    const schemaVisitor = new JsonTypeDefSchemaFormConfigVisitor(this.logger);
    const elementTemplateFormConfig = new FormConfig();
    elementTemplateFormConfig.componentDefinitions = _cloneDeep(elementTemplateCompConfig.componentDefinitions);
    const elementTemplateSchema = schemaVisitor.start({form: elementTemplateFormConfig});

    // Remove any data model items that are not present in the schema.
    const itemValue = item.model?.config?.value;
    if (Array.isArray(itemValue) && item.model?.config) {
      item.model.config.value = itemValue.map(value => this.buildDataMatchingSchema(elementTemplateSchema, [], value, []) ?? {});
    }

    const newEntryValue = elementTemplate?.model?.config?.newEntryValue;
    if (elementTemplate?.model?.config) {
      elementTemplate.model.config.newEntryValue = this.buildDataMatchingSchema(elementTemplateSchema, [], newEntryValue, []) as any ?? {};
    }
  }

  protected updateLayoutVisibilityForZeroRows(item: RepeatableFormComponentDefinitionOutline): void {
    const hideWhenZeroRows = item.component?.config?.hideWhenZeroRows;
    const valueLength = item.model?.config?.value?.length ?? 0;
    if (hideWhenZeroRows && valueLength === 0) {
      if (item.layout?.config) {
        item.layout.config.visible = false;
      }
      if (item.component?.config) {
        item.component.config.visible = false;
      }
    }
  }

  /**
   * Match the schema at the given path to the value at the given path.
   * @param currentSchema The current schema.
   * @param schemaPath The current path within the schema.
   * @param currentValue The current data.
   * @param valuePath The current path within the value.
   * @return The updated value.
   */
  public buildDataMatchingSchema(
    currentSchema: Record<string, unknown>, schemaPath: string[], currentValue: unknown, valuePath: string[]
  ): unknown {
    currentSchema = currentSchema ?? {};
    schemaPath = schemaPath ?? [];
    valuePath = valuePath ?? [];

    let result: unknown = structuredClone(currentValue);
    const schemaKeys = Object.keys(currentSchema);
    const propKeys = ['properties', 'optionalProperties'];

    // For debugging:
    // this.logger.warn(`buildDataMatchingSchema ${JSON.stringify({currentSchema, schemaPath, result, valuePath})}`);

    if ((!currentSchema || schemaKeys.length === 0)) {
      // TODO: If there are no components that have a data model,
      //   there will be no schema, so there is nothing to check and update.
      //   If there is no schema, then even if there is data, the data cannot be checked without a schema.
      return result;
    } else if (schemaKeys.includes('elements') && schemaKeys.length === 1) {
      const elementsSchema = (currentSchema['elements'] ?? {}) as Record<string, unknown>;
      result = this.buildDataMatchingSchemaElements(elementsSchema, [...schemaPath, 'elements'], result, valuePath);

    } else if (schemaKeys.includes('type') && schemaKeys.length === 1) {
      const typeSchema = (currentSchema['type'] ?? {}) as Record<string, unknown>;
      result = this.buildDataMatchingSchemaType(typeSchema, [...schemaPath, 'type'], result, valuePath);

    } else if (schemaKeys.length > 0 && schemaKeys.filter(k => !propKeys.includes(k)).length === 0) {
      // Process required and optional properties.
      const propertiesSchema = (currentSchema['properties'] ?? {}) as Record<string, unknown>;
      result = this.buildDataMatchingSchemaProperties(propertiesSchema, [...schemaPath, 'properties'], result, valuePath);
      const optionalPropertiesSchema = (currentSchema['optionalProperties'] ?? {}) as Record<string, unknown>;
      result = this.buildDataMatchingSchemaProperties(optionalPropertiesSchema, [...schemaPath, 'optionalProperties'], result, valuePath);

      // Remove properties not in the schema.
      const resultObj = (result ?? {}) as Record<string, unknown>;
      const resultKeys = Object.keys(resultObj);
      const propSchemaKeys = [...Object.keys(propertiesSchema), ...Object.keys(optionalPropertiesSchema)];
      for (const key of resultKeys) {
        // Remove names missing in the schema.
        if (!propSchemaKeys.includes(key) && Object.hasOwn(resultObj, key)) {
          delete (result as Record<string, unknown>)[key];
        }
      }

    } else {
      throw new Error(`Unknown schema structure '${JSON.stringify(currentSchema)}'.`);
    }

    return result
  }

  /**
   * Match an object to the schema. Removes any keys that do not existing the schema.
   * @param currentSchema The current schema.
   * @param schemaPath The current path within the schema.
   * @param currentValue The current data.
   * @param valuePath The current path within the value.
   * @return The updated value.
   * @protected
   */
  protected buildDataMatchingSchemaProperties(
    currentSchema: Record<string, unknown>, schemaPath: string[], currentValue: unknown, valuePath: string[]
  ): unknown {
    let currentValueType = guessType(currentValue);

    const result: Record<string, unknown> = {};

    if (currentValueType === 'object' && typeof currentValue === 'object') {
      Object.assign(result, structuredClone(currentValue));
    }

    // Allow missing or null object values - set an empty object.
    if (currentValue === undefined || currentValue === null) {
      currentValue = {};
      currentValueType = 'object';
    }

    // Legacy schema allowed a single value where an object is now expected.
    // Convert the single value to the object key 'name' if able.
    const schemaNames = Object.keys(currentSchema);
    const hasSchemaPropName = schemaNames.includes('name');
    const isCurrentValueNameType = ['string', 'timestamp', 'number', 'boolean'].includes(currentValueType);
    if (currentValueType !== 'object' && hasSchemaPropName && isCurrentValueNameType) {
      currentValueType = 'object';
      result.name = String(currentValue);
    }

    if (currentValueType !== 'object') {
      throw this.matchDataSchemaError('object', currentSchema, schemaPath, result, valuePath);
    }


    // Legacy schema has value instead of name.
    // Add the value as the name if name is missing.
    const isObjPropNameString = typeof result.name === 'string' && result.name.length > 0;
    const isObjPropValueString = typeof result.value === 'string' && result.value.length > 0;
    if (hasSchemaPropName && !isObjPropNameString && isObjPropValueString) {
      result.name = result.value;
    }

    // Build each of the current value's properties matching the schema.
    for (const key of Object.keys(result)) {
      // Remove names missing in the schema.
      if (!schemaNames.includes(key) && Object.hasOwn(result, key)) {
        // delete result[key];
      } else {
        const childSchema = currentSchema[key] as Record<string, unknown>;
        result[key] = this.buildDataMatchingSchema(childSchema, [...schemaPath, key], result[key], [...valuePath, key]);
      }
    }

    return result;
  }

  /**
   * Match each item in an array to the schema type.
   * @param currentSchema The current schema.
   * @param schemaPath The current path within the schema.
   * @param currentValue The current data.
   * @param valuePath The current path within the value.
   * @return The updated value.
   * @protected
   */
  protected buildDataMatchingSchemaElements(
    currentSchema: Record<string, unknown>, schemaPath: string[], currentValue: unknown, valuePath: string[]
  ): unknown {
    const currentValueType = guessType(currentValue);

    if (!Array.isArray(currentValue) || currentValueType !== 'array') {
      throw this.matchDataSchemaError('array', currentSchema, schemaPath, currentValue, valuePath);
    }

    return currentValue.map((v, i) =>
      this.buildDataMatchingSchema(currentSchema, [...schemaPath], v, [...valuePath, i.toString()])
    );
  }

  /**
   * Match a value to a schema type.
   * @param currentSchema The current schema.
   * @param schemaPath The current path within the schema.
   * @param currentValue The current data.
   * @param valuePath The current path within the value.
   * @return The updated value.
   * @protected
   */
  protected buildDataMatchingSchemaType(
    currentSchema: Record<string, unknown>, schemaPath: string[], currentValue: unknown, valuePath: string[]
  ): unknown {
    const currentSchemaType = String(currentSchema);
    const currentValueType = guessType(currentValue);

    // Allow a timestamp as a string.
    const isTimestampString = currentSchemaType === 'string' && currentValueType === 'timestamp';
    // Allow null values.
    const isNull = currentValueType === 'null';

    if (currentValueType !== currentSchemaType && !isNull && !isTimestampString) {
      throw this.matchDataSchemaError(currentSchemaType, currentSchema, schemaPath, currentValue, valuePath);
    }

    return currentValue;
  }

  /**
   * Create an error indicating the data that doesn't match the schema.
   * @param expectedType The expected type of the data.
   * @param currentSchema The current schema.
   * @param schemaPath The current path within the schema.
   * @param currentValue The current data.
   * @param valuePath The current path within the value.
   * @return An Error instance with the details of the match failure.
   * @protected
   */
  protected matchDataSchemaError(
    expectedType: string, currentSchema: Record<string, unknown>, schemaPath: string[], currentValue: unknown, valuePath: string[]
  ): Error {
    const currentValueType = guessType(currentValue);

    // TODO: do the json type def type names match the guessType names?
    return new Error(
      `Value and schema do not match. ` +
      `Value '${JSON.stringify(currentValue)}' at '${JSON.stringify(valuePath)}' is type '${currentValueType}'. ` +
      `Schema ${JSON.stringify(currentSchema)} at '${JSON.stringify(schemaPath)}' expected type '${expectedType}'.`
    );
  }
}
