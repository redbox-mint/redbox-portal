import {
  CheckboxWithDetailsComponentName,
  CheckboxWithDetailsFieldComponentConfigOutline,
  CheckboxWithDetailsFormComponentDefinitionOutline,
  CheckboxWithDetailsOption,
  checkboxDetailFields,
  checkboxDetailsOptionPath,
} from '@researchdatabox/sails-ng-common';
import {
  FormConfigVisitor,
  FormValidatorConfig,
  FormValidatorControl,
  FormValidatorDefinition,
  FormValidatorSummaryErrors,
  SimpleServerFormValidatorControl,
  FormConfigOutline,
  ILogger,
  SimpleInputFieldComponentDefinitionOutline,
  SimpleInputFieldModelDefinitionOutline,
  SimpleInputFormComponentDefinitionOutline,
  guessType,
  FormComponentDefinitionOutline,
  ValidatorsSupport,
  ContentFieldComponentDefinitionOutline,
  ContentFormComponentDefinitionOutline,
  RelatedObjectDataFieldComponentDefinitionOutline,
  RelatedObjectDataFormComponentDefinitionOutline,
  RepeatableFieldComponentDefinitionOutline,
  RepeatableFieldModelDefinitionOutline,
  RepeatableElementFieldLayoutDefinitionOutline,
  RepeatableFormComponentDefinitionOutline,
  ValidationSummaryFieldComponentDefinitionOutline,
  ValidationSummaryFormComponentDefinitionOutline,
  SuggestedValidationSummaryFieldComponentDefinitionOutline,
  SuggestedValidationSummaryFormComponentDefinitionOutline,
  SaveStatusFieldComponentDefinitionOutline,
  SaveStatusFormComponentDefinitionOutline,
  IntegrationStatusFieldComponentDefinitionOutline,
  IntegrationStatusFormComponentDefinitionOutline,
  WorkspaceFieldComponentDefinitionOutline,
  WorkspaceFormComponentDefinitionOutline,
  GroupFieldComponentDefinitionOutline,
  GroupFieldModelDefinitionOutline,
  GroupFormComponentDefinitionOutline,
  TabFieldComponentDefinitionOutline,
  TabFieldLayoutDefinitionOutline,
  TabFormComponentDefinitionOutline,
  TabContentFieldComponentDefinitionOutline,
  TabContentFieldLayoutDefinitionOutline,
  TabContentFormComponentDefinitionOutline,
  AccordionFieldComponentDefinitionOutline,
  AccordionFieldLayoutDefinitionOutline,
  AccordionFormComponentDefinitionOutline,
  AccordionPanelFieldComponentDefinitionOutline,
  AccordionPanelFieldLayoutDefinitionOutline,
  AccordionPanelFormComponentDefinitionOutline,
  SaveButtonFieldComponentDefinitionOutline,
  SaveButtonFormComponentDefinitionOutline,
  CancelButtonFieldComponentDefinitionOutline,
  CancelButtonFormComponentDefinitionOutline,
  DeleteButtonFieldComponentDefinitionOutline,
  DeleteButtonFormComponentDefinitionOutline,
  TabNavButtonFieldComponentDefinitionOutline,
  TabNavButtonFormComponentDefinitionOutline,
  TextAreaFieldComponentDefinitionOutline,
  TextAreaFieldModelDefinitionOutline,
  TextAreaFormComponentDefinitionOutline,
  DefaultFieldLayoutDefinitionOutline,
  CheckboxInputFieldComponentDefinitionOutline,
  CheckboxInputFieldModelDefinitionOutline,
  CheckboxInputFormComponentDefinitionOutline,
  CheckboxTreeFieldComponentDefinitionOutline,
  CheckboxTreeFieldModelDefinitionOutline,
  CheckboxTreeFormComponentDefinitionOutline,
  RecordSelectorFieldComponentDefinitionOutline,
  RecordSelectorFieldModelDefinitionOutline,
  RecordSelectorFormComponentDefinitionOutline,
  DropdownInputFieldComponentDefinitionOutline,
  DropdownInputFieldModelDefinitionOutline,
  DropdownInputFormComponentDefinitionOutline,
  TypeaheadInputFieldComponentDefinitionOutline,
  TypeaheadInputFieldModelDefinitionOutline,
  TypeaheadInputFormComponentDefinitionOutline,
  TypeaheadInputPermissiveFieldComponentConfigOutline,
  RichTextEditorFieldComponentDefinitionOutline,
  RichTextEditorFieldModelDefinitionOutline,
  RichTextEditorFormComponentDefinitionOutline,
  MapDrawingMode,
  MapFieldComponentDefinitionOutline,
  MapFieldModelDefinitionOutline,
  MapFormComponentDefinitionOutline,
  FileUploadFieldComponentDefinitionOutline,
  FileUploadFieldModelDefinitionOutline,
  FileUploadFormComponentDefinitionOutline,
  PDFListFieldComponentDefinitionOutline,
  PDFListFieldModelDefinitionOutline,
  PDFListFormComponentDefinitionOutline,
  RecordMetadataRetrieverFieldComponentDefinitionOutline,
  RecordMetadataRetrieverFormComponentDefinitionOutline,
  DataLocationFieldComponentDefinitionOutline,
  DataLocationFieldModelDefinitionOutline,
  DataLocationFormComponentDefinitionOutline,
  PublishDataLocationRefreshFieldComponentDefinitionOutline,
  PublishDataLocationRefreshFormComponentDefinitionOutline,
  PublishDataLocationSelectorFieldComponentDefinitionOutline,
  PublishDataLocationSelectorFieldModelDefinitionOutline,
  PublishDataLocationSelectorFormComponentDefinitionOutline,
  FormPathHelper,
  RadioInputFieldComponentDefinitionOutline,
  RadioInputFieldModelDefinitionOutline,
  RadioInputFormComponentDefinitionOutline,
  DateInputFieldComponentDefinitionOutline,
  DateInputFieldModelDefinitionOutline,
  DateInputFormComponentDefinitionOutline,
  QuestionTreeFieldComponentDefinitionOutline,
  QuestionTreeFieldModelDefinitionOutline,
  QuestionTreeFormComponentDefinitionOutline,
  FormConfig,
  buildLineagePaths,
  jsonataEvaluateFunc,
  JSONataEvaluate,
} from '@researchdatabox/sails-ng-common';
import { DataValueFormConfigVisitor } from './data-value.visitor';
import { cloneDeep as _cloneDeep, get as _get, isEqual as _isEqual } from 'lodash';
import { serializeRedboxCanonicalJsonV1 } from '../record-contract/canonical-json';

export interface RichHtmlSanitizedTransformation {
  readonly kind: 'rich-html-sanitized';
  readonly dataModelPath: readonly (string | number)[];
  /** Exact string observed at the schema-owned path before sanitation. */
  readonly sourceValue: string;
  readonly value: string;
  /** Advisory emitted only through the typed transformation channel. */
  readonly advisorySummary: FormValidatorSummaryErrors;
}

