import {
  AccordionFieldComponentDefinitionOutline,
  AccordionFormComponentDefinitionOutline,
  AccordionPanelFieldComponentDefinitionOutline,
  AccordionPanelFormComponentDefinitionOutline,
  CheckboxInputFieldModelDefinitionOutline,
  CheckboxInputFormComponentDefinitionOutline,
  CheckboxWithDetailsComponentName,
  CheckboxWithDetailsFormComponentDefinitionOutline,
  ContentFieldComponentDefinitionOutline,
  ContentFormComponentDefinitionOutline,
  RelatedObjectDataFieldComponentDefinitionOutline,
  DateInputFieldModelDefinitionOutline,
  DateInputFormComponentDefinitionOutline,
  DropdownInputFieldModelDefinitionOutline,
  DropdownInputFormComponentDefinitionOutline,
  FormComponentDefinitionOutline,
  FormConfigOutline,
  FormConfigVisitor,
  FormPathHelper,
  GroupFieldComponentDefinitionOutline,
  GroupFormComponentDefinitionOutline,
  RadioInputFieldModelDefinitionOutline,
  RadioInputFormComponentDefinitionOutline,
  RepeatableFieldComponentDefinitionOutline,
  RepeatableFormComponentDefinitionOutline,
  RichTextEditorFieldModelDefinitionOutline,
  RichTextEditorFormComponentDefinitionOutline,
  SimpleInputFieldModelDefinitionOutline,
  SimpleInputFormComponentDefinitionOutline,
  TabContentFieldComponentDefinitionOutline,
  TabContentFormComponentDefinitionOutline,
  TabFieldComponentDefinitionOutline,
  TabFormComponentDefinitionOutline,
  TextAreaFieldModelDefinitionOutline,
  TextAreaFormComponentDefinitionOutline,
  TypeaheadInputFieldModelDefinitionOutline,
  TypeaheadInputFormComponentDefinitionOutline,
  ILogger,
} from '@researchdatabox/sails-ng-common';

export class ContextVariablesFormConfigVisitor extends FormConfigVisitor {
  protected override logName = 'ContextVariablesFormConfigVisitor';

  private contextVariablesMap: Record<string, string> = {};
  private replacementRegex: RegExp | null = null;
  private useAuthoredValues = true;

  constructor(logger: ILogger) {
    super(logger);
  }

  public async applyContextVariables(
    form: FormConfigOutline,
    contextVariablesMap?: Record<string, unknown>,
    useAuthoredValues = true
  ): Promise<void> {
    this.useAuthoredValues = useAuthoredValues;
    const normalizedMap = this.normalizeContextVariablesMap(contextVariablesMap);
    this.contextVariablesMap = normalizedMap;
    this.replacementRegex = this.buildReplacementRegex(Object.keys(normalizedMap));
    if (!this.replacementRegex) {
      return;
    }
    await form.accept(this);
  }

  protected override async notImplemented(): Promise<void> {
    // No-op for visitor methods not required by context variable substitutions.
  }

  async visitFormConfig(item: FormConfigOutline): Promise<void> {
    for (const component of item.componentDefinitions ?? []) {
      await component.accept(this);
    }
  }

  async visitSimpleInputFormComponentDefinition(item: SimpleInputFormComponentDefinitionOutline): Promise<void> {
    await item.model?.accept(this);
  }

  async visitTextAreaFormComponentDefinition(item: TextAreaFormComponentDefinitionOutline): Promise<void> {
    await item.model?.accept(this);
  }

  async visitCheckboxInputFormComponentDefinition(item: CheckboxInputFormComponentDefinitionOutline): Promise<void> {
    await item.model?.accept(this);
  }

  async visitCheckboxWithDetailsFormComponentDefinition(item: CheckboxWithDetailsFormComponentDefinitionOutline): Promise<void> {
    const model = item.model?.config;
    if (model) {
      model.defaultValue = this.replaceCheckboxDefaults(model.defaultValue) as typeof model.defaultValue;
      model.newEntryValue = this.replaceCheckboxDefaults(model.newEntryValue) as typeof model.newEntryValue;
      if (this.useAuthoredValues) model.value = this.replaceCheckboxDefaults(model.value) as typeof model.value;
    }
    const config = item.component.config;
    for (const field of [...(config?.detailFields ?? []), ...Object.values(config?.detailFieldsByValue ?? {}).flat()]) {
      await field.accept(this);
    }
  }

  async visitRadioInputFormComponentDefinition(item: RadioInputFormComponentDefinitionOutline): Promise<void> {
    await item.model?.accept(this);
  }

  async visitDropdownInputFormComponentDefinition(item: DropdownInputFormComponentDefinitionOutline): Promise<void> {
    await item.model?.accept(this);
  }

  async visitTypeaheadInputFormComponentDefinition(item: TypeaheadInputFormComponentDefinitionOutline): Promise<void> {
    await item.model?.accept(this);
  }

