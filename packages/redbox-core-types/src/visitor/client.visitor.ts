import { get as _get, set as _set, cloneDeep as _cloneDeep, map as _map } from 'lodash';
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
  TabNavButtonFieldComponentDefinitionOutline,
  TabNavButtonFormComponentDefinitionOutline,
} from '@researchdatabox/sails-ng-common';
import {
  TextAreaFieldComponentDefinitionOutline,
  TextAreaFieldModelDefinitionOutline,
  TextAreaFormComponentDefinitionOutline,
} from '@researchdatabox/sails-ng-common';
import { DefaultFieldLayoutDefinitionOutline } from '@researchdatabox/sails-ng-common';
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
  RadioInputFieldComponentDefinitionOutline,
  RadioInputFieldModelDefinitionOutline,
  RadioInputFormComponentDefinitionOutline,
} from '@researchdatabox/sails-ng-common';
import {
  DateInputFieldComponentDefinitionOutline,
  DateInputFieldModelDefinitionOutline,
  DateInputFormComponentDefinitionOutline,
} from '@researchdatabox/sails-ng-common';
import { FormConstraintConfig } from '@researchdatabox/sails-ng-common';
import { AvailableFormComponentDefinitionOutlines } from '@researchdatabox/sails-ng-common';
import { FormComponentDefinitionOutline } from '@researchdatabox/sails-ng-common';
import { FieldComponentDefinitionOutline } from '@researchdatabox/sails-ng-common';
import { FieldModelDefinitionOutline } from '@researchdatabox/sails-ng-common';
import { FieldLayoutDefinitionOutline } from '@researchdatabox/sails-ng-common';
import { ILogger } from '@researchdatabox/sails-ng-common';
import { FormConfig } from '@researchdatabox/sails-ng-common';
import { FormConfigVisitor } from '@researchdatabox/sails-ng-common';
import { FormModesConfig } from '@researchdatabox/sails-ng-common';
import { FormPathHelper } from '@researchdatabox/sails-ng-common';
import { isTypeWithComponentDefinitions } from '@researchdatabox/sails-ng-common';
import { JsonTypeDefSchemaFormConfigVisitor } from './json-type-def.visitor';
import { guessType } from '@researchdatabox/sails-ng-common';
import { FormOverride } from '@researchdatabox/sails-ng-common';
import { GroupFieldComponentName } from '@researchdatabox/sails-ng-common';
import { RepeatableComponentName } from '@researchdatabox/sails-ng-common';