export type FormValueTransformation = RichHtmlSanitizedTransformation;

export interface ValidatorFormConfigResult {
  readonly summaries: readonly FormValidatorSummaryErrors[];
  readonly transformations: readonly FormValueTransformation[];
}

type ValidatorFormConfigOptions = {
  form: FormConfigOutline;
  enabledValidationGroups?: string[];
  /** Validators belonging only to these groups are omitted from this pass. */
  excludedOnlyValidationGroups?: string[];
  validatorDefinitions?: FormValidatorDefinition[];
  validatorDefinitionsMap?: ReadonlyMap<string, FormValidatorDefinition>;
  jsonataEvaluatorFactory?: (expression: string) => JSONataEvaluate;
  /** Shared wall-clock deadline check supplied by the save boundary. */
  checkDeadline?: () => void;
  /** Traverse schema-owned values for transformations without executing validators. */
  transformationOnly?: boolean;
  previousMetadata?: Readonly<Record<string, unknown>>;
};

interface CheckboxArchiveField {
  readonly path: string[];
  readonly selectable: ReadonlySet<string>;
}

function isSelectableCheckboxOption(option: CheckboxWithDetailsOption, enabled?: string[] | null): boolean {
  return !option.disabled && !option.historical && (!Array.isArray(enabled) || enabled.includes(option.value));
}

function rowFingerprint(value: unknown): string | undefined {
  try {
    return serializeRedboxCanonicalJsonV1(value);
  } catch {
    return undefined;
  }
}

function archiveFingerprint(value: unknown, fields: readonly CheckboxArchiveField[]): string | undefined {
  const archived = fields.flatMap(({ path, selectable }) => {
    const rows: unknown = path.length ? _get(value, path) : value;
    if (!Array.isArray(rows)) return [];
    const selections = rows.filter(row => typeof row?.value === 'string' && !selectable.has(row.value))
      .sort((a, b) => a.value < b.value ? -1 : a.value > b.value ? 1 : 0);
    return selections.length > 0 ? [{ path, selections }] : [];
  });
  return archived.length > 0 ? rowFingerprint(archived) : undefined;
}

/** Claim exact rows first, then unique archival evidence, before matching edits by index. */
function priorRepeatableRows(
  values: unknown[],
  previous: unknown,
  getArchiveFields: () => CheckboxArchiveField[],
  checkDeadline: () => void
): Map<number, unknown> {
  const matched = new Map<number, unknown>();
  if (!Array.isArray(previous)) return matched;
  const claimed = new Set<number>();
  const claim = (current: number, prior: number) => {
    matched.set(current, previous[prior]);
    claimed.add(prior);
  };
  const indexUnclaimed = (
    rows: unknown[],
    isClaimed: (index: number) => boolean,
    fingerprint: (row: unknown) => string | undefined
  ): Map<string, number[]> => {
    const indexed = new Map<string, number[]>();
    for (const [index, value] of rows.entries()) {
      checkDeadline();
      if (isClaimed(index)) continue;
      const key = fingerprint(value);
      if (key === undefined) continue;
      const indices = indexed.get(key);
      if (indices) indices.push(index);
      else indexed.set(key, [index]);
    }
    return indexed;
  };

  for (const [index, value] of values.entries()) {
    checkDeadline();
    if (index < previous.length && _isEqual(value, previous[index])) claim(index, index);
  }
  if (matched.size === values.length) return matched;

  const unclaimedByValue = indexUnclaimed(previous, index => claimed.has(index), rowFingerprint);
  for (const [index, value] of values.entries()) {
    checkDeadline();
    if (matched.has(index)) continue;
    const key = rowFingerprint(value);
    const prior = key === undefined ? undefined : unclaimedByValue.get(key)?.pop();
    if (prior !== undefined) claim(index, prior);
  }
  if (matched.size === values.length) return matched;

  const ambiguous = new Set<number>();
  const fields = getArchiveFields();
  if (fields.length > 0) {
    const fingerprint = (row: unknown) => archiveFingerprint(row, fields);
    const previousArchives = indexUnclaimed(previous, index => claimed.has(index), fingerprint);
    const submittedArchives = indexUnclaimed(values, index => matched.has(index), fingerprint);
    for (const [key, indices] of submittedArchives) {
      checkDeadline();
      const priors = previousArchives.get(key);
      if (priors?.length === 1 && indices.length === 1) {
        claim(indices[0], priors[0]);
      } else if (priors?.length) {
        indices.forEach(index => ambiguous.add(index));
      }
    }
  }
  for (let index = 0; index < Math.min(values.length, previous.length); index++) {
    checkDeadline();
    if (!matched.has(index) && !claimed.has(index) && !ambiguous.has(index)) claim(index, index);
  }
  return matched;
}

interface PriorRepeatableScope {
  path: (string | number)[];
  values: unknown[];
  template: FormComponentDefinitionOutline;
  parent?: PriorRepeatableRow;
  matched?: Map<number, unknown>;
}

interface PriorRepeatableRow {
  scope: PriorRepeatableScope;
  index: number;
}

declare const sails: Sails.Application;

/**
 * Visit each form config component and run its validators.
 *
 * This visitor is for the server-side.
 * On the client, use the standard angular component validator methods.
 *
 * By default, all validators are run: ['all'].
 * Specify which validators are run by providing enabledValidationGroups.
 */
export class ValidatorFormConfigVisitor extends FormConfigVisitor {
  private validatorSupport: ValidatorsSupport;

  private form: FormConfigOutline;
  private enabledValidationGroups: string[];
  private excludedOnlyValidationGroups: string[];
  private validatorDefinitionsMap: Map<string, FormValidatorDefinition>;
  private jsonataEvaluatorFactory: (expression: string) => JSONataEvaluate;
  private checkDeadline: () => void;
  private transformationOnly: boolean;
  private previousMetadata?: Readonly<Record<string, unknown>>;
  private priorRow?: PriorRepeatableRow;

  private validationErrors: FormValidatorSummaryErrors[];
  private transformations: FormValueTransformation[];

  private formPathHelper: FormPathHelper;

  constructor(logger: ILogger) {
    super(logger);

    this.validatorSupport = new ValidatorsSupport();

    this.form = new FormConfig();
    this.enabledValidationGroups = [];
    this.excludedOnlyValidationGroups = [];
    this.validatorDefinitionsMap = new Map<string, FormValidatorDefinition>();
    this.jsonataEvaluatorFactory = jsonataEvaluateFunc;
    this.checkDeadline = () => undefined;
    this.transformationOnly = false;

    this.validationErrors = [];
    this.transformations = [];

    this.formPathHelper = new FormPathHelper(logger, this);
  }