  async visitDateInputFormComponentDefinition(item: DateInputFormComponentDefinitionOutline): Promise<void> {
    await item.model?.accept(this);
  }

  async visitRichTextEditorFormComponentDefinition(item: RichTextEditorFormComponentDefinitionOutline): Promise<void> {
    await item.model?.accept(this);
  }

  async visitContentFormComponentDefinition(item: ContentFormComponentDefinitionOutline): Promise<void> {
    await item.component?.accept(this);
  }
  async visitRelatedObjectDataFormComponentDefinition(item: import('@researchdatabox/sails-ng-common').RelatedObjectDataFormComponentDefinitionOutline): Promise<void> {
    await item.component.accept(this);
  }
  async visitGroupFormComponentDefinition(item: GroupFormComponentDefinitionOutline): Promise<void> {
    await item.component?.accept(this);
    this.replaceAggregateDefaults(item);
  }

  async visitTabFormComponentDefinition(item: TabFormComponentDefinitionOutline): Promise<void> {
    await item.component?.accept(this);
  }

  async visitTabContentFormComponentDefinition(item: TabContentFormComponentDefinitionOutline): Promise<void> {
    await item.component?.accept(this);
  }

  async visitAccordionFormComponentDefinition(item: AccordionFormComponentDefinitionOutline): Promise<void> {
    await item.component?.accept(this);
  }

  async visitAccordionPanelFormComponentDefinition(item: AccordionPanelFormComponentDefinitionOutline): Promise<void> {
    await item.component?.accept(this);
  }

  async visitRepeatableFormComponentDefinition(item: RepeatableFormComponentDefinitionOutline): Promise<void> {
    await item.component?.accept(this);
    this.replaceAggregateDefaults(item);
  }

  async visitSimpleInputFieldModelDefinition(item: SimpleInputFieldModelDefinitionOutline): Promise<void> {
    await this.replaceModelConfigStringValues(item.config);
  }

  async visitTextAreaFieldModelDefinition(item: TextAreaFieldModelDefinitionOutline): Promise<void> {
    await this.replaceModelConfigStringValues(item.config);
  }

  async visitCheckboxInputFieldModelDefinition(item: CheckboxInputFieldModelDefinitionOutline): Promise<void> {
    await this.replaceModelConfigStringValues(item.config);
  }

  async visitRadioInputFieldModelDefinition(item: RadioInputFieldModelDefinitionOutline): Promise<void> {
    await this.replaceModelConfigStringValues(item.config);
  }

  async visitDropdownInputFieldModelDefinition(item: DropdownInputFieldModelDefinitionOutline): Promise<void> {
    await this.replaceModelConfigStringValues(item.config);
  }

  async visitTypeaheadInputFieldModelDefinition(item: TypeaheadInputFieldModelDefinitionOutline): Promise<void> {
    await this.replaceModelConfigStringValues(item.config);
  }

  async visitDateInputFieldModelDefinition(item: DateInputFieldModelDefinitionOutline): Promise<void> {
    await this.replaceModelConfigStringValues(item.config);
  }

  async visitRichTextEditorFieldModelDefinition(item: RichTextEditorFieldModelDefinitionOutline): Promise<void> {
    await this.replaceModelConfigStringValues(item.config);
  }

  async visitContentFieldComponentDefinition(item: ContentFieldComponentDefinitionOutline): Promise<void> {
    if (item.config && typeof item.config.content === 'string') {
      item.config.content = this.replaceTokens(item.config.content);
    }
  }
  async visitRelatedObjectDataFieldComponentDefinition(item: RelatedObjectDataFieldComponentDefinitionOutline): Promise<void> {
    if (!item.config) return;
    if (typeof item.config.template === 'string') item.config.template = String(this.replaceTokens(item.config.template));
    if (typeof item.config.content === 'string') item.config.content = this.replaceTokens(item.config.content);
    if (typeof item.config.dataPath === 'string') item.config.dataPath = String(this.replaceTokens(item.config.dataPath));
    item.config.relatedFields = item.config.relatedFields?.map(field => String(this.replaceTokens(field)));
  }
  async visitGroupFieldComponentDefinition(item: GroupFieldComponentDefinitionOutline): Promise<void> {
    for (const def of item.config?.componentDefinitions ?? []) {
      await def.accept(this);
    }
  }

  async visitTabFieldComponentDefinition(item: TabFieldComponentDefinitionOutline): Promise<void> {
    for (const tab of item.config?.tabs ?? []) {
      await tab.accept(this);
    }
  }

  async visitTabContentFieldComponentDefinition(item: TabContentFieldComponentDefinitionOutline): Promise<void> {
    for (const def of item.config?.componentDefinitions ?? []) {
      await def.accept(this);
    }
  }

  async visitAccordionFieldComponentDefinition(item: AccordionFieldComponentDefinitionOutline): Promise<void> {
    for (const panel of item.config?.panels ?? []) {
      await panel.accept(this);
    }
  }