/**
 * Visit each form config class type and build the form config for the client-side.
 *
 * This visitor performs the tasks to make the form config suitable for the client:
 * - remove fields with constraints that are not met by the provided formMode or userRoles
 * - remove expressions, as these must be processed by the server and retrieved by the client separately
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

  private constraintPath: FormConstraintConfig[];

  private formPathHelper: FormPathHelper;
  private formOverride: FormOverride;

  constructor(logger: ILogger) {
    super(logger);

    this.clientFormConfig = new FormConfig();
    this.formMode = 'view';
    this.formModeProvided = false;
    this.userRoles = [];

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
  start(options: { form: FormConfigOutline; formMode?: FormModesConfig; userRoles?: string[] }) {
    this.clientFormConfig = options.form;
    this.formMode = options.formMode ?? 'view';
    this.formModeProvided = options.formMode !== undefined;
    this.userRoles = options.userRoles ?? [];

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
    this.clientFormConfig.componentDefinitions = this.applyPostPruningTransforms(this.clientFormConfig.componentDefinitions, true);
  }

  protected applyPostPruningTransforms(
    items: AvailableFormComponentDefinitionOutlines[],
    isTopLevel: boolean
  ): AvailableFormComponentDefinitionOutlines[] {
    return items.map(item => this.applyPostPruningTransformToComponent(item, isTopLevel));
  }

  protected applyPostPruningTransformToComponent(
    item: AvailableFormComponentDefinitionOutlines,
    isTopLevel: boolean
  ): AvailableFormComponentDefinitionOutlines {
    const className = item?.component?.class;
    const shouldTransformRepeatable = className === RepeatableComponentName;
    const shouldTransformTopLevelGroup = isTopLevel && className === GroupFieldComponentName;

    if (shouldTransformRepeatable || shouldTransformTopLevelGroup) {
      const transformed = this.formOverride.applyOverrideTransform(item, this.formMode, { phase: "client" }) as AvailableFormComponentDefinitionOutlines;
      this.processFormComponentDefinition(transformed);
      return transformed;
    }

    const config = item?.component?.config as Record<string, unknown> | undefined;
    if (!config) {
      return item;
    }

    if (Array.isArray(config.componentDefinitions)) {
      config.componentDefinitions = this.applyPostPruningTransforms(
        config.componentDefinitions as AvailableFormComponentDefinitionOutlines[],
        false
      );
    }
    if (Array.isArray(config.tabs)) {
      config.tabs = this.applyPostPruningTransforms(
        config.tabs as AvailableFormComponentDefinitionOutlines[],
        false
      );
    }
    if (Array.isArray(config.panels)) {
      config.panels = this.applyPostPruningTransforms(
        config.panels as AvailableFormComponentDefinitionOutlines[],
        false
      );
    }
    return item;
  }

  visitFormConfig(item: FormConfigOutline): void {
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

    (item.config?.componentDefinitions ?? []).forEach((componentDefinition, index) => {
      this.formPathHelper.acceptFormPath(
        componentDefinition,
        this.formPathHelper.lineagePathsForAccordionPanelFieldComponentDefinition(componentDefinition, index)
      );
    });
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

    (item.config?.componentDefinitions ?? []).forEach((componentDefinition, index) => {
      // Visit children
      this.formPathHelper.acceptFormPath(
        componentDefinition,
        this.formPathHelper.lineagePathsForTabContentFieldComponentDefinition(componentDefinition, index)
      );
    });
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

  /* Shared */

  protected processFormComponentDefinition(item: FormComponentDefinitionOutline) {
    // Constraint define the criteria for including a component.
    // The client has no need for the constraints.
    if ('constraints' in item) {
      delete item['constraints'];
    }
    // Expressions must be compiled on the server, then retrieved by the client.
    // The raw expressions must not be available to the client.
    if ('expressions' in item) {
      // Loop through the expressions and remove `template` if defined and set the `hasTemplate` flag
      item.expressions = _map(item.expressions, expr => {
        expr.config.hasTemplate = expr.config?.template !== undefined && expr.config?.template !== null;
        return expr;
      });
      if (item.expressions.length === 0) {
        delete item['expressions'];
      }
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
    } catch (error) {
      throw error;
    } finally {
      this.constraintPath = currentConstraintPath;
    }
  }

  protected hasObjectProps(item: any): boolean {
    if (item === null || item === undefined) {
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
    const elementTemplate = item.component?.config?.elementTemplate;
    const elementTemplateCompConfig = elementTemplate?.component?.config;

    if (!isTypeWithComponentDefinitions(elementTemplateCompConfig)) {
      // The elementTemplate does not have nested components. Nothing to update.
      return;
    }

    // Build the data model schema from the components.
    // TODO: This depends on the repeatable model being set.
    const schemaVisitor = new JsonTypeDefSchemaFormConfigVisitor(this.logger);
    const elementTemplateFormConfig = new FormConfig();
    elementTemplateFormConfig.componentDefinitions = _cloneDeep(elementTemplateCompConfig.componentDefinitions);
    const elementTemplateSchema = schemaVisitor.start({ form: elementTemplateFormConfig });

    // Remove any data model items that are not present in the schema.
    const toProcess = [{ path: [], schema: elementTemplateSchema }];

    const itemValue = item.model?.config?.value;
    (itemValue ?? []).forEach(value => this.updateRepeatableDataModel(toProcess, value));

    const newEntryValue = elementTemplate?.model?.config?.newEntryValue;
    this.updateRepeatableDataModel(toProcess, newEntryValue);
  }

  /**
   * Update a value using the array of path and schema items.
   * @param toProcess The array of path and schema items.
   * @param value The value to compare to the paths and schemas.
   * @protected
   */
  protected updateRepeatableDataModel(
    toProcess: { path: string[]; schema: Record<string, unknown> }[],
    value: unknown
  ): void {
    const processing = [...toProcess];
    while (processing.length > 0) {
      const current = processing.shift();

      // Ignore empty item
      if (current === undefined || current === null) {
        continue;
      }

      const path = current.path;
      const schema = current.schema;

      let currentValue = path.length > 0 ? _get(value, path) : value;
      let currentValueType = guessType(currentValue);

      const errMsg1 = `Component and data model do not match. Component at '${JSON.stringify(path)}' expected`;
      const errMsg2 = `but got '${currentValueType}':`;
      for (const [schemaKey, schemaValue] of Object.entries(schema)) {
        const schemaCurrent = schemaValue as Record<string, unknown>;
        switch (schemaKey) {
          case 'properties':
            // Allow the value to be undefined - set an empty object.
            if (currentValue === undefined) {
              currentValue = {};
              if (path.length > 0) {
                _set(value as object, path, currentValue);
              } else {
                value = currentValue;
              }
              currentValueType = 'object';
            }
            if (currentValueType !== 'object') {
              throw new Error(`${errMsg1} an object, ${errMsg2} ${JSON.stringify(currentValue)}`);
            }
            // Remove names missing in the schema.
            // Add names in the schema to the to-process array.
            const schemaNames = Object.keys(schemaCurrent);
            Object.keys(currentValue).forEach(name => {
              if (!schemaNames.includes(name)) {
                delete currentValue[name];
              } else {
                processing.push({
                  path: [...path, name],
                  schema: schemaCurrent[name] as Record<string, unknown>,
                });
              }
            });
            break;
          case 'elements':
            if (currentValueType !== 'array') {
              throw new Error(`${errMsg1} an array, ${errMsg2} ${JSON.stringify(currentValue)}`);
            }
            // TODO: determine how elements will work
            throw new Error(
              `Not implemented updateRepeatableDataModel elements ${JSON.stringify({
                schemaKey,
                schemaValue,
                currentValue,
              })}`
            );
          // break;
          case 'type':
            // TODO: do the json type def type names match the guessType names?
            // Allow null values
            if (currentValueType !== schemaValue && currentValueType !== 'null') {
              throw new Error(`${errMsg1} ${schemaValue}, ${errMsg2} ${JSON.stringify(currentValue)}`);
            }
            // Nothing else to do.
            break;
          default:
            throw new Error(`Unknown schema type '${schemaKey}'.`);
        }
      }
    }
  }
}