  /**
   * Start the visitor.
   * @param options Configure the visitor.
   * @param options.form The constructed form.
   * @param options.enabledValidationGroups The validation groups to enable.
   * @param options.validatorDefinitions The validation definitions to make available.
   */
  async start(options: ValidatorFormConfigOptions): Promise<FormValidatorSummaryErrors[]> {
    const result = await this.startWithResult(options);
    return [
      ...result.summaries,
      ...result.transformations.map(transformation => _cloneDeep(transformation.advisorySummary)),
    ];
  }

  /**
   * Run validation and return schema-owned value transformations separately
   * from validator summaries so save boundaries can apply them immutably.
   */
  async startWithResult(options: ValidatorFormConfigOptions): Promise<ValidatorFormConfigResult> {
    this.formPathHelper.reset();

    this.form = options.form;

    // use the first non-null, non-undefined value - empty array is a valid value
    this.enabledValidationGroups = options.enabledValidationGroups ?? this.form.enabledValidationGroups ?? ['all'];
    this.excludedOnlyValidationGroups = options.excludedOnlyValidationGroups ?? [];
    this.validatorDefinitionsMap = options.validatorDefinitionsMap
      ? new Map(options.validatorDefinitionsMap)
      : this.validatorSupport.createValidatorDefinitionMapping(options.validatorDefinitions || []);
    this.jsonataEvaluatorFactory = options.jsonataEvaluatorFactory ?? jsonataEvaluateFunc;
    this.checkDeadline = options.checkDeadline ?? (() => undefined);
    this.transformationOnly = options.transformationOnly === true;
    this.previousMetadata = options.previousMetadata;
    this.priorRow = undefined;

    this.validationErrors = [];
    this.transformations = [];

    await this.form.accept(this);

    return {
      summaries: [...this.validationErrors],
      transformations: this.transformations.map(transformation => ({
        ...transformation,
        dataModelPath: [...transformation.dataModelPath],
        advisorySummary: _cloneDeep(transformation.advisorySummary),
      })),
    };
  }

  /* Form Config */

  async visitFormConfig(item: FormConfigOutline): Promise<void> {
    for (const [index, componentDefinition] of (item?.componentDefinitions ?? []).entries()) {
      // Visit children
      await this.formPathHelper.acceptFormPath(
        componentDefinition,
        this.formPathHelper.lineagePathsForFormConfigComponentDefinition(componentDefinition, index)
      );
    }

    // Run form-level validators using the full form data model.
    // There are various reasons a validator is at form level, e.g. they involve more than one field.
    const dataValueVisitor = new DataValueFormConfigVisitor(this.logger);
    const value = await dataValueVisitor.start({ form: item });
    const itemName = item?.name ?? '';
    if (!this.transformationOnly) {
      this.validationErrors.push(...(await this.validateFormComponent(itemName, value, item?.validators)));
    }
  }

  /* SimpleInput */

  async visitSimpleInputFieldComponentDefinition(_item: SimpleInputFieldComponentDefinitionOutline): Promise<void> {}

  async visitSimpleInputFieldModelDefinition(_item: SimpleInputFieldModelDefinitionOutline): Promise<void> {}

  async visitSimpleInputFormComponentDefinition(item: SimpleInputFormComponentDefinitionOutline): Promise<void> {
    await this.acceptFormComponentDefinition(item);
  }

  /* Content */

  async visitContentFieldComponentDefinition(_item: ContentFieldComponentDefinitionOutline): Promise<void> {}

  async visitContentFormComponentDefinition(item: ContentFormComponentDefinitionOutline): Promise<void> {
    await this.acceptFormComponentDefinition(item);
  }

  /* Related object data */

  async visitRelatedObjectDataFieldComponentDefinition(
    _item: RelatedObjectDataFieldComponentDefinitionOutline
  ): Promise<void> {}

  async visitRelatedObjectDataFormComponentDefinition(
    item: RelatedObjectDataFormComponentDefinitionOutline
  ): Promise<void> {
    await this.acceptFormComponentDefinition(item);
  }

  /* Repeatable  */

  async visitRepeatableFieldComponentDefinition(_item: RepeatableFieldComponentDefinitionOutline): Promise<void> {}

  async visitRepeatableFieldModelDefinition(_item: RepeatableFieldModelDefinitionOutline): Promise<void> {}

  async visitRepeatableElementFieldLayoutDefinition(
    _item: RepeatableElementFieldLayoutDefinitionOutline
  ): Promise<void> {}

  async visitRepeatableFormComponentDefinition(item: RepeatableFormComponentDefinitionOutline): Promise<void> {
    await this.acceptFormComponentDefinition(item);

    const values = item.model?.config?.value;
    const elementTemplate = item.component?.config?.elementTemplate;
    if (!Array.isArray(values) || !elementTemplate) return;
    const priorScope: PriorRepeatableScope = {
      path: this.formPathHelper.formPath.dataModel,
      values,
      template: elementTemplate,
      parent: this.priorRow,
    };
    for (const [index, rowValue] of values.entries()) {
      this.checkDeadline();
      const rowTemplate = _cloneDeep(elementTemplate);
      this.hydrateRepeatableRow(rowTemplate, rowValue);
      const templateLineage = this.formPathHelper.lineagePathsForRepeatableFieldComponentDefinition(rowTemplate);
      this.priorRow = { scope: priorScope, index };
      try {
        await this.formPathHelper.acceptFormPath(rowTemplate, {
          ...templateLineage,
          formConfig: ['component', ...(templateLineage.formConfig ?? [])],
          dataModel: [...(templateLineage.dataModel ?? []), index],
          angularComponents: [...(templateLineage.angularComponents ?? []), index],
          layout: [...(templateLineage.layout ?? []), index],
        });
      } finally {
        this.priorRow = priorScope.parent;
      }
      this.checkDeadline();
    }
  }

  private previousValue(dataPath: (string | number)[], prior = this.priorRow): unknown {
    if (!prior) return _get(this.previousMetadata, dataPath);
    const { scope, index } = prior;
    // Only checkbox details need a prior row. Other repeatable fields keep
    // their normal validation path without paying for a row comparison.
    scope.matched ??= priorRepeatableRows(
      scope.values,
      scope.parent ? this.previousValue(scope.path, scope.parent) : _get(this.previousMetadata, scope.path),
      () => this.repeatableCheckboxArchiveFields(scope.template),
      this.checkDeadline
    );
    const value = scope.matched.get(index);
    const relativePath = dataPath.slice(scope.path.length + 1);
    return relativePath.length ? _get(value, relativePath) : value;
  }

