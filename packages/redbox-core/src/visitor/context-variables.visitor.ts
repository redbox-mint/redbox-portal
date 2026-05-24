import type { ILogger } from '../Logger';
import {
  AccordionFieldComponentDefinitionOutline,
  AccordionFormComponentDefinitionOutline,
  AccordionPanelFieldComponentDefinitionOutline,
  AccordionPanelFormComponentDefinitionOutline,
  CheckboxInputFieldModelDefinitionOutline,
  CheckboxInputFormComponentDefinitionOutline,
  ContentFieldComponentDefinitionOutline,
  ContentFormComponentDefinitionOutline,
  DateInputFieldModelDefinitionOutline,
  DateInputFormComponentDefinitionOutline,
  DropdownInputFieldModelDefinitionOutline,
  DropdownInputFormComponentDefinitionOutline,
  FormConfigOutline,
  FormConfigVisitor,
  GroupFieldComponentDefinitionOutline,
  GroupFieldModelDefinitionOutline,
  GroupFormComponentDefinitionOutline,
  RecordMetadataDisplayFieldModelDefinitionOutline,
  RecordMetadataDisplayFormComponentDefinitionOutline,
  RadioInputFieldModelDefinitionOutline,
  RadioInputFormComponentDefinitionOutline,
  RepeatableFieldComponentDefinitionOutline,
  RepeatableFieldModelDefinitionOutline,
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
} from '@researchdatabox/sails-ng-common';

export class ContextVariablesFormConfigVisitor extends FormConfigVisitor {
  protected override logName = 'ContextVariablesFormConfigVisitor';

  private contextVariablesMap: Record<string, string> = {};
  private replacementRegex: RegExp | null = null;

  constructor(logger: ILogger) {
    super(logger);
  }

  public async applyContextVariables(form: FormConfigOutline, contextVariablesMap?: Record<string, unknown>): Promise<void> {
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

  async visitRecordMetadataDisplayFormComponentDefinition(item: RecordMetadataDisplayFormComponentDefinitionOutline): Promise<void> {
    await item.model?.accept(this);
  }

  async visitContentFormComponentDefinition(item: ContentFormComponentDefinitionOutline): Promise<void> {
    await item.component?.accept(this);
  }
  async visitGroupFormComponentDefinition(item: GroupFormComponentDefinitionOutline): Promise<void> {
    await item.component?.accept(this);
    await item.model?.accept(this);
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
    await item.model?.accept(this);
  }

  async visitGroupFieldModelDefinition(item: GroupFieldModelDefinitionOutline): Promise<void> {
    await this.replaceModelConfigDeepValues(item.config);
  }

  async visitRepeatableFieldModelDefinition(item: RepeatableFieldModelDefinitionOutline): Promise<void> {
    await this.replaceModelConfigDeepValues(item.config);
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

  async visitRecordMetadataDisplayFieldModelDefinition(item: RecordMetadataDisplayFieldModelDefinitionOutline): Promise<void> {
    await this.replaceModelConfigDeepValues(item.config);
  }

  async visitContentFieldComponentDefinition(item: ContentFieldComponentDefinitionOutline): Promise<void> {
    if (item.config && typeof item.config.content === 'string') {
      item.config.content = this.replaceTokens(item.config.content);
    }
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
    await super.visitRepeatableFieldComponentDefinition(item);
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

  private async replaceModelConfigDeepValues(config?: { defaultValue?: unknown; value?: unknown }): Promise<void> {
    if (!config) {
      return;
    }
    config.defaultValue = this.replaceTokensDeep(config.defaultValue);
    config.value = this.replaceTokensDeep(config.value);
  }

  private replaceTokensDeep(value: unknown): unknown {
    if (typeof value === 'string') {
      return this.replaceTokens(value);
    }
    if (Array.isArray(value)) {
      return value.map(item => this.replaceTokensDeep(item));
    }
    if (value && typeof value === 'object') {
      const replacedEntries = Object.entries(value).map(([key, item]) => [key, this.replaceTokensDeep(item)]);
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