  async visitAccordionPanelFieldComponentDefinition(item: AccordionPanelFieldComponentDefinitionOutline): Promise<void> {
    for (const def of item.config?.componentDefinitions ?? []) {
      await def.accept(this);
    }
  }

  async visitRepeatableFieldComponentDefinition(item: RepeatableFieldComponentDefinitionOutline): Promise<void> {
    await item.config?.elementTemplate?.accept(this);
  }
  private replaceTokens(value: unknown): unknown {
    if (typeof value !== 'string' || !this.replacementRegex) {
      return value;
    }
    return value.replace(this.replacementRegex, (matched: string) => {
      return this.contextVariablesMap[matched] ?? matched;
    });
  }

  private async replaceModelConfigStringValues(config?: { defaultValue?: unknown; value?: unknown }): Promise<void> {
    if (!config) {
      return;
    }
    config.defaultValue = this.replaceTokens(config.defaultValue);
    config.value = this.replaceTokens(config.value);
  }

  private replaceCheckboxDefaults(value: unknown): unknown {
    if (!Array.isArray(value)) return value;
    return value.map(row => row && typeof row === 'object' && row.details && typeof row.details === 'object'
      ? { ...row, details: this.replaceTokensDeep(row.details) }
      : row);
  }

  private replaceAggregateDefaults(item: GroupFormComponentDefinitionOutline | RepeatableFormComponentDefinitionOutline): void {
    const model = item.model?.config;
    if (!model) return;
    const replace = (value: unknown, authored: boolean) => {
      const checkboxValues = new Map<unknown, unknown>();
      this.collectCheckboxValues(item, value, authored, checkboxValues);
      return this.replaceTokensDeep(value, checkboxValues);
    };
    const config: { defaultValue?: unknown; value?: unknown; newEntryValue?: unknown } = model;
    config.defaultValue = replace(config.defaultValue, true);
    config.newEntryValue = replace(config.newEntryValue, true);
    config.value = replace(config.value, this.useAuthoredValues);
  }

  // Aggregate values are populated by the outer group or repeatable. Use its
  // schema to identify checkbox answers before replacing ordinary strings.
  private collectCheckboxValues(
    item: FormComponentDefinitionOutline,
    value: unknown,
    authored: boolean,
    checkboxValues: Map<unknown, unknown>
  ): void {
    if (!value || typeof value !== 'object') return;
    if (item.component.class === CheckboxWithDetailsComponentName) {
      checkboxValues.set(value, authored ? this.replaceCheckboxDefaults(value) : value);
      return;
    }
    const config = item.component.config as {
      elementTemplate?: FormComponentDefinitionOutline;
      componentDefinitions?: FormComponentDefinitionOutline[];
      panels?: FormComponentDefinitionOutline[];
      tabs?: FormComponentDefinitionOutline[];
    } | undefined;
    if (item.component.class === 'RepeatableComponent' && config?.elementTemplate && Array.isArray(value)) {
      for (const row of value) this.collectCheckboxValues(config.elementTemplate, row, authored, checkboxValues);
      return;
    }
    for (const child of config?.componentDefinitions ?? config?.panels ?? config?.tabs ?? []) {
      const [name] = FormPathHelper.metadataTokensForComponent(child);
      const childValue = name ? (value as Record<string, unknown>)[name] : value;
      this.collectCheckboxValues(child, childValue, authored, checkboxValues);
    }
  }

  private replaceTokensDeep(value: unknown, checkboxValues?: ReadonlyMap<unknown, unknown>): unknown {
    if (checkboxValues?.has(value)) return checkboxValues.get(value);
    if (typeof value === 'string') {
      return this.replaceTokens(value);
    }
    if (Array.isArray(value)) {
      return value.map(item => this.replaceTokensDeep(item, checkboxValues));
    }
    if (value && typeof value === 'object') {
      const replacedEntries = Object.entries(value).map(([key, item]) => [key, this.replaceTokensDeep(item, checkboxValues)]);
      return Object.fromEntries(replacedEntries);
    }
    return value;
  }

  private normalizeContextVariablesMap(contextVariablesMap?: Record<string, unknown>): Record<string, string> {
    const entries = Object.entries(contextVariablesMap ?? {});
    const normalized: Record<string, string> = {};
    for (const [key, value] of entries) {
      if (!key) {
        continue;
      }
      normalized[key] = String(value ?? '');
    }
    return normalized;
  }

  private buildReplacementRegex(keys: string[]): RegExp | null {
    const validKeys = keys
      .filter(key => key.length > 0)
      .sort((a, b) => b.length - a.length)
      .map(key => this.escapeRegex(key));
    if (validKeys.length === 0) {
      return null;
    }
    return new RegExp(validKeys.join('|'), 'g');
  }

  private escapeRegex(value: string): string {
    const escape = (RegExp as RegExpConstructor & { escape?: (s: string) => string }).escape;
    // Use built-in escape should be available, otherwise fall back to manual escaping.
    return typeof escape === 'function' ? escape(value) : value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }
}