  private repeatableCheckboxArchiveFields(
    definition: FormComponentDefinitionOutline,
    parent: string[] = []
  ): CheckboxArchiveField[] {
    const path = [...parent, ...FormPathHelper.metadataTokensForComponent(definition)];
    const component = definition.component;
    if (component.class === CheckboxWithDetailsComponentName) {
      const config = component.config as CheckboxWithDetailsFieldComponentConfigOutline | undefined;
      // A failed lookup cannot supply evidence that a particular code is archival.
      if (definition.model?.config?.disabled || definition.layout?.config?.disabled ||
          config?.disabled || (config?.vocabRef && config.options === undefined)) return [];
      const selectable = new Set((config?.options ?? [])
        .filter(option => isSelectableCheckboxOption(option, config?.enabledOptionValues))
        .map(option => option.value));
      return [{ path, selectable }];
    }
    // Nested repeatables have their own matching scope. Other metadata is opaque.
    const config = component.config as {
      componentDefinitions?: FormComponentDefinitionOutline[];
      tabs?: FormComponentDefinitionOutline[];
      panels?: FormComponentDefinitionOutline[];
    } | undefined;
    switch (component.class) {
      case 'GroupComponent':
      case 'QuestionTreeComponent':
      case 'TabContentComponent':
      case 'AccordionPanelComponent':
        return (config?.componentDefinitions ?? []).flatMap(child => this.repeatableCheckboxArchiveFields(child, path));
      case 'TabComponent':
        return (config?.tabs ?? []).flatMap(child => this.repeatableCheckboxArchiveFields(child, path));
      case 'AccordionComponent':
        return (config?.panels ?? []).flatMap(child => this.repeatableCheckboxArchiveFields(child, path));
      default:
        return [];
    }
  }

  /** Populate only schema-owned row controls; submitted objects never become form definitions. */
  private hydrateRepeatableRow(definition: FormComponentDefinitionOutline, parentValue: unknown): void {
    const definitionRecord = definition as unknown as Record<string, unknown>;
    const component = definitionRecord.component as Record<string, unknown> | undefined;
    const model = definitionRecord.model as Record<string, unknown> | undefined;
    const name = typeof definitionRecord.name === 'string' ? definitionRecord.name : '';
    const consumesNamedValue = Boolean(name) && (model !== undefined || component?.class === 'GroupComponent');
    const value =
      consumesNamedValue && parentValue !== null && typeof parentValue === 'object' && !Array.isArray(parentValue)
        ? (parentValue as Record<string, unknown>)[name]
        : parentValue;
    if (model) {
      const config =
        model.config && typeof model.config === 'object' && !Array.isArray(model.config)
          ? (model.config as Record<string, unknown>)
          : {};
      model.config = config;
      config.value = value;
    }
    const componentConfig = component?.config;
    if (!componentConfig || typeof componentConfig !== 'object' || Array.isArray(componentConfig)) return;
    const config = componentConfig as Record<string, unknown>;
    // A nested repeatable owns its elementTemplate expansion when its visitor
    // sees the nested array value.
    if (component.class === 'RepeatableComponent') return;
    for (const key of ['componentDefinitions', 'tabs', 'panels'] as const) {
      const children = config[key];
      if (!Array.isArray(children)) continue;
      for (const child of children) {
        this.hydrateRepeatableRow(child as FormComponentDefinitionOutline, value);
      }
    }
  }

  /* Validation Summary */

  async visitValidationSummaryFieldComponentDefinition(
    _item: ValidationSummaryFieldComponentDefinitionOutline
  ): Promise<void> {}

  async visitValidationSummaryFormComponentDefinition(
    item: ValidationSummaryFormComponentDefinitionOutline
  ): Promise<void> {
    await this.acceptFormComponentDefinition(item);
  }

  async visitSuggestedValidationSummaryFieldComponentDefinition(
    _item: SuggestedValidationSummaryFieldComponentDefinitionOutline
  ): Promise<void> {}

  async visitSuggestedValidationSummaryFormComponentDefinition(
    item: SuggestedValidationSummaryFormComponentDefinitionOutline
  ): Promise<void> {
    await this.acceptFormComponentDefinition(item);
  }

  async visitSaveStatusFieldComponentDefinition(_item: SaveStatusFieldComponentDefinitionOutline): Promise<void> {}

  async visitSaveStatusFormComponentDefinition(item: SaveStatusFormComponentDefinitionOutline): Promise<void> {
    await this.acceptFormComponentDefinition(item);
  }

  /* Integration Status */

  async visitIntegrationStatusFieldComponentDefinition(
    _item: IntegrationStatusFieldComponentDefinitionOutline
  ): Promise<void> {}

  async visitIntegrationStatusFormComponentDefinition(
    item: IntegrationStatusFormComponentDefinitionOutline
  ): Promise<void> {
    await this.acceptFormComponentDefinition(item);
  }

  async visitWorkspaceFieldComponentDefinition(_item: WorkspaceFieldComponentDefinitionOutline): Promise<void> {}

  async visitWorkspaceFormComponentDefinition(item: WorkspaceFormComponentDefinitionOutline): Promise<void> {
    await this.acceptFormComponentDefinition(item);
  }

  /* Group */

  async visitGroupFieldComponentDefinition(item: GroupFieldComponentDefinitionOutline): Promise<void> {
    for (const [index, componentDefinition] of (item.config?.componentDefinitions ?? []).entries()) {
      // Visit children
      await this.formPathHelper.acceptFormPath(
        componentDefinition,
        this.formPathHelper.lineagePathsForGroupFieldComponentDefinition(componentDefinition, index)
      );
    }
  }

  async visitGroupFieldModelDefinition(_item: GroupFieldModelDefinitionOutline): Promise<void> {}

  async visitGroupFormComponentDefinition(item: GroupFormComponentDefinitionOutline): Promise<void> {
    await this.acceptFormComponentDefinition(item);
  }

  /* Tab  */

  async visitTabFieldComponentDefinition(item: TabFieldComponentDefinitionOutline): Promise<void> {
    for (const [index, componentDefinition] of (item.config?.tabs ?? []).entries()) {
      // Visit children
      await this.formPathHelper.acceptFormPath(
        componentDefinition,
        this.formPathHelper.lineagePathsForTabFieldComponentDefinition(componentDefinition, index)
      );
    }
  }

  async visitTabFieldLayoutDefinition(_item: TabFieldLayoutDefinitionOutline): Promise<void> {}

  async visitTabFormComponentDefinition(item: TabFormComponentDefinitionOutline): Promise<void> {
    await this.acceptFormComponentDefinition(item);
  }

  /* Accordion */

  async visitAccordionFieldComponentDefinition(item: AccordionFieldComponentDefinitionOutline): Promise<void> {
    for (const [index, componentDefinition] of (item.config?.panels ?? []).entries()) {
      await this.formPathHelper.acceptFormPath(
        componentDefinition,
        this.formPathHelper.lineagePathsForAccordionFieldComponentDefinition(componentDefinition, index)
      );
    }
  }

  async visitAccordionFieldLayoutDefinition(_item: AccordionFieldLayoutDefinitionOutline): Promise<void> {}

  async visitAccordionFormComponentDefinition(item: AccordionFormComponentDefinitionOutline): Promise<void> {
    await this.acceptFormComponentDefinition(item);
  }

  async visitAccordionPanelFieldComponentDefinition(
    item: AccordionPanelFieldComponentDefinitionOutline
  ): Promise<void> {
    for (const [index, componentDefinition] of (item.config?.componentDefinitions ?? []).entries()) {
      await this.formPathHelper.acceptFormPath(
        componentDefinition,
        this.formPathHelper.lineagePathsForAccordionPanelFieldComponentDefinition(componentDefinition, index)
      );
    }
  }

  async visitAccordionPanelFieldLayoutDefinition(_item: AccordionPanelFieldLayoutDefinitionOutline): Promise<void> {}

  async visitAccordionPanelFormComponentDefinition(item: AccordionPanelFormComponentDefinitionOutline): Promise<void> {
    await this.acceptFormComponentDefinition(item);
  }

  /*  Tab Content */

  async visitTabContentFieldComponentDefinition(item: TabContentFieldComponentDefinitionOutline): Promise<void> {
    for (const [index, componentDefinition] of (item.config?.componentDefinitions ?? []).entries()) {
      // Visit children
      await this.formPathHelper.acceptFormPath(
        componentDefinition,
        this.formPathHelper.lineagePathsForTabContentFieldComponentDefinition(componentDefinition, index)
      );
    }
  }

  async visitTabContentFieldLayoutDefinition(_item: TabContentFieldLayoutDefinitionOutline): Promise<void> {}

  async visitTabContentFormComponentDefinition(item: TabContentFormComponentDefinitionOutline): Promise<void> {
    await this.acceptFormComponentDefinition(item);
  }

  /* Save Button  */

  async visitSaveButtonFieldComponentDefinition(_item: SaveButtonFieldComponentDefinitionOutline): Promise<void> {}

  async visitSaveButtonFormComponentDefinition(item: SaveButtonFormComponentDefinitionOutline): Promise<void> {
    await this.acceptFormComponentDefinition(item);
  }

  /* Cancel Button  */

  async visitCancelButtonFieldComponentDefinition(_item: CancelButtonFieldComponentDefinitionOutline): Promise<void> {}

  async visitCancelButtonFormComponentDefinition(item: CancelButtonFormComponentDefinitionOutline): Promise<void> {
    await this.acceptFormComponentDefinition(item);
  }

  async visitDeleteButtonFieldComponentDefinition(_item: DeleteButtonFieldComponentDefinitionOutline): Promise<void> {}

  async visitDeleteButtonFormComponentDefinition(item: DeleteButtonFormComponentDefinitionOutline): Promise<void> {
    await this.acceptFormComponentDefinition(item);
  }

  /* Tab Nav Button  */

  async visitTabNavButtonFieldComponentDefinition(_item: TabNavButtonFieldComponentDefinitionOutline): Promise<void> {}

  async visitTabNavButtonFormComponentDefinition(item: TabNavButtonFormComponentDefinitionOutline): Promise<void> {
    await this.acceptFormComponentDefinition(item);
  }

  /* Text Area */

  async visitTextAreaFieldComponentDefinition(_item: TextAreaFieldComponentDefinitionOutline): Promise<void> {}

  async visitTextAreaFieldModelDefinition(_item: TextAreaFieldModelDefinitionOutline): Promise<void> {}

  async visitTextAreaFormComponentDefinition(item: TextAreaFormComponentDefinitionOutline): Promise<void> {
    await this.acceptFormComponentDefinition(item);
  }

  /* Default Layout  */

  async visitDefaultFieldLayoutDefinition(_item: DefaultFieldLayoutDefinitionOutline): Promise<void> {}

  /* Checkbox Input */

  async visitCheckboxInputFieldComponentDefinition(
    _item: CheckboxInputFieldComponentDefinitionOutline
  ): Promise<void> {}

  async visitCheckboxInputFieldModelDefinition(_item: CheckboxInputFieldModelDefinitionOutline): Promise<void> {}

  async visitCheckboxInputFormComponentDefinition(item: CheckboxInputFormComponentDefinitionOutline): Promise<void> {
    await this.acceptFormComponentDefinition(item);
  }

  async visitCheckboxWithDetailsFormComponentDefinition(
    item: CheckboxWithDetailsFormComponentDefinitionOutline
  ): Promise<void> {
    const config = item.component.config;
    const model = item.model?.config;
    const layout = item.layout?.config;
    if (this.transformationOnly || model?.disabled || config?.disabled || layout?.disabled) return;

    const value = model?.value === undefined ? [] : model.value;
    const path = this.formPathHelper.formPath;
    const stored = new Map<string, Record<string, unknown>>();
    const previousRows = this.previousValue(path.dataModel);
    if (Array.isArray(previousRows)) {
      for (const row of previousRows) {
        if (typeof row?.value === 'string' && row.details && typeof row.details === 'object' &&
            !Array.isArray(row.details) && !stored.has(row.value)) {
          stored.set(row.value, row.details);
        }
      }
    }
    const groupLabel = layout?.label ?? item.name;
    const issue = (message: string, rowIndex?: number, option?: string, field?: string) => {
      const suffix = option === undefined ? [] : [checkboxDetailsOptionPath(option), ...(field ? [field] : [])];
      this.validationErrors.push({
        id: field ?? item.name,
        message: groupLabel,
        lineagePaths: buildLineagePaths(path, {
          angularComponents: field ? suffix : [],
          dataModel: rowIndex === undefined ? [] : [rowIndex, ...(field ? ['details', field] : ['value'])],
        }),
        errors: [{ class: 'checkboxWithDetails', message, params: { option, field } }],
      });
    };

    this.validationErrors.push(...await this.validateFormComponent(item.name, value, model?.validators, layout?.label));
    if (!Array.isArray(value)) {
      issue('@validator-error-checkbox-details-shape');
      return;
    }

    const vocabularyUnresolved = !!config?.vocabRef && config.options === undefined;
    if (vocabularyUnresolved) {
      const availableGroups = this.form.validationGroups ?? {};
      const validateChoices = this.validatorSupport.isValidatorEnabled(
        availableGroups, this.enabledValidationGroups, { class: 'checkboxWithDetails' }
      ) || this.enabledValidators(model?.validators).length > 0;
      const validateDetails = !validateChoices && value.some(row =>
        typeof row?.value === 'string' && checkboxDetailFields(config, row.value).some(field =>
          !field.model?.config?.disabled && !field.component.config?.disabled && !field.layout?.config?.disabled &&
          this.enabledValidators(field.model?.config?.validators).length > 0
        )
      );
      if (validateChoices || validateDetails) {
        issue('@validator-error-checkbox-details-lookup-unavailable');
        return;
      }
      // Validation below treats each submitted code as unavailable, so only
      // removals or exact preservation of previously persisted details pass.
    }

    const options = new Map((config?.options ?? []).map(option => [option.value, option]));
    const selected = new Set<string>();
    for (const [index, row] of value.entries()) {
      this.checkDeadline();
      if (
        !row || typeof row.value !== 'string' || !row.value.trim() ||
        !row.details || typeof row.details !== 'object' || Array.isArray(row.details) ||
        Object.keys(row).some(key => key !== 'value' && key !== 'details')
      ) {
        issue('@validator-error-checkbox-details-shape', index);
        continue;
      }
      const option = options.get(row.value);
      const previous = stored.get(row.value);
      const selectable = option && isSelectableCheckboxOption(option, config?.enabledOptionValues);
      if (selected.has(row.value) || (!selectable && !previous)) {
        issue('@validator-error-checkbox-details-option', index, row.value);
        continue;
      }
      selected.add(row.value);

      const fields = checkboxDetailFields(config, row.value);
      const names = new Set(fields.map(field => field.name));
      for (const [name, answer] of Object.entries(row.details)) {
        if (
          (answer !== null && typeof answer !== 'string') ||
          ((!names.has(name) || !option) &&
            !(previous && Object.hasOwn(previous, name) && previous[name] === answer))
        ) {
          issue('@validator-error-checkbox-details-field', index, row.value, name);
        }
      }
      // Deleted choices are archival. A retained row must keep all of its
      // stored details, even if the current form no longer defines some keys.
      if (!option && previous) {
        for (const name of Object.keys(previous)) {
          if (!Object.hasOwn(row.details, name)) {
            issue('@validator-error-checkbox-details-field', index, row.value, name);
          }
        }
      }
      if (!option) continue;
      for (const field of fields) {
        const name = field.name;
        const fieldModel = field.model?.config;
        if (!name || !fieldModel || fieldModel.disabled || field.component.config?.disabled || field.layout?.config?.disabled) {
          continue;
        }
        const optionPath = checkboxDetailsOptionPath(row.value);
        const lineage = buildLineagePaths(path, {
          dataModel: [index, 'details', name],
          angularComponents: [optionPath, name],
          layout: [optionPath, `${name}-layout`],
        });
        const label = field.layout?.config?.label || field.component.config?.label || name;
        const answer = Object.hasOwn(row.details, name) ? row.details[name] : null;
        this.validationErrors.push(...await this.validateFormComponent(
          name, answer, fieldModel.validators, `${label} — ${option.label}`, lineage
        ));
      }
    }
  }

  /* Question Tree */

  async visitQuestionTreeFieldComponentDefinition(item: QuestionTreeFieldComponentDefinitionOutline): Promise<void> {
    for (const [index, componentDefinition] of (item.config?.componentDefinitions ?? []).entries()) {
      await this.formPathHelper.acceptFormPath(
        componentDefinition,
        this.formPathHelper.lineagePathsForQuestionTreeFieldComponentDefinition(componentDefinition, index)
      );
    }
  }

  async visitQuestionTreeFieldModelDefinition(_item: QuestionTreeFieldModelDefinitionOutline): Promise<void> {}

  async visitQuestionTreeFormComponentDefinition(item: QuestionTreeFormComponentDefinitionOutline): Promise<void> {
    await this.acceptFormComponentDefinition(item);
  }

  /* Checkbox Tree */

  async visitCheckboxTreeFieldComponentDefinition(_item: CheckboxTreeFieldComponentDefinitionOutline): Promise<void> {}

  async visitCheckboxTreeFieldModelDefinition(_item: CheckboxTreeFieldModelDefinitionOutline): Promise<void> {}

  async visitCheckboxTreeFormComponentDefinition(item: CheckboxTreeFormComponentDefinitionOutline): Promise<void> {
    await this.acceptFormComponentDefinition(item);
  }

  async visitRecordSelectorFieldComponentDefinition(
    _item: RecordSelectorFieldComponentDefinitionOutline
  ): Promise<void> {}

  async visitRecordSelectorFieldModelDefinition(_item: RecordSelectorFieldModelDefinitionOutline): Promise<void> {}

  async visitRecordSelectorFormComponentDefinition(item: RecordSelectorFormComponentDefinitionOutline): Promise<void> {
    await this.acceptFormComponentDefinition(item);
  }

  /* Dropdown Input */

  async visitDropdownInputFieldComponentDefinition(
    _item: DropdownInputFieldComponentDefinitionOutline
  ): Promise<void> {}

  async visitDropdownInputFieldModelDefinition(_item: DropdownInputFieldModelDefinitionOutline): Promise<void> {}

  async visitDropdownInputFormComponentDefinition(item: DropdownInputFormComponentDefinitionOutline): Promise<void> {
    await this.acceptFormComponentDefinition(item);
  }

  /* Typeahead Input */

  async visitTypeaheadInputFieldComponentDefinition(
    item: TypeaheadInputFieldComponentDefinitionOutline
  ): Promise<void> {
    const configErrors: FormValidatorSummaryErrors['errors'] = [];
    const config = item.config as TypeaheadInputPermissiveFieldComponentConfigOutline | undefined;
    const sourceType = String(config?.sourceType ?? '');

    if (!sourceType || !['static', 'vocabulary', 'namedQuery', 'external', 'service'].includes(sourceType)) {
      configErrors.push({
        class: 'typeaheadSourceType',
        message: '@validator-error-typeahead-source-type',
        params: { sourceType },
      });
    }

    if (sourceType === 'static' && (!Array.isArray(config?.staticOptions) || config.staticOptions.length === 0)) {
      configErrors.push({
        class: 'typeaheadStaticOptions',
        message: '@validator-error-typeahead-static-options',
        params: { sourceType },
      });
    }
    if (sourceType === 'vocabulary' && !String(config?.vocabRef ?? '').trim()) {
      configErrors.push({
        class: 'typeaheadVocabRef',
        message: '@validator-error-typeahead-vocab-ref',
        params: { sourceType },
      });
    }
    if (sourceType === 'namedQuery' && !String(config?.queryId ?? '').trim()) {
      configErrors.push({
        class: 'typeaheadQueryId',
        message: '@validator-error-typeahead-query-id',
        params: { sourceType },
      });
    }
    const serviceId = String((config as Record<string, unknown> | undefined)?.['serviceId'] ?? '').trim();
    if (sourceType === 'service' && !serviceId) {
      configErrors.push({
        class: 'typeaheadServiceId',
        message: '@validator-error-typeahead-service-id',
        params: { sourceType },
      });
    }
    if (sourceType === 'external' && !String(config?.provider ?? '').trim()) {
      configErrors.push({
        class: 'typeaheadProvider',
        message: '@validator-error-typeahead-provider',
        params: { sourceType },
      });
    }
    if (config?.multiSelect === true) {
      configErrors.push({
        class: 'typeaheadMultiSelect',
        message: '@validator-error-typeahead-multi-select-unsupported',
        params: { multiSelect: true },
      });
    }

    if (configErrors.length > 0) {
      this.validationErrors.push({
        id: String(
          this.formPathHelper.formPath.angularComponents?.[this.formPathHelper.formPath.angularComponents.length - 1] ??
            ''
        ),
        message: item?.config?.label ?? 'TypeaheadInput configuration',
        errors: configErrors,
        lineagePaths: buildLineagePaths(this.formPathHelper.formPath),
      });
    }
  }

  async visitTypeaheadInputFieldModelDefinition(_item: TypeaheadInputFieldModelDefinitionOutline): Promise<void> {}

  async visitTypeaheadInputFormComponentDefinition(item: TypeaheadInputFormComponentDefinitionOutline): Promise<void> {
    await this.acceptFormComponentDefinition(item);
  }

  /* Rich Text Editor */

  async visitRichTextEditorFieldComponentDefinition(
    _item: RichTextEditorFieldComponentDefinitionOutline
  ): Promise<void> {}

  async visitRichTextEditorFieldModelDefinition(_item: RichTextEditorFieldModelDefinitionOutline): Promise<void> {}

  private sanitizeRichTextValue(item: RichTextEditorFormComponentDefinitionOutline): void {
    const value = item.model?.config?.value;
    if (typeof value !== 'string' || !value) {
      return;
    }

    const sanitized = DomSanitizerService.sanitizeWithProfile(value, 'html');
    // TODO: Validating this way that the html/markdown content has been sanitized is likely to be brittle
    // Initial implementation is to silently sanitize and warn, but may want to change to rejecting the content in future if sanitization issues are common.
    // This will likely need to hook more into domPurify to be more robust to detect when it is sanitizing content.
    // When we do this, we should also consider how to best report the issue to the user so they can fix their content - e.g. include details of what is not allowed in the error message.
    if (this.normalizeHtmlForComparison(sanitized) === this.normalizeHtmlForComparison(value)) {
      return;
    }

    const mode = sails?.config?.record?.form?.htmlSanitizationMode ?? 'sanitize';

    const componentName = String(
      this.formPathHelper.formPath.angularComponents?.[this.formPathHelper.formPath.angularComponents.length - 1] ??
        'Rich text content'
    );

    if (mode === 'reject') {
      // Report validation error, do NOT mutate
      if (!this.transformationOnly) {
        this.validationErrors.push({
          id: componentName,
          message: componentName,
          errors: [
            {
              class: 'htmlUnsafe',
              message: '@validator-error-html-unsafe',
              params: { actual: value },
            },
          ],
          lineagePaths: buildLineagePaths(this.formPathHelper.formPath),
        });
      }
    } else {
      // Default: sanitize before validators and report through the typed
      // transformation channel, never through an ordinary validator class.
      if (item.model?.config) {
        item.model.config.value = sanitized;
      }
      const dataModelPath = this.formPathHelper.formPath.dataModel;
      this.transformations.push({
        kind: 'rich-html-sanitized',
        dataModelPath,
        sourceValue: value,
        value: sanitized,
        advisorySummary: {
          id: componentName,
          message: componentName,
          errors: [
            {
              class: 'htmlSanitized',
              message: '@validator-warning-html-sanitized',
              params: {},
            },
          ],
          lineagePaths: buildLineagePaths(this.formPathHelper.formPath),
        },
      });
    }
  }

  async visitRichTextEditorFormComponentDefinition(item: RichTextEditorFormComponentDefinitionOutline): Promise<void> {
    this.sanitizeRichTextValue(item);
    await this.acceptFormComponentDefinition(item);
  }

  /* Map */

  async visitMapFieldComponentDefinition(item: MapFieldComponentDefinitionOutline): Promise<void> {
    const configErrors: FormValidatorSummaryErrors['errors'] = [];
    const enabledModes = Array.isArray(item.config?.enabledModes) ? item.config?.enabledModes : [];
    const validModes: MapDrawingMode[] = ['point', 'polygon', 'linestring', 'rectangle', 'circle', 'select'];
    const invalidModes = enabledModes.filter(mode => !validModes.includes(mode));
    if (invalidModes.length > 0) {
      configErrors.push({
        class: 'mapEnabledModes',
        message: '@validator-error-map-enabled-modes',
        params: { invalidModes },
      });
    }
    if (configErrors.length > 0) {
      this.validationErrors.push({
        id: String(
          this.formPathHelper.formPath.angularComponents?.[this.formPathHelper.formPath.angularComponents.length - 1] ??
            ''
        ),
        message: item?.config?.label ?? 'MapComponent configuration',
        errors: configErrors,
        lineagePaths: buildLineagePaths(this.formPathHelper.formPath),
      });
    }
  }

  async visitMapFieldModelDefinition(_item: MapFieldModelDefinitionOutline): Promise<void> {}

  async visitMapFormComponentDefinition(item: MapFormComponentDefinitionOutline): Promise<void> {
    await this.acceptFormComponentDefinition(item);
  }

  /* File Upload */

  async visitFileUploadFieldComponentDefinition(_item: FileUploadFieldComponentDefinitionOutline): Promise<void> {}

  async visitFileUploadFieldModelDefinition(_item: FileUploadFieldModelDefinitionOutline): Promise<void> {}

  async visitFileUploadFormComponentDefinition(item: FileUploadFormComponentDefinitionOutline): Promise<void> {
    await this.acceptFormComponentDefinition(item);
  }

  async visitPDFListFieldComponentDefinition(_item: PDFListFieldComponentDefinitionOutline): Promise<void> {}

  async visitPDFListFieldModelDefinition(_item: PDFListFieldModelDefinitionOutline): Promise<void> {}

  async visitPDFListFormComponentDefinition(item: PDFListFormComponentDefinitionOutline): Promise<void> {
    await this.acceptFormComponentDefinition(item);
  }

  async visitRecordMetadataRetrieverFieldComponentDefinition(
    _item: RecordMetadataRetrieverFieldComponentDefinitionOutline
  ): Promise<void> {}

  async visitRecordMetadataRetrieverFormComponentDefinition(
    item: RecordMetadataRetrieverFormComponentDefinitionOutline
  ): Promise<void> {
    await this.acceptFormComponentDefinition(item);
  }

  /* Data Location */

  async visitDataLocationFieldComponentDefinition(_item: DataLocationFieldComponentDefinitionOutline): Promise<void> {}

  async visitDataLocationFieldModelDefinition(_item: DataLocationFieldModelDefinitionOutline): Promise<void> {}

  async visitDataLocationFormComponentDefinition(item: DataLocationFormComponentDefinitionOutline): Promise<void> {
    await this.acceptFormComponentDefinition(item);
  }

  // Validation is intentionally empty because there is no persisted refresh
  // value to validate.
  async visitPublishDataLocationRefreshFieldComponentDefinition(
    _item: PublishDataLocationRefreshFieldComponentDefinitionOutline
  ): Promise<void> {}

  async visitPublishDataLocationRefreshFormComponentDefinition(
    item: PublishDataLocationRefreshFormComponentDefinitionOutline
  ): Promise<void> {
    await this.acceptFormComponentDefinition(item);
  }

  async visitPublishDataLocationSelectorFieldComponentDefinition(
    _item: PublishDataLocationSelectorFieldComponentDefinitionOutline
  ): Promise<void> {}

  async visitPublishDataLocationSelectorFieldModelDefinition(
    _item: PublishDataLocationSelectorFieldModelDefinitionOutline
  ): Promise<void> {}

  async visitPublishDataLocationSelectorFormComponentDefinition(
    item: PublishDataLocationSelectorFormComponentDefinitionOutline
  ): Promise<void> {
    await this.acceptFormComponentDefinition(item);
  }

  /* Radio Input */

  async visitRadioInputFieldComponentDefinition(_item: RadioInputFieldComponentDefinitionOutline): Promise<void> {}

  async visitRadioInputFieldModelDefinition(_item: RadioInputFieldModelDefinitionOutline): Promise<void> {}

  async visitRadioInputFormComponentDefinition(item: RadioInputFormComponentDefinitionOutline): Promise<void> {
    await this.acceptFormComponentDefinition(item);
  }

  /* Date Input */

  async visitDateInputFieldComponentDefinition(_item: DateInputFieldComponentDefinitionOutline): Promise<void> {}

  async visitDateInputFieldModelDefinition(_item: DateInputFieldModelDefinitionOutline): Promise<void> {}

  async visitDateInputFormComponentDefinition(item: DateInputFormComponentDefinitionOutline): Promise<void> {
    await this.acceptFormComponentDefinition(item);
  }

  /* Shared */

  protected createFormControlFromRecordValue(recordValue: unknown): FormValidatorControl {
    const guessedType = guessType(recordValue);
    let result;
    if (guessedType === 'object') {
      result = new SimpleServerFormValidatorControl(
        Object.fromEntries(
          Object.entries(recordValue as Record<string, unknown>).map(([key, value]) => [
            key,
            this.createFormControlFromRecordValue(value),
          ])
        )
      );
    } else if (guessedType === 'array') {
      result = new SimpleServerFormValidatorControl(
        (recordValue as Array<unknown>).map(i => this.createFormControlFromRecordValue(i))
      );
    } else {
      result = new SimpleServerFormValidatorControl(recordValue);
    }
    return result;
  }

  protected async acceptFormComponentDefinition(item: FormComponentDefinitionOutline) {
    if (!this.transformationOnly) {
      const validationErrors = await this.validateFormComponent(
        item?.name,
        item?.model?.config?.value,
        item?.model?.config?.validators,
        item?.layout?.config?.label
      );
      this.validationErrors.push(...validationErrors);
    }
    await this.formPathHelper.acceptFormComponentDefinition(item);
  }

  protected async validateFormComponent(
    itemName: string,
    value: unknown,
    validators?: FormValidatorConfig[],
    message?: string,
    lineage = this.formPathHelper.formPath
  ): Promise<FormValidatorSummaryErrors[]> {
    const createFormValidatorFns = this.validatorSupport.createFormValidatorInstancesFromMapping;

    const result: FormValidatorSummaryErrors[] = [];
    if (Array.isArray(validators) && validators.length > 0) {
      // Select the validators for this pass before preparing executable
      // configuration. In particular, an advisory-only JSONata expression
      // must not compile or execute during the blocking pass.
      const filteredValidators = this.enabledValidators(validators);

      // ensure jsonata-expression validators can be evaluated
      this.validatorSupport.assignJsonataEvaluators(
        filteredValidators,
        (validator: FormValidatorConfig, index: number): unknown => {
          const expr = validator?.config?.['expression']?.toString() ?? '';
          return this.jsonataEvaluatorFactory(expr);
        }
      );

      const formValidatorFns = createFormValidatorFns(this.validatorDefinitionsMap, filteredValidators);
      const recordFormControl = this.createFormControlFromRecordValue(value);
      const summaryErrors: FormValidatorSummaryErrors = {
        id: typeof itemName === 'string' && itemName.length > 0 ? itemName : null,
        message: typeof message === 'string' && message.length > 0 ? message : null,
        errors: [],
        lineagePaths: buildLineagePaths(lineage),
      };

      // async
      for (const formValidatorFn of formValidatorFns.asyncDefs) {
        this.checkDeadline();
        const funcResult = await formValidatorFn(recordFormControl);
        this.checkDeadline();
        const compErrors = this.validatorSupport.getFormValidatorComponentErrors(funcResult);
        summaryErrors.errors.push(...compErrors);
      }

      // sync
      for (const formValidatorFn of formValidatorFns.syncDefs) {
        this.checkDeadline();
        const funcResult = formValidatorFn(recordFormControl);
        this.checkDeadline();
        const compErrors = this.validatorSupport.getFormValidatorComponentErrors(funcResult);
        summaryErrors.errors.push(...compErrors);
      }

      // add the summary only if there are errors
      if (summaryErrors.errors.length > 0) {
        result.push(summaryErrors);
      }
    }

    return result;
  }

  private enabledValidators(validators: FormValidatorConfig[] = []): FormValidatorConfig[] {
    const groups = this.form.validationGroups ?? {};
    return this.validatorSupport.enabledValidators(groups, this.enabledValidationGroups, validators)
      .filter(validator => !this.isValidatorExclusiveToGroups(groups, validator));
  }

  private isValidatorExclusiveToGroups(
    availableGroups: NonNullable<FormConfigOutline['validationGroups']>,
    validator: FormValidatorConfig
  ): boolean {
    if (this.excludedOnlyValidationGroups.length === 0) return false;
    // An initial-all group includes ordinary validators by default and can
    // therefore never prove that a validator is advisory-only.
    const excluded = new Set(
      this.excludedOnlyValidationGroups.filter(groupName => availableGroups[groupName]?.initialMembership !== 'all')
    );
    if (excluded.size === 0) return false;
    const includes = validator?.groups?.include ?? [];
    const excludes = validator?.groups?.exclude ?? [];
    this.validatorSupport.checkValidationGroups(availableGroups, includes);
    this.validatorSupport.checkValidationGroups(availableGroups, excludes);
    const memberships = Object.entries(availableGroups).flatMap(([groupName, groupConfig]) => {
      const membership = groupConfig?.initialMembership ?? 'none';
      const belongs = membership === 'all' ? !excludes.includes(groupName) : includes.includes(groupName);
      return belongs ? [groupName] : [];
    });
    return memberships.length > 0 && memberships.every(groupName => excluded.has(groupName));
  }

  private normalizeHtmlForComparison(value: string): string {
    return value.replace(/>\s+</g, '><').replace(/\s+/g, ' ').trim();
  }
}
